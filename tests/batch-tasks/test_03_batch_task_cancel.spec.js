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
 * 批量任务 - 取消（BT-C-01 ~ BT-C-06）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/batch-tasks/test_03_batch_task_cancel.spec.js
 */
const { test, expect } = require('@playwright/test');
const bp = require('../../pages/batch-tasks/BatchTaskPage');
const batchApi = require('../../api/batch-api-utils');

// 取消接口：POST /open-api/v1/batches/{batch_id}/cancel
const CANCEL_GLOB = '**/open-api/v1/batches/*/cancel';

// 与 UI 一致：非终态可取消
const ACTIVE_STATUSES = ['validating', 'queued', 'in_progress', 'finalizing'];

// 列表列索引（与 BatchTaskPage.COLUMN_HEADERS 对齐）
const COL = { status: 4, settleStatus: 9 };

function pickListTask(page, predicate) {
  return batchApi
    .fetchBatchTasksViaApi(page, { limit: bp.PAGE_LIMIT })
    .then(({ list }) => (list && list.length ? list.find(predicate) || null : null));
}

function pickActiveTask(page) {
  return pickListTask(
    page,
    (it) => ACTIVE_STATUSES.indexOf(it.status) !== -1,
  );
}

function pickTerminalTask(page) {
  return pickListTask(page, (it) => batchApi.isTerminalStatus(it.status));
}

// 统计发往取消接口的请求（用于「不应发起请求」断言）
function trackCancelRequests(page) {
  const urls = [];
  const handler = (request) => {
    if (request.method() === 'POST' && bp.CANCEL_URL_RE.test(request.url())) {
      urls.push(request.url());
    }
  };
  page.on('request', handler);
  return {
    urls,
    stop: () => page.off('request', handler),
  };
}

async function mockCancelStatus(page, status, errMsg) {
  await page.route(CANCEL_GLOB, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ ErrNum: status, ErrMsg: errMsg, Data: null }),
    }),
  );
}

async function rowStatusText(page, batchId) {
  const cells = await bp.batchTaskTable(page).cellsByBatchId(batchId);
  return cells[COL.status] || '';
}

test.afterEach(async ({ page }) => {
  await page.unroute(CANCEL_GLOB).catch(() => {});
});

