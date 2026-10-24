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
'use strict';
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const rc = require('../resource/ResourcePageCommon');
const sessionUtils = require('../../utils/session');
const reportApi = require('../../api/report-api-utils');
const { PageTableComponent } = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuSelectComponent,
  IvuTabsComponent,
} = require('../../components/iview');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');

const AUTH_PATH = path.join(__dirname, '../../auth.json');
const LOGS_URL_RE = /\/open-api\/v1\/report\/logs/;
const OVERVIEW_URL_RE = /\/open-api\/v1\/report\/overview/;
const TIMESERIES_URL_RE = /\/open-api\/v1\/report\/timeseries/;
const RANKINGS_URL_RE = /\/open-api\/v1\/report\/rankings/;
const DISTRIBUTION_URL_RE = /\/open-api\/v1\/report\/distribution/;
// 维度过滤「意图答案」下拉（i18n report.intentAnswer）
const INTENT_ANSWER_LABEL = '意图答案';
const CACHE_TOKENS_METRIC = 'cache_tokens';
// i18n report.cacheTokensTimeseries / report.noData
const CACHE_TOKENS_CHART_TITLE = '缓存 Token 时序（cache_read / cache_write）';
const NO_DATA_TEXT = '暂无数据';
const QPS_CHART_TITLE = 'QPS 时间序列';
const TOKENS_CHART_TITLE = 'Token 时间序列';
const LATENCY_CHART_TITLE = '延迟 时间序列';

const DOC = {
  pageTitle: '数据报表',
  overviewTab: '总览',
  logsTab: '明细',
  queryButton: '查询',
  resetButton: '重置',
  detailButton: '详情',
  drawerTitle: '详情',
  startTimeLabel: '开始时间',
  endTimeLabel: '结束时间',
  timeRange1h: '1 小时',
  timeRange6h: '6 小时',
  timeRange24h: '24 小时',
  timeRange7d: '7 天',
  metricsLabels: ['请求总量', '错误率', 'Token用量', '平均延迟', '费用'],
  logTableColumns: [
    '时间',
    'API Key',
    '请求模型',
    '目标模型',
    '服务商',
    '状态码',
    '耗时',
    'Tokens',
    'TTFT',
    '费用',
    '错误',
    '操作',
  ],
  filterLabels: {
    model: '目标模型',
    apikey: 'API Key',
    provider: '服务商',
    host: 'Host',
    stream: '流式',
    statusCode: '状态码',
  },
  streamOptions: {
    all: '全部',
    yes: '是',
    no: '否',
  },
  errOnlyLabel: '仅错误',
  keywordPlaceholder: '搜索日志',
};

const QUICK_TIME_LABELS = ['1 小时', '6 小时', '24 小时', '7 天'];
// 成本卡指标卡文案（i18n report.cost）
const COST_CARD_LABEL = '费用';

// ====== 底层组件 ======

function reportPage(page) {
  return page.locator('.report-page');
}

function reportTabs(page) {
  return new IvuTabsComponent(page);
}

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

function reportLogsTable(page) {
  return new PageTableComponent(page, page.locator('.report-page .page-table'));
}

// ====== 会话 ======

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
    /* ignore */
  }
  return null;
}

async function ensureLocalStorageSession(page) {
  const session = readSessionFromAuthFile();
  if (!session) return;
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

// ====== 导航 ======

async function gotoReportPage(page) {
  const session = readSessionFromAuthFile();
  if (session) {
    await page.addInitScript((user) => {
      try {
        if (!localStorage.getItem('user')) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('lang', 'zh');
        }
      } catch (e) {
        /* ignore */
      }
    }, session);
  }

  await rc.ensureAppSession(page);
  await page.goto(rc.getAppBaseUrl() + '/report', { waitUntil: 'domcontentloaded' });
  await ensureLocalStorageSession(page);
  // 导航后会话守卫：Key 失效时页面会弹「Session Key 错误」遮罩拦截点击，先自愈再断言就绪
  await sessionUtils.ensureSessionHealthy(page, {
    retryUrl: rc.getAppBaseUrl() + '/report',
  });
  await expectReportPageReady(page);
}

async function expectReportPageReady(page) {
  // 先等页面根容器渲染（Vue mount 完毕）
  await expect(page.locator('.report-page')).toBeVisible({ timeout: 15000 });
  // 再等查询按钮可见
  await expect(
    page.getByRole('button', { name: DOC.queryButton }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

// ====== 页签 ======

async function switchToTab(page, tabName) {
  const tabs = reportTabs(page);
  // iView Tabs 不产生网络请求，依靠页面内部逻辑
  await tabs.clickTabByText(tabName);
  await page.waitForTimeout(500);
}

async function expectActiveTab(page, tabName) {
  const active = reportTabs(page)
    .nav()
    .locator('.ivu-tabs-tab.ivu-tabs-tab-active');
  await expect(active).toContainText(tabName);
}

// ====== 过滤栏 ======

function filterBar(page) {
  return page.locator('.report-filter-bar');
}

function filterItem(page, label) {
  return filterBar(page)
    .locator('.report-filter-item')
    .filter({ has: page.locator('label', { hasText: label }) });
}

function filterInput(page, label) {
  return filterItem(page, label).locator('input').first();
}

function quickTimeButton(page, label) {
  return filterBar(page).getByRole('button', { name: label });
}

async function clickQuickTime(page, label) {
  await quickTimeButton(page, label).click();
  await page.waitForTimeout(500);
}

async function setFilterDateTime(page, placeholder, value) {
  const date = new Date(value);
  const isStart = /开始时间/.test(placeholder);
  // 直接通过 Vue 实例设置响应式数据，绕过 DatePicker 的 DOM 交互
  // iView DatePicker 使用 v-model 绑定 Date 对象，无法通过 fill() 修改
  await page.evaluate(
    ({ isStart, date }) => {
      const el = document.querySelector('.report-page');
      if (el && el.__vue__) {
        if (isStart) {
          el.__vue__.startTime = date;
        } else {
          el.__vue__.endTime = date;
        }
      }
    },
    { isStart, date },
  );
  await page.waitForTimeout(500);
}

async function clickQueryButton(page) {
  const btn = filterBar(page).getByRole('button', { name: DOC.queryButton });
  if ((await btn.count()) > 0) {
    await btn.click({ force: true });
    return;
  }
  await page.getByRole('button', { name: DOC.queryButton }).click({ force: true });
}

async function clickResetButton(page) {
  const btn = filterBar(page).getByRole('button', { name: DOC.resetButton });
  if ((await btn.count()) > 0) {
    await btn.click({ force: true });
    await page.waitForTimeout(500);
    return;
  }
  await page.getByRole('button', { name: DOC.resetButton }).click({ force: true });
  await page.waitForTimeout(500);
}

// ====== 总览 ======

function metricsCard(page, label) {
  return page.locator('.metric-card').filter({ hasText: label }).first();
}

async function getMetricCardValue(page, label) {
  const card = metricsCard(page, label);
  const value = await card.locator('.metric-value').textContent();
  return (value || '').trim();
}

/**
 * 成本卡主值：金额数字 + 币种小字
 * （Overview.vue 中 `.metric-currency` 嵌在 `.metric-value` 内部，需拆分）
 * @returns {Promise<{value: string, currency: string, text: string}>}
 *   value    金额数字（不含币种，服务端已 ÷1e8 的金额）
 *   currency 币种小字，无币种时为空串
 *   text     主值完整文本（如 "0.1523USD"；无成本时为 "-"）
 */
async function getCostCardMain(page, label = COST_CARD_LABEL) {
  const valueEl = metricsCard(page, label).locator('.metric-value').first();
  const text = ((await valueEl.textContent()) || '').trim();
  const currencyEl = valueEl.locator('.metric-currency');
  const currency =
    (await currencyEl.count()) > 0
      ? ((await currencyEl.first().textContent()) || '').trim()
      : '';
  const value =
    currency && text.endsWith(currency)
      ? text.slice(0, text.length - currency.length).trim()
      : text;
  return { value, currency, text };
}

/**
 * 成本卡副行：主币种之外的其余币种（形如 "RMB: 0.00098"）
 * @returns {Promise<Array<{currency: string, value: string, text: string}>>}
 */
async function getCostCardSubRows(page, label = COST_CARD_LABEL) {
  const rows = metricsCard(page, label).locator('.metric-sub');
  const total = await rows.count();
  const result = [];
  for (let i = 0; i < total; i++) {
    const text = ((await rows.nth(i).textContent()) || '').trim();
    const idx = text.indexOf(':');
    result.push({
      currency: idx >= 0 ? text.slice(0, idx).trim() : '',
      value: idx >= 0 ? text.slice(idx + 1).trim() : '',
      text,
    });
  }
  return result;
}

function chartContainer(page) {
  return page.locator('.chart-grid');
}

function echartCanvas(page, index) {
  return chartContainer(page).locator('.echarts-canvas, canvas').nth(index);
}

async function expectChartsRendered(page, count) {
  const canvases = chartContainer(page).locator('canvas');
  await expect(canvases).toHaveCount(count);
}

// ====== 缓存 Token 时序图表 ======
// 设计依据：Overview.vue cacheTokensOption / chartOptionsLine / .chart-empty 空态

/**
 * 按标题定位总览页中的图表卡
 */
function chartCardByTitle(page, title) {
  return chartContainer(page)
    .locator('.chart-card')
    .filter({ has: page.locator('h4', { hasText: title }) });
}

function chartCardCanvas(page, title) {
  return chartCardByTitle(page, title).locator('canvas');
}

function chartCardEmpty(page, title) {
  return chartCardByTitle(page, title).locator('.chart-empty');
}

function cacheTokensChartCard(page) {
  return chartCardByTitle(page, CACHE_TOKENS_CHART_TITLE);
}

function cacheTokensChartCanvas(page) {
  return cacheTokensChartCard(page).locator('canvas');
}

function cacheTokensChartEmpty(page) {
  return cacheTokensChartCard(page).locator('.chart-empty');
}

/**
 * 切换缓存 Token 图例显隐。ECharts 图例渲染在 canvas 上（无 DOM 图例条目），
 * dispatchAction(legendToggleSelect) 与用户点击图例触发同一处理路径
 */
async function toggleCacheTokensLegend(page, name) {
  const ok = await page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return false;
    var chartVm = (vm.$children || []).filter(function (c) {
      return c.$options && c.$options.name === 'Echarts';
    })[0];
    if (!chartVm || !chartVm.chart) return false;
    chartVm.chart.dispatchAction({ type: 'legendToggleSelect', name: ${JSON.stringify(name)} });
    return true;
    })()`,
  );
  if (!ok) {
    throw new Error('未找到缓存 Token 图表实例，无法切换图例');
  }
  await page.waitForTimeout(300);
}

async function expectCacheTokensChartTitle(page) {
  const card = cacheTokensChartCard(page);
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.locator('h4')).toContainText(CACHE_TOKENS_CHART_TITLE);
}

/**
 * 等待缓存 Token 图表卡渲染出 canvas（有数据）或空态（无数据）
 */
async function waitForCacheTokensChart(page, { expectEmpty = false } = {}) {
  await expectCacheTokensChartTitle(page);
  if (expectEmpty) {
    await expect(cacheTokensChartEmpty(page)).toBeVisible({ timeout: 15000 });
    await expect(cacheTokensChartEmpty(page)).toHaveText(NO_DATA_TEXT);
    return;
  }
  await expect(cacheTokensChartCanvas(page)).toBeVisible({ timeout: 15000 });
}

/**
 * 在页面 Vue 组件树中查找 ReportOverview 组件实例（在浏览器上下文内使用）
 */
function findOverviewVmSource() {
  return `(function () {
    var root = document.querySelector('.report-page');
    if (!root || !root.__vue__) return null;
    var found = null;
    var walk = function (vm) {
      if (!vm || found) return;
      if (vm.$options && vm.$options.name === 'ReportOverview') { found = vm; return; }
      (vm.$children || []).forEach(walk);
    };
    walk(root.__vue__);
    return found;
  })()`;
}

/**
 * 读取缓存 Token 时序图的 ECharts option 计算结果（纯数据快照）
 * @returns {Promise<{hasSeries, legendData, legendBottom, tooltipTrigger,
 *   xAxisType, xAxisData, yAxisName, series, rawSeries, loading}|null>}
 */
async function getCacheTokensChartState(page) {
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    var opt = vm.cacheTokensOption || {};
    return {
      hasSeries: !!opt.series,
      legendData: opt.legend ? opt.legend.data : null,
      legendBottom: opt.legend ? opt.legend.bottom : null,
      tooltipTrigger: opt.tooltip ? opt.tooltip.trigger : null,
      xAxisType: opt.xAxis ? opt.xAxis.type : null,
      xAxisData: opt.xAxis ? opt.xAxis.data : null,
      yAxisName: opt.yAxis ? opt.yAxis.name : null,
      series: (opt.series || []).map(function (s) {
        return { name: s.name, type: s.type, smooth: s.smooth, symbol: s.symbol, data: s.data };
      }),
      rawSeries: ((vm.timeseriesData || {}).cache_tokens || {}).series || null,
      loading: vm.loading,
    };
    })()`,
  );
}

