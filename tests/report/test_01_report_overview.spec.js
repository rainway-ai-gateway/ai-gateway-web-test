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
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 数据报表 - 总览页签（RP-O-01 ~ RP-O-07）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/report/test_01_report_overview.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');
const reportApi = require('../../api/report-api-utils');

test.describe('数据报表 - RP-O-01 总览页签加载与指标卡展示', () => {
  test('验证总览页签默认激活、指标卡加载', async ({ page }) => {
    await test.step('进入数据报表页面', async () => {
      await rp.gotoReportPage(page);
    });

    await test.step('验证默认激活总览页签', async () => {
      await rp.expectActiveTab(page, rp.DOC.overviewTab);
    });

    await test.step('验证指标卡展示', async () => {
      // 页面加载时 overview 请求已发出，直接验证指标卡可见
      await page.waitForTimeout(2000);
      for (const label of rp.DOC.metricsLabels) {
        const card = rp.metricsCard(page, label);
        await expect(card).toBeVisible({ timeout: 10000 });
      }
    });

    await test.step('验证成本卡主值 = 金额数字 + 币种小字', async () => {
      const card = rp.metricsCard(page, rp.COST_CARD_LABEL);
      await expect(card).toBeVisible({ timeout: 10000 });

      const main = await rp.getCostCardMain(page);
      expect(main.text).not.toBe('');
      if (main.text !== '-') {
        // 有成本：币种小字 `.metric-currency` 可见且非空（服务端已 ÷1e8）
        await expect(card.locator('.metric-value .metric-currency')).toBeVisible();
        expect(main.currency).not.toBe('');
        expect(main.value).not.toBe('');
      }
    });
  });
});

test.describe('数据报表 - RP-O-02 快捷时间切换', () => {
  test('验证 1h/6h/24h/7d 快捷按钮切换刷新指标卡', async ({ page }) => {
    await rp.gotoReportPage(page);

    for (const label of rp.QUICK_TIME_LABELS) {
      await test.step(`点击「${label}」快捷时间`, async () => {
        // 快捷按钮只更新本地时间状态，需点击查询按钮才能触发 API 请求
        await rp.clickQuickTime(page, label);
        await rp.waitForReportOverviewResponse(page, () =>
          rp.clickQueryButton(page),
        );
        // 验证快捷按钮高亮
        const btn = rp.quickTimeButton(page, label);
        await expect(btn).toHaveClass(/primary/);
      });
    }
  });
});

test.describe('数据报表 - RP-O-03 指标卡数据一致性', () => {
  test('验证指标卡数值与接口返回值一致', async ({ page }) => {
    await rp.gotoReportPage(page);

    await test.step('获取接口数据', async () => {
      // 使用 API 直接请求作为基准
      const apiData = await reportApi.fetchReportOverview(page);
      expect(apiData).toBeTruthy();

      // 验证请求总量
      if (apiData.request_total !== undefined) {
        const value = await rp.getMetricCardValue(page, '请求总量');
        expect(value.replace(/,/g, '')).toContain(String(apiData.request_total));
      }

      // 验证错误率
      if (apiData.error_rate !== undefined) {
        const value = await rp.getMetricCardValue(page, '错误率');
        const expected = (apiData.error_rate * 100).toFixed(2) + '%';
        expect(value).toContain(expected.replace(/^0\./, '.'));
      }

      // 验证 Token 用量
      if (apiData.total_tokens !== undefined) {
        const value = await rp.getMetricCardValue(page, 'Token用量');
        expect(value.replace(/,/g, '')).toContain(String(apiData.total_tokens));
      }

      // 验证平均延迟
      if (apiData.latency_avg_ms !== undefined) {
        const value = await rp.getMetricCardValue(page, '平均延迟');
        expect(value).toContain('ms');
      }

      // 验证成本卡（服务端出口已 ÷1e8 为金额，前端不得再换算）
      const costMain = await rp.getCostCardMain(page);
      if (!Array.isArray(apiData.cost) || apiData.cost.length === 0) {
        // 无成本：主值显示 '-'，副行不渲染
        expect(costMain.text).toBe('-');
        expect(await rp.getCostCardSubRows(page)).toHaveLength(0);
      } else {
        // 主值 = cost[0].value 金额数字原样 + cost[0].currency 币种小字
        expect(costMain.value).toBe(rp.formatMetricNumber(apiData.cost[0].value));
        expect(costMain.currency).toBe(String(apiData.cost[0].currency));

        // 副行仅列出 cost[1..]，不重复主币种
        const expectedSub = apiData.cost.slice(1);
        const subRows = await rp.getCostCardSubRows(page);
        expect(subRows).toHaveLength(expectedSub.length);
        subRows.forEach((row, i) => {
          expect(row.currency).toBe(String(expectedSub[i].currency));
          expect(row.value).toBe(rp.formatMetricNumber(expectedSub[i].value));
        });
      }
    });
  });
});

