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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 用户手册 12 章「数据报表」维度下钻界面截图脚本（阶段 5）
 *
 * 覆盖 2026-10-14 变更（design-docs/modifications/2026-10-14-report-dimension-drilldown）：
 *   - 重截 14-report-overview.png          总览页签全貌（过滤栏 6 项 + 拆分维度）
 *   - 重截 14-report-filter-bar.png        全局过滤栏（6 个通用过滤项 + 行尾「拆分维度」）
 *   - 重截 14-report-overview-charts.png   图表区（标题改「排行 / 占比 / 分布」+ 三个维度下拉）
 *   - 新增 14-report-chart-dimension.png      排行图维度下拉展开态（10 项）
 *   - 新增 14-report-chart-dimension-pie.png  占比饼图维度下拉展开态（7 项，不含 provider/model/apikey/host）
 *   - 新增 14-report-ts-split.png            拆分维度选「缓存状态」并点「查询」后 QPS/Token/延迟三图多序列
 *
 * 与既有脚本同一约定：lang=zh、输出 ../../ai-gateway-web/docs/zh-cn/images、
 * 1920 宽视口；凭证从 conf.json 读取（不写入代码）；输出目录内的既有 14-*.png 会被覆盖。
 *
 * 运行（node 18）：
 *   cd ai-gateway-web-test
 *   source ~/.nvm/nvm.sh && nvm use 18
 *   TEST_BASE_URL=http://localhost:8180 node scripts/capture-report-dimensions.js
 *
 * 数据窗口：脚本先经 report/timeseries 探测窗口内最后一个有数据的桶，再把过滤栏时间范围
 * 设为「数据桶前后各留 5 分钟」，使截图中的图表有多序列数据（不依赖环境当前时刻）。
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const reportPage = require('../pages/report/ReportPage');
const umUtils = require('../pages/user/UserPage');
const common = require('../utils/common');

const confInfo = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8'),
);
const outputDir = path.join(__dirname, '../../ai-gateway-web/docs/zh-cn/images');
const appBaseUrl = (
  process.env.TEST_BASE_URL || confInfo.ctlHost.replace('/login', '')
).replace(/\/$/, '');

// 过滤器择窗口：数据桶前后各留 5 分钟，最短 10 分钟（便于观察多序列）
const WINDOW_MARGIN_SEC = 300;
const WINDOW_MIN_SEC = 600;
// 探测有数据的窗口，按由近及远顺序（报表库演示数据可能不在最近 1 小时）
const PROBE_WINDOWS_HOURS = [6, 24, 168];
// 截图视口
const VIEWPORT_OVERVIEW = { width: 1920, height: 1080 };
const VIEWPORT_CHARTS = { width: 1920, height: 1600 };
const VIEWPORT_TS_SPLIT = { width: 1920, height: 1400 };
const VIEWPORT_DROPDOWN = { width: 1920, height: 1400 };

const captured = [];
const skipped = [];

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

async function screenshot(page, name) {
  const filePath = path.join(outputDir, name);
  await page.screenshot({ path: filePath, fullPage: false });
  captured.push(name);
  const size = page.viewportSize();
  console.log(`Screenshot: ${name} [${size.width}x${size.height}]`);
}

async function screenshotElement(locator, name) {
  await locator.screenshot({ path: path.join(outputDir, name) });
  captured.push(name);
  const box = await locator.boundingBox().catch(() => null);
  const dim = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '?';
  console.log(`Element screenshot: ${name} [${dim}]`);
}

async function setViewport(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(400);
}

/** 清掉 iview 提示气泡（先记录文案，便于核对「窗口内无报错弹窗」） */
async function dismissMessages(page) {
  for (let i = 0; i < 5; i += 1) {
    const texts = await page
      .locator('.ivu-message, .ivu-notice')
      .allInnerTexts()
      .catch(() => []);
    const count = texts.length;
    if (!count) return;
    console.log(
      '  清除提示气泡: ' + JSON.stringify(texts.map((t) => t.replace(/\s+/g, ' ').trim())),
    );
    await page.evaluate(() => {
      document
        .querySelectorAll('.ivu-message, .ivu-notice')
        .forEach((el) => el.remove());
    });
    await page.waitForTimeout(200);
  }
}

