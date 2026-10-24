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
 * 密钥收敛 - 运行中横幅与 800ms 轮询进度（RS-P-01）
 *
 * 列表识别 running 任务 → 「当前运行任务」卡片展示 → 800ms 轮询 GET /{task_id}。
 * 运行：PW_WORKERS=1 npx playwright test tests/reencrypt-sweep/test_03_reencrypt_sweep_polling.spec.js
 */
const { test, expect } = require('@playwright/test');
const up = require('../../pages/security/ReencryptSweepPage');

const RUNNING_ID = 'rsp-p01-running';
const FIXED_START = '2026-10-05T10:00:00Z';

function runningListItem(taskId, startedAt) {
  return {
    task_id: taskId,
    status: 'running',
    mode: 'reencrypt',
    dry_run: false,
    scope: 'all',
    active_key_id: 1,
    created_by: 'admin',
    started_at: startedAt,
    finished_at: '',
    duration_ms: 0,
    summary: {},
    error: '',
  };
}

// 断言连续轮询请求间隔收敛于 800ms（setInterval）
function assertPollingInterval(times) {
  const diffs = [];
  for (let i = 1; i < times.length; i += 1) {
    diffs.push(times[i] - times[i - 1]);
  }
  expect(diffs.length, '轮询次数不足，无法评估间隔').toBeGreaterThanOrEqual(2);
  diffs.forEach((d) =>
    expect(d, `轮询间隔应 >= 400ms，实测 ${d}ms`).toBeGreaterThanOrEqual(400),
  );
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  expect(avg, `平均轮询间隔应约 800ms，实测 ${avg}ms`).toBeGreaterThanOrEqual(600);
  expect(avg, `平均轮询间隔应约 800ms，实测 ${avg}ms`).toBeLessThanOrEqual(1500);
}

test.afterEach(async ({ page }) => {
  await up.unmockReencryptSweepNetwork(page);
});

test.describe('密钥收敛 - RS-P-01 运行中横幅与 800ms 轮询进度', () => {
  test('列表识别 running 任务：横幅字段/占位统计/耗时与轮询间隔', async ({
    page,
  }) => {
    // 列表返回唯一 running（scope=all → 渲染 providers + api_keys 双统计块）
    await up.mockReencryptSweepListResponse(page, {
      list: [runningListItem(RUNNING_ID, FIXED_START)],
      pagination: { page: 1, page_size: 20, total: 1 },
    });
    // 详情始终 running（动态解析 task_id），保持轮询并稳定字段
    await up.mockReencryptSweepDetailRunning(page, { started_at: FIXED_START });
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await up.gotoReencryptSweepPage(page);

      const card = up.runningCard(page);
      await test.step('「当前运行任务」卡片唯一展示该 running 任务', async () => {
        await expect(up.runningSweepView(page)).toBeVisible({ timeout: 10000 });
        expect(
          await up.sweepView(card).count(),
          '同一时刻仅展示唯一 running 任务',
        ).toBe(1);
        await expect
          .poll(() => up.svValueText(card, up.DOC.taskId), { timeout: 10000 })
          .toBe(RUNNING_ID);
      });

      await test.step('状态 Tag=运行中 且紧跟「轮询中…」', async () => {
        await expect(up.svValue(card, up.DOC.status)).toContainText(
          up.STATUS_TEXT.running,
        );
        await expect(up.pollingIndicator(card)).toHaveText(up.DOC.polling);
      });

      await test.step('耗时展示 -（running 未落库，不显示 0 ms）', async () => {
        expect(await up.svValueText(card, up.DOC.duration)).toBe('-');
      });

      await test.step('开始 / 结束时间 = {started_at} / -（finished_at 为空）', async () => {
        expect(await up.svValueText(card, up.DOC.startEndTime)).toBe(
          `${FIXED_START} / -`,
        );
      });

      await test.step('summary 为空：两统计块展示占位，无计数行', async () => {
        await expect(up.summaryBlock(card, up.DOC.providersSummary)).toContainText(
          up.DOC.summaryRunning,
        );
        await expect(up.summaryBlock(card, up.DOC.apiKeysSummary)).toContainText(
          up.DOC.summaryRunning,
        );
        expect(
          await card.locator('.sweep-view .sv-summary-nums').count(),
          'running 不应渲染 0/0/0 计数行',
        ).toBe(0);
      });

      await test.step('按 800ms 轮询 GET /{task_id}', async () => {
        await expect
          .poll(() => tracker.state.detail, { timeout: 15000 })
          .toBeGreaterThanOrEqual(3);
        tracker.state.detailUrls.forEach((u) => {
          expect(new URL(u).pathname).toBe(
            '/open-api/v1/security/reencrypt-sweeps/' + RUNNING_ID,
          );
        });
        assertPollingInterval(tracker.state.detailTimes);
      });
    } finally {
      tracker.stop();
    }
  });
});

