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
 * 意图配置（IntentConfig）页面对象
 *
 * 页面结构（src/modules/IntentConfig/index.vue）：
 * - 根节点 .intent-config：.ic-header（描述文案 + 右上角操作按钮）+
 *   未发布提示 .ic-unpublished-tip + 两张 Card.ic-card（全局配置 / 问题列表）
 * - 问题列表 Card：工具栏 .ic-list-toolbar（「添加问题」，v-show 编辑模式）+ pageTable
 * - 两个抽屉在 .intent-config 根下：查看抽屉（.question-view）/ 表单抽屉（.question-form）
 *
 * 与 AIContext 的关键差异：
 * - 单例资源（非集合）：「保存并发布」为整体 PUT，新增/编辑/删除问题均为本地草稿
 * - GET 404 = 从未发布 → 渲染默认配置并自动进入编辑模式（顶部「尚未发布」提示）
 * - 问题名称即身份（全局唯一）；类型双枚举 choice（选项 map）/ score（档位数组），互斥
 * - 问题 ≤10、选项/档位 1-10、选项名不含 |、单问题阈值 min_confidence 可选（0-1）
 * - 表格分页器 CSS 隐藏（.page-table .page { display:none }）
 * - 离开拦截：`beforeRouteLeave` 在「编辑模式 + 有未提交改动」时弹二次确认
 *   （2026-10-16 补齐，文案与「退出编辑模式」同串 `intentConfig.exitConfirm`）；
 *   只拦应用内路由跳转，`page.goto()` 等整页跳转不触发
 *
 * 数据造数/备份/恢复统一在 api/intent-config-api-utils.js 中实现，本文件不直连网络。
 * 本文件内部禁用裸选择器于 spec —— 所有定位集中于此；spec 只调用本模块导出函数。
 */
