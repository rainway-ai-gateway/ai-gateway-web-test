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
 * 流量镜像规则 - 删除
 * 用例：TM-DEL-01 ~ TM-DEL-05（删除全量）
 *
 * 说明：
 * - 删除确认为集合内已有规则的交互，经 API 造数
 *   （saveOriginalState 备份、afterEach 恢复）；
 * - 「删除 = 本地内存 splice，需提交并生效」由 trackTrafficMirrorRuleRequests
 *   断言删除过程不发起 PUT；
 * - DEL-03 未提交刷新恢复、DEL-04 提交后持久删除均依赖真实服务端往返。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');

const cleanup = utils.createTrafficMirrorTestCleanup();
const P = utils.DOC_TM_PAGE;

test.describe('流量镜像规则 - 删除', () => {
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  /** 造数 helper：备份 + 写入两条规则（default_t 条件 + 前缀条件），进入编辑模式 */
  async function seedTwoRules(page) {
    await utils.ensureAppSession(page);
    await cleanup.saveOriginalState(page);
    const clusters = await utils.fetchClusterNamesViaApi(page);
    expect(clusters && clusters.length > 0, '集群列表非空（造数前置）').toBe(
      true,
    );
    const rule = utils.buildTestRule({ mirror_cluster: clusters[0] });
    const other = utils.buildTestRule({
      mirror_cluster: clusters[0],
      cond: 'default_t()',
      percentage: 100,
    });
    const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule, other]);
    expect(ok, 'API 造数两条规则成功').toBe(true);
    await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    await utils.enterEditMode(page);
    return { rule, other };
  }

  test('TM-DEL-01 删除规则确认', async ({ page }) => {
    let rule;
    let other;
    const tracker = utils.trackTrafficMirrorRuleRequests(page);
    let countBefore = 0;

    try {
      await test.step('前置：备份并造数两条规则，进入编辑模式', async () => {
        await utils.ensureAppSession(page);
        await cleanup.saveOriginalState(page);
        const clusters = await utils.fetchClusterNamesViaApi(page);
        expect(clusters && clusters.length > 0, '集群列表非空（造数前置）').toBe(
          true,
        );
        rule = utils.buildTestRule({ mirror_cluster: clusters[0] });
        other = utils.buildTestRule({
          mirror_cluster: clusters[0],
          cond: 'default_t()',
          percentage: 100,
        });
        const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule, other]);
        expect(ok, 'API 造数两条规则成功').toBe(true);
        await utils.gotoTrafficMirrorPageAndWaitForRules(page);
        await utils.enterEditMode(page);
        await utils.expectEditMode(page);
        countBefore = await utils.getRuleRowCount(page);
      });

      await test.step('点击行「删除」，弹出确认框（标题「信息提示」+ 删除确认文案）', async () => {
        await utils.clickRuleDelete(page, rule.name);
        await utils.expectDeleteConfirmModal(page);
      });

      await test.step('点击「确定」：提示「删除成功!」且列表行数减一', async () => {
        await utils.expectTrafficMirrorMessageDuringAction(
          page,
          P.deleteSuccessMsg,
          () => utils.confirmDelete(page),
        );
        await utils.expectRuleRowHidden(page, rule.name);
        const countAfter = await utils.getRuleRowCount(page);
        expect(countAfter, '删除后列表行数减一').toBe(countBefore - 1);
      });

      await test.step('删除仅为本地内存变更，未发起 PUT', async () => {
        await utils.expectNoRuleMutationRequest(tracker);
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-DEL-02 删除规则取消', async ({ page }) => {
    let rule;

    await test.step('前置：备份并造数一条规则，进入编辑模式', async () => {
      await utils.ensureAppSession(page);
      await cleanup.saveOriginalState(page);
      const clusters = await utils.fetchClusterNamesViaApi(page);
      rule = utils.buildTestRule({ mirror_cluster: clusters[0] });
      const ok = await utils.putTrafficMirrorRulesViaApi(page, [rule]);
      expect(ok, 'API 造数规则成功').toBe(true);
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      await utils.enterEditMode(page);
    });

    await test.step('点击行「删除」弹出确认框，点击「取消」', async () => {
      await utils.clickRuleDelete(page, rule.name);
      await utils.expectDeleteConfirmModal(page);
      await utils.expectTrafficMirrorMessageDuringAction(
        page,
        P.cancelDeleteMsg,
        () => utils.cancelDelete(page),
      );
    });

    await test.step('规则仍保留在集合中，列表行数不变', async () => {
      await utils.expectRuleRowVisible(page, rule.name);
      expect(await utils.getRuleRowCount(page), '取消后行数不变').toBe(1);
    });
  });

  test('TM-DEL-03 删除后即从集合移除（未提交刷新恢复）', async ({ page }) => {
    let rule;
    let other;
    const tracker = utils.trackTrafficMirrorRuleRequests(page);

    try {
      await test.step('前置：备份并造数两条规则，进入编辑模式', async () => {
        ({ rule, other } = await seedTwoRules(page));
      });

      await test.step('删除一条并确认：立即从列表移除，不发起 PUT', async () => {
        await utils.clickRuleDelete(page, rule.name);
        await utils.expectTrafficMirrorMessageDuringAction(
          page,
          P.deleteSuccessMsg,
          () => utils.confirmDelete(page),
        );
        await utils.expectRuleRowHidden(page, rule.name);
        await utils.expectRuleRowVisible(page, other.name);
        await utils.expectNoRuleMutationRequest(tracker);
      });

      await test.step('未提交前刷新页面：被删规则从服务端恢复显示', async () => {
        await utils.reloadTrafficMirrorPage(page);
        await utils.expectRuleRowVisible(page, rule.name);
        await utils.expectRuleRowVisible(page, other.name);
        expect(await utils.getRuleRowCount(page), '刷新后两条规则均恢复').toBe(
          2,
        );
      });
    } finally {
      tracker.stop();
    }
  });

  test('TM-DEL-04 删除后提交并生效', async ({ page }) => {
    let rule;
    let other;

    await test.step('前置：备份并造数两条规则，进入编辑模式', async () => {
      ({ rule, other } = await seedTwoRules(page));
    });

    await test.step('删除一条规则并确认（本地移除）', async () => {
      await utils.clickRuleDelete(page, rule.name);
      await utils.expectTrafficMirrorMessageDuringAction(
        page,
        P.deleteSuccessMsg,
        () => utils.confirmDelete(page),
      );
      await utils.expectRuleRowHidden(page, rule.name);
    });

    await test.step('提交并生效：请求体不含已删除规则，切回视图模式', async () => {
      const { payload } = await utils.submitRulesAndCapture(page);
      expect(payload, '捕获 PUT 请求体').toBeTruthy();
      const names = payload.rules.map((item) => item.name);
      expect(names, '提交体不含已删除规则').not.toContain(rule.name);
      expect(names, '提交体保留其余规则').toContain(other.name);
      await utils.expectViewMode(page);
    });

    await test.step('提交后自动重新 GET，刷新后已删除规则持久消失', async () => {
      await utils.reloadTrafficMirrorPage(page);
      await utils.expectRuleRowHidden(page, rule.name);
      await utils.expectRuleRowVisible(page, other.name);
    });
  });

  test('TM-DEL-05 清空全部规则提交空数组关闭镜像总开关', async ({ page }) => {
    await test.step('前置：备份并造数两条规则，进入编辑模式', async () => {
      await seedTwoRules(page);
    });

    await test.step('逐条删除全部规则并确认，直至列表为空', async () => {
      await utils.deleteAllRules(page);
      await utils.expectRuleTableEmpty(page);
    });

    await test.step('提交并生效：请求体为 { rules: [] }，提交成功后列表为空', async () => {
      const { payload } = await utils.submitRulesAndCapture(page);
      expect(payload, '捕获 PUT 请求体').toBeTruthy();
      expect(payload.rules, '提交体为空数组').toEqual([]);
      await utils.expectViewMode(page);
    });

    await test.step('重新 GET 返回空集合（镜像总开关关闭语义）', async () => {
      await utils.reloadTrafficMirrorPage(page);
      await utils.expectRuleTableEmpty(page);
      const apiRules = await utils.fetchTrafficMirrorRulesViaApi(page);
      expect(apiRules, '服务端集合为空').toEqual([]);
    });
  });
});
