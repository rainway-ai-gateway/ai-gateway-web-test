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
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const resourcePage = require('../pages/resource/ResourcePage');
const routePage = require('../pages/route/RoutePage');
const entityPage = require('../pages/entity/EntityPage');
const providerPage = require('../pages/providers/ProviderPage');
const providerApi = require('../api/provider-api-utils');
const common = require('../utils/common');
const umUtils = require('../pages/user/UserPage');

const authPath = path.join(__dirname, '../auth.json');
const outputDir = path.join(
  __dirname,
  '../../ai-gateway-web/docs/zh-cn/images',
);
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8085';
const DEMO_PROVIDER = 'demo-provider';
const DEMO_CLUSTER = 'demo-cluster';
const DEMO_MODEL = 'doubao-pro-32k';
const DEMO_BACKEND_ADDR = '172.19.1.187';
const DEMO_BACKEND_PORT = 13801;
// Entity 组织演示数据（对齐手册 08-entity）
const DEMO_ENTITY_TYPE_NAME = 'team';
const DEMO_ENTITY_TYPE_DESC = '团队';
const DEMO_ENTITY_TYPE_LEVEL = 3;
const DEMO_ENTITY_NAME = 'dev-team';
const DEMO_ENTITY_DESC = '研发团队';

async function screenshot(page, name) {
  const filePath = path.join(outputDir, name);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`Screenshot: ${name}`);
}

async function screenshotElement(locator, name) {
  const filePath = path.join(outputDir, name);
  await locator.screenshot({ path: filePath });
  console.log(`Element screenshot: ${name}`);
}

async function safeClick(page, locator, label) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    common.log(`Clicked: ${label}`);
    await page.waitForTimeout(300);
  } else {
    common.log(`Not visible, skipped: ${label}`);
  }
}

async function selectDropdownOption(page, label, optionText) {
  const formItem = page
    .locator('.ivu-form-item')
    .filter({ hasText: label })
    .first();
  const select = formItem.locator('.ivu-select-selection').first();
  if (await select.isVisible().catch(() => false)) {
    await select.click();
    await page.waitForTimeout(300);
    const option = page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .filter({ hasText: optionText })
      .first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(300);
    } else {
      await select.press('Escape');
    }
  }
}

async function setViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
}

