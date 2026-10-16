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
const sessionUtils = require('../../utils/session');
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
  // 后端 route-tables 的 type 是 api_key，列表页与详情页文案直接渲染该值，
  // 而 TYPE_MAP 只登记了 apikey → API-Key（前端缺口），故断言同时接受两种写法
  apiKeyDetailBreadcrumb: /路由规则 - (API-Key|api_key|apikey)/,
  entityDetailBreadcrumb: /路由规则 - Entity|entity /,
  apiKeyTypeLabels: /API-Key|api_key|apikey/,
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
  copyRuleButton: '复制',
  dragToChangeOrderTip: '拖动表格可修改生效次序',
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
    // 导航入口统一会话守卫：Session Key 失效时先自愈（重新登录 + 回写 auth.json），
    // 避免带失效 Key 加载页面后 401 弹「Session Key 错误」遮罩拦截所有点击。
    await sessionUtils.ensureSessionHealthy(page, {
      retryUrl: getAppBaseUrl() + ROUTE_TABLE_LIST_PATH,
    });
    await umUtils.handleUrlInvalidAlert(page);
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
  const targetUrl = getAppBaseUrl() + ROUTE_TABLE_LIST_PATH;
  // 导航入口统一会话守卫（含「已在目标页」等提前返回分支）：
  // Session Key 失效时先自愈（重新登录 + 回写 auth.json），避免 401 遮罩拦截点击。
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });

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
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
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
  const row = routeTableRow(table, typeLabel, owner);
  await ensureRouteTableRowReachable(page, row);
  await expect(row).toBeVisible({
    timeout: 15000,
  });
}

