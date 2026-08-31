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
 * AI业务集群 - CRUD 与数据一致性（RM-BC-02、11~16、21、23、34~36、38、14）
 *
 * 5 步向导：基础配置 → 超时和重传 → 被动健康检查 → 大模型配置 → 复查&检查。
 * 不存在「实例配置」步骤 / 详情段 / 复查段（实例池由 Provider 维护）。
 *
 * 造数：集群引用 Provider（llm_config.provider），先通过 provider-api-utils
 * 创建服务商（provider_<ts>，afterEach 清理），再 POST /clusters 或走 UI 向导。
 *
 * 覆盖：
 * - RM-BC-02 创建AI业务集群-5步向导成功
 * - RM-BC-11 向导第5步-复查并提交（不存在「实例配置」摘要）
 * - RM-BC-12 编辑AI业务集群（集群名称不可修改）
 * - RM-BC-13 删除AI业务集群-成功
 * - RM-BC-14 删除集群-被路由引用
 * - RM-BC-15 查看AI业务集群详情（不展示「实例配置」面板）
 * - RM-BC-16 编辑向导步骤与创建一致（5 步，无「实例配置」）
 * - RM-BC-21 业务集群名称重复
 * - RM-BC-23 业务集群名称格式校验 [BUG]
 * - RM-BC-34 业务集群详情与OpenAPI一致
 * - RM-BC-35 复查页与提交数据一致
 * - RM-BC-36 编辑向导回显与OpenAPI一致（provider 引用）
 * - RM-BC-38 编辑向导复查页与各步数据一致（5 步导航）
 *
 * 运行：npx playwright test tests/cluster/test_03_business_cluster_crud.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const routeApi = require('../../api/route-api-utils');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

