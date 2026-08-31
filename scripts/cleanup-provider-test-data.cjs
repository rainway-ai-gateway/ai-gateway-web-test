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
 * 批量清理服务商（Providers）自动化测试残留数据（provider_<ts> 前缀，逐条删除）
 *
 * 用法（在 gui-test-for-ai-gateway/ 目录下执行）：
 *   node scripts/cleanup-provider-test-data.cjs              # 仅预览（默认）
 *   node scripts/cleanup-provider-test-data.cjs --execute    # 逐条 DELETE 删除
 *   node scripts/cleanup-provider-test-data.cjs --session-key <key>  # 指定 Session Key
 *
 * 说明：
 * - 测试数据命名约定：provider_<ts>（tests/providers 各 spec 与 api/provider-api-utils.js
 *   保持一致），脚本仅处理该前缀的数据，不触碰手工创建的服务商。
 * - 被集群引用的服务商删除会返回 409，脚本跳过并告警，不影响其余清理。
 * - 需要 node 18+（可选链 ?.）。
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const CODE_ROOT = path.resolve(__dirname, '..');
const CONF_PATH = path.join(CODE_ROOT, 'conf.json');
const TEST_PREFIX = 'provider_';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const sessionKeyArgIndex = args.indexOf('--session-key');
const sessionKeyFromArg =
  sessionKeyArgIndex >= 0 ? args[sessionKeyArgIndex + 1] : process.env.SESSION_KEY;

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

async function main() {
  const conf = loadConf();
  const auth = await login(conf);
  const client = axios.create({
    headers: authHeaders(auth.sessionKey),
    timeout: 60000,
  });

  console.log('环境: ' + conf.ctlHost);
  console.log('账号: ' + auth.username + '（鉴权来源: ' + auth.source + '）');
  console.log('模式: ' + (execute ? '执行删除' : '预览（加 --execute 才会删除）'));

  const body = await apiRequest(client, 'get', `${auth.apiRoot}/providers`);
  if (body.ErrNum !== 200) {
    throw new Error('查询服务商列表失败: ' + (body.ErrMsg || body.ErrNum));
  }
  const data = body.Data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data && data.list)
      ? data.list
      : [];

  const targets = list.filter(
    (item) => item && typeof item.name === 'string' && item.name.startsWith(TEST_PREFIX),
  );

  console.log('\n匹配测试前缀「' + TEST_PREFIX + '」的服务商（共 ' + targets.length + ' 条）:');
  for (const item of targets) {
    console.log('  - ' + item.name);
  }
  if (!list.length) {
    console.log('  （当前无任何服务商）');
  }

  if (!targets.length) {
    console.log('\n无需清理。');
    return;
  }

  if (!execute) {
    console.log('\n以上为预览。确认后请加 --execute 执行逐条删除。');
    return;
  }

  console.log('\n开始逐条删除...');
  let ok = 0;
  for (const item of targets) {
    const resp = await apiRequest(
      client,
      'delete',
      `${auth.apiRoot}/providers/${encodeURIComponent(item.name)}`,
    );
    if (resp.ErrNum === 200) {
      ok += 1;
      console.log('[OK] ' + item.name);
    } else {
      console.log(
        '[SKIP] ' + item.name + ' -> ' + (resp.ErrMsg || resp.ErrNum) + '（可能仍被集群引用）',
      );
    }
  }
  console.log('\n完成: 成功删除 ' + ok + '/' + targets.length + ' 条。');
  if (ok !== targets.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('清理脚本异常: ' + error.message);
  process.exitCode = 1;
});
