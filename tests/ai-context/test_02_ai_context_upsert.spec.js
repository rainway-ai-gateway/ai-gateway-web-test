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
 * AI 上下文压缩 - 新增与编辑
 * 用例：AX-C-01 ~ AX-C-12
 *
 * 说明：新增/编辑均为本地草稿操作，用 trackAiContextRuleRequests 断言不发 PUT；
 * 涉及「提交并生效」的用例（C-10）真实提交后由 cleanup 还原。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const cleanup = utils.createAiContextTestCleanup();
const P = utils.DOC_AI_CONTEXT_PAGE;
const R = utils.DOC_AI_CONTEXT_RULES;
const F = utils.DOC_AI_CONTEXT_RULE_FORM;
const COL = R.columnIndex;

/** 构造一条具备指定字段的受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

test.describe('AI 上下文压缩 - 新增与编辑', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AX-C-01 新增抽屉标题/宽度/默认值/遮罩不可关，且无网络写请求', async ({
    page,
  }) => {
    const rA = mockRule();
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式并打开新增抽屉', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.openAddRuleDrawer(page);
      });

      await test.step('抽屉宽度 :width="60"（渲染为 60%）', async () => {
        await utils.expectFormDrawerWidth(page);
      });

      await test.step('表单 4 项默认值：cond 空 / off / 两数值为空', async () => {
        await utils.expectRuleFormDefaultValues(page);
      });

      await test.step('点击遮罩不关闭抽屉（mask-closable=false）', async () => {
        await utils.clickDrawerMask(page);
        await page.waitForTimeout(500);
        await utils.expectRuleFormDrawerStillOpen(page);
      });

      await test.step('打开抽屉前后集合数据不变，未发送任何 PUT', async () => {
        await utils.expectRuleRowVisible(page, rA.cond);
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-C-02 新增规则成功：置顶显示、提示「添加成功！」、不发 PUT', async ({
    page,
  }) => {
    const rA = mockRule();
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('填写 cond=default_t() / balanced / 64000 / 8192 并本地保存', async () => {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleCond(page, 'default_t()');
        await utils.selectRuleFormMode(page, R.modeBalanced);
        await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 64000);
        await utils.fillRuleFormNumber(page, F.reserveTokensFieldLabel, 8192);
        await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
      });

      await test.step('新增规则 unshift 到集合头部，列表首行即时显示', async () => {
        await utils.expectRuleRowVisible(page, 'default_t()');
        await utils.expectRuleRowOrder(page, ['default_t()', rA.cond]);
        await utils.expectRuleModeTag(
          page,
          'default_t()',
          R.modeBalanced,
          'primary',
        );
        await utils.expectRuleCellText(page, 'default_t()', COL.maxTokens, '64000 tokens');
        await utils.expectRuleCellText(page, 'default_t()', COL.reserveTokens, '8192 tokens');
      });

      await test.step('仅更新本地草稿，未发送 PUT /ai-context-rules', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-C-03 压缩档位下拉四枚举文案与选择', async ({ page }) => {
    await test.step('前置：进入编辑模式并打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [mockRule()] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('下拉含 4 项，文案依次为四档全称，默认选中「不处理（off）」', async () => {
      await utils.expectRuleFormModeOptions(page, [
        R.modeOff,
        R.modeConservative,
        R.modeBalanced,
        R.modeAggressive,
      ]);
      await utils.expectRuleFormMode(page, R.modeOff);
    });

    await test.step('依次选择四档，表单值同步更新', async () => {
      const modes = [
        R.modeOff,
        R.modeConservative,
        R.modeBalanced,
        R.modeAggressive,
      ];
      for (const mode of modes) {
        await utils.selectRuleFormMode(page, mode);
        await utils.expectRuleFormMode(page, mode);
      }
    });
  });

  test('AX-C-04 编辑抽屉标题与四字段回显（0 回显 0，null 回显空）', async ({
    page,
  }) => {
    const rFull = mockRule({
      mode: 'balanced',
      max_context_tokens: 64000,
      reserve_tokens: 8192,
    });
    const rNull = mockRule({
      mode: 'off',
      max_context_tokens: null,
      reserve_tokens: null,
    });

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rFull, rNull] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('编辑抽屉标题「编辑压缩规则」，宽度 60%，四字段回显', async () => {
      await utils.openEditRuleDrawer(page, rFull.cond);
      await utils.expectFormDrawerWidth(page);
      await utils.expectRuleCondValue(page, rFull.cond);
      await utils.expectRuleFormMode(page, R.modeBalanced);
      await utils.expectRuleFormNumber(page, F.maxTokensFieldLabel, 64000);
      await utils.expectRuleFormNumber(page, F.reserveTokensFieldLabel, 8192);
      await utils.closeRuleFormDrawer(page);
    });

    await test.step('数值为 null 时回显为空', async () => {
      await utils.openEditRuleDrawer(page, rNull.cond);
      await utils.expectRuleFormMode(page, R.modeOff);
      await utils.expectRuleFormNumber(page, F.maxTokensFieldLabel, '');
      await utils.expectRuleFormNumber(page, F.reserveTokensFieldLabel, '');
      await utils.closeRuleFormDrawer(page);
    });
  });

  test('AX-C-05 编辑规则保存：原位替换不置顶，提示「保存成功！」、不发 PUT', async ({
    page,
  }) => {
    const rA = mockRule({ mode: 'off' });
    const rB = mockRule({ mode: 'off' });
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式并打开 rA 编辑抽屉', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.openEditRuleDrawer(page, rA.cond);
      });

      await test.step('修改档位与数值后本地保存', async () => {
        await utils.selectRuleFormMode(page, R.modeAggressive);
        await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 32000);
        await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
      });

      await test.step('原位替换：顺序不变，rA 行内容更新', async () => {
        await utils.expectRuleRowOrder(page, [rA.cond, rB.cond]);
        await utils.expectRuleModeTag(page, rA.cond, R.modeAggressive, 'primary');
        await utils.expectRuleCellText(page, rA.cond, COL.maxTokens, '32000 tokens');
        await utils.expectRuleModeTag(page, rB.cond, R.modeOff, 'default');
      });

      await test.step('未发送 PUT /ai-context-rules', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-C-06 新增行置顶，已有规则相对顺序保持不变', async ({ page }) => {
    const rA = mockRule();
    const rB = mockRule();

    await test.step('前置：进入编辑模式（集合 2 条）', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增一条规则并本地保存', async () => {
      const newCond = utils.generateTestRuleName('ax_c06_');
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, newCond);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('新增规则置顶，已有规则相对顺序不变', async () => {
      const conds = await utils.getRuleCondsInOrder(page);
      expect(conds.length).toBe(3);
      expect(conds[1]).toBe(rA.cond);
      expect(conds[2]).toBe(rB.cond);
    });
  });

  test('AX-C-07 表单重置：新增重置为默认值，编辑重置回原始值', async ({
    page,
  }) => {
    const rA = mockRule({ mode: 'balanced', max_context_tokens: 64000 });

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增抽屉：填写改动后重置回默认值，错误态清除', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, -1);
      await utils.expectRuleFormError(page, F.maxTokensFieldLabel);
      await utils.clickRuleFormReset(page);
      await utils.expectRuleFormDefaultValues(page);
      await utils.expectRuleFormFieldValid(page, F.maxTokensFieldLabel);
      await utils.closeRuleFormDrawer(page);
    });

    await test.step('编辑抽屉：改动后重置回该行原始值', async () => {
      await utils.openEditRuleDrawer(page, rA.cond);
      await utils.selectRuleFormMode(page, R.modeAggressive);
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 100);
      await utils.clickRuleFormReset(page);
      await utils.expectRuleFormMode(page, R.modeBalanced);
      await utils.expectRuleFormNumber(page, F.maxTokensFieldLabel, 64000);
      await utils.closeRuleFormDrawer(page);
    });
  });

  test('AX-C-08 新增时生效条件查重：拦截、抽屉保持打开、不发 PUT', async ({
    page,
  }) => {
    const dupCond = 'req_path_in("/test/ax_c08_dup", false)';
    const rA = mockRule({ cond: dupCond });
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：集合内已存在该 cond 的规则，进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('新增同 cond 规则，本地保存提示「生效条件已存在，集合内必须唯一」', async () => {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleCond(page, dupCond);
        await utils.submitRuleFormExpectMessage(page, F.condDuplicateMsg);
      });

      await test.step('规则不加入集合，抽屉保持打开且表单数据保留', async () => {
        await utils.expectRuleFormDrawerStillOpen(page);
        await utils.expectRuleCondValue(page, dupCond);
        expect(await utils.getRuleRowCount(page)).toBe(1);
        await utils.expectNoRuleMutationRequest(tracker);
      });

      await test.step('关闭抽屉后集合仍仅 1 条', async () => {
        await utils.closeRuleFormDrawer(page);
        expect(await utils.getRuleRowCount(page)).toBe(1);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-C-09 编辑时查重排除自身：cond 不变可保存，改为他人 cond 被拦截', async ({
    page,
  }) => {
    const condA = 'req_path_in("/test/ax_c09_a", false)';
    const condB = 'req_path_in("/test/ax_c09_b", false)';
    const rA = mockRule({ cond: condA, mode: 'off' });
    const rB = mockRule({ cond: condB, mode: 'off' });

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('仅改档位、cond 保持不变 → 保存成功（排除自身）', async () => {
      await utils.openEditRuleDrawer(page, condA);
      await utils.selectRuleFormMode(page, R.modeConservative);
      await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleModeTag(page, condA, R.modeConservative, 'primary');
      await utils.expectRuleRowOrder(page, [condA, condB]);
    });

    await test.step('cond 改为 rB 的 cond → 查重拦截，抽屉保持打开', async () => {
      await utils.openEditRuleDrawer(page, condA);
      await utils.fillRuleCond(page, condB);
      await utils.submitRuleFormExpectMessage(page, F.condDuplicateMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleCondValue(page, condB);
      await utils.closeRuleFormDrawer(page);
      await utils.expectRuleRowOrder(page, [condA, condB]);
    });
  });

  test('AX-C-10 零值/空值不写入提交体（PUT 体不含预算上限与预留输出键）', async ({
    page,
  }) => {
    const newCond = utils.generateTestRuleName('ax_c10_');

    await test.step('前置：备份原始集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiContextPage(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增预算上限 0、预留输出留空的规则并本地保存', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, newCond);
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 0);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleCellText(
        page,
        newCond,
        COL.maxTokens,
        utils.formatTokensText(0),
      );
    });

    let payload;
    await test.step('提交并生效，请求体中该规则不含 max_context_tokens/reserve_tokens', async () => {
      const [res] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiContextMessage(page, P.submitSuccessMsg, 15000),
      ]);
      payload = res.payload;
      expect(payload).toBeTruthy();
      await utils.expectRulePayloadOmitsZeroFields(payload, newCond);
      const target = payload.rules.find((r) => r.cond === newCond);
      expect(target.mode).toBe('off');
    });
  });

  test('AX-C-11 关闭抽屉不保存：遮罩不可关，关闭后集合不变', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：进入编辑模式并打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('改动字段后点击遮罩，抽屉不关闭', async () => {
      await utils.fillRuleCond(page, 'req_path_in("/test/ax_c11_draft", false)');
      await utils.clickDrawerMask(page);
      await page.waitForTimeout(500);
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('点击右上角关闭按钮，抽屉关闭且集合不变', async () => {
      await utils.closeRuleFormDrawer(page);
      expect(await utils.getRuleRowCount(page)).toBe(1);
      await utils.expectRuleRowVisible(page, rA.cond);
      await utils.expectRuleRowHidden(page, 'req_path_in("/test/ax_c11_draft", false)');
    });
  });

  test('AX-C-12 新增/编辑抽屉宽度均为 60%', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增抽屉宽度 60%', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.expectFormDrawerWidth(page);
      await utils.closeRuleFormDrawer(page);
    });

    await test.step('编辑抽屉宽度 60%', async () => {
      await utils.openEditRuleDrawer(page, rA.cond);
      await utils.expectFormDrawerWidth(page);
      await utils.closeRuleFormDrawer(page);
    });
  });
});