/** 通过 API 创建服务商并登记到 provider cleanup */
async function createProvider({ page, cleanup }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-集群CRUD',
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

/** 构建 createCluster API 所需的 payload（与 UI 提交结构一致：llm_config.provider 引用） */
async function buildClusterPayload(page, name, provider, overrides = {}) {
  return {
    name,
    basic: {
      protocol: 'https',
      connection: {
        max_idle_conn_per_rs: 2,
        cancel_on_client_close: false,
      },
      retries: {
        max_retry_in_cluster: 2,
      },
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
      provider,
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

test.describe('AI业务集群管理 - RM-BC-02 CRUD与数据一致性', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  // RM-BC-02: 创建AI业务集群-5步向导成功
  test('RM-BC-02 创建AI业务集群-5步向导成功', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.fillCreateWizardThroughReview(page, {
      clusterName,
      model: { provider: providerName, models: [MODEL_A1] },
    });
    await utils.submitCreateBusinessClusterAndWaitForSuccess(page);
    await utils.expectCreateBusinessClusterDrawerHidden(page);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
  });

  // RM-BC-11: 向导第 5 步 - 复查并提交
  test('RM-BC-11 向导第5步复查并提交', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.fillCreateWizardThroughReview(page, {
      clusterName,
      protocol: 'https',
      model: { provider: providerName, models: [MODEL_A1] },
    });
    await utils.expectWizardStep(page, '复查&检查');

    const drawer = utils.ivuDrawer(page).active();
    const body = drawer.locator('.ivu-drawer-body');

    // 复查页展示各配置段
    await expect(
      body.locator('.panel').filter({ hasText: '基础配置' }).first(),
    ).toBeVisible();
    await expect(
      body.locator('.panel').filter({ hasText: '超时和重传' }).first(),
    ).toBeVisible();
    await expect(
      body.locator('.panel').filter({ hasText: '被动健康检查' }).first(),
    ).toBeVisible();
    await expect(
      body.locator('.panel').filter({ hasText: '大模型配置' }).first(),
    ).toBeVisible();
    // 不存在「实例配置」复查段（实例池由 Provider 维护）
    await expect(
      body.locator('.panel').filter({ hasText: '实例配置' }),
    ).toHaveCount(0);
    // 基础配置段协议展示
    await expect(
      body
        .locator('.panel')
        .filter({ hasText: '基础配置' })
        .first()
        .locator('.value')
        .filter({ hasText: 'https' })
        .first(),
    ).toBeVisible();

    await utils.submitCreateBusinessClusterAndWaitForSuccess(page);
    await utils.expectCreateBusinessClusterDrawerHidden(page);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
  });

  // RM-BC-12: 编辑AI业务集群
  test('RM-BC-12 编辑AI业务集群', async ({ page }) => {
    // 通过API创建集群
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.expectWizardStep(
      page,
      '基础配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    const drawer = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.editBusinessCluster);
    const body = drawer.locator('.ivu-drawer-body');

    // 验证集群名称不可修改
    const nameInput = body
      .locator('.ivu-form-item')
      .filter({ hasText: '集群名称' })
      .locator('input')
      .first();
    await expect(nameInput).toBeDisabled();
  });

  // RM-BC-13: 删除AI业务集群-成功
  test('RM-BC-13 删除AI业务集群-成功', async ({ page }) => {
    // 通过API创建集群
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 点击删除
    await utils
      .businessClusterTable(page)
      .rowAction(clusterName, '删除')
      .click();
    await utils.confirmDeleteBusinessCluster(page);

    // 验证集群已删除 - 刷新页面后确认集群不在列表中
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.businessClusterTable(page).waitForLoaded();
    const deletedRow = utils.businessClusterTable(page).rowByText(clusterName);
    await expect(deletedRow).toHaveCount(0);
  });

  // RM-BC-15: 查看AI业务集群详情
  test('RM-BC-15 查看AI业务集群详情', async ({ page }) => {
    // 通过API创建集群
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    await utils.openBusinessClusterDetail(page, clusterName);

    const drawer = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.businessClusterDetail);
    const body = drawer.locator('.ivu-drawer-body');

    // 详情展示各配置段；不再展示「实例配置」面板（实例池由 Provider 维护）
    await expect(
      body.locator('.panel').filter({ hasText: '基础配置' }).first(),
    ).toBeVisible();
    await expect(
      body.locator('.panel').filter({ hasText: '大模型配置' }).first(),
    ).toBeVisible();
    await expect(
      body.locator('.panel').filter({ hasText: '实例配置' }),
    ).toHaveCount(0);

    await utils.closeBusinessClusterDetail(page);
  });

  // RM-BC-16: 编辑向导步骤与创建一致（5步）
  test('RM-BC-16 编辑向导步骤与创建一致', async ({ page }) => {
    // 通过API创建集群
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    await utils.openEditBusinessClusterDrawer(page, clusterName);

    const drawer = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.editBusinessCluster);
    const steps = drawer.locator('.ivu-steps');
    const stepItems = steps.locator('.ivu-steps-item');

    // 验证只有5步（无实例配置）
    const stepCount = await stepItems.count();
    expect(stepCount).toBe(5);

    // 验证步骤名称
    await expect(stepItems.nth(0)).toContainText('基础配置');
    await expect(stepItems.nth(1)).toContainText('超时和重传');
    await expect(stepItems.nth(2)).toContainText('被动健康检查');
    await expect(stepItems.nth(3)).toContainText('大模型配置');
    await expect(stepItems.nth(4)).toContainText('复查&检查');

    await utils.closeBusinessClusterEditDrawer(page);
  });

  // RM-BC-21: 业务集群名称重复
  test('RM-BC-21 业务集群名称重复', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // 通过API创建第一个集群
    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 尝试创建同名集群 → 第 1 步即被拦截并提示名称已存在
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);

    await utils.expectWizardStep(page, '基础配置');
    const drawer = utils.ivuDrawer(page).active();
    await expect(drawer.locator('.ivu-form-item-error-tip').first()).toBeVisible(
      { timeout: 5000 },
    );
  });

  // RM-BC-23: 业务集群名称格式校验
  // BUG: BaseClustersNameRegCheck 正则为 /^.+$/，仅校验非空，
  // 错误提示声称"只能包含字母、数字以及-.$+~且长度大于1"但实际未生效
  test('RM-BC-23 业务集群名称格式校验 [BUG: 前端正则未校验格式]', async ({
    page,
  }) => {
    await utils.openCreateBusinessClusterDrawer(page);

    // 单字符 - 文档说应被拦截，但实际通过
    await utils.fillBasicStep(page, {
      clusterName: 'a',
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);
    // 名称格式校验实际未生效，应能进入下一步
    await utils.expectWizardStep(page, '超时和重传');
  });

  // RM-BC-34: 业务集群详情与OpenAPI一致
  test('RM-BC-34 业务集群详情与OpenAPI一致', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    const apiData = await utils.getCluster(page, clusterName);
    expect(apiData.basic.protocol).toBeTruthy();
    await utils.expectBusinessClusterDetailProtocol(
      page,
      clusterName,
      apiData.basic.protocol,
    );
  });

  // RM-BC-35: 复查页与提交数据一致
  test('RM-BC-35 复查页与提交数据一致', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.fillCreateWizardThroughReview(page, {
      clusterName,
      protocol: 'https',
      health: {
        failureThreshold: 10,
        healthInterval: 1000,
        healthHost: 'www.test1.com',
        healthUri: '/interface',
        expectedStatus: 200,
      },
      model: { provider: providerName, models: [MODEL_A1] },
    });

    const drawer = utils.ivuDrawer(page).active();
    const reviewBody = drawer.locator('.ivu-drawer-body');
    const healthPanel = reviewBody
      .locator('.panel')
      .filter({ hasText: '被动健康检查' })
      .first();
    await expect(healthPanel).toBeVisible();
    await expect(
      healthPanel
        .locator('.value')
        .filter({ hasText: 'www.test1.com' })
        .first(),
    ).toBeVisible();

    await utils.submitCreateBusinessClusterAndWaitForSuccess(page);
    await utils.expectCreateBusinessClusterDrawerHidden(page);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    const apiData = await utils.getCluster(page, clusterName);
    expect(apiData.passive_health_check.host).toBe('www.test1.com');
  });

  // RM-BC-36: 编辑向导回显与OpenAPI一致
  test('RM-BC-36 编辑向导回显与OpenAPI一致', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    const apiData = await utils.getCluster(page, clusterName);
    await utils.expectEditWizardProtocolMatches(
      page,
      clusterName,
      apiData.basic.protocol,
    );
    // 验证模型所属服务商下拉框选中值与 API 返回的 llm_config.provider 一致
    await utils.expectEditWizardProviderMatches(
      page,
      clusterName,
      apiData.llm_config.provider,
    );
  });

  // RM-BC-38: 编辑向导复查页与各步数据一致
  test('RM-BC-38 编辑向导复查页与各步数据一致', async ({ page }) => {
    // 需要先创建集群
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    // 通过API创建集群
    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 打开编辑向导
    await utils.openEditBusinessClusterDrawer(page, clusterName);

    const drawer = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.editBusinessCluster);

    // 记录第1步基础配置数据
    await utils.expectWizardStep(
      page,
      '基础配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const body = drawer.locator('.ivu-drawer-body');
    const protocolText = await body
      .locator('.ivu-form-item')
      .filter({ hasText: '协议' })
      .locator('.ivu-select-selected-value')
      .textContent();

    // 第2步：超时和重传
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '超时和重传',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const timeoutValue = await body
      .locator('.ivu-form-item')
      .filter({ hasText: '连接后端超时' })
      .locator('input')
      .inputValue();

    // 第3步：被动健康检查
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '被动健康检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    const healthHost = await body
      .locator('.ivu-form-item')
      .filter({ hasText: '健康检查Host' })
      .locator('input')
      .inputValue();

    // 第4步：大模型配置（无「实例配置」步骤），所属服务商应回显 API 的 provider
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '大模型配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await utils.expectProviderValue(
      page,
      providerName,
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    // 第5步：复查&检查
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(
      page,
      '复查&检查',
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    // 到达复查页后验证各段数据
    const reviewBody = drawer.locator('.ivu-drawer-body');

    // 验证基础配置段
    const basicConfigPanel = reviewBody
      .locator('.panel')
      .filter({ hasText: '基础配置' })
      .first();
    await expect(basicConfigPanel).toBeVisible();
    await expect(
      basicConfigPanel
        .locator('.value')
        .filter({ hasText: protocolText.trim() })
        .first(),
    ).toBeVisible();

    // 验证超时重传段
    const timeoutPanel = reviewBody
      .locator('.panel')
      .filter({ hasText: '超时和重传' })
      .first();
    await expect(timeoutPanel).toBeVisible();
    await expect(
      timeoutPanel.locator('.value').filter({ hasText: timeoutValue }).first(),
    ).toBeVisible();

    // 验证健康检查段
    const healthPanel = reviewBody
      .locator('.panel')
      .filter({ hasText: '被动健康检查' })
      .first();
    await expect(healthPanel).toBeVisible();
    await expect(
      healthPanel.locator('.value').filter({ hasText: healthHost }).first(),
    ).toBeVisible();

    // 不存在「实例配置」复查段（实例池由 Provider 维护）
    await expect(
      reviewBody.locator('.panel').filter({ hasText: '实例配置' }),
    ).toHaveCount(0);

    // 验证大模型配置段（所属服务商展示 provider 名称）
    const modelPanel = reviewBody
      .locator('.panel')
      .filter({ hasText: '大模型配置' })
      .first();
    await expect(modelPanel).toBeVisible();
    await expect(
      modelPanel.locator('.value').filter({ hasText: providerName }).first(),
    ).toBeVisible();

    await utils.closeBusinessClusterEditDrawer(page);
  });
});

