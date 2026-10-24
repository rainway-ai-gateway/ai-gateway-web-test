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
 * 数据报表 - 明细列表（RP-L-01 ~ RP-L-07）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/report/test_02_report_logs.spec.js
 *
 * 数据依赖：RP-L-01 ~ RP-L-08 等用例断言「默认查询窗口内存在带缓存 / 镜像 /
 * 意图维度的明细数据」。数据由测试侧自造：scripts/seed-report-data.js 以
 * product='rptseed' 标记向 bfe_ai_metrics_1m / bfe_ai_request_log 造最近
 * 窗口数据（存储口径 = 本地时间 - offset-hours，默认 8，见脚本头注释），
 * 每次执行先按标记清理旧种子行再刷新，幂等且不触碰真实/演示数据；
 * spec afterAll 再以 --cleanup 清理种子行，避免影响 test_01 等依赖
 * 「默认窗口为空」的其它 spec。
 *
 * 行/表头定位口径：2026-10-15 产品侧 Logs.vue 给「操作」列加 fixed:'right'
 * 后，iView 会额外渲染 fixed-right 克隆表（行与「操作」表头各多一份）。
 * 本 spec 的行数 / 单元格 / 列头断言统一限定主表（.ivu-table-body 行、
 * 可见 th），排除克隆表重复项；断言强度不变。
 */
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const path = require('path');
const rp = require('../../pages/report/ReportPage');
const reportApi = require('../../api/report-api-utils');

test.beforeAll(() => {
  const seedScript = path.join(__dirname, '../../scripts/seed-report-data.js');
  execSync(`node "${seedScript}"`, {
    stdio: 'inherit',
    timeout: 120000,
    env: { ...process.env },
  });
});

test.afterAll(() => {
  // 清理种子行，恢复「默认窗口为空」，避免影响 test_01 RP-O-03 / RP-O-13 等
  // 依赖空窗口断言的其它 spec（test_02 自身每次 beforeAll 都会重新造数）
  const seedScript = path.join(__dirname, '../../scripts/seed-report-data.js');
  execSync(`node "${seedScript}" --cleanup`, {
    stdio: 'inherit',
    timeout: 60000,
    env: { ...process.env },
  });
});

/**
 * 主表数据行：仅 .ivu-table-body 内的行，排除 iView fixed-right 克隆表
 * （PageTable.dataRows() 口径会把克隆行一并计入，导致行数翻倍）
 */
function mainDataRows(page) {
  return rp
    .reportLogsTable(page)
    .rootLocator()
    .locator(
      '.ivu-table-body tbody tr:not(:has-text("暂无筛选结果")):not(:has-text("暂无数据"))',
    );
}

