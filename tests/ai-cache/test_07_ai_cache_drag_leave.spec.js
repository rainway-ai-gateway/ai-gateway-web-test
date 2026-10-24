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
 * AI 缓存规则 - 拖拽排序与离开拦截 AC-DR-01 ~ AC-DR-05
 *
 * 覆盖用例（docs/ai-cache/02-功能测试用例/07-拖拽排序与离开拦截.md）：
 * - AC-DR-01 拖拽提示与行可拖拽属性随模式切换
 * - AC-DR-02 拖拽到目标行：落到目标行原下标，且「提交并生效」由置灰变可用
 * - AC-DR-03 列排序 / 列搜索激活时拖拽按源下标移动正确的行
 * - AC-DR-04 离开拦截：编辑模式有未提交改动时点侧栏其它菜单 → 确认 → 取消留页 / 确定跳走
 * - AC-DR-05 退出编辑模式二次确认：有改动弹确认、确定回滚快照并提示；无改动不弹确认
 *
 * 设计（沿用 tests/route/test_11_route_rule_drag_reorder.spec.js 与
 * tests/ai-cache/test_01_ai_cache_list.spec.js 的既有范式）：
 * - 数据用 `mockRulesGetResponse` 注入受控集合（3 条），拖拽 / 列排序 / 列搜索都只改前端本地
 *   数组，全程零后端写入，无需快照还原；AI 缓存规则**没有「复制」按钮**（复制仅路由模块有），
 *   行数靠受控注入保证，不依赖环境已有规则条数。
 * - 顺序期望一律由「基线顺序 + 源下标」用 `moveRuleToIndex` 推导，不硬编码规则名。
 * - AC-DR-04 只做应用内路由跳转（点侧栏菜单元数据），不直连 URL、不改会话。
 * - AC-DR-05 的重启 GET 由同一 mock 提供，回滚断言以「快照顺序」为准。
 *
 * 运行：nvm use 18 && npx playwright test tests/ai-cache/test_07_ai_cache_drag_leave.spec.js
 *
 * 验证状态（2026-10-16 真机串行验证 → 2026-10-17 产品修复后待复跑）：
 * - AC-DR-02 / AC-DR-03 / AC-DR-04 / AC-DR-05 通过；
 * - AC-DR-01 **阻塞**：退出编辑模式后（页面确已回到视图模式）表格行 `<tr>` 仍为
 *   `draggable="true"` 且永不回收（探针实测 200ms~5000ms 全程 `"true"`）—— 产品缺陷，
 *   非时序问题。`expectRuleRowsDraggable` 保持原断言、**不加轮询/重试**，让缺陷持续可见；
 *   记录见 docs/ai-cache/02-功能测试用例/07-拖拽排序与离开拦截.md §7.6 阻塞记录。
 *   **2026-10-17 修复**：`src/components/table/pageTable.vue` 新增 `draggable` 的 watch，退出可拖拽态时
 *   清掉行上残留属性；实测退出编辑模式后行 `draggable` = `[null,null,null]`（修复前全为 `"true"`，
 *   5 秒后仍不回收），AC-DR-01 应转绿（待串行复跑确认）。产品改动记录见
 *   `ai-gateway-web/design-docs/modifications/2026-10-17-ui-defect-fixes/`。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');

const P = utils.DOC_AI_CACHE_PAGE;
const RULE_NAME_COLUMN = utils.DOC_AI_CACHE_RULES.ruleNameColumn;
const MIN_RULES_FOR_DRAG = 3;

/** 受控集合：3 条规则，名称互不重复（拖动 / 排序断言只依赖数组顺序） */
function buildControlledRules(suffix = 'a') {
  const stamp = `${Date.now()}_${suffix}`;
  return [
    utils.buildTestRule({ name: `ac_dr_${stamp}_1` }),
    utils.buildTestRule({ name: `ac_dr_${stamp}_2` }),
    utils.buildTestRule({ name: `ac_dr_${stamp}_3` }),
  ];
}

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

/** 进入编辑模式（受控集合 + 视图模式 → 编辑模式），返回基线顺序 */
async function enterEditModeWithControlledRules(page, rules) {
  await utils.ensureAppSession(page);
  await utils.mockRulesGetResponse(page, { rules });
  await utils.gotoAiCachePageAndWaitForRules(page);
  await utils.expectAiCachePageReady(page);
  await utils.expectViewMode(page);
  await utils.enterEditMode(page);
  await utils.expectEditMode(page);
  const baseline = await utils.getRuleNamesInOrder(page);
  expect(
    baseline.length,
    `受控集合未渲染出 ${rules.length} 条规则，无法验证拖拽`,
  ).toBe(rules.length);
  return baseline;
}

