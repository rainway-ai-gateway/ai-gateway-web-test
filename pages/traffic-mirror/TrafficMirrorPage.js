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
 * 流量镜像规则（TrafficMirror）页面对象
 *
 * 页面结构（src/modules/TrafficMirror/index.vue）：
 * - 根节点 .traffic-mirror，内含 .route-editor-header（标题 + 按钮区）+ pageTable
 * - 视图/编辑双模式：视图模式行操作仅「查看」；编辑模式行操作「编辑」+「删除」，
 *   以「提交并生效」全量 PUT；退出编辑有未提交改动时二次确认并回滚
 * - 两个抽屉在 .traffic-mirror 根下：查看抽屉（.rule-view）/ 表单抽屉（.rule-form）
 * - 编辑模式表格行可拖拽排序（`:draggable="mode === 'edit'"` + `@dragDrop`），表格下方渲染
 *   `.drag-tip` 提示条；`beforeRouteLeave` 对有未提交改动的页面跳转做二次确认（与退出编辑模式同文案）
 *
 * 验收文案常量（DOC_*）与 docs/traffic-mirror/02 及 i18n zh.js 对齐。
 * 数据造数/备份/恢复统一在 api/traffic-mirror-api-utils.js 中实现，本文件不直连网络。
 * 本文件内部禁用裸选择器于 spec —— 所有定位集中于此；spec 只调用本模块导出函数。
 */
const { expect, test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const sessionUtils = require('../../utils/session');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/traffic-mirror-api-utils');
const { PageTableComponent, AppSidebarComponent } = require('../../components/layout');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');
const readonly = require('../../utils/readonly');
const {
  IvuMessageComponent,
  IvuFormComponent,
  IvuSelectComponent,
  IvuModalComponent,
} = require('../../components/iview');

/** 与 docs/traffic-mirror/02 及 i18n zh.js 对齐的验收文案 */
const DOC_TM_PAGE = {
  pageTitle: '流量镜像规则（集合级，按优先级顺序匹配，首条命中生效）',
  enterEditMode: '进入编辑模式',
  exitEditMode: '退出编辑模式',
  submitAndEffect: '提交并生效',
  addRule: '添加规则',
  viewButton: '查看',
  editButton: '编辑',
  deleteButton: '删除',
  submitSuccessMsg: '提交并生效成功！',
  submitFailedMsg: '提交失败!',
  deleteSuccessMsg: '删除成功!',
  cancelDeleteMsg: '取消删除',
  deleteConfirmMsg: '确认删除该镜像规则？删除后需提交并生效。',
  exitConfirm: '当前有未提交的改动，退出编辑模式将丢弃这些改动，确认退出？',
  exitDoneMsg: '已退出编辑模式',
  exitCancelledMsg: '已取消退出',
  informationTips: '信息提示',
  /** 编辑模式专有提示条（index.vue `.drag-tip`，trafficMirror.dragToChangeOrder） */
  dragToChangeOrderTip: '拖动表格可修改生效次序',
  validateErrorMsg: '请检查参数填写是否规范!',
  loadFailedMsg: '加载流量镜像规则失败',
  tipNameDuplicate: '规则名称已存在，集合内必须唯一',
  tipCondDuplicate: '生效条件重复，集合内必须唯一',
};

const DOC_TM_RULES = {
  // 表头 7 列（route.ruleName='规则名'）
  tableHeaders: [
    '规则名',
    '生效条件',
    '镜像集群',
    '采样比例',
    '头部剔除',
    '路径改写',
    '操作',
  ],
  ruleNameColumn: '规则名',
  condColumn: '生效条件',
  clusterColumn: '镜像集群',
  percentageColumn: '采样比例',
  removeHeadersColumn: '头部剔除',
  pathRewriteColumn: '路径改写',
  // 列序号（0 基）：用于按列断言单元格
  columnIndex: {
    name: 0,
    cond: 1,
    cluster: 2,
    percentage: 3,
    removeHeaders: 4,
    pathRewrite: 5,
    action: 6,
  },
  headersDefault: '默认黑名单（Authorization / Cookie / X-Api-Key）',
  headersNone: '不剔除任何头部',
  emptyPlaceholder: '-',
  // 列头搜索输入框占位（pageTable searchable 列：规则名/生效条件/镜像集群）
  searchNamePlaceholder: '请输入规则名查询',
  searchCondPlaceholder: '请输入生效条件查询',
  searchClusterPlaceholder: '请输入镜像集群查询',
  /** 采样比例展示：{value}%（列表口径：缺省显示 -） */
  percentageText(value) {
    return `${value}%`;
  },
  /** 头部剔除三态文案（与 index.vue removeHeadersText 对齐） */
  removeHeadersText(removeHeaders) {
    if (removeHeaders === null || removeHeaders === undefined) {
      return DOC_TM_RULES.headersDefault;
    }
    if (Array.isArray(removeHeaders) && removeHeaders.length === 0) {
      return DOC_TM_RULES.headersNone;
    }
    return (removeHeaders || []).join(', ');
  },
};

const DOC_TM_RULE_FORM = {
  ruleNameFieldLabel: '规则名',
  ruleNamePlaceholder: '请输入规则名称，集合内唯一',
  condFieldLabel: '生效条件（全量匹配请显式使用 default_t()）',
  clusterFieldLabel: '镜像集群',
  clusterPlaceholder: '请选择镜像集群',
  percentageFieldLabel: '采样比例（0-100，0 表示命中不采样）',
  headerModeFieldLabel: '头部剔除策略',
  headerModeDefault: '使用默认黑名单',
  headerModeNone: '不剔除任何头部',
  headerModeCustom: '自定义剔除列表',
  headerCustomPlaceholder: '逗号分隔，如 Authorization,Cookie',
  setHeadersFieldLabel: '设置请求头',
  addHeaderButton: '添加请求头',
  headerKeyPlaceholder: 'Header 名称',
  headerValuePlaceholder: 'Header 值',
  emptyHeaders: '暂无设置请求头',
  bodyRewritesFieldLabel: '请求体改写（一期仅支持 model 字段）',
  addBodyRewriteButton: '添加改写',
  bodyValuePlaceholder: '改写后的值',
  emptyBodyRewrites: '暂无请求体改写',
  pathRewriteFieldLabel: '路径改写（留空表示不改写；非空须以 / 开头）',
  pathRewritePlaceholder: '/v1/chat/completions',
  addTitle: '添加镜像规则',
  editTitle: '编辑镜像规则',
  localSaveButton: '本地保存',
  resetButton: '重置',
  ruleNameRequiredMsg: '请输入规则名称',
  nameLengthMsg: '规则名称长度应为 1-128 字符',
  condRequiredMsg: '请填写生效条件',
  clusterRequiredMsg: '请选择镜像集群',
  percentageRangeMsg: '采样比例必须为 0-100 的整数',
  pathRewriteSlashMsg: '路径改写必须以 / 开头',
  headerKvRequiredMsg: '设置请求头的名称与值均不能为空',
  bodyValueRequiredMsg: '请求体改写的值不能为空',
  removeHeadersEmptyMsg: '自定义剔除列表不能为空',
  nameDuplicateMsg: '规则名称已存在，集合内必须唯一',
  condDuplicateMsg: '生效条件重复，集合内必须唯一',
  addSuccessMsg: '添加成功！',
  saveSuccessMsg: '保存成功！',
  defaultPercentage: 100,
  percentageInputPlaceholder: '100',
  /** KV/请求体改写行内删除按钮（com.del） */
  rowDeleteButton: '删除',
};

const DOC_TM_RULE_VIEW = {
  viewTitle: '查看镜像规则',
  fieldLabels: [
    '规则名',
    '生效条件',
    '镜像集群',
    '采样比例',
    '头部剔除',
    '设置请求头',
    '请求体改写',
    '路径改写',
  ],
  emptyText: '无',
};

const TM_PATH = '/traffic-mirror-rules';
const TM_RULES_URL_PATTERN = '**/open-api/v1/traffic-mirror-rules';

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

// ---------------------------------------------------------------------------
// 会话 / 语言
// ---------------------------------------------------------------------------

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
    currentUrl.includes(TM_PATH) ||
    currentUrl.includes('/cluster') ||
    currentUrl.includes('/route-tables');
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在产品页，先加载首页: ' + page.url());
    await ensureChineseLang(page);
    await page.goto(getAppBaseUrl() + TM_PATH, {
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
      retryUrl: getAppBaseUrl() + TM_PATH,
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

// ---------------------------------------------------------------------------
// 页面作用域
// ---------------------------------------------------------------------------

function pageRoot(page) {
  return page.locator('.traffic-mirror');
}

function ruleTable(page) {
  return new PageTableComponent(
    page,
    page.locator('.traffic-mirror .page-table').first(),
  );
}

function ruleHeader(page) {
  return pageRoot(page).locator('.route-editor-header').first();
}

function ruleFormScope(page) {
  return page.locator('.rule-form');
}

function ruleForm(page) {
  return new IvuFormComponent(ruleFormScope(page));
}

function viewDrawerScope(page) {
  return page.locator('.rule-view');
}

/** 可见的表单抽屉（内含 .rule-form） */
function formDrawer(page) {
  return page
    .locator(IVU_DRAWER_VISIBLE)
    .filter({ has: page.locator('.rule-form') })
    .first();
}

/** 可见的查看抽屉（内含 .rule-view） */
function viewDrawer(page) {
  return page
    .locator(IVU_DRAWER_VISIBLE)
    .filter({ has: page.locator('.rule-view') })
    .first();
}

/**
 * 精确定位规则表单的某个 FormItem。
 * 规避 IvuForm.item 的子串匹配陷阱（如 '镜像集群' 命中其他含同子串项）。
 */
function ruleFormItem(page, label) {
  return ruleFormScope(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

function modal(page) {
  return new IvuModalComponent(page);
}

// ---------------------------------------------------------------------------
// 页面导航与就绪判定
// ---------------------------------------------------------------------------

async function isOnTrafficMirrorPage(page) {
  if (!page.url().includes(TM_PATH)) {
    return false;
  }
  return pageRoot(page)
    .isVisible()
    .catch(() => false);
}

async function expectTrafficMirrorPageReady(page) {
  await expect(pageRoot(page)).toBeVisible();
  await expect(
    pageRoot(page)
      .locator('.route-owner-label')
      .filter({ hasText: DOC_TM_PAGE.pageTitle })
      .first(),
  ).toBeVisible();
}

async function gotoTrafficMirrorPage(page) {
  const targetUrl = getAppBaseUrl() + TM_PATH;
  // 导航入口统一会话守卫（含「已在目标页」提前返回分支）
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });

  if (await isOnTrafficMirrorPage(page)) {
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
}

async function waitForTrafficMirrorRulesGetResponse(
  page,
  action = async () => {},
) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/traffic-mirror-rules') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 traffic-mirror-rules GET 响应超时，降级等待: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
    return null;
  }
}

async function gotoTrafficMirrorPageAndWaitForRules(page) {
  const targetUrl = getAppBaseUrl() + TM_PATH;
  // 导航入口统一会话守卫（含「已在目标页」提前返回分支）
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });

  if (await isOnTrafficMirrorPage(page)) {
    await waitForTrafficMirrorRulesGetResponse(page, () => page.reload());
    await page.waitForTimeout(1000);
    await umUtils.handleUrlInvalidAlert(page);
    await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await waitForTrafficMirrorRulesGetResponse(page, () =>
    page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
    }),
  );
  await page.waitForTimeout(1500);
  await umUtils.handleUrlInvalidAlert(page);
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
}

