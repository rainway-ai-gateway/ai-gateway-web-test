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
 * 密钥收敛 - 列表默认加载（RS-L-01 进入页面加载列表：默认参数 / 9 列 / 分页器一致）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/reencrypt-sweep/test_02_reencrypt_sweep_list.spec.js
 */
const { test, expect } = require('@playwright/test');
const up = require('../../pages/security/ReencryptSweepPage');

// 默认不应携带的筛选参数
const UNSET_FILTER_KEYS = [
  'status',
  'mode',
  'scope',
  'dry_run',
  'start_time',
  'end_time',
];

test.afterEach(async ({ page }) => {
  await up.unmockReencryptSweepNetwork(page);
});

// 构造一行历史任务（默认 succeeded，规避触发轮询）
function sweepRow(overrides = {}) {
  return {
    task_id: 'rsp-row',
    status: 'succeeded',
    mode: 'reencrypt',
    dry_run: false,
    scope: 'all',
    active_key_id: 1,
    created_by: 'admin',
    started_at: '2026-10-08T10:00:00Z',
    finished_at: '2026-10-08T10:00:02Z',
    duration_ms: 2000,
    summary: {},
    error: '',
    ...overrides,
  };
}

// 生成 n 行确定性 fixture：started_at 分钟递增；task_id 与 started_at 逆向
function pagedRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const mm = String(i).padStart(2, '0');
    rows.push(
      sweepRow({
        task_id: `rsp-${String(n - 1 - i).padStart(2, '0')}`,
        started_at: `2026-10-01T00:${mm}:00Z`,
        finished_at: `2026-10-01T00:${mm}:05Z`,
        duration_ms: 1000 + i,
      }),
    );
  }
  return rows;
}

test.describe('密钥收敛 - RS-L-01 进入页面加载列表（默认参数）', () => {
  test('默认 Query 与 9 列表头、分页器与接口一致', async ({ page }) => {
    const listResponse = await up.waitForListResponse(page, () =>
      up.gotoReencryptSweepPage(page),
    );

    expect(listResponse.status()).toBe(200);

    let body = {};
    try {
      body = await listResponse.json();
    } catch (e) {
      body = {};
    }
    test.info().annotations.push({
      type: 'api_data',
      description: JSON.stringify(body),
    });

    await test.step('默认 Query：page=1/page_size=20/sort_by=started_at/sort_order=desc，且无筛选参数', async () => {
      const query = up.parseListQuery(listResponse.url());
      expect(query.page, 'page 默认应为 1').toBe('1');
      expect(query.page_size, 'page_size 默认应为 20').toBe('20');
      expect(query.sort_by, 'sort_by 默认应为 started_at').toBe('started_at');
      expect(query.sort_order, 'sort_order 默认应为 desc').toBe('desc');
      UNSET_FILTER_KEYS.forEach((key) => {
        expect(query[key], `默认不应携带筛选参数 ${key}`).toBeUndefined();
      });
    });

    await test.step('表头固定 9 列且顺序与接口映射一致', async () => {
      expect(await up.getHistoryHeaders(page)).toEqual(up.HISTORY_COLUMN_HEADERS);
    });

    const data = body.Data || {};
    const list = data.list || [];
    const pagination = data.pagination || {};

    if (list.length === 0) {
      test.info().annotations.push({
        type: 'note',
        description: '当前环境无历史任务（Data.list 为空），跳过分页器/行序一致性断言',
      });
      await up.expectNoHistory(page);
      return;
    }

    await test.step('分页器与 Data.pagination 一致', async () => {
      expect(await up.pagerTotalNumber(page)).toBe(pagination.total);
      expect(await up.pagerCurrentPage(page)).toBe(pagination.page);
      expect(await up.pagerPageSize(page)).toBe(pagination.page_size);
    });

    await test.step('列表行序与 Data.list 一致（默认 started_at desc，首行=最近启动）', async () => {
      const ids = await up.historyRowTaskIds(page);
      expect(ids.length, '渲染行数应与本页 list 长度一致').toBe(list.length);
      expect(ids[0], '首行应为接口 list[0].task_id').toBe(list[0].task_id);
    });
  });
});

