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
 * 意图配置 - 保存并发布
 * 用例：IC-P-01 ~ IC-P-07（docs/intent-config/02-功能测试用例/03-问题查看与发布.md §4）
 *
 * 说明：「保存并发布」为单例整体 PUT 覆盖；提交体结构以 saveConfigAndCapture 抓取请求体逐字段核对；
 * IC-P-05 失败场景通过 Mock PUT 500 覆盖；IC-P-07 防重通过 holdIntentConfigPut 挂起响应；
 * afterEach 恢复单例原始状态。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/intent-config/IntentConfigPage');

const cleanup = utils.createIntentConfigTestCleanup();
const P = utils.DOC_INTENT_CONFIG_PAGE;
const Q = utils.DOC_INTENT_CONFIG_QUESTIONS;

/** 公共前置：API 造数 → 进入页面 → 编辑模式 */
async function enterEditModeWithPublishedConfig(page, questions = [], minConfidence = 0.6) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  await utils.ensureIntentConfigPublishedViaApi(page, { minConfidence, questions });
  await utils.gotoIntentConfigPageAndWaitForConfig(page);
  await utils.enterEditMode(page);
}

/** 通过抽屉新增一个合法 choice 问题（本地草稿） */
async function addChoiceQuestionViaDrawer(page, name) {
  await utils.openAddQuestionDrawer(page);
  await utils.fillQuestionName(page, name);
  await utils.fillQuestionInstructions(page, '这条请求属于哪类研发任务？');
  await utils.clickAddOption(page);
  await utils.fillOptionRow(page, 0, 'coding', '编写或修改代码');
  await utils.submitQuestionFormExpectMessage(
    page,
    utils.DOC_INTENT_CONFIG_FORM.addSuccessMsg,
  );
  await utils.expectQuestionFormDrawerHidden(page);
}

