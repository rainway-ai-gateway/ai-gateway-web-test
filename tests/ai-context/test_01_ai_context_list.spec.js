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
 * AI 上下文压缩 - 列表与双模式
 * 用例：AX-L-01 ~ AX-L-17
 *
 * 说明：列表渲染类用例（L-01~L-06）优先使用 mockRulesGetResponse
 * 注入受控集合，避免后端默认值干扰；退出确认类（L-11/12/13）经 UI 删除本地行制造
 * dirty；提交类（L-14）真实提交后由 cleanup 还原；失败/查重类（L-07/15/16）经 mock。
 * 规则无 name 字段，cond（生效条件表达式）即身份，行定位一律按 cond。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const cleanup = utils.createAiContextTestCleanup();
const P = utils.DOC_AI_CONTEXT_PAGE;
const R = utils.DOC_AI_CONTEXT_RULES;
const COL = R.columnIndex;

/** 构造一条具备指定字段的受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

test.describe('AI 上下文压缩 - 列表与双模式', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AX-L-01 页面双 Tab 展示与切换，默认选中「压缩规则」', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：进入 AI 上下文压缩页（受控集合 1 条）', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('双 Tab 可见且默认激活「压缩规则」，展示规则列表', async () => {
      await utils.expectAiContextPageReady(page);
      await utils.expectTabs(page);
      await utils.expectActiveTab(page, P.tabRules);
      await utils.expectRuleTableHeaders(page);
    });

    await test.step('切换到「全局设置」Tab，面板内容正确显示', async () => {
      await utils.switchToSettingsTab(page);
      await utils.expectActiveTab(page, P.tabSettings);
      await utils.expectSettingsHeaderSubtitle(page);
      await utils.expectSettingsCardTitle(page);
    });

    await test.step('切回「压缩规则」Tab，列表仍完整展示', async () => {
      await utils.switchToRulesTab(page);
      await utils.expectActiveTab(page, P.tabRules);
      await utils.expectRuleRowVisible(page, rA.cond);
    });
  });

  test('AX-L-02 规则列表加载与 5 列展示，行数等于集合条数', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：进入压缩规则 Tab（受控集合 2 条）', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
        await utils.gotoAiContextPageAndWaitForRules(page);
      });

      await test.step('Tab 描述文案正确', async () => {
        await utils.expectPageHeaderTitle(page);
      });

      await test.step('表头共 5 列：生效条件/压缩档位/预算上限/预留输出/操作', async () => {
        await utils.expectRuleTableHeaders(page);
      });

      await test.step('行数等于集合条数，生效条件列展示 cond', async () => {
        expect(await utils.getRuleRowCount(page)).toBe(2);
        await utils.expectRuleRowOrder(page, [rA.cond, rB.cond]);
        await utils.expectRuleCellText(page, rA.cond, COL.cond, rA.cond);
        await utils.expectRuleCellText(page, rB.cond, COL.cond, rB.cond);
      });

      await test.step('进入页面时调用了 GET /ai-context-rules', async () => {
        expect(tracker.state.get).toBeGreaterThan(0);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-L-03 数组顺序即展示顺序，列表无优先级列且不重排', async ({
    page,
  }) => {
    const rFirst = mockRule({ cond: 'req_path_in("/test/ax_l03_zzz", false)' });
    const rSecond = mockRule({ cond: 'req_path_in("/test/ax_l03_aaa", false)' });
    const rThird = mockRule({ cond: 'req_path_in("/test/ax_l03_mmm", false)' });

    await test.step('前置：注入「非字典序」集合', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rFirst, rSecond, rThird],
      });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('页面行顺序与接口数组顺序完全一致（不按 cond 重排）', async () => {
      await utils.expectRuleRowOrder(page, [
        rFirst.cond,
        rSecond.cond,
        rThird.cond,
      ]);
    });

    await test.step('列表不展示显式「优先级」列（顺序即优先级）', async () => {
      expect(R.tableHeaders).not.toContain('优先级');
      expect(R.tableHeaders.filter((h) => h.includes('优先级')).length).toBe(0);
    });
  });

  test('AX-L-04 压缩档位列 Tag 文案与颜色（off=default，其余=primary）', async ({
    page,
  }) => {
    const rOff = mockRule({ mode: 'off' });
    const rConservative = mockRule({ mode: 'conservative' });
    const rBalanced = mockRule({ mode: 'balanced' });
    const rAggressive = mockRule({ mode: 'aggressive' });

    await test.step('前置：注入四档规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rOff, rConservative, rBalanced, rAggressive],
      });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('off → default 色「不处理（off）」', async () => {
      await utils.expectRuleModeTag(page, rOff.cond, R.modeOff, 'default');
    });

    await test.step('conservative / balanced / aggressive → primary 色标签', async () => {
      await utils.expectRuleModeTag(
        page,
        rConservative.cond,
        R.modeConservative,
        'primary',
      );
      await utils.expectRuleModeTag(
        page,
        rBalanced.cond,
        R.modeBalanced,
        'primary',
      );
      await utils.expectRuleModeTag(
        page,
        rAggressive.cond,
        R.modeAggressive,
        'primary',
      );
    });
  });

  test('AX-L-05 预算上限与预留输出列格式化（0/null→模型默认，64000→64000 tokens）', async ({
    page,
  }) => {
    const rZero = mockRule({ max_context_tokens: 0, reserve_tokens: 0 });
    const rFull = mockRule({ max_context_tokens: 64000, reserve_tokens: 8000 });
    const rNull = mockRule({ max_context_tokens: null, reserve_tokens: null });

    await test.step('前置：注入 0 / 正整数 / null 三类规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rZero, rFull, rNull],
      });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('预算上限：0/null → 「模型默认（0）」，64000 → 「64000 tokens」', async () => {
      await utils.expectRuleCellText(
        page,
        rZero.cond,
        COL.maxTokens,
        utils.formatTokensText(0),
      );
      await utils.expectRuleCellText(
        page,
        rFull.cond,
        COL.maxTokens,
        utils.formatTokensText(64000),
      );
      await utils.expectRuleCellText(
        page,
        rNull.cond,
        COL.maxTokens,
        utils.formatTokensText(null),
      );
    });

    await test.step('预留输出：0/null → 「模型默认（0）」，8000 → 「8000 tokens」', async () => {
      await utils.expectRuleCellText(
        page,
        rZero.cond,
        COL.reserveTokens,
        utils.formatTokensText(0),
      );
      await utils.expectRuleCellText(
        page,
        rFull.cond,
        COL.reserveTokens,
        utils.formatTokensText(8000),
      );
      await utils.expectRuleCellText(
        page,
        rNull.cond,
        COL.reserveTokens,
        utils.formatTokensText(null),
      );
    });
  });

  test('AX-L-06 列表搜索与档位下拉筛选（裸枚举选项），取消后恢复全量', async ({
    page,
  }) => {
    const keyword = 'ax_l06_kw';
    const rHit = mockRule({ cond: 'req_path_in("/test/' + keyword + '_hit", false)' });
    const rBalanced = mockRule({ mode: 'balanced' });
    const rOff = mockRule({ mode: 'off' });

    await test.step('前置：注入可区分规则（balanced 1 条 + off 1 条 + 关键字命中 1 条）', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rHit, rBalanced, rOff],
      });
      await utils.gotoAiContextPageAndWaitForRules(page);
      expect(await utils.getRuleRowCount(page)).toBe(3);
    });

    await test.step('生效条件文本搜索：仅保留匹配行，无匹配时空数据', async () => {
      await utils.searchRules(page, keyword);
      await utils.expectRuleRowVisible(page, rHit.cond);
      await utils.expectRuleRowHidden(page, rBalanced.cond);
      expect(await utils.getRuleRowCount(page)).toBe(1);
      await utils.searchRules(page, 'no_such_keyword_xyz');
      await utils.expectRuleTableEmpty(page);
      await utils.clearRulesSearch(page);
      expect(await utils.getRuleRowCount(page)).toBe(3);
    });

    await test.step('档位筛选下拉选项为裸枚举 off/conservative/balanced/aggressive', async () => {
      await utils.expectModeFilterOptions(page);
    });

    await test.step('筛选 balanced 后仅保留该档位行', async () => {
      await utils.filterRulesByMode(page, 'balanced');
      await utils.expectRuleRowVisible(page, rBalanced.cond);
      await utils.expectRuleRowHidden(page, rOff.cond);
      await utils.expectRuleRowHidden(page, rHit.cond);
      expect(await utils.getRuleRowCount(page)).toBe(1);
    });

    await test.step('清除筛选后恢复全量', async () => {
      await utils.clearModeFilter(page);
      await utils.expectRuleRowVisible(page, rHit.cond);
      await utils.expectRuleRowVisible(page, rBalanced.cond);
      await utils.expectRuleRowVisible(page, rOff.cond);
      expect(await utils.getRuleRowCount(page)).toBe(3);
    });
  });

  test('AX-L-07 列表加载失败提示且不渲染脏数据', async ({ page }) => {
    await test.step('前置：拦截 GET /ai-context-rules 返回错误', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        status: 500,
        errMsg: 'mock 500',
      });
      await utils.reloadAiContextPageExpectMessage(page, P.loadFailedMsg);
    });

    await test.step('提示「加载 AI 上下文压缩规则失败」，表格为空', async () => {
      await utils.expectAiContextPageReady(page);
      await utils.expectRuleTableEmpty(page);
    });

    await test.step('页面仍可继续操作（视图模式头部正常）', async () => {
      await utils.expectViewMode(page);
    });

    await utils.unmockAiContextNetwork(page);
  });

  test('AX-L-08 视图模式头部仅「进入编辑模式」，行操作仅「查看」', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：注入规则并保持视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
    });

    await test.step('头部仅「进入编辑模式」，无「添加规则」「提交并生效」', async () => {
      await utils.expectViewMode(page);
    });

    await test.step('行操作列仅「查看」，不含「编辑」「删除」', async () => {
      await utils.expectRuleRowOnlyViewAction(page, rA.cond);
    });
  });

  test('AX-L-09 进入编辑模式（出现添加/提交，行操作变为编辑与删除）', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：注入规则并确认视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.expectViewMode(page);
      await utils.expectRuleRowOnlyViewAction(page, rA.cond);
    });

    await test.step('点击「进入编辑模式」后出现「添加规则」「提交并生效」', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('行操作列由「查看」变为「编辑/删除」', async () => {
      await utils.expectRuleRowEditDeleteActions(page, rA.cond);
    });
  });

  test('AX-L-10 编辑模式头部三入口齐全，行操作「编辑」与「删除」可用', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('每行操作列展示「编辑」与「删除」两个按钮', async () => {
      await utils.expectRuleRowEditDeleteActions(page, rA.cond);
    });

    await test.step('点击「编辑」打开编辑抽屉', async () => {
      await utils.openEditRuleDrawer(page, rA.cond);
      await utils.closeRuleFormDrawer(page);
    });

    await test.step('点击「删除」触发删除确认框（取消后行仍在）', async () => {
      await utils.clickRuleDelete(page, rA.cond);
      await utils.expectDeleteConfirmModal(page);
      await utils.cancelDelete(page);
      await utils.expectRuleRowVisible(page, rA.cond);
    });
  });

  test('AX-L-11 无改动时退出编辑模式无二次确认，直接回视图且数据不变', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();

    await test.step('前置：进入编辑模式且不做改动', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('点击「退出编辑模式」不弹出确认框，直接回到视图模式', async () => {
      await utils.clickExitEditMode(page);
      await page.waitForTimeout(1000);
      await expect(utils.modal(page).visible()).toHaveCount(0);
      await utils.expectViewMode(page);
    });

    await test.step('集合数据保持不变', async () => {
      await utils.expectRuleRowOrder(page, [rA.cond, rB.cond]);
      await utils.expectRuleRowOnlyViewAction(page, rA.cond);
    });
  });

  test('AX-L-12 有未提交改动时退出弹确认，确定后回滚快照并重新拉取集合', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();
    const rC = mockRule({ cond: 'req_path_in("/test/ax_l12_del", false)' });
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式并删除一行制造未提交改动', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB, rC] });
        await utils.gotoAiContextPageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.clickRuleDelete(page, rC.cond);
        await utils.confirmDelete(page);
        await utils.expectRuleRowHidden(page, rC.cond);
      });

      await test.step('点击「退出编辑模式」弹出二次确认框（信息提示/退出确认文案）', async () => {
        await utils.clickExitEditMode(page);
        await utils.expectExitConfirmModal(page);
      });

      await test.step('点击「确定」后改动被丢弃，重新 GET 并提示「已退出编辑模式」', async () => {
        const beforeGet = tracker.state.get;
        await utils.expectAiContextMessageDuringAction(page, P.exitDoneMsg, () =>
          utils.confirmExitEditMode(page),
        );
        expect(tracker.state.get).toBeGreaterThan(beforeGet);
      });

      await test.step('页面回到视图模式且被删规则已回滚', async () => {
        await utils.expectViewMode(page);
        await utils.expectRuleRowVisible(page, rC.cond);
        await utils.expectRuleRowOrder(page, [rA.cond, rB.cond, rC.cond]);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-L-13 有未提交改动时退出点「取消」，停留编辑且改动保留', async ({
    page,
  }) => {
    const rA = mockRule();
    const rC = mockRule({ cond: 'req_path_in("/test/ax_l13_del", false)' });

    await test.step('前置：进入编辑模式并删除一行制造未提交改动', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rC] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.clickRuleDelete(page, rC.cond);
      await utils.confirmDelete(page);
      await utils.expectRuleRowHidden(page, rC.cond);
    });

    await test.step('退出确认框点「取消」，停留编辑模式并提示「已取消退出」', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
      await utils.expectAiContextMessageDuringAction(
        page,
        P.exitCancelledMsg,
        () => utils.cancelExitEditMode(page),
      );
      await utils.expectEditMode(page);
    });

    await test.step('未提交的改动保留在本地集合', async () => {
      await utils.expectRuleRowHidden(page, rC.cond);
      await utils.expectRuleRowEditDeleteActions(page, rA.cond);
    });
  });

  test('AX-L-14 提交并生效：PUT 整体替换、顺序即优先级、无时间戳并回视图刷新', async ({
    page,
  }) => {
    const newCond = utils.generateTestRuleName('ax_l14_');

    await test.step('前置：备份原始集合后进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiContextPage(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('本地新增一条规则（置顶，零值不写入提交体）', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, newCond);
      await utils.submitRuleFormExpectMessage(
        page,
        utils.DOC_AI_CONTEXT_RULE_FORM.addSuccessMsg,
      );
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, newCond);
    });

    await test.step('提交并生效：捕获 PUT 请求体并提示「提交并生效成功！」', async () => {
      const expectedConds = await utils.getRuleCondsInOrder(page);
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiContextMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectRulesPayloadOrder(payload, expectedConds);
      await utils.expectRulesPayloadNoTimestamps(payload);
      await utils.expectRulePayloadOmitsZeroFields(payload, newCond);
      expect(expectedConds[0]).toBe(newCond);
    });

    await test.step('提交成功后回到视图模式并重新拉取列表', async () => {
      await utils.expectViewMode(page);
      await utils.expectRuleRowVisible(page, newCond);
      await utils.expectRuleRowOnlyViewAction(page, newCond);
    });
  });

  test('AX-L-15 提交失败提示「提交失败!」并停留编辑模式', async ({ page }) => {
    const cond = utils.generateTestRuleName('ax_l15_');

    await test.step('前置：拦截 PUT 失败并进入编辑模式新增一条规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesPutFailure(page, {
        status: 500,
        errMsg: 'mock put 500',
      });
      await utils.reloadAiContextPage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, cond);
      await utils.submitRuleFormExpectMessage(
        page,
        utils.DOC_AI_CONTEXT_RULE_FORM.addSuccessMsg,
      );
    });

    await test.step('提交提示「提交失败!」且停留在编辑模式（改动不丢失）', async () => {
      await utils.expectAiContextMessageDuringAction(page, P.submitFailedMsg, () =>
        utils.clickSubmitAndEffect(page),
      );
      await utils.expectEditMode(page);
      await utils.expectRuleRowVisible(page, cond);
    });

    await utils.unmockAiContextNetwork(page);
  });

  test('AX-L-16 提交前生效条件集合内查重：命中重复时拦截且不发 PUT', async ({
    page,
  }) => {
    const dupCond = 'req_path_in("/test/ax_l16_dup", false)';
    const rDup1 = mockRule({ cond: dupCond });
    const rDup2 = mockRule({ cond: dupCond });
    const tracker = utils.trackAiContextRuleRequests(page);

    try {
      await test.step('前置：注入含重复 cond 的集合并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rDup1, rDup2] });
        await utils.reloadAiContextPage(page);
        await utils.enterEditMode(page);
        await utils.expectEditMode(page);
      });

      await test.step('提交被拦截，提示「生效条件已存在，集合内必须唯一」', async () => {
        await utils.expectAiContextMessageDuringAction(
          page,
          utils.DOC_AI_CONTEXT_RULE_FORM.condDuplicateMsg,
          () => utils.clickSubmitAndEffect(page),
        );
      });

      await test.step('不发送 PUT /ai-context-rules 且停留编辑模式', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
        await utils.expectEditMode(page);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-L-17 「提交并生效」按钮头部右上角绝对定位，视图模式不展示', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：注入规则并确认视图模式不展示提交按钮', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('编辑模式下提交按钮位于头部右上角（position:absolute; right:0px）', async () => {
      await utils.enterEditMode(page);
      await utils.expectRuleHeaderSubmitPosition(page);
    });
  });
});
