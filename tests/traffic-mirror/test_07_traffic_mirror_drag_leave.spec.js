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
 * 流量镜像规则 - 拖拽排序与离开拦截 TM-DR-01 ~ TM-DR-05
 *
 * 覆盖用例（docs/traffic-mirror/02-功能测试用例/07-拖拽排序与离开拦截.md）：
 * - TM-DR-01 拖拽提示与行可拖拽属性随模式切换（视图模式无提示、行不可拖拽；
 *   编辑模式出现「拖动表格可修改生效次序」且行可拖拽）
 * - TM-DR-02 拖拽到目标行：落到目标行原下标，且「提交并生效」由置灰变可用
 * - TM-DR-03 列排序 / 列搜索激活时拖拽按**源下标**移动正确的行（含负向对照）
 * - TM-DR-04 离开拦截：编辑模式有未提交改动 → 点侧栏其它菜单 → 弹确认；
 *   取消留在本页（URL 不变）、确定跳走
 * - TM-DR-05 退出编辑模式二次确认：无改动不弹确认直接回视图；有改动弹确认、
 *   确定后回滚到快照顺序并提示「已退出编辑模式」
 *
 * 设计：
 * - 数据策略：镜像规则是**集合级单例**（`PUT /traffic-mirror-rules` 整体替换），为做到用例
 *   零后端写入，统一用 `mockRulesGetResponse` 注入 4 条固定规则（沿用 TM-L-12/L-13 的 mock 手法）；
 *   拖拽只改本地数组，退出编辑模式回滚 `originalRows` 并重新 GET（mock 仍返回同一组规则）。
 *   每条用例结束用请求监听断言「未发出 PUT /traffic-mirror-rules」，不依赖真实集合内容。
 * - 期望顺序不硬编码规则名：基线取进入编辑模式时的实际顺序，期望值由
 *   `moveRuleToIndex(基线, 源下标, 源下标)` 推导（源下标经 `baseline.indexOf(...)` 换算）。
 * - 产品依据：`src/modules/TrafficMirror/index.vue`（`:draggable="mode === 'edit'"`、`@dragDrop`、
 *   `.drag-tip`、`beforeRouteLeave`、`exitEditMode`）；`src/components/table/pageTable.vue`
 *   的 `onDragDrop` 按 `pageSrcIndex` 派发**源下标**，故列排序/列搜索激活时不会移动错行。
 *
 * 运行：nvm use 18 && npx playwright test tests/traffic-mirror/test_07_traffic_mirror_drag_leave.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');
const common = require('../../utils/common');

const RULE_NAME_COLUMN = '规则名';
const MIN_RULES_FOR_DRAG = 3;

/**
 * mock 规则集合（数组顺序 = 基线生效次序），名称刻意设计为：
 * ① 子串 `tm_dr_a` 只命中 2 条且不足全量（可构造列搜索场景）；
 * ② 基线顺序既非升序也非降序 —— 列排序后可视顺序必然变化；
 * ③ 基线**首行不是排序极值**（最大/最小分别是第 3 行 `tm_dr_z_max` 与第 4 行 `tm_dr_a_four`），
 *    这样「排序态下按源下标移动」与「按可视下标移动」必然产出不同的顺序，负向对照才有区分度。
 */
const MOCK_RULE_NAMES = [
  'tm_dr_m_mid',
  'tm_dr_a_one',
  'tm_dr_z_max',
  'tm_dr_a_four',
];
const SEARCH_KEYWORD = 'tm_dr_a';

function buildMockRules() {
  return MOCK_RULE_NAMES.map((name, index) =>
    utils.buildTestRule({
      name,
      cond: `req_path_prefix_in("/v1/dr-${index + 1}", true)`,
      percentage: 10,
    }),
  );
}

/** 列筛选（与 pageTable 本地搜索一致：忽略大小写的包含匹配） */
function filterNamesByKeyword(names, keyword) {
  return names.filter((name) =>
    name.toUpperCase().includes(keyword.toUpperCase()),
  );
}

/** 前置：mock 4 条规则进入页面（视图模式），返回基线顺序 */
async function gotoWithMockRules(page) {
  await utils.ensureAppSession(page);
  await utils.mockRulesGetResponse(page, { rules: buildMockRules() });
  await utils.gotoTrafficMirrorPageAndWaitForRules(page);
  await utils.expectTrafficMirrorPageReady(page);
  await utils.expectViewMode(page);
  await expect
    .poll(() => utils.getRuleNamesInOrder(page), {
      timeout: 20000,
      message: 'mock 的镜像规则集合未按预期渲染，用例前置不成立',
    })
    .toEqual(MOCK_RULE_NAMES);
  return MOCK_RULE_NAMES.slice();
}

async function expectNoBackendWrite(tracker) {
  tracker.stop();
  await utils.expectNoRuleMutationRequest(tracker);
}

