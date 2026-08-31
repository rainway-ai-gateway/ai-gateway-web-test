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
const providerApi = require('./provider-api-utils');

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
    // 页面可能不在正确的 origin，尝试从 auth.json 读取
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

async function getDomains(page, productName = getProductName()) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/products/' + productName + '/domains',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET domains');
}

async function createDomain(page, domainName, productName = getProductName()) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/products/' + productName + '/domains',
      {
        data: { name: domainName },
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('POST domain 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('POST domain 异常: ' + error.message);
    return false;
  }
}

async function deleteDomain(page, domainName, productName = getProductName()) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() +
        '/products/' +
        productName +
        '/domains/' +
        encodeURIComponent(domainName),
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('DELETE domain 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('DELETE domain 异常: ' + error.message);
    return false;
  }
}

async function getBfePoolList(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(getOpenApiBaseUrl() + '/alb-pool', {
    headers: authHeaders(userData.sessionKey),
  });
  return parseApiResponse(response, 'GET alb-pool');
}

async function getBfePool(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(getOpenApiBaseUrl() + '/alb-pool', {
    headers: authHeaders(userData.sessionKey),
  });
  return parseApiResponse(response, 'GET alb-pool');
}

async function updateBfePool(page, poolData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.patch(
      getOpenApiBaseUrl() + '/alb-pool',
      {
        data: poolData,
        headers: authHeaders(userData.sessionKey),
        timeout: 20000,
      },
    );
    const body = await response.json();
    common.log('PATCH alb-pool 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('PATCH alb-pool 异常: ' + error.message);
    return false;
  }
}

async function getBfeClusterList(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/bfe-clusters',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET bfe-clusters');
}

async function getBfeCluster(page, clusterName) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/bfe-clusters/' + encodeURIComponent(clusterName),
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET bfe-cluster');
}

async function createBfeCluster(page, clusterData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/bfe-clusters',
      {
        data: clusterData,
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('POST bfe-cluster 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('POST bfe-cluster 异常: ' + error.message);
    return false;
  }
}

async function deleteBfeCluster(page, clusterName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/bfe-clusters/' + encodeURIComponent(clusterName),
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('DELETE bfe-cluster 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('DELETE bfe-cluster 异常: ' + error.message);
    return false;
  }
}

async function getSubClusterList(page, productName = getProductName()) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/products/' + productName + '/sub-clusters',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET sub-clusters');
}

async function getSubCluster(
  page,
  subClusterName,
  productName = getProductName(),
) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() +
      '/products/' +
      productName +
      '/sub-clusters/' +
      encodeURIComponent(subClusterName),
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET sub-cluster');
}

async function createSubCluster(
  page,
  subClusterData,
  productName = getProductName(),
) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/products/' + productName + '/sub-clusters',
      {
        data: subClusterData,
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('POST sub-cluster 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('POST sub-cluster 异常: ' + error.message);
    return false;
  }
}

async function deleteSubCluster(
  page,
  subClusterName,
  productName = getProductName(),
) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() +
        '/products/' +
        productName +
        '/sub-clusters/' +
        encodeURIComponent(subClusterName),
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('DELETE sub-cluster 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('DELETE sub-cluster 异常: ' + error.message);
    return false;
  }
}

async function getProductInstancePoolList(
  page,
  productName = getProductName(),
) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/products/' + productName + '/instance-pools',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET instance-pools');
}

async function getProductInstancePool(
  page,
  shortPoolName,
  productName = getProductName(),
) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() +
      '/products/' +
      productName +
      '/instance-pools/' +
      encodeURIComponent(shortPoolName),
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET instance-pool');
}

async function deleteProductInstancePool(
  page,
  shortPoolName,
  productName = getProductName(),
) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() +
        '/products/' +
        productName +
        '/instance-pools/' +
        encodeURIComponent(shortPoolName),
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('DELETE instance-pool 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('DELETE instance-pool 异常: ' + error.message);
    return false;
  }
}

async function createProductInstancePool(
  page,
  shortPoolName,
  poolData,
  productName = getProductName(),
) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() +
        '/products/' +
        productName +
        '/instance-pools/' +
        encodeURIComponent(shortPoolName),
      {
        data: poolData,
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('POST instance-pool 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('POST instance-pool 异常: ' + error.message);
    return false;
  }
}