test.describe('密钥收敛 - RS-L-02 列表 9 列与接口字段一致', () => {
  test('三态行的列映射 / Tag 颜色 / running 耗时占位 / 可排序列标记', async ({ page }) => {
    const rows = [
      sweepRow({
        task_id: 'rsp-succ',
        status: 'succeeded',
        mode: 'reencrypt',
        scope: 'all',
        dry_run: false,
        created_by: 'admin',
        started_at: '2026-10-08T10:00:00Z',
        duration_ms: 2000,
      }),
      sweepRow({
        task_id: 'rsp-fail',
        status: 'failed',
        mode: 'decrypt',
        scope: 'providers',
        dry_run: false,
        created_by: 'ops',
        started_at: '2026-10-08T09:00:00Z',
        duration_ms: 500,
      }),
      sweepRow({
        task_id: 'rsp-run',
        status: 'running',
        mode: 'reencrypt',
        scope: 'api_keys',
        dry_run: true,
        created_by: '',
        started_at: '2026-10-08T11:00:00Z',
        duration_ms: 0,
        finished_at: '',
      }),
    ];
    await up.mockReencryptSweepListServer(page, { list: rows });
    // running 行会触发轮询；detail 覆盖与 fixture 行一致，避免就地 merge 改写展示值
    await up.mockReencryptSweepDetailRunning(page, {
      task_id: 'rsp-run',
      status: 'running',
      mode: 'reencrypt',
      scope: 'api_keys',
      dry_run: true,
      created_by: '',
      active_key_id: 1,
      started_at: '2026-10-08T11:00:00Z',
      finished_at: '',
      duration_ms: 0,
      summary: {},
      error: '',
    });

    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));
    await expect.poll(() => up.historyRowTaskIds(page), { timeout: 10000 }).toHaveLength(3);

    await test.step('表头固定 9 列且顺序正确', async () => {
      expect(await up.getHistoryHeaders(page)).toEqual(up.HISTORY_COLUMN_HEADERS);
    });

    await test.step('succeeded 行：全列映射 + Tag success', async () => {
      expect(await up.historyRowCellTexts(page, 'rsp-succ')).toEqual([
        'rsp-succ',
        '成功',
        '重加密',
        '全部',
        '否',
        'admin',
        '2026-10-08T10:00:00Z',
        '2000',
        '详情',
      ]);
      expect(await up.rowStatusTagColor(page, 'rsp-succ')).toBe('success');
    });

    await test.step('failed 行：枚举映射 + Tag error', async () => {
      expect(await up.historyRowCellTexts(page, 'rsp-fail')).toEqual([
        'rsp-fail',
        '失败',
        '解密',
        '仅 providers 表',
        '否',
        'ops',
        '2026-10-08T09:00:00Z',
        '500',
        '详情',
      ]);
      expect(await up.rowStatusTagColor(page, 'rsp-fail')).toBe('error');
    });

    await test.step('running 行：Tag primary、预演=是、触发者空→-、耗时→-', async () => {
      expect(await up.historyRowCellTexts(page, 'rsp-run')).toEqual([
        'rsp-run',
        '运行中',
        '重加密',
        '仅 api_keys 表',
        '是',
        '-',
        '2026-10-08T11:00:00Z',
        '-',
        '详情',
      ]);
      expect(await up.rowStatusTagColor(page, 'rsp-run')).toBe('primary');
    });

    await test.step('仅任务ID / 开始时间为可排序列', async () => {
      expect(await up.headerSortable(page, up.DOC.columnTaskId)).toBe(true);
      expect(await up.headerSortable(page, up.DOC.columnStartedAt)).toBe(true);
      expect(await up.headerSortable(page, up.DOC.columnStatus)).toBe(false);
    });
  });
});

