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
 * 批量任务 - 详情抽屉（BT-D-01 ~ BT-D-08）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/batch-tasks/test_02_batch_task_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const bp = require('../../pages/batch-tasks/BatchTaskPage');
const batchApi = require('../../api/batch-api-utils');

// 详情接口：GET /open-api/v1/batches/{batch_id}
// '**/open-api/v1/batches/*' 的 '*' 不跨 '/'，不会命中列表(/batches?x)与取消(/batches/{id}/cancel)
const DETAIL_GLOB = '**/open-api/v1/batches/*';

// 5 面板字段（顺序即 BatchView.vue 渲染顺序）
const BASIC_FIELDS = [
  bp.DOC.batchId,
  bp.DOC.provider,
  bp.DOC.apiKeyId,
  bp.DOC.productName,
  bp.DOC.entityId,
  bp.DOC.endpoint,
];
const STATUS_FIELDS = [
  bp.DOC.status,
  bp.DOC.requestTotal,
  bp.DOC.requestCompleted,
  bp.DOC.requestFailed,
  bp.DOC.estLines,
];
const USAGE_FIELDS = [
  bp.DOC.usageInputTokens,
  bp.DOC.usageOutputTokens,
  bp.DOC.usageSource,
  bp.DOC.reserveUnits,
  bp.DOC.settleUnits,
  bp.DOC.settleStatus,
  bp.DOC.overReserved,
  bp.DOC.syncSource,
];
const FILE_TIME_FIELDS = [
  bp.DOC.inputFileId,
  bp.DOC.outputFileId,
  bp.DOC.createdAt,
  bp.DOC.updatedAt,
  bp.DOC.terminalAt,
];

const BATCH_FILE_HEADERS = [
  bp.DOC.fileId,
  bp.DOC.provider,
  bp.DOC.purpose,
  bp.DOC.filename,
  bp.DOC.size,
  bp.DOC.createdAt,
];

// 复刻 BatchView.text：空值渲染为 '-'
function uiText(value) {
  return value === null || value === undefined || value === ''
    ? '-'
    : String(value);
}

// 复刻 BatchView.overReservedText
function overReservedText(value) {
  return value === null || value === undefined ? '-' : String(value);
}

/**
 * 在第一页批量任务中挑出满足条件的详情数据（用于定位含特定字段的任务）。
 * 未命中返回 null。
 */
async function pickTaskWithDetail(page, predicate) {
  const { list } = await batchApi.fetchBatchTasksViaApi(page, {
    limit: bp.PAGE_LIMIT,
  });
  if (!list || list.length === 0) {
    return null;
  }
  for (const item of list) {
    const detail = await batchApi.fetchBatchTaskDetailViaApi(page, item.batch_id);
    if (
      detail.status === 200 &&
      detail.Data &&
      (!predicate || predicate(detail.Data))
    ) {
      return detail.Data;
    }
  }
  return null;
}

async function expectDrawerPanels(page) {
  await expect.poll(() => bp.detailPanelCount(page)).toBe(5);
}

test.afterEach(async ({ page }) => {
  await page.unroute(DETAIL_GLOB).catch(() => {});
});

test.describe('批量任务 - BT-D-01 打开详情抽屉', () => {
  test('验证详情请求、抽屉标题与 70% 宽度', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const { list } = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    if (!list || list.length === 0) {
      test.skip(true, '环境中无批量任务数据，跳过');
    }
    const batchId = list[0].batch_id;

    let response;
    await test.step('点击「详情」并捕获请求', async () => {
      response = await bp.openDetailByBatchId(page, batchId);
    });

    await test.step('验证 GET /batches/{batch_id} 路径参数', async () => {
      expect(response.request().method()).toBe('GET');
      expect(response.status()).toBe(200);
      expect(response.url()).toContain(`/open-api/v1/batches/${batchId}`);
    });

    await test.step('验证抽屉打开、标题与 70% 宽度', async () => {
      await bp.expectDetailDrawerOpen(page);
      const style = await bp.detailDrawerWidthStyle(page);
      expect(style).toContain('70%');
    });
  });
});

