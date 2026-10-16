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
'use strict';
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const rc = require('../resource/ResourcePageCommon');
const { IvuDrawerComponent, IvuSelectComponent } = require('../../components/iview');

const AUTH_PATH = path.join(__dirname, '../../auth.json');

// 列表：/open-api/v1/batches（不含子路径）；详情/取消：带 batch_id 子路径
const LIST_URL_RE = /\/open-api\/v1\/batches(\?|$)/;
const DETAIL_URL_RE = /\/open-api\/v1\/batches\/[^/?]+$/;
const CANCEL_URL_RE = /\/open-api\/v1\/batches\/[^/?]+\/cancel$/;

const PAGE_LIMIT = 20;

const DOC = {
  pageTitle: '批量任务',
  statusFilter: '任务状态',
  allStatus: '全部状态',
  provider: '服务商',
  providerPlaceholder: '按服务商过滤',
  apiKeyId: 'API Key ID',
  apiKeyIdPlaceholder: '按 API Key 过滤',
  startTime: '创建时间起',
  endTime: '创建时间止',
  query: '查询',
  reset: '重置',
  prevPage: '上一页',
  nextPage: '下一页',
  detailTitle: '批量任务详情',
  detail: '详情',
  cancel: '取消',
  cancelConfirmTitle: '提示',
  cancelDisabledTip: '终态任务不可取消',
  detail404: '批量任务不存在或已被清理',
  detailLoadFailed: '加载批量任务详情失败',
  cancelConfirmText: '确认取消批量任务',
  cancelSuccess: '取消请求已受理，任务进入 cancelling 状态',
  cancel409: '任务已进入终态或正在被其它实例处理，取消未生效',
  cancel502: 'provider 不可达，取消请求失败，请稍后重试',
  cancel404: '批量任务不存在或已被清理',
  cancelFailed: '取消批量任务失败',
  batchId: '批量任务ID',
  entityId: 'Entity ID',
  status: '状态',
  requestCounts: '请求计数',
  usage: '用量',
  reserveUnits: '预留金额',
  settleUnits: '结算金额',
  settleStatus: '结算状态',
  createdAt: '创建时间',
  operation: '操作',
  basicInfo: '基本信息',
  statusAndCounts: '状态与计数',
  usageAndBilling: '用量与记账',
  filesAndTime: '文件与时间',
  batchFiles: '批量文件',
  productName: '产品名称',
  endpoint: '透传端点',
  requestTotal: '请求总数',
  requestCompleted: '已完成请求数',
  requestFailed: '失败请求数',
  estLines: '估算行数',
  usageInputTokens: '输入 token 数',
  usageOutputTokens: '输出 token 数',
  usageSource: '用量来源',
  overReserved: '预留结余',
  syncSource: '同步来源',
  inputFileId: '输入文件ID',
  outputFileId: '输出文件ID',
  updatedAt: '更新时间',
  terminalAt: '终结时间',
  fileId: '文件ID',
  purpose: '用途',
  filename: '文件名',
  size: '大小',
};

// 状态/结算 Tag 文案（含枚举后缀，取自 i18n zh.js）
const STATUS_LABELS = {
  validating: '校验中（validating）',
  queued: '排队中（queued）',
  in_progress: '进行中（in_progress）',
  finalizing: '收尾中（finalizing）',
  completed: '已完成（completed）',
  expired: '已过期（expired）',
  failed: '已失败（failed）',
  cancelled: '已取消（cancelled）',
  cancelling: '取消中（cancelling）',
};

const SETTLE_LABELS = {
  reserved: '已预留（reserved）',
  settled: '已结算（settled）',
  released: '已释放（released）',
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

// 12 列列头（顺序即表格顺序）
const COLUMN_HEADERS = [
  DOC.batchId,
  DOC.provider,
  DOC.apiKeyId,
  DOC.entityId,
  DOC.status,
  DOC.requestCounts,
  DOC.usage,
  DOC.reserveUnits,
  DOC.settleUnits,
  DOC.settleStatus,
  DOC.createdAt,
  DOC.operation,
];

const TERMINAL_STATUSES = ['completed', 'expired', 'failed', 'cancelled'];

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '-';
}

