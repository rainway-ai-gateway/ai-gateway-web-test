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
 * 路由管理 - route rule edit
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const common = require('../../utils/common');
const entityApi = require('../../api/entity-api-utils');
const resourceApi = require('../../api/resource-api-utils');

/**
 * 路由管理 - RT-D-05 进入编辑模式
 */

test.describe('路由管理 - RT-D-05 进入编辑模式', () => {
  test('验证 Global 路由表详情可进入编辑模式', async ({ page }) => {
    // 前置：进入页面并初始化测试数据
    await test.step('前置：初始化测试数据', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
    });

    await test.step('进入 Global 路由表详情页', async () => {
      await utils.openGlobalRouteTableDetail(page);
      await utils.expectRouteRulesViewMode(page);
    });

    await test.step('点击「进入编辑模式」', async () => {
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('验证编辑模式 UI', async () => {
      await utils.expectRouteRulesEditMode(page);
    });

    await test.step('验证规则表格操作列变为「编辑」和「删除」', async () => {
      const table = utils.routeRulesTable(page);
      const rowCount = await table.dataRows().count();
      if (rowCount === 0) {
        return;
      }
      const firstRow = table.dataRows().first();
      await expect(
        firstRow.getByRole('button', {
          name: utils.DOC_ROUTE_TABLE.editRuleButton,
        }),
      ).toBeVisible();
      await expect(
        firstRow.getByRole('button', {
          name: utils.DOC_ROUTE_TABLE.deleteRuleButton,
        }),
      ).toBeVisible();
    });
  });
});

/**
 * 路由管理 - RT-D-09 添加规则并本地保存
 */

test.describe('路由管理 - RT-D-09 添加规则并本地保存', () => {
  let createdRuleName = null;
  let clusters;

  test.afterEach(async ({ page }) => {
    if (createdRuleName) {
      await utils.deleteRuleByNameAndSubmit(page, createdRuleName);
    }
  });

  test('RT-D-09 添加规则并本地保存', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
    });

    await test.step('前置：获取可用集群', async () => {
      clusters = await utils.getAvailableClustersForRule(page);
      expect(
        clusters.length,
        '环境中无可用集群，无法测试规则编辑',
      ).toBeGreaterThan(0);
      common.log('可用集群: ' + clusters.map((c) => c.name).join(', '));
      createdRuleName = 'rt_rule_local_' + Date.now();
    });

    await test.step('1. 点击添加规则，打开规则编辑抽屉', async () => {
      await utils.openAddRuleDrawer(page);
    });

    await test.step('2. 填写规则名称与表达式', async () => {
      await utils.fillRuleName(page, createdRuleName);
      await utils.fillRuleExpression(page, 'default_t()');
    });

    await test.step('3. 选择目标集群与模型', async () => {
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      if (clusters[0].llm_config?.models?.length > 0) {
        await utils.selectRuleTargetModel(
          page,
          0,
          clusters[0].llm_config.models[0],
        );
      }
      await utils.fillRuleTargetWeight(page, 0, 100);
    });

    await test.step('4. 点击本地保存，规则出现在本地表格', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, createdRuleName);
    });
  });
});

/**
 * 路由管理 - RT-D-12 提交并生效（Global）
 */

test.describe('路由管理 - RT-D-12 提交并生效（Global）', () => {
  let createdRuleName = null;
  let clusters;

  test.afterEach(async ({ page }) => {
    if (createdRuleName) {
      await utils.deleteRuleByNameAndSubmit(page, createdRuleName);
    }
  });

  test('RT-D-12 添加规则并提交生效', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
    });

    await test.step('前置：获取可用集群', async () => {
      clusters = await utils.getAvailableClustersForRule(page);
      expect(
        clusters.length,
        '环境中无可用集群，无法测试规则编辑',
      ).toBeGreaterThan(0);
      common.log('可用集群: ' + clusters.map((c) => c.name).join(', '));
      createdRuleName = 'rt_rule_submit_' + Date.now();
    });

    await test.step('1. 添加规则并本地保存', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, createdRuleName);
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
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, createdRuleName);
    });

    await test.step('2. 提交并生效', async () => {
      await utils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('3. 验证提交后进入查看模式并显示规则', async () => {
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleRowVisible(page, createdRuleName);
    });

    await test.step('4. 通过 API 验证规则已写入', async () => {
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      const hit = rules?.rules?.find((r) => r.name === createdRuleName);
      expect(hit).toBeTruthy();
      expect(hit.cond).toBe('default_t()');
      expect(hit.targets[0].cluster_name).toBe(clusters[0].name);
      expect(hit.targets[0].weight).toBe(100);
    });
  });
});

/**
 * 路由管理 - RT-D-08 修改启用状态并提交（Global）
 */

