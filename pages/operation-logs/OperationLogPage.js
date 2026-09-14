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
const { PageTableComponent } = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuSelectComponent,
} = require('../../components/iview');

const AUTH_PATH = path.join(__dirname, '../../auth.json');
const LIST_URL_RE = /\/open-api\/v1\/operation-logs/;

const DOC = {
  pageTitle: '操作日志',
  detailTitle: '日志详情',
  queryButton: '查询',
  detailButton: '详情',
  successTag: '成功',
  failedTag: '失败',
  resultLabel: '结果',
  errorMsgLabel: '错误信息',
  operatorUser: '用户',
  operatorToken: 'Token',
  changeSummary: '变更摘要',
  before: '变更前',
  after: '变更后',
  diffKeys: '差异字段',
};

const ACTION_COLOR_MAP = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  reset: 'orange',
  import: 'purple',
  bind: 'cyan',
  unbind: 'volcano',
};

const COLUMN_HEADERS = [
  '操作人',
  '操作动作',
  '资源类型',
  '资源名称',
  '结果',
  '操作时间',
  '操作',
];

const SEARCH_INPUT = {
  operatorName: '请输入操作人查询',
  resourceName: '请输入资源名称查询',
};

const SEARCH_SELECT = {
  action: '请选择操作动作',
  resourceType: '请选择资源类型',
  status: '请选择结果',
};

const FILTER_LABEL = {
  startTime: '起始时间',
  endTime: '结束时间',
};

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

function operationLogTable(page) {
  return new PageTableComponent(page);
}

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

async function gotoOperationLogPage(page) {
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
  await page.goto(rc.getAppBaseUrl() + '/operation-logs');
  await page.waitForLoadState('domcontentloaded');
  await ensureLocalStorageSession(page);
  await expectOperationLogPageReady(page);
}

