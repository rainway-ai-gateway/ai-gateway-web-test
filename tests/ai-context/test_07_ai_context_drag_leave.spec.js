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
 * AI 上下文压缩 - 拖拽排序与离开拦截 AX-DR-01 ~ AX-DR-05
 *
 * 覆盖用例（docs/ai-context/02-功能测试用例/07-拖拽排序与离开拦截.md）：
 * - AX-DR-01 拖拽提示与行可拖拽属性随模式切换（视图模式无提示、行不可拖拽；编辑模式反之）
 * - AX-DR-02 拖拽到目标行：落到目标行原下标，且「提交并生效」由置灰变可用
 * - AX-DR-03 列排序 / 列搜索激活时拖拽按**源下标**移动正确的行（排序态、搜索态各 1 条）
 * - AX-DR-04 离开拦截：编辑模式有未提交改动 → 点侧栏其它菜单 → 二次确认（取消留在本页 / 确定跳走）
 * - AX-DR-05 退出编辑模式二次确认：有改动弹确认、确定回滚快照并提示；无改动不弹确认直接回视图
 *
 * 产品依据（src/modules/AIContext/index.vue）：
 * - `:draggable="rulesMode === 'edit'"` + `@dragDrop="onRuleDragDrop"`：拖拽只在编辑模式内改本地
 *   数组（splice 取出 + 按目标**原下标**插入，不重编号），退出编辑模式即丢弃，全程不写后端；
 * - `.drag-tip` 由 `v-if="rulesMode === 'edit'"` 控制（文案 aiContext.dragToChangeOrder）；
 * - `beforeRouteLeave`：`rulesMode === 'edit' && isRulesDirty` 时 `$Modal.confirm`，
 *   `onOk: next()` / `onCancel: () => next(false)`；
 * - `exitRulesEditMode`：`isRulesDirty` 时二次确认，确定后回滚 `originalRows` 并提示 `exitDone`；
 *   无改动时不弹确认、也**不**提示 exitDone。
 * - pageTable 的 `onDragDrop` 用 `pageSrcIndex` 把可视下标换算成原始数组下标后派发，
 *   故列排序 / 列搜索激活时移动的仍是源下标对应的行（期望值用 `baseline.indexOf(...)` 换算）。
 *
 * 设计：
 * - 数据沿用本模块既有范式（tests/ai-context/test_01 的 AX-L-11/12/13）：用 `mockRulesGetResponse`
 *   注入 3 条**受控**规则。拖拽 / 列排序 / 列搜索的期望值需要可控且可预期的基线顺序——真实环境集合
 *   条数不定（本模块也**没有**路由那样的「复制」按钮可补齐行数），走 mock 既不依赖环境数据、
 *   又能保证「筛选后可视下标 ≠ 源下标」这类判别力；全程零写请求，集合不被污染。
 * - 只做 UI 交互，不点「提交并生效」；用 trackAiContextRuleRequests 证明无 PUT。
 * - 就绪判定：先注册**数据接口**响应等待（排除同名文档请求）再导航，最后断言 `.ai-context` 根可见
 *   （见 `openRulesWithMock`），不使用「固定沉降时间 + 默认超时」的碰运气窗口。
 *
 * 已知阻塞（2026-10-16 验证，产品缺陷，非用例问题）→ **2026-10-17 已修复**：
 * - AX-DR-01 第 5 条、AX-DR-05 第 4 条断言的「退出编辑模式后数据行 `draggable` 属性被回收」曾实测不成立：
 *   行始终保留 `draggable="true"`（`Expected: null / Received: "true"`），页面确已回到视图模式。
 *   根因方向见 `docs/ai-context/02-功能测试用例/07-拖拽排序与离开拦截.md` 的「阻塞记录」。
 *   断言按源码应有行为**原样保留**（不加轮询 / 重试 / 放宽），产品修复后自然转绿。
 * - 修复（2026-10-17）：`src/components/table/pageTable.vue` 新增 `draggable` 的 watch，退出可拖拽态时
 *   清掉行上残留的 `draggable` 属性；实测退出编辑模式后行 `draggable` = `[null,null,null]`
 *   （修复前全为 `"true"`，5 秒后仍不回收）。记录见 `ai-gateway-web/design-docs/modifications/`
 *   的 `2026-10-17-ui-defect-fixes/`。
 *
 * 运行：nvm use 18 && npx playwright test tests/ai-context/test_07_ai_context_drag_leave.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const P = utils.DOC_AI_CONTEXT_PAGE;
const R = utils.DOC_AI_CONTEXT_RULES;

/** 列排序 / 列搜索均落在「生效条件」列（cond 即规则身份，首列） */
const COND_COLUMN = R.tableHeaders[0];

