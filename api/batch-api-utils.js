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
 * 批量任务（Batch Tasks）OpenAPI 工具
 *
 * 接口基准：
 *   GET  /batches                     列表（主键游标分页：cursor/limit，返回 next_cursor）
 *   GET  /batches/{batch_id}          详情（含 batch_files）
 *   POST /batches/{batch_id}/cancel   取消（200 Data.status=cancelling；409/502/404 错误）
 */

const TERMINAL_STATUSES = ['completed', 'expired', 'failed', 'cancelled'];

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.indexOf(status) !== -1;
}

/**
 * 列表查询：返回 { list, next_cursor, body }
 * 首页 cursor 为空时不传该参数；limit 由调用方指定（UI 固定 20）。
 */
async function fetchBatchTasksViaApi(page, params = {}) {
  const userData = await getUserData(page);
  const query = {};
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') {
      return;
    }
    query[key] = value;
  });
  const response = await page.request.get(getOpenApiBaseUrl() + '/batches', {
    params: query,
    headers: {
      Authorization: 'Session ' + userData.sessionKey,
    },
  });
  const body = await response.json();
  common.log('GET /batches 响应: ' + JSON.stringify(body));
  const data = body.Data || {};
  return {
    list: Array.isArray(data.list) ? data.list : [],
    next_cursor: data.next_cursor,
    http_status: response.status(),
    body,
  };
}

/**
 * 使用游标翻页拉取全部批量任务（供一致性用例做全量比对）。
 * 首页 cursor 为空 → 不传 cursor；next_cursor 为 0/''/空 视为无更多数据。
 */
async function fetchAllBatchTasksViaApi(page, params = {}, limit = 20) {
  const all = [];
  let cursor = '';
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const { list, next_cursor } = await fetchBatchTasksViaApi(page, {
      ...params,
      limit,
      cursor,
    });
    all.push(...list);
    if (!next_cursor) {
      break;
    }
    cursor = next_cursor;
  }
  return all;
}

async function findBatchTaskViaApi(page, matcher, params = {}) {
  const list = await fetchAllBatchTasksViaApi(page, params, 100);
  if (typeof matcher === 'function') {
    return list.find(matcher) || null;
  }
  return list.find((item) => item.batch_id === matcher) || null;
}

/**
 * 详情：返回完整响应 { status, ErrNum, ErrMsg, Data }，便于断言 404 等错误。
 */
async function fetchBatchTaskDetailViaApi(page, batchId) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/batches/' + encodeURIComponent(batchId),
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
  common.log('GET /batches/' + batchId + ' 响应: ' + JSON.stringify(body));
  return {
    status: response.status(),
    ErrNum: body.ErrNum,
    ErrMsg: body.ErrMsg,
    Data: body.Data,
    body,
  };
}

/**
 * 取消：返回完整响应 { status, ErrNum, ErrMsg, Data }，便于断言 200/409/502/404。
 */
async function cancelBatchTaskViaApi(page, batchId) {
  const userData = await getUserData(page);
  const response = await page.request.post(
    getOpenApiBaseUrl() +
      '/batches/' +
      encodeURIComponent(batchId) +
      '/cancel',
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
  common.log('POST /batches/' + batchId + '/cancel 响应: ' + JSON.stringify(body));
  return {
    status: response.status(),
    ErrNum: body.ErrNum,
    ErrMsg: body.ErrMsg,
    Data: body.Data,
    body,
  };
}

module.exports = {
  TERMINAL_STATUSES,
  isTerminalStatus,
  fetchBatchTasksViaApi,
  fetchAllBatchTasksViaApi,
  findBatchTaskViaApi,
  fetchBatchTaskDetailViaApi,
  cancelBatchTaskViaApi,
};