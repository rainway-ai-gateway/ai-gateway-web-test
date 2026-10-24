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
 * 密钥收敛（Reencrypt Sweep）OpenAPI 工具
 *
 * 接口基准：
 *   POST /security/reencrypt-sweeps           触发（成功 HTTP 200，Data.status=running）
 *   GET  /security/reencrypt-sweeps/{task_id} 查询/轮询（Data 含 summary/duration_ms/error）
 */

/**
 * 触发收敛任务：返回完整响应 { status, ErrNum, ErrMsg, Data }。
 * 成功为 HTTP 200（非 202）；集群级单例互斥冲突返回 409。
 */
async function triggerReencryptSweepViaApi(page, options = {}) {
  const userData = await getUserData(page);
  const data = {
    mode: options.mode || 'reencrypt',
    dry_run: options.dry_run === undefined ? false : options.dry_run,
    scope: options.scope || 'all',
  };
  const response = await page.request.post(
    getOpenApiBaseUrl() + '/security/reencrypt-sweeps',
    {
      data,
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    },
  );
  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    body = {};
  }
  common.log('POST /security/reencrypt-sweeps 响应: ' + JSON.stringify(body));
  return {
    status: response.status(),
    ErrNum: body.ErrNum,
    ErrMsg: body.ErrMsg,
    Data: body.Data,
    body,
  };
}

/**
 * 查询单个收敛任务：返回完整响应 { status, ErrNum, ErrMsg, Data }。
 */
async function getReencryptSweepViaApi(page, taskId) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() +
      '/security/reencrypt-sweeps/' +
      encodeURIComponent(taskId),
    {
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    },
  );
  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    body = {};
  }
  common.log(
    'GET /security/reencrypt-sweeps/' + taskId + ' 响应: ' + JSON.stringify(body),
  );
  return {
    status: response.status(),
    ErrNum: body.ErrNum,
    ErrMsg: body.ErrMsg,
    Data: body.Data,
    body,
  };
}

/**
 * 查询收敛任务列表：返回完整响应 { status, ErrNum, ErrMsg, Data:{list,pagination}, body }。
 * params 支持 status/mode/scope/dry_run/start_time/end_time/page/page_size/sort_by/sort_order。
 */
async function getReencryptSweepListViaApi(page, params = {}) {
  const userData = await getUserData(page);
  const query = {};
  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      query[key] = params[key];
    }
  });
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/security/reencrypt-sweeps',
    {
      params: query,
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    },
  );
  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    body = {};
  }
  common.log(
    'GET /security/reencrypt-sweeps 响应: ' + JSON.stringify(body),
  );
  return {
    status: response.status(),
    ErrNum: body.ErrNum,
    ErrMsg: body.ErrMsg,
    Data: body.Data,
    body,
  };
}

/**
 * 轮询任务直至非 running（或达到最大次数）。返回最后一次响应。
 */
async function pollReencryptSweepUntilDoneViaApi(page, taskId, options = {}) {
  const interval = options.interval === undefined ? 800 : options.interval;
  const maxAttempts = options.maxAttempts === undefined ? 30 : options.maxAttempts;
  let last = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    last = await getReencryptSweepViaApi(page, taskId);
    if (last.status !== 200 || !last.Data || last.Data.status !== 'running') {
      return last;
    }
    await page.waitForTimeout(interval);
  }
  return last;
}

module.exports = {
  triggerReencryptSweepViaApi,
  getReencryptSweepViaApi,
  getReencryptSweepListViaApi,
  pollReencryptSweepUntilDoneViaApi,
};