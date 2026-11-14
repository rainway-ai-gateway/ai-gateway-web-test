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
 * AI业务集群 - 交互边界与引用保护（BC-E-01~05，docs/覆盖缺口清单.md #3/#4/#6/#11）
 *
 * 产品事实（ai-gateway-web/src/modules/Clusters/index.vue:42-58）：
 * - 向导抽屉 `:mask-closable="false"` 且无 before-close / 无「取消」按钮，
 *   退出向导由右上角 `.ivu-drawer-close` 承担，直接关闭且丢弃未保存数据；
 * - 抽屉内容 `v-if="upsertVisible"`，关闭即销毁，重开为全新初始态。
 * - `connection.cancel_on_client_close` 为 iView Select（启用/停用），默认 false。
 *
 * 覆盖：
 * - BC-E-01 关闭抽屉丢弃未保存数据：无 POST 请求、列表无新行、重开为初始态
 * - BC-E-02 点击遮罩不关闭抽屉（mask-closable=false）
 * - BC-E-03 cancel_on_client_close：默认 false / 切「启用」后提交为 true
 * - BC-E-04 provider 侧被引用 Key/模型被 409 保护拦截 → 集群编辑回显完整（引用不变）
 * - BC-E-05 密钥不落明文：POST /clusters 提交体、GET /clusters 响应、Keys 表格均不含 key 明文
 *
 * 造数：服务商/集群均 API（provider_<ts>，afterEach 先删集群再删服务商）。
 *
 * 运行：npx playwright test tests/cluster/test_15_business_cluster_interaction_and_guard.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';
const MODEL_A2 = 'Qwen/Qwen2.5-7B-Instruct';
const KEY_A1 = 'key-guard-1';
const KEY_A1_SECRET = 'sk-supersecret-guard-1';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup, models = [MODEL_A1], keys = [] }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-交互边界与引用保护',
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

function clusterPayload(name, provider, overrides = {}) {
  return {
    name,
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

test.describe('AI业务集群 - BC-E-01/02 向导关闭与遮罩交互', () => {
  test.beforeEach(async ({ page }) => {
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test('BC-E-01 关闭抽屉丢弃未保存数据：无提交请求、重开为初始态', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const createRequests = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/clusters')) {
        createRequests.push(req.url());
      }
    });

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      description: '半填后关闭，不应落库',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');

    // 右上角关闭（无二次确认，直接丢弃）
    await utils.ivuDrawer(page).closeByX(utils.DRAWER_TITLE.createBusinessCluster);
    await expect(
      utils.ivuDrawer(page).withTitle(utils.DRAWER_TITLE.createBusinessCluster),
    ).toBeHidden({ timeout: 10000 });

    // 无创建请求、列表无新行
    expect(createRequests, '关闭向导不应发出 POST /clusters').toEqual([]);
    await utils.businessClusterTable(page).waitForLoaded();
    await expect(
      utils.businessClusterTable(page).rowByText(clusterName),
    ).toHaveCount(0);

    // 重开为初始态：第 1 步、名称为空（抽屉内容 v-if 销毁重建）
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.expectWizardStep(page, '基础配置');
    expect(await utils.getWizardFieldValue(page, '集群名称')).toBe('');
    await utils.ivuDrawer(page).closeByX(utils.DRAWER_TITLE.createBusinessCluster);
  });

  test('BC-E-02 点击遮罩不关闭抽屉（mask-closable=false）', async ({ page }) => {
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName: utils.generateTestBusinessClusterName(),
      protocol: 'https',
    });

    // 点击抽屉遮罩左侧边缘：抽屉应保持打开（mask-closable=false）
    const mask = page.locator('.ivu-drawer-mask').first();
    await mask.click({ position: { x: 5, y: 5 }, force: true });
    await page.waitForTimeout(500);
    await expect(
      utils.ivuDrawer(page).withTitle(utils.DRAWER_TITLE.createBusinessCluster),
    ).toBeVisible();

    await utils.ivuDrawer(page).closeByX(utils.DRAWER_TITLE.createBusinessCluster);
  });
});

