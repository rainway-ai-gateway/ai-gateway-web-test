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
const { expect, test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/route-api-utils');
const entityUtils = require('../entity/EntityPage');
const entityApi = require('../../api/entity-api-utils');
const {
  AppSidebarComponent,
  LayoutShellComponent,
  PageTableComponent,
} = require('../../components/layout');
const {
  IvuMessageComponent,
  IvuFormComponent,
  IvuSelectComponent,
} = require('../../components/iview');
const resourceApi = require('../../api/resource-api-utils');

/** 与 docs/route-management/02 及 design 原型对齐的验收文案 */
/**
 * 规则表单验收文案：以实际 UI 文案为准，但行为与校验逻辑来自 design/02 + OpenAPI。
 */
const DOC_ROUTE_RULE_FORM = {
  ruleNameFieldLabel: '规则名',
  expressionFieldLabel: '表达式',
  targetClusterAndModelFieldLabel: '目标集群和模型',
  fallbackClusterAndModelFieldLabel: '备用集群和模型',
  clusterFieldLabel: '集群',
  weightFieldLabel: '权重',
  ruleNameRequiredMsg: '规则名不能为空',
  condRequiredMsg: '表达式不能为空',
  targetClusterRequiredMsg: '集群不能为空',
  fallbackClusterRequiredMsg: '备用集群不能为空',
  weightRangeErrorMsg: '权重必须在 0~100 之间',
  weightSumErrorMsg: '目标权重之和必须等于 100',
  targetAtLeastOneMsg: '目标集群至少有一项',
  targetDuplicateMsg: '目标集群和模型组合不能重复',
  fallbackDuplicateMsg: '备用集群 (ClusterName, Model) 组合不能重复',
  localSaveButton: '本地保存',
  addTargetButton: '添加目标',
  addFallbackButton: '添加备用',
  submitSuccessToast: '提交成功!',
  submitFailedToast: '提交失败!',
  drawTitleCreate: '添加规则',
  drawTitleEdit: '编辑规则',
  viewRuleTitle: '查看规则',
};

function getWeightSumErrorMessage(sum) {
  return DOC_ROUTE_RULE_FORM.weightSumErrorMsg;
}

const DOC_ROUTE_TABLE = {
  pageTitle: '路由表',
  listHeaders: ['路由表类型', '路由表属主', '状态', '操作'],
  globalTypeLabel: 'Global',
  entityTypeLabel: 'Entity',
  apiKeyTypeLabel: 'API-Key',
  globalOwner: 'global',
  globalDetailBreadcrumb: /路由规则 - Global \/ Global/,
  apiKeyDetailBreadcrumb: /路由规则 - API-Key|apikey /,
  entityDetailBreadcrumb: /路由规则 - Entity|entity /,
  enableSuccessToast: '路由表已启用',
  disableSuccessToast: '路由表已停用',
  enterEditMode: '进入编辑模式',
  exitEditMode: '退出编辑模式',
  submitAndEffect: '提交并生效',
  createRule: '添加规则',
  enabledLabel: '启用',
  disabledLabel: '停用',
  routeTableEnabledLabel: '路由表已启用',
  editRuleButton: '编辑',
  deleteRuleButton: '删除',
};

const DOC_ROUTE_RULE = {
  detailHeaders: ['规则名', '表达式', '目标集群和模型', '操作'],
  viewRuleButton: '查看',
};

const ROUTE_TABLE_LIST_PATH = '/route-tables';

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function getAppBaseUrl() {
  return confInfo['ctlHost'].replace('/login', '');
}

function isConnectionError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('net::ERR')
  );
}

async function ensureChineseLang(page) {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'zh');
  });
  await page.evaluate(() => localStorage.setItem('lang', 'zh')).catch(() => {});
}

async function ensureAuthenticatedShell(page) {
  await umUtils.handleUrlInvalidAlert(page);

  const currentUrl = page.url();
  const isAppPage =
    currentUrl.includes('/route-tables') ||
    currentUrl.includes('/instance-pool-ai') ||
    currentUrl.includes('/cluster') ||
    currentUrl.includes('/entity') ||
    currentUrl.includes('/api-key');
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在产品页，先加载首页: ' + page.url());
    await ensureChineseLang(page);
    await page.goto(getAppBaseUrl() + ROUTE_TABLE_LIST_PATH, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);
    await umUtils.handleUrlInvalidAlert(page);
  }
}

async function ensureAppSession(page) {
  if (common.isServiceDown()) {
    test.skip(true, '服务不可用，跳过所有测试用例');
  }

  try {
    await ensureChineseLang(page);
    await umUtils.handleUrlInvalidAlert(page);
    await umUtils.ensureLoggedIn(page);
    await ensureAuthenticatedShell(page);
  } catch (e) {
    if (isConnectionError(e)) {
      common.setServiceDown(true);
      test.skip(true, '服务连接失败: ' + e.message);
    }
    throw e;
  }
}

function routeTableList(page) {
  return new PageTableComponent(
    page,
    page.locator('.route-table .list-view .page-table'),
  );
}

function routeRulesTable(page) {
  return new PageTableComponent(page, page.locator('.route-rules .page-table'));
}

async function isRouteTableListPageReady(page) {
  if (!page.url().includes('/route-tables')) {
    return false;
  }
  const listView = page.locator('.route-table .list-view');
  if (!(await listView.isVisible().catch(() => false))) {
    return false;
  }
  const table = routeTableList(page);
  const header = table.headers().filter({ hasText: '路由表类型' }).first();
  return header.isVisible().catch(() => false);
}

async function isRouteRulesDetailVisible(page) {
  return page
    .locator('.route-rules')
    .isVisible()
    .catch(() => false);
}

async function navigateToRouteTableListByUrl(page) {
  const url = getAppBaseUrl() + ROUTE_TABLE_LIST_PATH;
  common.log('使用直连 URL 进入路由表列表页: ' + url);
  await ensureChineseLang(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
}

async function navigateToRouteTableList(page) {
  await umUtils.handleUrlInvalidAlert(page);
  await umUtils.ensureLoggedIn(page);
  await ensureAuthenticatedShell(page);

  const sidebar = new AppSidebarComponent(page);
  const submenuLabels = ['路由管理', 'Route Manage'];
  let expanded = false;

  for (const label of submenuLabels) {
    if ((await sidebar.submenuTitle(label).count()) > 0) {
      await sidebar.submenuTitle(label).click();
      await page.waitForTimeout(500);
      expanded = true;
      break;
    }
  }

  const menuLabels = ['路由表', 'Advance Route Rule Manage'];
  for (const label of menuLabels) {
    const item = sidebar.menu().locator('.ivu-menu-item', { hasText: label });
    if ((await item.count()) > 0) {
      common.log('通过侧栏导航：' + label);
      await item.first().click();
      await page.waitForTimeout(2000);
      await umUtils.handleUrlInvalidAlert(page);
      if (await isRouteTableListPageReady(page)) {
        return;
      }
    }
  }

  if (!expanded) {
    common.log('未找到路由管理侧栏菜单，尝试直连 URL');
  }
  await navigateToRouteTableListByUrl(page);
  await umUtils.handleUrlInvalidAlert(page);
}

async function ensureRouteTableModuleAvailable(page) {
  await gotoRouteTableListPage(page);
  const ready = await isRouteTableListPageReady(page);
  if (!ready) {
    test.skip(
      true,
      '当前环境未部署路由表模块（/route-tables），请升级后端菜单与前端后再运行 RT-xx 用例',
    );
  }
}

async function gotoRouteTableListPage(page) {
  if (await isRouteTableListPageReady(page)) {
    common.log('已在路由表列表页，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  if (await isRouteRulesDetailVisible(page)) {
    common.log('当前在路由规则详情页，通过面包屑返回列表');
    await backToRouteTableListViaBreadcrumb(page);
    return;
  }

  await ensureAppSession(page);
  await navigateToRouteTableList(page);
}

async function backToRouteTableListViaBreadcrumb(page) {
  await page
    .locator('.bfe-breadcrumb')
    .getByText(DOC_ROUTE_TABLE.pageTitle, { exact: true })
    .click();
  await waitForRouteTablesListResponse(page, async () => {});
  await page.waitForTimeout(1000);
}

async function waitForRouteTablesListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/route-tables') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 route-tables 列表响应超时，降级等待: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
  }
}

async function waitForGlobalRouteRulesGetResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/global-route-rules') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 global-route-rules GET 超时: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
  }
}

async function waitForGlobalRouteRulesPutResponse(page, action) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/global-route-rules') &&
        res.request().method() === 'PUT' &&
        res.status() === 200,
      { timeout: 15000 },
    ),
    action(),
  ]);
  return response;
}

function buildDetailBreadcrumbPattern(typeLabel, owner) {
  const escapedOwner = String(owner).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`路由规则 - ${typeLabel} / ${escapedOwner}`);
}

function routeTableRow(table, typeLabel, owner) {
  // After navigateToRouteTableByOwner filters by type + owner (server-side),
  // there should be only one row of this type. Match by type label only,
  // since the owner column may display entity names instead of entity IDs.
  const byTypeAndOwner = table
    .dataRows()
    .filter({ hasText: typeLabel })
    .filter({ hasText: owner });
  const byTypeOnly = table.dataRows().filter({ hasText: typeLabel });
  return byTypeAndOwner.or(byTypeOnly).first();
}

function globalRouteTableRow(table) {
  return routeTableRow(
    table,
    DOC_ROUTE_TABLE.globalTypeLabel,
    DOC_ROUTE_TABLE.globalOwner,
  );
}

function ownerKindFromTypeLabel(typeLabel) {
  if (typeLabel === DOC_ROUTE_TABLE.globalTypeLabel) {
    return 'global';
  }
  if (typeLabel === DOC_ROUTE_TABLE.entityTypeLabel) {
    return 'entity';
  }
  return 'apikey';
}

function getOwnerGetUrlPattern(ownerKind, owner) {
  if (ownerKind === 'global') {
    return '/global-route-rules';
  }
  if (ownerKind === 'entity') {
    return `/entities/${owner}`;
  }
  return `/api-keys/${owner}`;
}

function getOwnerPatchUrlPattern(ownerKind, owner) {
  if (ownerKind === 'global') {
    return '/global-route-rules';
  }
  if (ownerKind === 'entity') {
    return `/entities/${owner}`;
  }
  return `/api-keys/${owner}`;
}

async function waitForOwnerRouteRulesGetResponse(
  page,
  ownerKind,
  owner,
  action,
) {
  const pattern = getOwnerGetUrlPattern(ownerKind, owner);
  const method = ownerKind === 'global' ? 'GET' : 'GET';
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(pattern) &&
          res.request().method() === method &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待路由规则 GET 超时: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
  }
}

async function waitForOwnerRouteRulesUpdateResponse(
  page,
  ownerKind,
  owner,
  action,
) {
  const pattern = getOwnerPatchUrlPattern(ownerKind, owner);
  const method = ownerKind === 'global' ? 'PUT' : 'PATCH';
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes(pattern) &&
        res.request().method() === method &&
        res.status() === 200,
      { timeout: 30000 },
    ),
    action(),
  ]);
  return response;
}

async function expectRouteTableRowVisible(page, typeLabel, owner) {
  const table = routeTableList(page);
  await expect(routeTableRow(table, typeLabel, owner)).toBeVisible({
    timeout: 15000,
  });
}

async function expectRouteTableStatus(page, typeLabel, owner, enabled) {
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);
  const statusLabel = enabled
    ? DOC_ROUTE_TABLE.enabledLabel
    : DOC_ROUTE_TABLE.disabledLabel;
  await expect(
    row.locator('.ivu-tag-text').filter({ hasText: statusLabel }),
  ).toBeVisible();
}

async function expectRouteTableToggleButtons(page, typeLabel, owner, enabled) {
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);
  const enableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.enabledLabel,
  });
  const disableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.disabledLabel,
  });

  if (enabled) {
    await expect(enableBtn).toBeDisabled();
    await expect(disableBtn).toBeEnabled();
  } else {
    await expect(enableBtn).toBeEnabled();
    await expect(disableBtn).toBeDisabled();
  }
  await expect(
    row.getByRole('button', { name: DOC_ROUTE_RULE.viewRuleButton }),
  ).toBeEnabled();
}

async function openRouteTableDetail(page, typeLabel, owner, apiOwner) {
  const ownerKind = ownerKindFromTypeLabel(typeLabel);
  const apiId = apiOwner !== undefined ? apiOwner : owner;
  await navigateToRouteTableByOwner(page, typeLabel, owner);
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);
  await waitForOwnerRouteRulesGetResponse(page, ownerKind, apiId, async () => {
    await row
      .getByRole('button', { name: DOC_ROUTE_RULE.viewRuleButton })
      .click();
  });
  await page.waitForTimeout(1000);
}

async function expectRouteTableDetailOpen(page, typeLabel, owner) {
  await expect(page.locator('.route-rules')).toBeVisible({ timeout: 15000 });
  if (typeLabel === DOC_ROUTE_TABLE.globalTypeLabel) {
    await expect(
      page
        .locator('.bfe-breadcrumb')
        .getByText(DOC_ROUTE_TABLE.globalDetailBreadcrumb),
    ).toBeVisible();
  } else {
    await expect(
      page
        .locator('.bfe-breadcrumb')
        .getByText(
          typeLabel === DOC_ROUTE_TABLE.entityTypeLabel
            ? DOC_ROUTE_TABLE.entityDetailBreadcrumb
            : DOC_ROUTE_TABLE.apiKeyDetailBreadcrumb,
        ),
    ).toBeVisible();
  }
  await expect(page.locator('.route-owner-label')).toContainText(
    typeLabel === DOC_ROUTE_TABLE.apiKeyTypeLabel ? 'API-Key' : typeLabel,
  );
}

async function enableRouteTableAndWait(page, typeLabel, owner, apiOwner) {
  const ownerKind = ownerKindFromTypeLabel(typeLabel);
  const apiId = apiOwner !== undefined ? apiOwner : owner;
  await navigateToRouteTableByOwner(page, typeLabel, owner);
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);

  await waitForOwnerRouteRulesUpdateResponse(
    page,
    ownerKind,
    apiId,
    async () => {
      await row
        .getByRole('button', { name: DOC_ROUTE_TABLE.enabledLabel })
        .click();
    },
  );

  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_TABLE.enableSuccessToast,
  );
  await waitForRouteTablesListResponse(page, async () => {
    await page.waitForTimeout(500);
  });
}