async function expectOperationLogPageReady(page) {
  await expect(
    page.getByRole('button', { name: DOC.queryButton }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

async function expectPageLayout(page) {
  expect(page.url()).toContain('/operation-logs');
  await expect(page.locator('.filter-bar')).toBeVisible();
  await expect(
    page.locator('.filter-item label', { hasText: FILTER_LABEL.startTime }),
  ).toBeVisible();
  await expect(
    page.locator('.filter-item label', { hasText: FILTER_LABEL.endTime }),
  ).toBeVisible();
  await operationLogTable(page).expectHeaders(...COLUMN_HEADERS);
}

async function expectTableHeaders(page) {
  await operationLogTable(page).expectHeaders(...COLUMN_HEADERS);
}

async function waitForOperationLogListResponse(page, action, options = {}) {
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

function filterBarInput(page, label) {
  return page
    .locator('.filter-item')
    .filter({ has: page.locator('label', { hasText: label }) })
    .locator('input')
    .first();
}

async function setFilterDateTime(page, label, value) {
  const input = filterBarInput(page, label);
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.press('Enter');
  await input.dispatchEvent('input', { bubbles: true });
  await input.dispatchEvent('change', { bubbles: true });
  await input.blur();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function commitFilterDateTime(page, label, value) {
  await setFilterDateTime(page, label, value);
  await page.evaluate(
    ({ labelText, dateValue }) => {
      const vm = document.querySelector('.operation-logs')?.__vue__;
      if (!vm) {
        return;
      }
      const matched = dateValue.match(
        /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
      );
      const parsed = matched
        ? new Date(
            Number(matched[1]),
            Number(matched[2]) - 1,
            Number(matched[3]),
            Number(matched[4]),
            Number(matched[5]),
            Number(matched[6]),
          )
        : new Date(dateValue);
      if (labelText.includes('起始')) {
        vm.startTime = parsed;
      }
      if (labelText.includes('结束')) {
        vm.endTime = parsed;
      }
    },
    { labelText: label, dateValue: value },
  );
}

async function clickQueryButton(page) {
  const btn = page.locator('.filter-bar').getByRole('button', { name: DOC.queryButton });
  if ((await btn.count()) > 0) {
    await btn.click({ force: true });
    return;
  }
  await page.getByRole('button', { name: DOC.queryButton }).click({ force: true });
}

async function triggerListQuery(page) {
  return waitForOperationLogListResponse(page, async () => {
    const triggered = await page.evaluate(() => {
      const vm = document.querySelector('.operation-logs')?.__vue__;
      if (vm && typeof vm.onQuery === 'function') {
        vm.onQuery();
        return true;
      }
      const button = document.querySelector('.filter-bar button');
      if (button) {
        button.click();
        return true;
      }
      return false;
    });
    if (!triggered) {
      await clickQueryButton(page);
    }
  });
}

async function queryWithTimeRange(page, startValue, endValue) {
  if (startValue) {
    await commitFilterDateTime(page, FILTER_LABEL.startTime, startValue);
  }
  if (endValue) {
    await commitFilterDateTime(page, FILTER_LABEL.endTime, endValue);
  }
  return triggerListQuery(page);
}

function searchSelectTrigger(page, placeholder) {
  return operationLogTable(page)
    .searchArea()
    .locator('.ivu-select')
    .filter({
      has: page.locator('.ivu-select-placeholder').getByText(placeholder),
    })
    .first();
}

async function filterByAction(page, action) {
  const select = new IvuSelectComponent(page, searchSelectTrigger(page, SEARCH_SELECT.action));
  return waitForOperationLogListResponse(page, () =>
    select.selectOptionExact(action),
  );
}

async function filterByResourceType(page, resourceType) {
  const select = new IvuSelectComponent(
    page,
    searchSelectTrigger(page, SEARCH_SELECT.resourceType),
  );
  return waitForOperationLogListResponse(page, () =>
    select.selectOptionExact(resourceType),
  );
}

async function filterByStatus(page, statusLabel) {
  const select = new IvuSelectComponent(page, searchSelectTrigger(page, SEARCH_SELECT.status));
  return waitForOperationLogListResponse(page, () =>
    select.selectOptionExact(statusLabel),
  );
}

async function reloadOperationLogPage(page) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expectOperationLogPageReady(page);
}

async function searchInputWithBlur(page, placeholder, keyword) {
  const input = operationLogTable(page).searchInput(placeholder);
  await input.click({ clickCount: 3 });
  await input.fill(keyword);
  await input.blur();
}

async function searchByOperatorName(page, keyword) {
  return waitForOperationLogListResponse(page, () =>
    searchInputWithBlur(page, SEARCH_INPUT.operatorName, keyword),
  );
}

async function searchByResourceName(page, keyword) {
  return waitForOperationLogListResponse(page, () =>
    searchInputWithBlur(page, SEARCH_INPUT.resourceName, keyword),
  );
}

async function clearSearchByOperatorName(page) {
  return waitForOperationLogListResponse(page, () =>
    searchInputWithBlur(page, SEARCH_INPUT.operatorName, ''),
  );
}

async function clearSearchByResourceName(page) {
  return waitForOperationLogListResponse(page, () =>
    searchInputWithBlur(page, SEARCH_INPUT.resourceName, ''),
  );
}

async function clickNextPage(page) {
  const table = operationLogTable(page);
  return waitForOperationLogListResponse(page, () => table.clickNextPage());
}

async function clickPageNumber(page, pageNum) {
  const table = operationLogTable(page);
  return waitForOperationLogListResponse(page, () =>
    table.clickPageNumber(pageNum),
  );
}

async function expectPaginationPageNumbersVisible(page, ...pageNums) {
  await operationLogTable(page).expectPageNumbersVisible(...pageNums);
}

async function expectActivePaginationPage(page, pageNum) {
  await operationLogTable(page).expectActivePage(pageNum);
}

async function closeDetailDrawerByMask(page) {
  const mask = page.locator('.ivu-drawer-mask').first();
  await mask.click({ position: { x: 5, y: 5 }, force: true });
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

async function expectChangeSummaryVisible(page) {
  const drawer = detailDrawer(page);
  await expect(drawer.getByText(DOC.changeSummary)).toBeVisible();
  await expect(drawer.getByText(DOC.before)).toBeVisible();
  await expect(drawer.getByText(DOC.after)).toBeVisible();
  await expect(drawer.locator('.json-viewer-wrap').first()).toBeVisible();
}

async function getSearchSelectOptions(page, placeholder) {
  const trigger = searchSelectTrigger(page, placeholder);
  await trigger.click();
  await page.waitForTimeout(200);
  const options = await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .allTextContents();
  await page.keyboard.press('Escape');
  return options.map((t) => t.trim()).filter(Boolean);
}

async function getActionFilterOptions(page) {
  return getSearchSelectOptions(page, SEARCH_SELECT.action);
}

async function getResourceTypeFilterOptions(page) {
  return getSearchSelectOptions(page, SEARCH_SELECT.resourceType);
}

async function openDetailByRowText(page, rowText) {
  await operationLogTable(page)
    .rowAction(rowText, DOC.detailButton)
    .click();
  await page.waitForTimeout(500);
}

async function expectDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DOC.detailTitle);
}

function detailDrawer(page) {
  return ivuDrawer(page).withTitle(DOC.detailTitle);
}

async function expectDetailFieldContains(page, label, text) {
  const drawer = detailDrawer(page);
  const row = drawer.locator('.field-row').filter({ hasText: label }).first();
  await expect(row).toContainText(String(text));
}

async function expectDetailFieldNotVisible(page, label) {
  const drawer = detailDrawer(page);
  await expect(drawer.locator('.field-label', { hasText: label })).toHaveCount(0);
}

async function closeDetailDrawer(page) {
  await ivuDrawer(page).closeByX(DOC.detailTitle);
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

function formatTimestamp(ts) {
  if (!ts) {
    return '-';
  }
  const date = new Date(ts * 1000);
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

function operatorTypeLabel(type) {
  if (type === 0) {
    return DOC.operatorUser;
  }
  if (type === 1) {
    return DOC.operatorToken;
  }
  return '-';
}

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

function futureDateTimeString(offsetDays = 1) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 0);
  return {
    start: formatDateTimeValue(start),
    end: formatDateTimeValue(end),
  };
}

async function expectEmptyTable(page) {
  const table = operationLogTable(page);
  await table.waitForLoaded();
  const emptyHint = page.getByText('暂无数据').first();
  const dataRows = table.dataRows();
  const rowCount = await dataRows.count();
  if (rowCount === 0) {
    await expect(emptyHint).toBeVisible();
    return;
  }
  if (rowCount === 1) {
    await expect(dataRows.filter({ hasText: '暂无数据' })).toHaveCount(1);
    return;
  }
  const nonEmptyRows = dataRows.filter({ hasNotText: '暂无数据' });
  await expect(nonEmptyRows).toHaveCount(0);
  await expect(emptyHint).toBeVisible();
}

async function expectPaginationTotalZero(page) {
  const pagination = operationLogTable(page).pagination();
  if ((await pagination.count()) === 0) {
    return;
  }
  const totalText = pagination.getByText(/共\s*0\s*条/);
  if ((await totalText.count()) > 0) {
    await expect(totalText.first()).toBeVisible();
    return;
  }
  await expect(
    pagination.getByRole('listitem').filter({ hasText: '2' }),
  ).toHaveCount(0);
  const nextBtn = pagination.locator('.btn-next');
  if ((await nextBtn.count()) > 0) {
    await expect(nextBtn).toBeDisabled();
  }
}

async function expectActionTagColor(page, action, colorName) {
  const tag = operationLogTable(page)
    .dataRows()
    .locator(`.ivu-tag-${colorName}`)
    .filter({ hasText: action })
    .first();
  await expect(tag).toBeVisible();
}

async function expectRowFailedTag(page, rowText) {
  const row = operationLogTable(page).rowByText(rowText);
  await expect(
    row.locator('.ivu-tag-red').filter({ hasText: DOC.failedTag }).first(),
  ).toBeVisible();
}

async function expectDetailFailedStatus(page) {
  const drawer = detailDrawer(page);
  const resultRow = drawer
    .locator('.field-row')
    .filter({ hasText: DOC.resultLabel })
    .first();
  await expect(
    resultRow.locator('.ivu-tag-red').filter({ hasText: DOC.failedTag }),
  ).toBeVisible();
}

async function expectDetailErrorMsg(page, message) {
  const drawer = detailDrawer(page);
  await expect(
    drawer.locator('.field-label', { hasText: DOC.errorMsgLabel }),
  ).toBeVisible();
  await expect(drawer.locator('.error-text')).toContainText(String(message));
}

module.exports = {
  DOC,
  ACTION_COLOR_MAP,
  COLUMN_HEADERS,
  LIST_URL_RE,
  gotoOperationLogPage,
  ensureOnOperationLogPage: gotoOperationLogPage,
  expectOperationLogPageReady,
  expectPageLayout,
  expectTableHeaders,
  operationLogTable,
  waitForOperationLogListResponse,
  setFilterDateTime,
  commitFilterDateTime,
  clickQueryButton,
  triggerListQuery,
  queryWithTimeRange,
  reloadOperationLogPage,
  filterByAction,
  filterByResourceType,
  filterByStatus,
  searchByOperatorName,
  searchByResourceName,
  clearSearchByOperatorName,
  clearSearchByResourceName,
  clickNextPage,
  clickPageNumber,
  expectPaginationPageNumbersVisible,
  expectActivePaginationPage,
  getActionFilterOptions,
  getResourceTypeFilterOptions,
  openDetailByRowText,
  expectDetailDrawerOpen,
  detailDrawer,
  expectDetailFieldContains,
  expectDetailFieldNotVisible,
  closeDetailDrawer,
  closeDetailDrawerByMask,
  expectChangeSummaryVisible,
  formatTimestamp,
  formatDateTimeValue,
  futureDateTimeString,
  operatorTypeLabel,
  expectEmptyTable,
  expectPaginationTotalZero,
  expectActionTagColor,
  expectRowFailedTag,
  expectDetailFailedStatus,
  expectDetailErrorMsg,
};