/**
 * 通过 Echarts 子组件实例读取图例选中状态（点击图例切换显隐后断言）
 * @returns {Promise<{data, selected}|null>} selected 中未出现的条目视为显示
 */
async function getCacheTokensLegendSelected(page) {
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    var chartVm = (vm.$children || []).filter(function (c) {
      return c.$options && c.$options.name === 'Echarts';
    })[0];
    if (!chartVm || !chartVm.chart) return null;
    var legend = (chartVm.chart.getOption().legend || [])[0];
    if (!legend) return null;
    return { data: legend.data || null, selected: legend.selected || null };
    })()`,
  );
}

/**
 * 直接修改 ReportOverview.timeseriesData.cache_tokens（经 Vue 响应式触发
 * cacheTokensOption 重算），用于构造单 kind / 缺失点等确定性场景
 */
async function setCacheTokensSeries(page, series) {
  await page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return false;
    var ts = Object.assign({}, vm.timeseriesData);
    ts.cache_tokens = { bucket_sec: 60, series: ${JSON.stringify(series)} };
    vm.timeseriesData = ts;
    return true;
    })()`,
  );
  await page.waitForTimeout(300);
}

/**
 * Mock report/timeseries 请求。同 URL 只允许注册一个 route，因此按 metric 分发：
 * 命中的 metric 走 fulfill，未配置的 metric 照常放行（route.continue）。
 * 带拆分维度（dimension）的下钻断言用 `metric|dimension` 键区分，优先命中；
 * 未配置该键时回退到 `metric` 键（无 dimension 请求与既有用例不受影响）。
 * @param {Object} mocks - { [metric]: {series?, status?, delay?, errMsg?} }
 *   或 { ['metric|dimension']: {...} }
 */
async function mockReportTimeseries(page, mocks = {}) {
  await page.route(TIMESERIES_URL_RE, async (route) => {
    const url = new URL(route.request().url());
    const metric = url.searchParams.get('metric');
    const dimension = url.searchParams.get('dimension') || '';
    const mock = mocks[`${metric}|${dimension}`] || mocks[metric];
    if (!mock) {
      await route.continue();
      return;
    }
    const delay = mock.delay || 0;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    if (!mock.status || mock.status === 200) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          ErrMsg: '',
          Data: { bucket_sec: mock.bucket_sec || 60, series: mock.series || [] },
        }),
      });
      return;
    }
    await route.fulfill({
      status: mock.status,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: mock.status,
        ErrMsg: mock.errMsg || 'InternalError: mock timeseries failure',
        Data: null,
      }),
    });
  });
}

/**
 * 仅 Mock metric=cache_tokens 的时序请求，其余 metric 照常放行
 */
async function mockCacheTokensTimeseries(page, options = {}) {
  await mockReportTimeseries(page, { [CACHE_TOKENS_METRIC]: options });
}

async function waitForCacheTokensTimeseriesResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => {
        if (r.request().method() !== 'GET') return false;
        if (!TIMESERIES_URL_RE.test(r.url())) return false;
        try {
          return (
            new URL(r.url()).searchParams.get('metric') === CACHE_TOKENS_METRIC
          );
        } catch (e) {
          return false;
        }
      },
      { timeout },
    ),
    action ? action() : Promise.resolve(),
  ]);
  return response;
}

/**
 * 断言 iView $Notice 错误通知出现（响应拦截器对非 2xx 且未带 unneedTips 的请求弹出）
 */
async function expectErrorNotice(page, text) {
  const notice = page.locator('.ivu-notice-notice').filter({ hasText: text });
  await expect(notice.first()).toBeVisible({ timeout: 10000 });
}

// ====== 排行与分布新维度（RP-R-01 ~ RP-R-12） ======
// 设计依据：docs/report/02-功能测试用例/03-排行与分布新维度.md

/**
 * 近 N 小时时间窗（unix 秒），与页面默认「1 小时」快捷范围一致
 */
function lastHourRange(offsetSec = 3600) {
  const end = Math.floor(Date.now() / 1000);
  return { start: end - offsetSec, end };
}

/**
 * 解析登录 sessionKey：优先取页面 localStorage（同源已注入），
 * 否则回退 auth.json（API 用例不导航页面时）
 */
async function getReportSessionKey(page) {
  try {
    const userStr = await page.evaluate(() => localStorage.getItem('user'));
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user && user.sessionKey) return user.sessionKey;
    }
  } catch (e) {
    /* ignore */
  }
  const session = readSessionFromAuthFile();
  return session && session.sessionKey ? session.sessionKey : '';
}

/**
 * 经页面会话（page.request，携带登录 session）直接请求 report OpenAPI。
 * @returns {Promise<{status: number, body: object|null}>}
 */
async function reportApiGetRaw(page, path, params = {}) {
  const url = new URL(reportApi.getOpenApiBaseUrl() + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const sessionKey = await getReportSessionKey(page);
  const headers = { 'Content-Type': 'application/json' };
  if (sessionKey) headers.Authorization = 'Session ' + sessionKey;
  const res = await page.request.get(url.toString(), { headers });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    /* 非 JSON 响应 */
  }
  return { status: res.status(), body };
}

/**
 * GET report/rankings?dimension=...（返回 HTTP 状态码与完整响应体）
 */
async function getReportRankingsRaw(page, dimension, params = {}) {
  return reportApiGetRaw(page, '/report/rankings', { ...params, dimension });
}

/**
 * GET report/distribution?dimension=...（返回 HTTP 状态码与完整响应体）
 */
async function getReportDistributionRaw(page, dimension, params = {}) {
  return reportApiGetRaw(page, '/report/distribution', { ...params, dimension });
}

/**
 * GET report/timeseries?metric=...&dimension=...（返回 HTTP 状态码与完整响应体）
 */
async function getReportTimeseriesRaw(page, metric, params = {}) {
  return reportApiGetRaw(page, '/report/timeseries', { ...params, metric });
}

/**
 * Mock report/rankings 请求。同 URL 只允许注册一个 route，因此按 dimension 分发：
 * 命中的 dimension 走 fulfill，未配置的 dimension 照常放行（route.continue）
 * @param {Object} mocks - { [dimension]: { items?, status?, errMsg? } }
 *   items  - RankingItem 列表（默认 []）
 *   status - 非 200 时返回的错误 HTTP 状态码
 */
async function mockReportRankings(page, mocks = {}) {
  await page.route(RANKINGS_URL_RE, async (route) => {
    const url = new URL(route.request().url());
    const dimension = url.searchParams.get('dimension');
    const mock = mocks[dimension];
    if (!mock) {
      await route.continue();
      return;
    }
    if (!mock.status || mock.status === 200) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          ErrMsg: '',
          Data: { items: mock.items || [] },
        }),
      });
      return;
    }
    await route.fulfill({
      status: mock.status,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: mock.status,
        ErrMsg: mock.errMsg || 'InternalError: mock rankings failure',
        Data: null,
      }),
    });
  });
}

/**
 * 「意图答案」维度过滤下拉（index.vue filters.intent_answer，单选 Select）
 */
function intentAnswerSelect(page) {
  return new IvuSelectComponent(page, multiSelectFilter(page, INTENT_ANSWER_LABEL));
}

/**
 * 展开「意图答案」下拉并读取选项文案列表（读取后收起下拉）
 */
