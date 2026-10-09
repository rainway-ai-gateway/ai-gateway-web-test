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
 * AI 缓存规则（AICache）页面对象
 *
 * 页面结构（src/modules/AICache/index.vue）：
 * - 根节点 .ai-cache，内含 Tabs：缓存规则(rules) / 语义设置(semantic)
 * - 缓存规则 Tab：.route-editor-header（标题 + 操作按钮）+ pageTable
 * - 语义设置 Tab：.route-editor-header + Card.form-card（查看态 .semantic-view / 编辑态 Form）
 * - 两个抽屉在 .ai-cache 根下（不在 TabPane 内）：查看抽屉（.rule-view）/ 表单抽屉（.rule-form）
 *
 * 说明：本页面复用 route 命名空间渲染「规则名 / 表达式」表头与表单标签
 * （route.ruleName='规则名'、route.expression='表达式'）。
 * 按已确认决策「以实际 UI 文案为准」，断言常量使用实际 UI 文案；
 * design 原型与 02 文档中的「规则名称 / 生效条件」偏差需在 02 文档标注。
 *
 * 数据造数/备份/恢复统一在 api/ai-cache-api-utils.js 中实现，本文件不直连网络。
 * 本文件内部禁用裸选择器于 spec —— 所有定位集中于此；spec 只调用本模块导出函数。
 */
