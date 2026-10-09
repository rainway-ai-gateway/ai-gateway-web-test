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
 * 数据报表 - 时序与缓存 Token（RP-T-01 ~ RP-T-08）
 *
 * 断言策略：ECharts 渲染在 canvas 中，直接断言图表卡标题/空态/图例 DOM，
 * 并通过页面 Vue 实例（ReportOverview.cacheTokensOption）与 Echarts 实例
 * （legend.selected）读取 option 快照做确定性断言。
 * mock 优先：report/timeseries 按 metric 分发 mock，其余请求照常放行。
 *
 * 运行：npx playwright test tests/report/test_05_report_timeseries_cache_tokens.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');

const KIND_READ = 'cache_read';
const KIND_WRITE = 'cache_write';

// 以当前分钟对齐的时间桶（unix 秒），模拟近 1 小时窗口（bucket_sec=60）
function baseTime() {
  return Math.floor(Date.now() / 60000) * 60 - 360;
}

function point(time, kind, value) {
  return { time, kind, value };
}

// 双 kind 完整数据（3 个时间桶，乱序注入，覆盖 RP-T-04 去重排序场景）
function dualKindSeries() {
  const t0 = baseTime();
  return [
    point(t0 + 120, KIND_READ, 30),
    point(t0, KIND_READ, 10),
    point(t0 + 60, KIND_WRITE, 55),
    point(t0, KIND_WRITE, 20),
    point(t0 + 60, KIND_READ, 40),
    point(t0 + 120, KIND_WRITE, 60),
  ];
}

async function gotoWithCacheTokensMock(page, series, options = {}) {
  await rp.mockCacheTokensTimeseries(page, { series, ...options });
  await rp.gotoReportPage(page);
  await rp.waitForCacheTokensChart(page, {
    expectEmpty: Array.isArray(series) && series.length === 0,
  });
}

