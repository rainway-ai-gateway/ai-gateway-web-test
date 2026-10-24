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
 * 密钥收敛 - 详情字段与双分组统计一致（RS-D-02）
 *
 * 前置：列表中存在 status=succeeded 且 scope=all、summary 含 providers+api_keys 的任务。
 * 打开「详情」抽屉，逐字段与权威响应 Data 比对，并核对双分组统计与进度条百分比。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/reencrypt-sweep/test_04_reencrypt_sweep_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const up = require('../../pages/security/ReencryptSweepPage');
const api = require('../../api/security-api-utils');

function hasDualGroup(t) {
  return (
    t &&
    t.status === 'succeeded' &&
    t.scope === 'all' &&
    t.summary &&
    t.summary.providers &&
    t.summary.api_keys
  );
}

test.afterEach(async ({ page }) => {
  await up.unmockReencryptSweepNetwork(page);
});

// 详情抽屉字段断言所需的字段行标签顺序（与 SweepView 渲染顺序一致）
const DETAIL_LABELS = [
  up.DOC.taskId,
  up.DOC.status,
  up.DOC.mode,
  up.DOC.dryRunLabel,
  up.DOC.scope,
  up.DOC.createdBy,
  up.DOC.activeKeyId,
  up.DOC.startEndTime,
  up.DOC.duration,
];

// 终态样本行（succeeded，scope=all，双分组统计，字段完整）
function sweepRow(overrides = {}) {
  return Object.assign(
    {
      task_id: 'rsp-demo',
      status: 'succeeded',
      mode: 'reencrypt',
      dry_run: false,
      scope: 'all',
      active_key_id: 2,
      created_by: 'admin',
      started_at: '2026-10-05T10:00:00Z',
      finished_at: '2026-10-05T10:00:08Z',
      duration_ms: 8300,
      summary: {
        providers: { scanned: 120, rewritten: 118, skipped: 2 },
        api_keys: { scanned: 2400, rewritten: 2390, skipped: 10 },
      },
      error: '',
    },
    overrides,
  );
}

// 抽屉内统计块标题列表（顺序即渲染顺序）
async function summaryTitles(root) {
  return (
    await root.locator('.sweep-view .sv-summary-title').allTextContents()
  ).map((t) => t.trim());
}

