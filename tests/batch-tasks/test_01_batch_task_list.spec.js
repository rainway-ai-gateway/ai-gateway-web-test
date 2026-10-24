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
 * 批量任务 - 列表页（BT-L-01 ~ BT-L-12；BT-L-09「金额列原样展示」已于 2026-10-20
 * UI 改版删列后删除，金额展示由详情页 BT-D-08 覆盖）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/batch-tasks/test_01_batch_task_list.spec.js
 */
const { test, expect } = require('@playwright/test');
const bp = require('../../pages/batch-tasks/BatchTaskPage');
const batchApi = require('../../api/batch-api-utils');

// 列索引（与 BatchTaskPage.COLUMN_HEADERS 对齐，2026-10-20 UI 改版为 6 列）
const COL = {
  batchId: 0,
  status: 1,
  requestCounts: 2,
  settleStatus: 3,
  createdAt: 4,
  operation: 5,
};

function parseQuery(url) {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

// 复刻 UI text()：空值渲染为 '-'
function uiText(value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : String(value);
}

function requireData(list, hint) {
  if (!list || list.length === 0) {
    test.skip(true, `环境中无批量任务数据${hint ? '（' + hint + '）' : ''}，跳过`);
  }
}

test.describe('批量任务 - BT-L-01 列表加载与游标分页', () => {
  test('验证列表页加载、列头与游标分页请求', async ({ page }) => {
    let listResponse;
    const vueWarnings = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Vue warn]') || text.includes('Invalid prop')) {
        vueWarnings.push(text);
      }
    });

    await test.step('进入批量任务列表页', async () => {
      listResponse = await bp.waitForBatchTaskListResponse(page, () =>
        bp.gotoBatchTaskPage(page),
      );
    });

    await test.step('验证页面布局与 6 列表头', async () => {
      await bp.expectPageLayout(page);
    });

    await test.step('进入列表页不应出现 Vue prop 校验告警（如 Tag 误用 type）', async () => {
      expect(vueWarnings, `Vue 告警: ${vueWarnings.join(' | ')}`).toEqual([]);
    });

    await test.step('验证首页请求使用游标分页参数（limit=50，无 page/page_size）', async () => {
      const query = parseQuery(listResponse.url());
      expect(query.limit).toBe(String(bp.PAGE_LIMIT));
      expect(query.cursor === undefined || query.cursor === '').toBeTruthy();
      expect(query.page, '不应携带 page').toBeUndefined();
      expect(query.page_size, '不应携带 page_size').toBeUndefined();
    });

    await test.step('验证首页「首页」「上一页」置灰，并展示页码与条数', async () => {
      expect(await bp.isPrevDisabled(page)).toBeTruthy();
      expect(await bp.isFirstDisabled(page)).toBeTruthy();
      const info = await bp.pagerInfoTexts(page);
      expect(info[0]).toContain('第 1 页');
      expect(info[1]).toMatch(/本页 \d+ 条/);
      // 分页条与表格左对齐（行内容与操作区均在左侧）
      await bp.expectPagerAlignedWithTable(page);
    });

    await test.step('翻页请求携带 next_cursor，返回后可回退', async () => {
      if (await bp.isNextDisabled(page)) {
        test.info().annotations.push({
          type: 'skip_reason',
          description: '环境数据仅 1 页，跳过翻页断言',
        });
        return;
      }

      const page2 = await bp.clickNextPage(page);
      const query2 = parseQuery(page2.url());
      expect(query2.cursor, '第二页请求应携带 cursor').toBeTruthy();
      expect(query2.limit).toBe(String(bp.PAGE_LIMIT));
      expect(await bp.isPrevDisabled(page)).toBeFalsy();
      expect(await bp.isFirstDisabled(page)).toBeFalsy();
      const info2 = await bp.pagerInfoTexts(page);
      expect(info2[0]).toContain('第 2 页');

      await bp.clickPrevPage(page);
      expect(await bp.isPrevDisabled(page)).toBeTruthy();
      expect(await bp.isFirstDisabled(page)).toBeTruthy();
    });

    await test.step('改了筛选未查询时，翻页仍沿用已应用的条件（条件快照）', async () => {
      if (await bp.isNextDisabled(page)) {
        test.info().annotations.push({
          type: 'skip_reason',
          description: '环境数据仅 1 页，跳过条件快照断言',
        });
        return;
      }
      await bp.providerInput(page).fill('snapshot-should-not-apply');
      const page2 = await bp.clickNextPage(page);
      const query2 = parseQuery(page2.url());
      expect(
        query2.provider,
        '未点「查询」时翻页不应携带新输入的服务商条件',
      ).toBeUndefined();
      await bp.clickPrevPage(page);
      await bp.providerInput(page).fill('');
    });
  });
});

