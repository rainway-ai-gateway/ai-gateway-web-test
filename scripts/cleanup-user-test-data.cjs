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
 * 批量清理用户管理自动化测试残留数据（user_<ts> 测试用户）
 *
 * 用法（在 gui-test-for-ai-gateway/ 目录下执行）：
 *   node scripts/cleanup-user-test-data.cjs              # 仅预览（默认）
 *   node scripts/cleanup-user-test-data.cjs --execute    # 实际删除
 *   node scripts/cleanup-user-test-data.cjs --session-key <key>  # 指定 Session Key
 *
 * 注意：
 * - Token 无删除接口（后端仅 token_create/list/one），无法通过 API 兜底清理，
 *   需由测试用例自身的 afterEach（UI 幂等删除）负责；本脚本仅统计并提示。
 * - 保护账号（admin / conf.json 配置账号）不会被删除。
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

// 与 UserPage.generateTestUsername() 一致：'user_' + YYYYMMDDHHmmssSSS
const USERNAME_PATTERNS = [/^user_\d{17}$/];

// 与 UserPage.generateTestTokenName() / 用例内固定前缀一致（仅统计，不删除）
const TOKEN_PATTERNS = [
  /^token_\d{17}$/,
  /^token_sys_admin_\d+$/,
  /^token_internal_support_\d+$/,
];

function loadConf() {
  if (!fs.existsSync(CONF_PATH)) {
    throw new Error('未找到 conf.json: ' + CONF_PATH);
  }
  return JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
}

function buildApiRoot(conf) {
  return conf.ctlHost.replace(/\/login\/?$/, '') + '/open-api/v1';
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

function matchesAnyPattern(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

async function main() {
  const conf = loadConf();
  const auth = await login(conf);
  const client = axios.create({
    headers: authHeaders(auth.sessionKey),
    timeout: 30000,
  });

  const protectedNames = new Set(
    ['admin', 'root', 'system'].concat(conf.username || []),
  );

  console.log('环境: ' + conf.ctlHost);
  console.log('账号: ' + auth.username + '（鉴权来源: ' + auth.source + '）');
  console.log('模式: ' + (execute ? '执行删除' : '预览（加 --execute 才会真正删除）'));

  const body = await apiRequest(client, 'get', `${auth.apiRoot}/auth/users`);
  if (body.ErrNum !== 200) {
    throw new Error('查询用户列表失败: ' + (body.ErrMsg || body.ErrNum));
  }

  const users = Array.isArray(body.Data) ? body.Data : [];
  const testUsers = users.filter((item) => {
    const name = item.user_name || item.UserName || item.name;
    return (
      name &&
      matchesAnyPattern(name, USERNAME_PATTERNS) &&
      !protectedNames.has(name)
    );
  });

  console.log('\n待清理测试用户 (' + testUsers.length + ')');
  for (const item of testUsers) {
    console.log('  - ' + (item.user_name || item.UserName || item.name));
  }

  const tokenCount = users.filter(
    (item) => matchesAnyPattern(item.user_name || item.UserName || item.name, TOKEN_PATTERNS),
  ).length;
  console.log('\nToken 残留检测: ' + tokenCount + ' 条（Token 无删除接口，无法 API 兜底；由测试 afterEach 清理）');

  if (testUsers.length === 0) {
    console.log('\n未发现匹配的测试残留用户。');
    return;
  }

  if (!execute) {
    console.log('\n以上为预览。确认后请加 --execute 执行删除。');
    return;
  }

  console.log('\n开始删除...');
  let ok = 0;
  let fail = 0;
  for (const item of testUsers) {
    const name = item.user_name || item.UserName || item.name;
    const resp = await apiRequest(
      client,
      'delete',
      `${auth.apiRoot}/auth/users/${encodeURIComponent(name)}`,
    );
    if (resp.ErrNum === 200) {
      ok += 1;
      console.log('[OK] 用户 ' + name);
    } else {
      fail += 1;
      console.log('[FAIL] 用户 ' + name + ' -> ' + (resp.ErrMsg || resp.ErrNum));
    }
  }

  console.log('\n完成: 成功 ' + ok + '，失败 ' + fail);
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('清理脚本异常: ' + error.message);
  process.exitCode = 1;
});
