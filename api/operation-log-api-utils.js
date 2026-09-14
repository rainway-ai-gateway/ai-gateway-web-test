/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';
const common = require('../utils/common');
const { getOpenApiBaseUrl, getUserData } = require('./entity-api-utils');

/**
 * 操作日志（Operation Logs）OpenAPI 工具
 *
 * 接口基准：GET /operation-logs（只读，服务端分页）
 */

function normalizeListResponse(data) {
  if (!data) {
    return { list: [], total: 0, page: 1, page_size: 20 };
  }
  const list = data.list || [];
  const pagination = data.pagination || {};
  return {
    list: Array.isArray(list) ? list : [],
    total: pagination.total ?? data.total ?? list.length,
    page: pagination.page ?? data.page ?? 1,
    page_size: pagination.page_size ?? data.page_size ?? 20,
  };
}

async function fetchOperationLogsViaApi(page, params = {}) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/operation-logs',
    {
      params,
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    },
  );
  const body = await response.json();
  common.log('GET /operation-logs 响应: ' + JSON.stringify(body));
  if (body.ErrNum !== 200 && body.ErrNum !== 0) {
    return { list: [], total: 0, page: 1, page_size: 20 };
  }
  return normalizeListResponse(body.Data);
}

async function findOperationLogViaApi(page, matcher, params = {}) {
  const maxAttempts = 8;
  for (let i = 0; i < maxAttempts; i += 1) {
    const { list } = await fetchOperationLogsViaApi(page, {
      page: 1,
      page_size: 100,
      ...params,
    });
    const hit = list.find(matcher);
    if (hit) {
      return hit;
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function waitForOperationLogViaApi(page, matcher, params = {}) {
  const log = await findOperationLogViaApi(page, matcher, params);
  return log;
}

async function findFailedOperationLogViaApi(page, params = {}) {
  const { list } = await fetchOperationLogsViaApi(page, {
    status: 2,
    page_size: 50,
    ...params,
  });
  return list.find((item) => item.error_msg) || null;
}

/**
 * 通过「集群被全局路由引用时删除失败」造一条 status=2 的操作日志。
 * 返回 { log, cleanup }；cleanup 用于恢复路由规则并删除集群/服务商。
 */
async function seedFailedClusterDeleteLog(page) {
  const resourceApi = require('./resource-api-utils');
  const routeApi = require('./route-api-utils');
  const clusterName = 'ol_fail_' + Date.now();
  const routeCleanup = routeApi.createRouteTestCleanup();

  await routeCleanup.saveGlobalRouteRulesOriginalState(page);

  const created = await resourceApi.createClusterWithProvider(page, clusterName, [
    'gpt-test',
  ]);
  if (!created) {
    return { log: null, cleanup: async () => {} };
  }

  const current = await routeApi.getGlobalRouteRulesViaApi(page);
  const ruleName = 'ol_fail_rule_' + Date.now();
  const linked = await routeApi.setGlobalRouteRulesViaApi(page, {
    enabled: false,
    rules: [
      ...(current?.rules || []),
      {
        name: ruleName,
        cond: 'default_t()',
        targets: [{ cluster_name: clusterName, model: '', weight: 100 }],
        fallbacks: [],
      },
    ],
  });
  if (!linked) {
    await resourceApi.deleteCluster(page, clusterName);
    return { log: null, cleanup: async () => {} };
  }

  await resourceApi.deleteCluster(page, clusterName);

  const log = await waitForOperationLogViaApi(
    page,
    (item) =>
      item.action === 'delete' &&
      item.resource_type === 'cluster' &&
      item.resource_name === clusterName &&
      item.status === 2 &&
      item.error_msg,
    {
      action: 'delete',
      resource_type: 'cluster',
      resource_name: clusterName,
      status: 2,
    },
  );

  return {
    log,
    clusterName,
    async cleanup() {
      await routeCleanup.cleanup(page);
      await resourceApi.deleteCluster(page, clusterName);
    },
  };
}

module.exports = {
  fetchOperationLogsViaApi,
  findOperationLogViaApi,
  waitForOperationLogViaApi,
  findFailedOperationLogViaApi,
  seedFailedClusterDeleteLog,
  normalizeListResponse,
};
