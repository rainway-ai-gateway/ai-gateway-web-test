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
 * 数据报表 - 详情 Drawer（RP-D-01 ~ RP-D-04）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/report/test_03_report_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');
const reportApi = require('../../api/report-api-utils');

test.describe('数据报表 - RP-D-01 打开详情 Drawer', () => {
  test('验证点击详情打开右侧 Drawer', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    const table = rp.reportLogsTable(page);
    await table.waitForLoaded();
    const rows = table.dataRows();
    const count = await rows.count();

    if (count === 0) {
      test.skip(true, '当前环境无报表日志数据');
    }

    await test.step('点击第一行的详情按钮', async () => {
      const detailBtn = rows.first().getByRole('button', {
        name: rp.DOC.detailButton,
      });
      await detailBtn.click();
      await rp.expectDetailDrawerOpen(page);
    });

    await test.step('关闭详情 Drawer', async () => {
      await rp.closeDetailDrawer(page);
    });
  });
});

test.describe('数据报表 - RP-D-02 详情字段完整性', () => {
  test('验证详情 Drawer 展示基础字段', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    const table = rp.reportLogsTable(page);
    await table.waitForLoaded();
    const rows = table.dataRows();
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, '当前环境无报表日志数据');
    }

    // 直接点击第一行的详情按钮（表格中不显示 logid，不能按 logid 查找行）
    const detailBtn = rows.first().getByRole('button', {
      name: rp.DOC.detailButton,
    });
    await detailBtn.click();
    await rp.expectDetailDrawerOpen(page);

    await test.step('验证基础字段存在', async () => {
      // 检查 Drawer 中有 detail-item 元素渲染
      const drawer = rp.detailDrawer(page);
      const items = drawer.locator('.detail-item');
      const itemCount = await items.count();
      expect(itemCount).toBeGreaterThanOrEqual(4);
    });

    await rp.closeDetailDrawer(page);
  });
});

test.describe('数据报表 - RP-D-03 JSON 字段折叠展开', () => {
  test('验证 JSON 字段可折叠展开', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    const table = rp.reportLogsTable(page);
    await table.waitForLoaded();
    const rows = table.dataRows();
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, '当前环境无报表日志数据');
    }

    // 先查 API 是否有含 JSON 字段的日志
    const now = Math.floor(Date.now() / 1000);
    const allData = await reportApi.fetchReportLogs(page, {
      start: now - 86400,
      end: now + 3600,
      page_size: 50,
    });
    const hasJsonFields = allData.list.some(
      (item) =>
        item.req_headers ||
        item.res_headers ||
        item.ai_rate_limit_hits ||
        item.ai_auth_reject_quota_plans,
    );

    if (!hasJsonFields) {
      test.skip(true, '当前环境无含 JSON 字段的日志');
    }

    // 打开第一行详情
    const detailBtn = rows.first().getByRole('button', {
      name: rp.DOC.detailButton,
    });
    await detailBtn.click();
    await rp.expectDetailDrawerOpen(page);

    await test.step('验证 JSON 折叠展开', async () => {
      const drawer = rp.detailDrawer(page);
      const jsonSections = drawer.locator('.detail-json-item');
      const jsonCount = await jsonSections.count();

      if (jsonCount > 0) {
        // 对每个 JSON 字段验证可折叠展开
        for (let i = 0; i < Math.min(jsonCount, 2); i++) {
          const section = jsonSections.nth(i);
          // 点击展开按钮（箭头图标）
          const toggleBtn = section.locator('.ivu-icon').first();
          if ((await toggleBtn.count()) > 0) {
            await toggleBtn.click();
            await page.waitForTimeout(200);
            // 展开后应有 pre 内容
            await expect(section.locator('.detail-json-content pre').first()).toBeVisible();
            // 再次点击折叠
            await toggleBtn.click();
            await page.waitForTimeout(200);
          }
        }
      }
    });

    await rp.closeDetailDrawer(page);
  });
});

test.describe('数据报表 - RP-D-04 关闭详情 Drawer', () => {
  test('验证 X 按钮关闭，遮罩点击不关闭（maskClosable=false）', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    const table = rp.reportLogsTable(page);
    await table.waitForLoaded();
    const rows = table.dataRows();
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, '当前环境无报表日志数据');
    }

    await test.step('X 按钮关闭', async () => {
      const detailBtn = rows.first().getByRole('button', {
        name: rp.DOC.detailButton,
      });
      await detailBtn.click();
      await rp.expectDetailDrawerOpen(page);
      await rp.closeDetailDrawer(page);
    });

    await test.step('遮罩点击不关闭（maskClosable=false）', async () => {
      const detailBtn = rows.first().getByRole('button', {
        name: rp.DOC.detailButton,
      });
      await detailBtn.click();
      await rp.expectDetailDrawerOpen(page);
      await rp.closeDetailDrawerByMask(page);
    });
  });
});