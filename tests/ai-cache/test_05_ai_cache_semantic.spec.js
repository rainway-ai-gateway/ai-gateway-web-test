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
 * AI 缓存规则 - 语义设置（单例全局设置）
 * 用例：AC-S-01 ~ AC-S-12
 *
 * 覆盖：查看态文案 / 进入编辑态 / 取消编辑 / 保存成功与失败 /
 *       缺行默认值 / 加载失败 / 只读时间戳 / 与规则集合解耦 /
 *       Top K 与阈值范围校验 / 阈值比较关系四枚举大小写敏感
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/ai-cache/AICachePage');

const P = utils.DOC_AI_CACHE_PAGE;
const S = utils.DOC_AI_CACHE_SEMANTIC;
const SV = utils.DOC_AI_CACHE_SEMANTIC_VIEW;

/**
 * 读取接口当前语义设置，并按前端 DEFAULT_SEMANTIC 规则回退缺省值。
 * 用于断言查看态 / 编辑态展示值（缺值时回退默认）。
 */
async function currentSemantic(page) {
  const raw = await utils.getAiCacheSemanticViaApi(page);
  return {
    top_k:
      raw && raw.top_k !== undefined && raw.top_k !== null
        ? raw.top_k
        : S.defaultSettings.top_k,
    threshold:
      raw && raw.threshold !== undefined && raw.threshold !== null
        ? raw.threshold
        : S.defaultSettings.threshold,
    threshold_relation:
      (raw && raw.threshold_relation) || S.defaultSettings.threshold_relation,
  };
}

