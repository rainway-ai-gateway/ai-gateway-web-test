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
    getOpenApiBaseUrl() + '/products/' + getProductName() + '/epp-pool',
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
      getOpenApiBaseUrl() + '/products/' + getProductName() + '/epp-pool',
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
  let url =
    getOpenApiBaseUrl() + '/products/' + getProductName() + '/epp-assignments';
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
        '/products/' +
        getProductName() +
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
};