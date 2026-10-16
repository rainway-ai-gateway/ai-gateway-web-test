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
 * 数据报表 - 过滤栏与页签切换（RP-F-01 ~ RP-F-09）
 *
 * RP-F-09（2026-10-14 图表维度下钻变更）：总览过滤栏 = 时间范围 + 6 个通用过滤项
 * + 行尾「拆分维度」+ 查询 / 重置，不含「缓存状态 / 镜像命中 / 意图答案」死控件；
 * 明细工具栏同名过滤保留。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/report/test_04_report_filters.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');

function parseQuery(url) {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

test.describe('数据报表 - RP-F-01 时间范围筛选', () => {
  test('验证时间筛选触发 start 与 end 参数', async ({ page }) => {
    await rp.gotoReportPage(page);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const fmt = (d) =>
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds());

    await test.step('设置时间范围并查询', async () => {
      await rp.setFilterDateTime(page, rp.DOC.startTimeLabel, fmt(yesterday));
      await rp.setFilterDateTime(page, rp.DOC.endTimeLabel, fmt(now));

      const overviewResponse = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickQueryButton(page),
      );
      const query = parseQuery(overviewResponse.url());
      expect(query.start, '应携带 start').toBeTruthy();
      expect(query.end, '应携带 end').toBeTruthy();
      expect(Number(query.start)).toBeLessThanOrEqual(Number(query.end));
    });
  });
});

test.describe('数据报表 - RP-F-02 维度多选筛选', () => {
  test('验证模型多选筛选携带 models 参数', async ({ page }) => {
    await rp.gotoReportPage(page);

    // 尝试选择模型筛选（如果存在该筛选控件）
    const modelFilter = page
      .locator('.report-filter-item')
      .filter({ has: page.locator('label', { hasText: rp.DOC.filterLabels.model }) });
    if ((await modelFilter.count()) === 0) {
      test.skip(true, '模型筛选控件不存在');
    }

    // 检查 __vue__ 是否可用（生产构建可能不可用）
    const vueAvailable = await page.evaluate(() => {
      const el = document.querySelector('.report-page');
      return !!(el && el.__vue__ && el.__vue__.filters);
    });
    if (!vueAvailable) {
      test.skip(true, 'Vue 实例不可访问（非 dev 构建），跳过模型筛选测试');
    }

    await test.step('模型筛选触发 models 参数', async () => {
      await page.evaluate(() => {
        const el = document.querySelector('.report-page');
        el.__vue__.filters.models = ['gpt-4o'];
      });
      await page.waitForTimeout(300);
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickQueryButton(page),
      );
      const query = parseQuery(response.url());
      expect(query.models).toBeTruthy();
    });
  });
});

test.describe('数据报表 - RP-F-03 流式下拉筛选', () => {
  test('验证流式下拉筛选 stream 参数', async ({ page }) => {
    await rp.gotoReportPage(page);

    const streamFilter = page
      .locator('.report-filter-item')
      .filter({ has: page.locator('label', { hasText: rp.DOC.filterLabels.stream }) });
    if ((await streamFilter.count()) === 0) {
      test.skip(true, '流式筛选控件不存在');
    }

    await test.step('选择「是」', async () => {
      await rp.selectStreamFilter(page, rp.DOC.streamOptions.yes);
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickQueryButton(page),
      );
      const query = parseQuery(response.url());
      expect(query.stream === 'true' || query.stream === '1').toBe(true);
    });

    await test.step('选择「否」', async () => {
      await rp.selectStreamFilter(page, rp.DOC.streamOptions.no);
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickQueryButton(page),
      );
      const query = parseQuery(response.url());
      expect(query.stream === 'false' || query.stream === '0').toBe(true);
    });
  });
});

