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
 * 流量镜像规则 - 列表与双模式
 * 用例：TM-L-01/02/03/04/05/06/10/11/12/13/14/15/16/17/18/19/20
 *
 * 说明：
 * - 列表字段一致性用例经 API 造数（saveOriginalState 备份、afterEach 恢复），
 *   走真实 GET /traffic-mirror-rules 逐列核对；
 * - 镜像集群引用须为控制面已存在集群（经 GET /clusters 取集群名）；
 * - 提交查重拦截/失败/防重用 mockRulesGetResponse/mockRulesPutResponse 构造；
 * - 「提交并生效」自 2026-10-15 起带 `:disabled="!isDirty"`（无未提交改动时置灰，见
 *   design-docs/modifications/2026-10-15-rule-modules-drag-guard-copy/ui-code-changes.md §5），
 *   TM-L-17/18/19/20 提交前均先制造一次本地改动（拖拽重排 / 改采样比例）；
 * - P2 用例（L-07 排序、L-08 空集合、L-09 加载失败）本期不实现。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');

const cleanup = utils.createTrafficMirrorTestCleanup();
const P = utils.DOC_TM_PAGE;
const R = utils.DOC_TM_RULES;
const F = utils.DOC_TM_RULE_FORM;
const COL = R.columnIndex;

/** 取首集群名并造数规则，返回 { rule, clusterName } */
async function seedRule(page, overrides = {}) {
  const clusters = await utils.fetchClusterNamesViaApi(page);
  expect(clusters && clusters.length > 0, '集群列表非空（造数前置）').toBe(
    true,
  );
  const rule = utils.buildTestRule({ mirror_cluster: clusters[0], ...overrides });
  const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule]);
  expect(ok, 'API 造数流量镜像规则成功').toBe(true);
  return { rule, clusterName: clusters[0] };
}