function parseQuery(url) {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

test.describe('数据报表 - RP-L-01 明细页签加载', () => {
  test('验证切换到明细页签后列表加载', async ({ page }) => {
    let logsResponse;

    await test.step('进入数据报表页面', async () => {
      await rp.gotoReportPage(page);
    });

    await test.step('切换到明细页签', async () => {
      logsResponse = await rp.waitForReportLogsResponse(page, () =>
        rp.switchToTab(page, rp.DOC.logsTab),
      );
    });

    await test.step('验证列表请求携带 page=1、page_size=20', async () => {
      const query = parseQuery(logsResponse.url());
      expect(query.page).toBe('1');
      expect(query.page_size).toBe('20');
    });

    await test.step('验证表格列头', async () => {
      const table = rp.reportLogsTable(page);
      await table.waitForLoaded();
      // 与 PageTable.expectHeaders 同口径，但跳过克隆表/隐藏 th，
      // 断言每个期望列头均存在「可见」实例（fixed:'right' 后主表的
      // 「操作」th 被 iView 标为隐藏、由 fixed-right 克隆表承接展示）
      for (const label of rp.DOC.logTableColumns) {
        await expect(
          table
            .rootLocator()
            .locator('th', { hasText: label })
            .filter({ visible: true })
            .first(),
        ).toBeVisible();
      }
    });

    await test.step('验证成本列 = ai_cost_value + 空格 + ai_cost_currency，空值显示 -', async () => {
      const query = parseQuery(logsResponse.url());
      const apiData = await reportApi.fetchReportLogs(page, {
        page: Number(query.page || 1),
        page_size: Number(query.page_size || 20),
        start: query.start,
        end: query.end,
      });
      // 服务端出口已 ÷1e8 为金额，前端原样展示，不得再换算
      const expectedCostTexts = apiData.list.map((r) =>
        r.ai_cost_value != null
          ? `${r.ai_cost_value} ${r.ai_cost_currency || ''}`
          : '-',
      );

      const table = rp.reportLogsTable(page);
      const rows = mainDataRows(page);
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      const costIdx = rp.DOC.logTableColumns.indexOf('费用');
      expect(costIdx).toBeGreaterThanOrEqual(0);

      for (let i = 0; i < rowCount; i++) {
        const text = (
          (await rows.nth(i).locator('td').nth(costIdx).textContent()) || ''
        ).trim();
        expect(text).not.toBe('');
        expect(expectedCostTexts).toContain(text);
      }
    });
  });
});

test.describe('数据报表 - RP-L-02 服务端分页', () => {
  test('验证翻页后 page 参数递增、total 一致', async ({ page }) => {
    await rp.gotoReportPage(page);

    // 先设置一个时间范围，确保前端请求携带 start/end 参数
    await rp.clickQuickTime(page, '6 小时');
    await page.waitForTimeout(1000);

    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    // 获取首页 total
    const nowSec = Math.floor(Date.now() / 1000);
    const apiData = await reportApi.fetchReportLogs(page, { page: 1, page_size: 20, start: nowSec - 5 * 3600, end: nowSec });
    if (apiData.total <= 20) {
      test.skip(true, `日志总数 ${apiData.total} 不足 21 条，跳过分页用例`);
    }

    const table = rp.reportLogsTable(page);

    await test.step('第 1 页展示数据', async () => {
      await table.waitForLoaded();
      const rowCount = await mainDataRows(page).count();
      expect(rowCount).toBeLessThanOrEqual(20);
    });

    await test.step('翻到第 2 页', async () => {
      const response = await rp.waitForReportLogsResponse(page, () =>
        table.clickPageNumber(2),
      );
      const query = parseQuery(response.url());
      expect(Number(query.page)).toBe(2);
      const body = await response.json();
      const paged = reportApi.normalizeLogsResponse(body?.Data ?? body?.data ?? body);
      expect(paged.total).toBe(apiData.total);
    });
  });
});

test.describe('数据报表 - RP-L-03 请求模型过滤', () => {
  test('验证请求模型筛选携带 requested_models 参数', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    // 先获取可用的模型列表
    const nowSec = Math.floor(Date.now() / 1000);
    const apiData = await reportApi.fetchReportLogs(page, { page_size: 1, start: nowSec - 5 * 3600, end: nowSec });
    if (!apiData.list.length) {
      test.skip(true, '当前环境无日志数据');
    }

    // 用列表中第一条日志的请求模型作为筛选条件
    const model = apiData.list[0].ai_requested_model;
    if (!model) {
      test.skip(true, '日志数据中 ai_requested_model 为空');
    }

    const response = await rp.filterByRequestedModel(page, model);
    const query = parseQuery(response.url());
    expect(query.requested_models).toBe(model);
  });
});

test.describe('数据报表 - RP-L-04 只看错误过滤', () => {
  test('验证 err_only 参数筛选', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    await test.step('勾选只看错误', async () => {
      const response = await rp.toggleErrOnly(page);
      const query = parseQuery(response.url());
      expect(query.err_only).toBe('true');
    });

    await test.step('取消只看错误（选"否"）', async () => {
      const response = await rp.toggleErrOnly(page, false);
      const query = parseQuery(response.url());
      // 后端对"否"不发送 err_only 参数
      expect(query.err_only).toBeUndefined();
    });
  });
});

test.describe('数据报表 - RP-L-05 关键字搜索', () => {
  test('验证关键字搜索携带 keyword 参数', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    const keyword = 'test';
    const response = await rp.searchByKeyword(page, keyword);
    const query = parseQuery(response.url());
    expect(query.keyword).toBe(keyword);
  });
});

test.describe('数据报表 - RP-L-06 组合过滤', () => {
  test('验证多个过滤条件叠加', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    // 应用模型过滤
    const nowSec = Math.floor(Date.now() / 1000);
    const apiData = await reportApi.fetchReportLogs(page, { page_size: 1, start: nowSec - 5 * 3600, end: nowSec });
    if (!apiData.list.length) {
      test.skip(true, '当前环境无日志数据');
    }
    const model = apiData.list[0].ai_requested_model;
    if (!model) {
      test.skip(true, '日志数据中 ai_requested_model 为空');
    }

    let response = await rp.filterByRequestedModel(page, model);
    let query = parseQuery(response.url());
    expect(query.requested_models).toBe(model);

    // 叠加只看错误
    response = await rp.toggleErrOnly(page);
    query = parseQuery(response.url());
    expect(query.requested_models).toBe(model);
    expect(query.err_only).toBe('true');
  });
});

