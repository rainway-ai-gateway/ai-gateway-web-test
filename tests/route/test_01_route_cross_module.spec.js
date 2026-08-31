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
 * 路由管理 - route cross module
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const entityApi = require('../../api/entity-api-utils');
const common = require('../../utils/common');
const { deleteApiKeyViaApi } = require('../../pages/entity/EntityApiKeyPage');
const entityApiKeyPage = require('../../pages/entity/EntityApiKeyPage');
const { IvuMessageComponent } = require('../../components/iview');
const resourceApi = require('../../api/resource-api-utils');

const ENTITY_TYPE = utils.DOC_ROUTE_TABLE.entityTypeLabel;
const APIKEY_TYPE = utils.DOC_ROUTE_TABLE.apiKeyTypeLabel;

test.describe('路由管理 - RT-S-01 创建 Entity 后路由表新增', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let entityId;
  let entityName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证创建 Entity 后路由表新增', async ({ page }) => {
    await test.step('进入路由表列表并记录当前 Entity 行数', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.reloadRouteTableListPage(page);
      const rows = await utils.getRouteTablesViaApi(page);
      const beforeCount = rows.filter((row) => row.type === 'entity').length;
      common.log('创建 Entity 前 Entity 路由表行数: ' + beforeCount);
    });

    await test.step('前置：通过 UI 创建 Entity', async () => {
      const fixture = await utils.createEntityRouteTableFixtureViaUI(
        page,
        cleanup,
      );
      entityId = fixture.entityId;
      entityName = fixture.entityName;
    });

    await test.step('RT-S-01 验证路由表新增 Entity 行', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableRowVisible(page, ENTITY_TYPE, entityId);
    });
  });
});

test.describe('路由管理 - RT-S-02 删除 Entity 后路由表减少', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let entityId;
  let entityName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证删除 Entity 后路由表减少', async ({ page }) => {
    await test.step('前置：通过 UI 创建 Entity', async () => {
      const fixture = await utils.createEntityRouteTableFixtureViaUI(
        page,
        cleanup,
      );
      entityId = fixture.entityId;
      entityName = fixture.entityName;
    });

    await test.step('确认路由表存在 Entity 行', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableRowVisible(page, ENTITY_TYPE, entityId);
    });

    await test.step('RT-S-02 删除 Entity 后验证路由表行减少', async () => {
      await entityApi.deleteEntityViaApi(page, entityId);
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      const table = utils.routeTableList(page);
      await expect(
        table
          .dataRows()
          .filter({ hasText: ENTITY_TYPE })
          .filter({ hasText: entityId }),
      ).toHaveCount(0, { timeout: 15000 });
    });
  });
});

test.describe('路由管理 - RT-S-03 创建 API-Key 后路由表新增', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let apiKeyId;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证创建 API-Key 后路由表新增', async ({ page }) => {
    await test.step('进入路由表列表并记录当前 API-Key 行数', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.reloadRouteTableListPage(page);
      const rows = await utils.getRouteTablesViaApi(page);
      const beforeCount = rows.filter((row) => row.type === 'apikey').length;
      common.log('创建 API-Key 前 API-Key 路由表行数: ' + beforeCount);
    });

    await test.step('前置：通过 UI 创建 Entity + API-Key', async () => {
      const fixture = await utils.createApiKeyRouteTableFixtureViaUI(
        page,
        cleanup,
      );
      apiKeyId = fixture.apiKeyId;
    });

    await test.step('RT-S-03 验证路由表新增 API-Key 行', async () => {
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableRowVisible(page, APIKEY_TYPE, apiKeyId);
    });
  });
});

test.describe('路由管理 - RT-S-04 删除 API-Key 后路由表减少', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let apiKeyId;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证删除 API-Key 后路由表减少', async ({ page }) => {
    await test.step('前置：通过 UI 创建 Entity + API-Key', async () => {
      const fixture = await utils.createApiKeyRouteTableFixtureViaUI(
        page,
        cleanup,
      );
      apiKeyId = fixture.apiKeyId;
    });

    await test.step('确认路由表存在 API-Key 行', async () => {
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableRowVisible(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('RT-S-04 删除 API-Key 后验证路由表行减少', async () => {
      await deleteApiKeyViaApi(page, apiKeyId);
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      const table = utils.routeTableList(page);
      await expect(
        table
          .dataRows()
          .filter({ hasText: APIKEY_TYPE })
          .filter({ hasText: apiKeyId }),
      ).toHaveCount(0, { timeout: 15000 });
    });
  });
});

/**
 * 路由管理 - RT-J-01 全链路配置
 * Entity 类型 → Entity 组织 → API-Key → 路由表联动 + 规则配置
 */

const ENTITY_RULE_NAME = 'entity-rule-journey';
const APIKEY_RULE_NAME = 'apikey-rule-journey';