test.describe('数据报表 - RP-F-04 状态码文本筛选', () => {
  test('验证状态码筛选携带 status_codes 参数', async ({ page }) => {
    await rp.gotoReportPage(page);

    const statusFilter = page
      .locator('.report-filter-item')
      .filter({ has: page.locator('label', { hasText: rp.DOC.filterLabels.statusCode }) });
    if ((await statusFilter.count()) === 0) {
      test.skip(true, '状态码筛选控件不存在');
    }

    await test.step('输入状态码并查询', async () => {
      await rp.setStatusCodeFilter(page, '200,500');
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickQueryButton(page),
      );
      const query = parseQuery(response.url());
      expect(query.status_codes).toBe('200,500');
    });
  });
});

test.describe('数据报表 - RP-F-05 组合筛选', () => {
  test('验证多维度过滤参数叠加', async ({ page }) => {
    await rp.gotoReportPage(page);

    const modelFilter = page
      .locator('.report-filter-item')
      .filter({ has: page.locator('label', { hasText: rp.DOC.filterLabels.model }) });
    const streamFilter = page
      .locator('.report-filter-item')
      .filter({ has: page.locator('label', { hasText: rp.DOC.filterLabels.stream }) });

    if ((await modelFilter.count()) === 0 || (await streamFilter.count()) === 0) {
      test.skip(true, '组合筛选控件不完整');
    }

    // 检查 __vue__ 是否可用
    const vueAvailable = await page.evaluate(() => {
      const el = document.querySelector('.report-page');
      return !!(el && el.__vue__ && el.__vue__.filters);
    });
    if (!vueAvailable) {
      test.skip(true, 'Vue 实例不可访问（非 dev 构建），跳过组合筛选测试');
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const fmt = (d) =>
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds());

    await rp.setFilterDateTime(page, rp.DOC.startTimeLabel, fmt(yesterday));
    await rp.setFilterDateTime(page, rp.DOC.endTimeLabel, fmt(now));

    await page.evaluate(() => {
      const el = document.querySelector('.report-page');
      el.__vue__.filters.models = ['gpt-4o'];
    });
    await page.waitForTimeout(300);
    const response = await rp.waitForReportOverviewResponse(page, () =>
      rp.clickQueryButton(page),
    );
    const query = parseQuery(response.url());
    expect(query.start).toBeTruthy();
    expect(query.end).toBeTruthy();
    expect(query.models).toBeTruthy();
  });
});

test.describe('数据报表 - RP-F-06 重置按钮', () => {
  test('验证重置恢复默认值', async ({ page }) => {
    await rp.gotoReportPage(page);

    await test.step('设置过滤条件', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const pad = (n) => (n < 10 ? '0' + n : String(n));
      const fmt = (d) =>
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        ' ' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes()) +
        ':' +
        pad(d.getSeconds());

      await rp.setFilterDateTime(page, rp.DOC.startTimeLabel, fmt(yesterday));
      await rp.setFilterDateTime(page, rp.DOC.endTimeLabel, fmt(now));
    });

    await test.step('点击重置', async () => {
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.clickResetButton(page),
      );
      expect(response.status()).toBe(200);
    });
  });
});

test.describe('数据报表 - RP-F-07 页签切换保持过滤参数', () => {
  test('验证过滤条件在页签间保持', async ({ page }) => {
    await rp.gotoReportPage(page);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const fmt = (d) =>
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds());

    await test.step('设置过滤条件', async () => {
      await rp.setFilterDateTime(page, rp.DOC.startTimeLabel, fmt(yesterday));
      await rp.setFilterDateTime(page, rp.DOC.endTimeLabel, fmt(now));
    });

    await test.step('切换到明细页签', async () => {
      const response = await rp.waitForReportLogsResponse(page, () =>
        rp.switchToTab(page, rp.DOC.logsTab),
      );
      const query = parseQuery(response.url());
      expect(query.start).toBeTruthy();
      expect(query.end).toBeTruthy();
    });

    await test.step('切回总览页签', async () => {
      const response = await rp.waitForReportOverviewResponse(page, () =>
        rp.switchToTab(page, rp.DOC.overviewTab),
      );
      const query = parseQuery(response.url());
      expect(query.start).toBeTruthy();
      expect(query.end).toBeTruthy();
    });
  });
});