test.describe('流量镜像规则 - TM-DR-01 拖拽提示与行可拖拽属性随模式切换', () => {
  test('视图模式无拖拽提示且行不可拖拽；编辑模式出现提示条且行可拖拽', async ({
    page,
  }) => {
    await test.step('前置：mock 4 条规则进入页面（视图模式）', async () => {
      await gotoWithMockRules(page);
    });

    await test.step('1. 视图模式：无提示条，行不带 draggable 属性', async () => {
      await utils.expectDragTipVisible(page, false);
      await utils.expectRuleRowsDraggable(page, false);
      await utils.expectRuleRowsCursorStyle(page, null);
    });

    await test.step('2. 进入编辑模式：出现提示条（文案固定）且行可拖拽', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.expectDragTipVisible(page, true);
      await expect(utils.rulesDragTip(page)).toHaveText(
        utils.DOC_TM_PAGE.dragToChangeOrderTip,
      );
      await utils.expectRuleRowsDraggable(page, true);
      // 可拖拽行鼠标指针为「小手」
      await utils.expectRuleRowsCursorStyle(page, 'grab');
    });

    await test.step('3. 无改动退出编辑模式：提示条消失、行恢复不可拖拽', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectUnsavedChangesConfirmModalAbsent(page);
      await utils.expectViewMode(page);
      await utils.expectDragTipVisible(page, false);
      await utils.expectRuleRowsDraggable(page, false);
      await utils.expectRuleRowsCursorStyle(page, null);
    });
  });
});

