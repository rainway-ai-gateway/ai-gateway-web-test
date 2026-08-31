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
 * 批量清理模型定价自动化测试残留数据（replace 导入基线 YAML 重置整表）
 *
 * 用法（在 gui-test-for-ai-gateway/ 目录下执行）：
 *   node scripts/cleanup-model-price-test-data.cjs              # 仅预览（默认）
 *   node scripts/cleanup-model-price-test-data.cjs --execute    # replace 导入基线重置
 *   node scripts/cleanup-model-price-test-data.cjs --session-key <key>  # 指定 Session Key
 *
 * 说明：
 * - 模型定价采用整表 replace 导入（POST /model-prices/import, mode=replace），
 *   将当前表重置为基线 test-files/model-prices/model-list.yaml（deepseek-v3 + gpt-4o）。
 * - 需要 node 18+（使用全局 FormData / Blob，可选链 ?.）。
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const CODE_ROOT = path.resolve(__dirname, '..');
const CONF_PATH = path.join(CODE_ROOT, 'conf.json');
const BASELINE_YAML_PATH = path.join(
  CODE_ROOT,
  'test-files/model-prices/model-list.yaml',
);

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

  if (!fs.existsSync(BASELINE_YAML_PATH)) {
    throw new Error('未找到基线 YAML: ' + BASELINE_YAML_PATH);
  }
  const baselineYaml = fs.readFileSync(BASELINE_YAML_PATH, 'utf-8');

  console.log('环境: ' + conf.ctlHost);
  console.log('账号: ' + auth.username + '（鉴权来源: ' + auth.source + '）');
  console.log('模式: ' + (execute ? '执行重置' : '预览（加 --execute 才会 replace 导入基线）'));

  const body = await apiRequest(client, 'get', `${auth.apiRoot}/model-prices`, {
    params: { page: 1, page_size: 200 },
  });
  if (body.ErrNum !== 200) {
    throw new Error('查询模型定价列表失败: ' + (body.ErrMsg || body.ErrNum));
  }
  const data = body.Data || {};
  const list = Array.isArray(data.list) ? data.list : [];
  const total = (data.pagination && data.pagination.total) || list.length;

  console.log('\n当前模型定价表（' + total + ' 条）:');
  for (const item of list) {
    console.log(
      '  - ' +
        [item.provider, item.model, item.mode].filter(Boolean).join(' / ') +
        ' (id=' + item.id + ')',
    );
  }

  console.log('\n基线模型定价（test-files/model-prices/model-list.yaml）:');
  console.log('  - deepseek / deepseek-v3 / chat');
  console.log('  - openai / gpt-4o / chat');

  if (!execute) {
    console.log(
      '\n以上为预览。确认后请加 --execute 执行 replace 导入（清空重建为基线，整表重置）。',
    );
    return;
  }

  console.log('\n开始 replace 导入基线...');
  const form = new FormData();
  form.append('mode', 'replace');
  form.append(
    'file',
    new Blob([baselineYaml], { type: 'application/x-yaml' }),
    'model-list.yaml',
  );

  const resp = await apiRequest(client, 'post', `${auth.apiRoot}/model-prices/import`, {
    data: form,
    headers: { Authorization: 'Session ' + auth.sessionKey },
  });

  if (resp.ErrNum === 200) {
    const rst = resp.Data || {};
    console.log(
      '[OK] 已重置为基线。imported=' + rst.imported_count + ' skipped=' + rst.skipped_count,
    );
    if (Array.isArray(rst.errors) && rst.errors.length > 0) {
      console.log('[WARN] 导入错误: ' + JSON.stringify(rst.errors));
    }
  } else {
    console.log('[FAIL] 重置失败 -> ' + (resp.ErrMsg || resp.ErrNum));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('清理脚本异常: ' + error.message);
  process.exitCode = 1;
});