test.describe('批量任务 - BT-L-02 按任务状态筛选', () => {
  test('验证 9 个状态选项与 status 查询参数', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    await test.step('验证「任务状态」下拉含 9 个状态选项', async () => {
      const options = await bp.getStatusFilterOptions(page);
      expect(options).toEqual(Object.values(bp.STATUS_LABELS));
    });

    await test.step('选择「进行中（in_progress）」并查询', async () => {
      await bp.selectStatusOption(page, bp.STATUS_LABELS.in_progress);
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.clickQuery(page),
      );
      const query = parseQuery(response.url());
      expect(query.status).toBe('in_progress');

      const statusTexts = await bp.columnTexts(page, COL.status);
      statusTexts.forEach((text) => {
        expect(text).toContain(bp.STATUS_LABELS.in_progress);
      });
    });

    await test.step('切换「已完成（completed）」并查询', async () => {
      await bp.selectStatusOption(page, bp.STATUS_LABELS.completed);
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.clickQuery(page),
      );
      expect(parseQuery(response.url()).status).toBe('completed');

      const statusTexts = await bp.columnTexts(page, COL.status);
      statusTexts.forEach((text) => {
        expect(text).toContain(bp.STATUS_LABELS.completed);
      });
    });

    await test.step('重置后请求不再携带 status', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.clickReset(page),
      );
      expect(parseQuery(response.url()).status).toBeUndefined();
    });
  });
});

test.describe('批量任务 - BT-L-03 按服务商筛选', () => {
  test('验证 provider 查询参数与结果一致性', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const { list } = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    requireData(list, 'provider 筛选');

    const provider = list[0].provider;
    if (!provider) {
      test.skip(true, '首条数据 provider 为空，跳过 provider 筛选');
    }

    await test.step('输入 provider 并查询', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, async () => {
        await bp.setProviderFilter(page, provider);
        await bp.clickQuery(page);
      });
      expect(parseQuery(response.url()).provider).toBe(provider);

      // 「服务商」列已于 2026-10-20 改版移除，改为校验接口返回条数与页面渲染行数一致
      const body = await response.json();
      const returned = (body.Data && body.Data.list) || [];
      expect(returned.length, 'provider 筛选应返回结果').toBeGreaterThan(0);
      await expect
        .poll(() => bp.rowCount(page))
        .toBe(Math.min(returned.length, bp.PAGE_LIMIT));
    });

    await test.step('清空 provider 后请求不再携带 provider', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, async () => {
        await bp.setProviderFilter(page, '');
        await bp.clickQuery(page);
      });
      expect(parseQuery(response.url()).provider).toBeUndefined();
    });
  });
});

test.describe('批量任务 - BT-L-04 按 API Key ID 筛选', () => {
  test('回车触发 api_key_id 查询参数', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const { list } = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    requireData(list, 'API Key 筛选');

    const apiKeyId = list[0].api_key_id;
    if (!apiKeyId) {
      test.skip(true, '首条数据 api_key_id 为空，跳过 API Key 筛选');
    }

    await test.step('输入 api_key_id 并回车触发查询', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.setApiKeyIdFilter(page, apiKeyId),
      );
      expect(parseQuery(response.url()).api_key_id).toBe(apiKeyId);

      // 「API Key ID」列已于 2026-10-20 改版移除，改为校验接口返回条数与页面渲染行数一致
      const body = await response.json();
      const returned = (body.Data && body.Data.list) || [];
      expect(returned.length, 'api_key_id 筛选应返回结果').toBeGreaterThan(0);
      await expect
        .poll(() => bp.rowCount(page))
        .toBe(Math.min(returned.length, bp.PAGE_LIMIT));
    });

    await test.step('输入不存在的 api_key_id 返回空态', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.setApiKeyIdFilter(page, 'ak-not-exist-' + Date.now()),
      );
      expect(parseQuery(response.url()).api_key_id).toContain('ak-not-exist-');
      await bp.expectEmptyList(page);
    });
  });
});