const { expect, test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/ai-cache-api-utils');
const { PageTableComponent } = require('../../components/layout');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');
const {
  IvuMessageComponent,
  IvuFormComponent,
  IvuTabsComponent,
  IvuSelectComponent,
  IvuModalComponent,
} = require('../../components/iview');

/** 与 docs/ai-cache/02 及 design 原型对齐的验收文案（按实际 UI 文案填充） */
const DOC_AI_CACHE_PAGE = {
  pageTitle: 'AI 缓存规则（集合级，按优先级顺序匹配，首条命中生效）',
  tabRules: '缓存规则',
  tabSemantic: '语义设置',
  semanticSubtitle: '语义缓存全局设置（单例，全局生效）',
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
  deleteConfirmMsg: '确认删除该缓存规则？删除后需提交并生效。',
  exitConfirm: '当前有未提交的改动，退出编辑模式将丢弃这些改动，确认退出？',
  exitDoneMsg: '已退出编辑模式',
  exitCancelledMsg: '已取消退出',
  informationTips: '信息提示',
  validateErrorMsg: '请检查参数填写是否规范!',
  loadFailedMsg: '加载 AI 缓存规则失败',
};

const DOC_AI_CACHE_RULES = {
  // 表头文案：以实际 UI 文案为准（规则名 / 表达式）
  tableHeaders: [
    '规则名',
    '表达式',
    '缓存键策略',
    '缓存 TTL',
    '最大请求体',
    '最大缓存值',
    '语义缓存',
    '操作',
  ],
  ruleNameColumn: '规则名',
  condColumn: '表达式',
  // 列序号（0 基）：用于按列断言单元格
  columnIndex: {
    name: 0,
    cond: 1,
    strategy: 2,
    ttl: 3,
    maxBody: 4,
    maxValue: 5,
    semantic: 6,
    action: 7,
  },
  strategyLastQuestion: '仅最后一个问题（lastQuestion）',
  strategyAllQuestions: '全部问题（allQuestions）',
  strategyDisabled: '缓存豁免（disabled）',
  strategyHint: '该规则命中时将跳过缓存（缓存豁免）。',
  ttlNever: '不过期（0）',
  semanticOn: '开启',
  semanticOff: '关闭',
  emptyPlaceholder: '-',
};

const DOC_AI_CACHE_RULE_FORM = {
  ruleNameFieldLabel: '规则名',
  condFieldLabel: '表达式',
  strategyFieldLabel: '缓存键策略',
  ttlFieldLabel: '缓存 TTL（秒，0 表示不过期）',
  maxBodyFieldLabel: '最大请求体（字节）',
  maxValueFieldLabel: '最大缓存值（字节）',
  semanticFieldLabel: '语义缓存',
  semanticSwitchHint: '缓存键策略为 disabled 时忽略此项',
  strategyDisabledHint: '该规则命中时将跳过缓存（缓存豁免）。',
  ruleNamePlaceholder: '请输入规则名称，1-128 字符，集合内唯一',
  addTitle: '添加缓存规则',
  editTitle: '编辑缓存规则',
  localSaveButton: '本地保存',
  resetButton: '重置',
  ruleNameRequiredMsg: '请输入规则名称',
  nameLengthMsg: '规则名称长度应为 1-128 字符',
  condRequiredMsg: '请填写生效条件',
  ttlNegativeMsg: '缓存 TTL 不能小于 0',
  maxBodyPositiveMsg: '最大请求体必须大于 0',
  maxValuePositiveMsg: '最大缓存值必须大于 0',
  nameDuplicateMsg: '规则名称已存在，集合内必须唯一',
  addSuccessMsg: '添加成功！',
  saveSuccessMsg: '保存成功！',
  defaultStrategy: 'lastQuestion',
  defaultTtl: 0,
  defaultBytes: 1048576,
};

const DOC_AI_CACHE_RULE_VIEW = {
  viewTitle: '查看缓存规则',
  fieldLabels: [
    '规则名',
    '表达式',
    '缓存键策略',
    '缓存 TTL',
    '最大请求体',
    '最大缓存值',
    '语义缓存',
  ],
  strategyFieldLabel: '缓存键策略',
  ttlFieldLabel: '缓存 TTL',
  maxBodyFieldLabel: '最大请求体',
  maxValueFieldLabel: '最大缓存值',
  semanticFieldLabel: '语义缓存',
  ignoreSuffix: '（策略为 disabled，忽略）',
  emptyPlaceholder: '-',
};

const DOC_AI_CACHE_SEMANTIC = {
  subtitle: '语义缓存全局设置（单例，全局生效）',
  cardTitle: '语义缓存全局设置',
  editButton: '编辑',
  cancelButton: '取消',
  saveButton: '保存',
  viewTopK: 'Top K',
  viewThreshold: '相似度阈值',
  viewThresholdRelation: '阈值比较关系',
  topKLabel: 'Top K（1-10，默认 1）',
  thresholdLabel: '相似度阈值（0-2，默认 0.15）',
  thresholdRelationLabel: '阈值比较关系（命中条件：相似度 <关系> 阈值）',
  relationLt: '小于（lt，<）',
  relationLte: '小于等于（lte，≤）',
  relationGt: '大于（gt，>）',
  relationGte: '大于等于（gte，≥）',
  tipTopKRange: 'Top K 须为 1-10 的整数',
  tipThresholdRange: '相似度阈值须在 0-2 之间',
  tipRelationInvalid: '阈值比较关系不合法',
  saveSuccessMsg: '语义缓存设置保存成功！',
  loadFailedMsg: '加载语义缓存设置失败',
  defaultSettings: { top_k: 1, threshold: 0.15, threshold_relation: 'lt' },
};

const DOC_AI_CACHE_SEMANTIC_VIEW = {
  viewLabels: ['Top K', '相似度阈值', '阈值比较关系'],
  relationText: {
    lt: '小于（lt，<）',
    lte: '小于等于（lte，≤）',
    gt: '大于（gt，>）',
    gte: '大于等于（gte，≥）',
  },
};

const AI_CACHE_PATH = '/ai-cache-rules';
const AI_CACHE_RULES_URL_PATTERN = '**/open-api/v1/ai-cache-rules';
const AI_CACHE_SEMANTIC_URL_PATTERN =
  '**/open-api/v1/ai-cache-semantic-settings';

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
// 文案格式化（与 UI 源码 formatTtl / formatBytes 对齐）
// ---------------------------------------------------------------------------

/** 缓存 TTL 展示：null/undefined→'-'；0→'不过期（0）'；其余→'{value} 秒' */
function formatTtlText(value) {
  if (value === null || value === undefined) {
    return DOC_AI_CACHE_RULES.emptyPlaceholder;
  }
  return Number(value) === 0
    ? DOC_AI_CACHE_RULES.ttlNever
    : `${value} 秒`;
}

/** 字节数展示：null/undefined→'-'；其余→'{value} B' */
function formatBytesText(value) {
  if (value === null || value === undefined) {
    return DOC_AI_CACHE_RULES.emptyPlaceholder;
  }
  return `${value} B`;
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
    currentUrl.includes(AI_CACHE_PATH) ||
    currentUrl.includes('/cluster') ||
    currentUrl.includes('/route-tables');
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在产品页，先加载首页: ' + page.url());
    await ensureChineseLang(page);
    await page.goto(getAppBaseUrl() + AI_CACHE_PATH, {
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

// ---------------------------------------------------------------------------
// 页面作用域
// ---------------------------------------------------------------------------

function pageRoot(page) {
  return page.locator('.ai-cache');
}

function ruleTable(page) {
  return new PageTableComponent(
    page,
    page.locator('.ai-cache .page-table').first(),
  );
}

function tabs(page) {
  return new IvuTabsComponent(page, pageRoot(page));
}

/** 规则 Tab 面板（以 .page-table 唯一标识，避免跨 Tab 误命中） */
function rulePane(page) {
  return page
    .locator('.ai-cache .ivu-tabs-tabpane')
    .filter({ has: page.locator('.page-table') })
    .first();
}

/** 语义 Tab 面板（以 Card.form-card 唯一标识） */
function semanticPane(page) {
  return page
    .locator('.ai-cache .ivu-tabs-tabpane')
    .filter({ has: page.locator('.form-card') })
    .first();
}

function ruleHeader(page) {
  return rulePane(page).locator('.route-editor-header');
}

function semanticHeader(page) {
  return semanticPane(page).locator('.route-editor-header');
}

function semanticView(page) {
  return semanticPane(page).locator('.semantic-view');
}

function semanticFormScope(page) {
  return semanticPane(page).locator('.ivu-form').first();
}

function semanticForm(page) {
  return new IvuFormComponent(semanticFormScope(page));
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
 * 规避 IvuForm.item 的子串匹配陷阱（'缓存键策略' 会命中语义缓存项的 hint 文案）。
 */
function ruleFormItem(page, label) {
  return ruleFormScope(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

function semanticFormItem(page, label) {
  return semanticFormScope(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

// ---------------------------------------------------------------------------
// 页面导航与就绪判定
// ---------------------------------------------------------------------------

async function isOnAiCachePage(page) {
  if (!page.url().includes(AI_CACHE_PATH)) {
    return false;
  }
  return pageRoot(page)
    .isVisible()
    .catch(() => false);
}

async function expectAiCachePageReady(page) {
  await expect(pageRoot(page)).toBeVisible();
  await expect(
    pageRoot(page)
      .locator('.route-owner-label')
      .filter({ hasText: DOC_AI_CACHE_PAGE.pageTitle })
      .first(),
  ).toBeVisible();
}

async function gotoAiCachePage(page) {
  if (await isOnAiCachePage(page)) {
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await page.goto(getAppBaseUrl() + AI_CACHE_PATH, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
}

async function waitForAiCacheRulesGetResponse(page, action = async () => {}) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-cache-rules') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-cache-rules GET 响应超时，降级等待: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
    return null;
  }
}

async function gotoAiCachePageAndWaitForRules(page) {
  if (await isOnAiCachePage(page)) {
    await waitForAiCacheRulesGetResponse(page, () => page.reload());
    await page.waitForTimeout(1000);
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await waitForAiCacheRulesGetResponse(page, () =>
    page.goto(getAppBaseUrl() + AI_CACHE_PATH, {
      waitUntil: 'domcontentloaded',
    }),
  );
  await page.waitForTimeout(1500);
  await umUtils.handleUrlInvalidAlert(page);
}

async function reloadAiCachePage(page) {
  if (!(await isOnAiCachePage(page))) {
    await gotoAiCachePageAndWaitForRules(page);
    return;
  }
  await waitForAiCacheRulesGetResponse(page, () => page.reload());
  await page.waitForTimeout(1000);
  await umUtils.handleUrlInvalidAlert(page);
}

/**
 * 在页面重载过程中捕获错误提示（用于「加载失败」类用例）。
 * 调用前须先 ensureAppSession 并注册好对应 mock。
 */
async function reloadAiCachePageExpectMessage(page, message, timeout = 20000) {
  const messageComp = new IvuMessageComponent(page);
  // 首次进入（如 about:blank）须先导航到 AI 缓存页，否则 reload 无目标
  const action = (await isOnAiCachePage(page))
    ? () => page.reload({ waitUntil: 'domcontentloaded' })
    : async () => {
        await ensureChineseLang(page);
        await page.goto(getAppBaseUrl() + AI_CACHE_PATH, {
          waitUntil: 'domcontentloaded',
        });
      };
  await Promise.all([messageComp.expectText(message, timeout), action()]);
  await page.waitForTimeout(500);
  await umUtils.handleUrlInvalidAlert(page);
}

// ---------------------------------------------------------------------------
// 页头 / Tab
// ---------------------------------------------------------------------------

async function expectPageHeaderTitle(
  page,
  expected = DOC_AI_CACHE_PAGE.pageTitle,
) {
  await expect(
    pageRoot(page)
      .locator('.route-owner-label')
      .filter({ hasText: expected })
      .first(),
  ).toBeVisible();
}

async function expectTabs(page) {
  await tabs(page).expectTabsVisible(
    DOC_AI_CACHE_PAGE.tabRules,
    DOC_AI_CACHE_PAGE.tabSemantic,
  );
}

async function expectActiveTab(page, expectedLabel) {
  await expect(pageRoot(page).locator('.ivu-tabs-tab-active').first()).toHaveText(
    expectedLabel,
  );
}

async function switchToTab(page, tabLabel) {
  await tabs(page).clickTabByText(tabLabel);
  await page.waitForTimeout(500);
}

async function switchToRulesTab(page) {
  await switchToTab(page, DOC_AI_CACHE_PAGE.tabRules);
}

async function switchToSemanticTab(page) {
  await switchToTab(page, DOC_AI_CACHE_PAGE.tabSemantic);
}

/** 规则头「提交」按钮右上角绝对定位（AC-L-16） */
async function expectRuleHeaderSubmitPosition(page) {
  const submit = ruleHeader(page).locator('.route-header-submit');
  await expect(submit).toBeVisible();
  const style = await submit.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, right: cs.right, top: cs.top };
  });
  expect(style.position).toBe('absolute');
  expect(style.right).toBe('0px');
}

// ---------------------------------------------------------------------------
// 规则列表
// ---------------------------------------------------------------------------

async function expectRuleTableHeaders(page) {
  await ruleTable(page).expectHeaders(...DOC_AI_CACHE_RULES.tableHeaders);
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

async function expectRuleRowOrder(page, names, options = {}) {
  const exact = options.exact !== false;
  const actual = (await getRuleNamesInOrder(page)).slice(0, names.length);
  if (exact) {
    expect(actual).toEqual(names);
  } else {
    names.forEach((name, i) => expect(actual[i]).toContain(name));
  }
}

async function expectRuleCellText(page, name, columnIndex, expected) {
  await expect(getRuleCell(page, name, columnIndex)).toHaveText(expected);
}

async function expectRuleCellContains(page, name, columnIndex, expected) {
  await expect(getRuleCell(page, name, columnIndex)).toContainText(expected);
}

async function expectRuleStrategyTag(page, name, text, color) {
  const tag = getRuleCell(
    page,
    name,
    DOC_AI_CACHE_RULES.columnIndex.strategy,
  ).locator('.ivu-tag');
  await expect(tag).toHaveText(text);
  if (color) {
    await expect(tag).toHaveClass(new RegExp(`ivu-tag-${color}`));
  }
}

async function expectRuleSemanticTag(page, name, text, color) {
  const tag = getRuleCell(
    page,
    name,
    DOC_AI_CACHE_RULES.columnIndex.semantic,
  ).locator('.ivu-tag');
  await expect(tag).toHaveText(text);
  if (color) {
    await expect(tag).toHaveClass(new RegExp(`ivu-tag-${color}`));
  }
}

async function expectRuleTableEmpty(page) {
  await expect(ruleTable(page).dataRows()).toHaveCount(0);
}

async function expectEditMode(page) {
  const header = ruleHeader(page);
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.exitEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.submitAndEffect,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.addRule,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.enterEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function expectViewMode(page) {
  const header = ruleHeader(page);
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.enterEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.exitEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.submitAndEffect,
      exact: true,
    }),
  ).toHaveCount(0);
  // 「添加规则」用 v-show：视图模式 DOM 存在但隐藏
  await expect(
    header.locator('button').filter({ hasText: DOC_AI_CACHE_PAGE.addRule }),
  ).toBeHidden();
}

async function enterEditMode(page) {
  const header = ruleHeader(page);
  const exitButton = header.getByRole('button', {
    name: DOC_AI_CACHE_PAGE.exitEditMode,
    exact: true,
  });
  if (await exitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }
  await header
    .getByRole('button', { name: DOC_AI_CACHE_PAGE.enterEditMode, exact: true })
    .click();
  await page.waitForTimeout(500);
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
    .getByRole('button', { name: DOC_AI_CACHE_PAGE.viewButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function clickRuleEdit(page, ruleName) {
  await getRuleRow(page, ruleName)
    .getByRole('button', { name: DOC_AI_CACHE_PAGE.editButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function clickRuleDelete(page, ruleName) {
  await getRuleRow(page, ruleName)
    .getByRole('button', { name: DOC_AI_CACHE_PAGE.deleteButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectRuleRowOnlyViewAction(page, ruleName) {
  const row = getRuleRow(page, ruleName);
  await expect(
    row.getByRole('button', { name: DOC_AI_CACHE_PAGE.viewButton, exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', { name: DOC_AI_CACHE_PAGE.editButton, exact: true }),
  ).toHaveCount(0);
  await expect(
    row.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.deleteButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function expectRuleRowEditDeleteActions(page, ruleName) {
  const row = getRuleRow(page, ruleName);
  await expect(
    row.getByRole('button', { name: DOC_AI_CACHE_PAGE.editButton, exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: DOC_AI_CACHE_PAGE.deleteButton,
      exact: true,
    }),
  ).toBeVisible();
}

// ---------------------------------------------------------------------------
// 列表搜索（客户端过滤）
// ---------------------------------------------------------------------------

function rulesSearchInput(page) {
  return ruleTable(page).searchArea().locator('input').first();
}

async function searchRules(page, keyword) {
  const input = rulesSearchInput(page);
  await input.click();
  await input.fill(keyword);
  await page.waitForTimeout(500);
}

async function clearRulesSearch(page) {
  await searchRules(page, '');
}

// ---------------------------------------------------------------------------
// 抽屉：新增 / 编辑 / 查看
// ---------------------------------------------------------------------------

async function openAddRuleDrawer(page) {
  await ruleHeader(page)
    .getByRole('button', { name: DOC_AI_CACHE_PAGE.addRule, exact: true })
    .click();
  await page.waitForTimeout(500);
  await expect(ruleFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_AI_CACHE_RULE_FORM.addTitle, { exact: true }),
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
      .getByText(DOC_AI_CACHE_RULE_FORM.editTitle, { exact: true }),
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
      .getByText(DOC_AI_CACHE_RULE_VIEW.viewTitle, { exact: true }),
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
  labels = DOC_AI_CACHE_RULE_VIEW.fieldLabels,
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

// ---------------------------------------------------------------------------
// 规则表单：填写 / 读取 / 提交 / 校验
// ---------------------------------------------------------------------------

async function fillRuleName(page, name) {
  const scope = ruleFormScope(page);
  await expect(scope).toBeVisible();
  const input = scope.getByPlaceholder(
    DOC_AI_CACHE_RULE_FORM.ruleNamePlaceholder,
  );
  await input.fill(name);
  await input.blur();
  await page.waitForTimeout(200);
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

/** InputNumber：fill 即时派发 on-form-change（不 blur 亦触发校验） */
async function fillRuleFormNumber(page, fieldLabel, value) {
  const input = ruleFormItem(page, fieldLabel).locator('.ivu-input-number input');
  await input.click();
  await input.fill(value === '' ? '' : String(value));
  await page.waitForTimeout(200);
}

async function expectRuleFormNumber(page, fieldLabel, value) {
  const input = ruleFormItem(page, fieldLabel).locator('.ivu-input-number input');
  await expect(input).toHaveValue(value === '' ? '' : String(value));
}

async function selectRuleFormStrategy(page, optionText) {
  const trigger = ruleFormItem(
    page,
    DOC_AI_CACHE_RULE_FORM.strategyFieldLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOption(optionText);
  await page.waitForTimeout(300);
}

async function expectRuleFormStrategy(page, optionText) {
  await expect(
    ruleFormItem(page, DOC_AI_CACHE_RULE_FORM.strategyFieldLabel).locator(
      '.ivu-select-selected-value',
    ),
  ).toHaveText(optionText);
}

/** 打开「缓存键策略」下拉并断言选项集合（AC-V-06） */
async function expectRuleFormStrategyOptions(page, expectedTexts) {
  const trigger = ruleFormItem(
    page,
    DOC_AI_CACHE_RULE_FORM.strategyFieldLabel,
  ).locator('.ivu-select');
  await trigger.click();
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  await expect(items).toHaveCount(expectedTexts.length);
  const actual = (await items.allInnerTexts())
    .map((t) => t.trim())
    .filter(Boolean);
  expect(actual).toEqual(expectedTexts);
  await trigger.click();
  await page.waitForTimeout(200);
}

async function expectRuleFormStrategyHint(page, visible = true) {
  const hint = ruleFormScope(page).locator('.strategy-hint');
  if (visible) {
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(DOC_AI_CACHE_RULE_FORM.strategyDisabledHint);
  } else {
    await expect(hint).toHaveCount(0);
  }
}

async function toggleRuleFormSwitch(page) {
  await ruleFormItem(page, DOC_AI_CACHE_RULE_FORM.semanticFieldLabel)
    .locator('.ivu-switch')
    .click();
  await page.waitForTimeout(200);
}

async function expectRuleFormSwitch(page, enabled) {
  const sw = ruleFormItem(
    page,
    DOC_AI_CACHE_RULE_FORM.semanticFieldLabel,
  ).locator('.ivu-switch');
  if (enabled) {
    await expect(sw).toHaveClass(/ivu-switch-checked/);
  } else {
    await expect(sw).not.toHaveClass(/ivu-switch-checked/);
  }
}

async function expectRuleFormSemanticHint(page) {
  await expect(
    ruleFormScope(page).locator('.semantic-hint'),
  ).toHaveText(DOC_AI_CACHE_RULE_FORM.semanticSwitchHint);
}

async function clickRuleFormReset(page) {
  await ruleFormScope(page)
    .getByRole('button', { name: DOC_AI_CACHE_RULE_FORM.resetButton, exact: true })
    .click();
  await page.waitForTimeout(300);
}

/** 断言新增抽屉的默认值（AC-C-01） */
async function expectRuleFormDefaultValues(page) {
  await expect(
    ruleFormScope(page).getByPlaceholder(
      DOC_AI_CACHE_RULE_FORM.ruleNamePlaceholder,
    ),
  ).toHaveValue('');
  await expect(
    ruleFormScope(page).locator('textarea.expression, .expression textarea').first(),
  ).toHaveValue('');
  await expectRuleFormStrategy(
    page,
    DOC_AI_CACHE_RULES.strategyLastQuestion,
  );
  await expectRuleFormNumber(
    page,
    DOC_AI_CACHE_RULE_FORM.ttlFieldLabel,
    DOC_AI_CACHE_RULE_FORM.defaultTtl,
  );
  await expectRuleFormNumber(
    page,
    DOC_AI_CACHE_RULE_FORM.maxBodyFieldLabel,
    DOC_AI_CACHE_RULE_FORM.defaultBytes,
  );
  await expectRuleFormNumber(
    page,
    DOC_AI_CACHE_RULE_FORM.maxValueFieldLabel,
    DOC_AI_CACHE_RULE_FORM.defaultBytes,
  );
  await expectRuleFormSwitch(page, false);
  await expectRuleFormStrategyHint(page, false);
}

async function submitRuleFormAndWait(page) {
  await ruleFormScope(page)
    .getByRole('button', {
      name: DOC_AI_CACHE_RULE_FORM.localSaveButton,
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
        name: DOC_AI_CACHE_RULE_FORM.localSaveButton,
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

// ---------------------------------------------------------------------------
// 提交并生效（PUT 整体替换）
// ---------------------------------------------------------------------------

async function waitForAiCacheRulesPutResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-cache-rules') &&
          res.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-cache-rules PUT 响应超时: ' + e.message);
    return null;
  }
}

async function clickSubmitAndEffect(page) {
  await ruleHeader(page)
    .getByRole('button', {
      name: DOC_AI_CACHE_PAGE.submitAndEffect,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 提交并生效，捕获 PUT 响应与请求体 */
async function submitRulesAndCapture(page) {
  const response = await waitForAiCacheRulesPutResponse(page, () =>
    clickSubmitAndEffect(page),
  );
  let payload = null;
  if (response) {
    try {
      payload = response.request().postDataJSON();
    } catch (e) {
      common.log('解析 ai-cache-rules PUT 请求体失败: ' + e.message);
    }
  }
  return { response, payload };
}

/** 提交并生效并断言成功提示 */
async function submitRulesExpectMessage(
  page,
  message = DOC_AI_CACHE_PAGE.submitSuccessMsg,
) {
  const messageComp = new IvuMessageComponent(page);
  await messageComp.waitForTextDuringAction(message, () =>
    ruleHeader(page)
      .getByRole('button', {
        name: DOC_AI_CACHE_PAGE.submitAndEffect,
        exact: true,
      })
      .click(),
  );
  await page.waitForTimeout(1000);
}

async function submitRulesAndWait(page) {
  await waitForAiCacheRulesPutResponse(page, () => clickSubmitAndEffect(page));
  await new IvuMessageComponent(page).expectText(
    DOC_AI_CACHE_PAGE.submitSuccessMsg,
  );
  await page.waitForTimeout(1000);
}

/** 断言 PUT 请求体中规则顺序（数组顺序即优先级） */
function expectRulesPayloadOrder(actualPayload, names) {
  expect(actualPayload).toBeTruthy();
  expect(actualPayload.rules).toBeTruthy();
  const actualNames = actualPayload.rules.map((r) => r.name);
  expect(actualNames).toEqual(names);
}

/** 断言 PUT 请求体不含只读字段 created_at/updated_at（AC-C-13） */
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

function modal(page) {
  return new IvuModalComponent(page);
}

async function clickExitEditMode(page) {
  await ruleHeader(page)
    .getByRole('button', { name: DOC_AI_CACHE_PAGE.exitEditMode, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectExitConfirmModal(page) {
  await modal(page).expectOpen(DOC_AI_CACHE_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_AI_CACHE_PAGE.exitConfirm),
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
// 删除（确认框）
// ---------------------------------------------------------------------------

async function expectDeleteConfirmModal(page) {
  await modal(page).expectOpen(DOC_AI_CACHE_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_AI_CACHE_PAGE.deleteConfirmMsg),
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
        name: DOC_AI_CACHE_PAGE.deleteButton,
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

function trackAiCacheRuleRequests(page) {
  const state = { get: 0, put: 0, putUrls: [] };
  const handler = (request) => {
    const url = request.url();
    if (!url.includes('/ai-cache-rules')) {
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
  expect(tracker.state.put, '不应发起 ai-cache-rules 变更请求(PUT)').toBe(0);
}

// ---------------------------------------------------------------------------
// 语义设置 Tab
// ---------------------------------------------------------------------------

async function expectSemanticHeaderSubtitle(page) {
  await expect(
    semanticHeader(page).locator('.route-owner-label'),
  ).toHaveText(DOC_AI_CACHE_SEMANTIC.subtitle);
}

async function expectSemanticCardTitle(page) {
  await expect(
    semanticPane(page).locator('.card-title, .ivu-card-head').first(),
  ).toContainText(DOC_AI_CACHE_SEMANTIC.cardTitle);
}

async function expectSemanticViewLabels(
  page,
  labels = DOC_AI_CACHE_SEMANTIC_VIEW.viewLabels,
) {
  for (const label of labels) {
    await expect(
      semanticView(page)
        .locator('.info-row')
        .filter({ has: page.getByText(label, { exact: true }) })
        .first()
        .locator('.info-label'),
    ).toHaveText(label);
  }
}

async function expectSemanticViewField(page, fieldLabel, expectedValue) {
  await expect(
    semanticView(page)
      .locator('.info-row')
      .filter({ has: page.getByText(fieldLabel, { exact: true }) })
      .first()
      .locator('.info-value'),
  ).toHaveText(expectedValue);
}

async function expectSemanticViewMode(page) {
  await expect(semanticView(page)).toBeVisible();
  await expect(
    semanticHeader(page).getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.editButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    semanticHeader(page).getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.cancelButton,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    semanticHeader(page).getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.saveButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function enterSemanticEditMode(page) {
  await semanticHeader(page)
    .getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.editButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function expectSemanticEditMode(page) {
  await expect(semanticFormScope(page)).toBeVisible();
  await expect(
    semanticHeader(page).getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.cancelButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    semanticHeader(page).getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.saveButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    semanticHeader(page).getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.editButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function cancelSemanticEditMode(page) {
  await semanticHeader(page)
    .getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.cancelButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function fillSemanticNumber(page, fieldLabel, value) {
  const input = semanticFormItem(page, fieldLabel).locator(
    '.ivu-input-number input',
  );
  await input.click();
  await input.fill(value === '' ? '' : String(value));
  await page.waitForTimeout(200);
}

async function fillSemanticTopK(page, value) {
  await fillSemanticNumber(page, DOC_AI_CACHE_SEMANTIC.topKLabel, value);
}

async function fillSemanticThreshold(page, value) {
  await fillSemanticNumber(page, DOC_AI_CACHE_SEMANTIC.thresholdLabel, value);
}

async function selectSemanticRelation(page, optionText) {
  const trigger = semanticFormItem(
    page,
    DOC_AI_CACHE_SEMANTIC.thresholdRelationLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOption(optionText);
  await page.waitForTimeout(300);
}

async function expectSemanticFieldError(page, fieldLabel, message) {
  const tip = semanticFormItem(page, fieldLabel).locator(
    '.ivu-form-item-error-tip',
  );
  await expect(tip).toBeVisible();
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

/** 断言语义设置表单字段当前无校验错误 */
async function expectSemanticFieldValid(page, fieldLabel) {
  await expect(
    semanticFormItem(page, fieldLabel).locator('.ivu-form-item-error-tip'),
  ).toBeHidden();
}

/** 断言语义设置查看 / 编辑态均无「创建时间 / 更新时间」展示位或输入项 */
async function expectSemanticNoTimestampField(page) {
  const labels = await semanticPane(page)
    .locator('.info-label, .ivu-form-item-label')
    .allInnerTexts();
  const joined = labels.join('|');
  expect(joined).not.toContain('创建时间');
  expect(joined).not.toContain('更新时间');
}

async function waitForAiCacheSemanticGetResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-cache-semantic-settings') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-cache-semantic-settings GET 响应超时: ' + e.message);
    return null;
  }
}

async function waitForAiCacheSemanticPutResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-cache-semantic-settings') &&
          res.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-cache-semantic-settings PUT 响应超时: ' + e.message);
    return null;
  }
}

async function clickSemanticSave(page) {
  await semanticHeader(page)
    .getByRole('button', {
      name: DOC_AI_CACHE_SEMANTIC.saveButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 点击「保存」并捕获语义设置 PUT 请求体 */
async function saveSemanticAndCapture(page) {
  const response = await waitForAiCacheSemanticPutResponse(page, () =>
    clickSemanticSave(page),
  );
  let payload = null;
  if (response) {
    try {
      payload = response.request().postDataJSON();
    } catch (e) {
      common.log('解析 semantic PUT 请求体失败: ' + e.message);
    }
  }
  return { response, payload };
}

async function saveSemanticExpectMessage(
  page,
  message = DOC_AI_CACHE_SEMANTIC.saveSuccessMsg,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction(message, () =>
    clickSemanticSave(page),
  );
  await page.waitForTimeout(1000);
}

/** 展开「阈值比较关系」下拉，断言选项数量与文案（transfer 下拉渲染到 body） */
async function expectSemanticRelationOptions(
  page,
  options = [
    DOC_AI_CACHE_SEMANTIC.relationLt,
    DOC_AI_CACHE_SEMANTIC.relationLte,
    DOC_AI_CACHE_SEMANTIC.relationGt,
    DOC_AI_CACHE_SEMANTIC.relationGte,
  ],
) {
  const trigger = semanticFormItem(
    page,
    DOC_AI_CACHE_SEMANTIC.thresholdRelationLabel,
  ).locator('.ivu-select');
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await trigger.click();
  await page.waitForTimeout(300);
  const dropdown = page.locator('.ivu-select-dropdown:visible').first();
  await expect(dropdown).toBeVisible();
  // transfer：下拉渲染到 body，不被外层 .form-card 裁剪
  await expect(page.locator('.form-card .ivu-select-dropdown')).toHaveCount(0);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  await expect(items).toHaveCount(options.length);
  for (let i = 0; i < options.length; i += 1) {
    await expect(items.nth(i)).toHaveText(options[i]);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** 断言语义设置表单字段的必填标记（红 `*`） */
async function expectSemanticFieldRequired(page, fieldLabel, required = true) {
  const item = semanticFormItem(page, fieldLabel);
  if (required) {
    await expect(item).toHaveClass(/ivu-form-item-required/);
  } else {
    await expect(item).not.toHaveClass(/ivu-form-item-required/);
  }
}

/** 断言语义设置数字输入控件的 min / max / step（经组件实例读取） */
async function expectSemanticNumberControl(page, fieldLabel, { min, max, step }) {
  const input = semanticFormItem(page, fieldLabel).locator(
    '.ivu-input-number input',
  );
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();
  const actual = await page.evaluate((lbl) => {
    const root = document.querySelector('.ai-cache');
    if (!root) {
      return null;
    }
    const item = Array.from(root.querySelectorAll('.ivu-form-item')).find(
      (el) => {
        const label = el.querySelector('.ivu-form-item-label');
        return label && label.textContent.trim() === lbl;
      },
    );
    if (!item) {
      return null;
    }
    const numEl = item.querySelector('.ivu-input-number');
    if (!numEl || !numEl.__vue__) {
      return null;
    }
    const vm = numEl.__vue__;
    return { min: vm.min, max: vm.max, step: vm.step };
  }, fieldLabel);
  if (!actual) {
    throw new Error('未找到语义设置数字控件: ' + fieldLabel);
  }
  if (min !== undefined) expect(actual.min).toBe(min);
  if (max !== undefined) expect(actual.max).toBe(max);
  if (step !== undefined) expect(actual.step).toBe(step);
}

/** 断言语义设置数字字段当前回显值 */
async function expectSemanticNumber(page, fieldLabel, value) {
  await expect(
    semanticFormItem(page, fieldLabel).locator('.ivu-input-number input'),
  ).toHaveValue(String(value));
}

/** 断言阈值比较关系下拉当前选中项文案 */
async function expectSemanticRelation(page, optionText) {
  await expect(
    semanticFormItem(
      page,
      DOC_AI_CACHE_SEMANTIC.thresholdRelationLabel,
    ).locator('.ivu-select'),
  ).toContainText(optionText);
}

/**
 * 通过 Vue 模型直接注入 threshold_relation。
 * 用于构造下拉之外的非法枚举（如 'LT' / 'eq'），无法经正常 UI 操作产生。
 * 注入后立即 validateField，以触发「阈值比较关系不合法」错误提示。
 */
async function injectSemanticRelation(page, value) {
  const injected = await page.evaluate((v) => {
    const root = document.querySelector('.ai-cache');
    if (!root) {
      return false;
    }
    let vue = root.__vue__;
    for (let i = 0; i < 10 && vue; i += 1) {
      if (vue.semanticForm && 'threshold_relation' in vue.semanticForm) {
        vue.semanticForm.threshold_relation = v;
        vue.$forceUpdate();
        if (vue.$refs.semanticForm) {
          vue.$refs.semanticForm.validateField('threshold_relation');
        }
        return true;
      }
      vue = vue.$parent;
    }
    return false;
  }, value);
  if (!injected) {
    throw new Error('注入语义设置 threshold_relation 失败');
  }
  await page.waitForTimeout(300);
}

function trackAiCacheSemanticRequests(page) {
  const state = { get: 0, put: 0 };
  const handler = (request) => {
    const url = request.url();
    if (!url.includes('/ai-cache-semantic-settings')) {
      return;
    }
    const method = request.method().toUpperCase();
    if (method === 'GET') {
      state.get += 1;
    } else if (method === 'PUT') {
      state.put += 1;
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

async function expectNoSemanticMutationRequest(tracker) {
  expect(
    tracker.state.put,
    '不应发起 ai-cache-semantic-settings 变更请求(PUT)',
  ).toBe(0);
}

// ---------------------------------------------------------------------------
// Mock 网络（用于加载失败 / 重名注入 / 提交失败等无法经真实后端构造的场景）
// ---------------------------------------------------------------------------

async function mockRulesGetResponse(
  page,
  { status = 200, rules = [], errMsg = '' } = {},
) {
  await page.route(AI_CACHE_RULES_URL_PATTERN, (route) => {
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
  await page.route(AI_CACHE_RULES_URL_PATTERN, (route) => {
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

async function mockSemanticGetResponse(
  page,
  { status = 200, settings = null, errMsg = '' } = {},
) {
  await page.route(AI_CACHE_SEMANTIC_URL_PATTERN, (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    if (status === 200) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 200, Data: settings }),
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

async function mockSemanticPutFailure(
  page,
  { status = 500, errMsg = '' } = {},
) {
  await page.route(AI_CACHE_SEMANTIC_URL_PATTERN, (route) => {
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

async function unmockAiCacheNetwork(page) {
  await page.unroute(AI_CACHE_RULES_URL_PATTERN).catch(() => {});
  await page.unroute(AI_CACHE_SEMANTIC_URL_PATTERN).catch(() => {});
}

// ---------------------------------------------------------------------------
// 通用提示断言（退出 / 删除等非「提交」类操作的 toast 文案）
// ---------------------------------------------------------------------------

async function expectAiCacheMessage(page, text, timeout = 15000) {
  await new IvuMessageComponent(page).expectText(text, timeout);
}

async function expectAiCacheMessageDuringAction(
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
  DOC_AI_CACHE_PAGE,
  DOC_AI_CACHE_RULES,
  DOC_AI_CACHE_RULE_FORM,
  DOC_AI_CACHE_RULE_VIEW,
  DOC_AI_CACHE_SEMANTIC,
  DOC_AI_CACHE_SEMANTIC_VIEW,
  AI_CACHE_PATH,
  AI_CACHE_RULES_URL_PATTERN,
  AI_CACHE_SEMANTIC_URL_PATTERN,
  // 文案格式化
  formatTtlText,
  formatBytesText,
  // 会话
  getAppBaseUrl,
  isConnectionError,
  ensureChineseLang,
  ensureAuthenticatedShell,
  ensureAppSession,
  // 作用域
  pageRoot,
  ruleTable,
  tabs,
  rulePane,
  semanticPane,
  ruleHeader,
  semanticHeader,
  semanticView,
  semanticFormScope,
  semanticForm,
  ruleFormScope,
  ruleForm,
  viewDrawerScope,
  formDrawer,
  viewDrawer,
  ruleFormItem,
  semanticFormItem,
  modal,
  // 导航与就绪
  isOnAiCachePage,
  expectAiCachePageReady,
  gotoAiCachePage,
  gotoAiCachePageAndWaitForRules,
  reloadAiCachePage,
  reloadAiCachePageExpectMessage,
  // 页头 / Tab
  expectPageHeaderTitle,
  expectTabs,
  expectActiveTab,
  switchToTab,
  switchToRulesTab,
  switchToSemanticTab,
  expectRuleHeaderSubmitPosition,
  // 规则列表
  expectRuleTableHeaders,
  getRuleRow,
  getRuleCell,
  getRuleNamesInOrder,
  getRuleRowCount,
  expectRuleRowOrder,
  expectRuleCellText,
  expectRuleCellContains,
  expectRuleStrategyTag,
  expectRuleSemanticTag,
  expectRuleTableEmpty,
  expectEditMode,
  expectViewMode,
  enterEditMode,
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
  // 搜索
  searchRules,
  clearRulesSearch,
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
  viewDrawerRow,
  // 规则表单
  fillRuleName,
  fillRuleCond,
  fillRuleFormNumber,
  expectRuleFormNumber,
  selectRuleFormStrategy,
  expectRuleFormStrategy,
  expectRuleFormStrategyOptions,
  expectRuleFormStrategyHint,
  toggleRuleFormSwitch,
  expectRuleFormSwitch,
  expectRuleFormSemanticHint,
  clickRuleFormReset,
  expectRuleFormDefaultValues,
  submitRuleFormAndWait,
  submitRuleFormExpectMessage,
  expectRuleFormError,
  expectRuleFormFieldValid,
  expectRuleFormDrawerHidden,
  expectRuleFormDrawerStillOpen,
  // 提交并生效
  waitForAiCacheRulesGetResponse,
  waitForAiCacheRulesPutResponse,
  clickSubmitAndEffect,
  submitRulesAndCapture,
  submitRulesExpectMessage,
  submitRulesAndWait,
  expectRulesPayloadOrder,
  expectRulesPayloadNoTimestamps,
  // 退出编辑模式
  clickExitEditMode,
  expectExitConfirmModal,
  confirmExitEditMode,
  cancelExitEditMode,
  // 删除
  expectDeleteConfirmModal,
  confirmDelete,
  cancelDelete,
  deleteAllRules,
  // 网络监听
  trackAiCacheRuleRequests,
  expectNoRuleMutationRequest,
  trackAiCacheSemanticRequests,
  expectNoSemanticMutationRequest,
  // 语义设置
  expectSemanticHeaderSubtitle,
  expectSemanticCardTitle,
  expectSemanticViewLabels,
  expectSemanticViewField,
  expectSemanticViewMode,
  enterSemanticEditMode,
  expectSemanticEditMode,
  cancelSemanticEditMode,
  fillSemanticNumber,
  fillSemanticTopK,
  fillSemanticThreshold,
  selectSemanticRelation,
  expectSemanticFieldError,
  expectSemanticFieldValid,
  expectSemanticNoTimestampField,
  waitForAiCacheSemanticGetResponse,
  waitForAiCacheSemanticPutResponse,
  clickSemanticSave,
  saveSemanticAndCapture,
  saveSemanticExpectMessage,
  expectSemanticRelationOptions,
  expectSemanticFieldRequired,
  expectSemanticNumberControl,
  expectSemanticNumber,
  expectSemanticRelation,
  injectSemanticRelation,
  // Mock
  mockRulesGetResponse,
  mockRulesPutFailure,
  mockSemanticGetResponse,
  mockSemanticPutFailure,
  unmockAiCacheNetwork,
  // 通用提示断言
  expectAiCacheMessage,
  expectAiCacheMessageDuringAction,
  // API 造数 / 备份 / 恢复（复用 api/ai-cache-api-utils.js）
  createAiCacheTestCleanup: apiUtils.createAiCacheTestCleanup,
  getAiCacheRulesViaApi: apiUtils.fetchAiCacheRulesViaApi,
  setAiCacheRulesViaApi: apiUtils.putAiCacheRulesViaApi,
  getAiCacheSemanticViaApi: apiUtils.fetchAiCacheSemanticSettingsViaApi,
  setAiCacheSemanticViaApi: apiUtils.putAiCacheSemanticSettingsViaApi,
  generateTestRuleName: apiUtils.generateTestRuleName,
  buildTestRule: apiUtils.buildTestRule,
  ensureAiCacheRuleExistsViaApi: apiUtils.ensureAiCacheRuleExistsViaApi,
};