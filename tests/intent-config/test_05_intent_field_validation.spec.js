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
 * 意图配置 - 字段校验矩阵
 * 用例：IC-V-01 ~ IC-V-17（docs/intent-config/02-功能测试用例/04-字段校验矩阵.md）
 * IC-V-17 为「接口与UI校验实现一致性比对」：汇总审计 IC-V-01~16 结论，
 * 并对核心一致性断言点（UI 额外约束 / 未强校验项 / 提交体结构）做可自动化复核。
 *
 * 说明：表单内联校验断言 ivu-form-item-error-tip（expectQuestionFormFieldError）；
 * 提交/发布拦截断言 $Message 提示（expectIntentConfigMessageDuringAction）；
 * IC-V-02 第 3 步（11 个问题）经 Mock GET 构造；afterEach 恢复单例原始状态。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/intent-config/IntentConfigPage');

const cleanup = utils.createIntentConfigTestCleanup();
const P = utils.DOC_INTENT_CONFIG_PAGE;
const Q = utils.DOC_INTENT_CONFIG_QUESTIONS;
const F = utils.DOC_INTENT_CONFIG_FORM;
const V = utils.DOC_INTENT_CONFIG_VALIDATION;

/** 公共前置：API 造数 → 进入页面 → 编辑模式 */
async function enterEditModeWithPublishedConfig(page, questions = [], minConfidence = 0.6) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  await utils.ensureIntentConfigPublishedViaApi(page, { minConfidence, questions });
  await utils.gotoIntentConfigPageAndWaitForConfig(page);
  await utils.enterEditMode(page);
}

/** 打开添加抽屉并填写合法基础字段（choice：名称/判定说明/1 选项） */
async function fillValidChoiceBase(page, name) {
  await utils.fillQuestionName(page, name);
  await utils.fillQuestionInstructions(page, '测试用判定说明');
  await utils.clickAddOption(page);
  await utils.fillOptionRow(page, 0, 'opt_a', '选项A');
}