test.describe('密钥收敛 - RS-L-03 筛选栏与 Query 参数一致', () => {
  test('6 标签 + 查询/重置按钮，筛选变更映射 Query 并复位 page', async ({ page }) => {
    await up.mockReencryptSweepListServer(page, { list: [sweepRow()] });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));

    await test.step('筛选栏 6 个标签 + 查询/重置按钮', async () => {
      expect(await up.getFilterLabels(page)).toEqual([
        up.DOC.filterStatus,
        up.DOC.filterMode,
        up.DOC.filterScope,
        up.DOC.filterDryRun,
        up.DOC.filterStartTime,
        up.DOC.filterEndTime,
      ]);
      await expect(up.filterSearchButton(page)).toBeVisible();
      await expect(up.filterResetButton(page)).toBeVisible();
    });

    await test.step('任务状态=成功 → query.status=succeeded 且 page=1', async () => {
      const resp = await up.waitForListResponse(page, () =>
        up.selectFilterOption(page, up.DOC.filterStatus, up.STATUS_TEXT.succeeded),
      );
      const q = up.parseListQuery(resp.url());
      expect(q.status).toBe('succeeded');
      expect(q.page).toBe('1');
    });

    await test.step('变换方向=解密 → query.mode=decrypt', async () => {
      const resp = await up.waitForListResponse(page, () =>
        up.selectFilterOption(page, up.DOC.filterMode, up.MODE_LABELS.decrypt),
      );
      expect(up.parseListQuery(resp.url()).mode).toBe('decrypt');
    });

    await test.step('扫描范围=仅 providers 表 → query.scope=providers', async () => {
      const resp = await up.waitForListResponse(page, () =>
        up.selectFilterOption(page, up.DOC.filterScope, up.SCOPE_LABELS.providers),
      );
      expect(up.parseListQuery(resp.url()).scope).toBe('providers');
    });

    await test.step('预演=是 → query.dry_run=true（字符串转布尔）', async () => {
      const resp = await up.waitForListResponse(page, () =>
        up.selectFilterOption(page, up.DOC.filterDryRun, up.DOC.filterDryRunYes),
      );
      expect(up.parseListQuery(resp.url()).dry_run).toBe('true');
    });

    await test.step('翻到第 2 页后变更筛选 → page 复位为 1', async () => {
      await up.forceListPage(page, 2);
      const resp = await up.waitForListResponse(page, () =>
        up.selectFilterOption(page, up.DOC.filterStatus, up.STATUS_TEXT.failed),
      );
      const q = up.parseListQuery(resp.url());
      expect(q.page).toBe('1');
      expect(q.status).toBe('failed');
    });
  });
});

