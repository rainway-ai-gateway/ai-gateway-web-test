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
 * 意图配置 - 全局配置与双模式
 * 用例：IC-L-01 ~ IC-L-16（docs/intent-config/02-功能测试用例/01-全局配置与双模式.md）
 *
 * 说明：意图配置为单例共享资源，用例经 API 造数、afterEach 恢复原始状态；
 * IC-L-14 / IC-L-16 通过 Mock GET 覆盖未发布 404 / 加载失败场景，用后 unmock。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/intent-config/IntentConfigPage');

const cleanup = utils.createIntentConfigTestCleanup();
const P = utils.DOC_INTENT_CONFIG_PAGE;
const Q = utils.DOC_INTENT_CONFIG_QUESTIONS;
const COL = Q.columnIndex;

/** 造数：choice + score 各一题（表格/标签/行操作断言共用） */
function buildTwoQuestions() {
  const choice = utils.buildTestChoiceQuestion({
    instructions: '这条请求属于哪类研发任务？',
  });
  const score = utils.buildTestScoreQuestion({
    instructions: '评估请求的复杂度等级',
  });
  return { choice, score, questions: [choice, score] };
}

test.describe('意图配置 - 全局配置与双模式', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockIntentConfigNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('IC-L-01 进入意图配置页（已发布视图模式）', async ({ page }) => {
    const threshold = 0.7;
    const question = utils.buildTestChoiceQuestion();

    await test.step('前置：API 发布测试配置并进入页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {
        minConfidence: threshold,
        questions: [question],
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('页面处于视图模式，无「尚未发布」提示', async () => {
      await utils.expectViewMode(page);
      await utils.expectNoUnpublishedTip(page);
    });

    await test.step('「最小置信度」以纯文案展示接口返回值', async () => {
      await utils.expectGlobalThresholdText(page, String(threshold));
    });
  });

  test('IC-L-02 导航路径与页面描述', async ({ page }) => {
    const { questions } = buildTwoQuestions();

    await test.step('前置：API 发布 2 个问题并进入页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, { questions });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('页头描述与两张 Card 标题', async () => {
      await utils.expectPageDesc(page);
      await utils.expectGlobalCardTitle(page);
      await utils.expectQuestionsCardTitle(page, questions.length);
    });
  });

  test('IC-L-03 视图模式全局阈值纯文案', async ({ page }) => {
    await test.step('前置：发布全局 0.6 并进入页面（视图模式）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {
        minConfidence: 0.6,
        questions: [],
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.expectViewMode(page);
    });

    await test.step('阈值为纯文本 0.6，无输入框，点击无编辑行为', async () => {
      await utils.expectGlobalThresholdPureText(page);
      await utils.expectGlobalThresholdText(page, '0.6');
      await utils.globalCard(page).locator('.ic-global-value').click();
      await page.waitForTimeout(300);
      await utils.expectGlobalThresholdPureText(page);
    });
  });

  test('IC-L-04 问题表格列与分页隐藏', async ({ page }) => {
    const { choice, score, questions } = buildTwoQuestions();

    await test.step('前置：发布非空问题列表（视图模式）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, { questions });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.expectViewMode(page);
    });

    await test.step('表头 4 列：问题名称/类型/判定说明/操作', async () => {
      await utils.expectQuestionTableHeaders(page);
    });

    await test.step('行数据展示名称与判定说明', async () => {
      await utils.expectQuestionCellText(page, choice.name, COL.name, choice.name);
      await utils.expectQuestionCellText(
        page,
        choice.name,
        COL.instructions,
        choice.instructions,
      );
      await utils.expectQuestionCellText(
        page,
        score.name,
        COL.instructions,
        score.instructions,
      );
    });

    await test.step('表格底部分页器隐藏', async () => {
      await utils.expectPaginationHidden(page);
    });
  });

  test('IC-L-05 问题类型标签展示', async ({ page }) => {
    const { choice, score, questions } = buildTwoQuestions();

    await test.step('前置：同时含 choice 与 score 问题（视图模式）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, { questions });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('枚举（choice）Tag 为 primary 主题色', async () => {
      await utils.expectQuestionTypeTag(page, choice.name, Q.typeChoice, 'primary');
    });

    await test.step('评分（score）Tag 为 success 成功色', async () => {
      await utils.expectQuestionTypeTag(page, score.name, Q.typeScore, 'success');
    });
  });

  test('IC-L-06 视图模式行操作仅查看并隐藏添加问题', async ({ page }) => {
    const { choice, questions } = buildTwoQuestions();

    await test.step('前置：发布非空列表（视图模式）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, { questions });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.expectViewMode(page);
    });

    await test.step('「添加问题」在视图模式不可见，行操作仅「查看」', async () => {
      await utils.expectQuestionRowOnlyViewAction(page, choice.name);
      await utils.expectQuestionRowOnlyViewAction(page, questions[1].name);
    });
  });

  test('IC-L-07 进入编辑模式', async ({ page }) => {
    await test.step('前置：已发布配置，进入页面（视图模式）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {});
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.expectViewMode(page);
    });

    await test.step('点击「进入编辑模式」', async () => {
      await utils.enterEditMode(page);
    });

    await test.step('右上角切换为「退出编辑模式」与「保存并发布」', async () => {
      await utils.expectEditMode(page);
    });
  });

  test('IC-L-08 编辑模式按钮与行操作', async ({ page }) => {
    const { choice, score, questions } = buildTwoQuestions();

    await test.step('前置：发布非空列表并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, { questions });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.enterEditMode(page);
    });

    await test.step('右上角「退出编辑模式」+「保存并发布」，无「进入编辑模式」', async () => {
      await utils.expectEditMode(page);
    });

    await test.step('行操作「编辑」+「删除」，无「查看」', async () => {
      await utils.expectQuestionRowEditDeleteActions(page, choice.name);
      await utils.expectQuestionRowEditDeleteActions(page, score.name);
    });
  });

  test('IC-L-09 编辑模式全局阈值可编辑', async ({ page }) => {
    await test.step('前置：发布全局 0.6 并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {
        minConfidence: 0.6,
        questions: [],
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.enterEditMode(page);
    });

    await test.step('阈值展示为可编辑 InputNumber（占位符 0.6）', async () => {
      await utils.expectGlobalThresholdInputAttrs(page);
      await utils.expectGlobalThresholdInputValue(page, '0.6');
    });

    await test.step('修改取值为 0.7', async () => {
      await utils.fillGlobalThreshold(page, 0.7);
      await utils.expectGlobalThresholdInputValue(page, '0.7');
    });
  });

  test('IC-L-10 添加问题按钮位置', async ({ page }) => {
    await test.step('前置：进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {});
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.enterEditMode(page);
    });

    await test.step('「添加问题」位于问题列表表格上方且水平居左', async () => {
      await utils.expectEditMode(page);
      await utils.expectAddQuestionToolbarVisibleAndLeft(page);
    });
  });

  test('IC-L-11 退出编辑模式-未修改', async ({ page }) => {
    await test.step('前置：进入编辑模式且未做任何修改', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {});
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('点击「退出编辑模式」不弹确认框，直接回视图模式', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectNoModal(page);
      await utils.expectViewMode(page);
    });
  });

  test('IC-L-12 退出编辑模式-已修改确认回滚', async ({ page }) => {
    await test.step('前置：发布全局 0.6，进入编辑模式并改为 0.8', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {
        minConfidence: 0.6,
        questions: [],
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.enterEditMode(page);
      await utils.fillGlobalThreshold(page, 0.8);
    });

    await test.step('点击「退出编辑模式」弹确认框', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
    });

    await test.step('「确定」后丢弃改动回滚为 0.6，提示「已退出编辑模式」', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        P.exitDoneMsg,
        async () => {
          await utils.confirmExitEditMode(page);
        },
      );
      await utils.expectViewMode(page);
      await utils.expectGlobalThresholdText(page, '0.6');
    });
  });

  test('IC-L-13 退出编辑模式-已修改取消保留', async ({ page }) => {
    await test.step('前置：进入编辑模式并改为 0.8', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, {
        minConfidence: 0.6,
        questions: [],
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.enterEditMode(page);
      await utils.fillGlobalThreshold(page, 0.8);
    });

    await test.step('「取消」后停留编辑模式且改动保留，提示「已取消退出」', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
      await utils.expectIntentConfigMessageDuringAction(
        page,
        P.exitCancelledMsg,
        async () => {
          await utils.cancelExitEditMode(page);
        },
      );
      await utils.expectEditMode(page);
      await utils.expectGlobalThresholdInputValue(page, '0.8');
    });
  });

  test('IC-L-14 未发布404自动进入编辑模式', async ({ page }) => {
    await test.step('前置：Mock GET 404（从未发布）并进入页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.mockIntentConfigGetResponse(page, { status: 404 });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('渲染默认配置：阈值 0.6、问题列表空（0 / 10）', async () => {
      await utils.expectGlobalThresholdInputValue(page, '0.6');
      await utils.expectQuestionsCardTitle(page, 0);
      await utils.expectQuestionTableEmpty(page);
    });

    await test.step('自动进入编辑模式并展示「尚未发布」提示', async () => {
      await utils.expectEditMode(page);
      await utils.expectUnpublishedTipVisible(page);
    });

    await test.step('还原 Mock，避免影响后续用例', async () => {
      await utils.unmockIntentConfigNetwork(page);
    });
  });

  test('IC-L-15 已发布空问题数组正常展示', async ({ page }) => {
    await test.step('前置：发布 questions: []（已发布非未发布）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.ensureIntentConfigPublishedViaApi(page, { questions: [] });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('视图模式、无「尚未发布」提示、列表空（0 / 10）', async () => {
      await utils.expectViewMode(page);
      await utils.expectNoUnpublishedTip(page);
      await utils.expectQuestionsCardTitle(page, 0);
      await utils.expectQuestionTableEmpty(page);
    });
  });

  test('IC-L-16 加载失败提示', async ({ page }) => {
    await test.step('前置：Mock GET 500（加载失败）并进入页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.mockIntentConfigGetResponse(page, {
        status: 500,
        errMsg: 'internal error',
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('弹出「加载意图配置失败」提示，页面不白屏', async () => {
      await utils.expectIntentConfigMessage(page, P.loadFailedMsg);
      await expect(utils.pageRoot(page)).toBeVisible();
    });

    await test.step('还原 Mock，避免影响后续用例', async () => {
      await utils.unmockIntentConfigNetwork(page);
    });
    // 偏差记录：实现中 mounted 对「未 published（含加载失败）」统一自动进入编辑模式，
    // 与 02 文档「仅 404 触发自动编辑」预期不符，已在测试报告登记（不阻断本断言）。
  });
});
