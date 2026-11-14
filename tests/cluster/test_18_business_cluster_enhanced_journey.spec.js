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
 * AI业务集群 - BC-J-04「完整配置面」跨模块场景（docs/覆盖缺口清单.md 跨模块配置场景缺口）
 *
 * 场景：在生产形态下一次走通五层配置——
 * ① Providers UI 建服务商 → ② Clusters UI 建集群 → ③ Route UI 建规则引用集群并提交生效
 * → ④ AI 缓存 UI 建集合级规则 → ⑤ 流量镜像 UI 建集合级规则；
 * 然后按依赖反序清理（缓存规则 → 镜像规则 → 路由规则 → 集群 → 服务商）。
 *
 * 与 BC-J-01 的差异：BC-J-01 覆盖主链 + 审计 + 引用约束；本用例把「功能增强层」
 * （AI 缓存 / 流量镜像，与路由共用表达式条件语言但独立成集合）纳入同一会话配置面，
 * 验证五层配置互不阻塞、可全部走通、可按依赖反序拆除。
 *
 * 造数：全 UI；afterEach 兜底：缓存/镜像集合快照还原 + 路由规则快照还原 +
 * 集群清理 + 服务商清理。
 *
 * 运行：npx playwright test tests/cluster/test_18_business_cluster_enhanced_journey.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const pp = require('../../pages/providers/ProviderPage');
const routeUtils = require('../../pages/route/RoutePage');
const cacheUtils = require('../../pages/ai-cache/AICachePage');
const mirrorUtils = require('../../pages/traffic-mirror/TrafficMirrorPage');
const routeApi = require('../../api/route-api-utils');

const MODEL = 'Qwen/Qwen2.5-3B-Instruct';
const PROVIDER_KEY = 'key-journey18';
const INSTANCE = { addr: '127.0.0.1', port: 80, weight: 100 };

