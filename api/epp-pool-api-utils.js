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
const common = require('../utils/common');
const fs = require('fs');
const path = require('path');

const DEFAULT_PRODUCT_NAME = 'AI_product';

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function getOpenApiBaseUrl() {
  const base = confInfo.apiHost || confInfo.ctlHost.replace('/login', '');
  return base + '/open-api/v1';
}

function getProductName() {
  return DEFAULT_PRODUCT_NAME;
}

async function getUserData(page) {
  // 先尝试从页面 localStorage 获取
  try {
    const userData = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        return null;
      }
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    });

    if (userData && userData.sessionKey) {
      return userData;
    }
  } catch (e) {
    common.log(
      '从页面获取 sessionKey 失败，尝试从 auth.json 读取: ' + e.message,
    );
  }

  // 从 auth.json 文件读取
  try {
    const authPath = path.join(__dirname, '../auth.json');
    if (fs.existsSync(authPath)) {
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      if (authData.origins && authData.origins.length > 0) {
        const localStorageItems = authData.origins[0].localStorage || [];
        const userItem = localStorageItems.find((item) => item.name === 'user');
        if (userItem && userItem.value) {
          const userData = JSON.parse(userItem.value);
          if (userData && userData.sessionKey) {
            common.log('从 auth.json 成功读取 sessionKey');
            return userData;
          }
        }
      }
    }
  } catch (e) {
    common.log('从 auth.json 读取失败: ' + e.message);
  }

  throw new Error('无法获取 session_key');
}

function authHeaders(sessionKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Session ' + sessionKey,
  };
}

async function parseApiResponse(response, label) {
  const body = await response.json();
  common.log(label + ' 响应: ' + JSON.stringify(body));
  if (body.ErrNum !== 200) {
    throw new Error(label + ' 失败: ' + (body.ErrMsg || body.ErrNum));
  }
  return body.Data;
}

/**
 * GET /epp-pool - 获取 EPP 实例池全量数据
 */
async function getEppPool(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/epp-pool',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET epp-pool');
}

/**
 * PATCH /epp-pool - 全量替换 EPP 实例池
 * @param {object} page Playwright page
 * @param {object} poolData 全量实例池数据（不含 name 字段）
 */
async function patchEppPool(page, poolData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.patch(
      getOpenApiBaseUrl() + '/epp-pool',
      {
        data: poolData,
        headers: authHeaders(userData.sessionKey),
        timeout: 20000,
      },
    );
    const body = await response.json();
    common.log('PATCH epp-pool 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('PATCH epp-pool 异常: ' + error.message);
    return false;
  }
}

/**
 * GET /epp-assignments - 获取 EPP 调度分配全量视图
 * @param {object} page Playwright page
 * @param {string} cluster 可选，按集群名过滤
 */
async function getEppAssignments(page, cluster) {
  const userData = await getUserData(page);
  let url = getOpenApiBaseUrl() + '/epp-assignments';
  if (cluster) {
    url += '?cluster=' + encodeURIComponent(cluster);
  }
  const response = await page.request.get(url, {
    headers: authHeaders(userData.sessionKey),
  });
  return parseApiResponse(response, 'GET epp-assignments');
}

/**
 * PUT /epp-assignments/{cluster} - 手动覆写 EPP 调度分配
 */
async function putEppAssignment(page, cluster, assignmentData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.put(
      getOpenApiBaseUrl() +
        '/epp-assignments/' +
        encodeURIComponent(cluster),
      {
        data: assignmentData,
        headers: authHeaders(userData.sessionKey),
        timeout: 20000,
      },
    );
    const body = await response.json();
    common.log('PUT epp-assignment 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('PUT epp-assignment 异常: ' + error.message);
    return false;
  }
}

/**
 * EPP Pool 测试清理工具
 */
function createEppPoolTestCleanup() {
  const tracked = { names: [] };

  return {
    trackName(name) {
      if (name && !tracked.names.includes(name)) {
        tracked.names.push(name);
      }
    },
    async cleanup(page) {
      // EPP Pool 无独立删除 API，测试通过 PATCH 全量恢复
      tracked.names = [];
    },
    clear() {
      tracked.names = [];
    },
  };
}