function settleLabel(status) {
  return SETTLE_LABELS[status] || status || '-';
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.indexOf(status) !== -1;
}

// 复刻 BatchView.text：空值渲染为 '-'
function text(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

// 复刻 BatchView.formatBytes
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, idx);
  return (idx === 0 ? value : value.toFixed(2)) + ' ' + units[idx];
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

/* ------------------------------------------------------------------ *
 * 页面导航
 * ------------------------------------------------------------------ */

function readSessionFromAuthFile() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    for (const item of auth.origins || []) {
      const userEntry = (item.localStorage || []).find((e) => e.name === 'user');
      if (userEntry && userEntry.value) {
        const parsed = JSON.parse(userEntry.value);
        if (parsed && parsed.sessionKey) {
          return parsed;
        }
      }
    }
  } catch (e) {
    /* 忽略 */
  }
  return null;
}

async function ensureLocalStorageSession(page) {
  const session = readSessionFromAuthFile();
  if (!session) {
    return;
  }
  try {
    await page.evaluate((user) => {
      if (!localStorage.getItem('user')) {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('lang', 'zh');
      }
    }, session);
  } catch (e) {
    /* sandbox 下可能 SecurityError */
  }
}

async function gotoBatchTaskPage(page) {
  const session = readSessionFromAuthFile();
  if (session) {
    await page.addInitScript((user) => {
      try {
        if (!localStorage.getItem('user')) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('lang', 'zh');
        }
      } catch (e) {
        /* 忽略 */
      }
    }, session);
  }

  await rc.ensureAppSession(page);
  await page.goto(rc.getAppBaseUrl() + '/batches');
  await page.waitForLoadState('domcontentloaded');
  await ensureLocalStorageSession(page);
  await expectBatchTaskPageReady(page);
}

async function expectBatchTaskPageReady(page) {
  await expect(
    page.getByRole('button', { name: DOC.query }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

async function reloadBatchTaskPage(page) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expectBatchTaskPageReady(page);
}

async function expectPageLayout(page) {
  expect(page.url()).toContain('/batches');
  await expect(page.locator('.batch-tasks .filter-bar')).toBeVisible();
  await expect(page.locator('.batch-tasks .batch-pager')).toBeVisible();
  await expectTableHeaders(page);
}

/* ------------------------------------------------------------------ *
 * 响应等待
 * ------------------------------------------------------------------ */

async function waitForBatchTaskListResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        LIST_URL_RE.test(r.url()) &&
        r.status() === 200,
      { timeout },
    ),
    action(),
  ]);
  return response;
}

async function waitForBatchTaskDetailResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        DETAIL_URL_RE.test(r.url()),
      { timeout },
    ),
    action(),
  ]);
  return response;
}

async function waitForBatchTaskCancelResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        CANCEL_URL_RE.test(r.url()),
      { timeout },
    ),
    action(),
  ]);
  return response;
}

/* ------------------------------------------------------------------ *
 * 表格（裸 iView Table，无 .show-iView-Table 包裹）
 * ------------------------------------------------------------------ */

function batchTaskTable(page) {
  const bodyRows = () =>
    page.locator('.batch-tasks .ivu-table-body tbody tr');
  return {
    root: () => page.locator('.batch-tasks'),
    headers: () => page.locator('.batch-tasks .ivu-table-header thead th'),
    bodyRows,
    dataRows: () => bodyRows().filter({ hasNotText: '暂无数据' }),
    rowByBatchId: (batchId) => bodyRows().filter({ hasText: batchId }).first(),
    rowAction: (batchId, buttonName) =>
      bodyRows()
        .filter({ hasText: batchId })
        .first()
        .getByRole('button', { name: buttonName }),
    async rowCount() {
      return bodyRows().count();
    },
    cellsByBatchId: async (batchId) =>
      bodyRows().filter({ hasText: batchId }).first().locator('td').allTextContents(),
    async waitForLoaded(timeout = 15000) {
      const loadingMask = page.locator('.batch-tasks .ivu-spin-fix');
      if ((await loadingMask.count()) > 0) {
        await expect(loadingMask.first()).toBeHidden({ timeout });
      }
    },
    async expectHeaders(...labels) {
      for (const label of labels) {
        await expect(this.headers().filter({ hasText: label }).first()).toBeVisible();
      }
    },
    async expectRowVisible(batchId, timeout = 15000) {
      await expect(this.rowByBatchId(batchId)).toBeVisible({ timeout });
    },
    async expectRowHidden(batchId, timeout = 15000) {
      await expect(this.rowByBatchId(batchId)).toHaveCount(0, { timeout });
    },
  };
}

