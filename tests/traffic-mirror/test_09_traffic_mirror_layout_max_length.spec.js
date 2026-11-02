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
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');
const layout = require('../../utils/layout');

const LAYOUT_DOC = 'docs/traffic-mirror/02-功能测试用例/08-布局与最大长度.md';

/**
 * 流量镜像规则 - 布局与最大长度（TM-LAY-01）
 *
 * 背景（docs/覆盖缺口清单.md §27）：项目无视觉回归测试。本文件用 DOM 指标断言
 * （utils/layout.js）覆盖规则名满载（128 字符）时规则表格的行布局：
 * 表格不横向溢出、规则名单元格行数封顶（≤3 行或 ellipsis 截断）。
 *
 * 修复记录（2026-11-02）：iView 表格单元格长文本列未配 ellipsis，128 字符规则名曾
 * 折行约 16 行（行高 ~335px）。已修复：规则名列 `ellipsis: true` + render span
 * `.cell-ellipsis` + title 裁剪（与 EM-LAY-02 / PR-LAY-01 / RT-LAY-01 / AC-LAY-01
 * 同批修复）。
 *
 * 造数：mock GET 规则列表返回一条 128 字符规则名（不写后端，与 test_07 同款）。
 *
 * 验收依据：docs/traffic-mirror/02-功能测试用例/08-布局与最大长度.md
 */
test.describe('流量镜像规则 - TM-LAY-01 规则名满载行布局', () => {

  test('规则名 128 字符：表格不横向溢出且规则名单元格行数封顶', async ({
    page,
  }) => {
    const ruleName = 'm'.repeat(128);

    await test.step('前置：mock 一条 128 字符规则名并渲染', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, {
        rules: [
          utils.buildTestRule({
            name: ruleName,
            cond: 'req_path_prefix_in("/v1/lay", true)',
            percentage: 10,
          }),
        ],
      });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectTrafficMirrorPageReady(page);
      await utils.expectViewMode(page);
      await expect
        .poll(() => utils.getRuleNamesInOrder(page), {
          timeout: 20000,
          message: 'mock 的镜像规则未按预期渲染',
        })
        .toEqual([ruleName]);
    });

    await test.step('1. 规则表格无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        page.locator('.show-iView-Table .ivu-table-wrapper').first(),
        '流量镜像规则表格',
      );
    });

    await test.step('2. 规则名单元格行数 ≤3 行（或 ellipsis 截断）', async () => {
      const row = utils.ruleRowsMain(page).first();
      await layout.expectCellLineCap(
        row.locator('td').nth(0).locator('.ivu-table-cell'),
        3,
        `镜像规则「${ruleName.slice(0, 16)}…」名称单元格`,
      );
    });
  });
});