test.describe('流量镜像规则 - TM-DR-02 拖拽到目标行落到目标行原下标', () => {
  test('拖拽首行到第 3 行：落到第 3 行原下标，且「提交并生效」由置灰变可用', async ({
    page,
  }) => {
    let baseline = [];
    let tracker = null;

    await test.step('前置：mock 4 条规则，进入编辑模式并记录基线顺序', async () => {
      tracker = utils.trackTrafficMirrorRuleRequests(page);
      baseline = await gotoWithMockRules(page);
      expect(
        baseline.length,
        `镜像规则不足 ${MIN_RULES_FOR_DRAG} 条，无法验证拖拽排序`,
      ).toBeGreaterThanOrEqual(MIN_RULES_FOR_DRAG);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('1. 刚进入编辑模式：无本地变更，「提交并生效」置灰', async () => {
      await utils.expectSubmitAndEffectDisabled(page, true);
    });

    await test.step('2. 拖拽首行到第 3 行：首行落到第 3 行原下标处', async () => {
      await utils.dragRuleRow(page, 0, 2);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('3. 拖拽属本地变更：「提交并生效」解禁，且未写后端', async () => {
      await utils.expectSubmitAndEffectDisabled(page, false);
      await expectNoBackendWrite(tracker);
    });
  });
});

test.describe('流量镜像规则 - TM-DR-03 列排序与列搜索激活时拖拽按源下标移动', () => {
  test('列排序激活时拖拽：按源下标移动正确的规则', async ({ page }) => {
    let baseline = [];
    let visualOrder = [];
    let tracker = null;

    await test.step('前置：mock 4 条规则进入编辑模式并记录基线顺序', async () => {
      tracker = utils.trackTrafficMirrorRuleRequests(page);
      baseline = await gotoWithMockRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('1. 按「规则名」倒序排序，记录可视顺序', async () => {
      await utils.sortRuleTableByColumn(page, RULE_NAME_COLUMN, 'desc');
      visualOrder = await utils.getRuleNamesInOrder(page);
      expect(
        visualOrder.slice().sort().join('|'),
        '列排序改变了行集合',
      ).toBe(baseline.slice().sort().join('|'));
      expect(
        visualOrder,
        '列排序未改变可视顺序，无法验证排序态拖拽',
      ).not.toEqual(baseline);
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

    await test.step('3. 拖拽属本地变更：「提交并生效」解禁，且未写后端', async () => {
      await utils.expectSubmitAndEffectDisabled(page, false);
      await expectNoBackendWrite(tracker);
    });
  });

  test('列搜索筛选激活时拖拽：按源下标移动正确的规则', async ({ page }) => {
    let baseline = [];
    let tracker = null;

    await test.step('前置：mock 4 条规则进入编辑模式并记录基线顺序', async () => {
      tracker = utils.trackTrafficMirrorRuleRequests(page);
      baseline = await gotoWithMockRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('1. 按规则名子串搜索，仅展示命中的行', async () => {
      const filtered = filterNamesByKeyword(baseline, SEARCH_KEYWORD);
      expect(
        filtered.length,
        `关键字「${SEARCH_KEYWORD}」未命中 2 条以上规则，无法构造列搜索场景`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        filtered.length,
        `关键字「${SEARCH_KEYWORD}」命中了全部规则，无法构造筛选态拖拽场景`,
      ).toBeLessThan(baseline.length);
      await utils.searchRuleTableByColumn(
        page,
        RULE_NAME_COLUMN,
        SEARCH_KEYWORD,
      );
      await utils.expectRuleNamesInOrder(page, filtered);
    });

    await test.step('2. 拖拽可视首行到可视末行：按源下标落到可视末行的原下标处', async () => {
      const visualOrder = await utils.getRuleNamesInOrder(page);
      expect(
        visualOrder.length,
        '筛选结果不足 2 行，无法验证筛选态拖拽',
      ).toBeGreaterThanOrEqual(2);
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
      // 拖拽后 pageTable 刷新数据会清空搜索条件，显式清一次再断言全量顺序
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

    await test.step('3. 拖拽属本地变更：「提交并生效」解禁，且未写后端', async () => {
      await utils.expectSubmitAndEffectDisabled(page, false);
      await expectNoBackendWrite(tracker);
    });
  });
});

test.describe('流量镜像规则 - TM-DR-04 离开拦截（编辑模式有未提交改动）', () => {
  test('点侧栏其它菜单弹确认：取消则 URL 不变且改动保留，确定则跳走', async ({
    page,
  }) => {
    let baseline = [];
    let urlBeforeLeave = '';

    await test.step('前置：mock 4 条规则，进入编辑模式并拖拽制造未提交改动', async () => {
      baseline = await gotoWithMockRules(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.dragRuleRow(page, 0, 1);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 1),
      );
      await utils.expectSubmitAndEffectDisabled(page, false);
      urlBeforeLeave = page.url();
    });

    await test.step('1. 应用内点侧栏其它菜单：弹出未提交改动确认框', async () => {
      const label = await utils.clickSidebarMenuItemToLeave(page);
      common.log('离开拦截目标菜单：' + label);
      await utils.expectUnsavedChangesConfirmModal(page);
    });

    await test.step('2. 取消：URL 不变、仍停留本页编辑模式、本地改动保留', async () => {
      await utils.cancelUnsavedChangesConfirmModal(page);
      await utils.expectUnsavedChangesConfirmModalAbsent(page);
      expect(page.url(), '取消离开拦截后 URL 不应变化').toBe(urlBeforeLeave);
      expect(page.url(), '取消后应仍停留在流量镜像规则页').toContain(
        utils.TM_PATH,
      );
      await utils.expectTrafficMirrorPageReady(page);
      await utils.expectEditMode(page);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 1),
      );
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('3. 再次触达并确定：跳离流量镜像规则页', async () => {
      await utils.clickSidebarMenuItemToLeave(page);
      await utils.expectUnsavedChangesConfirmModal(page);
      await utils.confirmUnsavedChangesConfirmModal(page);
      await expect
        .poll(() => page.url(), {
          timeout: 20000,
          message: '确定离开拦截后应跳离流量镜像规则页',
        })
        .not.toContain(utils.TM_PATH);
    });
  });
});

test.describe('流量镜像规则 - TM-DR-05 退出编辑模式二次确认', () => {
  test('无改动不弹确认直接回视图；有改动弹确认，确定后回滚快照并提示「已退出编辑模式」', async ({
    page,
  }) => {
    let baseline = [];
    let tracker = null;

    await test.step('前置：mock 4 条规则进入页面（视图模式）', async () => {
      tracker = utils.trackTrafficMirrorRuleRequests(page);
      baseline = await gotoWithMockRules(page);
    });

    await test.step('1. 无改动：点击「退出编辑模式」不弹确认，直接回视图模式', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.clickExitEditMode(page);
      await utils.expectUnsavedChangesConfirmModalAbsent(page);
      await utils.expectViewMode(page);
      await utils.expectRuleNamesInOrder(page, baseline);
    });

    await test.step('2. 重新进入编辑模式并拖拽制造未提交改动', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.dragRuleRow(page, 0, 2);
      await utils.expectRuleNamesInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('3. 点击「退出编辑模式」：弹出二次确认（标题「信息提示」+ 统一文案）', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectUnsavedChangesConfirmModal(page);
    });

    await test.step('4. 确定：提示「已退出编辑模式」，表格回滚到快照顺序，未写后端', async () => {
      await utils.confirmUnsavedChangesConfirmModal(page);
      await utils.expectTrafficMirrorMessage(page, utils.DOC_TM_PAGE.exitDoneMsg);
      await utils.expectViewMode(page);
      await utils.expectRuleNamesInOrder(page, baseline);
      await expect(utils.rulesDragTip(page)).toHaveCount(0);
      // 退出编辑模式后行属性必须回收（此前只查提示条，draggable 残留从未被断言）
      await utils.expectRuleRowsDraggable(page, false);
      await expectNoBackendWrite(tracker);
    });
  });
});