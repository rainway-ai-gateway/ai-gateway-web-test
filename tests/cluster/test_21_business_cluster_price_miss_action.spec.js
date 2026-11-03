// ===== RM-BC-125 缺价处置动作（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-3）=====
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
 * AI业务集群 - 缺价处置动作（RM-BC-125，2026-11-03 issue #1479）
 *
 * 背景：api 在 llm_config 新增 price_miss_action（fallback_chat 默认 / bill_zero /
 * reject），约定「控制台新建集群显式落值，省略等价默认」。UI 在大模型配置卡片
 * 新增下拉，复查页与详情抽屉展示中文短文案。
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-3）：
 * - 用例一：新建默认 fallback_chat——复查页展示「回退 chat 价计费」，提交体
 *   llm_config.price_miss_action="fallback_chat"（显式落值）。
 * - 用例二：切换 reject / bill_zero 提交体与复查展示。
 * - 用例三：编辑回读——存量集群（存储值 reject）回显 reject；历史集群（无该
 *   字段）回显默认 fallback_chat。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）。
 *
 * 运行：npx playwright test tests/cluster/test_21_business_cluster_price_miss_action.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resApi = require('../../api/resource-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

const DOC = utils.DOC_BUSINESS_CLUSTER;

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-缺价处置动作',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_A1],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

async function navigateToModelStep(page, clusterName) {
  await utils.openCreateBusinessClusterDrawer(page);
  await utils.fillBasicStep(page, { clusterName, protocol: 'https' });
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.expectWizardStep(page, '大模型配置');
}

async function fillProviderAndModels(page, providerName) {
  await utils.selectProvider(page, providerName);
  await utils.selectForwardModels(page, [MODEL_A1]);
}

// 大模型配置步骤（抽屉 body）内按 label 定位表单项
function llmFormItem(page, label) {
  return page
    .locator('.ivu-drawer-body:visible .ivu-form-item')
    .filter({ hasText: label })
    .first();
}

// iView Select 选中值文案
async function getLlmSelectValue(page, label) {
  const item = llmFormItem(page, label);
  return (await item.locator('.ivu-select-selected-value').first().textContent()).trim();
}

// 按文案选择 iView Select 下拉项
async function setLlmSelectByText(page, label, optionText) {
  const item = llmFormItem(page, label);
  await item.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: optionText })
    .first()
    .click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// 复查/详情页汇总行取值：li.title 为 label 的 ul 中 li.value 文本
async function getReviewRowValue(page, label) {
  const ul = page
    .locator('.ivu-drawer-body:visible ul.clearFloat')
    .filter({ has: page.locator('li.title', { hasText: label }) })
    .first();
  return (await ul.locator('li.value').first().textContent()).trim();
}

