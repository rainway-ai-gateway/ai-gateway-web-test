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
 * 数据报表 - 时序与缓存 Token（RP-T-01 ~ RP-T-14）
 *
 * 断言策略：ECharts 渲染在 canvas 中，直接断言图表卡标题/空态/图例 DOM，
 * 并通过页面 Vue 实例（ReportOverview.cacheTokensOption）与 Echarts 实例
 * （legend.selected）读取 option 快照做确定性断言。
 * mock 优先：report/timeseries 按 metric（下钻场景按 `metric|dimension`）分发 mock，
 * 其余请求照常放行。
 *
 * RP-T-09 ~ RP-T-14（2026-10-14 图表维度下钻）：过滤栏行尾「拆分维度」4 选项、
 * 切换不即时生效、点「查询」后 qps/tokens/latency 带 dimension 拆多序列
 * （QPS 拆 value、Token 拆 输入/输出/总量、延迟只拆 平均/最大）、mirror_hit 桶名归一
 * （"1"/"0"/"" → 命中/未命中/未知）、重置清空并自动重查、缓存 Token 图不参与拆分。
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

// ====== 拆分维度（RP-T-09 ~ RP-T-14）mock 数据 ======
// 设计依据：02-时序与缓存Token.md RP-T-09~14；接口按 dimension 返回多条带 name 的序列

// 未拆分（无 dimension）时三张时序图的单序列数据
function singleSeriesMocks(t0) {
  return {
    qps: {
      series: [
        { time: t0, value: 100 },
        { time: t0 + 60, value: 120 },
      ],
    },
    tokens: {
      series: [
        { time: t0, input: 10, output: 20, total: 30 },
        { time: t0 + 60, input: 11, output: 21, total: 32 },
      ],
    },
    latency: {
      series: [
        { time: t0, avg: 12, max: 30 },
        { time: t0 + 60, avg: 13, max: 31 },
      ],
    },
  };
}

// 缓存状态拆维：hit / miss / skip 三桶（值为确定性数值，供「无前端二次拆分」断言）
const CACHE_SPLIT_BUCKETS = [
  { name: 'hit', values: [72, 70] },
  { name: 'miss', values: [20, 21] },
  { name: 'skip', values: [8, 9] },
];

function cacheStatusSplitMocks(t0) {
  return splitMocks(t0, CACHE_SPLIT_BUCKETS);
}

// 按 (桶名, 时间桶) 生成三张图的带 name 序列
function splitMocks(t0, buckets) {
  const qps = [];
  const tokens = [];
  const latency = [];
  for (const { name, values } of buckets) {
    values.forEach((v, i) => {
      const time = t0 + i * 60;
      qps.push({ time, name, value: v });
      tokens.push({ time, name, input: v, output: v * 2, total: v * 3 });
      latency.push({ time, name, avg: v / 10, max: v / 5 });
    });
  }
  return { qps: { series: qps }, tokens: { series: tokens }, latency: { series: latency } };
}

// QPS 图例 = 桶名；Token 图例 = 「桶名 字段名」；延迟图例 = 「桶名 平均/最大」
function expectedQpsSeries(buckets) {
  return buckets.map((b) => ({ name: b.name, data: b.values }));
}

function expectedTokensSeries(buckets) {
  return buckets.flatMap((b) => [
    { name: `${b.name} ${rp.TOKEN_SPLIT_FIELDS[0]}`, data: b.values },
    { name: `${b.name} ${rp.TOKEN_SPLIT_FIELDS[1]}`, data: b.values.map((v) => v * 2) },
    { name: `${b.name} ${rp.TOKEN_SPLIT_FIELDS[2]}`, data: b.values.map((v) => v * 3) },
  ]);
}

function expectedLatencySeries(buckets) {
  return buckets.flatMap((b) => [
    { name: `${b.name} ${rp.LATENCY_SPLIT_FIELDS[0]}`, data: b.values.map((v) => v / 10) },
    { name: `${b.name} ${rp.LATENCY_SPLIT_FIELDS[1]}`, data: b.values.map((v) => v / 5) },
  ]);
}

function seriesNames(series) {
  return series.map((s) => s.name);
}

/**
 * 进入总览页并等待三张受拆分维度影响的时序图渲染（mock：未拆分 + 拆分两套数据）
 * @param {Object} mocks - mockReportTimeseries 的入参（含 metric / metric|dimension 键）
 */