const { expect, test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const readonly = require('../../utils/readonly');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/intent-config-api-utils');
const {
  PageTableComponent,
  AppSidebarComponent,
} = require('../../components/layout');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');
const {
  IvuMessageComponent,
  IvuFormComponent,
  IvuSelectComponent,
  IvuModalComponent,
} = require('../../components/iview');

/** 与 docs/intent-config/02 及实际 UI 文案对齐的验收文案 */
const DOC_INTENT_CONFIG_PAGE = {
  pageDesc:
    '意图配置（单例，全量覆盖式写入，无历史版本；问题数量 0-10，为空数组表示停用意图分类）',
  globalCardTitle: '全局配置',
  minConfidenceLabel: '最小置信度（0-1，默认 0.6，全局门限，可被单问题覆盖）',
  enterEditMode: '进入编辑模式',
  exitEditMode: '退出编辑模式',
  saveAndPublish: '保存并发布',
  addQuestion: '添加问题',
  unpublishedHint:
    '意图配置尚未发布，当前展示的是默认配置，点击右上角「保存并发布」后生效。',
  publishSuccessMsg: '保存并发布成功！',
  submitFailedMsg: '提交失败!',
  exitConfirm: '当前有未提交的改动，退出编辑模式将丢弃这些改动，确认退出？',
  exitDoneMsg: '已退出编辑模式',
  exitCancelledMsg: '已取消退出',
  deleteConfirmMsg: '确认删除该问题？保存并发布后将同步移除。',
  deleteDoneMsg: '已删除问题',
  cancelDeleteMsg: '取消删除',
  informationTips: '信息提示',
  loadFailedMsg: '加载意图配置失败',
  viewButton: '查看',
  editButton: '编辑',
  deleteButton: '删除',
};

const DOC_INTENT_CONFIG_QUESTIONS = {
  tableHeaders: ['问题名称', '类型', '判定说明', '操作'],
  // 列序号（0 基）：用于按列断言单元格
  columnIndex: {
    name: 0,
    type: 1,
    instructions: 2,
    action: 3,
  },
  typeChoice: '枚举（choice）',
  typeScore: '评分（score）',
  emptyOptions: '暂无选项',
  emptyLevels: '暂无档位',
  emptyPlaceholder: '-',
  /** 问题列表 Card 标题：问题列表（当前 {count} / 10） */
  questionsCardTitle: (count) => `问题列表（当前 ${count} / 10）`,
  /** 查看抽屉「最小置信度覆盖」未设置时文案 */
  useGlobalThreshold: (value) => `使用全局门限（${value}）`,
};

const DOC_INTENT_CONFIG_FORM = {
  addTitle: '添加问题',
  editTitle: '编辑问题',
  nameLabel: '问题名称（全局唯一）',
  namePlaceholder: '如 task_type',
  typeLabel: '类型',
  instructionsLabel: '判定说明（instructions）',
  instructionsPlaceholder: '供分类模型参考的自然语言说明',
  criteriaLabel: '选项（criteria，1-10 项，选项名不含 |）',
  levelsLabel: '档位（levels，1-10 档，低→高）',
  overrideLabel: '最小置信度覆盖（可选，留空则使用全局门限）',
  overridePlaceholder: '留空使用全局门限',
  saveButton: '保存',
  cancelButton: '取消',
  addOption: '添加选项',
  addLevel: '添加档位',
  optionNamePlaceholder: '选项名',
  optionDescPlaceholder: '选项描述',
  levelNamePlaceholder: '档位名',
  levelDescPlaceholder: '档位描述',
  addSuccessMsg: '已添加问题',
  savedSuccessMsg: '已保存问题',
};

/** 表单 / 发布前校验提示文案（i18n intentConfig.tip* 与 com.tip*，02-字段校验矩阵对齐） */
const DOC_INTENT_CONFIG_VALIDATION = {
  minConfidenceRange: '最小置信度必须为 0-1',
  maxQuestions: '问题数量不能超过 10',
  maxQuestionsAdd: '最多配置 10 个问题',
  questionNameRequired: '请输入问题名称',
  questionNameTooLong: '问题名称不能超过 64 字符',
  questionNameDuplicate: '问题名称已存在，必须全局唯一',
  typeInvalid: '类型非法',
  instructionsRequired: '请填写判定说明',
  criteriaCount: '选项数量必须为 1-10',
  levelsCount: '档位数量必须为 1-10',
  optionNameRequired: '选项名不能为空',
  optionNameNoPipe: '选项名不能包含 |',
  optionNameDuplicate: '选项名不能重复',
  levelNameRequired: '档位名不能为空',
  levelNameDuplicate: '档位名不能重复',
  maxOptions: '最多 10 项',
  overrideRange: '最小置信度覆盖必须为 0-1',
  validateError: '请检查参数填写是否规范!',
  nameMaxLength: 64,
  maxQuestions: 10,
  maxOptions: 10,
};

const DOC_INTENT_CONFIG_VIEW = {
  viewTitle: '查看问题',
  fieldLabels: ['问题名称', '类型', '判定说明', '选项', '档位', '最小置信度覆盖'],
};

const INTENT_CONFIG_PATH = '/intent-config';
const INTENT_CONFIG_URL_PATTERN = '**/open-api/v1/intent-config';

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
    currentUrl.includes(INTENT_CONFIG_PATH) ||
    currentUrl.includes('/cluster') ||
    currentUrl.includes('/route-tables');
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在产品页，先加载首页: ' + page.url());
    await ensureChineseLang(page);
    await page.goto(getAppBaseUrl() + INTENT_CONFIG_PATH, {
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
  return page.locator('.intent-config');
}

/** 页头右上角操作按钮区 */
function headerActions(page) {
  return pageRoot(page).locator('.ic-actions');
}

/** 未发布提示 Alert（仅未发布时渲染） */
function unpublishedTip(page) {
  return pageRoot(page).locator('.ic-unpublished-tip');
}

/** 「全局配置」Card（第一张 ic-card） */
function globalCard(page) {
  return pageRoot(page)
    .locator('.ic-card')
    .filter({ hasText: DOC_INTENT_CONFIG_PAGE.globalCardTitle })
    .first();
}

/** 「问题列表」Card（Card 标题含「问题列表（当前」） */
function questionsCard(page) {
  return pageRoot(page)
    .locator('.ic-card')
    .filter({ hasText: '问题列表（当前' })
    .first();
}

/** 「添加问题」工具栏（v-show="mode === 'edit'"，视图模式 DOM 存在但隐藏） */
function questionToolbar(page) {
  return questionsCard(page).locator('.ic-list-toolbar');
}

/** 「添加问题」工具栏可见且水平居左（justify-content: flex-start，IC-L-10） */
async function expectAddQuestionToolbarVisibleAndLeft(page) {
  const toolbar = questionToolbar(page);
  await expect(toolbar).toBeVisible();
  const justify = await toolbar.evaluate(
    (node) => getComputedStyle(node).justifyContent,
  );
  expect(justify).toBe('flex-start');
}

function questionTable(page) {
  return new PageTableComponent(
    page,
    pageRoot(page).locator('.page-table').first(),
  );
}

/** 可见的表单抽屉（内含 .question-form） */
function formDrawer(page) {
  return page
    .locator(IVU_DRAWER_VISIBLE)
    .filter({ has: page.locator('.question-form') })
    .first();
}

function questionFormScope(page) {
  return formDrawer(page).locator('.question-form');
}

/** 可见的查看抽屉（内含 .question-view） */
function viewDrawer(page) {
  return page
    .locator(IVU_DRAWER_VISIBLE)
    .filter({ has: page.locator('.question-view') })
    .first();
}

function questionViewScope(page) {
  return viewDrawer(page).locator('.question-view');
}

function questionForm(page) {
  return new IvuFormComponent(questionFormScope(page));
}

/**
 * 精确定位问题表单（新增/编辑抽屉）的某个 FormItem。
 * 用 exact 文案过滤，规避同名前缀误命中。
 */
function questionFormItem(page, label) {
  return questionFormScope(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

/** 「全局配置」Card 内某个 FormItem */
function globalCardFormItem(page, label) {
  return globalCard(page)
    .locator('.ivu-form-item')
    .filter({ has: page.getByText(label, { exact: true }) });
}

function modal(page) {
  return new IvuModalComponent(page);
}

// ---------------------------------------------------------------------------
// 页面导航与就绪判定
// ---------------------------------------------------------------------------

async function isOnIntentConfigPage(page) {
  if (!page.url().includes(INTENT_CONFIG_PATH)) {
    return false;
  }
  return pageRoot(page)
    .isVisible()
    .catch(() => false);
}

async function gotoIntentConfigPage(page) {
  if (await isOnIntentConfigPage(page)) {
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await page.goto(getAppBaseUrl() + INTENT_CONFIG_PATH, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);
  await umUtils.handleUrlInvalidAlert(page);
}

/** 等待 GET /intent-config 返回（不限状态码：200 = 已发布，404 = 未发布，500 = 加载失败） */
async function waitForIntentConfigGetResponse(page, action = async () => {}) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/intent-config') &&
          res.request().method() === 'GET',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 intent-config GET 响应超时，降级等待: ' + e.message);
    await action();
    await page.waitForTimeout(2000);
    return null;
  }
}

async function gotoIntentConfigPageAndWaitForConfig(page) {
  if (await isOnIntentConfigPage(page)) {
    await waitForIntentConfigGetResponse(page, () => page.reload());
    await page.waitForTimeout(1000);
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  await ensureAppSession(page);
  await ensureChineseLang(page);
  await waitForIntentConfigGetResponse(page, () =>
    page.goto(getAppBaseUrl() + INTENT_CONFIG_PATH, {
      waitUntil: 'domcontentloaded',
    }),
  );
  await page.waitForTimeout(1500);
  await umUtils.handleUrlInvalidAlert(page);
}

async function reloadIntentConfigPage(page) {
  if (!(await isOnIntentConfigPage(page))) {
    await gotoIntentConfigPageAndWaitForConfig(page);
    return;
  }
  await waitForIntentConfigGetResponse(page, () => page.reload());
  await page.waitForTimeout(1000);
  await umUtils.handleUrlInvalidAlert(page);
}

// ---------------------------------------------------------------------------
// 页头 / 模式 / 未发布提示 / 全局配置 Card
// ---------------------------------------------------------------------------

async function expectPageDesc(page) {
  await expect(pageRoot(page).locator('.ic-desc')).toHaveText(
    DOC_INTENT_CONFIG_PAGE.pageDesc,
  );
}

async function expectViewMode(page) {
  const actions = headerActions(page);
  await expect(
    actions.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.enterEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    actions.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.exitEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    actions.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.saveAndPublish,
      exact: true,
    }),
  ).toHaveCount(0);
  // 「添加问题」用 v-show：视图模式 DOM 存在但隐藏
  await expect(
    questionToolbar(page)
      .locator('button')
      .filter({ hasText: DOC_INTENT_CONFIG_PAGE.addQuestion }),
  ).toBeHidden();
}

async function expectEditMode(page) {
  const actions = headerActions(page);
  await expect(
    actions.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.exitEditMode,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    actions.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.saveAndPublish,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    actions.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.enterEditMode,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    questionToolbar(page).getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.addQuestion,
      exact: true,
    }),
  ).toBeVisible();
}

async function enterEditMode(page) {
  const actions = headerActions(page);
  const exitButton = actions.getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.exitEditMode,
    exact: true,
  });
  if (await exitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }
  await actions
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.enterEditMode,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function expectUnpublishedTipVisible(page) {
  await expect(unpublishedTip(page)).toBeVisible();
  await expect(unpublishedTip(page)).toHaveText(
    DOC_INTENT_CONFIG_PAGE.unpublishedHint,
  );
}

async function expectNoUnpublishedTip(page) {
  await expect(unpublishedTip(page)).toHaveCount(0);
}

async function expectGlobalCardTitle(page) {
  await expect(globalCard(page).locator('.ivu-card-head')).toContainText(
    DOC_INTENT_CONFIG_PAGE.globalCardTitle,
  );
}

/** 视图模式：全局「最小置信度」以纯文案展示（.ic-global-value） */
async function expectGlobalThresholdText(page, expected) {
  await expect(globalCard(page).locator('.ic-global-value')).toHaveText(
    expected,
  );
}

