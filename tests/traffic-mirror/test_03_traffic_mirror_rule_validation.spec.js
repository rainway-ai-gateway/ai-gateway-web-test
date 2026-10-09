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
 * 流量镜像规则 - 字段校验
 * 用例：TM-V-01 ~ TM-V-17（字段校验矩阵全量）
 *
 * 说明：
 * - 必填/长度/范围等前端校验为纯前端行为，用 mockRulesGetResponse 注入空集合构造受控环境；
 * - 集合内查重的「本地保存」路径用 API 造数 + 真实 GET，「提交并生效」查重路径用 mock 注入重复集合；
 * - TM-V-07 镜像集群 Select 非 clearable，UI 不可清空，仅断言默认选中首项 + 必填星号；
 * - TM-V-08 为纯服务端引用校验，直接经 OpenAPI 断言 422；
 * - afterEach cleanup 经 API 恢复原始集合（mock 不改变服务端数据，恢复幂等）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');

const cleanup = utils.createTrafficMirrorTestCleanup();
const P = utils.DOC_TM_PAGE;
const R = utils.DOC_TM_RULES;
const F = utils.DOC_TM_RULE_FORM;
const COL = R.columnIndex;

/** 标准前置：登录 + 备份 + mock 空集合 + 进页面 + 编辑模式 + 新增抽屉；返回首集群名 */
async function prepareAddDrawer(page) {
  await utils.ensureAppSession(page);
  await cleanup.saveOriginalState(page);
  const clusters = await utils.fetchClusterNamesViaApi(page);
  expect(clusters && clusters.length > 0, '集群列表非空（新增前置）').toBe(
    true,
  );
  await utils.mockRulesGetResponse(page, { rules: [] });
  await utils.gotoTrafficMirrorPageAndWaitForRules(page);
  await utils.enterEditMode(page);
  await utils.openAddRuleDrawer(page);
  return clusters[0];
}

/** 填一条最小合法规则（名称/条件/集群/比例） */
async function fillMinimalRule(page, name, clusterName, cond, percentage = 10) {
  await utils.fillRuleName(page, name);
  await utils.fillRuleCond(page, cond);
  await utils.selectMirrorCluster(page, clusterName);
  await utils.fillRulePercentage(page, percentage);
}

async function seedRule(page, overrides = {}) {
  const clusters = await utils.fetchClusterNamesViaApi(page);
  const rule = utils.buildTestRule({ mirror_cluster: clusters[0], ...overrides });
  const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule]);
  expect(ok, 'API 造数流量镜像规则成功').toBe(true);
  return { rule, clusterName: clusters[0] };
}