async function closeAnyVisibleModal(page) {
  const okBtn = page
    .locator('.ivu-modal-wrap:visible')
    .getByRole('button', { name: '确定' })
    .first();
  if (await okBtn.isVisible().catch(() => false)) {
    await okBtn.click();
    await page.waitForTimeout(500);
    return true;
  }
  const closeBtn = page
    .locator('.ivu-modal-wrap:visible')
    .locator('.ivu-modal-close')
    .first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

async function preparePage(page) {
  await umUtils.dismissAuthAlertModal(page).catch(() => {});
  await umUtils.ensureLoggedIn(page).catch(() => {});
  await page.waitForTimeout(500);
}

async function gotoClusterPageWithSessionRetry(page) {
  for (let i = 0; i < 3; i++) {
    await resourcePage.gotoBusinessClusterManagementPage(page);
    const handled = await umUtils
      .dismissAuthAlertModal(page)
      .catch(() => false);
    if (!handled) {
      return; // no session error, we're on cluster page
    }
    // Session error was handled and page redirected to login; ensure logged in and retry
    await umUtils.ensureLoggedIn(page).catch(() => {});
    common.log('会话修复后重新导航到集群页');
  }
}

async function ensureDemoProvider(page) {
  await umUtils.ensureLoggedIn(page).catch(() => {});
  const names = await providerApi.getProviderNamesViaApi(page);
  if (names.includes(DEMO_PROVIDER)) {
    return;
  }
  const data = await providerApi.createProviderViaApi(page, {
    name: DEMO_PROVIDER,
    description: '演示用服务商',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    instance_pool: [
      { addr: DEMO_BACKEND_ADDR, port: DEMO_BACKEND_PORT, weight: 100 },
    ],
    models: [DEMO_MODEL],
    keys: [],
  });
  if (!data) {
    common.log('ensureDemoProvider: API 创建失败，集群截图可能缺少所属服务商');
  }
}

async function ensureDemoProviderAbsent(page) {
  await umUtils.ensureLoggedIn(page).catch(() => {});
  const names = await providerApi.getProviderNamesViaApi(page);
  if (!names.includes(DEMO_PROVIDER)) {
    return;
  }
  const result = await providerApi.deleteProviderViaApi(page, DEMO_PROVIDER);
  if (!result.ok) {
    common.log(
      'ensureDemoProviderAbsent: 删除 demo-provider 失败，创建截图可能出现名称重复校验',
    );
  }
}

async function ensureProviderPageReady(page) {
  await umUtils.dismissAuthAlertModal(page).catch(() => {});
  await closeAnyVisibleModal(page);
  await umUtils.ensureLoggedIn(page).catch(() => {});
  await umUtils.dismissAuthAlertModal(page).catch(() => {});
  await closeAnyVisibleModal(page);
  await page.waitForTimeout(500);
}

async function captureProviderScreenshots(page) {
  common.log('=== 模型服务商截图 ===');
  await preparePage(page);
  await ensureProviderPageReady(page);

  // 创建抽屉截图须在 demo-provider 不存在时拍摄，避免「名称已存在」校验
  await ensureDemoProviderAbsent(page);
  await providerPage.gotoProvidersPage(page);
  await ensureProviderPageReady(page);
  await providerPage.openCreateDrawer(page);
  await providerPage.fillName(page, DEMO_PROVIDER);
  await providerPage.fillDescription(page, '演示用服务商');
  await providerPage.fillInstanceRow(page, 0, {
    addr: DEMO_BACKEND_ADDR,
    port: DEMO_BACKEND_PORT,
    weight: 100,
  });
  await page.waitForTimeout(500);
  const upsertDrawer = resourcePage
    .ivuDrawer(page)
    .active()
    .locator('.ivu-drawer-content')
    .first();
  await setViewport(page, 1600, 1400);
  await screenshotElement(upsertDrawer, '04-provider-upsert.png');
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    resourcePage.ivuDrawer(page).active().locator('.ivu-drawer-close').first(),
    '关闭服务商创建抽屉',
  );

  await ensureDemoProvider(page);
  await providerPage.gotoProvidersPage(page);
  await ensureProviderPageReady(page);
  await page.waitForTimeout(800);
  await screenshot(page, '04-provider-list.png');
  await providerPage.openViewDrawer(page, DEMO_PROVIDER);
  await page.waitForTimeout(800);
  const viewDrawer = resourcePage
    .ivuDrawer(page)
    .active()
    .locator('.ivu-drawer-content')
    .first();
  await screenshotElement(viewDrawer, '04-provider-view.png');
  await ensureProviderPageReady(page);
  await safeClick(
    page,
    resourcePage.ivuDrawer(page).active().locator('.ivu-drawer-close').first(),
    '关闭服务商详情',
  );

  await providerPage.gotoProvidersPage(page);
  await ensureProviderPageReady(page);
  await providerPage.filterListSearch(page, '名称', DEMO_PROVIDER);
  await page.waitForTimeout(600);
  await providerPage.openPricingTiersDrawer(page, DEMO_PROVIDER);
  await page.waitForTimeout(800);
  const pricingDrawer = resourcePage
    .ivuDrawer(page)
    .active()
    .locator('.ivu-drawer-content')
    .first();
  await screenshotElement(pricingDrawer, '04-provider-pricing-tiers.png');
  await ensureProviderPageReady(page);
  await safeClick(
    page,
    resourcePage.ivuDrawer(page).active().locator('.ivu-drawer-close').first(),
    '关闭分段计价',
  );
}