/** 编辑模式：全局「最小置信度」为可编辑 InputNumber（0-1，步进 0.01，占位 0.6） */
async function expectGlobalThresholdInputVisible(page) {
  const input = globalCardFormItem(
    page,
    DOC_INTENT_CONFIG_PAGE.minConfidenceLabel,
  ).locator('.ivu-input-number input');
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();
  await expect(input).toHaveAttribute('placeholder', '0.6');
}

async function fillGlobalThreshold(page, value) {
  const input = globalCardFormItem(
    page,
    DOC_INTENT_CONFIG_PAGE.minConfidenceLabel,
  ).locator('.ivu-input-number input');
  await input.click();
  await input.fill(value === '' ? '' : String(value));
  await page.waitForTimeout(200);
}

async function expectGlobalThresholdInputValue(page, value) {
  await expect(
    globalCardFormItem(
      page,
      DOC_INTENT_CONFIG_PAGE.minConfidenceLabel,
    ).locator('.ivu-input-number input'),
  ).toHaveValue(value === '' ? '' : String(value));
}

// ---------------------------------------------------------------------------
// 问题列表 Card / 表格
// ---------------------------------------------------------------------------

async function expectQuestionsCardTitle(page, count) {
  await expect(questionsCard(page).locator('.ivu-card-head')).toContainText(
    DOC_INTENT_CONFIG_QUESTIONS.questionsCardTitle(count),
  );
}

async function expectQuestionTableHeaders(page) {
  await questionTable(page).expectHeaders(
    ...DOC_INTENT_CONFIG_QUESTIONS.tableHeaders,
  );
}

/** 问题名称即身份：按名称精确定位数据行 */
function getQuestionRow(page, name) {
  return questionTable(page)
    .dataRows()
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
}

/** 按列序号（0 基）获取问题行的单元格 */
function getQuestionCell(page, name, columnIndex) {
  return getQuestionRow(page, name).locator(`td:nth-child(${columnIndex + 1})`);
}

async function getQuestionRowCount(page) {
  return questionTable(page).dataRows().count();
}

/** 断言问题列表行数（expect 封装，spec 直用） */
async function expectQuestionRowCount(page, count) {
  expect(await getQuestionRowCount(page)).toBe(count);
}

async function getQuestionNamesInOrder(page) {
  const texts = await questionTable(page)
    .dataRows()
    .locator('td:nth-child(1)')
    .allInnerTexts();
  return texts.map((t) => t.trim());
}

async function expectQuestionRowVisible(page, name) {
  await expect(getQuestionRow(page, name)).toBeVisible({ timeout: 15000 });
}

async function expectQuestionRowHidden(page, name, timeout = 15000) {
  await expect(getQuestionRow(page, name)).toHaveCount(0, { timeout });
}

/** 类型 Tag 文案 + 颜色类（choice=primary，score=success） */
async function expectQuestionTypeTag(page, name, text, color) {
  const tag = getQuestionCell(
    page,
    name,
    DOC_INTENT_CONFIG_QUESTIONS.columnIndex.type,
  ).locator('.ivu-tag');
  await expect(tag).toHaveText(text);
  if (color) {
    await expect(tag).toHaveClass(new RegExp(`ivu-tag-${color}`));
  }
}

async function expectQuestionCellText(page, name, columnIndex, expected) {
  await expect(getQuestionCell(page, name, columnIndex)).toHaveText(expected);
}

async function expectQuestionCellContains(page, name, columnIndex, expected) {
  await expect(getQuestionCell(page, name, columnIndex)).toContainText(
    expected,
  );
}

async function expectQuestionTableEmpty(page) {
  await expect(questionTable(page).dataRows()).toHaveCount(0);
}

/** 分页器隐藏（.page-table .page { display:none }） */
async function expectPaginationHidden(page) {
  await expect(questionTable(page).pagination()).toBeHidden();
}

// ---------------------------------------------------------------------------
// 行操作
// ---------------------------------------------------------------------------