test.describe('批量任务 - BT-D-02 详情字段完整性与无帮助图标', () => {
  test('验证 5 面板字段齐全且抽屉内无帮助图标', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const detail = await pickTaskWithDetail(
      page,
      (d) => d.product_name && Array.isArray(d.batch_files) && d.batch_files.length > 0,
    );
    if (!detail) {
      test.skip(true, '环境中无字段齐全的批量任务，跳过');
    }

    await bp.openDetailByBatchId(page, detail.batch_id);
    await bp.expectDetailDrawerOpen(page);
    await expectDrawerPanels(page);

    await test.step('验证 5 个面板标题与顺序', async () => {
      const headers = (await bp.detailPanelHeaders(page)).map((t) => t.trim());
      expect(headers).toEqual([
        bp.DOC.basicInfo,
        bp.DOC.statusAndCounts,
        bp.DOC.usageAndBilling,
        bp.DOC.filesAndTime,
        bp.DOC.batchFiles,
      ]);
    });

    await test.step('验证 5 面板字段齐全、无 NaN / undefined', async () => {
      const allFields = [
        ...BASIC_FIELDS,
        ...STATUS_FIELDS,
        ...USAGE_FIELDS,
        ...FILE_TIME_FIELDS,
      ];
      for (const title of allFields) {
        await expect(bp.detailRow(page, title)).toBeVisible();
        const value = await bp.detailFieldText(page, title);
        expect(value, `字段「${title}」不应为空`).toBeTruthy();
      }
      const drawerText = await bp.detailDrawer(page).innerText();
      expect(drawerText).not.toContain('undefined');
      expect(drawerText).not.toContain('NaN');
    });

    await test.step('验证详情抽屉内无任何帮助图标', async () => {
      await bp.expectDetailNoHelpIcons(page);
    });
  });
});

test.describe('批量任务 - BT-D-03 批量文件表格展示', () => {
  test('验证表头、行数与大小列格式化展示', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const detail = await pickTaskWithDetail(
      page,
      (d) => Array.isArray(d.batch_files) && d.batch_files.length > 0,
    );
    if (!detail) {
      test.skip(true, '环境中无含 batch_files 的批量任务，跳过');
    }

    await bp.openDetailByBatchId(page, detail.batch_id);
    await bp.expectDetailDrawerOpen(page);
    await expectDrawerPanels(page);

    await test.step('验证批量文件表头', async () => {
      const headers = await bp.batchFilesHeaderTexts(page);
      expect(headers).toEqual(BATCH_FILE_HEADERS);
    });

    await test.step('验证表格行数与 batch_files 元素个数一致', async () => {
      await expect
        .poll(() => bp.batchFileRowCount(page))
        .toBe(detail.batch_files.length);
    });

    await test.step('逐行核对文件数据与大小列格式化', async () => {
      const rows = await bp.batchFileRowTexts(page);
      detail.batch_files.forEach((file, index) => {
        const cells = rows[index];
        expect(cells[0]).toBe(uiText(file.file_id));
        expect(cells[1]).toBe(uiText(file.provider));
        expect(cells[2]).toBe(uiText(file.purpose));
        expect(cells[3]).toBe(uiText(file.filename));
        expect(cells[4]).toBe(
          `${file.bytes || 0}（${bp.formatBytes(file.bytes)}）`,
        );
        // created_at 为 RFC3339 字符串，UI 原样展示不做转换
        expect(cells[5]).toBe(uiText(file.created_at));
      });
    });
  });
});

test.describe('批量任务 - BT-D-04 无批量文件显示占位', () => {
  test('验证 batch_files 为空时展示占位「-」', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    // 守卫口径必须与产品一致：产品对「无文件」的语义是「batch_files 不是数组」——
    // BatchView.vue:323-326 的 computed 把非数组（接口对无文件任务返回 null，而非 []）归一为 []，
    // 再按 length 决定渲染文件表格还是占位「-」。旧守卫 `Array.isArray(d.batch_files) && d.batch_files.length === 0`
    // 要求接口返回空数组，而实测无文件任务返回 null → 守卫恒不成立、用例恒被跳过（改前一直是 skip，从未真正执行）。
    const detail = await pickTaskWithDetail(page, (d) => {
      const files = Array.isArray(d.batch_files) ? d.batch_files : [];
      return files.length === 0;
    });
    if (!detail) {
      test.skip(true, '环境中无 batch_files 为空的批量任务，跳过');
    }

    await bp.openDetailByBatchId(page, detail.batch_id);
    await bp.expectDetailDrawerOpen(page);
    await expectDrawerPanels(page);

    await test.step('验证不渲染文件表格，展示空占位', async () => {
      await expect(bp.batchFilesTable(page)).toHaveCount(0);
      await expect(await bp.batchFilesEmpty(page)).toBeVisible();
      await expect(await bp.batchFilesEmpty(page)).toHaveText('-');
    });
  });
});

