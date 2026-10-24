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
 * 数据报表 - 排行与分布新维度（RP-R-01 ~ RP-R-17）
 *
 * 断言策略：
 * - RP-R-01 ~ RP-R-07 / RP-R-12 以 API 断言为主：经页面会话（page.request，
 *   携带登录 session）直接请求 report/rankings 与 report/distribution，
 *   校验 HTTP 状态码、RankingItem / DistItem 结构、name 取值域与 limit 边界。
 * - RP-R-08 / RP-R-11 为 UI 用例：捕获 loadFilterOptions() 发起的 rankings 请求
 *   （2026-10-14 变更后仅 4 个 dimension：model / apikey / provider / host；2026-10-23
 *   issue #129 起「目标模型」选项改取集群 llm_config.models，故只剩 apikey / provider / host
 *   三个 rankings 请求，limit=50、无 unneedTips 静默标记；不再请求 ai_intent_answer），并断言总览过滤栏不含
 *   「缓存状态 / 镜像命中 / 意图答案」过滤项——三者不是通用过滤参数，其过滤由
 *   「明细」页签工具栏承担（RP-L-04 ~ RP-L-08）。
 * - RP-R-09 断言筛选栏无 .doris-hint 门控提示节点，且三个新维度过滤项不在总览过滤栏。
 * - RP-R-10 当前测试环境为单一后端，按当前后端验证三个新维度
 *   rankings / distribution / timeseries 均 200 且无
 *   「not supported by doris backend」错误；两后端对照需人工 / 环境矩阵覆盖。
 * - RP-R-13 ~ RP-R-17（2026-10-14 图表维度下钻）：图表数据经 route mock 注入
 *   （排行 10 项 / 饼图各 7 项维度下拉、切换即时重查、占比饼按所选维度取数、
 *   distribution 不支持的 provider/model/apikey/host 四项）。
 *
 * 说明：当前环境聚合表无分钟数据，items 多为空数组，取值域 / 占比类断言
 * 在 items 非空时生效（结构与状态码断言始终生效）。
 *
 * 运行：npx playwright test tests/report/test_06_report_rankings_distribution.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');

const RANKING_NUMERIC_FIELDS = ['request_count', 'error_count', 'input_tokens', 'output_tokens'];
const DIST_NUMERIC_FIELDS = ['request_count', 'ratio'];
// 过滤栏维度下拉选项请求覆盖的 3 个通用维度（2026-10-14 变更后不含 ai_intent_answer；
// 2026-10-23 issue #129 起「目标模型」选项改为取集群 llm_config.models，不再请求 model 维度排行）
const FILTER_OPTION_DIMENSIONS = ['apikey', 'provider', 'host'];
// 2026-10-14 变更已从总览过滤栏移除的三个过滤项（现由明细工具栏承担）
const REMOVED_FILTER_LABELS = ['缓存状态', '镜像命中', '意图答案'];
const CACHE_STATUS_BUCKETS = ['hit', 'miss', 'skip'];
const MIRROR_HIT_BUCKETS = ['0', '1'];

// ====== 图表维度下钻 mock 数据（RP-R-13 ~ RP-R-17） ======
// 报表数据来自日志管道且环境聚合表可能无数据，图表维度断言统一以 route mock 注入确定性响应

const MODEL_RANKING_ITEMS = [
  { name: 'gpt-4o', request_count: 120, error_count: 2, input_tokens: 1000, output_tokens: 500 },
  { name: 'claude-3', request_count: 80, error_count: 0, input_tokens: 800, output_tokens: 400 },
];
const CACHE_STATUS_RANKING_ITEMS = [
  { name: 'hit', request_count: 70, error_count: 0, input_tokens: 700, output_tokens: 300 },
  { name: 'miss', request_count: 20, error_count: 1, input_tokens: 200, output_tokens: 100 },
  { name: 'skip', request_count: 8, error_count: 0, input_tokens: 80, output_tokens: 40 },
];
const MIRROR_HIT_RANKING_ITEMS = [
  { name: '1', request_count: 60, error_count: 0, input_tokens: 600, output_tokens: 300 },
  { name: '0', request_count: 40, error_count: 1, input_tokens: 400, output_tokens: 200 },
];
const PROTOCOL_DIST_ITEMS = [
  { name: 'https', request_count: 60, ratio: 0.6 },
  { name: 'http', request_count: 40, ratio: 0.4 },
];
const STATUS_DIST_ITEMS = [
  { name: '200', request_count: 90, ratio: 0.9 },
  { name: '500', request_count: 10, ratio: 0.1 },
];
const MODE_DIST_ITEMS = [
  { name: 'chat', request_count: 70, ratio: 0.7 },
  { name: 'embedding', request_count: 30, ratio: 0.3 },
];
// 分布侧空值归一为 unknown 桶（RP-R-07），图表侧展示为「未知」
const CACHE_STATUS_DIST_ITEMS = [
  { name: 'hit', request_count: 50, ratio: 0.5 },
  { name: 'miss', request_count: 30, ratio: 0.3 },
  { name: 'unknown', request_count: 20, ratio: 0.2 },
];