async function clickQuestionView(page, name) {
  await getQuestionRow(page, name)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.viewButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function clickQuestionEdit(page, name) {
  await getQuestionRow(page, name)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.editButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function clickQuestionDelete(page, name) {
  await getQuestionRow(page, name)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.deleteButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 视图模式行操作仅「查看」（IC-L-06） */
async function expectQuestionRowOnlyViewAction(page, name) {
  const row = getQuestionRow(page, name);
  await expect(
    row.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.viewButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.editButton,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    row.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.deleteButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

/** 编辑模式行操作「编辑」+「删除」（IC-L-08） */
async function expectQuestionRowEditDeleteActions(page, name) {
  const row = getQuestionRow(page, name);
  await expect(
    row.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.editButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.deleteButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.viewButton,
      exact: true,
    }),
  ).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// 抽屉：新增 / 编辑 / 查看
// ---------------------------------------------------------------------------

async function openAddQuestionDrawer(page) {
  await questionToolbar(page)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.addQuestion,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
  await expect(questionFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_INTENT_CONFIG_FORM.addTitle, { exact: true }),
  ).toBeVisible();
}

async function openEditQuestionDrawer(page, name) {
  await clickQuestionEdit(page, name);
  await expect(questionFormScope(page)).toBeVisible();
  await expect(
    formDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_INTENT_CONFIG_FORM.editTitle, { exact: true }),
  ).toBeVisible();
}

async function closeQuestionFormDrawer(page) {
  await formDrawer(page).locator('.ivu-drawer-close').click();
  await expect(questionFormScope(page)).toHaveCount(0, { timeout: 10000 });
}

async function cancelQuestionForm(page) {
  await questionFormScope(page)
    .locator('.drawer-footer')
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_FORM.cancelButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 表单抽屉 :width="60" → iView 渲染为 60% */
async function expectFormDrawerWidth(page) {
  const el = formDrawer(page).locator('.ivu-drawer').first();
  await expect(el).toBeVisible();
  const width = await el.evaluate((node) => node.style.width);
  expect(width).toBe('60%');
}

/** 表单字段 label 集合断言（IC-Q-01） */
async function expectQuestionFormFieldLabels(
  page,
  labels = [
    DOC_INTENT_CONFIG_FORM.nameLabel,
    DOC_INTENT_CONFIG_FORM.typeLabel,
    DOC_INTENT_CONFIG_FORM.instructionsLabel,
    DOC_INTENT_CONFIG_FORM.criteriaLabel,
    DOC_INTENT_CONFIG_FORM.overrideLabel,
  ],
) {
  for (const label of labels) {
    await expect(
      questionFormItem(page, label).locator('.ivu-form-item-label'),
    ).toHaveText(label);
  }
}

/** 抽屉底部「保存」「取消」操作区（IC-Q-01） */
async function expectQuestionFormFooterButtons(page) {
  const footer = questionFormScope(page).locator('.drawer-footer');
  await expect(
    footer.getByRole('button', {
      name: DOC_INTENT_CONFIG_FORM.saveButton,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    footer.getByRole('button', {
      name: DOC_INTENT_CONFIG_FORM.cancelButton,
      exact: true,
    }),
  ).toBeVisible();
}

async function expectQuestionFormDrawerHidden(page) {
  await expect(questionFormScope(page)).toHaveCount(0, { timeout: 10000 });
}

async function expectQuestionFormDrawerStillOpen(page) {
  await expect(questionFormScope(page)).toBeVisible();
}

// ---------------------------------------------------------------------------
// 问题表单：填写 / 读取
// ---------------------------------------------------------------------------

async function fillQuestionName(page, name) {
  const input = questionFormItem(page, DOC_INTENT_CONFIG_FORM.nameLabel)
    .locator('input')
    .first();
  await input.click();
  await input.fill(name);
  await page.waitForTimeout(200);
}

async function expectQuestionNameValue(page, name) {
  await expect(
    questionFormItem(page, DOC_INTENT_CONFIG_FORM.nameLabel)
      .locator('input')
      .first(),
  ).toHaveValue(name);
}

async function fillQuestionInstructions(page, text) {
  const textarea = questionFormItem(
    page,
    DOC_INTENT_CONFIG_FORM.instructionsLabel,
  )
    .locator('textarea')
    .first();
  await textarea.click();
  await textarea.fill(text);
  await page.waitForTimeout(200);
}

async function expectQuestionInstructionsValue(page, text) {
  await expect(
    questionFormItem(page, DOC_INTENT_CONFIG_FORM.instructionsLabel)
      .locator('textarea')
      .first(),
  ).toHaveValue(text);
}

/** 类型下拉选择（枚举（choice）/ 评分（score）） */
async function selectQuestionType(page, optionText) {
  const trigger = questionFormItem(
    page,
    DOC_INTENT_CONFIG_FORM.typeLabel,
  ).locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOption(optionText);
  await page.waitForTimeout(300);
}

async function expectQuestionTypeSelected(page, optionText) {
  await expect(
    questionFormItem(page, DOC_INTENT_CONFIG_FORM.typeLabel).locator(
      '.ivu-select-selected-value',
    ),
  ).toHaveText(optionText);
}

/** 展开类型下拉并断言选项集合（枚举/评分两枚举） */
async function expectQuestionTypeOptions(
  page,
  expectedTexts = [
    DOC_INTENT_CONFIG_QUESTIONS.typeChoice,
    DOC_INTENT_CONFIG_QUESTIONS.typeScore,
  ],
) {
  const trigger = questionFormItem(
    page,
    DOC_INTENT_CONFIG_FORM.typeLabel,
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

/** 选项 / 档位行（.ic-item-row，每行两个 Input + 一个删除按钮） */
function optionRows(page) {
  return questionFormScope(page).locator('.ic-item-row');
}

async function expectOptionRowCount(page, count) {
  await expect(optionRows(page)).toHaveCount(count);
}

/** 点击「添加选项」/「添加档位」（choice=添加选项，score=添加档位） */
async function clickAddOption(
  page,
  buttonText = DOC_INTENT_CONFIG_FORM.addOption,
) {
  await questionFormScope(page)
    .getByRole('button', { name: buttonText, exact: true })
    .click();
  await page.waitForTimeout(200);
}

/** 填写选项 / 档位行（第 index 行：名称 + 描述） */
async function fillOptionRow(page, index, name, description = '') {
  const row = optionRows(page).nth(index);
  const nameInput = row.locator('input').nth(0);
  await nameInput.click();
  await nameInput.fill(name);
  if (description) {
    const descInput = row.locator('input').nth(1);
    await descInput.click();
    await descInput.fill(description);
  }
  await page.waitForTimeout(200);
}

async function expectOptionRowValue(page, index, name, description = '') {
  const row = optionRows(page).nth(index);
  await expect(row.locator('input').nth(0)).toHaveValue(name);
  await expect(row.locator('input').nth(1)).toHaveValue(description);
}

/** 删除选项 / 档位行（点击该行「删除」按钮） */
async function removeOptionRow(page, index) {
  await optionRows(page)
    .nth(index)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.deleteButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(200);
}

/** 选项 / 档位空态文案（暂无选项 / 暂无档位） */
async function expectEmptyOptionsText(
  page,
  text = DOC_INTENT_CONFIG_QUESTIONS.emptyOptions,
) {
  await expect(questionFormScope(page).locator('.ic-list-empty')).toHaveText(
    text,
  );
}

/** 表单内「添加选项」/「添加档位」按钮文案（随类型切换重渲染，IC-Q-06） */
async function expectAddOptionButtonText(
  page,
  buttonText = DOC_INTENT_CONFIG_FORM.addOption,
) {
  await expect(
    questionFormScope(page)
      .getByRole('button', { name: buttonText, exact: true }),
  ).toBeVisible();
}

/** 单问题「最小置信度覆盖」InputNumber（可选，留空使用全局门限） */
async function fillQuestionOverride(page, value) {
  const input = questionFormItem(
    page,
    DOC_INTENT_CONFIG_FORM.overrideLabel,
  ).locator('.ivu-input-number input');
  await input.click();
  await input.fill(value === '' ? '' : String(value));
  await page.waitForTimeout(200);
}

async function expectQuestionOverrideValue(page, value) {
  await expect(
    questionFormItem(page, DOC_INTENT_CONFIG_FORM.overrideLabel).locator(
      '.ivu-input-number input',
    ),
  ).toHaveValue(value === '' ? '' : String(value));
}

// ---------------------------------------------------------------------------
// 问题表单：提交 / 校验
// ---------------------------------------------------------------------------

async function clickQuestionFormSave(page) {
  await questionFormScope(page)
    .locator('.drawer-footer')
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_FORM.saveButton,
      exact: true,
    })
    .click();
  await page.waitForTimeout(1000);
}

/** 点击「保存」并断言提示文案（校验失败拦截时抽屉保持打开） */
async function submitQuestionFormExpectMessage(page, message) {
  const scope = questionFormScope(page);
  await new IvuMessageComponent(page).waitForTextDuringAction(message, () =>
    scope
      .locator('.drawer-footer')
      .getByRole('button', {
        name: DOC_INTENT_CONFIG_FORM.saveButton,
        exact: true,
      })
      .click(),
  );
  await page.waitForTimeout(500);
}

/** 表单内联校验错误（ivu-form-item-error-tip，如名称必填/超 64 字符） */
async function expectQuestionFormFieldError(page, fieldLabel, message) {
  const tip = questionFormItem(page, fieldLabel).locator(
    '.ivu-form-item-error-tip',
  );
  await expect(tip).toBeVisible();
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

async function expectQuestionFormFieldValid(page, fieldLabel) {
  await expect(
    questionFormItem(page, fieldLabel).locator('.ivu-form-item-error-tip'),
  ).toBeHidden();
}

// ---------------------------------------------------------------------------
// 查看抽屉（只读）
// ---------------------------------------------------------------------------

async function openViewQuestionDrawer(page, name) {
  await clickQuestionView(page, name);
  await expect(questionViewScope(page)).toBeVisible();
  await expect(
    viewDrawer(page)
      .locator('.ivu-drawer-header-inner')
      .getByText(DOC_INTENT_CONFIG_VIEW.viewTitle, { exact: true }),
  ).toBeVisible();
}

async function closeViewQuestionDrawer(page) {
  await viewDrawer(page).locator('.ivu-drawer-close').click();
  await expect(questionViewScope(page)).toHaveCount(0, { timeout: 10000 });
}

function viewDrawerRow(page, fieldLabel) {
  return questionViewScope(page)
    .locator('.info-row')
    .filter({ has: page.getByText(fieldLabel, { exact: true }) })
    .first();
}

async function expectViewDrawerFieldValue(page, fieldLabel, expectedValue) {
  await expect(
    viewDrawerRow(page, fieldLabel).locator('.info-value'),
  ).toHaveText(expectedValue);
}

async function expectViewDrawerFieldContains(page, fieldLabel, expectedText) {
  await expect(
    viewDrawerRow(page, fieldLabel).locator('.info-value'),
  ).toContainText(expectedText);
}

/** 查看抽屉无任何表单控件与提交按钮（IC-D-03） */
async function expectViewDrawerNoInputs(page) {
  const scope = questionViewScope(page);
  await expect(
    scope.locator('input, textarea, .ivu-select, .ivu-select-selection'),
  ).toHaveCount(0);
  for (const name of ['保存', '取消']) {
    await expect(scope.getByRole('button', { name })).toHaveCount(0);
  }
}

/** 查看抽屉字段 label 无必填 `*` 号 */
async function expectViewDrawerNoRequiredMark(page) {
  const labels = await questionViewScope(page)
    .locator('.info-label')
    .allInnerTexts();
  for (const label of labels) {
    expect(label).not.toContain('*');
  }
}

// ---------------------------------------------------------------------------
// 保存并发布（PUT 整体覆盖）
// ---------------------------------------------------------------------------

async function waitForIntentConfigPutResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/intent-config') &&
          res.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    common.log('等待 intent-config PUT 响应超时: ' + e.message);
    return null;
  }
}

async function clickSaveAndPublish(page) {
  await headerActions(page)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.saveAndPublish,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 点击「保存并发布」，捕获 PUT 响应与请求体 */
async function saveConfigAndCapture(page) {
  const response = await waitForIntentConfigPutResponse(page, () =>
    clickSaveAndPublish(page),
  );
  let payload = null;
  if (response) {
    try {
      payload = response.request().postDataJSON();
    } catch (e) {
      common.log('解析 intent-config PUT 请求体失败: ' + e.message);
    }
  }
  return { response, payload };
}

/** 点击「保存并发布」并断言成功提示（默认「保存并发布成功！」） */
async function saveConfigExpectMessage(
  page,
  message = DOC_INTENT_CONFIG_PAGE.publishSuccessMsg,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction(message, () =>
    clickSaveAndPublish(page),
  );
  await page.waitForTimeout(1000);
}

/** 保存并发布后等待重新 GET 回填完成并回到视图模式（IC-P-01） */
async function saveConfigAndWait(page) {
  await waitForIntentConfigPutResponse(page, () => clickSaveAndPublish(page));
  await new IvuMessageComponent(page).expectText(
    DOC_INTENT_CONFIG_PAGE.publishSuccessMsg,
  );
  await waitForIntentConfigGetResponse(page, async () => {});
  await expectViewMode(page);
}

// ---------------------------------------------------------------------------
// 退出编辑模式（确认框）
// ---------------------------------------------------------------------------

async function clickExitEditMode(page) {
  await headerActions(page)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.exitEditMode,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

async function expectExitConfirmModal(page) {
  await modal(page).expectOpen(DOC_INTENT_CONFIG_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_INTENT_CONFIG_PAGE.exitConfirm),
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
// 离开拦截（应用内路由跳转，IC-DR-01 / IC-DR-02）
// ---------------------------------------------------------------------------

/**
 * 侧栏菜单组件（`components/layout/AppSidebarComponent`）。
 * 离开拦截必须用**应用内路由跳转**触发：`src/modules/IntentConfig/index.vue` 的
 * `beforeRouteLeave` 只拦 vue-router 跳转，`page.goto()` / 刷新属整页跳转，守卫不会执行
 * （与路由规则页 `pages/route/RoutePage.js` 的「SPA 的离开确认框不会拦硬跳转」同理），
 * 用硬跳转验证会得到假通过。
 */
function sidebar(page) {
  return new AppSidebarComponent(page);
}

/**
 * 可与意图配置交叉跳转的兄弟模块菜单项。文案取自 `src/i18n/zh.js` / `en.js` 的 `nav.*`
 * （节点结构见 `ai-gateway-runtime/conf/nav_tree.toml`「功能增强 / 消费方管理」），
 * 中英双写在先，`slug` 取自 `src/router/router.js`。
 * 这些菜单项只用于触发一次应用内路由跳转，取第一个可见者，避免环境菜单差异导致硬失败。
 */
const OTHER_MODULE_MENU_ITEMS = [
  {
    label: 'AI缓存规则',
    enLabel: 'AI Cache Rule',
    slug: 'ai-cache-rules',
  },
  {
    label: '流量镜像规则',
    enLabel: 'Traffic Mirror Rule',
    slug: 'traffic-mirror-rules',
  },
  {
    label: 'AI上下文压缩',
    enLabel: 'AI Context Compress',
    slug: 'ai-context-rules',
  },
  { label: '批量任务', enLabel: 'Batch Tasks', slug: 'batches' },
  { label: 'API Key 管理', enLabel: 'API Key Manage', slug: 'api-key' },
];

/**
 * 点击侧栏中其它模块的菜单项，触发应用内路由跳转（返回被点击的目标，含 label / slug）。
 * 侧栏在 `sidebarNav.openDefauleMenu()` 里展开全部一级子菜单，故目标项无需先展开父级即可见；
 * 仍按可见性择一（中/英文案都试），菜单结构变化时给出明确报错而非误判。
 */
async function clickOtherModuleMenuItem(page, items = OTHER_MODULE_MENU_ITEMS) {
  await expect(sidebar(page).menu()).toBeVisible({ timeout: 15000 });
  for (const item of items) {
    for (const text of [item.label, item.enLabel].filter(Boolean)) {
      const menuItem = sidebar(page).menuItem(text).first();
      if (await menuItem.isVisible().catch(() => false)) {
        common.log(`侧栏跳转目标：${text}（/${item.slug}）`);
        await menuItem.click();
        await page.waitForTimeout(1000);
        return item;
      }
    }
  }
  throw new Error(
    '侧栏未找到可点击的其它模块菜单项（尝试过: ' +
      items.map((i) => `${i.label}/${i.enLabel}`).join('、') +
      '）',
  );
}

/** `$Modal.confirm` 的标题（iView `modal/confirm.js` → `.ivu-modal-confirm-head-title`） */
function confirmModalTitle(page) {
  return modal(page).visible().locator('.ivu-modal-confirm-head-title');
}

/** `$Modal.confirm` 的正文容器（iView `modal/confirm.js` → `.ivu-modal-confirm-body`） */
function confirmModalBody(page) {
  return modal(page).visible().locator('.ivu-modal-confirm-body');
}

/**
 * 离开拦截确认框：标题「信息提示」+ 正文与退出编辑模式同串文案
 * （`intentConfig.exitConfirm`，`src/i18n/zh.js:1658`）。
 * 比 `expectExitConfirmModal` 更强：正文按 `.ivu-modal-confirm-body` 精确取值。
 */
async function expectLeaveConfirmModal(
  page,
  expected = DOC_INTENT_CONFIG_PAGE.exitConfirm,
) {
  await modal(page).expectOpen(DOC_INTENT_CONFIG_PAGE.informationTips);
  await expect(confirmModalTitle(page)).toHaveText(
    DOC_INTENT_CONFIG_PAGE.informationTips,
  );
  await expect(confirmModalBody(page)).toHaveText(expected);
}

/** 当前 URL（取消拦截后要求一字不变，故先取值再比对） */
function currentUrl(page) {
  return page.url();
}

/** 取消拦截后 URL 必须保持不变（仍停留在意图配置页，且未被改写成目标路由） */
async function expectUrlUnchanged(page, expectedUrl) {
  expect(page.url(), `取消离开拦截后 URL 应保持 ${expectedUrl}`).toBe(
    expectedUrl,
  );
}

/** 仍停留在意图配置页（页面根可见 + URL 命中 /intent-config + 无会话异常弹窗） */
async function expectStillOnIntentConfigPage(page, expectedUrl) {
  await expect(pageRoot(page)).toBeVisible();
  await expect(confirmModalBody(page)).toHaveCount(0);
  if (expectedUrl) {
    await expectUrlUnchanged(page, expectedUrl);
  } else {
    expect(page.url(), 'URL 应仍命中 /intent-config').toContain(
      INTENT_CONFIG_PATH,
    );
  }
}

/** 确定离开后跳转到目标模块（URL 命中目标 slug、不再命中 /intent-config） */
async function expectNavigatedToOtherModule(page, slug, timeout = 15000) {
  await expect
    .poll(() => page.url(), {
      timeout,
      message: `确定离开后应跳转到 /${slug}`,
    })
    .toContain(`/${slug}`);
  expect(page.url(), '跳转后 URL 不应再命中 /intent-config').not.toContain(
    INTENT_CONFIG_PATH,
  );
}

/** 离开拦截确认框：点「确定」（放行跳转） */
async function confirmLeaveNavigation(page) {
  await modal(page).confirm();
  await page.waitForTimeout(1000);
}

/** 离开拦截确认框：点「取消」（留在本页） */
async function cancelLeaveNavigation(page) {
  await modal(page).cancel();
  await page.waitForTimeout(500);
}

/**
 * 在视图中点击侧栏其它菜单后**不应**出现确认框（视图模式 / 编辑模式无改动时不拦截）。
 * 返回被点击的目标，供调用方继续断言跳转结果。
 */
async function clickOtherModuleMenuItemExpectNoModal(page, items) {
  const target = await clickOtherModuleMenuItem(page, items);
  await expectNoModal(page);
  return target;
}

// ---------------------------------------------------------------------------
// 删除问题（确认框）
// ---------------------------------------------------------------------------

async function expectDeleteConfirmModal(page) {
  await modal(page).expectOpen(DOC_INTENT_CONFIG_PAGE.informationTips);
  await expect(
    modal(page)
      .visible()
      .getByText(DOC_INTENT_CONFIG_PAGE.deleteConfirmMsg),
  ).toBeVisible();
}

async function confirmDeleteQuestion(page) {
  await modal(page).confirm();
  await page.waitForTimeout(800);
}

async function cancelDeleteQuestion(page) {
  await modal(page).cancel();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// 其它封装：加载态 / 抽屉遮罩 / 纯文案阈值 / 查看抽屉行
// ---------------------------------------------------------------------------

/** 仅点击「添加问题」按钮（不等待抽屉打开，用于上限拦截断言） */
async function clickAddQuestionButton(page) {
  await questionToolbar(page)
    .getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.addQuestion,
      exact: true,
    })
    .click();
  await page.waitForTimeout(500);
}

/** 断言当前无任何可见 Modal（如退出编辑模式未修改时不弹确认框） */
async function expectNoModal(page) {
  await expect(modal(page).visible()).toHaveCount(0);
}

/** 「保存并发布」按钮 loading 态（:loading="submitting" → ivu-btn-loading） */
async function expectSaveAndPublishLoading(page) {
  await expect(
    headerActions(page).getByRole('button', {
      name: DOC_INTENT_CONFIG_PAGE.saveAndPublish,
      exact: true,
    }),
  ).toHaveClass(/ivu-btn-loading/, { timeout: 5000 });
}

/** 延迟 PUT /intent-config 响应（防重场景：首次点击后请求未返回前再次点击） */
async function stallIntentConfigPut(page, delayMs = 3000) {
  await page.route(INTENT_CONFIG_URL_PATTERN, async (route) => {
    if (route.request().method() !== 'PUT') {
      route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    route.continue();
  });
}

/**
 * 挂起 PUT /intent-config（gate 放行前请求不返回，用于防重用例确定性复现）。
 * gatePromise: 调用方持有的 Promise，resolve 后请求才会 continue 到后端。
 */
async function holdIntentConfigPut(page, gatePromise) {
  await page.route(INTENT_CONFIG_URL_PATTERN, async (route) => {
    if (route.request().method() !== 'PUT') {
      route.continue();
      return;
    }
    await gatePromise;
    route.continue();
  });
}

/** 读取「保存并发布」按钮 class（防重用例轮询 ivu-btn-loading）。
 *  注意：loading 时按钮内插入 ios-loading 图标，CSS 生成内容会改变可访问名，
 *  getByRole(name) 精确匹配会失配，故改用 class 定位。 */
async function getSaveAndPublishButtonClass(page) {
  return headerActions(page)
    .locator('button.ivu-btn-success')
    .first()
    .getAttribute('class');
}

/**
 * 点击可见抽屉面板外区域（iview Drawer 的 mask 为 wrap 的兄弟节点，
 * 点击 wrap 空白处经 handleWrapClick → handleMask 处理）。
 * 查看抽屉 mask-closable=true 应关闭；表单抽屉 mask-closable=false 不应关闭。
 */
async function clickDrawerMaskArea(page) {
  const wrap = page.locator(IVU_DRAWER_VISIBLE).first();
  await wrap.click({ force: true, position: { x: 20, y: 400 } });
  await page.waitForTimeout(500);
}

/** 点击查看抽屉遮罩（应关闭，IC-D-02） */
async function clickViewDrawerMask(page) {
  await clickDrawerMaskArea(page);
}

/** 点击表单抽屉遮罩（不应关闭，IC-Q-15） */
async function clickFormDrawerMask(page) {
  await clickDrawerMaskArea(page);
}

async function expectViewDrawerClosed(page) {
  await expect(questionViewScope(page)).toHaveCount(0, { timeout: 10000 });
}

/** 视图模式全局阈值纯文案：.ic-global-value 可见且全局 Card 内无 InputNumber */
async function expectGlobalThresholdPureText(page) {
  await expect(globalCard(page).locator('.ic-global-value')).toBeVisible();
  await expect(
    globalCard(page).locator('.ivu-input-number'),
  ).toHaveCount(0);
}

/** 编辑模式全局阈值 InputNumber：占位符 0.6 且可编辑（iview 默认 activeChange 不渲染 min/max/step 属性） */
async function expectGlobalThresholdInputAttrs(page) {
  const input = globalCardFormItem(
    page,
    DOC_INTENT_CONFIG_PAGE.minConfidenceLabel,
  ).locator('.ivu-input-number input');
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();
  await expect(input).toHaveAttribute('placeholder', '0.6');
}

/** 查看抽屉内容行数（问题名称/类型/判定说明/选项或档位/最小置信度覆盖 共 5 行） */
async function expectViewDrawerInfoRowCount(page, count) {
  await expect(questionViewScope(page).locator('.info-row')).toHaveCount(
    count,
  );
}

/** 查看抽屉「选项」/「档位」行的逐行文案与顺序（.list-line） */
async function expectViewDrawerLines(page, fieldLabel, expectedLines) {
  const lines = viewDrawerRow(page, fieldLabel).locator('.list-line');
  await expect(lines).toHaveCount(expectedLines.length);
  const actual = (await lines.allInnerTexts()).map((t) => t.trim());
  expect(actual).toEqual(expectedLines);
}

/** 查看抽屉无任何底部操作按钮（保存/取消等，IC-D-02） */
async function expectViewDrawerNoFooterButtons(page) {
  const scope = questionViewScope(page);
  for (const name of [
    DOC_INTENT_CONFIG_FORM.saveButton,
    DOC_INTENT_CONFIG_FORM.cancelButton,
  ]) {
    await expect(scope.getByRole('button', { name })).toHaveCount(0);
  }
}

/** 表单内选项/档位行的占位符（类型切换后变化：选项名/选项描述 ↔ 档位名/档位描述） */
async function expectOptionRowPlaceholders(
  page,
  index,
  namePlaceholder,
  descPlaceholder,
) {
  const row = optionRows(page).nth(index);
  await expect(row.locator('input').nth(0)).toHaveAttribute(
    'placeholder',
    namePlaceholder,
  );
  await expect(row.locator('input').nth(1)).toHaveAttribute(
    'placeholder',
    descPlaceholder,
  );
}

// ---------------------------------------------------------------------------
// 网络请求监听（断言「本地保存 / 删除」不发变更请求）
// ---------------------------------------------------------------------------

function trackIntentConfigRequests(page) {
  const state = { get: 0, put: 0, putUrls: [] };
  const handler = (request) => {
    const url = request.url();
    if (!url.includes('/intent-config')) {
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

async function expectNoIntentConfigMutationRequest(tracker) {
  expect(tracker.state.put, '不应发起 intent-config 变更请求(PUT)').toBe(0);
}

// ---------------------------------------------------------------------------
// Mock 网络（用于未发布 404 / 加载失败 / 提交失败等场景）
// ---------------------------------------------------------------------------

async function mockIntentConfigGetResponse(
  page,
  { status = 200, minConfidence = 0.6, questions = [], errMsg = '' } = {},
) {
  await page.route(INTENT_CONFIG_URL_PATTERN, (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    if (status === 200) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          Data: { min_confidence: minConfidence, questions },
        }),
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

async function mockIntentConfigPutFailure(
  page,
  { status = 500, errMsg = '' } = {},
) {
  await page.route(INTENT_CONFIG_URL_PATTERN, (route) => {
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

async function unmockIntentConfigNetwork(page) {
  await page.unroute(INTENT_CONFIG_URL_PATTERN).catch(() => {});
}

// ---------------------------------------------------------------------------
// 通用提示断言
// ---------------------------------------------------------------------------

async function expectIntentConfigMessage(page, text, timeout = 15000) {
  await new IvuMessageComponent(page).expectText(text, timeout);
}

async function expectIntentConfigMessageDuringAction(
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

// ---------------------------------------------------------------------------
// 只读管理员视角（docs/intent-config/02-功能测试用例/05-只读视角.md IC-RO-01~03）
// ---------------------------------------------------------------------------

/** 页头「进入编辑模式」写入口（位于挂 `v-has` 的 `.ic-actions` 内，只读视角不可见） */
function headerEnterEditBtn(page) {
  return headerActions(page).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.enterEditMode,
    exact: true,
  });
}

/** 页头「退出编辑模式」写入口（与「保存并发布」同在 `v-else` 分支，只读视角不渲染） */
function headerExitEditBtn(page) {
  return headerActions(page).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.exitEditMode,
    exact: true,
  });
}

/** 页头「保存并发布」写入口（只读视角不渲染；只读用例只断言可见性，不点击） */
function headerSaveAndPublishBtn(page) {
  return headerActions(page).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.saveAndPublish,
    exact: true,
  });
}

/** 问题列表「添加问题」按钮（容器 `.ic-list-toolbar` 同时受 v-show 与 v-has 约束） */
function questionToolbarAddBtn(page) {
  return questionToolbar(page).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.addQuestion,
    exact: true,
  });
}

/** 问题行「查看」按钮（只读视角保留的只读入口） */
function questionRowViewBtn(page, name) {
  return getQuestionRow(page, name).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.viewButton,
    exact: true,
  });
}

/** 问题行「编辑」按钮（只读视角因显示分支收敛为 `mode === 'view'` 而不渲染） */
function questionRowEditBtn(page, name) {
  return getQuestionRow(page, name).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.editButton,
    exact: true,
  });
}

/** 问题行「删除」按钮（只读视角因显示分支收敛为 `mode === 'view'` 而不渲染） */
function questionRowDeleteBtn(page, name) {
  return getQuestionRow(page, name).getByRole('button', {
    name: DOC_INTENT_CONFIG_PAGE.deleteButton,
    exact: true,
  });
}

/**
 * 查看抽屉字段 label 全集（只读查看能力保留：IC-RO-02 预期 2「全字段纯文案」）。
 * QuestionView 固定渲染 5 行：问题名称 / 类型 / 判定说明 /（选项 | 档位）/ 最小置信度覆盖，
 * 其中第 4 行 label 随问题类型二选一（choice → 选项，score → 档位），故按「二者之一」断言。
 */
async function expectViewDrawerFieldLabels(page) {
  const [name, type, instructions, criteria, levels, minConfidence] =
    DOC_INTENT_CONFIG_VIEW.fieldLabels;
  const infoRows = questionViewScope(page).locator('.info-row');
  await expect(infoRows).toHaveCount(5);
  for (const label of [name, type, instructions, minConfidence]) {
    await expect(viewDrawerRow(page, label).locator('.info-label')).toHaveText(
      label,
    );
  }
  const optionRowLabel = (
    await infoRows.nth(3).locator('.info-label').innerText()
  ).trim();
  expect(
    [criteria, levels],
    `查看抽屉第 4 行 label 应为「${criteria}」或「${levels}」`,
  ).toContain(optionRowLabel);
}

/**
 * 只读视角直连 URL 进入意图配置页。
 * 不走 `ensureAppSession` / `handleUrlInvalidAlert` —— 它们会以 admin 凭证重登并回写
 * auth.json，把只读态换回管理员态（见 utils/readonly.js 文件头约束 2）。
 */
async function gotoIntentConfigPageReadonly(page) {
  await ensureChineseLang(page);
  await readonly.gotoAsReadonly(page, INTENT_CONFIG_PATH, {
    ready: pageRoot(page),
  });
  await readonly.expectStillReadonly(page);
}

/**
 * 只读视角就绪判定：锚点只用只读视角也存在且可见的元素
 * （页面根 / 页面描述 / 问题表格表头），不能用 `expectViewMode`——它断言
 * 「进入编辑模式」可见，只读视角必然失败。
 */
async function expectIntentConfigPageReadyReadonly(page) {
  await expect(pageRoot(page)).toBeVisible();
  await expectPageDesc(page);
  await expectQuestionTableHeaders(page);
  await readonly.expectVHasHidden(
    headerActions(page),
    '意图配置页头写入口区',
  );
}

module.exports = {
  // 常量
  DOC_INTENT_CONFIG_PAGE,
  DOC_INTENT_CONFIG_QUESTIONS,
  DOC_INTENT_CONFIG_FORM,
  DOC_INTENT_CONFIG_VALIDATION,
  DOC_INTENT_CONFIG_VIEW,
  INTENT_CONFIG_PATH,
  INTENT_CONFIG_URL_PATTERN,
  // 会话
  getAppBaseUrl,
  isConnectionError,
  ensureChineseLang,
  ensureAuthenticatedShell,
  ensureAppSession,
  // 作用域
  pageRoot,
  headerActions,
  unpublishedTip,
  globalCard,
  questionsCard,
  questionToolbar,
  questionTable,
  formDrawer,
  questionFormScope,
  viewDrawer,
  questionViewScope,
  questionForm,
  questionFormItem,
  globalCardFormItem,
  modal,
  // 导航与就绪
  isOnIntentConfigPage,
  gotoIntentConfigPage,
  waitForIntentConfigGetResponse,
  gotoIntentConfigPageAndWaitForConfig,
  reloadIntentConfigPage,
  // 只读管理员视角（docs/intent-config/…/05-只读视角.md IC-RO-01~03）
  gotoIntentConfigPageReadonly,
  expectIntentConfigPageReadyReadonly,
  headerEnterEditBtn,
  headerExitEditBtn,
  headerSaveAndPublishBtn,
  questionToolbarAddBtn,
  questionRowViewBtn,
  questionRowEditBtn,
  questionRowDeleteBtn,
  expectViewDrawerFieldLabels,
  // 页头 / 模式 / 未发布提示 / 全局配置
  expectPageDesc,
  expectViewMode,
  expectEditMode,
  enterEditMode,
  expectUnpublishedTipVisible,
  expectNoUnpublishedTip,
  expectGlobalCardTitle,
  expectGlobalThresholdText,
  expectGlobalThresholdInputVisible,
  fillGlobalThreshold,
  expectGlobalThresholdInputValue,
  // 问题列表 Card / 表格
  expectQuestionsCardTitle,
  expectQuestionTableHeaders,
  getQuestionRow,
  getQuestionCell,
  getQuestionRowCount,
  expectQuestionRowCount,
  getQuestionNamesInOrder,
  expectQuestionRowVisible,
  expectQuestionRowHidden,
  expectQuestionTypeTag,
  expectQuestionCellText,
  expectQuestionCellContains,
  expectQuestionTableEmpty,
  expectPaginationHidden,
  // 行操作
  clickQuestionView,
  clickQuestionEdit,
  clickQuestionDelete,
  expectQuestionRowOnlyViewAction,
  expectQuestionRowEditDeleteActions,
  // 抽屉
  openAddQuestionDrawer,
  openEditQuestionDrawer,
  closeQuestionFormDrawer,
  cancelQuestionForm,
  expectFormDrawerWidth,
  expectQuestionFormFieldLabels,
  expectQuestionFormFooterButtons,
  expectQuestionFormDrawerHidden,
  expectQuestionFormDrawerStillOpen,
  // 问题表单：填写 / 读取
  fillQuestionName,
  expectQuestionNameValue,
  fillQuestionInstructions,
  expectQuestionInstructionsValue,
  selectQuestionType,
  expectQuestionTypeSelected,
  expectQuestionTypeOptions,
  optionRows,
  expectOptionRowCount,
  clickAddOption,
  fillOptionRow,
  expectOptionRowValue,
  removeOptionRow,
  expectEmptyOptionsText,
  expectAddOptionButtonText,
  fillQuestionOverride,
  expectQuestionOverrideValue,
  // 问题表单：提交 / 校验
  clickQuestionFormSave,
  submitQuestionFormExpectMessage,
  expectQuestionFormFieldError,
  expectQuestionFormFieldValid,
  // 查看抽屉
  openViewQuestionDrawer,
  closeViewQuestionDrawer,
  viewDrawerRow,
  expectViewDrawerFieldValue,
  expectViewDrawerFieldContains,
  expectViewDrawerNoInputs,
  expectViewDrawerNoRequiredMark,
  // 保存并发布
  waitForIntentConfigPutResponse,
  clickSaveAndPublish,
  saveConfigAndCapture,
  saveConfigExpectMessage,
  saveConfigAndWait,
  // 退出编辑模式
  clickExitEditMode,
  expectExitConfirmModal,
  confirmExitEditMode,
  cancelExitEditMode,
  // 离开拦截（应用内路由跳转，IC-DR-01 / IC-DR-02）
  OTHER_MODULE_MENU_ITEMS,
  sidebar,
  clickOtherModuleMenuItem,
  clickOtherModuleMenuItemExpectNoModal,
  confirmModalTitle,
  confirmModalBody,
  expectLeaveConfirmModal,
  currentUrl,
  expectUrlUnchanged,
  expectStillOnIntentConfigPage,
  expectNavigatedToOtherModule,
  confirmLeaveNavigation,
  cancelLeaveNavigation,
  // 删除
  expectDeleteConfirmModal,
  confirmDeleteQuestion,
  cancelDeleteQuestion,
  // 其它封装
  expectAddQuestionToolbarVisibleAndLeft,
  clickAddQuestionButton,
  expectNoModal,
  expectSaveAndPublishLoading,
  stallIntentConfigPut,
  holdIntentConfigPut,
  getSaveAndPublishButtonClass,
  clickViewDrawerMask,
  clickFormDrawerMask,
  expectViewDrawerClosed,
  expectGlobalThresholdPureText,
  expectGlobalThresholdInputAttrs,
  expectViewDrawerInfoRowCount,
  expectViewDrawerLines,
  expectViewDrawerNoFooterButtons,
  expectOptionRowPlaceholders,
  // 网络监听
  trackIntentConfigRequests,
  expectNoIntentConfigMutationRequest,
  // Mock
  mockIntentConfigGetResponse,
  mockIntentConfigPutFailure,
  unmockIntentConfigNetwork,
  // 通用提示断言
  expectIntentConfigMessage,
  expectIntentConfigMessageDuringAction,
  // API 造数 / 备份 / 恢复（复用 api/intent-config-api-utils.js）
  createIntentConfigTestCleanup: apiUtils.createIntentConfigTestCleanup,
  getIntentConfigViaApi: apiUtils.fetchIntentConfigViaApi,
  putIntentConfigViaApi: apiUtils.putIntentConfigViaApi,
  generateTestQuestionName: apiUtils.generateTestQuestionName,
  buildTestChoiceQuestion: apiUtils.buildTestChoiceQuestion,
  buildTestScoreQuestion: apiUtils.buildTestScoreQuestion,
  buildDefaultTestConfig: apiUtils.buildDefaultTestConfig,
  ensureIntentConfigPublishedViaApi: apiUtils.ensureIntentConfigPublishedViaApi,
};
