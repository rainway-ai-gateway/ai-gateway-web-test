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
 * AI 上下文压缩（AIContext）页面对象
 *
 * 页面结构（src/modules/AIContext/index.vue）：
 * - 根节点 .ai-context，内含 Tabs：压缩规则(rules) / 全局设置(settings)
 * - 压缩规则 Tab：.route-editor-header（副标题 + 操作按钮）+ pageTable（5 列）
 * - 全局设置 Tab：.route-editor-header + Card.form-card（查看态 .settings-view / 编辑态 Form.settings-form）
 * - 两个抽屉在 .ai-context 根下（不在 TabPane 内）：查看抽屉（.rule-view）/ 表单抽屉（.rule-form）
 *
 * 与 AICache 的关键差异：
 * - 规则无 name 字段，cond（生效条件表达式）即身份，行定位一律按 cond
 * - cond 输入使用 Expression 组件（PATCH expression/verify 控制面编译校验，经 condErrmsg 回显）
 * - 档位 mode 四枚举（off/conservative/balanced/aggressive），off 用 default 色 Tag
 * - token 两列格式化：null/undefined/0 → '模型默认（0）'，其余 '{value} tokens'
 * - 提交体零值不写入（RuleForm 仅 >0 才写 max_context_tokens/reserve_tokens）
 * - 设置表单 formData 拍平 rewrite_strength / protected_survival_rate
 *
 * 数据造数/备份/恢复统一在 api/ai-context-api-utils.js 中实现，本文件不直连网络。
 * 本文件内部禁用裸选择器于 spec —— 所有定位集中于此；spec 只调用本模块导出函数。
 */
