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
 * AI业务集群 - 推理内容补齐协议（RM-BC-126，2026-11-04 api e7fc774）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-3）：
 * - 用例一：默认空选（=关闭）；勾选 openai + anthropic 后复查展示与提交体正确。
 * - 用例二：编辑回读——存储值 ["anthropic"] 的集群回显 anthropic。
 * - 用例三：provider 协议范围联动校验——服务商仅有 openai 时选 anthropic
 *   前端校验拦截（change 触发，切换服务商联动）。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）。
 *
 * 运行：npx playwright test tests/cluster/test_22_business_cluster_ensure_reasoning_content.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resApi = require('../../api/resource-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

const ERC_LABEL = '推理内容补齐协议';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-推理内容补齐',
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

// 大模型配置区内按 label 定位「推理内容补齐协议」表单项
function ercFormItem(page) {
  return page
    .locator('.ivu-drawer-body:visible .ivu-form-item')
    .filter({ hasText: ERC_LABEL })
    .first();
}

// iView Select 多选：勾选指定选项（下拉项点击后下拉保持展开，需 Escape 关闭）
async function selectErcOptions(page, optionTexts) {
  const item = ercFormItem(page);
  await item.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
  for (const text of optionTexts) {
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .filter({ hasText: text })
      .first()
      .click();
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function getSelectedErcTags(page) {
  const item = ercFormItem(page);
  return item
    .locator('.ivu-select-selection .ivu-tag-text, .ivu-select-item-selected')
    .allTextContents();
}

test.describe('AI业务集群 - RM-BC-126 推理内容补齐协议', () => {
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

  test('验证默认空选、双选提交与复查展示', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    // 提交 openai+anthropic 须服务商同时声明两协议（后端强制元素在 provider 协议内）
    const providerName = await createProvider({
      page,
      cleanup: ctx.providerCleanup,
      overrides: { model_protocols: ['openai', 'anthropic'] },
    });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    await test.step('1. 「推理内容补齐协议」渲染且默认空选', async () => {
      const item = ercFormItem(page);
      await expect(item).toBeVisible();
      await expect(item.locator('.ivu-select-selection .ivu-tag')).toHaveCount(0);
      await expect(item.locator('.ivu-select-placeholder')).toBeVisible();
    });

    await test.step('2. 勾选 openai + anthropic：复查展示与提交体', async () => {
      await selectErcOptions(page, ['openai', 'anthropic']);
      const tags = await getSelectedErcTags(page);
      expect(tags.join(',')).toContain('openai');
      expect(tags.join(',')).toContain('anthropic');

      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const ul = page
        .locator('.ivu-drawer-body:visible ul.clearFloat')
        .filter({ has: page.locator('li.title', { hasText: ERC_LABEL }) })
        .first();
      await expect(ul.locator('li.value').first()).toHaveText('openai, anthropic');

      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.ensure_reasoning_content).toEqual([
        'openai',
        'anthropic',
      ]);
    });
  });

  test('验证编辑回读：存储值 anthropic 回显', async ({ page }) => {
    test.setTimeout(300000);
    // 后端强制 ensure_reasoning_content 元素须在 provider model_protocols 内，
    // 故回读 anthropic 的造数服务商须同时声明 openai + anthropic 协议
    const providerName = await createProvider({
      page,
      cleanup: ctx.providerCleanup,
      overrides: { model_protocols: ['openai', 'anthropic'] },
    });
    const name = utils.generateTestBusinessClusterName();
    const { status, body } = await resApi.createClusterWithResponse(page, {
      name,
      llm_config: {
        provider: providerName,
        models: [MODEL_A1],
        ensure_reasoning_content: ['anthropic'],
      },
      balance_mode: 'WRR',
    });
    expect(status, `API 造数集群应成功：${JSON.stringify(body)}`).toBe(200);
    ctx.cleanup.trackBusinessCluster(name);
    await utils.refreshBusinessClusterList(page);

    await utils.ensureBusinessClusterRowVisible(page, name);
    await utils.openEditBusinessClusterDrawer(page, name);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置', utils.DRAWER_TITLE.editBusinessCluster);

    const tags = await getSelectedErcTags(page);
    expect(tags.join(',')).toContain('anthropic');
    expect(tags.join(',')).not.toContain('openai');
  });

  test('验证 provider 协议范围联动校验：仅有 openai 的服务商选 anthropic 被拦截', async ({
    page,
  }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    await test.step('1. 选择 anthropic：校验拦截并提示服务商协议范围', async () => {
      await selectErcOptions(page, ['anthropic']);
      const item = ercFormItem(page);
      await expect(
        item.locator('.ivu-form-item-error-tip'),
        '应提示 anthropic 不在所属服务商协议（openai）内',
      ).toContainText(
        '推理内容补齐协议 anthropic 不在所属服务商协议（openai）内',
        { timeout: 10000 },
      );
    });
  });
});
