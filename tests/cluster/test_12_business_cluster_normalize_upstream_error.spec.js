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
 * AI业务集群 - 上游错误归一（RM-BC-110~114）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/）：
 * - RM-BC-110 卡片展示与默认值：Card 位于「Key 亲和性」与「均衡模式配置」之间；
 *   三个 Switch（是否启用/流式归一(SSE)/凭证脱敏）默认 false/false/true；
 *   条件字段（未识别错误体处理/错误响应体读取上限）默认隐藏；
 *   提交体恒含 normalize_upstream_error 默认结构（GatewayConfig.buildData 按默认补齐）。
 * - RM-BC-111 启用开关与条件字段显隐：enabled=true 显示两条件字段，切回隐藏；
 *   流式归一(SSE)/凭证脱敏两 Switch 始终展示。
 * - RM-BC-112 字段校验：unrecognized_action 两选项均可选（passthrough/rewrite_generic）；
 *   max_body_bytes 0（下界）/4194304（上界）合法；-1/4194305/1.5/非数字被拦截，
 *   提示「错误响应体读取上限须为 0-4194304 的整数」（越界值经 Vue 模型注入触发校验，
 *   InputNumber min/max/precision 会钳制直接输入）。
 * - RM-BC-113 复查与提交回显：复查页摘要与第 4 步输入逐项一致；提交体结构
 *   {enabled, stream_enabled, unrecognized_action, max_body_bytes, redact_secrets}；
 *   创建后 GET 读回一致、编辑向导回显一致；关闭启用再提交时 enabled=false，
 *   其余字段按实现保留已填值（休眠保留语义，见 docs/business-cluster/测试问题复盘.md BUG-BC-04）。
 * - RM-BC-114 接口数据与页面展示一致性：API 造数集群为基准，详情/编辑回显/复查三处
 *   展示与 GET 返回逐一一致；未配置集群在编辑向导回显默认态且条件字段隐藏。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 先删集群再删服务商）。
 *
 * 运行：npx playwright test tests/cluster/test_12_business_cluster_normalize_upstream_error.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const DOC = utils.DOC_BUSINESS_CLUSTER;
const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-上游错误归一',
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

async function openModelStep(page, clusterName) {
  await utils.openCreateBusinessClusterDrawer(page);
  await utils.navigateToModelStep(page, clusterName);
}

async function fillProviderAndModels(page, providerName) {
  await utils.selectProvider(page, providerName);
  await utils.selectForwardModels(page, [MODEL_A1]);
}

/** 断言模型步上游错误归一 Card 内无错误提示 */
async function expectNoNormalizeError(page) {
  await expect(
    utils.normalizeUpstreamErrorCard(page).locator('.ivu-form-item-error-tip'),
  ).toHaveCount(0);
}