/**
 * 受控基线集合（数组顺序即优先级顺序，cond 即身份）
 * - A 是 C 的前缀子串：列搜索用 A 可只命中 A / C 两行（2/3 行 → 可视下标 ≠ 源下标）；
 * - A、C 以 `req_path_in` 开头，B 以 `default_t` 开头：按「生效条件」倒序后 B 落到末行，
 *   排序态的可视首行来自基线源下标 2（≠ 可视下标 0）。
 */
const COND_A = 'req_path_in("/v1/chat/completions", false)';
const COND_B = 'default_t()';
const COND_C =
  'req_path_in("/v1/chat/completions", false) && req_method_in("POST")';
const BASELINE_CONDS = [COND_A, COND_B, COND_C];

/** 受控集合（buildTestRule 补齐 mode / 两 token 字段，cond 由基线指定） */
function baselineRules() {
  return BASELINE_CONDS.map((cond) => utils.buildTestRule({ cond }));
}

/** 复刻 pageTable 的列搜索语义：忽略大小写的包含匹配（在 `cond` 原始取值上比较） */
function filterCondsByKeyword(conds, keyword) {
  return conds.filter((cond) =>
    cond.toUpperCase().includes(keyword.toUpperCase()),
  );
}

/** 从 cond 里挑一个「能筛出多行、又不会命中全部行」的整串子串（与测试用例的搜索场景一致） */
function pickFilterableKeyword(conds) {
  const candidates = [...conds].sort((a, b) => a.length - b.length);
  for (const candidate of candidates) {
    const hits = filterCondsByKeyword(conds, candidate);
    if (hits.length >= 2 && hits.length < conds.length) {
      return candidate;
    }
  }
  return null;
}

/**
 * 注入受控集合并落到「已挂载」的压缩规则 Tab（视图模式），返回基线生效次序。
 *
 * 就绪判定刻意不依赖 `gotoAiContextPageAndWaitForRules` 内部的宽谓词等待（它会被**同名的文档请求**
 * 提前满足，见 `isRulesDataGetResponse` 注释），而是：
 *   ① 先注册「数据接口」响应等待（排除 document）→ ② 再导航 → ③ 断言 `.ai-context` 根可见。
 * 这样「受控集合已注入」与「组件已挂载」都是确定性信号，不存在靠固定沉降时间碰运气的窗口。
 */
async function openRulesWithMock(page) {
  await utils.ensureAppSession(page);
  await utils.mockRulesGetResponse(page, { rules: baselineRules() });
  await utils.waitForRulesDataGetResponse(page, () =>
    utils.gotoAiContextPageAndWaitForRules(page),
  );
  await utils.expectAiContextPageMounted(page);
  await utils.expectAiContextPageReady(page);
  const baseline = await utils.getRuleCondsInOrder(page);
  expect(baseline, '受控集合的展示次序应与注入顺序一致').toEqual(
    BASELINE_CONDS,
  );
  return baseline;
}

/** 注入受控集合并进入编辑模式，返回基线生效次序 */
async function openRulesInEditMode(page) {
  const baseline = await openRulesWithMock(page);
  await utils.enterEditMode(page);
  await utils.expectEditMode(page);
  return baseline;
}

test.describe('AI 上下文压缩 - AX-DR-01 拖拽提示与行可拖拽属性随模式切换', () => {
  test('视图模式无拖拽提示且行不可拖拽；编辑模式出现提示「拖动表格可修改生效次序」且行可拖拽', async ({
    page,
  }) => {
    await test.step('前置：注入 3 条受控规则并停留在视图模式', async () => {
      await openRulesWithMock(page);
      await utils.expectViewMode(page);
    });

    await test.step('1. 视图模式：无拖拽提示条，数据行不含 draggable 属性', async () => {
      await utils.expectRulesDragTipVisible(page, false);
      await utils.expectRuleRowsDraggable(page, false);
      await utils.expectRuleRowsCursorStyle(page, null);
    });

    await test.step('2. 进入编辑模式：提示条出现且文案正确，数据行 draggable=true', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.expectRulesDragTipVisible(page, true);
      await utils.expectRuleRowsDraggable(page, true);
      // 可拖拽行鼠标指针为「小手」
      await utils.expectRuleRowsCursorStyle(page, 'grab');
    });

    await test.step('3. 退出编辑模式（本地无改动，不弹确认）：提示条与 draggable 属性一并回收', async () => {
      await utils.clickExitEditMode(page);
      await expect(utils.modal(page).visible()).toHaveCount(0);
      await utils.expectViewMode(page);
      await utils.expectRulesDragTipVisible(page, false);
      // 2026-10-17 产品已修（pageTable 退出可拖拽态时回收行属性），此断言应通过
      await utils.expectRuleRowsDraggable(page, false);
      await utils.expectRuleRowsCursorStyle(page, null);
    });
  });
});

