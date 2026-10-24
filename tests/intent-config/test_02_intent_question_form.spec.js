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
 * 意图配置 - 问题新增与编辑
 * 用例：IC-Q-01 ~ IC-Q-17（docs/intent-config/02-功能测试用例/02-问题新增与编辑.md）
 *
 * 说明：新增/编辑/删除问题均为本地草稿（须「保存并发布」才同步后端），
 * 关键用例以 trackIntentConfigRequests 断言不发 PUT；afterEach 恢复单例原始状态。
 */
const { test } = require('@playwright/test');
const utils = require('../../pages/intent-config/IntentConfigPage');

const cleanup = utils.createIntentConfigTestCleanup();
const P = utils.DOC_INTENT_CONFIG_PAGE;
const Q = utils.DOC_INTENT_CONFIG_QUESTIONS;
const F = utils.DOC_INTENT_CONFIG_FORM;
const V = utils.DOC_INTENT_CONFIG_VALIDATION;
const COL = Q.columnIndex;

/** 公共前置：已发布配置 → 进入页面 → 编辑模式 */
async function enterEditModeWithPublishedConfig(page, questions = []) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  await utils.ensureIntentConfigPublishedViaApi(page, { questions });
  await utils.gotoIntentConfigPageAndWaitForConfig(page);
  await utils.enterEditMode(page);
}

/** 打开添加抽屉并填写合法的基础字段（名称/判定说明/1 选项），返回问题名称 */
async function fillValidChoiceBase(page, name) {
  await utils.fillQuestionName(page, name);
  await utils.fillQuestionInstructions(page, '测试用判定说明');
  await utils.clickAddOption(page);
  await utils.fillOptionRow(page, 0, 'opt_a', '选项A');
}