async function getIntentAnswerDropdownOptions(page) {
  const select = intentAnswerSelect(page);
  await select.trigger.click();
  await page.waitForTimeout(300);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const texts = (await items.allTextContents()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return texts;
}

/**
 * RP-R-09：筛选栏无 Doris 门控提示（.doris-hint 节点已下线，
 * i18n report.dorisNewDimHint 已删除）
 */
async function expectNoDorisHint(page) {
  await expect(page.locator('.doris-hint')).toHaveCount(0);
  await expect(filterBar(page)).not.toContainText('dorisNewDimHint');
  await expect(filterBar(page)).not.toContainText('MySQL 后端支持');
  await expect(filterBar(page)).not.toContainText('Doris');
}

/**
 * RP-R-11：请求成功（或静默放行）时页面不弹出 iView $Notice 错误通知。
 * 先等待片刻以覆盖异步通知弹出窗口
 */
async function expectNoErrorNotice(page) {
  await page.waitForTimeout(1500);
  await expect(page.locator('.ivu-notice-notice')).toHaveCount(0);
}

// ====== 明细列表 ======

async function waitForReportLogsResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        LOGS_URL_RE.test(r.url()) &&
        r.status() === 200,
      { timeout },
    ),
    action(),
  ]);
  return response;
}

async function waitForReportOverviewResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        OVERVIEW_URL_RE.test(r.url()) &&
        r.status() === 200,
      { timeout },
    ),
    action(),
  ]);
  return response;
}

async function reloadReportPage(page) {
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expectReportPageReady(page);
}

/**
 * 明细过滤 - 请求模型 (Logs.vue 使用 <i-Input> 输入框，label = "请求模型")
 * 注意：不能用 DOC.filterLabels.model ('目标模型') 做 hasText 去定位顶部过滤栏的模型多选框，
 * 以免与明细工具栏的「请求模型」输入框混淆。
 */
function requestedModelInput(page) {
  return page.locator('.report-filter-item')
    .filter({ has: page.locator('label', { hasText: '请求模型' }) })
    .locator('input')
    .first();
}

async function filterByRequestedModel(page, modelName) {
  const input = requestedModelInput(page);
  return waitForReportLogsResponse(page, async () => {
    await input.click({ clickCount: 3 });
    await input.fill(modelName);
    await triggerLogsSearch(page);
  });
}

/**
 * 明细过滤 - 仅错误 (Logs.vue 使用 <Select>，选"是" = true / "否" = false)
 * @param {boolean} enable - true 选"是"，false 选"否"
 */
async function toggleErrOnly(page, enable = true) {
  const errOnlyFilterItem = page.locator('.report-filter-item')
    .filter({ has: page.locator('label', { hasText: DOC.errOnlyLabel }) });
  const select = new IvuSelectComponent(page, errOnlyFilterItem.locator('.ivu-select').first());
  return waitForReportLogsResponse(page, async () => {
    await select.selectOption(enable ? DOC.streamOptions.yes : DOC.streamOptions.no);
    await triggerLogsSearch(page);
  });
}

/**
 * 明细过滤 - 关键字搜索 (Logs.vue 使用 <i-Input>，需点击查询按钮触发搜索)
 */
async function searchByKeyword(page, keyword) {
  const input = page.getByPlaceholder(DOC.keywordPlaceholder);
  return waitForReportLogsResponse(page, async () => {
    await input.click({ clickCount: 3 });
    await input.fill(keyword);
    await triggerLogsSearch(page);
  });
}

/**
 * 点击日志工具栏的查询按钮
 */
async function triggerLogsSearch(page) {
  const btn = page.locator('.report-filter-actions').getByRole('button', { name: DOC.queryButton });
  if ((await btn.count()) > 0) {
    await btn.click({ force: true });
  } else {
    await page.getByRole('button', { name: DOC.queryButton }).click({ force: true });
  }
  await page.waitForTimeout(500);
}

// ====== 详情 Drawer ======

/**
 * 详情 Drawer 字段项标签（按模板顺序，与 Logs.vue 详情 38 个 detail-item 一致）
 * 来源：docs/report/02-功能测试用例/04-明细新列与过滤.md RP-L-21
 */
const DETAIL_FIELD_LABELS = [
  '日志ID',
  '时间',
  '主机ID',
  '产品线',
  'API Key',
  '请求模型',
  '目标模型',
  '服务商',
  '协议',
  '模式',
  '流式',
  '状态码',
  '错误码',
  '错误',
  '输入Tokens',
  '输出Tokens',
  '总Tokens',
  '耗时',
  'TTFT',
  'TPOT',
  '费用',
  '一级归类',
  '二级归类',
  '三级归类',
  '四级归类',
  '五级归类',
  '客户端IP',
  'Header Host',
  '原始URI',
  '缓存状态',
  '镜像命中',
  '意图问题',
  '意图答案',
  '意图置信度',
  '意图来源',
  '意图延迟',
  '意图缓存命中',
  '意图问题版本',
];

/**
 * 详情 Drawer JSON 区块字段名（与 Logs.vue jsonFields 顺序一致，仅非 null 时渲染）
 */
const DETAIL_JSON_FIELDS = [
  'ai_rate_limit_hits',
  'ai_auth_reject_quota_plans',
  'req_headers',
  'res_headers',
];

/**
 * 明细主表数据行（iView 的 fixed-right「操作」列会渲染克隆表，须限定主表）
 */
function reportLogsMainRows(page) {
  return page.locator(
    '.report-page .page-table .ivu-table-body tbody tr:not(:has-text("暂无筛选结果")):not(:has-text("暂无数据"))',
  );
}

/**
 * 明细行「详情」按钮：iView 把 fixed-right「操作」列渲染为克隆表（主表 td 内有「详情」
 * 文本但按钮不可见），可见按钮只存在于克隆表，故按可见按钮序号定位，序号即行序
 */
function logRowDetailButton(page, index = 0) {
  return page
    .locator('.report-page .page-table')
    .getByRole('button', { name: DOC.detailButton })
    .nth(index);
}

async function openDetailByRowText(page, rowText) {
  const row = page
    .locator('.report-page .page-table .ivu-table-fixed-right tbody tr')
    .filter({ hasText: rowText })
    .first();
  await row.getByRole('button', { name: DOC.detailButton }).click();
  await page.waitForTimeout(500);
}

/**
 * 按行序号打开详情抽屉（表格不显示 logid，mock 行常共享模型名，故按序号定位）
 */
async function openDetailByRowIndex(page, index = 0) {
  await logRowDetailButton(page, index).click();
  await expectDetailDrawerOpen(page);
}

async function expectDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DOC.drawerTitle);
}

function detailDrawer(page) {
  return ivuDrawer(page).withTitle(DOC.drawerTitle);
}

/**
 * 按 dt 标签精确定位字段项：避免「错误」命中「错误码」、「意图问题」命中「意图问题版本」等子串歧义
 */
function detailFieldItem(page, label) {
  return detailDrawer(page)
    .locator('.detail-item')
    .filter({ has: page.locator(`dt:text-is("${label}")`) })
    .first();
}

async function getDetailFieldValue(page, label) {
  const text = await detailFieldItem(page, label).locator('dd').innerText();
  return text.trim();
}

async function getDetailFieldLabels(page) {
  const texts = await detailDrawer(page).locator('.detail-item dt').allInnerTexts();
  return texts.map((text) => text.trim());
}

async function expectDetailFieldValue(page, label, value) {
  await expect(
    detailFieldItem(page, label).locator('dd'),
    `详情字段「${label}」展示值`,
  ).toHaveText(String(value));
}

async function expectDetailFieldsPresent(page, labels = DETAIL_FIELD_LABELS) {
  for (const label of labels) {
    await expect(
      detailFieldItem(page, label),
      `详情抽屉应包含字段项「${label}」`,
    ).toHaveCount(1);
  }
}

async function expectDetailFieldsAbsent(page, labels) {
  for (const label of labels) {
    await expect(
      detailFieldItem(page, label),
      `详情抽屉不应包含字段项「${label}」`,
    ).toHaveCount(0);
  }
}

async function expectDetailFieldContains(page, label, text) {
  await expect(detailFieldItem(page, label)).toContainText(String(text));
}

async function expectDetailFieldNotVisible(page, label) {
  await expect(detailFieldItem(page, label)).toHaveCount(0);
}