test.describe('流量镜像规则 - 列表与双模式', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page);
    await cleanup.cleanup(page);
  });

  test('TM-L-01 进入流量镜像规则列表页', async ({ page }) => {
    await test.step('前置：备份原始集合并造数一条规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await seedRule(page);
    });

    await test.step('进入页面：标题正确，视图模式仅显示「进入编辑模式」', async () => {
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectTrafficMirrorPageReady(page);
      await utils.expectViewMode(page);
    });

    await test.step('列表行顺序与接口返回数组顺序一致', async () => {
      const apiRules = await utils.fetchTrafficMirrorRulesViaApi(page);
      const rowNames = await utils.getRuleNamesInOrder(page);
      const apiNames = apiRules.map((rule) => rule.name);
      const compareLen = Math.min(rowNames.length, apiNames.length, 20);
      expect(rowNames.slice(0, compareLen)).toEqual(
        apiNames.slice(0, compareLen),
      );
    });
  });

  test('TM-L-02 列表展示七列且与接口数据一致', async ({ page }) => {
    const rule = utils.buildTestRule({
      remove_headers: ['Authorization', 'Cookie', 'X-Custom-Secret'],
      path_rewrite: '/v1/internal/chat/completions',
    });
    let clusterName = '';

    await test.step('前置：备份原始集合并经 API 造数一条全字段规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      expect(clusters && clusters.length > 0, '集群列表非空（造数前置）').toBe(
        true,
      );
      clusterName = clusters[0];
      rule.mirror_cluster = clusterName;
      const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule]);
      expect(ok, 'API 造数流量镜像规则成功').toBe(true);
    });

    await test.step('进入页面：标题正确，视图模式仅显示「进入编辑模式」', async () => {
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectTrafficMirrorPageReady(page);
      await utils.expectViewMode(page);
    });

    await test.step('表头 7 列依次为：规则名/生效条件/镜像集群/采样比例/头部剔除/路径改写/操作', async () => {
      await utils.expectRuleTableHeaders(page);
    });

    await test.step('逐列核对行数据与接口返回字段一致', async () => {
      await utils.expectRuleRowVisible(page, rule.name);
      await utils.expectRuleCellText(page, rule.name, COL.name, rule.name);
      await utils.expectRuleCellContains(page, rule.name, COL.cond, rule.cond);
      await utils.expectRuleCellText(
        page,
        rule.name,
        COL.cluster,
        clusterName,
      );
      await utils.expectRuleCellText(
        page,
        rule.name,
        COL.percentage,
        R.percentageText(rule.percentage),
      );
      await utils.expectRuleCellText(
        page,
        rule.name,
        COL.removeHeaders,
        R.removeHeadersText(rule.remove_headers),
      );
      await utils.expectRuleCellText(
        page,
        rule.name,
        COL.pathRewrite,
        rule.path_rewrite,
      );
    });

    await test.step('视图模式行操作仅显示「查看」', async () => {
      await utils.expectRuleRowOnlyViewAction(page, rule.name);
      await expect(
        utils.pageRoot(page)
          .getByRole('button', { name: P.viewButton, exact: true })
          .first(),
      ).toBeVisible();
    });
  });

  test('TM-L-03 采样比例列展示百分比与默认值', async ({ page }) => {
    // 说明：服务端对缺省采样比例回填 100，经 API 造数无法得到 null/undefined 原始值，
    // 故用 mockRulesGetResponse 注入原始响应数据验证列表渲染口径。
    const withValue = utils.buildTestRule({
      percentage: 10,
      cond: 'req_path_prefix_in("/v1/tm_l03_a", true)',
    });
    const withZero = utils.buildTestRule({
      percentage: 0,
      cond: 'req_path_prefix_in("/v1/tm_l03_b", true)',
    });
    const omitted = utils.buildTestRule({
      percentage: undefined,
      cond: 'req_path_prefix_in("/v1/tm_l03_c", true)',
    });
    delete omitted.percentage;

    await test.step('前置：备份原始集合并 mock 注入 10 / 缺省 / 0 三条规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      for (const rule of [withValue, withZero, omitted]) {
        rule.mirror_cluster = clusters[0];
      }
      await utils.mockRulesGetResponse(page, {
        rules: [withValue, withZero, omitted],
      });
    });

    await test.step('有值显示 {value}%，缺省显示 -', async () => {
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectRuleCellText(page, withValue.name, COL.percentage, '10%');
      await utils.expectRuleCellText(page, withZero.name, COL.percentage, '0%');
      await utils.expectRuleCellText(page, omitted.name, COL.percentage, '-');
    });
  });

  test('TM-L-04 头部剔除列展示三种状态', async ({ page }) => {
    const omitted = utils.buildTestRule({
      cond: 'req_path_prefix_in("/v1/tm_l04_a", true)',
    });
    delete omitted.remove_headers;
    const empty = utils.buildTestRule({
      remove_headers: [],
      cond: 'req_path_prefix_in("/v1/tm_l04_b", true)',
    });
    const custom = utils.buildTestRule({
      remove_headers: ['Authorization', 'Cookie', 'X-Api-Key', 'X-Custom-Secret'],
      cond: 'req_path_prefix_in("/v1/tm_l04_c", true)',
    });

    await test.step('前置：造数缺省 / 显式空数组 / 非空数组三条规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const { clusterName } = await seedRule(page);
      for (const rule of [omitted, empty, custom]) {
        rule.mirror_cluster = clusterName;
      }
      const ok = await utils.putTrafficMirrorRulesViaApi(page, [
        omitted,
        empty,
        custom,
      ]);
      expect(ok, 'API 造数三条规则成功').toBe(true);
    });

    await test.step('三态文案：默认黑名单 / 不剔除任何头部 / 逗号连接', async () => {
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectRuleCellText(
        page,
        omitted.name,
        COL.removeHeaders,
        R.headersDefault,
      );
      await utils.expectRuleCellText(
        page,
        empty.name,
        COL.removeHeaders,
        R.headersNone,
      );
      await utils.expectRuleCellText(
        page,
        custom.name,
        COL.removeHeaders,
        'Authorization, Cookie, X-Api-Key, X-Custom-Secret',
      );
    });
  });

  test('TM-L-05 路径改写列为空时展示占位', async ({ page }) => {
    const empty = utils.buildTestRule({
      path_rewrite: '',
      cond: 'req_path_prefix_in("/v1/tm_l05_a", true)',
    });
    const withPath = utils.buildTestRule({
      path_rewrite: '/v1/internal/chat/completions',
      cond: 'req_path_prefix_in("/v1/tm_l05_b", true)',
    });

    await test.step('前置：造数路径改写空与非空两条规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const { clusterName } = await seedRule(page);
      empty.mirror_cluster = clusterName;
      withPath.mirror_cluster = clusterName;
      const ok = await utils.putTrafficMirrorRulesViaApi(page, [
        empty,
        withPath,
      ]);
      expect(ok, 'API 造数两条规则成功').toBe(true);
    });

    await test.step('空显示 -，非空显示原值', async () => {
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectRuleCellText(page, empty.name, COL.pathRewrite, '-');
      await utils.expectRuleCellText(
        page,
        withPath.name,
        COL.pathRewrite,
        '/v1/internal/chat/completions',
      );
    });
  });

  test('TM-L-06 按规则名称搜索', async ({ page }) => {
    let ruleA;
    let ruleB;

    await test.step('前置：造数两条名称不同的规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const { clusterName } = await seedRule(page);
      ruleA = utils.buildTestRule({
        mirror_cluster: clusterName,
        cond: 'req_path_prefix_in("/v1/tm_l06_a", true)',
      });
      ruleB = utils.buildTestRule({
        mirror_cluster: clusterName,
        cond: 'req_path_prefix_in("/v1/tm_l06_b", true)',
      });
      const ok = await utils.putTrafficMirrorRulesViaApi(page, [ruleA, ruleB]);
      expect(ok, 'API 造数两条规则成功').toBe(true);
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    });

    await test.step('按规则名称关键字过滤，仅显示匹配行', async () => {
      await utils.searchRulesByColumn(page, R.searchNamePlaceholder, ruleA.name);
      await utils.expectRuleRowVisible(page, ruleA.name);
      await utils.expectRuleRowHidden(page, ruleB.name);
    });

    await test.step('清空搜索恢复完整列表', async () => {
      await utils.clearRulesSearch(page, R.searchNamePlaceholder);
      await utils.expectRuleRowVisible(page, ruleA.name);
      await utils.expectRuleRowVisible(page, ruleB.name);
    });
  });

  test('TM-L-10 进入编辑模式', async ({ page }) => {
    await test.step('前置：造数一条规则并进入页面（视图模式）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await seedRule(page);
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.expectViewMode(page);
    });

    await test.step('点击「进入编辑模式」后按钮区与行操作切换', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
    });

    await test.step('行操作由「查看」变为「编辑」+「删除」', async () => {
      const names = await utils.fetchTrafficMirrorRulesViaApi(page);
      await utils.expectRuleRowEditDeleteActions(page, names[0].name);
    });
  });

  test('TM-L-11 退出编辑模式未修改', async ({ page }) => {
    await test.step('前置：造数并进入编辑模式（无改动）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      await seedRule(page);
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('直接退出：无二次确认，回到视图模式并刷新', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectViewMode(page);
    });
  });

  test('TM-L-12 退出编辑模式已修改确认丢弃并回滚', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_l12_');
    let seeded;

    await test.step('前置：mock 一条基线规则，进入编辑模式并本地新增一条', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      seeded = utils.buildTestRule({ mirror_cluster: clusters[0] });
      await utils.mockRulesGetResponse(page, { rules: [seeded] });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, newName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.selectMirrorCluster(page, clusters[0]);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      await utils.expectRuleRowVisible(page, newName);
    });

    await test.step('退出弹出二次确认（信息提示 + 丢弃改动文案）', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
    });

    await test.step('确认退出：提示「已退出编辑模式」，新增改动被丢弃', async () => {
      await utils.confirmExitEditMode(page);
      await utils.expectTrafficMirrorMessage(page, P.exitDoneMsg);
      await utils.expectViewMode(page);
      await utils.expectRuleRowHidden(page, newName);
      await utils.expectRuleRowVisible(page, seeded.name);
    });
  });

  test('TM-L-13 退出编辑模式已修改取消', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_l13_');

    await test.step('前置：mock 空集合，进入编辑模式并本地新增一条', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, newName);
      await utils.fillRuleCond(page, 'default_t()');
      await utils.selectMirrorCluster(page, clusters[0]);
      await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
    });

    await test.step('取消退出：停留在编辑模式，提示「已取消退出」，改动保留', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectExitConfirmModal(page);
      await utils.cancelExitEditMode(page);
      await utils.expectTrafficMirrorMessage(page, P.exitCancelledMsg);
      await utils.expectEditMode(page);
      await utils.expectRuleRowVisible(page, newName);
    });
  });

  test('TM-L-14 视图模式按钮与行操作', async ({ page }) => {
    let rule;

    await test.step('前置：造数一条规则，视图模式进入页面', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule } = await seedRule(page));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    });

    await test.step('右上仅「进入编辑模式」；行操作仅「查看」', async () => {
      await utils.expectViewMode(page);
      await utils.expectRuleRowOnlyViewAction(page, rule.name);
    });
  });

  test('TM-L-15 编辑模式按钮与行操作', async ({ page }) => {
    let rule;

    await test.step('前置：造数并进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      ({ rule } = await seedRule(page));
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('左上「添加规则」，右上「退出编辑模式」+「提交并生效」', async () => {
      await utils.expectEditMode(page);
    });

    await test.step('行操作显示「编辑」与「删除」', async () => {
      await utils.expectRuleRowEditDeleteActions(page, rule.name);
    });
  });

  test('TM-L-16 提交并生效成功', async ({ page }) => {
    const newName = utils.generateTestRuleName('tm_l16_');
    let clusterName = '';
    const tracker = utils.trackTrafficMirrorRuleRequests(page);

    try {
      await test.step('前置：mock 空集合，进入编辑模式并本地新增一条', async () => {
        await utils.ensureAppSession(page);
        await cleanup.saveOriginalState(page);
        const clusters = await utils.fetchClusterNamesViaApi(page);
        clusterName = clusters[0];
        await utils.mockRulesGetResponse(page, { rules: [] });
        await utils.gotoTrafficMirrorPageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, newName);
        await utils.fillRuleCond(page, 'req_path_prefix_in("/v1/chat/completions", true)');
        await utils.selectMirrorCluster(page, clusterName);
        await utils.fillRulePercentage(page, 10);
        await utils.submitRuleFormExpectMessage(page, F.addSuccessMsg);
      });

      await test.step('提交并生效：PUT 请求体含新规则，提示成功并回到视图模式', async () => {
        const { payload } = await utils.submitRulesAndCapture(page);
        expect(payload, '应捕获 PUT 请求体').toBeTruthy();
        expect(payload.rules, 'PUT 请求体为 {rules:[...]}').toHaveLength(1);
        expect(payload.rules[0].name).toBe(newName);
        expect(payload.rules[0].mirror_cluster).toBe(clusterName);
        expect(payload.rules[0].percentage).toBe(10);
        await utils.expectTrafficMirrorMessage(page, P.submitSuccessMsg);
        await utils.expectViewMode(page);
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-L-17 提交前集合内规则名称查重拦截', async ({ page }) => {
    const dup = utils.buildTestRule({ name: 'tm_dup_name_l17' });
    const tracker = utils.trackTrafficMirrorRuleRequests(page);

    try {
      await test.step('前置：mock 两条同名规则并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await cleanup.saveOriginalState(page);
        const { clusterName } = await seedRule(page);
        dup.mirror_cluster = clusterName;
        const another = { ...dup, percentage: 20 };
        await utils.mockRulesGetResponse(page, { rules: [dup, another] });
        await utils.gotoTrafficMirrorPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('前置：拖拽重排制造本地改动，解除「提交并生效」置灰', async () => {
        // 「提交并生效」带 :disabled="!isDirty"（2026-10-15 变更，index.vue:47），
        // 无本地改动时点击无效、等不到查重提示，故先制造一次改动。
        // 拖拽只重排数组、不动 name/cond，两条同名规则仍在集合内，
        // submitRules 的 Set 去重（index.vue:461-465）照旧命中名称重复。
        // 两行名称相同、无法按名称断言新次序，故以按钮解禁作为改动已生效的判据。
        await utils.dragRuleRow(page, 0, 1);
        await utils.expectSubmitAndEffectDisabled(page, false);
      });

      await test.step('提交被拦截：提示名称重复，不发起 PUT', async () => {
        await utils.submitRulesExpectMessage(page, P.tipNameDuplicate);
        await utils.expectEditMode(page);
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-L-18 提交前集合内生效条件查重拦截', async ({ page }) => {
    const ruleA = utils.buildTestRule({ cond: 'default_t()' });
    const ruleB = utils.buildTestRule({ cond: 'default_t()' });
    const tracker = utils.trackTrafficMirrorRuleRequests(page);

    try {
      await test.step('前置：mock 两条同生效条件规则并进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await cleanup.saveOriginalState(page);
        const { clusterName } = await seedRule(page);
        ruleA.mirror_cluster = clusterName;
        ruleB.mirror_cluster = clusterName;
        await utils.mockRulesGetResponse(page, { rules: [ruleA, ruleB] });
        await utils.gotoTrafficMirrorPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('前置：拖拽重排制造本地改动，解除「提交并生效」置灰', async () => {
        // 「提交并生效」带 :disabled="!isDirty"（2026-10-15 变更，index.vue:47），
        // 无本地改动时点击无效、等不到查重提示，故先制造一次改动。
        // 拖拽只重排数组、不动 name/cond，两条同 cond 规则仍在集合内，
        // submitRules 的 Set 去重（index.vue:468-472）照旧命中条件重复。
        const names = await utils.getRuleNamesInOrder(page);
        await utils.dragRuleRow(page, 0, 1);
        await utils.expectRuleNamesInOrder(
          page,
          utils.moveRuleToIndex(names, 0, 1),
        );
        await utils.expectSubmitAndEffectDisabled(page, false);
      });

      await test.step('提交被拦截：提示条件重复，不发起 PUT', async () => {
        await utils.submitRulesExpectMessage(page, P.tipCondDuplicate);
        await utils.expectEditMode(page);
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-L-19 提交接口失败提示', async ({ page }) => {
    const tracker = utils.trackTrafficMirrorRuleRequests(page);
    let rule;

    try {
      await test.step('前置：mock 一条规则 + PUT 失败，进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await cleanup.saveOriginalState(page);
        ({ rule } = await seedRule(page));
        await utils.mockRulesGetResponse(page, { rules: [rule] });
        await utils.mockRulesPutResponse(page, { status: 500 });
        await utils.gotoTrafficMirrorPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('前置：改采样比例制造本地改动，解除「提交并生效」置灰', async () => {
        // 「提交并生效」带 :disabled="!isDirty"（2026-10-15 变更，index.vue:47），
        // 无本地改动时点击无效、等不到失败提示；改采样比例不影响本用例的断言目标。
        await utils.openEditRuleDrawer(page, rule.name);
        await utils.fillRulePercentage(page, 60);
        await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
        await utils.expectSubmitAndEffectDisabled(page, false);
      });

      await test.step('提交失败：提示「提交失败!」，停留编辑模式', async () => {
        await utils.submitRulesExpectMessage(page, P.submitFailedMsg);
        await utils.expectEditMode(page);
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-L-20 提交并生效按钮防重', async ({ page }) => {
    const tracker = utils.trackTrafficMirrorRuleRequests(page);
    let rule;

    try {
      await test.step('前置：mock 一条规则 + PUT 延迟 2s，进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await cleanup.saveOriginalState(page);
        ({ rule } = await seedRule(page));
        await utils.mockRulesGetResponse(page, { rules: [rule] });
        await utils.mockRulesPutResponse(page, { delayMs: 2000 });
        await utils.gotoTrafficMirrorPageAndWaitForRules(page);
        await utils.enterEditMode(page);
      });

      await test.step('前置：改采样比例制造本地改动，解除「提交并生效」置灰', async () => {
        // 「提交并生效」带 :disabled="!isDirty"（2026-10-15 变更，index.vue:47），
        // 无本地改动时点击无效，防重链路根本进不去；改采样比例不影响防重断言。
        await utils.openEditRuleDrawer(page, rule.name);
        await utils.fillRulePercentage(page, 60);
        await utils.submitRuleFormExpectMessage(page, F.saveSuccessMsg);
        await utils.expectRuleFormDrawerHidden(page);
        await utils.expectSubmitAndEffectDisabled(page, false);
      });

      await test.step('提交返回前连续点击，仅发起一次 PUT', async () => {
        await utils.expectTrafficMirrorMessageDuringAction(
          page,
          P.submitSuccessMsg,
          async () => {
            await utils.clickSubmitAndEffect(page);
            await page.waitForTimeout(300);
            await utils.clickSubmitAndEffect(page).catch(() => {});
          },
          15000,
        );
        expect(tracker.state.put, 'PUT 仅发起一次（防重）').toBe(1);
      });
    } finally {
      tracker.stop();
    }
  });
});