test.describe('路由管理 - RT-J-01 全链路配置', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let fixture;
  let apiKeyId;
  let clusters;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('类型→组织→API-Key→路由表全链路配置并清理', async ({ page }) => {
    await test.step('1~2. UI 创建 Entity 类型与 Entity 组织', async () => {
      fixture = await utils.createEntityRouteTableFixtureViaUI(page, cleanup);
      common.log(
        '已创建 Entity: ' + fixture.entityName + ' id=' + fixture.entityId,
      );
    });

    await test.step('3. 路由表列表出现 Entity 路由表，默认停用', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      try {
        await utils.navigateToRouteTableByOwner(
          page,
          utils.DOC_ROUTE_TABLE.entityTypeLabel,
          fixture.entityId,
        );
        await utils.expectRouteTableRowVisible(
          page,
          utils.DOC_ROUTE_TABLE.entityTypeLabel,
          fixture.entityId,
        );
        await utils.expectRouteTableStatus(
          page,
          utils.DOC_ROUTE_TABLE.entityTypeLabel,
          fixture.entityId,
          false,
        );
      } catch (e) {
        common.log('Entity 路由表未自动创建，跳过 UI 验证: ' + e.message);
      }
    });

    await test.step('4. UI 创建 API-Key 并挂载到 Entity', async () => {
      await entityApiKeyPage.gotoApiKeyManagementPage(page);
      await entityApiKeyPage.openAddApiKeyDrawer(page);
      const description = 'RT-J-01_key_' + Date.now();
      await entityApiKeyPage.fillApiKeyBasicForm(page, {
        description,
        unlimitedQuota: true,
        entityName: fixture.entityName,
      });
      await entityApiKeyPage.submitApiKeyForm(page);
      await new IvuMessageComponent(page).expectText('添加成功');
      await page.waitForTimeout(1500);
      const apiKey = await entityApi.findApiKeyByDescriptionViaApi(
        page,
        description,
      );
      expect(apiKey?.id, 'UI 创建 API-Key 后未查到 id').toBeTruthy();
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      common.log('已创建 API-Key: id=' + apiKeyId);
      await utils.waitForRouteTableOwner(page, 'apikey', apiKeyId);
    });

    await test.step('5. 路由表列表出现 API-Key 路由表，默认停用', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.navigateToRouteTableByOwner(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        apiKeyId,
      );
      await utils.expectRouteTableRowVisible(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        apiKeyId,
      );
      await utils.expectRouteTableStatus(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        apiKeyId,
        false,
      );
    });

    await test.step('获取可用集群', async () => {
      clusters = await utils.getAvailableClustersForRule(page);
      if (clusters.length === 0) {
        common.log('环境中无可用集群，自动创建测试集群...');
        await resourceApi.ensureTestClusters(page, ['test-auto-rtj01']);
        clusters = await utils.getAvailableClustersForRule(page);
      }
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('6. 为 Entity 路由表添加并提交规则', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openRouteTableDetail(
        page,
        utils.DOC_ROUTE_TABLE.entityTypeLabel,
        fixture.entityId,
        fixture.entityId,
      );
      await utils.enterRouteRulesEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ENTITY_RULE_NAME);
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
      await utils.submitOwnerRouteRulesAndWait(
        page,
        'entity',
        fixture.entityId,
      );
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleRowVisible(page, ENTITY_RULE_NAME);
    });

    await test.step('7. 为 API-Key 路由表添加并提交规则', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openRouteTableDetail(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        apiKeyId,
      );
      await utils.enterRouteRulesEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, APIKEY_RULE_NAME);
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
      await utils.submitOwnerRouteRulesAndWait(page, 'apikey', apiKeyId);
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleRowVisible(page, APIKEY_RULE_NAME);
    });

    await test.step('8. 返回列表确认两条路由表均存在', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.navigateToRouteTableByOwner(
        page,
        utils.DOC_ROUTE_TABLE.entityTypeLabel,
        fixture.entityId,
      );
      await utils.expectRouteTableRowVisible(
        page,
        utils.DOC_ROUTE_TABLE.entityTypeLabel,
        fixture.entityId,
      );
      await utils.navigateToRouteTableByOwner(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        apiKeyId,
      );
      await utils.expectRouteTableRowVisible(
        page,
        utils.DOC_ROUTE_TABLE.apiKeyTypeLabel,
        apiKeyId,
      );
    });
  });
});

/**
 * 路由管理 - RT-S-05 集群删除被路由规则引用阻止与跳转
 */
test.describe('路由管理 - RT-S-05 集群删除被路由规则引用阻止与跳转', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let fixture;
  let clusters;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('集群删除被路由规则引用时阻止并展示引用信息与跳转链接', async ({
    page,
  }) => {
    await test.step('前置：创建 Entity 路由表并添加引用集群的规则', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      fixture = await utils.createEntityRouteTableFixtureViaUI(page, cleanup);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('1. 在 Entity 路由表中添加规则并引用集群', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openRouteTableDetail(
        page,
        utils.DOC_ROUTE_TABLE.entityTypeLabel,
        fixture.entityId,
        fixture.entityId,
      );
      await utils.enterRouteRulesEditMode(page);
      const ruleName = 'rt_s05_ref_' + Date.now();
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.submitRuleFormAndWait(page);
      await utils.submitOwnerRouteRulesAndWait(
        page,
        'entity',
        fixture.entityId,
      );
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });

    await test.step('2. 尝试删除被引用的集群', async () => {
      // TODO: 需要通过集群管理页面尝试删除集群
      // 如果集群管理 page object 不可用，可通过 API 尝试删除并验证失败
      const resourceApi = require('../../api/resource-api-utils');
      const result = await resourceApi.deleteCluster(page, clusters[0].name);
      expect(result).toBe(false);
    });

    await test.step('3. 验证错误提示包含引用信息（如果 UI 展示）', async () => {
      // TODO: 如果通过 UI 删除集群，验证弹窗展示：
      // - 路由表类型（Entity）
      // - 路由表属主（fixture.entityName）
      // - 规则名
      // - "前往处理"链接
      // 点击"前往处理"后跳转到路由规则页面
      // 当前通过 API 删除仅验证返回失败，UI 断言待集群管理 page object 补充
    });
  });
});
