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
Object.defineProperty(exports, '__esModule', { value: true });
exports.PageTableComponent = void 0;
const test_1 = require('@playwright/test');
const ElSelect_1 = require('../element/ElSelect');
/**
 * pageTable 组件封装
 *
 * 结构：
 * - .searchTable   列头搜索行
 * - .show-iView-Table  数据表格（ivu-table）
 * - .block .expend    「全部展示/分页展示」
 * - .el-pagination    分页
 */
class PageTableComponent {
  constructor(page, root) {
    this.page = page;
    this.root = root ?? page.locator('.page-table');
  }
  rootLocator() {
    return this.root;
  }
  searchArea() {
    return this.root.locator('.searchTable');
  }
  body() {
    return this.root.locator('.show-iView-Table tbody');
  }
  headers() {
    return this.root.locator('th');
  }
  /** 兼容 VipListPage 等直接使用 tbody 的写法 */
  allRows() {
    return this.root.locator('tbody tr');
  }
  /** 数据区行（排除 searchTable 搜索行和 iView 空态行） */
  dataRows() {
    return this.root.locator('.show-iView-Table .ivu-table tbody tr:not(:has-text("暂无筛选结果"))');
  }
  rowByText(text) {
    const dataRow = this.dataRows().filter({ hasText: text }).first();
    const anyRow = this.allRows().filter({ hasText: text }).first();
    return dataRow.or(anyRow);
  }
  rowAction(rowText, buttonName) {
    return this.rowByText(rowText).getByRole('button', { name: buttonName });
  }
  searchInput(placeholder) {
    return this.searchArea().getByPlaceholder(placeholder);
  }
  expandToggleButton() {
    return this.root.getByRole('button', { name: /全部展示|分页展示/ });
  }
  pagination() {
    return this.root.locator('.el-pagination').first();
  }
  async rowCount() {
    return this.allRows().count();
  }
  async hasMultiplePages() {
    const pagination = this.pagination();
    if ((await pagination.count()) === 0) {
      return false;
    }
    return (
      (await pagination
        .getByRole('listitem')
        .filter({ hasText: '2' })
        .count()) > 0
    );
  }
  /** 当前数据是否不足以分页（默认每页 20 条） */
  async needsMoreRowsForPagination(minRows = 20) {
    const count = await this.rowCount();
    if (count > minRows) {
      return false;
    }
    return !(await this.hasMultiplePages());
  }
  async waitForLoaded(timeout = 30000) {
    const loadingMask = this.root.locator('.el-loading-mask, .ivu-spin-fix');
    if ((await loadingMask.count()) > 0) {
      await (0, test_1.expect)(loadingMask.first()).toBeHidden({ timeout });
    }
  }
  async expectHeaders(...labels) {
    for (const label of labels) {
      await (0, test_1.expect)(
        this.headers().filter({ hasText: label }).first(),
      ).toBeVisible();
    }
  }
  async expectRowVisible(text, timeout = 15000) {
    await (0, test_1.expect)(this.rowByText(text)).toBeVisible({ timeout });
  }
  async expectRowHidden(text, timeout = 15000) {
    await (0, test_1.expect)(this.rowByText(text)).toHaveCount(0, { timeout });
  }
  dataRowsByStatus(statusLabel) {
    return this.dataRows().filter({
      has: this.page.locator('.ivu-tag').getByText(statusLabel),
    });
  }
  async expectPaginationVisible() {
    const pagination = this.pagination();
    if ((await pagination.count()) > 0) {
      await (0, test_1.expect)(pagination).toBeVisible();
      return;
    }
    await (0, test_1.expect)(this.page.getByText('20条/页')).toBeVisible();
  }
  async search(keyword, placeholder = '请输入用户查询') {
    let input = this.searchInput(placeholder);
    if ((await input.count()) === 0) {
      input = this.page.getByPlaceholder(placeholder);
    }
    await input.fill(keyword);
    await input.press('Enter');
    // 等待网络请求完成（搜索通常会触发列表接口），避免固定 sleep 导致点击旧数据超时
    await this.page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => {});
    await this.page.waitForTimeout(500);
  }
  async clearSearch(placeholder = '请输入用户查询') {
    await this.search('', placeholder);
  }
  async clickPageNumber(pageNum) {
    const pagination = this.pagination();
    const pageBtn = pagination
      .getByRole('listitem')
      .filter({ hasText: String(pageNum) });
    if ((await pageBtn.count()) > 0) {
      await pageBtn.click();
      await this.page.waitForTimeout(1000);
    }
  }
  async clickNextPage() {
    const pagination = this.pagination();
    const nextBtn = pagination.locator('.btn-next');
    if ((await nextBtn.count()) > 0 && (await nextBtn.isEnabled())) {
      await nextBtn.click();
      await this.page.waitForTimeout(1000);
      return;
    }
    const enabledBtns = pagination.locator('button:not([disabled])');
    if ((await enabledBtns.count()) > 0) {
      await enabledBtns.last().click();
      await this.page.waitForTimeout(1000);
    }
  }
  async clickPreviousPage() {
    const pagination = this.pagination();
    const prevBtn = pagination.locator('.btn-prev');
    if ((await prevBtn.count()) > 0 && (await prevBtn.isEnabled())) {
      await prevBtn.click();
      await this.page.waitForTimeout(1000);
      return;
    }
    const enabledBtns = pagination.locator('button:not([disabled])');
    if ((await enabledBtns.count()) > 0) {
      await enabledBtns.first().click();
      await this.page.waitForTimeout(1000);
    }
  }
  async changePageSize(sizeText) {
    const pagination = this.pagination();
    const sizeSelect = pagination.locator('.el-pagination__sizes .el-select');
    if ((await sizeSelect.count()) > 0) {
      await new ElSelect_1.ElSelectComponent(
        this.page,
        sizeSelect,
      ).selectOption(sizeText);
    } else {
      await pagination.getByText(/\d+条\/页/).click();
      await this.page
        .locator('.el-select-dropdown__item')
        .filter({ hasText: sizeText })
        .click();
    }
    await this.page.waitForTimeout(1000);
  }
}
exports.PageTableComponent = PageTableComponent;