test.describe('意图配置 - 字段校验矩阵', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockIntentConfigNetwork(page).catch(() => {});
    await cleanup.cleanup(page);
  });

  test('IC-V-01 全局最小置信度范围校验', async ({ page }) => {
    await test.step('前置：进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page, [], 0.6);
    });

    await test.step('边界值 0 合法：PUT 成功', async () => {
      await utils.fillGlobalThreshold(page, 0);
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response.status()).toBe(200);
      expect(payload.min_confidence).toBe(0);
      await utils.expectViewMode(page);
      await utils.enterEditMode(page);
    });

    await test.step('边界值 1 合法：PUT 成功', async () => {
      await utils.fillGlobalThreshold(page, 1);
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response.status()).toBe(200);
      expect(payload.min_confidence).toBe(1);
      await utils.expectViewMode(page);
      await utils.enterEditMode(page);
    });

    await test.step('超出范围 1.5 被拦截：提示「最小置信度必须为 0-1」', async () => {
      await utils.fillGlobalThreshold(page, '1.5');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.minConfidenceRange,
        async () => {
          await utils.clickSaveAndPublish(page);
        },
      );
      await utils.expectEditMode(page);
    });
  });

  test('IC-V-02 问题数量0到10', async ({ page }) => {
    const tracker = utils.trackIntentConfigRequests(page);
    try {
      await test.step('步骤1：删除全部问题后发布 questions: [] 合法', async () => {
        const question = utils.buildTestChoiceQuestion();
        await enterEditModeWithPublishedConfig(page, [question]);
        await utils.clickQuestionDelete(page, question.name);
        await utils.expectDeleteConfirmModal(page);
        await utils.confirmDeleteQuestion(page);
        const { response, payload } = await utils.saveConfigAndCapture(page);
        expect(response.status()).toBe(200);
        expect(payload.questions).toEqual([]);
        await utils.expectViewMode(page);
      });

      await test.step('步骤2：达到 10 个后「添加问题」被拦截', async () => {
        const questions = Array.from({ length: 10 }, () =>
          utils.buildTestChoiceQuestion(),
        );
        await utils.ensureIntentConfigPublishedViaApi(page, { questions });
        await utils.reloadIntentConfigPage(page);
        await utils.enterEditMode(page);
        await utils.expectQuestionRowCount(page, 10);
        await utils.expectIntentConfigMessageDuringAction(
          page,
          V.maxQuestionsAdd,
          async () => {
            await utils.clickAddQuestionButton(page);
          },
        );
      });

      await test.step('步骤3：经 Mock 置入 11 个问题，发布前校验拦截', async () => {
        const putBefore = tracker.state.put; // 步骤1已产生 1 次合法 PUT，此处断言无新增
        const eleven = Array.from({ length: 11 }, () =>
          utils.buildTestChoiceQuestion(),
        );
        await utils.mockIntentConfigGetResponse(page, { questions: eleven });
        await utils.reloadIntentConfigPage(page);
        await utils.enterEditMode(page);
        await utils.expectQuestionRowCount(page, 11);
        await utils.expectIntentConfigMessageDuringAction(
          page,
          V.maxQuestions,
          async () => {
            await utils.clickSaveAndPublish(page);
          },
        );
        expect(tracker.state.put, '校验拦截后不应新增 PUT').toBe(putBefore);
        await utils.unmockIntentConfigNetwork(page);
      });
    } finally {
      tracker.stop();
    }
  });

  test('IC-V-03 问题名称必填非空', async ({ page }) => {
    await test.step('前置：打开添加抽屉，填写合法判定说明与选项，名称留空', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionInstructions(page, '测试用判定说明');
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'opt_a', '选项A');
    });

    await test.step('名称为空：内联提示「请输入问题名称」，抽屉不关闭', async () => {
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.nameLabel,
        V.questionNameRequired,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('纯空格名称视为空：同样被拦截', async () => {
      await utils.fillQuestionName(page, '   ');
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.nameLabel,
        V.questionNameRequired,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-V-04 问题名称全局唯一', async ({ page }) => {
    const existing = utils.buildTestChoiceQuestion();

    await test.step('前置：列表已存在问题 X，进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page, [existing]);
      await utils.expectQuestionRowVisible(page, existing.name);
    });

    await test.step('新增同名保存被拦截：提示「问题名称已存在，必须全局唯一」', async () => {
      await utils.openAddQuestionDrawer(page);
      await fillValidChoiceBase(page, existing.name);
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.questionNameDuplicate,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
      await utils.expectQuestionRowCount(page, 1);
    });
  });

  test('IC-V-05 问题名称长度不超过64', async ({ page }) => {
    const name64 = 'a'.repeat(V.nameMaxLength);
    const name65 = 'a'.repeat(V.nameMaxLength + 1);

    await test.step('前置：打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('64 字符合法，保存成功', async () => {
      await fillValidChoiceBase(page, name64);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name64);
    });

    await test.step('65 字符被拦截：内联提示「问题名称不能超过 64 字符」', async () => {
      await utils.openAddQuestionDrawer(page);
      await fillValidChoiceBase(page, name65);
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.nameLabel,
        V.questionNameTooLong,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-V-06 问题类型枚举', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_v06_');

    await test.step('前置：打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('类型下拉仅提供「枚举（choice）」「评分（score）」两个选项', async () => {
      await utils.expectQuestionTypeOptions(page, [Q.typeChoice, Q.typeScore]);
    });

    await test.step('合法枚举值走一次成功保存流程', async () => {
      await fillValidChoiceBase(page, name);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name);
    });
    // 说明：非法类型无法经 UI 置入（normalizeQuestion 将未知类型归为 choice），
    // 「类型非法」提示为防御性分支，经代码审查覆盖，登记于测试报告。
  });

  test('IC-V-07 判定说明必填', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_v07_');

    await test.step('前置：打开添加抽屉，填写合法名称与选项，判定说明留空', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'opt_a', '选项A');
    });

    await test.step('判定说明为空：内联提示「请填写判定说明」，抽屉不关闭', async () => {
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.instructionsLabel,
        V.instructionsRequired,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('纯空格判定说明也被拦截（BUG-1 已修复：trim 后非空校验）', async () => {
      // BUG-1 修复记录：原实现 instructions 仅配 required 规则，纯空格通过校验
      // 且 trim 后以空串入库；已在 QuestionForm.vue 增加 validateInstructions
      // （trim 后判空），此处按文档预期断言拦截。
      await utils.fillQuestionInstructions(page, '   ');
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.instructionsLabel,
        V.instructionsRequired,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-V-08 选项数量1到10', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_v08_');

    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('0 项被拦截：提示「选项数量必须为 1-10」', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.criteriaCount,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('添加至 10 行后第 11 次点击被拦截：提示「最多 10 项」', async () => {
      for (let i = 0; i < 10; i++) {
        await utils.clickAddOption(page);
      }
      await utils.expectOptionRowCount(page, 10);
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.maxOptions,
        async () => {
          await utils.clickAddOption(page);
        },
      );
      await utils.expectOptionRowCount(page, 10);
    });

    await test.step('1-10 项合法：填写后保存成功', async () => {
      for (let i = 0; i < 10; i++) {
        await utils.fillOptionRow(page, i, `opt_${i}`, `描述${i}`);
      }
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name);
    });
  });

  test('IC-V-09 选项名唯一非空', async ({ page }) => {
    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(
        page,
        utils.generateTestQuestionName('ic_v09_'),
      );
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('选项名留空（描述可填）：提示「选项名不能为空」', async () => {
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, '', '描述可填');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.optionNameRequired,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('两个选项名相同：提示「选项名不能重复」', async () => {
      await utils.fillOptionRow(page, 0, 'dup', '描述1');
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 1, 'dup', '描述2');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.optionNameDuplicate,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-V-10 选项名不含竖线', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_v10_');

    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('选项名 a|b：提示「选项名不能包含 |」', async () => {
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'a|b', '含竖线');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.optionNameNoPipe,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('正常值 coding 可提交', async () => {
      await utils.fillOptionRow(page, 0, 'coding', '编写或修改代码');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name);
    });
  });

  test('IC-V-11 档位数量1到10', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_v11_');

    await test.step('前置：打开添加抽屉并填写合法名称/判定说明，切 score', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
      await utils.fillQuestionInstructions(page, '测试用判定说明');
      await utils.selectQuestionType(page, Q.typeScore);
    });

    await test.step('0 档被拦截：提示「档位数量必须为 1-10」', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.levelsCount,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('添加至 10 档后第 11 次点击被拦截：提示「最多 10 项」', async () => {
      for (let i = 0; i < 10; i++) {
        await utils.clickAddOption(page, F.addLevel);
      }
      await utils.expectOptionRowCount(page, 10);
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.maxOptions,
        async () => {
          await utils.clickAddOption(page, F.addLevel);
        },
      );
      await utils.expectOptionRowCount(page, 10);
    });

    await test.step('1-10 档合法：填写后保存成功', async () => {
      for (let i = 0; i < 10; i++) {
        await utils.fillOptionRow(page, i, `level_${i}`, `档位${i}`);
      }
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name);
    });
  });

  test('IC-V-12 档位名唯一非空', async ({ page }) => {
    await test.step('前置：打开添加抽屉并填写合法名称/判定说明，切 score', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(
        page,
        utils.generateTestQuestionName('ic_v12_'),
      );
      await utils.fillQuestionInstructions(page, '测试用判定说明');
      await utils.selectQuestionType(page, Q.typeScore);
    });

    await test.step('档位名留空：提示「档位名不能为空」', async () => {
      await utils.clickAddOption(page, F.addLevel);
      await utils.fillOptionRow(page, 0, '', '描述可填');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.levelNameRequired,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('两个档位名相同：提示「档位名不能重复」', async () => {
      await utils.fillOptionRow(page, 0, 'dup', '描述1');
      await utils.clickAddOption(page, F.addLevel);
      await utils.fillOptionRow(page, 1, 'dup', '描述2');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.levelNameDuplicate,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-V-13 档位从低到高顺序', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_v13_');

    await test.step('前置：打开添加抽屉（score）', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
      await utils.selectQuestionType(page, Q.typeScore);
    });

    await test.step('档位标签为「档位（levels，1-10 档，低→高）」', async () => {
      await utils.expectQuestionFormFieldLabels(page, [F.levelsLabel]);
    });

    await test.step('故意按非从低到高顺序录入（UI 不应自动重排）', async () => {
      await utils.fillQuestionInstructions(page, '评估复杂度');
      for (const level of ['complex', 'simple', 'medium']) {
        await utils.clickAddOption(page, F.addLevel);
      }
      await utils.fillOptionRow(page, 0, 'complex', '复杂');
      await utils.fillOptionRow(page, 1, 'simple', '简单');
      await utils.fillOptionRow(page, 2, 'medium', '中等');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
    });

    await test.step('保存并发布后，查看抽屉按录入顺序展示', async () => {
      await utils.saveConfigExpectMessage(page, P.publishSuccessMsg);
      await utils.expectViewMode(page);
      await utils.openViewQuestionDrawer(page, name);
      await utils.expectViewDrawerLines(page, '档位', [
        'complex：复杂',
        'simple：简单',
        'medium：中等',
      ]);
    });
  });

  test('IC-V-14 选项与档位互斥', async ({ page }) => {
    const choiceName = utils.generateTestQuestionName('ic_v14c_');
    const scoreName = utils.generateTestQuestionName('ic_v14s_');

    await test.step('前置：进入编辑模式，分别新增 choice 与 score 问题', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await fillValidChoiceBase(page, choiceName);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, scoreName);
      await utils.fillQuestionInstructions(page, '评估复杂度');
      await utils.selectQuestionType(page, Q.typeScore);
      await utils.clickAddOption(page, F.addLevel);
      await utils.fillOptionRow(page, 0, 'simple', '简单');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
    });

    await test.step('发布：choice 仅含 criteria，score 仅含 levels', async () => {
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response.status()).toBe(200);
      const choiceItem = payload.questions.find((q) => q.name === choiceName);
      const scoreItem = payload.questions.find((q) => q.name === scoreName);
      expect(choiceItem.criteria).toBeDefined();
      expect(choiceItem.levels).toBeUndefined();
      expect(scoreItem.levels).toBeDefined();
      expect(scoreItem.criteria).toBeUndefined();
    });
  });

  test('IC-V-15 单问题最小置信度覆盖范围', async ({ page }) => {
    await test.step('前置：打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('边界值 0 合法', async () => {
      await fillValidChoiceBase(
        page,
        utils.generateTestQuestionName('ic_v15a_'),
      );
      await utils.fillQuestionOverride(page, 0);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('边界值 1 合法', async () => {
      await fillValidChoiceBase(
        page,
        utils.generateTestQuestionName('ic_v15b_'),
      );
      await utils.fillQuestionOverride(page, 1);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('超出范围 1.2 被拦截：提示「最小置信度覆盖必须为 0-1」', async () => {
      await fillValidChoiceBase(
        page,
        utils.generateTestQuestionName('ic_v15c_'),
      );
      await utils.fillQuestionOverride(page, '1.2');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.overrideRange,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('留空合法（继承全局门限，提交体不含该字段）', async () => {
      await utils.fillQuestionOverride(page, '');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowCount(page, 3);
    });
  });

  test('IC-V-16 只读字段提交忽略', async ({ page }) => {
    const questions = [
      utils.buildTestChoiceQuestion(),
      utils.buildTestScoreQuestion(),
    ];

    await test.step('前置：发布配置，进入编辑模式后直接保存并发布', async () => {
      await enterEditModeWithPublishedConfig(page, questions, 0.6);
    });

    await test.step('请求体不含 created_at / updated_at / version / _uid', async () => {
      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response.status()).toBe(200);
      expect(payload.created_at).toBeUndefined();
      expect(payload.updated_at).toBeUndefined();
      expect(payload.version).toBeUndefined();
      for (const question of payload.questions) {
        expect(question._uid).toBeUndefined();
        expect(question.created_at).toBeUndefined();
        expect(question.updated_at).toBeUndefined();
      }
    });
  });

  test('IC-V-17 接口与UI校验实现一致性比对', async ({ page }) => {
    const scoreName = utils.generateTestQuestionName('ic_v17s_');
    const choiceName = utils.generateTestQuestionName('ic_v17c_');

    await test.step('前置：进入编辑模式（单例配置，afterEach 恢复原配置）', async () => {
      await enterEditModeWithPublishedConfig(page);
    });

    await test.step('比对 1（UI 额外约束）：问题名称 >64 字符被拦截，提示「问题名称不能超过 64 字符」', async () => {
      // 接口未规定名称长度上限，UI 侧 validateName 严于接口（length > 64 报错）。
      await utils.openAddQuestionDrawer(page);
      await fillValidChoiceBase(page, 'a'.repeat(V.nameMaxLength + 1));
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.nameLabel,
        V.questionNameTooLong,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
      await utils.closeQuestionFormDrawer(page);
    });

    await test.step('比对 2（未强校验项）：档位不按从低到高排序也可保存', async () => {
      // 接口要求 levels 从低到高，但 UI 不自动校验/排序（IC-V-13），顺序由用户维护。
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, scoreName);
      await utils.fillQuestionInstructions(page, '评估复杂度');
      await utils.selectQuestionType(page, Q.typeScore);
      for (let i = 0; i < 3; i++) {
        await utils.clickAddOption(page, F.addLevel);
      }
      await utils.fillOptionRow(page, 0, 'complex', '复杂');
      await utils.fillOptionRow(page, 1, 'simple', '简单');
      await utils.fillOptionRow(page, 2, 'medium', '中等');
      // 非从低到高顺序不触发任何拦截，问题保存成功
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, scoreName);
    });

    await test.step('比对 3（提交体结构）：criteria 由列表转 map、levels 保序、不含只读字段', async () => {
      await utils.openAddQuestionDrawer(page);
      await fillValidChoiceBase(page, choiceName);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);

      const { response, payload } = await utils.saveConfigAndCapture(page);
      expect(response.status()).toBe(200);
      const choiceItem = payload.questions.find((q) => q.name === choiceName);
      const scoreItem = payload.questions.find((q) => q.name === scoreName);

      // 选项结构：UI 以 [{name,description}] 维护，提交时转为 map<string,string>
      expect(Array.isArray(choiceItem.criteria)).toBe(false);
      expect(choiceItem.criteria).toEqual({ opt_a: '选项A' });
      // 档位结构：保持数组且顺序与录入一致（未自动排序）
      expect(Array.isArray(scoreItem.levels)).toBe(true);
      expect(scoreItem.levels.map((l) => l.name)).toEqual([
        'complex',
        'simple',
        'medium',
      ]);
      // 互斥：choice 不含 levels，score 不含 criteria（IC-V-14）
      expect(choiceItem.levels).toBeUndefined();
      expect(scoreItem.criteria).toBeUndefined();
      // 只读/内部字段不下发（全量断言见 IC-V-16）
      expect(payload.created_at).toBeUndefined();
      expect(payload.updated_at).toBeUndefined();
      expect(payload.version).toBeUndefined();
      for (const question of payload.questions) {
        expect(question._uid).toBeUndefined();
      }
      await utils.expectViewMode(page);
    });

    // 比对 4：min_confidence 取值 0-1（含边界 0 / 1）合法——
    // 已由 IC-V-01 全量覆盖（PUT 200 + payload.min_confidence 断言），此处不重复长流程。
  });
});
