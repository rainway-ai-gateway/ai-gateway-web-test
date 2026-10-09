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
 * AI 上下文压缩 - 查看与删除
 * 用例：AX-D-01 ~ AX-D-06、AX-DEL-01 ~ AX-DEL-05
 *
 * 说明：查看类用例（D-01~D-05）经 mockRulesGetResponse 注入受控集合；
 * 一致性核对（D-06）与清空/回填（DEL-03/04）真实提交后由 cleanup 还原。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const cleanup = utils.createAiContextTestCleanup();
const P = utils.DOC_AI_CONTEXT_PAGE;
const R = utils.DOC_AI_CONTEXT_RULES;
const V = utils.DOC_AI_CONTEXT_RULE_VIEW;
const COL = R.columnIndex;

/** 构造一条具备指定字段的受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

test.describe('AI 上下文压缩 - 查看与删除', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AX-D-01 查看抽屉纯文案展示：标题/4 行 label/取值/宽度/遮罩可关', async ({
    page,
  }) => {
    const rA = mockRule({
      mode: 'balanced',
      max_context_tokens: 64000,
      reserve_tokens: 8192,
    });

    await test.step('前置：注入规则并保持视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('打开查看抽屉：标题「查看压缩规则」，宽度 60%', async () => {
      await utils.openViewRuleDrawer(page, rA.cond);
      await utils.expectViewDrawerWidth(page);
    });

    await test.step('4 行 info-row label 依次为生效条件/压缩档位/预算上限/预留输出', async () => {
      await utils.expectViewDrawerFieldLabels(page);
    });

    await test.step('取值与列表一致，生效条件等宽字体展示', async () => {
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], rA.cond);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], R.modeBalanced);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        utils.formatTokensText(64000),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[3],
        utils.formatTokensText(8192),
      );
      await expect(
        utils.viewDrawerRow(page, V.fieldLabels[0]).locator('.expression-value'),
      ).toBeVisible();
    });

    await test.step('点击遮罩可关闭抽屉（mask-closable=true）', async () => {
      await utils.clickDrawerMask(page);
      await expect(utils.viewDrawerScope(page)).toHaveCount(0, {
        timeout: 10000,
      });
    });
  });

  test('AX-D-02 查看抽屉无输入控件与提交按钮，不产生写请求', async ({
    page,
  }) => {
    const rA = mockRule();
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：打开查看抽屉', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.openViewRuleDrawer(page, rA.cond);
      });

      await test.step('无 input/textarea/select 控件，无保存/重置等按钮', async () => {
        await utils.expectViewDrawerNoInputs(page);
      });

      await test.step('查看过程未发送 PUT 写请求', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-D-03 查看抽屉 4 项 label 均无必填红星', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：打开查看抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rA.cond);
    });

    await test.step('无 ivu-form-item-required，label 不含 *', async () => {
      await utils.expectViewDrawerNoRequiredMark(page);
    });
  });

  test('AX-D-04 查看抽屉关闭后再开其他规则，无旧数据残留', async ({
    page,
  }) => {
    const condA = 'req_path_in("/test/ax_d04_a", false)';
    const condB = 'req_path_in("/test/ax_d04_b", false)';
    const rA = mockRule({ cond: condA, mode: 'off' });
    const rB = mockRule({ cond: condB, mode: 'aggressive' });

    await test.step('前置：注入两条规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('查看 A 后关闭（on-close 置 currentRule=null）', async () => {
      await utils.openViewRuleDrawer(page, condA);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], condA);
      await utils.closeViewDrawer(page);
    });

    await test.step('再查看 B，展示 B 数据且无 A 残留', async () => {
      await utils.openViewRuleDrawer(page, condB);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], condB);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], R.modeAggressive);
      await utils.closeViewDrawer(page);
    });
  });

  test('AX-D-05 查看抽屉零值与空值展示（模型默认/- /未知档位回退）', async ({
    page,
  }) => {
    const rZero = mockRule({
      mode: 'off',
      max_context_tokens: 0,
      reserve_tokens: null,
    });
    const rUnknown = mockRule({ mode: 'mystery', max_context_tokens: 64000 });

    await test.step('前置：注入零值与未知档位规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rZero, rUnknown] });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('0/null → 「模型默认（0）」，off → 「不处理（off）」', async () => {
      await utils.openViewRuleDrawer(page, rZero.cond);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        utils.formatTokensText(0),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[3],
        utils.formatTokensText(null),
      );
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], R.modeOff);
      await utils.closeViewDrawer(page);
    });

    await test.step('未知档位回退原值，非零 token 展示「64000 tokens」', async () => {
      await utils.openViewRuleDrawer(page, rUnknown.cond);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], 'mystery');
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        utils.formatTokensText(64000),
      );
      await utils.closeViewDrawer(page);
    });
  });

  test('AX-D-06 列表/查看抽屉与 GET 响应全字段一致，响应无时间戳与 id', async ({
    page,
  }) => {
    const conds = [
      utils.generateTestRuleName('ax_d06_1_'),
      utils.generateTestRuleName('ax_d06_2_'),
      utils.generateTestRuleName('ax_d06_3_'),
    ];
    const rules = [
      utils.buildTestRule({
        cond: conds[0],
        mode: 'off',
        max_context_tokens: 0,
        reserve_tokens: 0,
      }),
      utils.buildTestRule({
        cond: conds[1],
        mode: 'balanced',
        max_context_tokens: 64000,
        reserve_tokens: 8192,
      }),
      utils.buildTestRule({ cond: conds[2], mode: 'aggressive' }),
    ];

    let apiRules;
    await test.step('前置：备份并经 API 写入受控集合并重新加载页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      expect(await utils.setAiContextRulesViaApi(page, rules)).toBe(true);
      await utils.reloadAiContextPage(page);
      apiRules = await utils.getAiContextRulesViaApi(page);
      expect(apiRules.length).toBe(3);
    });

    await test.step('响应规则不含 created_at/updated_at/id', async () => {
      for (const rule of apiRules) {
        expect(rule.created_at).toBeUndefined();
        expect(rule.updated_at).toBeUndefined();
        expect(rule.id).toBeUndefined();
      }
    });

    await test.step('列表行顺序与响应数组顺序一致，逐字段展示一致', async () => {
      await utils.expectRuleRowOrder(page, conds);
      for (let i = 0; i < apiRules.length; i += 1) {
        const rule = apiRules[i];
        await utils.expectRuleCellText(page, rule.cond, COL.cond, rule.cond);
        const modeText =
          rule.mode === 'off'
            ? R.modeOff
            : rule.mode === 'conservative'
              ? R.modeConservative
              : rule.mode === 'balanced'
                ? R.modeBalanced
                : R.modeAggressive;
        await utils.expectRuleModeTag(page, rule.cond, modeText);
        await utils.expectRuleCellText(
          page,
          rule.cond,
          COL.maxTokens,
          utils.formatTokensText(rule.max_context_tokens),
        );
        await utils.expectRuleCellText(
          page,
          rule.cond,
          COL.reserveTokens,
          utils.formatTokensText(rule.reserve_tokens),
        );
      }
    });

    await test.step('查看抽屉取值与响应对应元素一致', async () => {
      const rule = apiRules[1];
      await utils.openViewRuleDrawer(page, rule.cond);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], rule.cond);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], R.modeBalanced);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        utils.formatTokensText(rule.max_context_tokens),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[3],
        utils.formatTokensText(rule.reserve_tokens),
      );
      await utils.closeViewDrawer(page);
    });
  });

  test('AX-DEL-01 删除即从集合移除：确认框文案、提示「删除成功!」、不发 PUT', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('点击删除弹出确认框（信息提示/删除确认文案）', async () => {
        await utils.clickRuleDelete(page, rB.cond);
        await utils.expectDeleteConfirmModal(page);
      });

      await test.step('确定后行被移除并提示「删除成功!」', async () => {
        await utils.expectAiContextMessageDuringAction(
          page,
          P.deleteSuccessMsg,
          () => utils.confirmDelete(page),
        );
        await utils.expectRuleRowHidden(page, rB.cond);
        await utils.expectRuleRowVisible(page, rA.cond);
      });

      await test.step('仅本地草稿变更，未发送 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-DEL-02 删除取消：行保留并提示「取消删除」', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('删除确认框点「取消」，行保留并提示「取消删除」', async () => {
      await utils.clickRuleDelete(page, rA.cond);
      await utils.expectDeleteConfirmModal(page);
      await utils.expectAiContextMessageDuringAction(
        page,
        P.cancelDeleteMsg,
        () => utils.cancelDelete(page),
      );
      await utils.expectRuleRowVisible(page, rA.cond);
    });
  });

  test('AX-DEL-03 清空全部规则：PUT 体为 {"rules": []}，提交后回填空集合', async ({
    page,
  }) => {
    await test.step('前置：备份原始集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiContextPage(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('逐条删除全部规则，本地集合清空', async () => {
      await utils.deleteAllRules(page);
      await utils.expectRuleTableEmpty(page);
    });

    await test.step('提交并生效：PUT 体为 {"rules": []}，提示成功并回视图模式', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiContextMessage(page, P.submitSuccessMsg, 15000),
      ]);
      expect(payload).toBeTruthy();
      expect(payload.rules).toEqual([]);
      await utils.expectViewMode(page);
    });

    await test.step('重新 GET 后列表回填为空集合', async () => {
      await utils.expectRuleTableEmpty(page);
      const apiRules = await utils.getAiContextRulesViaApi(page);
      expect(apiRules.length).toBe(0);
    });
  });

  test('AX-DEL-04 提交成功后重新 GET 回填：顺序一致且无时间戳、无 id', async ({
    page,
  }) => {
    const conds = [
      utils.generateTestRuleName('ax_del04_1_'),
      utils.generateTestRuleName('ax_del04_2_'),
    ];

    await test.step('前置：备份原始集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiContextPage(page);
      await utils.enterEditMode(page);
    });

    await test.step('本地新增两条规则并提交并生效', async () => {
      for (const cond of conds) {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleCond(page, cond);
        await utils.submitRuleFormExpectMessage(page, utils.DOC_AI_CONTEXT_RULE_FORM.addSuccessMsg);
      }
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiContextMessage(page, P.submitSuccessMsg, 15000),
      ]);
      expect(payload).toBeTruthy();
      await utils.expectRulesPayloadNoTimestamps(payload);
    });

    await test.step('提交后 GET 回填：列表顺序与响应一致，元素无时间戳/id', async () => {
      const apiRules = await utils.getAiContextRulesViaApi(page);
      const apiConds = apiRules.map((r) => r.cond);
      // 新增为 unshift：后添加的规则排在集合头部
      const expectedConds = [conds[1], conds[0]];
      expect(apiConds.slice(0, expectedConds.length)).toEqual(expectedConds);
      for (const rule of apiRules) {
        expect(rule.created_at).toBeUndefined();
        expect(rule.updated_at).toBeUndefined();
        expect(rule.id).toBeUndefined();
      }
      await utils.expectRuleRowOrder(page, apiConds.slice(0, 3));
    });
  });

  test('AX-DEL-05 删除未提交时退出编辑模式：确认后回滚且后端数据未被修改', async ({
    page,
  }) => {
    const cond = utils.generateTestRuleName('ax_del05_');

    await test.step('前置：备份并经 API 创建规则，进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureAiContextRuleExistsViaApi(
        page,
        utils.buildTestRule({ cond }),
      );
      await utils.reloadAiContextPage(page);
      await utils.enterEditMode(page);
    });

    await test.step('本地删除该规则（未提交）', async () => {
      await utils.clickRuleDelete(page, cond);
      await utils.confirmDelete(page);
      await utils.expectRuleRowHidden(page, cond);
    });

    await test.step('退出编辑模式并确认：提示「已退出编辑模式」并回滚', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
      await utils.expectAiContextMessageDuringAction(page, P.exitDoneMsg, () =>
        utils.confirmExitEditMode(page),
      );
      await utils.expectViewMode(page);
      await utils.expectRuleRowVisible(page, cond);
    });

    await test.step('后端数据未被修改（规则仍在集合中）', async () => {
      const apiRules = await utils.getAiContextRulesViaApi(page);
      expect(apiRules.some((r) => r.cond === cond)).toBe(true);
    });
  });
});
