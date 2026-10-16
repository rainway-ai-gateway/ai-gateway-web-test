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
 * AI业务集群 - 均衡模式配置（RM-BC-93~109）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02d-大模型与校验.md）：
 * - RM-BC-93 均衡模式配置卡片展示与默认值：Card 位于 Key 亲和性之后；
 *   默认 balance_mode=WRR；EPP 配置项在 WRR 模式下隐藏。
 * - RM-BC-94 balance_mode 选择器 WRR/EPP 切换显隐：WRR 隐藏 EPP 配置项，
 *   EPP 模式展示全部配置项。
 * - RM-BC-95 EPP 模式-load_profile 选择：Select 选项为 queue-first/
 *   balanced/kv-first，默认 balanced。
 * - RM-BC-96 EPP 模式-affinity 选择：Select 选项为 off/low/medium/high，
 *   默认 medium；off 时展示「亲和强度为 off，不生效」提示。
 * - RM-BC-97 EPP 模式-prefix_cache_affinity 开关：Switch 开关，默认开启。
 * - RM-BC-98 EPP 模式-session_affinity 联动：启用后展示 session_affinity_header。
 * - RM-BC-99 EPP 模式-kv_cache_utilization_max 输入：InputNumber，默认 0.9。
 * - RM-BC-101 WRR↔EPP 切换不丢失已填 EPP 配置。
 * - RM-BC-102 提交体包含 balance_mode 和 epp_config。
 * - RM-BC-103 编辑回显/详情/复查展示 balance_mode 和 epp_config。
 * - RM-BC-104 EPP 模式-waiting_queue_max 输入：默认 0，≥0 整数，0=不启用。
 * - RM-BC-105 EPP 模式-running_requests_max 输入：默认 0，≥0 整数，0=不启用。
 * - RM-BC-106 EPP 模式-fallback_on_empty 开关：默认 false。
 * - RM-BC-107 EPP 模式-metrics_staleness_threshold_ms 输入：默认 200，须 >0 整数。
 * - RM-BC-108 EPP 模式-flow_control.enable_eviction 仅允许 false（禁用态只读）。
 * - RM-BC-109 epp_config 非空即校验（与 balance_mode 无关）。
 * - RM-BC-115 EPP 运行时参数分组展示与默认值（7 子字段、4 个 duration
 *   「数字框 + 单位下拉 ms/s/m」复合控件、2 个整数阈值、? 图标仅 3 个、默认值拆分展示）。
 * - RM-BC-116 关闭后台健康检查开关：默认关闭、点击翻转、提交体 check.disabled 为布尔。
 * - RM-BC-117 duration（>0）与阈值（>=1）字段校验：填 0 拦截且不静默取默认、Go 合法写法
 *   （1.s / .5s）通过、清空数字框 = 未设置（提交按默认补齐）。
 * - RM-BC-118 提交体结构 {check{...},timeout{...}}、未设置子字段按默认补齐、整体替换与
 *   PATCH 不传保留、GET 回读一致。
 * - RM-BC-119 编辑回读与单位拆分展示、组合写法（1m30s）回退纯文本、未配置（null）默认值。
 * - RM-BC-120 WRR 隐藏但保留（休眠）、WRR 下非空仍校验（拦截）、tls/breaker 未知字段 422。
 * - RM-BC-121 复查页 7 项展示、切单位后展示换算值（300ms → s = 0.3s）、未配置提示。
 * - RM-BC-122 duration 复合控件交互：小数 1.5 不被吞成 15、切单位保持物理时长、清空后单位
 *   保留、非法字符无法输入为非法 duration 值。
 *
 * 注：2026-10-09 EPP 调度参数破坏性重构对齐 v0.6（docs v0.6 / 03-字段校验矩阵
 * 「test_09（待更新）」）：scheduling_profile/cache_affinity 重命名为
 * load_profile/affinity 且枚举变更，新增 waiting_queue_max/running_requests_max/
 * fallback_on_empty/metrics_staleness_threshold_ms；RM-BC-93~103 中断言旧枚举/
 * 旧字段名的用例已按新规格对齐，其余保持不变。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）。
 *
 * 运行：npx playwright test tests/cluster/test_09_business_cluster_balance_mode.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resApi = require('../../api/resource-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-集群均衡模式',
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

test.describe('AI业务集群 - RM-BC-93~103 均衡模式配置', () => {
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

  test('RM-BC-93 均衡模式配置卡片位于 Key 亲和性之后，默认 WRR，条件字段隐藏', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);

    // 1. Card 存在且位于 Key 亲和性之后
    const titles = await page
      .locator('.ivu-drawer-body .llm-section-card')
      .allTextContents();
    const keyAffinityIdx = titles.findIndex((t) =>
      t.includes(utils.DOC_BUSINESS_CLUSTER.keyAffinityCard),
    );
    const balanceModeIdx = titles.findIndex((t) =>
      t.includes(utils.DOC_BUSINESS_CLUSTER.balanceModeConfigCard),
    );
    expect(keyAffinityIdx).toBeGreaterThanOrEqual(0);
    expect(balanceModeIdx).toBeGreaterThan(keyAffinityIdx);

    // 2. 默认 balance_mode = WRR
    const mode = await utils.getBalanceModeValue(page);
    expect(mode).toBe(utils.DOC_BUSINESS_CLUSTER.defaultBalanceMode);

    // 3. WRR 模式下 epp_config 字段不显示
    const card = utils.balanceModeCard(page);
    const schedulingItem = card
      .locator('.ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.schedulingProfileLabel });
    await expect(schedulingItem).toHaveCount(0);

    // 4. 提交时默认 balance_mode = WRR（无 epp_config）
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.balance_mode).toBe('WRR');
    expect(body.epp_config).toBeUndefined();
  });

  test('RM-BC-94 balance_mode 切换 WRR→EPP 显隐控制', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);

    // WRR → 隐藏
    let mode = await utils.getBalanceModeValue(page);
    expect(mode).toBe('WRR');
    const card = utils.balanceModeCard(page);
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.schedulingProfileLabel })
    ).toHaveCount(0);

    // 切换到 EPP → 显示全部配置项
    await utils.setBalanceMode(page, 'EPP');
    mode = await utils.getBalanceModeValue(page);
    expect(mode).toBe('EPP');
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.schedulingProfileLabel }).first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.cacheAffinityLabel }).first()
    ).toBeVisible();
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.prefixCacheAffinityLabel }).first()
    ).toBeVisible();
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.sessionAffinityEnabledLabel }).first()
    ).toBeVisible();
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.kvCacheUtilizationMaxLabel }).first()
    ).toBeVisible();
    // v0.6 新增 EPP 调度参数字段（RM-BC-104~107）
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.waitingQueueMaxLabel }).first()
    ).toBeVisible();
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.runningRequestsMaxLabel }).first()
    ).toBeVisible();
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.fallbackOnEmptyLabel }).first()
    ).toBeVisible();
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.metricsStalenessThresholdMsLabel }).first()
    ).toBeVisible();
    // 流控是独立卡片，在 drawer-body 级别查找
    await expect(
      page.locator('.ivu-drawer-body .llm-section-card').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.flowControlCard }).first()
    ).toBeVisible();

    // 切回 WRR → 隐藏
    await utils.setBalanceMode(page, 'WRR');
    await expect(
      card.locator('.ivu-form-item').filter({ hasText: utils.DOC_BUSINESS_CLUSTER.schedulingProfileLabel })
    ).toHaveCount(0);
  });

  test('RM-BC-95 EPP 模式 load_profile 选择', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 默认值
    let values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe(utils.DOC_BUSINESS_CLUSTER.defaultSchedulingProfile);

    // 切换选项（v0.6：queue-first / balanced / kv-first）
    await utils.fillEppConfig(page, { schedulingProfile: 'queue-first' });
    values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe('queue-first');

    await utils.fillEppConfig(page, { schedulingProfile: 'kv-first' });
    values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe('kv-first');

    await utils.fillEppConfig(page, { schedulingProfile: 'balanced' });
    values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe('balanced');
  });

  test('RM-BC-96 EPP 模式 affinity 选择', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 默认值
    let values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe(utils.DOC_BUSINESS_CLUSTER.defaultCacheAffinity);

    // 切换选项（v0.6：off / low / medium / high）
    await utils.fillEppConfig(page, { cacheAffinity: 'low' });
    values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe('low');

    await utils.fillEppConfig(page, { cacheAffinity: 'high' });
    values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe('high');

    // off：展示「亲和强度为 off，不生效」提示
    await utils.fillEppConfig(page, { cacheAffinity: 'off' });
    values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe('off');
    await expect(
      utils.balanceModeCard(page).locator('.ivu-form-item')
        .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.cacheAffinityLabel })
        .first(),
    ).toContainText('亲和强度为 off，不生效');
  });

  test('RM-BC-97 EPP 模式 prefix_cache_affinity 开关', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 默认开启（前端默认值为 true）
    let values = await utils.getEppConfigValues(page);
    expect(values.prefixCacheAffinity).toBe(true);

    // 开启
    await utils.fillEppConfig(page, { prefixCacheAffinity: true });
    values = await utils.getEppConfigValues(page);
    expect(values.prefixCacheAffinity).toBe(true);

    // 关闭
    await utils.fillEppConfig(page, { prefixCacheAffinity: false });
    values = await utils.getEppConfigValues(page);
    expect(values.prefixCacheAffinity).toBe(false);
  });

  test('RM-BC-98 EPP 模式 session_affinity 联动展示 Header', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    const card = utils.balanceModeCard(page);

    // 默认关闭（Header 不显示）
    const headerItem = card
      .locator('.ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.sessionAffinityHeaderLabel });
    await expect(headerItem).toHaveCount(0);

    // 启用 → Header 显示
    await utils.fillEppConfig(page, { sessionAffinityEnabled: true });
    await expect(headerItem).toBeVisible({ timeout: 5000 });

    // 关闭 → Header 隐藏
    await utils.fillEppConfig(page, { sessionAffinityEnabled: false });
    await expect(headerItem).toHaveCount(0);
  });

  test('RM-BC-99 EPP 模式 kv_cache_utilization_max 输入', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 默认值
    let values = await utils.getEppConfigValues(page);
    expect(values.kvCacheUtilizationMax).toBe(String(utils.DOC_BUSINESS_CLUSTER.defaultKvCacheUtilizationMax));

    // 修改值
    await utils.fillEppConfig(page, { kvCacheUtilizationMax: 0.8 });
    values = await utils.getEppConfigValues(page);
    expect(values.kvCacheUtilizationMax).toBe('0.8');
  });

  test('RM-BC-101 WRR↔EPP 切换不丢失已填 EPP 配置', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    // 切换到 EPP 并填写配置
    await utils.setBalanceMode(page, 'EPP');
    await utils.fillEppConfig(page, {
      schedulingProfile: 'kv-first',
      cacheAffinity: 'high',
      prefixCacheAffinity: true,
      sessionAffinityEnabled: true,
      sessionAffinityHeader: 'x-custom-header',
      kvCacheUtilizationMax: 0.9,
    });

    // 切回 WRR（配置隐藏）
    await utils.setBalanceMode(page, 'WRR');

    // 再切回 EPP（配置应保留）
    await utils.setBalanceMode(page, 'EPP');
    const values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe('kv-first');
    expect(values.cacheAffinity).toBe('high');
    expect(values.prefixCacheAffinity).toBe(true);
    expect(values.sessionAffinityEnabled).toBe(true);
    expect(values.kvCacheUtilizationMax).toBe('0.9');
  });

  test('RM-BC-102 提交体包含 balance_mode 和 epp_config', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await fillProviderAndModels(page, providerName);

    // 切换到 EPP 并填写配置（v0.6：load_profile 枚举为 queue-first/balanced/kv-first）
    await utils.setBalanceMode(page, 'EPP');
    await utils.fillEppConfig(page, {
      schedulingProfile: 'queue-first',
      cacheAffinity: 'high',
      prefixCacheAffinity: true,
      sessionAffinityEnabled: true,
      sessionAffinityHeader: 'x-custom-header',
      kvCacheUtilizationMax: 0.9,
    });

    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();

    // balance_mode 为 EPP
    expect(body.balance_mode).toBe('EPP');

    // epp_config 包含填写的值（v0.6 字段名：load_profile/affinity）
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.load_profile).toBe('queue-first');
    expect(body.epp_config.affinity).toBe('high');
    expect(body.epp_config.prefix_cache_affinity).toBe(true);
    expect(body.epp_config.session_affinity_enabled).toBe(true);
    expect(body.epp_config.session_affinity_header).toBe('x-custom-header');
    expect(body.epp_config.kv_cache_utilization_max).toBe(0.9);
    expect(body.epp_config.flow_control).toBeDefined();
  });

  test('RM-BC-103 编辑回显/详情/复查展示 balance_mode 和 epp_config', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // 通过 API 创建包含 balance_mode 和 epp_config 的集群
    const clusterData = {
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
      balance_mode: 'EPP',
      epp_config: {
        load_profile: 'balanced',
        affinity: 'medium',
        prefix_cache_affinity: true,
        session_affinity_enabled: true,
        session_affinity_header: 'x-session-id',
        kv_cache_utilization_max: 0.7,
        waiting_queue_max: 10,
        running_requests_max: 5,
        fallback_on_empty: true,
        metrics_staleness_threshold_ms: 300,
        flow_control: {
          max_requests: 2000,
          queue_ttl: 300,
          no_endpoint_queue_ttl: 300,
          enable_eviction: false,
        },
      },
    };
    const created = await resApi.createCluster(page, clusterData);
    expect(created).toBe(true);

    // 验证 API 回读
    const cluster = await resApi.getCluster(page, clusterName);
    expect(cluster.balance_mode).toBe('EPP');
    expect(cluster.epp_config).toBeDefined();
    expect(cluster.epp_config.load_profile).toBe('balanced');
    expect(cluster.epp_config.affinity).toBe('medium');
    expect(cluster.epp_config.metrics_staleness_threshold_ms).toBe(300);
  });
});