test.describe('密钥收敛 - RS-L-04 按枚举过滤命中', () => {
  test('各枚举过滤返回集合均满足条件，组合与空命中', async ({ page }) => {
    const rows = [
      sweepRow({
        task_id: 'rsp-a',
        status: 'succeeded',
        mode: 'reencrypt',
        scope: 'all',
        dry_run: false,
        started_at: '2026-10-08T10:00:00Z',
      }),
      sweepRow({
        task_id: 'rsp-b',
        status: 'succeeded',
        mode: 'decrypt',
        scope: 'api_keys',
        dry_run: true,
        started_at: '2026-10-08T09:00:00Z',
      }),
      sweepRow({
        task_id: 'rsp-c',
        status: 'failed',
        mode: 'decrypt',
        scope: 'providers',
        dry_run: false,
        started_at: '2026-10-08T08:00:00Z',
      }),
    ];
    await up.mockReencryptSweepListServer(page, { list: rows });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));

    await test.step('status=成功 → 仅返回 succeeded 行', async () => {
      const resp = await up.waitForListResponseWhere(
        page,
        () =>
          up.selectFilterOption(page, up.DOC.filterStatus, up.STATUS_TEXT.succeeded),
        (q) => q.status === 'succeeded',
      );
      expect(up.parseListQuery(resp.url()).status).toBe('succeeded');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-a', 'rsp-b']);
      expect(await up.rowStatusCell(page, 'rsp-a').textContent()).toContain('成功');
    });

    await test.step('复位后 mode=解密 → 仅返回 decrypt 行', async () => {
      await up.clickReset(page);
      const resp = await up.waitForListResponseWhere(
        page,
        () => up.selectFilterOption(page, up.DOC.filterMode, up.MODE_LABELS.decrypt),
        (q) => q.mode === 'decrypt',
      );
      expect(up.parseListQuery(resp.url()).mode).toBe('decrypt');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-b', 'rsp-c']);
    });

    await test.step('复位后 scope=仅 api_keys 表 → 仅返回 api_keys 行', async () => {
      await up.clickReset(page);
      const resp = await up.waitForListResponseWhere(
        page,
        () => up.selectFilterOption(page, up.DOC.filterScope, up.SCOPE_LABELS.api_keys),
        (q) => q.scope === 'api_keys',
      );
      expect(up.parseListQuery(resp.url()).scope).toBe('api_keys');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-b']);
    });

    await test.step('复位后 dry_run=是 → 仅返回 dry_run 行', async () => {
      await up.clickReset(page);
      const resp = await up.waitForListResponseWhere(
        page,
        () => up.selectFilterOption(page, up.DOC.filterDryRun, up.DOC.filterDryRunYes),
        (q) => q.dry_run === 'true',
      );
      expect(up.parseListQuery(resp.url()).dry_run).toBe('true');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-b']);
      expect(await up.historyRowCellText(page, 'rsp-b', up.HISTORY_COLUMN_INDEX.dryRun)).toBe('是');
    });

    await test.step('组合 status=成功 + dry_run=是 → 交集', async () => {
      await up.clickReset(page);
      await up.waitForListResponseWhere(
        page,
        () =>
          up.selectFilterOption(page, up.DOC.filterStatus, up.STATUS_TEXT.succeeded),
        (q) => q.status === 'succeeded',
      );
      const resp = await up.waitForListResponseWhere(
        page,
        () => up.selectFilterOption(page, up.DOC.filterDryRun, up.DOC.filterDryRunYes),
        (q) => q.status === 'succeeded' && q.dry_run === 'true',
      );
      const q = up.parseListQuery(resp.url());
      expect(q.status).toBe('succeeded');
      expect(q.dry_run).toBe('true');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-b']);
    });

    await test.step('组合无命中 → 空态且分页器不显示', async () => {
      const resp = await up.waitForListResponseWhere(
        page,
        () => up.selectFilterOption(page, up.DOC.filterScope, up.SCOPE_LABELS.providers),
        (q) => q.scope === 'providers',
      );
      expect(up.parseListQuery(resp.url()).scope).toBe('providers');
      await up.expectNoHistory(page);
      await expect(up.historyCard(page).locator('.ivu-table')).toHaveCount(0);
      await expect(up.historyCard(page).locator('.sec-pager')).toHaveCount(0);
    });
  });
});