test.describe('意图配置 - 问题新增与编辑', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('IC-Q-01 打开「添加问题」抽屉', async ({ page }) => {
    await test.step('前置：已发布配置，进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page);
    });

    await test.step('点击「添加问题」打开抽屉，标题「添加问题」、宽度 60%', async () => {
      await utils.openAddQuestionDrawer(page);
      await utils.expectFormDrawerWidth(page);
    });

    await test.step('表单字段依次展示，底部「保存」「取消」', async () => {
      await utils.expectQuestionFormFieldLabels(page);
      await utils.expectQuestionFormFooterButtons(page);
    });

    await test.step('默认类型「枚举（choice）」，选项空态「暂无选项」', async () => {
      await utils.expectQuestionTypeSelected(page, Q.typeChoice);
      await utils.expectOptionRowCount(page, 0);
      await utils.expectEmptyOptionsText(page, Q.emptyOptions);
    });
  });

  test('IC-Q-02 新增「枚举（choice）」问题-成功', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_q02_');
    const instructions = '这条请求属于哪类研发任务？';
    const tracker = utils.trackIntentConfigRequests(page);

    try {
      await test.step('前置：已发布配置，进入编辑模式', async () => {
        await enterEditModeWithPublishedConfig(page);
      });

      await test.step('填写名称/判定说明/两项选项并保存', async () => {
        await utils.openAddQuestionDrawer(page);
        await utils.fillQuestionName(page, name);
        await utils.fillQuestionInstructions(page, instructions);
        await utils.clickAddOption(page);
        await utils.clickAddOption(page);
        await utils.fillOptionRow(page, 0, 'coding', '编写或修改代码');
        await utils.fillOptionRow(page, 1, 'qa', '问答与检索');
        await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectQuestionFormDrawerHidden(page);
      });

      await test.step('问题列表新增一行：名称/类型 Tag/判定说明', async () => {
        await utils.expectQuestionRowVisible(page, name);
        await utils.expectQuestionTypeTag(page, name, Q.typeChoice, 'primary');
        await utils.expectQuestionCellText(
          page,
          name,
          COL.instructions,
          instructions,
        );
      });

      await test.step('本地保存，未发送 PUT /intent-config', async () => {
        await utils.expectNoIntentConfigMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('IC-Q-03 新增「评分（score）」问题-成功', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_q03_');
    const instructions = '评估请求的复杂度等级';
    const tracker = utils.trackIntentConfigRequests(page);

    try {
      await test.step('前置：已发布配置，进入编辑模式', async () => {
        await enterEditModeWithPublishedConfig(page);
      });

      await test.step('选择 score 类型，按低→高填 3 档并设覆盖 0.7', async () => {
        await utils.openAddQuestionDrawer(page);
        await utils.fillQuestionName(page, name);
        await utils.selectQuestionType(page, Q.typeScore);
        await utils.fillQuestionInstructions(page, instructions);
        for (const level of ['simple', 'medium', 'complex']) {
          await utils.clickAddOption(page, F.addLevel);
        }
        await utils.fillOptionRow(page, 0, 'simple', '简单');
        await utils.fillOptionRow(page, 1, 'medium', '中等');
        await utils.fillOptionRow(page, 2, 'complex', '复杂');
        await utils.fillQuestionOverride(page, 0.7);
        await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectQuestionFormDrawerHidden(page);
      });

      await test.step('列表新增 score 行（success Tag），本地保存不发 PUT', async () => {
        await utils.expectQuestionRowVisible(page, name);
        await utils.expectQuestionTypeTag(page, name, Q.typeScore, 'success');
        await utils.expectQuestionCellText(
          page,
          name,
          COL.instructions,
          instructions,
        );
        await utils.expectNoIntentConfigMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('IC-Q-04 问题名称全局唯一', async ({ page }) => {
    const existing = utils.buildTestChoiceQuestion();
    const tracker = utils.trackIntentConfigRequests(page);

    try {
      await test.step('前置：列表已存在问题 X，进入编辑模式', async () => {
        await enterEditModeWithPublishedConfig(page, [existing]);
        await utils.expectQuestionRowVisible(page, existing.name);
      });

      await test.step('新增同名问题保存被拦截，提示「问题名称已存在，必须全局唯一」', async () => {
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
      });

      await test.step('列表不新增，且未发送 PUT', async () => {
        await utils.expectQuestionRowCount(page, 1);
        await utils.expectNoIntentConfigMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('IC-Q-05 编辑问题回显与保存', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_q05_');
    const question = utils.buildTestChoiceQuestion({
      name,
      instructions: '原始判定说明',
      min_confidence: 0.7,
    });
    const tracker = utils.trackIntentConfigRequests(page);

    try {
      await test.step('前置：API 造数（含覆盖阈值 0.7），进入编辑模式', async () => {
        await enterEditModeWithPublishedConfig(page, [question]);
      });

      await test.step('打开编辑抽屉：标题「编辑问题」且各字段回显', async () => {
        await utils.openEditQuestionDrawer(page, name);
        await utils.expectQuestionNameValue(page, name);
        await utils.expectQuestionTypeSelected(page, Q.typeChoice);
        await utils.expectQuestionInstructionsValue(page, '原始判定说明');
        await utils.expectOptionRowCount(page, 2);
        await utils.expectOptionRowValue(page, 0, 'coding', '编写或修改代码');
        await utils.expectQuestionOverrideValue(page, '0.7');
      });

      await test.step('修改判定说明并新增一个选项，保存替换原行', async () => {
        await utils.fillQuestionInstructions(page, '更新后的判定说明');
        await utils.clickAddOption(page);
        await utils.fillOptionRow(page, 2, 'review', '评审类');
        await utils.submitQuestionFormExpectMessage(page, F.savedSuccessMsg);
        await utils.expectQuestionFormDrawerHidden(page);
      });

      await test.step('列表行数不变且展示更新，本地保存不发 PUT', async () => {
        await utils.expectQuestionRowCount(page, 1);
        await utils.expectQuestionCellText(
          page,
          name,
          COL.instructions,
          '更新后的判定说明',
        );
        await utils.expectNoIntentConfigMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('IC-Q-06 类型切换选项与档位互斥重渲染', async ({ page }) => {
    await test.step('前置：进入编辑模式并打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('choice 添加 2 项后切 score：列表清空、标签/按钮/空态/占位符切换', async () => {
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'coding', '代码');
      await utils.clickAddOption(page);
      await utils.expectOptionRowCount(page, 2);
      await utils.selectQuestionType(page, Q.typeScore);
      await utils.expectOptionRowCount(page, 0);
      await utils.expectQuestionFormFieldLabels(page, [F.levelsLabel]);
      await utils.expectAddOptionButtonText(page, F.addLevel);
      await utils.expectEmptyOptionsText(page, Q.emptyLevels);
      await utils.clickAddOption(page, F.addLevel);
      await utils.expectOptionRowPlaceholders(
        page,
        0,
        F.levelNamePlaceholder,
        F.levelDescPlaceholder,
      );
    });

    await test.step('切回 choice：档位清空，恢复选项标签/按钮/空态', async () => {
      await utils.selectQuestionType(page, Q.typeChoice);
      await utils.expectOptionRowCount(page, 0);
      await utils.expectQuestionFormFieldLabels(page, [F.criteriaLabel]);
      await utils.expectAddOptionButtonText(page, F.addOption);
      await utils.expectEmptyOptionsText(page, Q.emptyOptions);
      await utils.clickAddOption(page);
      await utils.expectOptionRowPlaceholders(
        page,
        0,
        F.optionNamePlaceholder,
        F.optionDescPlaceholder,
      );
    });
  });

  test('IC-Q-07 选项与档位添加删除行', async ({ page }) => {
    await test.step('前置：打开添加抽屉（默认 choice）', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('连续添加 3 行', async () => {
      for (let i = 0; i < 3; i++) {
        await utils.clickAddOption(page);
      }
      await utils.expectOptionRowCount(page, 3);
      await utils.fillOptionRow(page, 0, 'opt_0', '描述0');
      await utils.fillOptionRow(page, 1, 'opt_1', '描述1');
      await utils.fillOptionRow(page, 2, 'opt_2', '描述2');
    });

    await test.step('删除中间行，其余行顺序保留', async () => {
      await utils.removeOptionRow(page, 1);
      await utils.expectOptionRowCount(page, 2);
      await utils.expectOptionRowValue(page, 0, 'opt_0', '描述0');
      await utils.expectOptionRowValue(page, 1, 'opt_2', '描述2');
    });
  });

  test('IC-Q-08 选项档位数量上限10', async ({ page }) => {
    await test.step('前置：打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('连续添加至 10 行', async () => {
      for (let i = 0; i < 10; i++) {
        await utils.clickAddOption(page);
      }
      await utils.expectOptionRowCount(page, 10);
    });

    await test.step('第 11 次点击被拦截，提示「最多 10 项」，行数不变', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.maxOptions,
        async () => {
          await utils.clickAddOption(page);
        },
      );
      await utils.expectOptionRowCount(page, 10);
    });
  });

  test('IC-Q-09 选项档位数量下限1', async ({ page }) => {
    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(
        page,
        utils.generateTestQuestionName('ic_q09_'),
      );
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('choice 不添加选项保存：提示「选项数量必须为 1-10」', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.criteriaCount,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('切 score 不添加档位保存：提示「档位数量必须为 1-10」', async () => {
      await utils.selectQuestionType(page, Q.typeScore);
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.levelsCount,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-Q-10 选项名档位名不能为空', async ({ page }) => {
    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(
        page,
        utils.generateTestQuestionName('ic_q10_'),
      );
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('choice 选项名留空：提示「选项名不能为空」', async () => {
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

    await test.step('切 score 档位名留空：提示「档位名不能为空」', async () => {
      await utils.selectQuestionType(page, Q.typeScore);
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
  });

  test('IC-Q-11 选项名不包含竖线', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_q11_');

    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('choice 选项名 a|b：提示「选项名不能包含 |」', async () => {
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

    await test.step('score 档位名 a|b 不触发竖线限制，保存成功', async () => {
      await utils.selectQuestionType(page, Q.typeScore);
      await utils.clickAddOption(page, F.addLevel);
      await utils.fillOptionRow(page, 0, 'a|b', '档位描述');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, name);
      await utils.expectQuestionTypeTag(page, name, Q.typeScore, 'success');
    });
  });

  test('IC-Q-12 选项名档位名唯一', async ({ page }) => {
    await test.step('前置：打开添加抽屉并填写合法名称/判定说明', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(
        page,
        utils.generateTestQuestionName('ic_q12_'),
      );
      await utils.fillQuestionInstructions(page, '测试用判定说明');
    });

    await test.step('choice 两行选项名均为 dup：提示「选项名不能重复」', async () => {
      await utils.clickAddOption(page);
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

    await test.step('切 score 两行档位名均为 dup：提示「档位名不能重复」', async () => {
      await utils.selectQuestionType(page, Q.typeScore);
      await utils.clickAddOption(page, F.addLevel);
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

  test('IC-Q-13 判定说明必填', async ({ page }) => {
    await test.step('前置：打开添加抽屉，填写合法名称与选项，判定说明留空', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(
        page,
        utils.generateTestQuestionName('ic_q13_'),
      );
      await utils.clickAddOption(page);
      await utils.fillOptionRow(page, 0, 'opt_a', '选项A');
    });

    await test.step('保存被拦截：内联提示「请填写判定说明」，抽屉不关闭', async () => {
      await utils.clickQuestionFormSave(page);
      await utils.expectQuestionFormFieldError(
        page,
        F.instructionsLabel,
        V.instructionsRequired,
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });
  });

  test('IC-Q-14 单问题最小置信度覆盖0-1', async ({ page }) => {
    const nameA = utils.generateTestQuestionName('ic_q14a_');
    const nameB = utils.generateTestQuestionName('ic_q14b_');

    await test.step('前置：打开添加抽屉', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
    });

    await test.step('覆盖填 0.7 合法，保存成功', async () => {
      await fillValidChoiceBase(page, nameA);
      await utils.fillQuestionOverride(page, 0.7);
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, nameA);
    });

    await test.step('覆盖填 1.5 被拦截：提示「最小置信度覆盖必须为 0-1」', async () => {
      await utils.openAddQuestionDrawer(page);
      await fillValidChoiceBase(page, nameB);
      await utils.fillQuestionOverride(page, '1.5');
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.overrideRange,
        async () => {
          await utils.clickQuestionFormSave(page);
        },
      );
      await utils.expectQuestionFormDrawerStillOpen(page);
    });

    await test.step('覆盖留空合法（继承全局门限），保存成功', async () => {
      await utils.fillQuestionOverride(page, '');
      await utils.submitQuestionFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowVisible(page, nameB);
      await utils.expectQuestionRowCount(page, 2);
    });
  });

  test('IC-Q-15 取消关闭抽屉不保存', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_q15_');

    await test.step('前置：打开添加抽屉并填写内容', async () => {
      await enterEditModeWithPublishedConfig(page);
      await utils.openAddQuestionDrawer(page);
      await utils.fillQuestionName(page, name);
    });

    await test.step('点击「取消」抽屉关闭，内容不保存', async () => {
      await utils.cancelQuestionForm(page);
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowCount(page, 0);
    });

    await test.step('再次打开抽屉字段已重置（不保留上次填写）', async () => {
      await utils.openAddQuestionDrawer(page);
      await utils.expectQuestionNameValue(page, '');
    });

    await test.step('点击遮罩不可关闭（mask-closable=false）', async () => {
      await utils.clickFormDrawerMask(page);
      await utils.expectQuestionFormDrawerStillOpen(page);
      await utils.cancelQuestionForm(page);
    });
  });

  test('IC-Q-16 问题数量上限10', async ({ page }) => {
    const questions = Array.from({ length: 10 }, () =>
      utils.buildTestChoiceQuestion(),
    );

    await test.step('前置：API 造数 10 个问题，进入编辑模式', async () => {
      await enterEditModeWithPublishedConfig(page, questions);
      await utils.expectQuestionRowCount(page, 10);
    });

    await test.step('点击「添加问题」被拦截：提示「最多配置 10 个问题」', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        V.maxQuestionsAdd,
        async () => {
          await utils.clickAddQuestionButton(page);
        },
      );
      await utils.expectQuestionFormDrawerHidden(page);
      await utils.expectQuestionRowCount(page, 10);
    });
  });

  test('IC-Q-17 删除问题二次确认', async ({ page }) => {
    const name = utils.generateTestQuestionName('ic_q17_');
    const tracker = utils.trackIntentConfigRequests(page);

    try {
      await test.step('前置：API 造数 1 个问题，进入编辑模式', async () => {
        await enterEditModeWithPublishedConfig(page, [
          utils.buildTestChoiceQuestion({ name }),
        ]);
        await utils.expectQuestionRowVisible(page, name);
      });

      await test.step('点击「删除」弹出二次确认（信息提示+删除确认文案）', async () => {
        await utils.clickQuestionDelete(page, name);
        await utils.expectDeleteConfirmModal(page);
      });

      await test.step('点击「取消」：行保留并提示「取消删除」', async () => {
        await utils.expectIntentConfigMessageDuringAction(
          page,
          P.cancelDeleteMsg,
          async () => {
            await utils.cancelDeleteQuestion(page);
          },
        );
        await utils.expectQuestionRowVisible(page, name);
      });

      await test.step('再次「删除」并「确定」：行移除并提示「已删除问题」', async () => {
        await utils.clickQuestionDelete(page, name);
        await utils.expectDeleteConfirmModal(page);
        await utils.expectIntentConfigMessageDuringAction(
          page,
          P.deleteDoneMsg,
          async () => {
            await utils.confirmDeleteQuestion(page);
          },
        );
        await utils.expectQuestionRowHidden(page, name);
      });

      await test.step('本地删除，未发送 PUT /intent-config', async () => {
        await utils.expectNoIntentConfigMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });
});
