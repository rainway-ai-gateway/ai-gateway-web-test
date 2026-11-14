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
 * AI业务集群 - BC-J-01「从零到可路由」全 UI 闭环（docs/覆盖缺口清单.md #19）
 *
 * 场景（01-测试场景概览「配置顺序 ①②③」）：管理员从零搭建一条可路由链路，
 * 每一步都走目标模块的真实 UI，并在操作日志模块核对审计记录。
 *
 * 旅程：
 * 1. Providers UI：创建服务商（IP 实例 + openai + 批量模型 + Key）
 * 2. 操作日志 UI：按资源名搜索 → 存在 create 记录（审计核对 ①）
 * 3. Clusters UI：5 步向导创建集群（引用该服务商 + 模型 + Key 权重 100）
 * 4. 操作日志 UI：按资源名搜索 → 存在 create 记录（审计核对 ②）
 * 5. Route UI：默认路由表进入编辑 → 新增规则引用该集群 → 本地保存 → 提交并生效
 * 6. 引用约束：删除集群被拦截、toast 后端错误消息含引用规则名（跨模块反向验证；2026-11-04 起无引用弹窗）
 * 7. 解除引用：Route UI 删除该规则并提交生效 → Clusters UI 删除集群成功（清理顺序）
 * 8. Providers UI：删除服务商成功
 * 9. 操作日志 UI：集群删除记录可见（审计闭环）
 *
 * 覆盖缺口清单 #19 的四个维度：跨模块导航 / 引用链建立与解除 / 审计完整性 / 清理顺序。
 *
 * 造数：全 UI（本用例本身即造数）；afterEach 按「路由规则 → 集群 → 服务商」顺序兜底清理，
 * 全局路由规则用 routeCleanup 快照-还原保护环境现场。
 *
 * 运行：npx playwright test tests/cluster/test_14_business_cluster_full_journey.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const pp = require('../../pages/providers/ProviderPage');
const routeUtils = require('../../pages/route/RoutePage');
const olp = require('../../pages/operation-logs/OperationLogPage');
const routeApi = require('../../api/route-api-utils');

const MODEL = 'Qwen/Qwen2.5-3B-Instruct';
const PROVIDER_KEY = 'key-journey';
const INSTANCE = { addr: '127.0.0.1', port: 80, weight: 100 };

/**
 * 审计核对：按资源名搜索操作日志并断言 action 记录可见。
 * 审计写入是异步的（写库晚于 UI 成功提示），而日志表格不会自动刷新，
 * 故按「重试搜索」轮询，而非固定 sleep。
 */
async function expectAuditRow(page, resourceName, action, attempts = 6) {
  await olp.gotoOperationLogPage(page);
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      await page.waitForTimeout(2000);
    }
    await olp.searchByResourceName(page, resourceName);
    const row = olp.operationLogTable(page).rowByText(resourceName);
    if (await row.isVisible().catch(() => false)) {
      await expect(row.getByText(action).first()).toBeVisible();
      return;
    }
  }
  throw new Error(
    `操作日志未出现「${resourceName}」的 ${action} 记录（重试搜索 ${attempts} 次）`,
  );
}

