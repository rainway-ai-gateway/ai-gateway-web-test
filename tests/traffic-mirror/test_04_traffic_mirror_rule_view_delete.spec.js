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
 * 流量镜像规则 - 查看详情
 * 用例：TM-D-01 ~ TM-D-08（查看抽屉全量）
 *
 * 说明：
 * - 查看抽屉为集合内已有规则的交互，经 API 造数
 *   （saveOriginalState 备份、afterEach 恢复）；
 * - D-07 采样比例缺省按 100 展示为前端口径，真实服务端会回填 100，
 *   故用 mockRulesGetResponse 注入缺省 percentage 的原始数据验证；
 * - D-08 以 GET 响应 JSON 为基准逐字段核对列表与抽屉展示值。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');

const cleanup = utils.createTrafficMirrorTestCleanup();
const R = utils.DOC_TM_RULES;
const V = utils.DOC_TM_RULE_VIEW;
const COL = R.columnIndex;
const COL_NAME = COL.name;
const COL_COND = COL.cond;
const COL_CLUSTER = COL.cluster;
const COL_PERCENTAGE = COL.percentage;
const COL_REMOVE_HEADERS = COL.removeHeaders;
const COL_PATH_REWRITE = COL.pathRewrite;

test.describe('流量镜像规则 - 查看详情', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page);
    await cleanup.cleanup(page);
  });

  /** 造数 helper：备份 + 整体 PUT 写入 rules，返回集群名 */
  async function seedRules(page, rules) {
    await utils.ensureAppSession(page);
    await cleanup.saveOriginalState(page);
    const clusters = await utils.fetchClusterNamesViaApi(page);
    expect(clusters && clusters.length > 0, '集群列表非空（造数前置）').toBe(
      true,
    );
    const finalRules = rules.map((rule) => ({
      ...rule,
      // buildTestRule 默认携带空 mirror_cluster，需以真实集群名兜底
      mirror_cluster: rule.mirror_cluster || clusters[0],
    }));
    const ok = await utils.putTrafficMirrorRulesViaApi(page, finalRules);
    expect(ok, 'API 造数流量镜像规则成功').toBe(true);
    await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    return { clusterName: clusters[0], rules: finalRules };
  }

  /** 依次打开/断言/关闭某规则的查看抽屉（D-04/05/06 复用） */
  async function expectViewHeaderValue(page, ruleName, expected) {
    await utils.openViewRuleDrawer(page, ruleName);
    await utils.expectViewDrawerFieldValue(page, '头部剔除', expected);
    await utils.closeViewDrawer(page);
  }

  test('TM-D-01 查看抽屉为纯文案无输入控件', async ({ page }) => {
    let rule;

    await test.step('前置：备份原始集合并经 API 造数一条全字段规则', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      expect(clusters && clusters.length > 0, '集群列表非空（造数前置）').toBe(
        true,
      );
      rule = utils.buildTestRule({ mirror_cluster: clusters[0] });
      const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule]);
      expect(ok, 'API 造数流量镜像规则成功').toBe(true);
    });

    await test.step('视图模式点击行「查看」，抽屉标题为「查看镜像规则」', async () => {
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.openViewRuleDrawer(page, rule.name);
    });

    await test.step('抽屉展示 8 个只读信息行且取值正确', async () => {
      await utils.expectViewDrawerFieldLabels(page);
      await utils.expectViewDrawerFieldValue(page, '规则名', rule.name);
      await utils.expectViewDrawerFieldValue(page, '生效条件', rule.cond);
      await utils.expectViewDrawerFieldValue(
        page,
        '镜像集群',
        rule.mirror_cluster,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        '采样比例',
        R.percentageText(rule.percentage),
      );
      // remove_headers 缺省（buildTestRule 不携带）→ 默认黑名单文案
      await utils.expectViewDrawerFieldValue(
        page,
        '头部剔除',
        R.headersDefault,
      );
      await utils.expectViewDrawerFieldValue(
        page,
        '路径改写',
        rule.path_rewrite || R.emptyPlaceholder,
      );
    });

    await test.step('抽屉不含任何输入控件与操作按钮', async () => {
      await utils.expectViewDrawerNoInputs(page);
    });

    await test.step('关闭抽屉后查看内容消失', async () => {
      await utils.closeViewDrawer(page);
    });
  });

  test('TM-D-02 查看抽屉展示八个只读信息行', async ({ page }) => {
    const rule = utils.buildTestRule({
      remove_headers: ['Authorization', 'Cookie'],
      path_rewrite: '/v1/internal/chat/completions',
    });
    let clusterName = '';

    await test.step('前置：API 造数一条全字段规则（自定义剔除/请求头/请求体改写/路径改写）', async () => {
      // buildTestRule 默认携带空 mirror_cluster，seedRules 以真实集群名兜底，
      // 断言时需使用兜底后的集群名
      ({ clusterName } = await seedRules(page, [rule]));
    });

    await test.step('信息行固定 8 行，标签顺序与取值正确', async () => {
      await utils.openViewRuleDrawer(page, rule.name);
      await utils.expectViewDrawerInfoRowCount(page, 8);
      expect(await utils.getViewDrawerLabelTexts(page), '8 行标签顺序').toEqual(
        V.fieldLabels,
      );
      await utils.expectViewDrawerFieldValue(page, '规则名', rule.name);
      await utils.expectViewDrawerFieldValue(page, '生效条件', rule.cond);
      await utils.expectViewDrawerFieldValue(page, '镜像集群', clusterName);
      await utils.expectViewDrawerFieldValue(
        page,
        '采样比例',
        R.percentageText(rule.percentage),
      );
      await utils.expectViewDrawerFieldValue(
        page,
        '头部剔除',
        R.removeHeadersText(rule.remove_headers),
      );
      await utils.expectViewDrawerListLines(page, '设置请求头', [
        'X-Shadow-Env：pre-release',
      ]);
      await utils.expectViewDrawerListLines(page, '请求体改写', [
        'model → deepseek-v3',
      ]);
      await utils.expectViewDrawerFieldValue(
        page,
        '路径改写',
        rule.path_rewrite,
      );
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeViewDrawer(page);
    });
  });

  test('TM-D-03 查看抽屉不显示必填星号', async ({ page }) => {
    const rule = utils.buildTestRule();

    await test.step('前置：API 造数一条规则', async () => {
      await seedRules(page, [rule]);
    });

    await test.step('所有信息行标签均为纯文本，无必填星号', async () => {
      await utils.openViewRuleDrawer(page, rule.name);
      await utils.expectViewDrawerNoRequiredMark(page);
      await utils.closeViewDrawer(page);
    });
  });

  test('TM-D-04 查看抽屉头部剔除三种状态文案', async ({ page }) => {
    const ruleDefault = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d04_def_'),
      cond: 'req_path_prefix_in("/v1/tm_d04_a", true)',
      // 不携带 remove_headers → 缺省
    });
    const ruleNone = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d04_none_'),
      cond: 'req_path_prefix_in("/v1/tm_d04_b", true)',
      remove_headers: [],
    });
    const ruleCustom = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d04_cus_'),
      cond: 'req_path_prefix_in("/v1/tm_d04_c", true)',
      remove_headers: ['Authorization', 'Cookie', 'X-Api-Key'],
    });

    await test.step('前置：API 造数缺省/空数组/非空数组三条规则', async () => {
      await seedRules(page, [ruleDefault, ruleNone, ruleCustom]);
    });

    await test.step('缺省 → 默认黑名单文案', async () => {
      await expectViewHeaderValue(page, ruleDefault.name, R.headersDefault);
    });

    await test.step('空数组 → 不剔除任何头部', async () => {
      await expectViewHeaderValue(page, ruleNone.name, R.headersNone);
    });

    await test.step('非空数组 → 以「, 」连接', async () => {
      await expectViewHeaderValue(
        page,
        ruleCustom.name,
        'Authorization, Cookie, X-Api-Key',
      );
    });
  });

  test('TM-D-05 查看抽屉设置请求头列表与空态', async ({ page }) => {
    const ruleWithHeaders = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d05_h_'),
      cond: 'req_path_prefix_in("/v1/tm_d05_a", true)',
    });
    const ruleNoHeaders = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d05_n_'),
      cond: 'req_path_prefix_in("/v1/tm_d05_b", true)',
      set_headers: {},
    });

    await test.step('前置：API 造数含/不含设置请求头的两条规则', async () => {
      await seedRules(page, [ruleWithHeaders, ruleNoHeaders]);
    });

    await test.step('含设置请求头：键值逐行展示，格式 key：value（全角冒号）', async () => {
      await utils.openViewRuleDrawer(page, ruleWithHeaders.name);
      await utils.expectViewDrawerListLines(page, '设置请求头', [
        'X-Shadow-Env：pre-release',
      ]);
      await utils.closeViewDrawer(page);
    });

    await test.step('不含设置请求头：显示「无」', async () => {
      await utils.openViewRuleDrawer(page, ruleNoHeaders.name);
      await utils.expectViewDrawerEmptyText(page, '设置请求头');
      await utils.closeViewDrawer(page);
    });
  });

  test('TM-D-06 查看抽屉请求体改写列表展示', async ({ page }) => {
    const ruleWithRewrites = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d06_b_'),
      cond: 'req_path_prefix_in("/v1/tm_d06_a", true)',
    });
    const ruleNoRewrites = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d06_n_'),
      cond: 'req_path_prefix_in("/v1/tm_d06_b", true)',
      body_rewrites: [],
    });

    await test.step('前置：API 造数含/不含请求体改写的两条规则', async () => {
      await seedRules(page, [ruleWithRewrites, ruleNoRewrites]);
    });

    await test.step('含请求体改写：逐行展示，格式 path → value', async () => {
      await utils.openViewRuleDrawer(page, ruleWithRewrites.name);
      await utils.expectViewDrawerListLines(page, '请求体改写', [
        'model → deepseek-v3',
      ]);
      await utils.closeViewDrawer(page);
    });

    await test.step('不含请求体改写：显示「无」', async () => {
      await utils.openViewRuleDrawer(page, ruleNoRewrites.name);
      await utils.expectViewDrawerEmptyText(page, '请求体改写');
      await utils.closeViewDrawer(page);
    });
  });

  test('TM-D-07 查看抽屉采样比例默认值', async ({ page }) => {
    const clusters = [];
    const ruleNoPercentage = {
      name: utils.generateTestRuleName('tm_d07_np_'),
      cond: 'req_path_prefix_in("/v1/tm_d07_a", true)',
      mirror_cluster: '',
      path_rewrite: '',
    };
    const ruleZero = {
      name: utils.generateTestRuleName('tm_d07_zero_'),
      cond: 'req_path_prefix_in("/v1/tm_d07_b", true)',
      mirror_cluster: '',
      percentage: 0,
      path_rewrite: '',
    };

    await test.step('前置：登录备份并注入缺省/0 两条规则（mock GET）', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const fetched = await utils.fetchClusterNamesViaApi(page);
      expect(fetched && fetched.length > 0, '集群列表非空').toBe(true);
      clusters.push(...fetched);
      await utils.mockRulesGetResponse(page, {
        rules: [
          { ...ruleNoPercentage, mirror_cluster: clusters[0] },
          { ...ruleZero, mirror_cluster: clusters[0] },
        ],
      });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    });

    await test.step('采样比例缺省 → 查看抽屉按默认值展示 100%', async () => {
      await utils.openViewRuleDrawer(page, ruleNoPercentage.name);
      await utils.expectViewDrawerFieldValue(page, '采样比例', '100%');
      await utils.closeViewDrawer(page);
    });

    await test.step('采样比例为 0 → 展示 0%', async () => {
      await utils.openViewRuleDrawer(page, ruleZero.name);
      await utils.expectViewDrawerFieldValue(page, '采样比例', '0%');
      await utils.closeViewDrawer(page);
    });
  });

  test('TM-D-08 查看抽屉与列表展示同接口响应一致性', async ({ page }) => {
    const ruleFull = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d08_full_'),
      cond: 'req_path_prefix_in("/v1/tm_d08_a", true)',
      remove_headers: ['Authorization', 'X-Custom-Secret'],
      path_rewrite: '/v1/internal/chat/completions',
    });
    const rulePlain = utils.buildTestRule({
      name: utils.generateTestRuleName('tm_d08_plain_'),
      cond: 'req_path_prefix_in("/v1/tm_d08_b", true)',
      percentage: 100,
    });

    await test.step('前置：API 造数覆盖自定义剔除/请求头/请求体改写/路径改写两条规则', async () => {
      await seedRules(page, [ruleFull, rulePlain]);
    });

    await test.step('以 GET 响应为基准逐字段核对列表各列', async () => {
      const apiRules = await utils.fetchTrafficMirrorRulesViaApi(page);
      expect(apiRules.length, 'GET 响应规则数').toBeGreaterThanOrEqual(2);
      expect(await utils.getRuleRowCount(page), '列表行数=响应规则数').toBe(
        apiRules.length,
      );
      for (const item of apiRules) {
        await utils.expectRuleCellText(page, item.name, COL_NAME, item.name);
        await utils.expectRuleCellContains(page, item.name, COL_COND, item.cond);
        await utils.expectRuleCellText(
          page,
          item.name,
          COL_CLUSTER,
          item.mirror_cluster,
        );
        await utils.expectRuleCellText(
          page,
          item.name,
          COL_PERCENTAGE,
          item.percentage === null || item.percentage === undefined
            ? R.emptyPlaceholder
            : R.percentageText(item.percentage),
        );
        await utils.expectRuleCellText(
          page,
          item.name,
          COL_REMOVE_HEADERS,
          R.removeHeadersText(item.remove_headers),
        );
        await utils.expectRuleCellText(
          page,
          item.name,
          COL_PATH_REWRITE,
          item.path_rewrite || R.emptyPlaceholder,
        );
      }
    });

    await test.step('逐条打开查看抽屉核对 8 个信息行', async () => {
      const apiRules = await utils.fetchTrafficMirrorRulesViaApi(page);
      for (const item of apiRules) {
        await utils.openViewRuleDrawer(page, item.name);
        await utils.expectViewDrawerFieldValue(page, '规则名', item.name);
        await utils.expectViewDrawerFieldValue(page, '生效条件', item.cond);
        await utils.expectViewDrawerFieldValue(
          page,
          '镜像集群',
          item.mirror_cluster,
        );
        await utils.expectViewDrawerFieldValue(
          page,
          '采样比例',
          R.percentageText(
            item.percentage === null || item.percentage === undefined
              ? 100
              : item.percentage,
          ),
        );
        await utils.expectViewDrawerFieldValue(
          page,
          '头部剔除',
          R.removeHeadersText(item.remove_headers),
        );
        await utils.expectViewDrawerFieldValue(
          page,
          '路径改写',
          item.path_rewrite || R.emptyPlaceholder,
        );
        if (item.set_headers && Object.keys(item.set_headers).length) {
          const lines = Object.keys(item.set_headers).map(
            (key) => `${key}：${item.set_headers[key]}`,
          );
          await utils.expectViewDrawerListLines(page, '设置请求头', lines);
        } else {
          await utils.expectViewDrawerEmptyText(page, '设置请求头');
        }
        if (item.body_rewrites && item.body_rewrites.length) {
          const lines = item.body_rewrites.map(
            (rewrite) => `${rewrite.path} → ${rewrite.value}`,
          );
          await utils.expectViewDrawerListLines(page, '请求体改写', lines);
        } else {
          await utils.expectViewDrawerEmptyText(page, '请求体改写');
        }
        await utils.closeViewDrawer(page);
      }
    });

    await test.step('刷新页面后再次核对列表展示仍与响应一致', async () => {
      await utils.reloadTrafficMirrorPage(page);
      const apiRules = await utils.fetchTrafficMirrorRulesViaApi(page);
      const first = apiRules[0];
      await utils.expectRuleCellText(page, first.name, COL_NAME, first.name);
      await utils.expectRuleCellText(
        page,
        first.name,
        COL_PATH_REWRITE,
        first.path_rewrite || R.emptyPlaceholder,
      );
    });
  });
});
