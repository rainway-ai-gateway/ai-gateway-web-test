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
 * AI业务集群 - 大模型配置 Provider 联动回归（RM-BC-71~78、81、84）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02d-大模型与校验.md）：
 * - RM-BC-71 所属服务商-必填下拉与分步拉取：控件为 el-select 下拉；展开时选项为
 *   GET /providers/actions/get-provider-names 返回的服务商名；未选时下一步被拦截。
 * - RM-BC-72 切换服务商后转发模型 / Keys 联动：模型剔除、Keys 表重建（原 key 名不存在则清空）。
 * - RM-BC-73 转发模型-多选必填与「全选」：全选快捷操作 + 未选模型被拦截。
 * - RM-BC-74 服务商模型为空：转发模型下拉为空；提交被拦截（复用必填校验）。
 * - RM-BC-75 Keys 非必填与空行过滤：空行不参与校验，提交体 keys 过滤空 name 行。
 * - RM-BC-76 Keys 服务商 Key 下拉与权重：下拉选项为 key 名称、新行权重默认 0、可多行。
 * - RM-BC-77 Keys 权重和 = 100（非空时）：80 被拦截、100 通过。
 * - RM-BC-78 服务商无 keys：Keys 行「服务商 Key」下拉无可用选项（表格不隐藏）。
 * - RM-BC-81 模型重定向：source_model → target_model 表格提交与请求体。
 * - RM-BC-84 提交体结构：llm_config 含 provider/models/keys/key_policy/key_affinity；
 *   不含 instance_pool / provider_type / model_endpoint / model_list / keys[].key。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）。
 *
 * 文档偏差记录（验收语义保留，实现差异按实际 UI 断言）：
 * - RM-BC-74 预期「该服务商暂无可用模型」：实现无该文案，转发模型为空时复用必填校验
 *   「请选择模型」（gatewayConfig.modelsRequired）。
 * - RM-BC-78 预期「Keys 表格隐藏」：原型与实现均始终渲染 keys-table（未做隐藏），
 *   无 keys 时「服务商 Key」下拉无可用选项——按实际行为断言下拉选项数。
 * - RM-BC-71 预期「展开下拉时调用 get-provider-names」：实现为 GatewayConfig mounted
 *   时（进入抽屉即触发）拉取名称列表，展开下拉仅展示选项——断言选项内容与请求均已发生。
 *
 * 运行：npx playwright test tests/cluster/test_06_business_cluster_model.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';
const MODEL_A2 = 'Qwen/Qwen2.5-7B-Instruct';
const MODEL_B1 = 'DeepSeek-R1';
const MODEL_D1 = 'Model-D1';
const KEY_A1 = 'key-a1';
const KEY_A2 = 'key-a2';
const KEY_B1 = 'key-b1';

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
    description: '自动化测试-集群大模型配置联动',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [],
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