test.describe('意图配置 - 保存并发布', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockIntentConfigNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('IC-P-01 保存并发布整体PUT成功回视图模式', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_p01_');

    await test.step('前置：进入编辑模式，修改全局阈值并新增一个问题', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.fillGlobalThreshold(page, 0.75);
      await addChoiceQuestionViaDrawer(page, name);
      await utils.expectQuestionRowVisible(page, name);
    });

    await test.step('点击「保存并发布」：整体 PUT 返回 200', async () => {
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response).not.toBeNull();
      expect(response.status()).toBe(200);
      expect(payload.min_confidence).toBe(0.75);
      expect(payload.questions).toHaveLength(1);
      expect(payload.questions[0].name).toBe(name);
    });

    await test.step('成功提示并回到视图模式，重新 GET 回填最新值', async () => {
      await utils.expectIntentConfigMessage(page, P.publishSuccessMsg);
      await utils.expectViewMode(page);
      await utils.expectGlobalThresholdText(page, '0.75');
      await utils.expectQuestionRowVisible(page, name);
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.published).toBe(true);
      expect(api.data.min_confidence).toBe(0.75);
      expect(api.data.questions).toHaveLength(1);
    });
  });

  test('IC-P-02 提交体结构校验', async ({ page }) => {
    const choiceName = utils.generateTestQuestionName('ic_p02c_');
    const scoreName = utils.generateTestQuestionName('ic_p02s_');
    const choice = utils.buildTestChoiceQuestion({ name: choiceName });
    const score = utils.buildTestScoreQuestion({
      name: scoreName,
      min_confidence: 0.7,
    });

    await test.step('前置：发布 choice + score 各一题，进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page, [choice, score], 0.6);
    });

    let payload;
    await test.step('编辑 choice 判定说明（带前后空格），保存后抓取 PUT 请求体', async () => {
      await utils.openEditQuestionDrawer(page, choiceName);
      await utils.fillQuestionInstructions(page, '  带空格的判定说明  ');
      await utils.submitQuestionFormExpectMessage(
        page,
        utils.DOC_INTENT_CONFIG_FORM.savedSuccessMsg,
      );
      const captured = await utils.saveConfigAndCapture(page);
      expect(captured.response.status()).toBe(200);
      payload = captured.payload;
      expect(Object.keys(payload).sort()).toEqual(['min_confidence', 'questions']);
      expect(payload.min_confidence).toBe(0.6);
      expect(payload.questions).toHaveLength(2);
    });

    await test.step('choice 问题：criteria 为 map 且不含 levels，文本已 trim', async () => {
      const choiceItem = payload.questions.find((q) => q.type === 'choice');
      expect(choiceItem.name).toBe(choiceName);
      expect(choiceItem.instructions).toBe('带空格的判定说明');
      expect(choiceItem.criteria).toEqual({
        coding: '编写或修改代码',
        qa: '问答与检索',
      });
      expect(choiceItem.levels).toBeUndefined();
      expect(choiceItem.min_confidence).toBeUndefined();
    });

    await test.step('score 问题：levels 为数组且不含 criteria，覆盖阈值附加 min_confidence', async () => {
      const scoreItem = payload.questions.find((q) => q.type === 'score');
      expect(scoreItem.name).toBe(scoreName);
      expect(scoreItem.levels).toEqual([
        { name: 'simple', description: '简单' },
        { name: 'medium', description: '中等' },
        { name: 'complex', description: '复杂' },
      ]);
      expect(scoreItem.criteria).toBeUndefined();
      expect(scoreItem.min_confidence).toBe(0.7);
    });
  });

  test('IC-P-03 空问题数组停用软开关', async ({ page }) => {
    const question = utils.buildTestChoiceQuestion();

    await test.step('前置：发布 1 个问题，进入编辑模式并本地删除全部问题', async () => {
      await enterEditModeWithPublishedConfig(page, [question]);
      await utils.clickQuestionDelete(page, question.name);
      await utils.expectDeleteConfirmModal(page);
      await utils.confirmDeleteQuestion(page);
      await utils.expectQuestionTableEmpty(page);
    });

    await test.step('提交体 questions: []，PUT 返回 200', async () => {
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response.status()).toBe(200);
      expect(payload.questions).toEqual([]);
    });

    await test.step('回到视图模式，GET 仍 200 且 questions: []（非 404）', async () => {
      await utils.expectViewMode(page);
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.published).toBe(true);
      expect(api.data.questions).toEqual([]);
      await utils.expectQuestionsCardTitle(page, 0);
      await utils.expectQuestionTableEmpty(page);
      await utils.expectNoUnpublishedTip(page);
    });
  });

  test('IC-P-04 发布成功提示与回填', async ({ page }) => {
    await test.step('前置：进入编辑模式并修改全局阈值为 0.8', async () => {
      await enterEditModeWithPublishedConfig(page, [], 0.6);
      await utils.fillGlobalThreshold(page, 0.8);
    });

    await test.step('提示「保存并发布成功！」并回到视图模式', async () => {
      await utils.saveConfigExpectMessage(page, P.publishSuccessMsg);
      await utils.expectViewMode(page);
    });

    await test.step('回填为服务端最新值（全局 0.8、问题列表 0 条）', async () => {
      await utils.expectGlobalThresholdText(page, '0.8');
      await utils.expectQuestionsCardTitle(page, 0);
      await utils.expectQuestionTableEmpty(page);
    });
  });

  test('IC-P-05 发布失败提示', async ({ page }) => {
    await test.step('前置：进入编辑模式并修改阈值；Mock PUT 500', async () => {
      await enterEditModeWithPublishedConfig(page, [], 0.6);
      await utils.fillGlobalThreshold(page, 0.88);
      await utils.mockIntentConfigPutFailure(page, { status: 500 });
    });

    await test.step('提示「提交失败!」，保持编辑模式且改动保留', async () => {
      await utils.clickSaveAndPublish(page);
      await utils.expectIntentConfigMessage(page, P.submitFailedMsg);
      await utils.expectEditMode(page);
      await utils.expectGlobalThresholdInputValue(page, '0.88');
    });

    await test.step('还原 Mock，避免影响后续用例', async () => {
      await utils.unmockIntentConfigNetwork(page);
    });
  });

  test('IC-P-06 全局与单问题阈值同时提交', async ({ page }) => {
    const overrideName = utils.generateTestQuestionName('ic_p06o_');
    const inheritName = utils.generateTestQuestionName('ic_p06i_');
    const withOverride = utils.buildTestChoiceQuestion({
      name: overrideName,
      min_confidence: 0.7,
    });
    const inherit = utils.buildTestScoreQuestion({ name: inheritName });

    await test.step('前置：发布全局 0.6 + 覆盖问题 0.7 + 未覆盖问题', async () => {
      await enterEditModeWithPublishedConfig(
        page,
        [withOverride, inherit],
        0.6,
      );
    });

    await test.step('抓取请求体：顶层 0.6，覆盖问题带 0.7，未覆盖不带该字段', async () => {
      const { payload } = await utils.saveConfigAndCapture(page);
      expect(payload.min_confidence).toBe(0.6);
      const overrideItem = payload.questions.find((q) => q.name === overrideName);
      const inheritItem = payload.questions.find((q) => q.name === inheritName);
      expect(overrideItem.min_confidence).toBe(0.7);
      expect(inheritItem.min_confidence).toBeUndefined();
    });

    await test.step('回填后查看抽屉：覆盖展示 0.7，未覆盖展示「使用全局门限（0.6）」', async () => {
      await utils.expectViewMode(page);
      await utils.openViewQuestionDrawer(page, overrideName);
      await utils.expectViewDrawerFieldValue(page, '最小置信度覆盖', '0.7');
      await utils.closeViewQuestionDrawer(page);
      await utils.openViewQuestionDrawer(page, inheritName);
      await utils.expectViewDrawerFieldValue(
        page,
        '最小置信度覆盖',
        Q.useGlobalThreshold('0.6'),
      );
    });
  });

  test('IC-P-07 保存并发布防重', async ({ page }) => {
    const tracker = utils.trackIntentConfigRequests(page);
    let releasePut;
    const putGate = new Promise((resolve) => {
      releasePut = resolve;
    });

    try {
      await test.step('前置：进入编辑模式并挂起 PUT 响应', async () => {
        await enterEditModeWithPublishedConfig(page);
        await utils.holdIntentConfigPut(page, putGate);
      });

      await test.step('首次点击后按钮 loading，请求挂起期间重复点击仅一次 PUT', async () => {
        await utils.clickSaveAndPublish(page);
        // 请求被挂起：按钮应持续处于 loading 态（:loading="submitting"）。
        // 注意 loading 图标会改变按钮可访问名，须用 class 定位轮询（见 pages 封装）。
        let btnClass = '';
        for (let i = 0; i < 25; i++) {
          btnClass = await utils
            .getSaveAndPublishButtonClass(page)
            .catch(() => '');
          if ((btnClass || '').includes('ivu-btn-loading')) {
            break;
          }
          await page.waitForTimeout(200);
        }
        expect(btnClass).toContain('ivu-btn-loading');
        expect(tracker.state.put, '首次点击产生一次 PUT').toBe(1);
        // loading 态按钮 pointer-events:none，真实重复点击被拦截，不产生第二次 PUT
        try {
          await utils.clickSaveAndPublish(page);
        } catch (e) {
          // 预期被拦截（元素不可点）
        }
        await page.waitForTimeout(500);
        expect(tracker.state.put, '重复点击不产生第二次 PUT').toBe(1);
      });

      await test.step('放行后 loading 解除并发布成功回视图模式', async () => {
        releasePut();
        await utils.expectIntentConfigMessage(page, P.publishSuccessMsg, 15000);
        await utils.expectViewMode(page);
      });
    } finally {
      tracker.stop();
      releasePut();
    }
  });
});