test.describe('AI 缓存规则 - AC-DR-01 拖拽提示与行可拖拽属性随模式切换', () => {
  test('视图模式无拖拽提示且行不可拖拽；编辑模式出现提示且行可拖拽；退出后恢复', async ({
    page,
  }) => {
    const rules = buildControlledRules('d01');

    await test.step('前置：受控集合 3 条，进入页面并停留视图模式', async () => {
      await utils.ensureAppSession(page);
      await utils.mockRulesGetResponse(page, { rules });
      await utils.gotoAiCachePageAndWaitForRules(page);
      await utils.expectAiCachePageReady(page);
      await utils.expectViewMode(page);
      expect(await utils.getRuleRowCount(page)).toBe(3);
    });

    await test.step('视图模式：无拖拽提示、行不可拖拽', async () => {
      await utils.expectRuleDragTipVisible(page, false);
      await utils.expectRuleRowsDraggable(page, false);
      await utils.expectRuleRowsCursorStyle(page, null);
    });

    await test.step('编辑模式：出现提示「拖动表格可修改生效次序」且行可拖拽', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.expectRuleDragTipVisible(page, true);
      await expect(utils.ruleDragTip(page)).toHaveText(P.dragToChangeOrder);
      await utils.expectRuleRowsDraggable(page, true);
      // 可拖拽行鼠标指针为「小手」，直观提示可拖动
      await utils.expectRuleRowsCursorStyle(page, 'grab');
    });

    await test.step('退出编辑模式（无改动，无二次确认）后提示消失、行恢复不可拖拽', async () => {
      await utils.clickExitEditMode(page);
      await page.waitForTimeout(1000);
      await utils.expectViewMode(page);
      await utils.expectRuleDragTipVisible(page, false);
      await utils.expectRuleRowsDraggable(page, false);
      await utils.expectRuleRowsCursorStyle(page, null);
    });
  });
});