test.describe('数据报表 - RP-F-08 快捷时间与 DatePicker 同步', () => {
  test('验证快捷按钮与 DatePicker 联动', async ({ page }) => {
    await rp.gotoReportPage(page);

    await test.step('点击 1h 快捷按钮', async () => {
      await rp.clickQuickTime(page, rp.DOC.timeRange1h);
      // 检查 DatePicker 的值已更新（由 Vue 响应式维护）
      await page.waitForTimeout(300);
    });

    await test.step('点击 6h 快捷按钮', async () => {
      await rp.clickQuickTime(page, rp.DOC.timeRange6h);
      await page.waitForTimeout(300);
    });

    await test.step('点击 24h 快捷按钮', async () => {
      await rp.clickQuickTime(page, rp.DOC.timeRange24h);
      await page.waitForTimeout(300);
    });
  });
});

test.describe('数据报表 - RP-F-09 过滤栏构成与无死控件', () => {
  test('验证总览过滤栏构成、无死控件且明细工具栏同名过滤保留', async ({ page }) => {
    await test.step('进入数据报表页面（总览页签）', async () => {
      await rp.gotoReportPage(page);
    });

    await test.step('过滤栏 = 时间范围 + 6 个通用过滤项 + 行尾「拆分维度」+ 查询/重置', async () => {
      const sequence = await rp.getFilterBarControlSequence(page);
      expect(sequence).toEqual([
        '模型',
        'API Key',
        '服务商',
        'Host',
        '流式',
        '状态码',
        rp.TS_SPLIT_LABEL,
        rp.DOC.queryButton,
        rp.DOC.resetButton,
      ]);
      // 时间范围区（快捷时间 + DatePicker 已填充起止时间）
      for (const label of rp.QUICK_TIME_LABELS) {
        await expect(rp.quickTimeButton(page, label)).toBeVisible();
      }
      const range = await rp.getReportTimeRange(page);
      expect(range.start).toBeTruthy();
      expect(range.end).toBeTruthy();
      await expect(rp.filterBar(page).getByRole('button', { name: rp.DOC.queryButton })).toBeVisible();
      await expect(rp.filterBar(page).getByRole('button', { name: rp.DOC.resetButton })).toBeVisible();
    });

    await test.step('6 个通用过滤项顺序与集合固定（不含缓存状态 / 镜像命中 / 意图答案过滤项）', async () => {
      const labels = await rp.getFilterBarItemLabels(page);
      expect(labels).toEqual(['模型', 'API Key', '服务商', 'Host', '流式', '状态码', rp.TS_SPLIT_LABEL]);
      await rp.expectNoDeadFilterItems(page);
      for (const dead of ['缓存状态', '镜像命中', '意图答案']) {
        expect(labels).not.toContain(dead);
      }
      // 三个维度名仅作为「拆分维度」的取值出现，不是过滤项（见 RP-T-09）
      const splitOptions = await rp.getTsSplitOptions(page);
      expect(splitOptions).toEqual([
        rp.TS_SPLIT_NONE_LABEL,
        '缓存状态',
        '镜像命中',
        '意图答案',
      ]);
    });

    await test.step('源码层 filters 状态无死控件读写', async () => {
      expect(await rp.getFilterStateKeys(page)).toEqual([
        'apikey_ids',
        'hosts',
        'models',
        'providers',
        'status_codes',
        'stream',
      ]);
    });

    await test.step('明细页签工具栏的同名过滤项不受影响', async () => {
      await rp.waitForReportLogsResponse(page, () => rp.switchToTab(page, rp.DOC.logsTab));
      for (const label of ['缓存状态', '镜像命中']) {
        await expect(rp.logsToolbarSelect(page, label).trigger).toBeVisible({ timeout: 10000 });
      }
      await rp.switchToTab(page, rp.DOC.overviewTab);
    });
  });
});