test.describe('流量镜像规则 - 字段校验', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page);
    await cleanup.cleanup(page);
  });

  test('TM-V-01 规则名称必填', async ({ page }) => {
    await test.step('前置：注入空集合并进入编辑模式打开新增抽屉', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('规则名称留空失焦后，名称项下方出现「请输入规则名称」', async () => {
      await utils.blurRuleName(page);
      await utils.expectRuleFormError(
        page,
        F.ruleNameFieldLabel,
        F.ruleNameRequiredMsg,
      );
    });

    await test.step('点击「本地保存」被拦截：提示「请检查参数填写是否规范!」', async () => {
      await utils.submitRuleFormExpectMessage(
        page,
        utils.DOC_TM_PAGE.validateErrorMsg,
      );
    });

    await test.step('抽屉不关闭、不写入集合（列表仍为空）', async () => {
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleTableEmpty(page);
    });
  });

  test('TM-V-02 规则名称长度1至128', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('128 字符校验通过，无错误提示', async () => {
      await utils.fillRuleName(page, 'a'.repeat(128));
      await utils.expectRuleFormFieldValid(page, F.ruleNameFieldLabel);
    });

    await test.step('129 字符失焦后提示「规则名称长度应为 1-128 字符」', async () => {
      await utils.fillRuleName(page, 'a'.repeat(129));
      await utils.expectRuleFormError(page, F.ruleNameFieldLabel, F.nameLengthMsg);
    });

    await test.step('超长时「本地保存」被拦截：提示「请检查参数填写是否规范!」，抽屉不关闭', async () => {
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleTableEmpty(page);
    });
  });

  test('TM-V-03 规则名称集合内唯一', async ({ page }) => {
    let seeded;

    await test.step('前置：API 造数规则 A（真实 GET 加载集合）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule: seeded } = await seedRule(page));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增同名规则「本地保存」被拦截：提示名称重复，抽屉不关闭、集合不变', async () => {
      await utils.openAddRuleDrawer(page);
      const countBefore = await utils.getRuleRowCount(page);
      await fillMinimalRule(
        page,
        seeded.name,
        seeded.mirror_cluster,
        'req_path_prefix_in("/v1/tm_v03", true)',
      );
      await utils.submitRuleFormExpectMessage(page, F.nameDuplicateMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      expect(await utils.getRuleRowCount(page), '集合行数不变').toBe(
        countBefore,
      );
    });

    await test.step('编辑规则排除自身索引：原名保存不报重复', async () => {
      await utils.closeRuleFormDrawer(page);
      await utils.openEditRuleDrawer(page, seeded.name);
      await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('「提交并生效」前集合内名称去重：拦截且不发起 PUT', async () => {
      const clusters = await utils.fetchClusterNamesViaApi(page);
      const dupName = utils.generateTestRuleName('tm_v03_dup_');
      await utils.mockRulesGetResponse(page, {
        rules: [
          utils.buildTestRule({
            name: dupName,
            cond: 'req_path_prefix_in("/v1/tm_v03_a", true)',
            mirror_cluster: clusters[0],
          }),
          utils.buildTestRule({
            name: dupName,
            cond: 'req_path_prefix_in("/v1/tm_v03_b", true)',
            mirror_cluster: clusters[0],
          }),
        ],
      });
      await utils.reloadTrafficMirrorPage(page);
      await utils.enterEditMode(page);
      const tracker = utils.trackTrafficMirrorRuleRequests(page);
      try {
        await utils.expectTrafficMirrorMessageDuringAction(
          page,
          F.nameDuplicateMsg,
          () => utils.clickSubmitAndEffect(page),
        );
        await utils.expectNoRuleMutationRequest(tracker);
      } finally {
        tracker.stop();
      }
    });
  });

  test('TM-V-04 生效条件必填', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('标签含全量匹配提示；生效条件留空，提交时整体校验暴露必填错误', async () => {
      await expect(
        utils.ruleFormItem(page, F.condFieldLabel).locator('.ivu-form-item-label'),
      ).toHaveText(F.condFieldLabel);
      // 生效条件为 Expression 组件，校验时 condErrmsg（编译错误）优先展示；
      // 空值不经由 UI 单独触发 change 校验，经「本地保存」整体校验暴露必填错误。
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
      await utils.expectRuleFormError(page, F.condFieldLabel, F.condRequiredMsg);
    });
  });

  test('TM-V-05 生效条件集合内唯一', async ({ page }) => {
    const dupCond = 'req_path_prefix_in("/v1/tm_v05", true)';
    let seeded;

    await test.step('前置：API 造数规则（真实 GET 加载集合）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule: seeded } = await seedRule(page, { cond: dupCond }));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('新增同生效条件规则「本地保存」被拦截：提示条件重复，抽屉不关闭', async () => {
      await utils.openAddRuleDrawer(page);
      const newName = utils.generateTestRuleName('tm_v05_');
      await fillMinimalRule(page, newName, seeded.mirror_cluster, dupCond);
      await utils.submitRuleFormExpectMessage(page, F.condDuplicateMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleRowHidden(page, newName);
    });

    await test.step('编辑规则排除自身索引：原条件保存不报重复', async () => {
      await utils.closeRuleFormDrawer(page);
      await utils.openEditRuleDrawer(page, seeded.name);
      await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });

    await test.step('「提交并生效」前集合内生效条件去重：拦截且不发起 PUT', async () => {
      const clusters = await utils.fetchClusterNamesViaApi(page);
      await utils.mockRulesGetResponse(page, {
        rules: [
          utils.buildTestRule({
            cond: dupCond,
            mirror_cluster: clusters[0],
          }),
          utils.buildTestRule({
            cond: dupCond,
            mirror_cluster: clusters[0],
          }),
        ],
      });
      await utils.reloadTrafficMirrorPage(page);
      await utils.enterEditMode(page);
      const tracker = utils.trackTrafficMirrorRuleRequests(page);
      try {
        await utils.expectTrafficMirrorMessageDuringAction(
          page,
          F.condDuplicateMsg,
          () => utils.clickSubmitAndEffect(page),
        );
        await utils.expectNoRuleMutationRequest(tracker);
      } finally {
        tracker.stop();
      }
    });
  });

  test('TM-V-06 全量匹配须显式使用default_t', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v06_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉', async () => {
      clusterName = await prepareAddDrawer(page);
    });

    await test.step('显式填写 default_t() 校验通过并写入集合', async () => {
      await fillMinimalRule(page, newName, clusterName, 'default_t()');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(page, newName);
      await utils.expectRuleCellContains(page, newName, COL.cond, 'default_t()');
    });
  });

  test('TM-V-07 镜像集群必填', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('新增时镜像集群默认选中集群列表首项，且为必填项（星号）', async () => {
      const clusters = await utils.fetchClusterNamesViaApi(page);
      await utils.expectMirrorCluster(page, clusters[0]);
      await utils.expectClusterFieldRequired(page);
    });

    // （说明）镜像集群 Select 非 clearable，UI 无法清空集群，「请选择镜像集群」错误提示
    // 仅能通过代码层构造（ruleValidate.mirror_cluster, trigger: change），UI 操作不可达；
    // 服务端引用校验兜底见 TM-V-08。
  });

  test('TM-V-08 镜像集群引用校验不存在返回422', async ({ page }) => {
    await test.step('前置：登录并备份原始集合', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
    });

    await test.step('PUT 指向不存在集群：服务端返回 422', async () => {
      const rule = utils.buildTestRule({
        mirror_cluster: 'tm-not-exist-cluster-' + Date.now(),
      });
      const body = await utils.putTrafficMirrorRulesRawViaApi(page, [rule]);
      expect(body && body.ErrNum, '服务端对不存在集群返回 422').toBe(422);
    });
  });

  test('TM-V-09 采样比例范围0至100', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('0 与 100 为合法边界值', async () => {
      await utils.fillRulePercentage(page, 0);
      await utils.expectRuleFormFieldValid(page, F.percentageFieldLabel);
      await utils.fillRulePercentage(page, 100);
      await utils.expectRuleFormFieldValid(page, F.percentageFieldLabel);
    });

    await test.step('越界（101）与清空均提示「采样比例必须为 0-100 的整数」', async () => {
      await utils.fillRulePercentage(page, 101);
      await utils.expectRuleFormError(
        page,
        F.percentageFieldLabel,
        F.percentageRangeMsg,
      );
      await utils.fillRulePercentage(page, '');
      await utils.expectRuleFormError(
        page,
        F.percentageFieldLabel,
        F.percentageRangeMsg,
      );
    });

    await test.step('InputNumber 占位 100，标签为「采样比例（0-100，0 表示命中不采样）」', async () => {
      await utils.expectPercentagePlaceholder(page);
      await expect(
        utils.ruleFormItem(page, F.percentageFieldLabel).locator(
          '.ivu-form-item-label',
        ),
      ).toHaveText(F.percentageFieldLabel);
    });

    await test.step('校验不通过时「本地保存」被拦截：提示「请检查参数填写是否规范!」', async () => {
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });

  test('TM-V-10 采样比例0为命中不采样', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v10_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉', async () => {
      clusterName = await prepareAddDrawer(page);
    });

    await test.step('采样比例 0 校验通过并写入集合，列表显示 0%', async () => {
      await fillMinimalRule(
        page,
        newName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v10", true)',
        0,
      );
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(page, newName);
      await utils.expectRuleCellText(page, newName, COL.percentage, '0%');
    });

    await test.step('提交并生效：提交体采样比例为 0', async () => {
      const { payload } = await utils.submitRulesAndCapture(page);
      expect(payload, '捕获 PUT 请求体').toBeTruthy();
      const submitted = payload.rules.find((item) => item.name === newName);
      expect(submitted, '提交体包含该规则').toBeTruthy();
      expect(submitted.percentage, '提交体 percentage=0').toBe(0);
    });
  });

  test('TM-V-11 自定义剔除列表元素非空', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v11_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉', async () => {
      clusterName = await prepareAddDrawer(page);
    });

    await test.step('合法输入 Authorization,Cookie：分割 trim 后写入集合，列表展示剔除列表', async () => {
      await utils.selectHeaderMode(page, F.headerModeCustom);
      await utils.expectCustomRemoveHeadersInputVisible(page);
      await utils.fillCustomRemoveHeaders(page, 'Authorization,Cookie');
      await fillMinimalRule(
        page,
        newName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v11_a", true)',
      );
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleCellText(
        page,
        newName,
        COL.removeHeaders,
        R.removeHeadersText(['Authorization', 'Cookie']),
      );
    });

    await test.step('自定义输入框为空时「本地保存」被拦截：提示「自定义剔除列表不能为空」', async () => {
      await utils.openAddRuleDrawer(page);
      const blockedName = utils.generateTestRuleName('tm_v11_blk_');
      await utils.selectHeaderMode(page, F.headerModeCustom);
      await fillMinimalRule(
        page,
        blockedName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v11_b", true)',
      );
      await utils.submitRuleFormExpectMessage(page, F.removeHeadersEmptyMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.expectRuleRowHidden(page, blockedName);
    });
  });

  test('TM-V-12 设置请求头键值非空', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v12_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉（空态「暂无设置请求头」）', async () => {
      clusterName = await prepareAddDrawer(page);
      await expect(
        utils.ruleFormScope(page).getByText(F.emptyHeaders, { exact: true }),
      ).toBeVisible();
    });

    await test.step('两行中一行 key 仅空格：「本地保存」被拦截，提示「设置请求头的名称与值均不能为空」', async () => {
      await fillMinimalRule(
        page,
        newName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v12", true)',
      );
      await utils.clickAddSetHeader(page);
      await utils.clickAddSetHeader(page);
      await utils.fillSetHeaderRow(page, 0, 'X-Shadow-Env', 'pre-release');
      await utils.fillSetHeaderRow(page, 1, '   ', 'v');
      await utils.submitRuleFormExpectMessage(page, F.headerKvRequiredMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('补齐后「本地保存」成功', async () => {
      await utils.fillSetHeaderRow(page, 1, 'X-Trace-Id', '123');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });

  test('TM-V-13 设置请求头不建议配置X-Bfe-Mirror', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v13_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉', async () => {
      clusterName = await prepareAddDrawer(page);
    });

    await test.step('配置 X-Bfe-Mirror 前端不拦截：照常写入集合（规范建议，非强制校验）', async () => {
      await fillMinimalRule(
        page,
        newName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v13", true)',
      );
      await utils.clickAddSetHeader(page);
      await utils.fillSetHeaderRow(page, 0, 'X-Bfe-Mirror', 'true');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(page, newName);
    });
  });

  test('TM-V-14 请求体改写值必填非空', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v14_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉（空态「暂无请求体改写」）', async () => {
      clusterName = await prepareAddDrawer(page);
      await expect(
        utils.ruleFormScope(page).getByText(F.emptyBodyRewrites, { exact: true }),
      ).toBeVisible();
    });

    await test.step('两行中一行 value 留空：「本地保存」被拦截，提示「请求体改写的值不能为空」', async () => {
      await fillMinimalRule(
        page,
        newName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v14", true)',
      );
      await utils.clickAddBodyRewrite(page);
      await utils.clickAddBodyRewrite(page);
      await utils.fillBodyRewriteRow(page, 0, 'deepseek-v3');
      await utils.submitRuleFormExpectMessage(page, F.bodyValueRequiredMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('补齐后「本地保存」成功', async () => {
      await utils.fillBodyRewriteRow(page, 1, 'gpt-4o');
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });

  test('TM-V-15 请求体改写路径固定model', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('表单标签为「请求体改写（一期仅支持 model 字段）」', async () => {
      await expect(
        utils.ruleFormItem(page, F.bodyRewritesFieldLabel).locator(
          '.ivu-form-item-label',
        ),
      ).toHaveText(F.bodyRewritesFieldLabel);
    });

    await test.step('新增行 path 下拉仅有 model 且默认选中', async () => {
      await utils.clickAddBodyRewrite(page);
      const options = await utils.getBodyRewritePathOptions(page);
      expect(options, 'path 下拉仅 model 一个选项').toEqual(['model']);
      await utils.expectBodyRewriteRow(page, 0, 'model', '');
    });
  });

  test('TM-V-16 路径改写非空须以斜杠开头', async ({ page }) => {
    await test.step('前置：打开新增抽屉', async () => {
      await prepareAddDrawer(page);
    });

    await test.step('以 / 开头的非空值校验通过', async () => {
      await utils.fillPathRewrite(page, '/v1/internal/chat/completions');
      await utils.expectRuleFormFieldValid(page, F.pathRewriteFieldLabel);
    });

    await test.step('不以 / 开头的值失焦后提示「路径改写必须以 / 开头」', async () => {
      await utils.fillPathRewrite(page, 'v1/chat');
      await utils.expectRuleFormError(
        page,
        F.pathRewriteFieldLabel,
        F.pathRewriteSlashMsg,
      );
    });

    await test.step('校验不通过时「本地保存」被拦截：提示「请检查参数填写是否规范!」，抽屉不关闭', async () => {
      await utils.submitRuleFormExpectMessage(page, P.validateErrorMsg);
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('标签与占位文案', async () => {
      await expect(
        utils.ruleFormItem(page, F.pathRewriteFieldLabel).locator(
          '.ivu-form-item-label',
        ),
      ).toHaveText(F.pathRewriteFieldLabel);
      await expect(
        utils.ruleFormScope(page).getByPlaceholder(F.pathRewritePlaceholder),
      ).toBeVisible();
    });
  });

  test('TM-V-17 路径改写留空表示不改写', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_v17_');
    let clusterName = '';

    await test.step('前置：打开新增抽屉', async () => {
      clusterName = await prepareAddDrawer(page);
    });

    await test.step('仅填空格：trim 后视为不改写，不报「必须以 / 开头」', async () => {
      await utils.fillPathRewrite(page, '   ');
      await utils.expectRuleFormFieldValid(page, F.pathRewriteFieldLabel);
    });

    await test.step('本地保存并提交：提交体 path_rewrite 为 ""，列表路径改写显示 -', async () => {
      await fillMinimalRule(
        page,
        newName,
        clusterName,
        'req_path_prefix_in("/v1/tm_v17", true)',
      );
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      const { payload } = await utils.submitRulesAndCapture(page);
      expect(payload, '捕获 PUT 请求体').toBeTruthy();
      const submitted = payload.rules.find((item) => item.name === newName);
      expect(submitted, '提交体包含该规则').toBeTruthy();
      expect(submitted.path_rewrite, '提交体 path_rewrite 为空串').toBe('');
      // 提交成功后页面重新 GET 集合，需先解除空集合 mock 再回源服务端断言列表
      await utils.unmockTrafficMirrorNetwork(page);
      await utils.reloadTrafficMirrorPage(page);
      await utils.expectRuleCellText(
        page,
        newName,
        COL.pathRewrite,
        R.emptyPlaceholder,
      );
    });
  });
});
