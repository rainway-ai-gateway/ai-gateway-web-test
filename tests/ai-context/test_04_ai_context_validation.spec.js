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
 * AI 上下文压缩 - 字段校验矩阵
 * 用例：AX-V-01 ~ AX-V-08
 *
 * 说明：校验类用例经 mockRulesGetResponse 注入受控集合隔离环境；
 * AX-V-02 控制面编译校验经 mockExpressionVerifyFailure 构造——request.js
 * 错误拦截器对非 2xx resolve 返回 error.response，Expression 组件 .then
 * 以 rsp.data.message 作为 condErrmsg 回传并触发 validateField('cond')。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const cleanup = utils.createAiContextTestCleanup();
const P = utils.DOC_AI_CONTEXT_PAGE;
const F = utils.DOC_AI_CONTEXT_RULE_FORM;

/** 构造一条具备指定字段的受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

test.describe('AI 上下文压缩 - 字段校验矩阵', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AX-V-01 生效条件必填：内联「请填写生效条件」+ 整体「请检查参数填写是否规范!」', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并进入编辑模式打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('生效条件留空直接本地保存，整体提示校验失败', async () => {
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
    });

    await test.step('FormItem 内联展示「请填写生效条件」', async () => {
      await utils.expectRuleFormError(page, F.condFieldLabel, F.condRequiredMsg);
    });

    await test.step('抽屉保持打开，规则不写入集合', async () => {
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleTableEmpty(page);
    });
  });

  test('AX-V-02 生效条件控制面编译校验：condErrmsg 优先内联展示并拦截保存', async ({
    page,
  }) => {
    const compileErrMsg = '表达式编译失败 mock: 括号不闭合';

    await test.step('前置：mock 空集合，进入编辑模式打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('拦截 expression/verify 返回编译失败', async () => {
      await utils.mockExpressionVerifyFailure(page, compileErrMsg, 422);
    });

    await test.step('输入不可编译表达式，condErrmsg 经 expressionChanged 回传并内联展示', async () => {
      await utils.fillRuleCond(page, 'default_t((');
      await utils.expectRuleFormError(page, F.condFieldLabel, compileErrMsg);
    });

    await test.step('本地保存被拦截，整体提示「请检查参数填写是否规范!」', async () => {
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleTableEmpty(page);
    });

    await utils.unmockAiContextNetwork(page);
  });

  test('AX-V-03 生效条件集合内唯一：表单级查重 + 提交级 Set 去重不发 PUT', async ({
    page,
  }) => {
    const dupCond = 'req_path_in("/test/ax_v03_dup", false)';
    const rA = mockRule({ cond: dupCond });

    await test.step('前置：集合内已有该 cond 规则，进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('表单级：新增同 cond 规则被拦截，提示「生效条件已存在，集合内必须唯一」', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, dupCond);
      await utils.submitRuleFormExpectMessage(page, F.condDuplicateMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.closeRuleFormDrawer(page);
      expect(await utils.getRuleRowCount(page)).toBe(1);
    });

    await test.step('提交级：注入含重复 cond 的集合并提交，Set 去重拦截且不发 PUT', async () => {
      const tracker = utils.trackAiContextRuleRequests(page);
      try {
        await utils.mockRulesGetResponse(page, {
          rules: [rA, mockRule({ cond: dupCond })],
        });
        await utils.reloadAiContextPage(page);
        await utils.enterEditMode(page);
        await utils.expectAiContextMessageDuringAction(
          page,
          F.condDuplicateMsg,
          () => utils.clickSubmitAndEffect(page),
        );
        await utils.expectNoRuleMutationRequest(tracker);
        await utils.expectEditMode(page);
      } finally {
        tracker.stop();
      }
    });
  });

  test('AX-V-04 压缩档位四枚举：默认 off 合法，注入非法值报「压缩档位不合法」', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('默认值 off 合法（无错误提示）', async () => {
      await utils.expectRuleFormFieldValid(page, F.modeFieldLabel);
    });

    await test.step('注入非法档位 OFF，本地保存报「压缩档位不合法」', async () => {
      await utils.injectRuleFormMode(page, 'OFF');
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
      await utils.expectRuleFormError(page, F.modeFieldLabel, F.modeInvalidMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('注入空值同样非法', async () => {
      await utils.injectRuleFormMode(page, '');
      await utils.expectRuleFormError(page, F.modeFieldLabel, F.modeInvalidMsg);
    });
  });

  test('AX-V-05 预算上限非负校验：-1 拦截并提示「预算上限不能小于 0」', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并打开新增抽屉，填写合法生效条件', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, 'default_t()');
    });

    await test.step('-1 被拦截并内联提示「预算上限不能小于 0」', async () => {
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, -1);
      await utils.expectRuleFormError(
        page,
        F.maxTokensFieldLabel,
        F.maxTokensNegativeMsg,
      );
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
    });

    await test.step('0 与正整数合法', async () => {
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 0);
      await utils.expectRuleFormFieldValid(page, F.maxTokensFieldLabel);
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 64000);
      await utils.expectRuleFormFieldValid(page, F.maxTokensFieldLabel);
    });
  });

  test('AX-V-06 预留输出非负校验：-1 拦截并提示「预留输出不能小于 0」', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并打开新增抽屉，填写合法生效条件', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, 'default_t()');
    });

    await test.step('-1 被拦截并内联提示「预留输出不能小于 0」', async () => {
      await utils.fillRuleFormNumber(page, F.reserveTokensFieldLabel, -1);
      await utils.expectRuleFormError(
        page,
        F.reserveTokensFieldLabel,
        F.reserveTokensNegativeMsg,
      );
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
    });

    await test.step('0 与正整数合法', async () => {
      await utils.fillRuleFormNumber(page, F.reserveTokensFieldLabel, 0);
      await utils.expectRuleFormFieldValid(page, F.reserveTokensFieldLabel);
      await utils.fillRuleFormNumber(page, F.reserveTokensFieldLabel, 8192);
      await utils.expectRuleFormFieldValid(page, F.reserveTokensFieldLabel);
    });
  });

  test('AX-V-07 两数值字段空值与零值合法，可正常保存', async ({ page }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('两字段均留空：校验通过，保存成功', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleCond(page, utils.generateTestRuleName('ax_v07_empty_'));
      await utils.expectRuleFormFieldValid(page, F.maxTokensFieldLabel);
      await utils.expectRuleFormFieldValid(page, F.reserveTokensFieldLabel);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('两字段均填 0：校验通过，保存成功', async () => {
      await utils.openAddRuleDrawer(page);
      const cond = utils.generateTestRuleName('ax_v07_zero_');
      await utils.fillRuleCond(page, cond);
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, 0);
      await utils.fillRuleFormNumber(page, F.reserveTokensFieldLabel, 0);
      await utils.expectRuleFormFieldValid(page, F.maxTokensFieldLabel);
      await utils.expectRuleFormFieldValid(page, F.reserveTokensFieldLabel);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, cond);
    });
  });

  test('AX-V-08 多字段同时非法：内联单行展示 + 整体提示，不写入集合', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiContextPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('生效条件为空 + 预算上限为负，点击本地保存', async () => {
      await utils.fillRuleFormNumber(page, F.maxTokensFieldLabel, -1);
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
    });

    await test.step('两字段内联错误均单行展示于对应控件下方', async () => {
      await utils.expectRuleFormError(page, F.condFieldLabel, F.condRequiredMsg);
      await utils.expectRuleFormError(
        page,
        F.maxTokensFieldLabel,
        F.maxTokensNegativeMsg,
      );
    });

    await test.step('抽屉保持打开，集合仍为空且无写请求', async () => {
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleTableEmpty(page);
    });
  });
});