test.describe('AI业务集群 - RM-BC-71~78、81、84 大模型配置 Provider 联动', () => {
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

  test('RM-BC-71 所属服务商为必填下拉，选项来自 get-provider-names，未选时下一步被拦截', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // 分步拉取第 1 步：进入抽屉即请求服务商名称列表
    const namesReq = page.waitForResponse(
      (r) =>
        r.url().includes('/providers/actions/get-provider-names') &&
        r.request().method() === 'GET',
      { timeout: 15000 },
    );
    await navigateToModelStep(page, clusterName);
    await namesReq;

    // 1. 控件为下拉（el-select），标签「所属服务商」
    await utils.expectProviderFieldVisible(page);
    // 2. 展开下拉：选项包含全部服务商名
    await utils.expectProviderDropdownOptions(page, [providerName]);
    // 3. 未选择时「下一步」被拦截，提示所属服务商必填
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.expectWizardFormFieldError(
      page,
      utils.DOC_BUSINESS_CLUSTER.providerLabel,
      utils.DOC_BUSINESS_CLUSTER.ownedProviderRequiredMsg,
    );
  });

  test('RM-BC-72 切换服务商后转发模型与 Keys 联动更新（模型剔除 / Keys 表重建）', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_A1, MODEL_A2],
        keys: [
          { name: KEY_A1, key: 'sk-a1' },
          { name: KEY_A2, key: 'sk-a2' },
        ],
      },
    });
    const providerB = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_B1], keys: [{ name: KEY_B1, key: 'sk-b1' }] },
    });

    await navigateToModelStep(page, clusterName);

    // 选择服务商 A：选模型 A1/A2 + 行 0 选 Key key-a1
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1, MODEL_A2]);
    await utils.fillModelKeyRow(page, 0, { name: KEY_A1 });
    await utils.expectSelectedForwardModels(page, [MODEL_A1, MODEL_A2]);

    // 切换服务商 B：转发模型中不属于 B 的模型被剔除
    await utils.selectProvider(page, providerB);
    await utils.expectSelectedForwardModels(page, []);
    // Keys 表重建：原 key-a1 不在 B 中 → name 清空（下拉回到占位）
    const row0 = await utils.getModelKeyRowValues(page, 0);
    expect(row0.name).not.toContain(KEY_A1);
    expect(row0.name).toContain(
      utils.DOC_BUSINESS_CLUSTER.providerKeyPlaceholder,
    );

    // 切回服务商 A：模型 / Key 可重新选择
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.expectSelectedForwardModels(page, [MODEL_A1]);
    await utils.fillModelKeyRow(page, 0, { name: KEY_A1 });
    const row0Back = await utils.getModelKeyRowValues(page, 0);
    expect(row0Back.name).toContain(KEY_A1);
  });

  test('RM-BC-73 转发模型为多选必填，提供「全选」，未选模型时下一步被拦截', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_A1, MODEL_A2] },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerA);

    // 未选任何模型直接下一步 → 拦截，停留在第 4 步
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.expectWizardFormFieldError(
      page,
      utils.DOC_BUSINESS_CLUSTER.forwardModelsLabel,
      utils.DOC_BUSINESS_CLUSTER.modelsRequiredMsg,
    );

    // 提供「全选」：点击后选中该服务商全部模型
    await utils.selectAllForwardModels(page);
    await utils.expectSelectedForwardModels(page, [MODEL_A1, MODEL_A2]);
  });

  test('RM-BC-74 服务商模型为空时转发模型下拉为空且提交被拦截', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerC = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [] },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerC);

    // 1. 转发模型下拉为空（无可选项）
    await utils.expectForwardModelsDropdownEmpty(page, true);
    // 2. 提交被拦截（文档文案「该服务商暂无可用模型」，实际 UI 复用「请选择模型」）
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.expectWizardFormFieldError(
      page,
      utils.DOC_BUSINESS_CLUSTER.forwardModelsLabel,
      utils.DOC_BUSINESS_CLUSTER.modelsRequiredMsg,
    );
  });

  test('RM-BC-75 Keys 非必填：空行不参与校验，提交时过滤空 name 行', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_A1],
        keys: [{ name: KEY_A1, key: 'sk-a1' }],
      },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1]);
    // 默认一行空 Key（name 留空）
    await utils.expectModelKeysRowCount(page, 1);

    // 空行不参与校验 → 可进入复查&检查
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    // 提交：空 name 行被过滤，请求体 keys 为 []
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.llm_config.keys).toEqual([]);
  });

  test('RM-BC-76 Keys 行：服务商 Key 下拉仅名称、可添加多行、新行权重默认 0', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_A1],
        keys: [
          { name: KEY_A1, key: 'sk-a1' },
          { name: KEY_A2, key: 'sk-a2' },
        ],
      },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1]);

    // 1. 行 0「服务商 Key」下拉选项为该服务商 key 名称（不含 key 值明文）
    const options = await utils.getModelKeyRowOptions(page, 0);
    expect(options).toEqual([KEY_A1, KEY_A2]);
    // 2. 新行权重默认 0
    const row0 = await utils.getModelKeyRowValues(page, 0);
    expect(row0.weight).toBe('0');

    // 3. 填写行 0：key-a1 / 50；添加行 1：key-a2 / 50
    await utils.fillModelKeyRow(page, 0, { name: KEY_A1, weight: 50 });
    await utils.addModelKeyRow(page);
    await utils.expectModelKeysRowCount(page, 2);
    const row1 = await utils.getModelKeyRowValues(page, 1);
    expect(row1.weight).toBe('0');
    await utils.fillModelKeyRow(page, 1, { name: KEY_A2, weight: 50 });

    // 4. 两行非空且权重和 = 100 → 可通过
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
  });

  test('RM-BC-77 Keys 权重和须为 100（非空行参与求和）', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_A1],
        keys: [
          { name: KEY_A1, key: 'sk-a1' },
          { name: KEY_A2, key: 'sk-a2' },
        ],
      },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1]);

    // 40 + 40 = 80 → 拦截，提示权重和须为 100
    await utils.fillModelKeyRow(page, 0, { name: KEY_A1, weight: 40 });
    await utils.addModelKeyRow(page);
    await utils.fillModelKeyRow(page, 1, { name: KEY_A2, weight: 40 });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.expectModelKeysError(
      page,
      utils.DOC_BUSINESS_CLUSTER.keysWeightSumMsg,
    );

    // 50 + 50 = 100 → 通过
    await utils.setModelKeyWeightViaModel(page, 0, 50);
    await utils.setModelKeyWeightViaModel(page, 1, 50);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
  });

  test('RM-BC-78 服务商无 keys 时「服务商 Key」下拉无可用选项，切回有 keys 服务商恢复', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerNoKeys = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_D1], keys: [] },
    });
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_A1],
        keys: [{ name: KEY_A1, key: 'sk-a1' }],
      },
    });

    await navigateToModelStep(page, clusterName);

    // 无 keys 服务商：下拉无可用选项
    await utils.selectProvider(page, providerNoKeys);
    await utils.expectProviderKeyOptionsEmpty(page, true);

    // 切到有 keys 服务商：下拉恢复可用选项
    await utils.selectProvider(page, providerA);
    await utils.expectProviderKeyOptionsEmpty(page, false);
  });

  test('RM-BC-81 模型重定向：source_model → target_model 提交体为映射数组', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_A1, MODEL_A2] },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1, MODEL_A2]);
    // 添加一行重定向：源模型 A1 → 目标模型 A2
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

  test('RM-BC-84 提交体结构：llm_config 含新字段，无 instance_pool/provider_type/model_endpoint/model_list/keys[].key', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerA = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_A1],
        keys: [{ name: KEY_A1, key: 'sk-a1' }],
      },
    });

    await navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerA);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.fillModelKeyRow(page, 0, { name: KEY_A1, weight: 100 });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    const llm = body.llm_config;

    // 1. 包含：provider / models / keys / key_policy / key_affinity
    expect(llm.provider).toBe(providerA);
    expect(llm.models).toEqual([MODEL_A1]);
    expect(llm.keys).toEqual([{ name: KEY_A1, weight: 100 }]);
    expect(llm.key_policy).toBeDefined();
    expect(llm.key_affinity).toBeDefined();
    // 2. 不再包含：instance_pool / provider_type / model_endpoint / model_list / keys[].key
    expect(body).not.toHaveProperty('instance_pool');
    expect(llm).not.toHaveProperty('provider_type');
    expect(llm).not.toHaveProperty('model_endpoint');
    expect(llm).not.toHaveProperty('model_list');
    expect(llm.keys[0].key).toBeUndefined();
  });
});
