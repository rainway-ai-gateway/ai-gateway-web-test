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
 * AI 缓存规则 - 新增与编辑
 * 用例：AC-C-01 ~ AC-C-17
 *
 * 说明：
 * - 表单默认值 / 回显 / 重置 / 查重等纯前端行为用 mockRulesGetResponse 注入受控集合；
 * - 需校验「提交并生效」请求体（缓存键策略 / 缓存 TTL / 字节上限 / 语义缓存开关）的用例
 *   走真实 PUT，前置 saveOriginalState 备份、afterEach cleanup 还原；
 * - 「本地保存 / 删除」只改本地草稿，用 trackAiCacheRuleRequests 断言不发 PUT。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');

const cleanup = utils.createAiCacheTestCleanup();
const P = utils.DOC_AI_CACHE_PAGE;
const R = utils.DOC_AI_CACHE_RULES;
const F = utils.DOC_AI_CACHE_RULE_FORM;
const COL = R.columnIndex;

/** 构造一条受控 mock 规则 */
function mockRule(overrides) {
  return utils.buildTestRule(overrides);
}

/** 从 PUT 请求体中按规则名取出对应规则对象 */
function payloadRule(payload, name) {
  const rules = payload && payload.rules ? payload.rules : [];
  return rules.find((r) => r.name === name);
}

