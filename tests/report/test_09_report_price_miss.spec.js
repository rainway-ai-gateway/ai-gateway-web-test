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
 * 数据报表 - 缺价列与详情缺价字段（RP-L-25 ~ RP-L-26，2026-11-03 issue #1479）
 *
 * 覆盖用例（docs/report/02-功能测试用例/04-明细新列与过滤.md）：
 * - RP-L-25 明细新增缺价列：位于「缓存」与「镜像」之间（相邻）；缺价行（ai_price_miss=true）
 *   红字（#ed4014）展示 ai_price_warn 形态中文文案，未缺价（false/null）展示 -。
 * - RP-L-26 详情抽屉缺价两项：「是否缺价 / 缺价形态」位于「缓存状态」与「镜像命中」之间；
 *   是否缺价 null → -、true/false → 是/否；缺价形态按六形态枚举映射中文，null → -。
 *
 * 数据：mock 注入受控 items（与 test_03 同法，rp.mockReportLogs），不依赖报表库数据。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/report/test_09_report_price_miss.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');

/** 构造一条最小可用的明细 fixture（仅缺价相关字段显式给出，其余字段缺省） */
function buildItem(overrides = {}) {
  return {
    logid: 1,
    log_time: 1700000000,
    ...overrides,
  };
}

async function loadMockedLogs(page, items) {
  await rp.gotoReportPage(page);
  await rp.mockReportLogs(page, { items });
  await rp.waitForReportLogsResponse(page, () =>
    rp.switchToTab(page, rp.DOC.logsTab),
  );
  await rp.reportLogsTable(page).waitForLoaded();
}

/**
 * 断言列标题相对顺序（prev 紧邻位于 next 之前，与 test_02 expectColumnOrder 同口径）
 */
async function expectColumnOrder(page, prev, next) {
  const headers = await rp.getLogsHeaderTexts(page);
  expect(headers).toContain(prev);
  expect(headers).toContain(next);
  expect(headers.indexOf(prev)).toBe(headers.indexOf(next) - 1);
}

test.describe('数据报表 - RP-L-25 明细新增缺价列', () => {
  test('验证缺价列位置、缺价行红字形态文案与未缺价占位 -', async ({ page }) => {
    const items = [
      buildItem({ logid: 1, ai_price_miss: true, ai_price_warn: 'fallback' }),
      buildItem({ logid: 2, ai_price_miss: true, ai_price_warn: 'reject' }),
      buildItem({ logid: 3, ai_price_miss: true }),
      buildItem({ logid: 4, ai_price_miss: false }),
      buildItem({ logid: 5 }),
    ];
    await loadMockedLogs(page, items);

    await test.step('「缺价」列紧邻位于「缓存」之后、「镜像」之前', async () => {
      await expectColumnOrder(page, '缓存', rp.DOC.priceMissColumn);
      await expectColumnOrder(page, rp.DOC.priceMissColumn, '镜像');
    });

    await test.step('缺价行展示形态中文文案；缺价但形态缺省 / 未缺价 / 字段缺省均为 -', async () => {
      const idx = rp.LOG_TABLE_COLUMNS_15.indexOf(rp.DOC.priceMissColumn);
      expect(idx).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < items.length; i++) {
        const cells = await rp.getLogsRowCellTexts(page, i);
        const expected =
          i === 0
            ? rp.DOC.priceWarnTexts.fallback
            : i === 1
              ? rp.DOC.priceWarnTexts.reject
              : '-';
        expect(cells[idx], `第 ${i + 1} 行缺价列`).toBe(expected);
      }
    });

    await test.step('缺价行文案为红色 #ed4014，未缺价行无特殊颜色', async () => {
      const idx = rp.LOG_TABLE_COLUMNS_15.indexOf(rp.DOC.priceMissColumn);
      const redSpan = rp
        .reportLogsTable(page)
        .dataRows()
        .nth(0)
        .locator('td')
        .nth(idx)
        .locator('span')
        .first();
      await expect(redSpan).toHaveCSS('color', 'rgb(237, 64, 20)');
      const plainCell = rp
        .reportLogsTable(page)
        .dataRows()
        .nth(3)
        .locator('td')
        .nth(idx);
      await expect(plainCell).toHaveText('-');
    });
  });
});

test.describe('数据报表 - RP-L-26 详情抽屉缺价两项', () => {
  test('验证「是否缺价 / 缺价形态」位置与展示口径（null/false/true × 六形态枚举）', async ({
    page,
  }) => {
    const items = [
      buildItem({ logid: 1, ai_price_miss: true, ai_price_warn: 'fallback' }),
      buildItem({ logid: 2, ai_price_miss: false, ai_price_warn: null }),
      buildItem({ logid: 3 }),
      buildItem({ logid: 4, ai_price_miss: true, ai_price_warn: 'no_model_table' }),
    ];
    await loadMockedLogs(page, items);

    await test.step('两字段项位于「缓存状态」与「镜像命中」之间', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await rp.expectDetailDrawerOpen(page);
      const labels = await rp.getDetailFieldLabels(page);
      const idxCache = labels.indexOf('缓存状态');
      const idxMiss = labels.indexOf('是否缺价');
      const idxWarn = labels.indexOf('缺价形态');
      const idxMirror = labels.indexOf('镜像命中');
      expect(idxCache).toBeGreaterThanOrEqual(0);
      expect(idxMiss).toBe(idxCache + 1);
      expect(idxWarn).toBe(idxCache + 2);
      expect(idxMirror).toBe(idxCache + 3);
    });

    await test.step('是否缺价：true→是 / false→否 / null→-；缺价形态：枚举映射中文 / null→-', async () => {
      const cases = [
        { row: 0, miss: '是', warn: rp.DOC.priceWarnTexts.fallback },
        { row: 1, miss: '否', warn: '-' },
        { row: 2, miss: '-', warn: '-' },
        { row: 3, miss: '是', warn: rp.DOC.priceWarnTexts.no_model_table },
      ];
      for (const c of cases) {
        if (c.row > 0) {
          await rp.closeDetailDrawer(page);
          await rp.openDetailByRowIndex(page, c.row);
        }
        await rp.expectDetailFieldValue(page, '是否缺价', c.miss);
        await rp.expectDetailFieldValue(page, '缺价形态', c.warn);
      }
    });
  });
});