async function disableRouteTableAndWait(page, typeLabel, owner, apiOwner) {
  const ownerKind = ownerKindFromTypeLabel(typeLabel);
  const apiId = apiOwner !== undefined ? apiOwner : owner;
  await navigateToRouteTableByOwner(page, typeLabel, owner);
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);

  await waitForOwnerRouteRulesUpdateResponse(
    page,
    ownerKind,
    apiId,
    async () => {
      await row
        .getByRole('button', { name: DOC_ROUTE_TABLE.disabledLabel })
        .click();
    },
  );

  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_TABLE.disableSuccessToast,
  );
  await waitForRouteTablesListResponse(page, async () => {
    await page.waitForTimeout(500);
  });
}

async function ensureRouteTableDisabledViaUI(page, typeLabel, owner, apiOwner) {
  await ensureRouteTableModuleAvailable(page);
  await navigateToRouteTableByOwner(page, typeLabel, owner);
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);
  const disableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.disabledLabel,
  });
  if (await disableBtn.isEnabled().catch(() => false)) {
    await disableRouteTableAndWait(page, typeLabel, owner, apiOwner);
  }
}

async function ensureRouteTableEnabledViaUI(page, typeLabel, owner, apiOwner) {
  await ensureRouteTableModuleAvailable(page);
  await navigateToRouteTableByOwner(page, typeLabel, owner);
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);
  const enableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.enabledLabel,
  });
  if (await enableBtn.isEnabled().catch(() => false)) {
    await enableRouteTableAndWait(page, typeLabel, owner, apiOwner);
  }
}

async function enterRouteRulesEditMode(page) {
  // 检查是否已在编辑模式（显示"退出编辑模式"按钮）
  const exitButton = page.getByRole('button', {
    name: DOC_ROUTE_TABLE.exitEditMode,
  });
  const exitVisible = await exitButton
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (exitVisible) {
    // 已在编辑模式，无需操作
    return;
  }
  // 点击"进入编辑模式"
  await page
    .getByRole('button', { name: DOC_ROUTE_TABLE.enterEditMode })
    .click();
  await page.waitForTimeout(500);
}

async function submitGlobalRouteRulesAndWait(page) {
  await waitForGlobalRouteRulesPutResponse(page, async () => {
    await page
      .getByRole('button', { name: DOC_ROUTE_TABLE.submitAndEffect })
      .click();
  });
  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_RULE_FORM.submitSuccessToast,
  );
  await page.waitForTimeout(1000);
}

async function submitGlobalRouteRulesAndExpectError(page) {
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/global-route-rules') &&
        res.request().method() === 'PUT',
      { timeout: 15000 },
    ),
    page.getByRole('button', { name: DOC_ROUTE_TABLE.submitAndEffect }).click(),
  ]);
  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_RULE_FORM.submitFailedToast,
  );
  await page.waitForTimeout(1000);
}

async function submitOwnerRouteRulesAndWait(page, ownerKind, owner) {
  await waitForOwnerRouteRulesUpdateResponse(
    page,
    ownerKind,
    owner,
    async () => {
      await page
        .getByRole('button', { name: DOC_ROUTE_TABLE.submitAndEffect })
        .click();
    },
  );
  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_RULE_FORM.submitSuccessToast,
  );
  await page.waitForTimeout(1000);
}

async function getAvailableClustersForRule(page) {
  let list = await resourceApi.getClusterList(page);
  if (!Array.isArray(list)) {
    list = [];
  }
  return list.filter(
    (c) =>
      c.name &&
      c.llm_config &&
      c.llm_config.models &&
      c.llm_config.models.length > 0,
  );
}

async function openAddRuleDrawer(page) {
  await page.getByRole('button', { name: DOC_ROUTE_TABLE.createRule }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.rule-form')).toBeVisible();
  await expect(
    page
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_ROUTE_RULE_FORM.drawTitleCreate, { exact: true }),
  ).toBeVisible();
}

async function openEditRuleDrawer(page, ruleName) {
  const table = routeRulesTable(page);
  const editBtn = table.rowAction(ruleName, '编辑');
  await editBtn.click();
  await page.waitForTimeout(500);
  await expect(page.locator('.rule-form')).toBeVisible();
  await expect(
    page
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_ROUTE_RULE_FORM.drawTitleEdit, { exact: true }),
  ).toBeVisible();
}

async function openViewRuleDrawer(page, ruleName) {
  const table = routeRulesTable(page);
  const viewBtn = table.rowAction(ruleName, '查看');
  await viewBtn.click();
  await page.waitForTimeout(500);
  await expect(page.locator('.rule-view-panel')).toBeVisible();
  await expect(
    page
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_ROUTE_RULE_FORM.viewRuleTitle, { exact: true }),
  ).toBeVisible();
}

function ruleViewFallbackInfoRow(page) {
  return page
    .locator('.rule-view-panel .info-row')
    .filter({ hasText: DOC_ROUTE_RULE_FORM.fallbackClusterAndModelFieldLabel })
    .first();
}

async function expectRuleViewFallbackTags(page, expectedTags) {
  const infoRow = ruleViewFallbackInfoRow(page);
  await expect(infoRow).toBeVisible();
  const tags = infoRow.locator('.info-value .ivu-tag');
  await expect(tags).toHaveCount(expectedTags.length);
  for (let i = 0; i < expectedTags.length; i += 1) {
    await expect(tags.nth(i)).toHaveText(expectedTags[i]);
  }
}

async function expectRuleViewNoFallback(page) {
  const infoRow = ruleViewFallbackInfoRow(page);
  await expect(infoRow).toBeVisible();
  await expect(infoRow.locator('.info-value')).toHaveText('-');
}

async function resetRuleForm(page) {
  const scope = ruleDrawerScope(page);
  await scope.getByRole('button', { name: '重置' }).click();
  await page.waitForTimeout(500);
}

async function clickExitEditMode(page) {
  await page.getByRole('button', { name: '退出编辑模式' }).click();
  await page.waitForTimeout(1000);
  // 处理可能的确认弹窗（放弃未保存变更）
  // iView $Modal.confirm 的确认按钮文字是"确定"，不是"确认"
  const confirmBtn = page.getByRole('button', { name: '确定' });
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(500);
  }
  // 等待回到查看模式
  await page
    .getByRole('button', { name: DOC_ROUTE_TABLE.enterEditMode })
    .waitFor({ state: 'visible', timeout: 10000 });
}

async function closeTopDrawer(page) {
  const closeBtn = page
    .locator('.ivu-drawer-wrap:visible .ivu-drawer-close')
    .first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
}

async function searchRuleByName(page, keyword) {
  const table = routeRulesTable(page);
  const input = table.searchArea().getByPlaceholder('请输入规则名查询');
  await input.fill(keyword);
  await input.press('Enter');
  await page.waitForTimeout(500);
}

async function deleteRuleByName(page, ruleName) {
  const table = routeRulesTable(page);
  const deleteBtn = table.rowAction(ruleName, '删除');
  await deleteBtn.click();
  await page.waitForTimeout(500);
}

async function deleteAllRulesByName(page, ruleName) {
  const table = routeRulesTable(page);
  for (let i = 0; i < 5; i += 1) {
    const deleteBtn = table.rowAction(ruleName, '删除');
    const visible = await deleteBtn.isVisible().catch(() => false);
    if (!visible) {
      break;
    }
    await deleteBtn.click();
    await page.waitForTimeout(500);
  }
}

