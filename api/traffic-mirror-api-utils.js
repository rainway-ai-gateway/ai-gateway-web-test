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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 流量镜像规则（TrafficMirror）API 工具函数
 *
 * 端点列表（OpenAPI v1，集合级全量读写，无 /{id} 单条接口）：
 *   GET /open-api/v1/traffic-mirror-rules  — 全量查询规则集合
 *   PUT /open-api/v1/traffic-mirror-rules  — 全量更新规则集合（整体替换，{"rules":[]} = 清空）
 *   GET /open-api/v1/clusters              — 集群列表（镜像集群下拉/引用校验数据源）
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
 * 查询流量镜像规则集合；失败返回 null。
 * 返回 Data.rules 数组（空集合返回 []）。
 */
async function fetchTrafficMirrorRulesViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/traffic-mirror-rules');
  if (body.ErrNum !== 200) {
    return null;
  }
  const data = body.Data || {};
  return Array.isArray(data.rules) ? data.rules : [];
}

/**
 * 全量更新流量镜像规则集合（整体替换）。
 * 提交时剔除只读字段 created_at/updated_at。成功返回 true。
 */
async function putTrafficMirrorRulesViaApi(page, rules) {
  const payload = {
    rules: (rules || []).map((rule) => {
      const clean = { ...rule };
      delete clean.created_at;
      delete clean.updated_at;
      return clean;
    }),
  };
  const body = await requestOpenApi(
    page,
    'put',
    '/traffic-mirror-rules',
    payload,
  );
  return body.ErrNum === 200;
}

/**
 * 全量更新流量镜像规则集合并返回完整响应体（用于断言服务端错误码，
 * 如 TM-V-08 镜像集群引用不存在返回 422）。不剥离只读字段。
 */
async function putTrafficMirrorRulesRawViaApi(page, rules) {
  return requestOpenApi(page, 'put', '/traffic-mirror-rules', { rules });
}

/**
 * 查询集群列表并返回集群名数组（镜像集群下拉仅取 name）；
 * 失败返回 null。
 */
async function fetchClusterNamesViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/clusters');
  if (body.ErrNum !== 200) {
    return null;
  }
  const data = body.Data || [];
  return (Array.isArray(data) ? data : [])
    .map((cluster) => cluster && cluster.name)
    .filter(Boolean);
}

/**
 * 生成唯一测试规则名称（用于数据隔离）。
 */
function generateTestRuleName(prefix = 'tm_') {
  return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 构造一条完整字段的流量镜像测试规则。
 * mirror_cluster 须为控制面已存在的集群名。
 */
function buildTestRule(overrides = {}) {
  return {
    name: generateTestRuleName(),
    cond: 'req_path_prefix_in("/v1/chat/completions", true)',
    mirror_cluster: '',
    percentage: 10,
    set_headers: { 'X-Shadow-Env': 'pre-release' },
    body_rewrites: [{ path: 'model', value: 'deepseek-v3' }],
    path_rewrite: '',
    ...overrides,
  };
}

/**
 * 确保集合内存在指定规则（不存在则置于首位后整体 PUT）。返回更新后的集合。
 */
async function ensureTrafficMirrorRuleExistsViaApi(page, rule) {
  const rules = (await fetchTrafficMirrorRulesViaApi(page)) || [];
  if (rules.some((item) => item.name === rule.name)) {
    return rules;
  }
  const next = [rule, ...rules];
  const ok = await putTrafficMirrorRulesViaApi(page, next);
  if (!ok) {
    common.log('通过 API 创建流量镜像测试规则失败: ' + rule.name);
  }
  return next;
}

/**
 * 备份/恢复流量镜像规则集合（用例内自行还原，避免污染共享环境）。
 * 规则集合为单例共享资源，所有用例必须 saveOriginalState + afterEach cleanup。
 */
function createTrafficMirrorTestCleanup() {
  let originalRules = null;
  let saved = false;

  return {
    async saveOriginalState(page) {
      try {
        originalRules = await fetchTrafficMirrorRulesViaApi(page);
        if (originalRules === null) {
          originalRules = [];
        }
        saved = true;
        common.log(
          '保存流量镜像规则原始状态: rules=' + JSON.stringify(originalRules),
        );
      } catch (error) {
        common.log('保存流量镜像规则原始状态失败: ' + error.message);
      }
    },

    async cleanup(page) {
      if (!saved) {
        return;
      }
      try {
        await putTrafficMirrorRulesViaApi(page, originalRules || []);
        common.log('已恢复流量镜像规则原始状态');
      } catch (error) {
        common.log('恢复流量镜像规则原始状态失败: ' + error.message);
      }
    },
  };
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  fetchTrafficMirrorRulesViaApi,
  putTrafficMirrorRulesViaApi,
  putTrafficMirrorRulesRawViaApi,
  fetchClusterNamesViaApi,
  generateTestRuleName,
  buildTestRule,
  ensureTrafficMirrorRuleExistsViaApi,
  createTrafficMirrorTestCleanup,
};
