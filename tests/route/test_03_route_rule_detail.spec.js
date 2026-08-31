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
 * 路由管理 - route rule detail
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const resourceApi = require('../../api/resource-api-utils');

/**
 * 含 2 个模型的测试集群（用于 fallbacks 展示/回显用例）
 */
const RT_FALLBACK_CLUSTER_NAME = 'rt_fallback_cluster_' + Date.now();

async function createFallbackTestCluster(page) {
  const ok = await resourceApi.createClusterWithProvider(
    page,
    RT_FALLBACK_CLUSTER_NAME,
    ['model-a', 'model-b'],
  );
  if (!ok) {
    throw new Error('创建 fallback 测试集群失败: ' + RT_FALLBACK_CLUSTER_NAME);
  }
}

async function deleteFallbackTestCluster(page) {
  await resourceApi.deleteCluster(page, RT_FALLBACK_CLUSTER_NAME);
}

/**
 * 路由管理 - RT-D-01 查看 Global 路由表详情
 * Skill 阶段 1 P0 标杆：导航 + 列表 + 详情查看模式
 */

test.describe('路由管理 - RT-D-01 查看 Global 路由表详情', () => {
  test('验证 Global 路由表详情页以查看模式正确加载', async ({ page }) => {
    // 前置：进入页面并初始化测试数据
    await test.step('前置：初始化测试数据', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
    });

    await test.step('进入路由表列表页', async () => {
      await utils.waitForRouteTablesListResponse(page, async () => {});
    });

    await test.step('验证列表页布局与表头', async () => {
      await utils.expectRouteTableListLayout(page);
      await utils.expectRouteTableListHeaders(page);
      await utils.expectGlobalRouteTableRowVisible(page);
    });

    await test.step('点击 Global 路由表行的「查看」按钮', async () => {
      await utils.openGlobalRouteTableDetail(page);
    });

    await test.step('验证详情页切换与面包屑', async () => {
      await utils.expectGlobalRouteTableDetailOpen(page);
    });

    await test.step('验证详情页处于查看模式', async () => {
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRouteRulesTableHeaders(page);
    });

    await test.step('验证规则表格操作列仅显示「查看」', async () => {
      const table = utils.routeRulesTable(page);
      const rowCount = await table.dataRows().count();
      if (rowCount === 0) {
        return;
      }
      const firstRow = table.dataRows().first();
      await expect(
        firstRow.getByRole('button', {
          name: utils.DOC_ROUTE_RULE.viewRuleButton,
        }),
      ).toBeVisible();
      await expect(firstRow.getByRole('button', { name: '编辑' })).toHaveCount(
        0,
      );
      await expect(firstRow.getByRole('button', { name: '删除' })).toHaveCount(
        0,
      );
    });
  });
});

/**
 * 路由管理 - RT-D-02 查看 Entity 路由表详情
 */

const ENTITY_TYPE = utils.DOC_ROUTE_TABLE.entityTypeLabel;

test.describe('路由管理 - RT-D-02 查看 Entity 路由表详情', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let entityId;
  let entityName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证 Entity 路由表详情页以查看模式正确加载', async ({ page }) => {
    await test.step('前置：获取 Entity 路由表属主', async () => {
      const resolved = await utils.resolveEntityRouteTableOwner(page, cleanup);
      entityId = resolved.ownerId;
      entityName = resolved.ownerName;
    });

    await test.step('验证路由表列表出现 Entity 行', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableRowVisible(page, ENTITY_TYPE, entityId);
    });

    await test.step('点击 Entity 路由表行的「查看」按钮', async () => {
      await utils.openRouteTableDetail(page, ENTITY_TYPE, entityId, entityId);
    });

    await test.step('验证详情页切换与面包屑', async () => {
      await utils.expectRouteTableDetailOpen(page, ENTITY_TYPE, entityName);
    });

    await test.step('验证详情页处于查看模式', async () => {
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRouteRulesTableHeaders(page);
    });
  });
});

/**
 * 路由管理 - RT-D-03 查看 API-Key 路由表详情
 */

const APIKEY_TYPE = utils.DOC_ROUTE_TABLE.apiKeyTypeLabel;

