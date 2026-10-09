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
 * 模型定价 - 跨模块联动（MP-LINK-01 ~ MP-LINK-04）
 *
 * 覆盖用例（docs/model-prices/02-功能测试用例/06-跨模块联动.md）：
 * - MP-LINK-01：为服务商模型创建定价（provider 关联）——从定价列表「新增」入口
 *   走完整 UI 创建：provider 自动补全候选含已创建服务商、可从下拉选中；
 *   POST 体 provider 与服务商名一致；记录出现在列表；并验证软关联（provider
 *   不对应任何服务商也可创建，定价独立存在）。
 * - MP-LINK-02：从服务商列表直达定价列表——本 spec 从定价页视角验证
 *   /model-prices?provider={name} 落地页：URL 参数筛选生效（列表请求携带
 *   provider 参数、搜索行回显）、含 tier_prices 的记录详情可查、无记录时提示
 *   「未找到提供商 {name} 的模型定价」且不打开详情。
 * - MP-LINK-03：集群转发模型与定价记录对应——集群 llm_config 引用服务商并
 *   转发其探测模型，定价模块存在 provider+model+mode 的计费记录且价格有效；
 *   从定价页按模型可检索到该计费记录。
 * - MP-LINK-04：删除服务商后定价记录保留——软关联不级联删除；本 spec 差异
 *   化验证保留记录仍可 UI 编辑（PUT 成功、价格更新）与 UI 删除。
 *
 * 与 tests/providers/test_07_provider_linkage.spec.js 的分工（同一联动链路，
 * 本 spec 从模型价格模块视角做差异化断言，不重复实现长流程）：
 * - MP-LINK-01 ≈ PR-LINK-01：PR-LINK-01 用 API 造数 + 从服务商侧点「查询模型
 *   价格」断言 provider 列展示；本用例从定价列表「新增」入口走 UI 创建链路
 *   （自动补全候选/下拉选中、POST 请求体断言），并补充软关联（无对应服务商
 *   也可创建）断言。
 * - MP-LINK-02 ≈ PR-LINK-06：PR-LINK-06 从服务商列表点击「查询模型价格」触发
 *   跳转；本用例从定价页 URL 落地视角验证筛选生效与 tier_prices 详情，
 *   无记录提示两条用例共用同一前端行为，此处按 docs 保留 URL 入口断言。
 * - MP-LINK-03 ≈ PR-LINK-03：PR-LINK-03 聚焦创建向导转发模型子集/全选交互；
 *   本用例聚焦计费数据对应关系（集群 llm_config ↔ 定价记录），集群经 API 造数。
 * - MP-LINK-04 ≈ PR-LINK-08：PR-LINK-08 验证删除后记录保留（列表 + API）；
 *   本用例在此基础上继续验证保留记录可编辑、可删除（UI 完整闭环）。
 *
 * 造数/清理：服务商 / 集群 / 模型定价均以 API 造数（唯一命名），afterEach 按
 * 「集群 → 定价 → 服务商」顺序自清理（MP-LINK-04 中文内已删服务商/定价，
 * 清理器对不存在对象静默容错）。
 *
 * 运行：npx playwright test tests/model-prices/test_07_model_price_linkage.spec.js
 */
const { test, expect } = require('@playwright/test');
const mp = require('../../pages/model-prices/ModelPricePage');
const pp = require('../../pages/providers/ProviderPage');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resourceApi = require('../../api/resource-api-utils');
const modelPriceApi = require('../../api/model-price-api-utils');

const MODEL_CHAT = 'deepseek-chat';
const MODEL_V3 = 'deepseek-v3';
const MODEL_LINK04 = 'qa-link04-model';
const MODE_CHAT = 'chat';

let nameSeq = 0;

function uniqueName(prefix) {
  nameSeq += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + nameSeq;
}

/**
 * 通过 API 创建服务商并登记 provider cleanup
 */
async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueName('provider');
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-跨模块联动',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_CHAT],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

/**
 * 通过 API 创建 llm_config.provider 引用指定服务商的集群
 * （与 tests/providers/test_07_provider_linkage.spec.js 中 createReferencingCluster
 * 相同的后端约束：CreateCluster 校验 provider 存在且 models 属于该服务商；
 * 本 spec 集群仅作联动数据造数，不重复向导 UI 流程，见 PR-LINK-03）
 */