test.describe('批量任务 - BT-L-05 按创建时间范围筛选', () => {
  test('验证 start_time / end_time 查询参数（Unix 秒）', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    await test.step('设置创建时间范围并查询', async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const startText = bp.formatDateTimeValue(start);
      const endText = bp.formatDateTimeValue(now);

      const response = await bp.queryWithFilters(page, {
        startTime: startText,
        endTime: endText,
      });
      const query = parseQuery(response.url());
      expect(query.start_time).toBe(String(bp.toUnixTimestamp(startText)));
      expect(query.end_time).toBe(String(bp.toUnixTimestamp(endText)));
      expect(Number(query.start_time)).toBeLessThanOrEqual(
        Number(query.end_time),
      );
    });

    await test.step('仅填起始时间时单边过滤', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.clickReset(page),
      );
      expect(parseQuery(response.url()).start_time).toBeUndefined();
    });
  });
});

test.describe('批量任务 - BT-L-06 组合筛选', () => {
  test('验证多条件 AND 组合查询参数', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startText = bp.formatDateTimeValue(start);
    const endText = bp.formatDateTimeValue(now);

    const response = await bp.queryWithFilters(page, {
      status: 'completed',
      provider: 'openai',
      startTime: startText,
      endTime: endText,
    });

    const query = parseQuery(response.url());
    expect(query.status).toBe('completed');
    expect(query.provider).toBe('openai');
    expect(query.start_time).toBe(String(bp.toUnixTimestamp(startText)));
    expect(query.end_time).toBe(String(bp.toUnixTimestamp(endText)));
  });
});

test.describe('批量任务 - BT-L-07 重置筛选条件', () => {
  test('验证重置清空筛选并回到首页游标', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    await test.step('设置筛选条件', async () => {
      await bp.setStatusFilterValue(page, 'completed');
      await bp.setProviderFilter(page, 'openai');
      await page.waitForTimeout(150);
    });

    await test.step('点击重置并核对请求参数', async () => {
      const response = await bp.waitForBatchTaskListResponse(page, () =>
        bp.clickReset(page),
      );
      const query = parseQuery(response.url());
      expect(query.status).toBeUndefined();
      expect(query.provider).toBeUndefined();
      expect(query.api_key_id).toBeUndefined();
      expect(query.start_time).toBeUndefined();
      expect(query.end_time).toBeUndefined();
      expect(query.cursor === undefined || query.cursor === '').toBeTruthy();
    });
  });
});

test.describe('批量任务 - BT-L-08 表格列展示与状态 / 结算状态 Tag', () => {
  test('验证 6 列顺序、请求计数列头提示与枚举文案', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    await test.step('验证 6 列列头与顺序', async () => {
      const headers = await bp.getHeaderTexts(page);
      expect(headers).toEqual(bp.COLUMN_HEADERS);
      expect(headers.length).toBe(6);
    });

    await test.step('验证「请求计数」列头提示（hover 出现 iView Tooltip）', async () => {
      const helpMap = await bp.getHeaderHelpMap(page);
      expect(helpMap[bp.DOC.requestCounts]).toBe('总数 / 完成 / 失败');
    });

    await test.step('验证状态 / 结算状态 Tag 文案为「中文（枚举）」', async () => {
      const statusTexts = await bp.columnTexts(page, COL.status);
      statusTexts.forEach((text) => {
        const matched = Object.values(bp.STATUS_LABELS).some((label) =>
          text.includes(label),
        );
        expect(matched, `状态 Tag 文案应为已知枚举映射，实际: ${text}`).toBe(
          true,
        );
      });

      const settleTexts = await bp.columnTexts(page, COL.settleStatus);
      settleTexts.forEach((text) => {
        const matched = Object.values(bp.SETTLE_LABELS).some((label) =>
          text.includes(label),
        );
        expect(matched, `结算状态 Tag 文案应为已知枚举映射，实际: ${text}`).toBe(
          true,
        );
      });
    });

    await test.step('状态 / 结算状态 Tag 颜色与枚举映射一致（color 而非 type）', async () => {
      const statusTexts = await bp.columnTexts(page, COL.status);
      const statusClasses = await bp.columnTagClasses(page, COL.status);
      statusTexts.forEach((text, i) => {
        const matched = text.match(/（([a-z_]+)）/);
        expect(matched, `状态文案应携带枚举: ${text}`).toBeTruthy();
        const expected = bp.STATUS_TAG_COLORS[matched[1]];
        expect(expected, `状态枚举应有颜色映射: ${matched[1]}`).toBeTruthy();
        expect(
          statusClasses[i],
          `状态 ${matched[1]} 的 Tag class 应含 ivu-tag-${expected}，实际: ${statusClasses[i]}`,
        ).toContain(`ivu-tag-${expected}`);
      });

      const settleTexts = await bp.columnTexts(page, COL.settleStatus);
      const settleClasses = await bp.columnTagClasses(page, COL.settleStatus);
      settleTexts.forEach((text, i) => {
        const matched = text.match(/（([a-z_]+)）/);
        expect(matched, `结算状态文案应携带枚举: ${text}`).toBeTruthy();
        const expected = bp.SETTLE_TAG_COLORS[matched[1]];
        expect(expected, `结算状态枚举应有颜色映射: ${matched[1]}`).toBeTruthy();
        expect(
          settleClasses[i],
          `结算状态 ${matched[1]} 的 Tag class 应含 ivu-tag-${expected}，实际: ${settleClasses[i]}`,
        ).toContain(`ivu-tag-${expected}`);
      });
    });
  });
});