test.describe('路由管理 - RT-D-08 修改启用状态并提交', () => {
  test('在 Global 详情页切换启用/停用并提交生效', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('1. 在详情页启用并提交', async () => {
      await utils.setRouteTableEnabledInDetail(page, true);
      await utils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('2. 返回列表页并验证已启用', async () => {
      await utils.gotoRouteTableListPage(page);
      await utils.expectGlobalRouteTableStatus(page, true);
    });

    await test.step('3. 在详情页停用并提交', async () => {
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.setRouteTableEnabledInDetail(page, false);
      await utils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('4. 返回列表页并验证已停用', async () => {
      await utils.gotoRouteTableListPage(page);
      await utils.expectGlobalRouteTableStatus(page, false);
    });
  });
});

/**
 * 路由管理 - RT-D-10 编辑规则
 */

test.describe('路由管理 - RT-D-10 编辑规则', () => {
  let createdRuleName = null;
  let editedRuleName = null;
  let clusters;

  test.afterEach(async ({ page }) => {
    if (createdRuleName || editedRuleName) {
      await utils.deleteRuleByNameAndSubmit(
        page,
        editedRuleName || createdRuleName,
      );
    }
  });

  test('编辑 Global 规则名称并本地保存', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式并获取集群', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    });

    await test.step('1. 添加一条规则', async () => {
      const ts = Date.now();
      createdRuleName = 'rt_edit_old_' + ts;
      editedRuleName = 'rt_edit_new_' + ts;
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, createdRuleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleRowVisible(page, createdRuleName);
    });

    await test.step('2. 编辑规则名称并本地保存', async () => {
      await utils.openEditRuleDrawer(page, createdRuleName);
      await utils.fillRuleName(page, editedRuleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.submitRuleFormAndWait(page);
    });

    await test.step('3. 验证表格显示新名称且旧名称消失', async () => {
      await utils.expectRuleRowVisible(page, editedRuleName);
      await utils.expectRuleRowHidden(page, createdRuleName);
    });
  });
});

/**
 * 路由管理 - RT-D-11 删除规则
 */

test.describe('路由管理 - RT-D-11 删除规则', () => {
  test('在编辑模式下删除 Global 规则，提交后 API 同步删除', async ({
    page,
  }) => {
    let createdRuleName;
    let clusters;

    await test.step('前置：进入 Global 路由表编辑模式并添加规则', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);

      createdRuleName = 'rt_delete_' + Date.now();
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, createdRuleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleRowVisible(page, createdRuleName);
    });

    await test.step('1. 点击删除，本地表格移除', async () => {
      await utils.deleteRuleByName(page, createdRuleName);
      await utils.expectRuleRowHidden(page, createdRuleName);
    });

    await test.step('2. 提交并生效，API 中规则被删除', async () => {
      await utils.submitGlobalRouteRulesAndWait(page);
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      const hit = rules?.rules?.find((r) => r.name === createdRuleName);
      expect(hit).toBeFalsy();
    });
  });
});

/**
 * 路由管理 - RT-D-13 提交并生效（Entity）
 */

test.describe('路由管理 - RT-D-13 提交并生效（Entity）', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let clusters;
  let ruleName;
  let owner;
  let entityName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('Entity 路由表添加规则并提交生效', async ({ page }) => {
    await test.step('前置：创建 Entity 路由表', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      const fixture = await utils.createEntityRouteTableFixtureViaUI(
        page,
        cleanup,
      );
      owner = fixture.entityId;
      entityName = fixture.entityName;
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      ruleName = 'rt_entity_submit_' + Date.now();
    });

    await test.step('1. 打开 Entity 详情并进入编辑模式', async () => {
      await utils.openRouteTableDetail(
        page,
        utils.DOC_ROUTE_TABLE.entityTypeLabel,
        owner,
        owner,
      );
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('2. 添加规则并本地保存', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });

    await test.step('3. 提交并生效', async () => {
      await utils.submitOwnerRouteRulesAndWait(page, 'entity', owner);
    });

    await test.step('4. 通过 API 验证规则已写入', async () => {
      const entity = await entityApi.findEntityByNameViaApi(page, entityName);
      const rules = entity?.route_rules?.rules || [];
      const hit = rules.find((r) => r.name === ruleName);
      expect(hit).toBeTruthy();
      expect(hit.cond).toBe('default_t()');
      expect(hit.targets[0].cluster_name).toBe(clusters[0].name);
    });
  });
});

/**
 * 路由管理 - RT-D-14 提交并生效（API-Key）
 */