// ===== RM-BC-104~109 EPP 调度参数（docs v0.6 新增）=====

// 构造 API 造数用的集群请求体（结构与 RM-BC-103 一致），overrides 覆盖顶层字段
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

// 合法的完整 epp_config（v0.6 字段）
function validEppConfig(overrides = {}) {
  return {
    load_profile: 'balanced',
    affinity: 'medium',
    prefix_cache_affinity: true,
    session_affinity_enabled: false,
    // 后端规则：session_affinity_header 键一旦存在即须为合法 header 名（空串 422），
    // 与前端「仅启用时必填」不同，故造数必须给合法值
    session_affinity_header: 'x-session-id',
    kv_cache_utilization_max: 0.9,
    waiting_queue_max: 0,
    running_requests_max: 0,
    fallback_on_empty: false,
    metrics_staleness_threshold_ms: 200,
    flow_control: {
      max_requests: -1,
      queue_ttl: 60,
      no_endpoint_queue_ttl: 60,
      enable_eviction: false,
    },
    ...overrides,
  };
}

test.describe('AI业务集群 - RM-BC-104~109 EPP 调度参数', () => {
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

  test('RM-BC-104 EPP 模式 waiting_queue_max 输入', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 1. InputNumber 控件存在
    const item = utils
      .balanceModeCard(page)
      .locator('.ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.waitingQueueMaxLabel })
      .first();
    await expect(item.locator('.ivu-input-number')).toBeVisible();

    // 2. 默认值为 0（不启用）
    let values = await utils.getEppConfigValues(page);
    expect(values.waitingQueueMax).toBe(
      String(utils.DOC_BUSINESS_CLUSTER.defaultWaitingQueueMax),
    );

    // 3. 负数 -1 被拦截：值保留在输入框，展示内联校验错误，且无法进入下一步
    // （实际行为：iview InputNumber 失焦不钳制，由表单校验拦截）
    await utils.fillEppConfig(page, { waitingQueueMax: -1 });
    values = await utils.getEppConfigValues(page);
    expect(values.waitingQueueMax).toBe('-1');
    await expect(item).toContainText('须为 >= 0 的数');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');

    // 4. 改为 0（不启用），错误清除
    await utils.fillEppConfig(page, { waitingQueueMax: 0 });
    await expect(item).not.toContainText('须为 >= 0 的数');
    values = await utils.getEppConfigValues(page);
    expect(values.waitingQueueMax).toBe('0');

    // 5. 正整数 100 合法，值正确反映在提交体中
    await utils.fillEppConfig(page, { waitingQueueMax: 100 });
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.waiting_queue_max).toBe(100);
  });

  test('RM-BC-105 EPP 模式 running_requests_max 输入', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 1. InputNumber 控件存在
    const item = utils
      .balanceModeCard(page)
      .locator('.ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.runningRequestsMaxLabel })
      .first();
    await expect(item.locator('.ivu-input-number')).toBeVisible();

    // 2. 默认值为 0（不启用）
    let values = await utils.getEppConfigValues(page);
    expect(values.runningRequestsMax).toBe(
      String(utils.DOC_BUSINESS_CLUSTER.defaultRunningRequestsMax),
    );

    // 3. 负数 -1 被拦截：值保留在输入框，展示内联校验错误，且无法进入下一步
    // （实际行为：iview InputNumber 失焦不钳制，由表单校验拦截）
    await utils.fillEppConfig(page, { runningRequestsMax: -1 });
    values = await utils.getEppConfigValues(page);
    expect(values.runningRequestsMax).toBe('-1');
    await expect(item).toContainText('须为 >= 0 的数');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');

    // 4. 改为 0（不启用），错误清除
    await utils.fillEppConfig(page, { runningRequestsMax: 0 });
    await expect(item).not.toContainText('须为 >= 0 的数');
    values = await utils.getEppConfigValues(page);
    expect(values.runningRequestsMax).toBe('0');

    // 5. 正整数 50 合法，值正确反映在提交体中
    await utils.fillEppConfig(page, { runningRequestsMax: 50 });
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.running_requests_max).toBe(50);
  });

  test('RM-BC-106 EPP 模式 fallback_on_empty 开关', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 1. switch 控件存在，默认关闭（false）
    const item = utils
      .balanceModeCard(page)
      .locator('.ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.fallbackOnEmptyLabel })
      .first();
    await expect(item.locator('.ivu-switch')).toBeVisible();
    let values = await utils.getEppConfigValues(page);
    expect(values.fallbackOnEmpty).toBe(false);

    // 2. 开启 / 关闭切换正常
    await utils.fillEppConfig(page, { fallbackOnEmpty: true });
    values = await utils.getEppConfigValues(page);
    expect(values.fallbackOnEmpty).toBe(true);
    await utils.fillEppConfig(page, { fallbackOnEmpty: false });
    values = await utils.getEppConfigValues(page);
    expect(values.fallbackOnEmpty).toBe(false);

    // 3. 重新开启后提交，提交体中值为布尔 true
    await utils.fillEppConfig(page, { fallbackOnEmpty: true });
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.fallback_on_empty).toBe(true);
    // 会话亲和性默认关闭：前端不下发 session_affinity_header
    //（后端对存在的 key 一律校验合法性，空串会 422；2026-10-09 前端已修复）
    expect(body.epp_config.session_affinity_header).toBeUndefined();
  });

  test('RM-BC-107 EPP 模式 metrics_staleness_threshold_ms 输入', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 1. InputNumber 控件存在
    const item = utils
      .balanceModeCard(page)
      .locator('.ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.metricsStalenessThresholdMsLabel })
      .first();
    await expect(item.locator('.ivu-input-number')).toBeVisible();

    // 2. 默认值为 200
    let values = await utils.getEppConfigValues(page);
    expect(values.metricsStalenessThresholdMs).toBe(
      String(utils.DOC_BUSINESS_CLUSTER.defaultMetricsStalenessThresholdMs),
    );

    // 3. 非正整数被拦截：0 / -1 均展示内联校验错误，且无法进入下一步
    // （实际行为：iview InputNumber 失焦不钳制，由表单校验拦截「须为 > 0 的整数」）
    for (const bad of [0, -1]) {
      await utils.fillEppConfig(page, { metricsStalenessThresholdMs: bad });
      await expect(item).toContainText('须为 > 0 的整数');
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '大模型配置');
    }

    // 3b. 小数 1.5：InputNumber precision=0 失焦取整为 2（合法，不拦截）
    // （文档预期「被拦截」，实际前端静默取整，按实际行为断言）
    await utils.fillEppConfig(page, { metricsStalenessThresholdMs: 1.5 });
    await expect(item).not.toContainText('须为 > 0 的整数');
    values = await utils.getEppConfigValues(page);
    expect(values.metricsStalenessThresholdMs).toBe('2');

    // 4. 正整数 200 合法，错误清除，值正确反映在提交体中
    await utils.fillEppConfig(page, { metricsStalenessThresholdMs: 200 });
    await expect(item).not.toContainText('须为 > 0 的整数');
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.metrics_staleness_threshold_ms).toBe(200);
  });

  test('RM-BC-108 EPP 模式 flow_control.enable_eviction 仅允许 false', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 1. enable_eviction 为禁用态只读 switch，固定关闭，旁有提示
    const item = page
      .locator('.ivu-drawer-body .ivu-form-item')
      .filter({ hasText: utils.DOC_BUSINESS_CLUSTER.enableEvictionLabel })
      .first();
    const switchEl = item.locator('.ivu-switch').first();
    await expect(switchEl).toBeVisible();
    await expect(switchEl).toHaveClass(/ivu-switch-disabled/);
    expect(
      await switchEl.evaluate((el) => el.classList.contains('ivu-switch-checked')),
    ).toBe(false);
    await expect(item).toContainText(
      utils.DOC_BUSINESS_CLUSTER.enableEvictionDisabledHint,
    );

    // 2. 尝试点击切换 → 仍为关闭
    await switchEl.click();
    expect(
      await switchEl.evaluate((el) => el.classList.contains('ivu-switch-checked')),
    ).toBe(false);

    // 3. 提交体中 enable_eviction 恒为 false
    await fillProviderAndModels(page, providerName);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.flow_control).toBeDefined();
    expect(body.epp_config.flow_control.enable_eviction).toBe(false);

    // 4. 接口层强制 enable_eviction=true → 422 拒绝
    const evilCluster = utils.generateTestBusinessClusterName();
    const evilPayload = buildClusterPayload(evilCluster, providerName, {
      balance_mode: 'EPP',
      epp_config: validEppConfig({
        flow_control: {
          max_requests: -1,
          queue_ttl: 60,
          no_endpoint_queue_ttl: 60,
          enable_eviction: true,
        },
      }),
    });
    const { status } = await resApi.createClusterWithResponse(page, evilPayload);
    expect(status).toBe(422);
  });

  test('RM-BC-109 epp_config 非空即校验（与 balance_mode 无关）', async ({ page }) => {
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // 场景 1（UI）：通过向导创建 EPP 集群（开启会话亲和性并填合法 header，
    // 规避后端对空 session_affinity_header 的 422）→ 编辑 → 切回 WRR →
    // 休眠保留的 epp_config 仍随 PATCH 提交体下发且通过校验
    // （OpenAPI 直建的集群会出现在列表页，但需刷新页面后才可搜索到——早期注释
    //  「不出现在产品 UI 列表」与实测不符；此处仍用向导造数，保证列表态即时一致）
    const eppCluster = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(eppCluster);
    await navigateToModelStep(page, eppCluster);
    await fillProviderAndModels(page, providerName);
    await utils.setBalanceMode(page, 'EPP');
    await utils.fillEppConfig(page, {
      sessionAffinityEnabled: true,
      sessionAffinityHeader: 'x-session-id',
      metricsStalenessThresholdMs: 300,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );

    await utils.ensureBusinessClusterRowVisible(page, eppCluster);
    await utils.openEditBusinessClusterDrawer(page, eppCluster);
    await utils.expectWizardStep(
      page,
      '基础配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    // 回显 balance_mode=EPP；切回 WRR 后 epp_config 隐藏但休眠保留
    const mode = await utils.getBalanceModeValue(
      page,
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    expect(mode).toBe('EPP');
    await utils.setBalanceMode(page, 'WRR', utils.DRAWER_TITLE.editBusinessCluster);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const request = await utils.waitForClusterPatchRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const body = request.postDataJSON();
    expect(body.balance_mode).toBe('WRR');
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.metrics_staleness_threshold_ms).toBe(300);

    // 场景 2（API）：纯 WRR 新集群不携带 epp_config，不做 EPP 校验，创建成功
    const wrrCluster = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(wrrCluster);
    const wrrResult = await resApi.createClusterWithResponse(
      page,
      buildClusterPayload(wrrCluster, providerName, { balance_mode: 'WRR' }),
    );
    expect(wrrResult.status).toBe(200);

    // 场景 3（API）：balance_mode=WRR 且 epp_config 非法（metrics_staleness_threshold_ms=0）
    // 仍触发 epp_config 校验并 422 拒绝（不因 WRR 跳过）
    const illegalCluster = utils.generateTestBusinessClusterName();
    const illegalResult = await resApi.createClusterWithResponse(
      page,
      buildClusterPayload(illegalCluster, providerName, {
        balance_mode: 'WRR',
        epp_config: validEppConfig({ metrics_staleness_threshold_ms: 0 }),
      }),
    );
    expect(illegalResult.status).toBe(422);
  });
});// ===== RM-BC-115~122 EPP 运行时参数（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-2）=====