async function closeDetailDrawer(page) {
  await ivuDrawer(page).closeByX(DOC.drawerTitle);
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

async function closeDetailDrawerByMask(page) {
  // 该 Drawer 配置了 maskClosable=false，点击遮罩区不应关闭 Drawer。
  // iView 的命中测试落在 .ivu-drawer-wrap 本体（遮罩不参与命中），点选左侧空白区
  // 等价于用户点击遮罩：wrapClosable 时该点击才会关闭抽屉，故断言非空转。
  await page
    .locator(IVU_DRAWER_VISIBLE)
    .first()
    .click({ position: { x: 100, y: 300 } });
  await page.waitForTimeout(300);
  await expect(detailDrawer(page)).toBeVisible({ timeout: 5000 });
  // 通过 X 按钮关闭以清理
  await ivuDrawer(page).closeByX(DOC.drawerTitle);
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

function detailJsonSection(page, field) {
  return detailDrawer(page)
    .locator('.detail-json-item')
    .filter({ has: page.locator(`.detail-json-label:text-is("${field}")`) })
    .first();
}

async function getDetailJsonLabels(page) {
  const texts = await detailDrawer(page)
    .locator('.detail-json-item .detail-json-label')
    .allInnerTexts();
  return texts.map((text) => text.trim());
}

function detailJsonHeader(page, field) {
  return detailJsonSection(page, field).locator('.detail-json-header');
}

function detailJsonContent(page, field) {
  return detailJsonSection(page, field).locator('.detail-json-content pre');
}

async function toggleJsonField(page, field) {
  await detailJsonHeader(page, field).click();
  await page.waitForTimeout(200);
}

async function expectJsonFieldExpanded(page, field) {
  await expect(detailJsonContent(page, field).first()).toBeVisible();
}

async function expectJsonFieldCollapsed(page, field) {
  await expect(detailJsonContent(page, field).first()).toBeHidden();
}

async function getDetailDrawerText(page) {
  return (await detailDrawer(page).innerText()).trim();
}

async function expectJsonFieldCollapsible(page, fieldLabel) {
  const section = detailJsonSection(page, fieldLabel);
  const header = detailJsonHeader(page, fieldLabel);
  // 默认折叠（v-show 隐藏，仅显示箭头 + 字段名）
  await expect(detailJsonContent(page, fieldLabel).first()).toBeHidden();
  await expect(
    section.locator('.ivu-icon-ios-arrow-forward').first(),
  ).toBeVisible();
  // 点击标题展开：箭头转为 down，内容区 pre 可见
  await toggleJsonField(page, fieldLabel);
  await expect(
    section.locator('.ivu-icon-ios-arrow-down').first(),
  ).toBeVisible();
  await expect(detailJsonContent(page, fieldLabel).first()).toBeVisible();
  // 再次点击折叠
  await header.click();
  await page.waitForTimeout(200);
  await expect(detailJsonContent(page, fieldLabel).first()).toBeHidden();
}

// ====== 维度过滤（共有过滤栏） ======

function multiSelectFilter(page, label) {
  return page
    .locator('.report-filter-bar .report-filter-item')
    .filter({ has: page.locator('label', { hasText: label }) })
    .locator('.ivu-select')
    .first();
}

async function selectMultiFilterOption(page, label, option) {
  const select = new IvuSelectComponent(page, multiSelectFilter(page, label));
  return select.selectOptionExact(option);
}

function streamSelect(page) {
  return new IvuSelectComponent(
    page,
    page.locator('.report-filter-item').filter({
      has: page.locator('label', { hasText: DOC.filterLabels.stream }),
    }).locator('.ivu-select').first(),
  );
}

async function selectStreamFilter(page, value) {
  return streamSelect(page).selectOptionExact(value);
}

function statusCodeInput(page) {
  return page
    .locator('.report-filter-item')
    .filter({ has: page.locator('label', { hasText: DOC.filterLabels.statusCode }) })
    .locator('input')
    .first();
}

async function setStatusCodeFilter(page, value) {
  // 优先通过 Vue 响应式数据直接设置，确保 buildFilterParams() 能读取到
  await page.evaluate((val) => {
    const el = document.querySelector('.report-page');
    if (el && el.__vue__) {
      el.__vue__.filters.status_codes = val;
    }
  }, value);
  // 也在 DOM 输入框中填充，保持 UI 同步
  const input = statusCodeInput(page);
  if ((await input.count()) > 0) {
    await input.click({ clickCount: 3 });
    await input.fill(value);
    await input.blur();
  }
  await page.waitForTimeout(300);
}

// ====== 字段校验与后端门控（RP-V-01 ~ RP-V-15） ======
// 设计依据：docs/report/02-功能测试用例/05-字段校验与后端门控.md

// i18n report.timeRangeInvalid / report.timeRangeExceeded / report.keywordTooLong（zh）
const TIME_RANGE_INVALID_TEXT = '查询时间范围不合法，请重新选择';
const TIME_RANGE_EXCEEDED_TEXT = '查询时间跨度不能超过 7 天';
const KEYWORD_TOO_LONG_TEXT = '关键词长度不能超过 128 字符';
// index.vue MAX_WINDOW_MS（与后端 ireport.MaxWindow 一致）
const MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;
// 明细工具栏「意图来源」下拉（Logs.vue intentSource）
const INTENT_SOURCE_LABEL = '意图来源';
const REPORT_API_URL_RE = /\/open-api\/v1\/report\//;

/**
 * $Message.error 渲染于 .ivu-message-notice（区别于 $Notice 的 .ivu-notice-notice），
 * iView Message 默认约 1.5s 自动消失，故用 waitFor 尽快捕获
 */
async function expectMessageError(page, text) {
  const msg = page.locator('.ivu-message-notice', { hasText: text }).first();
  await msg.waitFor({ state: 'visible', timeout: 8000 });
}

/**
 * 断言**未**弹出指定文案的 $Message.error。
 * 用于「按设计不应提示」的场景（如 2026-10-14 起单个图表请求失败只降级为该图表空态，
 * 不进入 load() 全局 catch）。调用前页面须已 settled，否则提示可能尚未入 DOM；
 * settleMs 提供一个短等待兜底。
 */
async function expectNoMessageError(page, text, settleMs = 500) {
  if (settleMs > 0) await page.waitForTimeout(settleMs);
  await expect(
    page.locator('.ivu-message-notice', { hasText: text }),
  ).toHaveCount(0);
}

/**
 * 读取 Report 根组件当前时间范围（vm.startTime / vm.endTime 毫秒时间戳，null 表示未填充）
 * @returns {Promise<{start: number|null, end: number|null, shortcut: string}|null>}
 */
async function getReportTimeRange(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.report-page');
    if (!el || !el.__vue__) return null;
    const vm = el.__vue__;
    const t = (d) => {
      if (!d) return null;
      const time = new Date(d).getTime();
      return isNaN(time) ? null : time;
    };
    return { start: t(vm.startTime), end: t(vm.endTime), shortcut: vm.shortcut };
  });
}

/**
 * 直接写 Report 根组件的 startTime / endTime（毫秒时间戳，null 表示清空），
 * 与 setFilterDateTime 同源（经 Vue 响应式触发校验逻辑），支持任意窗口与清空场景
 */
async function setReportTimeByVm(page, { start, end } = {}) {
  await page.evaluate(
    ({ start, end }) => {
      const el = document.querySelector('.report-page');
      if (!el || !el.__vue__) return;
      const vm = el.__vue__;
      const toDate = (ms) => (ms === null || ms === undefined ? null : new Date(ms));
      if (start !== undefined) vm.startTime = toDate(start);
      if (end !== undefined) vm.endTime = toDate(end);
    },
    { start, end },
  );
  await page.waitForTimeout(300);
}

/**
 * 快捷时间按钮当前选中态（index.vue :type="shortcut === opt.value ? 'primary' : 'default'"）
 */
async function expectActiveQuickTime(page, label) {
  const btn = quickTimeButton(page, label);
  await expect(btn).toHaveClass(/ivu-btn-primary/);
}

/**
 * 追踪页面发起的 report OpenAPI 请求（用于「不发起请求」类断言）
 * @returns {{urls: string[]}} 持续累积的 URL 列表
 */
function trackReportApiRequests(page) {
  const tracker = { urls: [] };
  page.on('request', (req) => {
    if (req.method() !== 'GET') return;
    if (REPORT_API_URL_RE.test(req.url())) tracker.urls.push(req.url());
  });
  return tracker;
}

/**
 * 等待异步请求发起窗口结束后，断言 tracker 自 before 起无新增 report 请求
 */
async function expectNoNewReportRequests(page, tracker, before = 0) {
  await page.waitForTimeout(1500);
  expect(tracker.urls.length).toBe(before);
}

/**
 * GET report/overview（返回 HTTP 状态码与完整响应体）
 */
async function getReportOverviewRaw(page, params = {}) {
  return reportApiGetRaw(page, '/report/overview', params);
}

/**
 * GET report/logs（返回 HTTP 状态码与完整响应体）
 */
async function getReportLogsRaw(page, params = {}) {
  return reportApiGetRaw(page, '/report/logs', params);
}

/**
 * 未认证请求（不带 Authorization 头）report OpenAPI
 * @returns {Promise<{status: number, body: object|null}>}
 */
async function reportApiGetUnauth(page, path, params = {}) {
  const url = new URL(reportApi.getOpenApiBaseUrl() + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const res = await page.request.get(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    /* 非 JSON 响应 */
  }
  return { status: res.status(), body };
}

// ====== 总览指标卡（RP-O-02 ~ RP-O-13） ======
// 设计依据：docs/report/02-功能测试用例/01-总览指标卡.md
// 断言策略：数值类断言优先注入受控 overviewData（mock / 写 Vue vm），保证确定性

// 总览指标卡文案（i18n report.*）
const CACHE_HIT_RATE_LABEL = '缓存命中率';
const MIRROR_HIT_LABEL = '镜像命中';
const INTENT_CLASSIFIED_LABEL = '意图分类';
const ERROR_TOTAL_LABEL = '错误总量';
const AVG_LATENCY_LABEL = '平均延迟';
const TOKEN_USAGE_LABEL = 'Token用量';
const REQUEST_TOTAL_LABEL = '请求总量';

/**
 * Mock GET report/overview，注入受控 overviewData（数值类断言保证确定性）
 * @param {Object} options - { data?, status?, errMsg?, delay? }
 *   data   - overview Data 对象（默认 {}， truthy 即渲染 8 张指标卡）
 *   status - 非 200 时返回的错误 HTTP 状态码（响应被 axios 拦截器消化，
 *            load() 走 status!==200 分支，不进入 .catch）
 */
async function mockReportOverview(page, options = {}) {
  const { data = {}, status, errMsg, delay } = options;
  await page.route(OVERVIEW_URL_RE, async (route) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    if (!status || status === 200) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 200, ErrMsg: '', Data: data }),
      });
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: status,
        ErrMsg: errMsg || 'InternalError: mock overview failure',
        Data: null,
      }),
    });
  });
}

/**
 * Mock report/distribution 请求。同 URL 只允许注册一个 route，按 dimension 分发：
 * 命中的 dimension 走 fulfill，未配置的 dimension 照常放行（route.continue）
 * @param {Object} mocks - { [dimension]: { items?, status?, errMsg? } }
 */
async function mockReportDistribution(page, mocks = {}) {
  await page.route(DISTRIBUTION_URL_RE, async (route) => {
    const url = new URL(route.request().url());
    const dimension = url.searchParams.get('dimension');
    const mock = mocks[dimension];
    if (!mock) {
      await route.continue();
      return;
    }
    if (!mock.status || mock.status === 200) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          ErrMsg: '',
          Data: { items: mock.items || [] },
        }),
      });
      return;
    }
    await route.fulfill({
      status: mock.status,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: mock.status,
        ErrMsg: mock.errMsg || 'InternalError: mock distribution failure',
        Data: null,
      }),
    });
  });
}

/**
 * 读取指标卡副文案列表（.metric-sub 逐行文本，trim）
 * @returns {Promise<string[]>}
 */
