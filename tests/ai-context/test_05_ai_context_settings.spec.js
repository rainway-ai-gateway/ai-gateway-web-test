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
 * AI 上下文压缩 - 全局设置（单例）
 * 用例：AX-S-01 ~ AX-S-18
 *
 * 覆盖：视图态文案 / 缺省默认值 / 编辑取消保存切换 / 8 控件取值范围与必填 /
 *       取消回滚 / 保存成功失败 / 8 字段校验矩阵 / 两接口独立 / 加载失败 / 零值附加文案
 *
 * 接口契约 vs UI 编辑态：API 层 8 字段非必填（未传默认），UI 编辑态必填——
 * 本 spec 断言 UI 行为（留空经 isNaN 拦截），缺省默认值经 mock GET null 验证。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-context/AIContextPage');

const cleanup = utils.createAiContextTestCleanup();
const P = utils.DOC_AI_CONTEXT_PAGE;
const S = utils.DOC_AI_CONTEXT_SETTINGS;
const SV = utils.DOC_AI_CONTEXT_SETTINGS_VIEW;

/** 读取接口当前设置，并按前端 DEFAULT_SETTINGS 深合并规则回退缺省值 */
async function currentSettings(page) {
  const raw = (await utils.getAiContextSettingsViaApi(page)) || {};
  const def = S.defaultSettings;
  return {
    trigger_ratio:
      raw.trigger_ratio !== undefined && raw.trigger_ratio !== null
        ? raw.trigger_ratio
        : def.trigger_ratio,
    keep_latest_images:
      raw.keep_latest_images !== undefined && raw.keep_latest_images !== null
        ? raw.keep_latest_images
        : def.keep_latest_images,
    tool_result_max_chars:
      raw.tool_result_max_chars !== undefined &&
      raw.tool_result_max_chars !== null
        ? raw.tool_result_max_chars
        : def.tool_result_max_chars,
    thinking_policy: raw.thinking_policy || def.thinking_policy,
    chars_per_token:
      raw.chars_per_token !== undefined && raw.chars_per_token !== null
        ? raw.chars_per_token
        : def.chars_per_token,
    image_token_estimate:
      raw.image_token_estimate !== undefined && raw.image_token_estimate !== null
        ? raw.image_token_estimate
        : def.image_token_estimate,
    rewrite: {
      strength: (raw.rewrite && raw.rewrite.strength) || def.rewrite.strength,
      protected_survival_rate:
        raw.rewrite && raw.rewrite.protected_survival_rate !== undefined &&
        raw.rewrite.protected_survival_rate !== null
          ? raw.rewrite.protected_survival_rate
          : def.rewrite.protected_survival_rate,
    },
  };
}

