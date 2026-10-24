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

// 取「可取消」样本的两条约束（原白名单 ['validating','queued','in_progress','finalizing']
// 正是在表达它们，只是写法容易让人误以为是漏项）：
//   ① 必须是**非终态**——`cancelling` 属受理中中间态、仍是非终态
//      （见 `ai-gateway-api/model/ibatch/types.go` 的 `TerminalStatuses` 注释）；
//   ② 但**不能已是 `cancelling`**——对它再取消后端按冲突返回 **409**，BT-C-02 要的 200 拿不到；
//      而 BT-C-04/05/06 断言「取消失败后不出现本地假取消态（取消中）」，样本本身就是「取消中」时断言恒不成立。
//   ③ 必须**限定首页**：UI 固定 limit=20 只渲染首页，跨页取到的样本在页面上不存在，
//      `expectRowVisible` 会直接失败。曾把「首页无合格样本」归因于取数范围不足而试过**跨页取数**，
//      实测 6 条全红、已回退 —— 真因是**环境数据漂移**：首页样本被历次取消类用例消耗成 `cancelling`。
//      漂移时的表现是三条用例以「环境中无『非终态』批量任务」跳过（2026-10-17 全量回归 4 条跳过中的 3 条），
//      属**环境数据依赖、不是用例缺陷**：跑前执行 `npm run seed:batch:execute` 恢复设计状态即可。

// 列表列索引（与 BatchTaskPage.COLUMN_HEADERS 对齐，2026-10-20 UI 改版为 6 列）
const COL = { status: 1, settleStatus: 3 };

function pickListTask(page, predicate) {
  return batchApi
    .fetchBatchTasksViaApi(page, { limit: bp.PAGE_LIMIT })
    .then(({ list }) => (list && list.length ? list.find(predicate) || null : null));
}

function pickActiveTask(page) {
  // 必须限定在**首页**（UI 固定 limit=20，只显示首页）——跨页取到的样本在页面上不存在，
  // expectRowVisible 会直接失败。造数脚本的设计里首页本就有 3 个合格样本
  // （id 末两位 02/03/04 = in_progress / validating / finalizing，见 scripts/seed-batch-task-data.cjs 的 PLAN）；
  // 若它们被历次取消类用例消耗成 cancelling，需先 `npm run seed:batch:execute` 恢复设计状态。
  return pickListTask(
    page,
    (it) =>
      !batchApi.isTerminalStatus(it.status) && it.status !== 'cancelling',
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
      test.skip(
        true,
        '环境中无「非终态且非 cancelling」的样本任务（须首页可见），跳过 —— 跑前请执行 npm run seed:batch:execute 恢复造数样本',
      );
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
      test.skip(
        true,
        '环境中无「非终态且非 cancelling」的样本任务（须首页可见），跳过 —— 跑前请执行 npm run seed:batch:execute 恢复造数样本',
      );
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
      test.skip(
        true,
        '环境中无「非终态且非 cancelling」的样本任务（须首页可见），跳过 —— 跑前请执行 npm run seed:batch:execute 恢复造数样本',
      );
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
      test.skip(
        true,
        '环境中无「非终态且非 cancelling」的样本任务（须首页可见），跳过 —— 跑前请执行 npm run seed:batch:execute 恢复造数样本',
      );
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
      test.skip(
        true,
        '环境中无「非终态且非 cancelling」的样本任务（须首页可见），跳过 —— 跑前请执行 npm run seed:batch:execute 恢复造数样本',
      );
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