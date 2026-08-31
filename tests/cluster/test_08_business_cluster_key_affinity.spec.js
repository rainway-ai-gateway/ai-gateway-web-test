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
 * AI业务集群 - Key 亲和性（RM-BC-87~91）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02d-大模型与校验.md）：
 * - RM-BC-87 Key 亲和性 Card 展示与默认值：Card 位于「Key 路由策略」之后；
 *   默认启用=关闭；关闭时条件字段（空闲超时/Key 惩罚/Redis 前缀）不显示；
 *   提交默认 key_affinity = {enabled:false, ttl:600, redis_prefix:"bfe:ai:key_affinity", penalty_enable:true}。
 * - RM-BC-88 启用开关与条件字段显隐：开启后显示 空闲超时(秒)/Key 惩罚/Redis Key 前缀，
 *   关闭后隐藏。
 * - RM-BC-89 ttl 校验：未启用不校验；启用后 0/负数拦截、正整数通过、默认 600。
 * - RM-BC-90 redis_prefix 校验：启用后空被拦截、非空（含默认）通过、默认 bfe:ai:key_affinity。
 * - RM-BC-91 提交体结构：enabled/penalty_enable 为布尔、ttl 数值、redis_prefix 字符串；
 *   启用时字段值 = UI 设置。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）；转发模型从服务商模型中选择。
 *
 * 文档偏差记录（验收语义保留，实现差异按实际 UI 断言）：
 * - RM-BC-89 预期「1.5 小数被拦截」：InputNumber precision=0 会在输入层将小数
 *   舍入为整数，真实键入无法把小数送入模型；故测试用模型注入 1.5 直接验证
 *   validator 层（validateKeyAffinityTtl 拒绝非整数，提示同上）。
 * - RM-BC-87 文档文案「绑定空闲超时(秒)」实际表单 label 为「空闲超时(秒)」
 *   （i18n gatewayConfig.keyAffinityTtl）。
 *
 * 运行：npx playwright test tests/cluster/test_08_business_cluster_key_affinity.spec.js
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

/**
 * 通过 API 创建服务商（models / keys 可覆盖），并登记到 provider cleanup
 */
async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-集群 Key 亲和性',
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

// 选择所属服务商 + 转发模型（通过下一步/提交前必备）
async function fillProviderAndModels(page, providerName) {
  await utils.selectProvider(page, providerName);
  await utils.selectForwardModels(page, [MODEL_A1]);
}

