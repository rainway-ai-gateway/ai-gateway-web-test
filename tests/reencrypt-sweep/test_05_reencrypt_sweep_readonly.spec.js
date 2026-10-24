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
 * 密钥收敛（系统安全 → 密钥收敛）- 只读管理员视角 RS-RO-01 ~ RS-RO-03
 *
 * 覆盖用例（docs/reencrypt-sweep/02-功能测试用例/04-只读视角.md）：
 * - RS-RO-01 只读视角触发区「触发任务」按钮隐藏
 * - RS-RO-02 只读视角历史列表与筛选只读保留
 * - RS-RO-03 只读视角任务详情抽屉只读查看保留
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录只读账号
 *   viewer（只写当前 page 的 localStorage，不写 auth.json，避免覆盖默认 admin 会话）。
 * - 只读导航只用 utils/readonly.gotoAsReadonly + 就绪断言，**不**调用
 *   ensureSessionHealthy / ensureLoggedIn / handleUrlInvalidAlert（它们会用 conf.json 的
 *   admin 凭证重登并回写 auth.json，把只读态换回管理员态）。
 * - 数据：密钥收敛任务是服务端持久化记录且**无删除端点**，触发真实任务会永久改动共享环境，
 *   无法「造数 + 还原」；故本 spec 不发 beforeAll 造数，列表 / 详情样本用
 *   `mockReencryptSweepListServer` + `mockReencryptSweepDetailRunning` 网络 fixture 构造
 *   （与本模块 RS-D-01/03/04/05 同款），只读断言只读不写、不污染共享环境。
 *   RS-RO-02 的「运行中样本」也由 fixture 提供且详情接口被 mock 保持 running，因此运行中窗口
 *   是**确定性**的，不依赖环境里是否存在运行中任务（2026-10-16 已实测：该窗口稳定渲染
 *   「轮询中…」，见 report/test-report-20261016-170124.md 对应 error-context ARIA 快照）。
 * - **定位约定（2026-10-16 首轮实测教训）**：只读态针对 `v-has` 元素一律用 CSS + 文本定位
 *   （`up.triggerSubmitButton` / `readonly.buttonByText`）——Playwright 的 `getByRole` 基于
 *   无障碍树，看不见被 `display:none` 隐藏的元素（RS-RO-01 曾因此误报「仍在 DOM 中」失败）；
 *   「无写入口」计数断言同样用 CSS 版 locator（`up.triggerCardActionButtons` 等），
 *   否则隐藏元素会对 role 定位隐身、断言假通过。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/reencrypt-sweep/test_05_reencrypt_sweep_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const up = require('../../pages/security/ReencryptSweepPage');
const readonly = require('../../utils/readonly');

const BASE_TS = Date.UTC(2026, 9, 14, 12, 0, 0);
const HOUR = 3600 * 1000;

test.afterEach(async ({ page }) => {
  await up.unmockReencryptSweepNetwork(page);
});

// 构造一行历史任务（默认 succeeded + 双分组统计，规避触发轮询）
function sweepRow(overrides = {}) {
  return {
    task_id: 'rsp-ro-sample',
    status: 'succeeded',
    mode: 'reencrypt',
    dry_run: false,
    scope: 'all',
    active_key_id: 2,
    created_by: 'admin',
    started_at: new Date(BASE_TS).toISOString(),
    finished_at: new Date(BASE_TS + 8000).toISOString(),
    duration_ms: 8000,
    summary: {
      providers: { scanned: 120, rewritten: 118, skipped: 2 },
      api_keys: { scanned: 2400, rewritten: 2390, skipped: 10 },
    },
    error: '',
    ...overrides,
  };
}

/**
 * RS-RO-02 fixture：25 行（默认 page_size=20 →「≥1 页」），started_at 逐行递减。
 * 首位为**运行中**样本（供运行中横幅断言），另含解密方向 / 预演 / api_keys 范围样本
 * 供各筛选枚举命中。
 */