test.describe('AI 缓存规则 - AC-DR-02 拖拽到目标行落到目标行原下标', () => {
  test('拖拽首行到第 3 行落到其原下标并解禁提交；拖回原位回滚后重新置灰', async ({
    page,
  }) => {
    const rules = buildControlledRules('d02');
    let baseline = [];

    await test.step('前置：进入编辑模式，无本地变更时「提交并生效」置灰', async () => {
      baseline = await enterEditModeWithControlledRules(page, rules);
      expect(baseline.length).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
      await utils.expectSubmitAndEffectDisabled(page, true);
    });

    await test.step('1. 拖拽首行到第 3 行：首行落到第 3 行的原下标处', async () => {
      await utils.dragRuleRow(page, 0, 2);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('2. 拖拽产生本地变更：「提交并生效」由置灰变可用', async () => {
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('3. 拖回原位回滚到基线：顺序复原且「提交并生效」重新置灰', async () => {
      await utils.dragRuleRow(page, 2, 0);
      await utils.expectRuleNamesInOrder(page, baseline);
      await utils.expectSubmitAndEffectDisabled(page, true);
    });
  });
});

test.describe('AI 缓存规则 - AC-DR-03 列排序/列搜索激活时拖拽按源下标移动正确的行', () => {
  test('AC-DR-03 列排序激活时拖拽：按源下标移动正确的规则', async ({ page }) => {
    // 基线顺序刻意与「按规则名倒序」不同：倒序后可视首行不是基线首行
    const stamp = Date.now();
    const rules = [
      utils.buildTestRule({ name: `ac_dr03s_mmm_${stamp}` }),
      utils.buildTestRule({ name: `ac_dr03s_aaa_${stamp}` }),
      utils.buildTestRule({ name: `ac_dr03s_zzz_${stamp}` }),
    ];
    let baseline = [];
    let visualOrder = [];

    await test.step('前置：进入编辑模式并记录基线顺序', async () => {
      baseline = await enterEditModeWithControlledRules(page, rules);
      expect(baseline.length).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
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
  });

  test('AC-DR-03 列搜索筛选激活时拖拽：按源下标移动正确的规则', async ({
    page,
  }) => {
    // 关键字命中第 2、3 条（第 1 条不命中）：可视首行的源下标 ≠ 0
    // 名称构造成「短名是长名子串」，使 pickFilterableKeyword 能取到筛出 2/3 行的关键字
    const stamp = Date.now();
    const hitBase = utils.buildTestRule({ name: `ac_dr03f_hit_${stamp}` });
    const hitExt = utils.buildTestRule({ name: `ac_dr03f_hit_${stamp}_b` });
    const miss = utils.buildTestRule({ name: `ac_dr03f_zzz_${stamp}` });
    const rules = [miss, hitBase, hitExt];
    let baseline = [];

    await test.step('前置：进入编辑模式并记录基线顺序', async () => {
      baseline = await enterEditModeWithControlledRules(page, rules);
      expect(baseline.length).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
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
      expect(
        sourceIndexOfFirst,
        '可视首行的源下标为 0，无法与「按可视下标派发」区分',
      ).not.toBe(0);
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
  });
});

test.describe('AI 缓存规则 - AC-DR-04 离开拦截（未提交改动切侧栏菜单）', () => {
  test('编辑模式有未提交改动时点侧栏其它菜单弹确认：取消留页 URL 不变，确定跳走', async ({
    page,
  }) => {
    const rules = buildControlledRules('d04');
    let baseline = [];
    let dirtyOrder = [];
    let leaveTarget = null;

    await test.step('前置：进入编辑模式并拖拽制造未提交改动', async () => {
      baseline = await enterEditModeWithControlledRules(page, rules);
      await utils.dragRuleRow(page, 0, 1);
      dirtyOrder = utils.moveRuleToIndex(baseline, 0, 1);
      await utils.expectRuleNamesInOrder(page, dirtyOrder);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('1. 点击侧栏其它菜单：弹出未提交离开确认框（正文为统一退出文案）', async () => {
      leaveTarget = await utils.clickSidebarOtherModule(page);
      await utils.expectLeaveConfirmModal(page);
    });

    await test.step('2. 取消：仍停留在本页（URL 不变），编辑态与本地改动保留', async () => {
      await utils.cancelLeaveModal(page);
      utils.expectStayOnAiCachePage(page);
      await utils.expectEditMode(page);
      await utils.expectRuleNamesInOrder(page, dirtyOrder);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('3. 再次点击侧栏其它菜单并确定：跳转到目标模块', async () => {
      await utils.clickSidebarOtherModule(page);
      await utils.expectLeaveConfirmModal(page);
      await utils.confirmLeaveModal(page);
      await utils.expectLeftToOtherModule(page, leaveTarget.path);
    });
  });
});

test.describe('AI 缓存规则 - AC-DR-05 退出编辑模式二次确认', () => {
  test('有未提交改动时退出弹确认，确定后回滚到快照并提示「已退出编辑模式」', async ({
    page,
  }) => {
    const rules = buildControlledRules('d05a');
    let baseline = [];

    await test.step('前置：进入编辑模式并拖拽制造未提交改动', async () => {
      baseline = await enterEditModeWithControlledRules(page, rules);
      await utils.dragRuleRow(page, 0, 2);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('1. 点击「退出编辑模式」弹出二次确认框', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
    });

    await test.step('2. 点击「确定」：提示「已退出编辑模式」并回到视图模式', async () => {
      await utils.expectAiCacheMessageDuringAction(page, P.exitDoneMsg, () =>
        utils.confirmExitEditMode(page),
      );
      await utils.expectViewMode(page);
      // 退出后行属性必须回收（此前只查提示条，draggable 残留从未被断言）；
      // 等一拍与 AC-DR-01 第 3 步同口径，避开退出流程内部重新 GET 规则的空窗
      await page.waitForTimeout(1000);
      await utils.expectRuleRowsDraggable(page, false);
    });

    await test.step('3. 本地改动被丢弃，集合回滚到进入编辑模式时的快照', async () => {
      await utils.expectRuleNamesInOrder(page, baseline);
    });
  });

  test('无未提交改动时退出编辑模式不弹确认，直接回视图模式', async ({ page }) => {
    const rules = buildControlledRules('d05b');

    await test.step('前置：进入编辑模式且不做任何改动', async () => {
      await enterEditModeWithControlledRules(page, rules);
      await utils.expectSubmitAndEffectDisabled(page, true);
    });

    await test.step('点击「退出编辑模式」不弹确认框，直接回到视图模式', async () => {
      await utils.clickExitEditMode(page);
      await page.waitForTimeout(1000);
      await expect(utils.modal(page).visible()).toHaveCount(0);
      await utils.expectViewMode(page);
      // 退出后行属性必须回收（此前只查 modal 与模式，draggable 残留从未被断言）
      await utils.expectRuleRowsDraggable(page, false);
    });
  });
});