async function getMetricCardSubs(page, label) {
  const subs = metricsCard(page, label).locator('.metric-sub');
  const texts = await subs.allTextContents();
  return texts.map((t) => t.trim());
}

/**
 * 读取指标卡网格布局与单卡样式（getComputedStyle 快照）
 * @returns {Promise<{cardCount, gridTemplateColumns, columnGap, rowGap,
 *   cardPadding, cardBorderRadius, cardBackground, errorValueColor}|null>}
 */
async function getMetricCardsLayout(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.report-overview .metric-cards');
    if (!grid) return null;
    const cs = getComputedStyle(grid);
    const cards = Array.from(grid.querySelectorAll('.metric-card'));
    const cardStyle = cards.length ? getComputedStyle(cards[0]) : null;
    const errorCard = grid.querySelector('.metric-card.error');
    const errorValue = errorCard
      ? errorCard.querySelector('.metric-value')
      : null;
    const errorValueStyle = errorValue ? getComputedStyle(errorValue) : null;
    return {
      cardCount: cards.length,
      gridTemplateColumns: cs.gridTemplateColumns,
      columnGap: cs.columnGap,
      rowGap: cs.rowGap,
      cardPadding: cardStyle ? cardStyle.padding : null,
      cardBorderRadius: cardStyle ? cardStyle.borderRadius : null,
      cardBackground: cardStyle ? cardStyle.backgroundColor : null,
      errorValueColor: errorValueStyle ? errorValueStyle.color : null,
    };
  });
}

/**
 * 直接写 ReportOverview.overviewData（经 Vue 响应式触发模板重渲染），
 * 用于同页构造「字段缺失 / null / 0 值」等确定性场景
 */
async function setOverviewData(page, data) {
  const ok = await page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return false;
    vm.overviewData = ${JSON.stringify(data)};
    return true;
    })()`,
  );
  if (!ok) {
    throw new Error('未找到 ReportOverview 组件实例，无法写入 overviewData');
  }
  await page.waitForTimeout(300);
}

/**
 * 读取 ReportOverview 组件状态快照
 * @returns {Promise<{loading, hasOverviewData}|null>}
 */
async function getOverviewVmState(page) {
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    return { loading: vm.loading, hasOverviewData: !!vm.overviewData };
    })()`,
  );
}

/**
 * 总览整页空态（report-empty，overviewData 为 null 时展示）
 */
function overviewEmptyState(page) {
  return page.locator('.report-overview .report-empty');
}

/**
 * 中断 GET report/overview（网络层失败）。axios 无 response 时
 * 拦截器 resolve(undefined)，Overview.load() 内 overviewRes.status 抛
 * TypeError → Promise.all 进入 .catch（console.error + $Message.error）
 */
async function abortReportOverview(page) {
  await page.route(OVERVIEW_URL_RE, (route) => route.abort());
}

/**
 * 仅中断某个 metric 的 report/timeseries 请求，其余 metric 照常放行。
 * 2026-10-14 起该 metric 由 Overview.loadTs(metric) 独立加载且内部 `.catch` 兜底，
 * 失败只表现为该图表空态（不进入 load() 全局 catch、不弹全局提示）。
 */
async function abortReportTimeseriesMetric(page, metric) {
  await page.route(TIMESERIES_URL_RE, (route) => {
    const m = new URL(route.request().url()).searchParams.get('metric');
    if (m === metric) {
      route.abort();
      return;
    }
    route.continue();
  });
}

// ====== 明细工具栏（Logs.vue，位于 .report-logs 而非共用筛选栏） ======

function logsToolbarItem(page, label) {
  return page
    .locator('.report-logs .report-filter-item')
    .filter({ has: page.locator('label', { hasText: label }) });
}

function keywordInput(page) {
  return page.getByPlaceholder(DOC.keywordPlaceholder);
}

async function fillKeyword(page, keyword) {
  const input = keywordInput(page);
  await input.click({ clickCount: 3 });
  await input.fill(keyword);
}

function intentSourceSelect(page) {
  return new IvuSelectComponent(page, logsToolbarItem(page, INTENT_SOURCE_LABEL).locator('.ivu-select').first());
}

/**
 * 展开「意图来源」下拉并读取选项文案列表（读取后收起下拉）
 */
async function getIntentSourceDropdownOptions(page) {
  const select = intentSourceSelect(page);
  await select.trigger.click();
  await page.waitForTimeout(300);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const texts = (await items.allTextContents()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return texts;
}

/**
 * 明细列表分页（pageTable el-pagination）当前每页条数展示值（如 "20条/页"）。
 * element-ui sizes 选择器选中项渲染在 input 的 value 中（innerText 为空）
 */
async function getLogsPageSizeText(page) {
  const sizes = reportLogsTable(page)
    .pagination()
    .locator('.el-pagination__sizes');
  const input = sizes.locator('input').first();
  if ((await input.count()) > 0) {
    const value = await input.inputValue().catch(() => '');
    if (value) return value.replace(/\s+/g, '');
  }
  return ((await sizes.innerText()) || '').replace(/\s+/g, '');
}

// ====== 明细新列与过滤（RP-L-01 ~ RP-L-10 / RP-L-15 ~ RP-L-17 / RP-L-24） ======
// 设计依据：docs/report/02-功能测试用例/04-明细新列与过滤.md

// 明细表 15 列标题（按 Logs.vue columns 固定顺序，i18n report.* / com.operation）
const LOG_TABLE_COLUMNS_15 = [
  '时间',
  'API Key',
  '请求模型',
  '目标模型',
  '服务商',
  '状态码',
  '耗时',
  'Tokens',
  'TTFT',
  '费用',
  '缓存',
  '镜像',
  '意图答案',
  '错误',
  '操作',
];
// 明细工具栏过滤项 label（Logs.vue logs-toolbar，i18n report.*）
const LOGS_TOOLBAR_LABELS = {
  cacheStatus: '缓存状态',
  mirrorHit: '镜像命中',
  intentQuestion: '意图问题',
  intentAnswer: '意图答案',
};
// i18n report.intentQuestionPlaceholder / intentAnswerPlaceholder
const INTENT_QUESTION_PLACEHOLDER = '模糊匹配 ai_intent_question';
const INTENT_ANSWER_PLACEHOLDER = '模糊匹配 ai_intent_answer';
// i18n report.cacheStatusHit / Miss / Skip、mirrorHitYes / No、intentSource*
const CACHE_STATUS_OPTIONS = ['hit', 'miss', 'skip'];
const MIRROR_HIT_OPTIONS = ['命中', '未命中'];
const ALL_OPTION_TEXT = '全部';

/**
 * Mock GET report/logs，注入受控 items（当前环境聚合表无分钟数据，
 * 列表展示类断言依赖 mock 保证确定性）。请求 Query 仍由前端真实组装，
 * 可经 waitForReportLogsResponse 返回的 response.url() 解析校验。
 * @param {Object} options - { items?, total?, page?, pageSize? }
 */
async function mockReportLogs(page, options = {}) {
  const { items = [], total, page: pageNo = 1, pageSize = 20 } = options;
  await page.route(LOGS_URL_RE, async (route) => {
    const q = new URL(route.request().url()).searchParams;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: 200,
        ErrMsg: 'success',
        Data: {
          total: total != null ? total : items.length,
          page: Number(q.get('page')) || pageNo,
          page_size: Number(q.get('page_size')) || pageSize,
          items,
        },
      }),
    });
  });
}

/**
 * 明细表头文本列表（.show-iView-Table .ivu-table thead，按固定列顺序）
 * @returns {Promise<string[]>}
 */
async function getLogsHeaderTexts(page) {
  const texts = await reportLogsTable(page)
    .rootLocator()
    .locator('.show-iView-Table .ivu-table th')
    .allTextContents();
  return texts.map((t) => t.trim()).filter((t) => t !== '');
}

/**
 * 读取明细第 rowIndex 行各单元格文本（trim）
 * @returns {Promise<string[]>}
 */
async function getLogsRowCellTexts(page, rowIndex) {
  const row = reportLogsTable(page).dataRows().nth(rowIndex);
  const texts = await row.locator('td').allTextContents();
  return texts.map((t) => t.trim());
}

/**
 * 明细主表某行的单元格文本（限定主表，排除 iView fixed-right 克隆行）
 */
async function getLogsMainRowCellTexts(page, rowIndex) {
  const texts = await reportLogsMainRows(page)
    .nth(rowIndex)
    .locator('td')
    .allTextContents();
  return texts.map((t) => t.trim());
}

/**
 * 明细列表信息行（.logs-info，i18n report.logsInfo：
 * 共 {total} 条，第 {page}/{pages} 页，每页 {size} 条）
 */
function logsInfoLine(page) {
  return page.locator('.report-logs .logs-info');
}

/**
 * 明细工具栏输入框（Logs.vue logs-toolbar，按 label 定位）
 */
function logsToolbarInput(page, label) {
  return logsToolbarItem(page, label).locator('input').first();
}

async function fillLogsToolbarInput(page, label, value) {
  const input = logsToolbarInput(page, label);
  await input.click({ clickCount: 3 });
  await input.fill(value);
}

/**
 * 明细工具栏下拉（缓存状态 / 镜像命中 / 意图来源）
 */
function logsToolbarSelect(page, label) {
  return new IvuSelectComponent(
    page,
    logsToolbarItem(page, label).locator('.ivu-select').first(),
  );
}

/**
 * 展开明细工具栏下拉并读取选项文案列表（读取后收起下拉）
 */
async function getLogsToolbarDropdownOptions(page, label) {
  const select = logsToolbarSelect(page, label);
  await select.trigger.click();
  await page.waitForTimeout(300);
  const texts = (
    await page.locator('.ivu-select-dropdown:visible .ivu-select-item').allTextContents()
  ).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return texts;
}

/**
 * 明细工具栏 clearable 下拉的占位文案（未选择时为「全部」）
 */
async function getLogsToolbarSelectPlaceholder(page, label) {
  const placeholder = logsToolbarItem(page, label)
    .locator('.ivu-select .ivu-select-selection .ivu-select-placeholder')
    .first();
  return ((await placeholder.textContent()) || '').trim();
}

/**
 * 执行动作（填写输入 / 选择下拉项）后点击「查询」，返回 report/logs 响应
 */