test.describe('AI 缓存规则 - 语义设置', () => {
  const cleanup = utils.createAiCacheTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('AC-S-01 语义设置查看态纯文案展示', async ({ page }) => {
    await test.step('前置：进入 AI 缓存页并切换到「语义设置」Tab', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.expectActiveTab(page, P.tabSemantic);
    });

    await test.step('页头副标题与卡片标题正确', async () => {
      await utils.expectSemanticHeaderSubtitle(page);
      await utils.expectSemanticCardTitle(page);
    });

    await test.step('三项 info-row 标签齐全且取值来自接口（缺值回退默认）', async () => {
      await utils.expectSemanticViewLabels(page);
      const cur = await currentSemantic(page);
      await utils.expectSemanticViewField(page, S.viewTopK, String(cur.top_k));
      await utils.expectSemanticViewField(
        page,
        S.viewThreshold,
        String(cur.threshold),
      );
      await utils.expectSemanticViewField(
        page,
        S.viewThresholdRelation,
        SV.relationText[cur.threshold_relation],
      );
    });

    await test.step('查看态右上角仅展示「编辑」按钮', async () => {
      await utils.expectSemanticViewMode(page);
    });
  });

  test('AC-S-02 进入语义设置编辑模式（控件/必填/初值/按钮）', async ({
    page,
  }) => {
    let cur;

    await test.step('前置：切换到语义设置 Tab 并确认查看态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.expectSemanticViewMode(page);
      cur = await currentSemantic(page);
    });

    await test.step('点击「编辑」进入编辑态，按钮变为「取消」+「保存」', async () => {
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    await test.step('三字段均为必填（label 前展示红色 *）', async () => {
      await utils.expectSemanticFieldRequired(page, S.topKLabel);
      await utils.expectSemanticFieldRequired(page, S.thresholdLabel);
      await utils.expectSemanticFieldRequired(page, S.thresholdRelationLabel);
    });

    await test.step('数字控件 min/max/step 符合约定', async () => {
      await utils.expectSemanticNumberControl(page, S.topKLabel, {
        min: 1,
        max: 10,
        step: 1,
      });
      await utils.expectSemanticNumberControl(page, S.thresholdLabel, {
        min: 0,
        max: 2,
        step: 0.01,
      });
    });

    await test.step('阈值比较关系下拉 transfer 渲染 4 个选项且不被卡片裁剪', async () => {
      await utils.expectSemanticRelationOptions(page);
    });

    await test.step('控件初值回显当前设置值', async () => {
      await utils.expectSemanticNumber(page, S.topKLabel, cur.top_k);
      await utils.expectSemanticNumber(page, S.thresholdLabel, cur.threshold);
      await utils.expectSemanticRelation(
        page,
        SV.relationText[cur.threshold_relation],
      );
    });

    await test.step('未切换到「缓存规则」Tab，仍停留在语义 Tab 编辑态', async () => {
      await utils.expectActiveTab(page, P.tabSemantic);
      await utils.expectSemanticEditMode(page);
    });
  });

  test('AC-S-03 取消语义设置编辑：丢弃改动、不发 PUT、再入为接口值', async ({
    page,
  }) => {
    let cur;

    await test.step('前置：进入语义设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      cur = await currentSemantic(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const tracker = utils.trackAiCacheSemanticRequests(page);
    try {
      await test.step('修改 Top K 与相似度阈值', async () => {
        await utils.fillSemanticTopK(page, cur.top_k === 3 ? 2 : 3);
        await utils.fillSemanticThreshold(page, 1.5);
      });

      await test.step('点击「取消」回到查看态，展示值恢复为修改前', async () => {
        await utils.cancelSemanticEditMode(page);
        await utils.expectSemanticViewMode(page);
        await utils.expectSemanticViewField(
          page,
          S.viewTopK,
          String(cur.top_k),
        );
        await utils.expectSemanticViewField(
          page,
          S.viewThreshold,
          String(cur.threshold),
        );
      });

      await test.step('取消未发送 PUT /ai-cache-semantic-settings', async () => {
        await utils.expectNoSemanticMutationRequest(tracker);
      });

      await test.step('再次进入编辑态，字段为接口当前值（非被取消的改动值）', async () => {
        await utils.enterSemanticEditMode(page);
        await utils.expectSemanticNumber(page, S.topKLabel, cur.top_k);
        await utils.expectSemanticNumber(page, S.thresholdLabel, cur.threshold);
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-S-04 保存语义设置成功（PUT 体仅三业务字段）', async ({ page }) => {
    await test.step('前置：保存原始状态并进入语义编辑态', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const ruleTracker = utils.trackAiCacheRuleRequests(page);
    try {
      await test.step('设置 Top K=3 / 阈值=0.3 / 关系=小于等于（lte）', async () => {
        await utils.fillSemanticTopK(page, 3);
        await utils.fillSemanticThreshold(page, 0.3);
        await utils.selectSemanticRelation(page, S.relationLte);
      });

      let payload;
      await test.step('点击「保存」，捕获 PUT 请求体并提示「语义缓存设置保存成功！」', async () => {
        const [res] = await Promise.all([
          utils.saveSemanticAndCapture(page),
          utils.expectAiCacheMessage(page, S.saveSuccessMsg, 15000),
        ]);
        payload = res.payload;
      });

      await test.step('请求体为三业务字段（数值型）且不含时间戳', async () => {
        expect(payload).toBeTruthy();
        expect(payload).toEqual({
          top_k: 3,
          threshold: 0.3,
          threshold_relation: 'lte',
        });
        expect(payload.created_at).toBeUndefined();
        expect(payload.updated_at).toBeUndefined();
      });

      await test.step('回到查看态并刷新展示为最新值', async () => {
        await utils.expectSemanticViewMode(page);
        await utils.expectSemanticViewField(page, S.viewTopK, '3');
        await utils.expectSemanticViewField(page, S.viewThreshold, '0.3');
        await utils.expectSemanticViewField(
          page,
          S.viewThresholdRelation,
          S.relationLte,
        );
      });

      await test.step('未发送 PUT /ai-cache-rules（规则集合不受影响）', async () => {
        await utils.expectNoRuleMutationRequest(ruleTracker);
      });
    } finally {
      ruleTracker.stop();
    }
  });

  test('AC-S-05 保存失败提示「提交失败!」并停留编辑态', async ({ page }) => {
    await test.step('前置：拦截 PUT 失败并进入语义编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.mockSemanticPutFailure(page, {
        status: 500,
        errMsg: 'mock put 500',
      });
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const tracker = utils.trackAiCacheSemanticRequests(page);
    try {
      await test.step('修改三字段为合法值', async () => {
        await utils.fillSemanticTopK(page, 4);
        await utils.fillSemanticThreshold(page, 0.4);
        await utils.selectSemanticRelation(page, S.relationGt);
      });

      await test.step('点击「保存」提示「提交失败!」', async () => {
        await utils.expectAiCacheMessageDuringAction(
          page,
          P.submitFailedMsg,
          () => utils.clickSemanticSave(page),
        );
      });

      await test.step('停留编辑态，已填改动不丢失', async () => {
        await utils.expectSemanticEditMode(page);
        await utils.expectSemanticNumber(page, S.topKLabel, 4);
        await utils.expectSemanticNumber(page, S.thresholdLabel, 0.4);
        await utils.expectSemanticRelation(page, S.relationGt);
      });

      await test.step('失败后未触发 GET 刷新覆盖本地表单', async () => {
        expect(tracker.state.get).toBe(0);
      });
    } finally {
      tracker.stop();
      await utils.unmockAiCacheNetwork(page);
    }
  });

  test('AC-S-06 设置缺行返回默认值对象并展示默认值', async ({ page }) => {
    await test.step('前置：mock GET 返回 200 且 Data 为 null（缺行）', async () => {
      await utils.ensureAppSession(page);
      await utils.mockSemanticGetResponse(page, { status: 200, settings: null });
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
    });

    await test.step('页面展示默认值 Top K=1 / 阈值=0.15 / 关系=「小于（lt，<）」', async () => {
      await utils.expectSemanticViewField(page, S.viewTopK, '1');
      await utils.expectSemanticViewField(page, S.viewThreshold, '0.15');
      await utils.expectSemanticViewField(
        page,
        S.viewThresholdRelation,
        SV.relationText.lt,
      );
    });

    await test.step('可在编辑态直接修改（进入编辑态并回显默认值）', async () => {
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
      await utils.expectSemanticNumber(page, S.topKLabel, 1);
      await utils.expectSemanticNumber(page, S.thresholdLabel, 0.15);
      await utils.expectSemanticRelation(page, SV.relationText.lt);
    });

    await utils.unmockAiCacheNetwork(page);
  });

  test('AC-S-07 语义设置加载失败提示并回退默认值', async ({ page }) => {
    await test.step('前置：拦截 GET 返回错误并重载页面', async () => {
      await utils.ensureAppSession(page);
      await utils.mockSemanticGetResponse(page, {
        status: 500,
        errMsg: 'mock get 500',
      });
      await utils.reloadAiCachePageExpectMessage(page, S.loadFailedMsg);
    });

    await test.step('页面回退展示默认值（无 null/undefined 原始字样）', async () => {
      await utils.switchToSemanticTab(page);
      await utils.expectSemanticViewField(page, S.viewTopK, '1');
      await utils.expectSemanticViewField(page, S.viewThreshold, '0.15');
      await utils.expectSemanticViewField(
        page,
        S.viewThresholdRelation,
        SV.relationText.lt,
      );
    });

    await test.step('「缓存规则」Tab 加载与展示不受影响', async () => {
      await utils.switchToRulesTab(page);
      await utils.expectRuleTableHeaders(page);
    });

    await utils.unmockAiCacheNetwork(page);
  });

  test('AC-S-08 响应含只读时间戳，提交仅三业务字段且 UI 无时间戳展示位', async ({
    page,
  }) => {
    let before;

    await test.step('前置：保存原始状态并进入语义设置 Tab', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
    });

    await test.step('GET 响应含只读创建/更新时间（RFC3339）', async () => {
      before = await utils.getAiCacheSemanticViaApi(page);
      expect(before).toBeTruthy();
      expect(before.created_at).toBeTruthy();
      expect(before.updated_at).toBeTruthy();
      expect(String(before.updated_at)).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
    });

    await test.step('查看态无时间戳展示位', async () => {
      await utils.expectSemanticNoTimestampField(page);
    });

    let payload;
    await test.step('修改后保存，PUT 体仅含三业务字段（不含时间戳）', async () => {
      await utils.enterSemanticEditMode(page);
      await utils.fillSemanticTopK(page, 5);
      await utils.fillSemanticThreshold(page, 0.5);
      const [res] = await Promise.all([
        utils.saveSemanticAndCapture(page),
        utils.expectAiCacheMessage(page, S.saveSuccessMsg, 15000),
      ]);
      payload = res.payload;
      expect(payload).toBeTruthy();
      expect(Object.keys(payload).sort()).toEqual(
        ['threshold', 'threshold_relation', 'top_k'].sort(),
      );
    });

    await test.step('保存成功后再次 GET，更新时间更新', async () => {
      const after = await utils.getAiCacheSemanticViaApi(page);
      expect(after).toBeTruthy();
      expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(before.updated_at).getTime(),
      );
    });

    await test.step('编辑态亦无时间戳输入项', async () => {
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticNoTimestampField(page);
    });
  });

  test('AC-S-09 语义设置与规则集合生命周期解耦', async ({ page }) => {
    await test.step('前置：保存原始状态并进入语义编辑态', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      // 「提交并生效」带 :disabled="!isDirty"（2026-10-15 变更，AICache/index.vue:49）：
      // 集合本就为空时 deleteAllRules 不产生本地净变更，提交按钮置灰、本用例第 3 步无从验证；
      // 先经 API 确保至少一条规则，使「清空全部规则」成为确定的净变更（cleanup 结束还原）。
      await utils.ensureAiCacheRuleExistsViaApi(
        page,
        utils.buildTestRule({
          name: utils.generateTestRuleName('ac_s09_seed_'),
        }),
      );
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const semTracker = utils.trackAiCacheSemanticRequests(page);
    const ruleTracker = utils.trackAiCacheRuleRequests(page);
    try {
      let semPayload;
      await test.step('在语义设置 Tab 保存一组设置值（Top K=2 / 阈值=0.25 / gt）', async () => {
        await utils.fillSemanticTopK(page, 2);
        await utils.fillSemanticThreshold(page, 0.25);
        await utils.selectSemanticRelation(page, S.relationGt);
        const [res] = await Promise.all([
          utils.saveSemanticAndCapture(page),
          utils.expectAiCacheMessage(page, S.saveSuccessMsg, 15000),
        ]);
        semPayload = res.payload;
      });

      await test.step('语义提交体不含规则数据，且保存语义未发送 PUT /ai-cache-rules', async () => {
        expect(semPayload).toBeTruthy();
        expect(semPayload.rules).toBeUndefined();
        expect(ruleTracker.state.put).toBe(0);
      });

      await test.step('切到「缓存规则」Tab，编辑模式清空全部规则并「提交并生效」', async () => {
        await utils.switchToRulesTab(page);
        await utils.enterEditMode(page);
        await utils.expectEditMode(page);
        await utils.deleteAllRules(page);
        const [{ payload }] = await Promise.all([
          utils.submitRulesAndCapture(page),
          utils.expectAiCacheMessage(page, P.submitSuccessMsg, 15000),
        ]);
        expect(payload).toBeTruthy();
        expect(payload.rules).toEqual([]);
        expect(payload.top_k).toBeUndefined();
        expect(payload.threshold).toBeUndefined();
      });

      await test.step('切回语义 Tab，语义设置仍为步骤 1 保存值', async () => {
        await utils.switchToSemanticTab(page);
        await utils.expectSemanticViewField(page, S.viewTopK, '2');
        await utils.expectSemanticViewField(page, S.viewThreshold, '0.25');
        await utils.expectSemanticViewField(
          page,
          S.viewThresholdRelation,
          S.relationGt,
        );
      });
    } finally {
      semTracker.stop();
      ruleTracker.stop();
    }
  });

  test('AC-S-10 Top K 取值 1-10 整数校验（0/11/小数拦截，1/10 合法）', async ({
    page,
  }) => {
    await test.step('前置：进入语义设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const tracker = utils.trackAiCacheSemanticRequests(page);
    try {
      await test.step('Top K 控件设置 min=1 / max=10 / step=1', async () => {
        await utils.expectSemanticNumberControl(page, S.topKLabel, {
          min: 1,
          max: 10,
          step: 1,
        });
      });

      await test.step('0 / 11 / 小数 2.5 拦截并提示「Top K 须为 1-10 的整数」，不发 PUT', async () => {
        for (const bad of [0, 11, 2.5]) {
          await utils.fillSemanticTopK(page, bad);
          await utils.clickSemanticSave(page);
          await utils.expectSemanticFieldError(
            page,
            S.topKLabel,
            S.tipTopKRange,
          );
          await utils.expectSemanticEditMode(page);
        }
        await utils.expectNoSemanticMutationRequest(tracker);
      });

      await test.step('1 / 10 边界合法（校验通过）', async () => {
        await utils.fillSemanticTopK(page, 1);
        await utils.expectSemanticFieldValid(page, S.topKLabel);
        await utils.fillSemanticTopK(page, 10);
        await utils.expectSemanticFieldValid(page, S.topKLabel);
      });

      await test.step('边界值 10 可成功提交并回到查看态', async () => {
        await cleanup.saveOriginalState(page);
        await utils.saveSemanticExpectMessage(page, S.saveSuccessMsg);
        await utils.expectSemanticViewMode(page);
        await utils.expectSemanticViewField(page, S.viewTopK, '10');
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-S-11 相似度阈值取值 0-2 校验（-0.1/2.1 拦截，0/2 合法）', async ({
    page,
  }) => {
    await test.step('前置：进入语义设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const tracker = utils.trackAiCacheSemanticRequests(page);
    try {
      await test.step('相似度阈值控件设置 min=0 / max=2 / step=0.01', async () => {
        await utils.expectSemanticNumberControl(page, S.thresholdLabel, {
          min: 0,
          max: 2,
          step: 0.01,
        });
      });

      await test.step('-0.1 / 2.1 拦截并提示「相似度阈值须在 0-2 之间」，不发 PUT', async () => {
        for (const bad of [-0.1, 2.1]) {
          await utils.fillSemanticThreshold(page, bad);
          await utils.clickSemanticSave(page);
          await utils.expectSemanticFieldError(
            page,
            S.thresholdLabel,
            S.tipThresholdRange,
          );
          await utils.expectSemanticEditMode(page);
        }
        await utils.expectNoSemanticMutationRequest(tracker);
      });

      await test.step('0 / 2 边界合法（校验通过）', async () => {
        await utils.fillSemanticThreshold(page, 0);
        await utils.expectSemanticFieldValid(page, S.thresholdLabel);
        await utils.fillSemanticThreshold(page, 2);
        await utils.expectSemanticFieldValid(page, S.thresholdLabel);
      });

      await test.step('边界值 2 可成功提交并回到查看态', async () => {
        await cleanup.saveOriginalState(page);
        await utils.saveSemanticExpectMessage(page, S.saveSuccessMsg);
        await utils.expectSemanticViewMode(page);
        await utils.expectSemanticViewField(page, S.viewThreshold, '2');
      });
    } finally {
      tracker.stop();
    }
  });

  test('AC-S-12 阈值比较关系四枚举大小写敏感', async ({ page }) => {
    await test.step('前置：进入语义设置编辑态', async () => {
      await utils.ensureAppSession(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);
      await utils.expectSemanticEditMode(page);
    });

    const tracker = utils.trackAiCacheSemanticRequests(page);
    try {
      await test.step('下拉仅含 4 个枚举选项（文案与 transfer 不被卡片裁剪）', async () => {
        await utils.expectSemanticRelationOptions(page);
      });

      await test.step('LT / eq 非法枚举拦截并提示「阈值比较关系不合法」，不发 PUT', async () => {
        for (const bad of ['LT', 'eq']) {
          await utils.injectSemanticRelation(page, bad);
          await utils.clickSemanticSave(page);
          await utils.expectSemanticFieldError(
            page,
            S.thresholdRelationLabel,
            S.tipRelationInvalid,
          );
          await utils.expectSemanticEditMode(page);
        }
        await utils.expectNoSemanticMutationRequest(tracker);
      });

      await test.step('大小写敏感：lte 合法而 LTE 非法', async () => {
        await utils.selectSemanticRelation(page, S.relationLte);
        await utils.expectSemanticFieldValid(page, S.thresholdRelationLabel);
        await utils.injectSemanticRelation(page, 'LTE');
        await utils.clickSemanticSave(page);
        await utils.expectSemanticFieldError(
          page,
          S.thresholdRelationLabel,
          S.tipRelationInvalid,
        );
      });
    } finally {
      tracker.stop();
    }

    await test.step('四种枚举均可保存，PUT 体为对应小写字符串', async () => {
      await cleanup.saveOriginalState(page);
      await utils.reloadAiCachePage(page);
      await utils.switchToSemanticTab(page);
      await utils.enterSemanticEditMode(page);

      const cases = [
        [S.relationLt, 'lt'],
        [S.relationLte, 'lte'],
        [S.relationGt, 'gt'],
        [S.relationGte, 'gte'],
      ];
      for (const [optionText, value] of cases) {
        await utils.selectSemanticRelation(page, optionText);
        const [res] = await Promise.all([
          utils.saveSemanticAndCapture(page),
          utils.expectAiCacheMessage(page, S.saveSuccessMsg, 15000),
        ]);
        expect(res.payload).toBeTruthy();
        expect(res.payload.threshold_relation).toBe(value);
        await utils.expectSemanticViewMode(page);
        await utils.expectSemanticViewField(
          page,
          S.viewThresholdRelation,
          optionText,
        );
        await utils.enterSemanticEditMode(page);
      }
    });
  });
});