/**
 * 为 EPP 调度分配测试批量创建前置数据
 *
 * 策略：
 * 1. 创建 13 组双实例的 EPP 实例池 + 30 个 EPP 集群（满足 ASGN-01~04/06）
 * 2. 集群创建时 AssignCluster 自动分配，reconciler 周期兜底
 *
 * 注意：unassigned_clusters 无法通过 Open API 持久化产生，原因：
 *   - PATCH /epp-pool 同步调用 RepairDangling 修复所有悬空分配
 *   - Reconcile（30s 周期）回填所有未分配集群
 *   - PUT /epp-assignments 校验 primary_instance_id 必须在指定实例组内存在
 *   因此 ASGN-05 需要环境中天然存在未分配/降级集群才能完整验证
 *
 * @param {object} page Playwright page（需已登录）
 * @returns {Promise<{ originalPool: object, createdClusters: string[], providerName: string, testGroups: object[], unassignedClusters: string[] }>}
 */
async function setupEppAssignmentTestData(page) {
  const userData = await getUserData(page);
  const headers = authHeaders(userData.sessionKey);
  const baseUrl = getOpenApiBaseUrl();
  const createdClusters = [];

  // ---- 0) 清理残留的测试数据（防止上次 teardown 失败导致冲突） ----
  const testProviderName = 'epp-test-provider';
  try {
    // 先删除所有测试集群（名称模式：epp-test-c01 ~ epp-test-c30）
    for (let i = 1; i <= 30; i++) {
      const clusterName = 'epp-test-c' + String(i).padStart(2, '0');
      try {
        await page.request.delete(
          baseUrl + '/clusters/' + encodeURIComponent(clusterName),
          { headers, timeout: 10000 },
        );
      } catch (_) { /* 不存在则忽略 */ }
    }
    // 再删除 provider
    const delResp = await page.request.delete(
      baseUrl + '/providers/' + encodeURIComponent(testProviderName),
      { headers, timeout: 10000 },
    );
    common.log('[setup] 清理残留 provider: ' + testProviderName + ' ' + (await delResp.json()).ErrNum);
  } catch (_) { /* 不存在则忽略 */ }

  // ---- 1) 保存原始实例池数据 ----
  let originalPool = null;
  try {
    originalPool = await getEppPool(page);
  } catch (e) {
    common.log('[setup] 获取原始池失败: ' + e.message);
  }

  // ---- 2) 扩展实例池到 13 组（g1-g13 双实例） ----
  const totalGroups = 13;
  const totalClusters = 30;
  const testGroups = [];
  for (let i = 1; i <= totalGroups; i++) {
    const base = 100 + i * 10;
    testGroups.push({
      name: 'g' + i,
      instances: [
        { id: 'epp-g' + i + 'a', host: '10.0.' + base + '.1', port: 9002 },
        { id: 'epp-g' + i + 'b', host: '10.0.' + base + '.2', port: 9002 },
      ],
    });
  }

  const ok = await patchEppPool(page, { groups: testGroups });
  if (!ok) {
    common.log('[setup] 实例池 PATCH 失败，跳过集群创建');
    return { originalPool, createdClusters: [], providerName: '', testGroups, unassignedClusters: [] };
  }
  common.log(`[setup] 实例池已扩展至 ${totalGroups} 组`);

  // ---- 3) 创建服务商 ----
  const providerName = 'epp-test-provider';
  const models = [];
  for (let i = 1; i <= totalClusters; i++) {
    models.push('epp-model-' + String(i).padStart(2, '0'));
  }

  const providerResp = await page.request.post(baseUrl + '/providers', {
    data: {
      name: providerName,
      description: 'EPP自动化测试',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models,
      keys: [],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    },
    headers,
  });
  const provBody = await providerResp.json();
  if (provBody.ErrNum !== 200) {
    common.log('[setup] 服务商创建失败: ' + JSON.stringify(provBody));
    return { originalPool, createdClusters: [], providerName: '', testGroups, unassignedClusters: [] };
  }
  common.log('[setup] 服务商 ' + providerName + ' 创建成功');

  // ---- 4) 创建 30 个 EPP 集群（AssignCluster 在创建时自动分配） ----
  const buildClusterData = (name, model) => ({
    name,
    basic: {
      protocol: 'https',
      connection: { max_idle_conn_per_rs: 2, cancel_on_client_close: false },
      retries: { max_retry_in_cluster: 2 },
      buffers: { req_write_buffer_size: 512 },
      timeouts: {
        timeout_conn_serv: 2000,
        timeout_response_header: 60000,
        timeout_readbody_client: 30000,
        timeout_read_client_again: 60000,
        timeout_write_client: 60000,
      },
    },
    sticky_sessions: {
      enabled: true,
      hash_strategy: 'CLIENT_ID_ONLY',
      hash_header: 'Cookie:USERID',
    },
    passive_health_check: {
      schema: 'http',
      failnum: 10,
      interval: 1000,
      host: 'www.test1.com',
      uri: '/interface',
      statuscode: 200,
    },
    llm_config: {
      provider: providerName,
      models: [model],
      model_mappings: [],
      keys: [],
      key_policy: {
        strategy: 'weighted_random',
        max_retries: 0,
        retry_backoff_initial: 500,
        retry_backoff_max: 5000,
      },
      key_affinity: {
        enabled: false,
        ttl: 600,
        redis_prefix: 'bfe:ai:key_affinity',
        penalty_enable: true,
      },
    },
    balance_mode: 'EPP',
    epp_config: {
      scheduling_profile: 'balanced',
      cache_affinity: 'medium',
      prefix_cache_affinity: false,
      kv_cache_utilization_max: 0.5,
    },
  });

  for (let i = 1; i <= totalClusters; i++) {
    const name = 'epp-test-c' + String(i).padStart(2, '0');
    const model = 'epp-model-' + String(i).padStart(2, '0');
    const data = buildClusterData(name, model);

    try {
      const resp = await page.request.post(baseUrl + '/clusters', {
        data,
        headers,
        timeout: 15000,
      });
      const body = await resp.json();
      if (body.ErrNum === 200) {
        createdClusters.push(name);
        common.log('[setup] 集群 ' + name + ' 创建成功');
      } else {
        common.log('[setup] 集群 ' + name + ' 创建失败: ' + JSON.stringify(body));
      }
    } catch (e) {
      common.log('[setup] 集群 ' + name + ' 异常: ' + e.message);
    }
  }

  // ---- 5) 等待 reconciler 兜底分配 ----
  await page.waitForTimeout(3000);

  // 验证分配状态
  try {
    const assignments = await getEppAssignments(page);
    const assignedCount = (assignments?.clusters || []).length;
    common.log(`[setup] 验证: ${assignedCount}/${createdClusters.length} 个集群已分配`);
  } catch (e) {
    common.log('[setup] 验证分配状态失败: ' + e.message);
  }

  common.log(`[setup] 创建完成: ${createdClusters.length} 个EPP集群, provider=${providerName}`);
  return {
    originalPool,
    createdClusters,
    providerName,
    testGroups,
    unassignedClusters: [],
  };
}