async function captureClusterWizardScreenshots(page) {
  common.log('=== 集群向导截图 ===');
  await preparePage(page);
  await ensureDemoProvider(page);
  await gotoClusterPageWithSessionRetry(page);
  await screenshot(page, '04-cluster-list.png');
  await resourcePage.openCreateBusinessClusterDrawer(page);
  await page.waitForTimeout(600);

  // 第 1 步：先填示例值再截图，与 11.3 章 demo-cluster 一致
  await resourcePage.fillBasicStep(page, {
    clusterName: DEMO_CLUSTER,
    protocol: 'https',
    stickySessionsEnabled: '停用',
  });
  await page.waitForTimeout(600);
  await screenshot(page, '04-cluster-wizard-base.png');
  await resourcePage.clickWizardNext(page);

  // Step 2 defaults
  await page.waitForTimeout(600);
  await screenshot(page, '04-cluster-wizard-timeout.png');
  await resourcePage.clickWizardNext(page);

  // Step 3
  await resourcePage.fillHealthStep(page, {
    failureThreshold: 3,
    healthInterval: 1000,
    healthHost: '',
    healthUri: '/',
    expectedStatus: 0,
  });
  await page.waitForTimeout(600);
  await screenshot(page, '04-cluster-wizard-healthcheck.png');
  await resourcePage.clickWizardNext(page);
  await page.waitForTimeout(800);

  // Step 4 大模型配置（0.0.8 已无实例配置步骤）
  await setViewport(page, 1600, 1400);

  const drawer = resourcePage.ivuDrawer(page).active();
  const drawerContent = drawer.locator('.ivu-drawer-content').first();

  try {
    await resourcePage.fillModelStep(page, {
      provider: DEMO_PROVIDER,
      modelName: DEMO_MODEL,
      stripPrefix: false,
    });
  } catch (e) {
    common.log('fillModelStep failed (non-critical): ' + e.message);
  }

  await page.waitForTimeout(500);
  await screenshotElement(drawerContent, '04-cluster-wizard-model.png');

  await resourcePage.clickWizardNext(page);
  await page.waitForTimeout(1500);
  await screenshotElement(drawerContent, '04-cluster-wizard-review.png');

  // Reset viewport
  await setViewport(page, 1920, 1080);

  // Close drawer via X button
  await safeClick(
    page,
    drawer.locator('.ivu-drawer-close').first(),
    '关闭抽屉',
  );
}

