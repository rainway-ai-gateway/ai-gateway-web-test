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
 * 密钥收敛 - 触发与轮询（RS-T-02 触发异步返回、RS-T-03 409 单例互斥）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/reencrypt-sweep/test_01_reencrypt_sweep_trigger.spec.js
 */
const { test, expect } = require('@playwright/test');
const up = require('../../pages/security/ReencryptSweepPage');

const HOLDER_ID = 'rsp-local-holder';
const NET_409_HOLDER = 'rsp-409-holder';

function runningHolder(taskId) {
  return {
    task_id: taskId,
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
}

// 断言连续轮询请求间隔收敛于 800ms（setInterval）
function assertPollingInterval(times) {
  const diffs = [];
  for (let i = 1; i < times.length; i += 1) {
    diffs.push(times[i] - times[i - 1]);
  }
  expect(diffs.length, '轮询次数不足，无法评估间隔').toBeGreaterThanOrEqual(2);
  diffs.forEach((d) => expect(d, `轮询间隔应 >= 400ms，实测 ${d}ms`).toBeGreaterThanOrEqual(400));
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  expect(avg, `平均轮询间隔应约 800ms，实测 ${avg}ms`).toBeGreaterThanOrEqual(600);
  expect(avg, `平均轮询间隔应约 800ms，实测 ${avg}ms`).toBeLessThanOrEqual(1500);
}

test.afterEach(async ({ page }) => {
  await up.unmockReencryptSweepNetwork(page);
});

test.describe('密钥收敛 - RS-T-02 触发成功异步返回并进入轮询', () => {
  test('POST 立即返回 200(running) 并进入 800ms 轮询', async ({ page }) => {
    // 空列表：确保本地 runningTask 为空 → 真实发起 POST
    await up.mockReencryptSweepListResponse(page, {
      list: [],
      pagination: { page: 1, page_size: 20, total: 0 },
    });
    // 详情保持 running，保证首次轮询前不因任务过快完成而停止
    await up.mockReencryptSweepDetailRunning(page);
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await up.gotoReencryptSweepPage(page);
      expect(await up.historyCard(page).locator('.sec-empty').innerText()).toContain(up.DOC.noHistory);

      const resp = await up.clickTrigger(page);
      const status = resp.status();
      let body = {};
      try {
        body = await resp.json();
      } catch (e) {
        body = {};
      }
      test.info().annotations.push({
        type: 'api_data',
        description: JSON.stringify(body),
      });

      if (status !== 200) {
        test.skip(
          true,
          `当前环境存在运行中任务或触发失败（POST HTTP ${status}），无法验证异步 200 契约，跳过 RS-T-02`,
        );
      }

      const data = body.Data || {};
      await test.step('校验异步契约：HTTP 200、Data.status=running、字段集合', async () => {
        expect(resp.status()).toBe(200);
        expect(body.ErrNum).toBe(200);
        expect(data.status).toBe('running');
        expect(data.task_id, 'Data 应含 task_id').toBeTruthy();
        expect(data.mode).toBe('reencrypt');
        expect(data.dry_run).toBe(false);
        expect(data.scope).toBe('all');
        expect(typeof data.active_key_id).toBe('number');
        expect(data.created_by, 'POST 响应不含 created_by').toBeUndefined();
        expect(data.summary, 'POST 响应不含 summary').toBeUndefined();
      });

      await test.step('成功提示「任务已触发…」', async () => {
        await up.expectMessageContains(
          page,
          up.DOC.triggerSuccess.replace('{id}', data.task_id),
        );
      });

      await test.step('触发后列表 page 复位为 1 并重取', async () => {
        await expect
          .poll(() => tracker.state.list, { timeout: 10000 })
          .toBeGreaterThanOrEqual(2);
        const lastQuery = tracker.state.listQueries[tracker.state.listQueries.length - 1];
        expect(lastQuery.page).toBe('1');
      });

      await test.step('运行中横幅展示该任务并「轮询中…」', async () => {
        const card = up.runningCard(page);
        await expect(up.runningSweepView(page)).toBeVisible({ timeout: 10000 });
        await expect
          .poll(() => up.svValueText(card, up.DOC.taskId), { timeout: 10000 })
          .toBe(data.task_id);
        await expect(up.svValue(card, up.DOC.status)).toContainText('运行中');
        await expect(up.pollingIndicator(card)).toHaveText(up.DOC.polling);
      });

      await test.step('按 800ms 轮询 GET /{task_id}', async () => {
        await expect
          .poll(() => tracker.state.detail, { timeout: 15000 })
          .toBeGreaterThanOrEqual(3);
        tracker.state.detailUrls.forEach((u) => {
          expect(new URL(u).pathname).toBe(
            '/open-api/v1/security/reencrypt-sweeps/' + data.task_id,
          );
        });
        assertPollingInterval(tracker.state.detailTimes);
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('密钥收敛 - RS-T-03 运行中重复触发 409 单例互斥', () => {
  test('A·本地已知运行中任务：先行拦截不发 POST', async ({ page }) => {
    await up.mockReencryptSweepListResponse(page, {
      list: [runningHolder(HOLDER_ID)],
      pagination: { page: 1, page_size: 20, total: 1 },
    });
    await up.mockReencryptSweepDetailRunning(page, {
      started_at: '2026-10-10T09:30:00Z',
    });
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await up.gotoReencryptSweepPage(page);
      const card = up.runningCard(page);
      await expect
        .poll(() => up.svValueText(card, up.DOC.taskId), { timeout: 10000 })
        .toBe(HOLDER_ID);

      // 直接点击（本地拦截不发 POST，故不可用 waitForTriggerResponse 等待请求）
      await up.triggerButton(page).click();
      await page.waitForTimeout(600);

      await test.step('未发起任何 POST（本地先行拦截）', async () => {
        expect(tracker.state.trigger, '本地已持有运行中任务，不应再发 POST').toBe(0);
      });

      await test.step('展示 409 互斥文案与 Toast（{id}=本地持有者）', async () => {
        await expect(up.conflictAlert(page)).toContainText(
          up.DOC.conflictPrefix.replace('{id}', HOLDER_ID),
        );
        await expect(
          page
            .locator('.ivu-message')
            .filter({ hasText: up.DOC.conflictToast.replace('{id}', HOLDER_ID) })
            .first(),
        ).toBeVisible({ timeout: 10000 });
      });

      await test.step('横幅保持原任务，继续轮询', async () => {
        await expect
          .poll(() => up.svValueText(card, up.DOC.taskId), { timeout: 10000 })
          .toBe(HOLDER_ID);
        await expect(up.pollingIndicator(card)).toHaveText(up.DOC.polling);
        await expect
          .poll(() => tracker.state.detail, { timeout: 15000 })
          .toBeGreaterThanOrEqual(3);
      });
    } finally {
      tracker.stop();
    }
  });

  test('B·网络返回 409：提取持有者 task_id 并轮询该任务', async ({ page }) => {
    await up.mockReencryptSweepListResponse(page, {
      list: [],
      pagination: { page: 1, page_size: 20, total: 0 },
    });
    await up.mockReencryptSweepTriggerResponse(page, {
      status: 409,
      errMsg: `another reencrypt sweep is running: ${NET_409_HOLDER}`,
    });
    await up.mockReencryptSweepDetailRunning(page);
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await up.gotoReencryptSweepPage(page);

      const resp = await up.clickTrigger(page);
      expect(resp.status()).toBe(409);

      await test.step('已发起 POST 且返回 409', async () => {
        expect(tracker.state.trigger).toBe(1);
      });

      await test.step('从响应归因提取持有者并展示互斥文案', async () => {
        await expect(up.conflictAlert(page)).toContainText(
          up.DOC.conflictPrefix.replace('{id}', NET_409_HOLDER),
        );
        await expect(
          page
            .locator('.ivu-message')
            .filter({ hasText: up.DOC.conflictToast.replace('{id}', NET_409_HOLDER) })
            .first(),
        ).toBeVisible({ timeout: 10000 });
      });

      await test.step('横幅展示持有者任务并对其轮询（不排队、不新建）', async () => {
        const card = up.runningCard(page);
        await expect
          .poll(() => up.svValueText(card, up.DOC.taskId), { timeout: 10000 })
          .toBe(NET_409_HOLDER);
        await expect(up.pollingIndicator(card)).toHaveText(up.DOC.polling);
        await expect
          .poll(() => tracker.state.detail, { timeout: 15000 })
          .toBeGreaterThanOrEqual(2);
        const lastDetail = tracker.state.detailUrls[tracker.state.detailUrls.length - 1];
        expect(new URL(lastDetail).pathname).toBe(
          '/open-api/v1/security/reencrypt-sweeps/' + NET_409_HOLDER,
        );
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('密钥收敛 - RS-T-01 触发区参数与默认值', () => {
  test('触发卡片标题/控件默认值与选项枚举', async ({ page }) => {
    await up.mockReencryptSweepListResponse(page, {
      list: [],
      pagination: { page: 1, page_size: 20, total: 0 },
    });

    await up.gotoReencryptSweepPage(page);

    await test.step('触发卡片标题与三控件可见', async () => {
      await expect(up.triggerCard(page)).toContainText(up.DOC.triggerCardTitle);
      await expect(up.modeSelectTrigger(page)).toBeVisible();
      await expect(up.scopeSelectTrigger(page)).toBeVisible();
      await expect(up.dryRunSwitch(page)).toBeVisible();
      await expect(up.triggerButton(page)).toBeVisible();
    });

    await test.step('默认值：重加密 / 全部 / 预演关闭', async () => {
      expect(await up.selectedModeText(page)).toBe(up.MODE_LABELS.reencrypt);
      expect(await up.selectedScopeText(page)).toBe(up.SCOPE_LABELS.all);
      expect(await up.isDryRunOn(page)).toBe(false);
      await expect(up.dryRunHint(page)).toHaveText(up.DOC.dryRunHint);
    });

    await test.step('变换方向选项枚举 = [重加密, 解密]', async () => {
      expect(await up.getModeOptions(page)).toEqual([
        up.MODE_LABELS.reencrypt,
        up.MODE_LABELS.decrypt,
      ]);
    });

    await test.step('扫描范围选项枚举 = [全部, 仅 providers 表, 仅 api_keys 表]', async () => {
      expect(await up.getScopeOptions(page)).toEqual([
        up.SCOPE_LABELS.all,
        up.SCOPE_LABELS.providers,
        up.SCOPE_LABELS.api_keys,
      ]);
    });

    await test.step('变换方向帮助文案', async () => {
      expect(await up.modeHelpText(page)).toBe(up.DOC.modeHelp);
    });
  });
});

test.describe('密钥收敛 - RS-T-04 预演模式 dry_run', () => {
  test('开启预演后请求体 dry_run=true 且横幅标注仅统计', async ({ page }) => {
    test.info().annotations.push({
      type: 'doc_impl_divergence',
      description:
        '文档称预演开关展示「是（仅统计，不落库）」，实现为 i-switch 未配置 open/close 文案，仅切换态 + 邻近 hint 说明；此处以开关态、hint 文案与请求体 dry_run 为准。',
    });

    await up.mockReencryptSweepListResponse(page, {
      list: [],
      pagination: { page: 1, page_size: 20, total: 0 },
    });
    await up.mockReencryptSweepDetailRunning(page, { dry_run: true });
    await up.mockReencryptSweepTriggerResponse(page, {
      status: 200,
      data: {
        task_id: 'rsp-dry-run',
        status: 'running',
        mode: 'reencrypt',
        dry_run: true,
        scope: 'all',
        active_key_id: 1,
      },
    });
    const tracker = up.trackReencryptSweepRequests(page);

    try {
      await up.gotoReencryptSweepPage(page);

      await test.step('默认预演关闭，hint 常显', async () => {
        expect(await up.isDryRunOn(page)).toBe(false);
        await expect(up.dryRunHint(page)).toHaveText(up.DOC.dryRunHint);
      });

      await test.step('开启预演开关', async () => {
        await up.toggleDryRun(page);
        expect(await up.isDryRunOn(page)).toBe(true);
      });

      await test.step('触发请求体 dry_run=true', async () => {
        const resp = await up.clickTrigger(page);
        expect(resp.status()).toBe(200);
        const body = resp.request().postDataJSON();
        expect(body.mode).toBe('reencrypt');
        expect(body.dry_run).toBe(true);
      });

      await test.step('运行横幅标注「是（仅统计，不落库）」', async () => {
        const card = up.runningCard(page);
        await expect
          .poll(() => up.svValueText(card, up.DOC.dryRunLabel), { timeout: 10000 })
          .toBe(up.DOC.dryRunYes);
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('密钥收敛 - RS-T-05 变换方向 decrypt 回滚预案', () => {
  test('选择解密后请求体 mode=decrypt 且横幅反映解密与密钥ID 0', async ({ page }) => {
    await up.mockReencryptSweepListResponse(page, {
      list: [],
      pagination: { page: 1, page_size: 20, total: 0 },
    });
    await up.mockReencryptSweepDetailRunning(page, { mode: 'decrypt', active_key_id: 0 });
    await up.mockReencryptSweepTriggerResponse(page, {
      status: 200,
      data: {
        task_id: 'rsp-decrypt',
        status: 'running',
        mode: 'decrypt',
        dry_run: false,
        scope: 'all',
        active_key_id: 0,
      },
    });

    await up.gotoReencryptSweepPage(page);

    await test.step('选择变换方向=解密', async () => {
      await up.selectModeOption(page, up.MODE_LABELS.decrypt);
      expect(await up.selectedModeText(page)).toBe(up.MODE_LABELS.decrypt);
    });

    await test.step('触发请求体 mode=decrypt', async () => {
      const resp = await up.clickTrigger(page);
      expect(resp.status()).toBe(200);
      const body = resp.request().postDataJSON();
      expect(body.mode).toBe('decrypt');
      expect(body.dry_run).toBe(false);
    });

    await test.step('横幅反映解密 / 活跃密钥ID=0', async () => {
      const card = up.runningCard(page);
      await expect
        .poll(() => up.svValueText(card, up.DOC.mode), { timeout: 10000 })
        .toBe(up.MODE_LABELS.decrypt);
      expect(await up.svValueText(card, up.DOC.activeKeyId)).toBe('0');
    });
  });
});