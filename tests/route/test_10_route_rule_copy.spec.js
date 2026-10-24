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
 * 模块名：路由管理 - 路由规则复制
 * 用例范围：RT-D-27（复制按钮位置与样式、副本紧邻源规则、副本命名与冲突递增、
 *           副本保留 cond/targets/fallbacks、复制后提交按钮解禁、64 字符截断）
 * 说明：全程在编辑模式内做本地操作，退出编辑模式时放弃修改，不向后端写入；
 *       提交 payload 由本地 rules 顺序派生，payload 级校验由 RT-D-12/13/14 覆盖。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const common = require('../../utils/common');

test.describe('路由管理 - RT-D-27 复制规则', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  async function enterGlobalRulesEditMode(page) {
    await utils.ensureRouteTableModuleAvailable(page);
    await guard.capture(page);
    await utils.clearRouteTableSearchFilter(
      page,
      utils.ROUTE_TABLE_SEARCH_COLUMN.status,
    );
    await utils.openGlobalRouteTableDetail(page);
    await utils.expectRouteRulesViewMode(page);
    await utils.enterRouteRulesEditMode(page);
    await utils.expectRouteRulesEditMode(page);
  }

  test('RT-D-27 复制规则：副本紧邻源规则生成 -copy，字段一致且提交按钮解禁', async ({
    page,
  }) => {
    let baseline = [];

    await test.step('前置：进入 Global 路由表编辑模式并记录基线顺序', async () => {
      await enterGlobalRulesEditMode(page);
      baseline = await utils.getRuleNamesInOrder(page);
      expect(baseline.length, 'Global 路由表无规则').toBeGreaterThanOrEqual(1);
      common.log('规则基线顺序: ' + baseline.join(' > '));
    });

    await test.step('1. 编辑模式初始态：提交并生效置灰', async () => {
      await utils.expectSubmitAndEffectDisabled(page, true);
    });

    await test.step('2. 首行操作列最左为 success 样式「复制」按钮', async () => {
      await utils.expectCopyRuleButtonIsLeftmost(page, baseline[0]);
    });

    await test.step('3. 点击「复制」：副本插入到源规则正下方', async () => {
      await utils.clickCopyRuleButtonByIndex(page, 0);
      const copyName = utils.buildCopyRuleName(baseline[0], baseline);
      expect(copyName).toBe(baseline[0] + '-copy');
      const expectedOrder = baseline.slice();
      expectedOrder.splice(1, 0, copyName);
      await utils.expectRuleNamesInOrder(page, expectedOrder);
    });

    await test.step('4. 副本保留源规则的表达式/目标集群/备用集群', async () => {
      const source = await utils.getRuleRowFieldTexts(page, 0);
      const copy = await utils.getRuleRowFieldTexts(page, 1);
      expect(copy.name).toBe(source.name + '-copy');
      expect(copy.cond).toBe(source.cond);
      expect(copy.targets).toBe(source.targets);
      expect(copy.fallbacks).toBe(source.fallbacks);
    });

    await test.step('5. 复制产生本地变更：提交并生效解禁', async () => {
      await utils.expectSubmitAndEffectDisabled(page, false);
    });

    await test.step('6. 再次复制同一规则：名称递增为 -copy2，仍插在源规则正下方', async () => {
      const before = await utils.getRuleNamesInOrder(page);
      const expectedName = utils.buildCopyRuleName(baseline[0], before);
      expect(expectedName).toBe(baseline[0] + '-copy2');
      await utils.clickCopyRuleButtonByIndex(page, 0);
      const expectedOrder = before.slice();
      expectedOrder.splice(1, 0, expectedName);
      await utils.expectRuleNamesInOrder(page, expectedOrder);
      await utils.expectRuleRowVisible(page, expectedName);
    });

    await test.step('7. 退出编辑模式放弃本地修改，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRouteRulesDragTipVisible(page, false);
      await guard.verifyUnchanged(page);
    });
  });

  test('RT-D-27 复制规则：名称达到 64 字符时副本名截断到 64', async ({
    page,
  }) => {
    const longName = 'rt_copy_' + 'a'.repeat(64 - 'rt_copy_'.length);

    await test.step('前置：进入编辑模式，复制首行并把副本改名为 64 字符合法规则名', async () => {
      await enterGlobalRulesEditMode(page);
      const baseline = await utils.getRuleNamesInOrder(page);
      expect(baseline.length).toBeGreaterThanOrEqual(1);
      expect(longName.length).toBe(64);

      await utils.clickCopyRuleButtonByIndex(page, 0);
      const copyName = utils.buildCopyRuleName(baseline[0], baseline);
      await utils.expectRuleRowVisible(page, copyName);

      await utils.openEditRuleDrawerByRowIndex(page, 1);
      await utils.fillRuleName(page, longName);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, longName);
    });

    await test.step('1. 复制 64 字符规则：副本名截断（前 59 字符 + -copy），总长仍为 64', async () => {
      const names = await utils.getRuleNamesInOrder(page);
      const sourceIndex = names.indexOf(longName);
      expect(sourceIndex, '未找到 64 字符规则行').toBeGreaterThanOrEqual(0);

      await utils.clickCopyRuleButtonByIndex(page, sourceIndex);
      const after = await utils.getRuleNamesInOrder(page);
      const truncatedName = after[sourceIndex + 1];
      expect(truncatedName).toBe(longName.substring(0, 64 - 5) + '-copy');
      expect(truncatedName.length).toBe(64);
    });

    await test.step('2. 退出编辑模式放弃本地修改，后端 Global 路由规则未变化', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectRouteRulesViewMode(page);
      await guard.verifyUnchanged(page);
    });
  });

  test('RT-D-27 复制规则：提交 payload 副本紧跟源规则且不含前端内部字段', async ({
    page,
  }) => {
    let baseline = [];
    let sourceRule = null;
    let snapshotEnabled = false;

    await test.step('前置：进入编辑模式并记录基线顺序与源规则接口值', async () => {
      await enterGlobalRulesEditMode(page);
      baseline = await utils.getRuleNamesInOrder(page);
      expect(baseline.length).toBeGreaterThanOrEqual(1);

      const snapshot = JSON.parse(guard.snapshot);
      snapshotEnabled = snapshot.enabled === true;
      sourceRule = snapshot.rules.find((rule) => rule.name === baseline[0]);
      expect(sourceRule, '接口未返回源规则 ' + baseline[0]).toBeTruthy();
    });

    await test.step('1. 复制首行并提交并生效，捕获 PUT 请求体', async () => {
      await utils.clickCopyRuleButtonByIndex(page, 0);
      const copyName = utils.buildCopyRuleName(baseline[0], baseline);
      const expectedOrder = baseline.slice();
      expectedOrder.splice(1, 0, copyName);

      const payloadPromise = utils.captureGlobalRouteRulesPutPayload(page);
      await utils.submitGlobalRouteRulesAndWait(page);
      const payload = await payloadPromise;

      expect(payload, '未捕获到 PUT /global-route-rules 请求体').toBeTruthy();
      expect(payload.enabled).toBe(snapshotEnabled);
      const names = payload.rules.map((rule) => rule.name);
      expect(names).toEqual(expectedOrder);

      const copy = payload.rules[names.indexOf(copyName)];
      expect(copy.cond).toEqual(sourceRule.cond);
      expect(copy.targets).toEqual(sourceRule.targets);
      expect(copy.fallbacks).toEqual(sourceRule.fallbacks || []);

      for (const rule of payload.rules) {
        expect(
          Object.keys(rule).filter((key) =>
            ['index', '_index', '_rowKey'].includes(key),
          ),
          `提交 payload 不应包含前端内部字段: ${rule.name}`,
        ).toEqual([]);
      }
      await utils.expectRouteRulesViewMode(page);
    });

    await test.step('2. 通过 API 验证副本已写入且紧跟源规则', async () => {
      const state = await utils.getGlobalRouteRulesViaApi(page);
      const names = state.rules.map((rule) => rule.name);
      const sourceIndex = names.indexOf(baseline[0]);
      const copyName = utils.buildCopyRuleName(baseline[0], baseline);
      expect(names[sourceIndex + 1]).toBe(copyName);

      const persistedCopy = state.rules[names.indexOf(copyName)];
      expect(persistedCopy.cond).toEqual(sourceRule.cond);
      expect(persistedCopy.targets).toEqual(sourceRule.targets);
      expect(persistedCopy.fallbacks).toEqual(sourceRule.fallbacks || []);
    });

    await test.step('3. afterEach 恢复原始状态（本用例提交会真实写库）', async () => {
      const state = await utils.getGlobalRouteRulesViaApi(page);
      expect(
        state.rules.length,
        '提交后接口规则数应增加 1 条（副本）',
      ).toBe(
        JSON.parse(guard.snapshot).rules.length + 1,
      );
    });
  });
});