test.describe('AI业务集群 - RM-BC-87~91 Key 亲和性', () => {
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

  test('RM-BC-87 Key 亲和性 Card 位于 Key 路由策略之后，默认关闭、条件字段隐藏、提交默认结构', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });
    await navigateToModelStep(page, clusterName);

    // 1. Card 存在且位于「Key 路由策略」之后
    const titles = await page
      .locator('.ivu-drawer-body .llm-section-card')
      .allTextContents();
    const keyPolicyIdx = titles.findIndex((t) =>
      t.includes(utils.DOC_BUSINESS_CLUSTER.keyPolicyCard),
    );
    const keyAffinityIdx = titles.findIndex((t) =>
      t.includes(utils.DOC_BUSINESS_CLUSTER.keyAffinityCard),
    );
    expect(keyPolicyIdx).toBeGreaterThanOrEqual(0);
    expect(keyAffinityIdx).toBeGreaterThan(keyPolicyIdx);

    // 2. 默认启用=关闭
    const defaults = await utils.getKeyAffinityValues(page);
    expect(defaults.enabled).toBe(false);
    // 3. 关闭状态下条件字段不显示
    await utils.expectKeyAffinityFieldsVisible(page, false);

    // 4. 提交时默认 key_affinity 结构
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.key_affinity).toEqual({
      enabled: false,
      ttl: 600,
      redis_prefix: utils.DOC_BUSINESS_CLUSTER.defaultRedisPrefix,
      penalty_enable: true,
    });
  });

  test('RM-BC-88 启用开关与条件字段显隐：开启显示 空闲超时/Key 惩罚/Redis 前缀，关闭隐藏', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);

    // 开启 → 条件字段显示，默认值 600 / 开启 / bfe:ai:key_affinity
    await utils.fillKeyAffinityStep(page, { enabled: true });
    await utils.expectKeyAffinityFieldsVisible(page, true);
    const values = await utils.getKeyAffinityValues(page);
    expect(values.enabled).toBe(true);
    expect(values.ttl).toBe('600');
    expect(values.penaltyEnable).toBe(true);
    expect(values.redisPrefix).toBe(
      utils.DOC_BUSINESS_CLUSTER.defaultRedisPrefix,
    );

    // 关闭 → 条件字段隐藏
    await utils.fillKeyAffinityStep(page, { enabled: false });
    await utils.expectKeyAffinityFieldsVisible(page, false);
  });

  test('RM-BC-89 ttl：未启用不校验；启用后 0/负数拦截、正整数通过、默认 600', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    // 先启用：默认 ttl 600（fresh 未注入过，先断言默认值，避免后续注入污染）
    await utils.fillKeyAffinityStep(page, { enabled: true });
    const defaults = await utils.getKeyAffinityValues(page);
    expect(defaults.ttl).toBe('600');

    // 0 / -1 拦截（InputNumber 钳制，模型注入触发 FormItem 校验）
    await utils.setKeyAffinityFieldViaModel(page, 'ttl', 0);
    await utils.expectKeyAffinityError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityTtlInvalidMsg,
    );
    await utils.setKeyAffinityFieldViaModel(page, 'ttl', -1);
    await utils.expectKeyAffinityError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityTtlInvalidMsg,
    );

    // 小数拦截（InputNumber precision=0 输入层舍入，模型注入直达 validator）
    await utils.setKeyAffinityFieldViaModel(page, 'ttl', 1.5);
    await utils.expectKeyAffinityError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityTtlInvalidMsg,
    );

    // 正整数通过
    await utils.setKeyAffinityFieldViaModel(page, 'ttl', 1);
    await utils.expectKeyAffinityErrorHidden(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityTtlInvalidMsg,
    );

    // 关闭后 ttl 不校验（注入 0 不产生错误；条件字段随 v-if 卸载）
    await utils.fillKeyAffinityStep(page, { enabled: false });
    await utils.setKeyAffinityFieldViaModel(page, 'ttl', 0);
    await utils.expectKeyAffinityErrorHidden(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityTtlInvalidMsg,
    );

    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
  });

  test('RM-BC-90 redis_prefix：启用后空拦截、非空通过、默认 bfe:ai:key_affinity', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    // 启用后默认值
    await utils.fillKeyAffinityStep(page, { enabled: true });
    const defaults = await utils.getKeyAffinityValues(page);
    expect(defaults.redisPrefix).toBe(
      utils.DOC_BUSINESS_CLUSTER.defaultRedisPrefix,
    );

    // 清空 → blur 触发校验 → 拦截
    await utils.fillKeyAffinityStep(page, { redisPrefix: '' });
    await utils.expectKeyAffinityError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityRedisPrefixRequiredMsg,
    );

    // 自定义前缀 → 通过
    await utils.fillKeyAffinityStep(page, { redisPrefix: 'my:prefix' });
    await utils.expectKeyAffinityErrorHidden(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityRedisPrefixRequiredMsg,
    );
  });

  test('RM-BC-91 提交体结构：启用并修改后 key_affinity 为 UI 设置值', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
    });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    // 启用 Key 亲和性并修改 ttl / Key 惩罚 / Redis 前缀
    await utils.fillKeyAffinityStep(page, {
      enabled: true,
      ttl: 300,
      penaltyEnable: false,
      redisPrefix: 'my:prefix',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.key_affinity).toEqual({
      enabled: true,
      ttl: 300,
      redis_prefix: 'my:prefix',
      penalty_enable: false,
    });
  });
});