test.describe('AI业务集群 - RM-BC-110~114 上游错误归一', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    // 先删集群再删服务商：集群仍引用 provider 时删除会 409
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('RM-BC-110 卡片位置、默认值与缺省提交体', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    // provider 须在进入大模型配置步之前创建：所属服务商下拉选项在该步渲染时拉取
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await openModelStep(page, clusterName);

    // 1. Card 位于「Key 亲和性」与「均衡模式配置」之间
    const card = utils.normalizeUpstreamErrorCard(page);
    await expect(card.first()).toBeVisible();
    const titles = await page
      .locator('.ivu-drawer-body .llm-section-card')
      .allTextContents();
    const keyAffinityIdx = titles.findIndex((t) => t.includes(DOC.keyAffinityCard));
    const nueIdx = titles.findIndex((t) => t.includes(DOC.normalizeUpstreamErrorCard));
    const balanceModeIdx = titles.findIndex((t) => t.includes(DOC.balanceModeConfigCard));
    expect(keyAffinityIdx).toBeGreaterThanOrEqual(0);
    expect(nueIdx).toBeGreaterThan(keyAffinityIdx);
    expect(balanceModeIdx).toBeGreaterThan(nueIdx);

    // 2. 三个 Switch 默认值：enabled=false / stream_enabled=false / redact_secrets=true
    const values = await utils.getNormalizeUpstreamErrorValues(page);
    expect(values.enabled).toBe(false);
    expect(values.streamEnabled).toBe(false);
    expect(values.redactSecrets).toBe(true);
    // 3. 条件字段默认隐藏（enabled=false 不渲染）
    expect(values.unrecognizedAction).toBeNull();
    expect(values.maxBodyBytes).toBeNull();

    // 4. 缺省提交：复查页展示默认态，提交体含默认结构
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');

    const reviewValues = await utils.getNormalizeReviewValues(
      page,
      utils.DRAWER_TITLE.createBusinessCluster,
    );
    expect(reviewValues.enabled).toBe('停用');
    expect(reviewValues.streamEnabled).toBe('停用');
    expect(reviewValues.redactSecrets).toBe('启用');
    // enabled=false 时复查页不展示两条件字段
    expect(reviewValues.unrecognizedAction).toBeNull();
    expect(reviewValues.maxBodyBytes).toBeNull();

    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const nue = request.postDataJSON().llm_config.normalize_upstream_error;
    expect(nue).toEqual(DOC.normalizeDefaults);
  });

  test('RM-BC-111 启用开关与条件字段显隐', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await openModelStep(page, clusterName);

    // 1. enabled=false：两条件字段不渲染
    let values = await utils.getNormalizeUpstreamErrorValues(page);
    expect(values.enabled).toBe(false);
    expect(values.unrecognizedAction).toBeNull();
    expect(values.maxBodyBytes).toBeNull();

    // 2. 开启：条件字段出现，默认值 passthrough / 65536
    await utils.fillNormalizeUpstreamError(page, { enabled: true });
    values = await utils.getNormalizeUpstreamErrorValues(page);
    expect(values.enabled).toBe(true);
    expect(values.unrecognizedAction).toBe(DOC.normalizePassthroughLabel);
    expect(values.maxBodyBytes).toBe('65536');

    // 3. 切回关闭：条件字段隐藏
    await utils.fillNormalizeUpstreamError(page, { enabled: false });
    values = await utils.getNormalizeUpstreamErrorValues(page);
    expect(values.enabled).toBe(false);
    expect(values.unrecognizedAction).toBeNull();
    expect(values.maxBodyBytes).toBeNull();

    // 4. 流式归一(SSE)/凭证脱敏两 Switch 全程可见且默认值不变
    expect(values.streamEnabled).toBe(false);
    expect(values.redactSecrets).toBe(true);
  });

  test('RM-BC-112 字段校验（枚举选项与读取上限边界）', async ({ page }) => {
    test.setTimeout(180000);
    const clusterName = utils.generateTestBusinessClusterName();
    // provider 须在进入大模型配置步之前创建：所属服务商下拉选项在该步渲染时拉取
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await openModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);
    await utils.fillNormalizeUpstreamError(page, { enabled: true });

    // 1. unrecognized_action 两选项均可选择并回显
    await utils.fillNormalizeUpstreamError(page, {
      unrecognizedAction: 'rewrite_generic',
    });
    let values = await utils.getNormalizeUpstreamErrorValues(page);
    expect(values.unrecognizedAction).toBe('重写为通用错误');
    await utils.fillNormalizeUpstreamError(page, { unrecognizedAction: 'passthrough' });
    values = await utils.getNormalizeUpstreamErrorValues(page);
    expect(values.unrecognizedAction).toBe(DOC.normalizePassthroughLabel);

    // 2. 越界/非整数被拦截（InputNumber 钳制直接输入，经 Vue 模型注入触发校验）
    for (const invalid of [-1, 4194305, 1.5, 'abc']) {
      await utils.setNormalizeUpstreamErrorFieldViaModel(
        page,
        'max_body_bytes',
        invalid,
      );
      await utils.expectNormalizeUpstreamErrorError(
        page,
        DOC.normalizeMaxBodyBytesInvalidMsg,
      );
      // 校验拦截后停留在「大模型配置」
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '大模型配置');
    }

    // 3. 下界 0（=使用 BFE 默认上限）与上界 4194304 合法
    await utils.fillNormalizeUpstreamError(page, { maxBodyBytes: 0 });
    await expectNoNormalizeError(page);
    await utils.fillNormalizeUpstreamError(page, { maxBodyBytes: 4194304 });
    await expectNoNormalizeError(page);

    // 4. 合法边界可进入复查页
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
  });

  test('RM-BC-113 复查页摘要、提交体与编辑回显一致', async ({ page }) => {
    test.setTimeout(180000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await openModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);
    await utils.fillNormalizeUpstreamError(page, {
      enabled: true,
      streamEnabled: true,
      redactSecrets: false,
      unrecognizedAction: 'rewrite_generic',
      maxBodyBytes: 131072,
    });

    // 1. 复查页摘要与第 4 步输入逐项一致（复查页 unrecognized_action 展示原始枚举值）
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const reviewValues = await utils.getNormalizeReviewValues(
      page,
      utils.DRAWER_TITLE.createBusinessCluster,
    );
    expect(reviewValues.enabled).toBe('启用');
    expect(reviewValues.streamEnabled).toBe('启用');
    expect(reviewValues.redactSecrets).toBe('停用');
    expect(reviewValues.unrecognizedAction).toBe('rewrite_generic');
    expect(reviewValues.maxBodyBytes).toBe('131072');

    // 2. 提交体结构 {enabled, stream_enabled, unrecognized_action, max_body_bytes, redact_secrets}
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const nue = request.postDataJSON().llm_config.normalize_upstream_error;
    expect(nue).toEqual({
      enabled: true,
      stream_enabled: true,
      unrecognized_action: 'rewrite_generic',
      max_body_bytes: 131072,
      redact_secrets: false,
    });

    // 3. 创建成功后 GET 读回一致
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
    const apiData = await utils.getCluster(page, clusterName);
    expect(apiData.llm_config.normalize_upstream_error).toEqual(nue);

    // 4. 编辑向导第 4 步回显与提交值一致
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const editValues = await utils.getNormalizeUpstreamErrorValues(
      page,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(editValues.enabled).toBe(true);
    expect(editValues.streamEnabled).toBe(true);
    expect(editValues.redactSecrets).toBe(false);
    expect(editValues.unrecognizedAction).toBe('重写为通用错误');
    expect(editValues.maxBodyBytes).toBe('131072');

    // 5. 编辑复查页摘要一致
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const editReview = await utils.getNormalizeReviewValues(
      page,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(editReview.enabled).toBe('启用');
    expect(editReview.unrecognizedAction).toBe('rewrite_generic');
    expect(editReview.maxBodyBytes).toBe('131072');

    // 6. 关闭启用再次提交：enabled=false，其余字段按实现保留已填值（休眠保留，
    //    与 02d RM-BC-113 预期 4「提交默认结构」的口径差异见 测试问题复盘 BUG-BC-04）
    await utils.clickWizardPrev(page); // 复查&检查 -> 大模型配置
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.fillNormalizeUpstreamError(
      page,
      { enabled: false },
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.clickWizardNext(page); // 大模型配置 -> 复查&检查
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const patchRequest = await utils.waitForClusterPatchRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const patchNue = patchRequest.postDataJSON().llm_config.normalize_upstream_error;
    expect(patchNue.enabled).toBe(false);
    expect(patchNue.stream_enabled).toBe(true);
    expect(patchNue.unrecognized_action).toBe('rewrite_generic');
    expect(patchNue.max_body_bytes).toBe(131072);
    expect(patchNue.redact_secrets).toBe(false);
  });

  test('RM-BC-114 接口数据与详情/编辑回显/复查三处展示一致', async ({ page }) => {
    test.setTimeout(180000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // API 造数（含 normalize_upstream_error），接口返回为比对基准
    await utils.createCluster(
      page,
      await (async () => ({
        name: clusterName,
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
          normalize_upstream_error: {
            enabled: true,
            stream_enabled: true,
            unrecognized_action: 'rewrite_generic',
            max_body_bytes: 131072,
            redact_secrets: false,
          },
        },
      }))(),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
    const apiData = await utils.getCluster(page, clusterName);
    const nue = apiData.llm_config.normalize_upstream_error;
    expect(nue).toEqual({
      enabled: true,
      stream_enabled: true,
      unrecognized_action: 'rewrite_generic',
      max_body_bytes: 131072,
      redact_secrets: false,
    });

    // 1. 详情页展示与接口一致
    await utils.openBusinessClusterDetail(page, clusterName);
    const detailValues = await utils.getNormalizeReviewValues(
      page,
      utils.DRAWER_TITLE.businessClusterDetail,
    );
    expect(detailValues.enabled).toBe('启用');
    expect(detailValues.streamEnabled).toBe('启用');
    expect(detailValues.redactSecrets).toBe('停用');
    expect(detailValues.unrecognizedAction).toBe('rewrite_generic');
    expect(detailValues.maxBodyBytes).toBe(String(nue.max_body_bytes));
    await utils.closeBusinessClusterDetail(page);

    // 2. 编辑向导第 4 步回显与接口一致
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const editValues = await utils.getNormalizeUpstreamErrorValues(
      page,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(editValues.enabled).toBe(true);
    expect(editValues.streamEnabled).toBe(true);
    expect(editValues.redactSecrets).toBe(false);
    expect(editValues.unrecognizedAction).toBe('重写为通用错误');
    expect(editValues.maxBodyBytes).toBe(String(nue.max_body_bytes));

    // 3. 编辑向导复查页摘要与接口一致
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const editReview = await utils.getNormalizeReviewValues(
      page,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(editReview.enabled).toBe('启用');
    expect(editReview.unrecognizedAction).toBe('rewrite_generic');
    expect(editReview.maxBodyBytes).toBe(String(nue.max_body_bytes));
    await utils.closeBusinessClusterEditDrawer(page);
  });

  test('RM-BC-114 未配置集群回显默认态且条件字段隐藏', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // API 造数不携带 normalize_upstream_error
    await utils.createCluster(page, {
      name: clusterName,
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
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 详情页：接口未返回该对象时展示「-」，返回默认对象时展示默认态，均无报错
    await utils.openBusinessClusterDetail(page, clusterName);
    const detailValues = await utils.getNormalizeReviewValues(
      page,
      utils.DRAWER_TITLE.businessClusterDetail,
    );
    expect(['-', '停用']).toContain(detailValues.enabled);
    await utils.closeBusinessClusterDetail(page);

    // 编辑向导：回显默认态（enabled=false / redact_secrets=true），条件字段隐藏
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const editValues = await utils.getNormalizeUpstreamErrorValues(
      page,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(editValues.enabled).toBe(false);
    expect(editValues.streamEnabled).toBe(false);
    expect(editValues.redactSecrets).toBe(true);
    expect(editValues.unrecognizedAction).toBeNull();
    expect(editValues.maxBodyBytes).toBeNull();
    await utils.closeBusinessClusterEditDrawer(page);
  });
});
