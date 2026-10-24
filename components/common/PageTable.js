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
 * - .searchTable   列头搜索行（searchable 列为搜索控件）
 * - .show-iView-Table  数据表格（ivu-table）
 * - .el-pagination    分页（前端分页，默认 20 条/页；产品已下线「全部展示/分页展示」控件）
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
    return this.root.locator('.show-iView-Table .ivu-table tbody tr:not(:has-text("暂无筛选结果")):not(:has-text("暂无数据"))');
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
  /** 搜索行内指定列标题的输入框（placeholder = 请输入{title}查询） */
  searchInputByTitle(title) {
    return this.searchArea().locator('input[placeholder*="' + title + '"]').first();
  }
  /** 读取搜索行内指定列标题输入框的当前值 */
  async columnSearchValue(title) {
    return this.searchInputByTitle(title).inputValue();
  }
  /**
   * 按列标题做本地筛选（serverPagination=false 时为纯前端筛选，不触发列表请求）
   *
   * iView(3.5.4) Input 在 input 事件上就 emit on-change（handleInput），fill 已能生效；
   * 仍统一补一次 blur，让筛选行输入框失焦、与手工操作一致，避免调用方各自补 blur
   * （如 ProviderPage.filterListSearch + spec 侧包装）。
   */
  async filterByColumn(title, keyword) {
    const input = this.searchInputByTitle(title);
    await (0, test_1.expect)(input).toBeVisible({ timeout: 10000 });
    await input.click({ clickCount: 3 });
    await input.fill(String(keyword));
    await input.blur();
    await this.page.waitForTimeout(300);
  }
  /**
   * 按 placeholder 定位列筛选输入框做本地筛选（与 filterByColumn 同语义，
   * 只是以 placeholder 而非列标题文案定位）
   */
  async filterByPlaceholder(placeholder, keyword) {
    const input = this.searchInput(placeholder);
    await (0, test_1.expect)(input).toBeVisible({ timeout: 10000 });
    await input.click({ clickCount: 3 });
    await input.fill(String(keyword));
    await input.blur();
    await this.page.waitForTimeout(300);
  }
  /** 分页器页码数量（前端分页下用于断言筛选结果 / 全量数据的分页状态） */
  async pageNumberCount() {
    return this.pagination().locator('.el-pager li.number').count();
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
    try {
      await (0, test_1.expect)(this.rowByText(text)).toBeVisible({ timeout });
    } catch (error) {
      try {
        error.message += await this.describeRowLookupFailure(text);
      } catch (diagnoseError) {
        // 诊断补充失败不影响原始断言错误
      }
      throw error;
    }
  }
  /**
   * 行定位失败时的现场补充：rowByText 用 .or() 联合两个 locator，
   * 两侧都无命中时错误信息里看不出「筛选已丢失 / 行在其它页」还是「行真的不存在」。
   * 这里补出当前列筛选行实际生效的值、当前页行数与表格空态文本。
   */
  async describeRowLookupFailure(text) {
    const applied = [];
    const inputs = this.searchArea().locator('input');
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const value = await input.inputValue({ timeout: 2000 }).catch(() => '');
      if (!value) {
        continue;
      }
      const placeholder =
        (await input.getAttribute('placeholder', { timeout: 2000 })) || '';
      applied.push(placeholder + '=' + value);
    }
    const dataRowCount = await this.dataRows().count();
    const anyRowCount = await this.allRows().count();
    let emptyState = '';
    const tip = this.root.locator('.ivu-table-tip');
    if ((await tip.count()) > 0) {
      emptyState = (
        (await tip
          .first()
          .textContent({ timeout: 2000 })
          .catch(() => '')) || ''
      )
        .replace(/\s+/g, ' ')
        .trim();
    }
    return (
      '\n\n[PageTable 诊断] 未找到行「' +
      text +
      '」：列筛选行当前生效值 = [' +
      (applied.length
        ? applied.join(', ')
        : '无（筛选未生效，或已被列表刷新清空）') +
      ']；当前页数据行 = ' +
      dataRowCount +
      '，tbody tr = ' +
      anyRowCount +
      '；表格空态文本 = "' +
      emptyState +
      '"'
    );
  }
  async expectRowHidden(text, timeout = 15000) {
    await (0, test_1.expect)(this.rowByText(text)).toHaveCount(0, { timeout });
  }
  /**
   * 断言某行可见（分页无关）：先按「名称」本地筛选再断言行可见
   *
   * 前端分页默认 20 条/页，表格只渲染当前页；造数产生的新行若排在靠后位置
   * （第 2/3 页），直接断言「当前页可见」必然超时。先按唯一名称筛选，
   * 使目标行成为筛选结果的第 1 页，可与数据总量 / 排列顺序解耦。
   */
  async expectRowVisibleByName(name, timeout = 15000) {
    await this.filterByColumn('名称', name);
    await this.expectRowVisible(name, timeout);
  }
  /**
   * 按列筛选 + 断言行可见（自愈版）：把「筛选」与「断言行可见」作为一个可重试整体
   *
   * pageTable 在 tableData 刷新时会**清空所有列筛选**（pageTable.vue 的 tableData watcher
   * 「Clear search conditions when external data is refreshed」把 searchMessage 与各列
   * searchValue 一并重置，iView Input 的 value watcher 随即把输入框也清空）。因此
   * 「先筛选、再断言行可见」在**列表首屏请求晚于筛选输入返回**时必然失败：筛选被静默
   * 清空，表格退回未筛选的第 1 页；目标行若不在第 1 页，表现就是 element(s) not found
   * 超时，且失败现场看不到「筛选丢了」的线索（输入框是空的）。
   *
   * 重试整体即可在筛选被清空时重新筛选；断言强度不变（仍要求在 timeout 内行可见）。
   */
  async expectRowVisibleByPlaceholder(placeholder, keyword, timeout = 15000) {
    await (0, test_1.expect)(async () => {
      await this.filterByPlaceholder(placeholder, keyword);
      await (0, test_1.expect)(this.rowByText(keyword)).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout, intervals: [500, 1000, 2000] });
  }
  /**
   * 断言某行不可见（分页无关）：先按「名称」本地筛选再断言计数为 0
   *
   * 不做筛选时「行不在当前页」与「行已消失」不可区分，会造成假通过。
   */
  async expectRowHiddenByName(name, timeout = 15000) {
    await this.filterByColumn('名称', name);
    await this.expectRowHidden(name, timeout);
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
  pageNumber(pageNum) {
    return this.pagination().locator('li.number').filter({
      hasText: String(pageNum),
    }).first();
  }
  async expectPageNumberVisible(pageNum) {
    await (0, test_1.expect)(this.pageNumber(pageNum)).toBeVisible();
  }
  async expectPageNumbersVisible(...pageNums) {
    for (const pageNum of pageNums) {
      await this.expectPageNumberVisible(pageNum);
    }
  }
  async expectActivePage(pageNum) {
    const active = this.pagination().locator('li.number.active');
    await (0, test_1.expect)(active).toHaveText(String(pageNum));
  }
  async clickPageNumber(pageNum) {
    const pageBtn = this.pageNumber(pageNum);
    await (0, test_1.expect)(pageBtn).toBeVisible();
    await pageBtn.click();
    await this.page.waitForTimeout(1000);
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