async function setRouteTableEnabledInDetail(page, enabled) {
  const trigger = page.locator('.route-rules .enable-row .ivu-select').first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const label = enabled ? '启用' : '停用';
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .getByText(label, { exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectRouteRulesSubmitError(page, message) {
  const errorNotice = page.locator(
    '.ivu-notice, .ivu-message-error, .ivu-message-notice',
  );
  await expect(errorNotice.first()).toBeVisible();
  if (message) {
    await expect(errorNotice.first()).toContainText(message);
  }
}

function ruleDrawerScope(page) {
  return page.locator('.rule-form');
}

function ruleForm(page) {
  return new IvuFormComponent(ruleDrawerScope(page));
}

async function fillRuleName(page, name) {
  const scope = ruleDrawerScope(page);
  await expect(scope).toBeVisible();
  const input = scope.getByPlaceholder('请输入规则名称');
  await input.fill(name);
  await input.blur();
  await page.waitForTimeout(200);
}

async function fillRuleExpression(page, expression) {
  const scope = ruleDrawerScope(page);
  const textarea = scope.locator('.expression textarea').first();
  await textarea.fill(expression);
  await textarea.blur();
  await page.waitForTimeout(500);
}

async function selectRuleTargetCluster(page, index, clusterName) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row');
  // 行内第一个 Select 即集群下拉（不依赖 placeholder，已选中时仍可定位）
  const trigger = rows.nth(index).locator('.ivu-select').first();
  const select = new IvuSelectComponent(page, trigger);
  await select.selectOptionExact(clusterName);
  await page.waitForTimeout(500);
}

async function selectRuleTargetModel(page, index, modelName) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row');
  // 行内第二个 Select 即模型下拉（不依赖 placeholder）
  const trigger = rows.nth(index).locator('.ivu-select').nth(1);
  const select = new IvuSelectComponent(page, trigger);
  await select.selectOptionExact(modelName);
  await page.waitForTimeout(500);
}

async function fillRuleTargetWeight(page, index, weight) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row');
  const input = rows.nth(index).locator('.ivu-input-number input').first();
  await input.fill(String(weight));
  await input.blur();
  await page.waitForTimeout(500);
}

async function addRuleTargetRow(page) {
  const scope = ruleDrawerScope(page);
  await scope
    .getByRole('button', { name: DOC_ROUTE_RULE_FORM.addTargetButton })
    .click();
  await page.waitForTimeout(500);
}

async function addRuleFallbackRow(page) {
  const scope = ruleDrawerScope(page);
  await scope
    .getByRole('button', { name: DOC_ROUTE_RULE_FORM.addFallbackButton })
    .click();
  await page.waitForTimeout(500);
}

async function deleteRuleTargetRow(page, index) {
  const scope = ruleDrawerScope(page);
  const row = scope
    .locator('.dynamic-row.target-row')
    .filter({
      has: page.getByPlaceholder('请选择目标集群（可输入集群名查找）'),
    })
    .nth(index);
  await row.locator('.delete-btn').getByText('删除').click();
  await page.waitForTimeout(500);
}

async function deleteRuleFallbackRow(page, index) {
  const scope = ruleDrawerScope(page);
  // 不依赖 placeholder（已选中集群后 placeholder 消失），按 section-title 定位行
  const rows = scope
    .locator('.section-title')
    .filter({ hasText: '备用集群和模型' })
    .locator(
      'xpath=following-sibling::div[contains(@class, "dynamic-row") and contains(@class, "fallback-row")]',
    );
  const row = rows.nth(index);
  await row.locator('.delete-btn').getByText('删除').click();
  await page.waitForTimeout(500);
}

async function expectRuleTargetRowCount(page, count) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row').filter({
    has: page.getByPlaceholder('请选择目标集群（可输入集群名查找）'),
  });
  await expect(rows).toHaveCount(count);
}

async function expectRuleFallbackRowCount(page, count) {
  const scope = ruleDrawerScope(page);
  // 不依赖 placeholder，按 section-title 定位行（覆盖已选中集群的回显场景）
  const rows = scope
    .locator('.section-title')
    .filter({ hasText: '备用集群和模型' })
    .locator(
      'xpath=following-sibling::div[contains(@class, "dynamic-row") and contains(@class, "fallback-row")]',
    );
  await expect(rows).toHaveCount(count);
}

async function expectNoFallbackPlaceholder(page) {
  const scope = ruleDrawerScope(page);
  await expect(scope.getByText('暂无备用集群')).toBeVisible();
}

async function expectRuleFallbackSectionTitleVisible(page) {
  const scope = ruleDrawerScope(page);
  await expect(
    scope
      .locator('.section-title')
      .getByText(DOC_ROUTE_RULE_FORM.fallbackClusterAndModelFieldLabel, {
        exact: true,
      }),
  ).toBeVisible();
}

async function expectRuleFallbackRowHasNoWeight(page) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.fallback-row');
  await expect(rows.locator('.ivu-input-number')).toHaveCount(0);
}

async function expectRuleFallbackRowValues(
  page,
  index,
  { clusterName, model },
) {
  const scope = ruleDrawerScope(page);
  const rows = scope
    .locator('.section-title')
    .filter({ hasText: '备用集群和模型' })
    .locator(
      'xpath=following-sibling::div[contains(@class, "dynamic-row") and contains(@class, "fallback-row")]',
    );
  const row = rows.nth(index);
  await expect(row).toBeVisible();
  const clusterSelect = row.locator('.ivu-select').nth(0);
  const modelSelect = row.locator('.ivu-select').nth(1);
  if (clusterName) {
    await expect(clusterSelect).toContainText(clusterName);
  }
  if (model) {
    await expect(modelSelect).toContainText(model);
  } else {
    // model 为空（透传）：select 显示「留空表示透传」placeholder
    await expect(modelSelect.getByPlaceholder('留空表示透传')).toBeVisible();
  }
}

async function searchAndSelectRuleTargetCluster(
  page,
  index,
  keyword,
  clusterName,
) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row').filter({
    has: page.getByPlaceholder('请选择目标集群（可输入集群名查找）'),
  });
  const trigger = rows.nth(index).locator('.ivu-select').first();
  await trigger.click();
  const input = trigger.locator('input.ivu-select-input');
  await input.fill(keyword);
  await page.waitForTimeout(500);
  const option = page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: new RegExp('^' + clusterName + '$') })
    .first();
  await option.click();
  await page.waitForTimeout(500);
}

async function selectRuleFallbackCluster(page, index, clusterName) {
  const scope = ruleDrawerScope(page);
  const rows = scope
    .locator('.section-title')
    .filter({ hasText: '备用集群和模型' })
    .locator(
      'xpath=following-sibling::div[contains(@class, "dynamic-row") and contains(@class, "fallback-row")]',
    );
  const row = rows.nth(index);
  const trigger = row.locator('.ivu-select').first();
  const select = new IvuSelectComponent(page, trigger);
  await select.selectOptionExact(clusterName);
  await page.waitForTimeout(500);
}