test.describe('AI业务集群 - BC-E-03 cancel_on_client_close 提交语义', () => {
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

  test('BC-E-03 默认 false；切「启用」后提交体为 true', async ({ page }) => {
    test.setTimeout(300000);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });

    // 1. 默认值：不触碰该项，提交体应含 false
    const defaultCluster = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(defaultCluster);
    await utils.fillCreateWizardThroughReview(page, {
      clusterName: defaultCluster,
      protocol: 'https',
      model: { provider: providerName, models: [MODEL_A1] },
    });
    const defaultRequest = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    expect(
      defaultRequest.postDataJSON().basic.connection.cancel_on_client_close,
    ).toBe(false);

    // 2. 切「启用」后提交体应为 true
    await utils.expectCreateBusinessClusterDrawerHidden(page);
    const enabledCluster = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(enabledCluster);
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName: enabledCluster,
      protocol: 'https',
      closeOnClientClose: '启用',
    });
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const enabledRequest = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    expect(
      enabledRequest.postDataJSON().basic.connection.cancel_on_client_close,
    ).toBe(true);

    // 3. GET 读回一致
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, enabledCluster);
    const apiData = await utils.getCluster(page, enabledCluster);
    expect(apiData.basic.connection.cancel_on_client_close).toBe(true);
  });
});

test.describe('AI业务集群 - BC-E-04/05 引用保护与密钥不落明文', () => {
  let cleanup;
  let providerCleanup;
  let providerName;
  let clusterName;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
    providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      models: [MODEL_A1, MODEL_A2],
      keys: [{ name: KEY_A1, key: KEY_A1_SECRET }],
    });
    clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    await utils.createCluster(
      page,
      clusterPayload(clusterName, providerName, {
        llm_config: {
          provider: providerName,
          models: [MODEL_A1],
          model_mappings: [],
          keys: [{ name: KEY_A1, weight: 100 }],
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
      }),
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('BC-E-04 provider 侧移除被引用 Key 被 409 拦截，集群回显完整', async ({
    page,
  }) => {
    test.setTimeout(180000);
    // 与 providers PR-LINK-05 的差异化：本用例是「集群侧」视角——保护拦截后，
    // 集群编辑回显与详情 Keys 表格必须完整（UI 层断言；providers 侧只断言 API 引用不变）
    const provider = await api.getProviderViaApi(page, providerName);

    // 1. 尝试移除被集群引用的 Key → 409 联动保护（ProviderKeyRefChecker）
    const removeKeyResult = await api.updateProviderRawViaApi(page, providerName, {
      description: provider.description,
      model_protocols: provider.model_protocols,
      model_endpoint: provider.model_endpoint,
      models: provider.models,
      keys: [],
      instance_pool: provider.instance_pool,
    });
    expect(removeKeyResult.ok, '移除被引用 Key 应被拒绝').toBe(false);
    expect(removeKeyResult.body.ErrNum).toBe(409);

    // 2. 事务回滚：服务商 Keys 未被移除
    const after = await api.getProviderViaApi(page, providerName);
    expect(after.keys.map((k) => k.name)).toEqual([KEY_A1]);

    // 3. 集群编辑回显完整（引用不变）：模型 MODEL_A1、Key KEY_A1 权重 100
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectProviderValue(
      page,
      providerName,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectSelectedForwardModels(
      page,
      [MODEL_A1],
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(
      await utils.getModelKeyRowValues(
        page,
        0,
        utils.DRAWER_TITLE.editBusinessCluster,
      ),
    ).toEqual({ name: KEY_A1, weight: '100' });
    await utils.closeBusinessClusterEditDrawer(page);

    // 4. 详情页同样完整
    await utils.openBusinessClusterDetail(page, clusterName);
    const reviewKeys = await utils.getReviewKeysTable(
      page,
      utils.DRAWER_TITLE.businessClusterDetail,
    );
    expect(reviewKeys).toEqual([{ name: KEY_A1, weight: '100' }]);
    await utils.closeBusinessClusterDetail(page);
  });

  test('BC-E-05 密钥不落明文：提交体、GET 响应与 Keys 表格均不含 key 值', async ({
    page,
  }) => {
    test.setTimeout(180000);

    // 1. GET /clusters/{name} 响应原文不含 key 明文
    const apiData = await utils.getCluster(page, clusterName);
    expect(JSON.stringify(apiData)).not.toContain(KEY_A1_SECRET);

    // 2. 编辑向导 Keys 表格只展示名称，单元格不含明文
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const keysTableText = (
      (await utils
        .modelKeysTable(page, utils.DRAWER_TITLE.editBusinessCluster)
        .textContent()) || ''
    ).trim();
    expect(keysTableText).toContain(KEY_A1);
    expect(keysTableText).not.toContain(KEY_A1_SECRET);

    // 3. 原样提交（不改任何字段）时 PATCH 请求体不含明文
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const patchRequest = await utils.waitForClusterPatchRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    expect(patchRequest.postData()).not.toContain(KEY_A1_SECRET);
  });
});