test.describe('AI 缓存规则 - 新增与编辑', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AC-C-01 新增抽屉标题、字段默认值与底部按钮', async ({ page }) => {
    await test.step('前置：进入编辑模式并打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('规则名占位文案正确且初始为空', async () => {
      const input = utils
        .ruleFormScope(page)
        .getByPlaceholder(F.ruleNamePlaceholder);
      await expect(input).toHaveCount(1);
      await expect(input).toHaveValue('');
    });

    await test.step('各字段初始值为默认值（策略 lastQuestion / TTL 0 / 字节 1048576 / 语义缓存关闭）', async () => {
      await utils.expectRuleFormDefaultValues(page);
    });

    await test.step('底部提供「本地保存」与「重置」', async () => {
      const scope = utils.ruleFormScope(page);
      await expect(
        scope.getByRole('button', { name: F.localSaveButton, exact: true }),
      ).toBeVisible();
      await expect(
        scope.getByRole('button', { name: F.resetButton, exact: true }),
      ).toBeVisible();
    });
  });

  test('AC-C-02 新增规则本地保存成功入集合且不发变更请求', async ({ page }) => {
    const existing = mockRule({ name: 'ac_c02_existing_' + Date.now() });
    const newName = utils.generateTestRuleName('ac_c02_');
    const condText = 'req_path_in("/v1/chat/completions", false)';
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：注入已有集合并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [existing] });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('新增规则并「本地保存」提示「添加成功！」', async () => {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, newName);
        await utils.fillRuleCond(page, condText);
        await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
      });

      await test.step('列表出现新行，规则名与表达式列展示对应值', async () => {
        await utils.expectRuleRowVisible(page, newName);
        await utils.expectRuleCellText(page, newName, COL.name, newName);
        await utils.expectRuleCellContains(page, newName, COL.cond, condText);
      });

      await test.step('「本地保存」未发起 ai-cache-rules 变更请求(PUT)', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-C-03 缓存键策略选择「全部问题（allQuestions）」并提交该值', async ({
    page,
  }) => {
    const name = utils.generateTestRuleName('ac_c03_');
    const condText = 'default_t()';

    await test.step('前置：备份原始集合后进入编辑模式新增规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.selectRuleFormStrategy(page, R.strategyAllQuestions);
      await utils.expectRuleFormStrategy(page, R.strategyAllQuestions);
      await utils.fillRuleName(page, name);
      await utils.fillRuleCond(page, condText);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('列表「缓存键策略」列展示「全部问题（allQuestions）」primary 色标签', async () => {
      await utils.expectRuleStrategyTag(
        page,
        name,
        R.strategyAllQuestions,
        'primary',
      );
    });

    await test.step('提交并生效：请求体中该规则策略为 allQuestions', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      const rule = payloadRule(payload, name);
      expect(rule).toBeTruthy();
      expect(rule.cache_key_strategy).toBe('allQuestions');
    });
  });

  test('AC-C-04 缓存键策略选择「缓存豁免（disabled）」展示提示与 warning 标签', async ({
    page,
  }) => {
    const name = utils.generateTestRuleName('ac_c04_');
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：进入编辑模式并打开新增抽屉', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [] });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.openAddRuleDrawer(page);
      });

      await test.step('选择「缓存豁免（disabled）」展示黄色提示文案', async () => {
        await utils.selectRuleFormStrategy(page, R.strategyDisabled);
        await utils.expectRuleFormStrategy(page, R.strategyDisabled);
        await utils.expectRuleFormStrategyHint(page, true);
      });

      await test.step('本地保存后列表策略标签为「缓存豁免（disabled）」warning 色', async () => {
        await utils.fillRuleName(page, name);
        await utils.fillRuleCond(page, 'default_t()');
        await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
        await utils.expectRuleStrategyTag(
          page,
          name,
          R.strategyDisabled,
          'warning',
        );
      });

      await test.step('「本地保存」不发 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-C-05 点击「编辑」回显该规则全部字段', async ({ page }) => {
    const r = mockRule({
      name: 'ac_c05_' + Date.now(),
      cond: 'default_t()',
      cache_key_strategy: 'allQuestions',
      cache_ttl: 600,
      max_body_bytes: 2097152,
      max_value_bytes: 524288,
      enable_semantic_cache: true,
    });

    await test.step('前置：注入字段完整规则并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [r] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('打开编辑抽屉（标题为「编辑缓存规则」）', async () => {
      await utils.openEditRuleDrawer(page, r.name);
    });

    await test.step('七个字段回显为该规则当前值', async () => {
      const scope = utils.ruleFormScope(page);
      await expect(scope.getByPlaceholder(F.ruleNamePlaceholder)).toHaveValue(
        r.name,
      );
      await expect(
        scope.locator('textarea.expression, .expression textarea').first(),
      ).toHaveValue(r.cond);
      await utils.expectRuleFormStrategy(page, R.strategyAllQuestions);
      await utils.expectRuleFormNumber(page, F.ttlFieldLabel, r.cache_ttl);
      await utils.expectRuleFormNumber(
        page,
        F.maxBodyFieldLabel,
        r.max_body_bytes,
      );
      await utils.expectRuleFormNumber(
        page,
        F.maxValueFieldLabel,
        r.max_value_bytes,
      );
      await utils.expectRuleFormSwitch(page, true);
    });

    await test.step('底部提供「本地保存」与「重置」', async () => {
      const scope = utils.ruleFormScope(page);
      await expect(
        scope.getByRole('button', { name: F.localSaveButton, exact: true }),
      ).toBeVisible();
      await expect(
        scope.getByRole('button', { name: F.resetButton, exact: true }),
      ).toBeVisible();
    });
  });

  test('AC-C-06 编辑规则「本地保存」更新本地集合且不发变更请求', async ({
    page,
  }) => {
    const r = mockRule({
      name: 'ac_c06_' + Date.now(),
      cond: 'default_t()',
      cache_ttl: 3600,
    });
    const newCond = 'req_path_in("/v1/chat/completions", false)';
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：注入规则并进入编辑模式打开编辑抽屉', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, { rules: [r] });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.openEditRuleDrawer(page, r.name);
      });

      await test.step('修改「缓存 TTL」为 600、表达式为新值并「本地保存」提示「保存成功！」', async () => {
        await utils.fillRuleFormNumber(page, F.ttlFieldLabel, 600);
        await utils.fillRuleCond(page, newCond);
        await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
      });

      await test.step('列表对应行刷新为新值（TTL 展示「600 秒」），行数不变', async () => {
        expect(await utils.getRuleRowCount(page)).toBe(1);
        await utils.expectRuleCellText(
          page,
          r.name,
          COL.ttl,
          utils.formatTtlText(600),
        );
        await utils.expectRuleCellContains(page, r.name, COL.cond, newCond);
      });

      await test.step('「本地保存」不发 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-C-07 新增规则置顶且其余规则相对顺序不变', async ({ page }) => {
    const rFirst = mockRule({ name: 'ac_c07_a_' + Date.now() });
    const rSecond = mockRule({ name: 'ac_c07_b_' + Date.now() });
    const newName = utils.generateTestRuleName('ac_c07_new_');

    await test.step('前置：注入 2 条规则并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rFirst, rSecond] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('记录原首行并新增一条规则「本地保存」', async () => {
      await utils.expectRuleRowOrder(page, [rFirst.name, rSecond.name]);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, newName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('新规则置顶，其余相对顺序不变', async () => {
      await utils.expectRuleRowOrder(page, [
        newName,
        rFirst.name,
        rSecond.name,
      ]);
    });
  });

  test('AC-C-08 表单「重置」恢复默认值且抽屉不关闭、集合不受影响', async ({
    page,
  }) => {
    const rA = mockRule({ name: 'ac_c08_a_' + Date.now() });
    const rB = mockRule({ name: 'ac_c08_b_' + Date.now() });
    const tmpName = utils.generateTestRuleName('ac_c08_tmp_');

    await test.step('前置：注入 2 条规则并打开新增抽屉填写部分字段', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [rA, rB] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, tmpName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.selectRuleFormStrategy(page, R.strategyAllQuestions);
      await utils.expectRuleFormStrategy(page, R.strategyAllQuestions);
    });

    await test.step('点击「重置」后字段恢复默认值且抽屉不关闭', async () => {
      await utils.clickRuleFormReset(page);
      await utils.expectRuleFormDefaultValues(page);
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('集合数据不受影响（行数不变、无新增行）', async () => {
      expect(await utils.getRuleRowCount(page)).toBe(2);
      await utils.expectRuleRowHidden(page, tmpName);
    });
  });

  test('AC-C-09 新增时名称查重命中，提示重复且抽屉不关闭', async ({ page }) => {
    const dupName = 'ac_c09_dup_' + Date.now();
    const existing = mockRule({ name: dupName });

    await test.step('前置：注入含同名规则的集合并打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [existing] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('规则名填写为已存在名称并「本地保存」提示「规则名称已存在，集合内必须唯一」', async () => {
      await utils.fillRuleName(page, dupName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.submitRuleFormExpectMessage(page, F.nameDuplicateMsg);
    });

    await test.step('抽屉不关闭且集合不新增行', async () => {
      await utils.expectRuleFormDrawerStillOpen(page);
      expect(await utils.getRuleRowCount(page)).toBe(1);
    });
  });

  test('AC-C-10 编辑时名称查重排除自身，保存成功且不新增重复行', async ({
    page,
  }) => {
    const name = 'ac_c10_' + Date.now();
    const r = mockRule({ name, cache_ttl: 3600 });

    await test.step('前置：注入单条规则并打开编辑抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [r] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openEditRuleDrawer(page, name);
    });

    await test.step('保持规则名不变，仅改「缓存 TTL」并「本地保存」提示「保存成功！」', async () => {
      await utils.fillRuleFormNumber(page, F.ttlFieldLabel, 900);
      await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('按修改后的值更新该行，不新增重复行', async () => {
      expect(await utils.getRuleRowCount(page)).toBe(1);
      await utils.expectRuleRowOrder(page, [name]);
      await utils.expectRuleCellText(
        page,
        name,
        COL.ttl,
        utils.formatTtlText(900),
      );
    });
  });

  test('AC-C-11 删除规则行：确认后本地移除、其余顺序不变且不发变更请求', async ({
    page,
  }) => {
    const rA = mockRule({ name: 'ac_c11_a_' + Date.now() });
    const rMid = mockRule({ name: 'ac_c11_mid_' + Date.now() });
    const rC = mockRule({ name: 'ac_c11_c_' + Date.now() });
    const tracker = utils.trackAiCacheRuleRequests(page);

    try {
      await test.step('前置：注入 3 条规则并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await utils.mockRulesGetResponse(page, {
          rules: [rA, rMid, rC],
        });
        await utils.gotoAiCachePageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('点击删除弹出确认框（文案正确）', async () => {
        await utils.clickRuleDelete(page, rMid.name);
        await utils.expectDeleteConfirmModal(page);
      });

      await test.step('确认删除提示「删除成功!」，该行移除且其余顺序不变', async () => {
        await utils.expectAiCacheMessageDuringAction(
          page,
          P.deleteSuccessMsg,
          () => utils.confirmDelete(page),
        );
        await utils.expectRuleRowHidden(page, rMid.name);
        await utils.expectRuleRowOrder(page, [rA.name, rC.name]);
      });

      await test.step('仅本地草稿变化，不发起 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-C-12 缓存 TTL 为 0 表示不过期，校验通过并以 0 提交', async ({
    page,
  }) => {
    const name = utils.generateTestRuleName('ac_c12_');

    await test.step('前置：备份原始集合后进入编辑模式新增规则（TTL 默认 0）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, name);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.expectRuleFormNumber(page, F.ttlFieldLabel, 0);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('列表缓存 TTL 列展示「不过期（0）」', async () => {
      await utils.expectRuleCellText(
        page,
        name,
        COL.ttl,
        utils.formatTtlText(0),
      );
    });

    await test.step('提交并生效：请求体中该规则缓存 TTL 为 0', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      const rule = payloadRule(payload, name);
      expect(rule).toBeTruthy();
      expect(rule.cache_ttl).toBe(0);
    });
  });

  test('AC-C-13 提交请求体剔除只读字段 created_at / updated_at', async ({
    page,
  }) => {
    const seed = utils.buildTestRule({ name: utils.generateTestRuleName('ac_c13_') });

    await test.step('前置：备份原始集合并确保后端存在一条带时间戳的规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureAiCacheRuleExistsViaApi(page, seed);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
    });

    await test.step('提交并生效，捕获 PUT 请求体', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);

      await utils.expectRulesPayloadNoTimestamps(payload);
      expect(payload.rules.length).toBeGreaterThan(0);
      const rule = payloadRule(payload, seed.name);
      expect(rule).toBeTruthy();
      // 业务字段正常提交
      expect(rule.cond).toBeTruthy();
      expect(rule.cache_key_strategy).toBeTruthy();
    });
  });

  test('AC-C-14 关闭抽屉不保存：填写内容不入集合，再次打开为默认值', async ({
    page,
  }) => {
    const tmpName = utils.generateTestRuleName('ac_c14_');

    await test.step('前置：注入空集合并打开新增抽屉填写字段', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, tmpName);
      await utils.fillRuleCond(page, 'default_t()');
    });

    await test.step('点击关闭图标退出抽屉，填写内容不入集合', async () => {
      await utils.closeRuleFormDrawer(page);
      await utils.expectRuleRowHidden(page, tmpName);
      expect(await utils.getRuleRowCount(page)).toBe(0);
    });

    await test.step('再次打开新增抽屉字段为默认值', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.expectRuleFormDefaultValues(page);
    });
  });

  test('AC-C-15 最大请求体 / 最大缓存值上限保存并提交对应值', async ({ page }) => {
    const name = utils.generateTestRuleName('ac_c15_');
    const maxBody = 2097152;
    const maxValue = 524288;

    await test.step('前置：备份原始集合后进入编辑模式新增规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, name);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.fillRuleFormNumber(page, F.maxBodyFieldLabel, maxBody);
      await utils.fillRuleFormNumber(page, F.maxValueFieldLabel, maxValue);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('列表字节列分别展示 2097152 B / 524288 B', async () => {
      await utils.expectRuleCellText(
        page,
        name,
        COL.maxBody,
        utils.formatBytesText(maxBody),
      );
      await utils.expectRuleCellText(
        page,
        name,
        COL.maxValue,
        utils.formatBytesText(maxValue),
      );
    });

    await test.step('提交并生效：请求体中两个字节字段为设定值', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      const rule = payloadRule(payload, name);
      expect(rule).toBeTruthy();
      expect(rule.max_body_bytes).toBe(maxBody);
      expect(rule.max_value_bytes).toBe(maxValue);
    });
  });

  test('AC-C-16 语义缓存 Switch 默认关闭、打开后保存并提交为开启', async ({
    page,
  }) => {
    const onName = utils.generateTestRuleName('ac_c16_on_');
    const offName = utils.generateTestRuleName('ac_c16_off_');

    await test.step('前置：备份原始集合后进入编辑模式新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('语义缓存项以 Switch 渲染，初始关闭并展示提示文案', async () => {
      await utils.expectRuleFormSwitch(page, false);
      await utils.expectRuleFormSemanticHint(page);
    });

    await test.step('打开 Switch 后新增规则（语义缓存开启）', async () => {
      await utils.toggleRuleFormSwitch(page);
      await utils.expectRuleFormSwitch(page, true);
      await utils.fillRuleName(page, onName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleSemanticTag(page, onName, R.semanticOn, 'success');
    });

    await test.step('未打开 Switch 的新增规则默认语义缓存关闭', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.expectRuleFormSwitch(page, false);
      await utils.fillRuleName(page, offName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleSemanticTag(page, offName, R.semanticOff, 'default');
    });

    await test.step('提交并生效：请求体中开启/默认规则语义缓存布尔值正确', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      expect(payloadRule(payload, onName).enable_semantic_cache).toBe(true);
      expect(payloadRule(payload, offName).enable_semantic_cache).toBe(false);
    });
  });

  test('AC-C-17 编辑语义缓存 Switch 回显、重置恢复并提交关闭', async ({ page }) => {
    const name = utils.generateTestRuleName('ac_c17_');
    const seed = utils.buildTestRule({ name, enable_semantic_cache: true });

    await test.step('前置：备份原始集合，确保后端存在语义缓存开启的规则后进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureAiCacheRuleExistsViaApi(page, seed);
      await utils.reloadAiCachePage(page);
      await utils.enterEditMode(page);
      await utils.openEditRuleDrawer(page, name);
    });

    await test.step('Switch 回显为该规则当前值（开启）', async () => {
      await utils.expectRuleFormSwitch(page, true);
    });

    await test.step('关闭 Switch 后「重置」恢复为回显值（开启）', async () => {
      await utils.toggleRuleFormSwitch(page);
      await utils.expectRuleFormSwitch(page, false);
      await utils.clickRuleFormReset(page);
      await utils.expectRuleFormSwitch(page, true);
    });

    await test.step('再次关闭并「本地保存」，列表语义缓存列变为 default 色「关闭」', async () => {
      await utils.toggleRuleFormSwitch(page);
      await utils.expectRuleFormSwitch(page, false);
      await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleSemanticTag(page, name, R.semanticOff, 'default');
    });

    await test.step('提交并生效：请求体中该规则语义缓存为关闭', async () => {
      const [{ payload }] = await Promise.all([
        utils.submitRulesAndCapture(page),
        utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
      ]);
      await utils.expectViewMode(page);
      expect(payloadRule(payload, name).enable_semantic_cache).toBe(false);
    });
  });
});