/* ------------------------------------------------------------------ *
 * RS-P-02 无运行中任务时横幅空态
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-P-02 无运行中任务时横幅空态', () => {
  test('列表无 running → 卡片空态且不发起轮询', async ({ page }) => {
    const tracker = up.trackReencryptSweepRequests(page);
    await up.mockReencryptSweepListResponse(page, {
      list: [
        {
          task_id: 'rsp-done-1',
          status: 'succeeded',
          mode: 'reencrypt',
          dry_run: false,
          scope: 'all',
          active_key_id: 1,
          created_by: 'admin',
          started_at: '2026-10-05T10:00:00Z',
          finished_at: '2026-10-05T10:00:02Z',
          duration_ms: 2000,
          summary: {},
          error: '',
        },
      ],
      pagination: { page: 1, page_size: 20, total: 1 },
    });

    try {
      await up.gotoReencryptSweepPage(page);

      await test.step('进入页面调用列表接口', async () => {
        await expect
          .poll(() => tracker.state.list, { timeout: 10000 })
          .toBeGreaterThanOrEqual(1);
      });

      await test.step('「当前运行任务」卡片显示空态文案', async () => {
        await up.expectNoRunningTask(page);
        expect(
          await up.runningSweepView(page).count(),
          '无 running 任务不应渲染 SweepView',
        ).toBe(0);
      });

      await test.step('不发起轮询（无 running 目标）', async () => {
        await page.waitForTimeout(1500);
        expect(tracker.state.detail, '无 running 任务不应轮询').toBe(0);
      });
    } finally {
      tracker.stop();
    }
  });
});

/* ------------------------------------------------------------------ *
 * RS-P-03 任务完成停止轮询并刷新列表
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-P-03 任务完成停止轮询并刷新列表', () => {
  test('轮询转终态 → 停轮询 + 重取列表 + 行显终态', async ({ page }) => {
    const RUNNING = 'rsp-p03-running';
    const START = '2026-10-05T10:00:00Z';
    let finished = false;
    let detailCalls = 0;
    const runningRow = runningListItem(RUNNING, START);
    const doneRow = {
      task_id: RUNNING,
      status: 'succeeded',
      mode: 'reencrypt',
      dry_run: false,
      scope: 'all',
      active_key_id: 1,
      created_by: 'admin',
      started_at: START,
      finished_at: '2026-10-05T10:00:05Z',
      duration_ms: 5000,
      summary: { providers: { scanned: 10, rewritten: 8, skipped: 2 } },
      error: '',
    };

    // 可变列表：完成后返回终态行，验证「完成后重取列表」
    await page.route(up.LIST_URL_RE, (route) => {
      if (route.request().method() !== 'GET') {
        route.continue();
        return;
      }
      const rows = finished ? [doneRow] : [runningRow];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          ErrMsg: 'success',
          Data: { list: rows, pagination: { page: 1, page_size: 20, total: 1 } },
        }),
      });
    });

    // 详情：第一次仍 running 维持轮询，其后翻转为 succeeded
    await page.route(up.SWEEP_DETAIL_URL_RE, (route) => {
      if (route.request().method() !== 'GET') {
        route.continue();
        return;
      }
      detailCalls += 1;
      if (detailCalls === 1) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ErrNum: 200, ErrMsg: 'success', Data: runningRow }),
        });
        return;
      }
      finished = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 200, ErrMsg: 'success', Data: doneRow }),
      });
    });

    const tracker = up.trackReencryptSweepRequests(page);
    try {
      await up.gotoReencryptSweepPage(page);

      await test.step('初始展示 running 横幅并开始轮询', async () => {
        await expect(up.runningSweepView(page)).toBeVisible({ timeout: 10000 });
        await expect
          .poll(() => tracker.state.detail, { timeout: 10000 })
          .toBeGreaterThanOrEqual(1);
      });

      await test.step('轮询翻转为终态 → 停止轮询并重取列表', async () => {
        await expect
          .poll(() => tracker.state.detail, { timeout: 10000 })
          .toBeGreaterThanOrEqual(2);
        await expect
          .poll(() => tracker.state.list, { timeout: 10000 })
          .toBeGreaterThanOrEqual(2);
      });

      await test.step('列表中该任务展示终态：成功 + 实际耗时', async () => {
        await expect
          .poll(() => up.rowStatusTagColor(page, RUNNING), { timeout: 10000 })
          .toBe('success');
        expect(
          await up.historyRowCellText(
            page,
            RUNNING,
            up.HISTORY_COLUMN_INDEX.duration,
          ),
        ).toBe('5000');
      });

      await test.step('横幅回到空态（activeTask 已清空）', async () => {
        await up.expectNoRunningTask(page);
      });

      await test.step('轮询已停止：等待期内不再新增', async () => {
        const stopAt = tracker.state.detail;
        await page.waitForTimeout(1800);
        expect(tracker.state.detail, '进入终态后不应继续轮询').toBe(stopAt);
      });
    } finally {
      tracker.stop();
    }
  });
});

/* ------------------------------------------------------------------ *
 * RS-P-04 轮询就地刷新列表与详情
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-P-04 轮询就地刷新列表与详情', () => {
  test('按 task_id 就地合并：行 / 抽屉同步，筛选 / 页码 / 排序不变', async ({
    page,
  }) => {
    const RUNNING = 'rsp-p04-running';
    const START = '2026-10-05T10:00:00Z';
    const listRow = runningListItem(RUNNING, START); // active_key_id = 1
    await up.mockReencryptSweepListServer(page, { list: [listRow] });
    // 轮询返回 active_key_id=7，用于验证就地合并刷新。
    // 产品 pollInterval=800ms（Security/index.vue:278）且轮询从首次 fetchList 就开始，
    // 抽屉的「初值」窗口不足一个轮询周期、中间态不可稳定观测；
    // 给详情响应加 2000ms 延迟，把初值窗口拉长到确定可读（时序脆弱点修复，不弱化断言）。
    await up.mockReencryptSweepDetailRunning(
      page,
      {
        started_at: START,
        active_key_id: 7,
      },
      { delayMs: 2000 },
    );
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await up.gotoReencryptSweepPage(page);
      await expect(up.runningSweepView(page)).toBeVisible({ timeout: 10000 });

      await up.openHistoryDetail(page, RUNNING);
      await up.expectDetailDrawerOpen(page);
      const drawer = up.detailDrawer(page);

      await test.step('抽屉初值来自列表行（active_key_id=1）', async () => {
        expect(await up.svValueText(drawer, up.DOC.activeKeyId)).toBe('1');
      });

      await test.step('轮询同步刷新抽屉 detail（→ 7，不关闭）', async () => {
        await expect
          .poll(() => up.svValueText(drawer, up.DOC.activeKeyId), {
            timeout: 10000,
          })
          .toBe('7');
        expect(await up.hasVisibleDetailDrawer(page)).toBe(true);
      });

      await test.step('列表就地合并：仍为 1 行且不重取整表', async () => {
        expect(await up.historyRows(page).count()).toBe(1);
        expect(await up.historyRowTaskIds(page)).toEqual([RUNNING]);
        expect(
          tracker.state.list,
          '运行中轮询不应重取整表（仅就地合并）',
        ).toBe(1);
      });

      await test.step('筛选 / 页码 / 排序上下文保持不变', async () => {
        expect(await up.pagerCurrentPage(page)).toBe(1);
        const last =
          tracker.state.listQueries[tracker.state.listQueries.length - 1];
        expect(last.sort_by).toBe('started_at');
        expect(last.sort_order).toBe('desc');
        expect(last.status).toBeUndefined();
        expect(last.page).toBe('1');
      });
    } finally {
      tracker.stop();
    }
  });
});

/* ------------------------------------------------------------------ *
 * RS-P-05 运行中横幅进度与接口数据一致性
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-P-05 运行中横幅进度与接口数据一致性', () => {
  test('横幅 9 字段行 + 统计占位与轮询 Data 逐一对应', async ({ page }) => {
    const DATA = {
      task_id: 'rsp-01J9AB7K9M',
      status: 'running',
      mode: 'reencrypt',
      dry_run: false,
      scope: 'all',
      active_key_id: 2,
      created_by: 'admin',
      started_at: '2026-10-10T09:30:00Z',
      finished_at: '',
      duration_ms: 0,
      summary: {},
      error: '',
    };
    await up.mockReencryptSweepListServer(page, {
      list: [Object.assign({}, DATA)],
    });
    // 详情与列表同源，保持 running 稳定轮询
    await up.mockReencryptSweepDetailResponse(page, { data: DATA });

    await up.gotoReencryptSweepPage(page);
    const card = up.runningCard(page);
    await expect(up.runningSweepView(page)).toBeVisible({ timeout: 10000 });

    await test.step('横幅字段行顺序与数量（9 行）', async () => {
      expect(await up.svLabels(card)).toEqual([
        up.DOC.taskId,
        up.DOC.status,
        up.DOC.mode,
        up.DOC.dryRunLabel,
        up.DOC.scope,
        up.DOC.createdBy,
        up.DOC.activeKeyId,
        up.DOC.startEndTime,
        up.DOC.duration,
      ]);
    });

    await test.step('状态 Tag=运行中 primary 且紧跟「轮询中…」', async () => {
      await expect(up.svValue(card, up.DOC.status)).toContainText(
        up.STATUS_TEXT.running,
      );
      await expect(up.pollingIndicator(card)).toHaveText(up.DOC.polling);
      expect(await up.svStatusTagColor(card)).toBe('primary');
    });

    await test.step('逐字段与接口 Data 一致（文本 / 枚举映射 / 时间戳 / 数值）', async () => {
      expect(await up.svValueText(card, up.DOC.taskId)).toBe(DATA.task_id);
      expect(await up.svValueText(card, up.DOC.mode)).toBe(
        up.MODE_LABELS.reencrypt,
      );
      expect(await up.svValueText(card, up.DOC.dryRunLabel)).toBe(
        up.DOC.dryRunNo,
      );
      expect(await up.svValueText(card, up.DOC.scope)).toBe(up.SCOPE_LABELS.all);
      expect(await up.svValueText(card, up.DOC.createdBy)).toBe(DATA.created_by);
      expect(await up.svValueText(card, up.DOC.activeKeyId)).toBe(
        String(DATA.active_key_id),
      );
      expect(await up.svValueText(card, up.DOC.startEndTime)).toBe(
        `${DATA.started_at} / -`,
      );
      // running 时耗时展示 -（不展示 duration_ms=0）
      expect(await up.svValueText(card, up.DOC.duration)).toBe('-');
    });

    await test.step('summary 空对象 → 双统计块占位、无计数', async () => {
      expect(await up.summaryBlockCount(card)).toBe(2);
      await expect(
        up.summaryBlock(card, up.DOC.providersSummary),
      ).toContainText(up.DOC.summaryRunning);
      await expect(
        up.summaryBlock(card, up.DOC.apiKeysSummary),
      ).toContainText(up.DOC.summaryRunning);
      expect(
        await card.locator('.sweep-view .sv-summary-nums').count(),
        'running 不应渲染 0/0/0 计数行',
      ).toBe(0);
    });
  });
});