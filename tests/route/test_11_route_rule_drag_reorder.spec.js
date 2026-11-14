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
 * 模块名：路由管理 - 路由规则拖拽排序
 * 用例范围：RT-D-28（拖拽提示仅编辑模式可见、拖拽到目标行原位置、
 *           行内编辑按钮重排后仍指向正确规则、列排序/列搜索激活时按源下标移动正确的行）
 * 说明：拖拽只在编辑模式内改本地数组，退出编辑模式时放弃修改，不向后端写入；
 *       断言以「拖拽前后规则名顺序」为准，顺序期望由基线顺序 + 源下标推导，不硬编码规则名。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');

const RULE_NAME_COLUMN = '规则名';
const MIN_RULES_FOR_DRAG = 3;

/**
 * 从规则名里挑一个「既能筛出多行、又不会命中全部行」的子串作为列搜索关键字
 * （与 pageTable 本地搜索一致：忽略大小写的包含匹配）
 */
function pickFilterableKeyword(names) {
  const candidates = [...names].sort((a, b) => a.length - b.length);
  for (const candidate of candidates) {
    const hits = names.filter((name) =>
      name.toUpperCase().includes(candidate.toUpperCase()),
    );
    if (hits.length >= 2 && hits.length < names.length) {
      return candidate;
    }
  }
  return null;
}

function filterNamesByKeyword(names, keyword) {
  return names.filter((name) =>
    name.toUpperCase().includes(keyword.toUpperCase()),
  );
}

