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
 * AI业务集群 - Key 惩罚时长（RM-BC-127，2026-11-04 api issue #1448）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-3）：
 * - 用例一：Key 惩罚启用时显示 429 惩罚时长（10–600，默认 60）与 401/402/403
 *   惩罚时长（60–1800，默认 300）；改为 120/900 后提交体正确、复查展示。
 * - 用例二：边界 10/600/60/1800 通过；0/负数/越界（5、601、59、1801）被校验拦截
 *   （InputNumber min/max 钳制直接输入，越界值经 Vue 模型注入触发校验）。
 * - 用例三：关闭「Key 惩罚」时两字段隐藏、不触发校验，提交体仍含默认值 60/300。
 * - 用例四：编辑存量集群（无该字段）回显默认 60/300。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）。
 *
 * 运行：npx playwright test tests/cluster/test_23_business_cluster_key_penalty_ttl.spec.js
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
    description: '自动化测试-Key惩罚时长',
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

// 复查页 Key 亲和性卡片内「标签:」行的取值
async function getKeyAffinityReviewValue(page, label) {
  const item = page
    .locator('.ivu-drawer-body:visible .review-item')
    .filter({ has: page.locator('.review-label', { hasText: label }) })
    .first();
  return (await item.locator('.review-value').first().textContent()).trim();
}

test.describe('AI业务集群 - RM-BC-127 Key 惩罚时长', () => {
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

  test('验证默认值 60/300、改值提交与复查展示', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    await test.step('1. Key 亲和性启用后：两惩罚时长默认 60/300 展示', async () => {
      await utils.fillKeyAffinityStep(page, { enabled: true });
      const values = await utils.getKeyAffinityValues(page);
      expect(values.penaltyEnable).toBe(true);
      expect(values.penaltyTtl429).toBe('60');
      expect(values.penaltyTtlAuth).toBe('300');
    });

    await test.step('2. 改为 120/900：复查展示与提交体正确', async () => {
      await utils.fillKeyAffinityStep(page, {
        penaltyTtl429: 120,
        penaltyTtlAuth: 900,
      });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      expect(
        await getKeyAffinityReviewValue(page, DOC.keyAffinityPenaltyTtl429Label),
      ).toBe('120');
      expect(
        await getKeyAffinityReviewValue(page, DOC.keyAffinityPenaltyTtlAuthLabel),
      ).toBe('900');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.key_affinity.penalty_ttl_429).toBe(120);
      expect(body.llm_config.key_affinity.penalty_ttl_auth).toBe(900);
    });
  });

  test('验证边界通过与 0/越界拦截', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);
    await utils.fillKeyAffinityStep(page, { enabled: true });

    await test.step('1. 越界/0 经模型注入触发校验拦截', async () => {
      for (const invalid of [0, 5, 601]) {
        await utils.setKeyAffinityFieldViaModel(page, 'penalty_ttl_429', invalid);
        await utils.expectKeyAffinityError(
          page,
          DOC.keyAffinityPenaltyTtl429InvalidMsg,
        );
      }
      for (const invalid of [0, 59, 1801]) {
        await utils.setKeyAffinityFieldViaModel(page, 'penalty_ttl_auth', invalid);
        await utils.expectKeyAffinityError(
          page,
          DOC.keyAffinityPenaltyTtlAuthInvalidMsg,
        );
      }
    });

    await test.step('2. 边界 10/600/60/1800 通过并提交', async () => {
      await utils.setKeyAffinityFieldViaModel(page, 'penalty_ttl_429', 10);
      await utils.setKeyAffinityFieldViaModel(page, 'penalty_ttl_auth', 60);
      await utils.expectKeyAffinityErrorHidden(
        page,
        DOC.keyAffinityPenaltyTtl429InvalidMsg,
      );
      await utils.fillKeyAffinityStep(page, {
        penaltyTtl429: 600,
        penaltyTtlAuth: 1800,
      });
      await utils.expectKeyAffinityErrorHidden(
        page,
        DOC.keyAffinityPenaltyTtl429InvalidMsg,
      );
      await utils.expectKeyAffinityErrorHidden(
        page,
        DOC.keyAffinityPenaltyTtlAuthInvalidMsg,
      );
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.key_affinity.penalty_ttl_429).toBe(600);
      expect(body.llm_config.key_affinity.penalty_ttl_auth).toBe(1800);
    });
  });

  test('验证关闭 Key 惩罚时字段隐藏、不校验、提交体含默认值', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);
    await utils.fillKeyAffinityStep(page, { enabled: true, penaltyEnable: false });

    await test.step('1. 两惩罚时长输入框不渲染', async () => {
      const card = utils.keyAffinityCard(page);
      await expect(
        card
          .locator('.ivu-form-item')
          .filter({ hasText: DOC.keyAffinityPenaltyTtl429Label }),
      ).toHaveCount(0);
      await expect(
        card
          .locator('.ivu-form-item')
          .filter({ hasText: DOC.keyAffinityPenaltyTtlAuthLabel }),
      ).toHaveCount(0);
    });

    await test.step('2. 提交体仍含默认 60/300', async () => {
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.key_affinity.penalty_enable).toBe(false);
      expect(body.llm_config.key_affinity.penalty_ttl_429).toBe(60);
      expect(body.llm_config.key_affinity.penalty_ttl_auth).toBe(300);
    });
  });

  test('验证编辑回读：存量集群回显默认 60/300', async ({ page }) => {
    test.setTimeout(300000);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    const name = utils.generateTestBusinessClusterName();
    const { status, body } = await resApi.createClusterWithResponse(
      page,
      {
        name,
        llm_config: { provider: providerName, models: [MODEL_A1] },
        balance_mode: 'WRR',
      },
    );
    expect(status, `API 造数集群应成功：${JSON.stringify(body)}`).toBe(200);
    ctx.cleanup.trackBusinessCluster(name);
    await utils.refreshBusinessClusterList(page);

    await utils.ensureBusinessClusterRowVisible(page, name);
    await utils.openEditBusinessClusterDrawer(page, name);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置', utils.DRAWER_TITLE.editBusinessCluster);

    const values = await utils.getKeyAffinityValues(page, utils.DRAWER_TITLE.editBusinessCluster);
    expect(values.penaltyEnable).toBe(true);
    expect(values.penaltyTtl429).toBe('60');
    expect(values.penaltyTtlAuth).toBe('300');
  });
});
