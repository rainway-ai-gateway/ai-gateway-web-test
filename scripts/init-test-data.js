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
 * 测试数据初始化脚本
 * 用于在数据库清理后重新创建测试所需的初始数据
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CONF_PATH = path.join(__dirname, '../conf.json');
const AUTH_PATH = path.join(__dirname, '../auth.json');

// 读取配置
let confInfo = {};
try {
  confInfo = JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
} catch (e) {
  console.error('读取配置文件失败:', e.message);
  process.exit(1);
}

const BASE_URL = confInfo.ctlHost || 'http://localhost:8088';
const API_BASE =
  (confInfo.apiHost || BASE_URL.replace('/login', '')) + '/open-api/v1';

// 测试数据配置
const TEST_CLUSTERS = [
  {
    name: 'test121',
    product: 'AI_product',
    description: '测试集群 1',
    models: [{ name: 'model-a', weight: 100 }],
  },
  {
    name: 'test122',
    product: 'AI_product',
    description: '测试集群 2',
    models: [{ name: 'model-b', weight: 100 }],
  },
  {
    name: 'test123',
    product: 'AI_product',
    description: '测试集群 3',
    models: [{ name: 'model-c', weight: 100 }],
  },
];

const TEST_GLOBAL_RULES = {
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

async function login(page) {
  console.log('正在登录...');
  await page.goto(BASE_URL);
  await page.waitForTimeout(1000);

  // 填写登录表单
  await page.fill(
    'input[placeholder*="用户名"], input[name="username"]',
    'admin',
  );
  await page.fill(
    'input[placeholder*="密码"], input[name="password"]',
    'admin',
  );
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(2000);

  // 获取 sessionKey
  const userData = await page.evaluate(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  if (!userData || !userData.sessionKey) {
    throw new Error('登录失败，无法获取 sessionKey');
  }

  console.log(
    '登录成功，sessionKey:',
    userData.sessionKey.substring(0, 20) + '...',
  );
  return userData;
}

async function createCluster(page, sessionKey, clusterData) {
  console.log(`创建集群: ${clusterData.name}`);
  const response = await page.request.post(API_BASE + '/clusters', {
    data: clusterData,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Session ' + sessionKey,
    },
  });
  const body = await response.json();
  if (body.ErrNum === 200) {
    console.log(`  ✓ 集群 ${clusterData.name} 创建成功`);
    return true;
  } else {
    console.log(`  ✗ 集群 ${clusterData.name} 创建失败: ${body.ErrMsg}`);
    return false;
  }
}

async function checkClusterExists(page, sessionKey, clusterName) {
  const response = await page.request.get(API_BASE + '/clusters', {
    headers: {
      Authorization: 'Session ' + sessionKey,
    },
  });
  const body = await response.json();
  if (body.ErrNum === 200 && body.Data) {
    return body.Data.some(
      (c) => c.name === clusterName || c.Name === clusterName,
    );
  }
  return false;
}

async function updateGlobalRouteRules(page, sessionKey, ruleData) {
  console.log('更新 Global 路由规则...');
  const response = await page.request.put(API_BASE + '/global-route-rules', {
    data: ruleData,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Session ' + sessionKey,
    },
  });
  const body = await response.json();
  if (body.ErrNum === 200) {
    console.log('  ✓ Global 路由规则更新成功');
    return true;
  } else {
    console.log(`  ✗ Global 路由规则更新失败: ${body.ErrMsg}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('测试数据初始化脚本');
  console.log('========================================');
  console.log('API 地址:', API_BASE);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 登录
    const userData = await login(page);
    const sessionKey = userData.sessionKey;

    // 2. 创建集群
    console.log('\n--- 创建测试集群 ---');
    for (const cluster of TEST_CLUSTERS) {
      const exists = await checkClusterExists(page, sessionKey, cluster.name);
      if (exists) {
        console.log(`  - 集群 ${cluster.name} 已存在，跳过`);
      } else {
        await createCluster(page, sessionKey, cluster);
      }
    }

    // 3. 创建 Global 路由规则
    console.log('\n--- 创建 Global 路由规则 ---');
    await updateGlobalRouteRules(page, sessionKey, TEST_GLOBAL_RULES);

    // 4. 验证数据
    console.log('\n--- 验证数据 ---');
    const clustersResponse = await page.request.get(API_BASE + '/clusters', {
      headers: { Authorization: 'Session ' + sessionKey },
    });
    const clustersBody = await clustersResponse.json();
    if (clustersBody.ErrNum === 200) {
      console.log(
        `集群数量: ${(clustersBody.Data && clustersBody.Data.length) || 0}`,
      );
    }

    const rulesResponse = await page.request.get(
      API_BASE + '/global-route-rules',
      { headers: { Authorization: 'Session ' + sessionKey } },
    );
    const rulesBody = await rulesResponse.json();
    if (rulesBody.ErrNum === 200) {
      console.log(
        `Global 路由规则数量: ${(rulesBody.Data && rulesBody.Data.rules && rulesBody.Data.rules.length) || 0}`,
      );
    }

    console.log('\n========================================');
    console.log('初始化完成！');
    console.log('========================================');
  } catch (error) {
    console.error('初始化失败:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