test.describe('数据报表 - RP-L-07 列表信息展示', () => {
  test('验证分页信息展示', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    const table = rp.reportLogsTable(page);
    await table.waitForLoaded();

    // 验证列表有数据
    const pagination = table.pagination();
    if ((await pagination.count()) > 0) {
      await expect(pagination).toBeVisible();
    }
  });
});

// ====== 明细新列与过滤（RP-L-01 ~ RP-L-10 / RP-L-15 ~ RP-L-17 / RP-L-24） ======
// 设计依据：docs/report/02-功能测试用例/04-明细新列与过滤.md
// 断言策略：
// - 列表展示 / 列格式类用例经 rp.mockReportLogs 注入受控 items（当前环境聚合表
//   无分钟数据，mock 保证确定性），请求 Query 仍由前端真实组装；
// - 过滤参数类用例走真实请求，从 response.url() 解析 Query，并经 reportApi
//   对照结果集（详情 Drawer 类用例由 test_03 覆盖，不在此重复）。

/**
 * 构造一条明细 fixture（字段口径与 GET report/logs 返回的 item 一致）
 */
function buildLogItem(overrides = {}) {
  return {
    logid: 1,
    log_time: Math.floor(Date.now() / 1000) - 60,
    hostid: 'host-1',
    product: 'AI_product',
    ai_apikey_id: 'key-001',
    ai_requested_model: 'gpt-4o',
    ai_target_model: 'gpt-4o',
    ai_provider: 'openai',
    ai_protocol: 'openai',
    ai_mode: 'chat',
    ai_stream: 1,
    res_status_code: 200,
    err_code: '',
    err_msg: '',
    ai_input_tokens: 500,
    ai_output_tokens: 200,
    ai_total_tokens: 700,
    all_time: 123,
    ai_ttft_us: 1200,
    ai_tpot_us: 5000,
    ai_cost_value: 0.1523,
    ai_cost_currency: 'USD',
    ai_cache_status: 'hit',
    mirror_hit: 0,
    mirror_cluster: '',
    ai_intent_question: 'task_type',
    ai_intent_answer: 'coding',
    ai_intent_confidence: 0.92,
    ai_intent_source: 'classifier',
    ai_intent_latency_us: 1200,
    ai_intent_cache_hit: 1,
    ai_intent_questions_version: 'v1.2.3',
    ...overrides,
  };
}

/**
 * 进入明细页签并加载 mock items，返回首个 report/logs 响应
 */
async function loadMockedLogs(page, items, options = {}) {
  await rp.gotoReportPage(page);
  await rp.mockReportLogs(page, { items, ...options });
  return rp.waitForReportLogsResponse(page, () =>
    rp.switchToTab(page, rp.DOC.logsTab),
  );
}

/**
 * 断言明细某列的单元格文本序列
 */
async function expectColumnCells(page, columnTitle, expectedTexts) {
  const idx = rp.LOG_TABLE_COLUMNS_15.indexOf(columnTitle);
  expect(idx, `列「${columnTitle}」应存在于 15 列定义`).toBeGreaterThanOrEqual(0);
  const table = rp.reportLogsTable(page);
  await table.waitForLoaded();
  const rows = mainDataRows(page);
  const rowCount = await rows.count();
  expect(rowCount).toBe(expectedTexts.length);
  for (let i = 0; i < rowCount; i++) {
    const text = (
      (await rows.nth(i).locator('td').nth(idx).textContent()) || ''
    ).trim();
    expect(text, `第 ${i + 1} 行「${columnTitle}」列`).toBe(expectedTexts[i]);
  }
}

/**
 * 断言列标题相对顺序（prev 紧邻位于 next 之前）
 */
async function expectColumnOrder(page, prev, next) {
  const headers = await rp.getLogsHeaderTexts(page);
  expect(headers).toContain(prev);
  expect(headers).toContain(next);
  expect(headers.indexOf(prev)).toBe(headers.indexOf(next) - 1);
}

