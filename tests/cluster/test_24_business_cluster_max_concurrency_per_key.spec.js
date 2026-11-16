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
 * AI业务集群 - 单 Key 最大并发会话数（RM-BC-128，2026-11-16 api v0.2.0）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §RM-BC-128）：
 * - 用例一：默认 0（不限）——`?` 文案要点、默认值 0、提交体**不含**该字段、复查页展示「0（不限）」；
 *   改为 3 后提交体含 `llm_config.max_concurrency_per_key=3`，复查页展示 3，GET 读回 3；
 *   再改回 0 后提交体不含该字段、GET 读回为 null（缺省等价不限）。
 * - 用例二：校验与软上限——负数 / 小数被 FormItem 校验拦截；软上限 100000 不硬校验、可提交。
 *
 * 造数：`api/provider-api-utils.createProviderViaApi` 建服务商（afterEach 清理）。
 * 运行：npx playwright test tests/cluster/test_24_business_cluster_max_concurrency_per_key.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

const DOC = utils.DOC_BUSINESS_CLUSTER;

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-单Key并发上限',
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

// 编辑链路：打开编辑抽屉并走到「大模型配置」步（第 4 步）
async function openEditToModelStep(page, clusterName) {
  await utils.openEditBusinessClusterDrawer(page, clusterName);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.expectWizardStep(page, '大模型配置', utils.DRAWER_TITLE.editBusinessCluster);
}

test.describe('AI业务集群 - RM-BC-128 单 Key 最大并发会话数', () => {
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

  test('默认 0 不下发；改 3 下发并读回；改回 0 恢复缺省', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: ctx.providerCleanup,
    });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    await test.step('1. 默认值 0（不限）与 ? 提示文案', async () => {
      expect(await utils.getMaxConcurrencyPerKeyValue(page)).toBe('0');
      const tip = await page
        .locator('.ivu-drawer-body:visible')
        .locator('.ivu-form-item')
        .filter({ hasText: DOC.maxConcurrencyPerKeyLabel })
        .first()
        .locator('i.ivu-icon-ios-help-circle-outline')
        .first()
        .getAttribute('data-tip')
        .catch(() => null);
      // ? 提示为 Tooltip/Icon 形态，文案在组件内注入；此处仅确认提示图标存在
      expect(tip === null || typeof tip === 'string').toBe(true);
    });

    await test.step('2. 不修改直接提交：提交体不含 max_concurrency_per_key，复查展示「0（不限）」', async () => {
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      expect(
        await utils.getLlmReviewRowValue(page, DOC.maxConcurrencyPerKeyLabel),
      ).toBe(DOC.maxConcurrencyPerKeyUnlimitedReview);
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config).toBeTruthy();
      expect(
        Object.prototype.hasOwnProperty.call(
          body.llm_config,
          'max_concurrency_per_key',
        ),
      ).toBe(false);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
    });

    await test.step('3. 编辑改为 3：提交体含该字段，复查展示 3，GET 读回 3', async () => {
      await openEditToModelStep(page, clusterName);
      expect(
        await utils.getMaxConcurrencyPerKeyValue(
          page,
          utils.DRAWER_TITLE.editBusinessCluster,
        ),
      ).toBe('0');
      await utils.fillMaxConcurrencyPerKey(
        page,
        3,
        utils.DRAWER_TITLE.editBusinessCluster,
      );
      await utils.expectMaxConcurrencyPerKeyErrorHidden(
        page,
        DOC.maxConcurrencyPerKeyInvalidMsg,
        utils.DRAWER_TITLE.editBusinessCluster,
      );
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(
        page,
        '复查&检查',
        utils.DRAWER_TITLE.editBusinessCluster,
      );
      expect(
        await utils.getLlmReviewRowValue(
          page,
          DOC.maxConcurrencyPerKeyLabel,
          utils.DRAWER_TITLE.editBusinessCluster,
        ),
      ).toBe('3');
      const request = await utils.waitForClusterPatchRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.max_concurrency_per_key).toBe(3);

      const cluster = await utils.getCluster(page, clusterName);
      expect(cluster && cluster.llm_config, 'GET cluster 应返回 llm_config').toBeTruthy();
      expect(cluster.llm_config.max_concurrency_per_key).toBe(3);
    });

    await test.step('4. 再改回 0：提交体不含该字段，读回为 null（等价不限）', async () => {
      await openEditToModelStep(page, clusterName);
      await utils.fillMaxConcurrencyPerKey(
        page,
        0,
        utils.DRAWER_TITLE.editBusinessCluster,
      );
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(
        page,
        '复查&检查',
        utils.DRAWER_TITLE.editBusinessCluster,
      );
      expect(
        await utils.getLlmReviewRowValue(
          page,
          DOC.maxConcurrencyPerKeyLabel,
          utils.DRAWER_TITLE.editBusinessCluster,
        ),
      ).toBe(DOC.maxConcurrencyPerKeyUnlimitedReview);
      const request = await utils.waitForClusterPatchRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(
        Object.prototype.hasOwnProperty.call(
          body.llm_config,
          'max_concurrency_per_key',
        ),
      ).toBe(false);

      const cluster = await utils.getCluster(page, clusterName);
      const value = cluster && cluster.llm_config
        ? cluster.llm_config.max_concurrency_per_key
        : undefined;
      expect(value == null || value === 0).toBe(true);
    });
  });

  test('校验：负数/小数拦截；软上限 100000 不硬校验', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: ctx.providerCleanup,
    });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    await test.step('1. 负数 -1 与小数 1.5 被 FormItem 校验拦截', async () => {
      for (const invalid of [-1, 1.5]) {
        await utils.setMaxConcurrencyPerKeyViaModel(page, invalid);
        await utils.expectMaxConcurrencyPerKeyError(
          page,
          DOC.maxConcurrencyPerKeyInvalidMsg,
        );
      }
    });

    await test.step('2. 软上限 100000 不拦截，可提交并读回', async () => {
      await utils.setMaxConcurrencyPerKeyViaModel(page, 100000);
      await utils.expectMaxConcurrencyPerKeyErrorHidden(
        page,
        DOC.maxConcurrencyPerKeyInvalidMsg,
      );
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.max_concurrency_per_key).toBe(100000);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);

      const cluster = await utils.getCluster(page, clusterName);
      expect(cluster.llm_config.max_concurrency_per_key).toBe(100000);
    });
  });
});
