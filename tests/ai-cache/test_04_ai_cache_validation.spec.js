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
 * AI 缓存规则 - 字段校验矩阵
 * 用例：AC-V-01 ~ AC-V-13
 *
 * 覆盖字段：规则名 / 表达式 / 缓存键策略 / 缓存 TTL / 最大请求体 / 最大缓存值 /
 *           语义缓存 / 只读时间字段 / 多字段汇总校验
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');

const P = utils.DOC_AI_CACHE_PAGE;
const R = utils.DOC_AI_CACHE_RULES;
const F = utils.DOC_AI_CACHE_RULE_FORM;

const VALID_COND = 'default_t()';
const INVALID_COND = 'default_t(';

function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

function payloadRule(payload, name) {
  const rules = payload && payload.rules ? payload.rules : [];
  return rules.find((r) => r.name === name);
}

test.describe('AI 缓存规则 - 字段校验矩阵', () => {
  const cleanup = utils.createAiCacheTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AC-V-01 规则名称留空或纯空白，本地保存提示「请输入规则名称」且抽屉不关闭', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('仅填写合法生效条件，规则名保持为空', async () => {
      await utils.fillRuleCond(page, VALID_COND);
    });

    const tracker = utils.trackAiCacheRuleRequests(page);
    try {
      await test.step('规则名留空点「本地保存」并提示「请输入规则名称」', async () => {
        await utils.submitRuleFormAndWait(page);
        await utils.expectRuleFormError(
          page,
          F.ruleNameFieldLabel,
          F.ruleNameRequiredMsg,
        );
        await utils.expectRuleFormDrawerStillOpen(page);
      });

      await test.step('规则名改为纯空白后仍被拦截', async () => {
        await utils.fillRuleName(page, '   ');
        await utils.submitRuleFormAndWait(page);
        await utils.expectRuleFormError(
          page,
          F.ruleNameFieldLabel,
          F.ruleNameRequiredMsg,
        );
        await utils.expectRuleFormDrawerStillOpen(page);
      });

      await test.step('校验失败未发起 ai-cache-rules 变更请求(PUT)', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-V-02 规则名 128 字符合法、129 字符拦截且无 maxlength 硬截断', async ({
    page,
  }) => {
    const name128 = 'a'.repeat(128);
    const name129 = 'a'.repeat(129);

    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('128 字符可通过本地保存', async () => {
      await utils.fillRuleName(page, name128);
      await utils.fillRuleCond(page, VALID_COND);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('129 字符不被输入框硬截断', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, name129);
      await expect(
        utils.ruleFormScope(page).getByPlaceholder(F.ruleNamePlaceholder),
      ).toHaveValue(name129);
    });

    await test.step('129 字符保存提示「规则名称长度应为 1-128 字符」且抽屉不关闭', async () => {
      await utils.fillRuleCond(page, VALID_COND);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormError(
        page,
        F.ruleNameFieldLabel,
        F.nameLengthMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });

  test('AC-V-03 名称集合内重名时拦截并提示「规则名称已存在，集合内必须唯一」', async ({
    page,
  }) => {
    await test.step('前置：mock 集合已含 cache-rule-01 并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [mockRule({ name: 'cache-rule-01' })],
      });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('新增同名规则', async () => {
      await utils.fillRuleName(page, 'cache-rule-01');
      await utils.fillRuleCond(page, VALID_COND);
    });

    const tracker = utils.trackAiCacheRuleRequests(page);
    try {
      await test.step('保存提示重名错误且抽屉不关闭', async () => {
        await utils.submitRuleFormExpectMessage(page, F.nameDuplicateMsg);
        await utils.expectRuleFormDrawerStillOpen(page);
      });

      await test.step('重名未发起变更请求(PUT)', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-V-04 表达式留空时提示「请填写生效条件」', async ({ page }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('仅填写合法规则名，不触碰表达式输入框', async () => {
      await utils.fillRuleName(page, 'ac-v-04');
    });

    const tracker = utils.trackAiCacheRuleRequests(page);
    try {
      await test.step('保存提示「请填写生效条件」且抽屉不关闭', async () => {
        await utils.submitRuleFormAndWait(page);
        await utils.expectRuleFormError(
          page,
          F.condFieldLabel,
          F.condRequiredMsg,
        );
        await utils.expectRuleFormDrawerStillOpen(page);
      });

      await test.step('表达式为必填拦截时未发起变更请求(PUT)', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-V-05 非法表达式展示编译错误，合法表达式通过校验', async ({ page }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写合法规则名', async () => {
      await utils.fillRuleName(page, 'ac-v-05');
    });

    await test.step('填入非法表达式，展示编译错误而非「请填写生效条件」', async () => {
      await utils.fillRuleCond(page, INVALID_COND);
      await utils.expectRuleFormError(page, F.condFieldLabel);
      const tip = utils
        .ruleFormItem(page, F.condFieldLabel)
        .locator('.ivu-form-item-error-tip');
      await expect(tip).not.toHaveText(F.condRequiredMsg);
    });

    const tracker = utils.trackAiCacheRuleRequests(page);
    try {
      await test.step('非法表达式时保存被拦截，抽屉不关闭', async () => {
        await utils.submitRuleFormAndWait(page);
        await utils.expectRuleFormError(page, F.condFieldLabel);
        await utils.expectRuleFormDrawerStillOpen(page);
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }

    await test.step('改为合法表达式后校验通过并可保存', async () => {
      await utils.fillRuleCond(page, VALID_COND);
      await utils.expectRuleFormFieldValid(page, F.condFieldLabel);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });

  test('AC-V-06 缓存键策略下拉仅含 3 个枚举且 disabled 显示黄提示', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('下拉选项集合与文案与设计一致', async () => {
      await utils.expectRuleFormStrategyOptions(page, [
        R.strategyLastQuestion,
        R.strategyAllQuestions,
        R.strategyDisabled,
      ]);
    });

    await test.step('选择 lastQuestion：不显示提示', async () => {
      await utils.selectRuleFormStrategy(page, R.strategyLastQuestion);
      await utils.expectRuleFormStrategy(page, R.strategyLastQuestion);
      await utils.expectRuleFormStrategyHint(page, false);
    });

    await test.step('选择 allQuestions：不显示提示', async () => {
      await utils.selectRuleFormStrategy(page, R.strategyAllQuestions);
      await utils.expectRuleFormStrategy(page, R.strategyAllQuestions);
      await utils.expectRuleFormStrategyHint(page, false);
    });

    await test.step('选择 disabled：显示缓存豁免提示', async () => {
      await utils.selectRuleFormStrategy(page, R.strategyDisabled);
      await utils.expectRuleFormStrategy(page, R.strategyDisabled);
      await utils.expectRuleFormStrategyHint(page, true);
    });
  });

  test('AC-V-07 未选择策略时默认 lastQuestion 并在列表与请求体中体现', async ({
    page,
  }) => {
    const name = utils.generateTestRuleName('ac_v07_');

    await test.step('前置：保存原始状态并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('新增抽屉默认策略为 lastQuestion，保存后列表显示 primary 标签', async () => {
      await utils.expectRuleFormStrategy(page, R.strategyLastQuestion);
      await utils.fillRuleName(page, name);
      await utils.fillRuleCond(page, VALID_COND);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleStrategyTag(
        page,
        name,
        R.strategyLastQuestion,
        'primary',
      );
    });

    await test.step('提交并生效，请求体显式携带 lastQuestion', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      const rule = payloadRule(payload, name);
      expect(rule).toBeTruthy();
      expect(rule.cache_key_strategy).toBe('lastQuestion');
    });
  });

  test('AC-V-08 缓存 TTL：-1 与清空拦截，0 与 3600 合法', async ({ page }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写合法规则名与表达式', async () => {
      await utils.fillRuleName(page, 'ac-v-08');
      await utils.fillRuleCond(page, VALID_COND);
    });

    await test.step('-1 被拦截并提示「缓存 TTL 不能小于 0」', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, -1);
      await utils.expectRuleFormError(
        page,
        F.ttlFieldLabel,
        F.ttlNegativeMsg,
      );
    });

    await test.step('0 合法', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, 0);
      await utils.expectRuleFormFieldValid(page, F.ttlFieldLabel);
    });

    await test.step('3600 合法', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, 3600);
      await utils.expectRuleFormFieldValid(page, F.ttlFieldLabel);
    });

    await test.step('清空被拦截', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, '');
      await utils.expectRuleFormError(
        page,
        F.ttlFieldLabel,
        F.ttlNegativeMsg,
      );
    });

    await test.step('恢复 0 后可保存', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, 0);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });

  test('AC-V-09 最大请求体：0 与清空拦截，1048576 合法', async ({ page }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写合法规则名与表达式', async () => {
      await utils.fillRuleName(page, 'ac-v-09');
      await utils.fillRuleCond(page, VALID_COND);
    });

    await test.step('0 被拦截并提示「最大请求体必须大于 0」', async () => {
      await utils.fillRuleFormNumber(page, F.maxBodyFieldLabel, 0);
      await utils.expectRuleFormError(
        page,
        F.maxBodyFieldLabel,
        F.maxBodyPositiveMsg,
      );
    });

    await test.step('1048576 合法', async () => {
      await utils.fillRuleFormNumber(
        page,
        F.maxBodyFieldLabel,
        F.defaultBytes,
      );
      await utils.expectRuleFormFieldValid(page, F.maxBodyFieldLabel);
    });

    await test.step('清空被拦截', async () => {
      await utils.fillRuleFormNumber(page, F.maxBodyFieldLabel, '');
      await utils.expectRuleFormError(
        page,
        F.maxBodyFieldLabel,
        F.maxBodyPositiveMsg,
      );
    });

    await test.step('恢复默认值后可保存', async () => {
      await utils.fillRuleFormNumber(
        page,
        F.maxBodyFieldLabel,
        F.defaultBytes,
      );
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });

  test('AC-V-10 最大缓存值：0 与清空拦截，1048576 合法', async ({ page }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写合法规则名与表达式', async () => {
      await utils.fillRuleName(page, 'ac-v-10');
      await utils.fillRuleCond(page, VALID_COND);
    });

    await test.step('0 被拦截并提示「最大缓存值必须大于 0」', async () => {
      await utils.fillRuleFormNumber(page, F.maxValueFieldLabel, 0);
      await utils.expectRuleFormError(
        page,
        F.maxValueFieldLabel,
        F.maxValuePositiveMsg,
      );
    });

    await test.step('1048576 合法', async () => {
      await utils.fillRuleFormNumber(
        page,
        F.maxValueFieldLabel,
        F.defaultBytes,
      );
      await utils.expectRuleFormFieldValid(page, F.maxValueFieldLabel);
    });

    await test.step('清空被拦截', async () => {
      await utils.fillRuleFormNumber(page, F.maxValueFieldLabel, '');
      await utils.expectRuleFormError(
        page,
        F.maxValueFieldLabel,
        F.maxValuePositiveMsg,
      );
    });

    await test.step('恢复默认值后可保存', async () => {
      await utils.fillRuleFormNumber(
        page,
        F.maxValueFieldLabel,
        F.defaultBytes,
      );
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });

  test('AC-V-11 表单不含创建/更新时间输入项、提交体不携带、响应不返回逐规则时间', async ({
    page,
  }) => {
    const name = utils.generateTestRuleName('ac_v11_');

    await test.step('前置：保存原始状态并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('表单不存在创建时间/更新时间输入项', async () => {
      const scope = utils.ruleFormScope(page);
      await expect(utils.ruleFormItem(page, F.ruleNameFieldLabel)).toBeVisible();
      await expect(
        scope.locator('.ivu-form-item-label').filter({ hasText: '创建时间' }),
      ).toHaveCount(0);
      await expect(
        scope.locator('.ivu-form-item-label').filter({ hasText: '更新时间' }),
      ).toHaveCount(0);
    });

    await test.step('新增并本地保存', async () => {
      await utils.fillRuleName(page, name);
      await utils.fillRuleCond(page, VALID_COND);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('提交并生效，请求体不含只读时间字段', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      utils.expectRulesPayloadNoTimestamps(payload);
    });

    await test.step('GET 回填不含逐规则 created_at/updated_at（契约已移除）', async () => {
      const rules = await utils.getAiCacheRulesViaApi(page);
      const created = rules.find((r) => r.name === name);
      expect(created).toBeTruthy();
      expect(created.created_at).toBeUndefined();
      expect(created.updated_at).toBeUndefined();
    });
  });

  test('AC-V-12 多项非法：单行提示 + 「请检查参数填写是否规范!」，修正后可保存', async ({
    page,
  }) => {
    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('制造名称留空、表达式留空、TTL 为 -1 三项非法', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, -1);
    });

    const tracker = utils.trackAiCacheRuleRequests(page);
    try {
      await test.step('保存触发「请检查参数填写是否规范!」汇总提示且抽屉不关闭', async () => {
        await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
        await utils.expectRuleFormDrawerStillOpen(page);
      });

      await test.step('三个字段各自单行展示错误提示', async () => {
        await utils.expectRuleFormError(
          page,
          F.ruleNameFieldLabel,
          F.ruleNameRequiredMsg,
        );
        await utils.expectRuleFormError(
          page,
          F.condFieldLabel,
          F.condRequiredMsg,
        );
        await utils.expectRuleFormError(
          page,
          F.ttlFieldLabel,
          F.ttlNegativeMsg,
        );
        for (const label of [
          F.ruleNameFieldLabel,
          F.condFieldLabel,
          F.ttlFieldLabel,
        ]) {
          await expect(
            utils.ruleFormItem(page, label).locator('.ivu-form-item-error-tip'),
          ).toHaveCount(1);
        }
        await utils.expectNoRuleMutationRequest(tracker);
      });

      await test.step('修正三个字段后保存成功', async () => {
        await utils.fillRuleName(page, 'ac-v-12');
        await utils.fillRuleCond(page, VALID_COND);
        await utils.fillRuleFormNumber(page, F.ttlFieldLabel, 0);
        await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-V-13 语义缓存开关无组合校验，关闭/开启/disabled+开启均可保存且请求体布尔归一化', async ({
    page,
  }) => {
    const nameOff = utils.generateTestRuleName('ac_v13_off_');
    const nameOn = utils.generateTestRuleName('ac_v13_on_');
    const nameDisabled = utils.generateTestRuleName('ac_v13_dis_');

    await test.step('前置：保存原始状态并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('规则一：语义缓存关闭（默认），列表显示「关闭」', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, nameOff);
      await utils.fillRuleCond(page, VALID_COND);
      await utils.expectRuleFormSwitch(page, false);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleSemanticTag(page, nameOff, R.semanticOff, 'default');
    });

    await test.step('规则二：语义缓存开启，列表显示「开启」', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, nameOn);
      // 同集合内 cond 必须唯一，避免与规则一重复
      await utils.fillRuleCond(page, `req_header_value_in("x-test-rule", "${nameOn}", false)`);
      await utils.toggleRuleFormSwitch(page);
      await utils.expectRuleFormSwitch(page, true);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleSemanticTag(page, nameOn, R.semanticOn, 'success');
    });

    await test.step('规则三：策略 disabled + 语义缓存开启，仍可保存（无组合校验）', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, nameDisabled);
      await utils.fillRuleCond(page, `req_header_value_in("x-test-rule", "${nameDisabled}", false)`);
      await utils.selectRuleFormStrategy(page, R.strategyDisabled);
      await utils.toggleRuleFormSwitch(page);
      await utils.expectRuleFormSwitch(page, true);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('提交并生效，请求体 enable_semantic_cache 布尔归一化', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);

      const off = payloadRule(payload, nameOff);
      const on = payloadRule(payload, nameOn);
      const dis = payloadRule(payload, nameDisabled);
      expect(off).toBeTruthy();
      expect(on).toBeTruthy();
      expect(dis).toBeTruthy();
      expect(off.enable_semantic_cache).toBe(false);
      expect(on.enable_semantic_cache).toBe(true);
      expect(dis.enable_semantic_cache).toBe(true);
      expect(typeof off.enable_semantic_cache).toBe('boolean');
      expect(typeof on.enable_semantic_cache).toBe('boolean');
      expect(typeof dis.enable_semantic_cache).toBe('boolean');
    });
  });
});