test.describe('批量任务 - BT-D-05 回源任务结算字段未就绪不报错', () => {
  test('验证 sync_source=redis 任务展示兜底、无 NaN / undefined', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const detail = await pickTaskWithDetail(page, (d) => d.sync_source === 'redis');
    if (!detail) {
      test.skip(true, '环境中无 sync_source=redis 的批量任务，跳过');
    }

    await bp.openDetailByBatchId(page, detail.batch_id);
    await bp.expectDetailDrawerOpen(page);
    await expectDrawerPanels(page);

    await test.step('验证同步来源字段', async () => {
      expect(await bp.detailFieldText(page, bp.DOC.syncSource)).toBe(
        uiText(detail.sync_source),
      );
    });

    await test.step('验证结算类字段兜底展示、无 NaN / undefined', async () => {
      expect(await bp.detailFieldText(page, bp.DOC.settleUnits)).toBe(
        uiText(detail.settle_units),
      );
      expect(await bp.detailFieldText(page, bp.DOC.settleStatus)).toBe(
        bp.settleLabel(detail.settle_status),
      );
      expect(await bp.detailFieldText(page, bp.DOC.terminalAt)).toBe(
        uiText(detail.terminal_at),
      );
      const drawerText = await bp.detailDrawer(page).innerText();
      expect(drawerText).not.toContain('undefined');
      expect(drawerText).not.toContain('NaN');
    });
  });
});

test.describe('批量任务 - BT-D-06 详情 404 提示', () => {
  test('验证 404 展示可读提示且抽屉不展示半成品数据', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const { list } = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    if (!list || list.length === 0) {
      test.skip(true, '环境中无批量任务数据，跳过');
    }
    const batchId = list[0].batch_id;

    await page.route(DETAIL_GLOB, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 404,
          ErrMsg: 'error: batch task not found or cleaned',
          Data: null,
        }),
      }),
    );

    await test.step('点击「详情」触发 404', async () => {
      await bp.openDetailByBatchId(page, batchId);
    });

    await test.step('验证错误提示「批量任务不存在或已被清理」', async () => {
      await bp.expectMessageContains(page, bp.DOC.detail404);
    });

    await test.step('验证抽屉内无半成品面板数据', async () => {
      await bp.expectDetailDrawerOpen(page);
      await expect.poll(() => bp.detailPanelCount(page)).toBe(0);
    });
  });
});

test.describe('批量任务 - BT-D-07 关闭详情抽屉', () => {
  test('验证 X 与遮罩均可关闭且列表无变化', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const { list } = await batchApi.fetchBatchTasksViaApi(page, {
      limit: bp.PAGE_LIMIT,
    });
    if (!list || list.length === 0) {
      test.skip(true, '环境中无批量任务数据，跳过');
    }
    const batchId = list[0].batch_id;
    const beforeCount = await bp.rowCount(page);

    await test.step('点击 X 关闭抽屉', async () => {
      await bp.openDetailByBatchId(page, batchId);
      await bp.expectDetailDrawerOpen(page);
      await bp.closeDetailDrawer(page);
    });

    await test.step('再次打开后点击遮罩关闭', async () => {
      await bp.openDetailByBatchId(page, batchId);
      await bp.expectDetailDrawerOpen(page);
      await bp.closeDetailDrawerByMask(page);
    });

    await test.step('关闭后列表数据无变化', async () => {
      expect(await bp.rowCount(page)).toBe(beforeCount);
      await bp.batchTaskTable(page).expectRowVisible(batchId);
    });
  });
});