test.describe('密钥收敛 - RS-L-05 时间范围过滤（含边界）', () => {
  test('start_time/end_time 边界闭合、单端独立生效', async ({ page }) => {
    const rows = [
      sweepRow({
        task_id: 'rsp-x',
        started_at: '2026-10-05T10:00:00Z',
        finished_at: '2026-10-05T10:00:05Z',
      }),
      sweepRow({
        task_id: 'rsp-y',
        started_at: '2026-10-05T12:00:00Z',
        finished_at: '2026-10-05T12:00:05Z',
      }),
      sweepRow({
        task_id: 'rsp-z',
        started_at: '2026-10-05T14:00:00Z',
        finished_at: '2026-10-05T14:00:05Z',
      }),
    ];
    await up.mockReencryptSweepListServer(page, { list: rows });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));

    await test.step('start=end=10:00 → 仅边界任务 rsp-x，值为 RFC3339', async () => {
      await up.setFilterDate(page, 'start_time', '2026-10-05T10:00:00Z');
      await up.setFilterDate(page, 'end_time', '2026-10-05T10:00:00Z');
      const resp = await up.clickSearch(page);
      const q = up.parseListQuery(resp.url());
      expect(q.start_time).toBe('2026-10-05T10:00:00.000Z');
      expect(q.end_time).toBe('2026-10-05T10:00:00.000Z');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-x']);
    });

    await test.step('仅 start_time=12:00 → started_at >= 12:00（默认 desc 排序）', async () => {
      await up.setFilterDate(page, 'start_time', '2026-10-05T12:00:00Z');
      await up.setFilterDate(page, 'end_time', '');
      const resp = await up.clickSearch(page);
      const q = up.parseListQuery(resp.url());
      expect(q.start_time).toBe('2026-10-05T12:00:00.000Z');
      expect(q.end_time).toBeUndefined();
      // 列表默认 sort_by=started_at & sort_order=desc（mock 与真实后端一致），
      // 故 14:00 的 rsp-z 在 12:00 的 rsp-y 之前
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-z', 'rsp-y']);
    });

    await test.step('仅 end_time=12:00 → started_at <= 12:00（上界含，默认 desc 排序）', async () => {
      await up.setFilterDate(page, 'start_time', '');
      await up.setFilterDate(page, 'end_time', '2026-10-05T12:00:00Z');
      const resp = await up.clickSearch(page);
      const q = up.parseListQuery(resp.url());
      expect(q.start_time).toBeUndefined();
      expect(q.end_time).toBe('2026-10-05T12:00:00.000Z');
      await expect
        .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
        .toEqual(['rsp-y', 'rsp-x']);
    });
  });
});

test.describe('密钥收敛 - RS-L-06 时间区间非法 422 归因', () => {
  test('end_time 早于 start_time → 422 Notice 归因且不重复弹加载失败', async ({ page }) => {
    await up.mockReencryptSweepListResponse(page, {
      status: 422,
      errMsg: 'invalid_time_range: end_time must be after start_time',
    });
    await up.gotoReencryptSweepPage(page);

    await up.setFilterDate(page, 'start_time', '2026-10-05T12:00:00Z');
    await up.setFilterDate(page, 'end_time', '2026-10-05T10:00:00Z');
    const resp = await up.clickSearch(page);
    expect(resp.status()).toBe(422);

    await test.step('字段级归因 Notice（title/content）', async () => {
      await up.expectMessageContains(page, 'invalid_time_range');
      await up.expectMessageContains(page, 'end_time must be after start_time');
    });

    await test.step('不额外弹出「加载任务失败」重复提示', async () => {
      await expect(
        page.locator('.ivu-message').filter({ hasText: up.DOC.loadFailed }),
      ).toHaveCount(0);
    });
  });
});

test.describe('密钥收敛 - RS-L-07 服务端分页', () => {
  test('默认分页、切页、页长切换（20/50/100）与复位', async ({ page }) => {
    await up.mockReencryptSweepListServer(page, { list: pagedRows(45) });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));

    await test.step('默认 page=1/page_size=20，total=45，本页 20 行', async () => {
      expect(await up.pagerTotalNumber(page)).toBe(45);
      expect(await up.pagerCurrentPage(page)).toBe(1);
      expect(await up.pagerPageSize(page)).toBe(20);
      expect(await up.getPageSizeOptions(page)).toEqual([
        '20 条/页',
        '50 条/页',
        '100 条/页',
      ]);
      await expect.poll(() => up.historyRowTaskIds(page), { timeout: 10000 }).toHaveLength(20);
      expect((await up.historyRowTaskIds(page))[0]).toBe('rsp-00');
    });

    await test.step('切到第 2 页 → page=2，请求保持 page_size/排序', async () => {
      const resp = await up.clickPageNumber(page, 2);
      const q = up.parseListQuery(resp.url());
      expect(q.page).toBe('2');
      expect(q.page_size).toBe('20');
      expect(q.sort_by).toBe('started_at');
      expect(await up.pagerCurrentPage(page)).toBe(2);
      await expect.poll(() => up.historyRowTaskIds(page), { timeout: 10000 }).toHaveLength(20);
    });

    await test.step('切到第 3 页 → 余 5 行', async () => {
      await up.clickPageNumber(page, 3);
      expect(await up.pagerCurrentPage(page)).toBe(3);
      await expect.poll(() => up.historyRowTaskIds(page), { timeout: 10000 }).toHaveLength(5);
    });

    await test.step('页长切 50 → page_size=50 且 page 复位 1，本页 45 行', async () => {
      const resp = await up.selectPageSize(page, 50);
      const q = up.parseListQuery(resp.url());
      expect(q.page_size).toBe('50');
      expect(q.page).toBe('1');
      expect(await up.pagerPageSize(page)).toBe(50);
      expect(await up.pagerCurrentPage(page)).toBe(1);
      await expect.poll(() => up.historyRowTaskIds(page), { timeout: 10000 }).toHaveLength(45);
    });

    await test.step('页长切 100（上限）→ page_size=100', async () => {
      const resp = await up.selectPageSize(page, 100);
      expect(up.parseListQuery(resp.url()).page_size).toBe('100');
      expect(await up.pagerPageSize(page)).toBe(100);
    });
  });
});

