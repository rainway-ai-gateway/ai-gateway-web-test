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
 * 流量镜像规则 - 新增与编辑
 * 用例：TM-C-01/02/03/04/05/06/07/08/09/10/11/13/14/15/16/17/18/19/20
 *
 * 说明：
 * - 新增/编辑表单为纯前端行为，默认用 mockRulesGetResponse 注入空集合构造受控环境，
 *   并以 trackTrafficMirrorRuleRequests 断言本地保存不发起 PUT；
 * - 编辑回显/集合内查重用例经 API 造数（saveOriginalState 备份、afterEach 恢复）；
 * - 镜像集群下拉选项来自真实 GET clusters，选择首集群；
 * - P2 用例（C-12 设置请求头空态）并入 C-11 步骤断言，不单列。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');

const cleanup = utils.createTrafficMirrorTestCleanup();
const P = utils.DOC_TM_PAGE;
const R = utils.DOC_TM_RULES;
const F = utils.DOC_TM_RULE_FORM;
const COL = R.columnIndex;

/** 标准前置：登录 + 备份 +（可选 mock 空集合）+ 进页面 + 编辑模式 + 新增抽屉；返回首集群名 */
async function prepareAddDrawer(page, { mockEmpty = true } = {}) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  const clusters = await utils.fetchClusterNamesViaApi(page);
  expect(clusters && clusters.length > 0, '集群列表非空（新增前置）').toBe(
    true,
  );
  if (mockEmpty) {
    await utils.mockRulesGetResponse(page, { rules: [] });
  }
  await utils.gotoTrafficMirrorPageAndWaitForRules(page);
  await utils.enterEditMode(page);
  await utils.openAddRuleDrawer(page);
  return clusters[0];
}

/** 填一条最小合法规则（名称/条件/集群/比例） */
async function fillMinimalRule(page, name, clusterName, cond) {
  await utils.fillRuleName(page, name);
  await utils.fillRuleCond(page, cond);
  await utils.selectMirrorCluster(page, clusterName);
  await utils.fillRulePercentage(page, 10);
}

async function seedRule(page, overrides = {}) {
  const clusters = await utils.fetchClusterNamesViaApi(page);
  const rule = utils.buildTestRule({ mirror_cluster: clusters[0], ...overrides });
  const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule]);
  expect(ok, 'API 造数流量镜像规则成功').toBe(true);
  return { rule, clusterName: clusters[0] };
}