async function reloadTrafficMirrorPage(page) {
  const targetUrl = getAppBaseUrl() + TM_PATH;
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
  if (!(await isOnTrafficMirrorPage(page))) {
    await gotoTrafficMirrorPageAndWaitForRules(page);
    return;
  }
  await waitForTrafficMirrorRulesGetResponse(page, () => page.reload());
  await page.waitForTimeout(1000);
  await umUtils.handleUrlInvalidAlert(page);
}

// ---------------------------------------------------------------------------
// 页头 / 双模式
// ---------------------------------------------------------------------------

async function expectPageHeaderTitle(
  page,
  expected = DOC_TM_PAGE.pageTitle,
) {
  await expect(
    pageRoot(page)
      .locator('.route-owner-label')
      .filter({ hasText: expected })
      .first(),
  ).toBeVisible();
}

async function expectEditMode(page) {
  const header = ruleHeader(page);
  await expect(
    header.getByRole('button', {
      name: DOC_TM_PAGE.exitEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_TM_PAGE.submitAndEffect,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', { name: DOC_TM_PAGE.addRule, exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_TM_PAGE.enterEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function expectViewMode(page) {
  const header = ruleHeader(page);
  await expect(
    header.getByRole('button', {
      name: DOC_TM_PAGE.enterEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_TM_PAGE.exitEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    header.getByRole('button', {
      name: DOC_TM_PAGE.submitAndEffect,
      exact: true,
    }),
  ).toHaveCount(0);
  // 「添加规则」用 v-show：视图模式 DOM 存在但隐藏
  await expect(
    header.locator('button').filter({ hasText: DOC_TM_PAGE.addRule }),
  ).toBeHidden();
}

async function enterEditMode(page) {
  const header = ruleHeader(page);
  const exitButton = header.getByRole('button', {
    name: DOC_TM_PAGE.exitEditMode,
    exact: true,
  });
  if (await exitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }
  await header
    .getByRole('button', { name: DOC_TM_PAGE.enterEditMode, exact: true })
    .click();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// 只读管理员视角（docs/traffic-mirror/02-功能测试用例/05-只读视角.md TM-RO-01~03）
// ---------------------------------------------------------------------------

/**
 * 页头写入口容器 `.route-header-submit`。
 * index.vue:33 挂 `v-has`（内含进入/退出编辑模式、提交并生效），只读视角加 `.v-has-hidden`。
 */
function ruleHeaderSubmit(page) {
  return ruleHeader(page).locator('.route-header-submit');
}

/**
 * 页头「添加规则」按钮。index.vue:23-31 同时受 `v-show="mode === 'edit'"` 与 `v-has` 约束：
 * 管理员视图模式下 v-show 写内联 `display:none`，只读视角再由 v-has 追加 `.v-has-hidden`，
 * 两种机制都不产出可见元素，故只读断言用「不可见」（不额外钉死 class）。
 */
function ruleHeaderAddRuleBtn(page) {
  return ruleHeader(page)
    .locator('.route-header-actions button')
    .filter({ hasText: DOC_TM_PAGE.addRule });
}

function ruleHeaderEnterEditBtn(page) {
  return ruleHeaderSubmit(page).getByRole('button', {
    name: DOC_TM_PAGE.enterEditMode,
    exact: true,
  });
}

function ruleHeaderExitEditBtn(page) {
  return ruleHeaderSubmit(page).getByRole('button', {
    name: DOC_TM_PAGE.exitEditMode,
    exact: true,
  });
}

function ruleHeaderSubmitAndEffectBtn(page) {
  return ruleHeaderSubmit(page).getByRole('button', {
    name: DOC_TM_PAGE.submitAndEffect,
    exact: true,
  });
}

/**
 * 规则行「操作」列单元格。
 * index.vue:245 操作列显示分支按 `mode === 'view'` 收敛——只读恒停留视图模式，
 * 编辑/删除分支（index.vue:255-275）整体不渲染，行内写按钮可见性复用既有
 * `expectRuleRowOnlyViewAction` / `expectRuleRowEditDeleteActions`。
 */
function ruleRowActions(page, ruleName) {
  return getRuleCell(page, ruleName, DOC_TM_RULES.columnIndex.action);
}

/** 规则行「查看」按钮（只读视角保留的只读入口） */
function ruleRowViewBtn(page, ruleName) {
  return getRuleRow(page, ruleName).getByRole('button', {
    name: DOC_TM_PAGE.viewButton,
    exact: true,
  });
}

/**
 * 编辑模式提示条（index.vue:65 `v-if="mode === 'edit'"`，编辑模式专有）。
 * 只读视角恒停留视图模式 → 不渲染；作为「恒停留视图模式」的旁证。
 */
function rulesDragTip(page) {
  return pageRoot(page).locator('.drag-tip');
}

/** 规则名表头排序控件（列定义 sortable:'custom' → iView `.ivu-table-sort`） */
function ruleNameHeaderSorter(page) {
  return ruleTable(page)
    .headers()
    .filter({ hasText: DOC_TM_RULES.ruleNameColumn })
    .first()
    .locator('.ivu-table-sort');
}

/**
 * 只读视角直连 URL 进入流量镜像规则页。
 * 不复用 `gotoTrafficMirrorPage`——它内部调 `ensureSessionHealthy` / `handleUrlInvalidAlert`，
 * 会以 admin 凭证重登并回写 auth.json，把只读态换回管理员态（见 utils/readonly.js 文件头约束 2）。
 */
async function gotoTrafficMirrorPageReadonly(page) {
  await readonly.gotoAsReadonly(page, TM_PATH, { ready: pageRoot(page) });
  await readonly.expectStillReadonly(page);
}

/**
 * 只读视角就绪判定：面包屑页头标题可见（只读仍存在）+ 页头写入口容器已被 v-has 隐藏。
 * 不能用 `expectViewMode`——它断言「进入编辑模式」可见。
 */
async function expectTrafficMirrorPageReadyReadonly(page) {
  await expect(pageRoot(page)).toBeVisible();
  await expect(
    pageRoot(page)
      .locator('.route-owner-label')
      .filter({ hasText: DOC_TM_PAGE.pageTitle })
      .first(),
  ).toBeVisible();
  await readonly.expectVHasHidden(ruleHeaderSubmit(page), '页头写入口区');
}

/** TM-RO-03 预期 3：只读检索（列头搜索）与排序控件保留 */
async function expectReadonlySearchAndSortRetained(page) {
  const placeholders = [
    DOC_TM_RULES.searchNamePlaceholder,
    DOC_TM_RULES.searchCondPlaceholder,
    DOC_TM_RULES.searchClusterPlaceholder,
  ];
  for (const placeholder of placeholders) {
    await readonly.expectReadonlyVisible(
      ruleSearchInput(page, placeholder),
      `列头搜索输入框（${placeholder}）`,
    );
  }
  await readonly.expectReadonlyVisible(
    ruleNameHeaderSorter(page),
    '规则名表头排序控件',
  );
}

// ---------------------------------------------------------------------------
// 规则列表
// ---------------------------------------------------------------------------

async function expectRuleTableHeaders(page) {
  await ruleTable(page).expectHeaders(...DOC_TM_RULES.tableHeaders);
}

function getRuleRow(page, name) {
  return ruleTable(page)
    .dataRows()
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
}

/** 按列序号（0 基）获取规则行的单元格 */
function getRuleCell(page, name, columnIndex) {
  return getRuleRow(page, name).locator(`td:nth-child(${columnIndex + 1})`);
}

async function getRuleNamesInOrder(page) {
  const texts = await ruleTable(page)
    .dataRows()
    .locator('td:nth-child(1)')
    .allInnerTexts();
  return texts.map((t) => t.trim());
}

async function getRuleRowCount(page) {
  return ruleTable(page).dataRows().count();
}

async function expectRuleCellText(page, name, columnIndex, expected) {
  await expect(getRuleCell(page, name, columnIndex)).toHaveText(expected);
}

async function expectRuleCellContains(page, name, columnIndex, expected) {
  await expect(getRuleCell(page, name, columnIndex)).toContainText(expected);
}

async function expectRuleTableEmpty(page) {
  await expect(ruleTable(page).dataRows()).toHaveCount(0);
}

async function findRuleRowAcrossPages(page, ruleName) {
  const table = ruleTable(page);
  await table.waitForLoaded();
  for (let i = 0; i < 20; i += 1) {
    const row = getRuleRow(page, ruleName);
    if (await row.isVisible().catch(() => false)) {
      return row;
    }
    const pagination = table.pagination();
    if ((await pagination.count()) === 0) {
      break;
    }
    const next = pagination.locator('.btn-next');
    if ((await next.count()) === 0) {
      break;
    }
    if (!(await next.isEnabled().catch(() => false))) {
      break;
    }
    await next.click();
    await page.waitForTimeout(800);
  }
  return null;
}

async function expectRuleRowVisible(page, ruleName) {
  await expect(getRuleRow(page, ruleName)).toBeVisible({ timeout: 15000 });
}

async function expectRuleRowHidden(page, ruleName, timeout = 15000) {
  await expect(getRuleRow(page, ruleName)).toHaveCount(0, { timeout });
}

async function ensureRuleRowVisible(page, ruleName) {
  const row = await findRuleRowAcrossPages(page, ruleName);
  return row !== null;
}

// ---------------------------------------------------------------------------
// 行操作
// ---------------------------------------------------------------------------

async function clickRuleView(page, ruleName) {
  await getRuleRow(page, ruleName)
    .getByRole('button', { name: DOC_TM_PAGE.viewButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function clickRuleEdit(page, ruleName) {
  await getRuleRow(page, ruleName)
    .getByRole('button', { name: DOC_TM_PAGE.editButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function clickRuleDelete(page, ruleName) {
  await getRuleRow(page, ruleName)
    .getByRole('button', { name: DOC_TM_PAGE.deleteButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectRuleRowOnlyViewAction(page, ruleName) {
  const row = getRuleRow(page, ruleName);
  await expect(
    row.getByRole('button', { name: DOC_TM_PAGE.viewButton, exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', { name: DOC_TM_PAGE.editButton, exact: true }),
  ).toHaveCount(0);
  await expect(
    row.getByRole('button', {
      name: DOC_TM_PAGE.deleteButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function expectRuleRowEditDeleteActions(page, ruleName) {
  const row = getRuleRow(page, ruleName);
  await expect(
    row.getByRole('button', { name: DOC_TM_PAGE.editButton, exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: DOC_TM_PAGE.deleteButton,
      exact: true,
    }),
  ).toBeVisible();
}

// ---------------------------------------------------------------------------
// 抽屉：新增 / 编辑 / 查看
// ---------------------------------------------------------------------------

async function openAddRuleDrawer(page) {
  await ruleHeader(page)
    .getByRole('button', { name: DOC_TM_PAGE.addRule, exact: true })
    .click();
  await page.waitForTimeout(500);
  await expect(ruleFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_TM_RULE_FORM.addTitle, { exact: true }),
  ).toBeVisible();
}

async function openEditRuleDrawer(page, ruleName) {
  const row = await findRuleRowAcrossPages(page, ruleName);
  if (!row) {
    throw new Error('未找到待编辑规则行: ' + ruleName);
  }
  await clickRuleEdit(page, ruleName);
  await expect(ruleFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_TM_RULE_FORM.editTitle, { exact: true }),
  ).toBeVisible();
}

async function openViewRuleDrawer(page, ruleName) {
  const row = await findRuleRowAcrossPages(page, ruleName);
  if (!row) {
    throw new Error('未找到待查看规则行: ' + ruleName);
  }
  await clickRuleView(page, ruleName);
  await expect(viewDrawerScope(page)).toBeVisible();
  await expect(
    viewDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_TM_RULE_VIEW.viewTitle, { exact: true }),
  ).toBeVisible();
}

async function closeViewDrawer(page) {
  await viewDrawer(page).locator('.ivu-drawer-close').click();
  await expect(viewDrawerScope(page)).toHaveCount(0, { timeout: 10000 });
}

async function closeRuleFormDrawer(page) {
  await formDrawer(page).locator('.ivu-drawer-close').click();
  await expect(ruleFormScope(page)).toHaveCount(0, { timeout: 10000 });
}

function viewDrawerRow(page, fieldLabel) {
  return viewDrawerScope(page)
    .locator('.info-row')
    .filter({ has: page.getByText(fieldLabel, { exact: true }) })
    .first();
}

async function expectViewDrawerFieldLabels(
  page,
  labels = DOC_TM_RULE_VIEW.fieldLabels,
) {
  for (const label of labels) {
    await expect(viewDrawerRow(page, label).locator('.info-label')).toHaveText(
      label,
    );
  }
}

async function expectViewDrawerFieldValue(page, fieldLabel, expectedValue) {
  await expect(
    viewDrawerRow(page, fieldLabel).locator('.info-value'),
  ).toHaveText(expectedValue);
}

async function expectViewDrawerNoInputs(page) {
  const scope = viewDrawerScope(page);
  await expect(
    scope.locator('input, textarea, .ivu-select, .ivu-select-selection'),
  ).toHaveCount(0);
  for (const name of ['保存', '提交', '重置', '本地保存', '提交并生效']) {
    await expect(scope.getByRole('button', { name })).toHaveCount(0);
  }
}

async function expectViewDrawerNoRequiredMark(page) {
  const scope = viewDrawerScope(page);
  await expect(scope.locator('.ivu-form-item-required')).toHaveCount(0);
  const count = await scope.locator('.info-label').count();
  for (let i = 0; i < count; i += 1) {
    await expect(scope.locator('.info-label').nth(i)).not.toContainText('*');
  }
}

/** 查看抽屉信息行总数（TM-D-01/02：固定 8 行） */
async function expectViewDrawerInfoRowCount(page, count = 8) {
  await expect(viewDrawerScope(page).locator('.info-row')).toHaveCount(count);
}

/** 查看抽屉信息行标签按顺序返回（TM-D-02：固定 8 行顺序核对） */
async function getViewDrawerLabelTexts(page) {
  const texts = await viewDrawerScope(page)
    .locator('.info-row .info-label')
    .allInnerTexts();
  return texts.map((t) => t.trim());
}

function viewDrawerListLines(page, fieldLabel) {
  return viewDrawerRow(page, fieldLabel).locator('.info-value .list-line');
}

/** 设置请求头/请求体改写的逐行文案（TM-D-05/06） */
async function expectViewDrawerListLines(page, fieldLabel, expectedTexts) {
  const lines = viewDrawerListLines(page, fieldLabel);
  await expect(lines).toHaveCount(expectedTexts.length);
  for (let i = 0; i < expectedTexts.length; i += 1) {
    await expect(lines.nth(i)).toHaveText(expectedTexts[i]);
  }
}

/** 空对象/缺省 → 展示「无」（TM-D-05/06） */
async function expectViewDrawerEmptyText(page, fieldLabel) {
  await expect(
    viewDrawerRow(page, fieldLabel).locator('.info-value .empty-text'),
  ).toHaveText(DOC_TM_RULE_VIEW.emptyText);
}

// ---------------------------------------------------------------------------
// 规则表单：填写 / 提交 / 校验
// ---------------------------------------------------------------------------

async function fillRuleName(page, name) {
  const scope = ruleFormScope(page);
  await expect(scope).toBeVisible();
  const input = scope.getByPlaceholder(DOC_TM_RULE_FORM.ruleNamePlaceholder);
  await input.fill(name);
  await input.blur();
  await page.waitForTimeout(200);
}

/** 失焦规则名称输入框（用于触发 blur 校验，不填值） */
async function blurRuleName(page) {
  const input = ruleFormScope(page).getByPlaceholder(
    DOC_TM_RULE_FORM.ruleNamePlaceholder,
  );
  await input.click();
  await ruleFormItem(page, DOC_TM_RULE_FORM.percentageFieldLabel)
    .locator('.ivu-input-number input')
    .click();
  await page.waitForTimeout(300);
}

async function fillRuleCond(page, cond) {
  const scope = ruleFormScope(page);
  // Expression 组件的 textarea 自带 class="expression"，兼容两种结构
  const textarea = scope
    .locator('textarea.expression, .expression textarea')
    .first();
  await textarea.fill(cond);
  await textarea.blur();
  await page.waitForTimeout(500);
}

/**
 * 选择镜像集群。
 * 环境中的集群名存在同前缀（如 test / test121 / test122 / test123），
 * 子串匹配（selectOption）会命中多项触发 strict mode violation，
 * 故按选项全文精确匹配（selectOptionExact），不改变所选集群本身。
 */
async function selectMirrorCluster(page, clusterName) {
  const trigger = ruleFormItem(
    page,
    DOC_TM_RULE_FORM.clusterFieldLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOptionExact(clusterName);
  await page.waitForTimeout(300);
}

async function expectMirrorCluster(page, clusterName) {
  await expect(
    ruleFormItem(page, DOC_TM_RULE_FORM.clusterFieldLabel).locator(
      '.ivu-select-selected-value',
    ),
  ).toHaveText(clusterName);
}

async function selectHeaderMode(page, optionText) {
  const trigger = ruleFormItem(
    page,
    DOC_TM_RULE_FORM.headerModeFieldLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOptionExact(optionText);
  await page.waitForTimeout(300);
}

/** 头部剔除策略为「自定义剔除列表」时填写自定义输入框 */
async function fillCustomRemoveHeaders(page, text) {
  const input = ruleFormScope(page).getByPlaceholder(
    DOC_TM_RULE_FORM.headerCustomPlaceholder,
  );
  await input.fill(text);
  await page.waitForTimeout(200);
}

async function fillPathRewrite(page, text) {
  const input = ruleFormItem(
    page,
    DOC_TM_RULE_FORM.pathRewriteFieldLabel,
  ).locator('input');
  await input.fill(text);
  await input.blur();
  await page.waitForTimeout(200);
}

async function clickAddSetHeader(page) {
  await ruleFormItem(page, DOC_TM_RULE_FORM.setHeadersFieldLabel)
    .getByRole('button', {
      name: DOC_TM_RULE_FORM.addHeaderButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(200);
}

/** 填写第 index（0 基）行设置请求头的 key/value */
async function fillSetHeaderRow(page, index, key, value) {
  const row = ruleFormScope(page).locator('.tm-kv-row').nth(index);
  const inputs = row.locator('input');
  await inputs.nth(0).fill(key);
  await inputs.nth(1).fill(value);
  await page.waitForTimeout(200);
}

async function clickAddBodyRewrite(page) {
  await ruleFormItem(page, DOC_TM_RULE_FORM.bodyRewritesFieldLabel)
    .getByRole('button', {
      name: DOC_TM_RULE_FORM.addBodyRewriteButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(200);
}

/** 填写第 index（0 基）行请求体改写的 value（path 固定 model） */
async function fillBodyRewriteRow(page, index, value) {
  const row = ruleFormScope(page).locator('.tm-body-row').nth(index);
  await row.getByPlaceholder(DOC_TM_RULE_FORM.bodyValuePlaceholder).fill(value);
  await page.waitForTimeout(200);
}

async function clickRuleFormReset(page) {
  await ruleFormScope(page)
    .getByRole('button', {
      name: DOC_TM_RULE_FORM.resetButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(300);
}

async function submitRuleFormAndWait(page) {
  await ruleFormScope(page)
    .getByRole('button', {
      name: DOC_TM_RULE_FORM.localSaveButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(2000);
}

async function submitRuleFormExpectMessage(page, message) {
  const scope = ruleFormScope(page);
  await new IvuMessageComponent(page).waitForTextDuringAction(message, () =>
    scope
      .getByRole('button', {
        name: DOC_TM_RULE_FORM.localSaveButton,
        exact: true,
      })
      .click(),
  );
  await page.waitForTimeout(500);
}

async function expectRuleFormError(page, fieldLabel, message) {
  const tip = ruleFormItem(page, fieldLabel).locator(
    '.ivu-form-item-error-tip',
  );
  await expect(tip).toBeVisible();
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

async function expectRuleFormFieldValid(page, fieldLabel) {
  await expect(
    ruleFormItem(page, fieldLabel).locator('.ivu-form-item-error-tip'),
  ).toBeHidden();
}

async function expectRuleFormDrawerHidden(page) {
  await expect(ruleFormScope(page)).toHaveCount(0, { timeout: 10000 });
}

async function expectRuleFormDrawerStillOpen(page) {
  await expect(ruleFormScope(page)).toBeVisible();
}

function percentageInput(page) {
  return ruleFormItem(page, DOC_TM_RULE_FORM.percentageFieldLabel).locator(
    '.ivu-input-number input',
  );
}

/** InputNumber：fill 即时派发 on-form-change（不 blur 亦触发校验） */
async function fillRulePercentage(page, value) {
  const input = percentageInput(page);
  await input.click();
  await input.fill(value === '' ? '' : String(value));
  await page.waitForTimeout(200);
}

async function expectRulePercentage(page, value) {
  await expect(percentageInput(page)).toHaveValue(
    value === '' ? '' : String(value),
  );
}

/** InputNumber 占位（TM-C-06/V-09：占位 100、min=0、max=100） */
async function expectPercentagePlaceholder(page) {
  await expect(percentageInput(page)).toHaveAttribute(
    'placeholder',
    DOC_TM_RULE_FORM.percentageInputPlaceholder,
  );
}

// ---------------------------------------------------------------------------
// 头部剔除策略 / 设置请求头 / 请求体改写行
// ---------------------------------------------------------------------------

async function expectHeaderModeSelected(page, optionText) {
  await expect(
    ruleFormItem(page, DOC_TM_RULE_FORM.headerModeFieldLabel).locator(
      '.ivu-select-selected-value',
    ),
  ).toHaveText(optionText);
}

function customRemoveHeadersInput(page) {
  return ruleFormScope(page).getByPlaceholder(
    DOC_TM_RULE_FORM.headerCustomPlaceholder,
  );
}

/** 「自定义剔除列表」输入框仅在该模式下渲染（v-if） */
async function expectCustomRemoveHeadersInputHidden(page) {
  await expect(customRemoveHeadersInput(page)).toHaveCount(0);
}

async function expectCustomRemoveHeadersInputVisible(page) {
  await expect(customRemoveHeadersInput(page)).toBeVisible();
}

function setHeaderRows(page) {
  return ruleFormScope(page).locator('.tm-kv-row');
}

function bodyRewriteRows(page) {
  return ruleFormScope(page).locator('.tm-body-row');
}

async function getSetHeaderRowCount(page) {
  return setHeaderRows(page).count();
}

async function getBodyRewriteRowCount(page) {
  return bodyRewriteRows(page).count();
}

async function expectSetHeaderRow(page, index, key, value) {
  const row = setHeaderRows(page).nth(index);
  const inputs = row.locator('input');
  await expect(inputs.nth(0)).toHaveValue(key);
  await expect(inputs.nth(1)).toHaveValue(value);
}

async function expectBodyRewriteRow(page, index, path, value) {
  const row = bodyRewriteRows(page).nth(index);
  await expect(row.locator('.ivu-select-selected-value')).toHaveText(path);
  await expect(row.getByPlaceholder(DOC_TM_RULE_FORM.bodyValuePlaceholder))
    .toHaveValue(value);
}

async function clickRemoveSetHeaderRow(page, index) {
  await setHeaderRows(page)
    .nth(index)
    .getByRole('button', {
      name: DOC_TM_RULE_FORM.rowDeleteButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(200);
}

async function clickRemoveBodyRewriteRow(page, index) {
  await bodyRewriteRows(page)
    .nth(index)
    .getByRole('button', {
      name: DOC_TM_RULE_FORM.rowDeleteButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(200);
}

/** 展开请求体改写首行 path 下拉并返回选项文案（TM-C-14/V-15：仅 model） */
async function getBodyRewritePathOptions(page) {
  const trigger = bodyRewriteRows(page).nth(0).locator('.ivu-select');
  await trigger.click();
  await page.waitForTimeout(300);
  const texts = await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .allInnerTexts();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return texts.map((t) => t.trim());
}

/** 展开镜像集群下拉并返回选项文案（TM-C-04：与 GET clusters 逐一对应） */
async function getClusterOptions(page) {
  const trigger = ruleFormItem(
    page,
    DOC_TM_RULE_FORM.clusterFieldLabel,
  ).locator('.ivu-select');
  await trigger.click();
  await page.waitForTimeout(300);
  const texts = await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .allInnerTexts();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return texts.map((t) => t.trim());
}

/** 镜像集群为必填项（FormItem 带 required 星号；TM-V-07） */
async function expectClusterFieldRequired(page) {
  await expect(ruleFormItem(page, DOC_TM_RULE_FORM.clusterFieldLabel))
    .toHaveClass(/ivu-form-item-required/);
}

// ---------------------------------------------------------------------------
// 列头搜索（pageTable 客户端过滤）
// ---------------------------------------------------------------------------

function ruleSearchInput(page, placeholder) {
  return ruleTable(page).searchArea().getByPlaceholder(placeholder);
}

async function searchRulesByColumn(page, placeholder, keyword) {
  const input = ruleSearchInput(page, placeholder);
  await input.fill(keyword);
  await input.press('Enter');
  await page.waitForTimeout(800);
}

async function clearRulesSearch(page, placeholder) {
  const input = ruleSearchInput(page, placeholder);
  await input.fill('');
  await input.press('Enter');
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// 提交并生效（PUT 整体替换）
// ---------------------------------------------------------------------------

async function waitForTrafficMirrorRulesPutResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/traffic-mirror-rules') &&
          res.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 traffic-mirror-rules PUT 响应超时: ' + e.message);
    return null;
  }
}

async function clickSubmitAndEffect(page) {
  await ruleHeader(page)
    .getByRole('button', {
      name: DOC_TM_PAGE.submitAndEffect,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 提交并生效，捕获 PUT 响应与请求体 */
async function submitRulesAndCapture(page) {
  const response = await waitForTrafficMirrorRulesPutResponse(page, () =>
    clickSubmitAndEffect(page),
  );
  let payload = null;
  if (response) {
    try {
      payload = response.request().postDataJSON();
    } catch (e) {
      common.log('解析 traffic-mirror-rules PUT 请求体失败: ' + e.message);
    }
  }
  return { response, payload };
}

/** 提交并生效并断言成功提示 */
async function submitRulesExpectMessage(
  page,
  message = DOC_TM_PAGE.submitSuccessMsg,
) {
  const messageComp = new IvuMessageComponent(page);
  await messageComp.waitForTextDuringAction(message, () =>
    ruleHeader(page)
      .getByRole('button', {
        name: DOC_TM_PAGE.submitAndEffect,
        exact: true,
      })
      .click(),
  );
  await page.waitForTimeout(1000);
}

async function submitRulesAndWait(page) {
  await waitForTrafficMirrorRulesPutResponse(page, () =>
    clickSubmitAndEffect(page),
  );
  await new IvuMessageComponent(page).expectText(
    DOC_TM_PAGE.submitSuccessMsg,
  );
  await page.waitForTimeout(1000);
}

/** 断言 PUT 请求体中每条规则均不含只读字段 created_at/updated_at（TM-C-20） */
function expectRulesPayloadNoTimestamps(actualPayload) {
  expect(actualPayload).toBeTruthy();
  expect(Array.isArray(actualPayload.rules)).toBe(true);
  for (const rule of actualPayload.rules) {
    expect(rule.created_at).toBeUndefined();
    expect(rule.updated_at).toBeUndefined();
  }
}

// ---------------------------------------------------------------------------
// 退出编辑模式（确认框）
// ---------------------------------------------------------------------------

async function clickExitEditMode(page) {
  await ruleHeader(page)
    .getByRole('button', { name: DOC_TM_PAGE.exitEditMode, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectExitConfirmModal(page) {
  await modal(page).expectOpen(DOC_TM_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_TM_PAGE.exitConfirm),
  ).toBeVisible();
}

async function confirmExitEditMode(page) {
  await modal(page).confirm();
  await page.waitForTimeout(800);
}

async function cancelExitEditMode(page) {
  await modal(page).cancel();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// 拖拽排序（docs/traffic-mirror/02-功能测试用例/07-拖拽排序与离开拦截.md TM-DR-01~03）
// ---------------------------------------------------------------------------

/**
 * 规则表格主数据行（限定主表格 body）。
 *
 * 行定位统一收敛到 `.show-iView-Table .ivu-table-body tbody tr`：`.searchTable` 的列头搜索行
 * 是同一个 `.page-table` 内的**另一个** iView Table，用 `.page-table tbody tr` 取行会把搜索行
 * 一起取到（按下标取行时整体串位）。
 */
function ruleRowsMain(page) {
  return ruleTable(page)
    .rootLocator()
    .locator('.show-iView-Table .ivu-table-body tbody tr');
}

/** 复刻 TrafficMirror.onRuleDragDrop 的移动语义：拖拽行被移动到目标行的原下标处 */
function moveRuleToIndex(names, fromIndex, toIndex) {
  const next = names.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * 断言规则表格的生效次序（轮询重试）：
 * 拖拽/退出编辑模式都是「改本地数组 → Vue 重渲染」的异步链路，静态读一次会读到旧 DOM，
 * 故用 `expect.poll` 让期望顺序在超时窗口内收敛。
 */
async function expectRuleNamesInOrder(page, expectedNames) {
  await expect
    .poll(() => getRuleNamesInOrder(page), {
      timeout: 15000,
      message: '镜像规则表格生效次序不符',
    })
    .toEqual(expectedNames);
}

/** 真实拖拽：把 fromIndex 行拖到 toIndex 行上（Playwright 原生 dragTo，走 iView Sortable） */
async function dragRuleRow(page, fromIndex, toIndex) {
  const rows = ruleRowsMain(page);
  const from = rows.nth(fromIndex);
  const to = rows.nth(toIndex);
  await expect(from).toBeVisible();
  await expect(to).toBeVisible();
  await from.dragTo(to);
  await page.waitForTimeout(800);
}

/** 拖拽提示条（视图模式不渲染；编辑模式显示「拖动表格可修改生效次序」） */
async function expectDragTipVisible(page, visible = true) {
  if (visible) {
    await expect(rulesDragTip(page)).toBeVisible();
  } else {
    await expect(rulesDragTip(page)).toHaveCount(0);
  }
}

/**
 * 行可拖拽属性：编辑模式 `<tr draggable="true">`；视图模式应为 `null`（首次即以视图模式渲染时成立）。
 *
 * **注意**：编辑模式切回视图模式后该属性会残留（iView `table-tr` 的 `v-if/v-else` 双 `<tr>` 原地 patch
 * + Vue 对枚举型属性 `draggable` 不做 `removeAttribute`）——属产品缺陷，见
 * docs/traffic-mirror/02-功能测试用例/07-拖拽排序与离开拦截.md TM-DR-01「阻塞记录」。
 * 断言保持严格（不轮询、不放宽），缺陷未修时该断言应当失败。
 */
async function expectRuleRowsDraggable(page, draggable = true) {
  const rows = ruleRowsMain(page);
  const count = await rows.count();
  expect(count, '规则表格无数据行，无法校验拖拽属性').toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    expect(
      await rows.nth(i).getAttribute('draggable'),
      `第 ${i + 1} 行 draggable 属性不符`,
    ).toBe(draggable ? 'true' : null);
  }
}

/** 可拖拽行的鼠标指针：编辑模式 grab，视图模式不应出现；expected 传 null 断言「不是 grab」 */
async function expectRuleRowsCursorStyle(page, expected = 'grab') {
  const rows = ruleRowsMain(page);
  const count = await rows.count();
  expect(count, '规则表格无数据行，无法校验拖拽光标').toBeGreaterThan(0);
  const cursors = await rows.evaluateAll((els) =>
    els.map((el) => window.getComputedStyle(el).cursor),
  );
  cursors.forEach((cursor, i) => {
    if (expected) {
      expect(cursor, `第 ${i + 1} 行鼠标指针应为 ${expected}`).toBe(expected);
    } else {
      expect(cursor, `第 ${i + 1} 行不应显示拖拽光标`).not.toBe('grab');
    }
  });
}

/** 按列标题排序（点击表头排序图标）；order: asc / desc */
async function sortRuleTableByColumn(page, columnTitle, order = 'desc') {
  const th = ruleTable(page)
    .rootLocator()
    .locator('.show-iView-Table th')
    .filter({ hasText: columnTitle })
    .first();
  const icon = th.locator(
    order === 'asc'
      ? '.ivu-icon-md-arrow-dropup'
      : '.ivu-icon-md-arrow-dropdown',
  );
  await expect(icon).toBeVisible();
  await icon.click();
  await page.waitForTimeout(500);
}

/** 列标题 → 列头搜索输入框占位（pageTable 占位 =「请输入」+ 列标题 +「查询」） */
const RULE_COLUMN_SEARCH_PLACEHOLDER = {
  [DOC_TM_RULES.ruleNameColumn]: DOC_TM_RULES.searchNamePlaceholder,
  [DOC_TM_RULES.condColumn]: DOC_TM_RULES.searchCondPlaceholder,
  [DOC_TM_RULES.clusterColumn]: DOC_TM_RULES.searchClusterPlaceholder,
};

/** 按列标题做表格内本地搜索（纯前端过滤，不触发接口请求；keyword 传空串清除筛选） */
async function searchRuleTableByColumn(page, columnTitle, keyword) {
  const placeholder =
    RULE_COLUMN_SEARCH_PLACEHOLDER[columnTitle] || `请输入${columnTitle}查询`;
  await searchRulesByColumn(page, placeholder, keyword);
}

/** 「提交并生效」按钮态（`:disabled="!isDirty"`）：无本地变更置灰，任一变更后可点 */
async function expectSubmitAndEffectDisabled(page, disabled = true) {
  if (disabled) {
    await expect(ruleHeaderSubmitAndEffectBtn(page)).toBeDisabled();
  } else {
    await expect(ruleHeaderSubmitAndEffectBtn(page)).toBeEnabled();
  }
}

// ---------------------------------------------------------------------------
// 离开拦截（docs/traffic-mirror/02-功能测试用例/07-拖拽排序与离开拦截.md TM-DR-04）
// ---------------------------------------------------------------------------

/** 侧栏「其它模块」菜单候选（按顺序取第一个存在的**顶层**菜单项，无需展开子菜单） */
const SIDEBAR_LEAVE_TARGETS = ['用户管理', '数据报表', '操作日志'];

/**
 * 在应用内经侧栏点击其它模块菜单触发路由跳转（用于验证 beforeRouteLeave 离开拦截）。
 *
 * 菜单树来自 `GET meta`（运行时 `conf/nav_tree.toml`）：「用户管理 / 数据报表 / 操作日志」
 * 为无子菜单的顶层项，直接渲染为 `.ivu-menu-item`；带子菜单的顶层项（如「功能增强」）
 * 需先展开，故不列入候选。
 */
async function clickSidebarMenuItemToLeave(
  page,
  candidates = SIDEBAR_LEAVE_TARGETS,
) {
  const sidebar = new AppSidebarComponent(page);
  for (const label of candidates) {
    const item = sidebar.menuItem(label).first();
    if ((await item.count()) > 0 && (await item.isVisible().catch(() => false))) {
      common.log('侧栏导航离开流量镜像规则页: ' + label);
      await item.click();
      await page.waitForTimeout(800);
      return label;
    }
  }
  throw new Error(
    '侧栏未找到可用作离开拦截目标的菜单项: ' + candidates.join(' / '),
  );
}

/**
 * 未提交改动确认框（`beforeRouteLeave` 与「退出编辑模式」共用同一 `$Modal.confirm` 文案）。
 *
 * 正文用 `.ivu-modal-confirm-body` 精确断言：iView confirm 的 DOM 为
 * `.ivu-modal-confirm > [.ivu-modal-confirm-head, .ivu-modal-confirm-body, .ivu-modal-confirm-footer]`，
 * body 内只含正文，不含标题。
 */
async function expectUnsavedChangesConfirmModal(page) {
  await modal(page).expectOpen(DOC_TM_PAGE.informationTips);
  await expect(
    modal(page).visible().locator('.ivu-modal-confirm-body'),
    `确认框正文应为「${DOC_TM_PAGE.exitConfirm}」`,
  ).toHaveText(DOC_TM_PAGE.exitConfirm);
}

/** 确认框不应出现（无改动场景：不弹确认直接放行） */
async function expectUnsavedChangesConfirmModalAbsent(page) {
  await expect(
    modal(page).withTitle(DOC_TM_PAGE.informationTips),
  ).toBeHidden({ timeout: 10000 });
}

/** 未提交改动确认框：取消（`next(false)`，留在原页） */
async function cancelUnsavedChangesConfirmModal(page) {
  await modal(page).cancel();
  await page.waitForTimeout(500);
}

/** 未提交改动确认框：确定（`next()` 跳走 / `performExitEditMode()` 回滚，提示 3s 内可见） */
async function confirmUnsavedChangesConfirmModal(page) {
  await modal(page).confirm();
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// 删除（确认框）
// ---------------------------------------------------------------------------

async function expectDeleteConfirmModal(page) {
  await modal(page).expectOpen(DOC_TM_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_TM_PAGE.deleteConfirmMsg),
  ).toBeVisible();
}

async function confirmDelete(page) {
  await modal(page).confirm();
  await page.waitForTimeout(800);
}

async function cancelDelete(page) {
  await modal(page).cancel();
  await page.waitForTimeout(500);
}

/** 清空当前集合内全部规则（仅本地编辑态，逐条删除并确认） */
async function deleteAllRules(page, maxIterations = 50) {
  for (let i = 0; i < maxIterations; i += 1) {
    const count = await getRuleRowCount(page);
    if (count === 0) {
      return;
    }
    await ruleTable(page)
      .dataRows()
      .first()
      .getByRole('button', {
        name: DOC_TM_PAGE.deleteButton,
        exact: true,
      })
      .click();
    await confirmDelete(page);
  }
  throw new Error('删除全部规则未在预期次数内完成');
}

// ---------------------------------------------------------------------------
// 网络请求监听（断言「本地保存 / 删除」不发变更请求）
// ---------------------------------------------------------------------------

function trackTrafficMirrorRuleRequests(page) {
  const state = { get: 0, put: 0, putUrls: [] };
  const handler = (request) => {
    const url = request.url();
    if (!url.includes('/traffic-mirror-rules')) {
      return;
    }
    const method = request.method().toUpperCase();
    if (method === 'GET') {
      state.get += 1;
    } else if (method === 'PUT') {
      state.put += 1;
      state.putUrls.push(url);
    }
  };
  page.on('request', handler);
  return {
    state,
    stop() {
      page.off('request', handler);
    },
  };
}

async function expectNoRuleMutationRequest(tracker) {
  expect(
    tracker.state.put,
    '不应发起 traffic-mirror-rules 变更请求(PUT)',
  ).toBe(0);
}

// ---------------------------------------------------------------------------
// Mock 网络（用于空集合 / 加载失败 / 提交失败等无法经真实后端构造的场景）
// ---------------------------------------------------------------------------

async function mockRulesGetResponse(
  page,
  { status = 200, rules = [], errMsg = '' } = {},
) {
  await page.route(TM_RULES_URL_PATTERN, (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    if (status === 200) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 200, Data: { rules } }),
      });
    } else {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: status, ErrMsg: errMsg, Data: null }),
      });
    }
  });
}

async function mockRulesPutFailure(
  page,
  { status = 500, errMsg = '' } = {},
) {
  await page.route(TM_RULES_URL_PATTERN, (route) => {
    if (route.request().method() !== 'PUT') {
      route.continue();
      return;
    }
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ ErrNum: status, ErrMsg: errMsg, Data: null }),
    });
  });
}

/** Mock PUT 响应（可延迟返回），用于提交失败/防重场景（TM-L-19/L-20） */
async function mockRulesPutResponse(
  page,
  { status = 200, delayMs = 0, rules = [] } = {},
) {
  await page.route(TM_RULES_URL_PATTERN, (route) => {
    if (route.request().method() !== 'PUT') {
      route.continue();
      return;
    }
    const fulfill = () =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? { ErrNum: 200, Data: { rules } }
            : { ErrNum: status, ErrMsg: 'mock failure', Data: null },
        ),
      });
    if (delayMs > 0) {
      setTimeout(fulfill, delayMs);
    } else {
      fulfill();
    }
  });
}

async function unmockTrafficMirrorNetwork(page) {
  await page.unroute(TM_RULES_URL_PATTERN).catch(() => {});
}

// ---------------------------------------------------------------------------
// 通用提示断言
// ---------------------------------------------------------------------------

async function expectTrafficMirrorMessage(page, text, timeout = 15000) {
  await new IvuMessageComponent(page).expectText(text, timeout);
}

async function expectTrafficMirrorMessageDuringAction(
  page,
  text,
  action,
  timeout = 8000,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction(
    text,
    action,
    timeout,
  );
}

module.exports = {
  // 常量
  DOC_TM_PAGE,
  DOC_TM_RULES,
  DOC_TM_RULE_FORM,
  DOC_TM_RULE_VIEW,
  TM_PATH,
  TM_RULES_URL_PATTERN,
  // 会话
  getAppBaseUrl,
  isConnectionError,
  ensureChineseLang,
  ensureAuthenticatedShell,
  ensureAppSession,
  // 作用域
  pageRoot,
  ruleTable,
  ruleHeader,
  ruleFormScope,
  ruleForm,
  viewDrawerScope,
  formDrawer,
  viewDrawer,
  ruleFormItem,
  modal,
  // 导航与就绪
  isOnTrafficMirrorPage,
  expectTrafficMirrorPageReady,
  gotoTrafficMirrorPage,
  gotoTrafficMirrorPageAndWaitForRules,
  reloadTrafficMirrorPage,
  waitForTrafficMirrorRulesGetResponse,
  // 只读管理员视角（docs/traffic-mirror/…/05-只读视角.md）
  gotoTrafficMirrorPageReadonly,
  expectTrafficMirrorPageReadyReadonly,
  ruleHeaderSubmit,
  ruleHeaderAddRuleBtn,
  ruleHeaderEnterEditBtn,
  ruleHeaderExitEditBtn,
  ruleHeaderSubmitAndEffectBtn,
  ruleRowActions,
  ruleRowViewBtn,
  rulesDragTip,
  ruleNameHeaderSorter,
  expectReadonlySearchAndSortRetained,
  // 页头 / 双模式
  expectPageHeaderTitle,
  expectEditMode,
  expectViewMode,
  enterEditMode,
  // 规则列表
  expectRuleTableHeaders,
  getRuleRow,
  getRuleCell,
  getRuleNamesInOrder,
  getRuleRowCount,
  expectRuleCellText,
  expectRuleCellContains,
  expectRuleTableEmpty,
  findRuleRowAcrossPages,
  expectRuleRowVisible,
  expectRuleRowHidden,
  ensureRuleRowVisible,
  // 行操作
  clickRuleView,
  clickRuleEdit,
  clickRuleDelete,
  expectRuleRowOnlyViewAction,
  expectRuleRowEditDeleteActions,
  // 抽屉
  openAddRuleDrawer,
  openEditRuleDrawer,
  openViewRuleDrawer,
  closeViewDrawer,
  closeRuleFormDrawer,
  expectViewDrawerFieldLabels,
  expectViewDrawerFieldValue,
  expectViewDrawerNoInputs,
  expectViewDrawerNoRequiredMark,
  expectViewDrawerInfoRowCount,
  getViewDrawerLabelTexts,
  expectViewDrawerListLines,
  expectViewDrawerEmptyText,
  viewDrawerRow,
  // 规则表单
  fillRuleName,
  blurRuleName,
  fillRuleCond,
  fillRulePercentage,
  expectRulePercentage,
  selectMirrorCluster,
  expectMirrorCluster,
  selectHeaderMode,
  fillCustomRemoveHeaders,
  fillPathRewrite,
  clickAddSetHeader,
  fillSetHeaderRow,
  clickAddBodyRewrite,
  fillBodyRewriteRow,
  clickRuleFormReset,
  submitRuleFormAndWait,
  submitRuleFormExpectMessage,
  expectRuleFormError,
  expectRuleFormFieldValid,
  expectRuleFormDrawerHidden,
  expectRuleFormDrawerStillOpen,
  expectPercentagePlaceholder,
  expectHeaderModeSelected,
  expectCustomRemoveHeadersInputHidden,
  expectCustomRemoveHeadersInputVisible,
  getSetHeaderRowCount,
  getBodyRewriteRowCount,
  expectSetHeaderRow,
  expectBodyRewriteRow,
  clickRemoveSetHeaderRow,
  clickRemoveBodyRewriteRow,
  getBodyRewritePathOptions,
  getClusterOptions,
  expectClusterFieldRequired,
  ruleSearchInput,
  searchRulesByColumn,
  clearRulesSearch,
  // 提交并生效
  waitForTrafficMirrorRulesPutResponse,
  clickSubmitAndEffect,
  submitRulesAndCapture,
  submitRulesExpectMessage,
  submitRulesAndWait,
  expectRulesPayloadNoTimestamps,
  // 退出编辑模式
  clickExitEditMode,
  expectExitConfirmModal,
  confirmExitEditMode,
  cancelExitEditMode,
  // 拖拽排序（TM-DR-01~03）
  ruleRowsMain,
  moveRuleToIndex,
  expectRuleNamesInOrder,
  dragRuleRow,
  expectDragTipVisible,
  expectRuleRowsDraggable,
  expectRuleRowsCursorStyle,
  sortRuleTableByColumn,
  searchRuleTableByColumn,
  expectSubmitAndEffectDisabled,
  // 离开拦截（TM-DR-04）
  SIDEBAR_LEAVE_TARGETS,
  clickSidebarMenuItemToLeave,
  expectUnsavedChangesConfirmModal,
  expectUnsavedChangesConfirmModalAbsent,
  cancelUnsavedChangesConfirmModal,
  confirmUnsavedChangesConfirmModal,
  // 删除
  expectDeleteConfirmModal,
  confirmDelete,
  cancelDelete,
  deleteAllRules,
  // 网络监听
  trackTrafficMirrorRuleRequests,
  expectNoRuleMutationRequest,
  // Mock
  mockRulesGetResponse,
  mockRulesPutFailure,
  mockRulesPutResponse,
  unmockTrafficMirrorNetwork,
  // 通用提示断言
  expectTrafficMirrorMessage,
  expectTrafficMirrorMessageDuringAction,
  // API 造数 / 备份 / 恢复（复用 api/traffic-mirror-api-utils.js）
  createTrafficMirrorTestCleanup: apiUtils.createTrafficMirrorTestCleanup,
  fetchTrafficMirrorRulesViaApi: apiUtils.fetchTrafficMirrorRulesViaApi,
  putTrafficMirrorRulesViaApi: apiUtils.putTrafficMirrorRulesViaApi,
  putTrafficMirrorRulesRawViaApi: apiUtils.putTrafficMirrorRulesRawViaApi,
  fetchClusterNamesViaApi: apiUtils.fetchClusterNamesViaApi,
  generateTestRuleName: apiUtils.generateTestRuleName,
  buildTestRule: apiUtils.buildTestRule,
  ensureTrafficMirrorRuleExistsViaApi:
    apiUtils.ensureTrafficMirrorRuleExistsViaApi,
};