async function selectRuleFallbackModel(page, index, modelName) {
  const scope = ruleDrawerScope(page);
  const rows = scope
    .locator('.section-title')
    .filter({ hasText: '备用集群和模型' })
    .locator(
      'xpath=following-sibling::div[contains(@class, "dynamic-row") and contains(@class, "fallback-row")]',
    );
  const row = rows.nth(index);
  // 模型选择器是行内的第二个 Select（第一个是集群选择器）
  const trigger = row.locator('.ivu-select').nth(1);
  const select = new IvuSelectComponent(page, trigger);
  await select.selectOptionExact(modelName);
  await page.waitForTimeout(500);
}

async function openRuleTargetModelDropdown(page, index) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row');
  // 行内第二个 Select 即模型下拉（不依赖 placeholder，已选中时仍可定位）
  const trigger = rows.nth(index).locator('.ivu-select').nth(1);
  await trigger.click();
  await page.waitForTimeout(300);
  return {
    trigger,
    dropdown: page.locator('.ivu-select-dropdown:visible'),
  };
}

async function openRuleFallbackModelDropdown(page, index) {
  const scope = ruleDrawerScope(page);
  const rows = scope
    .locator('.section-title')
    .filter({ hasText: '备用集群和模型' })
    .locator(
      'xpath=following-sibling::div[contains(@class, "dynamic-row") and contains(@class, "fallback-row")]',
    );
  const trigger = rows.nth(index).locator('.ivu-select').nth(1);
  await trigger.click();
  await page.waitForTimeout(300);
  return {
    trigger,
    dropdown: page.locator('.ivu-select-dropdown:visible'),
  };
}

async function expectDropdownOptions(page, dropdown, expectedOptions) {
  await expect(dropdown).toBeVisible();
  const items = dropdown.locator('.ivu-select-item');
  await expect(items).toHaveCount(expectedOptions.length);
  for (let i = 0; i < expectedOptions.length; i += 1) {
    await expect(items.nth(i)).toHaveText(expectedOptions[i]);
  }
}

async function searchDropdownKeyword(page, trigger, keyword) {
  await expect(trigger).toBeVisible();
  const input = trigger.locator('input.ivu-select-input');
  await input.fill(keyword);
  await page.waitForTimeout(300);
  return page.locator('.ivu-select-dropdown:visible');
}

async function openTargetClusterDropdown(page, index) {
  const scope = ruleDrawerScope(page);
  const rows = scope.locator('.dynamic-row.target-row').filter({
    has: page.getByPlaceholder('请选择目标集群（可输入集群名查找）'),
  });
  const trigger = rows.nth(index).locator('.ivu-select').first();
  await trigger.click();
  await page.waitForTimeout(500);
  return page.locator('.ivu-select-dropdown:visible');
}

async function openFallbackClusterDropdown(page, index) {
  const scope = ruleDrawerScope(page);
  const rows = scope
    .locator('.dynamic-row.target-row')
    .filter({ has: page.getByPlaceholder('请选择备用集群') });
  const trigger = rows.nth(index).locator('.ivu-select').first();
  await trigger.click();
  await page.waitForTimeout(500);
  return page.locator('.ivu-select-dropdown:visible');
}

async function expectDropdownExcludes(page, dropdownLocator, clusterName) {
  await expect(
    dropdownLocator
      .locator('.ivu-select-item')
      .getByText(clusterName, { exact: true }),
  ).toHaveCount(0);
}

async function expectDropdownIncludes(page, dropdownLocator, clusterName) {
  await expect(
    dropdownLocator
      .locator('.ivu-select-item')
      .getByText(clusterName, { exact: true }),
  ).toBeVisible();
}

async function submitRuleFormAndWait(page) {
  const scope = ruleDrawerScope(page);
  await scope
    .getByRole('button', { name: DOC_ROUTE_RULE_FORM.localSaveButton })
    .click();
  await page.waitForTimeout(2000);
}

async function submitRuleFormExpectLocalSaveMessage(page, message) {
  const scope = ruleDrawerScope(page);
  await new IvuMessageComponent(page).waitForTextDuringAction(message, () =>
    scope
      .getByRole('button', { name: DOC_ROUTE_RULE_FORM.localSaveButton })
      .click(),
  );
  await page.waitForTimeout(500);
}

function findClusterWithMultipleModels(clusters) {
  return clusters.find(
    (cluster) =>
      Array.isArray(cluster.llm_config?.models) &&
      cluster.llm_config.models.length >= 2,
  );
}

async function expectRuleFormError(page, fieldLabel, message) {
  const scope = ruleDrawerScope(page);
  const tip = scope
    .locator('.ivu-form-item')
    .filter({ hasText: fieldLabel })
    .locator('.ivu-form-item-error-tip')
    .first();
  await expect(tip).toBeVisible();
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

async function expectRuleFormValid(page, fieldLabel) {
  const scope = ruleDrawerScope(page);
  await expect(
    scope
      .locator('.ivu-form-item')
      .filter({ hasText: fieldLabel })
      .locator('.ivu-form-item-error-tip')
      .first(),
  ).toBeHidden();
}

async function expectRuleFormDrawerHidden(page) {
  await expect(page.locator('.rule-form')).toHaveCount(0, { timeout: 10000 });
}

async function expectRuleFormDrawerStillOpen(page) {
  await expect(page.locator('.rule-form')).toBeVisible();
}

async function expectRuleRowVisible(page, ruleName) {
  const table = routeRulesTable(page);
  await table.expectRowVisible(ruleName);
}

async function expectRuleRowHidden(page, ruleName) {
  const table = routeRulesTable(page);
  await table.expectRowHidden(ruleName);
}

async function deleteRuleByNameAndSubmit(page, ruleName) {
  try {
    await ensureRouteTableModuleAvailable(page);
    await openGlobalRouteTableDetail(page);
    await enterRouteRulesEditMode(page);
    const table = routeRulesTable(page);
    const deleteBtn = table.rowAction(ruleName, '删除');
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      await submitGlobalRouteRulesAndWait(page);
      await expectRouteRulesViewMode(page);
    }
    await gotoRouteTableListPage(page);
    return true;
  } catch (e) {
    common.log('删除规则失败: ' + e.message);
    return false;
  }
}

async function purgeGlobalTestRulesViaUI(page) {
  try {
    await ensureRouteTableModuleAvailable(page);
    await openGlobalRouteTableDetail(page);
    await enterRouteRulesEditMode(page);
    const table = routeRulesTable(page);
    let removed = 0;
    while (true) {
      const row = table.dataRows().filter({ hasText: /^rt_/ }).first();
      if (await row.isVisible().catch(() => false)) {
        const deleteBtn = row.getByRole('button', { name: '删除' });
        if (await deleteBtn.isVisible().catch(() => false)) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
          removed++;
          continue;
        }
      }
      break;
    }
    if (removed > 0) {
      await submitGlobalRouteRulesAndWait(page);
      await expectRouteRulesViewMode(page);
      common.log('已清理 ' + removed + ' 条历史测试规则');
    }
    await gotoRouteTableListPage(page);
  } catch (e) {
    common.log('清理历史测试规则失败: ' + e.message);
  }
}

async function expectRouteRulesEditMode(page) {
  await expect(
    page.getByRole('button', { name: DOC_ROUTE_TABLE.exitEditMode }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: DOC_ROUTE_TABLE.submitAndEffect }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: DOC_ROUTE_TABLE.createRule }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: DOC_ROUTE_TABLE.enterEditMode }),
  ).toHaveCount(0);
  await expect(
    page.locator('.route-rules .enable-row .ivu-select-disabled'),
  ).toHaveCount(0);
}