function buildClusterPayload(clusterName, providerName, overrides = {}) {
  return {
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

async function createClusterViaApi(page, cleanup, providerName, overrides = {}) {
  const name = utils.generateTestBusinessClusterName();
  const { status, body } = await resApi.createClusterWithResponse(
    page,
    buildClusterPayload(name, providerName, overrides),
  );
  expect(status, `API 造数集群应创建成功：${JSON.stringify(body)}`).toBe(200);
  cleanup.trackBusinessCluster(name);
  return name;
}

test.describe('AI业务集群 - RM-BC-125 缺价处置动作', () => {
  const ctx = {};

  test.beforeEach(async ({ page }) => {
    ctx.cleanup = utils.createResourceTestCleanup();
    ctx.providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await ctx.cleanup.cleanup(page);
    await ctx.providerCleanup.cleanup(page);
  });

  test('验证新建默认 fallback_chat：复查展示与提交体显式落值', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    await test.step('1. 「缺价处置动作」下拉默认选中 fallback_chat，仅三选项', async () => {
      const item = llmFormItem(page, DOC.priceMissActionLabel);
      await expect(item).toBeVisible();
      await expect(
        item.locator('.ivu-select-selected-value').first(),
      ).toHaveText(DOC.priceMissActionOptions.fallback_chat);
      await item.locator('.ivu-select-selection').first().click();
      await page.waitForTimeout(200);
      const options = page.locator(
        '.ivu-select-dropdown:visible .ivu-select-item',
      );
      await expect(options).toHaveCount(3);
      for (const key of ['fallback_chat', 'bill_zero', 'reject']) {
        await expect(options.filter({ hasText: DOC.priceMissActionOptions[key] })).toHaveCount(1);
      }
      await page.keyboard.press('Escape');
    });

    await test.step('2. 复查页展示「回退 chat 价计费」，提交体 price_miss_action="fallback_chat"', async () => {
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      expect(await getReviewRowValue(page, DOC.priceMissActionLabel)).toBe(
        DOC.priceMissActionShort.fallback_chat,
      );
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.price_miss_action, '提交体 price_miss_action').toBe(
        'fallback_chat',
      );
    });
  });

  test('验证切换 reject / bill_zero 的提交体与复查展示', async ({ page }) => {
    test.setTimeout(300000);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });

    const cases = [
      { value: 'reject', short: DOC.priceMissActionShort.reject },
      { value: 'bill_zero', short: DOC.priceMissActionShort.bill_zero },
    ];
    for (const c of cases) {
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      await navigateToModelStep(page, clusterName);
      await fillProviderAndModels(page, providerName);
      await setLlmSelectByText(
        page,
        DOC.priceMissActionLabel,
        DOC.priceMissActionOptions[c.value],
      );
      expect(await getLlmSelectValue(page, DOC.priceMissActionLabel)).toBe(
        DOC.priceMissActionOptions[c.value],
      );
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      expect(await getReviewRowValue(page, DOC.priceMissActionLabel)).toBe(c.short);
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.price_miss_action).toBe(c.value);
    }
  });

  test('验证编辑回读：存量值回显，历史无字段集群回显默认', async ({ page }) => {
    test.setTimeout(300000);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    // 存量：存储值 reject
    const rejectCluster = await createClusterViaApi(page, ctx.cleanup, providerName, {
      llm_config: {
        ...buildClusterPayload('x', providerName).llm_config,
        price_miss_action: 'reject',
      },
    });
    // 历史：请求体不含 price_miss_action（旧客户端语义）
    const legacyCluster = await createClusterViaApi(page, ctx.cleanup, providerName);
    await utils.refreshBusinessClusterList(page);

    const EDIT_DRAWER = utils.DRAWER_TITLE.editBusinessCluster;
    async function openEditModelStep(clusterName) {
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
      await utils.openEditBusinessClusterDrawer(page, clusterName);
      await utils.clickWizardNext(page);
      await utils.clickWizardNext(page);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '大模型配置', EDIT_DRAWER);
    }

    await test.step('1. 存储值 reject 的集群：编辑回显 reject', async () => {
      await openEditModelStep(rejectCluster);
      const item = llmFormItem(page, DOC.priceMissActionLabel);
      await expect(
        item.locator('.ivu-select-selected-value').first(),
      ).toHaveText(DOC.priceMissActionOptions.reject);
    });

    await test.step('2. 历史无字段集群：编辑回显默认 fallback_chat', async () => {
      // 上一个抽屉仍处于编辑态：点 X 关闭再开另一个（Escape 无法关闭 element-ui
      // select 的 transfer 浮层，会遮挡列表行操作）
      await page.locator('.ivu-drawer-close:visible').first().click();
      await page.waitForTimeout(400);
      await openEditModelStep(legacyCluster);
      const item = llmFormItem(page, DOC.priceMissActionLabel);
      await expect(
        item.locator('.ivu-select-selected-value').first(),
      ).toHaveText(DOC.priceMissActionOptions.fallback_chat);
    });
  });
});
