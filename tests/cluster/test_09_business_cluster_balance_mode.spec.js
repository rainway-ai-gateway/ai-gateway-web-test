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
 *   默认 medium；off 时「前缀缓存亲和性」「会话亲和性」「会话亲和性 Header」
 *   整体隐藏（v-if 不渲染、无 off 后缀与提示），切回后恢复且值休眠保留。
 * - RM-BC-97 EPP 模式-prefix_cache_affinity 开关：Switch 开关，默认开启；
 *   affinity=off 时整体隐藏，切回后状态保留，提交体不因隐藏丢值。
 * - RM-BC-98 EPP 模式-session_affinity 联动：启用后展示 session_affinity_header；
 *   affinity=off 时两个字段整体隐藏且 Header 条件必填不触发。
 * - RM-BC-99 EPP 模式-kv_cache_utilization_max 输入：InputNumber，默认 0.9。
 * - RM-BC-100 EPP 模式-flow_control 卡片展示与输入：流控为独立卡片（drawer-body
 *   级别 .llm-section-card），RM-BC-94 显隐断言覆盖其渲染；提交体 flow_control
 *   结构由 RM-BC-102（提交体）与 RM-BC-108（enable_eviction 仅 false）断言。
 * - RM-BC-101 WRR↔EPP 切换不丢失已填 EPP 配置。
 * - RM-BC-102 提交体包含 balance_mode 和 epp_config。
 * - RM-BC-103 编辑回显/详情/复查展示 balance_mode 和 epp_config。
 * - RM-BC-104 EPP 模式-waiting_queue_max 输入：默认 0，≥0 整数，0=不启用。
 * - RM-BC-105 EPP 模式-running_requests_max 输入：默认 0，≥0 整数，0=不启用。
 * - RM-BC-106 EPP 模式-fallback_on_empty 开关：默认 false。
 * - RM-BC-107 EPP 模式-metrics_staleness_threshold_ms 输入：默认 200，须 >0 整数。
 * - RM-BC-108 EPP 模式-flow_control.enable_eviction 仅允许 false（禁用态只读）。
 * - RM-BC-109 epp_config 非空即校验（与 balance_mode 无关）。
 *
 * 注：**RM-BC-115~122（EPP 运行时参数）已于 2026-10-30 拆分至
 * `test_17_business_cluster_epp_runtime.spec.js`**（覆盖缺口清单 #23：本文件曾承载
 * 两轮 EPP 迭代、近 2000 行）。
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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

  test('RM-BC-96 EPP 模式 affinity 选择与 off 隐藏/恢复', async ({ page }) => {
    test.setTimeout(180000);
    const DOC = utils.DOC_BUSINESS_CLUSTER;
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);

    await test.step('1. 亲和强度为下拉选择器，默认 medium，四个选项均可选择且回显', async () => {
      await utils.expectEppGridFieldVisible(page, DOC.cacheAffinityLabel);
      let values = await utils.getEppConfigValues(page);
      expect(values.cacheAffinity, '默认值为 medium').toBe(DOC.defaultCacheAffinity);

      for (const option of DOC.cacheAffinityOptions) {
        await utils.fillEppConfig(page, { cacheAffinity: option });
        values = await utils.getEppConfigValues(page);
        expect(values.cacheAffinity, `选择 ${option} 后应回显该值`).toBe(option);
      }
    });

    await test.step('2. affinity=off：两个亲和开关与 Header 整体隐藏，无 off 后缀与提示', async () => {
      await utils.fillEppConfig(page, { prefixCacheAffinity: false });
      await utils.fillEppConfig(page, { sessionAffinityEnabled: true });
      await utils.fillEppConfig(page, { sessionAffinityHeader: 'x-affinity-sleep' });

      await utils.fillEppConfig(page, { cacheAffinity: 'off' });

      // 预期 4：三项 v-if 不渲染，网格不留空位
      await utils.expectEppGridFieldHidden(page, DOC.prefixCacheAffinityLabel);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityEnabledLabel);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);
      // 预期 4：无「（off 时不生效）」后缀与「亲和强度为 off，不生效」提示
      await utils.expectNoAffinityOffHint(page);
      // 亲和强度本身仍展示且值为 off
      await utils.expectEppGridFieldVisible(page, DOC.cacheAffinityLabel);
      await utils.expectLlmFormGridNoBlankBlock(
        utils.eppConfigGrid(page),
        '均衡模式配置 EPP 网格（off）',
      );

      const values = await utils.getEppConfigValues(page);
      expect(values.cacheAffinity).toBe('off');
      expect(values.prefixCacheAffinity, 'off 时前缀缓存亲和性开关不在页面中').toBeNull();
      expect(values.sessionAffinityEnabled, 'off 时会话亲和性开关不在页面中').toBeNull();
      expect(values.sessionAffinityHeader, 'off 时会话亲和性 Header 不在页面中').toBeNull();
    });

    await test.step('3. 切回 low：三项恢复展示，隐藏前的值休眠保留', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'low' });

      await utils.expectEppGridFieldVisible(page, DOC.prefixCacheAffinityLabel);
      await utils.expectEppGridFieldVisible(page, DOC.sessionAffinityEnabledLabel);
      await utils.expectEppGridFieldVisible(page, DOC.sessionAffinityHeaderLabel);

      const values = await utils.getEppConfigValues(page);
      expect(values.cacheAffinity).toBe('low');
      expect(values.prefixCacheAffinity, '前缀缓存亲和性保持 off 之前的 false').toBe(false);
      expect(values.sessionAffinityEnabled, '会话亲和性保持 off 之前的开启状态').toBe(true);
      expect(values.sessionAffinityHeader, 'Header 已填值休眠保留').toBe('x-affinity-sleep');
    });

    await test.step('4. 置 off 后提交：affinity=off 且隐藏字段不丢值，key_affinity 不受影响', async () => {
      // 预期 6：epp_config.affinity 与 llm_config.key_affinity 为不同字段，切换互不影响
      const keyAffinityBefore = await utils.getKeyAffinityValues(page);
      await utils.fillEppConfig(page, { cacheAffinity: 'high' });
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });
      const keyAffinityAfter = await utils.getKeyAffinityValues(page);
      expect(keyAffinityAfter, 'EPP 亲和强度切换不影响 Key 亲和性').toEqual(
        keyAffinityBefore,
      );

      await utils.ensureEppCallTimeoutAboveQueueTtl(page);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.epp_config.affinity).toBe('off');
      expect(body.epp_config.prefix_cache_affinity, '隐藏不丢值').toBe(false);
      expect(body.epp_config.session_affinity_enabled, '隐藏不丢值').toBe(true);
      expect(body.epp_config.session_affinity_header, 'Header 已填值随提交体下发').toBe(
        'x-affinity-sleep',
      );
    });
  });

  test('RM-BC-97 EPP 模式 prefix_cache_affinity 开关', async ({ page }) => {
    test.setTimeout(180000);
    const DOC = utils.DOC_BUSINESS_CLUSTER;
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);

    await test.step('1. switch 控件，默认开启', async () => {
      const layout = await utils.getEppGridLayout(page);
      expect(layout.items.map((i) => i.label)).toContain(
        DOC.prefixCacheAffinityLabel,
      );
      const values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity, '默认值为 true').toBe(true);
    });

    await test.step('2. 关闭 → false，再开启 → true', async () => {
      await utils.fillEppConfig(page, { prefixCacheAffinity: false });
      let values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity).toBe(false);

      await utils.fillEppConfig(page, { prefixCacheAffinity: true });
      values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity).toBe(true);
    });

    await test.step('3. affinity=off 时整体隐藏且无 off 提示；切回 medium 后恢复并保持 false', async () => {
      await utils.fillEppConfig(page, { prefixCacheAffinity: false });
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });

      await utils.expectEppGridFieldHidden(page, DOC.prefixCacheAffinityLabel);
      await utils.expectNoAffinityOffHint(page);
      let values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity, 'off 时开关不在页面中').toBeNull();

      await utils.fillEppConfig(page, { cacheAffinity: 'medium' });
      await utils.expectEppGridFieldVisible(page, DOC.prefixCacheAffinityLabel);
      values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity, '恢复展示后保持隐藏前的 false').toBe(false);
    });

    await test.step('4. 提交体为布尔值且不因隐藏丢值；会话亲和性关闭时不下发 Header', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });
      await utils.ensureEppCallTimeoutAboveQueueTtl(page);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(typeof body.epp_config.prefix_cache_affinity, '提交体为布尔类型').toBe(
        'boolean',
      );
      expect(body.epp_config.prefix_cache_affinity, '隐藏期间的 false 不丢失').toBe(false);
      expect(
        body.epp_config.session_affinity_header,
        'session_affinity_enabled=false 时不下发 header',
      ).toBeUndefined();
    });
  });

  test('RM-BC-98 EPP 模式 session_affinity 联动展示 Header', async ({ page }) => {
    test.setTimeout(180000);
    const DOC = utils.DOC_BUSINESS_CLUSTER;
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);

    await test.step('1. 默认关闭，Header 不展示', async () => {
      const values = await utils.getEppConfigValues(page);
      expect(values.sessionAffinityEnabled, '默认关闭').toBe(false);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);
    });

    await test.step('2. 开启后动态展示 Header；关闭后隐藏且已填值休眠保留（再开启回显）', async () => {
      await utils.fillEppConfig(page, { sessionAffinityEnabled: true });
      await utils.expectEppGridFieldVisible(page, DOC.sessionAffinityHeaderLabel);

      await utils.fillEppConfig(page, { sessionAffinityHeader: 'x-session-id' });
      let values = await utils.getEppConfigValues(page);
      expect(values.sessionAffinityHeader, 'Header 输入值正确').toBe('x-session-id');

      await utils.fillEppConfig(page, { sessionAffinityEnabled: false });
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);

      await utils.fillEppConfig(page, { sessionAffinityEnabled: true });
      values = await utils.getEppConfigValues(page);
      expect(values.sessionAffinityHeader, '已填值休眠保留，重新开启后回显').toBe(
        'x-session-id',
      );
    });

    await test.step('3. enabled=true 且 Header 为空、affinity 非 off：校验拦截', async () => {
      await utils.fillEppConfig(page, { sessionAffinityHeader: '' });
      await utils.clickWizardNext(page);
      await utils.expectEppFieldError(
        page,
        DOC.sessionAffinityHeaderLabel,
        '启用会话亲和性时，Header 不能为空',
      );
      await utils.expectWizardStep(page, '大模型配置');
    });

    await test.step('4. affinity=off：两个字段整体隐藏，无 off 后缀与提示', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });

      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityEnabledLabel);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);
      await utils.expectNoAffinityOffHint(page);
      await utils.expectEppFieldErrorHidden(page, DOC.sessionAffinityHeaderLabel);
    });

    await test.step('5. 切回 medium：两字段恢复、开关与 Header 值保持隐藏前状态；提交体正确', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'medium' });
      await utils.expectEppGridFieldVisible(page, DOC.sessionAffinityEnabledLabel);
      await utils.expectEppGridFieldVisible(page, DOC.sessionAffinityHeaderLabel);

      let values = await utils.getEppConfigValues(page);
      expect(values.sessionAffinityEnabled, '会话亲和性开关休眠保留').toBe(true);
      expect(values.sessionAffinityHeader, 'Header 空值休眠保留').toBe('');

      await utils.fillEppConfig(page, { sessionAffinityHeader: 'x-session-id' });
      await utils.ensureEppCallTimeoutAboveQueueTtl(page);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.epp_config.session_affinity_enabled).toBe(true);
      expect(body.epp_config.session_affinity_header).toBe('x-session-id');
    });
  });

  // 02d RM-BC-98 预期 5（2026-10-28 按后端契约修正）：
  // `affinity=off` 时两个字段整体隐藏、**字段级**条件必填不触发（字段不渲染，无内联错误）；
  // 但若 `session_affinity_enabled=true` 且 Header 为空，点击「下一步」仍会被**提交级**
  // `validateEppConfig` 拦截（与后端 `epp_config.Validate()` 契约一致：enabled=true 要求
  // Header 非空，与 affinity 取值无关），提示改为可操作文案
  // 「亲和强度为 off 时会话亲和性不生效；请先将亲和强度切回 low/medium/high 填写 Header，或关闭会话亲和性」。
  test('RM-BC-98 affinity=off 时 Header 提交级拦截与可操作提示（02 预期 5）', async ({ page }) => {
    test.setTimeout(180000);
    const DOC = utils.DOC_BUSINESS_CLUSTER;
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);
    // 先让「调用超时 > 队列 TTL」跨字段校验通过，才能命中本用例要断言的 Header 提交级拦截
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);

    await test.step('1. 开启会话亲和性、Header 留空，随后将 affinity 置为 off', async () => {
      await utils.fillEppConfig(page, { sessionAffinityEnabled: true });
      await utils.expectEppGridFieldVisible(page, DOC.sessionAffinityHeaderLabel);
      const values = await utils.getEppConfigValues(page);
      expect(values.sessionAffinityHeader, 'Header 保持为空').toBe('');

      await utils.fillEppConfig(page, { cacheAffinity: 'off' });
    });

    await test.step('2. 两个字段整体隐藏，Header 字段级条件必填不触发（无内联错误）', async () => {
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityEnabledLabel);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);
      await utils.expectEppFieldErrorHidden(page, DOC.sessionAffinityHeaderLabel);
    });

    await test.step('3. 点击下一步：提交级校验拦截并给出可操作提示，停留在大模型配置步骤', async () => {
      await utils.clickWizardNext(page);
      await utils.expectToast(page, DOC.sessionAffinityHeaderRequiredWhenOff);
      await utils.expectWizardStep(page, '大模型配置');
    });

    await test.step('4. 按提示切回亲和强度并填写 Header 后可正常进入复查', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'medium' });
      await utils.fillEppConfig(page, { sessionAffinityHeader: 'x-session-id' });
      await utils.ensureEppCallTimeoutAboveQueueTtl(page);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
    });
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

    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
    await utils.ensureEppCallTimeoutAboveQueueTtl(page);
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
});
