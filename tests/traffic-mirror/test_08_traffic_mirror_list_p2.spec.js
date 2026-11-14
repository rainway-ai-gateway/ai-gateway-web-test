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
 * 流量镜像规则 - 列表 P2 用例（TM-L-07 排序 / TM-L-08 空集合 / TM-L-09 加载失败）
 *
 * 审计背景（2026-11-01，traffic-mirror 深度审计）：
 * `test_01` 头注释写明「P2 用例（L-07 排序、L-08 空集合、L-09 加载失败）本期不实现」，
 * 三条索引已声明、正文已写，但从未落脚本。本轮用既有 mock 能力补齐。
 * （TM-C-12「设置请求头空态」已按注释并入 TM-C-11 的步骤断言，属同义覆盖，不重复建脚本。）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');

const DOC = utils.DOC_TM_RULES;

test.describe('流量镜像规则 - TM-L-07 列表按列排序', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page).catch(() => {});
  });

  test('按「规则名」升序/降序排列', async ({ page }) => {
    const names = ['tm_l07_m', 'tm_l07_a', 'tm_l07_z'];
    const rules = names.map((name) => utils.buildTestRule({ name }));

    await test.step('前置：mock 3 条规则并按接口顺序展示', async () => {
      await utils.mockRulesGetResponse(page, { rules });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
      expect(await utils.getRuleNamesInOrder(page)).toEqual(names);
    });

    await test.step('升序：a < m < z', async () => {
      await utils.sortRuleTableByColumn(page, DOC.ruleNameColumn, 'asc');
      await expect
        .poll(() => utils.getRuleNamesInOrder(page), { timeout: 10000 })
        .toEqual(['tm_l07_a', 'tm_l07_m', 'tm_l07_z']);
    });

    await test.step('降序：z > m > a', async () => {
      await utils.sortRuleTableByColumn(page, DOC.ruleNameColumn, 'desc');
      await expect
        .poll(() => utils.getRuleNamesInOrder(page), { timeout: 10000 })
        .toEqual(['tm_l07_z', 'tm_l07_m', 'tm_l07_a']);
    });
  });
});

test.describe('流量镜像规则 - TM-L-08 空集合展示', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page).catch(() => {});
  });

  test('接口返回空集合时展示空态、无数据行、页面不白屏', async ({ page }) => {
    await test.step('前置：mock 空集合', async () => {
      await utils.mockRulesGetResponse(page, { rules: [] });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    });

    await test.step('无数据行 + 展示「暂无数据」空态', async () => {
      expect(await utils.getRuleRowCount(page)).toBe(0);
      await expect(page.getByText('暂无数据').first()).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('页面骨架仍在（标题/工具栏可见，非白屏）', async () => {
      await utils.expectTrafficMirrorPageReady(page);
    });
  });
});

test.describe('流量镜像规则 - TM-L-09 列表接口失败提示', () => {
  test.afterEach(async ({ page }) => {
    await utils.unmockTrafficMirrorNetwork(page).catch(() => {});
  });

  test('列表接口 500 时提示「加载流量镜像规则失败」，页面不白屏', async ({
    page,
  }) => {
    await test.step('前置：mock GET 500 并进入页面', async () => {
      await utils.mockRulesGetResponse(page, {
        status: 500,
        errMsg: 'boom',
      });
      await utils.gotoTrafficMirrorPageAndWaitForRules(page);
    });

    await test.step('出现错误提示', async () => {
      await utils.expectTrafficMirrorMessage(page, '加载流量镜像规则失败');
    });

    await test.step('页面不白屏：标题与表格骨架仍在，无数据行', async () => {
      await expect(
        page.getByText(DOC.pageTitle || '流量镜像规则').first(),
      ).toBeVisible({ timeout: 15000 });
      expect(await utils.getRuleRowCount(page)).toBe(0);
    });
  });
});