async function expectRouteTableStatus(page, typeLabel, owner, enabled) {
  const table = routeTableList(page);
  const row = routeTableRow(table, typeLabel, owner);
  await ensureRouteTableRowReachable(page, row);
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
  await ensureRouteTableRowReachable(page, row);
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
  await ensureRouteTableRowReachable(page, row);
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
    typeLabel === DOC_ROUTE_TABLE.apiKeyTypeLabel
      ? DOC_ROUTE_TABLE.apiKeyTypeLabels
      : typeLabel,
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
  await ensureRouteTableRowReachable(page, row);
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
  await ensureRouteTableRowReachable(page, row);
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

/**
 * 点击「提交并生效」并等待 PUT 成功提示
 *
 * 2026-10-15 起该按钮带脏检查（`:disabled="!isDirty"`，见 RT-D-29）：
 * 无本地净变更时按钮置灰、点击必然超时。清理类调用（删除用例自己刚加、
 * 且从未提交过的规则）本地表格已回到原状，此时本就没有可提交的内容，
 * 传 `skipWhenNoLocalChange: true` 直接跳过；真实提交步骤保持默认（严格失败）。
 */
async function submitGlobalRouteRulesAndWait(
  page,
  { skipWhenNoLocalChange = false } = {},
) {
  if (skipWhenNoLocalChange && (await isSubmitAndEffectDisabled(page))) {
    common.log('无本地净变更（提交并生效置灰），跳过提交');
    return null;
  }
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

/**
 * 捕获下一次 `PUT /global-route-rules` 的请求体
 *
 * 先取 Promise 再触发提交（与 waitForGlobalRouteRulesPutResponse 同款并发监听），
 * 用于断言真实提交 payload 的规则顺序与字段。
 */
function captureGlobalRouteRulesPutPayload(page, timeout = 15000) {
  return page
    .waitForRequest(
      (res) =>
        res.url().includes('/global-route-rules') &&
        res.method() === 'PUT',
      { timeout },
    )
    .then((request) => request.postDataJSON());
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

/**
 * 清理助手：删除指定 Global 规则并提交（多用作用例 afterEach 的兜底）
 *
 * 两个坑：
 * 1) 不能用 `ensureRouteTableModuleAvailable` —— 它在列表页未就绪时会调用
 *    `test.skip()`，在 afterEach 里抛 skip 信号会把已通过的用例记成失败
 *    （RT-D-09/RT-D-10/RT-V-03-3/RT-V-12-1 的失败根因）。这里改为硬跳转列表页，
 *    顺带丢弃详情页未提交的本地变更（SPA 的离开确认框不会拦硬跳转）。
 * 2) 用例只做「本地保存」时该规则从未进后端：本地删掉后无净变更，提交按钮置灰，
 *    此时跳过提交（skipWhenNoLocalChange）即可，无需写后端。
 */
async function deleteRuleByNameAndSubmit(page, ruleName) {
  try {
    await ensureChineseLang(page);
    await navigateToRouteTableListByUrl(page);
    await clearRouteTableStatusFilter(page);
    await openGlobalRouteTableDetail(page);
    await enterRouteRulesEditMode(page);
    const table = routeRulesTable(page);
    const deleteBtn = table.rowAction(ruleName, '删除');
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      await submitGlobalRouteRulesAndWait(page, {
        skipWhenNoLocalChange: true,
      });
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

/**
 * 规则表格「生效次序」相关助手（复制 / 拖拽排序 / 提交按钮态）
 *
 * 行定位统一收敛到主表格 body（`.show-iView-Table .ivu-table-body tbody tr`）：
 * 固定列与搜索行会在页面上渲染出重复行，按 `.page-table tbody tr` 取行会串位。
 */
function routeRulesMainRows(page) {
  return routeRulesTable(page)
    .rootLocator()
    .locator('.show-iView-Table .ivu-table-body tbody tr');
}

async function getRuleNamesInOrder(page) {
  const rows = routeRulesMainRows(page);
  const count = await rows.count();
  const names = [];
  for (let i = 0; i < count; i += 1) {
    names.push((await rows.nth(i).locator('td').first().innerText()).trim());
  }
  return names;
}

/**
 * 复刻 RouteRules.onRuleDragDrop 的移动语义：拖拽行被移动到目标行的原下标处。
 */
function moveRuleToIndex(names, fromIndex, toIndex) {
  const next = names.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * 复刻 RouteRules.onCopyRule 的副本命名：`<name>-copy`，重名递增为 `-copy2`…，
 * 名称总长截断到 64 字符。
 */
function buildCopyRuleName(sourceName, existingNames) {
  const name = sourceName || '';
  let seq = 1;
  let newName;
  do {
    const suffix = seq === 1 ? '-copy' : `-copy${seq}`;
    newName = `${name.substring(0, 64 - suffix.length)}${suffix}`;
    seq += 1;
  } while ((existingNames || []).includes(newName));
  return newName;
}

async function expectRuleNamesInOrder(page, expectedNames) {
  const actual = await getRuleNamesInOrder(page);
  expect(actual, '规则表格生效次序不符').toEqual(expectedNames);
}

/** 真实拖拽：把 fromIndex 行拖到 toIndex 行上（Playwright 原生 dragTo，走 iView Sortable） */
async function dragRuleRow(page, fromIndex, toIndex) {
  const rows = routeRulesMainRows(page);
  const from = rows.nth(fromIndex);
  const to = rows.nth(toIndex);
  await expect(from).toBeVisible();
  await expect(to).toBeVisible();
  await from.dragTo(to);
  await page.waitForTimeout(800);
}

function routeRulesDragTip(page) {
  return page.locator('.route-rules .drag-tip');
}

async function expectRouteRulesDragTipVisible(page, visible = true) {
  if (visible) {
    await expect(routeRulesDragTip(page)).toBeVisible();
  } else {
    await expect(routeRulesDragTip(page)).toHaveCount(0);
  }
}

async function expectRuleRowsDraggable(page, draggable = true) {
  const rows = routeRulesMainRows(page);
  const count = await rows.count();
  expect(count, '规则表格无数据行，无法校验拖拽属性').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    expect(await rows.nth(i).getAttribute('draggable')).toBe(
      draggable ? 'true' : null,
    );
  }
}

function getSubmitAndEffectButton(page) {
  return page.getByRole('button', { name: DOC_ROUTE_TABLE.submitAndEffect });
}

async function isSubmitAndEffectDisabled(page) {
  return getSubmitAndEffectButton(page).isDisabled();
}

async function expectSubmitAndEffectDisabled(page, disabled = true) {
  if (disabled) {
    await expect(getSubmitAndEffectButton(page)).toBeDisabled();
  } else {
    await expect(getSubmitAndEffectButton(page)).toBeEnabled();
  }
}

function copyRuleButtonInRow(row) {
  return row.getByRole('button', { name: DOC_ROUTE_TABLE.copyRuleButton });
}

async function expectCopyRuleButtonIsLeftmost(page, ruleName) {
  const row = await routeRuleRowByName(page, ruleName);
  const buttons = row.locator('td').last().getByRole('button');
  await expect(buttons.first()).toHaveText(DOC_ROUTE_TABLE.copyRuleButton);
  await expect(buttons.first()).toHaveClass(/ivu-btn-success/);
}

async function clickCopyRuleButtonByIndex(page, index) {
  const button = copyRuleButtonInRow(routeRulesMainRows(page).nth(index));
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForTimeout(500);
}

async function clickCopyRuleButton(page, ruleName) {
  const button = copyRuleButtonInRow(await routeRuleRowByName(page, ruleName));
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForTimeout(500);
}

/**
 * 用本地「复制」把规则行数补齐到 minimum（纯本地操作，不写后端）
 *
 * 拖拽排序需要多行才能验证，而环境里 Global 路由表可能只有 1~2 条规则
 * （既有造数 `resourceApi.initRouteTestData` 会把 rules 覆盖成单条），
 * 补齐后各用例不再依赖环境的规则条数。
 */
async function ensureRuleRowsAtLeast(page, minimum) {
  let names = await getRuleNamesInOrder(page);
  let rounds = 0;
  while (names.length < minimum && rounds <= minimum) {
    await clickCopyRuleButtonByIndex(page, 0);
    const next = await getRuleNamesInOrder(page);
    if (next.length <= names.length) {
      common.log('复制未增加规则行，停止补齐（当前 ' + next.length + ' 条）');
      break;
    }
    names = next;
    rounds += 1;
  }
  common.log('补齐后规则顺序: ' + names.join(' > '));
  return names;
}

/** 按规则名精确定位行下标（表格 `hasText` 是子串匹配，会把 test 与 test123 混在一起） */
async function routeRuleRowIndexByName(page, ruleName) {
  const names = await getRuleNamesInOrder(page);
  const index = names.indexOf(ruleName);
  expect(index, `规则表格未找到规则「${ruleName}」`).toBeGreaterThanOrEqual(0);
  return index;
}

async function routeRuleRowByName(page, ruleName) {
  const index = await routeRuleRowIndexByName(page, ruleName);
  return routeRulesMainRows(page).nth(index);
}

/** 读取某行各列展示文本（name / cond / targets / fallbacks） */
async function getRuleRowFieldTexts(page, index) {
  const row = routeRulesMainRows(page).nth(index);
  const cells = row.locator('td');
  return {
    name: (await cells.nth(0).innerText()).trim(),
    cond: (await cells.nth(1).innerText()).trim(),
    targets: (await cells.nth(2).innerText()).trim(),
    fallbacks: (await cells.nth(3).innerText()).trim(),
  };
}

async function openEditRuleDrawerByRowIndex(page, index) {
  const row = routeRulesMainRows(page).nth(index);
  await row
    .getByRole('button', { name: DOC_ROUTE_TABLE.editRuleButton })
    .click();
  await page.waitForTimeout(500);
  await expect(page.locator('.rule-form')).toBeVisible();
  await expect(
    page
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_ROUTE_RULE_FORM.drawTitleEdit, { exact: true }),
  ).toBeVisible();
}

async function getRuleFormNameValue(page) {
  return ruleDrawerScope(page).getByPlaceholder('请输入规则名称').inputValue();
}

/** 按列标题排序（点击表头排序图标）；order: asc / desc */
async function sortRuleTableByColumn(page, columnTitle, order = 'desc') {
  const th = routeRulesTable(page)
    .rootLocator()
    .locator('.show-iView-Table th')
    .filter({ hasText: columnTitle })
    .first();
  const icon = th.locator(
    order === 'asc' ? '.ivu-icon-md-arrow-dropup' : '.ivu-icon-md-arrow-dropdown',
  );
  await expect(icon).toBeVisible();
  await icon.click();
  await page.waitForTimeout(500);
}

/** 按列标题做表格内本地搜索（不触发接口请求） */
async function searchRuleTableByColumn(page, columnTitle, keyword) {
  await routeRulesTable(page).filterByColumn(columnTitle, keyword);
}

/**
 * Global 路由规则快照守卫：记录原始状态、断言未被改动、异常时恢复
 *
 * 只做 UI 交互（拖拽/复制/置灰）的用例必须零写入，跑完用 verifyUnchanged 证明
 * 后端 `enabled` 与规则顺序未变；afterEach 的 restoreIfChanged 兜底失败路径。
 */
function createGlobalRouteRulesGuard() {
  let snapshot = null;

  async function readSnapshot(page) {
    const current = await apiUtils.getGlobalRouteRulesViaApi(page);
    return current === null ? null : JSON.stringify(current);
  }

  return {
    async capture(page) {
      snapshot = await readSnapshot(page);
      common.log('Global 路由规则基线快照: ' + snapshot);
      return snapshot;
    },
    get snapshot() {
      return snapshot;
    },
    async verifyUnchanged(page) {
      expect(snapshot, '未记录 Global 路由规则基线').not.toBeNull();
      expect(await readSnapshot(page), 'Global 路由规则被改动').toBe(snapshot);
    },
    async restoreIfChanged(page) {
      if (snapshot === null) {
        return;
      }
      if ((await readSnapshot(page)) === snapshot) {
        return;
      }
      const original = JSON.parse(snapshot);
      await apiUtils.setGlobalRouteRulesViaApi(page, {
        enabled: original.enabled === true,
        rules: original.rules || [],
      });
      common.log('检测到 Global 路由规则被改动，已恢复原始状态');
    },
  };
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

/**
 * 比较路由表类型：后端 route-tables 的 type 取值为 api_key，
 * 而列表页筛选项与 DOC 文案用的是 apikey，助手内统一归一化后比较
 * （否则 api_key 行会被判定为「不存在」，如 RT-L-14/15 的前置等待）
 */
function routeTableTypeMatches(actualType, expectedType) {
  const normalize = (value) =>
    String(value === undefined || value === null ? '' : value)
      .toLowerCase()
      .replace(/_/g, '');
  return normalize(actualType) === normalize(expectedType);
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
      (row) =>
        routeTableTypeMatches(row.type, routeType) &&
        String(row.owner) === String(ownerId),
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
  const hit = rows.find((row) => routeTableTypeMatches(row.type, 'apikey'));
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
  const hit = rows.find((row) => routeTableTypeMatches(row.type, 'entity'));
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

/**
 * 选择列表「状态」列筛选值
 *
 * 状态列的搜索控件默认就有值（启用），此时 placeholder「请选择状态」不渲染，
 * 按文案定位取不到元素；因此改为按列下标定位（与 RT-L-17 同一套定位）。
 */
async function selectRouteTableStatusFilter(page, statusLabel) {
  await selectRouteTableSearchFilter(
    page,
    ROUTE_TABLE_SEARCH_COLUMN.status,
    statusLabel,
  );
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
  // 会话守卫：带失效 Key 加载列表页会 401 弹「Session Key 错误」遮罩，后续筛选/点击全部超时
  await sessionUtils.ensureSessionHealthy(page, {
    retryUrl: getAppBaseUrl() + ROUTE_TABLE_LIST_PATH,
  });
  // Full page load to list page (clears any previous filters/detail view)
  await navigateToRouteTableListByUrl(page);
  // 列表默认按「启用」过滤，停用行不会出现；按属主定位某一行前先清空该默认值
  await clearRouteTableStatusFilter(page);
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

/**
 * 路由表列表搜索行定位（按列下标，不依赖 placeholder）
 *
 * 状态列的搜索控件默认就有值（启用），placeholder 不会渲染，
 * 因此「请选择状态」这类按文案定位的写法在默认态下取不到元素。
 */
const ROUTE_TABLE_SEARCH_COLUMN = { type: 0, owner: 1, status: 2 };

function routeTableSearchCell(page, columnIndex) {
  return routeTableList(page)
    .searchArea()
    .locator('tbody tr')
    .first()
    .locator('td')
    .nth(columnIndex);
}

function routeTableSearchSelect(page, columnIndex) {
  return routeTableSearchCell(page, columnIndex).locator('.ivu-select').first();
}

async function selectRouteTableSearchFilter(page, columnIndex, optionLabel) {
  const trigger = routeTableSearchSelect(page, columnIndex);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .getByText(optionLabel, { exact: true })
    .click();
  await page.waitForTimeout(500);
}

/** 清空搜索行内的下拉筛选（hover 后点击清空图标，iView 主动派发 on-clear） */
async function clearRouteTableSearchFilter(page, columnIndex) {
  const trigger = routeTableSearchSelect(page, columnIndex);
  if ((await trigger.locator('.ivu-select-selected-value').count()) === 0) {
    return;
  }
  await trigger.hover();
  await page.waitForTimeout(300);
  const clearIcon = trigger.locator(
    '.ivu-select-selection .ivu-icon-ios-close-circle',
  );
  await expect(clearIcon).toBeVisible();
  await clearIcon.click();
  await page.waitForTimeout(500);
}

async function expectRouteTableSearchFilterValue(
  page,
  columnIndex,
  optionLabel,
) {
  await expect(routeTableSearchSelect(page, columnIndex)).toContainText(
    optionLabel,
  );
}

/**
 * 清空列表「状态」列筛选（已设置时才动作，返回是否执行了清空）
 *
 * 列表默认按「启用」过滤（列上预置 searchValue='true'），停用的路由表因此
 * 不在列表中；而按行定位/打开详情/切换启停的前置流程都需要目标行可见。
 * 该动作只发生在「需要操作某一行」的路径上，不发生在页面加载时，
 * 以便 RT-L-17 仍能断言首屏默认值。
 */
async function clearRouteTableStatusFilter(page) {
  const trigger = routeTableSearchSelect(
    page,
    ROUTE_TABLE_SEARCH_COLUMN.status,
  );
  const ready = await trigger
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    common.log('未找到列表「状态」筛选控件，跳过清空');
    return false;
  }
  if ((await trigger.locator('.ivu-select-selected-value').count()) === 0) {
    return false;
  }
  common.log('清空路由表列表「状态」筛选项（默认「启用」会隐藏停用行）');
  await waitForRouteTablesListResponse(page, () =>
    clearRouteTableSearchFilter(page, ROUTE_TABLE_SEARCH_COLUMN.status),
  );
  return true;
}

/**
 * 目标行不可见时先清空「状态」筛选再返回（幂等；行已渲染则不做任何事）
 *
 * 行定位助手统一走这里，避免默认「启用」筛选把停用行挡在列表外
 * 导致 10s 点击超时（RT-L-17 之外的用例都会被它救回）。
 */
async function ensureRouteTableRowReachable(page, rowLocator) {
  if ((await rowLocator.count()) > 0) {
    return false;
  }
  await routeTableList(page)
    .waitForLoaded()
    .catch(() => {});
  if ((await rowLocator.count()) > 0) {
    return false;
  }
  return clearRouteTableStatusFilter(page);
}

const ROUTE_TABLES_LIST_REQUEST_FILTER = (request) =>
  request.method() === 'GET' && request.url().includes('/route-tables?');

/** 记录页面生命周期内全部 route-tables 列表请求 URL（首屏默认筛选取数用） */
function trackRouteTableListRequests(page) {
  const urls = [];
  const handler = (request) => {
    if (ROUTE_TABLES_LIST_REQUEST_FILTER(request)) {
      urls.push(request.url());
    }
  };
  page.on('request', handler);
  return {
    urls,
    stop() {
      page.off('request', handler);
    },
  };
}

/** 执行动作并返回该动作触发的 route-tables 列表请求 URL */
async function waitForRouteTableListRequestUrl(page, action) {
  try {
    const [request] = await Promise.all([
      page.waitForRequest(ROUTE_TABLES_LIST_REQUEST_FILTER, {
        timeout: 15000,
      }),
      action(),
    ]);
    return request.url();
  } catch (e) {
    common.log('等待 route-tables 列表请求超时: ' + e.message);
    return null;
  }
}

/** 解析列表请求的 query 参数为普通对象（未携带的参数为 undefined） */
function getRouteTableListRequestParams(url) {
  const parsed = new URL(url);
  const params = {};
  parsed.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

async function expectRouteTableListHeaders(page) {
  const table = routeTableList(page);
  await table.expectHeaders(...DOC_ROUTE_TABLE.listHeaders);
}

async function expectGlobalRouteTableRowVisible(page) {
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);
  await ensureRouteTableRowReachable(page, row);
  await expect(row).toBeVisible({ timeout: 15000 });
}

async function expectGlobalRouteTableStatus(page, enabled) {
  const table = routeTableList(page);
  const row = globalRouteTableRow(table);
  await ensureRouteTableRowReachable(page, row);
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
  await ensureRouteTableRowReachable(page, row);
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
  const row = globalRouteTableRow(table);
  await ensureRouteTableRowReachable(page, row);
  await waitForGlobalRouteRulesGetResponse(page, async () => {
    await row
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
  await ensureRouteTableRowReachable(page, row);

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
  await ensureRouteTableRowReachable(page, row);

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
  // 重新加载后状态筛选回到默认「启用」，停用的 Global 行会被隐藏，
  // 不先解除筛选下面的按钮状态判断会静默失效（前置条件形同未执行）
  await ensureRouteTableRowReachable(page, row);
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
  await ensureRouteTableRowReachable(page, row);
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
  ROUTE_TABLE_SEARCH_COLUMN,
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
  captureGlobalRouteRulesPutPayload,
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
  routeRulesMainRows,
  getRuleNamesInOrder,
  moveRuleToIndex,
  buildCopyRuleName,
  expectRuleNamesInOrder,
  dragRuleRow,
  routeRulesDragTip,
  expectRouteRulesDragTipVisible,
  expectRuleRowsDraggable,
  getSubmitAndEffectButton,
  isSubmitAndEffectDisabled,
  expectSubmitAndEffectDisabled,
  expectCopyRuleButtonIsLeftmost,
  clickCopyRuleButton,
  clickCopyRuleButtonByIndex,
  ensureRuleRowsAtLeast,
  routeRuleRowByName,
  routeRuleRowIndexByName,
  getRuleRowFieldTexts,
  openEditRuleDrawerByRowIndex,
  getRuleFormNameValue,
  sortRuleTableByColumn,
  searchRuleTableByColumn,
  createGlobalRouteRulesGuard,
  routeTableSearchSelect,
  selectRouteTableSearchFilter,
  clearRouteTableSearchFilter,
  clearRouteTableStatusFilter,
  expectRouteTableSearchFilterValue,
  ensureRouteTableRowReachable,
  routeTableTypeMatches,
  trackRouteTableListRequests,
  waitForRouteTableListRequestUrl,
  getRouteTableListRequestParams,
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