test.describe('路由管理 - RT-D-28 拖拽排序', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  async function enterGlobalRulesEditMode(page) {
    await utils.ensureRouteTableModuleAvailable(page);
    await guard.capture(page);
    await utils.clearRouteTableSearchFilter(
      page,
      utils.ROUTE_TABLE_SEARCH_COLUMN.status,
    );
    await utils.openGlobalRouteTableDetail(page);
    await utils.expectRouteRulesViewMode(page);
    await test.step('查看模式：无拖拽提示、行不可拖拽', async () => {
      await utils.expectRouteRulesDragTipVisible(page, false);
      // 步骤名承诺的「行不可拖拽」必须是真断言（此前只查提示条，属性从未校验）
      await utils.expectRuleRowsDraggable(page, false);
    });
    await utils.enterRouteRulesEditMode(page);
    await utils.expectRouteRulesEditMode(page);
    await test.step('编辑模式：出现拖拽提示且行可拖拽', async () => {
      await utils.expectRouteRulesDragTipVisible(page, true);
      await expect(utils.routeRulesDragTip(page)).toHaveText(
        utils.DOC_ROUTE_TABLE.dragToChangeOrderTip,
      );
      await utils.expectRuleRowsDraggable(page, true);
    });
  }

  async function expectRowEditButtonsAlignWithOrder(page, expectedOrder) {
    for (let i = 0; i < expectedOrder.length; i += 1) {
      await test.step(`第 ${i + 1} 行「编辑」打开 ${expectedOrder[i]}`, async () => {
        await utils.openEditRuleDrawerByRowIndex(page, i);
        expect(await utils.getRuleFormNameValue(page)).toBe(expectedOrder[i]);
        await utils.closeTopDrawer(page);
        await utils.expectRuleFormDrawerHidden(page);
      });
    }
  }

  test('RT-D-28 拖拽行到目标行：移动到目标行原下标，行内按钮仍指向正确规则', async ({
    page,
  }) => {
    let baseline = [];
    let originalNames = [];

    await test.step('前置：进入编辑模式，必要时用本地复制补齐到 3 条规则', async () => {
      await enterGlobalRulesEditMode(page);
      originalNames = await utils.getRuleNamesInOrder(page);
      baseline = await utils.ensureRuleRowsAtLeast(page, MIN_RULES_FOR_DRAG);
      expect(
        baseline.length,
        `Global 路由表规则不足 ${MIN_RULES_FOR_DRAG} 条，无法验证拖拽排序`,
      ).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
    });

    await test.step('0. 编辑模式下规则行显示「可拖拽」光标（cursor: grab）', async () => {
      await utils.expectRuleRowsCursorStyle(page, 'grab');
    });

    await test.step('1. 拖拽首行到第 3 行：首行移动到第 3 行的原下标处', async () => {
      await utils.dragRuleRow(page, 0, 2);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('2. 拖拽产生本地变更：提交并生效解禁', async () => {
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('3. 重排后每行「编辑」仍指向该行规则', async () => {
      await expectRowEditButtonsAlignWithOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('4. 退出编辑模式放弃本地修改，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRouteRulesDragTipVisible(page, false);
      // 放弃修改后回到进入编辑模式时的原始规则（补齐用的本地副本一并丢弃）
      await utils.expectRuleNamesInOrder(page, originalNames);
      await utils.expectRuleRowsDraggable(page, false);
      // 查看模式不可拖拽：行上不再显示 grab 光标
      await utils.expectRuleRowsCursorStyle(page, null);
      await guard.verifyUnchanged(page);
    });
  });

  // 2026-11-02（#79 决策 ①）：排序/列筛选激活时**禁用拖拽**——视图顺序 ≠ 优先级顺序，
  // 允许拖拽会改错行。产品已在 pageTable 层统一实现（canDrag = draggable && 无排序 && 无列筛选）。
  test('RT-D-28 列排序激活时拖拽被禁用：顺序不变、清除排序后恢复', async ({
    page,
  }) => {
    let baseline = [];
    let sortedOrder = [];

    await test.step('前置：进入编辑模式并记录基线顺序', async () => {
      await enterGlobalRulesEditMode(page);
      baseline = await utils.ensureRuleRowsAtLeast(page, MIN_RULES_FOR_DRAG);
      expect(
        baseline.length,
        `Global 路由表规则不足 ${MIN_RULES_FOR_DRAG} 条，无法验证排序态拖拽`,
      ).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
      await utils.expectRuleRowsDraggable(page, true);
    });

    await test.step('1. 按「规则名」倒序：可视顺序改变且行不再可拖拽', async () => {
      await utils.sortRuleTableByColumn(page, RULE_NAME_COLUMN, 'desc');
      sortedOrder = await utils.getRuleNamesInOrder(page);
      expect(sortedOrder.slice().sort()).toEqual(baseline.slice().sort());
      expect(sortedOrder).not.toEqual(baseline);
      await utils.expectRuleRowsDraggable(page, false);
    });

    await test.step('2. 尝试拖拽：顺序保持不变', async () => {
      // 前置「复制规则」补齐行数会置脏，「提交并生效」此时本就可用；
      // 这里断言的是「拖拽没有产生新的改动」——禁用态与拖拽前保持一致
      const disabledBeforeDrag = await utils.isSubmitAndEffectDisabled(page);
      await utils.dragRuleRow(page, 0, sortedOrder.length - 1);
      await page.waitForTimeout(500);
      await utils.expectRuleNamesInOrder(page, sortedOrder);
      expect(
        await utils.isSubmitAndEffectDisabled(page),
        '拖拽不应产生新的改动（禁用态与拖拽前一致）',
      ).toBe(disabledBeforeDrag);
    });

    await test.step('3. 清除排序（再次点击同一排序图标）：恢复可拖拽与原始顺序', async () => {
      await utils.sortRuleTableByColumn(page, RULE_NAME_COLUMN, 'desc');
      await utils.expectRuleRowsDraggable(page, true);
      await utils.expectRuleNamesInOrder(page, baseline);
    });

    await test.step('4. 退出编辑模式，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleRowsDraggable(page, false);
      await guard.verifyUnchanged(page);
    });
  });

  test('RT-D-28 列搜索筛选激活时拖拽被禁用：清空搜索后顺序不变', async ({
    page,
  }) => {
    let baseline = [];

    await test.step('前置：进入编辑模式并记录基线顺序', async () => {
      await enterGlobalRulesEditMode(page);
      baseline = await utils.ensureRuleRowsAtLeast(page, MIN_RULES_FOR_DRAG);
      expect(
        baseline.length,
        `Global 路由表规则不足 ${MIN_RULES_FOR_DRAG} 条，无法验证筛选态拖拽`,
      ).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
    });

    await test.step('1. 列搜索激活：仅展示命中行且行不可拖拽', async () => {
      let keyword = pickFilterableKeyword(baseline);
      if (!keyword) {
        // 现有规则名之间筛不出「只命中部分行」的子串（如历史残留规则互不为子串）：
        // 复制两条同规则（-copy 后缀），用 '-copy' 构造可筛选场景（复制仅作用于本地表单，不落库）
        await utils.clickCopyRuleButtonByIndex(page, 0);
        await utils.clickCopyRuleButtonByIndex(page, 0);
        baseline = await utils.getRuleNamesInOrder(page);
        keyword = pickFilterableKeyword(baseline);
      }
      expect(
        keyword,
        '规则名之间无可用作筛选的子串，无法构造列搜索场景',
      ).toBeTruthy();
      await utils.searchRuleTableByColumn(page, RULE_NAME_COLUMN, keyword);
      const visualOrder = await utils.getRuleNamesInOrder(page);
      expect(visualOrder.length).toBeGreaterThanOrEqual(2);
      await utils.expectRuleRowsDraggable(page, false);
    });

    await test.step('2. 尝试拖拽并清空搜索：顺序与基线一致（未发生移动）', async () => {
      const visualOrder = await utils.getRuleNamesInOrder(page);
      await utils.dragRuleRow(page, 0, visualOrder.length - 1);
      await page.waitForTimeout(500);
      await utils.searchRuleTableByColumn(page, RULE_NAME_COLUMN, '');
      await utils.expectRuleNamesInOrder(page, baseline);
    });

    await test.step('3. 清除搜索后恢复可拖拽', async () => {
      await utils.expectRuleRowsDraggable(page, true);
    });

    await test.step('4. 退出编辑模式，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleRowsDraggable(page, false);
      await guard.verifyUnchanged(page);
    });
  });
});