/**
 * 还原 EPP 测试前置数据
 *
 * @param {object} page Playwright page
 * @param {object} ctx setupEppAssignmentTestData 返回的上下文
 */
async function restoreEppAssignmentTestData(page, ctx) {
  const userData = await getUserData(page);
  const headers = authHeaders(userData.sessionKey);
  const baseUrl = getOpenApiBaseUrl();

  // 1) 删除创建的集群
  for (const name of (ctx.createdClusters || [])) {
    try {
      const resp = await page.request.delete(
        baseUrl + '/clusters/' + encodeURIComponent(name),
        { headers, timeout: 10000 },
      );
      const body = await resp.json();
      if (body.ErrNum === 200) {
        common.log('[teardown] 集群 ' + name + ' 已删除');
      }
    } catch (e) {
      common.log('[teardown] 集群 ' + name + ' 删除异常: ' + e.message);
    }
  }

  // 2) 删除服务商
  if (ctx.providerName) {
    try {
      const resp = await page.request.delete(
        baseUrl + '/providers/' + encodeURIComponent(ctx.providerName),
        { headers, timeout: 10000 },
      );
      common.log('[teardown] 服务商 ' + ctx.providerName + ' 删除: ' + (await resp.json()).ErrNum);
    } catch (e) {
      common.log('[teardown] 服务商删除异常: ' + e.message);
    }
  }

  // 3) 还原实例池
  if (ctx.originalPool) {
    await patchEppPool(page, { groups: ctx.originalPool.groups });
    common.log('[teardown] 实例池已还原');
  }
}

module.exports = {
  DEFAULT_PRODUCT_NAME,
  getOpenApiBaseUrl,
  getProductName,
  getUserData,
  getEppPool,
  patchEppPool,
  getEppAssignments,
  putEppAssignment,
  createEppPoolTestCleanup,
  setupEppAssignmentTestData,
  restoreEppAssignmentTestData,
};