test.describe('数据报表 - 明细新列与过滤（RP-L-01 ~ RP-L-10 / RP-L-15 ~ RP-L-17 / RP-L-24）', () => {
  test('RP-L-01 明细新增缓存列', async ({ page }) => {
    const items = [
      buildLogItem({ logid: 1, ai_cache_status: 'hit' }),
      buildLogItem({ logid: 2, ai_cache_status: 'miss' }),
      buildLogItem({ logid: 3, ai_cache_status: 'skip' }),
      buildLogItem({ logid: 4, ai_cache_status: '' }),
    ];
    await loadMockedLogs(page, items);

    await test.step('「缓存」列存在且位于「费用」之后、「镜像」之前', async () => {
      await rp.reportLogsTable(page).waitForLoaded();
      await expectColumnOrder(page, '费用', '缓存');
      await expectColumnOrder(page, '缓存', '镜像');
    });

    await test.step('单元格展示缓存状态原值，空串展示占位符 -', async () => {
      await expectColumnCells(page, '缓存', ['hit', 'miss', 'skip', '-']);
    });
  });

  test('RP-L-02 明细新增镜像列', async ({ page }) => {
    const items = [
      buildLogItem({ logid: 1, mirror_hit: 1, mirror_cluster: 'mirror-bj' }),
      buildLogItem({ logid: 2, mirror_hit: 1, mirror_cluster: '' }),
      buildLogItem({ logid: 3, mirror_hit: 0, mirror_cluster: '' }),
    ];
    await loadMockedLogs(page, items);

    await test.step('「镜像」列存在且位于「缓存」之后、「意图答案」之前', async () => {
      await rp.reportLogsTable(page).waitForLoaded();
      await expectColumnOrder(page, '缓存', '镜像');
      await expectColumnOrder(page, '镜像', '意图答案');
    });

    await test.step('命中展示「命中（集群名）」，集群为空仅「命中」，未命中展示 -', async () => {
      await expectColumnCells(page, '镜像', [
        '命中（mirror-bj）',
        '命中',
        '-',
      ]);
    });
  });

  test('RP-L-03 明细新增意图答案列', async ({ page }) => {
    const items = [
      buildLogItem({ logid: 1, ai_intent_answer: 'coding' }),
      buildLogItem({ logid: 2, ai_intent_answer: 'unknown' }),
      buildLogItem({ logid: 3, ai_intent_answer: '' }),
    ];
    await loadMockedLogs(page, items);

    await test.step('「意图答案」列存在且位于「镜像」之后、「错误」之前', async () => {
      await rp.reportLogsTable(page).waitForLoaded();
      await expectColumnOrder(page, '镜像', '意图答案');
      await expectColumnOrder(page, '意图答案', '错误');
    });

    await test.step('单元格展示意图答案原值（含 unknown），空串展示 -', async () => {
      await expectColumnCells(page, '意图答案', ['coding', 'unknown', '-']);
    });
  });

  test('RP-L-04 按缓存状态过滤', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    await test.step('下拉含 hit/miss/skip 三选项，占位「全部」且可清除', async () => {
      const options = await rp.getLogsToolbarDropdownOptions(
        page,
        rp.LOGS_TOOLBAR_LABELS.cacheStatus,
      );
      expect(options).toEqual(rp.CACHE_STATUS_OPTIONS);
      const placeholder = await rp.getLogsToolbarSelectPlaceholder(
        page,
        rp.LOGS_TOOLBAR_LABELS.cacheStatus,
      );
      expect(placeholder).toBe(rp.ALL_OPTION_TEXT);
    });

    let query;
    await test.step('选择 hit 后请求携带 cache_status=hit 且 page=1', async () => {
      const response = await rp.filterByCacheStatus(page, 'hit');
      query = parseQuery(response.url());
      expect(query.cache_status).toBe('hit');
      expect(Number(query.page)).toBe(1);
    });

    await test.step('结果集缓存状态均为 hit', async () => {
      const apiData = await reportApi.fetchReportLogs(page, {
        start: Number(query.start),
        end: Number(query.end),
        cache_status: 'hit',
        page_size: 50,
      });
      expect(apiData.total).toBeGreaterThan(0);
      for (const item of apiData.list) {
        expect(item.ai_cache_status).toBe('hit');
      }
    });

    await test.step('清空后请求不再携带 cache_status', async () => {
      const response = await rp.clearLogsToolbarSelectAndSearch(
        page,
        rp.LOGS_TOOLBAR_LABELS.cacheStatus,
      );
      const cleared = parseQuery(response.url());
      expect(cleared.cache_status).toBeUndefined();
    });
  });

  test('RP-L-05 按镜像命中过滤', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    let query;
    await test.step('选择「命中」后请求携带 mirror_hit=true', async () => {
      const response = await rp.filterByMirrorHit(page, '命中');
      query = parseQuery(response.url());
      expect(query.mirror_hit).toBe('true');
    });

    await test.step('结果集镜像命中均为 1（列表「镜像」列均为「命中」）', async () => {
      const apiData = await reportApi.fetchReportLogs(page, {
        start: Number(query.start),
        end: Number(query.end),
        mirror_hit: true,
        page_size: 50,
      });
      expect(apiData.total).toBeGreaterThan(0);
      for (const item of apiData.list) {
        // 接口 JSON 中 mirror_hit 为布尔值 true（MySQL 中存 1）
        expect(item.mirror_hit).toBe(true);
      }
    });

    await test.step('清空后请求不再携带 mirror_hit', async () => {
      const response = await rp.clearLogsToolbarSelectAndSearch(
        page,
        rp.LOGS_TOOLBAR_LABELS.mirrorHit,
      );
      const cleared = parseQuery(response.url());
      expect(cleared.mirror_hit).toBeUndefined();
    });
  });

  test('RP-L-06 按意图问题过滤', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    await test.step('输入框占位文案为「模糊匹配 ai_intent_question」', async () => {
      const input = rp.logsToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentQuestion,
      );
      await expect(input).toHaveAttribute(
        'placeholder',
        rp.INTENT_QUESTION_PLACEHOLDER,
      );
    });

    let query;
    await test.step('填写 task_type 后请求携带 intent_question=task_type', async () => {
      const response = await rp.filterByToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentQuestion,
        'task_type',
      );
      query = parseQuery(response.url());
      expect(query.intent_question).toBe('task_type');
    });

    await test.step('结果集意图问题均为 task_type', async () => {
      const apiData = await reportApi.fetchReportLogs(page, {
        start: Number(query.start),
        end: Number(query.end),
        intent_question: 'task_type',
        page_size: 50,
      });
      expect(apiData.total).toBeGreaterThan(0);
      for (const item of apiData.list) {
        expect(item.ai_intent_question).toBe('task_type');
      }
    });

    await test.step('清空后请求不再携带 intent_question', async () => {
      const input = rp.logsToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentQuestion,
      );
      const response = await rp.waitForReportLogsResponse(page, async () => {
        await input.click({ clickCount: 3 });
        await input.fill('');
        await rp.triggerLogsSearch(page);
      });
      const cleared = parseQuery(response.url());
      expect(cleared.intent_question).toBeUndefined();
    });
  });

  test('RP-L-07 按意图答案过滤', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    await test.step('输入框占位文案为「模糊匹配 ai_intent_answer」', async () => {
      const input = rp.logsToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentAnswer,
      );
      await expect(input).toHaveAttribute(
        'placeholder',
        rp.INTENT_ANSWER_PLACEHOLDER,
      );
    });

    let query;
    await test.step('填写 coding 后请求携带 intent_answer=coding', async () => {
      const response = await rp.filterByToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentAnswer,
        'coding',
      );
      query = parseQuery(response.url());
      expect(query.intent_answer).toBe('coding');
    });

    await test.step('结果集意图答案均为 coding', async () => {
      const apiData = await reportApi.fetchReportLogs(page, {
        start: Number(query.start),
        end: Number(query.end),
        intent_answer: 'coding',
        page_size: 50,
      });
      expect(apiData.total).toBeGreaterThan(0);
      for (const item of apiData.list) {
        expect(item.ai_intent_answer).toBe('coding');
      }
    });

    await test.step('填写 unknown 后请求携带 intent_answer=unknown 且可筛出未达门限答案', async () => {
      const response = await rp.filterByToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentAnswer,
        'unknown',
      );
      const q2 = parseQuery(response.url());
      expect(q2.intent_answer).toBe('unknown');
      const apiData = await reportApi.fetchReportLogs(page, {
        start: Number(q2.start),
        end: Number(q2.end),
        intent_answer: 'unknown',
        page_size: 50,
      });
      expect(apiData.total).toBeGreaterThan(0);
      for (const item of apiData.list) {
        expect(item.ai_intent_answer).toBe('unknown');
      }
    });

    await test.step('清空后请求不再携带 intent_answer', async () => {
      const input = rp.logsToolbarInput(
        page,
        rp.LOGS_TOOLBAR_LABELS.intentAnswer,
      );
      const response = await rp.waitForReportLogsResponse(page, async () => {
        await input.click({ clickCount: 3 });
        await input.fill('');
        await rp.triggerLogsSearch(page);
      });
      const cleared = parseQuery(response.url());
      expect(cleared.intent_answer).toBeUndefined();
    });
  });

  test('RP-L-08 按意图来源过滤', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    let query;
    await test.step('选择 classifier 后请求携带 intent_source=classifier', async () => {
      const response = await rp.filterByIntentSource(page, 'classifier');
      query = parseQuery(response.url());
      expect(query.intent_source).toBe('classifier');
    });

    await test.step('结果集意图来源均为 classifier', async () => {
      const apiData = await reportApi.fetchReportLogs(page, {
        start: Number(query.start),
        end: Number(query.end),
        intent_source: 'classifier',
        page_size: 50,
      });
      expect(apiData.total).toBeGreaterThan(0);
      for (const item of apiData.list) {
        expect(item.ai_intent_source).toBe('classifier');
      }
    });

    await test.step('清空后请求不再携带 intent_source', async () => {
      const response = await rp.clearLogsToolbarSelectAndSearch(
        page,
        rp.INTENT_SOURCE_LABEL,
      );
      const cleared = parseQuery(response.url());
      expect(cleared.intent_source).toBeUndefined();
    });
  });

  test('RP-L-09 镜像命中参数布尔转换', async ({ page }) => {
    await rp.gotoReportPage(page);
    await rp.waitForReportLogsResponse(page, () =>
      rp.switchToTab(page, rp.DOC.logsTab),
    );

    await test.step('选择「命中」时 mirror_hit 为布尔真值 true', async () => {
      const response = await rp.filterByMirrorHit(page, '命中');
      expect(parseQuery(response.url()).mirror_hit).toBe('true');
    });

    await test.step('选择「未命中」时 mirror_hit 为布尔假值 false', async () => {
      const response = await rp.filterByMirrorHit(page, '未命中');
      expect(parseQuery(response.url()).mirror_hit).toBe('false');
    });

    await test.step('清空后请求不携带 mirror_hit', async () => {
      const response = await rp.clearLogsToolbarSelectAndSearch(
        page,
        rp.LOGS_TOOLBAR_LABELS.mirrorHit,
      );
      expect(parseQuery(response.url()).mirror_hit).toBeUndefined();
    });
  });

  test('RP-L-10 组合过滤与分页', async ({ page }) => {
    const items = [
      buildLogItem({ logid: 1, ai_cache_status: 'hit', mirror_hit: 1 }),
      buildLogItem({ logid: 2 }),
    ];
    // total=45（> 一页）保证可翻页；items 仅用于列表渲染
    await loadMockedLogs(page, items, { total: 45 });
    await rp.reportLogsTable(page).waitForLoaded();

    let query;
    await test.step('同时设置缓存状态/意图来源/镜像命中，查询携带全部条件且 page=1', async () => {
      await rp.logsToolbarSelect(
        page,
        rp.LOGS_TOOLBAR_LABELS.cacheStatus,
      ).selectOptionExact('hit');
      await rp.logsToolbarSelect(
        page,
        rp.INTENT_SOURCE_LABEL,
      ).selectOptionExact('classifier');
      await rp.logsToolbarSelect(
        page,
        rp.LOGS_TOOLBAR_LABELS.mirrorHit,
      ).selectOptionExact('命中');
      const response = await rp.waitForReportLogsResponse(page, () =>
        rp.triggerLogsSearch(page),
      );
      query = parseQuery(response.url());
      expect(query.cache_status).toBe('hit');
      expect(query.intent_source).toBe('classifier');
      expect(query.mirror_hit).toBe('true');
      expect(Number(query.page)).toBe(1);
      expect(Number(query.page_size)).toBe(20);
    });

    await test.step('列表信息行展示「共 45 条，第 1/3 页，每页 20 条」', async () => {
      await expect(rp.logsInfoLine(page)).toHaveText(
        '共 45 条，第 1/3 页，每页 20 条',
      );
    });

    await test.step('翻到第 2 页仅变更 page，过滤条件不丢失', async () => {
      const table = rp.reportLogsTable(page);
      const response = await rp.waitForReportLogsResponse(page, () =>
        table.clickPageNumber(2),
      );
      const paged = parseQuery(response.url());
      expect(Number(paged.page)).toBe(2);
      expect(paged.cache_status).toBe('hit');
      expect(paged.intent_source).toBe('classifier');
      expect(paged.mirror_hit).toBe('true');
      await expect(rp.logsInfoLine(page)).toHaveText(
        '共 45 条，第 2/3 页，每页 20 条',
      );
    });
  });

  test('RP-L-15 缓存状态空串占位', async ({ page }) => {
    const items = [
      buildLogItem({ logid: 1, ai_cache_status: '' }),
      buildLogItem({ logid: 2, ai_cache_status: 'hit' }),
    ];
    await loadMockedLogs(page, items);

    await test.step('空串记录列表「缓存」列展示占位符 -，hit 记录原值展示', async () => {
      await expectColumnCells(page, '缓存', ['-', 'hit']);
    });
  });

  test('RP-L-16 明细页签默认列与基础字段', async ({ page }) => {
    const longErrMsg = '0123456789012345678901234'; // 25 字符，超 20 截断
    const items = [
      buildLogItem({
        logid: 1,
        log_time: 1700000000,
        all_time: 123,
        ai_total_tokens: 1500,
        ai_ttft_us: 1200,
        err_msg: longErrMsg,
      }),
      buildLogItem({
        logid: 2,
        log_time: null,
        all_time: null,
        ai_total_tokens: null,
        ai_ttft_us: null,
        ai_cost_value: null,
        err_msg: '',
      }),
    ];
    await loadMockedLogs(page, items);
    await rp.reportLogsTable(page).waitForLoaded();

    await test.step('表格按固定顺序渲染 15 列', async () => {
      const headers = await rp.getLogsHeaderTexts(page);
      expect(headers.slice(0, rp.LOG_TABLE_COLUMNS_15.length)).toEqual(
        rp.LOG_TABLE_COLUMNS_15,
      );
    });

    await test.step('各列格式化：耗时 {v}ms、Token fmtNum、TTFT fmtUs、成本「值 币种」', async () => {
      const row1 = await rp.getLogsRowCellTexts(page, 0);
      expect(row1[0]).toBe(rp.formatTimestamp(1700000000)); // 时间 formatTs
      expect(row1[5]).toBe('200'); // 状态码 String(code)
      expect(row1[6]).toBe('123ms'); // 耗时
      expect(row1[7]).toBe('1.5K'); // Token fmtNum(1500)
      expect(row1[8]).toBe('1.2 ms'); // TTFT fmtUs(1200)
      expect(row1[9]).toBe('0.1523 USD'); // 费用
      expect(row1[10]).toBe('hit'); // 缓存
    });

    await test.step('错误列超 20 字符截断加 … 且红色 #ed4014', async () => {
      const table = rp.reportLogsTable(page);
      const errIdx = rp.LOG_TABLE_COLUMNS_15.indexOf('错误');
      const cellSpan = table
        .dataRows()
        .nth(0)
        .locator('td')
        .nth(errIdx)
        .locator('span')
        .first();
      await expect(cellSpan).toHaveText('01234567890123456789…');
      await expect(cellSpan).toHaveCSS('color', 'rgb(237, 64, 20)');
    });

    await test.step('空值 / 空串统一展示占位 -', async () => {
      const row2 = await rp.getLogsRowCellTexts(page, 1);
      expect(row2[0]).toBe('-'); // log_time null
      expect(row2[6]).toBe('-'); // all_time null
      expect(row2[7]).toBe('-'); // tokens null
      expect(row2[8]).toBe('-'); // TTFT null
      expect(row2[9]).toBe('-'); // 成本 null
      expect(row2[13]).toBe('-'); // err_msg 空串
    });
  });

  test('RP-L-17 服务端分页与列表信息', async ({ page }) => {
    const items = [buildLogItem({ logid: 1 }), buildLogItem({ logid: 2 })];
    await loadMockedLogs(page, items, { total: 45 });
    await rp.reportLogsTable(page).waitForLoaded();

    await test.step('首页列表信息行「共 45 条，第 1/3 页，每页 20 条」', async () => {
      await expect(rp.logsInfoLine(page)).toHaveText(
        '共 45 条，第 1/3 页，每页 20 条',
      );
    });

    await test.step('翻到第 2 页：请求 page=2，信息行同步更新', async () => {
      const table = rp.reportLogsTable(page);
      const response = await rp.waitForReportLogsResponse(page, () =>
        table.clickPageNumber(2),
      );
      expect(Number(parseQuery(response.url()).page)).toBe(2);
      await expect(rp.logsInfoLine(page)).toHaveText(
        '共 45 条，第 2/3 页，每页 20 条',
      );
    });

    await test.step('修改每页条数为 50：请求 page_size=50、page 重置 1', async () => {
      const table = rp.reportLogsTable(page);
      const sizeSelect = table
        .pagination()
        .locator('.el-pagination__sizes .el-select');
      const response = await rp.waitForReportLogsResponse(page, async () => {
        await sizeSelect.click();
        await page
          .locator('.el-select-dropdown:visible .el-select-dropdown__item')
          .filter({ hasText: /^50条\/页$/ })
          .first()
          .click();
      });
      const query = parseQuery(response.url());
      expect(Number(query.page_size)).toBe(50);
      expect(Number(query.page)).toBe(1);
      // pages = ceil(45 / 50) = 1
      await expect(rp.logsInfoLine(page)).toHaveText(
        '共 45 条，第 1/1 页，每页 50 条',
      );
    });
  });

  test('RP-L-24 明细列表与接口响应一致性-列表逐字段核对', async ({ page }) => {
    const items = [
      buildLogItem({
        logid: 101,
        log_time: 1700000123,
        ai_apikey_id: 'key-a',
        ai_requested_model: 'gpt-4o',
        ai_target_model: 'gpt-4o-mini',
        ai_provider: 'anthropic',
        res_status_code: 429,
        all_time: 88,
        ai_total_tokens: 2500,
        ai_ttft_us: 23456,
        ai_cost_value: 0.98,
        ai_cost_currency: 'RMB',
        ai_cache_status: 'skip',
        mirror_hit: 1,
        mirror_cluster: 'mirror-sh',
        ai_intent_answer: 'unknown',
        err_msg: 'upstream timeout',
      }),
      buildLogItem({
        logid: 102,
        log_time: 1700000000,
        ai_cache_status: '',
        mirror_hit: 0,
        ai_intent_answer: '',
        err_msg: '',
      }),
    ];
    await loadMockedLogs(page, items);
    await rp.reportLogsTable(page).waitForLoaded();

    await test.step('行序与响应 items 顺序一致（前端未重排）', async () => {
      const row0 = await rp.getLogsRowCellTexts(page, 0);
      const row1 = await rp.getLogsRowCellTexts(page, 1);
      expect(row0[0]).toBe(rp.formatTimestamp(items[0].log_time));
      expect(row1[0]).toBe(rp.formatTimestamp(items[1].log_time));
    });

    await test.step('首行 15 列展示值与 item 逐字段一致（含格式化口径）', async () => {
      const expected = [
        rp.formatTimestamp(items[0].log_time), // 时间
        items[0].ai_apikey_id, // API Key
        items[0].ai_requested_model, // 请求模型
        items[0].ai_target_model, // 目标模型
        items[0].ai_provider, // 服务商
        String(items[0].res_status_code), // 状态码
        `${items[0].all_time}ms`, // 耗时
        rp.formatMetricNumber(items[0].ai_total_tokens), // Token fmtNum
        `${(items[0].ai_ttft_us / 1000).toFixed(1)} ms`, // TTFT fmtUs
        `${items[0].ai_cost_value} ${items[0].ai_cost_currency}`, // 费用
        items[0].ai_cache_status, // 缓存
        `命中（${items[0].mirror_cluster}）`, // 镜像
        items[0].ai_intent_answer, // 意图答案
        items[0].err_msg.length > 20
          ? items[0].err_msg.substring(0, 20) + '…'
          : items[0].err_msg, // 错误
      ];
      const row0 = await rp.getLogsRowCellTexts(page, 0);
      expect(row0.slice(0, expected.length)).toEqual(expected);
      expect(row0[14]).toBe('详情'); // 操作列
    });

    await test.step('次行空值字段统一展示占位 -，无 undefined/null 明文外露', async () => {
      const row1 = await rp.getLogsRowCellTexts(page, 1);
      const idxCache = rp.LOG_TABLE_COLUMNS_15.indexOf('缓存');
      const idxMirror = rp.LOG_TABLE_COLUMNS_15.indexOf('镜像');
      const idxAnswer = rp.LOG_TABLE_COLUMNS_15.indexOf('意图答案');
      const idxErr = rp.LOG_TABLE_COLUMNS_15.indexOf('错误');
      expect(row1[idxCache]).toBe('-');
      expect(row1[idxMirror]).toBe('-');
      expect(row1[idxAnswer]).toBe('-');
      expect(row1[idxErr]).toBe('-');
      expect(row1.join(' ')).not.toContain('undefined');
      expect(row1.join(' ')).not.toContain('null');
    });
  });
});