const { expect, test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/ai-context-api-utils');
const { PageTableComponent } = require('../../components/layout');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');
const {
  IvuMessageComponent,
  IvuFormComponent,
  IvuTabsComponent,
  IvuSelectComponent,
  IvuModalComponent,
} = require('../../components/iview');

/** 与 docs/ai-context/02 及实际 UI 文案对齐的验收文案 */
const DOC_AI_CONTEXT_PAGE = {
  pageTitle: 'AI 上下文压缩规则（集合级，按数组顺序匹配，首条命中生效）',
  tabRules: '压缩规则',
  tabSettings: '全局设置',
  settingsSubtitle: '上下文压缩全局调优参数（单例，全局生效）',
  settingsCardTitle: '全局调优设置',
  enterEditMode: '进入编辑模式',
  exitEditMode: '退出编辑模式',
  submitAndEffect: '提交并生效',
  addRule: '添加规则',
  viewButton: '查看',
  editButton: '编辑',
  deleteButton: '删除',
  saveButton: '保存',
  cancelButton: '取消',
  submitSuccessMsg: '提交并生效成功！',
  submitFailedMsg: '提交失败!',
  deleteSuccessMsg: '删除成功!',
  cancelDeleteMsg: '取消删除',
  deleteConfirmMsg: '确认删除该压缩规则？删除后需提交并生效。',
  exitConfirm: '当前有未提交的改动，退出编辑模式将丢弃这些改动，确认退出？',
  exitDoneMsg: '已退出编辑模式',
  exitCancelledMsg: '已取消退出',
  informationTips: '信息提示',
  validateErrorMsg: '请检查参数填写是否规范!',
  loadFailedMsg: '加载 AI 上下文压缩规则失败',
  settingsLoadFailedMsg: '加载 AI 上下文压缩设置失败',
};

const DOC_AI_CONTEXT_RULES = {
  tableHeaders: ['生效条件', '压缩档位', '预算上限', '预留输出', '操作'],
  // 列序号（0 基）：用于按列断言单元格
  columnIndex: {
    cond: 0,
    mode: 1,
    maxTokens: 2,
    reserveTokens: 3,
    action: 4,
  },
  modeOff: '不处理（off）',
  modeConservative: '仅无损裁剪（conservative）',
  modeBalanced: '裁剪 + lite 改写（balanced）',
  modeAggressive: '裁剪 + full 改写（aggressive）',
  tokensModelDefault: '模型默认（0）',
  tokensText: '{value} tokens',
  emptyPlaceholder: '-',
  // mode 列搜索筛选项为裸枚举值
  modeFilterOptions: ['off', 'conservative', 'balanced', 'aggressive'],
};

const DOC_AI_CONTEXT_RULE_FORM = {
  condFieldLabel:
    '生效条件（BFE 条件表达式，如 req_path_in(...) / default_t()）',
  modeFieldLabel: '压缩档位',
  maxTokensFieldLabel:
    '预算上限（max_context_tokens，≥0，0 = 用模型窗口默认）',
  reserveTokensFieldLabel:
    '预留输出（reserve_tokens，≥0，0 = 自动 clamp(窗口×15%, 256, 16000)）',
  addTitle: '添加压缩规则',
  editTitle: '编辑压缩规则',
  localSaveButton: '本地保存',
  resetButton: '重置',
  condRequiredMsg: '请填写生效条件',
  condEmptyExpressionMsg: '表达式不能为空',
  modeInvalidMsg: '压缩档位不合法',
  maxTokensNegativeMsg: '预算上限不能小于 0',
  reserveTokensNegativeMsg: '预留输出不能小于 0',
  condDuplicateMsg: '生效条件已存在，集合内必须唯一',
  addSuccessMsg: '添加成功！',
  saveSuccessMsg: '保存成功！',
  defaultMode: 'off',
};

const DOC_AI_CONTEXT_RULE_VIEW = {
  viewTitle: '查看压缩规则',
  fieldLabels: ['生效条件', '压缩档位', '预算上限', '预留输出'],
  emptyPlaceholder: '-',
};

const DOC_AI_CONTEXT_SETTINGS = {
  subtitle: '上下文压缩全局调优参数（单例，全局生效）',
  cardTitle: '全局调优设置',
  editButton: '编辑',
  cancelButton: '取消',
  saveButton: '保存',
  triggerRatioLabel:
    '触发阈值（trigger_ratio，(0,1]，默认 0.7）：估算 prompt 超过 budget × 该比例才启动压缩',
  keepLatestImagesLabel:
    '保留最近图片数（keep_latest_images，≥0，默认 2；0 = 完全不裁图）',
  toolResultMaxCharsLabel:
    '工具结果最大字符数（tool_result_max_chars，≥0，默认 2000；0 = 不截断）',
  thinkingPolicyLabel: 'thinking 块策略（thinking_policy）',
  charsPerTokenLabel:
    '文本估算系数（chars_per_token，≥1，默认 4；中文密集可调 3）',
  imageTokenEstimateLabel: '图片估值 token（image_token_estimate，≥0，默认 1200）',
  rewriteStrengthLabel: '改写强度（rewrite.strength）',
  protectedSurvivalRateLabel:
    '保护 token 存活率（rewrite.protected_survival_rate，(0,1]，默认 0.95）：改写后低于该值则整体回退为无损裁剪产物',
  thinkingTrimAllButLast: '仅保留最后一条 assistant（trim-all-but-last）',
  thinkingKeep: '保留全部（keep）',
  rewriteLite: '保守规则包（lite）',
  rewriteFull: '激进规则包（full）',
  tipTriggerRatio: '触发阈值须大于 0 且不超过 1',
  tipKeepLatestImages: '保留最近图片数不能小于 0',
  tipToolResultMaxChars: '工具结果最大字符数不能小于 0',
  tipThinkingPolicy: 'thinking 块策略不合法',
  tipCharsPerToken: '文本估算系数不能小于 1',
  tipImageTokenEstimate: '图片估值 token 不能小于 0',
  tipRewriteStrength: '改写强度不合法',
  tipProtectedSurvivalRate: '保护 token 存活率须大于 0 且不超过 1',
  saveSuccessMsg: '全局设置保存成功！',
  loadFailedMsg: '加载 AI 上下文压缩设置失败',
  keepImagesNone: '（完全不裁图）',
  toolResultNoTruncate: '（不截断）',
  defaultSettings: {
    trigger_ratio: 0.7,
    keep_latest_images: 2,
    tool_result_max_chars: 2000,
    thinking_policy: 'trim-all-but-last',
    chars_per_token: 4,
    image_token_estimate: 1200,
    rewrite: { strength: 'lite', protected_survival_rate: 0.95 },
  },
  // 表单 label → 提交体字段
  fieldKeyByLabel: {
    '触发阈值（trigger_ratio，(0,1]，默认 0.7）：估算 prompt 超过 budget × 该比例才启动压缩':
      'trigger_ratio',
    '保留最近图片数（keep_latest_images，≥0，默认 2；0 = 完全不裁图）':
      'keep_latest_images',
    '工具结果最大字符数（tool_result_max_chars，≥0，默认 2000；0 = 不截断）':
      'tool_result_max_chars',
    'thinking 块策略（thinking_policy）': 'thinking_policy',
    '文本估算系数（chars_per_token，≥1，默认 4；中文密集可调 3）':
      'chars_per_token',
    '图片估值 token（image_token_estimate，≥0，默认 1200）':
      'image_token_estimate',
    '改写强度（rewrite.strength）': 'rewrite_strength',
    '保护 token 存活率（rewrite.protected_survival_rate，(0,1]，默认 0.95）：改写后低于该值则整体回退为无损裁剪产物':
      'protected_survival_rate',
  },
};

const DOC_AI_CONTEXT_SETTINGS_VIEW = {
  viewLabels: [
    '触发阈值（trigger_ratio）',
    '保留最近图片数（keep_latest_images）',
    '工具结果最大字符数（tool_result_max_chars）',
    'thinking 块策略（thinking_policy）',
    '文本估算系数（chars_per_token）',
    '图片估值 token（image_token_estimate）',
    '改写强度（rewrite.strength）',
    '保护 token 存活率（rewrite.protected_survival_rate）',
  ],
  thinkingText: {
    'trim-all-but-last': '仅保留最后一条 assistant（trim-all-but-last）',
    keep: '保留全部（keep）',
  },
  rewriteStrengthText: {
    lite: '保守规则包（lite）',
    full: '激进规则包（full）',
  },
};

const AI_CONTEXT_PATH = '/ai-context-rules';
const AI_CONTEXT_RULES_URL_PATTERN = '**/open-api/v1/ai-context-rules';
const AI_CONTEXT_SETTINGS_URL_PATTERN =
  '**/open-api/v1/ai-context-settings';
const EXPRESSION_VERIFY_URL_PATTERN = '**/open-api/v1/expression/verify';

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
// 文案格式化（与 UI 源码 formatTokens 对齐）
// ---------------------------------------------------------------------------

/** token 数展示：null/undefined/0 → '模型默认（0）'；其余 '{value} tokens' */
function formatTokensText(value) {
  if (value === null || value === undefined || Number(value) === 0) {
    return DOC_AI_CONTEXT_RULES.tokensModelDefault;
  }
  return `${value} tokens`;
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
    currentUrl.includes(AI_CONTEXT_PATH) ||
    currentUrl.includes('/cluster') ||
    currentUrl.includes('/route-tables');
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在产品页，先加载首页: ' + page.url());
    await ensureChineseLang(page);
    await page.goto(getAppBaseUrl() + AI_CONTEXT_PATH, {
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
  return page.locator('.ai-context');
}

function ruleTable(page) {
  return new PageTableComponent(
    page,
    page.locator('.ai-context .page-table').first(),
  );
}

function tabs(page) {
  return new IvuTabsComponent(page, pageRoot(page));
}

/** 压缩规则 Tab 面板（以 .page-table 唯一标识，避免跨 Tab 误命中） */
function rulePane(page) {
  return page
    .locator('.ai-context .ivu-tabs-tabpane')
    .filter({ has: page.locator('.page-table') })
    .first();
}

/** 全局设置 Tab 面板（以 Card.form-card 唯一标识） */
function settingsPane(page) {
  return page
    .locator('.ai-context .ivu-tabs-tabpane')
    .filter({ has: page.locator('.form-card') })
    .first();
}

function ruleHeader(page) {
  return rulePane(page).locator('.route-editor-header');
}

function settingsHeader(page) {
  return settingsPane(page).locator('.route-editor-header');
}

function settingsView(page) {
  return settingsPane(page).locator('.settings-view');
}

function settingsFormScope(page) {
  return settingsPane(page).locator('.settings-form');
}

function settingsForm(page) {
  return new IvuFormComponent(settingsFormScope(page));
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
 * 当前可见抽屉的遮罩。
 * iView Drawer 的 .ivu-drawer-mask 与 .ivu-drawer-wrap 是兄弟节点（同在
 * transfer 容器下），不在 wrap 内部，须从 page 级按可见性定位。
 */
function drawerMask(page) {
  return page.locator('.ivu-drawer-mask:visible').first();
}

/**
 * 点击抽屉可视区左侧空白区域模拟「点遮罩」。
 * iView Drawer 的 wrap 覆盖整个视口且层叠在 mask 之上，mask 元素不可达；
 * 点击 wrap 空白处（非面板区）经 handleWrapClick -> handleMask 处理，
 * 是否关闭由 mask-closable 决定。
 */
async function clickDrawerMask(page) {
  const wrap = page
    .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden):visible')
    .first();
  const box = await wrap.boundingBox();
  if (!box) {
    throw new Error('未找到可见抽屉');
  }
  await wrap.click({ position: { x: 5, y: Math.floor(box.height / 2) } });
  await page.waitForTimeout(500);
}

/**
 * 精确定位规则表单的某个 FormItem。
 * 用 exact 文案过滤，规避同名前缀误命中。
 */
function ruleFormItem(page, label) {
  return ruleFormScope(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

function settingsFormItem(page, label) {
  return settingsFormScope(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

// ---------------------------------------------------------------------------
// 页面导航与就绪判定
// ---------------------------------------------------------------------------

async function isOnAiContextPage(page) {
  if (!page.url().includes(AI_CONTEXT_PATH)) {
    return false;
  }
  return pageRoot(page)
    .isVisible()
    .catch(() => false);
}

async function expectAiContextPageReady(page) {
  await expect(pageRoot(page)).toBeVisible();
  await expect(
    pageRoot(page)
      .locator('.route-owner-label')
      .filter({ hasText: DOC_AI_CONTEXT_PAGE.pageTitle })
      .first(),
  ).toBeVisible();
}

async function gotoAiContextPage(page) {
  if (await isOnAiContextPage(page)) {
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await page.goto(getAppBaseUrl() + AI_CONTEXT_PATH, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
}

async function waitForAiContextRulesGetResponse(page, action = async () => {}) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-context-rules') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-context-rules GET 响应超时，降级等待: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
    return null;
  }
}

async function gotoAiContextPageAndWaitForRules(page) {
  if (await isOnAiContextPage(page)) {
    await waitForAiContextRulesGetResponse(page, () => page.reload());
    await page.waitForTimeout(1000);
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await waitForAiContextRulesGetResponse(page, () =>
    page.goto(getAppBaseUrl() + AI_CONTEXT_PATH, {
      waitUntil: 'domcontentloaded',
    }),
  );
  await page.waitForTimeout(1500);
  await umUtils.handleUrlInvalidAlert(page);
}

async function reloadAiContextPage(page) {
  if (!(await isOnAiContextPage(page))) {
    await gotoAiContextPageAndWaitForRules(page);
    return;
  }
  await waitForAiContextRulesGetResponse(page, () => page.reload());
  await page.waitForTimeout(1000);
  await umUtils.handleUrlInvalidAlert(page);
}

/**
 * 在页面重载过程中捕获错误提示（用于「加载失败」类用例）。
 * 调用前须先 ensureAppSession 并注册好对应 mock。
 */
async function reloadAiContextPageExpectMessage(page, message, timeout = 20000) {
  const messageComp = new IvuMessageComponent(page);
  const action = (await isOnAiContextPage(page))
    ? () => page.reload({ waitUntil: 'domcontentloaded' })
    : async () => {
        await ensureChineseLang(page);
        await page.goto(getAppBaseUrl() + AI_CONTEXT_PATH, {
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
  expected = DOC_AI_CONTEXT_PAGE.pageTitle,
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
    DOC_AI_CONTEXT_PAGE.tabRules,
    DOC_AI_CONTEXT_PAGE.tabSettings,
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
  await switchToTab(page, DOC_AI_CONTEXT_PAGE.tabRules);
}

async function switchToSettingsTab(page) {
  await switchToTab(page, DOC_AI_CONTEXT_PAGE.tabSettings);
}

/** 规则头「提交」按钮右上角绝对定位（AX-L-17） */
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
  await ruleTable(page).expectHeaders(...DOC_AI_CONTEXT_RULES.tableHeaders);
}

/** cond 即规则身份 */
function getRuleRow(page, cond) {
  return ruleTable(page)
    .dataRows()
    .filter({ has: page.getByText(cond, { exact: true }) })
    .first();
}

/** 按列序号（0 基）获取规则行的单元格 */
function getRuleCell(page, cond, columnIndex) {
  return getRuleRow(page, cond).locator(`td:nth-child(${columnIndex + 1})`);
}

async function getRuleCondsInOrder(page) {
  const texts = await ruleTable(page)
    .dataRows()
    .locator('td:nth-child(1)')
    .allInnerTexts();
  return texts.map((t) => t.trim());
}

async function getRuleRowCount(page) {
  return ruleTable(page).dataRows().count();
}

async function expectRuleRowOrder(page, conds, options = {}) {
  const exact = options.exact !== false;
  const actual = (await getRuleCondsInOrder(page)).slice(0, conds.length);
  if (exact) {
    expect(actual).toEqual(conds);
  } else {
    conds.forEach((cond, i) => expect(actual[i]).toContain(cond));
  }
}

async function expectRuleCellText(page, cond, columnIndex, expected) {
  await expect(getRuleCell(page, cond, columnIndex)).toHaveText(expected);
}

async function expectRuleCellContains(page, cond, columnIndex, expected) {
  await expect(getRuleCell(page, cond, columnIndex)).toContainText(expected);
}

/** 档位 Tag 文案 + 颜色类（off=default，其余=primary） */
async function expectRuleModeTag(page, cond, text, color) {
  const tag = getRuleCell(
    page,
    cond,
    DOC_AI_CONTEXT_RULES.columnIndex.mode,
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
      name: DOC_AI_CONTEXT_PAGE.exitEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.submitAndEffect,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.addRule,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.enterEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function expectViewMode(page) {
  const header = ruleHeader(page);
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.enterEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.exitEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    header.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.submitAndEffect,
      exact: true,
    }),
  ).toHaveCount(0);
  // 「添加规则」用 v-show：视图模式 DOM 存在但隐藏
  await expect(
    header.locator('button').filter({ hasText: DOC_AI_CONTEXT_PAGE.addRule }),
  ).toBeHidden();
}

async function enterEditMode(page) {
  const header = ruleHeader(page);
  const exitButton = header.getByRole('button', {
    name: DOC_AI_CONTEXT_PAGE.exitEditMode,
    exact: true,
  });
  if (await exitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }
  await header
    .getByRole('button', { name: DOC_AI_CONTEXT_PAGE.enterEditMode, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function findRuleRowAcrossPages(page, cond) {
  const table = ruleTable(page);
  await table.waitForLoaded();
  for (let i = 0; i < 20; i += 1) {
    const row = getRuleRow(page, cond);
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

async function expectRuleRowVisible(page, cond) {
  await expect(getRuleRow(page, cond)).toBeVisible({ timeout: 15000 });
}

async function expectRuleRowHidden(page, cond, timeout = 15000) {
  await expect(getRuleRow(page, cond)).toHaveCount(0, { timeout });
}

async function ensureRuleRowVisible(page, cond) {
  const row = await findRuleRowAcrossPages(page, cond);
  return row !== null;
}

// ---------------------------------------------------------------------------
// 行操作
// ---------------------------------------------------------------------------

async function clickRuleView(page, cond) {
  await getRuleRow(page, cond)
    .getByRole('button', { name: DOC_AI_CONTEXT_PAGE.viewButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function clickRuleEdit(page, cond) {
  await getRuleRow(page, cond)
    .getByRole('button', { name: DOC_AI_CONTEXT_PAGE.editButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function clickRuleDelete(page, cond) {
  await getRuleRow(page, cond)
    .getByRole('button', { name: DOC_AI_CONTEXT_PAGE.deleteButton, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectRuleRowOnlyViewAction(page, cond) {
  const row = getRuleRow(page, cond);
  await expect(
    row.getByRole('button', { name: DOC_AI_CONTEXT_PAGE.viewButton, exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', { name: DOC_AI_CONTEXT_PAGE.editButton, exact: true }),
  ).toHaveCount(0);
  await expect(
    row.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.deleteButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function expectRuleRowEditDeleteActions(page, cond) {
  const row = getRuleRow(page, cond);
  await expect(
    row.getByRole('button', { name: DOC_AI_CONTEXT_PAGE.editButton, exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.deleteButton,
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

/** 「压缩档位」列筛选下拉（searchType:select，transfer 渲染到 body） */
function modeFilterTrigger(page) {
  return ruleTable(page).searchArea().locator('.ivu-select').first();
}

/** 按档位裸枚举筛选（AX-L-06） */
async function filterRulesByMode(page, optionText) {
  await new IvuSelectComponent(page, modeFilterTrigger(page)).selectOption(
    optionText,
  );
  await page.waitForTimeout(500);
}

/** 展开档位筛选下拉并断言选项为裸枚举 off/conservative/balanced/aggressive */
async function expectModeFilterOptions(
  page,
  expectedTexts = DOC_AI_CONTEXT_RULES.modeFilterOptions,
) {
  const trigger = modeFilterTrigger(page);
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

/** 清除档位筛选（clearable，悬停出现 ios-close-circle 图标） */
async function clearModeFilter(page) {
  const trigger = modeFilterTrigger(page);
  await trigger.hover();
  await trigger.locator('.ivu-icon-ios-close-circle').first().click();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// 抽屉：新增 / 编辑 / 查看
// ---------------------------------------------------------------------------

async function openAddRuleDrawer(page) {
  await ruleHeader(page)
    .getByRole('button', { name: DOC_AI_CONTEXT_PAGE.addRule, exact: true })
    .click();
  await page.waitForTimeout(500);
  await expect(ruleFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_AI_CONTEXT_RULE_FORM.addTitle, { exact: true }),
  ).toBeVisible();
}

async function openEditRuleDrawer(page, cond) {
  const row = await findRuleRowAcrossPages(page, cond);
  if (!row) {
    throw new Error('未找到待编辑规则行: ' + cond);
  }
  await clickRuleEdit(page, cond);
  await expect(ruleFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_AI_CONTEXT_RULE_FORM.editTitle, { exact: true }),
  ).toBeVisible();
}

async function openViewRuleDrawer(page, cond) {
  const row = await findRuleRowAcrossPages(page, cond);
  if (!row) {
    throw new Error('未找到待查看规则行: ' + cond);
  }
  await clickRuleView(page, cond);
  await expect(viewDrawerScope(page)).toBeVisible();
  await expect(
    viewDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_AI_CONTEXT_RULE_VIEW.viewTitle, { exact: true }),
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

/** 表单抽屉 :width="60" → iView 渲染为 60%（AX-C-12） */
async function expectFormDrawerWidth(page) {
  const el = formDrawer(page).locator('.ivu-drawer').first();
  await expect(el).toBeVisible();
  const width = await el.evaluate((node) => node.style.width);
  expect(width).toBe('60%');
}

/** 查看抽屉 :width="60" → iView 渲染为 60%（AX-D-01） */
async function expectViewDrawerWidth(page) {
  const el = viewDrawer(page).locator('.ivu-drawer').first();
  await expect(el).toBeVisible();
  const width = await el.evaluate((node) => node.style.width);
  expect(width).toBe('60%');
}

function viewDrawerRow(page, fieldLabel) {
  return viewDrawerScope(page)
    .locator('.info-row')
    .filter({ has: page.getByText(fieldLabel, { exact: true }) })
    .first();
}

async function expectViewDrawerFieldLabels(
  page,
  labels = DOC_AI_CONTEXT_RULE_VIEW.fieldLabels,
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

/** cond 使用 Expression 组件（textarea 自带 class="expression"） */
async function fillRuleCond(page, cond) {
  const scope = ruleFormScope(page);
  await expect(scope).toBeVisible();
  const textarea = scope
    .locator('textarea.expression, .expression textarea')
    .first();
  await textarea.fill(cond);
  await textarea.blur();
  await page.waitForTimeout(500);
}

async function expectRuleCondValue(page, cond) {
  await expect(
    ruleFormScope(page)
      .locator('textarea.expression, .expression textarea')
      .first(),
  ).toHaveValue(cond);
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

async function selectRuleFormMode(page, optionText) {
  const trigger = ruleFormItem(
    page,
    DOC_AI_CONTEXT_RULE_FORM.modeFieldLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOption(optionText);
  await page.waitForTimeout(300);
}

async function expectRuleFormMode(page, optionText) {
  await expect(
    ruleFormItem(page, DOC_AI_CONTEXT_RULE_FORM.modeFieldLabel).locator(
      '.ivu-select-selected-value',
    ),
  ).toHaveText(optionText);
}

/** 打开「压缩档位」下拉并断言选项集合（AX-C-03）；mode Select 无 transfer */
async function expectRuleFormModeOptions(page, expectedTexts) {
  const trigger = ruleFormItem(
    page,
    DOC_AI_CONTEXT_RULE_FORM.modeFieldLabel,
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

async function clickRuleFormReset(page) {
  await ruleFormScope(page)
    .getByRole('button', { name: DOC_AI_CONTEXT_RULE_FORM.resetButton, exact: true })
    .click();
  await page.waitForTimeout(300);
}

/** 断言新增抽屉的默认值（AX-C-01） */
async function expectRuleFormDefaultValues(page) {
  await expectRuleCondValue(page, '');
  await expectRuleFormMode(page, DOC_AI_CONTEXT_RULES.modeOff);
  await expectRuleFormNumber(
    page,
    DOC_AI_CONTEXT_RULE_FORM.maxTokensFieldLabel,
    '',
  );
  await expectRuleFormNumber(
    page,
    DOC_AI_CONTEXT_RULE_FORM.reserveTokensFieldLabel,
    '',
  );
}

async function submitRuleFormAndWait(page) {
  await ruleFormScope(page)
    .getByRole('button', {
      name: DOC_AI_CONTEXT_RULE_FORM.localSaveButton,
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
        name: DOC_AI_CONTEXT_RULE_FORM.localSaveButton,
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

/**
 * 经 RuleForm 组件实例注入非法 mode 并触发校验。
 * 用于构造下拉之外的非法枚举（如 'OFF' / ''），无法经正常 UI 操作产生（AX-V-04）。
 */
async function injectRuleFormMode(page, value) {
  const injected = await page.evaluate((v) => {
    const form = document.querySelector('.rule-form');
    if (!form || !form.__vue__) {
      return false;
    }
    const vm = form.__vue__;
    vm.formData.mode = v;
    vm.$forceUpdate();
    if (vm.$refs.formData) {
      vm.$refs.formData.validateField('mode');
    }
    return true;
  }, value);
  if (!injected) {
    throw new Error('注入压缩规则 mode 失败');
  }
  await page.waitForTimeout(300);
}

/**
 * 经 RuleForm 组件实例注入 condErrmsg（控制面编译错误回显）并触发校验。
 * Expression 组件对非 2xx 响应不 emit，故网络 mock 无法稳定触发 condErrmsg，
 * 用注入 formData.condErrmsg + validateField('cond') 模拟编译失败回显（AX-V-02）。
 */
async function injectRuleFormCondErrmsg(page, msg) {
  const injected = await page.evaluate((m) => {
    const form = document.querySelector('.rule-form');
    if (!form || !form.__vue__) {
      return false;
    }
    const vm = form.__vue__;
    vm.formData.condErrmsg = m;
    vm.$forceUpdate();
    if (vm.$refs.formData) {
      vm.$refs.formData.validateField('cond');
    }
    return true;
  }, msg);
  if (!injected) {
    throw new Error('注入压缩规则 condErrmsg 失败');
  }
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// 提交并生效（PUT 整体替换）
// ---------------------------------------------------------------------------

async function waitForAiContextRulesPutResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-context-rules') &&
          res.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-context-rules PUT 响应超时: ' + e.message);
    return null;
  }
}

async function clickSubmitAndEffect(page) {
  await ruleHeader(page)
    .getByRole('button', {
      name: DOC_AI_CONTEXT_PAGE.submitAndEffect,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 提交并生效，捕获 PUT 响应与请求体 */
async function submitRulesAndCapture(page) {
  const response = await waitForAiContextRulesPutResponse(page, () =>
    clickSubmitAndEffect(page),
  );
  let payload = null;
  if (response) {
    try {
      payload = response.request().postDataJSON();
    } catch (e) {
      common.log('解析 ai-context-rules PUT 请求体失败: ' + e.message);
    }
  }
  return { response, payload };
}

/** 提交并生效并断言成功提示 */
async function submitRulesExpectMessage(
  page,
  message = DOC_AI_CONTEXT_PAGE.submitSuccessMsg,
) {
  const messageComp = new IvuMessageComponent(page);
  await messageComp.waitForTextDuringAction(message, () =>
    ruleHeader(page)
      .getByRole('button', {
        name: DOC_AI_CONTEXT_PAGE.submitAndEffect,
        exact: true,
      })
      .click(),
  );
  await page.waitForTimeout(1000);
}

async function submitRulesAndWait(page) {
  await waitForAiContextRulesPutResponse(page, () => clickSubmitAndEffect(page));
  await new IvuMessageComponent(page).expectText(
    DOC_AI_CONTEXT_PAGE.submitSuccessMsg,
  );
  await page.waitForTimeout(1000);
}

/** 断言 PUT 请求体中规则顺序（数组顺序即优先级） */
function expectRulesPayloadOrder(actualPayload, conds) {
  expect(actualPayload).toBeTruthy();
  expect(actualPayload.rules).toBeTruthy();
  const actualConds = actualPayload.rules.map((r) => r.cond);
  expect(actualConds).toEqual(conds);
}

/** 断言 PUT 请求体不含只读字段 created_at/updated_at */
function expectRulesPayloadNoTimestamps(actualPayload) {
  expect(actualPayload).toBeTruthy();
  expect(Array.isArray(actualPayload.rules)).toBe(true);
  for (const rule of actualPayload.rules) {
    expect(rule.created_at).toBeUndefined();
    expect(rule.updated_at).toBeUndefined();
  }
}

/** 断言某条规则提交体中零值字段未写入（AX-C-10） */
function expectRulePayloadOmitsZeroFields(rulePayload, cond) {
  const target = (actualPayloadRuleList(rulePayload)).find(
    (r) => r.cond === cond,
  );
  expect(target, '提交体中应包含 cond=' + cond + ' 的规则').toBeTruthy();
  expect(target.max_context_tokens).toBeUndefined();
  expect(target.reserve_tokens).toBeUndefined();
}

function actualPayloadRuleList(payload) {
  expect(payload).toBeTruthy();
  expect(Array.isArray(payload.rules)).toBe(true);
  return payload.rules;
}

// ---------------------------------------------------------------------------
// 退出编辑模式（确认框）
// ---------------------------------------------------------------------------

function modal(page) {
  return new IvuModalComponent(page);
}

async function clickExitEditMode(page) {
  await ruleHeader(page)
    .getByRole('button', { name: DOC_AI_CONTEXT_PAGE.exitEditMode, exact: true })
    .click();
  await page.waitForTimeout(500);
}

async function expectExitConfirmModal(page) {
  await modal(page).expectOpen(DOC_AI_CONTEXT_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_AI_CONTEXT_PAGE.exitConfirm),
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
  await modal(page).expectOpen(DOC_AI_CONTEXT_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_AI_CONTEXT_PAGE.deleteConfirmMsg),
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
        name: DOC_AI_CONTEXT_PAGE.deleteButton,
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

function trackAiContextRuleRequests(page) {
  const state = { get: 0, put: 0, putUrls: [] };
  const handler = (request) => {
    const url = request.url();
    if (!url.includes('/ai-context-rules')) {
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
  expect(tracker.state.put, '不应发起 ai-context-rules 变更请求(PUT)').toBe(0);
}

function trackAiContextSettingsRequests(page) {
  const state = { get: 0, put: 0 };
  const handler = (request) => {
    const url = request.url();
    if (!url.includes('/ai-context-settings')) {
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

async function expectNoSettingsMutationRequest(tracker) {
  expect(
    tracker.state.put,
    '不应发起 ai-context-settings 变更请求(PUT)',
  ).toBe(0);
}

// ---------------------------------------------------------------------------
// 全局设置 Tab
// ---------------------------------------------------------------------------

async function expectSettingsHeaderSubtitle(page) {
  await expect(
    settingsHeader(page).locator('.route-owner-label'),
  ).toHaveText(DOC_AI_CONTEXT_SETTINGS.subtitle);
}

async function expectSettingsCardTitle(page) {
  await expect(
    settingsPane(page).locator('.card-title, .ivu-card-head').first(),
  ).toContainText(DOC_AI_CONTEXT_SETTINGS.cardTitle);
}

async function expectSettingsViewLabels(
  page,
  labels = DOC_AI_CONTEXT_SETTINGS_VIEW.viewLabels,
) {
  for (const label of labels) {
    await expect(
      settingsView(page)
        .locator('.info-row')
        .filter({ has: page.getByText(label, { exact: true }) })
        .first()
        .locator('.info-label'),
    ).toHaveText(label);
  }
}

async function expectSettingsViewField(page, fieldLabel, expectedValue) {
  await expect(
    settingsView(page)
      .locator('.info-row')
      .filter({ has: page.getByText(fieldLabel, { exact: true }) })
      .first()
      .locator('.info-value'),
  ).toHaveText(expectedValue);
}

/** 设置查看态字段包含指定文本（用于零值附加文案等组合内容） */
async function expectSettingsViewFieldContains(page, fieldLabel, expectedText) {
  await expect(
    settingsView(page)
      .locator('.info-row')
      .filter({ has: page.getByText(fieldLabel, { exact: true }) })
      .first()
      .locator('.info-value'),
  ).toContainText(expectedText);
}

async function expectSettingsViewMode(page) {
  await expect(settingsView(page)).toBeVisible();
  await expect(
    settingsHeader(page).getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.editButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    settingsHeader(page).getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.cancelButton,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    settingsHeader(page).getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.saveButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function enterSettingsEditMode(page) {
  await settingsHeader(page)
    .getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.editButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function expectSettingsEditMode(page) {
  await expect(settingsFormScope(page)).toBeVisible();
  await expect(
    settingsHeader(page).getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.cancelButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    settingsHeader(page).getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.saveButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    settingsHeader(page).getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.editButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

async function cancelSettingsEditMode(page) {
  await settingsHeader(page)
    .getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.cancelButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function fillSettingsNumber(page, fieldLabel, value) {
  const input = settingsFormItem(page, fieldLabel).locator(
    '.ivu-input-number input',
  );
  await input.click();
  await input.fill(value === '' ? '' : String(value));
  await page.waitForTimeout(200);
}

async function selectSettingsThinkingPolicy(page, optionText) {
  const trigger = settingsFormItem(
    page,
    DOC_AI_CONTEXT_SETTINGS.thinkingPolicyLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOption(optionText);
  await page.waitForTimeout(300);
}

async function selectSettingsRewriteStrength(page, optionText) {
  const trigger = settingsFormItem(
    page,
    DOC_AI_CONTEXT_SETTINGS.rewriteStrengthLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOption(optionText);
  await page.waitForTimeout(300);
}

/** 展开设置页某 Select 下拉并断言选项集合（transfer 渲染到 body） */
async function expectSettingsSelectOptions(page, fieldLabel, expectedTexts) {
  const trigger = settingsFormItem(page, fieldLabel).locator('.ivu-select');
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await trigger.click();
  await page.waitForTimeout(300);
  const dropdown = page.locator('.ivu-select-dropdown:visible').first();
  await expect(dropdown).toBeVisible();
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  await expect(items).toHaveCount(expectedTexts.length);
  for (let i = 0; i < expectedTexts.length; i += 1) {
    await expect(items.nth(i)).toHaveText(expectedTexts[i]);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function expectSettingsFieldError(page, fieldLabel, message) {
  const tip = settingsFormItem(page, fieldLabel).locator(
    '.ivu-form-item-error-tip',
  );
  await expect(tip).toBeVisible();
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

async function expectSettingsFieldValid(page, fieldLabel) {
  await expect(
    settingsFormItem(page, fieldLabel).locator('.ivu-form-item-error-tip'),
  ).toBeHidden();
}

/** 断言设置查看 / 编辑态均无「创建时间 / 更新时间」展示位或输入项 */
async function expectSettingsNoTimestampField(page) {
  const labels = await settingsPane(page)
    .locator('.info-label, .ivu-form-item-label')
    .allInnerTexts();
  const joined = labels.join('|');
  expect(joined).not.toContain('创建时间');
  expect(joined).not.toContain('更新时间');
}

async function waitForAiContextSettingsGetResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-context-settings') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-context-settings GET 响应超时: ' + e.message);
    return null;
  }
}

async function waitForAiContextSettingsPutResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/ai-context-settings') &&
          res.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 ai-context-settings PUT 响应超时: ' + e.message);
    return null;
  }
}

async function clickSettingsSave(page) {
  await settingsHeader(page)
    .getByRole('button', {
      name: DOC_AI_CONTEXT_SETTINGS.saveButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 点击「保存」并捕获设置 PUT 请求体 */
async function saveSettingsAndCapture(page) {
  const response = await waitForAiContextSettingsPutResponse(page, () =>
    clickSettingsSave(page),
  );
  let payload = null;
  if (response) {
    try {
      payload = response.request().postDataJSON();
    } catch (e) {
      common.log('解析 settings PUT 请求体失败: ' + e.message);
    }
  }
  return { response, payload };
}

async function saveSettingsExpectMessage(
  page,
  message = DOC_AI_CONTEXT_SETTINGS.saveSuccessMsg,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction(message, () =>
    clickSettingsSave(page),
  );
  await page.waitForTimeout(1000);
}

/** 断言设置表单字段的必填标记（红 `*`） */
async function expectSettingsFieldRequired(page, fieldLabel, required = true) {
  const item = settingsFormItem(page, fieldLabel);
  if (required) {
    await expect(item).toHaveClass(/ivu-form-item-required/);
  } else {
    await expect(item).not.toHaveClass(/ivu-form-item-required/);
  }
}

/** 断言设置数字输入控件的 min / max / step（经组件实例读取） */
async function expectSettingsNumberControl(page, fieldLabel, { min, max, step }) {
  const input = settingsFormItem(page, fieldLabel).locator(
    '.ivu-input-number input',
  );
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();
  const actual = await page.evaluate((lbl) => {
    const root = document.querySelector('.ai-context');
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
    throw new Error('未找到设置数字控件: ' + fieldLabel);
  }
  if (min !== undefined) expect(actual.min).toBe(min);
  if (max !== undefined) expect(actual.max).toBe(max);
  if (step !== undefined) expect(actual.step).toBe(step);
}

/** 断言设置数字字段当前回显值 */
async function expectSettingsNumber(page, fieldLabel, value) {
  await expect(
    settingsFormItem(page, fieldLabel).locator('.ivu-input-number input'),
  ).toHaveValue(String(value));
}

/**
 * 经 SettingsForm 组件实例注入非法枚举/数值并触发校验。
 * 用于构造下拉之外的非法值（如 thinking_policy='xxx'），无法经正常 UI 操作产生。
 */
async function injectSettingsEnum(page, field, value) {
  const injected = await page.evaluate(
    ({ f, v }) => {
      const form = document.querySelector('.settings-form');
      if (!form || !form.__vue__) {
        return false;
      }
      const vm = form.__vue__;
      if (!vm.formData || !(f in vm.formData)) {
        return false;
      }
      vm.formData[f] = v;
      vm.$forceUpdate();
      if (vm.$refs.formData) {
        vm.$refs.formData.validateField(f);
      }
      return true;
    },
    { f: field, v: value },
  );
  if (!injected) {
    throw new Error('注入设置字段失败: ' + field);
  }
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Mock 网络（用于加载失败 / 提交失败 / 表达式校验等场景）
// ---------------------------------------------------------------------------

async function mockRulesGetResponse(
  page,
  { status = 200, rules = [], errMsg = '' } = {},
) {
  await page.route(AI_CONTEXT_RULES_URL_PATTERN, (route) => {
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
  await page.route(AI_CONTEXT_RULES_URL_PATTERN, (route) => {
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

async function mockSettingsGetResponse(
  page,
  { status = 200, settings = null, errMsg = '' } = {},
) {
  await page.route(AI_CONTEXT_SETTINGS_URL_PATTERN, (route) => {
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

async function mockSettingsPutFailure(
  page,
  { status = 500, errMsg = '' } = {},
) {
  await page.route(AI_CONTEXT_SETTINGS_URL_PATTERN, (route) => {
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

/**
 * mock 控制面表达式编译通过（HTTP 200）。
 * Expression 组件 PATCH expression/verify 成功时 emit 空 errmsg。
 */
async function mockExpressionVerifySuccess(page) {
  await page.route(EXPRESSION_VERIFY_URL_PATTERN, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ErrNum: 200, Data: { message: '' } }),
    });
  });
}

/**
 * mock 控制面表达式编译失败（非 2xx）。
 * 注意：request.js 错误拦截器虽 resolve 返回 response，但 axios 走 error 回调，
 * Expression 组件的 .then 不执行、且无 .catch —— 不会 emit expressionChanged，
 * condErrmsg 保持为空。故 AX-V-02 的 condErrmsg 提示经 injectRuleFormCondErrmsg 触发。
 */
async function mockExpressionVerifyFailure(
  page,
  message = '表达式编译失败',
  status = 400,
) {
  await page.route(EXPRESSION_VERIFY_URL_PATTERN, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ ErrNum: status, ErrMsg: message, Data: { message } }),
    });
  });
}

async function unmockAiContextNetwork(page) {
  await page.unroute(AI_CONTEXT_RULES_URL_PATTERN).catch(() => {});
  await page.unroute(AI_CONTEXT_SETTINGS_URL_PATTERN).catch(() => {});
  await page.unroute(EXPRESSION_VERIFY_URL_PATTERN).catch(() => {});
}

// ---------------------------------------------------------------------------
// 通用提示断言（退出 / 删除等非「提交」类操作的 toast 文案）
// ---------------------------------------------------------------------------

async function expectAiContextMessage(page, text, timeout = 15000) {
  await new IvuMessageComponent(page).expectText(text, timeout);
}

async function expectAiContextMessageDuringAction(
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
  DOC_AI_CONTEXT_PAGE,
  DOC_AI_CONTEXT_RULES,
  DOC_AI_CONTEXT_RULE_FORM,
  DOC_AI_CONTEXT_RULE_VIEW,
  DOC_AI_CONTEXT_SETTINGS,
  DOC_AI_CONTEXT_SETTINGS_VIEW,
  AI_CONTEXT_PATH,
  AI_CONTEXT_RULES_URL_PATTERN,
  AI_CONTEXT_SETTINGS_URL_PATTERN,
  EXPRESSION_VERIFY_URL_PATTERN,
  // 文案格式化
  formatTokensText,
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
  settingsPane,
  ruleHeader,
  settingsHeader,
  settingsView,
  settingsFormScope,
  settingsForm,
  ruleFormScope,
  ruleForm,
  viewDrawerScope,
  formDrawer,
  viewDrawer,
  drawerMask,
  clickDrawerMask,
  ruleFormItem,
  settingsFormItem,
  modal,
  // 导航与就绪
  isOnAiContextPage,
  expectAiContextPageReady,
  gotoAiContextPage,
  gotoAiContextPageAndWaitForRules,
  reloadAiContextPage,
  reloadAiContextPageExpectMessage,
  // 页头 / Tab
  expectPageHeaderTitle,
  expectTabs,
  expectActiveTab,
  switchToTab,
  switchToRulesTab,
  switchToSettingsTab,
  expectRuleHeaderSubmitPosition,
  // 规则列表
  expectRuleTableHeaders,
  getRuleRow,
  getRuleCell,
  getRuleCondsInOrder,
  getRuleRowCount,
  expectRuleRowOrder,
  expectRuleCellText,
  expectRuleCellContains,
  expectRuleModeTag,
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
  filterRulesByMode,
  expectModeFilterOptions,
  clearModeFilter,
  // 抽屉
  openAddRuleDrawer,
  openEditRuleDrawer,
  openViewRuleDrawer,
  closeViewDrawer,
  closeRuleFormDrawer,
  expectFormDrawerWidth,
  expectViewDrawerWidth,
  expectViewDrawerFieldLabels,
  expectViewDrawerFieldValue,
  expectViewDrawerNoInputs,
  expectViewDrawerNoRequiredMark,
  viewDrawerRow,
  // 规则表单
  fillRuleCond,
  expectRuleCondValue,
  fillRuleFormNumber,
  expectRuleFormNumber,
  selectRuleFormMode,
  expectRuleFormMode,
  expectRuleFormModeOptions,
  clickRuleFormReset,
  expectRuleFormDefaultValues,
  submitRuleFormAndWait,
  submitRuleFormExpectMessage,
  expectRuleFormError,
  expectRuleFormFieldValid,
  expectRuleFormDrawerHidden,
  expectRuleFormDrawerStillOpen,
  injectRuleFormMode,
  injectRuleFormCondErrmsg,
  // 提交并生效
  waitForAiContextRulesGetResponse,
  waitForAiContextRulesPutResponse,
  clickSubmitAndEffect,
  submitRulesAndCapture,
  submitRulesExpectMessage,
  submitRulesAndWait,
  expectRulesPayloadOrder,
  expectRulesPayloadNoTimestamps,
  expectRulePayloadOmitsZeroFields,
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
  trackAiContextRuleRequests,
  expectNoRuleMutationRequest,
  trackAiContextSettingsRequests,
  expectNoSettingsMutationRequest,
  // 全局设置
  expectSettingsHeaderSubtitle,
  expectSettingsCardTitle,
  expectSettingsViewLabels,
  expectSettingsViewField,
  expectSettingsViewFieldContains,
  expectSettingsViewMode,
  enterSettingsEditMode,
  expectSettingsEditMode,
  cancelSettingsEditMode,
  fillSettingsNumber,
  selectSettingsThinkingPolicy,
  selectSettingsRewriteStrength,
  expectSettingsSelectOptions,
  expectSettingsFieldError,
  expectSettingsFieldValid,
  expectSettingsNoTimestampField,
  waitForAiContextSettingsGetResponse,
  waitForAiContextSettingsPutResponse,
  clickSettingsSave,
  saveSettingsAndCapture,
  saveSettingsExpectMessage,
  expectSettingsFieldRequired,
  expectSettingsNumberControl,
  expectSettingsNumber,
  injectSettingsEnum,
  // Mock
  mockRulesGetResponse,
  mockRulesPutFailure,
  mockSettingsGetResponse,
  mockSettingsPutFailure,
  mockExpressionVerifySuccess,
  mockExpressionVerifyFailure,
  unmockAiContextNetwork,
  // 通用提示断言
  expectAiContextMessage,
  expectAiContextMessageDuringAction,
  // API 造数 / 备份 / 恢复（复用 api/ai-context-api-utils.js）
  createAiContextTestCleanup: apiUtils.createAiContextTestCleanup,
  getAiContextRulesViaApi: apiUtils.fetchAiContextRulesViaApi,
  setAiContextRulesViaApi: apiUtils.putAiContextRulesViaApi,
  getAiContextSettingsViaApi: apiUtils.fetchAiContextSettingsViaApi,
  setAiContextSettingsViaApi: apiUtils.putAiContextSettingsViaApi,
  generateTestRuleName: apiUtils.generateTestRuleName,
  buildTestRule: apiUtils.buildTestRule,
  ensureAiContextRuleExistsViaApi: apiUtils.ensureAiContextRuleExistsViaApi,
};
