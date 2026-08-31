#!/usr/bin/env node
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
 * 批量清理路由管理自动化测试残留数据（恢复 Global 路由规则基线 + 提示 Entity 残留）
 *
 * 用法（在 gui-test-for-ai-gateway/ 目录下执行）：
 *   node scripts/cleanup-route-test-data.cjs              # 仅检测（默认）
 *   node scripts/cleanup-route-test-data.cjs --execute    # 恢复 Global 路由规则基线
 *   node scripts/cleanup-route-test-data.cjs --session-key <key>  # 指定 Session Key
 *
 * 注意：
 * - 路由测试创建的 Entity / API-Key 残留由 cleanup:testdata（entity 脚本）统一清理，
 *   本脚本仅提示，请运行：npm run cleanup:testdata[:execute]。
 * - Global 路由规则无运行期基线备份（测试保存的是运行时原始状态），
 *   本脚本按 scripts/init-test-data.js 中定义的基线恢复 enabled:false + global-default-rule。
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const CODE_ROOT = path.resolve(__dirname, '..');
const CONF_PATH = path.join(CODE_ROOT, 'conf.json');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const sessionKeyArgIndex = args.indexOf('--session-key');
const sessionKeyFromArg =
  sessionKeyArgIndex >= 0 ? args[sessionKeyArgIndex + 1] : process.env.SESSION_KEY;

// 与 scripts/init-test-data.js 的 TEST_GLOBAL_RULES 一致（基线）
const GLOBAL_RULES_BASELINE = {
  enabled: false,
  rules: [
    {
      name: 'global-default-rule',
      cond: 'default_t()',
      targets: [{ cluster_name: 'test121', model: '', weight: 100 }],
      fallbacks: [],
    },
  ],
};

function loadConf() {
  if (!fs.existsSync(CONF_PATH)) {
    throw new Error('未找到 conf.json: ' + CONF_PATH);
  }
  return JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
}

function buildApiRoot(conf) {
  return (conf.apiHost || conf.ctlHost.replace(/\/login\/?$/, '')) + '/open-api/v1';
}

function authHeaders(sessionKey) {
  return { Authorization: 'Session ' + sessionKey };
}

async function loginWithPassword(apiRoot, username, password) {
  const response = await axios.post(
    `${apiRoot}/auth/session-keys`,
    { user_name: username, password },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      validateStatus: () => true,
    },
  );
  return response.data;
}

function readSessionKeyFromAuthJson() {
  const authPath = path.join(CODE_ROOT, 'auth.json');
  if (!fs.existsSync(authPath)) {
    return null;
  }
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    for (const origin of auth.origins || []) {
      for (const item of origin.localStorage || []) {
        if (item.name !== 'user') {
          continue;
        }
        const user = JSON.parse(item.value);
        return user.sessionKey || user.session_key || null;
      }
    }
  } catch (error) {
    console.warn('读取 auth.json 失败: ' + error.message);
  }
  return null;
}

async function apiRequest(client, method, url, options = {}) {
  const response = await client.request({
    method,
    url,
    ...options,
    validateStatus: () => true,
  });
  const body = response.data;
  if (typeof body === 'string') {
    throw new Error('接口返回非 JSON: ' + body.slice(0, 200));
  }
  return body;
}

async function login(conf) {
  const apiRoot = buildApiRoot(conf);

  if (sessionKeyFromArg) {
    return {
      apiRoot,
      sessionKey: sessionKeyFromArg,
      username: conf.username || 'admin',
      source: '--session-key / SESSION_KEY',
    };
  }

  const authSessionKey = readSessionKeyFromAuthJson();
  if (authSessionKey) {
    const probe = await apiRequest(
      axios.create({ headers: authHeaders(authSessionKey), timeout: 15000 }),
      'get',
      `${apiRoot}/auth/users`,
    );
    if (probe.ErrNum === 200) {
      return {
        apiRoot,
        sessionKey: authSessionKey,
        username: conf.username || 'admin',
        source: 'auth.json',
      };
    }
    console.warn('auth.json 中的 Session Key 已失效，尝试账号密码登录...');
  }

  const username = conf.username || 'admin';
  const passwords = [conf.password, conf.changePassword, 'itM@2304', 'BFE@baidu@2021'].filter(
    (value, index, list) => value && list.indexOf(value) === index,
  );

  for (const password of passwords) {
    const response = await loginWithPassword(apiRoot, username, password);
    const sessionKey = response.Data?.session_key || response.Data?.sessionKey;
    if (response.ErrNum === 200 && sessionKey) {
      return {
        apiRoot,
        sessionKey,
        username: response.Data.user_name || username,
        source: '账号密码登录',
      };
    }
  }

  throw new Error(
    '登录失败。请检查 conf.json 账号密码，或使用 --session-key / SESSION_KEY 传入有效 Session Key',
  );
}

function rulesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const conf = loadConf();
  const auth = await login(conf);
  const client = axios.create({
    headers: authHeaders(auth.sessionKey),
    timeout: 30000,
  });

  console.log('环境: ' + conf.ctlHost);
  console.log('账号: ' + auth.username + '（鉴权来源: ' + auth.source + '）');
  console.log('模式: ' + (execute ? '恢复基线' : '检测（加 --execute 才会恢复 Global 路由规则基线）'));

  const body = await apiRequest(client, 'get', `${auth.apiRoot}/global-route-rules`);
  if (body.ErrNum !== 200) {
    throw new Error('查询 Global 路由规则失败: ' + (body.ErrMsg || body.ErrNum));
  }

  const current = body.Data || {};
  const baseline = GLOBAL_RULES_BASELINE;
  const isBaseline = rulesEqual(current, baseline);

  console.log('\n当前 Global 路由规则:');
  console.log('  enabled: ' + current.enabled);
  console.log('  rules (' + ((current.rules || []).length) + '):');
  for (const rule of current.rules || []) {
    console.log('    - ' + rule.name + ' | cond=' + rule.cond);
  }

  console.log('\n基线 Global 路由规则（scripts/init-test-data.js）:');
  console.log('  enabled: ' + baseline.enabled);
  console.log('  rules (' + baseline.rules.length + '):');
  for (const rule of baseline.rules) {
    console.log('    - ' + rule.name + ' | cond=' + rule.cond);
  }

  console.log(
    '\n提示: Entity / API-Key 残留请运行 `npm run cleanup:testdata` 统一清理（route 测试复用的是 entity 数据）。',
  );

  if (isBaseline) {
    console.log('\nGlobal 路由规则与基线一致，无需恢复。');
    return;
  }

  if (!execute) {
    console.log('\nGlobal 路由规则与基线不一致。确认后请加 --execute 恢复为基线。');
    return;
  }

  console.log('\n开始恢复 Global 路由规则基线...');
  const resp = await apiRequest(client, 'put', `${auth.apiRoot}/global-route-rules`, {
    data: baseline,
  });
  if (resp.ErrNum === 200) {
    console.log('[OK] Global 路由规则已恢复为基线');
  } else {
    console.log('[FAIL] 恢复失败 -> ' + (resp.ErrMsg || resp.ErrNum));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('清理脚本异常: ' + error.message);
  process.exitCode = 1;
});