async function expectTableHeaders(page) {
  await batchTaskTable(page).expectHeaders(...COLUMN_HEADERS);
}

// 读取当前页某列全部单元格文本（index 从 0 开始，与 COLUMN_HEADERS 对齐）
async function columnTexts(page, index) {
  return batchTaskTable(page)
    .dataRows()
    .evaluateAll(
      (rows, i) =>
        rows.map((row) => {
          const td = row.querySelectorAll('td')[i];
          return td ? td.textContent.trim() : '';
        }),
      index,
    );
}

async function rowCount(page) {
  return batchTaskTable(page).dataRows().count();
}

async function getHeaderTexts(page) {
  const texts = await batchTaskTable(page).headers().allTextContents();
  // 帮助 icon 为 '?'，去掉尾部帮助标记，保留纯列头文案
  return texts.map((t) => t.replace(/[?？]\s*$/, '').trim());
}

// 列头帮助 icon 的 title 提示（仅含帮助 icon 的列）
async function getHeaderHelpMap(page) {
  const headers = page.locator('.batch-tasks .ivu-table-header thead th');
  const count = await headers.count();
  const map = {};
  for (let i = 0; i < count; i += 1) {
    const th = headers.nth(i);
    const icon = th.locator('span[title]');
    if ((await icon.count()) > 0) {
      const label = (await th.textContent()).replace(/[?？]\s*$/, '').trim();
      map[label] = await icon.first().getAttribute('title');
    }
  }
  return map;
}

async function expectEmptyList(page) {
  await batchTaskTable(page).waitForLoaded();
  await expect(page.locator('.batch-tasks .ivu-table-tip')).toBeVisible();
  await expect(page.locator('.batch-tasks .ivu-table-tip')).toContainText('暂无数据');
}

/* ------------------------------------------------------------------ *
 * 过滤栏
 * ------------------------------------------------------------------ */

function filterItem(page, labelText) {
  return page
    .locator('.batch-tasks .filter-item')
    .filter({ has: page.locator('label', { hasText: labelText }) })
    .first();
}

function statusSelectTrigger(page) {
  return filterItem(page, DOC.statusFilter).locator('.ivu-select').first();
}

function providerInput(page) {
  return page.locator('.batch-tasks').getByPlaceholder(DOC.providerPlaceholder).first();
}

function apiKeyIdInput(page) {
  return page.locator('.batch-tasks').getByPlaceholder(DOC.apiKeyIdPlaceholder).first();
}

async function getStatusFilterOptions(page) {
  await statusSelectTrigger(page).click();
  await page.waitForTimeout(200);
  const options = await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .allTextContents();
  await page.keyboard.press('Escape');
  return options.map((t) => t.trim()).filter(Boolean);
}

// 状态 Select 无 @on-change，选择后需另点「查询」才发起请求
async function selectStatusOption(page, optionLabel) {
  const select = new IvuSelectComponent(page, statusSelectTrigger(page));
  await select.selectOptionExact(optionLabel);
  await page.waitForTimeout(150);
}

async function setProviderFilter(page, value) {
  const input = providerInput(page);
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.blur();
}

async function setApiKeyIdFilter(page, value) {
  const input = apiKeyIdInput(page);
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.press('Enter');
  await input.blur();
}

