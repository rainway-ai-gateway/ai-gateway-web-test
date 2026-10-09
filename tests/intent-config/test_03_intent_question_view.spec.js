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
 * 意图配置 - 问题查看
 * 用例：IC-D-01 ~ IC-D-08（docs/intent-config/02-功能测试用例/03-问题查看与发布.md §3）
 *
 * 说明：查看抽屉为只读纯文案（info-row），数据一致性用例（IC-D-08）以 API 响应为基准逐字段核对；
 * IC-D-06 空选项/档位通过 Mock GET 构造异常数据，用后 unmock；afterEach 恢复单例原始状态。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/intent-config/IntentConfigPage');

const cleanup = utils.createIntentConfigTestCleanup();
const P = utils.DOC_INTENT_CONFIG_PAGE;
const Q = utils.DOC_INTENT_CONFIG_QUESTIONS;
const COL = Q.columnIndex;

const FIELD_NAME = '问题名称';
const FIELD_TYPE = '类型';
const FIELD_INSTRUCTIONS = '判定说明';
const FIELD_OVERRIDE = '最小置信度覆盖';

/** 造数：choice（2 选项，qa 描述为空）+ score（3 档，带覆盖 0.7） */
function buildViewQuestions() {
  const choiceName = utils.generateTestQuestionName('ic_d_c_');
  const scoreName = utils.generateTestQuestionName('ic_d_s_');
  const choice = {
    name: choiceName,
    type: 'choice',
    instructions: '这条请求属于哪类研发任务？',
    criteria: { coding: '编写或修改代码', qa: '' },
  };
  const score = {
    name: scoreName,
    type: 'score',
    instructions: '评估请求的复杂度等级',
    levels: [
      { name: 'simple', description: '简单' },
      { name: 'medium', description: '中等' },
      { name: 'complex', description: '复杂' },
    ],
    min_confidence: 0.7,
  };
  return { choice, score, questions: [choice, score] };
}

/** 公共前置：已发布配置 → 进入页面（视图模式） */
async function gotoWithPublishedConfig(page, questions = [], minConfidence = 0.6) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  await utils.ensureIntentConfigPublishedViaApi(page, { minConfidence, questions });
  await utils.gotoIntentConfigPageAndWaitForConfig(page);
  await utils.expectViewMode(page);
}