test.describe('密钥收敛 - RS-L-08 列头排序', () => {
  test('可排序列 asc/desc、normal 回落默认、不可排序列不请求', async ({ page }) => {
    await up.mockReencryptSweepListServer(page, { list: pagedRows(6) });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await test.step('可排序列标记：任务ID / 开始时间可排，状态不可排', async () => {
        expect(await up.headerSortable(page, up.DOC.columnTaskId)).toBe(true);
        expect(await up.headerSortable(page, up.DOC.columnStartedAt)).toBe(true);
        expect(await up.headerSortable(page, up.DOC.columnStatus)).toBe(false);
      });

      await test.step('开始时间 asc → sort_by=started_at/order=asc，首行=rsp-05', async () => {
        const resp = await up.clickSortAsc(page, up.DOC.columnStartedAt);
        const q = up.parseListQuery(resp.url());
        expect(q.sort_by).toBe('started_at');
        expect(q.sort_order).toBe('asc');
        expect((await up.historyRowTaskIds(page))[0]).toBe('rsp-05');
      });

      await test.step('开始时间 desc → order=desc，首行=rsp-00', async () => {
        const resp = await up.clickSortDesc(page, up.DOC.columnStartedAt);
        expect(up.parseListQuery(resp.url()).sort_order).toBe('desc');
        expect((await up.historyRowTaskIds(page))[0]).toBe('rsp-00');
      });

      await test.step('任务ID asc → sort_by=task_id，首行=rsp-00', async () => {
        const resp = await up.clickSortAsc(page, up.DOC.columnTaskId);
        const q = up.parseListQuery(resp.url());
        expect(q.sort_by).toBe('task_id');
        expect(q.sort_order).toBe('asc');
        expect((await up.historyRowTaskIds(page))[0]).toBe('rsp-00');
      });

      await test.step('任务ID desc → 首行=rsp-05', async () => {
        await up.clickSortDesc(page, up.DOC.columnTaskId);
        expect((await up.historyRowTaskIds(page))[0]).toBe('rsp-05');
      });

      await test.step('再次点任务ID asc → order=normal 回落默认 started_at/desc 且 page=1', async () => {
        // 首点设为 asc，二次点 asc caret → handleSort 回落 'normal'
        await up.clickSortAsc(page, up.DOC.columnTaskId);
        const resp = await up.clickSortAsc(page, up.DOC.columnTaskId);
        const q = up.parseListQuery(resp.url());
        expect(q.sort_by).toBe('started_at');
        expect(q.sort_order).toBe('desc');
        expect(q.page).toBe('1');
      });

      await test.step('点击不可排序列（状态）不产生排序请求', async () => {
        const before = tracker.state.list;
        await up.headerCell(page, up.DOC.columnStatus).locator('.ivu-table-cell').first().click();
        await page.waitForTimeout(500);
        expect(tracker.state.list, '不可排序列不应触发表格请求').toBe(before);
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('密钥收敛 - RS-L-09 重置筛选与排序', () => {
  test('重置清空筛选、排序回落默认、页码复位 1', async ({ page }) => {
    await up.mockReencryptSweepListServer(page, { list: pagedRows(45) });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));

    await test.step('预置筛选 + 排序 + 翻页', async () => {
      await up.waitForListResponse(page, () =>
        up.selectFilterOption(page, up.DOC.filterStatus, up.STATUS_TEXT.succeeded),
      );
      await up.clickSortAsc(page, up.DOC.columnTaskId);
      await up.forceListPage(page, 2);
      expect(await up.pagerCurrentPage(page)).toBe(2);
    });

    await test.step('重置 → 默认参数（无筛选、started_at/desc、page=1）', async () => {
      const resp = await up.clickReset(page);
      const q = up.parseListQuery(resp.url());
      expect(q.page).toBe('1');
      expect(q.page_size).toBe('20');
      expect(q.sort_by).toBe('started_at');
      expect(q.sort_order).toBe('desc');
      UNSET_FILTER_KEYS.forEach((key) => {
        expect(q[key], `重置后不应携带筛选参数 ${key}`).toBeUndefined();
      });
      expect(await up.pagerCurrentPage(page)).toBe(1);
    });
  });
});

test.describe('密钥收敛 - RS-L-10 列表空态', () => {
  test('空列表展示空态且不渲染表格 / 分页器', async ({ page }) => {
    await up.mockReencryptSweepListServer(page, { list: [] });
    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));

    await test.step('空态文案「暂无历史任务。」', async () => {
      await up.expectNoHistory(page);
    });

    await test.step('不渲染表格与分页器', async () => {
      await expect(up.historyCard(page).locator('.ivu-table')).toHaveCount(0);
      await expect(up.historyCard(page).locator('.sec-pager')).toHaveCount(0);
    });
  });
});

test.describe('密钥收敛 - RS-L-11 列表与接口数据一致性', () => {
  test('全列 × 全行与接口 Data.list 逐项一致（含 running 行）', async ({ page }) => {
    const runningRow = sweepRow({
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
    });
    const succeededRow = sweepRow({
      task_id: 'rsp-01J8XQ7K9M',
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
    });
    const rows = [runningRow, succeededRow];

    await up.mockReencryptSweepListServer(page, { list: rows });
    await up.mockReencryptSweepDetailRunning(page, {
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
    });

    await up.waitForListResponse(page, () => up.gotoReencryptSweepPage(page));
    await expect
      .poll(() => up.historyRowTaskIds(page), { timeout: 10000 })
      .toEqual(['rsp-01J9AB7K9M', 'rsp-01J8XQ7K9M']);

    await test.step('表头 9 列与接口列定义一致', async () => {
      expect(await up.getHistoryHeaders(page)).toEqual(up.HISTORY_COLUMN_HEADERS);
    });

    await test.step('running 行全列映射（耗时=-、开始时间有值、状态运行中）', async () => {
      expect(await up.historyRowCellTexts(page, 'rsp-01J9AB7K9M')).toEqual([
        'rsp-01J9AB7K9M',
        '运行中',
        '重加密',
        '全部',
        '否',
        'admin',
        '2026-10-10T09:30:00Z',
        '-',
        '详情',
      ]);
      expect(await up.rowStatusTagColor(page, 'rsp-01J9AB7K9M')).toBe('primary');
    });

    await test.step('succeeded 行全列映射（耗时=8300）', async () => {
      expect(await up.historyRowCellTexts(page, 'rsp-01J8XQ7K9M')).toEqual([
        'rsp-01J8XQ7K9M',
        '成功',
        '重加密',
        '全部',
        '否',
        'admin',
        '2026-10-05T10:00:00Z',
        '8300',
        '详情',
      ]);
      expect(await up.rowStatusTagColor(page, 'rsp-01J8XQ7K9M')).toBe('success');
    });

    await test.step('分页器 total = Data.pagination.total', async () => {
      expect(await up.pagerTotalNumber(page)).toBe(2);
    });
  });
});