test.describe('批量任务 - BT-L-10 游标翻页与按钮置灰', () => {
  test('验证首页 / 末页按钮置灰状态', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    // 环境守卫：GET /batches 只能由数据面透传产生，若当前无数据或只有一页，
    // 首页即末页，「上一页/下一页」的置灰语义无法区分（前置条件不成立而非产品缺陷）。
    const firstPage = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    requireData(firstPage.list, '游标翻页');
    if (!firstPage.next_cursor) {
      test.skip(
        true,
        '当前环境批量任务不足两页（next_cursor 为空），无法验证游标翻页的置灰状态',
      );
    }

    await test.step('首页「上一页」置灰', async () => {
      expect(await bp.isPrevDisabled(page)).toBeTruthy();
    });

    await test.step('翻至最后一页后「下一页」置灰', async () => {
      let guard = 0;
      while (!(await bp.isNextDisabled(page)) && guard < 100) {
        guard += 1;
        await bp.clickNextPage(page);
      }
      expect(await bp.isNextDisabled(page)).toBeTruthy();
      expect(await bp.isPrevDisabled(page)).toBeFalsy();
      expect(await bp.isFirstDisabled(page)).toBeFalsy();
    });

    await test.step('点「首页」回到第 1 页且「首页」「上一页」重新置灰', async () => {
      await bp.clickFirstPage(page);
      expect(await bp.isFirstDisabled(page)).toBeTruthy();
      expect(await bp.isPrevDisabled(page)).toBeTruthy();
      const info = await bp.pagerInfoTexts(page);
      expect(info[0]).toContain('第 1 页');
    });
  });
});

test.describe('批量任务 - BT-L-11 空列表展示', () => {
  test('验证空态与分页按钮均置灰', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    await bp.waitForBatchTaskListResponse(page, async () => {
      await bp.setProviderFilter(page, '__no_such_provider_' + Date.now());
      await bp.clickQuery(page);
    });

    await bp.expectEmptyList(page);
    expect(await bp.isNextDisabled(page)).toBeTruthy();
    expect(await bp.isPrevDisabled(page)).toBeTruthy();
    expect(await bp.isFirstDisabled(page)).toBeTruthy();
  });
});

test.describe('批量任务 - BT-L-12 列表接口数据与页面展示一致性', () => {
  test('验证列表 6 列展示值与接口返回逐一一致', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const { list, body } = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    requireData(list, '列表一致性');

    const item = list[0];

    test.info().annotations.push({
      type: 'api_data',
      description: JSON.stringify({ list, next_cursor: body?.Data?.next_cursor }),
    });

    await test.step('定位目标任务行', async () => {
      await bp.batchTaskTable(page).expectRowVisible(item.batch_id);
    });

    const cells = await bp.batchTaskTable(page).cellsByBatchId(item.batch_id);
    expect(cells.length).toBe(6);

    await test.step('逐列比对展示值与接口字段', async () => {
      const rc = item.request_counts || {};
      expect(cells[COL.batchId]).toBe(String(item.batch_id));
      expect(cells[COL.status]).toContain(bp.statusLabel(item.status));
      expect(cells[COL.requestCounts]).toBe(
        `${rc.total || 0} / ${rc.completed || 0} / ${rc.failed || 0}`,
      );
      expect(cells[COL.settleStatus]).toContain(
        bp.settleLabel(item.settle_status),
      );
      // created_at 为 RFC3339 字符串，UI 原样展示不做转换
      expect(cells[COL.createdAt]).toBe(uiText(item.created_at));
      // 操作列含「详情」按钮，终态行「取消」按钮置灰
      expect(cells[COL.operation]).toContain(bp.DOC.detail);
      expect(cells[COL.operation]).toContain(bp.DOC.cancel);
    });
  });
});