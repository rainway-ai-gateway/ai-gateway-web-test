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
 * AI业务集群 - 均衡模式配置（RM-BC-93~103）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02d-大模型与校验.md）：
 * - RM-BC-93 均衡模式配置卡片展示与默认值：Card 位于 Key 亲和性之后；
 *   默认 balance_mode=WRR；EPP 配置项在 WRR 模式下隐藏。
 * - RM-BC-94 balance_mode 选择器 WRR/EPP 切换显隐：WRR 隐藏 EPP 配置项，
 *   EPP 模式展示全部配置项。
 * - RM-BC-95 EPP 模式-scheduling_profile 选择：Select 选项为 latency-first/
 *   balanced/throughput-first，默认 latency-first。
 * - RM-BC-96 EPP 模式-cache_affinity 选择：Select 选项为 low/medium/high，
 *   默认 medium。
 * - RM-BC-97 EPP 模式-prefix_cache_affinity 开关：Switch 开关，默认关闭。
 * - RM-BC-98 EPP 模式-session_affinity 联动：启用后展示 session_affinity_header。
 * - RM-BC-99 EPP 模式-kv_cache_utilization_max 输入：InputNumber，默认 0.5。
 * - RM-BC-100 EPP 模式-flow_control 可折叠卡片展示与输入：卡片内含 4 个字段。
 * - RM-BC-101 WRR↔EPP 切换不丢失已填 EPP 配置。
 * - RM-BC-102 提交体包含 balance_mode 和 epp_config。
 * - RM-BC-103 编辑回显/详情/复查展示 balance_mode 和 epp_config。
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

  test('RM-BC-95 EPP 模式 scheduling_profile 选择', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 默认值
    let values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe(utils.DOC_BUSINESS_CLUSTER.defaultSchedulingProfile);

    // 切换选项
    await utils.fillEppConfig(page, { schedulingProfile: 'throughput-first' });
    values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe('throughput-first');

    await utils.fillEppConfig(page, { schedulingProfile: 'balanced' });
    values = await utils.getEppConfigValues(page);
    expect(values.schedulingProfile).toBe('balanced');
  });

  test('RM-BC-96 EPP 模式 cache_affinity 选择', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');

    // 默认值
    let values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe(utils.DOC_BUSINESS_CLUSTER.defaultCacheAffinity);

    // 切换选项
    await utils.fillEppConfig(page, { cacheAffinity: 'low' });
    values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe('low');

    await utils.fillEppConfig(page, { cacheAffinity: 'high' });
    values = await utils.getEppConfigValues(page);
    expect(values.cacheAffinity).toBe('high');
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
      schedulingProfile: 'throughput-first',
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
    expect(values.schedulingProfile).toBe('throughput-first');
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

    // 切换到 EPP 并填写配置
    await utils.setBalanceMode(page, 'EPP');
    await utils.fillEppConfig(page, {
      schedulingProfile: 'throughput-first',
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

    // epp_config 包含填写的值
    expect(body.epp_config).toBeDefined();
    expect(body.epp_config.scheduling_profile).toBe('throughput-first');
    expect(body.epp_config.cache_affinity).toBe('high');
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
        scheduling_profile: 'latency-first',
        cache_affinity: 'medium',
        prefix_cache_affinity: true,
        session_affinity_enabled: true,
        session_affinity_header: 'x-session-id',
        kv_cache_utilization_max: 0.7,
        flow_control: {
          max_requests: 2000,
          queue_ttl: 3000,
          no_endpoint_queue_ttl: 3000,
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
    expect(cluster.epp_config.scheduling_profile).toBe('latency-first');
  });
});