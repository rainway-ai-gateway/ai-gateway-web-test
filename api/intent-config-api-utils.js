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
 * 意图配置（IntentConfig）API 工具函数
 *
 * 端点列表（OpenAPI v1）：
 *   GET /open-api/v1/intent-config — 查询意图配置（单例）
 *   PUT /open-api/v1/intent-config — 覆盖式全量更新（单行覆盖，生成新内部版本）
 *
 * 说明：
 *   - 该资源为单例：不提供历史版本、无单字段更新接口；{"questions":[]}
 *     表示停用意图分类（软开关，非「未配置」）。
 *   - 从未发布过时 GET 返回 404（ErrNum 404），已发布返回 200。
 *   - choice 问题 criteria 为 map<string,string>（选项名 → 描述）；
 *     score 问题 levels 为 [{name, description}] 数组（低 → 高）。
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
 * 查询意图配置（单例）。
 * 返回：
 *   - { published: true, data: { min_confidence, questions } } — 已发布（ErrNum 200）
 *   - { published: false } — 从未发布（ErrNum 404）
 *   - null — 其它失败
 */
async function fetchIntentConfigViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/intent-config');
  if (body.ErrNum === 200) {
    const data = body.Data || {};
    return {
      published: true,
      data: {
        min_confidence: data.min_confidence,
        questions: Array.isArray(data.questions) ? data.questions : [],
      },
    };
  }
  if (body.ErrNum === 404) {
    return { published: false };
  }
  return null;
}

/**
 * 覆盖式全量更新意图配置（单例）。成功返回 true。
 * payload: { min_confidence: Number, questions: Array }
 */
async function putIntentConfigViaApi(page, payload) {
  const body = await requestOpenApi(page, 'put', '/intent-config', {
    min_confidence: Number(payload.min_confidence),
    questions: payload.questions || [],
  });
  return body.ErrNum === 200;
}

/**
 * 生成唯一测试问题名称（用于数据隔离；问题名称全局唯一）。
 */
function generateTestQuestionName(prefix = 'ic_') {
  return (
    prefix +
    Date.now() +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

/** 构造一个「枚举（choice）」测试问题（criteria 为 map<string,string>） */
function buildTestChoiceQuestion(overrides = {}) {
  return {
    name: generateTestQuestionName(),
    type: 'choice',
    instructions: '测试用判定说明（choice）',
    criteria: {
      coding: '编写或修改代码',
      qa: '问答与检索',
    },
    ...overrides,
  };
}

/** 构造一个「评分（score）」测试问题（levels 低 → 高） */
function buildTestScoreQuestion(overrides = {}) {
  return {
    name: generateTestQuestionName(),
    type: 'score',
    instructions: '测试用判定说明（score）',
    levels: [
      { name: 'simple', description: '简单' },
      { name: 'medium', description: '中等' },
      { name: 'complex', description: '复杂' },
    ],
    ...overrides,
  };
}

/** 构造默认全量配置（全局 0.6 + choice/score 各一题，符合接口合法性条件） */
function buildDefaultTestConfig(overrides = {}) {
  return {
    min_confidence: 0.6,
    questions: [buildTestChoiceQuestion(), buildTestScoreQuestion()],
    ...overrides,
  };
}

/**
 * 确保意图配置已发布为指定内容（整体 PUT）。
 * options: { minConfidence = 0.6, questions = [] }
 */
async function ensureIntentConfigPublishedViaApi(
  page,
  { minConfidence = 0.6, questions = [] } = {},
) {
  const ok = await putIntentConfigViaApi(page, {
    min_confidence: minConfidence,
    questions,
  });
  if (!ok) {
    common.log('通过 API 发布意图配置测试数据失败');
  }
  return ok;
}

/**
 * 备份/恢复意图配置单例原始状态（用例内自行还原，避免污染共享环境）。
 * 说明：若原始状态为「未发布（GET 404）」，后端无法回到未发布态，
 * cleanup 会回写默认配置 { min_confidence: 0.6, questions: [] } 并记日志。
 */
function createIntentConfigTestCleanup() {
  let original = null; // { min_confidence, questions }；null 表示原始未发布
  let saved = false;

  return {
    async saveOriginalState(page) {
      try {
        const res = await fetchIntentConfigViaApi(page);
        original = res && res.published ? res.data : null;
        saved = true;
        common.log(
          '保存意图配置原始状态: ' +
            (original ? JSON.stringify(original) : '未发布(404)'),
        );
      } catch (error) {
        common.log('保存意图配置原始状态失败: ' + error.message);
      }
    },

    async cleanup(page) {
      if (!saved) {
        return;
      }
      try {
        const payload =
          original || { min_confidence: 0.6, questions: [] };
        await putIntentConfigViaApi(page, payload);
        common.log(
          original
            ? '已恢复意图配置原始状态'
            : '原始状态为未发布(404)，已回写默认配置（无法回到未发布态）',
        );
      } catch (error) {
        common.log('恢复意图配置原始状态失败: ' + error.message);
      }
    },
  };
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  fetchIntentConfigViaApi,
  putIntentConfigViaApi,
  generateTestQuestionName,
  buildTestChoiceQuestion,
  buildTestScoreQuestion,
  buildDefaultTestConfig,
  ensureIntentConfigPublishedViaApi,
  createIntentConfigTestCleanup,
};