test.describe('路由管理 - RT-D-14 提交并生效（API-Key）', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let clusters;
  let ruleName;
  let owner;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('API-Key 路由表添加规则并提交生效', async ({ page }) => {
    await test.step('前置：创建 API-Key 路由表', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      const fixture = await utils.createApiKeyRouteTableFixtureViaUI(
        page,
        cleanup,
      );
      owner = fixture.apiKeyId;
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      ruleName = 'rt_apikey_submit_' + Date.now();
    });

    await test.step('1. 打开 API-Key 详情并进入编辑模式', async () => {
      await utils.openRouteTableDetail(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        owner,
      );
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('2. 添加规则并本地保存', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });

    await test.step('3. 提交并生效', async () => {
      await utils.submitOwnerRouteRulesAndWait(page, 'apikey', owner);
    });

    await test.step('4. 通过 API 验证规则已写入', async () => {
      const all = await entityApi.fetchAllApiKeysViaApi(page);
      const hit = all.find((k) => k.id === owner);
      expect(hit).toBeTruthy();
      const rules = hit?.route_rules?.rules || [];
      const rule = rules.find((r) => r.name === ruleName);
      expect(rule).toBeTruthy();
      expect(rule.cond).toBe('default_t()');
      expect(rule.targets[0].cluster_name).toBe(clusters[0].name);
    });
  });
});

/**
 * 路由管理 - RT-D-15 提交后端校验失败（规则名称重复）
 */

test.describe('路由管理 - RT-D-15 提交后端校验失败', () => {
  let clusters;
  let duplicateName;

  test('Global 路由表提交重复规则名称触发后端校验失败', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      duplicateName = 'rt_dup_' + Date.now();
    });

    await test.step('1. 添加两条同名规则', async () => {
      for (let i = 0; i < 2; i++) {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, duplicateName);
        await utils.fillRuleExpression(page, 'default_t()');
        await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
        await utils.fillRuleTargetWeight(page, 0, 100);
        await utils.submitRuleFormAndWait(page);
      }
      const rows = utils.routeRulesTable(page).dataRows();
      await expect(rows.filter({ hasText: duplicateName })).toHaveCount(2);
    });

    await test.step('2. 提交并生效，预期失败', async () => {
      await page
        .getByRole('button', { name: utils.DOC_ROUTE_TABLE.submitAndEffect })
        .click();
      await page.waitForTimeout(2000);
    });

    await test.step('3. 验证停留在编辑模式且出现错误提示', async () => {
      await utils.expectRouteRulesEditMode(page);
      await utils.expectRouteRulesSubmitError(page, /duplicate|重复|参数非法/);
    });

    await test.step('4. 清理所有同名规则', async () => {
      await utils.deleteAllRulesByName(page, duplicateName);
      await utils.submitGlobalRouteRulesAndWait(page);
    });
  });
});

test.describe('路由管理 - RT-D-06 退出编辑模式（未修改）', () => {
  test('RT-D-06 退出编辑模式（未修改）刷新数据并回到查看模式', async ({
    page,
  }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    await utils.clickExitEditMode(page);
    await utils.expectRouteRulesViewMode(page);
  });
});

test.describe('路由管理 - RT-D-07 退出编辑模式（已修改）', () => {
  test('RT-D-07 退出编辑模式（已修改）丢弃本地变更并刷新数据', async ({
    page,
  }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    const tempName = 'rt_discard_' + Date.now();
    await utils.openAddRuleDrawer(page);
    await utils.fillRuleName(page, tempName);
    await utils.fillRuleExpression(page, 'default_t()');
    const clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '无可用集群').toBeGreaterThan(0);
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
    await utils.expectRuleRowVisible(page, tempName);
    await utils.clickExitEditMode(page);
    await utils.expectRouteRulesViewMode(page);
    await utils.expectRuleRowHidden(page, tempName);
  });
});

test.describe('路由管理 - RT-D-18 规则编辑抽屉重置按钮', () => {
  test('RT-D-18 规则编辑抽屉重置按钮恢复初始值', async ({ page }) => {
    const clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    await utils.openAddRuleDrawer(page);
    const originalName = '';
    await utils.fillRuleName(page, 'rt_reset_' + Date.now());
    await utils.resetRuleForm(page);
    const nameInput = page.locator('.rule-form input').first();
    await expect(nameInput).toHaveValue(originalName);
    await utils.expectRuleFormDrawerStillOpen(page);
  });
});

test.describe('路由管理 - RT-D-21 编辑模式下按规则名搜索', () => {
  test('RT-D-21 编辑模式下按规则名搜索', async ({ page }) => {
    const clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    const nameA = 'rt_search_a_' + Date.now();
    const nameB = 'rt_search_b_' + Date.now();
    for (const name of [nameA, nameB]) {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, name);
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
    }
    await utils.searchRuleByName(page, nameA);
    await utils.expectRuleRowVisible(page, nameA);
    await utils.expectRuleRowHidden(page, nameB);
  });
});