async function searchLogsToolbar(page, action) {
  return waitForReportLogsResponse(page, async () => {
    await action();
    await triggerLogsSearch(page);
  });
}

/**
 * 明细过滤 - 缓存状态（Logs.vue cacheStatus，选项 i18n hit/miss/skip）
 */
async function filterByCacheStatus(page, optionText) {
  return searchLogsToolbar(page, () =>
    logsToolbarSelect(page, LOGS_TOOLBAR_LABELS.cacheStatus).selectOptionExact(optionText),
  );
}

/**
 * 明细过滤 - 镜像命中（Logs.vue mirrorHit，选项「命中」/「未命中」）
 */
async function filterByMirrorHit(page, optionText) {
  return searchLogsToolbar(page, () =>
    logsToolbarSelect(page, LOGS_TOOLBAR_LABELS.mirrorHit).selectOptionExact(optionText),
  );
}

/**
 * 明细过滤 - 意图来源（Logs.vue intentSource，选项为枚举原值）
 */
async function filterByIntentSource(page, optionText) {
  return searchLogsToolbar(page, () =>
    logsToolbarSelect(page, INTENT_SOURCE_LABEL).selectOptionExact(optionText),
  );
}

/**
 * 明细过滤 - 意图问题 / 意图答案（Logs.vue Input，精确匹配）
 */
async function filterByToolbarInput(page, label, value) {
  return searchLogsToolbar(page, () => fillLogsToolbarInput(page, label, value));
}

/**
 * 清空明细工具栏 clearable 下拉（hover 显示清除图标后点击）
 */
async function clearLogsToolbarSelect(page, label) {
  const select = logsToolbarSelect(page, label);
  await select.trigger.hover();
  await page.waitForTimeout(300);
  // iView 3.3 清除图标类名为 ivu-icon-ios-close-circle（hover 后才渲染）
  const clearIcon = select.trigger.locator('.ivu-icon-ios-close-circle');
  await clearIcon.first().click({ force: true });
  await page.waitForTimeout(300);
}

/**
 * 清空下拉后点击「查询」，返回 report/logs 响应（用于「清空后不再携带参数」断言）
 */
async function clearLogsToolbarSelectAndSearch(page, label) {
  await clearLogsToolbarSelect(page, label);
  return waitForReportLogsResponse(page, () => triggerLogsSearch(page));
}

// ====== 图表维度下钻（RP-T-09 ~ RP-T-14 / RP-R-13 ~ RP-R-17） ======
// 设计依据：docs/report/02-功能测试用例/02-时序与缓存Token.md（RP-T-09~14）、
// 03-排行与分布新维度.md（RP-R-13~17）、06-过滤栏与页签.md（RP-F-09）

// 图表卡标题（i18n report.rankingTitle / shareTitle / distTitle，变更后不再写死维度）
const RANKING_CHART_TITLE = '排行';
const SHARE_CHART_TITLE = '占比';
const DIST_CHART_TITLE = '分布';
// 过滤栏行尾「拆分维度」选择器（i18n report.tsSplitDim + tsSplitNone / cacheStatus / mirrorHit / intentAnswer）
const TS_SPLIT_LABEL = '拆分维度';
const TS_SPLIT_NONE_LABEL = '不分维度';
const TS_SPLIT_OPTIONS = [
  { value: '', label: TS_SPLIT_NONE_LABEL },
  { value: 'ai_cache_status', label: '缓存状态' },
  { value: 'mirror_hit', label: '镜像命中' },
  { value: 'ai_intent_answer', label: '意图答案' },
];
// Overview.vue rankingDimOptions（10 项，顺序与实现一致）
const RANKING_DIM_OPTIONS = [
  { value: 'model', label: '目标模型' },
  { value: 'provider', label: '服务商' },
  { value: 'apikey', label: 'API Key' },
  { value: 'host', label: 'Host' },
  { value: 'status', label: '状态码' },
  { value: 'protocol', label: '协议' },
  { value: 'mode', label: '模式' },
  { value: 'ai_cache_status', label: '缓存状态' },
  { value: 'mirror_hit', label: '镜像命中' },
  { value: 'ai_intent_answer', label: '意图答案' },
];
// Overview.vue pieDimOptions（7 项，不含 provider/model/apikey/host——distribution 不支持）
const PIE_DIM_OPTIONS = [
  { value: 'status', label: '状态码' },
  { value: 'protocol', label: '协议' },
  { value: 'mode', label: '模式' },
  { value: 'stream', label: '流式' },
  { value: 'ai_cache_status', label: '缓存状态' },
  { value: 'mirror_hit', label: '镜像命中' },
  { value: 'ai_intent_answer', label: '意图答案' },
];
// distribution 的 dimension 枚举不含的四项（report.md §2.4，饼图下拉不暴露）
const PIE_UNSUPPORTED_DIMS = [
  { value: 'provider', label: '服务商' },
  { value: 'model', label: '目标模型' },
  { value: 'apikey', label: 'API Key' },
  { value: 'host', label: 'Host' },
];
// 两个饼图的默认维度（Overview.vue chartDims.pieProvider / pieStatus）
const PIE_DEFAULT_DIMS = { share: 'protocol', dist: 'status' };
// 时序图 y 轴 name（Overview.vue chartOptionsLine 第三参）
const TIMESERIES_Y_AXIS = {
  qps: 'req/s',
  tokens: 'tokens/s',
  latency: 'ms',
  cache_tokens: 'tokens',
};
// 拆分维度下 Token 图的值字段拼名（i18n report.input / output / total）
const TOKEN_SPLIT_FIELDS = ['输入', '输出', '总量'];
// 拆分维度下延迟图只拆 avg / max（i18n report.avg / max），接口带 dimension 时无分位数
const LATENCY_SPLIT_FIELDS = ['平均', '最大'];
// 维度桶名归一（Overview.vue dimBucketName，i18n report.mirrorHitYes / No / unknownBucket）
const MIRROR_HIT_BUCKET_NAMES = { 1: '命中', 0: '未命中' };
const UNKNOWN_BUCKET_NAME = '未知';
// 拆分维度作用的三张时序图（缓存 Token 图不参与）
const TS_SPLIT_METRICS = ['qps', 'tokens', 'latency'];

// ---- 过滤栏「拆分维度」 ----

function tsSplitFilterItem(page) {
  return filterBar(page)
    .locator('.report-filter-item')
    .filter({ has: page.locator('label', { hasText: TS_SPLIT_LABEL }) });
}

function tsSplitSelect(page) {
  return new IvuSelectComponent(page, tsSplitFilterItem(page).locator('.ivu-select').first());
}

/**
 * 展开「拆分维度」下拉，返回选项文案与当前选中项（读取后收起下拉）。
 * 注意：值为 '' 的「不分维度」在 iView Select 头部按空值渲染为占位文案
 * （.ivu-select-placeholder），选中态需从下拉项的 .ivu-select-item-selected 读取
 * @returns {Promise<{options: string[], selected: string|null}>}
 */
async function getTsSplitDropdownState(page) {
  const select = tsSplitSelect(page);
  await expect(select.trigger).toBeVisible({ timeout: 15000 });
  await select.trigger.click();
  await page.waitForTimeout(300);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const count = await items.count();
  const options = [];
  let selected = null;
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    options.push(((await item.textContent()) || '').trim());
    if (await item.evaluate((el) => el.classList.contains('ivu-select-item-selected'))) {
      selected = ((await item.textContent()) || '').trim();
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return { options, selected };
}

/**
 * 「拆分维度」下拉选项文案列表
 * @returns {Promise<string[]>}
 */
async function getTsSplitOptions(page) {
  return (await getTsSplitDropdownState(page)).options;
}

/**
 * 「拆分维度」选择器头部展示文案（未选择时为空值 → iView 渲染占位文案）
 */
async function getTsSplitHeadText(page) {
  const item = tsSplitFilterItem(page);
  const selected = item.locator('.ivu-select-selected-value').first();
  if ((await selected.count()) > 0 && (await selected.isVisible())) {
    return ((await selected.textContent()) || '').trim();
  }
  const placeholder = item.locator('.ivu-select-placeholder').first();
  if ((await placeholder.count()) > 0) {
    return ((await placeholder.textContent()) || '').trim();
  }
  return '';
}

/**
 * 「拆分维度」当前值（Report 根组件 tsSplit，'' 表示不分维度）
 */
async function getTsSplitValue(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.report-page');
    return el && el.__vue__ ? el.__vue__.tsSplit : null;
  });
}

async function selectTsSplit(page, optionText) {
  await tsSplitSelect(page).selectOptionExact(optionText);
  await page.waitForTimeout(300);
}

/**
 * RP-T-09：时序图区无独立「拆分维度」工具行（.ts-split-bar 已下线）
 */
async function expectNoTsSplitBar(page) {
  await expect(chartContainer(page).locator('.ts-split-bar')).toHaveCount(0);
  await expect(page.locator('.ts-split-bar')).toHaveCount(0);
}

/**
 * RP-T-09 / RP-F-09：过滤栏控件顺序（维度过滤区内 `.report-filter-item` 标签与按钮文案）
 * @returns {Promise<string[]>} 形如 ['模型','API Key',...,'拆分维度','查询','重置']
 */
async function getFilterBarControlSequence(page) {
  const item = tsSplitFilterItem(page);
  await expect(item).toBeVisible({ timeout: 15000 });
  return item.evaluate((el) => {
    const body = el.parentElement;
    return Array.from(body.children)
      .map((child) => {
        if (child.classList && child.classList.contains('report-filter-item')) {
          const label = child.querySelector('.filter-item-label');
          return label ? (label.textContent || '').trim() : '';
        }
        if (child.tagName === 'BUTTON') return (child.textContent || '').trim();
        return '';
      })
      .filter((text) => text !== '');
  });
}

/**
 * RP-F-09：过滤栏 `.filter-item-label` 文案列表
 * @returns {Promise<string[]>}
 */
async function getFilterBarItemLabels(page) {
  const labels = await filterBar(page)
    .locator('.report-filter-item .filter-item-label')
    .allTextContents();
  return labels.map((t) => t.trim());
}

/**
 * RP-F-09：过滤栏不含「缓存状态 / 镜像命中 / 意图答案」三个死控件
 */