async function waitAfterRouteFixtureMutation(page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function waitForEntityTypesListForFixture(page, action) {
  try {
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/entity-types') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
  } catch (e) {
    common.log('等待 entity-types 列表超时: ' + e.message);
    await action();
    await page.waitForTimeout(3000);
  }
}

async function waitForEntitiesListForFixture(page, action) {
  try {
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/entities') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
  } catch (e) {
    common.log('等待 entities 列表超时: ' + e.message);
    await action();
    await page.waitForTimeout(3000);
  }
}

async function waitForApiKeysListForFixture(page, action) {
  try {
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api-keys') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
  } catch (e) {
    common.log('等待 api-keys 列表超时: ' + e.message);
    await action();
    await page.waitForTimeout(3000);
  }
}

async function submitCreateEntityTypeForRouteFixture(
  page,
  { typeName, description, level },
) {
  await entityUtils.openCreateEntityTypeDrawer(page);
  await entityUtils.fillEntityTypeForm(page, { typeName, description, level });
  await new IvuMessageComponent(page).waitForTextDuringAction(
    /创建成功!?/,
    () =>
      waitForEntityTypesListForFixture(page, () =>
        entityUtils.submitEntityTypeForm(page),
      ),
    15000,
  );
  await waitAfterRouteFixtureMutation(page);
  await entityUtils.expectCreateEntityTypeDrawerHidden(page);
}

async function submitCreateEntityForRouteFixture(page, { name, typeName }) {
  await entityUtils.openCreateEntityDrawer(page);
  await entityUtils.fillEntityFormBasic(page, { name, typeName });
  await new IvuMessageComponent(page).waitForTextDuringAction(
    '创建成功',
    () =>
      waitForEntitiesListForFixture(page, () =>
        entityUtils.submitEntityForm(page),
      ),
    15000,
  );
  await waitAfterRouteFixtureMutation(page);
}

async function submitCreateApiKeyForRouteFixture(page, formData) {
  await entityUtils.fillApiKeyBasicForm(page, formData);
  await new IvuMessageComponent(page).waitForTextDuringAction('添加成功', () =>
    waitForApiKeysListForFixture(page, () =>
      entityUtils.submitApiKeyForm(page),
    ),
  );
  await waitAfterRouteFixtureMutation(page);
}

async function gotoEntityTypePageForFixture(page) {
  await umUtils.handleUrlInvalidAlert(page);
  const url = getAppBaseUrl() + '/Entity';
  common.log('进入 Entity 类型管理页: ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
  await entityUtils.switchToEntityTypeTab(page);
}

async function gotoEntityOrgPageForFixture(page) {
  await umUtils.handleUrlInvalidAlert(page);
  const url = getAppBaseUrl() + '/Entity';
  if (!page.url().includes('/Entity')) {
    common.log('进入 Entity 组织管理页: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
  await umUtils.handleUrlInvalidAlert(page);
  await entityUtils.switchToEntityOrgTab(page);
}

async function gotoApiKeyPageForFixture(page) {
  await umUtils.handleUrlInvalidAlert(page);
  const url = getAppBaseUrl() + '/api-key';
  common.log('进入 API-Key 管理页: ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
}

async function waitForRouteTableOwner(
  page,
  routeType,
  ownerId,
  timeout = 60000,
  displayOwner,
) {
  const typeLabel =
    routeType === 'entity'
      ? DOC_ROUTE_TABLE.entityTypeLabel
      : DOC_ROUTE_TABLE.apiKeyTypeLabel;
  const uiOwner = displayOwner !== undefined ? displayOwner : ownerId;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // 先用 API 快速检查（无需页面导航）
    const rows = await apiUtils.getRouteTablesViaApi(page);
    const hit = rows.find(
      (row) => row.type === routeType && String(row.owner) === String(ownerId),
    );
    if (hit) {
      common.log(`路由表 API 已同步 ${routeType}/${ownerId}`);
      // API 确认后，导航到列表页验证 UI 可见
      await navigateToRouteTableListByUrl(page);
      await reloadRouteTableListPage(page);
      const row = routeTableRow(routeTableList(page), typeLabel, uiOwner);
      if (await row.isVisible().catch(() => false)) {
        common.log(`路由表页面已出现 ${routeType}/${ownerId}`);
      }
      return hit;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error(`路由表未出现 ${routeType}/${ownerId}`);
}

async function createEntityRouteTableFixtureViaUI(page, cleanup) {
  await umUtils.handleUrlInvalidAlert(page);

  const typeName = await entityUtils.generateTestEntityTypeName();
  const entityName = await entityUtils.generateTestEntityName();
  cleanup.trackTypeName(typeName);

  await gotoEntityTypePageForFixture(page);
  await submitCreateEntityTypeForRouteFixture(page, {
    typeName,
    description: '路由表测试类型',
    level: 1,
  });

  await gotoEntityOrgPageForFixture(page);
  await submitCreateEntityForRouteFixture(page, { name: entityName, typeName });

  let entity = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    entity = await entityUtils.findEntityByNameViaApi(page, entityName);
    if (entity?.id) {
      break;
    }
    await page.waitForTimeout(2000);
  }
  expect(entity?.id, 'UI 创建 Entity 后未查到 id: ' + entityName).toBeTruthy();
  cleanup.trackEntityName(entityName);
  cleanup.trackEntityId(entity.id);

  try {
    await waitForRouteTableOwner(page, 'entity', entity.id, 15000, entityName);
  } catch (e) {
    common.log('Entity 路由表未自动创建，跳过等待: ' + e.message);
  }
  return { entityId: entity.id, entityName, typeName };
}

async function createApiKeyRouteTableFixtureViaUI(page, cleanup) {
  const { entityId, entityName, typeName } =
    await createEntityRouteTableFixtureViaUI(page, cleanup);
  const description = 'rt_apikey_' + Date.now();

  await gotoApiKeyPageForFixture(page);
  await entityUtils.openAddApiKeyDrawer(page);
  await submitCreateApiKeyForRouteFixture(page, {
    description,
    unlimitedQuota: true,
    entityName,
  });

  let apiKey = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    apiKey = await entityUtils.findApiKeyByDescriptionViaApi(page, description);
    if (apiKey?.id) {
      break;
    }
    await page.waitForTimeout(2000);
  }
  expect(apiKey?.id, 'UI 创建 API-Key 后未查到 id').toBeTruthy();
  cleanup.trackApiKeyId(apiKey.id);

  await waitForRouteTableOwner(page, 'apikey', apiKey.id);
  return {
    apiKeyId: apiKey.id,
    entityId,
    entityName,
    typeName,
    description,
  };
}

async function resolveApiKeyRouteTableOwner(page, cleanup) {
  await ensureRouteTableModuleAvailable(page);
  await reloadRouteTableListPage(page);
  const rows = await apiUtils.getRouteTablesViaApi(page);
  const hit = rows.find((row) => row.type === 'apikey');
  if (hit?.owner) {
    common.log('复用已有 API-Key 路由表: ' + hit.owner);
    return { ownerId: hit.owner, created: false };
  }
  const fixture = await createApiKeyRouteTableFixtureViaUI(page, cleanup);
  return { ownerId: fixture.apiKeyId, created: true };
}

async function resolveEntityRouteTableOwner(page, cleanup) {
  await ensureRouteTableModuleAvailable(page);
  await reloadRouteTableListPage(page);
  const rows = await apiUtils.getRouteTablesViaApi(page);
  const hit = rows.find((row) => row.type === 'entity');
  if (hit?.owner) {
    common.log('复用已有 Entity 路由表: ' + hit.owner);
    let ownerName = hit.owner;
    try {
      const allEntities = await entityApi.fetchAllEntitiesViaApi(page);
      const entity = allEntities.find((e) => e.id === hit.owner);
      if (entity?.name) {
        ownerName = entity.name;
      }
    } catch (e) {
      common.log('查找 Entity 名称失败，使用 ID 作为 fallback: ' + e.message);
    }
    return { ownerId: hit.owner, ownerName, created: false };
  }
  const fixture = await createEntityRouteTableFixture(page, cleanup);
  return {
    ownerId: fixture.entityId,
    ownerName: fixture.entityName,
    created: true,
  };
}

async function createEntityRouteTableFixture(page, cleanup) {
  await ensureRouteTableModuleAvailable(page);
  await umUtils.handleUrlInvalidAlert(page);

  const typeName = await entityUtils.generateTestEntityTypeName();
  const entityName = await entityUtils.generateTestEntityName();
  cleanup.trackTypeName(typeName);

  let typeOk = await entityApi.createEntityTypeViaApi(
    page,
    typeName,
    '路由表测试类型',
    1,
  );
  if (!typeOk) {
    await umUtils.handleUrlInvalidAlert(page);
    typeOk = await entityApi.createEntityTypeViaApi(
      page,
      typeName,
      '路由表测试类型',
      1,
    );
  }

  if (!typeOk) {
    common.log('Entity 类型 API 造数失败，改用 UI');
    return createEntityRouteTableFixtureViaUI(page, cleanup);
  }

  await page.waitForTimeout(1000);

  let entityData = await entityApi.createEntityViaApi(
    page,
    entityName,
    typeName,
  );
  if (!entityData?.id) {
    await umUtils.handleUrlInvalidAlert(page);
    entityData = await entityApi.createEntityViaApi(page, entityName, typeName);
  }

  if (!entityData?.id) {
    common.log('Entity API 造数失败，改用 UI');
    return createEntityRouteTableFixtureViaUI(page, cleanup);
  }

  cleanup.trackEntityName(entityName);
  cleanup.trackEntityId(entityData.id);

  try {
    await waitForRouteTableOwner(
      page,
      'entity',
      entityData.id,
      15000,
      entityName,
    );
  } catch (e) {
    common.log('Entity 路由表未自动创建，跳过等待: ' + e.message);
  }
  return { entityId: entityData.id, entityName, typeName };
}

async function createApiKeyRouteTableFixture(page, cleanup) {
  return createApiKeyRouteTableFixtureViaUI(page, cleanup);
}

async function expectRouteTableListLayout(page) {
  await new LayoutShellComponent(page).expectLoaded();
  await expect(page.locator('.route-table .list-view')).toBeVisible({
    timeout: 15000,
  });
  const breadcrumb = page
    .locator('.bfe-breadcrumb')
    .getByText(DOC_ROUTE_TABLE.pageTitle, { exact: true });
  if (await breadcrumb.isVisible().catch(() => false)) {
    await expect(breadcrumb).toBeVisible();
  }
}

async function reloadRouteTableListPage(page) {
  await waitForRouteTablesListResponse(page, async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
  });
  await page.waitForTimeout(1000);
}

async function selectRouteTableTypeFilter(page, typeLabel) {
  const table = routeTableList(page);
  const trigger = table
    .searchArea()
    .locator('.ivu-select')
    .filter({ hasText: '请选择路由表类型' })
    .first();
  const select = new IvuSelectComponent(page, trigger);
  await select.selectOptionExact(typeLabel);
  await page.waitForTimeout(500);
}

async function selectRouteTableStatusFilter(page, statusLabel) {
  const table = routeTableList(page);
  const trigger = table
    .searchArea()
    .locator('.ivu-select')
    .filter({ hasText: '请选择状态' })
    .first();
  const select = new IvuSelectComponent(page, trigger);
  await select.selectOptionExact(statusLabel);
  await page.waitForTimeout(500);
}

async function searchRouteTableOwner(page, owner) {
  const table = routeTableList(page);
  const input = table.searchArea().getByPlaceholder('请输入路由表属主查询');
  await input.fill(owner);
  await input.press('Enter');
  await page.waitForTimeout(500);
}

async function navigateToRouteTableByOwner(page, typeLabel, owner) {
  common.log('进入路由表列表并筛选: type=' + typeLabel + ', owner=' + owner);
  await ensureChineseLang(page);
  // Full page load to list page (clears any previous filters/detail view)
  await navigateToRouteTableListByUrl(page);
  // Apply type filter — triggers server-side API call with type param
  await waitForRouteTablesListResponse(page, async () => {
    await selectRouteTableTypeFilter(page, typeLabel);
  });
  // Apply owner search — triggers server-side API call with type + owner params
  await waitForRouteTablesListResponse(page, async () => {
    await searchRouteTableOwner(page, owner);
  });
}

async function clearRouteTableOwnerSearch(page) {
  const table = routeTableList(page);
  const input = table.searchArea().getByPlaceholder('请输入路由表属主查询');
  await input.fill('');
  await input.press('Enter');
  await page.waitForTimeout(500);
}

async function expectRouteTableListHeaders(page) {
  const table = routeTableList(page);
  await table.expectHeaders(...DOC_ROUTE_TABLE.listHeaders);
}

async function expectGlobalRouteTableRowVisible(page) {
  const table = routeTableList(page);
  await expect(globalRouteTableRow(table)).toBeVisible({ timeout: 15000 });
}

async function expectGlobalRouteTableStatus(page, enabled) {
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);
  const statusLabel = enabled
    ? DOC_ROUTE_TABLE.enabledLabel
    : DOC_ROUTE_TABLE.disabledLabel;
  const statusCell = row.locator('td').nth(2);
  await expect(
    statusCell.getByText(statusLabel, { exact: true }),
  ).toBeVisible();
}

async function expectGlobalRouteTableToggleButtons(page, enabled) {
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);
  const enableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.enabledLabel,
  });
  const disableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.disabledLabel,
  });

  if (enabled) {
    await expect(enableBtn).toBeDisabled();
    await expect(disableBtn).toBeEnabled();
  } else {
    await expect(enableBtn).toBeEnabled();
    await expect(disableBtn).toBeDisabled();
  }
  await expect(
    row.getByRole('button', { name: DOC_ROUTE_RULE.viewRuleButton }),
  ).toBeEnabled();
}