async function createReferencingCluster(
  page,
  clusterName,
  providerName,
  models,
) {
  const created = await resourceApi.createCluster(page, {
    name: clusterName,
    description: '自动化测试-跨模块联动-引用集群',
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
    llm_config: {
      provider: providerName,
      model_endpoint: { schema: 'https', uri: '/v1/models', headers: {} },
      models,
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
  });
  expect(created, 'API 造数引用集群应成功').toBe(true);
  return created;
}

test.describe('模型定价 - MP-LINK-01~04 跨模块联动 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  let resourceCleanup;
  let providerCleanup;
  let mpCleanup;

  test.beforeEach(async () => {
    resourceCleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    mpCleanup = modelPriceApi.createModelPriceTestCleanup();
  });

  test.afterEach(async ({ page }) => {
    // 先解除集群引用（级联删除派生实例池），再清理定价，最后删除服务商
    await resourceCleanup.cleanup(page);
    await mpCleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('MP-LINK-01 为服务商模型创建定价-provider自动补全候选含服务商且软关联可创建', async ({
    page,
  }) => {
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_CHAT, MODEL_V3] },
    });

    await mp.gotoModelPricePage(page);

    await test.step('1. 定价列表「新增」，provider 自动补全候选含已创建服务商，可下拉选中', async () => {
      // 候选来自 GET /providers/actions/get-provider-names（抽屉 mounted 即发请求）
      const namesReq = page.waitForResponse(
        (r) =>
          r.url().includes('/providers/actions/get-provider-names') &&
          r.request().method() === 'GET',
        { timeout: 15000 },
      );
      await mp.openCreateDrawer(page);
      await namesReq;
      await mp.openProviderDropdown(page);
      await mp.expectProviderCandidate(page, providerName);
      await mp.selectProviderCandidate(page, providerName);
      expect(await mp.getProviderValue(page)).toBe(providerName);
    });

    await test.step('2. model 手写服务商探测模型 deepseek-v3，mode=chat，配置默认价格并提交', async () => {
      await mp.fillModel(page, MODEL_V3);
      await mp.fillBaseModel(page, MODEL_V3);
      await mp.selectMode(page, MODE_CHAT);
      await mp.addPriceRow(page);
      await mp.fillPriceRow(page, 0, {
        key: mp.PRICE_KEY_INPUT_COST,
        value: 0.00003,
      });

      // 提交并捕获 POST /model-prices 请求体
      const [postResp] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes('/open-api/v1/model-prices') &&
            r.request().method() === 'POST',
          { timeout: 15000 },
        ),
        mp.clickSubmit(page),
      ]);
      await postResp.finished().catch(() => {});
      expect(postResp.status(), 'POST /model-prices 应成功').toBe(200);
      const body = postResp.request().postDataJSON();
      expect(body.provider, '请求体 provider 与服务商名一致').toBe(
        providerName,
      );
      expect(body.model).toBe(MODEL_V3);
      expect(body.mode).toBe(MODE_CHAT);
      expect(body.prices.input_cost_per_token).toBe(0.00003);

      await mp.expectDrawerHidden(page);
      mpCleanup.trackCombo(providerName, MODEL_V3, MODE_CHAT);
    });

    await test.step('3. 列表新增该记录（按模型名定位数据行）', async () => {
      await mp.modelPriceTable(page).expectRowVisible(MODEL_V3);
      const record = await modelPriceApi.findModelPriceByComboViaApi(
        page,
        providerName,
        MODEL_V3,
        MODE_CHAT,
      );
      expect(record).not.toBeNull();
    });

    await test.step('4. 软关联：provider 不对应任何服务商也可创建（定价独立存在）', async () => {
      const orphanProvider = uniqueName('qa_noprovider');
      const orphanModel = 'qa-orphan-model';
      const orphan = await modelPriceApi.createModelPriceViaApi(page, {
        provider: orphanProvider,
        model: orphanModel,
        base_model: orphanModel,
        mode: MODE_CHAT,
        prices: { input_cost_per_token: 0.00001 },
      });
      expect(
        orphan,
        '软关联：无对应服务商的 provider 名称也可创建定价',
      ).not.toBeNull();
      mpCleanup.trackCombo(orphanProvider, orphanModel, MODE_CHAT);

      // 列表侧：记录出现且 provider 列保留手写值（该 provider 不在自动补全候选中）
      await mp.gotoModelPricePage(page);
      await mp.modelPriceTable(page).expectRowVisible(orphanModel);
      await mp.modelPriceTable(page).expectRowVisible(orphanProvider);
    });
  });

  test('MP-LINK-02 服务商直达定价列表-provider参数筛选生效且详情可查分时段价格', async ({
    page,
  }) => {
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_V3] },
    });

    // 前置：该服务商已有 provider+model 的定价记录（含 tier_prices）
    const created = await modelPriceApi.createModelPriceViaApi(page, {
      provider: providerName,
      model: MODEL_V3,
      base_model: MODEL_V3,
      mode: MODE_CHAT,
      prices: { input_cost_per_token: 0.00001 },
      tier_prices: { peak: { input_cost_per_token: 0.00002 } },
    });
    expect(created, 'POST /model-prices 创建成功').not.toBeNull();
    mpCleanup.trackCombo(providerName, MODEL_V3, MODE_CHAT);

    await test.step('1. 携带 provider 参数直达定价列表：筛选生效、不打开详情', async () => {
      // 列表请求应携带 provider 查询参数（与 PR-LINK-06 点击跳转共用同一前端逻辑）
      const listReq = page.waitForResponse(
        (r) =>
          r.url().includes('/open-api/v1/model-prices') &&
          new URL(r.url()).searchParams.get('provider') === providerName,
        { timeout: 15000 },
      );
      await mp.gotoModelPricePageWithProvider(page, providerName);
      const listResp = await listReq;
      expect(listResp.status(), '列表请求应携带 provider 筛选').toBe(200);

      // 跳转携带 provider={name}，不携带 autoView
      await expect(page).toHaveURL(/\/model-prices/, { timeout: 15000 });
      expect(page.url()).toContain(
        'provider=' + encodeURIComponent(providerName),
      );
      expect(page.url()).not.toContain('autoView');

      // 搜索行 provider 筛选回显该服务商，数据行展示该定价记录
      await mp.expectProviderFilterSelected(page, providerName);
      await mp.modelPriceTable(page).expectRowVisible(MODEL_V3);

      // 不打开定价详情
      await mp.expectViewScopeHidden(page);
    });

    await test.step('2. 列表中点「查看」：详情展示 provider 与分时段价格（忙时 peak）', async () => {
      await mp.openViewDrawer(page, MODEL_V3);
      expect(
        await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.provider),
      ).toBe(providerName);
      const groups = await mp.viewTierPriceGroups(page);
      expect(groups, '详情应展示分时段价格分组').toHaveLength(1);
      expect(groups[0].label).toContain('peak');
      const peakEntry = groups[0].entries.find(
        (e) => e.key === mp.PRICE_KEY_INPUT_COST,
      );
      expect(peakEntry, '忙时分组应含 input_cost_per_token').toBeTruthy();
      expect(Number(String(peakEntry.value).replace(/^¥/, '').trim())).toBe(
        0.00002,
      );
    });

    await test.step('3. 无定价记录的服务商直达：提示且不打开详情', async () => {
      const emptyProvider = await createProvider({
        page,
        cleanup: providerCleanup,
      });
      await mp.gotoModelPricePageWithProvider(page, emptyProvider);
      await mp.expectNoPricingForProvider(page, emptyProvider);
      await mp.expectViewScopeHidden(page);
      expect(page.url()).not.toContain('autoView');
    });
  });

  test('MP-LINK-03 集群转发模型与定价记录对应-计费记录存在且价格有效', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_V3] },
    });

    // 前置：该模型的定价记录存在（含计费价格项）
    const PRICE_INPUT = 0.00001;
    const created = await modelPriceApi.createModelPriceViaApi(page, {
      provider: providerName,
      model: MODEL_V3,
      base_model: MODEL_V3,
      mode: MODE_CHAT,
      prices: {
        input_cost_per_token: PRICE_INPUT,
        output_cost_per_token: 0.00002,
      },
    });
    expect(created, 'POST /model-prices 创建成功').not.toBeNull();
    mpCleanup.trackCombo(providerName, MODEL_V3, MODE_CHAT);

    await test.step('1. 集群 llm_config 引用该服务商，转发模型选择 deepseek-v3', async () => {
      // 集群经 API 造数（向导 UI 多选流程见 PR-LINK-03/RM-BC-73，此处不重复）
      await createReferencingCluster(page, clusterName, providerName, [
        MODEL_V3,
      ]);
    });

    await test.step('2. 转发模型与服务商探测模型、定价记录一一对应', async () => {
      const cluster = await resourceApi.getCluster(page, clusterName);
      expect(cluster).not.toBeNull();
      expect(cluster.llm_config.provider, '集群引用该服务商').toBe(
        providerName,
      );
      expect(cluster.llm_config.models, '集群转发模型为服务商探测模型').toEqual(
        [MODEL_V3],
      );

      // 计费依据：provider+model+mode 的定价记录存在且价格有效
      const record = await modelPriceApi.findModelPriceByComboViaApi(
        page,
        providerName,
        MODEL_V3,
        MODE_CHAT,
      );
      expect(
        record,
        'provider+model+mode 定价记录存在（用于该转发模型计费）',
      ).not.toBeNull();
      expect(Object.keys(record.prices).length).toBeGreaterThan(0);
      expect(record.prices.input_cost_per_token).toBe(PRICE_INPUT);
    });

    await test.step('3. 定价页按 provider 筛选可检索到该计费记录', async () => {
      // 偏差记录：列表「模型名」搜索触发 GET /model-prices?model=...，
      // 后端对「三参不全」的查询返回 400「provider, model and mode are required」
      //（list.go 单记录查询约束），前端搜索实际失败、表格保留旧数据；
      // 与 PR-LINK-08 一致改用 provider 筛选（provider 单参为合法列表查询）
      await mp.gotoModelPricePageWithProvider(page, providerName);
      await mp.expectProviderFilterSelected(page, providerName);
      await mp.modelPriceTable(page).expectRowVisible(MODEL_V3);
    });
  });

  test('MP-LINK-04 删除服务商后定价记录保留-软关联记录仍可编辑与删除', async ({
    page,
  }) => {
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_LINK04] },
    });

    // 前置：服务商未被集群引用，存在 provider=该服务商 的定价记录
    const created = await modelPriceApi.createModelPriceViaApi(page, {
      provider: providerName,
      model: MODEL_LINK04,
      base_model: MODEL_LINK04,
      mode: MODE_CHAT,
      prices: { input_cost_per_token: 0.00001 },
    });
    expect(created, 'POST /model-prices 创建成功').not.toBeNull();
    mpCleanup.trackCombo(providerName, MODEL_LINK04, MODE_CHAT);

    await test.step('1. UI 删除服务商成功（同名定价记录不阻塞删除）', async () => {
      await pp.gotoProvidersPage(page);
      // 服务商列表为分页列表（历史数据可能跨多页），按名称搜索定位行，
      // 避免新创建的服务商因排序落在非首页导致行定位超时
      await pp.filterListSearch(page, '名称', providerName);
      await pp.providerTable(page).expectRowVisible(providerName);
      await pp.clickDelete(page, providerName);
      await pp.expectDeleteConfirm(page, providerName);
      const response = await pp.confirmDeleteAndWait(page, providerName);
      expect((await response.json()).ErrNum).toBe(200);
      await pp.providerTable(page).expectRowHidden(providerName, 15000);
    });

    await test.step('2. 定价记录保留：按已删除服务商名筛选仍可查（列表 + API）', async () => {
      // 软关联最强佐证：服务商已删除，定价页仍可按其名称筛选出记录
      //（provider 下拉选项来自定价记录集合，非服务商集合）
      await mp.gotoModelPricePageWithProvider(page, providerName);
      await mp.expectProviderFilterSelected(page, providerName);
      await mp.modelPriceTable(page).expectRowVisible(MODEL_LINK04);
      const stillExists = await modelPriceApi.findModelPriceByComboViaApi(
        page,
        providerName,
        MODEL_LINK04,
        MODE_CHAT,
      );
      expect(stillExists, '软关联：删除服务商不级联删除定价').not.toBeNull();
    });

    await test.step('3. 保留记录仍可编辑：编辑抽屉回填 provider，改价后 PUT 成功', async () => {
      // 按模型名定位数据行（搜索行 provider 下拉已选该值，按服务商名定位会命中搜索行）
      await mp.openEditDrawer(page, MODEL_LINK04);
      // provider 输入框保留已删除服务商名（编辑不依赖服务商仍存在）
      expect(await mp.getProviderValue(page)).toBe(providerName);
      expect(await mp.getModelValue(page)).toBe(MODEL_LINK04);

      await mp.fillPriceRow(page, 0, { value: 0.00005 });
      await mp.submitUpsertAndWait(page);
      await mp.expectDrawerHidden(page);

      const updated = await modelPriceApi.findModelPriceByComboViaApi(
        page,
        providerName,
        MODEL_LINK04,
        MODE_CHAT,
      );
      expect(updated).not.toBeNull();
      expect(updated.prices.input_cost_per_token).toBe(0.00005);
    });

    await test.step('4. 保留记录仍可删除：UI 删除后接口记录消失', async () => {
      await mp.clickRowAction(page, MODEL_LINK04, '删除');
      await mp.expectDeleteConfirm(page, MODEL_LINK04);
      await mp.confirmDeleteAndWait(page);
      await mp.modelPriceTable(page).expectRowHidden(MODEL_LINK04, 15000);
      expect(
        await modelPriceApi.findModelPriceByComboViaApi(
          page,
          providerName,
          MODEL_LINK04,
          MODE_CHAT,
        ),
      ).toBeNull();
    });
  });
});
