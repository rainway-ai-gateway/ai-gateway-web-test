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
 * 访问日志（Access Log）OpenAPI 工具
 *
 * 接口基准（design-docs/api-define/OpenAPI接口定义/access-log.md）：
 *   GET /access-log/config  读取单例配置（Data = { req_headers, res_headers }）
 *   PUT /access-log/config  整组全量替换（两段均可为空数组）
 */

const CONFIG_URL = '/access-log/config';

function buildAuthHeaders(userData) {
  return {
    Authorization: 'Session ' + userData.sessionKey,
  };
}

/**
 * 读取访问日志配置：返回 { status, ErrNum, ErrMsg, Data }。
 */
async function getAccessLogConfigViaApi(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(getOpenApiBaseUrl() + CONFIG_URL, {
    headers: buildAuthHeaders(userData),
  });
  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    body = {};
  }
  common.log(
    'GET ' + CONFIG_URL + ' 响应: ' + JSON.stringify(body),
  );
  return {
    status: response.status(),
    ErrNum: body.ErrNum,
    ErrMsg: body.ErrMsg,
    Data: body.Data || {},
    body,
  };
}

/**
 * 整组替换访问日志配置（`PUT` 全量语义）。
 * @param {{req_headers?: string[], res_headers?: string[]}} config
 */
async function updateAccessLogConfigViaApi(page, config = {}) {
  const userData = await getUserData(page);
  const data = {
    req_headers: Array.isArray(config.req_headers) ? config.req_headers : [],
    res_headers: Array.isArray(config.res_headers) ? config.res_headers : [],
  };
  const response = await page.request.put(getOpenApiBaseUrl() + CONFIG_URL, {
    data,
    headers: buildAuthHeaders(userData),
  });
  let body = {};
  try {
    body = await response.json();
  } catch (e) {
    body = {};
  }
  common.log(
    'PUT ' + CONFIG_URL + ' 响应: ' + JSON.stringify(body),
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
 * 还原配置（用于 afterEach 清理，避免污染其它用例的全局单例）。
 */
async function restoreAccessLogConfigViaApi(page, config) {
  const target = config || { req_headers: [], res_headers: [] };
  return updateAccessLogConfigViaApi(page, target);
}

/**
 * 取两段白名单（缺省按空数组处理，便于断言）。
 */
async function fetchAccessLogHeadersViaApi(page) {
  const result = await getAccessLogConfigViaApi(page);
  const data = result.Data || {};
  return {
    req_headers: Array.isArray(data.req_headers) ? data.req_headers : [],
    res_headers: Array.isArray(data.res_headers) ? data.res_headers : [],
    raw: result,
  };
}

module.exports = {
  CONFIG_URL,
  getAccessLogConfigViaApi,
  updateAccessLogConfigViaApi,
  restoreAccessLogConfigViaApi,
  fetchAccessLogHeadersViaApi,
};