test.describe('意图配置 - 问题查看', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockIntentConfigNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('IC-D-01 查看问题抽屉只读纯文案', async ({ page }) => {
    const { choice, questions } = buildViewQuestions();

    await test.step('前置：发布配置（视图模式），点击「查看」', async () => {
      await gotoWithPublishedConfig(page, questions);
      await utils.openViewQuestionDrawer(page, choice.name);
    });

    await test.step('抽屉标题「查看问题」，共 5 行内容', async () => {
      await utils.expectViewDrawerInfoRowCount(page, 5);
    });

    await test.step('各行取值为纯文本，与列表/接口数据一致', async () => {
      await utils.expectViewDrawerFieldValue(page, FIELD_NAME, choice.name);
      await utils.expectViewDrawerFieldValue(page, FIELD_TYPE, Q.typeChoice);
      await utils.expectViewDrawerFieldValue(
        page,
        FIELD_INSTRUCTIONS,
        choice.instructions,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        FIELD_OVERRIDE,
        Q.useGlobalThreshold('0.6'),
      );
    });
  });

  test('IC-D-02 查看抽屉footer隐藏', async ({ page }) => {
    const { choice, questions } = buildViewQuestions();

    await test.step('前置：打开「查看问题」抽屉', async () => {
      await gotoWithPublishedConfig(page, questions);
      await utils.openViewQuestionDrawer(page, choice.name);
    });

    await test.step('底部不出现「保存」「取消」等操作按钮', async () => {
      await utils.expectViewDrawerNoFooterButtons(page);
    });

    await test.step('点击遮罩可关闭（mask-closable=true）', async () => {
      await utils.clickViewDrawerMask(page);
      await utils.expectViewDrawerClosed(page);
    });
  });

  test('IC-D-03 查看态无表单控件与必填星号', async ({ page }) => {
    const { choice, questions } = buildViewQuestions();

    await test.step('前置：打开「查看问题」抽屉', async () => {
      await gotoWithPublishedConfig(page, questions);
      await utils.openViewQuestionDrawer(page, choice.name);
    });

    await test.step('抽屉内不存在任何表单控件（Input/Select/InputNumber/文本域）', async () => {
      await utils.expectViewDrawerNoInputs(page);
    });

    await test.step('字段标签不出现必填 * 号', async () => {
      await utils.expectViewDrawerNoRequiredMark(page);
    });
  });

  test('IC-D-04 查看「枚举（choice）」问题「选项」列表', async ({ page }) => {
    const { choice, questions } = buildViewQuestions();

    await test.step('前置：打开 choice 问题「查看」', async () => {
      await gotoWithPublishedConfig(page, questions);
      await utils.openViewQuestionDrawer(page, choice.name);
    });

    await test.step('选项逐行展示「选项名：选项描述」，描述为空仅展示选项名', async () => {
      await utils.expectViewDrawerLines(page, '选项', [
        'coding：编写或修改代码',
        'qa',
      ]);
    });
  });

  test('IC-D-05 查看「评分（score）」问题「档位」列表', async ({ page }) => {
    const { score, questions } = buildViewQuestions();

    await test.step('前置：打开 score 问题「查看」', async () => {
      await gotoWithPublishedConfig(page, questions);
      await utils.openViewQuestionDrawer(page, score.name);
    });

    await test.step('档位按配置顺序（低→高）逐行展示「档位名：档位描述」', async () => {
      await utils.expectViewDrawerLines(page, '档位', [
        'simple：简单',
        'medium：中等',
        'complex：复杂',
      ]);
    });
  });

  test('IC-D-06 查看空选项档位空态', async ({ page }) => {
    const emptyChoice = {
      name: utils.generateTestQuestionName('ic_d_ec_'),
      type: 'choice',
      instructions: '空选项问题',
      criteria: {},
    };
    const emptyScore = {
      name: utils.generateTestQuestionName('ic_d_es_'),
      type: 'score',
      instructions: '空档位问题',
      levels: [],
    };

    await test.step('前置：Mock GET 构造空选项/档位数据并进入页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.mockIntentConfigGetResponse(page, {
        questions: [emptyChoice, emptyScore],
      });
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
    });

    await test.step('choice 空列表展示「暂无选项」', async () => {
      await utils.openViewQuestionDrawer(page, emptyChoice.name);
      await utils.expectViewDrawerFieldValue(page, '选项', Q.emptyOptions);
      await utils.closeViewQuestionDrawer(page);
    });

    await test.step('score 空列表展示「暂无档位」', async () => {
      await utils.openViewQuestionDrawer(page, emptyScore.name);
      await utils.expectViewDrawerFieldValue(page, '档位', Q.emptyLevels);
    });

    await test.step('还原 Mock，避免影响后续用例', async () => {
      await utils.unmockIntentConfigNetwork(page);
    });
  });

  test('IC-D-07 查看最小置信度覆盖-使用全局门限', async ({ page }) => {
    const { choice, score, questions } = buildViewQuestions();

    await test.step('前置：全局 0.6；score 带覆盖 0.7，choice 未设置', async () => {
      await gotoWithPublishedConfig(page, questions, 0.6);
    });

    await test.step('未设置的问题展示「使用全局门限（0.6）」', async () => {
      await utils.openViewQuestionDrawer(page, choice.name);
      await utils.expectViewDrawerFieldValue(
        page,
        FIELD_OVERRIDE,
        Q.useGlobalThreshold('0.6'),
      );
      await utils.closeViewQuestionDrawer(page);
    });

    await test.step('已设置的问题展示对应数值 0.7', async () => {
      await utils.openViewQuestionDrawer(page, score.name);
      await utils.expectViewDrawerFieldValue(page, FIELD_OVERRIDE, '0.7');
    });
  });

  test('IC-D-08 查看抽屉与列表展示数据同接口响应一致性-全字段核对', async ({ page }) => {
    const { choice, score, questions } = buildViewQuestions();

    await test.step('前置：发布配置并获取 API 响应作为核对基准', async () => {
      await gotoWithPublishedConfig(page, questions, 0.65);
    });

    await test.step('全局阈值与列表行数/顺序/各列与响应一致', async () => {
      const api = await utils.getIntentConfigViaApi(page);
      expect(api.published).toBe(true);
      const data = api.data;
      await utils.expectGlobalThresholdText(page, String(data.min_confidence));
      expect(await utils.getQuestionRowCount(page)).toBe(data.questions.length);
      expect(await utils.getQuestionNamesInOrder(page)).toEqual(
        data.questions.map((q) => q.name),
      );
      for (const q of data.questions) {
        await utils.expectQuestionCellText(page, q.name, COL.name, q.name);
        await utils.expectQuestionCellText(
          page,
          q.name,
          COL.instructions,
          q.instructions,
        );
      }
      await utils.expectQuestionTypeTag(page, choice.name, Q.typeChoice, 'primary');
      await utils.expectQuestionTypeTag(page, score.name, Q.typeScore, 'success');
    });

    await test.step('choice 查看抽屉逐字段与响应一致（criteria map 按序展示）', async () => {
      const api = await utils.getIntentConfigViaApi(page);
      const apiChoice = api.data.questions.find((q) => q.type === 'choice');
      await utils.openViewQuestionDrawer(page, apiChoice.name);
      await utils.expectViewDrawerFieldValue(page, FIELD_NAME, apiChoice.name);
      await utils.expectViewDrawerFieldValue(page, FIELD_TYPE, Q.typeChoice);
      await utils.expectViewDrawerFieldValue(
        page,
        FIELD_INSTRUCTIONS,
        apiChoice.instructions,
      );
      const expectedLines = Object.keys(apiChoice.criteria || {}).map((key) =>
        apiChoice.criteria[key]
          ? `${key}：${apiChoice.criteria[key]}`
          : key,
      );
      await utils.expectViewDrawerLines(page, '选项', expectedLines);
      await utils.expectViewDrawerFieldValue(
        page,
        FIELD_OVERRIDE,
        Q.useGlobalThreshold(String(api.data.min_confidence)),
      );
      await utils.closeViewQuestionDrawer(page);
    });

    await test.step('score 查看抽屉逐字段与响应一致（levels 数组按序展示）', async () => {
      const api = await utils.getIntentConfigViaApi(page);
      const apiScore = api.data.questions.find((q) => q.type === 'score');
      await utils.openViewQuestionDrawer(page, apiScore.name);
      await utils.expectViewDrawerFieldValue(page, FIELD_TYPE, Q.typeScore);
      const expectedLines = (apiScore.levels || []).map((level) =>
        level.description ? `${level.name}：${level.description}` : level.name,
      );
      await utils.expectViewDrawerLines(page, '档位', expectedLines);
      await utils.expectViewDrawerFieldValue(
        page,
        FIELD_OVERRIDE,
        String(apiScore.min_confidence),
      );
      await utils.closeViewQuestionDrawer(page);
    });

    await test.step('刷新页面后仍与最新 GET 响应一致', async () => {
      await utils.reloadIntentConfigPage(page);
      const api = await utils.getIntentConfigViaApi(page);
      await utils.expectGlobalThresholdText(page, String(api.data.min_confidence));
      expect(await utils.getQuestionRowCount(page)).toBe(api.data.questions.length);
    });
  });
});