async function setFilterDateTime(page, which, value) {
  const label = which === 'start' ? DOC.startTime : DOC.endTime;
  const input = filterItem(page, label).locator('input').first();
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.press('Enter');
  await page.keyboard.press('Escape');
  // 直接写入组件 data，确保 DatePicker 的 v-model 与查询参数一致
  await page.evaluate(
    ({ key, val }) => {
      const vm = document.querySelector('.batch-tasks')?.__vue__;
      if (vm && vm.filter) {
        vm.filter[key] = val;
      }
    },
    { key: which === 'start' ? 'start_time' : 'end_time', val: value },
  );
  await page.waitForTimeout(150);
}

async function clickQuery(page) {
  await closeDatePickerPanels(page);
  await page
    .locator('.batch-tasks .filter-bar')
    .getByRole('button', { name: DOC.query })
    .click({ force: true });
}

// DatePicker 浮层未关闭时，产品的 v-click-outside（mousedown.capture/click.capture，
// iview/date-picker/picker.vue:4-6 与 :366-387）会把浮层外的「第一次点击」整体吞掉
// （mousedown 与 click 双双 preventDefault + stopPropagation），「查询」按钮的 @click
// 不触发 —— 表现为点查询后后端 0 条 /batches 请求（BT-L-05 / BT-L-06 根因）。
// 实测：`fill` + `Enter` 后面板仍保持展开（Enter 被面板当作「选中当前聚焦日」，
// 焦点已不在输入框，Esc 无法经 picker 的 keydown 处理关闭），必须显式关闭后再点查询。
//
// 面板定位：本应用 `Vue.use(iView, { i18n })` 未开启 `transfer`，DatePicker 的下拉
// 就地渲染在 `.ivu-date-picker` 内（`iview/date-picker/picker.vue:34-43`），
// 以「可见的 .ivu-select-dropdown 且含 .ivu-picker-panel-body」为准
// （`.ivu-picker-panel-body-wrapper` 在 Playwright 的 `:visible` 判定下不算可见，不可用）。
function datePickerDropdown(page) {
  return page
    .locator('.ivu-select-dropdown:visible')
    .filter({ has: page.locator('.ivu-picker-panel-body') });
}

async function closeDatePickerPanels(page) {
  const panel = datePickerDropdown(page);
  // 借产品自身的 click-outside 关面板：点一次筛选栏 label（无交互）即被吞掉并关掉面板，
  // 面板全部收起后再点「查询」，这次点击才会真正触发请求。
  for (let i = 0; i < 3 && (await panel.count()) > 0; i += 1) {
    await page
      .locator('.batch-tasks .filter-bar .filter-item label')
      .first()
      .click({ force: true });
    await page.waitForTimeout(250);
  }
  await expect(panel).toHaveCount(0, { timeout: 5000 });
}

async function clickReset(page) {
  await page
    .locator('.batch-tasks .filter-bar')
    .getByRole('button', { name: DOC.reset })
    .click({ force: true });
}

async function queryWithFilters(page, { status, provider, apiKeyId, startTime, endTime } = {}) {
  if (status) {
    await setStatusFilterValue(page, status);
  }
  if (provider) {
    await setProviderFilter(page, provider);
  }
  if (apiKeyId) {
    await setApiKeyIdFilter(page, apiKeyId);
  }
  if (startTime) {
    await setFilterDateTime(page, 'start', startTime);
  }
  if (endTime) {
    await setFilterDateTime(page, 'end', endTime);
  }
  return waitForBatchTaskListResponse(page, () => clickQuery(page));
}

async function setStatusFilterValue(page, statusValue) {
  // 直接写组件 data，避免下拉交互抖动（仍需保证 Option 文案正确性由 getStatusFilterOptions 覆盖）
  await page.evaluate((val) => {
    const vm = document.querySelector('.batch-tasks')?.__vue__;
    if (vm && vm.filter) {
      vm.filter.status = val;
    }
  }, statusValue);
  await page.waitForTimeout(100);
}

/* ------------------------------------------------------------------ *
 * 游标翻页
 * ------------------------------------------------------------------ */

function prevButton(page) {
  return page
    .locator('.batch-tasks .batch-pager')
    .getByRole('button', { name: DOC.prevPage });
}

function nextButton(page) {
  return page
    .locator('.batch-tasks .batch-pager')
    .getByRole('button', { name: DOC.nextPage });
}

