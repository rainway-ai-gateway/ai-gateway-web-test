/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');
const layout = require('../../utils/layout');

const R = utils.DOC_AI_CACHE_RULES;
const F = utils.DOC_AI_CACHE_RULE_FORM;
const VALID_COND = 'default_t()';

/**
 * AI 缓存规则 - 布局与最大长度（AC-LAY-01）
 *
 * 背景（docs/覆盖缺口清单.md §27）：项目无视觉回归测试。本文件用 DOM 指标断言
 * （utils/layout.js）覆盖规则名满载（128 字符）时规则表格的行布局：
 * 表格不横向溢出、规则名单元格行数封顶（≤3 行或 ellipsis 截断）。
 *
 * 造数：mock 空集合 → 编辑模式 → 本地保存一条 128 字符规则名（不写后端）。
 * afterEach 经 createAiCacheTestCleanup 清理（兜底：接口重置为空规则集）。
 *
 * 修复记录（2026-11-02）：iView 表格单元格长文本列未配 ellipsis，128 字符规则名曾
 * 折行约 10 行（scrollHeight ~209px）。已修复：规则名列 `ellipsis: true` + render
 * span `.cell-ellipsis` + title 裁剪（与 EM-LAY-02 / PR-LAY-01 / RT-LAY-01 /
 * TM-LAY-01 同批修复）。
 *
 * 验收依据：docs/ai-cache/02-功能测试用例/08-布局与最大长度.md
 */
test.describe('AI缓存规则 - AC-LAY-01 规则名满载行布局', () => {
  const cleanup = utils.createAiCacheTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('规则名 128 字符：表格不横向溢出且规则名单元格行数封顶', async ({
    page,
  }) => {
    const name128 = 'a'.repeat(128);

    await test.step('前置：mock 空集合，编辑模式本地保存 128 字符规则名', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, name128);
      await utils.fillRuleCond(page, VALID_COND);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, name128);
    });

    await test.step('1. 规则表格无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        utils.ruleTable(page).rootLocator(),
        'AI 缓存规则表格',
      );
    });

    await test.step('2. 规则名单元格行数 ≤3 行（或 ellipsis 截断）', async () => {
      await layout.expectCellLineCap(
        utils.getRuleCell(page, name128, R.columnIndex.name).locator('.ivu-table-cell'),
        3,
        `AI 缓存规则「${name128.slice(0, 16)}…」名称单元格`,
      );
    });

    await test.step('3. 行高不因 128 字符失控（≤ 单行基线 3 倍）', async () => {
      const row = utils.getRuleRow(page, name128);
      const m = await layout.readLayoutMetrics(row);
      // 参照：数据行单行高约 41~47px（iView 默认行高 + 边框）
      expect(
        m.height,
        `规则行高度 ${m.height}px 超过 3 倍单行基线`,
      ).toBeLessThanOrEqual(47 * 3);
    });
  });

  test('AC-LAY-02 超长规则名的校验错误提示单行展示且不遮挡下方字段', async ({
    page,
  }) => {
    const name129 = 'a'.repeat(129);

    await test.step('前置：mock 空集合，编辑模式打开添加规则抽屉', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('1. 输入 129 字符规则名触发长度校验', async () => {
      await utils.fillRuleName(page, name129);
      await utils.submitRuleFormAndWait(page);
      const tip = utils
        .ruleFormScope(page)
        .locator('.ivu-form-item-error-tip')
        .filter({ hasText: F.nameLengthMsg });
      await expect(tip).toBeVisible({ timeout: 10000 });
    });

    await test.step('2. 错误提示单行且不遮挡「表达式」字段', async () => {
      const tip = utils
        .ruleFormScope(page)
        .locator('.ivu-form-item-error-tip')
        .filter({ hasText: F.nameLengthMsg })
        .first();
      await layout.expectSingleLine(tip, '规则名长度错误提示');
      const nameFormItem = utils
        .ruleFormScope(page)
        .locator('.ivu-form-item')
        .filter({ hasText: F.ruleNameFieldLabel })
        .first();
      const condItem = utils
        .ruleFormScope(page)
        .locator('.ivu-form-item')
        .filter({ hasText: F.condFieldLabel })
        .first();
      await layout.expectNoRectOverlap(nameFormItem, condItem, '规则名 FormItem / 生效条件 FormItem');
    });

    await test.step('清理：关闭抽屉（不保存）', async () => {
      await utils.closeRuleFormDrawer(page);
    });
  });
});