test.describe('批量任务 - BT-C-01 取消二次确认', () => {
  test('验证确认弹窗文案，弹窗「取消」不发起请求', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const task = await pickActiveTask(page);
    if (!task) {
      test.skip(true, '环境中无「非终态」批量任务，跳过');
    }

    await bp.batchTaskTable(page).expectRowVisible(task.batch_id);

    const tracker = trackCancelRequests(page);
    try {
      await test.step('点击「取消」弹出确认框', async () => {
        await bp.clickCancelByBatchId(page, task.batch_id);
        await bp.expectCancelConfirmVisible(page, task.batch_id);
      });

      await test.step('点击弹窗「取消」关闭，不发起请求', async () => {
        await bp.dismissCancel(page);
        await expect(bp.confirmModal(page)).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(300);
        expect(tracker.urls, '弹窗取消不应发起取消请求').toEqual([]);
      });

      await test.step('任务状态不变', async () => {
        expect(await rowStatusText(page, task.batch_id)).toContain(
          bp.statusLabel(task.status),
        );
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('批量任务 - BT-C-02 取消成功状态流转', () => {
  test('验证 200 提示与列表行状态流转为 cancelling / released', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const task = await pickActiveTask(page);
    if (!task) {
      test.skip(true, '环境中无「非终态」批量任务，跳过');
    }

    test.info().annotations.push({
      type: 'api_data',
      description: JSON.stringify(task),
    });

    await bp.batchTaskTable(page).expectRowVisible(task.batch_id);
    await bp.clickCancelByBatchId(page, task.batch_id);
    await bp.expectCancelConfirmVisible(page, task.batch_id);

    const response = await bp.waitForBatchTaskCancelResponse(page, () =>
      bp.confirmCancel(page),
    );

    if (response.status() === 502) {
      test.skip(true, 'provider 不可达（502），降级环境跳过取消成功流转');
    }
    expect(response.status(), '取消成功应返回 200').toBe(200);
    expect(response.url()).toContain(
      `/open-api/v1/batches/${task.batch_id}/cancel`,
    );

    await test.step('验证成功提示', async () => {
      await bp.expectMessageContains(page, bp.DOC.cancelSuccess);
    });

    await test.step('验证列表行状态更新为取消中 / 已释放', async () => {
      await expect
        .poll(() => rowStatusText(page, task.batch_id))
        .toContain(bp.STATUS_LABELS.cancelling);
      await expect
        .poll(async () => {
          const cells = await bp.batchTaskTable(page).cellsByBatchId(
            task.batch_id,
          );
          return cells[COL.settleStatus] || '';
        })
        .toContain(bp.SETTLE_LABELS.released);
    });

    await test.step('验证服务端状态同步为 cancelling 语义', async () => {
      const detail = await batchApi.fetchBatchTaskDetailViaApi(
        page,
        task.batch_id,
      );
      if (detail.status === 200 && detail.Data) {
        expect(['cancelling', 'cancelled']).toContain(detail.Data.status);
        expect(detail.Data.settle_status).toBe('released');
      }
    });
  });
});

test.describe('批量任务 - BT-C-03 终态任务取消按钮置灰', () => {
  test('验证终态按钮 disabled + title，点击不发起请求；非终态可用', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const terminal = await pickTerminalTask(page);
    const active = await pickActiveTask(page);
    if (!terminal && !active) {
      test.skip(true, '环境中无批量任务数据，跳过');
    }

    const tracker = trackCancelRequests(page);
    try {
      if (terminal) {
        await test.step('终态任务「取消」按钮置灰并带 title', async () => {
          await bp.batchTaskTable(page).expectRowVisible(terminal.batch_id);
          const btn = bp.cancelButton(page, terminal.batch_id);
          await expect(btn).toBeDisabled();
          await expect(btn).toHaveAttribute('title', bp.DOC.cancelDisabledTip);
        });

        await test.step('点击置灰按钮无响应、不发起请求', async () => {
          await bp
            .cancelButton(page, terminal.batch_id)
            .click({ force: true, timeout: 2000 })
            .catch(() => {});
          await page.waitForTimeout(300);
          expect(tracker.urls, '终态任务不应发起取消请求').toEqual([]);
          expect(await bp.confirmModal(page).count()).toBe(0);
        });
      } else {
        test.info().annotations.push({
          type: 'skip_reason',
          description: '环境无终态任务，跳过终态置灰断言',
        });
      }

      if (active) {
        await test.step('非终态任务「取消」按钮保持可用', async () => {
          await bp.batchTaskTable(page).expectRowVisible(active.batch_id);
          await expect(bp.cancelButton(page, active.batch_id)).toBeEnabled();
        });
      }
    } finally {
      tracker.stop();
    }
  });
});

test.describe('批量任务 - BT-C-04 取消 409 提示', () => {
  test('验证 409 展示错误提示且不出现本地假取消态', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const task = await pickActiveTask(page);
    if (!task) {
      test.skip(true, '环境中无「非终态」批量任务，跳过');
    }

    await bp.batchTaskTable(page).expectRowVisible(task.batch_id);
    await mockCancelStatus(page, 409, 'error: conflict / already terminal');

    await bp.clickCancelByBatchId(page, task.batch_id);
    await bp.expectCancelConfirmVisible(page, task.batch_id);
    const response = await bp.waitForBatchTaskCancelResponse(page, () =>
      bp.confirmCancel(page),
    );
    expect(response.status()).toBe(409);

    await test.step('验证 409 错误提示', async () => {
      await bp.expectMessageContains(page, bp.DOC.cancel409);
    });

    await test.step('列表行不出现 cancelling 假状态', async () => {
      expect(await rowStatusText(page, task.batch_id)).not.toContain(
        bp.STATUS_LABELS.cancelling,
      );
    });
  });
});

test.describe('批量任务 - BT-C-05 取消 502 提示', () => {
  test('验证 502 展示可重试错误提示', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const task = await pickActiveTask(page);
    if (!task) {
      test.skip(true, '环境中无「非终态」批量任务，跳过');
    }

    await bp.batchTaskTable(page).expectRowVisible(task.batch_id);
    await mockCancelStatus(page, 502, 'error: provider unreachable');

    await bp.clickCancelByBatchId(page, task.batch_id);
    await bp.expectCancelConfirmVisible(page, task.batch_id);
    const response = await bp.waitForBatchTaskCancelResponse(page, () =>
      bp.confirmCancel(page),
    );
    expect(response.status()).toBe(502);

    await test.step('验证 502 错误提示', async () => {
      await bp.expectMessageContains(page, bp.DOC.cancel502);
    });

    await test.step('列表行不出现 cancelling 假状态', async () => {
      expect(await rowStatusText(page, task.batch_id)).not.toContain(
        bp.STATUS_LABELS.cancelling,
      );
    });
  });
});

test.describe('批量任务 - BT-C-06 取消 404 提示', () => {
  test('验证 404 展示「批量任务不存在或已被清理」', async ({ page }) => {
    await bp.gotoBatchTaskPage(page);

    const task = await pickActiveTask(page);
    if (!task) {
      test.skip(true, '环境中无「非终态」批量任务，跳过');
    }

    await bp.batchTaskTable(page).expectRowVisible(task.batch_id);
    await mockCancelStatus(page, 404, 'error: not found or cleaned');

    await bp.clickCancelByBatchId(page, task.batch_id);
    await bp.expectCancelConfirmVisible(page, task.batch_id);
    const response = await bp.waitForBatchTaskCancelResponse(page, () =>
      bp.confirmCancel(page),
    );
    expect(response.status()).toBe(404);

    await test.step('验证 404 错误提示', async () => {
      await bp.expectMessageContains(page, bp.DOC.cancel404);
    });

    await test.step('列表行不出现 cancelling 假状态', async () => {
      expect(await rowStatusText(page, task.batch_id)).not.toContain(
        bp.STATUS_LABELS.cancelling,
      );
    });
  });
});