function historyFixture() {
  const rows = [];
  for (let i = 1; i <= 25; i += 1) {
    const startedAt = new Date(BASE_TS - i * HOUR).toISOString();
    rows.push(
      sweepRow({
        task_id: 'rsp-ro02-' + String(i).padStart(2, '0'),
        started_at: startedAt,
        finished_at: new Date(Date.parse(startedAt) + 8000).toISOString(),
      }),
    );
  }
  rows[0] = sweepRow({
    task_id: 'rsp-ro02-running',
    status: 'running',
    started_at: new Date(BASE_TS).toISOString(),
    finished_at: '',
    duration_ms: 0,
    summary: {},
  });
  rows[1] = Object.assign({}, rows[1], { mode: 'decrypt' });
  rows[2] = Object.assign({}, rows[2], { dry_run: true });
  rows[3] = Object.assign({}, rows[3], { scope: 'api_keys' });
  return rows;
}

/** RS-RO-03 fixture：终态（succeeded / failed / dry_run，各 ≥1）与运行中样本 */
function detailFixture() {
  return {
    succeeded: sweepRow({ task_id: 'rsp-ro03-succeeded' }),
    failed: sweepRow({
      task_id: 'rsp-ro03-failed',
      status: 'failed',
      started_at: new Date(BASE_TS - 2 * HOUR).toISOString(),
      finished_at: new Date(BASE_TS - 2 * HOUR + 3000).toISOString(),
      duration_ms: 3000,
      summary: {},
      error: 'executor lost',
    }),
    dryRun: sweepRow({
      task_id: 'rsp-ro03-dryrun',
      dry_run: true,
      started_at: new Date(BASE_TS - 3 * HOUR).toISOString(),
      finished_at: new Date(BASE_TS - 3 * HOUR + 4000).toISOString(),
      duration_ms: 4000,
      error: 'dry_run',
    }),
    running: sweepRow({
      task_id: 'rsp-ro03-running',
      status: 'running',
      started_at: new Date(BASE_TS).toISOString(),
      finished_at: '',
      duration_ms: 0,
      summary: {},
    }),
  };
}

