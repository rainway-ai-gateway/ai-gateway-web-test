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
 * AI 上下文压缩 - 提交幂等与整集合覆盖（AX-CC-01~03）
 *
 * 审计背景（2026-11-01，ai-context 深度审计，与 ai-cache 同源缺口）：
 * - 规则 Tab「提交并生效」与设置 Tab「保存」都是整体 PUT，按钮只有 `:loading`；
 *   全模块无「连点只发一次」用例（ai-cache 已在 AC-CC-01 补齐同类用例）。
 * - 集合级 PUT 无版本号/乐观锁：编辑期间他人发布的集合会被本次提交整体覆盖
 *   （last-write-wins），与 cluster BC-C-01 / intent-config IC-CC-01 同语义，此前无覆盖。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const cleanup = utils.createAiContextTestCleanup();
const P = utils.DOC_AI_CONTEXT_PAGE;
const F = utils.DOC_AI_CONTEXT_RULE_FORM;
const S = utils.DOC_AI_CONTEXT_SETTINGS;

async function prepareRulesEditMode(page, rules) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  await utils.setAiContextRulesViaApi(page, rules);
  await utils.reloadAiContextPage(page);
  await utils.enterEditMode(page);
}

/** 延迟匹配请求的响应（模拟慢网络，制造「按钮 loading 期间」窗口） */
async function delayPut(page, urlPart, delayMs = 1500) {
  await page.route(`**/${urlPart}`, async (route) => {
    if (route.request().method() === 'PUT') {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

test.describe('AI上下文压缩 - AX-CC-01 连点提交只发一次 PUT（规则）', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockAiContextNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('延迟 PUT 期间重复点击「提交并生效」只产生一次请求', async ({ page }) => {
    const base = utils.buildTestRule({
      cond: 'req_path_prefix_in("/ax_cc01_base", true)',
    });
    await prepareRulesEditMode(page, [base]);

    await test.step('前置：本地新增一条规则（产生 dirty）', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, 'req_path_prefix_in("/ax_cc01_new", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await delayPut(page, 'ai-context-rules');
    const tracker = utils.trackAiContextRuleRequests(page);
    try {
      await test.step('点击提交后立刻再点一次', async () => {
        await utils.clickSubmitAndEffect(page);
        await page.waitForTimeout(300);
        // 短超时：loading 态按钮不可点，避免默认 30s 自动等待把成功提示窗口耗掉
        await page
          .getByRole('button', { name: P.submitAndEffect, exact: true })
          .click({ timeout: 800 })
          .catch(() => {});
      });

      await test.step('仅一次 PUT，并回到视图模式', async () => {
        await utils.expectViewMode(page);
        expect(tracker.state.put, '重复点击不应产生第二次 PUT').toBe(1);
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('AI上下文压缩 - AX-CC-02 他人先发布被整集合覆盖', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('编辑期间他人发布另一套规则，本次提交整集合覆盖（last-write-wins）', async ({
    page,
  }) => {
    // ai-context 规则没有 name 字段，集合内身份即 cond
    await prepareRulesEditMode(page, [
      utils.buildTestRule({ cond: 'req_path_in("/ax_cc02_mine", false)' }),
    ]);

    await test.step('本地新增一条草稿规则', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, 'req_path_prefix_in("/ax_cc02_local", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(
        page,
        'req_path_prefix_in("/ax_cc02_local", true)',
      );
    });

    await test.step('「他人」通过接口把集合整体替换为另一条规则', async () => {
      const ok = await utils.setAiContextRulesViaApi(page, [
        utils.buildTestRule({ cond: 'req_path_in("/ax_cc02_theirs", false)' }),
      ]);
      expect(ok, '模拟他人发布应成功').toBe(true);
      const api = await utils.getAiContextRulesViaApi(page);
      expect(api.map((r) => r.cond)).toEqual([
        'req_path_in("/ax_cc02_theirs", false)',
      ]);
    });

    await test.step('本地提交：PUT 体为本地快照，不含他人规则', async () => {
      const { payload } = await utils.submitRulesAndCapture(page);
      const conds = (payload.rules || []).map((r) => r.cond);
      expect(conds).toContain('req_path_prefix_in("/ax_cc02_local", true)');
      expect(conds).toContain('req_path_in("/ax_cc02_mine", false)');
      expect(conds, 'PUT 体不应含他人刚发布的规则').not.toContain(
        'req_path_in("/ax_cc02_theirs", false)',
      );
    });

    await test.step('回读：集合为本地版本，他人规则被覆盖', async () => {
      const api = await utils.getAiContextRulesViaApi(page);
      const conds = api.map((r) => r.cond);
      expect(conds).toContain('req_path_prefix_in("/ax_cc02_local", true)');
      expect(conds).not.toContain('req_path_in("/ax_cc02_theirs", false)');
      await utils.expectViewMode(page);
    });
  });
});

test.describe('AI上下文压缩 - AX-CC-03 连点保存只发一次 PUT（设置）', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockAiContextNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('延迟 PUT 期间重复点击设置「保存」只产生一次请求', async ({ page }) => {
    await utils.ensureAppSession(page);
    await cleanup.saveOriginalState(page);
    await utils.reloadAiContextPage(page);
    await utils.switchToSettingsTab(page);
    await utils.enterSettingsEditMode(page);

    await test.step('修改触发阈值（产生 dirty）', async () => {
      await utils.fillSettingsNumber(page, S.triggerRatioLabel, 0.8);
    });

    await delayPut(page, 'ai-context-settings');
    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('点击保存后立刻再点一次', async () => {
        await utils.clickSettingsSave(page);
        await page.waitForTimeout(300);
        await page
          .getByRole('button', { name: S.saveButton || '保存', exact: true })
          .click({ timeout: 800 })
          .catch(() => {});
      });

      await test.step('仅一次 PUT，并回到查看态', async () => {
        await utils.expectSettingsViewMode(page);
        expect(tracker.state.put, '重复点击不应产生第二次 PUT').toBe(1);
      });
    } finally {
      tracker.stop();
    }
  });
});
