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
    const origin = rawUrl && rawUrl !== 'about:blank'
      ? new URL(rawUrl).origin
      : '';

    // 若页面尚未导航（about:blank）或 origin 无法识别，且 auth.json 只有一条 origin，
    // 则直接回退到该 origin 的 user（测试环境通常仅此一个）
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

/**
 * model-prices OpenAPI 工具
 *
 * 接口基准（后端 ai-gateway-api）：
 * - GET    /model-prices          → Data.list + Data.pagination.total
 * - GET    /model-prices/{id}     → Data 单条记录
 * - POST   /model-prices          → Data.id
 * - PUT    /model-prices/{id}
 * - DELETE /model-prices/{id}     → Data.deleted
 * - POST   /model-prices/import   → multipart(file + mode) → imported_count/skipped_count/errors
 */

function authHeaders(userData) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Session ' + userData.sessionKey,
  };
}

/**
 * 拉取模型定价列表（自动翻页，最多 10 页）
 * @returns {Promise<{list: Array, total: number}>}
 */
async function fetchModelPricesViaApi(page, params = {}) {
  const userData = await getUserData(page);
  const pageSize = 200;
  const all = [];
  let total = 0;
  for (let pageNum = 1; pageNum <= 10; pageNum += 1) {
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/model-prices',
      {
        params: { page: pageNum, page_size: pageSize, ...params },
        headers: authHeaders(userData),
      },
    );
    const body = await response.json();
    if (body.ErrNum !== 200) {
      common.log('接口查询模型定价失败: ' + JSON.stringify(body).slice(0, 300));
      break;
    }
    const data = body.Data || {};
    const list = Array.isArray(data.list) ? data.list : [];
    all.push(...list);
    total = (data.pagination && data.pagination.total) || list.length;
    if (list.length === 0 || pageNum * pageSize >= total) {
      break;
    }
  }
  return { list: all, total };
}

/**
 * 创建模型定价（绕过 UI 创建缺陷的 API 预置路径）
 * @returns {Promise<object|null>} 成功返回 Data（含 id），失败返回 null
 */
async function createModelPriceViaApi(page, data) {
  try {
    const userData = await getUserData(page);
    const payload = {
      ...data,
      metadata: {
        source: '',
        notes: '',
        ...(data.metadata || {}),
      },
    };
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/model-prices',
      { data: payload, headers: authHeaders(userData) },
    );
    const body = await response.json();
    common.log('接口创建模型定价响应: ' + JSON.stringify(body));
    if (body.ErrNum === 200 && body.Data) {
      return body.Data;
    }
    return null;
  } catch (error) {
    common.log('接口创建模型定价异常: ' + error.message);
    return null;
  }
}

async function getModelPriceByIdViaApi(page, id) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/model-prices/' + id,
      { headers: authHeaders(userData) },
    );
    const body = await response.json();
    if (body.ErrNum === 200) {
      return body.Data;
    }
    return null;
  } catch (error) {
    common.log('接口获取模型定价详情异常: ' + error.message);
    return null;
  }
}

async function deleteModelPriceViaApi(page, id) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/model-prices/' + id,
      { headers: authHeaders(userData) },
    );
    const body = await response.json();
    common.log('接口删除模型定价响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('接口删除模型定价异常: ' + error.message);
    return false;
  }
}

/**
 * 按 (provider, model, mode) 三元组精确查找记录
 */
async function findModelPriceByComboViaApi(page, provider, model, mode) {
  const { list } = await fetchModelPricesViaApi(page, {
    provider,
    model,
    mode,
  });
  return (
    list.find(
      (item) =>
        item.provider === provider &&
        item.model === model &&
        item.mode === mode,
    ) || null
  );
}

async function deleteModelPriceByComboViaApi(page, provider, model, mode) {
  const hit = await findModelPriceByComboViaApi(page, provider, model, mode);
  if (hit && hit.id) {
    return deleteModelPriceViaApi(page, hit.id);
  }
  return false;
}

/**
 * 通过 multipart 上传 YAML 整表导入模型定价（replace 清空整表 / merge 增量合并）
 * 注意：multipart 模式下不能带 Content-Type: application/json（Playwright 自动生成 boundary）
 * @param {string} yamlContent YAML 文件内容
 * @returns {Promise<{ok: boolean, body: object|null}>}
 */
async function importModelPricesViaApi(page, yamlContent, mode = 'replace') {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/model-prices/import',
      {
        multipart: {
          mode,
          file: {
            name: 'model-list.yaml',
            mimeType: 'application/x-yaml',
            buffer: Buffer.from(yamlContent, 'utf-8'),
          },
        },
        headers: { Authorization: 'Session ' + userData.sessionKey },
      },
    );
    const body = await response.json();
    common.log('接口导入模型定价响应: ' + JSON.stringify(body).slice(0, 400));
    return { ok: body && body.ErrNum === 200, body };
  } catch (error) {
    common.log('接口导入模型定价异常: ' + error.message);
    return { ok: false, body: null };
  }
}

const BASELINE_YAML = fs.readFileSync(
  path.join(__dirname, '../test-files/model-prices/model-list.yaml'),
  'utf8',
);

/**
 * 确保基线数据（deepseek + openai 两条）存在
 * 不存在则通过 replace 导入预置，避免每个用例都依赖环境初始状态
 */
async function ensureBaselineData(page) {
  const { list } = await fetchModelPricesViaApi(page);
  const hasDeepseek = list.some(
    (it) => it.provider === 'deepseek' && it.model === 'deepseek-v3',
  );
  const hasGpt4o = list.some(
    (it) => it.provider === 'openai' && it.model === 'gpt-4o',
  );
  if (hasDeepseek && hasGpt4o) return;
  await importModelPricesViaApi(page, BASELINE_YAML, 'replace');
}

/**
 * 强制把模型定价表重置为基线（deepseek + openai 两条）
 * 用于 beforeEach/afterEach 确保环境干净且一致
 */
async function resetModelPricesToBaseline(page) {
  const result = await importModelPricesViaApi(page, BASELINE_YAML, 'replace');
  if (!result.ok) {
    common.log('重置模型定价基线失败: ' + JSON.stringify(result.body));
  }
  return result;
}

/**
 * 创建/清理跟踪器：trackId / trackCombo + cleanup
 */
function createModelPriceTestCleanup() {
  const tracked = { ids: [], combos: [] };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    trackId(id) {
      pushUnique(tracked.ids, id);
    },
    trackCombo(provider, model, mode) {
      pushUnique(tracked.combos, [provider, model, mode].join('\u0000'));
    },
    async cleanup(page) {
      for (const comboKey of [...tracked.combos].reverse()) {
        const [p, m, mo] = comboKey.split('\u0000');
        try {
          await deleteModelPriceByComboViaApi(page, p, m, mo);
        } catch (error) {
          common.log('清理模型定价组合失败: ' + comboKey + ' ' + error.message);
        }
      }
      for (const id of [...tracked.ids].reverse()) {
        try {
          await deleteModelPriceViaApi(page, id);
        } catch (error) {
          common.log('清理模型定价 ID 失败: ' + id + ' ' + error.message);
        }
      }
      tracked.ids = [];
      tracked.combos = [];
    },
  };
}

module.exports = {
  fetchModelPricesViaApi,
  createModelPriceViaApi,
  getModelPriceByIdViaApi,
  deleteModelPriceViaApi,
  findModelPriceByComboViaApi,
  deleteModelPriceByComboViaApi,
  importModelPricesViaApi,
  ensureBaselineData,
  resetModelPricesToBaseline,
  createModelPriceTestCleanup,
};
