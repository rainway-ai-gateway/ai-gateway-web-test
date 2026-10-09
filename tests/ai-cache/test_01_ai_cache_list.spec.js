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
 * AI 缓存规则 - 列表与双模式
 * 用例：AC-L-01 ~ AC-L-18
 *
 * 说明：列表渲染类用例（L-01/02/03/04/05/18）优先使用 mockRulesGetResponse
 * 注入受控集合，避免后端默认值干扰；退出确认类（L-09/10）经 UI 删除本地行制造
 * dirty；提交类（L-13）真实提交后由 cleanup 还原；失败类（L-06/14/15）经 mock。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');

const cleanup = utils.createAiCacheTestCleanup();
const P = utils.DOC_AI_CACHE_PAGE;
const R = utils.DOC_AI_CACHE_RULES;
const COL = R.columnIndex;

/** 构造一条具备指定字段的受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

test.describe('AI 缓存规则 - 列表与双模式', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AC-L-01 进入 AI 缓存规则页，页头、双 Tab 与 8 列表头完整，行数等于集合条数', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：进入 AI 缓存规则页（受控集合 2 条）', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
        await utils.gotoAiCachePageAndWaitForRules(page);
      });

      await test.step('验证页头标题文案', async () => {
        await utils.expectAiCachePageReady(page);
        await utils.expectPageHeaderTitle(page);
      });

      await test.step('验证双 Tab 可见且默认激活「缓存规则」', async () => {
        await utils.expectTabs(page);
        await utils.expectActiveTab(page, P.tabRules);
      });

      await test.step('验证缓存规则表头 8 列（规则名/表达式/缓存键策略/缓存 TTL/最大请求体/最大缓存值/语义缓存/操作）', async () => {
        await utils.expectRuleTableHeaders(page);
      });

      await test.step('验证行数等于集合条数，且「规则名」「表达式」列展示对应值', async () => {
        expect(await utils.getRuleRowCount(page)).toBe(2);
        await utils.expectRuleRowOrder(page, [rA.name, rB.name]);
        await utils.expectRuleCellText(page, rA.name, COL.name, rA.name);
        await utils.expectRuleCellContains(page, rA.name, COL.cond, rA.cond);
        await utils.expectRuleCellText(page, rB.name, COL.name, rB.name);
        await utils.expectRuleCellContains(page, rB.name, COL.cond, rB.cond);
      });

      await test.step('验证进入时调用了 GET /ai-cache-rules', async () => {
        expect(tracker.state.get).toBeGreaterThan(0);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-L-02 数组顺序即展示顺序，列表无优先级列且不重排', async ({ page }) => {
    const rFirst = mockRule({ name: 'ac_l02_zzz_' + Date.now() });
    const rSecond = mockRule({ name: 'ac_l02_aaa_' + Date.now() });
    const rThird = mockRule({ name: 'ac_l02_mmm_' + Date.now() });

    await test.step('前置：注入「非字典序」集合', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rFirst, rSecond, rThird],
      });
      await utils.gotoAiCachePageAndWaitForRules(page);
    });

    await test.step('页面行顺序与接口数组顺序完全一致（不按名称重排）', async () => {
      await utils.expectRuleRowOrder(page, [
        rFirst.name,
        rSecond.name,
        rThird.name,
      ]);
    });

    await test.step('列表不展示显式「优先级」列（顺序即优先级）', async () => {
      expect(R.tableHeaders).not.toContain('优先级');
      expect(R.tableHeaders.filter((h) => h.includes('优先级')).length).toBe(0);
    });
  });

  test('AC-L-03 缓存键策略列展示文案与标签颜色', async ({ page }) => {
    const rLast = mockRule({ cache_key_strategy: 'lastQuestion' });
    const rAll = mockRule({ cache_key_strategy: 'allQuestions' });
    const rDisabled = mockRule({ cache_key_strategy: 'disabled' });

    await test.step('前置：注入三种策略规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rLast, rAll, rDisabled],
      });
      await utils.gotoAiCachePageAndWaitForRules(page);
    });

    await test.step('lastQuestion / allQuestions 使用 primary 色标签', async () => {
      await utils.expectRuleStrategyTag(
        page,
        rLast.name,
        R.strategyLastQuestion,
        'primary',
      );
      await utils.expectRuleStrategyTag(
        page,
        rAll.name,
        R.strategyAllQuestions,
        'primary',
      );
    });

    await test.step('disabled 展示「缓存豁免（disabled）」并使用 warning 色标签', async () => {
      await utils.expectRuleStrategyTag(
        page,
        rDisabled.name,
        R.strategyDisabled,
        'warning',
      );
    });
  });

  test('AC-L-04 缓存 TTL 与字节列格式化（0→不过期，空值→-）', async ({ page }) => {
    const rNever = mockRule({
      cache_ttl: 0,
      max_body_bytes: 1048576,
      max_value_bytes: 1048576,
    });
    const rSeconds = mockRule({
      cache_ttl: 3600,
      max_body_bytes: 524288,
      max_value_bytes: 524288,
    });
    const rNull = mockRule({
      cache_ttl: null,
      max_body_bytes: null,
      max_value_bytes: null,
    });

    await test.step('前置：注入 TTL 0 / 3600 / null 三类规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [rNever, rSeconds, rNull],
      });
      await utils.gotoAiCachePageAndWaitForRules(page);
    });

    await test.step('缓存 TTL：0→「不过期（0）」，3600→「3600 秒」', async () => {
      await utils.expectRuleCellText(
        page,
        rNever.name,
        COL.ttl,
        utils.formatTtlText(0),
      );
      await utils.expectRuleCellText(
        page,
        rSeconds.name,
        COL.ttl,
        utils.formatTtlText(3600),
      );
    });

    await test.step('缓存 TTL 空值展示占位符「-」', async () => {
      await utils.expectRuleCellText(
        page,
        rNull.name,
        COL.ttl,
        utils.formatTtlText(null),
      );
    });

    await test.step('最大请求体 / 最大缓存值按「{value} B」展示，空值→「-」', async () => {
      await utils.expectRuleCellText(
        page,
        rNever.name,
        COL.maxBody,
        utils.formatBytesText(1048576),
      );
      await utils.expectRuleCellText(
        page,
        rSeconds.name,
        COL.maxValue,
        utils.formatBytesText(524288),
      );
      await utils.expectRuleCellText(
        page,
        rNull.name,
        COL.maxBody,
        utils.formatBytesText(null),
      );
      await utils.expectRuleCellText(
        page,
        rNull.name,
        COL.maxValue,
        utils.formatBytesText(null),
      );
    });
  });

  test('AC-L-05 列表搜索（客户端过滤）与清空恢复', async ({ page }) => {
    const keyword = 'acl05kw';
    const rHit = mockRule({ name: keyword + '_hit_' + Date.now() });
    const rMiss = mockRule({ name: 'zzz_other_' + Date.now() });

    await test.step('前置：注入可区分名称的规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rHit, rMiss] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      expect(await utils.getRuleRowCount(page)).toBe(2);
    });

    await test.step('输入关键字后列表仅保留匹配行', async () => {
      await utils.searchRules(page, keyword);
      await utils.expectRuleRowVisible(page, rHit.name);
      await utils.expectRuleRowHidden(page, rMiss.name);
      expect(await utils.getRuleRowCount(page)).toBe(1);
    });

    await test.step('无匹配时表格展示空数据状态', async () => {
      await utils.searchRules(page, 'no_such_keyword_xyz');
      await utils.expectRuleTableEmpty(page);
    });

    await test.step('清空关键字后列表恢复全量展示', async () => {
      await utils.clearRulesSearch(page);
      await utils.expectRuleRowVisible(page, rHit.name);
      await utils.expectRuleRowVisible(page, rMiss.name);
      expect(await utils.getRuleRowCount(page)).toBe(2);
    });
  });

  test('AC-L-06 列表加载失败提示且不渲染脏数据', async ({ page }) => {
    await test.step('前置：拦截 GET /ai-cache-rules 返回错误', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { status: 500, errMsg: 'mock 500' });
      await utils.reloadAiCachePageExpectMessage(page, P.loadFailedMsg);
    });

    await test.step('页面给出「加载 AI 缓存规则失败」提示，表格为空', async () => {
      await utils.expectAiCachePageReady(page);
      await utils.expectRuleTableEmpty(page);
    });

    await test.step('页面仍可继续操作（视图模式头部正常）', async () => {
      await utils.expectViewMode(page);
    });

    await utils.unmockAiCacheNetwork(page);
  });

  test('AC-L-07 从视图模式进入编辑模式（出现添加/提交，行操作变为编辑与删除）', async ({
    page,
  }) => {
    const rA = mockRule();

    await test.step('前置：注入规则并确认视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectViewMode(page);
      await utils.expectRuleRowOnlyViewAction(page, rA.name);
    });

    await test.step('点击「进入编辑模式」后出现「添加规则」「提交并生效」', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('行操作列由「查看」变为「编辑/删除」', async () => {
      await utils.expectRuleRowEditDeleteActions(page, rA.name);
    });
  });

  test('AC-L-08 无改动时退出编辑模式无二次确认，直接回视图且数据不变', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();

    await test.step('前置：进入编辑模式且不做改动', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiCachePageAndWaitForRules(page);
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
      await utils.expectRuleRowOrder(page, [rA.name, rB.name]);
      await utils.expectRuleRowOnlyViewAction(page, rA.name);
    });
  });

  test('AC-L-09 有未提交改动时退出弹确认，确定后回滚快照并重新拉取集合', async ({
    page,
  }) => {
    const rA = mockRule();
    const rB = mockRule();
    const rC = mockRule({ name: 'ac_l09_del_' + Date.now() });
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式并删除一行制造未提交改动', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rA, rB, rC] });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.clickRuleDelete(page, rC.name);
        await utils.confirmDelete(page);
        await utils.expectRuleRowHidden(page, rC.name);
      });

      await test.step('点击「退出编辑模式」弹出二次确认框', async () => {
        await utils.clickExitEditMode(page);
        await utils.expectExitConfirmModal(page);
      });

      await test.step('点击「确定」后改动被丢弃，重新 GET 并提示「已退出编辑模式」', async () => {
        const beforeGet = tracker.state.get;
        await utils.expectAiCacheMessageDuringAction(page, P.exitDoneMsg, () =>
          utils.confirmExitEditMode(page),
        );
        expect(tracker.state.get).toBeGreaterThan(beforeGet);
      });

      await test.step('页面回到视图模式且被删规则已回滚', async () => {
        await utils.expectViewMode(page);
        await utils.expectRuleRowVisible(page, rC.name);
        await utils.expectRuleRowOrder(page, [rA.name, rB.name, rC.name]);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-L-10 有未提交改动时退出点「取消」，停留编辑且改动保留', async ({
    page,
  }) => {
    const rA = mockRule();
    const rC = mockRule({ name: 'ac_l10_del_' + Date.now() });

    await test.step('前置：进入编辑模式并删除一行制造未提交改动', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rC] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.clickRuleDelete(page, rC.name);
      await utils.confirmDelete(page);
      await utils.expectRuleRowHidden(page, rC.name);
    });

    await test.step('点击「退出编辑模式」后取消，停留在编辑模式并提示「已取消退出」', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
      await utils.expectAiCacheMessageDuringAction(page, P.exitCancelledMsg, () =>
        utils.cancelExitEditMode(page),
      );
      await utils.expectEditMode(page);
    });

    await test.step('未提交的改动保留在本地集合', async () => {
      await utils.expectRuleRowHidden(page, rC.name);
      await utils.expectRuleRowEditDeleteActions(page, rA.name);
    });
  });

  test('AC-L-11 视图模式行操作仅展示「查看」并打开只读抽屉', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：注入规则并保持视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('每行操作列仅「查看」，不含「编辑」「删除」', async () => {
      await utils.expectRuleRowOnlyViewAction(page, rA.name);
    });

    await test.step('点击「查看」打开只读查看抽屉', async () => {
      await utils.openViewRuleDrawer(page, rA.name);
      await utils.expectViewDrawerNoInputs(page);
      await utils.closeViewDrawer(page);
    });
  });

  test('AC-L-12 编辑模式行操作展示「编辑」与「删除」', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('每行操作列展示「编辑」与「删除」两个按钮', async () => {
      await utils.expectRuleRowEditDeleteActions(page, rA.name);
    });

    await test.step('点击「编辑」打开编辑抽屉', async () => {
      await utils.openEditRuleDrawer(page, rA.name);
      await utils.closeRuleFormDrawer(page);
    });

    await test.step('点击「删除」触发删除确认框（取消后行仍在）', async () => {
      await utils.clickRuleDelete(page, rA.name);
      await utils.expectDeleteConfirmModal(page);
      await utils.cancelDelete(page);
      await utils.expectRuleRowVisible(page, rA.name);
    });
  });

  test('AC-L-13 提交并生效：PUT 整体替换、顺序即优先级、无时间戳并回视图刷新', async ({
    page,
  }) => {
    const newName = utils.generateTestRuleName('ac_l13_');
    const condText = 'req_path_in("/v1/chat/completions", false)';

    await test.step('前置：备份原始集合后进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('本地新增一条规则（置顶）', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, newName);
      await utils.fillRuleCond(page, condText);
      await utils.submitRuleFormExpectMessage(page, utils.DOC_AI_CACHE_RULE_FORM.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, newName);
    });

    await test.step('提交并生效：捕获 PUT 请求体并提示「提交并生效成功！」', async () => {
      const expectedNames = await utils.getRuleNamesInOrder(page);
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectRulesPayloadOrder(payload, expectedNames);
      await utils.expectRulesPayloadNoTimestamps(payload);
      expect(expectedNames[0]).toBe(newName);
    });

    await test.step('提交成功后回到视图模式并重新拉取列表', async () => {
      await utils.expectViewMode(page);
      await utils.expectRuleRowVisible(page, newName);
      await utils.expectRuleRowOnlyViewAction(page, newName);
    });
  });

  test('AC-L-14 提交失败提示「提交失败!」并停留编辑模式', async ({ page }) => {
    const name = utils.generateTestRuleName('ac_l14_');
    const condText = 'req_path_in("/v1/chat/completions", false)';

    await test.step('前置：拦截 PUT 失败并进入编辑模式新增一条规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesPutFailure(page, { status: 500, errMsg: 'mock put 500' });
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, name);
      await utils.fillRuleCond(page, condText);
      await utils.submitRuleFormExpectMessage(page, utils.DOC_AI_CACHE_RULE_FORM.addSuccessMsg);
    });

    await test.step('提交提示「提交失败!」且停留在编辑模式（改动不丢失）', async () => {
      await utils.expectAiCacheMessageDuringAction(page, P.submitFailedMsg, () =>
        utils.clickSubmitAndEffect(page),
      );
      await utils.expectEditMode(page);
      await utils.expectRuleRowVisible(page, name);
    });

    await utils.unmockAiCacheNetwork(page);
  });

  test('AC-L-15 提交前集合内名称查重：命中重复时拦截且不发 PUT', async ({ page }) => {
    const dupName = 'ac_l15_dup_' + Date.now();
    const rDup1 = mockRule({ name: dupName });
    const rDup2 = mockRule({ name: dupName });
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：注入含同名规则的集合并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [rDup1, rDup2] });
        await utils.reloadAiCachePage(page);
        await utils.enterEditMode(page);
        await utils.expectEditMode(page);
      });

      await test.step('提交被拦截，提示「规则名称已存在，集合内必须唯一」', async () => {
        await utils.expectAiCacheMessageDuringAction(
          page,
          utils.DOC_AI_CACHE_RULE_FORM.nameDuplicateMsg,
          () => utils.clickSubmitAndEffect(page),
        );
      });

      await test.step('不发送 PUT /ai-cache-rules 且停留编辑模式', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
        await utils.expectEditMode(page);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-L-16「提交并生效」按钮右上角绝对定位，视图模式不展示', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：注入规则并确认视图模式不展示提交按钮', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('编辑模式下提交按钮位于头部右上角（position:absolute; right:0px）', async () => {
      await utils.enterEditMode(page);
      await utils.expectRuleHeaderSubmitPosition(page);
    });
  });

  test('AC-L-17 缓存规则与语义设置 Tab 切换及编辑态相互独立', async ({ page }) => {
    const rA = mockRule();

    await test.step('前置：进入页面，默认激活「缓存规则」', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectTabs(page);
      await utils.expectActiveTab(page, P.tabRules);
    });

    await test.step('规则 Tab 视图态右上角仅「进入编辑模式」，编辑态为「退出编辑模式」+「提交并生效」', async () => {
      await utils.expectViewMode(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('语义设置 Tab 页头副标题/卡片标题正确，查看态右上角仅「编辑」', async () => {
      await utils.switchToSemanticTab(page);
      await utils.expectSemanticHeaderSubtitle(page);
      await utils.expectSemanticCardTitle(page);
      await utils.expectSemanticViewMode(page);
    });

    await test.step('语义设置编辑态右上角为「取消」+「保存」', async () => {
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    await test.step('两 Tab 编辑态相互独立，切换不互相重置', async () => {
      await utils.switchToRulesTab(page);
      await utils.expectEditMode(page);
      await utils.switchToSemanticTab(page);
      await utils.expectSemanticEditMode(page);
    });
  });

  test('AC-L-18 列表语义缓存列（第 7 列）Tag 文案与颜色', async ({ page }) => {
    const rOn = mockRule({ enable_semantic_cache: true });
    const rOff = mockRule({ enable_semantic_cache: false });
    const rMissing = mockRule();
    delete rMissing.enable_semantic_cache;

    await test.step('前置：注入开启 / 关闭 / 缺失三种语义缓存规则', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rOn, rOff, rMissing] });
      await utils.gotoAiCachePageAndWaitForRules(page);
    });

    await test.step('第 7 列为「语义缓存」，位于「最大缓存值」与「操作」之间', async () => {
      expect(R.tableHeaders[5]).toBe('最大缓存值');
      expect(R.tableHeaders[6]).toBe('语义缓存');
      expect(R.tableHeaders[7]).toBe('操作');
    });

    await test.step('开启→success 色「开启」；关闭/缺失→default 色「关闭」', async () => {
      await utils.expectRuleSemanticTag(page, rOn.name, R.semanticOn, 'success');
      await utils.expectRuleSemanticTag(page, rOff.name, R.semanticOff, 'default');
      await utils.expectRuleSemanticTag(
        page,
        rMissing.name,
        R.semanticOff,
        'default',
      );
    });
  });
});