async function expectNoDeadFilterItems(page) {
  for (const label of ['缓存状态', '镜像命中', '意图答案']) {
    await expect(filterItem(page, label).locator('.ivu-select')).toHaveCount(0);
  }
}

/**
 * RP-F-09 步骤 4：Report 根组件 filters 状态键（源码层无死状态读写）
 * @returns {Promise<string[]|null>} 已排序的键名
 */
async function getFilterStateKeys(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.report-page');
    if (!el || !el.__vue__ || !el.__vue__.filters) return null;
    return Object.keys(el.__vue__.filters).sort();
  });
}

// ---- 时序图 option 快照（QPS / Token / 延迟 / 缓存 Token） ----

/**
 * 读取指定时序图 ECharts option 快照（含拆分维度后的多序列）
 * @param {'qps'|'tokens'|'latency'|'cache_tokens'} metric
 * @returns {Promise<{hasSeries, legendData, xAxisData, yAxisName,
 *   series: {name: string, data: any[]}[], rawSeries, tsSplit, loading}|null>}
 */
async function getTimeseriesChartState(page, metric) {
  const key = JSON.stringify(metric);
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    var opts = { qps: vm.qpsOption, tokens: vm.tokensOption, latency: vm.latencyOption, cache_tokens: vm.cacheTokensOption };
    var opt = opts[${key}] || {};
    return {
      hasSeries: !!opt.series,
      legendData: opt.legend ? opt.legend.data : null,
      xAxisData: opt.xAxis ? opt.xAxis.data : null,
      yAxisName: opt.yAxis ? opt.yAxis.name : null,
      series: (opt.series || []).map(function (s) { return { name: s.name, data: s.data }; }),
      rawSeries: ((vm.timeseriesData || {})[${key}] || {}).series || null,
      tsSplit: vm.chartDims ? vm.chartDims.tsSplit : null,
      loading: vm.loading
    };
    })()`,
  );
}

// ---- 图表标题旁维度下拉（排行 / 占比 / 分布） ----

function chartDimSelect(page, title) {
  return new IvuSelectComponent(
    page,
    chartCardByTitle(page, title).locator('h4 .ivu-select').first(),
  );
}

/**
 * 展开图表卡标题旁的维度下拉，返回选项文案与当前选中项（读取后收起下拉）
 * @returns {Promise<{options: string[], selected: string|null}>}
 */
async function getChartDimDropdownState(page, title) {
  const select = chartDimSelect(page, title);
  await expect(select.trigger).toBeVisible({ timeout: 15000 });
  await select.trigger.click();
  await page.waitForTimeout(300);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const count = await items.count();
  const options = [];
  let selected = null;
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    options.push(((await item.textContent()) || '').trim());
    if (await item.evaluate((el) => el.classList.contains('ivu-select-item-selected'))) {
      selected = ((await item.textContent()) || '').trim();
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return { options, selected };
}

/**
 * 图表卡标题旁维度下拉的选项文案列表
 * @returns {Promise<string[]>}
 */
async function getChartDimOptions(page, title) {
  return (await getChartDimDropdownState(page, title)).options;
}

/**
 * 图表卡标题旁维度下拉当前头部展示文案（选中值 / 占位符）
 */
async function getChartDimSelectedText(page, title) {
  const h4 = chartCardByTitle(page, title).locator('h4');
  const selected = h4.locator('.ivu-select-selected-value').first();
  if ((await selected.count()) > 0 && (await selected.isVisible())) {
    return ((await selected.textContent()) || '').trim();
  }
  const placeholder = h4.locator('.ivu-select-placeholder').first();
  if ((await placeholder.count()) > 0) {
    return ((await placeholder.textContent()) || '').trim();
  }
  return '';
}

async function selectChartDim(page, title, optionText) {
  await chartDimSelect(page, title).selectOptionExact(optionText);
  await page.waitForTimeout(300);
}

/**
 * 图表卡标题文案（h4 文本，含维度下拉选中值）
 */
async function getChartCardTitle(page, title) {
  const h4 = chartCardByTitle(page, title).locator('h4').first();
  return ((await h4.textContent()) || '').replace(/\s+/g, ' ').trim();
}

// ---- 图表数据快照（排行 / 两个饼图） ----

/**
 * 排行图 option 快照（横向柱：yAxis.data 为维度桶名）
 * @returns {Promise<{hasSeries, categories, series, rawItems, vmDim}|null>}
 */
async function getRankingChartState(page) {
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    var opt = vm.rankingOption || {};
    return {
      hasSeries: !!opt.series,
      categories: opt.yAxis ? opt.yAxis.data : null,
      series: (opt.series || []).map(function (s) { return { name: s.name, data: s.data }; }),
      rawItems: ((vm.rankingData || {}).items || []).map(function (i) { return i.name; }),
      vmDim: vm.chartDims ? vm.chartDims.ranking : null
    };
    })()`,
  );
}

/**
 * 饼图 option 快照
 * @param {'share'|'dist'} key share = 「占比」饼（chartDims.pieProvider），
 *   dist = 「分布」饼（chartDims.pieStatus）
 * @returns {Promise<{hasSeries, data: {name: string, value: number}[], vmDim}|null>}
 */
async function getPieChartState(page, key) {
  const k = JSON.stringify(key);
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    var opt = (${k} === 'share' ? vm.shareOption : vm.distOption) || {};
    var series = (opt.series || [])[0] || {};
    return {
      hasSeries: !!opt.series,
      data: (series.data || []).map(function (d) { return { name: d.name, value: d.value }; }),
      vmDim: vm.chartDims ? (${k} === 'share' ? vm.chartDims.pieProvider : vm.chartDims.pieStatus) : null
    };
    })()`,
  );
}

/**
 * 读取 vm 中维度下拉的 value/label 全量（DOM 之外用于断言「不暴露不支持维度」的确定性来源）
 * @param {'ranking'|'share'|'dist'} kind
 * @returns {Promise<{value: string, label: string}[]|null>}
 */
async function getChartDimOptionPairs(page, kind) {
  const k = JSON.stringify(kind);
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm) return null;
    var pairs = function (list) {
      return list.map(function (o) { return { value: o.value, label: o.label }; });
    };
    if (${k} === 'ranking') return pairs(vm.rankingDimOptions);
    return pairs(vm.pieDimOptions(${k} === 'share' ? 'protocol' : 'status'));
    })()`,
  );
}

/**
 * ReportOverview.chartDims 快照（rankings / 两个饼图 / 拆分维度各自维度，用于「互不联动」断言）
 * @returns {Promise<{ranking, pieProvider, pieStatus, tsSplit}|null>}
 */
async function getChartDims(page) {
  return page.evaluate(
    `(function () {
    var vm = ${findOverviewVmSource()};
    if (!vm || !vm.chartDims) return null;
    return {
      ranking: vm.chartDims.ranking,
      pieProvider: vm.chartDims.pieProvider,
      pieStatus: vm.chartDims.pieStatus,
      tsSplit: vm.chartDims.tsSplit
    };
    })()`,
  );
}

// ---- 请求等待与追踪 ----

/**
 * 等待若干 report/timeseries 响应（可限定 dimension），与动作并行执行
 * @param {string[]} metrics
 * @param {Function} action
 * @param {{dimension?: string, timeout?: number}} options
 *   dimension 为 undefined 时只按 metric 匹配；传 '' 表示要求请求不带 dimension 参数
 * @returns {Promise<import('@playwright/test').Response[]>} 顺序与 metrics 一致
 */
async function waitForTimeseriesResponses(page, metrics, action, options = {}) {
  const { dimension, timeout = 15000 } = options;
  const waiters = metrics.map((metric) =>
    page.waitForResponse(
      (r) => {
        if (r.request().method() !== 'GET' || !TIMESERIES_URL_RE.test(r.url())) return false;
        let q;
        try {
          q = new URL(r.url()).searchParams;
        } catch (e) {
          return false;
        }
        if (q.get('metric') !== metric) return false;
        if (dimension === undefined) return true;
        return (q.get('dimension') || '') === (dimension || '');
      },
      { timeout },
    ),
  );
  const results = await Promise.all([...waiters, action ? action() : Promise.resolve()]);
  return results.slice(0, metrics.length);
}

/**
 * 等待 report/rankings 响应（可限定 dimension），与动作并行执行
 */
async function waitForRankingsResponse(page, action, options = {}) {
  const { dimension, timeout = 15000 } = options;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => {
        if (r.request().method() !== 'GET' || !RANKINGS_URL_RE.test(r.url())) return false;
        if (dimension === undefined) return true;
        try {
          return new URL(r.url()).searchParams.get('dimension') === dimension;
        } catch (e) {
          return false;
        }
      },
      { timeout },
    ),
    action(),
  ]);
  return response;
}

/**
 * 等待 report/distribution 响应（可限定 dimension），与动作并行执行
 */
async function waitForDistributionResponse(page, action, options = {}) {
  const { dimension, timeout = 15000 } = options;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => {
        if (r.request().method() !== 'GET' || !DISTRIBUTION_URL_RE.test(r.url())) return false;
        if (dimension === undefined) return true;
        try {
          return new URL(r.url()).searchParams.get('dimension') === dimension;
        } catch (e) {
          return false;
        }
      },
      { timeout },
    ),
    action(),
  ]);
  return response;
}

/**
 * 追踪页面发起的 report/timeseries 请求（含 metric / dimension）
 * @returns {{requests: {metric: string, dimension: string, url: string}[]}}
 */
function trackTimeseriesRequests(page) {
  const tracker = { requests: [] };
  page.on('request', (req) => {
    if (req.method() !== 'GET' || !TIMESERIES_URL_RE.test(req.url())) return;
    let q;
    try {
      q = new URL(req.url()).searchParams;
    } catch (e) {
      return;
    }
    tracker.requests.push({
      metric: q.get('metric'),
      dimension: q.get('dimension') || '',
      url: req.url(),
    });
  });
  return tracker;
}

/**
 * 等待异步请求发起窗口结束后，断言 tracker 自 before 起无新增 timeseries 请求
 */
async function expectNoNewTimeseriesRequests(page, tracker, beforeCount) {
  await page.waitForTimeout(1500);
  expect(tracker.requests.length).toBe(beforeCount);
}

/**
 * 从 tracker 中取某 metric 的请求（可选按 dimension 过滤）
 */
