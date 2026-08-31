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
 * AI业务集群 - 字段校验（RM-BC-39~41、65~68）
 *
 * 5 步向导：基础配置 → 超时和重传 → 被动健康检查 → 大模型配置 → 复查&检查。
 * 大模型配置通过 llm_config.provider 引用服务商（Provider），转发模型 / Keys
 * 均为服务商数据联动（见 test_06）。因此需先 API 造数服务商（afterEach 清理）。
 *
 * 覆盖：
 * - RM-BC-39 集群描述长度校验（257 拦截 / 256 通过）
 * - RM-BC-40 模型映射提交字段（source_model / target_model）
 * - RM-BC-41 健康检查期望状态码范围（0、200 通过；99、600、-1 拦截）
 * - RM-BC-65 match_prefix / strip_prefix 显隐与开关联动
 * - RM-BC-66 match_prefix 必填校验（strip_prefix=true）
 * - RM-BC-67 match_prefix 格式校验（须以 / 结尾）
 * - RM-BC-68 match_prefix / strip_prefix 提交与编辑回显
 *
 * 清理说明（原 test_05 中移除的用例）：
 * - RM-BC-20b~20f、24、25「实例配置」校验：实例池已迁入 Providers，向导无该步骤。
 * - RM-BC-03、44、45 会话保持哈希联动：与 test_02 RM-BC-26 重复。
 * - RM-BC-09 服务鉴权 Key 长度：Keys 改为引用 provider key 的下拉（无自由输入，
 *   无 512 字符限制），由 test_06 RM-BC-75~77 覆盖。
 * - RM-BC-29 大模型必填组合（所属服务商 / 转发模型必填）：由 test_06 RM-BC-71/73 覆盖。
 *
 * 运行：npx playwright test tests/cluster/test_05_business_cluster_field_validation.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const DOC = utils.DOC_BUSINESS_CLUSTER;

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';
const MODEL_A2 = 'Qwen/Qwen2.5-7B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

/** 通过 API 创建服务商并登记到 provider cleanup */
async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-集群字段校验',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_A1, MODEL_A2],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

/**
 * 完整走 5 步向导到「大模型配置」（健康检查留空，可选字段通过）
 */
async function navigateToModelStep(page, clusterName) {
  await utils.openCreateBusinessClusterDrawer(page);
  await utils.fillBasicStep(page, { clusterName, protocol: 'https' });
  await utils.clickWizardNext(page); // 基础配置 -> 超时和重传
  await utils.clickWizardNext(page); // 超时和重传 -> 被动健康检查
  await utils.clickWizardNext(page); // 被动健康检查 -> 大模型配置
  await utils.expectWizardStep(page, '大模型配置');
}

