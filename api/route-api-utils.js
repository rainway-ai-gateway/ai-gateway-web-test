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
  // 优先使用 apiHost（直连后端 8183），避免 8088 代理层超时
  const base = confInfo['apiHost'] || confInfo['ctlHost'].replace('/login', '');
  return base + '/open-api/v1';
}

async function getUserData(page) {
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

  if (!userData || !userData.sessionKey) {
    throw new Error('无法从页面获取 session_key');
  }
  return userData;
}

async function requestOpenApi(page, method, endpoint, data) {
  const userData = await getUserData(page);
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

async function getGlobalRouteRulesViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/global-route-rules');
  if (body.ErrNum !== 200) {
    return null;
  }
  return body.Data;
}

async function getRouteTablesViaApi(page) {
  const body = await requestOpenApi(page, 'get', '/route-tables?page_size=200');
  if (body.ErrNum !== 200) {
    return [];
  }
  const data = body.Data || {};
  return Array.isArray(data.list) ? data.list : [];
}

async function setGlobalRouteRulesViaApi(page, { enabled, rules }) {
  const current = await getGlobalRouteRulesViaApi(page);
  const payload = {
    enabled: enabled === true,
    rules: rules !== undefined ? rules : current?.rules || [],
  };
  const body = await requestOpenApi(
    page,
    'put',
    '/global-route-rules',
    payload,
  );
  return body.ErrNum === 200;
}

async function findGlobalRouteTableViaApi(page) {
  const list = await getRouteTablesViaApi(page);
  return list.find((item) => item.type === 'global') || null;
}

function createRouteTestCleanup() {
  let originalGlobalRules = null;

  return {
    async saveGlobalRouteRulesOriginalState(page) {
      try {
        originalGlobalRules = await getGlobalRouteRulesViaApi(page);
        common.log(
          '保存 Global 路由规则原始状态: ' +
            JSON.stringify(originalGlobalRules),
        );
      } catch (error) {
        common.log('保存 Global 路由规则原始状态失败: ' + error.message);
      }
    },
    async cleanup(page) {
      if (!originalGlobalRules) {
        return;
      }
      try {
        await setGlobalRouteRulesViaApi(page, {
          enabled: originalGlobalRules.enabled === true,
          rules: originalGlobalRules.rules || [],
        });
        common.log('已恢复 Global 路由规则原始状态');
      } catch (error) {
        common.log('恢复 Global 路由规则原始状态失败: ' + error.message);
      }
    },
  };
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  getGlobalRouteRulesViaApi,
  getRouteTablesViaApi,
  setGlobalRouteRulesViaApi,
  findGlobalRouteTableViaApi,
  createRouteTestCleanup,
};