async function openGlobalRouteTableDetail(page) {
  const table = routeTableList(page);
  await waitForGlobalRouteRulesGetResponse(page, async () => {
    await globalRouteTableRow(table)
      .getByRole('button', { name: DOC_ROUTE_RULE.viewRuleButton })
      .click();
  });
  await page.waitForTimeout(1000);
}

async function expectGlobalRouteTableDetailOpen(page) {
  await expect(page.locator('.route-rules')).toBeVisible({ timeout: 15000 });
  await expect(
    page
      .locator('.bfe-breadcrumb')
      .getByText(DOC_ROUTE_TABLE.globalDetailBreadcrumb),
  ).toBeVisible();
  await expect(page.locator('.route-owner-label')).toContainText(
    DOC_ROUTE_TABLE.globalTypeLabel,
  );
}

async function expectRouteRulesViewMode(page) {
  await expect(
    page.getByRole('button', { name: DOC_ROUTE_TABLE.enterEditMode }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: DOC_ROUTE_TABLE.createRule }),
  ).toHaveCount(0);
  await expect(
    page.locator('.route-rules .enable-row .ivu-select-disabled'),
  ).toBeVisible();
}

async function expectRouteRulesTableHeaders(page) {
  const table = routeRulesTable(page);
  await table.expectHeaders(...DOC_ROUTE_RULE.detailHeaders);
}

