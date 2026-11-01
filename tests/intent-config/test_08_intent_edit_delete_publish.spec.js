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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 意图配置 - 编辑/删除到发布的闭环、trim 口径、阈值边界、并发覆盖
 * 用例：IC-P-08、IC-V-18、IC-V-19、IC-CC-01、IC-L-17
 * 文档：docs/intent-config/02-功能测试用例/03-问题查看与发布.md §4/§5、
 *       04-字段校验矩阵.md、01-全局配置与双模式.md
 *
 * 审计背景（2026-11-01，intent-config 深度审计）：
 * - 既有用例在抽屉内保存后**只做本地断言并显式断言「未发 PUT」**（IC-Q-05/IC-Q-17），
 *   缺「本地编辑 → 保存并发布 → 接口回读」闭环（IC-P-08）。
 * - 判重与提交都按 trim 后处理，但只用精确同名验证（IC-V-18）。
 * - 覆盖率/门限只测 0.7 合法与 1.5 非法，0/1 两个合法边界未覆盖（IC-V-19）。
 * - 单例整体 PUT 的并发语义（last-write-wins）无用例（IC-CC-01，横切缺口 H-2）。
 * - 未发布→首次发布后「尚未发布」提示消失未覆盖（IC-L-17）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/intent-config/IntentConfigPage');

const cleanup = utils.createIntentConfigTestCleanup();
const P = utils.DOC_INTENT_CONFIG_PAGE;
const Q = utils.DOC_INTENT_CONFIG_QUESTIONS;
const F = utils.DOC_INTENT_CONFIG_FORM;
const V = utils.DOC_INTENT_CONFIG_VALIDATION;
const FIELD_OVERRIDE = '最小置信度覆盖';

async function enterEditModeWithPublishedConfig(page, questions = [], minConfidence = 0.6) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  await utils.ensureIntentConfigPublishedViaApi(page, { minConfidence, questions });
  await utils.gotoIntentConfigPageAndWaitForConfig(page);
  await utils.enterEditMode(page);
}

async function addChoiceQuestionViaDrawer(page, name, instructions = '这条请求属于哪类研发任务？') {
  await utils.openAddQuestionDrawer(page);
  await utils.fillQuestionName(page, name);
  await utils.fillQuestionInstructions(page, instructions);
  await utils.clickAddOption(page);
  await utils.fillOptionRow(page, 0, 'coding', '编写或修改代码');
  await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
  await utils.expectQuestionFormDrawerHidden(page);
}