test.describe('AI业务集群管理 - RM-BC-14 删除约束', () => {
  test.describe.configure({ mode: 'serial' });

  let cleanup;
  let providerCleanup;
  let routeCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    routeCleanup = routeApi.createRouteTestCleanup();
    await routeCleanup.saveGlobalRouteRulesOriginalState(page);
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await routeCleanup.cleanup(page);
    await providerCleanup.cleanup(page);
    await cleanup.cleanup(page);
  });

  test('RM-BC-14 删除集群-被路由引用', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.createCluster(
      page,
      await buildClusterPayload(page, clusterName, providerName),
    );

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    const current = await routeApi.getGlobalRouteRulesViaApi(page);
    const ruleName = `rm_bc14_${Date.now()}`;
    const rules = [
      ...(current?.rules || []),
      {
        name: ruleName,
        cond: 'default_t()',
        targets: [{ cluster_name: clusterName, model: '', weight: 100 }],
        fallbacks: [],
      },
    ];
    const linked = await routeApi.setGlobalRouteRulesViaApi(page, {
      enabled: false,
      rules,
    });
    expect(linked).toBe(true);

    const result = await utils.attemptDeleteBusinessCluster(page, clusterName);
    expect(result.ok).toBe(false);

    // 2026-08-06 UI 变更：删除失败后弹自定义 Modal 展示引用规则信息+前往处理链接
    // 先等弹窗出现（前端 findClusterReferences 需要查多个 API，可能较慢）
    const deleteErrorModal = page
      .locator('.ivu-modal-wrap')
      .filter({ hasText: /删除失败|deleteFailed/ })
      .first();
    await expect(deleteErrorModal).toBeVisible({ timeout: 30000 });

    // 验证弹窗中包含引用规则名
    await expect(deleteErrorModal).toContainText(ruleName);

    // 验证存在"前往处理"链接
    const gotoLink = deleteErrorModal
      .locator('a')
      .filter({ hasText: '前往处理' })
      .first();
    await expect(gotoLink).toBeVisible();

    // 点击"前往处理"后跳转到路由规则页面
    await gotoLink.click();
    await page.waitForURL(/route-tables|route-rules/, { timeout: 15000 });

    // 回到集群列表，验证集群仍在（未被删除）
    await utils.gotoBusinessClusterManagementPage(page);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
  });
});