test.describe('流量镜像规则 - 新增与编辑', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page);
    await cleanup.cleanup(page);
  });

  test('TM-C-01 新增镜像规则成功', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c01_');
    const condText = 'req_path_prefix_in("/v1/chat/completions", true)';
    const percentage = 10;
    const tracker = utils.trackTrafficMirrorRuleRequests(page);
    let clusterName = '';

    try {
      await test.step('前置：注入空集合并获取首个集群名', async () => {
        clusterName = await prepareAddDrawer(page);
      });

      await test.step('填写规则名称/生效条件/镜像集群/采样比例（默认黑名单）并「本地保存」', async () => {
        await fillMinimalRule(page, newName, clusterName, condText);
        await utils.expectMirrorCluster(page, clusterName);
        await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
      });

      await test.step('新规则 unshift 至集合头部，列表展示对应值', async () => {
        await utils.expectRuleRowVisible(page, newName);
        const names = await utils.getRuleNamesInOrder(page);
        expect(names[0], '新增规则应插入集合头部').toBe(newName);
        await utils.expectRuleCellContains(page, newName, COL.cond, condText);
        await utils.expectRuleCellText(page, newName, COL.cluster, clusterName);
        await utils.expectRuleCellText(
          page,
          newName,
          COL.percentage,
          R.percentageText(percentage),
        );
        // 默认黑名单（不携带 remove_headers）→ 列表显示默认黑名单文案
        await utils.expectRuleCellText(
          page,
          newName,
          COL.removeHeaders,
          R.headersDefault,
        );
      });

      await test.step('「本地保存」未发起 traffic-mirror-rules 变更请求(PUT)', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-C-02 新增抽屉字段与文案', async ({ page }) => {
    let firstCluster = '';

    await test.step('前置：打开新增抽屉', async () => {
      firstCluster = await prepareAddDrawer(page);
    });

    await test.step('规则名称/生效条件/镜像集群/采样比例字段标签与占位', async () => {
      await expect(
        utils.ruleFormScope(page).getByPlaceholder(F.ruleNamePlaceholder),
      ).toBeVisible();
      await expect(
        utils.ruleFormItem(page, F.condFieldLabel).locator('.ivu-form-item-label'),
      ).toHaveText(F.condFieldLabel);
      // 源码默认选中第一个集群（RuleForm.vue buildFormData），占位不可见，改断言默认选中值
      await utils.expectMirrorCluster(page, firstCluster);
      await expect(
        utils.ruleFormItem(page, F.percentageFieldLabel).locator(
          '.ivu-form-item-label',
        ),
      ).toHaveText(F.percentageFieldLabel);
      await utils.expectPercentagePlaceholder(page);
      await utils.expectRulePercentage(page, 100);
    });

    await test.step('头部剔除策略选项为三项', async () => {
      const trigger = utils
        .ruleFormItem(page, F.headerModeFieldLabel)
        .locator('.ivu-select');
      await trigger.click();
      const options = (
        await page
          .locator('.ivu-select-dropdown:visible .ivu-select-item')
          .allInnerTexts()
      ).map((t) => t.trim());
      await page.keyboard.press('Escape');
      expect(options).toEqual([
        F.headerModeDefault,
        F.headerModeNone,
        F.headerModeCustom,
      ]);
      await utils.expectCustomRemoveHeadersInputHidden(page);
    });

    await test.step('设置请求头/请求体改写空态与添加按钮，路径改写占位，底部按钮', async () => {
      await expect(
        utils.ruleFormScope(page).getByText(F.emptyHeaders, { exact: true }),
      ).toBeVisible();
      await expect(
        utils.ruleFormScope(page)
          .getByRole('button', { name: F.addHeaderButton, exact: true }),
      ).toBeVisible();
      await expect(
        utils.ruleFormItem(page, F.bodyRewritesFieldLabel).locator(
          '.ivu-form-item-label',
        ),
      ).toHaveText(F.bodyRewritesFieldLabel);
      await expect(
        utils.ruleFormScope(page).getByText(F.emptyBodyRewrites, { exact: true }),
      ).toBeVisible();
      await expect(
        utils.ruleFormScope(page)
          .getByRole('button', { name: F.addBodyRewriteButton, exact: true }),
      ).toBeVisible();
      await expect(
        utils.ruleFormScope(page).getByPlaceholder(F.pathRewritePlaceholder),
      ).toBeVisible();
      await expect(
        utils.ruleFormScope(page)
          .getByRole('button', { name: F.localSaveButton, exact: true }),
      ).toBeVisible();
      await expect(
        utils.ruleFormScope(page)
          .getByRole('button', { name: F.resetButton, exact: true }),
      ).toBeVisible();
    });
  });

  test('TM-C-03 编辑镜像规则回显正确', async ({ page }) => {
    let rule;
    let clusterName;

    await test.step('前置：API 造数一条全字段规则（自定义头部剔除/请求头/请求体改写）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule, clusterName } = await seedRule(page, {
        remove_headers: ['Authorization', 'Cookie'],
        percentage: 10,
      }));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('打开编辑抽屉：标题「编辑镜像规则」，各字段正确回显', async () => {
      await utils.openEditRuleDrawer(page, rule.name);
      const nameInput = utils
        .ruleFormScope(page)
        .getByPlaceholder(F.ruleNamePlaceholder);
      await expect(nameInput).toHaveValue(rule.name);
      await utils.expectMirrorCluster(page, clusterName);
      await utils.expectRulePercentage(page, 10);
      // 自定义头部剔除 → 策略回显 + 自定义输入框 join(',')
      await utils.expectHeaderModeSelected(page, F.headerModeCustom);
      await utils.expectCustomRemoveHeadersInputVisible(page);
      await expect(utils.ruleFormScope(page).getByPlaceholder(
        F.headerCustomPlaceholder,
      )).toHaveValue('Authorization,Cookie');
      // 设置请求头 KV 行 / 请求体改写行回显
      expect(await utils.getSetHeaderRowCount(page), '设置请求头回显 1 行').toBe(1);
      await utils.expectSetHeaderRow(page, 0, 'X-Shadow-Env', 'pre-release');
      expect(await utils.getBodyRewriteRowCount(page), '请求体改写回显 1 行').toBe(1);
      await utils.expectBodyRewriteRow(page, 0, 'model', 'deepseek-v3');
    });

    await test.step('修改采样比例为 20 并保存：提示「保存成功!」，列表更新', async () => {
      await utils.fillRulePercentage(page, 20);
      await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleCellText(page, rule.name, COL.percentage, '20%');
    });
  });

  test('TM-C-04 镜像集群下拉选项来自集群列表', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('下拉选项与 GET clusters 返回的集群名逐一对应', async () => {
      const apiClusters = await utils.fetchClusterNamesViaApi(page);
      const options = await utils.getClusterOptions(page);
      expect(options, '下拉选项等于集群名列表').toEqual(apiClusters);
    });
  });

  test('TM-C-05 镜像集群默认选中首个集群', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('镜像集群默认取集群列表首项', async () => {
      const clusters = await utils.fetchClusterNamesViaApi(page);
      await utils.expectMirrorCluster(page, clusters[0]);
    });
  });

  test('TM-C-06 采样比例默认值', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('默认值与占位均为 100', async () => {
      await utils.expectRulePercentage(page, 100);
      await utils.expectPercentagePlaceholder(page);
    });
  });

  test('TM-C-07 头部剔除策略默认黑名单', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c07_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉，保持默认黑名单', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.expectHeaderModeSelected(page, F.headerModeDefault);
    });

    await test.step('默认黑名单模式下不显示自定义输入框', async () => {
      await utils.expectCustomRemoveHeadersInputHidden(page);
    });

    await test.step('保存后列表显示默认黑名单文案', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c07", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleCellText(
        page,
        newName,
        COL.removeHeaders,
        R.headersDefault,
      );
    });
  });

  test('TM-C-08 头部剔除策略不剔除任何头部', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c08_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉并选择「不剔除任何头部」', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.selectHeaderMode(page, F.headerModeNone);
      await utils.expectHeaderModeSelected(page, F.headerModeNone);
      await utils.expectCustomRemoveHeadersInputHidden(page);
    });

    await test.step('保存后列表显示「不剔除任何头部」', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c08", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleCellText(
        page,
        newName,
        COL.removeHeaders,
        R.headersNone,
      );
    });
  });

  test('TM-C-09 头部剔除策略自定义剔除列表', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c09_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉并选择「自定义剔除列表」', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.selectHeaderMode(page, F.headerModeCustom);
      await utils.expectCustomRemoveHeadersInputVisible(page);
      await utils.fillCustomRemoveHeaders(page, 'Authorization,Cookie,X-Custom-Secret');
    });

    await test.step('保存后列表以逗号加空格连接展示', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c09", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleCellText(
        page,
        newName,
        COL.removeHeaders,
        'Authorization, Cookie, X-Custom-Secret',
      );
    });
  });

  test('TM-C-10 自定义剔除列表为空拦截', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c10_');
    let clusterName = '';

    await test.step('前置：自定义剔除列表模式，输入框仅填逗号/空格', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.selectHeaderMode(page, F.headerModeCustom);
      await utils.fillCustomRemoveHeaders(page, ', ,');
    });

    await test.step('本地保存被拦截：提示「自定义剔除列表不能为空」，抽屉不关闭', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c10", true)');
      await utils.submitRuleFormExpectMessage(page, F.removeHeadersEmptyMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleTableEmpty(page);
    });
  });

  test('TM-C-11 设置请求头增删行', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c11_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉，添加两行请求头', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.clickAddSetHeader(page);
      await utils.clickAddSetHeader(page);
      expect(await utils.getSetHeaderRowCount(page), '共 2 行').toBe(2);
      await utils.fillSetHeaderRow(page, 0, 'X-Shadow-Env', 'pre-release');
    });

    await test.step('删除第二行后剩 1 行', async () => {
      await utils.clickRemoveSetHeaderRow(page, 1);
      expect(await utils.getSetHeaderRowCount(page), '删除后剩 1 行').toBe(1);
    });

    await test.step('本地保存成功', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c11", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(page, newName);
    });
  });

  test('TM-C-13 请求体改写增删行', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c13_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉，添加两行改写', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.clickAddBodyRewrite(page);
      await utils.clickAddBodyRewrite(page);
      expect(await utils.getBodyRewriteRowCount(page), '共 2 行').toBe(2);
      await utils.fillBodyRewriteRow(page, 0, 'deepseek-v3');
    });

    await test.step('删除第二行后剩 1 行（path 固定 model）', async () => {
      await utils.clickRemoveBodyRewriteRow(page, 1);
      expect(await utils.getBodyRewriteRowCount(page), '删除后剩 1 行').toBe(1);
      await utils.expectBodyRewriteRow(page, 0, 'model', 'deepseek-v3');
    });

    await test.step('本地保存成功', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c13", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(page, newName);
    });
  });

  test('TM-C-14 请求体改写路径固定为model字段', async ({ page }) => {
    await test.step('前置：打开新增抽屉并添加一行改写', async () => {
      await prepareAddDrawer(page);
      await utils.clickAddBodyRewrite(page);
    });

    await test.step('path 下拉仅有 model 一个选项且默认选中', async () => {
      const options = await utils.getBodyRewritePathOptions(page);
      expect(options, 'path 下拉仅 model').toEqual(['model']);
      await utils.expectBodyRewriteRow(page, 0, 'model', '');
    });
  });

  test('TM-C-15 路径改写输入与占位', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_c15_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉，填写合法路径', async () => {
      clusterName = await prepareAddDrawer(page);
      await expect(
        utils.ruleFormScope(page).getByPlaceholder(F.pathRewritePlaceholder),
      ).toBeVisible();
      await utils.fillPathRewrite(page, '/v1/internal/chat/completions');
    });

    await test.step('保存成功且列表展示路径改写', async () => {
      await fillMinimalRule(page, newName, clusterName, 'req_path_prefix_in("/v1/tm_c15", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleCellText(
        page,
        newName,
        COL.pathRewrite,
        '/v1/internal/chat/completions',
      );
    });
  });

  test('TM-C-16 新增时集合内规则名称查重', async ({ page }) => {
    const newCond = 'req_path_prefix_in("/v1/tm_c16", true)';
    let seeded;

    await test.step('前置：API 造数规则 A（真实 GET 加载集合）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule: seeded } = await seedRule(page, { cond: newCond }));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增同名规则被拦截：提示名称重复，不写入集合', async () => {
      await utils.openAddRuleDrawer(page);
      const countBefore = await utils.getRuleRowCount(page);
      await fillMinimalRule(page, seeded.name, seeded.mirror_cluster, newCond);
      await utils.submitRuleFormExpectMessage(page, F.nameDuplicateMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      const countAfter = await utils.getRuleRowCount(page);
      expect(countAfter, '集合行数不变').toBe(countBefore);
    });
  });

  test('TM-C-17 新增时集合内生效条件查重', async ({ page }) => {
    const dupCond = 'req_path_prefix_in("/v1/tm_c17_dup", true)';
    let seeded;

    await test.step('前置：API 造数规则（真实 GET 加载集合）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule: seeded } = await seedRule(page, { cond: dupCond }));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增同生效条件规则被拦截：提示条件重复，不写入集合', async () => {
      await utils.openAddRuleDrawer(page);
      const newName = utils.generateTestRuleName('tm_c17_');
      await fillMinimalRule(page, newName, seeded.mirror_cluster, dupCond);
      await utils.submitRuleFormExpectMessage(page, F.condDuplicateMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleRowHidden(page, newName);
    });
  });

  test('TM-C-18 本地保存与重置', async ({ page }) => {
    let clusterName = '';

    await test.step('前置：打开新增抽屉并修改若干字段', async () => {
      clusterName = await prepareAddDrawer(page);
      await utils.fillRuleName(page, utils.generateTestRuleName('tm_c18_'));
      await utils.fillRuleCond(page, 'req_path_prefix_in("/v1/tm_c18", true)');
      await utils.selectMirrorCluster(page, clusterName);
      await utils.fillRulePercentage(page, 50);
      await utils.selectHeaderMode(page, F.headerModeCustom);
      await utils.fillCustomRemoveHeaders(page, 'Authorization');
    });

    await test.step('点击「重置」恢复新增默认值', async () => {
      await utils.clickRuleFormReset(page);
      await expect(
        utils.ruleFormScope(page).getByPlaceholder(F.ruleNamePlaceholder),
      ).toHaveValue('');
      await utils.expectRulePercentage(page, 100);
      await utils.expectHeaderModeSelected(page, F.headerModeDefault);
      await utils.expectCustomRemoveHeadersInputHidden(page);
    });
  });

  test('TM-C-19 新增规则插入集合头部', async ({ page }) => {
    const nameR1 = utils.generateTestRuleName('tm_c19_r1_');
    const nameR2 = utils.generateTestRuleName('tm_c19_r2_');
    let clusterName = '';

    await test.step('前置：mock 空集合并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      clusterName = clusters[0];
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('依次新增 R1、R2，最新规则排在最前', async () => {
      await utils.openAddRuleDrawer(page);
      await fillMinimalRule(page, nameR1, clusterName, 'req_path_prefix_in("/v1/tm_c19_a", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);

      await utils.openAddRuleDrawer(page);
      await fillMinimalRule(page, nameR2, clusterName, 'req_path_prefix_in("/v1/tm_c19_b", true)');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);

      const names = await utils.getRuleNamesInOrder(page);
      expect(names.slice(0, 2), 'unshift 顺序：R2 在 R1 前').toEqual([
        nameR2,
        nameR1,
      ]);
    });
  });

  test('TM-C-20 提交体剥离只读字段', async ({ page }) => {
    let rule;
    let clusterName;

    await test.step('前置：API 造数规则（GET 回填 created_at/updated_at）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule, clusterName } = await seedRule(page));
      const apiRules = await utils.fetchTrafficMirrorRulesViaApi(page);
      const current = apiRules.find((item) => item.name === rule.name);
      expect(current && current.created_at, '服务端回填创建时间').toBeTruthy();
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('前置：本地新增一条规则制造改动，解除「提交并生效」置灰', async () => {
      // 「提交并生效」带 :disabled="!isDirty"（2026-10-15 变更，index.vue:47），
      // 无本地改动时点击无效，本用例的 payload 断言根本进不去。
      // 改动刻意用「本地新增」而非「编辑造数规则」：造数规则必须原样留在本地集合里，
      // 它的 created_at/updated_at 来自 GET 回填，只有它带时间戳进入 buildPayload
      // （index.vue:499-505 的 delete），断言才具备可证伪性。
      await utils.openAddRuleDrawer(page);
      await fillMinimalRule(
        page,
        utils.generateTestRuleName('tm_c20_local_'),
        clusterName,
        'req_path_prefix_in("/v1/tm_c20", true)',
      );
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('提交并生效：PUT 请求体不含 created_at/updated_at', async () => {
      const { payload } = await utils.submitRulesAndCapture(page);
      utils.expectRulesPayloadNoTimestamps(payload);
      await utils.expectTrafficMirrorMessage(page, P.submitSuccessMsg);
    });
  });
});
