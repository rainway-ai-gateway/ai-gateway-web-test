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
 * AI业务集群 - Key 路由策略 / key_policy 校验（RM-BC-52~56、79）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02d-大模型与校验.md）：
 * - RM-BC-52 key_policy - strategy 选项：仅 weighted_random，且为默认值。
 * - RM-BC-53 key_policy - max_retries 校验：负数/小数拦截、默认 0、正整数提交携带。
 * - RM-BC-54 key_policy - retry_backoff_initial 校验：默认 500、修改后提交携带。
 * - RM-BC-55 key_policy - retry_backoff_max 校验：max < initial 拦截、默认 5000。
 * - RM-BC-56 LLM 配置界面 Card 分组展示：5 张 Card（含「Key 亲和性」）。
 * - RM-BC-79 Key 路由策略：提交体 key_policy 结构
 *   {strategy, max_retries, retry_backoff_initial, retry_backoff_max}。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）；转发模型从服务商模型中选择。
 *
 * 文档偏差记录（验收语义保留，实现差异按实际 UI 断言）：
 * - RM-BC-43~51（多 Key name/key 明文输入、key 长度校验、${API_KEY} 占位符）：
 *   R7 后 keys 仅提交 {name, weight}，无 key 明文输入，相关用例已随实现删除。
 * - RM-BC-57（多 Key 编辑回显含明文）、RM-BC-60/62/63/64（provider 自由输入/
 *   为空提交/回显）：provider 已改为必填下拉（选项来自 get-provider-names），
 *   相关用例删除；编辑回显归入 test_03。
 * - RM-BC-56 由旧 4 张 Card 更新为 5 张（追加「Key 亲和性」Card）。
 *
 * 运行：npx playwright test tests/cluster/test_07_business_cluster_key_policy.spec.js
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
    description: '自动化测试-集群 key_policy 校验',
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

test.describe('AI业务集群 - RM-BC-52~56、79 Key 路由策略与 key_policy', () => {
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

  test('RM-BC-52 key_policy strategy 选项仅 weighted_random 且为默认值', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);

    await utils.expectKeyPolicyStrategyOptions(page, ['weighted_random']);
    const values = await utils.getKeyPolicyValues(page);
    expect(values.strategy.trim()).toBe('weighted_random');
  });

  test('RM-BC-53 key_policy max_retries：负数/小数拦截、默认 0、正整数提交携带', async ({
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

    // 默认值 0
    const defaults = await utils.getKeyPolicyValues(page);
    expect(defaults.maxRetries).toBe('0');

    // 负数拦截（InputNumber 钳制，模型注入触发 FormItem 校验）
    await utils.setKeyPolicyFieldViaModel(page, 'max_retries', -1);
    await utils.expectModelKeysError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyPolicyMaxRetriesInvalidMsg,
    );

    // 小数拦截（InputNumber precision=0 输入层舍入，模型注入直达 validator）
    await utils.setKeyPolicyFieldViaModel(page, 'max_retries', 1.5);
    await utils.expectModelKeysError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyPolicyMaxRetriesInvalidMsg,
    );

    // 正整数提交携带
    await utils.fillKeyPolicyStep(page, { maxRetries: 3 });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.key_policy.max_retries).toBe(3);
  });

  test('RM-BC-54 key_policy retry_backoff_initial：默认 500、修改后提交携带', async ({
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

    const defaults = await utils.getKeyPolicyValues(page);
    expect(defaults.retryBackoffInitial).toBe('500');

    await utils.fillKeyPolicyStep(page, { retryBackoffInitial: 1000 });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.key_policy.retry_backoff_initial).toBe(1000);
  });

  test('RM-BC-55 key_policy retry_backoff_max：max < initial 拦截、默认 5000', async ({
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

    // 默认值 5000
    const defaults = await utils.getKeyPolicyValues(page);
    expect(defaults.retryBackoffMax).toBe('5000');

    // initial=1000、max=500 → 拦截
    await utils.setKeyPolicyFieldViaModel(page, 'retry_backoff_initial', 1000);
    await utils.setKeyPolicyFieldViaModel(page, 'retry_backoff_max', 500);
    await utils.expectModelKeysError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyPolicyBackoffMaxInvalidMsg,
    );

    // initial=500、max=5000 → 通过并提交携带
    await utils.setKeyPolicyFieldViaModel(page, 'retry_backoff_initial', 500);
    await utils.setKeyPolicyFieldViaModel(page, 'retry_backoff_max', 5000);
    await utils.expectModelKeysErrorHidden(
      page,
      utils.DOC_BUSINESS_CLUSTER.keyPolicyBackoffMaxInvalidMsg,
    );
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.key_policy.retry_backoff_max).toBe(5000);
  });

  test('RM-BC-56 LLM 配置界面 5 张 Card 分组展示（含 Key 亲和性）', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);

    await utils.expectModelCardGrouping(page, [
      utils.DOC_BUSINESS_CLUSTER.modelServiceConfigCard,
      utils.DOC_BUSINESS_CLUSTER.modelRedirectCard,
      utils.DOC_BUSINESS_CLUSTER.serviceAuthKeysCard,
      utils.DOC_BUSINESS_CLUSTER.keyPolicyCard,
      utils.DOC_BUSINESS_CLUSTER.keyAffinityCard,
    ]);
  });

  test('RM-BC-79 Key 路由策略提交体结构 {strategy, max_retries, retry_backoff_initial, retry_backoff_max}', async ({
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

    // 1. strategy 下拉仅 weighted_random（选项文案「加权随机」）
    await utils.expectKeyPolicyStrategyOptions(page, ['weighted_random']);
    // 2. 修改重试参数
    await utils.fillKeyPolicyStep(page, {
      maxRetries: 2,
      retryBackoffInitial: 1000,
      retryBackoffMax: 3000,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    // 3. 提交体 key_policy 结构完整且为修改后的值
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.key_policy).toEqual({
      strategy: 'weighted_random',
      max_retries: 2,
      retry_backoff_initial: 1000,
      retry_backoff_max: 3000,
    });
  });
});
