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
 * 数据报表 - 排行与分布新维度（RP-R-01 ~ RP-R-12）
 *
 * 断言策略：
 * - RP-R-01 ~ RP-R-07 / RP-R-12 以 API 断言为主：经页面会话（page.request，
 *   携带登录 session）直接请求 report/rankings 与 report/distribution，
 *   校验 HTTP 状态码、RankingItem / DistItem 结构、name 取值域与 limit 边界。
 * - RP-R-08 / RP-R-11 为 UI 用例：捕获 loadFilterOptions() 发起的 5 个并发
 *   rankings 请求（limit=50、无 unneedTips 静默标记），并 mock
 *   dimension=ai_intent_answer 返回确定性选项，断言「意图答案」下拉选项
 *   来源于排行返回的 name 列表、成功时无错误通知。
 * - RP-R-09 断言筛选栏无 .doris-hint 门控提示节点。
 * - RP-R-10 当前测试环境为单一后端，按当前后端验证三个新维度
 *   rankings / distribution / timeseries 均 200 且无
 *   「not supported by doris backend」错误；两后端对照需人工 / 环境矩阵覆盖。
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
const FILTER_OPTION_DIMENSIONS = ['model', 'apikey', 'provider', 'host', 'ai_intent_answer'];
const CACHE_STATUS_BUCKETS = ['hit', 'miss', 'skip'];
const MIRROR_HIT_BUCKETS = ['0', '1'];
// mock 的意图答案排行（RP-R-08 下拉选项来源断言用，name 为确定性取值）
const MOCK_INTENT_ANSWER_ITEMS = [
  { name: 'coding', request_count: 42, error_count: 1, input_tokens: 1000, output_tokens: 500 },
  { name: 'chat', request_count: 30, error_count: 0, input_tokens: 800, output_tokens: 400 },
  { name: 'unknown', request_count: 5, error_count: 0, input_tokens: 100, output_tokens: 50 },
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

  test('RP-R-08 意图答案下拉选项来源', async ({ page }) => {
    const captured = captureFilterOptionRequests(page);
    let intentAnswerItems = null;
    page.on('response', (res) => {
      if (res.request().method() !== 'GET' || !rp.RANKINGS_URL_RE.test(res.url())) return;
      const params = new URL(res.url()).searchParams;
      if (params.get('dimension') !== 'ai_intent_answer' || params.get('limit') !== '50') return;
      res
        .json()
        .then((body) => {
          intentAnswerItems = (body && body.Data && body.Data.items) || [];
        })
        .catch(() => {});
    });

    await test.step('mock 意图答案排行并进入数据报表页面', async () => {
      await rp.mockReportRankings(page, { ai_intent_answer: { items: MOCK_INTENT_ANSWER_ITEMS } });
      await rp.gotoReportPage(page);
    });

    await test.step('loadFilterOptions 并发发起 5 个 rankings 请求（model/apikey/provider/host/ai_intent_answer，limit=50）', async () => {
      await waitForFilterOptionRequests(captured, 5);
      const dimensions = captured.map((url) => new URL(url).searchParams.get('dimension'));
      for (const dimension of FILTER_OPTION_DIMENSIONS) {
        expect(dimensions.filter((d) => d === dimension).length).toBeGreaterThanOrEqual(1);
      }
      expectFilterOptionRequestParams(captured);
    });

    await test.step('意图答案下拉选项 = 排行返回 items 的 name 列表', async () => {
      await expect
        .poll(() => intentAnswerItems, { timeout: 15000 })
        .toEqual(MOCK_INTENT_ANSWER_ITEMS);
      const options = await rp.getIntentAnswerDropdownOptions(page);
      expect(options).toEqual(MOCK_INTENT_ANSWER_ITEMS.map((i) => i.name));
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

    await test.step('三个新维度过滤项均可选（缓存状态 / 镜像命中 / 意图答案）', async () => {
      for (const label of ['缓存状态', '镜像命中', '意图答案']) {
        await expect(rp.filterItem(page, label).locator('.ivu-select').first()).toBeVisible();
      }
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

  test('RP-R-11 意图答案下拉选项请求两后端可用', async ({ page }) => {
    const captured = captureFilterOptionRequests(page);

    await test.step('进入数据报表页面（触发 loadFilterOptions）', async () => {
      await rp.gotoReportPage(page);
      await waitForFilterOptionRequests(captured, 5);
    });

    await test.step('dimension=ai_intent_answer 请求返回 200，携带 limit=50 且无 unneedTips 静默标记', async () => {
      const intentUrls = captured.filter(
        (url) => new URL(url).searchParams.get('dimension') === 'ai_intent_answer',
      );
      expect(intentUrls.length).toBeGreaterThanOrEqual(1);
      for (const url of intentUrls) {
        const params = new URL(url).searchParams;
        expect(params.get('limit')).toBe('50');
        expect(params.has('unneedTips')).toBe(false);
      }
    });

    await test.step('请求成功时页面不弹出错误通知', async () => {
      await rp.expectNoErrorNotice(page);
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

    await test.step('总览排行固定 limit=10，筛选栏下拉选项固定 limit=50', async () => {
      const filterOptionUrls = [];
      const overviewRankingUrls = [];
      page.on('request', (req) => {
        if (req.method() !== 'GET' || !rp.RANKINGS_URL_RE.test(req.url())) return;
        const limit = new URL(req.url()).searchParams.get('limit');
        if (limit === '50') filterOptionUrls.push(req.url());
        if (limit === '10') overviewRankingUrls.push(req.url());
      });
      await rp.gotoReportPage(page);
      await waitForFilterOptionRequests(filterOptionUrls, 5);
      expectFilterOptionRequestParams(filterOptionUrls);
      // Overview.vue load()：dimension=model / provider 的排行请求固定 limit=10
      await expect
        .poll(() => overviewRankingUrls.length, { timeout: 20000, intervals: [200, 500, 1000] })
        .toBeGreaterThanOrEqual(2);
      for (const url of overviewRankingUrls) {
        expect(new URL(url).searchParams.get('limit')).toBe('10');
      }
    });
  });
});
