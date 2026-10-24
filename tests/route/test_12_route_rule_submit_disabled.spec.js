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
 * 模块名：路由管理 - 提交并生效按钮脏检查
 * 用例范围：RT-D-29（刚进入编辑模式置灰、复制/拖拽/编辑后解禁、回滚到基线后重新置灰）
 * 说明：全程只改本地 rules，退出编辑模式时放弃修改，不向后端写入；
 *       回滚路径覆盖「复制后删除副本」与「拖拽后拖回原位」两条，
 *       抽屉编辑后的回滚为已知偏差（见用例文档 §2.28 备注）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const common = require('../../utils/common');

test.describe('路由管理 - RT-D-29 提交并生效置灰', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  test('RT-D-29 提交并生效仅在存在本地变更时可用', async ({ page }) => {
    let baseline = [];

    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await guard.capture(page);
      await utils.clearRouteTableSearchFilter(
        page,
        utils.ROUTE_TABLE_SEARCH_COLUMN.status,
      );
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
      baseline = await utils.getRuleNamesInOrder(page);
      expect(
        baseline.length,
        'Global 路由表无规则，无法验证脏检查',
      ).toBeGreaterThanOrEqual(1);
      common.log('规则基线顺序: ' + baseline.join(' > '));
    });

    await test.step('1. 刚进入编辑模式：无本地变更，提交并生效置灰', async () => {
      await utils.expectSubmitAndEffectDisabled(page, true);
    });

    await test.step('2. 复制规则：提交并生效解禁', async () => {
      await utils.clickCopyRuleButtonByIndex(page, 0);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('3. 删除副本回滚到基线：提交并生效重新置灰', async () => {
      const copyName = utils.buildCopyRuleName(baseline[0], baseline);
      await utils.deleteRuleByName(page, copyName);
      await utils.expectRuleNamesInOrder(page, baseline);
      await utils.expectSubmitAndEffectDisabled(page, true);
    });

    const draggedIndex = Math.min(2, baseline.length - 1);
    if (draggedIndex >= 1) {
      await test.step('4. 拖拽排序：提交并生效解禁', async () => {
        await utils.dragRuleRow(page, 0, draggedIndex);
        await utils.expectRuleNamesInOrder(
          page,
          utils.moveRuleToIndex(baseline, 0, draggedIndex),
        );
        await utils.expectSubmitAndEffectDisabled(page, false);
      });

      await test.step('5. 拖回原位回滚到基线：提交并生效重新置灰', async () => {
        await utils.dragRuleRow(page, draggedIndex, 0);
        await utils.expectRuleNamesInOrder(page, baseline);
        await utils.expectSubmitAndEffectDisabled(page, true);
      });
    } else {
      common.log('Global 路由表仅 1 条规则，跳过拖拽脏检查（复制+删除已覆盖回滚路径）');
    }

    await test.step('6. 抽屉编辑规则名称：提交并生效解禁', async () => {
      await utils.openEditRuleDrawerByRowIndex(page, 0);
      await utils.fillRuleName(page, `${baseline[0]}-renamed`);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('7. 退出编辑模式放弃本地修改，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleNamesInOrder(page, baseline);
      await guard.verifyUnchanged(page);
    });
  });
});