async function captureRouteRuleScreenshot(page) {
  common.log('=== 路由规则表单截图 ===');
  await preparePage(page);
  await page.goto(`${baseUrl}/route-tables`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Try to open global route table detail
  try {
    await routePage.openRouteTableDetail(page, 'Global', 'global');
    await page.waitForTimeout(800);
  } catch (e) {
    common.log('openRouteTableDetail failed (non-critical): ' + e.message);
  }

  // Click "进入编辑模式" if available
  const editModeBtn = page.getByRole('button', { name: '进入编辑模式' });
  if (await editModeBtn.isVisible().catch(() => false)) {
    await editModeBtn.click();
    await page.waitForTimeout(500);
  }

  // Click "添加规则"
  const addRuleBtn = page.getByRole('button', { name: '添加规则' });
  if (await addRuleBtn.isVisible().catch(() => false)) {
    await addRuleBtn.click();
    await page.waitForTimeout(800);
  }

  await screenshot(page, '06-rule-form.png');
}

async function captureModelPriceScreenshots(page) {
  common.log('=== 模型定价截图 ===');
  await preparePage(page);
  await umUtils.ensureLoggedIn(page).catch(() => {});
  await page.goto(`${baseUrl}/model-prices`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await screenshot(page, '11-model-price-list.png');

  // View detail
  const viewBtn = page.getByRole('button', { name: '详情' }).first();
  if (!(await viewBtn.isVisible().catch(() => false))) {
    const legacyViewBtn = page.getByRole('button', { name: '查看' }).first();
    if (await legacyViewBtn.isVisible().catch(() => false)) {
      await legacyViewBtn.click();
    }
  } else {
    await viewBtn.click();
  }
  if (await page.locator('.ivu-drawer-wrap:visible').count()) {
    await page.waitForTimeout(1000);
    const viewDrawer = resourcePage
      .ivuDrawer(page)
      .active()
      .locator('.ivu-drawer-content')
      .first();
    await screenshotElement(viewDrawer, '11-model-price-view.png');
    await safeClick(
      page,
      resourcePage.ivuDrawer(page).active().locator('.ivu-drawer-close').first(),
      '关闭详情',
    );
  }

  // Create pricing — capture full drawer including 默认价格 / 分时段价格
  const createBtn = page.getByRole('button', { name: /新增定价/ });
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(1000);
    const drawerBody = resourcePage
      .ivuDrawer(page)
      .active()
      .locator('.ivu-drawer-body')
      .first();
    await drawerBody.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(400);
    await setViewport(page, 1600, 1400);
    const upsertDrawer = resourcePage
      .ivuDrawer(page)
      .active()
      .locator('.ivu-drawer-content')
      .first();
    await screenshotElement(upsertDrawer, '11-model-price-upsert.png');
    await setViewport(page, 1920, 1080);

    const cancelBtn = page
      .locator('.ivu-drawer-wrap:visible')
      .getByRole('button', { name: '取消' })
      .first();
    await safeClick(page, cancelBtn, '取消创建');
  }

  // Import
  const importBtn = page.getByRole('button', { name: 'YAML 导入' });
  if (await importBtn.isVisible().catch(() => false)) {
    await importBtn.click();
    await page.waitForTimeout(1000);
    await screenshot(page, '11-model-price-import.png');

    // Cancel/close
    const closeBtn = page
      .locator('.ivu-modal-wrap:visible')
      .getByRole('button', { name: '取消' })
      .first();
    await safeClick(page, closeBtn, '取消导入');
  }
}

/** 清除成功提示（ivu-message / ivu-notice），避免截图带出「创建成功」气泡 */
async function dismissMessages(page) {
  for (let i = 0; i < 5; i += 1) {
    const count = await page
      .locator('.ivu-message, .ivu-notice')
      .count()
      .catch(() => 0);
    if (!count) {
      return;
    }
    await page.evaluate(() => {
      document
        .querySelectorAll('.ivu-message, .ivu-notice')
        .forEach((el) => el.remove());
    });
    await page.waitForTimeout(300);
  }
}

/**
 * 列表按 id 升序，新建的演示组织排在最后，1280x720 首屏装不下；
 * 且新增「描述」列后表格宽度超出 1280，操作列会被裁掉。
 * 这里按表格内容宽度 + 分页控件底部动态放大视口，
 * 保证「无过滤、展示全部行与操作列」的原貌。
 */
async function fitViewportForEntityList(page, minWidth = 1280) {
  const contentWidth = await page.evaluate(() => {
    const headers = document.querySelectorAll(
      '.page-table .ivu-table-header th, .page-table .show-iView-Table th',
    );
    if (!headers.length) {
      return 0;
    }
    const last = headers[headers.length - 1].getBoundingClientRect();
    return last.right + 24;
  });
  const pagination = entityPage.entityOrgTable(page).pagination();
  const box = await pagination.boundingBox().catch(() => null);
  const current = page.viewportSize();
  let height = current.height;
  if (box && box.y + box.height + 24 > height) {
    height = Math.ceil(box.y + box.height + 24);
  }
  const width = Math.max(minWidth, Math.ceil(contentWidth));
  common.log(`列表截图视口: ${width} x ${height}`);
  await setViewport(page, width, height);
}

/** 清理演示数据，保证脚本可重复执行且不污染环境 */
async function cleanupDemoEntityOrg(page) {
  if (await entityPage.findEntityByNameViaApi(page, DEMO_ENTITY_NAME)) {
    await entityPage.deleteEntityByNameViaApi(page, DEMO_ENTITY_NAME);
  }
  if (
    await entityPage.fetchEntityTypeByNameViaApi(page, DEMO_ENTITY_TYPE_NAME)
  ) {
    await entityPage.deleteEntityTypeViaApi(page, DEMO_ENTITY_TYPE_NAME);
  }
}

async function captureEntityScreenshots(page) {
  common.log('=== Entity 组织管理截图（列表 / 创建 / 详情 / 配额）===');
  await preparePage(page);

  // 演示数据对齐手册 08-entity：team 类型（级别 3）+ dev-team（描述=研发团队）
  await entityPage.gotoEntityTypeManagementPage(page);
  await page.waitForTimeout(500);
  await cleanupDemoEntityOrg(page);
  const typeCreated = await entityPage.createEntityTypeViaApi(
    page,
    DEMO_ENTITY_TYPE_NAME,
    DEMO_ENTITY_TYPE_DESC,
    DEMO_ENTITY_TYPE_LEVEL,
  );
  if (!typeCreated) {
    common.log('演示 Entity 类型创建失败，创建截图的类型下拉可能为空');
  }

  await entityPage.gotoEntityOrgManagementPage(page);
  await page.waitForTimeout(800);

  // 1) 创建抽屉：填「名称 / 描述 / 类型」后截图，与手册 9.2 示例一致
  await entityPage.openCreateEntityDrawer(page);
  await entityPage.fillEntityFormBasic(page, {
    name: DEMO_ENTITY_NAME,
    typeName: DEMO_ENTITY_TYPE_NAME,
  });
  await entityPage.fillEntityDescription(page, DEMO_ENTITY_DESC);
  await page.waitForTimeout(500);
  await dismissMessages(page);
  await setViewport(page, 1280, 720);
  await screenshot(page, '05-org-create.png');

  // 2) 配额信息：切到「无限配额 = 否」并放大视口，完整展示表单
  await entityPage.selectEntityQuotaUnlimited(page, '否');
  await page.waitForTimeout(500);
  await setViewport(page, 1920, 1080);
  await screenshot(page, '05-org-quota.png');

  // 3) 还原为无限配额后提交，截列表（含「描述」列）
  await entityPage.selectEntityQuotaUnlimited(page, '是');
  await setViewport(page, 1280, 720);
  await page.waitForTimeout(500);
  await entityPage.submitEntityFormAndWaitForSuccess(page);
  await page.waitForTimeout(800);
  await dismissMessages(page);
  await fitViewportForEntityList(page);
  await screenshot(page, '05-org-list.png');

  // 4) 详情抽屉：基本信息中的「描述」行
  await setViewport(page, 1280, 720);
  await entityPage.openEntityDetail(page, DEMO_ENTITY_NAME);
  await page.waitForTimeout(800);
  await dismissMessages(page);
  await screenshot(page, '05-org-detail.png');
  await entityPage.closeEntityDetail(page);
  await page.waitForTimeout(500);

  // 5) 清理演示数据
  await cleanupDemoEntityOrg(page);
  await entityPage.gotoEntityOrgManagementPage(page);
  await page.waitForTimeout(500);
}

async function captureApiKeyQuotaScreenshots(page) {
  common.log('=== API Key 配额与限流截图 ===');
  await preparePage(page);
  await entityPage.gotoApiKeyManagementPage(page);
  await page.waitForTimeout(800);

  const createBtn = page.getByRole('button', { name: '创建' });
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(1000);

    // Select "否" for unlimited quota
    await selectDropdownOption(page, '无限配额', '否');

    await page.waitForTimeout(500);
    await screenshot(page, '05-apikey-create.png');

    // Scroll to and enable rate limiting section
    const drawerBody = page
      .locator('.ivu-drawer-wrap:visible')
      .locator('.ivu-drawer-body')
      .first();
    await drawerBody.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(500);

    await selectDropdownOption(page, '启用限流', '是');
    await page.waitForTimeout(800);

    // Expand TPM rules area to show the rule configuration
    const tpmTitle = page
      .locator('h4.rules-title')
      .filter({ hasText: 'TPM规则' })
      .first();
    if (await tpmTitle.isVisible().catch(() => false)) {
      await tpmTitle.click();
      await page.waitForTimeout(800);
    }

    // Use a tall viewport so the entire form including rate limit rules fits in the drawer
    await setViewport(page, 1600, 1900);
    await page.waitForTimeout(300);
    const drawer = resourcePage.ivuDrawer(page).active();
    const drawerContent = drawer.locator('.ivu-drawer-content').first();
    await screenshotElement(drawerContent, '05-apikey-ratelimit.png');

    // Cancel
    const cancelBtn = page
      .locator('.ivu-drawer-wrap:visible')
      .getByRole('button', { name: '取消' })
      .first();
    await safeClick(page, cancelBtn, '取消创建');
  }
}

