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
 * AI 缓存规则 - 查看与删除
 * 用例：AC-D-01 ~ AC-D-09、AC-DEL-01 ~ AC-DEL-05
 *
 * 说明：
 * - 查看类用例（D-01 ~ D-09）使用 mockRulesGetResponse 注入受控集合，
 *   精确覆盖字段展示、空值占位、disabled 忽略后缀等只读渲染分支；
 * - 删除/取消删除（DEL-01/02）仅改本地草稿，用 trackAiCacheRuleRequests 断言不发 PUT；
 * - 清空提交（DEL-03）/ 提交回填时间（DEL-04）/ 退出回滚（DEL-05）走真实 PUT，
 *   前置 saveOriginalState 备份、afterEach cleanup 还原。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');

const cleanup = utils.createAiCacheTestCleanup();
const P = utils.DOC_AI_CACHE_PAGE;
const R = utils.DOC_AI_CACHE_RULES;
const V = utils.DOC_AI_CACHE_RULE_VIEW;
const COL = R.columnIndex;

/** 构造一条受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

test.describe('AI 缓存规则 - 查看与删除', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AC-D-01 查看抽屉展示 7 项只读信息、表达式等宽、取值与集合一致', async ({
    page,
  }) => {
    const rule = mockRule({ cache_ttl: 3600 });

    await test.step('前置：注入受控集合进入视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rule] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('点击「查看」打开抽屉，标题为「查看缓存规则」', async () => {
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('抽屉依次展示 7 项只读标签', async () => {
      await utils.expectViewDrawerFieldLabels(page);
    });

    await test.step('各项取值与集合数据一致（策略/TTL/字节/语义缓存）', async () => {
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], rule.name);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], rule.cond);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        R.strategyLastQuestion,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[3],
        utils.formatTtlText(rule.cache_ttl),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[4],
        utils.formatBytesText(rule.max_body_bytes),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[5],
        utils.formatBytesText(rule.max_value_bytes),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[6],
        R.semanticOff,
      );
    });

    await test.step('表达式以等宽字体展示原文', async () => {
      const fontFamily = await utils
        .viewDrawerRow(page, V.fieldLabels[1])
        .locator('.expression-value')
        .evaluate((el) => getComputedStyle(el).fontFamily);
      expect(fontFamily.toLowerCase()).toContain('mono');
    });
  });

  test('AC-D-02 查看抽屉无任何输入控件且无保存/提交/重置按钮', async ({
    page,
  }) => {
    const rule = mockRule();

    await test.step('前置：注入受控集合并打开查看抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rule] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('抽屉内不存在 Input / Select / InputNumber / 表达式编辑块', async () => {
      await utils.expectViewDrawerNoInputs(page);
    });

    await test.step('查看态为独立组件渲染，不经过表单 Form/FormItem', async () => {
      const scope = utils.viewDrawerScope(page);
      await expect(scope.locator('.info-row')).toHaveCount(7);
      await expect(scope.locator('.ivu-form, .ivu-form-item')).toHaveCount(0);
    });
  });

  test('AC-D-03 查看抽屉 7 项标签均不带必填星号', async ({ page }) => {
    const rule = mockRule();

    await test.step('前置：注入受控集合并打开查看抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rule] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('无 .ivu-form-item-required，且各标签文本不含 *', async () => {
      await utils.expectViewDrawerNoRequiredMark(page);
    });
  });

  test('AC-D-04 仅视图模式提供查看入口，编辑模式为编辑+删除', async ({
    page,
  }) => {
    const rA = mockRule({ name: 'ac_d04_a_' + Date.now() });
    const rB = mockRule({ name: 'ac_d04_b_' + Date.now() });

    await test.step('前置：注入受控集合进入视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('视图模式操作列仅渲染「查看」', async () => {
      await utils.expectRuleRowOnlyViewAction(page, rA.name);
    });

    await test.step('点击「查看」可打开查看抽屉', async () => {
      await utils.openViewRuleDrawer(page, rA.name);
      await utils.closeViewDrawer(page);
    });

    await test.step('进入编辑模式后操作列为「编辑」+「删除」，无查看入口', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.expectRuleRowEditDeleteActions(page, rA.name);
      await expect(
        utils
          .getRuleRow(page, rA.name)
          .getByRole('button', { name: P.viewButton, exact: true }),
      ).toHaveCount(0);
    });
  });

  test('AC-D-05 查看抽屉空值字段展示占位符 -', async ({ page }) => {
    const rule = mockRule({
      name: 'ac_d05_' + Date.now(),
      cache_ttl: null,
      max_body_bytes: null,
      max_value_bytes: null,
    });

    await test.step('前置：注入 TTL/字节缺失的规则并打开查看抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rule] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('缺失的 TTL / 最大请求体 / 最大缓存值均展示 -', async () => {
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[3],
        V.emptyPlaceholder,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[4],
        V.emptyPlaceholder,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[5],
        V.emptyPlaceholder,
      );
    });

    await test.step('不展示 null / undefined 原始字样，有值字段正常展示', async () => {
      const scope = utils.viewDrawerScope(page);
      await expect(scope).not.toContainText('null');
      await expect(scope).not.toContainText('undefined');
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], rule.name);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        R.strategyLastQuestion,
      );
    });
  });

  test('AC-D-06 查看抽屉禁用策略展示「缓存豁免（disabled）」且无黄色提示', async ({
    page,
  }) => {
    const rule = mockRule({
      name: 'ac_d06_' + Date.now(),
      cache_key_strategy: 'disabled',
    });

    await test.step('前置：注入 disabled 策略规则并打开查看抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rule] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('抽屉「缓存键策略」行展示「缓存豁免（disabled）」', async () => {
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        R.strategyDisabled,
      );
    });

    await test.step('抽屉内不出现表单态黄色提示（.strategy-hint）', async () => {
      await expect(
        utils.viewDrawerScope(page).locator('.strategy-hint'),
      ).toHaveCount(0);
    });

    await test.step('与列表「缓存键策略」列（warning 色 Tag）展示一致', async () => {
      await utils.expectRuleStrategyTag(
        page,
        rule.name,
        R.strategyDisabled,
        'warning',
      );
    });
  });

  test('AC-D-07 列表与查看抽屉同接口响应全字段一致性核对', async ({ page }) => {
    const rA = mockRule({ name: 'ac_d07_a_' + Date.now(), cache_ttl: 0 });
    const rB = mockRule({
      name: 'ac_d07_b_' + Date.now(),
      cache_key_strategy: 'disabled',
      enable_semantic_cache: true,
      cache_ttl: 7200,
    });

    await test.step('前置：注入受控集合（2 条）进入视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiCachePageAndWaitForRules(page);
    });

    await test.step('列表行序 = 集合数组顺序，前端未重排', async () => {
      await utils.expectRuleRowOrder(page, [rA.name, rB.name]);
    });

    await test.step('列表各列展示值与集合逐字段一致', async () => {
      await utils.expectRuleCellText(page, rA.name, COL.name, rA.name);
      await utils.expectRuleCellContains(page, rA.name, COL.cond, rA.cond);
      await utils.expectRuleStrategyTag(
        page,
        rA.name,
        R.strategyLastQuestion,
        'primary',
      );
      await utils.expectRuleStrategyTag(
        page,
        rB.name,
        R.strategyDisabled,
        'warning',
      );
      await utils.expectRuleCellText(
        page,
        rA.name,
        COL.ttl,
        utils.formatTtlText(rA.cache_ttl),
      );
      await utils.expectRuleCellText(
        page,
        rB.name,
        COL.ttl,
        utils.formatTtlText(rB.cache_ttl),
      );
      await utils.expectRuleCellText(
        page,
        rA.name,
        COL.maxBody,
        utils.formatBytesText(rA.max_body_bytes),
      );
      await utils.expectRuleCellText(
        page,
        rA.name,
        COL.maxValue,
        utils.formatBytesText(rA.max_value_bytes),
      );
      await utils.expectRuleSemanticTag(page, rA.name, R.semanticOff, 'default');
      await utils.expectRuleSemanticTag(page, rB.name, R.semanticOn, 'success');
    });

    await test.step('查看抽屉 7 行与列表对应列完全相同', async () => {
      await utils.openViewRuleDrawer(page, rA.name);
      await utils.expectViewDrawerFieldLabels(page);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], rA.name);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[1], rA.cond);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[2],
        R.strategyLastQuestion,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[3],
        utils.formatTtlText(rA.cache_ttl),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[4],
        utils.formatBytesText(rA.max_body_bytes),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[5],
        utils.formatBytesText(rA.max_value_bytes),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[6],
        R.semanticOff,
      );
    });

    await test.step('只读时间戳在列表表头与抽屉信息行均不展示', async () => {
      await utils.expectRuleTableHeaders(page);
      const labels = await utils
        .viewDrawerScope(page)
        .locator('.info-label')
        .allInnerTexts();
      expect(labels).not.toContain('创建时间');
      expect(labels).not.toContain('更新时间');
    });

    await test.step('关闭后重新打开同一行「查看」，展示值保持一致', async () => {
      await utils.closeViewDrawer(page);
      await utils.openViewRuleDrawer(page, rA.name);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[0], rA.name);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[1],
        rA.cond,
      );
    });
  });

  test('AC-D-08 查看抽屉语义缓存只读行展示开启/关闭', async ({ page }) => {
    const rOn = mockRule({
      name: 'ac_d08_on_' + Date.now(),
      enable_semantic_cache: true,
    });
    const rOff = mockRule({
      name: 'ac_d08_off_' + Date.now(),
      enable_semantic_cache: undefined,
    });

    await test.step('前置：注入语义开启与关闭（缺失）规则各一条', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rOn, rOff] });
      await utils.gotoAiCachePageAndWaitForRules(page);
    });

    await test.step('打开语义开启规则：最后一行标签为「语义缓存」且值为「开启」', async () => {
      await utils.openViewRuleDrawer(page, rOn.name);
      const labels = await utils
        .viewDrawerScope(page)
        .locator('.info-label')
        .allInnerTexts();
      expect(labels).toHaveLength(7);
      expect(labels[labels.length - 1]).toBe(V.fieldLabels[6]);
      await utils.expectViewDrawerFieldValue(page, V.fieldLabels[6], R.semanticOn);
      await utils.closeViewDrawer(page);
    });

    await test.step('打开语义关闭（缺失）规则：值为「关闭」', async () => {
      await utils.openViewRuleDrawer(page, rOff.name);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[6],
        R.semanticOff,
      );
    });

    await test.step('该行展示值与列表「语义缓存」列一致', async () => {
      await utils.closeViewDrawer(page);
      await utils.expectRuleSemanticTag(page, rOn.name, R.semanticOn, 'success');
      await utils.expectRuleSemanticTag(
        page,
        rOff.name,
        R.semanticOff,
        'default',
      );
    });
  });

  test('AC-D-09 查看抽屉语义缓存 disabled 忽略后缀文案', async ({ page }) => {
    const rule = mockRule({
      name: 'ac_d09_' + Date.now(),
      cache_key_strategy: 'disabled',
      enable_semantic_cache: true,
    });

    await test.step('前置：注入 disabled 且语义开启规则并打开查看抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rule] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('「语义缓存」行展示「开启（策略为 disabled，忽略）」', async () => {
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[6],
        R.semanticOn + V.ignoreSuffix,
      );
    });

    await test.step('列表「语义缓存」列仅展示「开启」，不带忽略后缀', async () => {
      await utils.expectRuleSemanticTag(page, rule.name, R.semanticOn, 'success');
    });
  });

  test('AC-DEL-01 删除即从集合移除且不发变更请求', async ({ page }) => {
    const rA = mockRule({ name: 'ac_del01_a_' + Date.now() });
    const rB = mockRule({ name: 'ac_del01_b_' + Date.now() });
    const rC = mockRule({ name: 'ac_del01_c_' + Date.now() });
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：注入 3 条集合并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB, rC] });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('删除中间一条并在确认框点「确定」，提示「删除成功!」', async () => {
        await utils.clickRuleDelete(page, rB.name);
        await utils.expectDeleteConfirmModal(page);
        await utils.expectAiCacheMessageDuringAction(
          page,
          P.deleteSuccessMsg,
          () => utils.confirmDelete(page),
        );
      });

      await test.step('该行消失，其余行顺序不变', async () => {
        await utils.expectRuleRowHidden(page, rB.name);
        expect(await utils.getRuleRowCount(page)).toBe(2);
        await utils.expectRuleRowOrder(page, [rA.name, rC.name]);
      });

      await test.step('删除只在本地草稿生效，未发起 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-DEL-02 删除取消后规则保留、行数不变', async ({ page }) => {
    const rA = mockRule({ name: 'ac_del02_a_' + Date.now() });
    const rB = mockRule({ name: 'ac_del02_b_' + Date.now() });
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：注入 2 条集合并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('点击删除后在确认框点「取消」，提示「取消删除」', async () => {
        await utils.clickRuleDelete(page, rA.name);
        await utils.expectDeleteConfirmModal(page);
        await utils.expectAiCacheMessageDuringAction(
          page,
          P.cancelDeleteMsg,
          () => utils.cancelDelete(page),
        );
      });

      await test.step('规则保留、行数不变、顺序不变、未发起 PUT', async () => {
        await utils.expectRuleRowVisible(page, rA.name);
        expect(await utils.getRuleRowCount(page)).toBe(2);
        await utils.expectRuleRowOrder(page, [rA.name, rB.name]);
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-DEL-03 清空全部规则并提交空集合 {"rules":[]}', async ({ page }) => {
    const seed = mockRule({ name: 'ac_del03_' + Date.now() });

    await test.step('前置：确保集合非空并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureAiCacheRuleExistsViaApi(page, seed);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
    });

    await test.step('逐条删除全部规则，列表为空', async () => {
      await utils.deleteAllRules(page);
      await utils.expectRuleTableEmpty(page);
    });

    await test.step('点击「提交并生效」：PUT 请求体为 {"rules":[]} 且提示成功', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      expect(payload).toBeTruthy();
      expect(payload.rules).toEqual([]);
    });

    await test.step('提交后回到视图模式，列表为空且再次 GET 返回空集合', async () => {
      await utils.expectViewMode(page);
      await utils.expectRuleTableEmpty(page);
      const serverRules = await utils.getAiCacheRulesViaApi(page);
      expect(serverRules).toEqual([]);
    });
  });

  test('AC-DEL-04 提交成功后重新 GET 不含逐规则时间戳且列表一致', async ({
    page,
  }) => {
    const seedA = mockRule({ name: utils.generateTestRuleName('ac_del04_a_') });
    const seedB = mockRule({ name: utils.generateTestRuleName('ac_del04_b_') });

    await test.step('前置：确保至少 2 条规则并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureAiCacheRuleExistsViaApi(page, seedA);
      await utils.ensureAiCacheRuleExistsViaApi(page, seedB);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
    });

    let payload;
    await test.step('删除一条后提交并生效，捕获 PUT 请求体', async () => {
      await utils.clickRuleDelete(page, seedA.name);
      await utils.confirmDelete(page);
      await utils.expectRuleRowHidden(page, seedA.name);
      const [captured] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      payload = captured.payload;
    });

    await test.step('提交请求体本身不含 created_at / updated_at', async () => {
      await utils.expectRulesPayloadNoTimestamps(payload);
    });

    await test.step('提交成功后回到视图模式并重新 GET，响应不含逐规则时间戳', async () => {
      await utils.expectViewMode(page);
      const rules = await utils.getAiCacheRulesViaApi(page);
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.created_at).toBeUndefined();
        expect(rule.updated_at).toBeUndefined();
      }
      await utils.expectRuleRowOrder(
        page,
        rules.map((rule) => rule.name),
      );
    });

    await test.step('列表 / 查看展示与刷新后的接口数据一致', async () => {
      const rules = await utils.getAiCacheRulesViaApi(page);
      const first = rules[0];
      await utils.expectRuleCellText(page, first.name, COL.name, first.name);
      await utils.openViewRuleDrawer(page, first.name);
      await utils.expectViewDrawerFieldValue(
        page,
        V.fieldLabels[0],
        first.name,
      );
      await utils.closeViewDrawer(page);
    });
  });

  test('AC-DEL-05 删除后退出编辑模式回滚，服务器集合未被修改', async ({
    page,
  }) => {
    const seedA = mockRule({ name: utils.generateTestRuleName('ac_del05_a_') });
    const seedB = mockRule({ name: utils.generateTestRuleName('ac_del05_b_') });

    let namesBefore;
    await test.step('前置：确保至少 2 条规则并记录提交前集合', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureAiCacheRuleExistsViaApi(page, seedA);
      await utils.ensureAiCacheRuleExistsViaApi(page, seedB);
      await utils.reloadAiCachePage(page);
      namesBefore = await utils.getRuleNamesInOrder(page);
      expect(namesBefore).toContain(seedA.name);
      await utils.enterEditMode(page);
    });

    await test.step('删除一条规则', async () => {
      await utils.clickRuleDelete(page, seedA.name);
      await utils.confirmDelete(page);
      await utils.expectRuleRowHidden(page, seedA.name);
    });

    await test.step('退出编辑模式并确认，提示「已退出编辑模式」', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
      await utils.expectAiCacheMessageDuringAction(
        page,
        P.exitDoneMsg,
        () => utils.confirmExitEditMode(page),
      );
    });

    await test.step('回到视图模式，被删除规则恢复且顺序与进入前一致', async () => {
      await utils.expectViewMode(page);
      await utils.expectRuleRowVisible(page, seedA.name);
      expect(await utils.getRuleRowCount(page)).toBe(namesBefore.length);
      await utils.expectRuleRowOrder(page, namesBefore);
    });

    await test.step('未提交即未落库，服务器集合与进入前一致', async () => {
      const serverRules = await utils.getAiCacheRulesViaApi(page);
      expect(serverRules.map((rule) => rule.name)).toEqual(namesBefore);
    });
  });
});