test.describe('路由管理 - RT-D-03 查看 API-Key 路由表详情', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let apiKeyId;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证 API-Key 路由表详情页以查看模式正确加载', async ({ page }) => {
    await test.step('前置：获取 API-Key 路由表属主', async () => {
      const resolved = await utils.resolveApiKeyRouteTableOwner(page, cleanup);
      apiKeyId = resolved.ownerId;
    });

    await test.step('验证路由表列表出现 API-Key 行', async () => {
      await utils.expectRouteTableRowVisible(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('点击 API-Key 路由表行的「查看」按钮', async () => {
      await utils.openRouteTableDetail(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('验证详情页切换与面包屑', async () => {
      await utils.expectRouteTableDetailOpen(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('验证详情页处于查看模式', async () => {
      await utils.expectRouteRulesViewMode(page);
      await utils.expectRouteRulesTableHeaders(page);
    });
  });
});

async function getFirstGlobalRuleName(page) {
  const rules = await utils.getGlobalRouteRulesViaApi(page);
  const first = rules?.rules?.[0];
  return first?.name || null;
}

test.describe('路由管理 - RT-D-04 查看单条规则详情抽屉', () => {
  test('RT-D-04 查看单条规则详情抽屉', async ({ page }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.openGlobalRouteTableDetail(page);
    const ruleName = await getFirstGlobalRuleName(page);
    test.skip(!ruleName, 'Global 路由表暂无规则，跳过 RT-D-04');
    if (!ruleName) return;

    await utils.openViewRuleDrawer(page, ruleName);
    await expect(
      page.locator('.rule-view-panel .info-label').getByText('规则名'),
    ).toBeVisible();
    await expect(
      page.locator('.rule-view-panel .info-label').getByText('表达式'),
    ).toBeVisible();
    await expect(
      page.locator('.rule-view-panel .info-label').getByText('目标集群和模型'),
    ).toBeVisible();
  });
});

test.describe('路由管理 - RT-D-22 点击面包屑返回路由表列表', () => {
  test('RT-D-22 点击面包屑返回路由表列表', async ({ page }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.openGlobalRouteTableDetail(page);
    await page.locator('.bfe-breadcrumb').getByText('路由表').click();
    await utils.expectRouteTableListLayout(page);
  });
});

test.describe('路由管理 - RT-D-22b 点击返回按钮返回路由表列表', () => {
  test('RT-D-22b 点击右上角返回按钮返回路由表列表', async ({ page }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.openGlobalRouteTableDetail(page);
    await page.getByRole('button', { name: '返回' }).click();
    await utils.expectRouteTableListLayout(page);
  });
});

test.describe('路由管理 - RT-D-23 规则详情字段与接口数据一致', () => {
  test('RT-D-23 规则详情字段与接口数据一致', async ({ page }) => {
    const clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    const targetCluster = clusters[0];
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    const ruleName = 'rt_detail_check_' + Date.now();
    await utils.openAddRuleDrawer(page);
    await utils.fillRuleName(page, ruleName);
    await utils.fillRuleExpression(page, 'default_t()');
    await utils.selectRuleTargetCluster(page, 0, targetCluster.name);
    if (targetCluster.llm_config?.models?.length > 0) {
      await utils.selectRuleTargetModel(
        page,
        0,
        targetCluster.llm_config.models[0],
      );
    }
    await utils.fillRuleTargetWeight(page, 0, 100);
    await utils.submitRuleFormAndWait(page);
    await utils.submitGlobalRouteRulesAndWait(page);
    await utils.expectRouteRulesViewMode(page);

    await utils.expectRuleRowVisible(page, ruleName);
    const row = utils
      .routeRulesTable(page)
      .dataRows()
      .filter({ hasText: ruleName })
      .first();
    await expect(row).toContainText(targetCluster.name);
    // RT-D-23 补充：验证目标集群列 Tooltip + 省略号
    const targetCell = row
      .locator('.ivu-table-cell')
      .filter({ hasText: targetCluster.name })
      .first();
    // 验证存在 Tooltip 包裹
    await expect(targetCell.locator('.ivu-tooltip')).toBeVisible();
    await utils.openViewRuleDrawer(page, ruleName);
    await expect(
      page.locator('.rule-view-panel').getByText(ruleName),
    ).toBeVisible();
    await expect(
      page.locator('.rule-view-panel').getByText('default_t()'),
    ).toBeVisible();
    await expect(
      page.locator('.rule-view-panel').getByText(targetCluster.name),
    ).toBeVisible();

    await utils.closeTopDrawer(page);
    await utils.deleteRuleByNameAndSubmit(page, ruleName);
  });
});

test.describe('路由管理 - RT-D-24 编辑规则回显与接口数据一致', () => {
  test('RT-D-24 编辑规则回显与接口数据一致', async ({ page }) => {
    const clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    const ruleName = 'rt_echo_check_' + Date.now();
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
    await utils.submitGlobalRouteRulesAndWait(page);
    await utils.expectRouteRulesViewMode(page);
    await utils.enterRouteRulesEditMode(page);
    await utils.openEditRuleDrawer(page, ruleName);

    const nameInput = page.locator('.rule-form input').first();
    await expect(nameInput).toHaveValue(ruleName);
    const expressionTextarea = page
      .locator('.rule-form .expression.ivu-input-wrapper textarea')
      .first();
    await expect(expressionTextarea).toHaveValue('default_t()');
    await expect(page.locator('.rule-form')).toContainText(clusters[0].name);

    await utils.closeTopDrawer(page);
    await utils.deleteRuleByNameAndSubmit(page, ruleName);
  });
});

test.describe('路由管理 - RT-D-26 URL查询参数自动打开路由规则详情', () => {
  test.skip('RT-D-26 URL查询参数自动打开路由规则详情 (前端尚未实现 URL 查询参数自动打开详情功能)', async ({
    page,
  }) => {
    // 前置：获取一个 Entity 路由表的 owner id
    const cleanup = utils.createRouteLinkedTestCleanup();
    let entityId;
    let entityName;
    try {
      await utils.ensureRouteTableModuleAvailable(page);
      const resolved = await utils.resolveEntityRouteTableOwner(page, cleanup);
      entityId = resolved.ownerId;
      entityName = resolved.ownerName;
      // 直接访问带 query 参数的 URL
      await page.goto(
        page.url().split('#')[0] +
          '#/route-tables?type=entity&owner=' +
          entityId,
      );
      await page.waitForTimeout(2000);
      // 验证路由规则详情页自动打开
      await expect(page.locator('.route-rules')).toBeVisible({
        timeout: 15000,
      });
      // 验证面包屑显示详情页
      await expect(
        page.locator('.bfe-breadcrumb').getByText('Entity'),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await cleanup.cleanup(page);
    }
  });
});

/**
 * 路由管理 - RT-D-04b 规则详情 fallbacks 展示
 */

test.describe('路由管理 - RT-D-04b 规则详情 fallbacks 展示', () => {
  test.beforeEach(async ({ page }) => {
    await createFallbackTestCluster(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteFallbackTestCluster(page);
  });

  test('查看抽屉按接口顺序展示 fallbacks（含透传、无 weight）', async ({
    page,
  }) => {
    const ruleName = 'rt_d04b_fb_' + Date.now();

    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('创建含 2 个 fallback 的规则（一个带模型、一个透传）', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, RT_FALLBACK_CLUSTER_NAME);
      await utils.selectRuleTargetModel(page, 0, 'model-a');
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 0, RT_FALLBACK_CLUSTER_NAME);
      await utils.selectRuleFallbackModel(page, 0, 'model-b');
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 1, RT_FALLBACK_CLUSTER_NAME);
    });

    await test.step('本地保存并提交生效', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
      await utils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('查看抽屉 fallbacks 与接口顺序一致、无 weight', async () => {
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      const saved = rules.rules.find((r) => r.name === ruleName);
      expect(saved, '提交后未查到规则 ' + ruleName).toBeTruthy();
      expect(saved.fallbacks).toEqual([
        { cluster_name: RT_FALLBACK_CLUSTER_NAME, model: 'model-b' },
        { cluster_name: RT_FALLBACK_CLUSTER_NAME, model: '' },
      ]);
      const expectedTags = saved.fallbacks.map(
        (f) => `${f.cluster_name}/${f.model || ''}`,
      );
      await utils.openViewRuleDrawer(page, ruleName);
      await utils.expectRuleViewFallbackTags(page, expectedTags);
      // fallback 行无 weight：逐个 Tag 断言文本不含 %
      const viewTags = utils
        .ruleViewFallbackInfoRow(page)
        .locator('.info-value .ivu-tag');
      const viewTagCount = await viewTags.count();
      for (let i = 0; i < viewTagCount; i += 1) {
        await expect(viewTags.nth(i)).not.toContainText('%');
      }
    });

    await test.step('清理规则', async () => {
      await utils.closeTopDrawer(page);
      await utils.deleteRuleByNameAndSubmit(page, ruleName);
    });
  });
});

/**
 * 路由管理 - RT-D-09b 添加规则表单 fallbacks 配置区
 */

test.describe('路由管理 - RT-D-09b 添加规则表单 fallbacks 配置区', () => {
  test('添加抽屉 fallbacks 区结构：标题/占位/增行/无 weight', async ({
    page,
  }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('打开添加抽屉，fallbacks 区标题与空占位可见', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.expectRuleFallbackSectionTitleVisible(page);
      await utils.expectRuleFallbackRowCount(page, 0);
      await utils.expectNoFallbackPlaceholder(page);
    });

    await test.step('添加一行：cluster 下拉 + model 下拉，无 weight', async () => {
      await utils.addRuleFallbackRow(page);
      await utils.expectRuleFallbackRowCount(page, 1);
      await utils.expectRuleFallbackRowHasNoWeight(page);
      const row = page.locator('.rule-form .dynamic-row.fallback-row').first();
      await expect(
        row.getByPlaceholder('请选择目标集群（可输入集群名查找）'),
      ).toBeVisible();
      await expect(row.getByPlaceholder('留空表示透传')).toBeVisible();
      await expect(row.locator('.delete-btn').getByText('删除')).toBeVisible();
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeTopDrawer(page);
    });
  });
});

/**
 * 路由管理 - RT-D-10b 编辑规则 fallbacks 数据回显
 */

test.describe('路由管理 - RT-D-10b 编辑规则 fallbacks 数据回显', () => {
  test.beforeEach(async ({ page }) => {
    await createFallbackTestCluster(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteFallbackTestCluster(page);
  });

  test('编辑抽屉回显 fallbacks 行数与值（含透传、无 weight）', async ({
    page,
  }) => {
    const ruleName = 'rt_d10b_fb_' + Date.now();

    await test.step('前置：创建含 2 个 fallback 的规则并提交', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, RT_FALLBACK_CLUSTER_NAME);
      await utils.selectRuleTargetModel(page, 0, 'model-a');
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 0, RT_FALLBACK_CLUSTER_NAME);
      await utils.selectRuleFallbackModel(page, 0, 'model-b');
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 1, RT_FALLBACK_CLUSTER_NAME);
      await utils.submitRuleFormAndWait(page);
      await utils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('编辑抽屉回显 fallbacks 行数与接口一致', async () => {
      await utils.enterRouteRulesEditMode(page);
      await utils.openEditRuleDrawer(page, ruleName);
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      const saved = rules.rules.find((r) => r.name === ruleName);
      expect(saved?.fallbacks?.length).toBe(2);
      await utils.expectRuleFallbackRowCount(page, saved.fallbacks.length);
    });

    await test.step('每行 cluster/model 回显与接口一致（空 model 显示透传）', async () => {
      await utils.expectRuleFallbackRowValues(page, 0, {
        clusterName: RT_FALLBACK_CLUSTER_NAME,
        model: 'model-b',
      });
      await utils.expectRuleFallbackRowValues(page, 1, {
        clusterName: RT_FALLBACK_CLUSTER_NAME,
        model: '',
      });
      await utils.expectRuleFallbackRowHasNoWeight(page);
    });

    await test.step('清理规则', async () => {
      await utils.closeTopDrawer(page);
      await utils.deleteRuleByNameAndSubmit(page, ruleName);
    });
  });
});