async function captureResetQuotaScreenshots(page) {
  common.log('=== 重置配额截图 ===');
  await preparePage(page);

  // Entity reset: create a new entity with finite quota via UI to ensure reset button is visible
  const typeName = `screenshot-type-${Date.now()}`;
  const entityName = `screenshot-ent-${Date.now()}`;
  try {
    await entityPage.gotoEntityTypeManagementPage(page);
    await page.waitForTimeout(800);
    await entityPage.createEntityTypeViaUI(page, typeName, '截图类型', 1);

    await entityPage.gotoEntityOrgManagementPage(page);
    await page.waitForTimeout(800);
    await entityPage.createEntityWithQuotaViaUI(page, entityName, typeName, {
      unlimited: false,
      total: 1000000,
      unit: 'RMB',
      resetCycle: '每月',
    });
    await page.waitForTimeout(1000);

    await entityPage.searchEntityByName(page, entityName);
    await page.waitForTimeout(500);
    const entityRow = page
      .locator('table tbody tr.ivu-table-row')
      .filter({ hasText: entityName })
      .first();
    await entityRow.locator('td').nth(1).click();
    await page.waitForTimeout(800);

    const resetBtn = page
      .locator('.ivu-drawer-wrap:visible')
      .getByRole('button', { name: '重置配额' })
      .first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(800);
      await screenshot(page, '05-org-reset-quota.png');

      const cancelBtn = page
        .locator('.ivu-modal-wrap:visible')
        .getByRole('button', { name: '取消' })
        .first();
      await safeClick(page, cancelBtn, '取消重置');
    }

    const closeBtn = page
      .locator('.ivu-drawer-wrap:visible')
      .locator('.ivu-drawer-close')
      .first();
    await safeClick(page, closeBtn, '关闭详情');
  } catch (e) {
    common.log('Entity reset quota screenshot failed: ' + e.message);
  } finally {
    try {
      await entityPage.gotoEntityOrgManagementPage(page);
      await page.waitForTimeout(500);
      await entityPage.deleteEntityAndWait(page, entityName);
    } catch (e) {
      common.log('Entity cleanup failed: ' + e.message);
    }
    try {
      await entityPage.gotoEntityTypeManagementPage(page);
      await page.waitForTimeout(500);
      await entityPage.deleteEntityType(page, typeName);
    } catch (e) {
      common.log('Entity type cleanup failed: ' + e.message);
    }
  }

  // API Key reset
  await entityPage.gotoApiKeyManagementPage(page);
  await page.waitForTimeout(800);
  const keyDescCell = page
    .locator('table tbody tr')
    .first()
    .locator('td')
    .nth(2);
  const keyDesc = await keyDescCell.textContent().catch(() => null);
  if (keyDesc) {
    try {
      await entityPage.openApiKeyDetail(page, keyDesc.trim());
      await page.waitForTimeout(800);

      const resetBtn = page
        .locator('.ivu-drawer-wrap:visible')
        .getByRole('button', { name: '重置配额' })
        .first();
      if (await resetBtn.isVisible().catch(() => false)) {
        await resetBtn.click();
        await page.waitForTimeout(800);
        await screenshot(page, '05-apikey-reset-quota.png');

        const cancelBtn = page
          .locator('.ivu-modal-wrap:visible')
          .getByRole('button', { name: '取消' })
          .first();
        await safeClick(page, cancelBtn, '取消重置');
      }

      const closeBtn = page
        .locator('.ivu-drawer-wrap:visible')
        .locator('.ivu-drawer-close')
        .first();
      await safeClick(page, closeBtn, '关闭详情');
    } catch (e) {
      common.log('API Key reset quota screenshot failed: ' + e.message);
    }
  }
}

(async () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const only = (process.argv.find((a) => a.startsWith('--only=')) || '')
    .split('=')[1]
    .trim();

  const allTasks = [
    { name: 'provider', fn: captureProviderScreenshots },
    { name: 'cluster', fn: captureClusterWizardScreenshots },
    { name: 'route', fn: captureRouteRuleScreenshot },
    { name: 'model-price', fn: captureModelPriceScreenshots },
    { name: 'entity', fn: captureEntityScreenshots },
    { name: 'api-key', fn: captureApiKeyQuotaScreenshots },
    { name: 'reset-quota', fn: captureResetQuotaScreenshots },
  ];

  const tasks = only
    ? allTasks.filter((t) => t.name === only).map((t) => t.fn)
    : allTasks.map((t) => t.fn);

  if (only && !tasks.length) {
    console.error(
      '未知 --only 参数: ' +
        only +
        '，可选: ' +
        allTasks.map((t) => t.name).join(', '),
    );
    process.exit(1);
  }

  for (const task of tasks) {
    try {
      await task(page);
    } catch (e) {
      console.error(`Task failed: ${task.name}`, e.message);
    }
  }

  await browser.close();
  console.log('All screenshots captured.');
})();
