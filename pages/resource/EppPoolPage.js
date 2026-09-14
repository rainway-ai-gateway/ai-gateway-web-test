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
const { expect } = require('@playwright/test');
const { IvuDrawerComponent } = require('../../components/iview');
const { PageTableComponent } = require('../../components/layout');
const { waitAfterResourceMutation } = require('./ResourcePageCommon');

const DRAWER_TITLE = {
  manualOverride: '手动覆写',
};

/**
 * 定位 EPP 调度页面容器
 */
function eppPoolPage(page) {
  return page.locator('.epp-pool-page, .epp-module');
}

/**
 * 导航到 EPP 调度页面（通过侧栏或直连 URL）
 */
async function gotoEppPoolPage(page) {
  const sidebar = page.locator('.bfe-sidebar, .app-sidebar');
  const eppMenuItem = sidebar.getByText('EPP调度');
  if (await eppMenuItem.isVisible().catch(() => false)) {
    await eppMenuItem.click();
    await page.waitForLoadState('domcontentloaded');
    return;
  }
  // Fallback: direct URL
  await page.goto(page.url().replace(/\/[^/]*$/, '') + '/epp.html');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * 获取 EPP 实例池树形表格行数（组数）
 */
async function getPoolGroupCount(page) {
  const rows = page.locator(
    '.epp-pool-table tbody tr, .pool-tree-table tbody tr',
  );
  return rows.count();
}

/**
 * 点击编辑按钮进入编辑模式
 */
async function clickEditPool(page) {
  await page.getByRole('button', { name: '编辑' }).click();
  await waitAfterResourceMutation(page, 300);
}

/**
 * 点击保存按钮提交编辑
 */
async function clickSavePool(page) {
  await page.getByRole('button', { name: '保存' }).click();
  await waitAfterResourceMutation(page, 500);
}

/**
 * 点击取消按钮还原编辑
 */
async function clickCancelPool(page) {
  await page.getByRole('button', { name: '取消' }).click();
  await waitAfterResourceMutation(page, 500);
}

/**
 * 获取编辑模式下实例的输入值
 */
async function getEditableInstanceValues(page, groupIndex, instanceIndex) {
  const groupRows = page.locator(
    '.epp-pool-table tbody tr, .pool-tree-table tbody tr',
  );
  return {};
}

/**
 * 切换到指定页签
 * @param {object} page Playwright page
 * @param {string} tabName 页签名称，'EPP 实例池' 或 'EPP 调度分配'
 */
async function switchTab(page, tabName) {
  const tab = page
    .locator('.ivu-tabs-tab, .el-tabs__item, .tabs-tab')
    .filter({ hasText: tabName });
  await tab.click();
  await waitAfterResourceMutation(page, 300);
}

/**
 * 获取分配视图表格组件
 */
function assignmentsTable(page) {
  return new PageTableComponent(
    page,
    page.locator('.assignments-table, .epp-assignments-table, .page-table').first(),
  );
}

/**
 * 获取统计区域文本
 */
async function getStatsText(page) {
  const stats = page.locator('.stats-area, .summary-stats, .epp-stats').first();
  return (await stats.textContent()).trim();
}

module.exports = {
  DRAWER_TITLE,
  eppPoolPage,
  gotoEppPoolPage,
  getPoolGroupCount,
  clickEditPool,
  clickSavePool,
  clickCancelPool,
  getEditableInstanceValues,
  switchTab,
  assignmentsTable,
  getStatsText,
};