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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * AI业务集群 - BC-J-02 换服务商演练（编辑态状态机，docs/覆盖缺口清单.md #2/#20）
 *
 * 场景：运维对存量集群（Provider A：2 模型 + 2 Keys）执行「换服务商」操作——
 * 编辑向导第 4 步切换为 Provider B（1 模型 + 1 Key），验证旧数据的处置、
 * 重新配置与提交/读回。
 *
 * 实现契约（ai-gateway-web GatewayConfig.syncFormWithProvider）：
 * - 转发模型：不在新 provider models 列表中的被**静默剔除**（filter）
 * - Keys：行保留，name 不在新 provider keys 中的被**清空为 ''**（weight 保留）；
 *   空 name 行不参与权重和校验、提交时过滤
 *
 * 覆盖：
 * - 切换后转发模型被过滤为空、Keys 行 name 清空且 weight 保留（UI 处置）
 * - 重新选择 B 的模型与 Key 后可进入复查并提交
 * - PATCH 提交体为新值；GET 读回一致（无旧 provider 残留）
 *
 * 造数：两个 Provider 均 API 创建（provider_<ts>，afterEach 先删集群再删服务商）；
 * 集群经 API 创建（含 Provider A 的 2 模型 + 2 Keys）。
 *
 * 运行：npx playwright test tests/cluster/test_13_business_cluster_provider_switch_journey.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';
const MODEL_A2 = 'Qwen/Qwen2.5-7B-Instruct';
const MODEL_B1 = 'Qwen/Qwen2.5-1.5B-Instruct';
const KEY_A1 = 'key-a1';
const KEY_A2 = 'key-a2';
const KEY_B1 = 'key-b1';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup, models, keys }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-换服务商演练',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models,
    keys,
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

test.describe('AI业务集群 - BC-J-02 换服务商演练（编辑态）', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    // 先删集群再删服务商：集群仍引用 provider 时删除会 409
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('编辑态切换 provider：模型过滤、Keys 清空保留权重、重配提交与读回一致', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    // 造数：Provider A（2 模型 + 2 Keys）与 Provider B（1 模型 + 1 Key）
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      models: [MODEL_A1, MODEL_A2],
      keys: [
        { name: KEY_A1, key: 'sk-a1' },
        { name: KEY_A2, key: 'sk-a2' },
      ],
    });
    const providerB = await createProvider({
      page,
      cleanup: providerCleanup,
      models: [MODEL_B1],
      keys: [{ name: KEY_B1, key: 'sk-b1' }],
    });

    // 存量集群：引用 Provider A，2 个转发模型 + 2 个 Keys（70/30）
    await utils.createCluster(page, {
      name: clusterName,
      basic: {
        protocol: 'https',
        connection: { max_idle_conn_per_rs: 2, cancel_on_client_close: false },
        retries: { max_retry_in_cluster: 2 },
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
        provider: providerA,
        models: [MODEL_A1, MODEL_A2],
        model_mappings: [],
        keys: [
          { name: KEY_A1, weight: 70 },
          { name: KEY_A2, weight: 30 },
        ],
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 1. 编辑向导第 4 步：回显 Provider A 的模型与 Keys
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectSelectedForwardModels(
      page,
      [MODEL_A1, MODEL_A2],
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    let row0 = await utils.getModelKeyRowValues(
      page,
      0,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    let row1 = await utils.getModelKeyRowValues(
      page,
      1,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(row0).toEqual({ name: KEY_A1, weight: '70' });
    expect(row1).toEqual({ name: KEY_A2, weight: '30' });

    // 2. 切换为 Provider B：模型被过滤（A1/A2 均不在 B 的列表 → 空），
    //    Keys 行保留但 name 清空、weight 保留（syncFormWithProvider 契约）
    await utils.selectProvider(
      page,
      providerB,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectSelectedForwardModels(
      page,
      [],
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await expect(
      utils.modelKeysTable(page, utils.DRAWER_TITLE.editBusinessCluster).locator('tbody tr'),
    ).toHaveCount(2);
    row0 = await utils.getModelKeyRowValues(
      page,
      0,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    row1 = await utils.getModelKeyRowValues(
      page,
      1,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    // 清空后下拉回落到 placeholder 文案，归一为「空」再断言
    const clearedName = (name) =>
      name === utils.DOC_BUSINESS_CLUSTER.providerKeyPlaceholder ? '' : name;
    expect(
      { name: clearedName(row0.name), weight: row0.weight },
      '旧 Key 名被清空、权重保留',
    ).toEqual({ name: '', weight: '70' });
    expect(
      { name: clearedName(row1.name), weight: row1.weight },
      '旧 Key 名被清空、权重保留',
    ).toEqual({ name: '', weight: '30' });

    // 3. 重新配置：选 B 的模型，第 1 行选 B 的 Key 并调整权重为 100
    await utils.selectForwardModels(
      page,
      [MODEL_B1],
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.fillModelKeyRow(
      page,
      0,
      { name: KEY_B1, weight: 100 },
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    // 4. 提交 PATCH：提交体为 Provider B 的新值，旧模型/旧 Keys 无残留
    const request = await utils.waitForClusterPatchRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.provider).toBe(providerB);
    expect(body.llm_config.models).toEqual([MODEL_B1]);
    expect(body.llm_config.keys).toEqual([{ name: KEY_B1, weight: 100 }]);

    // 5. GET 读回与提交一致
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
    const apiData = await utils.getCluster(page, clusterName);
    expect(apiData.llm_config.provider).toBe(providerB);
    expect(apiData.llm_config.models).toEqual([MODEL_B1]);
    expect(apiData.llm_config.keys).toEqual([{ name: KEY_B1, weight: 100 }]);
  });
});