test.describe('意图配置 - 编辑/删除到发布闭环与边界', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockIntentConfigNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('IC-P-08 编辑与删除问题后保存并发布，PUT 与接口回读反映增删改', async ({
    page,
  }) => {
    const nameA = utils.generateTestQuestionName('ic_p08a_');
    const nameB = utils.generateTestQuestionName('ic_p08b_');
    const nameC = utils.generateTestQuestionName('ic_p08c_');

    await test.step('前置：已发布 A、B 两个问题，进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page, [
        utils.buildTestChoiceQuestion({ name: nameA, instructions: '原始说明A' }),
        utils.buildTestChoiceQuestion({ name: nameB, instructions: '原始说明B' }),
      ]);
      await utils.expectQuestionRowCount(page, 2);
      await utils.expectQuestionsCardTitle(page, 2);
    });

    await test.step('编辑 A 的判定说明（抽屉内保存，本地生效）', async () => {
      await utils.openEditQuestionDrawer(page, nameA);
      await utils.fillQuestionInstructions(page, '更新后的说明A');
      await utils.submitQuestionFormExpectMessage(page, F.savedSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionCellText(page, nameA, Q.columnIndex.instructions, '更新后的说明A');
    });

    await test.step('删除 B（确认），行与计数同步减少', async () => {
      await utils.clickQuestionDelete(page, nameB);
      await utils.expectDeleteConfirmModal(page);
      await utils.expectIntentConfigMessageDuringAction(page, P.deleteDoneMsg, () =>
        utils.confirmDeleteQuestion(page),
      );
      await utils.expectQuestionRowHidden(page, nameB);
      await utils.expectQuestionRowCount(page, 1);
      await utils.expectQuestionsCardTitle(page, 1);
    });

    await test.step('新增 C（抽屉内保存），计数回到 2', async () => {
      await addChoiceQuestionViaDrawer(page, nameC);
      await utils.expectQuestionRowCount(page, 2);
      await utils.expectQuestionsCardTitle(page, 2);
    });

    await test.step('保存并发布：PUT 体为「A（新说明）+ C」，不含 B', async () => {
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response).not.toBeNull();
      expect(response.status()).toBe(200);
      const names = payload.questions.map((q) => q.name);
      expect(names).toEqual([nameA, nameC]);
      expect(names).not.toContain(nameB);
      const itemA = payload.questions.find((q) => q.name === nameA);
      expect(itemA.instructions).toBe('更新后的说明A');
    });

    await test.step('GET 回读与视图模式展示一致', async () => {
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.published).toBe(true);
      expect(api.data.questions.map((q) => q.name)).toEqual([nameA, nameC]);
      expect(
        api.data.questions.find((q) => q.name === nameA).instructions,
      ).toBe('更新后的说明A');
      await utils.expectViewMode(page);
      await utils.expectQuestionRowVisible(page, nameA);
      await utils.expectQuestionRowVisible(page, nameC);
      await utils.expectQuestionRowHidden(page, nameB);
      await utils.expectQuestionsCardTitle(page, 2);
    });
  });

  test('IC-V-18 问题名称按 trim 后判重，保存时名称与说明去首尾空格', async ({
    page,
  }) => {
    const base = utils.generateTestQuestionName('ic_v18_');
    const fresh = utils.generateTestQuestionName('ic_v18b_');

    await test.step('前置：已存在问题 base，进入编辑模式打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page, [
        utils.buildTestChoiceQuestion({ name: base }),
      ]);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionInstructions(page, '判重说明');
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'coding', '代码');
    });

    await test.step('名称前后加空格后与 base 相同：判重拦截', async () => {
      await utils.fillQuestionName(page, `  ${base}  `);
      await utils.expectIntentConfigMessageDuringAction(page, V.questionNameDuplicate, () =>
        utils.clickQuestionFormSave(page),
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('改为新名称（仍带空格）保存成功，列表展示 trim 后名称', async () => {
      await utils.fillQuestionName(page, `  ${fresh}  `);
      await utils.fillQuestionInstructions(page, '  去首尾空格的说明  ');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, fresh);
    });

    await test.step('保存并发布：PUT 中名称与说明已 trim', async () => {
      const { payload } = await utils.saveConfigAndCapture(page);
      const item = payload.questions.find((q) => q.name === fresh);
      expect(item, 'PUT 中应存在 trim 后的新问题').toBeTruthy();
      expect(item.instructions).toBe('去首尾空格的说明');
      const names = payload.questions.map((q) => q.name);
      expect(names).toEqual([base, fresh]);
    });
  });

  test('IC-V-19 单问题最小置信度覆盖 0 与 1 边界合法且按原值提交/展示', async ({
    page,
  }) => {
    const name0 = utils.generateTestQuestionName('ic_v19a_');
    const name1 = utils.generateTestQuestionName('ic_v19b_');

    await test.step('前置：进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page);
    });

    await test.step('覆盖填 0：保存成功', async () => {
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name0);
      await utils.fillQuestionInstructions(page, '覆盖阈值 0 的判定说明');
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'coding', '代码');
      await utils.fillQuestionOverride(page, 0);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name0);
    });

    await test.step('覆盖填 1：保存成功', async () => {
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name1);
      await utils.fillQuestionInstructions(page, '覆盖阈值 1 的判定说明');
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'coding', '代码');
      await utils.fillQuestionOverride(page, 1);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name1);
    });

    await test.step('保存并发布：PUT 保留 0 与 1（不被当作未设置丢弃）', async () => {
      const { payload } = await utils.saveConfigAndCapture(page);
      const item0 = payload.questions.find((q) => q.name === name0);
      const item1 = payload.questions.find((q) => q.name === name1);
      expect(item0.min_confidence, '覆盖 0 应原样提交').toBe(0);
      expect(item1.min_confidence, '覆盖 1 应原样提交').toBe(1);
    });

    await test.step('查看抽屉：0 展示「0」而非「使用全局门限」', async () => {
      await utils.openViewQuestionDrawer(page, name0);
      await utils.expectViewDrawerFieldValue(page, FIELD_OVERRIDE, '0');
      await utils.closeViewQuestionDrawer(page);
      await utils.openViewQuestionDrawer(page, name1);
      await utils.expectViewDrawerFieldValue(page, FIELD_OVERRIDE, '1');
      await utils.closeViewQuestionDrawer(page);
    });
  });

  test('IC-CC-01 他人先发布的配置被本次保存整集合覆盖（last-write-wins）', async ({
    page,
  }) => {
    const mine = utils.generateTestQuestionName('ic_cc01a_');
    const theirs = utils.generateTestQuestionName('ic_cc01b_');

    await test.step('前置：以问题 mine 进入编辑模式（本地快照已就绪）', async () => {
      await enterEditModeWithPublishedConfig(page, [
        utils.buildTestChoiceQuestion({ name: mine }),
      ]);
      await utils.expectQuestionRowVisible(page, mine);
    });

    await test.step('编辑模式期间「他人」通过接口发布另一版配置', async () => {
      const ok = await utils.putIntentConfigViaApi(page, {
        min_confidence: 0.5,
        questions: [utils.buildTestScoreQuestion({ name: theirs })],
      });
      expect(ok, '模拟他人发布应成功').toBe(true);
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.data.questions.map((q) => q.name)).toEqual([theirs]);
      // 页面未刷新，本地仍是进入编辑时的快照
      await utils.expectQuestionRowVisible(page, mine);
    });

    await test.step('本地保存并发布：整体覆盖为本地快照，他人版本丢失', async () => {
      const { payload } = await utils.saveConfigAndCapture(page);
      expect(payload.questions.map((q) => q.name)).toEqual([mine]);
      expect(payload.min_confidence, '全局阈值同样取本地快照 0.6').toBe(0.6);
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.data.questions.map((q) => q.name)).toEqual([mine]);
      expect(api.data.min_confidence).toBe(0.6);
      await utils.expectViewMode(page);
      await utils.expectQuestionRowHidden(page, theirs);
    });
  });

  test('IC-L-17 未发布配置首次发布成功后「尚未发布」提示消失', async ({
    page,
  }) => {
    const name = utils.generateTestQuestionName('ic_l17_');

    await test.step('前置：Mock GET 404 模拟从未发布，页面自动进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.mockIntentConfigGetResponse(page, { status: 404 });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.expectEditMode(page);
      await utils.expectUnpublishedTipVisible(page);
      // 解除 GET Mock，后续保存后由真实接口回填
      await utils.unmockIntentConfigNetwork(page);
    });

    await test.step('配置全局阈值并新增问题后保存并发布', async () => {
      await utils.fillGlobalThreshold(page, 0.7);
      await addChoiceQuestionViaDrawer(page, name);
      await utils.saveConfigExpectMessage(page, P.publishSuccessMsg);
      await utils.expectViewMode(page);
    });

    await test.step('「尚未发布」提示消失，接口已发布', async () => {
      await utils.expectNoUnpublishedTip(page);
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.published).toBe(true);
      expect(api.data.min_confidence).toBe(0.7);
      expect(api.data.questions.map((q) => q.name)).toEqual([name]);
    });
  });
});