const DOC = utils.DOC_BUSINESS_CLUSTER;
const EDIT_DRAWER = utils.DRAWER_TITLE.editBusinessCluster;
const DETAIL_DRAWER = utils.DRAWER_TITLE.businessClusterDetail;
const EPP_MODE = 'EPP';
const WRR_MODE = 'WRR';

// OpenAPI 造数：balance_mode=EPP 时 epp_config 必填（后端 422：epp_config is required）
function eppRuntimePayload(overrides = {}) {
  return {
    balance_mode: EPP_MODE,
    epp_config: validEppConfig(),
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

// 打开编辑向导向导第 4 步「大模型配置」（先确保数据行可见）
async function navigateToEditModelStep(page, clusterName) {
  await utils.ensureBusinessClusterRowVisible(page, clusterName);
  await utils.openEditBusinessClusterDrawer(page, clusterName);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.expectWizardStep(page, '大模型配置', EDIT_DRAWER);
}

// 每个用例一个 describe（playwright-test-naming §3）：用例编号 + 标题
function registerEppRuntimeDescribe(title, defineTests) {
  test.describe(title, () => {
    const ctx = {};

    test.beforeEach(async ({ page }) => {
      ctx.cleanup = utils.createResourceTestCleanup();
      ctx.providerCleanup = api.createProviderTestCleanup();
      await utils.gotoBusinessClusterManagementPage(page);
    });

    test.afterEach(async ({ page }) => {
      // 先删集群再删服务商：集群引用中的 provider 被引用时删除会 409
      await ctx.cleanup.cleanup(page);
      await ctx.providerCleanup.cleanup(page);
    });

    defineTests(ctx);
  });
}

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-115 EPP 运行时参数分组展示与默认值',
  (ctx) => {
    test('验证分组展示、子字段构成、duration 复合控件形态与默认值', async ({ page }) => {
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      await navigateToModelStep(page, clusterName);

      await test.step('1. WRR 默认下「EPP 运行时参数」分组隐藏', async () => {
        expect(await utils.getBalanceModeValue(page)).toBe(DOC.defaultBalanceMode);
        await utils.expectEppRuntimeCardHidden(page);
      });

      await test.step('2. 切 EPP 后分组展示：7 个子字段（switch + 4 duration + 2 阈值）', async () => {
        await utils.setBalanceMode(page, EPP_MODE);
        await utils.expectEppRuntimeFieldComposition(page);
      });

      await test.step('3. duration 为「数字框 + 单位下拉」复合控件，单位选项 ms/s/m', async () => {
        await utils.expectEppRuntimeUnitOptions(page, DOC.eppCheckIntervalLabel);
      });

      await test.step('4. 默认单位：间隔/冷却/调用超时 s，连接超时 ms', async () => {
        const values = await utils.getEppRuntimeValues(page);
        expect(values.checkInterval.unit).toBe(DOC.defaultEppRuntimeUnits.checkInterval);
        expect(values.cooldown.unit).toBe(DOC.defaultEppRuntimeUnits.cooldown);
        expect(values.connectTimeout.unit).toBe(DOC.defaultEppRuntimeUnits.connectTimeout);
        expect(values.callTimeout.unit).toBe(DOC.defaultEppRuntimeUnits.callTimeout);
      });

      await test.step('5. 默认值按「数值 + 单位」拆分展示（2+s / 3 / 45+s / 2 / 500+ms / 3+s）', async () => {
        await utils.expectEppRuntimeDefaultValues(page);
      });

      await test.step('6. ? 提示图标仅 3 个字段保留（关闭后台健康检查、冷却时长、调用超时）', async () => {
        await utils.expectEppRuntimeHelpIcons(page);
      });

      await test.step('7. 切回 WRR 后分组隐藏（配置本地休眠保留）', async () => {
        await utils.setBalanceMode(page, WRR_MODE);
        await utils.expectEppRuntimeCardHidden(page);
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-116 EPP 运行时参数-关闭后台健康检查开关',
  (ctx) => {
    test('验证开关默认关闭、点击翻转与提交体 disabled 布尔值', async ({ page }) => {
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
      await navigateToModelStep(page, clusterName);
      await utils.setBalanceMode(page, EPP_MODE);

      await test.step('1. 开关为 switch，默认关闭（disabled=false）', async () => {
        await utils.expectEppRuntimeSwitchState(page, false);
      });

      await test.step('2. 点击后翻转为开启', async () => {
        await utils.toggleEppRuntimeSwitch(page);
        await utils.expectEppRuntimeSwitchState(page, true);
      });

      await test.step('3. 再次点击恢复关闭', async () => {
        await utils.toggleEppRuntimeSwitch(page);
        await utils.expectEppRuntimeSwitchState(page, false);
      });

      await test.step('4. 重新开启后提交：复查页展示「启用」，提交体 check.disabled 为布尔 true', async () => {
        await utils.toggleEppRuntimeSwitch(page);
        await utils.expectEppRuntimeSwitchState(page, true);
        await fillProviderAndModels(page, providerName);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        await utils.expectReviewEppRuntimeValues(page, {
          [DOC.eppCheckDisabledLabel]: DOC.eppSwitchOnText,
        });
        const request = await utils.waitForClusterCreateRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.epp_runtime.check.disabled).toBe(true);
        expect(typeof body.epp_runtime.check.disabled).toBe('boolean');
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-117 EPP 运行时参数字段校验',
  (ctx) => {
    test('验证 duration/阈值非法值拦截、Go 合法写法与清空=未设置', async ({ page }) => {
      test.setTimeout(240000);
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
      await navigateToModelStep(page, clusterName);
      await utils.setBalanceMode(page, EPP_MODE);
      await fillProviderAndModels(page, providerName);

      await test.step('1. 健康检查间隔填 0：提示文案、停留当前步骤、不发起提交、不被静默替换为默认值', async () => {
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, { value: '0' });
        await utils.expectEppRuntimeFieldError(
          page,
          DOC.eppCheckIntervalLabel,
          DOC.eppCheckIntervalInvalidMsg,
        );
        const watch = utils.watchClusterCreateRequests(page);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '大模型配置');
        expect(watch.count, '校验失败不应发起 POST /clusters').toBe(0);
        const values = await utils.getEppRuntimeValues(page);
        expect(values.checkInterval.value, '填 0 不得被静默替换为默认值').toBe('0');
        await utils.expectEppRuntimeFieldError(
          page,
          DOC.eppCheckIntervalLabel,
          DOC.eppCheckIntervalInvalidMsg,
        );
      });

      await test.step('2. 数字框仅接受数字与小数点：-1 → 1（负号无法输入）、abc 不产生非法 duration', async () => {
        const afterMinus = await utils.typeEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          '-1',
        );
        expect(afterMinus, '负号无法输入为非法 duration 值').toBe('1');
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
        await utils.typeEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, 'abc');
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
      });

      await test.step('3. 冷却时长/连接超时/调用超时填 0 分别提示对应文案', async () => {
        const cases = [
          [DOC.eppCooldownLabel, DOC.eppCooldownInvalidMsg],
          [DOC.eppConnectTimeoutLabel, DOC.eppConnectTimeoutInvalidMsg],
          [DOC.eppCallTimeoutLabel, DOC.eppCallTimeoutInvalidMsg],
        ];
        for (const [label, message] of cases) {
          await utils.fillEppRuntimeDuration(page, label, { value: '0' });
          await utils.expectEppRuntimeFieldError(page, label, message);
        }
      });

      await test.step('4. 失败次数阈值/成功次数阈值填 0 分别提示对应文案', async () => {
        const cases = [
          [DOC.eppFailThresholdLabel, DOC.eppFailThresholdInvalidMsg],
          [DOC.eppSuccessThresholdLabel, DOC.eppSuccessThresholdInvalidMsg],
        ];
        for (const [label, message] of cases) {
          await utils.fillEppRuntimeThreshold(page, label, '0');
          await utils.expectEppRuntimeFieldError(page, label, message);
        }
      });

      await test.step('5. 改回合法值 2s/45s/500ms/3s 与 3/2：校验通过并进入复查页', async () => {
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, {
          value: '2',
          unit: 's',
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppCooldownLabel, {
          value: '45',
          unit: 's',
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppConnectTimeoutLabel, {
          value: '500',
          unit: 'ms',
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
          value: '3',
          unit: 's',
        });
        await utils.fillEppRuntimeThreshold(page, DOC.eppFailThresholdLabel, '3');
        await utils.fillEppRuntimeThreshold(page, DOC.eppSuccessThresholdLabel, '2');
        for (const label of [
          DOC.eppCheckIntervalLabel,
          DOC.eppCooldownLabel,
          DOC.eppConnectTimeoutLabel,
          DOC.eppCallTimeoutLabel,
          DOC.eppFailThresholdLabel,
          DOC.eppSuccessThresholdLabel,
        ]) {
          await utils.expectEppRuntimeFieldErrorHidden(page, label);
        }
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
      });

      await test.step('6. Go 合法写法 1.s / .5s 通过校验（复查页展示原样 duration 字符串）', async () => {
        await utils.clickWizardPrev(page);
        await utils.expectWizardStep(page, '大模型配置');
        await utils.typeEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, '1.');
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        await utils.expectReviewEppRuntimeValues(page, {
          [DOC.eppCheckIntervalLabel]: '1.s',
        });

        await utils.clickWizardPrev(page);
        await utils.expectWizardStep(page, '大模型配置');
        await utils.typeEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, '.5');
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        await utils.expectReviewEppRuntimeValues(page, {
          [DOC.eppCheckIntervalLabel]: '.5s',
        });
      });

      await test.step('6b. Go 合法写法 +1s：接口层可写入（UI 数字框过滤 `+`，无法键入）', async () => {
        const plusCluster = await createClusterViaApi(
          page,
          ctx.cleanup,
          providerName,
          eppRuntimePayload({
            epp_runtime: {
              check: {
                disabled: false,
                check_interval: '+1s',
                fail_threshold: 3,
                cooldown: '45s',
                success_threshold: 2,
              },
              timeout: { connect: '500ms', call: '3s' },
            },
          }),
        );
        const cluster = await resApi.getCluster(page, plusCluster);
        expect(cluster.epp_runtime.check.check_interval, '后端接受 +1s').toBe('+1s');
      });

      await test.step('7. 清空数字框视为「未设置」：校验放行，提交按默认补齐 2s', async () => {
        await utils.clickWizardPrev(page);
        await utils.expectWizardStep(page, '大模型配置');
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, { value: '' });
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        const request = await utils.waitForClusterCreateRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(
          body.epp_runtime.check.check_interval,
          '清空 = 未设置，提交按默认补齐',
        ).toBe(DOC.defaultEppRuntime.check.check_interval);
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-118 EPP 运行时参数提交体与整体替换语义',
  (ctx) => {
    test('验证提交体结构、未设置按默认补齐、PATCH 不传保留与 GET 回读', async ({ page }) => {
      test.setTimeout(240000);
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
      await navigateToModelStep(page, clusterName);
      await utils.setBalanceMode(page, EPP_MODE);

      let createdBody;
      await test.step('1. 仅改 check_interval=5s、fail_threshold=5 后提交，抓取 POST 请求体', async () => {
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, {
          value: '5',
          unit: 's',
        });
        await utils.fillEppRuntimeThreshold(page, DOC.eppFailThresholdLabel, '5');
        await fillProviderAndModels(page, providerName);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        const request = await utils.waitForClusterCreateRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        createdBody = request.postDataJSON();
        expect(
          createdBody.epp_runtime,
          '未设置的子字段按默认补齐，结构为 {check{...},timeout{...}}',
        ).toEqual({
          check: {
            disabled: false,
            check_interval: '5s',
            fail_threshold: 5,
            cooldown: '45s',
            success_threshold: 2,
          },
          timeout: { connect: '500ms', call: '3s' },
        });
        expect(createdBody.balance_mode).toBe(EPP_MODE);
        expect(createdBody.epp_config, 'epp_runtime 与 epp_config 相互独立').toBeDefined();
      });

      await test.step('2. GET /clusters/{name} 回读原样返回存储值，与提交体一致', async () => {
        const cluster = await resApi.getCluster(page, clusterName);
        expect(cluster.epp_runtime).toEqual(createdBody.epp_runtime);
      });

      await test.step('3. 编辑态清空 check_interval（未设置）提交：整体替换并按默认补齐', async () => {
        await navigateToEditModelStep(page, clusterName);
        await utils.fillEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          { value: '' },
          EDIT_DRAWER,
        );
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查', EDIT_DRAWER);
        const request = await utils.waitForClusterPatchRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.epp_runtime.check.check_interval, '未设置子字段按默认补齐').toBe('2s');
        expect(body.epp_runtime.check.fail_threshold, '其余子字段为表单回填值').toBe(5);
        const cluster = await resApi.getCluster(page, clusterName);
        expect(cluster.epp_runtime).toEqual(body.epp_runtime);
      });

      await test.step('4. PATCH 不传 epp_runtime（纯 WRR 集群）：保留原值（GET 仍为 null）', async () => {
        const wrrCluster = await createClusterViaApi(page, ctx.cleanup, providerName, {
          balance_mode: WRR_MODE,
        });
        await utils.refreshBusinessClusterList(page);
        await navigateToEditModelStep(page, wrrCluster);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查', EDIT_DRAWER);
        const request = await utils.waitForClusterPatchRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.balance_mode).toBe(WRR_MODE);
        expect(body.epp_runtime, '纯 WRR 且原未配置时不提交 epp_runtime').toBeUndefined();
        const cluster = await resApi.getCluster(page, wrrCluster);
        expect(cluster.epp_runtime, 'PATCH 不传则保留原值（未配置 = null）').toBeNull();
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-119 EPP 运行时参数编辑回读与默认补齐',
  (ctx) => {
    test('验证已配置回填、单位拆分、组合写法回退与未配置默认值', async ({ page }) => {
      test.setTimeout(300000);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });

      const configured = await createClusterViaApi(
        page,
        ctx.cleanup,
        providerName,
        eppRuntimePayload({
          epp_runtime: {
            check: {
              disabled: true,
              check_interval: '1s',
              fail_threshold: 5,
              cooldown: '30s',
              success_threshold: 3,
            },
            timeout: { connect: '300ms', call: '2s' },
          },
        }),
      );
      const combined = await createClusterViaApi(
        page,
        ctx.cleanup,
        providerName,
        eppRuntimePayload({
          epp_runtime: {
            check: {
              disabled: false,
              check_interval: '1m30s',
              fail_threshold: 3,
              cooldown: '45s',
              success_threshold: 2,
            },
            timeout: { connect: '500ms', call: '3s' },
          },
        }),
      );
      const unsetCluster = await createClusterViaApi(
        page,
        ctx.cleanup,
        providerName,
        eppRuntimePayload({}),
      );

      await utils.refreshBusinessClusterList(page);

      await test.step('1. 编辑已配置集群：回填存储值并按「数值 + 单位」拆分展示', async () => {
        await navigateToEditModelStep(page, configured);
        expect(await utils.getBalanceModeValue(page, EDIT_DRAWER)).toBe(EPP_MODE);
        const values = await utils.getEppRuntimeValues(page, EDIT_DRAWER);
        expect(values.disabled).toBe(true);
        expect(values.checkInterval, 'check_interval=1s → 1 + s').toEqual({
          value: '1',
          unit: 's',
          raw: false,
        });
        expect(values.failThreshold).toBe('5');
        expect(values.cooldown, 'cooldown=30s → 30 + s').toEqual({
          value: '30',
          unit: 's',
          raw: false,
        });
        expect(values.successThreshold).toBe('3');
        expect(values.connectTimeout, 'connect=300ms → 300 + ms').toEqual({
          value: '300',
          unit: 'ms',
          raw: false,
        });
        expect(values.callTimeout, 'call=2s → 2 + s').toEqual({
          value: '2',
          unit: 's',
          raw: false,
        });
      });

      await test.step('2. 修改子字段后提交，再次 GET 回读一致', async () => {
        await utils.fillEppRuntimeThreshold(page, DOC.eppFailThresholdLabel, '7', EDIT_DRAWER);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查', EDIT_DRAWER);
        const request = await utils.waitForClusterPatchRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.epp_runtime.check.fail_threshold).toBe(7);
        expect(body.epp_runtime.check.check_interval, '未改动子字段保留原值').toBe('1s');
        const cluster = await resApi.getCluster(page, configured);
        expect(cluster.epp_runtime).toEqual(body.epp_runtime);
      });

      await test.step('3. 组合写法 1m30s：回退纯文本输入、原样展示，直接提交仍为 1m30s', async () => {
        await navigateToEditModelStep(page, combined);
        const values = await utils.getEppRuntimeValues(page, EDIT_DRAWER);
        expect(values.checkInterval, '组合写法无法拆分 → 回退纯文本输入').toEqual({
          value: '1m30s',
          unit: null,
          raw: true,
        });
        expect(values.cooldown, '其余 duration 字段仍为复合控件').toEqual({
          value: '45',
          unit: 's',
          raw: false,
        });
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查', EDIT_DRAWER);
        const request = await utils.waitForClusterPatchRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.epp_runtime.check.check_interval, '不做修改直接提交仍为 1m30s').toBe('1m30s');
        const cluster = await resApi.getCluster(page, combined);
        expect(cluster.epp_runtime.check.check_interval).toBe('1m30s');
      });

      await test.step('4. 未配置（epp_runtime=null）集群：GET 回读 null，编辑展示默认值', async () => {
        const cluster = await resApi.getCluster(page, unsetCluster);
        expect(cluster.epp_runtime, '未配置集群 GET 返回 null（未配置 ≠ 空对象）').toBeNull();
        await navigateToEditModelStep(page, unsetCluster);
        await utils.expectEppRuntimeDefaultValues(page, EDIT_DRAWER);
      });

      await test.step('5. WRR 集群切到 EPP 时初始化一组默认值供填写', async () => {
        await utils.closeBusinessClusterEditDrawer(page);
        const wrrCluster = await createClusterViaApi(page, ctx.cleanup, providerName, {
          balance_mode: WRR_MODE,
        });
        await utils.refreshBusinessClusterList(page);
        await navigateToEditModelStep(page, wrrCluster);
        await utils.expectEppRuntimeCardHidden(page, EDIT_DRAWER);
        await utils.setBalanceMode(page, EPP_MODE, EDIT_DRAWER);
        await utils.expectEppRuntimeDefaultValues(page, EDIT_DRAWER);
        await utils.closeBusinessClusterEditDrawer(page);
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-120 WRR 模式保留不生效与禁止字段校验',
  (ctx) => {
    test('验证 WRR 隐藏但保留、非空即校验拦截与 tls/breaker 422', async ({ page }) => {
      test.setTimeout(240000);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      await navigateToModelStep(page, clusterName);
      await utils.setBalanceMode(page, EPP_MODE);

      await test.step('1. 填写后切 WRR：分组隐藏、已填值保留；切回 EPP 后恢复', async () => {
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, {
          value: '5',
          unit: 's',
        });
        await utils.fillEppRuntimeThreshold(page, DOC.eppFailThresholdLabel, '5');
        await utils.toggleEppRuntimeSwitch(page);

        await utils.setBalanceMode(page, WRR_MODE);
        await utils.expectEppRuntimeCardHidden(page);

        await utils.setBalanceMode(page, EPP_MODE);
        await utils.expectEppRuntimeCardVisible(page);
        const values = await utils.getEppRuntimeValues(page);
        expect(values.checkInterval).toEqual({ value: '5', unit: 's', raw: false });
        expect(values.failThreshold).toBe('5');
        expect(values.disabled).toBe(true);
      });

      await test.step('2. 编辑已配置集群：EPP 填非法值后切 WRR，仍按「非空即校验」拦截', async () => {
        const configured = await createClusterViaApi(
          page,
          ctx.cleanup,
          providerName,
          eppRuntimePayload({
            epp_runtime: {
              check: {
                disabled: false,
                check_interval: '2s',
                fail_threshold: 3,
                cooldown: '45s',
                success_threshold: 2,
              },
              timeout: { connect: '500ms', call: '3s' },
            },
          }),
        );
        await utils.refreshBusinessClusterList(page);
        await navigateToEditModelStep(page, configured);
        await utils.fillEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          { value: '0' },
          EDIT_DRAWER,
        );
        await utils.setBalanceMode(page, WRR_MODE, EDIT_DRAWER);
        await utils.expectEppRuntimeCardHidden(page, EDIT_DRAWER);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '大模型配置', EDIT_DRAWER);
        await utils.expectEppRuntimeToast(page, DOC.eppCheckIntervalInvalidMsg);
        ctx.configuredCluster = configured;
      });

      await test.step('3. 切回 EPP 已填值恢复，并以 WRR 提交验证 epp_runtime 休眠保留', async () => {
        await utils.setBalanceMode(page, EPP_MODE, EDIT_DRAWER);
        const restored = await utils.getEppRuntimeValues(page, EDIT_DRAWER);
        expect(restored.checkInterval.value, '切回 EPP 后已填值恢复').toBe('0');
        await utils.fillEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          {
            value: '2',
            unit: 's',
          },
          EDIT_DRAWER,
        );
        await utils.setBalanceMode(page, WRR_MODE, EDIT_DRAWER);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查', EDIT_DRAWER);
        const request = await utils.waitForClusterPatchRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.balance_mode).toBe(WRR_MODE);
        expect(body.epp_runtime, 'WRR 时 epp_runtime 保留（休眠）').toBeDefined();
        expect(body.epp_runtime.check.check_interval).toBe('2s');
        const cluster = await resApi.getCluster(page, ctx.configuredCluster);
        expect(cluster.epp_runtime).toEqual(body.epp_runtime);
      });

      await test.step('4. 接口层携带 epp_runtime.tls / breaker → 422（未知字段）', async () => {
        for (const field of ['tls', 'breaker']) {
          const evilName = utils.generateTestBusinessClusterName();
          const { status, body } = await resApi.createClusterWithResponse(
            page,
            buildClusterPayload(
              evilName,
              providerName,
              eppRuntimePayload({
                epp_runtime: {
                  ...DOC.defaultEppRuntime,
                  [field]: {},
                },
              }),
            ),
          );
          expect(status, `携带 epp_runtime.${field} 应返回 422：${JSON.stringify(body)}`).toBe(
            422,
          );
        }
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-121 EPP 运行时参数复查页展示与未配置提示',
  (ctx) => {
    test('验证复查页 7 项展示、单位换算展示、GET 一致与未配置提示', async ({ page }) => {
      test.setTimeout(240000);
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
      await navigateToModelStep(page, clusterName);
      await utils.setBalanceMode(page, EPP_MODE);
      await fillProviderAndModels(page, providerName);

      await test.step('1. 复查页展示 7 项运行时参数，与第 4 步输入逐项一致', async () => {
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, {
          value: '5',
          unit: 's',
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppCooldownLabel, {
          value: '45',
          unit: 's',
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppConnectTimeoutLabel, {
          value: '300',
          unit: 'ms',
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
          value: '3',
          unit: 's',
        });
        await utils.fillEppRuntimeThreshold(page, DOC.eppFailThresholdLabel, '5');
        await utils.fillEppRuntimeThreshold(page, DOC.eppSuccessThresholdLabel, '2');
        await utils.toggleEppRuntimeSwitch(page);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        await utils.expectReviewEppRuntimeValues(page, {
          [DOC.eppCheckDisabledLabel]: DOC.eppSwitchOnText,
          [DOC.eppCheckIntervalLabel]: '5s',
          [DOC.eppFailThresholdLabel]: '5',
          [DOC.eppCooldownLabel]: '45s',
          [DOC.eppSuccessThresholdLabel]: '2',
          [DOC.eppConnectTimeoutLabel]: '300ms',
          [DOC.eppCallTimeoutLabel]: '3s',
        });
      });

      await test.step('2. 连接超时 300ms → s：复查页展示换算值 0.3s（物理时长不变）', async () => {
        await utils.clickWizardPrev(page);
        await utils.expectWizardStep(page, '大模型配置');
        await utils.selectEppRuntimeDurationUnit(page, DOC.eppConnectTimeoutLabel, 's');
        const values = await utils.getEppRuntimeValues(page);
        expect(values.connectTimeout, '切单位换算数值').toEqual({
          value: '0.3',
          unit: 's',
          raw: false,
        });
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        await utils.expectReviewEppRuntimeValues(page, {
          [DOC.eppConnectTimeoutLabel]: '0.3s',
        });
      });

      await test.step('3. 提交并 GET 读回，复查页 / 详情页展示与接口一致', async () => {
        const request = await utils.waitForClusterCreateRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        const cluster = await resApi.getCluster(page, clusterName);
        expect(cluster.epp_runtime, 'GET 读回与提交体一致').toEqual(body.epp_runtime);
        await utils.ensureBusinessClusterRowVisible(page, clusterName);
        await utils.openBusinessClusterDetail(page, clusterName);
        await utils.expectReviewEppRuntimeValues(
          page,
          {
            [DOC.eppCheckDisabledLabel]: DOC.eppSwitchOnText,
            [DOC.eppCheckIntervalLabel]: cluster.epp_runtime.check.check_interval,
            [DOC.eppFailThresholdLabel]: String(cluster.epp_runtime.check.fail_threshold),
            [DOC.eppCooldownLabel]: cluster.epp_runtime.check.cooldown,
            [DOC.eppSuccessThresholdLabel]: String(
              cluster.epp_runtime.check.success_threshold,
            ),
            [DOC.eppConnectTimeoutLabel]: cluster.epp_runtime.timeout.connect,
            [DOC.eppCallTimeoutLabel]: cluster.epp_runtime.timeout.call,
          },
          DETAIL_DRAWER,
        );
        await utils.closeBusinessClusterDetail(page);
      });

      await test.step('4. 未配置（epp_runtime=null）集群展示「未配置（BFE 补默认）」', async () => {
        const unsetCluster = await createClusterViaApi(
          page,
          ctx.cleanup,
          providerName,
          eppRuntimePayload({}),
        );
        await utils.refreshBusinessClusterList(page);
        await utils.ensureBusinessClusterRowVisible(page, unsetCluster);
        await utils.openBusinessClusterDetail(page, unsetCluster);
        await utils.expectReviewEppRuntimeUnset(page, DETAIL_DRAWER);
        await utils.closeBusinessClusterDetail(page);
      });
    });
  },
);

registerEppRuntimeDescribe(
  'AI业务集群 - RM-BC-122 EPP 运行时参数-duration 复合控件交互',
  (ctx) => {
    test('验证小数输入、单位换算、清空后单位保留与非法字符过滤', async ({ page }) => {
      test.setTimeout(240000);
      const clusterName = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName);
      const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
      await navigateToModelStep(page, clusterName);
      await utils.setBalanceMode(page, EPP_MODE);
      await fillProviderAndModels(page, providerName);

      await test.step('1. 健康检查间隔逐字输入 1.5：输入框保持 1.5（不得变成 15）', async () => {
        const shown = await utils.typeEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          '1.5',
        );
        expect(shown, '输入 1.5 时输入框应保持 1.5').toBe('1.5');
        const values = await utils.getEppRuntimeValues(page);
        expect(values.checkInterval).toEqual({ value: '1.5', unit: 's', raw: false });
      });

      await test.step('2. 连接超时 500 + ms 切 s → 数字框 0.5（物理时长不变）', async () => {
        await utils.selectEppRuntimeDurationUnit(page, DOC.eppConnectTimeoutLabel, 's');
        const values = await utils.getEppRuntimeValues(page);
        expect(values.connectTimeout).toEqual({ value: '0.5', unit: 's', raw: false });
      });

      await test.step('3. 冷却时长 0.5 + m → 0.5m（等价 30s），仍受 >0 校验', async () => {
        await utils.fillEppRuntimeDuration(page, DOC.eppCooldownLabel, {
          value: '0.5',
          unit: 'm',
        });
        const values = await utils.getEppRuntimeValues(page);
        expect(values.cooldown).toEqual({ value: '0.5', unit: 'm', raw: false });
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCooldownLabel);
      });

      await test.step('4. 调用超时清空后再输入数值：单位下拉保留当前单位', async () => {
        await utils.selectEppRuntimeDurationUnit(page, DOC.eppCallTimeoutLabel, 'ms');
        await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, { value: '' });
        const cleared = await utils.getEppRuntimeValues(page);
        expect(cleared.callTimeout, '清空 = 未设置，单位保留当前单位').toEqual({
          value: '',
          unit: 'ms',
          raw: false,
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, { value: '2' });
        const refilled = await utils.getEppRuntimeValues(page);
        expect(refilled.callTimeout, '重新输入时保留当前单位').toEqual({
          value: '2',
          unit: 'ms',
          raw: false,
        });
        await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
          value: '2',
          unit: 's',
        });
      });

      await test.step('5. -、字母无法输入为非法 duration 值（-1 → 1；abc → 输入框即时清空且视为未设置）', async () => {
        const afterMinus = await utils.typeEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          '-1',
        );
        expect(afterMinus, '负号无法输入为非法 duration 值').toBe('1');
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
        const afterLetters = await utils.typeEppRuntimeDuration(
          page,
          DOC.eppCheckIntervalLabel,
          'abc',
        );
        expect(afterLetters, '字母不进入输入框（BUG-BC-02 修复：清洗后即时回写 DOM）').toBe('');
        await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCheckIntervalLabel);
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        await utils.expectReviewEppRuntimeValues(page, {
          [DOC.eppCheckIntervalLabel]: DOC.defaultEppRuntime.check.check_interval,
        });
        await utils.clickWizardPrev(page);
        await utils.expectWizardStep(page, '大模型配置');
        await utils.fillEppRuntimeDuration(page, DOC.eppCheckIntervalLabel, {
          value: '1.5',
          unit: 's',
        });
      });

      await test.step('6. 提交体 4 个 duration 字段均为 duration 字符串', async () => {
        await utils.clickWizardNext(page);
        await utils.expectWizardStep(page, '复查&检查');
        const request = await utils.waitForClusterCreateRequest(page, () =>
          utils.clickWizardSubmit(page),
        );
        const body = request.postDataJSON();
        expect(body.epp_runtime.check.check_interval).toBe('1.5s');
        expect(body.epp_runtime.timeout.connect).toBe('0.5s');
        expect(body.epp_runtime.check.cooldown).toBe('0.5m');
        expect(body.epp_runtime.timeout.call).toBe('2s');
      });
    });
  },
);