test.describe('AI 上下文压缩 - AX-DR-02 拖拽到目标行', () => {
  test('拖拽首行到第 3 行：落到第 3 行的原下标，「提交并生效」由置灰变可用；拖回原位后重新置灰', async ({
    page,
  }) => {
    const tracker = utils.trackAiContextRuleRequests(page);
    let baseline = [];

    try {
      await test.step('前置：注入 3 条受控规则并进入编辑模式（无改动 → 提交并生效置灰）', async () => {
        baseline = await openRulesInEditMode(page);
        await utils.expectSubmitAndEffectDisabled(page, true);
      });

      await test.step('1. 拖拽首行到第 3 行：首行移动到第 3 行的原下标处', async () => {
        await utils.dragRuleRow(page, 0, 2);
        await utils.expectRuleCondsInOrder(
          page,
          utils.moveRuleToIndex(baseline, 0, 2),
        );
      });

      await test.step('2. 产生本地变更：「提交并生效」由置灰变可用', async () => {
        await utils.expectSubmitAndEffectDisabled(page, false);
      });

      await test.step('3. 拖回原位：次序回到基线，「提交并生效」重新置灰', async () => {
        await utils.dragRuleRow(page, 2, 0);
        await utils.expectRuleCondsInOrder(page, baseline);
        await utils.expectSubmitAndEffectDisabled(page, true);
      });

      await test.step('4. 拖拽全程只改本地集合，未发起任何 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });
});

test.describe('AI 上下文压缩 - AX-DR-03 列排序激活时拖拽按源下标移动', () => {
  test('列排序激活时拖拽：按源下标移动正确的规则', async ({ page }) => {
    let baseline = [];
    let visualOrder = [];

    await test.step('前置：注入 3 条受控规则并进入编辑模式', async () => {
      baseline = await openRulesInEditMode(page);
    });

    await test.step('1. 按「生效条件」倒序排序，记录可视顺序', async () => {
      await utils.sortRuleTableByColumn(page, COND_COLUMN, 'desc');
      visualOrder = await utils.getRuleCondsInOrder(page);
      expect(
        visualOrder.slice().sort().join('|'),
        '列排序改变了展示集合，无法验证排序态拖拽',
      ).toBe(baseline.slice().sort().join('|'));
      expect(
        visualOrder,
        '列排序未改变可视顺序，无法验证排序态拖拽',
      ).not.toEqual(baseline);
      expect(
        baseline.indexOf(visualOrder[0]),
        '排序态可视首行应来自非首个源下标，否则场景无判别力',
      ).not.toBe(0);
    });

    await test.step('2. 拖拽可视首行到可视末行：落到可视末行的原下标处', async () => {
      const sourceIndexOfFirst = baseline.indexOf(visualOrder[0]);
      const sourceIndexOfLast = baseline.indexOf(
        visualOrder[visualOrder.length - 1],
      );
      expect(sourceIndexOfFirst).toBeGreaterThanOrEqual(0);
      expect(sourceIndexOfLast).toBeGreaterThanOrEqual(0);

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
      await utils.expectRuleCondsInOrder(page, expectedOrder);

      if (
        JSON.stringify(expectedOrder) !== JSON.stringify(visuallyIndexedOrder)
      ) {
        // 负向对照：若按可视下标派发，移动的将是另一条规则
        expect(
          await utils.getRuleCondsInOrder(page),
          '排序态下移动的规则不是可视首行对应的规则',
        ).not.toEqual(visuallyIndexedOrder);
      }
    });
  });
});

test.describe('AI 上下文压缩 - AX-DR-03 列搜索激活时拖拽按源下标移动', () => {
  test('列搜索筛选激活时拖拽：按源下标移动正确的规则', async ({ page }) => {
    let baseline = [];

    await test.step('前置：注入 3 条受控规则并进入编辑模式', async () => {
      baseline = await openRulesInEditMode(page);
    });

    await test.step('1. 按生效条件子串搜索，仅展示命中的行', async () => {
      const keyword = pickFilterableKeyword(baseline);
      expect(
        keyword,
        '生效条件之间无可用作筛选的子串，无法构造列搜索场景',
      ).toBeTruthy();
      await utils.searchRuleTableByColumn(page, COND_COLUMN, keyword);
      await utils.expectRuleCondsInOrder(
        page,
        filterCondsByKeyword(baseline, keyword),
      );
    });

    await test.step('2. 拖拽可视首行到可视末行：落到可视末行的原下标处', async () => {
      const visualOrder = await utils.getRuleCondsInOrder(page);
      expect(visualOrder.length).toBeGreaterThanOrEqual(2);
      const sourceIndexOfFirst = baseline.indexOf(visualOrder[0]);
      const sourceIndexOfLast = baseline.indexOf(
        visualOrder[visualOrder.length - 1],
      );
      expect(sourceIndexOfFirst).toBeGreaterThanOrEqual(0);
      expect(
        sourceIndexOfLast,
        '筛选态可视末行应来自非末个可视下标，否则场景无判别力',
      ).not.toBe(visualOrder.length - 1);

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
      await utils.searchRuleTableByColumn(page, COND_COLUMN, '');
      await utils.expectRuleCondsInOrder(page, expectedOrder);

      if (
        JSON.stringify(expectedOrder) !== JSON.stringify(visuallyIndexedOrder)
      ) {
        // 负向对照：若按可视下标派发，移动的将是另一条规则
        expect(
          await utils.getRuleCondsInOrder(page),
          '筛选态下移动的规则不是可视首行对应的规则',
        ).not.toEqual(visuallyIndexedOrder);
      }
    });
  });
});

test.describe('AI 上下文压缩 - AX-DR-04 离开页面拦截', () => {
  test('编辑模式有未提交改动时点侧栏其它菜单：弹二次确认，取消留在本页（URL 不变）、确定跳走', async ({
    page,
  }) => {
    let entryUrl = '';
    let draggedOrder = [];

    await test.step('前置：注入 3 条受控规则，进入编辑模式并拖拽制造未提交改动', async () => {
      const baseline = await openRulesInEditMode(page);
      await utils.dragRuleRow(page, 0, 2);
      draggedOrder = utils.moveRuleToIndex(baseline, 0, 2);
      await utils.expectRuleCondsInOrder(page, draggedOrder);
      entryUrl = utils.currentUrl(page);
      expect(entryUrl, '前置应停留在 AI 上下文压缩页').toContain(
        utils.AI_CONTEXT_PATH,
      );
    });

    await test.step('1. 点侧栏其它模块菜单：弹出离开拦截确认框（信息提示 + 统一退出确认文案）', async () => {
      await utils.clickSidebarMenuToLeave(page);
      await utils.expectLeaveConfirmModal(page);
    });

    await test.step('2. 点「取消」：留在本页（URL 不变），编辑态与未提交改动均保留', async () => {
      await utils.cancelLeaveModal(page);
      await utils.expectUrlUnchanged(page, entryUrl, '取消离开拦截');
      await expect(utils.modal(page).visible()).toHaveCount(0);
      await utils.expectEditMode(page);
      await utils.expectRuleCondsInOrder(page, draggedOrder);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('3. 再次点侧栏菜单并点「确定」：跳离本页', async () => {
      await utils.clickSidebarMenuToLeave(page);
      await utils.expectLeaveConfirmModal(page);
      await utils.confirmLeaveModal(page);
      await utils.expectNavigatedAwayFromAiContext(page);
    });
  });
});

test.describe('AI 上下文压缩 - AX-DR-05 退出编辑模式二次确认', () => {
  test('有改动时退出弹确认、确定回滚到快照并提示「已退出编辑模式」；无改动时不弹确认直接回视图', async ({
    page,
  }) => {
    let baseline = [];

    await test.step('前置：注入 3 条受控规则，进入编辑模式并拖拽制造未提交改动', async () => {
      baseline = await openRulesInEditMode(page);
      await utils.dragRuleRow(page, 0, 2);
      await utils.expectRuleCondsInOrder(
        page,
        utils.moveRuleToIndex(baseline, 0, 2),
      );
    });

    await test.step('1. 点「退出编辑模式」：弹出二次确认框（信息提示 + 统一退出确认文案）', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
    });

    await test.step('2. 点「确定」：提示「已退出编辑模式」，次序回滚到快照并回到视图模式', async () => {
      await utils.expectAiContextMessageDuringAction(page, P.exitDoneMsg, () =>
        utils.confirmExitEditMode(page),
      );
      await utils.expectViewMode(page);
      await utils.expectRuleCondsInOrder(page, baseline);
      await utils.expectRulesDragTipVisible(page, false);
      // 2026-10-17 产品已修（pageTable 退出可拖拽态时回收行属性），此断言应通过
      await utils.expectRuleRowsDraggable(page, false);
    });

    await test.step('3. 再次进入编辑模式但不做改动，点「退出编辑模式」：不弹确认，直接回视图模式', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.clickExitEditMode(page);
      await page.waitForTimeout(500);
      await expect(utils.modal(page).visible()).toHaveCount(0);
      await utils.expectViewMode(page);
      await utils.expectRuleCondsInOrder(page, baseline);
      // 二次进入再退出同样要回收行属性（此前该分支只查 modal 与次序）
      await utils.expectRulesDragTipVisible(page, false);
      await utils.expectRuleRowsDraggable(page, false);
    });
  });
});