async function clickNextPage(page) {
  return waitForBatchTaskListResponse(page, async () => {
    await nextButton(page).click({ force: true });
  });
}

async function clickPrevPage(page) {
  return waitForBatchTaskListResponse(page, async () => {
    await prevButton(page).click({ force: true });
  });
}

async function isNextDisabled(page) {
  return nextButton(page).isDisabled();
}

async function isPrevDisabled(page) {
  return prevButton(page).isDisabled();
}

/* ------------------------------------------------------------------ *
 * 详情抽屉
 * ------------------------------------------------------------------ */

function detailDrawer(page) {
  return ivuDrawer(page).withTitle(DOC.detailTitle);
}

async function openDetailByBatchId(page, batchId) {
  return waitForBatchTaskDetailResponse(page, async () => {
    await batchTaskTable(page).rowAction(batchId, DOC.detail).click();
  });
}

async function expectDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DOC.detailTitle);
  await page.waitForTimeout(300);
}

async function closeDetailDrawer(page) {
  await ivuDrawer(page).closeByX(DOC.detailTitle);
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

async function closeDetailDrawerByMask(page) {
  await page
    .locator('.ivu-drawer-mask')
    .first()
    .click({ position: { x: 5, y: 5 }, force: true });
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

// 详情面板字段行：ul.clearFloat 的 textContent 以「<标题>:」开头
function detailRow(page, title) {
  return page
    .locator('.batch-view .panel-body ul.clearFloat')
    .filter({ hasText: new RegExp('^\\s*' + escapeRegExp(title) + '\\s*:') })
    .first();
}

function detailFieldValue(page, title) {
  return detailRow(page, title).locator('li.value');
}

async function detailFieldText(page, title) {
  return (await detailFieldValue(page, title).textContent())?.trim();
}

async function expectDetailFieldContains(page, title, value) {
  await expect(detailFieldValue(page, title)).toContainText(String(value));
}

function batchFilesTable(page) {
  return detailFieldValue(page, DOC.batchFiles).locator('table.mapping-table');
}

function batchFileRows(page) {
  return batchFilesTable(page).locator('tbody tr');
}

async function batchFilesEmpty(page) {
  return detailFieldValue(page, DOC.batchFiles).locator('span.empty-text');
}

// 详情抽屉内层宽度样式（iView 将 width 作用于 .ivu-drawer 内联样式）
async function detailDrawerWidthStyle(page) {
  const drawer = detailDrawer(page).locator('.ivu-drawer').first();
  return (await drawer.getAttribute('style')) || '';
}

// 详情字段标题行内帮助 icon 的 title 提示（无帮助 icon 返回 null）
async function detailFieldHelpTip(page, title) {
  const icon = detailRow(page, title).locator('span[title]');
  if ((await icon.count()) === 0) {
    return null;
  }
  return icon.first().getAttribute('title');
}

// 详情 5 个面板标题（基本信息 / 状态与计数 / 用量与记账 / 文件与时间 / 批量文件）
async function detailPanelHeaders(page) {
  return page.locator('.batch-view .panel .panel-header').allTextContents();
}

async function detailPanelCount(page) {
  return page.locator('.batch-view .panel').count();
}

// 「批量文件」映射表表头（去掉帮助 icon 的 '?'）
async function batchFilesHeaderTexts(page) {
  const texts = await batchFilesTable(page)
    .locator('thead th')
    .allTextContents();
  return texts.map((t) => t.replace(/[?？]\s*$/, '').replace(/\s+/g, '').trim());
}

async function batchFileRowCount(page) {
  return batchFileRows(page).count();
}

// 「批量文件」表体逐行单元格文本
async function batchFileRowTexts(page) {
  return batchFileRows(page).evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim()),
    ),
  );
}

// 全局提示（Message / Notice / Alert）文案断言
async function expectMessageContains(page, text, timeout = 10000) {
  await expect(
    page
      .locator('.ivu-message, .ivu-notice, .ivu-alert')
      .filter({ hasText: new RegExp(escapeRegExp(text)) })
      .first(),
  ).toBeVisible({ timeout });
}

