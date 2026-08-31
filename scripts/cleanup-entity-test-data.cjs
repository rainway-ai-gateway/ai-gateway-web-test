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
 * 批量清理 Entity 管理自动化测试残留数据（type_* / ent_* / 文档固定测试名 / API-Key 测试描述）
 *
 * 用法（在 code/ 目录下执行）：
 *   node ai-gateway-tests/scripts/cleanup-entity-test-data.cjs              # 仅预览（默认）
 *   node ai-gateway-tests/scripts/cleanup-entity-test-data.cjs --execute    # 实际删除
 *   node ai-gateway-tests/scripts/cleanup-entity-test-data.cjs --session-key <key>  # 指定 Session Key
 *
 *   node ai-gateway-tests/scripts/cleanup-entity-test-data.cjs --include-doc-fixtures  # 含 test-dep 等固定名
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const CODE_ROOT = path.resolve(__dirname, '../..');
const CONF_PATH = path.join(CODE_ROOT, 'conf.json');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const includeDocFixtures = args.includes('--include-doc-fixtures');
const sessionKeyArgIndex = args.indexOf('--session-key');
const sessionKeyFromArg =
  sessionKeyArgIndex >= 0 ? args[sessionKeyArgIndex + 1] : process.env.SESSION_KEY;

const ENTITY_TYPE_PATTERNS = [
  /^type_\d{17}(?:_\d+)?$/,
  /^type_\d{14,17}$/,
];

const ENTITY_NAME_PATTERNS = [
  /^ent_\d{17}(?:_\d+)?$/,
  /^ent_\d{14,17}$/,
];

const DOC_ENTITY_TYPE_NAMES = ['test-dep', 'dep2', 'test-dep-cancel'];

const DOC_ENTITY_NAMES = [
  'root-entity',
  'required-entity',
  'quota-entity',
  'ratelimit-entity',
  'parent-entity',
  'child-under-parent',
];

const API_KEY_DESCRIPTION_PREFIXES = [
  '测试用API-Key',
  '必填校验API-Key',
  '带配额的API-Key',
  '带限流的API-Key',
  '挂载Entity的API-Key',
  '不挂载Entity的API-Key',
  '无限配额的API-Key',
  '测试过期时间校验',
  '测试子网校验',
  '编辑后的API-Key描述',
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
      `${apiRoot}/entities`,
      { params: { page: 1, page_size: 1 } },
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

function authHeaders(sessionKey) {
  return { Authorization: 'Session ' + sessionKey };
}

function normalizeList(data) {
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.list)) {
    return data.list;
  }
  return [];
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

async function fetchAllPages(client, apiRoot, endpoint, query = {}) {
  const pageSize = 100;
  let page = 1;
  const all = [];

  while (true) {
    const body = await apiRequest(client, 'get', `${apiRoot}${endpoint}`, {
      params: { ...query, page, page_size: pageSize },
    });

    if (body.ErrNum !== 200) {
      throw new Error(`查询 ${endpoint} 失败: ${body.ErrMsg || body.ErrNum}`);
    }

    const list = normalizeList(body.Data);
    all.push(...list);

    const pagination = body.Data?.pagination;
    const total = pagination?.total ?? list.length;
    if (list.length === 0 || page * pageSize >= total) {
      break;
    }
    page += 1;
  }

  return all;
}