test.describe('批量任务 - BT-D-08 详情接口数据与页面展示一致性', () => {
  test('验证 5 面板与批量文件逐字段与接口返回一致', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const detail = await pickTaskWithDetail(
      page,
      (d) =>
        d.product_name &&
        Array.isArray(d.batch_files) &&
        d.batch_files.length > 0,
    );
    if (!detail) {
      test.skip(true, '环境中无字段齐全的批量任务，跳过');
    }

    test.info().annotations.push({
      type: 'api_data',
      description: JSON.stringify(detail),
    });

    await bp.openDetailByBatchId(page, detail.batch_id);
    await bp.expectDetailDrawerOpen(page);
    await expectDrawerPanels(page);

    await test.step('基本信息逐字段比对', async () => {
      expect(await bp.detailFieldText(page, bp.DOC.batchId)).toBe(
        uiText(detail.batch_id),
      );
      expect(await bp.detailFieldText(page, bp.DOC.provider)).toBe(
        uiText(detail.provider),
      );
      expect(await bp.detailFieldText(page, bp.DOC.apiKeyId)).toBe(
        uiText(detail.api_key_id),
      );
      expect(await bp.detailFieldText(page, bp.DOC.entityId)).toBe(
        uiText(detail.entity_id),
      );
      expect(await bp.detailFieldText(page, bp.DOC.productName)).toBe(
        uiText(detail.product_name),
      );
      expect(await bp.detailFieldText(page, bp.DOC.endpoint)).toBe(
        uiText(detail.endpoint),
      );
    });

    await test.step('状态与计数逐字段比对（状态为枚举映射 Tag）', async () => {
      const rc = detail.request_counts || {};
      expect(await bp.detailFieldText(page, bp.DOC.status)).toBe(
        bp.statusLabel(detail.status),
      );
      expect(await bp.detailFieldText(page, bp.DOC.requestTotal)).toBe(
        uiText(rc.total),
      );
      expect(await bp.detailFieldText(page, bp.DOC.requestCompleted)).toBe(
        uiText(rc.completed),
      );
      expect(await bp.detailFieldText(page, bp.DOC.requestFailed)).toBe(
        uiText(rc.failed),
      );
      expect(await bp.detailFieldText(page, bp.DOC.estLines)).toBe(
        uiText(detail.est_lines),
      );
    });

    await test.step('用量与记账逐字段比对（金额原样、结算状态枚举、布尔原样）', async () => {
      expect(await bp.detailFieldText(page, bp.DOC.usageInputTokens)).toBe(
        uiText(detail.usage_input_tokens),
      );
      expect(await bp.detailFieldText(page, bp.DOC.usageOutputTokens)).toBe(
        uiText(detail.usage_output_tokens),
      );
      expect(await bp.detailFieldText(page, bp.DOC.usageSource)).toBe(
        uiText(detail.usage_source),
      );
      // 1e-8 定点整数 RMB，原样展示不做 ÷1e8 换算
      expect(await bp.detailFieldText(page, bp.DOC.reserveUnits)).toBe(
        uiText(detail.reserve_units),
      );
      expect(await bp.detailFieldText(page, bp.DOC.settleUnits)).toBe(
        uiText(detail.settle_units),
      );
      expect(await bp.detailFieldText(page, bp.DOC.settleStatus)).toBe(
        bp.settleLabel(detail.settle_status),
      );
      // 布尔原样展示：false -> 'false'
      expect(await bp.detailFieldText(page, bp.DOC.overReserved)).toBe(
        overReservedText(detail.over_reserved),
      );
      expect(await bp.detailFieldText(page, bp.DOC.syncSource)).toBe(
        uiText(detail.sync_source),
      );
    });

    await test.step('文件与时间逐字段比对（时间原样直出 RFC3339）', async () => {
      expect(await bp.detailFieldText(page, bp.DOC.inputFileId)).toBe(
        uiText(detail.input_file_id),
      );
      expect(await bp.detailFieldText(page, bp.DOC.outputFileId)).toBe(
        uiText(detail.output_file_id),
      );
      expect(await bp.detailFieldText(page, bp.DOC.createdAt)).toBe(
        uiText(detail.created_at),
      );
      expect(await bp.detailFieldText(page, bp.DOC.updatedAt)).toBe(
        uiText(detail.updated_at),
      );
      expect(await bp.detailFieldText(page, bp.DOC.terminalAt)).toBe(
        uiText(detail.terminal_at),
      );
    });

    await test.step('批量文件逐行逐项比对', async () => {
      await expect
        .poll(() => bp.batchFileRowCount(page))
        .toBe(detail.batch_files.length);
      const rows = await bp.batchFileRowTexts(page);
      detail.batch_files.forEach((file, index) => {
        const cells = rows[index];
        expect(cells[0]).toBe(uiText(file.file_id));
        expect(cells[1]).toBe(uiText(file.provider));
        expect(cells[2]).toBe(uiText(file.purpose));
        expect(cells[3]).toBe(uiText(file.filename));
        expect(cells[4]).toBe(
          `${file.bytes || 0}（${bp.formatBytes(file.bytes)}）`,
        );
        // created_at 为 RFC3339 字符串，UI 原样展示不做转换
        expect(cells[5]).toBe(uiText(file.created_at));
      });
    });
  });
});