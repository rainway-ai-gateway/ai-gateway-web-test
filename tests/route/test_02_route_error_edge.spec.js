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
 * 路由管理 - 错误与边界场景
 * RT-D-16 ~ RT-D-20
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const resourceApi = require('../../api/resource-api-utils');

const GLOBAL_RULES_GET_URL = '**/open-api/v1/global-route-rules';
const GLOBAL_RULES_PUT_URL = '**/open-api/v1/global-route-rules';

test.describe('路由管理 - RT-D-17 详情页加载失败提示错误', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(GLOBAL_RULES_GET_URL);
  });

  test('RT-D-17 详情页加载失败提示错误', async ({ page }) => {
    // 前置：初始化测试数据
    await utils.ensureRouteTableModuleAvailable(page);
    await resourceApi.initRouteTestData(page);

    await page.route(GLOBAL_RULES_GET_URL, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 500, ErrMsg: 'load failed' }),
      });
    });
    const table = utils.routeTableList(page);
    const row = table.dataRows().filter({ hasText: 'Global' }).first();
    await row.getByRole('button', { name: '查看' }).click();
    await page.waitForTimeout(1000);
    await expect(
      page
        .locator('.ivu-message, .ivu-notice, .ivu-alert')
        .filter({ hasText: /加载路由规则失败/ })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('路由管理 - RT-D-20 Global 路由表不存在时进入详情', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(GLOBAL_RULES_GET_URL);
  });

  test('RT-D-20 Global 路由表不存在时进入详情', async ({ page }) => {
    await page.route(GLOBAL_RULES_GET_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 200, ErrMsg: 'success', Data: null }),
      });
    });
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.expectRouteRulesViewMode(page);
    await expect(page.getByText('暂无数据')).toBeVisible();
    await expect(
      page
        .locator('.enable-row .ivu-select')
        .filter({ hasText: '停用' })
        .first(),
    ).toBeVisible();
  });
});

test.describe('路由管理 - RT-D-16 提交接口失败时提示错误并停留编辑模式', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(GLOBAL_RULES_PUT_URL);
  });

  test('RT-D-16 提交接口失败时提示错误并停留编辑模式', async ({ page }) => {
    // 前置：初始化测试数据
    await utils.ensureRouteTableModuleAvailable(page);
    await resourceApi.initRouteTestData(page);

    const clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await page.route(GLOBAL_RULES_PUT_URL, async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 500, ErrMsg: 'submit failed' }),
      });
    });
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    const ruleName = 'rt_submit_fail_' + Date.now();
    await utils.openAddRuleDrawer(page);
    await utils.fillRuleName(page, ruleName);
    await utils.fillRuleExpression(page, 'default_t()');
    await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
    if (clusters[0].llm_config?.models?.length > 0) {
      await utils.selectRuleTargetModel(
        page,
        0,
        clusters[0].llm_config.models[0],
      );
    }
    await utils.fillRuleTargetWeight(page, 0, 100);
    await utils.submitRuleFormAndWait(page);
    await utils.submitGlobalRouteRulesAndExpectError(page);
    await expect(
      page
        .locator('.ivu-message, .ivu-notice, .ivu-alert')
        .filter({ hasText: /提交失败/ })
        .first(),
    ).toBeVisible({ timeout: 10000 });
    await utils.expectRouteRulesEditMode(page);
    await utils.expectRuleRowVisible(page, ruleName);
  });
});

test.describe('路由管理 - RT-D-19 快速点击启用按钮仅发送一次请求', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(GLOBAL_RULES_PUT_URL);
  });

  test('RT-D-19 快速点击启用按钮仅发送一次请求', async ({ page }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.gotoRouteTableListPage(page);

    let putCount = 0;
    await page.route(GLOBAL_RULES_PUT_URL, async (route) => {
      if (route.request().method() === 'PUT') {
        putCount += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: 200, ErrMsg: 'success', Data: null }),
      });
    });

    const table = utils.routeTableList(page);
    const row = table.dataRows().filter({ hasText: 'Global' }).first();
    const enableBtn = row.getByRole('button', { name: '启用' });
    await enableBtn.click();
    // 等待按钮变为禁用状态（防抖生效）
    await expect(enableBtn).toBeDisabled({ timeout: 5000 });
    // 尝试再次点击（应该被忽略）
    await enableBtn.click({ force: true });
    await page.waitForTimeout(2000);
    expect(putCount).toBeLessThanOrEqual(1);
  });
});