test.describe('AI业务集群管理 - RM-BC-39~41、65~68 字段校验', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await providerCleanup.cleanup(page);
    await cleanup.cleanup(page);
  });

  // RM-BC-39: 集群描述长度校验
  test('RM-BC-39 集群描述长度校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      description: 'a'.repeat(257),
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '基础配置');
    await utils.expectWizardFormFieldError(
      page,
      '集群说明',
      DOC.descriptionLengthErrorMsg,
    );

    await utils.fillBasicStep(page, {
      description: 'a'.repeat(256),
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');
  });

  // RM-BC-40: 模型映射提交字段（source_model / target_model）
  test('RM-BC-40 模型映射提交字段', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1, MODEL_A2]);
    await utils.fillModelMappingRow(page, 0, {
      source: MODEL_A1,
      target: MODEL_A2,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.model_mappings).toEqual([
      { source_model: MODEL_A1, target_model: MODEL_A2 },
    ]);
  });

  // RM-BC-41: 健康检查期望状态码范围
  test('RM-BC-41 健康检查期望状态码范围', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.navigateToHealthStep(page, clusterName);
    const form = utils
      .ivuDrawer(page)
      .form(utils.DRAWER_TITLE.createBusinessCluster);

    // 状态码为 0 或 100-599 时可通过（5 步向导：下一步进入「大模型配置」）
    await form.fillInput('健康检查期望的状态码', '0');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');

    await utils.clickWizardPrev(page);
    await form.fillInput('健康检查期望的状态码', '200');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');

    // 非法状态码应被拦截
    await utils.clickWizardPrev(page);
    for (const code of ['99', '600', '-1']) {
      await form.fillInput('健康检查期望的状态码', code);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '被动健康检查');
      // 有错误提示即可
      const drawer = utils.ivuDrawer(page).active();
      await expect(
        drawer.locator('.ivu-form-item-error-tip').first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  // RM-BC-65: match_prefix / strip_prefix 显隐与开关联动
  test('RM-BC-65 match_prefix/strip_prefix 显隐与开关联动', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1]);

    // 1. 默认：开关关闭、匹配前缀输入框隐藏
    await utils.expectStripPrefixSwitchState(page, false);
    await utils.expectMatchPrefixFieldVisible(page, false);

    // 2. 开启开关 → 输入框显示
    await utils.fillModelStep(page, { stripPrefix: true });
    await utils.expectStripPrefixSwitchState(page, true);
    await utils.expectMatchPrefixFieldVisible(page, true);

    // 3. 填写匹配前缀
    await utils.fillModelStep(page, { matchPrefix: 'openrouter/' });
    const body = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.createBusinessCluster)
      .locator('.ivu-drawer-body');
    const matchInput = body
      .locator('.ivu-form-item')
      .filter({ hasText: DOC.matchPrefixLabel })
      .locator('input')
      .first();
    await expect(matchInput).toHaveValue('openrouter/');

    // 4. 关闭开关 → 输入框消失
    await utils.fillModelStep(page, { stripPrefix: false });
    await utils.expectStripPrefixSwitchState(page, false);
    await utils.expectMatchPrefixFieldVisible(page, false);

    // 5. 重新开启 → 输入框出现且值被自动清空（watch 清空逻辑）
    await utils.fillModelStep(page, { stripPrefix: true });
    await utils.expectStripPrefixSwitchState(page, true);
    await utils.expectMatchPrefixFieldVisible(page, true);
    await expect(matchInput).toHaveValue('');
  });

  // RM-BC-66: match_prefix 必填校验（strip_prefix=true）
  test('RM-BC-66 match_prefix 必填校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.fillModelStep(page, { stripPrefix: true });

    // 开启裁剪前缀但匹配前缀留空 → 拦截
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.expectWizardFormFieldError(
      page,
      DOC.matchPrefixLabel,
      DOC.matchPrefixRequiredMsg,
    );

    // 填写合法前缀后可继续前进
    await utils.fillModelStep(page, { matchPrefix: 'openrouter/' });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
  });

  // RM-BC-67: match_prefix 格式校验（须以 / 结尾）
  test('RM-BC-67 match_prefix 格式校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.fillModelStep(page, {
      stripPrefix: true,
      matchPrefix: 'openrouter',
    });

    // 未以 / 结尾 → 拦截
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.expectWizardFormFieldError(
      page,
      DOC.matchPrefixLabel,
      DOC.matchPrefixMustEndWithSlashMsg,
    );

    // 补上 / 后可继续前进
    await utils.fillModelStep(page, { matchPrefix: 'openrouter/' });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
  });

  // RM-BC-68: match_prefix / strip_prefix 提交与编辑回显
  test('RM-BC-68 match_prefix/strip_prefix 提交与编辑回显', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.fillModelStep(page, {
      stripPrefix: true,
      matchPrefix: 'openrouter/',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    // 提交请求体含 match_prefix / strip_prefix
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.match_prefix).toBe('openrouter/');
    expect(body.llm_config.strip_prefix).toBe(true);
    await utils.expectCreateBusinessClusterDrawerHidden(page);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // GET 读回一致
    const apiData = await utils.getCluster(page, clusterName);
    expect(apiData.llm_config.match_prefix).toBe('openrouter/');
    expect(apiData.llm_config.strip_prefix).toBe(true);

    // 编辑向导第 4 步回显：开关开启、输入框可见且值正确
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.expectWizardStep(
      page,
      '基础配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.clickWizardNext(page); // 1 -> 2
    await utils.clickWizardNext(page); // 2 -> 3
    await utils.clickWizardNext(page); // 3 -> 4
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectStripPrefixSwitchState(
      page,
      true,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectMatchPrefixFieldVisible(
      page,
      true,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const editBody = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.editBusinessCluster)
      .locator('.ivu-drawer-body');
    const editMatchInput = editBody
      .locator('.ivu-form-item')
      .filter({ hasText: DOC.matchPrefixLabel })
      .locator('input')
      .first();
    await expect(editMatchInput).toHaveValue('openrouter/');

    await utils.closeBusinessClusterEditDrawer(page);
  });
});