async function getClusterScheduler(
  page,
  clusterName,
  productName = getProductName(),
) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() +
      '/products/' +
      productName +
      '/clusters/' +
      encodeURIComponent(clusterName) +
      '/scheduler',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET cluster scheduler');
}

async function getClusterList(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(getOpenApiBaseUrl() + '/clusters', {
    headers: authHeaders(userData.sessionKey),
  });
  return parseApiResponse(response, 'GET clusters');
}

async function getCluster(page, clusterName) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/clusters/' + encodeURIComponent(clusterName),
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET cluster');
}

async function deleteCluster(page, clusterName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/clusters/' + encodeURIComponent(clusterName),
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('DELETE cluster 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('DELETE cluster 异常: ' + error.message);
    return false;
  }
}

async function createCluster(page, clusterData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/clusters',
      {
        data: clusterData,
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('POST cluster 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('POST cluster 异常: ' + error.message);
    return false;
  }
}

async function updateGlobalRouteRules(page, ruleData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.put(
      getOpenApiBaseUrl() + '/global-route-rules',
      {
        data: ruleData,
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('PUT global-route-rules 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('PUT global-route-rules 异常: ' + error.message);
    return false;
  }
}

/**
 * 创建服务商并以此 provider 构建 createCluster API 所需的 payload（与 UI 提交结构一致）
 * @param {object} page Playwright page
 * @param {string} clusterName 集群名
 * @param {string[]} models 模型列表
 * @param {object} overrides 额外覆盖字段
 * @returns {Promise<boolean>} 是否成功
 */
async function createClusterWithProvider(
  page,
  clusterName,
  models,
  overrides = {},
) {
  const providerName = 'provider_' + clusterName + '_' + Date.now();
  const providerData = await providerApi.createProviderViaApi(page, {
    name: providerName,
    description: '自动化测试-路由-' + clusterName,
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: models,
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  if (!providerData) {
    common.log('创建服务商失败: ' + providerName);
    return false;
  }

  const clusterData = {
    name: clusterName,
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
      models: models,
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
    ...overrides,
  };

  const ok = await createCluster(page, clusterData);
  if (!ok) {
    common.log('集群 ' + clusterName + ' 创建失败');
  }
  return ok;
}

/**
 * 确保测试所需的集群存在
 * 如果集群不存在则自动创建（需先创建 provider）
 */
async function ensureTestClusters(
  page,
  clusterNames = ['test121', 'test122', 'test123'],
) {
  try {
    // 获取现有集群列表
    const existingClusters = new Set();
    const clusterList = await getClusterList(page);
    if (clusterList && Array.isArray(clusterList)) {
      clusterList.forEach((c) => {
        existingClusters.add(c.name || c.Name);
      });
    }

    // 创建缺失的集群
    for (const name of clusterNames) {
      if (!existingClusters.has(name)) {
        common.log(`集群 ${name} 不存在，正在创建...`);
        const ok = await createClusterWithProvider(page, name, [
          'model-' + name,
        ]);
        if (ok) {
          common.log(`集群 ${name} 创建成功`);
        } else {
          common.log(`集群 ${name} 创建失败`);
        }
      }
    }
    return true;
  } catch (error) {
    common.log('ensureTestClusters 异常: ' + error.message);
    return false;
  }
}

/**
 * 初始化测试数据：确保集群和 Global 路由规则存在
 * 必须在页面已导航到应用后调用（确保有 sessionKey）
 */
async function initRouteTestData(page) {
  // 确保集群存在
  await ensureTestClusters(page, ['test121', 'test122', 'test123']);

  // 确保 Global 路由规则存在
  const ruleData = {
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
  await updateGlobalRouteRules(page, ruleData);

  await page.waitForTimeout(500);
}

module.exports = {
  DEFAULT_PRODUCT_NAME,
  getOpenApiBaseUrl,
  getProductName,
  getUserData,
  getDomains,
  createDomain,
  deleteDomain,
  getBfePoolList,
  getBfePool,
  updateBfePool,
  getBfeClusterList,
  getBfeCluster,
  createBfeCluster,
  deleteBfeCluster,
  getSubClusterList,
  getSubCluster,
  createSubCluster,
  deleteSubCluster,
  getProductInstancePoolList,
  getProductInstancePool,
  deleteProductInstancePool,
  createProductInstancePool,
  getClusterScheduler,
  getClusterList,
  getCluster,
  deleteCluster,
  createCluster,
  createClusterWithProvider,
  updateGlobalRouteRules,
  ensureTestClusters,
  initRouteTestData,
};
