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
 * AI业务集群 - 列表展示（RM-BC-01、RM-BC-37）
 *
 * - RM-BC-01 列表展示：页面布局（「添加集群」按钮等）。
 * - RM-BC-37 业务集群列表与 OpenAPI 一致：API 造数后刷新列表，名称集合一致。
 *
 * 造数：集群引用 Provider（llm_config.provider），先通过 provider-api-utils
 * 创建服务商（provider_<ts>，afterEach 清理），再 POST /clusters。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-集群列表',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_A1],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

/** 构建 createCluster API 所需的 payload（与 UI 提交结构一致：llm_config.provider 引用） */
async function buildClusterPayload(page, name, provider, overrides = {}) {
  return {
    name,
    basic: {
      protocol: 'https',
      connection: {
        max_idle_conn_per_rs: 2,
        cancel_on_client_close: false,
      },
      retries: {
        max_retry_in_cluster: 2,
      },
      buffers: { req_write_buffer_size: 512 },
      timeouts: {
        timeout_read_client_again: 60000,
        timeout_readbody_client: 30000,
        timeout_conn_serv: 2000,
        timeout_response_header: 60000,
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
      provider,
      models: [MODEL_A1],
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
}

test.describe('AI业务集群管理 - RM-BC-01 列表展示', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('RM-BC-01 列表展示', async ({ page }) => {
    await utils.expectBusinessClusterPageLayout(page);
  });
});

test.describe('AI业务集群管理 - RM-BC-37 业务集群列表与OpenAPI一致', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('RM-BC-37 业务集群列表与OpenAPI一致', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // 通过API创建集群（引用 Provider）
    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    // 获取API返回的集群列表
    const apiData = await utils.getClusterList(page);
    // API 返回的是数组，不是 { items: [...] }
    const apiClusterNames = Array.isArray(apiData)
      ? apiData.map((item) => item.name)
      : [];

    // 刷新页面以加载最新列表
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: '添加集群' })).toBeVisible({
      timeout: 15000,
    });

    // 等待每个集群名称在页面上可见
    for (const name of apiClusterNames) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({
        timeout: 15000,
      });
    }
  });
});