test.describe('AI业务集群 - BC-J-01 从零到可路由（全 UI 闭环）', () => {
  let cleanup;
  let routeCleanup;
  let providerName;
  let clusterName;
  let ruleName;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    routeCleanup = routeApi.createRouteTestCleanup();
    providerName = 'provider_j_' + Date.now().toString(36);
    clusterName = utils.generateTestBusinessClusterName();
    ruleName = 'bc_j_route_' + Date.now();
    cleanup.trackBusinessCluster(clusterName);
    await routeCleanup.saveGlobalRouteRulesOriginalState(page);
  });

  test.afterEach(async ({ page }) => {
    // 清理顺序：路由规则（还原全局快照）→ 集群 → 服务商
    await routeCleanup.cleanup(page);
    await cleanup.cleanup(page);
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
      // 已在旅程内删除或环境异常：兜底清理不再抛出，避免掩盖用例结论
    }
  });

  test('从零搭建可路由链路：Provider → Cluster → Route → 审计 → 反序清理', async ({
    page,
  }) => {
    test.setTimeout(600000);

    await test.step('1. Providers UI：创建服务商（IP 实例 + openai + 模型 + Key）', async () => {
      await pp.gotoProvidersPage(page);
      await pp.openCreateDrawer(page);
      await pp.fillName(page, providerName);
      await pp.fillDescription(page, 'BC-J-01 全流程造数');
      await pp.selectInstanceMode(page, 'IP');
      await pp.fillInstanceRow(page, 0, INSTANCE);
      await pp.selectProtocols(page, ['openai']);
      await pp.openBatchAddModels(page);
      await pp.fillBatchModelsText(page, MODEL);
      await pp.confirmBatchAddModels(page);
      await pp.expectModelTags(page, [MODEL]);
      await pp.fillKeyRow(page, 0, { name: PROVIDER_KEY, key: 'sk-journey' });
      await pp.submitUpsertAndWait(page);
      await pp.expectDrawerHidden(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
    });

    await test.step('2. 操作日志审计：服务商创建记录可见', async () => {
      await expectAuditRow(page, providerName, 'create');
    });

    await test.step('3. Clusters UI：5 步向导创建集群（引用该服务商 + 模型 + Key 权重 100）', async () => {
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
      await utils.fillModelKeyRow(page, 0, {
        name: PROVIDER_KEY,
        weight: 100,
      });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      await utils.submitCreateBusinessClusterAndWaitForSuccess(page);
      await utils.expectCreateBusinessClusterDrawerHidden(page);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
    });

    await test.step('4. 操作日志审计：集群创建记录可见', async () => {
      await expectAuditRow(page, clusterName, 'create');
    });

    await test.step('5. Route UI：新增规则引用该集群并提交生效', async () => {
      // 直连 URL 进入路由表列表：本用例从其他模块导航过来，侧栏子菜单可能未展开，
      // 侧栏点击路径不可靠（与 route 模块内部用例的前提不同）
      await page.goto(new URL('/route-tables', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1000);
      await routeUtils.openGlobalRouteTableDetail(page);
      await routeUtils.ensureGlobalRouteTableDisabledViaUI(page);
      await routeUtils.openGlobalRouteTableDetail(page);
      await routeUtils.enterRouteRulesEditMode(page);
      await routeUtils.expectRouteRulesEditMode(page);

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

    await test.step('6. 引用约束：删除被引用的集群被拦截，弹窗含规则名', async () => {
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
      const result = await utils.attemptDeleteBusinessCluster(page, clusterName);
      expect(result.ok, '被路由规则引用的集群应删除失败').toBe(false);
      // 2026-11-04 起无引用弹窗：删除失败直接 toast 后端错误消息（含规则名）
      const errorToast = page
        .locator('.ivu-message')
        .filter({ hasText: ruleName })
        .first();
      await expect(errorToast).toBeVisible({ timeout: 15000 });
    });

    await test.step('7. 解除引用并反序清理：删除规则 → 删除集群', async () => {
      await routeUtils.deleteRuleByNameAndSubmit(page, ruleName);
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
      const result = await utils.attemptDeleteBusinessCluster(page, clusterName);
      expect(result.ok, '解除引用后集群应删除成功').toBe(true);
      await utils.businessClusterTable(page).waitForLoaded();
      await expect(
        utils.businessClusterTable(page).rowByText(clusterName),
      ).toHaveCount(0);
    });

    await test.step('8. Providers UI：删除服务商成功', async () => {
      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
      await pp.clickDelete(page, providerName);
      await pp.expectDeleteConfirm(page, providerName);
      await pp.confirmDeleteAndWait(page, providerName);
      await expect(
        pp.providerTable(page).rowByText(providerName),
      ).toHaveCount(0);
    });

    await test.step('9. 操作日志审计闭环：集群删除记录可见', async () => {
      await expectAuditRow(page, clusterName, 'delete');
    });
  });
});