function filterTimeseriesRequests(tracker, metric, dimension) {
  return tracker.requests.filter(
    (r) =>
      r.metric === metric &&
      (dimension === undefined || r.dimension === (dimension || '')),
  );
}

/**
 * 等待指定时序图渲染出序列，返回其 option 快照
 */
async function waitForTimeseriesChart(page, metric, options = {}) {
  const timeout = options.timeout ?? 15000;
  await expect
    .poll(
      async () => {
        const state = await getTimeseriesChartState(page, metric);
        return state ? state.hasSeries : false;
      },
      { timeout, intervals: [200, 500, 1000] },
    )
    .toBe(true);
  return getTimeseriesChartState(page, metric);
}

/**
 * 等待排行图渲染出柱条，返回其 option 快照
 */
async function waitForRankingChart(page, options = {}) {
  const timeout = options.timeout ?? 15000;
  await expect
    .poll(
      async () => {
        const state = await getRankingChartState(page);
        return state ? state.hasSeries : false;
      },
      { timeout, intervals: [200, 500, 1000] },
    )
    .toBe(true);
  return getRankingChartState(page);
}

/**
 * 等待饼图渲染出扇区，返回其 option 快照
 * @param {'share'|'dist'} key
 */
async function waitForPieChart(page, key, options = {}) {
  const timeout = options.timeout ?? 15000;
  await expect
    .poll(
      async () => {
        const state = await getPieChartState(page, key);
        return state ? state.hasSeries : false;
      },
      { timeout, intervals: [200, 500, 1000] },
    )
    .toBe(true);
  return getPieChartState(page, key);
}

/**
 * 读取指定饼图卡片的维度下拉选项文案（经标题定位，标题取自 shareTitle / distTitle）
 */
function pieChartTitle(key) {
  return key === 'share' ? SHARE_CHART_TITLE : DIST_CHART_TITLE;
}

// ====== 格式化工具 ======

function formatTimestamp(ts) {
  if (!ts) return '-';
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

// ====== 工具 ======

/**
 * 指标卡数值展示格式（与 Report/index.vue fmtNum 一致）：
 * null/undefined → '-'；>=1e6 → '1.5M'；>=1e3 → '1.5K'；其余原样
 */
function formatMetricNumber(n) {
  if (n === null || n === undefined) {
    return '-';
  }
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'K';
  }
  return String(n);
}

function parseQuery(url) {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

module.exports = {
  DOC,
  QUICK_TIME_LABELS,
  LOGS_URL_RE,
  OVERVIEW_URL_RE,
  // 导航
  gotoReportPage,
  expectReportPageReady,
  // 页签
  switchToTab,
  expectActiveTab,
  reportTabs,
  // 过滤栏
  filterBar,
  filterItem,
  filterInput,
  quickTimeButton,
  clickQuickTime,
  setFilterDateTime,
  clickQueryButton,
  clickResetButton,
  // 总览
  metricsCard,
  getMetricCardValue,
  COST_CARD_LABEL,
  getCostCardMain,
  getCostCardSubRows,
  chartContainer,
  echartCanvas,
  expectChartsRendered,
  // 缓存 Token 时序图表
  TIMESERIES_URL_RE,
  CACHE_TOKENS_METRIC,
  CACHE_TOKENS_CHART_TITLE,
  NO_DATA_TEXT,
  QPS_CHART_TITLE,
  TOKENS_CHART_TITLE,
  LATENCY_CHART_TITLE,
  chartCardByTitle,
  chartCardCanvas,
  chartCardEmpty,
  cacheTokensChartCard,
  cacheTokensChartCanvas,
  cacheTokensChartEmpty,
  toggleCacheTokensLegend,
  expectCacheTokensChartTitle,
  waitForCacheTokensChart,
  getCacheTokensChartState,
  getCacheTokensLegendSelected,
  setCacheTokensSeries,
  mockReportTimeseries,
  mockCacheTokensTimeseries,
  waitForCacheTokensTimeseriesResponse,
  expectErrorNotice,
  // 排行与分布新维度
  RANKINGS_URL_RE,
  DISTRIBUTION_URL_RE,
  INTENT_ANSWER_LABEL,
  lastHourRange,
  getReportRankingsRaw,
  getReportDistributionRaw,
  getReportTimeseriesRaw,
  mockReportRankings,
  intentAnswerSelect,
  getIntentAnswerDropdownOptions,
  expectNoDorisHint,
  expectNoErrorNotice,
  // 明细列表
  reportLogsTable,
  waitForReportLogsResponse,
  waitForReportOverviewResponse,
  reloadReportPage,
  requestedModelInput,
  filterByRequestedModel,
  toggleErrOnly,
  searchByKeyword,
  triggerLogsSearch,
  // 详情 Drawer
  openDetailByRowText,
  openDetailByRowIndex,
  expectDetailDrawerOpen,
  detailDrawer,
  detailFieldItem,
  getDetailFieldValue,
  getDetailFieldLabels,
  expectDetailFieldValue,
  expectDetailFieldsPresent,
  expectDetailFieldsAbsent,
  expectDetailFieldContains,
  expectDetailFieldNotVisible,
  detailJsonSection,
  detailJsonHeader,
  detailJsonContent,
  toggleJsonField,
  expectJsonFieldExpanded,
  expectJsonFieldCollapsed,
  getDetailJsonLabels,
  getDetailDrawerText,
  reportLogsMainRows,
  getLogsMainRowCellTexts,
  logRowDetailButton,
  DETAIL_FIELD_LABELS,
  DETAIL_JSON_FIELDS,
  closeDetailDrawer,
  closeDetailDrawerByMask,
  expectJsonFieldCollapsible,
  // 维度过滤
  multiSelectFilter,
  selectMultiFilterOption,
  streamSelect,
  selectStreamFilter,
  statusCodeInput,
  setStatusCodeFilter,
  // 字段校验与后端门控
  TIME_RANGE_INVALID_TEXT,
  TIME_RANGE_EXCEEDED_TEXT,
  KEYWORD_TOO_LONG_TEXT,
  MAX_WINDOW_MS,
  INTENT_SOURCE_LABEL,
  expectMessageError,
  expectNoMessageError,
  getReportTimeRange,
  setReportTimeByVm,
  expectActiveQuickTime,
  trackReportApiRequests,
  expectNoNewReportRequests,
  getReportOverviewRaw,
  getReportLogsRaw,
  reportApiGetUnauth,
  // 总览指标卡（RP-O-02 ~ RP-O-13）
  CACHE_HIT_RATE_LABEL,
  MIRROR_HIT_LABEL,
  INTENT_CLASSIFIED_LABEL,
  ERROR_TOTAL_LABEL,
  AVG_LATENCY_LABEL,
  TOKEN_USAGE_LABEL,
  REQUEST_TOTAL_LABEL,
  mockReportOverview,
  mockReportDistribution,
  getMetricCardSubs,
  getMetricCardsLayout,
  setOverviewData,
  getOverviewVmState,
  overviewEmptyState,
  abortReportOverview,
  abortReportTimeseriesMetric,
  // 明细工具栏
  logsToolbarItem,
  keywordInput,
  fillKeyword,
  intentSourceSelect,
  getIntentSourceDropdownOptions,
  getLogsPageSizeText,
  // 明细新列与过滤（RP-L-01 ~ RP-L-10 / RP-L-15 ~ RP-L-17 / RP-L-24）
  LOG_TABLE_COLUMNS_15,
  LOGS_TOOLBAR_LABELS,
  INTENT_QUESTION_PLACEHOLDER,
  INTENT_ANSWER_PLACEHOLDER,
  CACHE_STATUS_OPTIONS,
  MIRROR_HIT_OPTIONS,
  ALL_OPTION_TEXT,
  mockReportLogs,
  getLogsHeaderTexts,
  getLogsRowCellTexts,
  logsInfoLine,
  logsToolbarInput,
  fillLogsToolbarInput,
  logsToolbarSelect,
  getLogsToolbarDropdownOptions,
  getLogsToolbarSelectPlaceholder,
  searchLogsToolbar,
  filterByCacheStatus,
  filterByMirrorHit,
  filterByIntentSource,
  filterByToolbarInput,
  clearLogsToolbarSelect,
  clearLogsToolbarSelectAndSearch,
  // 图表维度下钻（RP-T-09 ~ RP-T-14 / RP-R-13 ~ RP-R-17）
  RANKING_CHART_TITLE,
  SHARE_CHART_TITLE,
  DIST_CHART_TITLE,
  TS_SPLIT_LABEL,
  TS_SPLIT_NONE_LABEL,
  TS_SPLIT_OPTIONS,
  TS_SPLIT_METRICS,
  RANKING_DIM_OPTIONS,
  PIE_DIM_OPTIONS,
  PIE_UNSUPPORTED_DIMS,
  PIE_DEFAULT_DIMS,
  TIMESERIES_Y_AXIS,
  TOKEN_SPLIT_FIELDS,
  LATENCY_SPLIT_FIELDS,
  MIRROR_HIT_BUCKET_NAMES,
  UNKNOWN_BUCKET_NAME,
  tsSplitFilterItem,
  tsSplitSelect,
  getTsSplitDropdownState,
  getTsSplitOptions,
  getTsSplitHeadText,
  getTsSplitValue,
  selectTsSplit,
  expectNoTsSplitBar,
  getFilterBarControlSequence,
  getFilterBarItemLabels,
  expectNoDeadFilterItems,
  getFilterStateKeys,
  getTimeseriesChartState,
  waitForTimeseriesChart,
  chartDimSelect,
  getChartDimDropdownState,
  getChartDimOptions,
  getChartDimSelectedText,
  selectChartDim,
  getChartCardTitle,
  getRankingChartState,
  waitForRankingChart,
  getPieChartState,
  waitForPieChart,
  getChartDimOptionPairs,
  getChartDims,
  pieChartTitle,
  waitForTimeseriesResponses,
  waitForRankingsResponse,
  waitForDistributionResponse,
  trackTimeseriesRequests,
  expectNoNewTimeseriesRequests,
  filterTimeseriesRequests,
  // 工具
  formatTimestamp,
  formatDateTimeValue,
  formatMetricNumber,
  futureDateTimeString,
  parseQuery,
};