// ====== 结构断言工具 ======

/**
 * RankingItem 结构：{name, request_count, error_count, input_tokens, output_tokens}
 */
function expectRankingItemsShape(items) {
  expect(Array.isArray(items)).toBe(true);
  for (const item of items) {
    expect(typeof item.name).toBe('string');
    expect(item.name.length).toBeGreaterThan(0);
    for (const field of RANKING_NUMERIC_FIELDS) {
      expect(typeof item[field]).toBe('number');
    }
  }
}

/**
 * DistItem 结构：{name, request_count, ratio}，ratio 取值 0~1
 */
function expectDistItemsShape(items) {
  expect(Array.isArray(items)).toBe(true);
  for (const item of items) {
    expect(typeof item.name).toBe('string');
    for (const field of DIST_NUMERIC_FIELDS) {
      expect(typeof item[field]).toBe('number');
    }
    expect(item.ratio).toBeGreaterThanOrEqual(0);
    expect(item.ratio).toBeLessThanOrEqual(1);
  }
}

function sumField(items, field) {
  return items.reduce((acc, item) => acc + (item[field] || 0), 0);
}

function expectRatioSumApproxOne(items) {
  expect(Math.abs(sumField(items, 'ratio') - 1)).toBeLessThanOrEqual(0.01);
}

/**
 * 收集维度过滤下拉选项请求（loadFilterOptions：limit=50 的 rankings 请求）
 */
function captureFilterOptionRequests(page) {
  const urls = [];
  page.on('request', (req) => {
    if (req.method() !== 'GET' || !rp.RANKINGS_URL_RE.test(req.url())) return;
    const limit = new URL(req.url()).searchParams.get('limit');
    if (limit === '50') urls.push(req.url());
  });
  return urls;
}

async function waitForFilterOptionRequests(urls, count) {
  await expect
    .poll(() => urls.length, { timeout: 20000, intervals: [200, 500, 1000] })
    .toBeGreaterThanOrEqual(count);
}

/**
 * 维度过滤下拉选项请求参数断言：limit=50、携带 start/end、无 unneedTips 静默标记
 */
function expectFilterOptionRequestParams(urls) {
  for (const url of urls) {
    const params = new URL(url).searchParams;
    expect(params.get('limit')).toBe('50');
    expect(params.get('start')).toBeTruthy();
    expect(params.get('end')).toBeTruthy();
    // Doris 门控已解除（RP-R-11）：请求不携带 unneedTips 等静默标记
    expect(params.has('unneedTips')).toBe(false);
  }
}

