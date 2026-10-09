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
/**
 * AI 缓存规则（AICache）API 工具函数
 *
 * 端点列表（OpenAPI v1）：
 *   GET /open-api/v1/ai-cache-rules              — 全量查询规则集合
 *   PUT /open-api/v1/ai-cache-rules              — 全量更新规则集合（整体替换）
 *   GET /open-api/v1/ai-cache-semantic-settings  — 查询语义全局设置（单例）
 *   PUT /open-api/v1/ai-cache-semantic-settings  — 覆盖式更新语义全局设置（单例）
 */
const fs = require('fs');
const path = require('path');
const common = require('../utils/common');

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function getOpenApiBaseUrl() {
  // 优先使用 apiHost（直连后端 8183），避免代理层超时
  const base = confInfo['apiHost'] || confInfo['ctlHost'].replace('/login', '');
  return base + '/open-api/v1';
}

async function getUserData(page) {
  try {
    const userStr = await page.evaluate(() => localStorage.getItem('user'));
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (e) {
    /* ignore */
  }
  try {
    const auth = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../auth.json'), 'utf-8'),
    );
    for (const item of auth.origins || []) {
      const entry = (item.localStorage || []).find((e) => e.name === 'user');
      if (entry && entry.value) {
        return JSON.parse(entry.value);
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

async function requestOpenApi(page, method, endpoint, data) {
  const userData = await getUserData(page);
  if (!userData || !userData.sessionKey) {
    throw new Error('无法获取 sessionKey，无法调用 OpenAPI: ' + endpoint);
  }
  const options = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Session ' + userData.sessionKey,
    },
  };
  if (data !== undefined) {
    options.data = data;
  }

  const url = getOpenApiBaseUrl() + endpoint;
  const response = await page.request[method.toLowerCase()](url, {
    ...options,
    timeout: 60000,
  });
  const body = await response.json();
  common.log(`${method} ${endpoint} 响应: ` + JSON.stringify(body));
  return body;
}

/**
 * 查询 AI 缓存规则集合；失败返回 null。
 * 返回 Data.rules 数组（空集合返回 []）。
 */
async function fetchAiCacheRulesViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/ai-cache-rules');
  if (body.ErrNum !== 200) {
    return null;
  }
  const data = body.Data || {};
  return Array.isArray(data.rules) ? data.rules : [];
}

/**
 * 全量更新 AI 缓存规则集合（整体替换）。
 * 提交时剔除只读字段 created_at/updated_at。成功返回 true。
 */
async function putAiCacheRulesViaApi(page, rules) {
  const payload = {
    rules: (rules || []).map((rule) => {
      const clean = { ...rule };
      delete clean.created_at;
      delete clean.updated_at;
      return clean;
    }),
  };
  const body = await requestOpenApi(page, 'put', '/ai-cache-rules', payload);
  return body.ErrNum === 200;
}

/**
 * 查询 AI 缓存语义全局设置（单例）；失败返回 null。
 */
async function fetchAiCacheSemanticSettingsViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/ai-cache-semantic-settings');
  if (body.ErrNum !== 200) {
    return null;
  }
  return body.Data || null;
}

/**
 * 覆盖式更新 AI 缓存语义全局设置（单例）。成功返回 true。
 */
async function putAiCacheSemanticSettingsViaApi(page, settings) {
  const payload = {
    top_k: Number(settings.top_k),
    threshold: Number(settings.threshold),
    threshold_relation: settings.threshold_relation,
  };
  const body = await requestOpenApi(
    page,
    'put',
    '/ai-cache-semantic-settings',
    payload,
  );
  return body.ErrNum === 200;
}

/**
 * 生成唯一测试规则名称（用于数据隔离）。
 */
function generateTestRuleName(prefix = 'ac_') {
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 构造一条完整字段的测试规则。
 */
function buildTestRule(overrides = {}) {
  return {
    name: generateTestRuleName(),
    cond: 'req_path_in("/v1/chat/completions", false)',
    cache_key_strategy: 'lastQuestion',
    cache_ttl: 3600,
    max_body_bytes: 1048576,
    max_value_bytes: 1048576,
    enable_semantic_cache: false,
    ...overrides,
  };
}

/**
 * 确保集合内存在指定规则（不存在则置于首位后整体 PUT）。返回更新后的集合。
 */
async function ensureAiCacheRuleExistsViaApi(page, rule) {
  const rules = (await fetchAiCacheRulesViaApi(page)) || [];
  if (rules.some((item) => item.name === rule.name)) {
    return rules;
  }
  const next = [rule, ...rules];
  const ok = await putAiCacheRulesViaApi(page, next);
  if (!ok) {
    common.log('通过 API 创建测试规则失败: ' + rule.name);
  }
  return next;
}

/**
 * 备份/恢复 AI 缓存规则集合与语义设置（用例内自行还原，避免污染共享环境）。
 */
function createAiCacheTestCleanup() {
  let originalRules = null;
  let originalSemantic = null;
  let saved = false;

  return {
    async saveOriginalState(page) {
      try {
        originalRules = await fetchAiCacheRulesViaApi(page);
        if (originalRules === null) {
          originalRules = [];
        }
        originalSemantic = await fetchAiCacheSemanticSettingsViaApi(page);
        saved = true;
        common.log(
          '保存 AI 缓存原始状态: rules=' +
            JSON.stringify(originalRules) +
            ' semantic=' +
            JSON.stringify(originalSemantic),
        );
      } catch (error) {
        common.log('保存 AI 缓存原始状态失败: ' + error.message);
      }
    },

    async cleanup(page) {
      if (!saved) {
        return;
      }
      try {
        await putAiCacheRulesViaApi(page, originalRules || []);
        common.log('已恢复 AI 缓存规则原始状态');
      } catch (error) {
        common.log('恢复 AI 缓存规则原始状态失败: ' + error.message);
      }
      try {
        if (originalSemantic) {
          await putAiCacheSemanticSettingsViaApi(page, {
            top_k: originalSemantic.top_k,
            threshold: originalSemantic.threshold,
            threshold_relation: originalSemantic.threshold_relation,
          });
          common.log('已恢复 AI 缓存语义设置原始状态');
        }
      } catch (error) {
        common.log('恢复 AI 缓存语义设置原始状态失败: ' + error.message);
      }
    },
  };
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  fetchAiCacheRulesViaApi,
  putAiCacheRulesViaApi,
  fetchAiCacheSemanticSettingsViaApi,
  putAiCacheSemanticSettingsViaApi,
  generateTestRuleName,
  buildTestRule,
  ensureAiCacheRuleExistsViaApi,
  createAiCacheTestCleanup,
};