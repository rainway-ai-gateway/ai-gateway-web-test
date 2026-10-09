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
 * AI 上下文压缩（AIContext）API 工具函数
 *
 * 端点列表（OpenAPI v1）：
 *   GET /open-api/v1/ai-context-rules     — 全量查询压缩规则集合
 *   PUT /open-api/v1/ai-context-rules     — 全量更新压缩规则集合（整体替换）
 *   GET /open-api/v1/ai-context-settings  — 查询上下文压缩全局设置（单例）
 *   PUT /open-api/v1/ai-context-settings  — 覆盖式更新上下文压缩全局设置（单例）
 *
 * 说明：
 *   - 规则集合为“集合级”接口：PUT 整体替换，数组顺序即优先级（首条命中生效）；
 *     cond（生效条件）即规则身份，无 name/enabled/priority/id 字段；
 *     {"rules":[]} 表示清空集合。
 *   - 设置均为“单例”接口：缺行时 GET 返回默认值对象（HTTP 200），PUT 覆盖式更新。
 *   - 两接口相互独立，保存其一不得连带提交另一方。
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
 * 查询 AI 上下文压缩规则集合；失败返回 null。
 * 返回 Data.rules 数组（空集合返回 []）。
 */
async function fetchAiContextRulesViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/ai-context-rules');
  if (body.ErrNum !== 200) {
    return null;
  }
  const data = body.Data || {};
  return Array.isArray(data.rules) ? data.rules : [];
}

/**
 * 全量更新 AI 上下文压缩规则集合（整体替换）。
 * 提交时剔除只读字段 created_at/updated_at。成功返回 true。
 */
async function putAiContextRulesViaApi(page, rules) {
  const payload = {
    rules: (rules || []).map((rule) => {
      const clean = { ...rule };
      delete clean.created_at;
      delete clean.updated_at;
      return clean;
    }),
  };
  const body = await requestOpenApi(page, 'put', '/ai-context-rules', payload);
  return body.ErrNum === 200;
}

/**
 * 查询 AI 上下文压缩全局设置（单例）；失败返回 null。
 */
async function fetchAiContextSettingsViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/ai-context-settings');
  if (body.ErrNum !== 200) {
    return null;
  }
  return body.Data || null;
}

/**
 * 覆盖式更新 AI 上下文压缩全局设置（单例）。成功返回 true。
 */
async function putAiContextSettingsViaApi(page, settings) {
  const src = settings || {};
  const rewrite = src.rewrite || {};
  const payload = {
    trigger_ratio: Number(src.trigger_ratio),
    keep_latest_images: Number(src.keep_latest_images),
    tool_result_max_chars: Number(src.tool_result_max_chars),
    thinking_policy: src.thinking_policy,
    chars_per_token: Number(src.chars_per_token),
    image_token_estimate: Number(src.image_token_estimate),
    rewrite: {
      strength: rewrite.strength,
      protected_survival_rate: Number(rewrite.protected_survival_rate),
    },
  };
  const body = await requestOpenApi(page, 'put', '/ai-context-settings', payload);
  return body.ErrNum === 200;
}

/**
 * 生成唯一测试条件表达式（用于数据隔离；cond 即规则身份）。
 */
function generateTestRuleName(prefix = 'ax_') {
  // 必须使用 BFE 条件表达式函数式写法（如 req_path_in），
  // 「req_uri == "..."」不是合法 BFE 条件，expression/verify 编译会拒绝。
  return 'req_path_in("/test/' + prefix + Date.now() + '_' +
    Math.random().toString(36).slice(2, 8) + '", false)';
}

/**
 * 构造一条完整字段的测试压缩规则。
 * 身份字段为 cond（无 name/id）。
 */
function buildTestRule(overrides = {}) {
  return {
    cond: generateTestRuleName(),
    mode: 'off',
    max_context_tokens: 0,
    reserve_tokens: 0,
    ...overrides,
  };
}

/**
 * 确保集合内存在指定规则（按 cond 判重，不存在则置于首位后整体 PUT）。
 * 返回更新后的集合。
 */
async function ensureAiContextRuleExistsViaApi(page, rule) {
  const rules = (await fetchAiContextRulesViaApi(page)) || [];
  if (rules.some((item) => item.cond === rule.cond)) {
    return rules;
  }
  const next = [rule, ...rules];
  const ok = await putAiContextRulesViaApi(page, next);
  if (!ok) {
    common.log('通过 API 创建测试规则失败: ' + rule.cond);
  }
  return next;
}

/**
 * 备份/恢复 AI 上下文压缩规则集合与全局设置（用例内自行还原，避免污染共享环境）。
 */
function createAiContextTestCleanup() {
  let originalRules = null;
  let originalSettings = null;
  let saved = false;

  return {
    async saveOriginalState(page) {
      try {
        originalRules = await fetchAiContextRulesViaApi(page);
        if (originalRules === null) {
          originalRules = [];
        }
        originalSettings = await fetchAiContextSettingsViaApi(page);
        saved = true;
        common.log(
          '保存 AI 上下文原始状态: rules=' +
            JSON.stringify(originalRules) +
            ' settings=' +
            JSON.stringify(originalSettings),
        );
      } catch (error) {
        common.log('保存 AI 上下文原始状态失败: ' + error.message);
      }
    },

    async cleanup(page) {
      if (!saved) {
        return;
      }
      try {
        await putAiContextRulesViaApi(page, originalRules || []);
        common.log('已恢复 AI 上下文规则原始状态');
      } catch (error) {
        common.log('恢复 AI 上下文规则原始状态失败: ' + error.message);
      }
      try {
        if (originalSettings) {
          await putAiContextSettingsViaApi(page, originalSettings);
          common.log('已恢复 AI 上下文设置原始状态');
        }
      } catch (error) {
        common.log('恢复 AI 上下文设置原始状态失败: ' + error.message);
      }
    },
  };
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  fetchAiContextRulesViaApi,
  putAiContextRulesViaApi,
  fetchAiContextSettingsViaApi,
  putAiContextSettingsViaApi,
  generateTestRuleName,
  buildTestRule,
  ensureAiContextRuleExistsViaApi,
  createAiContextTestCleanup,
};