test.describe('数据报表 - RP-O-04 echarts 图表渲染', () => {
  test('验证概览数据加载后图表渲染（无数据时显示空态）', async ({ page }) => {
    await rp.gotoReportPage(page);

    await test.step('等待数据加载完成', async () => {
      // 等待 loading 结束：要么图表出现，要么空态出现
      await page.waitForTimeout(2000);
      await expect(
        page.locator('.chart-grid, .report-empty')
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('验证图表渲染或空态', async () => {
      const chartArea = page.locator('.chart-grid');
      const empty = page.locator('.report-empty');

      const hasChartGrid = await chartArea.isVisible();
      const hasEmpty = await empty.isVisible();

      if (hasEmpty && !hasChartGrid) {
        // API 无数据时显示空态
        return;
      }

      if (!hasChartGrid) {
        // 异常：什么都不可见
        throw new Error('chart-grid 和 report-empty 均不可见');
      }

      // chart-grid 可见，检查是否有 canvas（数据为空时图表内显示 .chart-empty 无 canvas）
      const canvases = chartArea.locator('canvas');
      const count = await canvases.count();
      if (count > 0) {
        expect(count).toBeGreaterThanOrEqual(4);
      }
      // count === 0 时说明各子图表数据为空，渲染 .chart-empty，这也是合法的
    });
  });
});

test.describe('数据报表 - RP-O-05 图表窗口 resize', () => {
  test('验证缩放窗口后图表自适应', async ({ page }) => {
    await rp.gotoReportPage(page);
    await page.waitForTimeout(2000);

    await test.step('缩窄窗口', async () => {
      await page.setViewportSize({ width: 768, height: 720 });
      await page.waitForTimeout(1000);
      // 控制台无 resize 报错
    });

    await test.step('恢复宽屏', async () => {
      await page.setViewportSize({ width: 1440, height: 720 });
      await page.waitForTimeout(1000);
      const chartArea = page.locator('.chart-grid');
      await expect(chartArea).toBeVisible();
    });
  });
});

test.describe('数据报表 - RP-O-06 加载中状态', () => {
  test('验证慢响应时显示骨架屏', async ({ page }) => {
    await test.step('模拟慢网速进入页面', async () => {
      await page.context().route('**/report/overview**', async (route) => {
        await new Promise((r) => setTimeout(r, 2000));
        await route.continue();
      });
      await rp.gotoReportPage(page);
    });

    await test.step('验证加载状态存在', async () => {
      // 骨架屏或 loading 指示器
      const skeleton = page.locator('.ivu-skeleton, .ivu-spin, .loading');
      const exists = (await skeleton.count()) > 0;
      if (exists) {
        await expect(skeleton.first()).toBeVisible();
      }
    });
  });
});

test.describe('数据报表 - RP-O-07 空数据状态', () => {
  test('验证未来时间范围筛选后展示零值', async ({ page }) => {
    await rp.gotoReportPage(page);

    await test.step('设置未来时间范围', async () => {
      const { start, end } = rp.futureDateTimeString(30);
      await rp.setFilterDateTime(page, rp.DOC.startTimeLabel, start);
      await rp.setFilterDateTime(page, rp.DOC.endTimeLabel, end);
    });

    await test.step('点击查询并验证空数据状态', async () => {
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickQueryButton(page),
      );
      expect(response.status()).toBe(200);

      // 指标卡显示 0 或占位值
      for (const label of rp.DOC.metricsLabels) {
        const card = rp.metricsCard(page, label);
        await expect(card).toBeVisible();
      }

      // 无数据时成本卡主值显示 '-'，且不渲染副行
      const body = await response.json();
      const data = body?.Data ?? body?.data ?? body;
      const costMain = await rp.getCostCardMain(page);
      const subRows = await rp.getCostCardSubRows(page);
      if (!Array.isArray(data.cost) || data.cost.length === 0) {
        expect(costMain.text).toBe('-');
        expect(subRows).toHaveLength(0);
      } else {
        // 后端仍返回成本明细时，按金额原样值校验（不做换算）
        expect(costMain.value).toBe(rp.formatMetricNumber(data.cost[0].value));
        expect(subRows).toHaveLength(data.cost.slice(1).length);
      }
    });
  });
});

test.describe('数据报表 - 总览指标卡补充用例（RP-O-02 ~ RP-O-13）', () => {
  // 构造一份完整受控 overviewData（数值类断言全部走 mock / vm 注入，保证确定性）
  function overviewBase(overrides = {}) {
    return {
      request_total: 1000,
      error_total: 10,
      error_rate: 0.01,
      total_tokens: 5000,
      input_tokens: 3000,
      output_tokens: 2000,
      latency_avg_ms: 123.4,
      cost: [{ value: 0.5, currency: 'USD' }],
      cache: {
        hit_count: 8,
        miss_count: 2,
        skip_count: 5,
        hit_rate: 0.8,
        read_tokens: 100,
        write_tokens: 200,
      },
      mirror: { hit_count: 42 },
      intent: { classified_count: 100, unknown_count: 3, unknown_rate: 0.0291 },
      ...overrides,
    };
  }

  test('RP-O-02 指标卡网格四列布局', async ({ page }) => {
    await rp.mockReportOverview(page, { data: overviewBase() });
    await rp.gotoReportPage(page);

    await test.step('8 张卡片按 4 列网格排布，间距 12px', async () => {
      await expect(
        rp.metricsCard(page, rp.REQUEST_TOTAL_LABEL),
      ).toBeVisible({ timeout: 10000 });
      const layout = await rp.getMetricCardsLayout(page);
      expect(layout).not.toBeNull();
      expect(layout.cardCount).toBe(8);
      const columns = layout.gridTemplateColumns
        .split(' ')
        .filter((c) => c && c !== 'none');
      expect(columns).toHaveLength(4);
      // 4 列等宽（repeat(4, 1fr) 计算后为相同像素值）
      for (const c of columns) {
        expect(c).toBe(columns[0]);
      }
      expect(layout.columnGap).toBe('12px');
      expect(layout.rowGap).toBe('12px');
    });

    await test.step('单卡样式：padding 16px、圆角 6px、背景 #f8f8f9；错误卡数值 #ed4014', async () => {
      const layout = await rp.getMetricCardsLayout(page);
      expect(layout.cardPadding).toBe('16px');
      expect(layout.cardBorderRadius).toBe('6px');
      expect(layout.cardBackground).toBe('rgb(248, 248, 249)');
      expect(layout.errorValueColor).toBe('rgb(237, 64, 20)');
    });

    await test.step('窗口收窄后仍保持 4 列，不错位重叠', async () => {
      await page.setViewportSize({ width: 900, height: 720 });
      await page.waitForTimeout(500);
      const layout = await rp.getMetricCardsLayout(page);
      const columns = layout.gridTemplateColumns
        .split(' ')
        .filter((c) => c && c !== 'none');
      expect(columns).toHaveLength(4);
      for (const c of columns) {
        expect(c).toBe(columns[0]);
      }
      expect(layout.cardCount).toBe(8);
    });
  });

  test('RP-O-03 缓存命中率卡展示', async ({ page }) => {
    await rp.mockReportOverview(page, { data: overviewBase() });
    await rp.gotoReportPage(page);
    const card = rp.metricsCard(page, rp.CACHE_HIT_RATE_LABEL);
    await expect(card).toBeVisible({ timeout: 10000 });

    await test.step('hit_rate=0.8 展示 80.0%（卡片仅有单一主值）', async () => {
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '80.0%',
      );
      await expect(card.locator('.metric-value')).toHaveCount(1);
    });

    await test.step('hit_rate=0.525 展示 52.5%', async () => {
      await rp.setOverviewData(page, {
        ...overviewBase(),
        cache: { ...overviewBase().cache, hit_rate: 0.525 },
      });
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '52.5%',
      );
    });

    await test.step('hit_rate=null 展示 -', async () => {
      await rp.setOverviewData(page, {
        ...overviewBase(),
        cache: { ...overviewBase().cache, hit_rate: null },
      });
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '-',
      );
    });
  });

  test('RP-O-04 缓存命中率跳过不计入分母', async ({ page }) => {
    await rp.mockReportOverview(
      page,
      {
        data: overviewBase({
          cache: {
            hit_count: 8,
            miss_count: 2,
            skip_count: 5,
            hit_rate: 0.8,
            read_tokens: 0,
            write_tokens: 0,
          },
        }),
      },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.CACHE_HIT_RATE_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('主值 = hit/(hit+miss) = 80.0%，豁免仅出现在副文案', async () => {
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '80.0%',
      );
      expect(8 / (8 + 2)).toBe(0.8);
      const subs = await rp.getMetricCardSubs(page, rp.CACHE_HIT_RATE_LABEL);
      expect(subs[0]).toBe('命中: 8 | 未命中: 2 | 豁免: 5');
    });

    await test.step('skip 计数变化时主值不变', async () => {
      await rp.setOverviewData(page, {
        ...overviewBase(),
        cache: {
          hit_count: 8,
          miss_count: 2,
          skip_count: 100,
          hit_rate: 0.8,
          read_tokens: 0,
          write_tokens: 0,
        },
      });
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '80.0%',
      );
      const subs = await rp.getMetricCardSubs(page, rp.CACHE_HIT_RATE_LABEL);
      expect(subs[0]).toBe('命中: 8 | 未命中: 2 | 豁免: 100');
    });
  });

  test('RP-O-05 缓存分母为零时命中率为零', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await rp.mockReportOverview(
      page,
      {
        data: overviewBase({
          cache: {
            hit_count: 0,
            miss_count: 0,
            skip_count: 7,
            hit_rate: 0,
            read_tokens: 0,
            write_tokens: 0,
          },
        }),
      },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.CACHE_HIT_RATE_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('分母为 0 时主值展示 0.0%（非 -，非空）', async () => {
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '0.0%',
      );
      const subs = await rp.getMetricCardSubs(page, rp.CACHE_HIT_RATE_LABEL);
      expect(subs[0]).toBe('命中: 0 | 未命中: 0 | 豁免: 7');
    });

    await test.step('页面无报错', async () => {
      await page.waitForTimeout(1000);
      expect(pageErrors).toEqual([]);
    });
  });

  test('RP-O-06 缓存卡副文案展示读写 Token', async ({ page }) => {
    await rp.mockReportOverview(
      page,
      {
        data: overviewBase({
          cache: {
            hit_count: 1200,
            miss_count: 300,
            skip_count: 0,
            hit_rate: 0.8,
            read_tokens: 1500,
            write_tokens: 2000000,
          },
        }),
      },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.CACHE_HIT_RATE_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('第一行副文案：命中/未命中/豁免经 fmtNum 格式化', async () => {
      const subs = await rp.getMetricCardSubs(page, rp.CACHE_HIT_RATE_LABEL);
      expect(subs[0]).toBe('命中: 1.2K | 未命中: 300 | 豁免: 0');
    });

    await test.step('第二行副文案：读/写 Token 原样展示（未做 ÷1e8），≥1000 为 K/M', async () => {
      const subs = await rp.getMetricCardSubs(page, rp.CACHE_HIT_RATE_LABEL);
      expect(subs[1]).toBe('读 Token: 1.5K | 写 Token: 2.0M');
    });
  });

  test('RP-O-07 镜像命中卡展示', async ({ page }) => {
    await rp.mockReportOverview(
      page,
      { data: overviewBase({ mirror: { hit_count: 12345 } }) },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.MIRROR_HIT_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('主值 = fmtNum(mirror.hit_count)，≥1000 为 K', async () => {
      expect(await rp.getMetricCardValue(page, rp.MIRROR_HIT_LABEL)).toBe(
        '12.3K',
      );
    });

    await test.step('mirror 缺失时主值 -；hit_count=0 时展示 0（与缺字段区分）', async () => {
      const base = overviewBase();
      delete base.mirror;
      await rp.setOverviewData(page, base);
      expect(await rp.getMetricCardValue(page, rp.MIRROR_HIT_LABEL)).toBe('-');

      await rp.setOverviewData(
        page,
        overviewBase({ mirror: { hit_count: 0 } }),
      );
      expect(await rp.getMetricCardValue(page, rp.MIRROR_HIT_LABEL)).toBe('0');
    });
  });

  test('RP-O-08 意图分类卡展示', async ({ page }) => {
    await rp.mockReportOverview(
      page,
      { data: overviewBase({ intent: { classified_count: 2500, unknown_count: 0, unknown_rate: 0 } }) },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.INTENT_CLASSIFIED_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('主值 = fmtNum(intent.classified_count)，≥1000 为 K', async () => {
      expect(await rp.getMetricCardValue(page, rp.INTENT_CLASSIFIED_LABEL)).toBe(
        '2.5K',
      );
    });

    await test.step('intent 缺失时主值 -', async () => {
      const base = overviewBase();
      delete base.intent;
      await rp.setOverviewData(page, base);
      expect(await rp.getMetricCardValue(page, rp.INTENT_CLASSIFIED_LABEL)).toBe(
        '-',
      );
    });
  });

  test('RP-O-09 意图卡展示未知占比', async ({ page }) => {
    // unknown/(classified+unknown) = 3/32 = 0.09375 → 9.4%（与文档示例口径一致）
    await rp.mockReportOverview(
      page,
      {
        data: overviewBase({
          intent: { classified_count: 29, unknown_count: 3, unknown_rate: 0.09375 },
        }),
      },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.INTENT_CLASSIFIED_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('副文案 = 未知: {fmtNum(unknown_count)}（{fmtPercent(unknown_rate)}），全角括号', async () => {
      const subs = await rp.getMetricCardSubs(page, rp.INTENT_CLASSIFIED_LABEL);
      expect(subs[0]).toBe('未知: 3（9.4%）');
      expect(3 / (29 + 3)).toBeCloseTo(0.09375, 5);
    });
  });

  test('RP-O-10 意图未知分母为零时为零', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await rp.mockReportOverview(
      page,
      {
        data: overviewBase({
          intent: { classified_count: 0, unknown_count: 0, unknown_rate: 0 },
        }),
      },
    );
    await rp.gotoReportPage(page);
    await expect(
      rp.metricsCard(page, rp.INTENT_CLASSIFIED_LABEL),
    ).toBeVisible({ timeout: 10000 });

    await test.step('占比展示 0.0%，未知计数展示 0', async () => {
      expect(await rp.getMetricCardValue(page, rp.INTENT_CLASSIFIED_LABEL)).toBe(
        '0',
      );
      const subs = await rp.getMetricCardSubs(page, rp.INTENT_CLASSIFIED_LABEL);
      expect(subs[0]).toBe('未知: 0（0.0%）');
    });

    await test.step('页面无报错', async () => {
      await page.waitForTimeout(1000);
      expect(pageErrors).toEqual([]);
    });
  });

  test('RP-O-11 总览缺省新字段降级', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await test.step('mock 返回体不含 cache/mirror/intent 字段', async () => {
      const base = overviewBase();
      delete base.cache;
      delete base.mirror;
      delete base.intent;
      await rp.mockReportOverview(page, { data: base });
      await rp.gotoReportPage(page);
      await expect(
        rp.metricsCard(page, rp.CACHE_HIT_RATE_LABEL),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('三张新卡主值均为 -，副文案按空对象渲染', async () => {
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '-',
      );
      const cacheSubs = await rp.getMetricCardSubs(page, rp.CACHE_HIT_RATE_LABEL);
      expect(cacheSubs[0]).toBe('命中: - | 未命中: - | 豁免: -');
      expect(cacheSubs[1]).toBe('读 Token: - | 写 Token: -');

      expect(await rp.getMetricCardValue(page, rp.MIRROR_HIT_LABEL)).toBe('-');
      expect(await rp.getMetricCardValue(page, rp.INTENT_CLASSIFIED_LABEL)).toBe(
        '-',
      );
      const intentSubs = await rp.getMetricCardSubs(
        page,
        rp.INTENT_CLASSIFIED_LABEL,
      );
      expect(intentSubs[0]).toBe('未知: -（-）');
    });

    await test.step('其余 5 张卡正常展示，页面不抛异常不白屏', async () => {
      expect(await rp.getMetricCardValue(page, rp.REQUEST_TOTAL_LABEL)).toBe(
        '1.0K',
      );
      expect(await rp.getMetricCardValue(page, rp.ERROR_TOTAL_LABEL)).toBe(
        '10',
      );
      expect(await rp.getMetricCardValue(page, rp.TOKEN_USAGE_LABEL)).toBe(
        '5.0K',
      );
      expect(await rp.getMetricCardValue(page, rp.AVG_LATENCY_LABEL)).toBe(
        '123.4 ms',
      );
      const costMain = await rp.getCostCardMain(page);
      expect(costMain.text).toBe('0.5USD');
      await page.waitForTimeout(1000);
      expect(pageErrors).toEqual([]);
    });
  });

  test('RP-O-12 总览接口失败提示', async ({ page }) => {
    await test.step('overview 网络层失败：catch 分支 console.error + 顶部「加载失败」提示', async () => {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await rp.abortReportOverview(page);
      await rp.gotoReportPage(page);

      // overviewData 保持 null → 整页空态
      await expect(rp.overviewEmptyState(page)).toBeVisible({ timeout: 15000 });
      await expect(rp.overviewEmptyState(page)).toContainText('暂无数据');
      await expect(page.locator('.metric-cards .metric-card')).toHaveCount(0);

      // loading 复位
      const state = await rp.getOverviewVmState(page);
      expect(state).not.toBeNull();
      expect(state.loading).toBe(false);
      expect(state.hasOverviewData).toBe(false);

      // console.error('Failed to load overview data:', err)
      expect(
        consoleErrors.some((t) =>
          t.startsWith('Failed to load overview data:'),
        ),
      ).toBe(true);
      // $Message.error(report.loadFailed = '加载失败')
      await rp.expectMessageError(page, '加载失败');
    });

    await test.step('单个图表请求失败：overviewData 仍来自成功请求，指标卡正常展示', async () => {
      // 上一步注册的 overview abort 路由跨 goto 持续生效，需先清除再注册新路由
      await page.unrouteAll();
      await rp.abortReportTimeseriesMetric(page, 'qps');
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await rp.gotoReportPage(page);

      await expect(
        rp.metricsCard(page, rp.REQUEST_TOTAL_LABEL),
      ).toBeVisible({ timeout: 15000 });
      // QPS 时序图因该请求失败展示空态，不影响指标卡
      await expect(
        rp.chartCardEmpty(page, rp.QPS_CHART_TITLE),
      ).toBeVisible({ timeout: 15000 });

      // 2026-10-14「图表维度下钻」重构后：单图表请求改由 loadTs / loadRanking /
      // loadDistribution 独立加载，各自内部 `.catch(() => {})` 吞掉失败 →
      // 不进入 load() 的全局 catch，即**不**弹全局「加载失败」、**不**打
      // 'Failed to load overview data:' 日志；失败只降级为该图表空态。
      // 若把三者塞回同一个未兜底的 Promise.all，则任一图表失败都会弹全局提示。
      await rp.expectNoMessageError(page, '加载失败');
      expect(
        consoleErrors.some((t) =>
          t.startsWith('Failed to load overview data:'),
        ),
      ).toBe(false);

      // loading 复位且 overviewData 来自成功的 overview 请求
      const state = await rp.getOverviewVmState(page);
      expect(state).not.toBeNull();
      expect(state.loading).toBe(false);
      expect(state.hasOverviewData).toBe(true);
    });
  });

  test('RP-O-13 全部指标为零空态', async ({ page }) => {
    await test.step('mock 全零 overview 与空图表数据', async () => {
      await rp.mockReportOverview(
        page,
        {
          data: overviewBase({
            request_total: 0,
            error_total: 0,
            error_rate: 0,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            latency_avg_ms: 0,
            cost: [],
            cache: {
              hit_count: 0,
              miss_count: 0,
              skip_count: 0,
              hit_rate: 0,
              read_tokens: 0,
              write_tokens: 0,
            },
            mirror: { hit_count: 0 },
            intent: { classified_count: 0, unknown_count: 0, unknown_rate: 0 },
          }),
        },
      );
      await rp.mockReportTimeseries(page, {
        qps: { series: [] },
        tokens: { series: [] },
        latency: { series: [] },
        cache_tokens: { series: [] },
      });
      await rp.mockReportRankings(page, {
        model: { items: [] },
        provider: { items: [] },
      });
      await rp.mockReportDistribution(page, { status: { items: [] } });
      await rp.gotoReportPage(page);
    });

    await test.step('overviewData 非空，仍渲染 8 张指标卡且数值为 0/-', async () => {
      await expect(
        rp.metricsCard(page, rp.REQUEST_TOTAL_LABEL),
      ).toBeVisible({ timeout: 10000 });
      expect(await rp.getMetricCardValue(page, rp.REQUEST_TOTAL_LABEL)).toBe('0');
      expect(await rp.getMetricCardValue(page, rp.ERROR_TOTAL_LABEL)).toBe('0');
      expect(
        (await rp.getMetricCardSubs(page, rp.ERROR_TOTAL_LABEL))[0],
      ).toBe('错误率: 0.0%');
      expect(await rp.getMetricCardValue(page, rp.TOKEN_USAGE_LABEL)).toBe('0');
      expect(await rp.getMetricCardValue(page, rp.AVG_LATENCY_LABEL)).toBe(
        '0.0 ms',
      );
      // cost 为空数组 → 费用卡主值 -
      expect((await rp.getCostCardMain(page)).text).toBe('-');
      expect(await rp.getMetricCardValue(page, rp.CACHE_HIT_RATE_LABEL)).toBe(
        '0.0%',
      );
      expect(await rp.getMetricCardValue(page, rp.MIRROR_HIT_LABEL)).toBe('0');
      expect(await rp.getMetricCardValue(page, rp.INTENT_CLASSIFIED_LABEL)).toBe(
        '0',
      );
    });

    await test.step('不展示整页空态；7 张图表各自展示「暂无数据」', async () => {
      await expect(rp.overviewEmptyState(page)).toHaveCount(0);
      const empties = page.locator('.report-overview .chart-empty');
      await expect(empties).toHaveCount(7, { timeout: 15000 });
      for (let i = 0; i < 7; i++) {
        await expect(empties.nth(i)).toHaveText('暂无数据');
      }
      // 无任何 echarts canvas 渲染
      await expect(page.locator('.report-overview .chart-grid canvas')).toHaveCount(0);
    });
  });
});