function matchesAnyPattern(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function isTestEntityType(typeName) {
  if (!typeName) {
    return false;
  }
  if (matchesAnyPattern(typeName, ENTITY_TYPE_PATTERNS)) {
    return true;
  }
  if (includeDocFixtures && DOC_ENTITY_TYPE_NAMES.includes(typeName)) {
    return true;
  }
  return false;
}

function isTestEntity(entity) {
  const name = entity.name || entity.Name;
  if (!name) {
    return false;
  }
  if (matchesAnyPattern(name, ENTITY_NAME_PATTERNS)) {
    return true;
  }
  if (includeDocFixtures && DOC_ENTITY_NAMES.includes(name)) {
    return true;
  }
  return false;
}

function isTestApiKey(apiKey) {
  const description = apiKey.description || '';
  if (!description) {
    return false;
  }
  return API_KEY_DESCRIPTION_PREFIXES.some(
    (prefix) => description === prefix || description.startsWith(prefix + '_'),
  );
}

function sortEntitiesChildrenFirst(entities) {
  const idSet = new Set(entities.map((item) => item.id));
  const remaining = [...entities];
  const sorted = [];

  while (remaining.length > 0) {
    const leaves = remaining.filter((item) => {
      const parentId = item.parent_id || item.parentId;
      if (!parentId) {
        return true;
      }
      return !remaining.some((candidate) => candidate.id === parentId);
    });

    if (leaves.length === 0) {
      sorted.push(...remaining);
      break;
    }

    for (const leaf of leaves) {
      sorted.push(leaf);
      const index = remaining.findIndex((item) => item.id === leaf.id);
      remaining.splice(index, 1);
    }
  }

  return sorted;
}

async function deleteApiKey(client, apiRoot, apiKey) {
  const body = await apiRequest(client, 'delete', `${apiRoot}/api-keys/${apiKey.id}`);
  return body.ErrNum === 200;
}

async function deleteEntity(client, apiRoot, entity) {
  const body = await apiRequest(client, 'delete', `${apiRoot}/entities/${entity.id}`);
  return body.ErrNum === 200;
}

async function deleteEntityType(client, apiRoot, typeName) {
  const body = await apiRequest(
    client,
    'delete',
    `${apiRoot}/entity-types/${encodeURIComponent(typeName)}`,
  );
  return body.ErrNum === 200;
}

function printSection(title, items, formatter) {
  console.log('\n' + title + ' (' + items.length + ')');
  if (items.length === 0) {
    console.log('  （无）');
    return;
  }
  for (const item of items) {
    console.log('  - ' + formatter(item));
  }
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
  console.log('模式: ' + (execute ? '执行删除' : '预览（加 --execute 才会真正删除）'));

  const [apiKeys, entities, entityTypes] = await Promise.all([
    fetchAllPages(client, auth.apiRoot, '/api-keys'),
    fetchAllPages(client, auth.apiRoot, '/entities'),
    fetchAllPages(client, auth.apiRoot, '/entity-types'),
  ]);

  const testApiKeys = apiKeys.filter(isTestApiKey);
  const testEntities = entities.filter(isTestEntity);
  const testEntityTypes = entityTypes.filter((item) =>
    isTestEntityType(item.type_name || item.typeName || item.name),
  );
  const sortedEntities = sortEntitiesChildrenFirst(testEntities);

  printSection('待清理 API-Key', testApiKeys, (item) => `${item.id} | ${item.description}`);
  printSection(
    '待清理 Entity',
    sortedEntities,
    (item) => `${item.id} | ${item.name}${item.parent_id ? ' | parent=' + item.parent_id : ''}`,
  );
  printSection(
    '待清理 Entity 类型',
    testEntityTypes,
    (item) => item.type_name || item.typeName || item.name,
  );

  const total = testApiKeys.length + testEntities.length + testEntityTypes.length;
  if (total === 0) {
    console.log('\n未发现匹配的测试残留数据。');
    return;
  }

  if (!execute) {
    console.log('\n以上为预览。确认后请加 --execute 执行删除。');
    return;
  }

  console.log('\n开始删除...');
  let ok = 0;
  let fail = 0;

  for (const apiKey of testApiKeys) {
    const success = await deleteApiKey(client, auth.apiRoot, apiKey);
    if (success) {
      ok += 1;
      console.log('[OK] API-Key ' + apiKey.id);
    } else {
      fail += 1;
      console.log('[FAIL] API-Key ' + apiKey.id);
    }
  }

  for (const entity of sortedEntities) {
    const success = await deleteEntity(client, auth.apiRoot, entity);
    if (success) {
      ok += 1;
      console.log('[OK] Entity ' + entity.name + ' (' + entity.id + ')');
    } else {
      fail += 1;
      console.log('[FAIL] Entity ' + entity.name + ' (' + entity.id + ')');
    }
  }

  for (const entityType of testEntityTypes) {
    const typeName = entityType.type_name || entityType.typeName || entityType.name;
    const success = await deleteEntityType(client, auth.apiRoot, typeName);
    if (success) {
      ok += 1;
      console.log('[OK] Entity 类型 ' + typeName);
    } else {
      fail += 1;
      console.log('[FAIL] Entity 类型 ' + typeName);
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