/* ------------------------------------------------------------------ *
 * RS-RO-01 只读视角触发区「触发任务」按钮隐藏
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-RO-01 只读视角触发区「触发任务」按钮隐藏', () => {
  test('只读视角触发区无可见「触发任务」写入口；管理员视角可见且可用（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：触发区「触发任务」可见且可用', async () => {
      await up.gotoReencryptSweepPage(page);
      await readonly.expectAdminEnabled(up.triggerButton(page), up.DOC.trigger);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入「系统安全 → 密钥收敛」页面（真实环境，无 mock）', async () => {
      const resp = await up.waitForListResponse(page, () =>
        up.gotoReencryptSweepPageReadonly(page),
      );
      expect(
        resp.status(),
        '只读账号应能以 GET /security/reencrypt-sweeps 读取历史任务（只读保留查看能力）',
      ).toBe(200);
    });

    await test.step('触发区「触发任务」按钮仍渲染但被 v-has 隐藏（.v-has-hidden）', async () => {
      await readonly.expectVHasHidden(
        up.triggerSubmitButton(page),
        up.DOC.trigger,
      );
    });

    await test.step('触发区内不存在其它可见写入口（POST /security/reencrypt-sweeps 无 UI 入口）', async () => {
      await expect(
        up.triggerCardActionButtons(page),
        '触发区内应仅剩被 v-has 隐藏的「触发任务」这一个交互元素',
      ).toHaveCount(1);
      const visibleWrite = await readonly.visibleWriteControls(page);
      expect(
        visibleWrite,
        '只读视角「密钥收敛」页不应存在可见的「触发任务」写入口',
      ).not.toContain(up.DOC.trigger);
    });

    await test.step('只读区域（触发卡片 / 运行中卡片 / 历史卡片 / 筛选栏）正常展示', async () => {
      await readonly.expectReadonlyVisible(up.triggerCard(page), '触发收敛任务卡片');
      await readonly.expectReadonlyVisible(up.runningCard(page), '当前运行任务卡片');
      await readonly.expectReadonlyVisible(up.historyCard(page), '历史任务卡片');
      await readonly.expectReadonlyVisible(up.filterBar(page), '历史筛选栏');
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-RO-02 只读视角历史列表与筛选只读保留
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-RO-02 只读视角历史列表与筛选只读保留', () => {
  test('只读视角保留 9 列列表 / 筛选 / 查询 / 重置 / 分页 / 列头排序，操作列仅「详情」，运行中横幅为只读信息', async ({
    page,
  }) => {
    const rows = historyFixture();
    const RUNNING_ID = rows[0].task_id;
    const PLAIN_ID = rows[6].task_id;
    await up.mockReencryptSweepListServer(page, { list: rows });
    // 保持运行中，避免轮询进入终态触发列表重取（与本模块 RS-D-03 同款）
    await up.mockReencryptSweepDetailRunning(page, {
      started_at: rows[0].started_at,
      summary: {},
    });

    await test.step('管理员对照：列表 9 列 / 筛选栏 6 标签 / 行内「详情」（对照基线）', async () => {
      await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));
      expect(await up.getHistoryHeaders(page)).toEqual(up.HISTORY_COLUMN_HEADERS);
      expect(await up.getFilterLabels(page)).toEqual([
        up.DOC.filterStatus,
        up.DOC.filterMode,
        up.DOC.filterScope,
        up.DOC.filterDryRun,
        up.DOC.filterStartTime,
        up.DOC.filterEndTime,
      ]);
      await readonly.expectAdminVisible(
        up.historyRowAction(page, PLAIN_ID, up.DOC.detail),
        '行内「详情」',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面', async () => {
      await up.gotoReencryptSweepPageReadonly(page);
    });

    await test.step('历史任务列表正常加载并展示 9 列（任务ID/状态/变换方向/扫描范围/预演/触发者/开始时间/耗时/操作）', async () => {
      await readonly.expectReadonlyVisible(up.historyTable(page), '历史任务表格');
      const headers = await up.getHistoryHeaders(page);
      expect(headers).toEqual(up.HISTORY_COLUMN_HEADERS);
      expect(headers).toHaveLength(9);
      expect(await up.historyRows(page).count()).toBeGreaterThan(0);
    });

    await test.step('操作列仅保留「详情」只读入口，无任何写操作按钮', async () => {
      await readonly.expectReadonlyVisible(
        up.historyRowAction(page, RUNNING_ID, up.DOC.detail),
        '运行中任务「详情」',
      );
      await readonly.expectReadonlyVisible(
        up.historyRowAction(page, PLAIN_ID, up.DOC.detail),
        '终态任务「详情」',
      );
      await expect(
        up.historyRowActionButtons(page, RUNNING_ID),
        '运行中任务行操作列应仅有「详情」1 个按钮',
      ).toHaveCount(1);
      await expect(
        up.historyRowActionButtons(page, PLAIN_ID),
        '终态任务行操作列应仅有「详情」1 个按钮',
      ).toHaveCount(1);
    });

    await test.step('运行中任务横幅为只读信息（轮询中…），不提供触发 / 取消写入口', async () => {
      await readonly.expectReadonlyVisible(
        up.runningBannerPollingIndicator(page),
        '运行中横幅「轮询中…」',
      );
      await readonly.expectAbsent(
        up.runningCardActionButtons(page),
        '运行中横幅写入口',
      );
    });

    await test.step('筛选栏 6 标签与「查询 / 重置」只读控件保留可用', async () => {
      expect(await up.getFilterLabels(page)).toEqual([
        up.DOC.filterStatus,
        up.DOC.filterMode,
        up.DOC.filterScope,
        up.DOC.filterDryRun,
        up.DOC.filterStartTime,
        up.DOC.filterEndTime,
      ]);
      await readonly.expectReadonlyVisible(up.filterSearchButton(page), '查询');
      await readonly.expectReadonlyVisible(up.filterResetButton(page), '重置');
      await expect(up.filterSearchButton(page)).toBeEnabled();
      await expect(up.filterResetButton(page)).toBeEnabled();
    });

    await test.step('筛选（状态 / 变换方向 / 扫描范围）逐项命中且可重置', async () => {
      const cases = [
        {
          label: up.DOC.filterStatus,
          option: up.STATUS_TEXT.running,
          query: (q) => q.status === 'running',
          expectIds: [RUNNING_ID],
        },
        {
          label: up.DOC.filterMode,
          option: up.MODE_LABELS.decrypt,
          query: (q) => q.mode === 'decrypt',
          expectIds: [rows[1].task_id],
        },
        {
          label: up.DOC.filterScope,
          option: up.SCOPE_LABELS.api_keys,
          query: (q) => q.scope === 'api_keys',
          expectIds: [rows[3].task_id],
        },
      ];
      for (const item of cases) {
        const resp = await up.waitForListResponseWhere(
          page,
          () => up.selectFilterOption(page, item.label, item.option),
          item.query,
        );
        expect(
          item.query(up.parseListQuery(resp.url())),
          `只读视角「${item.label}」筛选应生效并携带对应 query`,
        ).toBe(true);
        await expect
          .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
          .toEqual(item.expectIds);
        expect(await up.pagerTotalNumber(page)).toBe(1);
        await up.clickReset(page);
        await expect
          .poll(() => up.pagerTotalNumber(page), { timeout: 10000 })
          .toBe(rows.length);
      }
    });

    /**
     * 「预演模式」筛选单列一条：本路径 2026-10-16 实测命中产品缺陷（**阻塞**，见
     * docs/reencrypt-sweep/02-功能测试用例/04-只读视角.md RS-RO-02「阻塞记录」）。
     *
     * 缺陷：`重置` 时 iView Select 被清空会 emit `input(undefined)`/`on-change(undefined)`
     * （iview select.vue:724「if (value === '') this.values = []」→ :739-740 emit），
     * 而 `index.vue:441` 用 `if (f.dry_run !== '')` 判定 → `undefined !== ''` 成立 →
     * 请求带 `dry_run=false`（前端显示却是「全部」）→ 结果集 25→24。
     * 断言按文档口径（RS-L-09 预期 1/4：重置清空全部筛选项、结果集恢复默认）**保留不弱化**。
     */
    await test.step('筛选（预演模式）命中后「重置」应恢复全量 —— 阻塞：产品缺陷（重置后仍携带 dry_run=false）', async () => {
      const resp = await up.waitForListResponseWhere(
        page,
        () =>
          up.selectFilterOption(
            page,
            up.DOC.filterDryRun,
            up.DOC.filterDryRunYes,
          ),
        (q) => q.dry_run === 'true',
      );
      expect(up.parseListQuery(resp.url()).dry_run).toBe('true');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual([rows[2].task_id]);
      expect(await up.pagerTotalNumber(page)).toBe(1);

      const tracker = up.trackReencryptSweepRequests(page);
      await up.clickReset(page);
      // onReset 之后 iView 各 Select 的级联 on-change 会再连发列表请求，等它们落地
      await page.waitForTimeout(1500);
      const resetQueries = tracker.state.listQueries.slice();
      tracker.stop();

      // ① 缺陷定位（报错即指向根因，而非「条数不一致」）
      expect(
        resetQueries.filter((q) => q.dry_run === 'false').length,
        '「重置」后列表请求不应携带 dry_run=false（预演模式被误当成「否」；前端显示为「全部」，请求/结果集却是预演=否）',
      ).toBe(0);

      // ② 文档口径：重置后筛选清空、结果集恢复全量（保留原断言，不因缺陷弱化）
      await expect
        .poll(() => up.pagerTotalNumber(page), { timeout: 10000 })
        .toBe(rows.length);
    });

    await test.step('时间范围筛选（开始时间起）保留可用且命中起点之后的样本', async () => {
      const cutoff = rows[1].started_at;
      await up.setFilterDate(page, 'start_time', cutoff);
      const resp = await up.clickSearch(page);
      expect(up.parseListQuery(resp.url()).start_time).toBe(cutoff);
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual([rows[0].task_id, rows[1].task_id]);
      expect(await up.pagerTotalNumber(page)).toBe(2);
      await up.clickReset(page);
      await expect
        .poll(() => up.pagerTotalNumber(page), { timeout: 10000 })
        .toBe(rows.length);
    });

    await test.step('分页控件保留：共 25 条 / 每页 20 条 / 页长选项可读 / 可切第 2 页', async () => {
      expect(await up.pagerTotalNumber(page)).toBe(rows.length);
      expect(await up.pagerCurrentPage(page)).toBe(1);
      expect(await up.pagerPageSize(page)).toBe(20);
      expect(await up.getPageSizeOptions(page)).toEqual([
        '20 条/页',
        '50 条/页',
        '100 条/页',
      ]);
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toHaveLength(20);

      await up.clickPageNumber(page, 2);
      expect(await up.pagerCurrentPage(page)).toBe(2);
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toHaveLength(5);
    });

    await test.step('列头排序保留：任务ID 可排，状态不可排，asc 顺序生效且 page 复位 1', async () => {
      expect(await up.headerSortable(page, up.DOC.columnTaskId)).toBe(true);
      expect(await up.headerSortable(page, up.DOC.columnStatus)).toBe(false);

      const resp = await up.clickSortAsc(page, up.DOC.columnTaskId);
      const q = up.parseListQuery(resp.url());
      expect(q.sort_by).toBe('task_id');
      expect(q.sort_order).toBe('asc');
      expect(q.page).toBe('1');

      const expectedAsc = rows
        .map((r) => r.task_id)
        .sort((a, b) => String(a).localeCompare(String(b)))
        .slice(0, 20);
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(expectedAsc);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

/* ------------------------------------------------------------------ *
 * RS-RO-03 只读视角任务详情抽屉只读查看保留
 * ------------------------------------------------------------------ */

test.describe('密钥收敛 - RS-RO-03 只读视角任务详情抽屉只读查看保留', () => {
  test('只读视角详情抽屉字段 / 统计块 / 错误语义完整保留且无任何写入口；管理员视角同抽屉为对照基线', async ({
    page,
  }) => {
    const rows = detailFixture();
    const list = [rows.running, rows.succeeded, rows.failed, rows.dryRun];
    await up.mockReencryptSweepListServer(page, { list });
    await up.mockReencryptSweepDetailRunning(page, {
      started_at: rows.running.started_at,
      summary: {},
    });

    await test.step('管理员对照：详情抽屉正常打开并展示 9 行字段（对照基线）', async () => {
      await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));
      await up.openHistoryDetail(page, rows.succeeded.task_id);
      await up.expectDetailDrawerOpen(page);
      expect((await up.svLabels(up.detailDrawer(page))).length).toBe(9);
      await up.closeDetailDrawer(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面并点击终态任务「详情」', async () => {
      await up.gotoReencryptSweepPageReadonly(page);
      await readonly.expectReadonlyVisible(
        up.historyRowAction(page, rows.succeeded.task_id, up.DOC.detail),
        '「详情」',
      );
      await up.openHistoryDetail(page, rows.succeeded.task_id);
      await up.expectDetailDrawerOpen(page);
    });

    await test.step('抽屉展示任务字段（任务ID / 状态 / 变换方向 / 预演模式 / 扫描范围 / 触发者 / 开始结束时间 / 耗时）', async () => {
      const root = up.detailDrawer(page);
      const labels = [
        up.DOC.taskId,
        up.DOC.status,
        up.DOC.mode,
        up.DOC.dryRunLabel,
        up.DOC.scope,
        up.DOC.createdBy,
        up.DOC.startEndTime,
        up.DOC.duration,
      ];
      for (const label of labels) {
        await readonly.expectReadonlyVisible(up.svRow(root, label), label);
      }
      expect(await up.svValueText(root, up.DOC.taskId)).toBe(
        rows.succeeded.task_id,
      );
      expect(await up.svValueText(root, up.DOC.status)).toBe(
        up.STATUS_TEXT.succeeded,
      );
    });

    await test.step('统计块按 scope 展示 providers / api_keys 两组计数', async () => {
      const root = up.detailDrawer(page);
      await readonly.expectReadonlyVisible(
        up.summaryBlock(root, up.DOC.providersSummary),
        up.DOC.providersSummary,
      );
      await readonly.expectReadonlyVisible(
        up.summaryBlock(root, up.DOC.apiKeysSummary),
        up.DOC.apiKeysSummary,
      );
      expect(await up.summaryBlockCount(root)).toBe(2);
      expect(await up.summaryNumbers(root, up.DOC.providersSummary)).toEqual({
        scanned: 120,
        rewritten: 118,
        skipped: 2,
      });
      expect(await up.summaryNumbers(root, up.DOC.apiKeysSummary)).toEqual({
        scanned: 2400,
        rewritten: 2390,
        skipped: 10,
      });
    });

    await test.step('详情抽屉为纯只读：无触发 / 取消 / 编辑写入口，无可编辑控件', async () => {
      await readonly.expectAbsent(
        up.detailDrawerActionButtons(page),
        '详情抽屉写入口',
      );
      await readonly.expectAbsent(
        up.detailDrawerEditableControls(page),
        '详情抽屉可编辑控件',
      );
    });

    await test.step('预演任务（dry_run）详情：蓝色语义提示正常只读展示，无写入口', async () => {
      await up.closeDetailDrawer(page);
      await up.openHistoryDetail(page, rows.dryRun.task_id);
      await up.expectDetailDrawerOpen(page);
      const root = up.detailDrawer(page);
      await readonly.expectReadonlyVisible(up.svNote(root), '预演提示');
      expect(await up.svNoteText(root)).toBe(up.DOC.dryRunNote);
      expect(await up.errorAlert(root).count()).toBe(0);
      await readonly.expectAbsent(
        up.detailDrawerActionButtons(page),
        '详情抽屉写入口',
      );
    });

    await test.step('失败任务（failed）详情：错误归因正常只读展示，无写入口', async () => {
      await up.closeDetailDrawer(page);
      await up.openHistoryDetail(page, rows.failed.task_id);
      await up.expectDetailDrawerOpen(page);
      const root = up.detailDrawer(page);
      await readonly.expectReadonlyVisible(up.errorAlert(root), up.DOC.error);
      await expect(up.errorAlert(root)).toContainText(
        up.DOC.errorPrefix + 'executor lost',
      );
      await readonly.expectAbsent(
        up.detailDrawerActionButtons(page),
        '详情抽屉写入口',
      );
    });

    await test.step('运行中任务详情：「轮询中…」/ 耗时 "-" / 统计占位正常只读展示', async () => {
      await up.closeDetailDrawer(page);
      await up.openHistoryDetail(page, rows.running.task_id);
      await up.expectDetailDrawerOpen(page);
      const root = up.detailDrawer(page);
      await readonly.expectReadonlyVisible(
        up.pollingIndicator(root),
        '详情「轮询中…」',
      );
      expect(await up.svValueText(root, up.DOC.duration)).toBe('-');
      await expect(
        up.summaryBlock(root, up.DOC.providersSummary),
      ).toContainText(up.DOC.summaryRunning);
      await readonly.expectAbsent(
        up.detailDrawerActionButtons(page),
        '详情抽屉写入口',
      );
      await up.closeDetailDrawer(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});