/** 关掉可能出现的 iview 下拉，避免污染下一张截图 */
async function closeDropdowns(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

function formatTime(sec) {
  return new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// 会话（报表会话可能很快过期：每步后检查弹框 / 登录页，必要时重新登录）
// ---------------------------------------------------------------------------

async function loginWithConf(page) {
  await page.goto(confInfo.ctlHost, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const username = page
    .locator("input[placeholder='请输入用户名'], input[placeholder='Please input Username']")
    .first();
  const password = page
    .locator("input[placeholder='请输入密码'], input[placeholder='Please input Password']")
    .first();
  await username.fill(confInfo.username);
  await password.fill(confInfo.password);
  await page
    .locator('button')
    .filter({ hasText: /登录|Login/ })
    .first()
    .click();
  await page.waitForTimeout(2500);
  const logged = await page.evaluate(() => !!localStorage.getItem('user'));
  if (!logged) {
    throw new Error('登录失败：localStorage 未写入 user（检查 conf.json 凭证与服务端）');
  }
  common.log('已登录（凭证取自 conf.json）');
}

async function openReportPage(page) {
  await reportPage.gotoReportPage(page);
  await page.waitForTimeout(2500);
  await dismissMessages(page);
}

/** 会话守卫：出现会话错误弹框或落到登录页时重新登录并回到报表页 */
async function guardSession(page) {
  const handled = await umUtils.dismissAuthAlertModal(page).catch(() => false);
  const onLogin = await page
    .locator("input[placeholder='请输入用户名'], input[placeholder='Please input Username']")
    .first()
    .isVisible()
    .catch(() => false);
  if (!handled && !onLogin) return false;
  common.log('检测到会话失效，重新登录并回到报表页');
  await loginWithConf(page);
  await openReportPage(page);
  return true;
}

// ---------------------------------------------------------------------------
// 数据窗口探测
// ---------------------------------------------------------------------------

/**
 * 探测有数据的窗口：取 timeseries(dimension=ai_cache_status) 首批有数据桶的起止，
 * 前后各留 5 分钟；未找到数据时返回 null。
 * @returns {Promise<{start: number, end: number, hours: number}|null>}
 */
async function findDataWindow(page) {
  const now = Math.floor(Date.now() / 1000);
  for (const hours of PROBE_WINDOWS_HOURS) {
    const res = await reportPage.getReportTimeseriesRaw(page, 'qps', {
      start: now - hours * 3600,
      end: now,
      dimension: 'ai_cache_status',
    });
    const series = ((res.body || {}).Data || {}).series || [];
    const times = [...new Set(series.map((p) => p.time))].sort((a, b) => a - b);
    if (!times.length) {
      console.log(`  探测 ${hours}h 窗口：无数据`);
      continue;
    }
    let start = times[0] - WINDOW_MARGIN_SEC;
    let end = times[times.length - 1] + WINDOW_MARGIN_SEC;
    if (end > now) end = now;
    if (end - start < WINDOW_MIN_SEC) start = end - WINDOW_MIN_SEC;
    console.log(
      `  探测 ${hours}h 窗口：数据桶 ${formatTime(times[0])} ~ ${formatTime(
        times[times.length - 1],
      )}，截图窗口 ${formatTime(start)} ~ ${formatTime(end)}`,
    );
    return { start, end, hours };
  }
  return null;
}

/** 按探测窗口改时间范围并点「查询」，等待总览各项请求完成 */
async function applyWindowAndQuery(page, win) {
  await reportPage.setReportTimeByVm(page, {
    start: win.start * 1000,
    end: win.end * 1000,
  });
  await reportPage.clickQueryButton(page);
  await Promise.all([
    reportPage.waitForTimeseriesChart(page, 'qps', { timeout: 20000 }),
    reportPage.waitForRankingChart(page, { timeout: 20000 }),
    reportPage.waitForPieChart(page, 'share', { timeout: 20000 }),
    reportPage.waitForPieChart(page, 'dist', { timeout: 20000 }),
  ]);
  await page.waitForTimeout(1200);
  await dismissMessages(page);
}

/** 逐张图表卡记录视口内位置（截图坐标 = 视口坐标，便于核对每张图是否完整入镜） */
async function logVisibleCharts(page, label) {
  const vp = page.viewportSize();
  const cards = reportPage.chartContainer(page).locator('.chart-card');
  const count = await cards.count();
  const info = [];
  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    const box = await card.boundingBox();
    if (!box) continue;
    const title = ((await card.locator('h4').first().innerText()) || '')
      .replace(/\s+/g, ' ')
      .trim();
    const canvas = await card.locator('canvas').count();
    info.push({
      title,
      canvas,
      y: Math.round(box.y),
      h: Math.round(box.height),
      inside: box.y >= 0 && box.y + box.height <= vp.height,
    });
  }
  console.log(`  [${label}] 视口 ${vp.width}x${vp.height} 内图表卡:`);
  info.forEach((c) =>
    console.log(
      `    ${c.title}: y=${c.y} 高=${c.h} canvas=${c.canvas} 完整入镜=${c.inside ? '是' : '否'}`,
    ),
  );
  return info;
}

/** 把图表卡滚到视口上部（下拉展开后有足够空间），返回其 h4 位置用于核对 */
async function scrollCardToTop(page, title, offset = 120) {
  const card = reportPage.chartCardByTitle(page, title).first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await card.boundingBox();
  if (box) {
    await page.evaluate((dy) => window.scrollBy(0, dy), box.y - offset);
    await page.waitForTimeout(400);
  }
  const after = await card.boundingBox();
  console.log(
    `  ${title} 图表卡位置: y=${after ? Math.round(after.y) : '?'}, 高=${after ? Math.round(after.height) : '?'}`,
  );
  return card;
}

/** 展开图表卡标题旁的维度下拉，返回选项文案列表 */
async function expandChartDimDropdown(page, title) {
  const select = reportPage.chartDimSelect(page, title);
  await select.trigger.click();
  await page.waitForTimeout(400);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const count = await items.count();
  const options = [];
  for (let i = 0; i < count; i += 1) {
    options.push(((await items.nth(i).textContent()) || '').trim());
  }
  const dd = await page.locator('.ivu-select-dropdown:visible').first().boundingBox();
  console.log(
    `  「${title}」维度下拉 ${count} 项: ${JSON.stringify(options)}` +
      (dd ? `，下拉框 y=${Math.round(dd.y)} 高=${Math.round(dd.height)}` : ''),
  );
  return options;
}

/** iView 下拉列表最高 200px 可滚动：把列表滚到末尾，返回滚动数据与当前可见项文案 */
async function scrollDropdownList(page, toBottom = true) {
  const state = await page.evaluate((bottom) => {
    const dd = Array.from(document.querySelectorAll('.ivu-select-dropdown')).find(
      (el) => el.getBoundingClientRect().height > 1,
    );
    if (!dd) return null;
    dd.scrollTop = bottom ? dd.scrollHeight : 0;
    const st = dd.scrollTop;
    const visible = Array.from(dd.querySelectorAll('.ivu-select-item'))
      .filter(
        (el) =>
          el.offsetTop >= st - 1 &&
          el.offsetTop + el.offsetHeight <= st + dd.clientHeight + 1,
      )
      .map((el) => (el.textContent || '').trim());
    return {
      scrollTop: st,
      clientHeight: dd.clientHeight,
      scrollHeight: dd.scrollHeight,
      visible,
    };
  }, toBottom);
  await page.waitForTimeout(300);
  if (state) {
    console.log(
      `  下拉列表 ${state.clientHeight}/${state.scrollHeight}px（scrollTop=${state.scrollTop}），当前可见项: ${JSON.stringify(state.visible)}`,
    );
  }
  return state;
}

function sameList(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((v, i) => v === expected[i])
  );
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

(async () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: VIEWPORT_OVERVIEW });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('lang', 'zh'));
  page.on('pageerror', (e) => console.log('[pageerror] ' + String(e).slice(0, 200)));

  try {
    // ---- 登录 + 进入报表页
    common.log('=== 12 章：数据报表维度下钻截图 ===');
    await loginWithConf(page);
    await openReportPage(page);

    // ---- 探测数据窗口并对齐过滤栏时间范围（保证图表有多序列数据）
    console.log('探测有数据的窗口:');
    const win = await findDataWindow(page);
    if (!win) {
      skipped.push('全部截图（窗口内探测不到报表聚合数据，无法拍出可见的多序列图表）');
      throw new Error('未能在 6h / 24h / 7d 窗口内探测到 report/timeseries 数据');
    }
    await applyWindowAndQuery(page, win);

    // 图表数据可见性核对（.chart-empty 数量应为 0）与各图序列数
    const emptyCount = await reportPage.chartContainer(page).locator('.chart-empty').count();
    console.log(`图表卡空态数量: ${emptyCount}（应为 0）`);
    for (const metric of ['qps', 'tokens', 'latency', 'cache_tokens']) {
      const state = await reportPage.getTimeseriesChartState(page, metric);
      console.log(
        `  默认态 ${metric} 图例: ${JSON.stringify(state && state.legendData)}`,
      );
    }
    const rankingState = await reportPage.getRankingChartState(page);
    console.log(`  默认态排行类目: ${JSON.stringify(rankingState && rankingState.categories)}`);
    for (const key of ['share', 'dist']) {
      const pie = await reportPage.getPieChartState(page, key);
      console.log(
        `  默认态${key === 'share' ? '占比' : '分布'}饼维度=${pie && pie.vmDim} 扇区=${JSON.stringify(
          pie && pie.data.map((d) => d.name),
        )}`,
      );
    }
    if (emptyCount > 0) {
      skipped.push(`有 ${emptyCount} 张图卡为「暂无数据」，请核对截图窗口内数据`);
    }

    // ---- 1) 总览页签全貌（12.1）
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await dismissMessages(page);
    await screenshot(page, '14-report-overview.png');

    // ---- 2) 全局过滤栏（12.2）：6 个通用过滤项 + 行尾「拆分维度」
    const labels = await reportPage.getFilterBarItemLabels(page);
    console.log('过滤栏项标签: ' + JSON.stringify(labels));
    const sequence = await reportPage.getFilterBarControlSequence(page);
    console.log('维度区控件顺序: ' + JSON.stringify(sequence));
    await reportPage.filterBar(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await dismissMessages(page);
    await screenshotElement(reportPage.filterBar(page), '14-report-filter-bar.png');

    // ---- 3) 图表区（12.4）：标题「排行 / 占比 / 分布」+ 三个维度下拉
    await setViewport(page, VIEWPORT_CHARTS);
    await reportPage.chartContainer(page).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -40));
    await page.waitForTimeout(600);
    await dismissMessages(page);
    const titles = await reportPage.chartContainer(page).locator('.chart-card h4').allTextContents();
    console.log(
      '图表卡标题: ' + JSON.stringify(titles.map((t) => t.replace(/\s+/g, ' ').trim())),
    );
    await screenshot(page, '14-report-overview-charts.png');
    await logVisibleCharts(page, '14-report-overview-charts');

    // ---- 4) 排行图维度下拉展开（10 项）
    await setViewport(page, VIEWPORT_DROPDOWN);
    await scrollCardToTop(page, reportPage.RANKING_CHART_TITLE);
    const rankingOptions = await expandChartDimDropdown(page, reportPage.RANKING_CHART_TITLE);
    // iView 下拉列表最高 200px 可滚动（一次约可见 6 项）：滚到末尾，
    // 让新增的「缓存状态 / 镜像命中 / 意图答案」三项出现在画面里
    await scrollDropdownList(page, true);
    await screenshot(page, '14-report-chart-dimension.png');
    await closeDropdowns(page);
    const expectRanking = reportPage.RANKING_DIM_OPTIONS.map((o) => o.label);
    if (!sameList(rankingOptions, expectRanking)) {
      skipped.push(
        `14-report-chart-dimension.png 选项集与实现不一致：实际 ${JSON.stringify(rankingOptions)} / 期望 ${JSON.stringify(expectRanking)}`,
      );
    }

    // ---- 5) 占比饼图维度下拉展开（7 项，不含 provider/model/apikey/host）
    await scrollCardToTop(page, reportPage.SHARE_CHART_TITLE);
    const pieOptions = await expandChartDimDropdown(page, reportPage.SHARE_CHART_TITLE);
    await scrollDropdownList(page, true);
    await screenshot(page, '14-report-chart-dimension-pie.png');
    await closeDropdowns(page);
    const pieSet = reportPage.PIE_DIM_OPTIONS.map((o) => o.label).sort();
    if (!sameList([...pieOptions].sort(), pieSet)) {
      skipped.push(
        `14-report-chart-dimension-pie.png 选项集与实现不一致：实际 ${JSON.stringify(pieOptions)} / 期望 ${JSON.stringify(pieSet)}`,
      );
    }
    const unsupportedShown = pieOptions.filter((label) =>
      reportPage.PIE_UNSUPPORTED_DIMS.some((d) => d.label === label),
    );
    if (unsupportedShown.length) {
      skipped.push(
        `14-report-chart-dimension-pie.png 出现了 distribution 不支持的维度: ${JSON.stringify(unsupportedShown)}`,
      );
    }

    // ---- 6) 拆分维度选「缓存状态」→ 点「查询」→ QPS / Token / 延迟 多序列
    await setViewport(page, VIEWPORT_TS_SPLIT);
    const tracker = reportPage.trackTimeseriesRequests(page);
    const before = tracker.requests.length;
    await reportPage.selectTsSplit(page, '缓存状态');
    console.log(
      '拆分维度当前值: ' + (await reportPage.getTsSplitValue(page)) +
        '，仅切换后端到查询前的新增 timeseries 请求数: ' +
        (tracker.requests.length - before),
    );
    await reportPage.waitForTimeseriesResponses(
      page,
      reportPage.TS_SPLIT_METRICS,
      () => reportPage.clickQueryButton(page),
      { dimension: 'ai_cache_status', timeout: 20000 },
    );
    for (const metric of ['qps', 'tokens', 'latency', 'cache_tokens']) {
      const state = await reportPage.waitForTimeseriesChart(page, metric, {
        timeout: 20000,
      });
      console.log(
        `  ${metric} 图例: ${JSON.stringify(state.legendData)}` +
          `（tsSplit=${state.tsSplit}, 序列来源 points=${(state.rawSeries || []).length}）`,
      );
    }
    await page.waitForTimeout(1200);
    await dismissMessages(page);
    await reportPage.chartContainer(page).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -40));
    await page.waitForTimeout(600);
    await dismissMessages(page);
    await screenshot(page, '14-report-ts-split.png');
    await logVisibleCharts(page, '14-report-ts-split');

    const qpsSplit = reportPage.filterTimeseriesRequests(tracker, 'qps', 'ai_cache_status');
    const cacheTokensSplit = reportPage.filterTimeseriesRequests(
      tracker,
      'cache_tokens',
      'ai_cache_status',
    );
    console.log(
      `拆分后请求核对: qps 带 dimension 请求 ${qpsSplit.length} 条；` +
        `cache_tokens 带 dimension 请求 ${cacheTokensSplit.length} 条（应为 0）`,
    );

    // ---- 收尾检查
    await guardSession(page);
    await setViewport(page, VIEWPORT_OVERVIEW);
  } catch (e) {
    console.error('截图失败: ' + e.message);
    skipped.push('流程中断: ' + e.message);
  } finally {
    await browser.close();
  }

  console.log('\n=== 截图汇总 ===');
  console.log('生成成功: ' + (captured.length ? captured.join(', ') : '（无）'));
  if (skipped.length) {
    console.log('跳过 / 异常: ' + skipped.join(' | '));
  }
  console.log('输出目录: ' + outputDir);
  console.log('All done.');
})();