test.describe('密钥收敛 - RS-D-02 详情字段与双分组统计一致', () => {
  test('抽屉字段/双分组统计/进度条与接口 Data 一致', async ({ page }) => {
    // 建立会话（API 读取依赖 localStorage.user.sessionKey）
    await up.gotoReencryptSweepPage(page);

    // 1) 优先在首页列表中寻找合格样本（首页可见，保证可点击进入详情）
    let listResp = await api.getReencryptSweepListViaApi(page, {
      page: 1,
      page_size: 20,
    });
    let target = ((listResp.Data && listResp.Data.list) || []).find(hasDualGroup);

    // 2) 无样本则触发一次 scope=all 任务并等待完成
    if (!target) {
      test.info().annotations.push({
        type: 'note',
        description: '首页无 succeeded+scope=all+双分组样本，尝试触发新任务',
      });
      const trig = await api.triggerReencryptSweepViaApi(page, { scope: 'all' });
      if (trig.status !== 200 || !trig.Data || !trig.Data.task_id) {
        test.skip(
          true,
          `无法触发收敛任务（POST HTTP ${trig.status}），跳过 RS-D-02`,
        );
      }
      const done = await api.pollReencryptSweepUntilDoneViaApi(
        page,
        trig.Data.task_id,
      );
      if (done && hasDualGroup(done.Data)) {
        target = done.Data;
      }
    }

    if (!target) {
      test.skip(
        true,
        '环境中不存在 succeeded+scope=all 且 summary 含 providers/api_keys 的任务，跳过 RS-D-02',
      );
    }

    const taskId = target.task_id;

    // 3) 重新加载列表，定位该任务行（须在本页可见）
    await up.reloadReencryptSweepPage(page);
    if ((await up.historyRowByTaskId(page, taskId).count()) === 0) {
      test.skip(
        true,
        `任务 ${taskId} 不在当前页列表（服务端分页/排序所致），跳过 RS-D-02`,
      );
    }

    await up.openHistoryDetail(page, taskId);
    await up.expectDetailDrawerOpen(page);
    const root = up.detailDrawer(page);

    // 4) 取权威响应 Data 作为比对基准
    const detail = await api.getReencryptSweepViaApi(page, taskId);
    if (detail.status !== 200 || !detail.Data) {
      test.skip(
        true,
        `GET 详情未返回 200（HTTP ${detail.status}），跳过 RS-D-02`,
      );
    }
    const d = detail.Data;
    test.info().annotations.push({
      type: 'api_data',
      description: JSON.stringify(d),
    });
    // doc↔impl 分歧：前端 onDetail(row) 直接使用列表行数据渲染抽屉，不额外发起 GET；
    // 本用例以权威 GET 响应为基准，验证「列表行/详情渲染 与 GET Data 一致」这一用户可见契约。
    test.info().annotations.push({
      type: 'doc_impl_divergence',
      description:
        'onDetail 不发起 GET：抽屉数据取自列表行（GET 列表项与 GET 详情结构一致，均含 summary/created_by）',
    });

    await test.step('字段行与接口 Data 逐项一致', async () => {
      expect(await up.svValueText(root, up.DOC.taskId)).toBe(d.task_id);
      expect(await up.svValueText(root, up.DOC.status)).toBe(
        up.statusText(d.status),
      );
      expect(await up.svValueText(root, up.DOC.mode)).toBe(up.modeText(d.mode));
      expect(await up.svValueText(root, up.DOC.dryRunLabel)).toBe(
        d.dry_run ? up.DOC.dryRunYes : up.DOC.dryRunNo,
      );
      expect(await up.svValueText(root, up.DOC.scope)).toBe(
        up.scopeText(d.scope),
      );
      expect(await up.svValueText(root, up.DOC.createdBy)).toBe(
        d.created_by || '-',
      );
      expect(await up.svValueText(root, up.DOC.activeKeyId)).toBe(
        d.active_key_id != null ? String(d.active_key_id) : '-',
      );
      expect(await up.svValueText(root, up.DOC.startEndTime)).toBe(
        `${d.started_at || '-'} / ${d.finished_at || '-'}`,
      );
      expect(await up.svValueText(root, up.DOC.duration)).toBe(
        up.DOC.durationMs.replace('{ms}', d.duration_ms || 0),
      );
    });

    await test.step('双分组统计计数与 interface summary 一致', async () => {
      const p = up.buildSummary(d.summary.providers);
      const numsP = await up.summaryNumbers(root, up.DOC.providersSummary);
      expect(numsP).toEqual({
        scanned: p.scanned,
        rewritten: p.rewritten,
        skipped: p.skipped,
      });

      const k = up.buildSummary(d.summary.api_keys);
      const numsK = await up.summaryNumbers(root, up.DOC.apiKeysSummary);
      expect(numsK).toEqual({
        scanned: k.scanned,
        rewritten: k.rewritten,
        skipped: k.skipped,
      });
    });

    await test.step('进度条百分比 = scanned/(scanned+skipped)', async () => {
      const p = up.buildSummary(d.summary.providers);
      const k = up.buildSummary(d.summary.api_keys);
      expect(await up.progressPercent(root, up.DOC.providersSummary)).toBe(
        p.percent,
      );
      expect(await up.progressPercent(root, up.DOC.apiKeysSummary)).toBe(
        k.percent,
      );
    });

    await test.step('succeeded 且 error 为空：不出现错误 Alert', async () => {
      expect(await up.errorAlert(root).count()).toBe(0);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-01 打开详情抽屉
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-01 打开详情抽屉', () => {
  test('抽屉标题 / 宽度 60% / 字段行顺序 / 双统计块', async ({ page }) => {
    const row = sweepRow({ task_id: 'rsp-d01' });
    await up.mockReencryptSweepListServer(page, { list: [row] });

    await up.gotoReencryptSweepPage(page);
    await up.openHistoryDetail(page, row.task_id);
    await up.expectDetailDrawerOpen(page);
    const root = up.detailDrawer(page);

    await test.step('抽屉宽度为 60%', async () => {
      expect(await up.detailDrawerWidthStyle(page)).toContain('width: 60%');
    });

    await test.step('字段行 9 行且顺序符合契约', async () => {
      expect(await up.svLabels(root)).toEqual(DETAIL_LABELS);
    });

    await test.step('scope=all → 双统计块（providers + api_keys）', async () => {
      expect(await up.summaryBlockCount(root)).toBe(2);
      expect(await summaryTitles(root)).toEqual([
        up.DOC.providersSummary,
        up.DOC.apiKeysSummary,
      ]);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-03 运行中任务详情显示「轮询中…」
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-03 运行中任务详情显示「轮询中…」', () => {
  test('running 抽屉：状态 primary + 轮询中… / 耗时 - / 统计占位', async ({
    page,
  }) => {
    const START = '2026-10-05T10:00:00Z';
    const RUNNING = 'rsp-d03-running';
    const row = sweepRow({
      task_id: RUNNING,
      status: 'running',
      active_key_id: 3,
      started_at: START,
      finished_at: '',
      duration_ms: 0,
      summary: {},
    });
    await up.mockReencryptSweepListServer(page, { list: [row] });
    // 保持 running，避免轮询进入终态触发列表重取
    await up.mockReencryptSweepDetailRunning(page, {
      started_at: START,
      active_key_id: 3,
    });

    await up.gotoReencryptSweepPage(page);
    await up.openHistoryDetail(page, RUNNING);
    await up.expectDetailDrawerOpen(page);
    const root = up.detailDrawer(page);

    await test.step('状态 Tag=运行中（primary）且紧跟「轮询中…」', async () => {
      await expect(up.svValue(root, up.DOC.status)).toContainText(
        up.STATUS_TEXT.running,
      );
      await expect(up.pollingIndicator(root)).toHaveText(up.DOC.polling);
      expect(await up.svStatusTagColor(root)).toBe('primary');
    });

    await test.step('开始 / 结束时间 = {started_at} / -；耗时 = -', async () => {
      expect(await up.svValueText(root, up.DOC.startEndTime)).toBe(
        `${START} / -`,
      );
      expect(await up.svValueText(root, up.DOC.duration)).toBe('-');
    });

    await test.step('summary 空对象 → 统计块占位、无 0/0/0 计数', async () => {
      await expect(
        up.summaryBlock(root, up.DOC.providersSummary),
      ).toContainText(up.DOC.summaryRunning);
      await expect(
        up.summaryBlock(root, up.DOC.apiKeysSummary),
      ).toContainText(up.DOC.summaryRunning);
      expect(
        await root.locator('.sweep-view .sv-summary-nums').count(),
      ).toBe(0);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-04 失败任务展示错误归因
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-04 失败任务展示错误归因', () => {
  test('failed 抽屉：状态 error + 红色错误 Alert，无蓝色预演提示', async ({
    page,
  }) => {
    const ROW_ID = 'rsp-d04-failed';
    const row = sweepRow({
      task_id: ROW_ID,
      status: 'failed',
      summary: {},
      error: 'executor lost',
    });
    await up.mockReencryptSweepListServer(page, { list: [row] });

    await up.gotoReencryptSweepPage(page);
    await up.openHistoryDetail(page, ROW_ID);
    await up.expectDetailDrawerOpen(page);
    const root = up.detailDrawer(page);

    await test.step('状态 Tag=失败（error）', async () => {
      await expect(up.svValue(root, up.DOC.status)).toContainText(
        up.STATUS_TEXT.failed,
      );
      expect(await up.svStatusTagColor(root)).toBe('error');
    });

    await test.step('底部红色错误 Alert 文案「错误：executor lost」', async () => {
      const alert = up.errorAlert(root);
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(
        `${up.DOC.errorPrefix}executor lost`,
      );
    });

    await test.step('不出现蓝色预演提示（error≠dry_run）', async () => {
      expect(await up.svNote(root).count()).toBe(0);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-05 预演任务蓝色语义提示
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-05 预演任务蓝色语义提示', () => {
  test('dry_run 抽屉：状态 success + 蓝色提示，无红色 Alert', async ({
    page,
  }) => {
    const ROW_ID = 'rsp-d05-dryrun';
    const row = sweepRow({
      task_id: ROW_ID,
      status: 'succeeded',
      dry_run: true,
      error: 'dry_run',
    });
    await up.mockReencryptSweepListServer(page, { list: [row] });

    await up.gotoReencryptSweepPage(page);
    await up.openHistoryDetail(page, ROW_ID);
    await up.expectDetailDrawerOpen(page);
    const root = up.detailDrawer(page);

    await test.step('状态 Tag=成功（success），非失败', async () => {
      await expect(up.svValue(root, up.DOC.status)).toContainText(
        up.STATUS_TEXT.succeeded,
      );
      expect(await up.svStatusTagColor(root)).toBe('success');
    });

    await test.step('蓝色语义提示文案为 dryRunNote', async () => {
      await expect(up.svNote(root)).toBeVisible();
      expect(await up.svNoteText(root)).toBe(up.DOC.dryRunNote);
    });

    await test.step('蓝色提示与红色失败告警互斥', async () => {
      expect(await up.errorAlert(root).count()).toBe(0);
    });

    await test.step('预演模式展示「是（仅统计，不落库）」', async () => {
      expect(await up.svValueText(root, up.DOC.dryRunLabel)).toBe(
        up.DOC.dryRunYes,
      );
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-06 scope 决定统计块渲染范围
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-06 scope 决定统计块渲染范围', () => {
  test('all→2 块；providers→仅 providers；api_keys→仅 api_keys', async ({
    page,
  }) => {
    const rows = [
      sweepRow({
        task_id: 'rsp-scope-all',
        scope: 'all',
        summary: {
          providers: { scanned: 10, rewritten: 9, skipped: 1 },
          api_keys: { scanned: 20, rewritten: 20, skipped: 0 },
        },
      }),
      sweepRow({
        task_id: 'rsp-scope-providers',
        scope: 'providers',
        summary: { providers: { scanned: 30, rewritten: 30, skipped: 0 } },
      }),
      sweepRow({
        task_id: 'rsp-scope-apikeys',
        scope: 'api_keys',
        summary: { api_keys: { scanned: 40, rewritten: 40, skipped: 0 } },
      }),
    ];
    await up.mockReencryptSweepListServer(page, { list: rows });

    await up.gotoReencryptSweepPage(page);
    const root = up.detailDrawer(page);

    await test.step('scope=all → providers + api_keys 两块', async () => {
      await up.openHistoryDetail(page, 'rsp-scope-all');
      await up.expectDetailDrawerOpen(page);
      expect(await up.summaryBlockCount(root)).toBe(2);
      expect(await summaryTitles(root)).toEqual([
        up.DOC.providersSummary,
        up.DOC.apiKeysSummary,
      ]);
      await up.closeDetailDrawer(page);
    });

    await test.step('scope=providers → 仅 providers 一块，无残留空块', async () => {
      await up.openHistoryDetail(page, 'rsp-scope-providers');
      await up.expectDetailDrawerOpen(page);
      expect(await up.summaryBlockCount(root)).toBe(1);
      expect(await summaryTitles(root)).toEqual([up.DOC.providersSummary]);
      await up.closeDetailDrawer(page);
    });

    await test.step('scope=api_keys → 仅 api_keys 一块，无残留空块', async () => {
      await up.openHistoryDetail(page, 'rsp-scope-apikeys');
      await up.expectDetailDrawerOpen(page);
      expect(await up.summaryBlockCount(root)).toBe(1);
      expect(await summaryTitles(root)).toEqual([up.DOC.apiKeysSummary]);
      await up.closeDetailDrawer(page);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-07 活跃密钥 ID 展示
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-07 活跃密钥 ID 展示', () => {
  test('reencrypt 原值 / decrypt=0 / 缺省=-', async ({ page }) => {
    const rows = [
      sweepRow({ task_id: 'rsp-ak-reencrypt', mode: 'reencrypt', active_key_id: 5 }),
      sweepRow({ task_id: 'rsp-ak-decrypt', mode: 'decrypt', active_key_id: 0 }),
      sweepRow({ task_id: 'rsp-ak-null', mode: 'reencrypt', active_key_id: null }),
    ];
    await up.mockReencryptSweepListServer(page, { list: rows });

    await up.gotoReencryptSweepPage(page);
    const root = up.detailDrawer(page);

    await test.step('reencrypt：展示实际 active 钥编号 5', async () => {
      await up.openHistoryDetail(page, 'rsp-ak-reencrypt');
      await up.expectDetailDrawerOpen(page);
      expect(await up.svValueText(root, up.DOC.activeKeyId)).toBe('5');
      await up.closeDetailDrawer(page);
    });

    await test.step('decrypt：展示 0（无重写目标钥）', async () => {
      await up.openHistoryDetail(page, 'rsp-ak-decrypt');
      await up.expectDetailDrawerOpen(page);
      expect(await up.svValueText(root, up.DOC.activeKeyId)).toBe('0');
      await up.closeDetailDrawer(page);
    });

    await test.step('active_key_id 为空 → 兜底展示 -', async () => {
      await up.openHistoryDetail(page, 'rsp-ak-null');
      await up.expectDetailDrawerOpen(page);
      expect(await up.svValueText(root, up.DOC.activeKeyId)).toBe('-');
      await up.closeDetailDrawer(page);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-08 详情 404 提示
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-08 详情 404 提示', () => {
  test('轮询命中 404 → 提示「未找到任务：{id}」且不残留抽屉数据', async ({
    page,
  }) => {
    const MISSING = 'rsp-d08-missing';
    const row = sweepRow({
      task_id: MISSING,
      status: 'running',
      started_at: '2026-10-05T10:00:00Z',
      finished_at: '',
      duration_ms: 0,
      summary: {},
    });
    await up.mockReencryptSweepListServer(page, { list: [row] });
    await up.mockReencryptSweepDetailResponse(page, {
      status: 404,
      errMsg: 'task not found',
    });
    test.info().annotations.push({
      type: 'doc_impl_divergence',
      description:
        'onDetail(row) 直接使用列表行渲染抽屉，不额外发起 GET；404 只能由轮询 pollTask 路径触发',
    });

    await up.gotoReencryptSweepPage(page);

    await test.step('展示「未找到任务：{id}」提示', async () => {
      await up.expectMessageContains(
        page,
        up.DOC.taskNotFound.replace('{id}', MISSING),
        15000,
      );
    });

    await test.step('不打开详情抽屉、不残留数据', async () => {
      expect(await up.hasVisibleDetailDrawer(page)).toBe(false);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-D-09 详情接口数据与页面展示一致性
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-D-09 详情接口数据与页面展示一致性', () => {
  test('全字段矩阵 + 双分组统计 + 进度条百分比', async ({ page }) => {
    const d = sweepRow({
      task_id: 'rsp-01J8XQ7K9M',
      mode: 'reencrypt',
      scope: 'all',
      active_key_id: 2,
      created_by: 'admin',
      started_at: '2026-10-05T10:00:00Z',
      finished_at: '2026-10-05T10:00:08Z',
      duration_ms: 8300,
      summary: {
        providers: { scanned: 120, rewritten: 118, skipped: 2 },
        api_keys: { scanned: 2400, rewritten: 2390, skipped: 10 },
      },
      error: '',
    });
    await up.mockReencryptSweepListServer(page, { list: [d] });

    await up.gotoReencryptSweepPage(page);
    await up.openHistoryDetail(page, d.task_id);
    await up.expectDetailDrawerOpen(page);
    const root = up.detailDrawer(page);

    await test.step('字段行与接口 Data 逐项一致', async () => {
      expect(await up.svLabels(root)).toEqual(DETAIL_LABELS);
      expect(await up.svValueText(root, up.DOC.taskId)).toBe(d.task_id);
      expect(await up.svValueText(root, up.DOC.status)).toBe(
        up.statusText(d.status),
      );
      expect(await up.svStatusTagColor(root)).toBe(
        up.statusTagColor(d.status),
      );
      expect(await up.svValueText(root, up.DOC.mode)).toBe(up.modeText(d.mode));
      expect(await up.svValueText(root, up.DOC.dryRunLabel)).toBe(
        d.dry_run ? up.DOC.dryRunYes : up.DOC.dryRunNo,
      );
      expect(await up.svValueText(root, up.DOC.scope)).toBe(
        up.scopeText(d.scope),
      );
      expect(await up.svValueText(root, up.DOC.createdBy)).toBe(d.created_by);
      expect(await up.svValueText(root, up.DOC.activeKeyId)).toBe(
        String(d.active_key_id),
      );
      expect(await up.svValueText(root, up.DOC.startEndTime)).toBe(
        `${d.started_at} / ${d.finished_at}`,
      );
      expect(await up.svValueText(root, up.DOC.duration)).toBe(
        up.DOC.durationMs.replace('{ms}', d.duration_ms),
      );
    });

    await test.step('双分组统计计数与 summary 一致', async () => {
      const p = up.buildSummary(d.summary.providers);
      expect(await up.summaryNumbers(root, up.DOC.providersSummary)).toEqual({
        scanned: p.scanned,
        rewritten: p.rewritten,
        skipped: p.skipped,
      });
      const k = up.buildSummary(d.summary.api_keys);
      expect(await up.summaryNumbers(root, up.DOC.apiKeysSummary)).toEqual({
        scanned: k.scanned,
        rewritten: k.rewritten,
        skipped: k.skipped,
      });
    });

    await test.step('进度条百分比 = scanned/(scanned+skipped)', async () => {
      const p = up.buildSummary(d.summary.providers);
      const k = up.buildSummary(d.summary.api_keys);
      expect(await up.progressPercent(root, up.DOC.providersSummary)).toBe(
        p.percent,
      );
      expect(await up.progressPercent(root, up.DOC.apiKeysSummary)).toBe(
        k.percent,
      );
    });

    await test.step('error 为空：不出现任何错误 / 预演提示', async () => {
      expect(await up.errorAlert(root).count()).toBe(0);
      expect(await up.svNote(root).count()).toBe(0);
    });
  });
});