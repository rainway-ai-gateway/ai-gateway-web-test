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
 * 密钥收敛 - 触发失败分支（RS-T-06）
 *
 * 审计背景（2026-11-01，reencrypt-sweep 深度审计）：
 * `Security/index.vue` `onTrigger()` 有三个失败出口——
 * ① 本地已有 running 任务（RS-T-03 已覆盖）；② 接口非 200；③ 200 但 `Data.task_id` 缺失。
 * ②/③ 都会提示「触发收敛任务失败」且**不得进入运行中状态**，此前无任何用例。
 */
const { test, expect } = require('@playwright/test');
const up = require('../../pages/security/ReencryptSweepPage');

test.describe('密钥收敛 - RS-T-06 触发失败分支', () => {
  test.afterEach(async ({ page }) => {
    await up.unmockReencryptSweepNetwork(page);
  });

  test('POST 500：提示「触发收敛任务失败」，不进入运行中状态', async ({ page }) => {
    await up.gotoReencryptSweepPage(page);
    await up.mockReencryptSweepTriggerResponse(page, {
      status: 500,
      errMsg: 'mock trigger 500',
    });

    await up.clickTrigger(page);
    await up.expectMessageContains(page, up.DOC.triggerFailed);
    await up.expectNoRunningTask(page);
  });

  test('POST 200 但缺 task_id：同样提示失败，不进入运行中状态', async ({ page }) => {
    await up.gotoReencryptSweepPage(page);
    await up.mockReencryptSweepTriggerResponse(page, {
      status: 200,
      data: {},
    });

    await up.clickTrigger(page);
    await up.expectMessageContains(page, up.DOC.triggerFailed);
    await up.expectNoRunningTask(page);
  });
});