test.describe('数据报表 - 时序与缓存 Token', () => {
  test('RP-T-01 缓存 Token 时序图渲染', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await test.step('mock 双 kind 数据并进入总览页', async () => {
      await gotoWithCacheTokensMock(page, dualKindSeries());
    });

    await test.step('图表卡标题正确', async () => {
      await rp.expectCacheTokensChartTitle(page);
    });

    await test.step('ECharts 折线图渲染（smooth/symbol/底部图例/y 轴 name=tokens）', async () => {
      const state = await rp.getCacheTokensChartState(page);
      expect(state).not.toBeNull();
      expect(state.hasSeries).toBe(true);
      expect(state.series).toHaveLength(2);
      for (const s of state.series) {
        expect(s.type).toBe('line');
        expect(s.smooth).toBe(true);
        expect(s.symbol).toBe('none');
      }
      // 图例位于底部（bottom: 0）
      expect(state.legendBottom).toBe(0);
      // y 轴 name = tokens；x 轴为时间分类轴
      expect(state.yAxisName).toBe('tokens');
      expect(state.xAxisType).toBe('category');
      // x 轴标签为 formatTs 格式 yyyy-MM-dd HH:mm:ss
      expect(state.xAxisData.length).toBeGreaterThan(0);
      for (const label of state.xAxisData) {
        expect(label).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      }
    });

    await test.step('页面无 JS / ECharts 报错', async () => {
      expect(pageErrors).toEqual([]);
    });
  });

  test('RP-T-02 读写双序列展示（kind 拆分，单 kind 仅一条有值）', async ({ page }) => {
    const t0 = baseTime();
    await gotoWithCacheTokensMock(page, [
      point(t0, KIND_READ, 100),
      point(t0 + 60, KIND_READ, 200),
      point(t0, KIND_WRITE, 300),
      point(t0 + 60, KIND_WRITE, 400),
    ]);

    await test.step('双序列按 kind 拆分，序列名为 cache_read / cache_write', async () => {
      const state = await rp.getCacheTokensChartState(page);
      expect(state.series.map((s) => s.name)).toEqual([KIND_READ, KIND_WRITE]);
      expect(state.legendData).toEqual([KIND_READ, KIND_WRITE]);
      // tooltip 以 axis 触发，同一时间点并列展示各序列值
      expect(state.tooltipTrigger).toBe('axis');
      // cache_read 点进入 readMap，cache_write 点进入 writeMap
      expect(state.series[0].data).toEqual([100, 200]);
      expect(state.series[1].data).toEqual([300, 400]);
    });

    await test.step('窗口内只有 cache_read 数据时，write 序列以占位呈现', async () => {
      // Overview.vue 实现：cacheTokensOption 固定生成 read/write 两条序列，
      // 未出现的 kind 不取值（data 全为 '-'），不产生实际数据点
      await rp.setCacheTokensSeries(page, [
        point(t0, KIND_READ, 88),
        point(t0 + 60, KIND_READ, 99),
      ]);
      const state = await rp.getCacheTokensChartState(page);
      expect(state.series.map((s) => s.name)).toEqual([KIND_READ, KIND_WRITE]);
      expect(state.series[0].data).toEqual([88, 99]);
      expect(state.series[1].data).toEqual(['-', '-']);
    });
  });

  test('RP-T-03 缓存时序图图例位于底部且点击可切换显隐', async ({ page }) => {
    await gotoWithCacheTokensMock(page, dualKindSeries());

    await test.step('图例条目为 cache_read / cache_write，位于图表底部', async () => {
      // ECharts 图例渲染在 canvas 上（无 DOM 图例条目），经 option 断言
      const state = await rp.getCacheTokensChartState(page);
      expect(state.legendData).toEqual([KIND_READ, KIND_WRITE]);
      expect(state.legendBottom).toBe(0);
      const legend = await rp.getCacheTokensLegendSelected(page);
      expect(legend).not.toBeNull();
      expect(legend.data).toEqual([KIND_READ, KIND_WRITE]);
    });

    await test.step('点击图例切换 cache_read 显隐，不影响 cache_write', async () => {
      await rp.toggleCacheTokensLegend(page, KIND_READ);
      let legend = await rp.getCacheTokensLegendSelected(page);
      expect(legend.selected[KIND_READ]).toBe(false);
      expect(legend.selected[KIND_WRITE]).not.toBe(false);
      await expect(rp.cacheTokensChartCanvas(page)).toBeVisible();

      await rp.toggleCacheTokensLegend(page, KIND_READ);
      legend = await rp.getCacheTokensLegendSelected(page);
      expect(legend.selected[KIND_READ]).toBe(true);
    });
  });

  test('RP-T-04 时间桶去重升序', async ({ page }) => {
    // 注入乱序且时间桶重复的数据
    await gotoWithCacheTokensMock(page, dualKindSeries());

    await test.step('x 轴时间桶去重并升序排列', async () => {
      const t0 = baseTime();
      const expected = [t0, t0 + 60, t0 + 120].map((t) => rp.formatTimestamp(t));
      const state = await rp.getCacheTokensChartState(page);
      expect(state.xAxisData).toEqual(expected);
      // 每条序列按对齐后的时间桶取值，同一时间点的 read/write 落在同一 x 位置
      expect(state.series[0].data).toEqual([10, 40, 30]);
      expect(state.series[1].data).toEqual([20, 55, 60]);
      // 前端不做二次分桶：x 轴桶与接口 series 中出现的 time 集合一致
      const rawTimes = [...new Set(state.rawSeries.map((p) => p.time))].sort(
        (a, b) => a - b,
      );
      expect(rawTimes).toEqual([t0, t0 + 60, t0 + 120]);
    });
  });

  test('RP-T-05 缺失数据点占位 -（tooltip 缺失序列显示 -）', async ({ page }) => {
    const t0 = baseTime();
    // t0 仅 cache_read，t0+60 双 kind
    await gotoWithCacheTokensMock(page, [
      point(t0, KIND_READ, 11),
      point(t0 + 60, KIND_READ, 22),
      point(t0 + 60, KIND_WRITE, 33),
    ]);

    await test.step('缺失时间桶以 - 填充而非补 0', async () => {
      const state = await rp.getCacheTokensChartState(page);
      // t0 处 write 缺失 → '-'；t0+60 处双方有值
      expect(state.series[0].data).toEqual([11, 22]);
      expect(state.series[1].data).toEqual(['-', 33]);
      // tooltip axis 触发，缺失值与数值并列展示
      expect(state.tooltipTrigger).toBe('axis');
    });
  });

  test('RP-T-06 请求缓存 Token 指标参数与并发加载', async ({ page }) => {
    // 不 mock，跟踪真实请求；真实数据可能为空，仅断言请求行为与响应结构
    const requests = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' || !rp.TIMESERIES_URL_RE.test(req.url())) {
        return;
      }
      const q = new URL(req.url()).searchParams;
      requests.push({
        metric: q.get('metric'),
        start: q.get('start'),
        end: q.get('end'),
        t: Date.now(),
      });
    });

    const response = await rp.waitForCacheTokensTimeseriesResponse(page, () =>
      rp.gotoReportPage(page),
    );

    await test.step('GET report/timeseries 且 query 含 metric=cache_tokens 与 start/end', async () => {
      expect(response.status()).toBe(200);
      const q = new URL(response.url()).searchParams;
      expect(q.get('metric')).toBe(rp.CACHE_TOKENS_METRIC);
      expect(q.get('start')).toBeTruthy();
      expect(q.get('end')).toBeTruthy();
    });

    await test.step('metric=cache_tokens 与 qps/tokens/latency 并发发起且窗口参数一致', async () => {
      const cacheReq = requests.find(
        (r) => r.metric === rp.CACHE_TOKENS_METRIC,
      );
      expect(cacheReq).toBeTruthy();
      // 同一批次（同一 start 窗口）内 4 个 metric 请求同时发出
      const batch = requests.filter((r) => r.start === cacheReq.start);
      const metrics = batch.map((r) => r.metric);
      for (const m of ['qps', 'tokens', 'latency', rp.CACHE_TOKENS_METRIC]) {
        expect(metrics).toContain(m);
      }
      for (const r of batch) {
        expect(r.end).toBe(cacheReq.end);
      }
      const ts = batch.map((r) => r.t);
      // Promise.all 并发：各请求发起时间差在 2s 内（顺序 await 会超过 cache 请求耗时）
      expect(Math.max(...ts) - Math.min(...ts)).toBeLessThan(2000);
    });

    await test.step('响应体结构形如 {bucket_sec, series:[{time,kind,value}]}', async () => {
      const body = await response.json();
      const data = body?.Data ?? body?.data;
      expect(data).toBeTruthy();
      expect(typeof data.bucket_sec).toBe('number');
      expect(Array.isArray(data.series)).toBe(true);
      for (const p of data.series) {
        expect(typeof p.time).toBe('number');
        expect([KIND_READ, KIND_WRITE]).toContain(p.kind);
        expect(typeof p.value).toBe('number');
      }
    });
  });

  test('RP-T-07 缓存时序无数据空态', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await test.step('series 为空数组时显示「暂无数据」空态', async () => {
      await gotoWithCacheTokensMock(page, []);
      // 空态占位 .chart-empty，文案为「暂无数据」，不渲染 Echarts
      const state = await rp.getCacheTokensChartState(page);
      expect(state.hasSeries).toBe(false);
      expect(state.series).toHaveLength(0);
    });

    await test.step('页面无 JS 报错，指标卡照常展示', async () => {
      expect(pageErrors).toEqual([]);
      for (const label of rp.DOC.metricsLabels) {
        await expect(rp.metricsCard(page, label)).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test('RP-T-08 缓存时序失败不影响其他图表', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    const t0 = baseTime();
    const line = (offset) => [
      { time: t0, value: 10 + offset },
      { time: t0 + 60, value: 20 + offset },
    ];

    await test.step('仅 cache_tokens 返回 500，其余 metric 正常返回数据', async () => {
      await rp.mockReportTimeseries(page, {
        cache_tokens: {
          status: 500,
          errMsg: 'CacheTokensError: mock cache_tokens failure',
        },
        qps: { series: line(0) },
        tokens: { series: line(10) },
        latency: { series: line(20) },
      });
      await rp.gotoReportPage(page);
    });

    await test.step('缓存 Token 图显示空态', async () => {
      await rp.waitForCacheTokensChart(page, { expectEmpty: true });
      const state = await rp.getCacheTokensChartState(page);
      // cacheTokensRes.status !== 200 → tsData.cache_tokens 不赋值
      expect(state.rawSeries).toBeNull();
    });

    await test.step('其余时序图照常渲染，页面不崩', async () => {
      await expect(
        rp.chartCardCanvas(page, rp.QPS_CHART_TITLE).first(),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        rp.chartCardCanvas(page, rp.TOKENS_CHART_TITLE).first(),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        rp.chartCardCanvas(page, rp.LATENCY_CHART_TITLE).first(),
      ).toBeVisible({ timeout: 15000 });
      // loading 复位、指标卡保留
      const state = await rp.getCacheTokensChartState(page);
      expect(state.loading).toBe(false);
      await expect(
        rp.metricsCard(page, '请求总量'),
      ).toBeVisible({ timeout: 10000 });
    });

    await test.step('响应拦截器弹出 $Notice 错误通知（title/content 取自 ErrMsg）', async () => {
      await rp.expectErrorNotice(page, 'mock cache_tokens failure');
      // 500 被 axios 拦截器消化（返回 error.response），不产生未捕获 JS 异常
      expect(pageErrors).toEqual([]);
    });
  });
});