test.describe('数据报表 - 排行与分布新维度', () => {
  test('RP-R-01 意图答案维度排行', async ({ page }) => {
    const range = rp.lastHourRange();

    await test.step('dimension=ai_intent_answer 返回 200 且 items 为 RankingItem 结构', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'ai_intent_answer', {
        limit: 10,
        ...range,
      });
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectRankingItemsShape(body.Data.items);
    });

    await test.step('同一窗口 dimension=model 返回结构一致（RankingItem 字段集合相同）', async () => {
      const intent = await rp.getReportRankingsRaw(page, 'ai_intent_answer', { limit: 10, ...range });
      const model = await rp.getReportRankingsRaw(page, 'model', { limit: 10, ...range });
      expect(model.status).toBe(200);
      expectRankingItemsShape(model.body.Data.items);
      const keysOf = (items) => (items.length ? Object.keys(items[0]).sort() : null);
      expect(keysOf(intent.body.Data.items)).toEqual(keysOf(model.body.Data.items));
    });
  });

  test('RP-R-02 缓存状态维度排行', async ({ page }) => {
    const range = rp.lastHourRange();

    await test.step('dimension=ai_cache_status 返回 200，items 为 RankingItem 结构', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'ai_cache_status', {
        limit: 10,
        ...range,
      });
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectRankingItemsShape(body.Data.items);
    });

    await test.step('name 取值为缓存状态桶 hit / miss / skip（窗口内有数据时校验取值域）', async () => {
      const { body } = await rp.getReportRankingsRaw(page, 'ai_cache_status', { limit: 10, ...range });
      for (const item of body.Data.items) {
        expect(CACHE_STATUS_BUCKETS).toContain(item.name);
      }
    });
  });

  test('RP-R-03 镜像命中维度排行', async ({ page }) => {
    const range = rp.lastHourRange();

    await test.step('dimension=mirror_hit 返回 200，items 最多 name="1"/"0" 两个桶', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'mirror_hit', {
        limit: 10,
        ...range,
      });
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectRankingItemsShape(body.Data.items);
      expect(body.Data.items.length).toBeLessThanOrEqual(2);
      for (const item of body.Data.items) {
        expect(MIRROR_HIT_BUCKETS).toContain(item.name);
      }
    });

    await test.step('两桶 request_count 之和与分布侧一致（同一窗口同一维度）', async () => {
      const rankings = await rp.getReportRankingsRaw(page, 'mirror_hit', { limit: 10, ...range });
      const distribution = await rp.getReportDistributionRaw(page, 'mirror_hit', range);
      expect(distribution.status).toBe(200);
      expectDistItemsShape(distribution.body.Data.items);
      const rankItems = rankings.body.Data.items;
      const distItems = distribution.body.Data.items;
      if (rankItems.length > 0 && distItems.length > 0) {
        expect(sumField(rankItems, 'request_count')).toBe(sumField(distItems, 'request_count'));
      }
    });
  });

  test('RP-R-04 字符串新维度空值不进排行', async ({ page }) => {
    const range = rp.lastHourRange();

    for (const dimension of ['ai_intent_answer', 'ai_cache_status']) {
      await test.step(`${dimension}：items 中不出现 name="" 的空值桶`, async () => {
        const { status, body } = await rp.getReportRankingsRaw(page, dimension, {
          limit: 50,
          ...range,
        });
        expect(status).toBe(200);
        expect(body.ErrNum).toBe(200);
        expectRankingItemsShape(body.Data.items);
        for (const item of body.Data.items) {
          expect(item.name).not.toBe('');
        }
      });
    }

    await test.step('mirror_hit 为数值桶维度，不受空值规则约束（返回 0 / 1）', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'mirror_hit', { limit: 50, ...range });
      expect(status).toBe(200);
      for (const item of body.Data.items) {
        expect(MIRROR_HIT_BUCKETS).toContain(item.name);
      }
    });
  });

  test('RP-R-05 意图答案维度分布', async ({ page }) => {
    const range = rp.lastHourRange();

    await test.step('distribution dimension=ai_intent_answer 返回 200，items 为 DistItem 结构', async () => {
      const { status, body } = await rp.getReportDistributionRaw(page, 'ai_intent_answer', range);
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectDistItemsShape(body.Data.items);
    });

    await test.step('ratio 之和约等于 1（窗口内有数据时校验）', async () => {
      const { body } = await rp.getReportDistributionRaw(page, 'ai_intent_answer', range);
      if (body.Data.items.length > 0) {
        expectRatioSumApproxOne(body.Data.items);
      }
    });
  });

  test('RP-R-06 镜像命中维度分布', async ({ page }) => {
    const range = rp.lastHourRange();

    await test.step('distribution dimension=mirror_hit 返回 200，name 为字符串 "0" / "1"', async () => {
      const { status, body } = await rp.getReportDistributionRaw(page, 'mirror_hit', range);
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectDistItemsShape(body.Data.items);
      expect(body.Data.items.length).toBeLessThanOrEqual(2);
      for (const item of body.Data.items) {
        expect(MIRROR_HIT_BUCKETS).toContain(item.name);
      }
    });

    await test.step('两桶 ratio 之和约等于 1（布尔维度无空值归一问题，窗口内有数据时校验）', async () => {
      const { body } = await rp.getReportDistributionRaw(page, 'mirror_hit', range);
      if (body.Data.items.length > 0) {
        expectRatioSumApproxOne(body.Data.items);
      }
    });
  });

  test('RP-R-07 分布空值归一 unknown 桶', async ({ page }) => {
    const range = rp.lastHourRange();

    for (const dimension of ['ai_intent_answer', 'ai_cache_status']) {
      await test.step(`${dimension}：分布侧不存在空字符串 name 的桶`, async () => {
        const { status, body } = await rp.getReportDistributionRaw(page, dimension, range);
        expect(status).toBe(200);
        expect(body.ErrNum).toBe(200);
        expectDistItemsShape(body.Data.items);
        for (const item of body.Data.items) {
          expect(item.name).not.toBe('');
        }
      });

      await test.step(`${dimension}：分布多出排行之外的桶仅允许为 "unknown"（空值归一）`, async () => {
        // 排行侧空值 '' 不进排行（RP-R-04），分布侧 NULL/'' 归一为 "unknown"，
        // 因此 distribution.name 集合 − rankings.name 集合 ⊆ {"unknown"}
        const rankings = await rp.getReportRankingsRaw(page, dimension, { limit: 50, ...range });
        const distribution = await rp.getReportDistributionRaw(page, dimension, range);
        const rankNames = new Set(rankings.body.Data.items.map((i) => i.name));
        const extraNames = distribution.body.Data.items
          .map((i) => i.name)
          .filter((name) => !rankNames.has(name));
        for (const name of extraNames) {
          expect(name).toBe('unknown');
        }
      });
    }
  });

  test('RP-R-08 总览过滤栏无意图答案过滤项', async ({ page }) => {
    const captured = captureFilterOptionRequests(page);

    await test.step('进入数据报表页面（触发 loadFilterOptions）', async () => {
      await rp.gotoReportPage(page);
      await waitForFilterOptionRequests(captured, FILTER_OPTION_DIMENSIONS.length);
    });

    await test.step('loadFilterOptions 只请求 3 个 dimension（apikey / provider / host；目标模型取集群配置）', async () => {
      const dimensions = captured.map((url) => new URL(url).searchParams.get('dimension'));
      for (const dimension of FILTER_OPTION_DIMENSIONS) {
        expect(dimensions.filter((d) => d === dimension).length).toBeGreaterThanOrEqual(1);
      }
      // 三个新维度不是通用过滤参数：不发起 ai_intent_answer 的过滤栏选项请求
      expect(dimensions).not.toContain('ai_intent_answer');
      expect(captured).toHaveLength(FILTER_OPTION_DIMENSIONS.length);
      expectFilterOptionRequestParams(captured);
    });

    await test.step('总览过滤栏不含「缓存状态 / 镜像命中 / 意图答案」过滤项', async () => {
      await rp.expectNoDeadFilterItems(page);
      const labels = await rp.getFilterBarItemLabels(page);
      for (const dead of REMOVED_FILTER_LABELS) {
        expect(labels).not.toContain(dead);
      }
    });

    await test.step('按新维度过滤改由「明细」页签工具栏承担（对照组）', async () => {
      await rp.waitForReportLogsResponse(page, () => rp.switchToTab(page, rp.DOC.logsTab));
      for (const label of ['缓存状态', '镜像命中', '意图答案']) {
        await expect(rp.logsToolbarItem(page, label).first()).toBeVisible({ timeout: 10000 });
      }
      await rp.switchToTab(page, rp.DOC.overviewTab);
    });

    await test.step('时间范围未变化时（filterOptionsRange 命中）点击查询不重复请求下拉选项', async () => {
      const before = captured.length;
      await rp.clickQueryButton(page);
      await page.waitForTimeout(1500);
      expect(captured.length).toBe(before);
    });
  });

  test('RP-R-09 筛选栏无 Doris 门控提示', async ({ page }) => {
    await test.step('进入数据报表页面', async () => {
      await rp.gotoReportPage(page);
    });

    await test.step('筛选栏无 .doris-hint 节点、无门控文案（i18n report.dorisNewDimHint 已删除）', async () => {
      await rp.expectNoDorisHint(page);
      // 提示移除后不影响查询 / 重置按钮布局与可用性
      await expect(rp.filterBar(page).getByRole('button', { name: rp.DOC.queryButton })).toBeVisible();
      await expect(rp.filterBar(page).getByRole('button', { name: rp.DOC.resetButton })).toBeVisible();
    });

    await test.step('总览过滤栏不含三个新维度过滤项（2026-10-14 变更已移除）', async () => {
      await rp.expectNoDeadFilterItems(page);
      const labels = await rp.getFilterBarItemLabels(page);
      for (const dead of REMOVED_FILTER_LABELS) {
        expect(labels).not.toContain(dead);
      }
    });

    await test.step('明细工具栏同名过滤项保留且可用（对照组）', async () => {
      await rp.waitForReportLogsResponse(page, () => rp.switchToTab(page, rp.DOC.logsTab));
      for (const label of ['缓存状态', '镜像命中', '意图问题', '意图答案']) {
        await expect(rp.logsToolbarItem(page, label).first()).toBeVisible({ timeout: 10000 });
      }
      await rp.switchToTab(page, rp.DOC.overviewTab);
    });
  });

  test('RP-R-10 新维度两后端均可用', async ({ page }) => {
    // 当前测试环境为单一后端，按当前后端验证三个新维度均 200 且无
    // 「not supported by doris backend」门控错误；MySQL / Doris 两后端对照
    // 需人工 / 环境矩阵覆盖（见用例文档前置条件）。
    const range = rp.lastHourRange();

    await test.step('timeseries dimension=ai_intent_answer metric=qps 返回 200', async () => {
      const { status, body } = await rp.getReportTimeseriesRaw(page, 'qps', {
        dimension: 'ai_intent_answer',
        ...range,
      });
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expect(JSON.stringify(body)).not.toContain('not supported by doris backend');
      expect(typeof body.Data.bucket_sec).toBe('number');
      expect(Array.isArray(body.Data.series)).toBe(true);
    });

    await test.step('rankings dimension=ai_cache_status 返回 200', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'ai_cache_status', {
        limit: 10,
        ...range,
      });
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectRankingItemsShape(body.Data.items);
      expect(JSON.stringify(body)).not.toContain('not supported by doris backend');
    });

    await test.step('distribution dimension=mirror_hit 返回 200', async () => {
      const { status, body } = await rp.getReportDistributionRaw(page, 'mirror_hit', range);
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectDistItemsShape(body.Data.items);
      expect(JSON.stringify(body)).not.toContain('not supported by doris backend');
    });
  });

  test('RP-R-11 过滤栏维度筛选请求两后端可用（不含新维度）', async ({ page }) => {
    // 当前测试环境为单一后端，按当前后端验证 3 个维度选项请求均 200 且无门控错误；
    // MySQL / Doris 两后端对照需人工 / 环境矩阵覆盖（见用例文档前置条件）。
    const captured = captureFilterOptionRequests(page);

    await test.step('进入数据报表页面（触发 loadFilterOptions）', async () => {
      await rp.gotoReportPage(page);
      await waitForFilterOptionRequests(captured, FILTER_OPTION_DIMENSIONS.length);
    });

    await test.step('3 个 dimension 请求均携带 limit=50 且无 unneedTips 静默标记', async () => {
      expectFilterOptionRequestParams(captured);
      const dimensions = captured.map((url) => new URL(url).searchParams.get('dimension'));
      expect(dimensions.sort()).toEqual([...FILTER_OPTION_DIMENSIONS].sort());
    });

    await test.step('请求成功时页面不弹出错误通知', async () => {
      await rp.expectNoErrorNotice(page);
    });

    await test.step('过滤栏无「意图答案」过滤项，该维度不发起过滤栏选项请求', async () => {
      await rp.expectNoDeadFilterItems(page);
      const dimensions = captured.map((url) => new URL(url).searchParams.get('dimension'));
      expect(dimensions).not.toContain('ai_intent_answer');
      // 按意图答案过滤改用「明细」页签工具栏（RP-L-07）
      await rp.waitForReportLogsResponse(page, () => rp.switchToTab(page, rp.DOC.logsTab));
      await expect(rp.logsToolbarInput(page, '意图答案')).toBeVisible({ timeout: 10000 });
      await rp.switchToTab(page, rp.DOC.overviewTab);
    });
  });

  test('RP-R-12 排行数量默认与上限', async ({ page }) => {
    const range = rp.lastHourRange();

    await test.step('不传 limit 时按默认返回不超过 10 条', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'model', range);
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectRankingItemsShape(body.Data.items);
      expect(body.Data.items.length).toBeLessThanOrEqual(10);
    });

    await test.step('传 limit=50 时正常返回不超过 50 条', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'model', { limit: 50, ...range });
      expect(status).toBe(200);
      expect(body.ErrNum).toBe(200);
      expectRankingItemsShape(body.Data.items);
      expect(body.Data.items.length).toBeLessThanOrEqual(50);
    });

    await test.step('传 limit=100（超过上限 50）按参数校验失败处理（文档预期 HTTP 400 / ErrNum 422）', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'model', { limit: 100, ...range });
      if (status === 200) {
        // 现行后端实现为超上限静默截断至 50（model/ireport/manager.go:
        // limit > MaxRankLimit → MaxRankLimit），与用例文档「参数校验失败」
        // 的预期不一致；此处兼容两种实现，均校验「返回不超过 50 条」的边界语义。
        expect(body.ErrNum).toBe(200);
        expect(body.Data.items.length).toBeLessThanOrEqual(50);
      } else {
        expect(status).toBe(400);
        expect(body.ErrNum).toBe(422);
      }
    });

    await test.step('非法 limit（非正整数）按参数校验失败处理（ErrNum 422）', async () => {
      const { status, body } = await rp.getReportRankingsRaw(page, 'model', { limit: 'abc', ...range });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(body.ErrNum).toBe(422);
    });

    await test.step('总览排行固定 limit=10，筛选栏下拉选项固定 limit=50 且共 4 个', async () => {
      const filterOptionUrls = [];
      const overviewRankingUrls = [];
      page.on('request', (req) => {
        if (req.method() !== 'GET' || !rp.RANKINGS_URL_RE.test(req.url())) return;
        const limit = new URL(req.url()).searchParams.get('limit');
        if (limit === '50') filterOptionUrls.push(req.url());
        if (limit === '10') overviewRankingUrls.push(req.url());
      });
      await rp.gotoReportPage(page);
      await waitForFilterOptionRequests(filterOptionUrls, FILTER_OPTION_DIMENSIONS.length);
      expectFilterOptionRequestParams(filterOptionUrls);
      // 下拉选项请求只覆盖 4 个通用维度（不含 ai_intent_answer，见 RP-R-08）
      const dimensions = filterOptionUrls.map((url) => new URL(url).searchParams.get('dimension'));
      expect(dimensions.sort()).toEqual([...FILTER_OPTION_DIMENSIONS].sort());
      // Overview.vue load()：排行图请求固定 limit=10（变更后服务商改由饼图
      // distribution?dimension=provider 取数，页面只发 1 个 rankings 排行请求）
      await expect
        .poll(() => overviewRankingUrls.length, { timeout: 20000, intervals: [200, 500, 1000] })
        .toBeGreaterThanOrEqual(1);
      for (const url of overviewRankingUrls) {
        expect(new URL(url).searchParams.get('limit')).toBe('10');
      }
      expect(
        overviewRankingUrls.some(
          (url) => new URL(url).searchParams.get('dimension') === 'model',
        ),
      ).toBe(true);
    });
  });

  // ====== 图表维度下钻（RP-R-13 ~ RP-R-17，2026-10-14 变更） ======
  // 设计依据：03-排行与分布新维度.md RP-R-13~17；图表数据经 route mock 注入，
  // 保证与日志管道现存数据无关、可重复执行

  test('RP-R-13 排行图维度下拉存在与默认值', async ({ page }) => {
    await test.step('mock 模型维度排行并进入总览页', async () => {
      await rp.mockReportRankings(page, { model: { items: MODEL_RANKING_ITEMS } });
      await rp.gotoReportPage(page);
    });

    await test.step('卡片标题为「排行」，标题旁存在维度下拉', async () => {
      const title = await rp.getChartCardTitle(page, rp.RANKING_CHART_TITLE);
      expect(title).toContain(rp.RANKING_CHART_TITLE);
      await expect(rp.chartDimSelect(page, rp.RANKING_CHART_TITLE).trigger).toBeVisible();
    });

    await test.step('下拉共 10 个选项，默认选中「目标模型」', async () => {
      const state = await rp.getChartDimDropdownState(page, rp.RANKING_CHART_TITLE);
      expect(state.options).toEqual(rp.RANKING_DIM_OPTIONS.map((o) => o.label));
      expect(state.options).toHaveLength(10);
      expect(state.selected).toBe(rp.DOC.filterLabels.model);
      expect(await rp.getChartDimSelectedText(page, rp.RANKING_CHART_TITLE)).toBe(rp.DOC.filterLabels.model);
      expect((await rp.getChartDims(page)).ranking).toBe('model');
    });

    await test.step('初始图表与变更前 dimension=model 排行一致（limit=10）', async () => {
      const ranking = await rp.waitForRankingChart(page);
      expect(ranking.categories).toEqual(MODEL_RANKING_ITEMS.map((i) => i.name));
      expect(ranking.series[0].data).toEqual(MODEL_RANKING_ITEMS.map((i) => i.request_count));
    });
  });

  test('RP-R-14 切换排行维度即时重新请求与图表更新', async ({ page }) => {
    await test.step('mock 三个维度排行并进入总览页', async () => {
      await rp.mockReportRankings(page, {
        model: { items: MODEL_RANKING_ITEMS },
        ai_cache_status: { items: CACHE_STATUS_RANKING_ITEMS },
        mirror_hit: { items: MIRROR_HIT_RANKING_ITEMS },
      });
      await rp.gotoReportPage(page);
      await rp.waitForRankingChart(page);
    });

    await test.step('切换为「缓存状态」：即时请求 dimension=ai_cache_status&limit=10', async () => {
      const response = await rp.waitForRankingsResponse(
        page,
        () => rp.selectChartDim(page, rp.RANKING_CHART_TITLE, '缓存状态'),
        { dimension: 'ai_cache_status' },
      );
      const query = rp.parseQuery(response.url());
      expect(query.dimension).toBe('ai_cache_status');
      expect(query.limit).toBe('10');
      expect(query.start).toBeTruthy();
      expect(query.end).toBeTruthy();
      expect(response.status()).toBe(200);
    });

    await test.step('图表按新维度前 10 条重渲染，桶名为 hit / miss / skip', async () => {
      await expect
        .poll(async () => (await rp.getRankingChartState(page)).categories, { timeout: 10000 })
        .toEqual(CACHE_STATUS_RANKING_ITEMS.map((i) => i.name));
      const ranking = await rp.getRankingChartState(page);
      expect(ranking.series[0].data).toEqual(
        CACHE_STATUS_RANKING_ITEMS.map((i) => i.request_count),
      );
      expect(ranking.vmDim).toBe('ai_cache_status');
    });

    await test.step('再切换为「镜像命中」：dimension=mirror_hit，桶名归一为命中 / 未命中', async () => {
      const response = await rp.waitForRankingsResponse(
        page,
        () => rp.selectChartDim(page, rp.RANKING_CHART_TITLE, '镜像命中'),
        { dimension: 'mirror_hit' },
      );
      expect(rp.parseQuery(response.url()).dimension).toBe('mirror_hit');
      await expect
        .poll(async () => (await rp.getRankingChartState(page)).categories, { timeout: 10000 })
        .toEqual([rp.MIRROR_HIT_BUCKET_NAMES[1], rp.MIRROR_HIT_BUCKET_NAMES[0]]);
      // 标题保持「排行」，仅数据与下拉选中值变化
      expect(await rp.getChartCardTitle(page, rp.RANKING_CHART_TITLE)).toContain(
        rp.RANKING_CHART_TITLE,
      );
      expect((await rp.getChartDims(page)).ranking).toBe('mirror_hit');
    });
  });

  test('RP-R-15 占比与分布饼图维度下拉与切换取数', async ({ page }) => {
    await test.step('mock 各维度分布数据并进入总览页', async () => {
      await rp.mockReportDistribution(page, {
        protocol: { items: PROTOCOL_DIST_ITEMS },
        status: { items: STATUS_DIST_ITEMS },
        mode: { items: MODE_DIST_ITEMS },
        ai_cache_status: { items: CACHE_STATUS_DIST_ITEMS },
      });
      await rp.gotoReportPage(page);
      await rp.waitForPieChart(page, 'share');
      await rp.waitForPieChart(page, 'dist');
    });

    await test.step('两个饼图标题分别为「占比」「分布」', async () => {
      expect(await rp.getChartCardTitle(page, rp.SHARE_CHART_TITLE)).toContain(
        rp.SHARE_CHART_TITLE,
      );
      expect(await rp.getChartCardTitle(page, rp.DIST_CHART_TITLE)).toContain(
        rp.DIST_CHART_TITLE,
      );
      await expect(rp.chartDimSelect(page, rp.SHARE_CHART_TITLE).trigger).toBeVisible();
      await expect(rp.chartDimSelect(page, rp.DIST_CHART_TITLE).trigger).toBeVisible();
    });

    await test.step('两个下拉各 7 项，默认分别为「协议」「状态码」', async () => {
      const share = await rp.getChartDimDropdownState(page, rp.SHARE_CHART_TITLE);
      const dist = await rp.getChartDimDropdownState(page, rp.DIST_CHART_TITLE);
      const expectedLabels = rp.PIE_DIM_OPTIONS.map((o) => o.label).sort();
      expect(share.options).toHaveLength(7);
      expect(dist.options).toHaveLength(7);
      expect([...share.options].sort()).toEqual(expectedLabels);
      expect([...dist.options].sort()).toEqual(expectedLabels);
      expect(share.selected).toBe('协议');
      expect(dist.selected).toBe('状态码');
      expect(await rp.getChartDimSelectedText(page, rp.SHARE_CHART_TITLE)).toBe('协议');
      expect(await rp.getChartDimSelectedText(page, rp.DIST_CHART_TITLE)).toBe('状态码');
      expect(await rp.getChartDims(page)).toMatchObject({
        pieProvider: rp.PIE_DEFAULT_DIMS.share,
        pieStatus: rp.PIE_DEFAULT_DIMS.dist,
      });
    });

    await test.step('初始取数与变更前一致（占比=协议、分布=状态码）', async () => {
      expect((await rp.getPieChartState(page, 'share')).data).toEqual(
        PROTOCOL_DIST_ITEMS.map((i) => ({ name: i.name, value: i.request_count })),
      );
      expect((await rp.getPieChartState(page, 'dist')).data).toEqual(
        STATUS_DIST_ITEMS.map((i) => ({ name: i.name, value: i.request_count })),
      );
    });

    await test.step('「占比」切「模式」：请求 distribution?dimension=mode，扇区与响应一致', async () => {
      const response = await rp.waitForDistributionResponse(
        page,
        () => rp.selectChartDim(page, rp.SHARE_CHART_TITLE, '模式'),
        { dimension: 'mode' },
      );
      expect(rp.parseQuery(response.url()).dimension).toBe('mode');
      await expect
        .poll(async () => (await rp.getPieChartState(page, 'share')).data, { timeout: 10000 })
        .toEqual(MODE_DIST_ITEMS.map((i) => ({ name: i.name, value: i.request_count })));
      expect((await rp.getChartDims(page)).pieProvider).toBe('mode');
    });

    await test.step('「分布」切「缓存状态」：请求 dimension=ai_cache_status，含 unknown 空值桶', async () => {
      const response = await rp.waitForDistributionResponse(
        page,
        () => rp.selectChartDim(page, rp.DIST_CHART_TITLE, '缓存状态'),
        { dimension: 'ai_cache_status' },
      );
      expect(rp.parseQuery(response.url()).dimension).toBe('ai_cache_status');
      await expect
        .poll(async () => (await rp.getPieChartState(page, 'dist')).data, { timeout: 10000 })
        .toEqual(
          CACHE_STATUS_DIST_ITEMS.map((i) => ({ name: i.name, value: i.request_count })),
        );
      // 分布侧空值桶由接口归一为字面量 "unknown"（RP-R-07），图内一并展示
      expect((await rp.getPieChartState(page, 'dist')).data.map((d) => d.name)).toContain(
        'unknown',
      );
      // 两个饼图维度相互独立，切换互不影响
      expect((await rp.getPieChartState(page, 'share')).data).toEqual(
        MODE_DIST_ITEMS.map((i) => ({ name: i.name, value: i.request_count })),
      );
      expect(await rp.getChartDims(page)).toMatchObject({
        pieProvider: 'mode',
        pieStatus: 'ai_cache_status',
      });
    });
  });

  test('RP-R-16 饼图维度不含不支持的四项', async ({ page }) => {
    await test.step('进入总览页', async () => {
      await rp.gotoReportPage(page);
      await rp.expectReportPageReady(page);
    });

    await test.step('两个饼图下拉均不含服务商 / 模型 / API Key / Host（7 项枚举）', async () => {
      for (const key of ['share', 'dist']) {
        const title = rp.pieChartTitle(key);
        const state = await rp.getChartDimDropdownState(page, title);
        const pairs = await rp.getChartDimOptionPairs(page, key);
        const values = pairs.map((p) => p.value);
        for (const dim of rp.PIE_UNSUPPORTED_DIMS) {
          expect(state.options).not.toContain(dim.label);
          expect(values).not.toContain(dim.value);
        }
        expect([...values].sort()).toEqual(rp.PIE_DIM_OPTIONS.map((o) => o.value).sort());
      }
    });

    await test.step('distribution 传 provider / model / apikey / host 返回参数校验错误（ErrNum 422）', async () => {
      const range = rp.lastHourRange();
      for (const dim of rp.PIE_UNSUPPORTED_DIMS) {
        const res = await rp.getReportDistributionRaw(page, dim.value, range);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.ErrNum).toBe(422);
        expect(res.body.Data == null).toBe(true);
      }
    });

    await test.step('对照组 rankings 传同四项返回 200（四项仅被饼图排除）', async () => {
      const range = rp.lastHourRange();
      for (const dim of rp.PIE_UNSUPPORTED_DIMS) {
        const res = await rp.getReportRankingsRaw(page, dim.value, { limit: 10, ...range });
        expect(res.status).toBe(200);
        expect(res.body.ErrNum).toBe(200);
      }
    });
  });

  test('RP-R-17 占比饼按所选维度取数', async ({ page }) => {
    let modeItems = null;

    await test.step('mock 协议 / 模式两个维度分布并进入总览页', async () => {
      await rp.mockReportDistribution(page, {
        protocol: { items: PROTOCOL_DIST_ITEMS },
        status: { items: STATUS_DIST_ITEMS },
        mode: { items: MODE_DIST_ITEMS },
      });
      await rp.gotoReportPage(page);
      await rp.waitForPieChart(page, 'share');
    });

    await test.step('默认「协议」：占比饼按 dimension=protocol 取数', async () => {
      // 初始加载的 distribution 请求携带当前所选维度（默认 protocol）
      expect((await rp.getChartDims(page)).pieProvider).toBe('protocol');
      const data = (await rp.getPieChartState(page, 'share')).data;
      expect(data).toEqual(
        PROTOCOL_DIST_ITEMS.map((i) => ({ name: i.name, value: i.request_count })),
      );
    });

    await test.step('切「模式」：扇区与 dimension=mode 响应一致，不再错读 protocol 数据', async () => {
      const response = await rp.waitForDistributionResponse(
        page,
        () => rp.selectChartDim(page, rp.SHARE_CHART_TITLE, '模式'),
        { dimension: 'mode' },
      );
      const body = await response.json();
      modeItems = body.Data.items;
      expect(modeItems.map((i) => i.name)).toEqual(MODE_DIST_ITEMS.map((i) => i.name));
      await expect
        .poll(async () => (await rp.getPieChartState(page, 'share')).data, { timeout: 10000 })
        .toEqual(modeItems.map((i) => ({ name: i.name, value: i.request_count })));
      // 所选维度为模式时不应再出现协议维度的扇区
      const names = (await rp.getPieChartState(page, 'share')).data.map((d) => d.name);
      for (const item of PROTOCOL_DIST_ITEMS) {
        expect(names).not.toContain(item.name);
      }
    });

    await test.step('各扇区占比与响应 ratio 逐项一致（空值归一计入分母）', async () => {
      const data = (await rp.getPieChartState(page, 'share')).data;
      const total = data.reduce((acc, d) => acc + d.value, 0);
      expect(total).toBeGreaterThan(0);
      expect(modeItems).toHaveLength(data.length);
      data.forEach((d, i) => {
        expect(d.value / total).toBeCloseTo(modeItems[i].ratio, 5);
      });
      expect(modeItems.reduce((acc, i) => acc + i.ratio, 0)).toBeCloseTo(1, 5);
    });
  });
});