async function gotoWithTimeseriesMocks(page, mocks) {
  await rp.mockReportTimeseries(page, mocks);
  await rp.gotoReportPage(page);
  await rp.waitForTimeseriesChart(page, 'qps');
  await rp.waitForTimeseriesChart(page, 'tokens');
  await rp.waitForTimeseriesChart(page, 'latency');
}

/**
 * 等待三张时序图图例切换为拆分后的多序列
 */
async function expectSplitLegends(page, qpsBuckets) {
  await expect
    .poll(async () => (await rp.getTimeseriesChartState(page, 'qps')).legendData, {
      timeout: 10000,
    })
    .toEqual(seriesNames(expectedQpsSeries(qpsBuckets)));
  await expect
    .poll(async () => (await rp.getTimeseriesChartState(page, 'tokens')).legendData, {
      timeout: 10000,
    })
    .toEqual(seriesNames(expectedTokensSeries(qpsBuckets)));
  await expect
    .poll(async () => (await rp.getTimeseriesChartState(page, 'latency')).legendData, {
      timeout: 10000,
    })
    .toEqual(seriesNames(expectedLatencySeries(qpsBuckets)));
}

/**
 * 等待三张时序图回到单序列（重置 / 不分维度）
 */
async function expectSingleLegends(page) {
  await expect
    .poll(async () => (await rp.getTimeseriesChartState(page, 'qps')).legendData, {
      timeout: 10000,
    })
    .toEqual(['QPS']);
  await expect
    .poll(async () => (await rp.getTimeseriesChartState(page, 'tokens')).legendData, {
      timeout: 10000,
    })
    .toEqual(rp.TOKEN_SPLIT_FIELDS);
  await expect
    .poll(async () => (await rp.getTimeseriesChartState(page, 'latency')).legendData, {
      timeout: 10000,
    })
    .toEqual(rp.LATENCY_SPLIT_FIELDS);
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

  test('RP-T-09 拆分维度控件展示与默认值', async ({ page }) => {
    const t0 = baseTime();
    await test.step('mock 未拆分三图数据 + 缓存 Token 双 kind，进入总览页', async () => {
      await gotoWithTimeseriesMocks(page, {
        ...singleSeriesMocks(t0),
        cache_tokens: { series: dualKindSeries() },
      });
    });

    await test.step('控件位于过滤栏行尾（状态码之后、查询按钮之前）', async () => {
      const sequence = await rp.getFilterBarControlSequence(page);
      expect(sequence).toEqual([
        rp.DOC.filterLabels.model,
        'API Key',
        '服务商',
        'Host',
        '流式',
        '状态码',
        rp.TS_SPLIT_LABEL,
        rp.DOC.queryButton,
        rp.DOC.resetButton,
      ]);
      await expect(rp.tsSplitFilterItem(page)).toBeVisible();
    });

    await test.step('下拉共 4 个选项，默认选中「不分维度」', async () => {
      const state = await rp.getTsSplitDropdownState(page);
      expect(state.options).toEqual(rp.TS_SPLIT_OPTIONS.map((o) => o.label));
      expect(await rp.getTsSplitValue(page)).toBe('');
      // 验收（02 RP-T-09 预期 2）：默认选中「不分维度」——选择器头部即展示该文案
      // （index.vue 已补 :placeholder="$t('report.tsSplitNone')"；iView 对值为 '' 的选项
      //  不渲染 ivu-select-item-selected（select.vue selectedValues = values.filter(Boolean)），
      //  故默认态以头部文案 + tsSplit='' 判定，不依赖下拉项的选中类名）
      expect(await rp.getTsSplitHeadText(page)).toBe(rp.TS_SPLIT_NONE_LABEL);
      expect(await rp.getTsSplitHeadText(page)).not.toBe('请选择');
    });

    await test.step('默认态三张时序图为单序列渲染，与变更前一致', async () => {
      const qps = await rp.getTimeseriesChartState(page, 'qps');
      const tokens = await rp.getTimeseriesChartState(page, 'tokens');
      const latency = await rp.getTimeseriesChartState(page, 'latency');
      expect(seriesNames(qps.series)).toEqual(['QPS']);
      expect(seriesNames(tokens.series)).toEqual(rp.TOKEN_SPLIT_FIELDS);
      expect(seriesNames(latency.series)).toEqual(rp.LATENCY_SPLIT_FIELDS);
    });

    await test.step('时序图区无独立拆分维度工具行（.ts-split-bar 已移除）', async () => {
      await rp.expectNoTsSplitBar(page);
    });
  });

  test('RP-T-10 拆分维度随查询生效（变更不即时、点查询才联动）', async ({ page }) => {
    const t0 = baseTime();
    const split = cacheStatusSplitMocks(t0);
    const tracker = rp.trackTimeseriesRequests(page);

    await test.step('mock 未拆分 + 缓存状态拆维两套数据，进入总览页', async () => {
      await gotoWithTimeseriesMocks(page, {
        ...singleSeriesMocks(t0),
        'qps|ai_cache_status': split.qps,
        'tokens|ai_cache_status': split.tokens,
        'latency|ai_cache_status': split.latency,
        cache_tokens: { series: dualKindSeries() },
      });
    });

    await test.step('仅切换「拆分维度」为缓存状态：不发起新请求、三图保持单序列', async () => {
      const before = tracker.requests.length;
      await rp.selectTsSplit(page, '缓存状态');
      expect(await rp.getTsSplitValue(page)).toBe('ai_cache_status');
      // 切换只更新 tsSplit 状态，不触发整页查询
      await rp.expectNoNewTimeseriesRequests(page, tracker, before);
      const qps = await rp.getTimeseriesChartState(page, 'qps');
      expect(seriesNames(qps.series)).toEqual(['QPS']);
      expect(qps.series[0].data).toEqual([100, 120]);
    });

    await test.step('点击「查询」后 qps/tokens/latency 携带 dimension 重新请求', async () => {
      const responses = await rp.waitForTimeseriesResponses(
        page,
        rp.TS_SPLIT_METRICS,
        () => rp.clickQueryButton(page),
        { dimension: 'ai_cache_status' },
      );
      for (const response of responses) {
        const query = rp.parseQuery(response.url());
        expect(query.dimension).toBe('ai_cache_status');
        expect(query.start).toBeTruthy();
        expect(query.end).toBeTruthy();
        expect(response.status()).toBe(200);
      }
    });

    await test.step('三张时序图按维度桶拆分为多序列渲染', async () => {
      await expectSplitLegends(page, CACHE_SPLIT_BUCKETS);
      const qps = await rp.getTimeseriesChartState(page, 'qps');
      expect(qps.series).toEqual(expectedQpsSeries(CACHE_SPLIT_BUCKETS));
    });
  });

  test('RP-T-11 拆分维度为缓存状态的多序列渲染', async ({ page }) => {
    const t0 = baseTime();
    const split = cacheStatusSplitMocks(t0);

    await test.step('拆分维度选「缓存状态」并查询', async () => {
      await gotoWithTimeseriesMocks(page, {
        ...singleSeriesMocks(t0),
        'qps|ai_cache_status': split.qps,
        'tokens|ai_cache_status': split.tokens,
        'latency|ai_cache_status': split.latency,
        cache_tokens: { series: dualKindSeries() },
      });
      await rp.selectTsSplit(page, '缓存状态');
      await rp.waitForTimeseriesResponses(
        page,
        rp.TS_SPLIT_METRICS,
        () => rp.clickQueryButton(page),
        { dimension: 'ai_cache_status' },
      );
      await expectSplitLegends(page, CACHE_SPLIT_BUCKETS);
    });

    await test.step('QPS 图按桶名拆序列（图例为 hit / miss / skip），数值与接口一致', async () => {
      const qps = await rp.getTimeseriesChartState(page, 'qps');
      expect(qps.series).toEqual(expectedQpsSeries(CACHE_SPLIT_BUCKETS));
      expect(qps.yAxisName).toBe(rp.TIMESERIES_Y_AXIS.qps);
      expect(qps.xAxisData).toEqual([t0, t0 + 60].map((t) => rp.formatTimestamp(t)));
    });

    await test.step('Token 图按「桶名 + 字段名」拆序列（输入 / 输出 / 总量）', async () => {
      const tokens = await rp.getTimeseriesChartState(page, 'tokens');
      expect(tokens.series).toEqual(expectedTokensSeries(CACHE_SPLIT_BUCKETS));
      expect(tokens.yAxisName).toBe(rp.TIMESERIES_Y_AXIS.tokens);
      expect(tokens.series[0].name).toBe(`hit ${rp.TOKEN_SPLIT_FIELDS[0]}`);
    });

    await test.step('延迟图只拆 avg / max，不带 dimension 时出现的分位数序列不渲染', async () => {
      const latency = await rp.getTimeseriesChartState(page, 'latency');
      expect(latency.series).toEqual(expectedLatencySeries(CACHE_SPLIT_BUCKETS));
      expect(latency.yAxisName).toBe(rp.TIMESERIES_Y_AXIS.latency);
      expect(latency.series).toHaveLength(CACHE_SPLIT_BUCKETS.length * 2);
      for (const s of latency.series) {
        expect(s.name).not.toMatch(/p50|p90|p99|分位/);
      }
    });
  });

  test('RP-T-12 拆分维度为镜像命中的桶名归一', async ({ page }) => {
    const t0 = baseTime();
    // 接口侧 name 为 "1" / "0"；老数据未镜像且字段缺省时 name 为空串 ""
    const buckets = [
      { raw: '1', values: [60, 62] },
      { raw: '0', values: [30, 31] },
      { raw: '', values: [10, 11] },
    ];
    const split = splitMocks(
      t0,
      buckets.map((b) => ({ name: b.raw, values: b.values })),
    );
    // 前端按 name 分组时使用普通对象作 map，整数样键（"0" / "1"）按 JS 规范升序排在
    // 字符串键（""）之前，故渲染顺序为 未命中 / 命中 / 未知（02 未规定序列顺序，
    // 仅规定桶名映射与数值对应）
    const expectedBuckets = [
      { name: rp.MIRROR_HIT_BUCKET_NAMES[0], values: [30, 31] },
      { name: rp.MIRROR_HIT_BUCKET_NAMES[1], values: [60, 62] },
      { name: rp.UNKNOWN_BUCKET_NAME, values: [10, 11] },
    ];

    await test.step('拆分维度选「镜像命中」并查询', async () => {
      await gotoWithTimeseriesMocks(page, {
        ...singleSeriesMocks(t0),
        'qps|mirror_hit': split.qps,
        'tokens|mirror_hit': split.tokens,
        'latency|mirror_hit': split.latency,
        cache_tokens: { series: dualKindSeries() },
      });
      await rp.selectTsSplit(page, '镜像命中');
      await rp.waitForTimeseriesResponses(
        page,
        rp.TS_SPLIT_METRICS,
        () => rp.clickQueryButton(page),
        { dimension: 'mirror_hit' },
      );
      await expectSplitLegends(page, expectedBuckets);
    });

    await test.step('name "1" → 命中、"0" → 未命中（不原样展示 0/1）', async () => {
      const qps = await rp.getTimeseriesChartState(page, 'qps');
      expect(qps.series).toEqual([
        { name: rp.MIRROR_HIT_BUCKET_NAMES[0], data: [30, 31] },
        { name: rp.MIRROR_HIT_BUCKET_NAMES[1], data: [60, 62] },
        { name: rp.UNKNOWN_BUCKET_NAME, data: [10, 11] },
      ]);
      for (const name of seriesNames(qps.series)) {
        expect(['0', '1']).not.toContain(name);
      }
    });

    await test.step('空 name（""）序列图例显示「未知」（与分布侧 unknown 语义对齐）', async () => {
      const tokens = await rp.getTimeseriesChartState(page, 'tokens');
      expect(seriesNames(tokens.series)).toEqual([
        `${rp.MIRROR_HIT_BUCKET_NAMES[0]} ${rp.TOKEN_SPLIT_FIELDS[0]}`,
        `${rp.MIRROR_HIT_BUCKET_NAMES[0]} ${rp.TOKEN_SPLIT_FIELDS[1]}`,
        `${rp.MIRROR_HIT_BUCKET_NAMES[0]} ${rp.TOKEN_SPLIT_FIELDS[2]}`,
        `${rp.MIRROR_HIT_BUCKET_NAMES[1]} ${rp.TOKEN_SPLIT_FIELDS[0]}`,
        `${rp.MIRROR_HIT_BUCKET_NAMES[1]} ${rp.TOKEN_SPLIT_FIELDS[1]}`,
        `${rp.MIRROR_HIT_BUCKET_NAMES[1]} ${rp.TOKEN_SPLIT_FIELDS[2]}`,
        `${rp.UNKNOWN_BUCKET_NAME} ${rp.TOKEN_SPLIT_FIELDS[0]}`,
        `${rp.UNKNOWN_BUCKET_NAME} ${rp.TOKEN_SPLIT_FIELDS[1]}`,
        `${rp.UNKNOWN_BUCKET_NAME} ${rp.TOKEN_SPLIT_FIELDS[2]}`,
      ]);
      expect(tokens.series[6].data).toEqual([10, 11]);
    });
  });

  test('RP-T-13 重置清空拆分维度并自动重查', async ({ page }) => {
    const t0 = baseTime();
    const split = cacheStatusSplitMocks(t0);

    await test.step('拆分维度选「缓存状态」并查询，三图多序列渲染', async () => {
      await gotoWithTimeseriesMocks(page, {
        ...singleSeriesMocks(t0),
        'qps|ai_cache_status': split.qps,
        'tokens|ai_cache_status': split.tokens,
        'latency|ai_cache_status': split.latency,
        cache_tokens: { series: dualKindSeries() },
      });
      await rp.selectTsSplit(page, '缓存状态');
      await rp.waitForTimeseriesResponses(
        page,
        rp.TS_SPLIT_METRICS,
        () => rp.clickQueryButton(page),
        { dimension: 'ai_cache_status' },
      );
      await expectSplitLegends(page, CACHE_SPLIT_BUCKETS);
    });

    await test.step('点击「重置」：选择器回「不分维度」并自动重查（请求不带 dimension）', async () => {
      const responses = await rp.waitForTimeseriesResponses(
        page,
        rp.TS_SPLIT_METRICS,
        () => rp.clickResetButton(page),
        { dimension: '' },
      );
      for (const response of responses) {
        const query = rp.parseQuery(response.url());
        expect(query.dimension).toBeUndefined();
        expect(response.status()).toBe(200);
      }
      const state = await rp.getTsSplitDropdownState(page);
      // 选择器取值回到「不分维度」：iView Select 的内部空值会经 input 事件把 v-model
      // 写成 undefined，故判定「无拆分维度」（'' 或 undefined）而非严格等于 ''
      const value = await rp.getTsSplitValue(page);
      expect([undefined, ''], `tsSplit 应为空值，实际 ${JSON.stringify(value)}`).toContain(value);
      expect(state.options).toEqual(rp.TS_SPLIT_OPTIONS.map((o) => o.label));
      // 验收（02 RP-T-13 预期 1）：选择器恢复为「不分维度」，头部文案可见
      expect(await rp.getTsSplitHeadText(page)).toBe(rp.TS_SPLIT_NONE_LABEL);
    });

    await test.step('三张时序图恢复单序列渲染', async () => {
      await expectSingleLegends(page);
      const qps = await rp.getTimeseriesChartState(page, 'qps');
      expect(qps.series).toEqual([{ name: 'QPS', data: [100, 120] }]);
    });

    await test.step('其余过滤项同步重置（通用过滤状态无死控件）', async () => {
      expect(await rp.getFilterStateKeys(page)).toEqual([
        'apikey_ids',
        'hosts',
        'models',
        'providers',
        'status_codes',
        'stream',
      ]);
    });
  });

  test('RP-T-14 拆分维度作用范围（缓存 Token 图 / 指标卡 / 排行 / 饼图不受影响）', async ({ page }) => {
    const t0 = baseTime();
    const split = splitMocks(t0, [{ name: 'coding', values: [40, 42] }]);
    const metricLabels = [
      rp.REQUEST_TOTAL_LABEL,
      rp.ERROR_TOTAL_LABEL,
      rp.TOKEN_USAGE_LABEL,
      rp.AVG_LATENCY_LABEL,
      rp.COST_CARD_LABEL,
      rp.CACHE_HIT_RATE_LABEL,
      rp.MIRROR_HIT_LABEL,
      rp.INTENT_CLASSIFIED_LABEL,
    ];
    const overviewData = {
      request_total: 1234,
      error_total: 12,
      error_rate: 0.01,
      total_tokens: 56789,
      input_tokens: 30000,
      output_tokens: 26789,
      latency_avg_ms: 123.4,
      cost: [{ currency: 'USD', value: 1.5 }],
      cache: {
        hit_rate: 0.5,
        hit_count: 10,
        miss_count: 8,
        skip_count: 2,
        read_tokens: 100,
        write_tokens: 50,
      },
      mirror: { hit_count: 7 },
      intent: { classified_count: 5, unknown_count: 1, unknown_rate: 0.1 },
    };
    const rankingItems = [
      { name: 'gpt-4o', request_count: 120, error_count: 2, input_tokens: 1000, output_tokens: 500 },
      { name: 'claude-3', request_count: 80, error_count: 0, input_tokens: 800, output_tokens: 400 },
    ];
    let before = null;

    await test.step('mock 指标卡 / 排行 / 两个饼图 / 时序图，进入总览页并记录初始状态', async () => {
      await rp.mockReportOverview(page, { data: overviewData });
      await rp.mockReportRankings(page, { model: { items: rankingItems } });
      await rp.mockReportDistribution(page, {
        protocol: { items: [{ name: 'https', request_count: 60, ratio: 0.6 }] },
        status: { items: [{ name: '200', request_count: 90, ratio: 0.9 }] },
      });
      await rp.mockReportTimeseries(page, {
        ...singleSeriesMocks(t0),
        'qps|ai_intent_answer': split.qps,
        'tokens|ai_intent_answer': split.tokens,
        'latency|ai_intent_answer': split.latency,
        cache_tokens: { series: dualKindSeries() },
        // 缓存 Token 图不参与拆分：若错误携带 dimension 则该序列为空 → 图变空态（可被断言捕获）
        'cache_tokens|ai_intent_answer': { series: [] },
      });
      await rp.gotoReportPage(page);
      await rp.waitForTimeseriesChart(page, 'qps');
      await rp.waitForCacheTokensChart(page);
      await rp.waitForRankingChart(page);
      await rp.waitForPieChart(page, 'share');
      await rp.waitForPieChart(page, 'dist');

      const values = {};
      for (const label of metricLabels) {
        values[label] = await rp.getMetricCardValue(page, label);
      }
      before = {
        metricValues: values,
        cacheTokens: await rp.getCacheTokensChartState(page),
        ranking: await rp.getRankingChartState(page),
        share: await rp.getPieChartState(page, 'share'),
        dist: await rp.getPieChartState(page, 'dist'),
        dims: await rp.getChartDims(page),
      };
      expect(seriesNames(before.cacheTokens.series)).toEqual([KIND_READ, KIND_WRITE]);
    });

    await test.step('拆分维度切「意图答案」并查询：三张时序图带 dimension 拆分', async () => {
      const tracker = rp.trackTimeseriesRequests(page);
      await rp.selectTsSplit(page, '意图答案');
      const responses = await rp.waitForTimeseriesResponses(
        page,
        rp.TS_SPLIT_METRICS,
        () => rp.clickQueryButton(page),
        { dimension: 'ai_intent_answer' },
      );
      for (const response of responses) {
        expect(rp.parseQuery(response.url()).dimension).toBe('ai_intent_answer');
      }
      await expectSplitLegends(page, [{ name: 'coding', values: [40, 42] }]);
      // 缓存 Token 请求不携带 dimension（若携带会被 mock 成空序列 → 下图断言失败）
      const cacheReq = rp.filterTimeseriesRequests(tracker, rp.CACHE_TOKENS_METRIC);
      expect(cacheReq.length).toBeGreaterThanOrEqual(1);
      for (const req of cacheReq) {
        expect(req.dimension).toBe('');
        expect(rp.parseQuery(req.url).dimension).toBeUndefined();
      }
    });

    await test.step('缓存 Token 图保持 cache_read / cache_write 双序列不变', async () => {
      const after = await rp.getCacheTokensChartState(page);
      expect(seriesNames(after.series)).toEqual([KIND_READ, KIND_WRITE]);
      expect(after.series).toEqual(before.cacheTokens.series);
      expect(after.rawSeries).toEqual(before.cacheTokens.rawSeries);
    });

    await test.step('8 张指标卡取值不变（仍按通用过滤参数聚合）', async () => {
      for (const label of metricLabels) {
        expect(await rp.getMetricCardValue(page, label)).toBe(before.metricValues[label]);
      }
    });

    await test.step('排行图与两个饼图的维度下拉与数据不受拆分维度影响', async () => {
      const dims = await rp.getChartDims(page);
      expect(dims).toEqual({
        ranking: 'model',
        pieProvider: 'protocol',
        pieStatus: 'status',
        tsSplit: 'ai_intent_answer',
      });
      const ranking = await rp.getRankingChartState(page);
      expect(ranking.categories).toEqual(before.ranking.categories);
      expect(ranking.series).toEqual(before.ranking.series);
      const share = await rp.getPieChartState(page, 'share');
      expect(share.data).toEqual(before.share.data);
      const dist = await rp.getPieChartState(page, 'dist');
      expect(dist.data).toEqual(before.dist.data);
    });
  });
});
