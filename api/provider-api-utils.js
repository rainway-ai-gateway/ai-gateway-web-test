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
const fs = require('fs');
const path = require('path');
const common = require('../utils/common');
const { getOpenApiBaseUrl } = require('./entity-api-utils');

const AUTH_PATH = path.join(__dirname, '../auth.json');

/**
 * Providers（模型服务商）OpenAPI 工具
 *
 * 接口基准（后端 ai-gateway-api，providers.md）：
 * - GET    /providers                    → Data.list（全量拉取，不传 page/page_size）
 * - POST   /providers                    → Data（完整对象）
 * - GET    /providers/{name}             → Data 单条
 * - PATCH  /providers/{name}             → 全量替换 keys / instance_pool
 * - DELETE /providers/{name}             → Data=null；被集群引用返回 409
 * - POST   /providers/tools/discover-models
 * - GET    /providers/actions/get-provider-names
 * - PUT    /providers/{name}/pricing-tiers
 *
 * 命名约定（批量兜底脚本识别前缀）：provider_<ts>
 * 兜底脚本：npm run cleanup:provider[:execute]
 */

async function getUserData(page) {
  let pageUser = null;
  try {
    pageUser = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        return null;
      }
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    });
  } catch (e) {
    // 页面尚未导航到目标域（如 about:blank）时读取 localStorage 会抛 SecurityError
    common.log('从页面读取 localStorage 失败: ' + e.message);
  }

  if (pageUser && pageUser.sessionKey) {
    return pageUser;
  }

  // 页面 localStorage 缺失时（偶发 storageState 未恢复），从 auth.json 回退读取
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    const origins = auth.origins || [];
    const rawUrl = page.url();
    const origin =
      rawUrl && rawUrl !== 'about:blank' ? new URL(rawUrl).origin : '';

    if ((!origin || origin === 'null') && origins.length === 1) {
      const userEntry = (origins[0].localStorage || []).find(
        (e) => e.name === 'user',
      );
      if (userEntry && userEntry.value) {
        const parsed = JSON.parse(userEntry.value);
        if (parsed && parsed.sessionKey) {
          return parsed;
        }
      }
    }

    for (const item of origins) {
      if (origin && origin !== 'null' && item.origin !== origin) {
        continue;
      }
      const userEntry = (item.localStorage || []).find(
        (e) => e.name === 'user',
      );
      if (userEntry && userEntry.value) {
        const parsed = JSON.parse(userEntry.value);
        if (parsed && parsed.sessionKey) {
          return parsed;
        }
      }
    }
  } catch (e) {
    common.log('从 auth.json 读取 session 失败: ' + e.message);
  }

  throw new Error('无法从页面获取 session_key');
}

function authHeaders(userData) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Session ' + userData.sessionKey,
  };
}

/**
 * 拉取服务商列表（全量，不传分页参数）
 * @returns {Promise<Array>} Data.list
 */
async function fetchProvidersViaApi(page) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/providers',
      {
        headers: authHeaders(userData),
      },
    );
    const body = await response.json();
    if (body.ErrNum !== 200) {
      common.log(
        '接口查询服务商列表失败: ' + JSON.stringify(body).slice(0, 300),
      );
      return [];
    }
    const data = body.Data;
    if (Array.isArray(data)) {
      return data;
    }
    return Array.isArray(data.list) ? data.list : [];
  } catch (error) {
    common.log('接口查询服务商列表异常: ' + error.message);
    return [];
  }
}

/**
 * 获取服务商详情
 * @returns {Promise<object|null>} 成功返回 Data，失败返回 null
 */
async function getProviderViaApi(page, name) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/providers/' + encodeURIComponent(name),
      { headers: authHeaders(userData) },
    );
    const body = await response.json();
    if (body.ErrNum === 200) {
      return body.Data;
    }
    return null;
  } catch (error) {
    common.log('接口获取服务商详情异常: ' + error.message);
    return null;
  }
}

/**
 * 按名称查找服务商
 */
async function findProviderByNameViaApi(page, name) {
  const list = await fetchProvidersViaApi(page);
  return list.find((item) => item && item.name === name) || null;
}

/**
 * 创建服务商
 * @param {object} payload 提交体（含 name/description/model_protocols/model_endpoint/instance_pool 等）
 * @returns {Promise<object|null>} 成功返回 Data，失败返回 null
 */
async function createProviderViaApi(page, payload) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/providers',
      {
        data: payload,
        headers: authHeaders(userData),
      },
    );
    const body = await response.json();
    common.log('接口创建服务商响应: ' + JSON.stringify(body).slice(0, 400));
    if (body.ErrNum === 200) {
      return body.Data;
    }
    return null;
  } catch (error) {
    common.log('接口创建服务商异常: ' + error.message);
    return null;
  }
}

/**
 * 删除服务商
 * @returns {Promise<{ok: boolean, body: object|null}>} body 供断言 409 等语义
 */
async function deleteProviderViaApi(page, name) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/providers/' + encodeURIComponent(name),
      { headers: authHeaders(userData) },
    );
    const body = await response.json();
    common.log('接口删除服务商响应: ' + JSON.stringify(body).slice(0, 300));
    return { ok: body.ErrNum === 200, body };
  } catch (error) {
    common.log('接口删除服务商异常: ' + error.message);
    return { ok: false, body: null };
  }
}

/**
 * 更新（编辑）服务商 PATCH /providers/{name}（keys / instance_pool 全量替换）
 */
async function updateProviderViaApi(page, name, payload) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.patch(
      getOpenApiBaseUrl() + '/providers/' + encodeURIComponent(name),
      { data: payload, headers: authHeaders(userData) },
    );
    const body = await response.json();
    common.log('接口更新服务商响应: ' + JSON.stringify(body).slice(0, 300));
    return body.ErrNum === 200 ? body.Data : null;
  } catch (error) {
    common.log('接口更新服务商异常: ' + error.message);
    return null;
  }
}

/**
 * 获取服务商名称列表 GET /providers/actions/get-provider-names
 * @returns {Promise<string[]>} Data.names
 */
async function getProviderNamesViaApi(page) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/providers/actions/get-provider-names',
      { headers: authHeaders(userData) },
    );
    const body = await response.json();
    if (body.ErrNum === 200 && body.Data && Array.isArray(body.Data.names)) {
      return body.Data.names;
    }
    return [];
  } catch (error) {
    common.log('接口获取服务商名称列表异常: ' + error.message);
    return [];
  }
}

/**
 * 创建/清理跟踪器：trackName + cleanup（命名前缀 provider_<ts>）
 */
function createProviderTestCleanup() {
  const tracked = { names: [] };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    trackName(name) {
      pushUnique(tracked.names, name);
    },
    async cleanup(page) {
      for (const name of [...tracked.names].reverse()) {
        try {
          const result = await deleteProviderViaApi(page, name);
          if (!result.ok) {
            common.log(
              '清理服务商失败: ' + name + ' -> ' + JSON.stringify(result.body),
            );
          }
        } catch (error) {
          common.log('清理服务商异常: ' + name + ' ' + error.message);
        }
      }
      tracked.names = [];
    },
  };
}

module.exports = {
  getUserData,
  authHeaders,
  fetchProvidersViaApi,
  getProviderViaApi,
  findProviderByNameViaApi,
  createProviderViaApi,
  updateProviderViaApi,
  getProviderNamesViaApi,
  deleteProviderViaApi,
  createProviderTestCleanup,
};