/* ------------------------------------------------------------------ *
 * 取消
 * ------------------------------------------------------------------ */

async function clickCancelByBatchId(page, batchId) {
  await batchTaskTable(page).rowAction(batchId, DOC.cancel).click();
}

function confirmModal(page) {
  return page
    .locator('.ivu-modal-wrap:not(.ivu-modal-hidden)')
    .filter({ hasText: DOC.cancelConfirmTitle })
    .last();
}

async function expectCancelConfirmVisible(page, batchId) {
  const modal = confirmModal(page);
  await expect(modal).toBeVisible({ timeout: 10000 });
  await expect(modal).toContainText(DOC.cancelConfirmTitle);
  await expect(modal).toContainText('确认取消批量任务');
  await expect(modal).toContainText(batchId);
}

async function confirmCancel(page) {
  await confirmModal(page)
    .getByRole('button', { name: '确定' })
    .first()
    .click();
}

async function dismissCancel(page) {
  await confirmModal(page)
    .getByRole('button', { name: '取消' })
    .first()
    .click();
}

function cancelButton(page, batchId) {
  return batchTaskTable(page).rowAction(batchId, DOC.cancel);
}

/* ------------------------------------------------------------------ *
 * 时间工具（与 UI DatePicker 一致：yyyy-MM-dd HH:mm:ss → Unix 秒）
 * ------------------------------------------------------------------ */

function formatDateTimeValue(date) {
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes()) +
    ':' +
    pad(date.getSeconds())
  );
}

function toUnixTimestamp(value) {
  const matched = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!matched) {
    return '';
  }
  const parsed = new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(matched[4]),
    Number(matched[5]),
    Number(matched[6]),
  );
  const time = parsed.getTime();
  return isNaN(time) ? '' : Math.floor(time / 1000);
}

module.exports = {
  DOC,
  STATUS_LABELS,
  SETTLE_LABELS,
  STATUS_OPTIONS,
  COLUMN_HEADERS,
  PAGE_LIMIT,
  LIST_URL_RE,
  DETAIL_URL_RE,
  CANCEL_URL_RE,
  statusLabel,
  settleLabel,
  isTerminalStatus,
  text,
  formatBytes,
  escapeRegExp,
  gotoBatchTaskPage,
  ensureOnBatchTaskPage: gotoBatchTaskPage,
  expectBatchTaskPageReady,
  reloadBatchTaskPage,
  expectPageLayout,
  waitForBatchTaskListResponse,
  waitForBatchTaskDetailResponse,
  waitForBatchTaskCancelResponse,
  batchTaskTable,
  expectTableHeaders,
  getHeaderTexts,
  getHeaderHelpMap,
  columnTexts,
  rowCount,
  expectEmptyList,
  filterItem,
  statusSelectTrigger,
  providerInput,
  apiKeyIdInput,
  getStatusFilterOptions,
  selectStatusOption,
  setStatusFilterValue,
  setProviderFilter,
  setApiKeyIdFilter,
  setFilterDateTime,
  clickQuery,
  closeDatePickerPanels,
  clickReset,
  queryWithFilters,
  prevButton,
  nextButton,
  clickNextPage,
  clickPrevPage,
  isNextDisabled,
  isPrevDisabled,
  detailDrawer,
  openDetailByBatchId,
  expectDetailDrawerOpen,
  closeDetailDrawer,
  closeDetailDrawerByMask,
  detailRow,
  detailFieldValue,
  detailFieldText,
  expectDetailFieldContains,
  detailDrawerWidthStyle,
  detailFieldHelpTip,
  detailPanelHeaders,
  detailPanelCount,
  batchFilesTable,
  batchFileRows,
  batchFilesEmpty,
  batchFilesHeaderTexts,
  batchFileRowCount,
  batchFileRowTexts,
  expectMessageContains,
  clickCancelByBatchId,
  confirmModal,
  expectCancelConfirmVisible,
  confirmCancel,
  dismissCancel,
  cancelButton,
  formatDateTimeValue,
  toUnixTimestamp,
};