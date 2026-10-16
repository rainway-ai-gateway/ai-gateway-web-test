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
      await guard.verifyUnchanged(page);
    });
  });

  test('RT-D-28 列排序激活时拖拽：按源下标移动正确的规则', async ({ page }) => {
    let baseline = [];
    let visualOrder = [];

    await test.step('前置：进入编辑模式并记录基线顺序', async () => {
      await enterGlobalRulesEditMode(page);
      baseline = await utils.ensureRuleRowsAtLeast(page, MIN_RULES_FOR_DRAG);
      expect(
        baseline.length,
        `Global 路由表规则不足 ${MIN_RULES_FOR_DRAG} 条，无法验证排序态拖拽`,
      ).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
    });

    await test.step('1. 按「规则名」倒序排序，记录可视顺序', async () => {
      await utils.sortRuleTableByColumn(page, RULE_NAME_COLUMN, 'desc');
      visualOrder = await utils.getRuleNamesInOrder(page);
      expect(
        visualOrder.slice().sort().join('|'),
        '列排序未改变可视顺序，无法验证排序态拖拽',
      ).toBe(baseline.slice().sort().join('|'));
      expect(visualOrder).not.toEqual(baseline);
    });

    await test.step('2. 拖拽可视首行到可视末行：按源下标落到可视末行的原下标处', async () => {
      const sourceIndexOfFirst = baseline.indexOf(visualOrder[0]);
      const sourceIndexOfLast = baseline.indexOf(
        visualOrder[visualOrder.length - 1],
      );
      const expectedOrder = utils.moveRuleToIndex(
        baseline,
        sourceIndexOfFirst,
        sourceIndexOfLast,
      );
      const visuallyIndexedOrder = utils.moveRuleToIndex(
        baseline,
        0,
        visualOrder.length - 1,
      );

      await utils.dragRuleRow(page, 0, visualOrder.length - 1);
      await utils.expectRuleNamesInOrder(page, expectedOrder);

      if (
        JSON.stringify(expectedOrder) !== JSON.stringify(visuallyIndexedOrder)
      ) {
        // 负向对照：若按可视下标派发，移动的将是另一条规则
        expect(
          await utils.getRuleNamesInOrder(page),
          '排序态下移动的规则不是可视首行对应的规则',
        ).not.toEqual(visuallyIndexedOrder);
      }
    });

    await test.step('3. 退出编辑模式放弃本地修改，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await guard.verifyUnchanged(page);
    });
  });

  test('RT-D-28 列搜索筛选激活时拖拽：按源下标移动正确的规则', async ({
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

    await test.step('1. 按规则名子串搜索，仅展示命中的行', async () => {
      const keyword = pickFilterableKeyword(baseline);
      expect(
        keyword,
        '规则名之间无可用作筛选的子串，无法构造列搜索场景',
      ).toBeTruthy();
      await utils.searchRuleTableByColumn(page, RULE_NAME_COLUMN, keyword);
      await utils.expectRuleNamesInOrder(
        page,
        filterNamesByKeyword(baseline, keyword),
      );
    });

    await test.step('2. 拖拽可视首行到可视末行：按源下标落到可视末行的原下标处', async () => {
      const visualOrder = await utils.getRuleNamesInOrder(page);
      expect(visualOrder.length).toBeGreaterThanOrEqual(2);
      const sourceIndexOfFirst = baseline.indexOf(visualOrder[0]);
      const sourceIndexOfLast = baseline.indexOf(
        visualOrder[visualOrder.length - 1],
      );
      const expectedOrder = utils.moveRuleToIndex(
        baseline,
        sourceIndexOfFirst,
        sourceIndexOfLast,
      );
      const visuallyIndexedOrder = utils.moveRuleToIndex(
        baseline,
        0,
        visualOrder.length - 1,
      );

      await utils.dragRuleRow(page, 0, visualOrder.length - 1);
      await utils.searchRuleTableByColumn(page, RULE_NAME_COLUMN, '');
      await utils.expectRuleNamesInOrder(page, expectedOrder);

      if (
        JSON.stringify(expectedOrder) !== JSON.stringify(visuallyIndexedOrder)
      ) {
        // 负向对照：若按可视下标派发，移动的将是另一条规则
        expect(
          await utils.getRuleNamesInOrder(page),
          '筛选态下移动的规则不是可视首行对应的规则',
        ).not.toEqual(visuallyIndexedOrder);
      }
    });

    await test.step('3. 退出编辑模式放弃本地修改，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await guard.verifyUnchanged(page);
    });
  });
});