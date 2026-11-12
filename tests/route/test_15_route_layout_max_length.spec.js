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
const utils = require('../../pages/route/RoutePage');
const resourceApi = require('../../api/resource-api-utils');
const layout = require('../../utils/layout');

const LAYOUT_DOC = 'docs/route-management/02-功能测试用例/08-布局与最大长度.md';

/**
 * 路由管理 - 布局与最大长度（RT-LAY-01）
 *
 * 背景（docs/覆盖缺口清单.md §27）：项目无视觉回归测试。本文件用 DOM 指标断言
 * （utils/layout.js）覆盖规则名满载（64 字符，路由规则名上限 1–64，RT-V-14）时全局路由规则表格的行布局：
 * 表格不横向溢出、规则名单元格行数封顶（≤3 行或 ellipsis 截断）。
 *
 * 修复记录（2026-11-02）：iView 表格单元格 `white-space:normal;
 * word-break:break-all` 且长文本列未配 ellipsis，64 字符规则名曾折行约 4 行（行高
 * ~83px）。已修复：规则名列 `ellipsis: true` + render span `.cell-ellipsis` + title
 * 裁剪（与 EM-LAY-02 / PR-LAY-01 / TM-LAY-01 / AC-LAY-01 同批修复）。
 *
 * 造数：编辑模式「添加规则」本地保存（不写后端）；afterEach restoreRouteTestData 还原。
 *
 * 验收依据：docs/route-management/02-功能测试用例/08-布局与最大长度.md
 */
test.describe('路由管理 - RT-LAY-01 规则名满载行布局', () => {

  test.afterEach(async ({ page }) => {
    await resourceApi.restoreRouteTestData(page);
  });

  test('规则名 64 字符：表格不横向溢出且规则名单元格行数封顶', async ({
    page,
  }) => {
    const ruleName = 'r'.repeat(64);

    await test.step('前置：编辑模式本地保存 64 字符规则名', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
      const clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      if (clusters[0].llm_config?.models?.length > 0) {
        await utils.selectRuleTargetModel(
          page,
          0,
          clusters[0].llm_config.models[0],
        );
      }
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });

    await test.step('1. 规则表格无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        page.locator('.show-iView-Table .ivu-table-wrapper').first(),
        '路由规则表格',
      );
    });

    await test.step('2. 规则名单元格行数 ≤3 行（或 ellipsis 截断）', async () => {
      const row = await utils.routeRuleRowByName(page, ruleName);
      await layout.expectCellLineCap(
        row.locator('td').nth(0).locator('.ivu-table-cell'),
        3,
        `路由规则「${ruleName.slice(0, 16)}…」名称单元格`,
      );
    });
  });
});