test.describe('AI 上下文压缩 - 全局设置', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AX-S-01 设置 Tab 视图态纯文案展示（副标题/卡片标题/8 行）', async ({
    page,
  }) => {
    await test.step('前置：进入页面并切换到「全局设置」Tab', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
    });

    await test.step('页头副标题与卡片标题正确', async () => {
      await utils.expectSettingsHeaderSubtitle(page);
      await utils.expectSettingsCardTitle(page);
    });

    await test.step('8 行 info-row 标签齐全且取值来自接口（缺值回退默认）', async () => {
      await utils.expectSettingsViewLabels(page);
      const cur = await currentSettings(page);
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[0],
        String(cur.trigger_ratio),
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[1],
        String(cur.keep_latest_images),
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[2],
        String(cur.tool_result_max_chars),
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[3],
        SV.thinkingText[cur.thinking_policy],
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[4],
        String(cur.chars_per_token),
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[5],
        String(cur.image_token_estimate),
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[6],
        SV.rewriteStrengthText[cur.rewrite.strength],
      );
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[7],
        String(cur.rewrite.protected_survival_rate),
      );
    });

    await test.step('视图态头部仅展示「编辑」按钮', async () => {
      await utils.expectSettingsViewMode(page);
    });
  });

  test('AX-S-02 设置未配置时展示默认值（mock 缺行返回 null）', async ({
    page,
  }) => {
    await test.step('前置：mock GET 返回 200 且 Data 为 null（缺行）', async () => {
      await utils.ensureAppSession(page);
      await utils.mockSettingsGetResponse(page, { status: 200, settings: null });
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
    });

    await test.step('展示 8 项默认值', async () => {
      await utils.expectSettingsViewField(page, SV.viewLabels[0], '0.7');
      await utils.expectSettingsViewField(page, SV.viewLabels[1], '2');
      await utils.expectSettingsViewField(page, SV.viewLabels[2], '2000');
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[3],
        S.thinkingTrimAllButLast,
      );
      await utils.expectSettingsViewField(page, SV.viewLabels[4], '4');
      await utils.expectSettingsViewField(page, SV.viewLabels[5], '1200');
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[6],
        S.rewriteLite,
      );
      await utils.expectSettingsViewField(page, SV.viewLabels[7], '0.95');
    });

    await test.step('编辑态回显默认值', async () => {
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
      await utils.expectSettingsNumber(page, S.triggerRatioLabel, 0.7);
      await utils.expectSettingsNumber(page, S.keepLatestImagesLabel, 2);
      await utils.expectSettingsNumber(page, S.toolResultMaxCharsLabel, 2000);
      await utils.expectSettingsNumber(page, S.charsPerTokenLabel, 4);
      await utils.expectSettingsNumber(page, S.imageTokenEstimateLabel, 1200);
      await utils.expectSettingsNumber(page, S.protectedSurvivalRateLabel, 0.95);
    });

    await utils.unmockAiContextNetwork(page);
  });

  test('AX-S-03 设置 Tab 编辑/取消/保存按钮切换与内容区切换', async ({
    page,
  }) => {
    await test.step('前置：切换到「全局设置」Tab 并确认查看态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.expectSettingsViewMode(page);
    });

    await test.step('点击「编辑」进入编辑态，按钮变为「取消」+「保存」', async () => {
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    await test.step('内容区由 SettingsView 切换为 SettingsForm', async () => {
      await expect(utils.settingsFormScope(page)).toBeVisible();
    });
  });

  test('AX-S-04 设置编辑态 8 控件类型/取值范围/必填标记', async ({ page }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    await test.step('数字控件 min/max/step 符合约定', async () => {
      await utils.expectSettingsNumberControl(page, S.triggerRatioLabel, {
        min: 0,
        max: 1,
        step: 0.01,
      });
      await utils.expectSettingsNumberControl(page, S.keepLatestImagesLabel, {
        min: 0,
        step: 1,
      });
      await utils.expectSettingsNumberControl(page, S.toolResultMaxCharsLabel, {
        min: 0,
        step: 1,
      });
      await utils.expectSettingsNumberControl(page, S.charsPerTokenLabel, {
        min: 1,
        step: 1,
      });
      await utils.expectSettingsNumberControl(page, S.imageTokenEstimateLabel, {
        min: 0,
        step: 1,
      });
      await utils.expectSettingsNumberControl(
        page,
        S.protectedSurvivalRateLabel,
        { min: 0, max: 1, step: 0.01 },
      );
    });

    await test.step('两 Select 带 transfer，选项文案正确', async () => {
      await utils.expectSettingsSelectOptions(page, S.thinkingPolicyLabel, [
        S.thinkingTrimAllButLast,
        S.thinkingKeep,
      ]);
      await utils.expectSettingsSelectOptions(page, S.rewriteStrengthLabel, [
        S.rewriteLite,
        S.rewriteFull,
      ]);
    });

    await test.step('8 字段均为必填（label 前红色 *）', async () => {
      await utils.expectSettingsFieldRequired(page, S.triggerRatioLabel);
      await utils.expectSettingsFieldRequired(page, S.keepLatestImagesLabel);
      await utils.expectSettingsFieldRequired(page, S.toolResultMaxCharsLabel);
      await utils.expectSettingsFieldRequired(page, S.thinkingPolicyLabel);
      await utils.expectSettingsFieldRequired(page, S.charsPerTokenLabel);
      await utils.expectSettingsFieldRequired(page, S.imageTokenEstimateLabel);
      await utils.expectSettingsFieldRequired(page, S.rewriteStrengthLabel);
      await utils.expectSettingsFieldRequired(page, S.protectedSurvivalRateLabel);
    });
  });

  test('AX-S-05 取消设置编辑：无二次确认、丢弃改动、不发 PUT、再入为接口值', async ({
    page,
  }) => {
    let cur;

    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      cur = await currentSettings(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('修改触发阈值与文本估算系数', async () => {
        await utils.fillSettingsNumber(
          page,
          S.triggerRatioLabel,
          cur.trigger_ratio === 0.5 ? 0.6 : 0.5,
        );
        await utils.fillSettingsNumber(page, S.charsPerTokenLabel, 3);
      });

      await test.step('点击「取消」无确认框，直接回查看态且展示值恢复', async () => {
        await utils.cancelSettingsEditMode(page);
        await expect(utils.modal(page).visible()).toHaveCount(0);
        await utils.expectSettingsViewMode(page);
        await utils.expectSettingsViewField(
          page,
          SV.viewLabels[0],
          String(cur.trigger_ratio),
        );
        await utils.expectSettingsViewField(
          page,
          SV.viewLabels[4],
          String(cur.chars_per_token),
        );
      });

      await test.step('取消未发送 PUT /ai-context-settings', async () => {
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('再次进入编辑态，字段为接口当前值（非被取消的改动值）', async () => {
        await utils.enterSettingsEditMode(page);
        await utils.expectSettingsNumber(
          page,
          S.triggerRatioLabel,
          cur.trigger_ratio,
        );
        await utils.expectSettingsNumber(
          page,
          S.charsPerTokenLabel,
          cur.chars_per_token,
        );
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-06 保存设置成功（PUT 体 8 字段，rewrite 嵌套，数值型）', async ({
    page,
  }) => {
    await test.step('前置：保存原始状态并进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const ruleTracker = utils.trackAiContextRuleRequests(page);
    try {
      await test.step('修改 8 字段为识别值', async () => {
        await utils.fillSettingsNumber(page, S.triggerRatioLabel, 0.8);
        await utils.fillSettingsNumber(page, S.keepLatestImagesLabel, 3);
        await utils.fillSettingsNumber(page, S.toolResultMaxCharsLabel, 3000);
        await utils.selectSettingsThinkingPolicy(page, S.thinkingKeep);
        await utils.fillSettingsNumber(page, S.charsPerTokenLabel, 3);
        await utils.fillSettingsNumber(page, S.imageTokenEstimateLabel, 1500);
        await utils.selectSettingsRewriteStrength(page, S.rewriteFull);
        await utils.fillSettingsNumber(page, S.protectedSurvivalRateLabel, 0.9);
      });

      let payload;
      await test.step('点击「保存」，捕获 PUT 请求体并提示「全局设置保存成功！」', async () => {
        const [res] = await Promise.all([
          utils.saveSettingsAndCapture(page),
          utils.expectAiContextMessage(page, S.saveSuccessMsg, 15000),
        ]);
        payload = res.payload;
      });

      await test.step('请求体为 8 字段结构化对象（rewrite 嵌套，数值型）', async () => {
        expect(payload).toBeTruthy();
        expect(payload).toEqual({
          trigger_ratio: 0.8,
          keep_latest_images: 3,
          tool_result_max_chars: 3000,
          thinking_policy: 'keep',
          chars_per_token: 3,
          image_token_estimate: 1500,
          rewrite: { strength: 'full', protected_survival_rate: 0.9 },
        });
        expect(payload.rules).toBeUndefined();
      });

      await test.step('回到查看态并刷新展示为最新值', async () => {
        await utils.expectSettingsViewMode(page);
        await utils.expectSettingsViewField(page, SV.viewLabels[0], '0.8');
        await utils.expectSettingsViewField(page, SV.viewLabels[3], S.thinkingKeep);
        await utils.expectSettingsViewField(
          page,
          SV.viewLabels[6],
          S.rewriteFull,
        );
      });

      await test.step('未发送 PUT /ai-context-rules（规则集合不受影响）', async () => {
        await utils.expectNoRuleMutationRequest(ruleTracker);
      });
    } finally {
      ruleTracker.stop();
    }
  });

  test('AX-S-07 保存失败提示「提交失败!」并停留编辑态', async ({ page }) => {
    await test.step('前置：拦截 PUT 失败并进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.mockSettingsPutFailure(page, {
        status: 500,
        errMsg: 'mock put 500',
      });
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('修改触发阈值为合法值', async () => {
        await utils.fillSettingsNumber(page, S.triggerRatioLabel, 0.85);
      });

      await test.step('点击「保存」提示「提交失败!」', async () => {
        await utils.expectAiContextMessageDuringAction(
          page,
          P.submitFailedMsg,
          () => utils.clickSettingsSave(page),
        );
      });

      await test.step('停留编辑态，已填改动不丢失', async () => {
        await utils.expectSettingsEditMode(page);
        await utils.expectSettingsNumber(page, S.triggerRatioLabel, 0.85);
      });

      await test.step('失败后未触发 GET 刷新覆盖本地表单', async () => {
        expect(tracker.state.get).toBe(0);
      });
    } finally {
      tracker.stop();
      await utils.unmockAiContextNetwork(page);
    }
  });

  test('AX-S-08 触发阈值 (0,1] 校验（0/1.5/空拦截，0.7/1 合法）', async ({
    page,
  }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('0 / 1.5 / 空值拦截并提示「触发阈值须大于 0 且不超过 1」，不发 PUT', async () => {
        for (const bad of [0, 1.5, '']) {
          await utils.fillSettingsNumber(page, S.triggerRatioLabel, bad);
          await utils.clickSettingsSave(page);
          await utils.expectSettingsFieldError(
            page,
            S.triggerRatioLabel,
            S.tipTriggerRatio,
          );
          await utils.expectSettingsEditMode(page);
        }
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('0.7 / 边界值 1 合法', async () => {
        await utils.fillSettingsNumber(page, S.triggerRatioLabel, 0.7);
        await utils.expectSettingsFieldValid(page, S.triggerRatioLabel);
        await utils.fillSettingsNumber(page, S.triggerRatioLabel, 1);
        await utils.expectSettingsFieldValid(page, S.triggerRatioLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-09 保留最近图片数 ≥0 校验（-1 拦截，0 合法）', async ({ page }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('-1 拦截并提示「保留最近图片数不能小于 0」，不发 PUT', async () => {
        await utils.fillSettingsNumber(page, S.keepLatestImagesLabel, -1);
        await utils.clickSettingsSave(page);
        await utils.expectSettingsFieldError(
          page,
          S.keepLatestImagesLabel,
          S.tipKeepLatestImages,
        );
        await utils.expectSettingsEditMode(page);
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('0 合法（完全不裁图语义）', async () => {
        await utils.fillSettingsNumber(page, S.keepLatestImagesLabel, 0);
        await utils.expectSettingsFieldValid(page, S.keepLatestImagesLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-10 工具结果最大字符数 ≥0 校验（-1 拦截，0 合法）', async ({
    page,
  }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('-1 拦截并提示「工具结果最大字符数不能小于 0」，不发 PUT', async () => {
        await utils.fillSettingsNumber(page, S.toolResultMaxCharsLabel, -1);
        await utils.clickSettingsSave(page);
        await utils.expectSettingsFieldError(
          page,
          S.toolResultMaxCharsLabel,
          S.tipToolResultMaxChars,
        );
        await utils.expectSettingsEditMode(page);
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('0 合法（不截断语义）', async () => {
        await utils.fillSettingsNumber(page, S.toolResultMaxCharsLabel, 0);
        await utils.expectSettingsFieldValid(page, S.toolResultMaxCharsLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-11 thinking 块策略两枚举校验（注入非法值拦截）', async ({
    page,
  }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('下拉仅含 trim-all-but-last / keep 两枚举', async () => {
        await utils.expectSettingsSelectOptions(page, S.thinkingPolicyLabel, [
          S.thinkingTrimAllButLast,
          S.thinkingKeep,
        ]);
      });

      await test.step('注入非法枚举 xxx 拦截并提示「thinking 块策略不合法」，不发 PUT', async () => {
        await utils.injectSettingsEnum(page, 'thinking_policy', 'xxx');
        await utils.clickSettingsSave(page);
        await utils.expectSettingsFieldError(
          page,
          S.thinkingPolicyLabel,
          S.tipThinkingPolicy,
        );
        await utils.expectSettingsEditMode(page);
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('选择 keep 合法', async () => {
        await utils.selectSettingsThinkingPolicy(page, S.thinkingKeep);
        await utils.expectSettingsFieldValid(page, S.thinkingPolicyLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-12 文本估算系数 ≥1 校验（0 拦截，1/3 合法）', async ({ page }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('0 拦截并提示「文本估算系数不能小于 1」，不发 PUT', async () => {
        await utils.fillSettingsNumber(page, S.charsPerTokenLabel, 0);
        await utils.clickSettingsSave(page);
        await utils.expectSettingsFieldError(
          page,
          S.charsPerTokenLabel,
          S.tipCharsPerToken,
        );
        await utils.expectSettingsEditMode(page);
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('1 / 3 合法', async () => {
        await utils.fillSettingsNumber(page, S.charsPerTokenLabel, 1);
        await utils.expectSettingsFieldValid(page, S.charsPerTokenLabel);
        await utils.fillSettingsNumber(page, S.charsPerTokenLabel, 3);
        await utils.expectSettingsFieldValid(page, S.charsPerTokenLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-13 图片估值 token ≥0 校验（-1 拦截，0 合法）', async ({ page }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('-1 拦截并提示「图片估值 token 不能小于 0」，不发 PUT', async () => {
        await utils.fillSettingsNumber(page, S.imageTokenEstimateLabel, -1);
        await utils.clickSettingsSave(page);
        await utils.expectSettingsFieldError(
          page,
          S.imageTokenEstimateLabel,
          S.tipImageTokenEstimate,
        );
        await utils.expectSettingsEditMode(page);
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('0 合法', async () => {
        await utils.fillSettingsNumber(page, S.imageTokenEstimateLabel, 0);
        await utils.expectSettingsFieldValid(page, S.imageTokenEstimateLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-14 改写强度两枚举校验（注入非法值拦截）', async ({ page }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('下拉仅含 lite / full 两枚举', async () => {
        await utils.expectSettingsSelectOptions(page, S.rewriteStrengthLabel, [
          S.rewriteLite,
          S.rewriteFull,
        ]);
      });

      await test.step('注入非法枚举 xxx 拦截并提示「改写强度不合法」，不发 PUT', async () => {
        await utils.injectSettingsEnum(page, 'rewrite_strength', 'xxx');
        await utils.clickSettingsSave(page);
        await utils.expectSettingsFieldError(
          page,
          S.rewriteStrengthLabel,
          S.tipRewriteStrength,
        );
        await utils.expectSettingsEditMode(page);
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('选择 full 合法', async () => {
        await utils.selectSettingsRewriteStrength(page, S.rewriteFull);
        await utils.expectSettingsFieldValid(page, S.rewriteStrengthLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-15 保护 token 存活率 (0,1] 校验（0/1.5/空拦截，0.95/1 合法）', async ({
    page,
  }) => {
    await test.step('前置：进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const tracker = utils.trackAiContextSettingsRequests(page);
    try {
      await test.step('0 / 1.5 / 空值拦截并提示「保护 token 存活率须大于 0 且不超过 1」，不发 PUT', async () => {
        for (const bad of [0, 1.5, '']) {
          await utils.fillSettingsNumber(page, S.protectedSurvivalRateLabel, bad);
          await utils.clickSettingsSave(page);
          await utils.expectSettingsFieldError(
            page,
            S.protectedSurvivalRateLabel,
            S.tipProtectedSurvivalRate,
          );
          await utils.expectSettingsEditMode(page);
        }
        await utils.expectNoSettingsMutationRequest(tracker);
      });

      await test.step('0.95 / 边界值 1 合法', async () => {
        await utils.fillSettingsNumber(page, S.protectedSurvivalRateLabel, 0.95);
        await utils.expectSettingsFieldValid(page, S.protectedSurvivalRateLabel);
        await utils.fillSettingsNumber(page, S.protectedSurvivalRateLabel, 1);
        await utils.expectSettingsFieldValid(page, S.protectedSurvivalRateLabel);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AX-S-16 设置与规则两接口独立（互不携带对方数据）', async ({
    page,
  }) => {
    await test.step('前置：保存原始状态并进入设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
    });

    const settingsTracker = utils.trackAiContextSettingsRequests(page);
    const ruleTracker = utils.trackAiContextRuleRequests(page);
    try {
      let settingsPayload;
      await test.step('保存设置（触发阈值 0.6），请求体无 rules 且不触发规则 PUT', async () => {
        await utils.fillSettingsNumber(page, S.triggerRatioLabel, 0.6);
        const [res] = await Promise.all([
          utils.saveSettingsAndCapture(page),
          utils.expectAiContextMessage(page, S.saveSuccessMsg, 15000),
        ]);
        settingsPayload = res.payload;
        expect(settingsPayload).toBeTruthy();
        expect(settingsPayload.rules).toBeUndefined();
        expect(ruleTracker.state.put).toBe(0);
      });

      await test.step('切到「压缩规则」Tab，编辑模式新增规则并「提交并生效」', async () => {
        await utils.switchToRulesTab(page);
        await utils.enterEditMode(page);
        await utils.expectEditMode(page);
        const cond = utils.generateTestRuleName('ax_s16_');
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleCond(page, cond);
        await utils.submitRuleFormExpectMessage(
          page,
          utils.DOC_AI_CONTEXT_RULE_FORM.addSuccessMsg,
        );
        const [{ payload }] = await Promise.all([
          utils.submitRulesAndCapture(page),
          utils.expectAiContextMessage(page, P.submitSuccessMsg, 15000),
        ]);
        expect(payload).toBeTruthy();
        expect(payload.rules).toBeTruthy();
        expect(payload.trigger_ratio).toBeUndefined();
        expect(settingsTracker.state.put).toBe(1);
      });

      await test.step('规则清空后设置仍为上一步保存值', async () => {
        await utils.switchToRulesTab(page);
        await utils.enterEditMode(page);
        await utils.deleteAllRules(page);
        await Promise.all([
          utils.submitRulesAndCapture(page),
          utils.expectAiContextMessage(page, P.submitSuccessMsg, 15000),
        ]);
        await utils.switchToSettingsTab(page);
        await utils.expectSettingsViewField(page, SV.viewLabels[0], '0.6');
      });
    } finally {
      settingsTracker.stop();
      ruleTracker.stop();
    }
  });

  test('AX-S-17 设置加载失败提示并回退默认值', async ({ page }) => {
    await test.step('前置：拦截 GET /ai-context-settings 返回错误', async () => {
      await utils.ensureAppSession(page);
      await utils.mockSettingsGetResponse(page, {
        status: 500,
        errMsg: 'mock get 500',
      });
      await utils.reloadAiContextPage(page);
    });

    await test.step('提示「加载 AI 上下文压缩设置失败」', async () => {
      await utils.expectAiContextMessage(page, S.loadFailedMsg, 20000);
    });

    await test.step('设置区回退展示默认值，无 null/undefined 原始字样', async () => {
      await utils.switchToSettingsTab(page);
      await utils.expectSettingsViewField(page, SV.viewLabels[0], '0.7');
      await utils.expectSettingsViewField(
        page,
        SV.viewLabels[3],
        S.thinkingTrimAllButLast,
      );
    });

    await test.step('「压缩规则」Tab 加载与展示不受影响', async () => {
      await utils.switchToRulesTab(page);
      await utils.expectRuleTableHeaders(page);
    });

    await utils.unmockAiContextNetwork(page);
  });

  test('AX-S-18 视图态零值附加文案（完全不裁图 / 不截断）', async ({ page }) => {
    await test.step('前置：备份原始设置并经 API 写入 keep=0 / tool=0', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const cur = await currentSettings(page);
      expect(
        await utils.setAiContextSettingsViaApi(page, {
          ...cur,
          keep_latest_images: 0,
          tool_result_max_chars: 0,
        }),
      ).toBe(true);
      await utils.reloadAiContextPage(page);
      await utils.switchToSettingsTab(page);
    });

    await test.step('keep_latest_images=0 值后附加「（完全不裁图）」', async () => {
      await utils.expectSettingsViewFieldContains(
        page,
        SV.viewLabels[1],
        '0',
      );
      await utils.expectSettingsViewFieldContains(
        page,
        SV.viewLabels[1],
        S.keepImagesNone,
      );
    });

    await test.step('tool_result_max_chars=0 值后附加「（不截断）」', async () => {
      await utils.expectSettingsViewFieldContains(
        page,
        SV.viewLabels[2],
        '0',
      );
      await utils.expectSettingsViewFieldContains(
        page,
        SV.viewLabels[2],
        S.toolResultNoTruncate,
      );
    });

    await test.step('其余非零字段不附加任何后缀', async () => {
      await utils.expectSettingsViewField(page, SV.viewLabels[0], '0.7');
      await utils.expectSettingsViewField(page, SV.viewLabels[4], '4');
    });
  });
});