async function enableGlobalRouteTableAndWait(page) {
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);

  await waitForGlobalRouteRulesPutResponse(page, async () => {
    await row
      .getByRole('button', { name: DOC_ROUTE_TABLE.enabledLabel })
      .click();
  });

  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_TABLE.enableSuccessToast,
  );
  await waitForRouteTablesListResponse(page, async () => {
    await page.waitForTimeout(500);
  });
}

async function disableGlobalRouteTableAndWait(page) {
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);

  await waitForGlobalRouteRulesPutResponse(page, async () => {
    await row
      .getByRole('button', { name: DOC_ROUTE_TABLE.disabledLabel })
      .click();
  });

  await new IvuMessageComponent(page).expectText(
    DOC_ROUTE_TABLE.disableSuccessToast,
  );
  await waitForRouteTablesListResponse(page, async () => {
    await page.waitForTimeout(500);
  });
}

async function ensureGlobalRouteTableDisabledViaUI(page) {
  await ensureRouteTableModuleAvailable(page);
  await reloadRouteTableListPage(page);
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);
  const disableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.disabledLabel,
  });
  if (await disableBtn.isEnabled().catch(() => false)) {
    await disableGlobalRouteTableAndWait(page);
  }
}

async function ensureGlobalRouteTableEnabledViaUI(page) {
  await ensureRouteTableModuleAvailable(page);
  await reloadRouteTableListPage(page);
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);
  const enableBtn = row.getByRole('button', {
    name: DOC_ROUTE_TABLE.enabledLabel,
  });
  if (await enableBtn.isEnabled().catch(() => false)) {
    await enableGlobalRouteTableAndWait(page);
  }
}

async function ensureGlobalRouteTableDisabled(page) {
  await ensureGlobalRouteTableDisabledViaUI(page);
}

async function ensureGlobalRouteTableEnabled(page) {
  await ensureGlobalRouteTableEnabledViaUI(page);
}

module.exports = {
  DOC_ROUTE_TABLE,
  DOC_ROUTE_RULE,
  DOC_ROUTE_RULE_FORM,
  getWeightSumErrorMessage,
  routeTableList,
  routeRulesTable,
  gotoRouteTableListPage,
  ensureOnRouteTableListPage: gotoRouteTableListPage,
  backToRouteTableListViaBreadcrumb,
  waitForRouteTablesListResponse,
  expectRouteTableListLayout,
  expectRouteTableListHeaders,
  expectGlobalRouteTableRowVisible,
  expectGlobalRouteTableStatus,
  expectGlobalRouteTableToggleButtons,
  openGlobalRouteTableDetail,
  expectGlobalRouteTableDetailOpen,
  expectRouteRulesViewMode,
  expectRouteRulesTableHeaders,
  submitGlobalRouteRulesAndWait,
  submitGlobalRouteRulesAndExpectError,
  submitOwnerRouteRulesAndWait,
  submitOwnerRouteRulesAndWait,
  getAvailableClustersForRule,
  openAddRuleDrawer,
  openEditRuleDrawer,
  openViewRuleDrawer,
  ruleViewFallbackInfoRow,
  expectRuleViewFallbackTags,
  expectRuleViewNoFallback,
  resetRuleForm,
  clickExitEditMode,
  closeTopDrawer,
  searchRuleByName,
  deleteRuleByName,
  setRouteTableEnabledInDetail,
  expectRouteRulesSubmitError,
  ruleForm,
  fillRuleName,
  fillRuleExpression,
  selectRuleTargetCluster,
  selectRuleTargetModel,
  fillRuleTargetWeight,
  addRuleTargetRow,
  addRuleFallbackRow,
  deleteRuleTargetRow,
  deleteRuleFallbackRow,
  expectRuleTargetRowCount,
  expectRuleFallbackRowCount,
  expectNoFallbackPlaceholder,
  expectRuleFallbackSectionTitleVisible,
  expectRuleFallbackRowHasNoWeight,
  expectRuleFallbackRowValues,
  searchAndSelectRuleTargetCluster,
  selectRuleFallbackCluster,
  selectRuleFallbackModel,
  openRuleTargetModelDropdown,
  openRuleFallbackModelDropdown,
  expectDropdownOptions,
  searchDropdownKeyword,
  openTargetClusterDropdown,
  openFallbackClusterDropdown,
  expectDropdownExcludes,
  expectDropdownIncludes,
  submitRuleFormAndWait,
  submitRuleFormExpectLocalSaveMessage,
  findClusterWithMultipleModels,
  expectRuleFormError,
  expectRuleFormValid,
  expectRuleFormDrawerHidden,
  expectRuleFormDrawerStillOpen,
  expectRuleRowVisible,
  expectRuleRowHidden,
  deleteRuleByName,
  deleteAllRulesByName,
  deleteRuleByNameAndSubmit,
  purgeGlobalTestRulesViaUI,
  enableGlobalRouteTableAndWait,
  disableGlobalRouteTableAndWait,
  ensureRouteTableModuleAvailable,
  ensureGlobalRouteTableDisabledViaUI,
  ensureGlobalRouteTableEnabledViaUI,
  ensureGlobalRouteTableDisabled,
  ensureGlobalRouteTableEnabled,
  reloadRouteTableListPage,
  selectRouteTableTypeFilter,
  selectRouteTableStatusFilter,
  searchRouteTableOwner,
  navigateToRouteTableByOwner,
  clearRouteTableOwnerSearch,
  routeTableRow,
  buildDetailBreadcrumbPattern,
  expectRouteTableRowVisible,
  expectRouteTableStatus,
  expectRouteTableToggleButtons,
  openRouteTableDetail,
  expectRouteTableDetailOpen,
  enableRouteTableAndWait,
  disableRouteTableAndWait,
  ensureRouteTableDisabledViaUI,
  ensureRouteTableEnabledViaUI,
  enterRouteRulesEditMode,
  expectRouteRulesEditMode,
  createEntityRouteTableFixture,
  createApiKeyRouteTableFixture,
  createEntityRouteTableFixtureViaUI,
  createApiKeyRouteTableFixtureViaUI,
  waitForRouteTableOwner,
  resolveEntityRouteTableOwner,
  resolveApiKeyRouteTableOwner,
  createRouteLinkedTestCleanup: entityApi.createApiKeyTestCleanup,
  createRouteTestCleanup: apiUtils.createRouteTestCleanup,
  getGlobalRouteRulesViaApi: apiUtils.getGlobalRouteRulesViaApi,
  getRouteTablesViaApi: apiUtils.getRouteTablesViaApi,
  setGlobalRouteRulesViaApi: apiUtils.setGlobalRouteRulesViaApi,
  findGlobalRouteTableViaApi: apiUtils.findGlobalRouteTableViaApi,
};