test.describe('AI业务集群 - BC-J-04 完整配置面（五层跨模块场景）', () => {
  let clusterCleanup;
  let routeCleanup;
  let cacheCleanup;
  let mirrorCleanup;
  let providerName;
  let clusterName;
  let ruleName;
  let cacheRuleName;
  let mirrorRuleName;

  test.beforeEach(async ({ page }) => {
    clusterCleanup = utils.createResourceTestCleanup();
    routeCleanup = routeApi.createRouteTestCleanup();
    cacheCleanup = cacheUtils.createAiCacheTestCleanup();
    mirrorCleanup = mirrorUtils.createTrafficMirrorTestCleanup();
    providerName = 'provider_j18_' + Date.now().toString(36);
    clusterName = utils.generateTestBusinessClusterName();
    ruleName = 'bc_j18_route_' + Date.now();
    cacheRuleName = cacheUtils.generateTestRuleName('ac_j18_');
    mirrorRuleName = mirrorUtils.generateTestRuleName('tm_j18_');
    clusterCleanup.trackBusinessCluster(clusterName);
    await routeCleanup.saveGlobalRouteRulesOriginalState(page);
    await cacheCleanup.saveOriginalState(page);
    await mirrorCleanup.saveOriginalState(page);
  });

  test.afterEach(async ({ page }) => {
    // 反序兜底：镜像集合 → 缓存集合 → 路由规则 → 集群 → 服务商
    await mirrorCleanup.cleanup(page);
    await cacheCleanup.cleanup(page);
    await routeCleanup.cleanup(page);
    await clusterCleanup.cleanup(page);
    try {
      await pp.gotoProvidersPage(page);
      if (
        await pp
          .providerTable(page)
          .rowByText(providerName)
          .isVisible()
          .catch(() => false)
      ) {
        await pp.clickDelete(page, providerName);
        await pp.confirmDeleteAndWait(page, providerName, {
          expectSuccess: false,
        });
      }
    } catch (_error) {
      // 已在旅程内删除或环境异常：兜底清理不再抛出
    }
  });

  test('完整配置面：Provider → Cluster → Route → AI 缓存 → 流量镜像，反序拆除', async ({
    page,
  }) => {
    test.setTimeout(600000);

    await test.step('1. Providers UI：创建服务商', async () => {
      await pp.gotoProvidersPage(page);
      await pp.openCreateDrawer(page);
      await pp.fillName(page, providerName);
      await pp.fillDescription(page, 'BC-J-04 完整配置面造数');
      await pp.selectInstanceMode(page, 'IP');
      await pp.fillInstanceRow(page, 0, INSTANCE);
      await pp.selectProtocols(page, ['openai']);
      await pp.openBatchAddModels(page);
      await pp.fillBatchModelsText(page, MODEL);
      await pp.confirmBatchAddModels(page);
      await pp.expectModelTags(page, [MODEL]);
      await pp.fillKeyRow(page, 0, { name: PROVIDER_KEY, key: 'sk-j18' });
      await pp.submitUpsertAndWait(page);
      await pp.expectDrawerHidden(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
    });

    await test.step('2. Clusters UI：5 步向导创建集群', async () => {
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.openCreateBusinessClusterDrawer(page);
      await utils.fillBasicStep(page, { clusterName, protocol: 'https' });
      await utils.clickWizardNext(page);
      await utils.clickWizardNext(page);
      await utils.fillHealthStep(page, {
        failureThreshold: 10,
        healthInterval: 1000,
        healthHost: 'www.test1.com',
        healthUri: '/interface',
        expectedStatus: 200,
      });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '大模型配置');
      await utils.selectProvider(page, providerName);
      await utils.selectForwardModels(page, [MODEL]);
      await utils.fillModelKeyRow(page, 0, { name: PROVIDER_KEY, weight: 100 });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      await utils.submitCreateBusinessClusterAndWaitForSuccess(page);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
    });

    await test.step('3. Route UI：建规则引用该集群并提交生效', async () => {
      await page.goto(new URL('/route-tables', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1000);
      await routeUtils.openGlobalRouteTableDetail(page);
      await routeUtils.ensureGlobalRouteTableDisabledViaUI(page);
      await routeUtils.openGlobalRouteTableDetail(page);
      await routeUtils.enterRouteRulesEditMode(page);
      await routeUtils.openAddRuleDrawer(page);
      await routeUtils.fillRuleName(page, ruleName);
      await routeUtils.fillRuleExpression(page, 'default_t()');
      await routeUtils.selectRuleTargetCluster(page, 0, clusterName);
      await routeUtils.selectRuleTargetModel(page, 0, MODEL);
      await routeUtils.fillRuleTargetWeight(page, 0, 100);
      await routeUtils.submitRuleFormAndWait(page);
      await routeUtils.expectRuleFormDrawerHidden(page);
      await routeUtils.expectRuleRowVisible(page, ruleName);
      await routeUtils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('4. AI 缓存 UI：建集合级规则并提交生效', async () => {
      await cacheUtils.ensureAppSession(page);
      await cacheUtils.reloadAiCachePage(page);
      await cacheUtils.enterEditMode(page);
      await cacheUtils.openAddRuleDrawer(page);
      await cacheUtils.fillRuleName(page, cacheRuleName);
      await cacheUtils.fillRuleCond(page, 'default_t()');
      await cacheUtils.submitRuleFormExpectMessage(page, '添加成功！');
      await cacheUtils.expectRuleFormDrawerHidden(page);
      await cacheUtils.submitRulesAndWait(page);
      await cacheUtils.expectRuleRowVisible(page, cacheRuleName);
    });

    await test.step('5. 流量镜像 UI：建集合级规则并提交生效', async () => {
      await mirrorUtils.gotoTrafficMirrorPage(page);
      await mirrorUtils.enterEditMode(page);
      await mirrorUtils.openAddRuleDrawer(page);
      await mirrorUtils.fillRuleName(page, mirrorRuleName);
      await mirrorUtils.fillRuleCond(page, 'default_t()');
      await mirrorUtils.submitRuleFormExpectMessage(page, '添加成功！');
      await mirrorUtils.expectRuleFormDrawerHidden(page);
      await mirrorUtils.submitRulesAndWait(page);
      await mirrorUtils.expectRuleRowVisible(page, mirrorRuleName);
    });

    await test.step('6. 反序拆除：缓存规则 → 镜像规则 → 路由规则 → 集群 → 服务商', async () => {
      // 6.1 删缓存规则并提交生效
      await cacheUtils.reloadAiCachePage(page);
      await cacheUtils.enterEditMode(page);
      await cacheUtils.clickRuleDelete(page, cacheRuleName);
      await cacheUtils.confirmDelete(page);
      await cacheUtils.submitRulesAndWait(page);
      await cacheUtils.expectRuleRowHidden(page, cacheRuleName);

      // 6.2 删镜像规则并提交生效
      await mirrorUtils.gotoTrafficMirrorPage(page);
      await mirrorUtils.enterEditMode(page);
      await mirrorUtils.clickRuleDelete(page, mirrorRuleName);
      await mirrorUtils.confirmDelete(page);
      await mirrorUtils.submitRulesAndWait(page);
      await mirrorUtils.expectRuleRowHidden(page, mirrorRuleName);

      // 6.3 删路由规则并提交生效
      await routeUtils.deleteRuleByNameAndSubmit(page, ruleName);

      // 6.4 删集群（已无引用）
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
      const result = await utils.attemptDeleteBusinessCluster(page, clusterName);
      expect(result.ok, '拆除增强层与路由后集群应删除成功').toBe(true);
      await utils.businessClusterTable(page).waitForLoaded();
      await expect(
        utils.businessClusterTable(page).rowByText(clusterName),
      ).toHaveCount(0);

      // 6.5 删服务商
      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
      await pp.clickDelete(page, providerName);
      await pp.expectDeleteConfirm(page, providerName);
      await pp.confirmDeleteAndWait(page, providerName);
      await expect(pp.providerTable(page).rowByText(providerName)).toHaveCount(0);
    });
  });
});
