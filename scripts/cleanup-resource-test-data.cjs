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
 * 批量清理资源管理自动化测试残留数据（cluster<ts> 测试业务集群）
 *
 * 用法（在 gui-test-for-ai-gateway/ 目录下执行）：
 *   node scripts/cleanup-resource-test-data.cjs              # 仅预览（默认）
 *   node scripts/cleanup-resource-test-data.cjs --execute    # 实际删除
 *   node scripts/cleanup-resource-test-data.cjs --session-key <key>  # 指定 Session Key
 *
 * 注意：
 * - 业务集群（POST/DELETE /clusters）为唯一可 API 批量兜底的资源。
 * - 业务实例池 API 已废弃（后端 product_pool endpoints 未注册，调用即 404），
 *   由测试 afterEach 的 deleteProductInstancePool 负责。
 * - 网关实例池为单例（GET/PATCH /alb-pool），无删除接口，原始状态由测试
 *   afterEach 的 saveGatewayPoolOriginalState + 恢复负责；本脚本不处理。
 * - 保护对象：不属于本命名约定的集群不会被删除。
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
  sessionKeyArgIndex >= 0
    ? args[sessionKeyArgIndex + 1]
    : process.env.SESSION_KEY;

// 与 ResourcePageCommon.generateTestBusinessClusterName() 一致：'cluster' + YYYYMMDDHHmmssSSS + seq
const CLUSTER_PATTERNS = [/^cluster\d{17}\d*$/];

function loadConf() {
  if (!fs.existsSync(CONF_PATH)) {
    throw new Error('未找到 conf.json: ' + CONF_PATH);
  }
  return JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
}

function buildApiRoot(conf) {
  return (
    (conf.apiHost || conf.ctlHost.replace(/\/login\/?$/, '')) + '/open-api/v1'
  );
}

function authHeaders(sessionKey) {
  return { Authorization: 'Session ' + sessionKey };
}

async function loginWithPassword(apiRoot, username, password) {
  const response = await axios.post(
    `${apiRoot}/auth/session-keys`,
    { user_name: username, password },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
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
  const passwords = [
    conf.password,
    conf.changePassword,
    'itM@2304',
    'BFE@baidu@2021',
  ].filter((value, index, list) => value && list.indexOf(value) === index);

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

  console.log('环境: ' + conf.ctlHost);
  console.log('账号: ' + auth.username + '（鉴权来源: ' + auth.source + '）');
  console.log(
    '模式: ' + (execute ? '执行删除' : '预览（加 --execute 才会真正删除）'),
  );

  const body = await apiRequest(client, 'get', `${auth.apiRoot}/clusters`);
  if (body.ErrNum !== 200) {
    throw new Error('查询集群列表失败: ' + (body.ErrMsg || body.ErrNum));
  }

  const clusters = Array.isArray(body.Data) ? body.Data : [];
  const testClusters = clusters.filter((item) => {
    const name = item.name || item.cluster_name || item.clusterName;
    return name && matchesAnyPattern(name, CLUSTER_PATTERNS);
  });

  console.log('\n待清理测试业务集群 (' + testClusters.length + ')');
  for (const item of testClusters) {
    console.log('  - ' + (item.name || item.cluster_name || item.clusterName));
  }

  console.log(
    '\n说明: 业务实例池 API 已废弃、网关实例池为单例，均由测试 afterEach 负责清理，本脚本不处理。',
  );

  if (testClusters.length === 0) {
    console.log('\n未发现匹配的测试残留集群。');
    return;
  }

  if (!execute) {
    console.log('\n以上为预览。确认后请加 --execute 执行删除。');
    return;
  }

  console.log('\n开始删除...');
  let ok = 0;
  let fail = 0;
  for (const item of testClusters) {
    const name = item.name || item.cluster_name || item.clusterName;
    const resp = await apiRequest(
      client,
      'delete',
      `${auth.apiRoot}/clusters/${encodeURIComponent(name)}`,
    );
    if (resp.ErrNum === 200) {
      ok += 1;
      console.log('[OK] 集群 ' + name);
    } else {
      fail += 1;
      console.log(
        '[FAIL] 集群 ' + name + ' -> ' + (resp.ErrMsg || resp.ErrNum),
      );
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
