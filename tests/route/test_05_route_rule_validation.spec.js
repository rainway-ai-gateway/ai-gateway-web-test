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
 * 路由管理 - route rule validation
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const common = require('../../utils/common');
const resourceApi = require('../../api/resource-api-utils');

/**
 * 路由管理 - RT-V-01 规则名称必填
 */

test.describe('路由管理 - RT-V-01 规则名称必填', () => {
  test('验证规则名称为空时本地保存被拦截', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('打开添加规则抽屉', async () => {
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写表达式但清空规则名称', async () => {
      await utils.fillRuleName(page, '');
      await utils.fillRuleExpression(page, 'default_t()');
    });

    await test.step('点击本地保存', async () => {
      await utils.submitRuleFormAndWait(page);
    });

    await test.step('验证规则名称错误提示与抽屉未关闭', async () => {
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.ruleNameFieldLabel,
        utils.DOC_ROUTE_RULE_FORM.ruleNameRequiredMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

/**
 * 路由管理 - RT-V-02 表达式必填
 */

test.describe('路由管理 - RT-V-02 表达式必填', () => {
  test('验证表达式为空时本地保存被拦截', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('打开添加规则抽屉', async () => {
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写规则名称但清空表达式', async () => {
      await utils.fillRuleName(page, 'rt_rule_expr_empty');
      await utils.fillRuleExpression(page, '');
    });

    await test.step('点击本地保存', async () => {
      await utils.submitRuleFormAndWait(page);
    });

    await test.step('验证表达式错误提示与抽屉未关闭', async () => {
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.expressionFieldLabel,
        utils.DOC_ROUTE_RULE_FORM.condRequiredMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

/**
 * 路由管理 - RT-V-03 目标集群必填
 */

test.describe('路由管理 - RT-V-03 目标集群必填', () => {
  test('验证目标集群未选择时本地保存被拦截', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('打开添加规则抽屉', async () => {
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写规则名称、表达式、权重，但不选目标集群', async () => {
      await utils.fillRuleName(page, 'rt_rule_target_empty');
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.fillRuleTargetWeight(page, 0, 100);
    });

    await test.step('点击本地保存', async () => {
      await utils.submitRuleFormAndWait(page);
    });

    await test.step('验证目标集群错误提示与抽屉未关闭', async () => {
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.clusterFieldLabel,
        utils.DOC_ROUTE_RULE_FORM.targetClusterRequiredMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

/**
 * 路由管理 - RT-V-05 权重和必须等于 100
 */

const TEST_CLUSTER_NAME = 'test_weight_cluster_' + Date.now();

async function ensureTwoClusters(page) {
  let clusters = await utils.getAvailableClustersForRule(page);
  if (clusters.length >= 2) {
    return clusters;
  }
  // 尝试创建第二个测试集群
  const ok = await resourceApi.createClusterWithProvider(
    page,
    TEST_CLUSTER_NAME,
    ['test-model'],
  );
  if (!ok) {
    common.log('创建测试集群失败，跳过测试');
    test.skip();
    return [];
  }
  // 等待集群创建生效
  await page.waitForTimeout(2000);
  return await utils.getAvailableClustersForRule(page);
}

test.describe('路由管理 - RT-V-05 权重和必须等于100', () => {
  test('验证权重和不等于100时本地保存被拦截', async ({ page }) => {
    let clusters;

    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('确保至少有两个可用集群', async () => {
      clusters = await ensureTwoClusters(page);
      common.log('可用集群：' + clusters.map((c) => c.name).join(', '));
      expect(clusters.length, '无可用集群').toBeGreaterThanOrEqual(2);
    });

    await test.step('打开添加规则抽屉', async () => {
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写规则名称与表达式', async () => {
      await utils.fillRuleName(page, 'rt_rule_weight_sum');
      await utils.fillRuleExpression(page, 'default_t()');
    });

    await test.step('设置两个目标集群权重和为 80', async () => {
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 30);
      await utils.addRuleTargetRow(page);
      await utils.selectRuleTargetCluster(page, 1, clusters[1].name);
      await utils.fillRuleTargetWeight(page, 1, 50);
    });

    await test.step('点击本地保存', async () => {
      await utils.submitRuleFormAndWait(page);
    });

    await test.step('验证权重和错误提示与抽屉未关闭', async () => {
      await expect(page.locator('.rule-form .weight-error')).toContainText(
        utils.getWeightSumErrorMessage(80),
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

/**
 * 路由管理 - RT-V-10 表达式非法语法（含 RT-V-11 非法语法）
 */

test.describe('路由管理 - RT-V-10 表达式非法语法', () => {
  test('验证非法表达式无法本地保存', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
    });

    await test.step('打开添加规则抽屉', async () => {
      await utils.openAddRuleDrawer(page);
    });

    await test.step('填写规则名称与非法表达式', async () => {
      await utils.fillRuleName(page, 'rt_rule_invalid_expr');
      await utils.fillRuleExpression(page, 'default_t(');
    });

    await test.step('等待表达式校验（通过表单提交触发）', async () => {
      // 表达式校验结果存储在 formData.condErrmsg 中，不直接显示在 UI
      // 提交时校验失败会阻止表单提交，抽屉不会关闭
    });

    await test.step('点击本地保存，抽屉不关闭', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

/**
 * 路由管理 - RT-V-04 权重范围校验
 */

test.describe('路由管理 - RT-V-04 权重范围校验', () => {
  let clusters;

  test('权重 -1 与 101 均被拦截', async ({ page }) => {
    await test.step('前置：进入 Global 编辑模式并获取集群', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    });

    await test.step('1. 打开抽屉填写基础信息', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, 'rt_weight_range_' + Date.now());
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
    });

    await test.step('2. 权重 -1 触发校验失败', async () => {
      await utils.fillRuleTargetWeight(page, 0, -1);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.weightFieldLabel,
        utils.DOC_ROUTE_RULE_FORM.weightRangeErrorMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });

    await test.step('3. 权重 101 触发校验失败', async () => {
      await utils.fillRuleTargetWeight(page, 0, 101);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.weightFieldLabel,
        utils.DOC_ROUTE_RULE_FORM.weightRangeErrorMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

/**
 * 路由管理 - RT-V-12 备用集群 ClusterName 必填
 */

test.describe('路由管理 - RT-V-12 备用集群 ClusterName 必填', () => {
  let clusters;
  let ruleName;

  test('添加备用集群但不选择 ClusterName，本地保存被前端校验拦截', async ({
    page,
  }) => {
    await test.step('前置：进入 Global 编辑模式并获取集群', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      ruleName = 'rt_fallback_req_' + Date.now();
    });

    await test.step('1. 添加规则并添加备用集群行（留空），前端拦截本地保存', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.addRuleFallbackRow(page);
      await utils.submitRuleFormAndWait(page);
      // 前端已做「备用集群不能为空」校验，本地保存被拦截 → 抽屉不应关闭
      await utils.expectRuleFormDrawerStillOpen(page);
      // 目标集群已选中，错误提示「集群不能为空」出现在备用集群行
      await expect(
        page.locator('.rule-form').getByText('集群不能为空'),
      ).toBeVisible();
    });
  });
});

/**
 * 路由管理 - RT-V-14 规则名称长度边界（已实现，2026-08-05）
 */

async function prepareEditModeAndClusters(page) {
  await utils.ensureRouteTableModuleAvailable(page);
  // 初始化测试数据：确保集群和路由规则存在
  await resourceApi.initRouteTestData(page);
  await utils.openGlobalRouteTableDetail(page);
  await utils.ensureGlobalRouteTableDisabledViaUI(page);
  await utils.openGlobalRouteTableDetail(page);
  await utils.enterRouteRulesEditMode(page);
  await utils.expectRouteRulesEditMode(page);
  const clusters = await utils.getAvailableClustersForRule(page);
  expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
  return clusters;
}

async function fillRuleCommonFields(page, name, clusters) {
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
}

test.describe('路由管理 - RT-V-14 规则名称长度边界', () => {
  let clusters;

  test.beforeEach(async ({ page }) => {
    clusters = await prepareEditModeAndClusters(page);
  });

  test('1 个字符的规则名称本地保存成功', async ({ page }) => {
    const name = 'a';
    await utils.openAddRuleDrawer(page);
    await fillRuleCommonFields(page, name, clusters);
    await utils.submitRuleFormAndWait(page);
    await utils.expectRuleFormDrawerHidden(page);
    await utils.expectRuleRowVisible(page, name);
  });

  test('64 个字符的规则名称本地保存成功', async ({ page }) => {
    const name = 'a'.repeat(64);
    await utils.openAddRuleDrawer(page);
    await fillRuleCommonFields(page, name, clusters);
    await utils.submitRuleFormAndWait(page);
    await utils.expectRuleFormDrawerHidden(page);
    await utils.expectRuleRowVisible(page, name);
  });

  test('65 个字符的规则名称本地保存应被拦截', async ({ page }) => {
    const name = 'a'.repeat(65);
    await utils.openAddRuleDrawer(page);
    await fillRuleCommonFields(page, name, clusters);
    await utils.submitRuleFormAndWait(page);
    await utils.expectRuleFormError(
      page,
      utils.DOC_ROUTE_RULE_FORM.ruleNameFieldLabel,
      '规则名称长度为 1–64 个字符',
    );
    await utils.expectRuleFormDrawerStillOpen(page);
  });
});

/**
 * 路由管理 - RT-V-15 规则名称字符集限制（已实现，2026-08-05）
 */

test.describe('路由管理 - RT-V-15 规则名称字符集限制', () => {
  const invalidNames = [
    'rule name', // 空格
    'rule@name', // @
    '规则名', // 中文
    'rule#1', // #
    'rule/name', // /
  ];

  test('非法字符集规则名称本地保存应被拦截', async ({ page }) => {
    const clusters = await prepareEditModeAndClusters(page);
    for (const name of invalidNames) {
      await utils.openAddRuleDrawer(page);
      await fillRuleCommonFields(page, name, clusters);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.ruleNameFieldLabel,
        '规则名称仅允许字母、数字、-、_、.，且不允许以 -、_、. 开头或结尾',
      );
      await utils.expectRuleFormDrawerStillOpen(page);
      // 关闭当前抽屉，准备测试下一条数据
      await utils.closeTopDrawer(page);
    }
  });
});

/**
 * 路由管理 - RT-V-16 规则名称首尾字符限制（已实现，2026-08-05）
 */

test.describe('路由管理 - RT-V-16 规则名称首尾字符限制', () => {
  const invalidNames = [
    '-global-rule',
    'global-rule-',
    '_rule',
    'rule_',
    '.rule',
    'rule.',
  ];

  test('以 -、_、. 开头或结尾的规则名称本地保存应被拦截', async ({ page }) => {
    const clusters = await prepareEditModeAndClusters(page);
    for (const name of invalidNames) {
      await utils.openAddRuleDrawer(page);
      await fillRuleCommonFields(page, name, clusters);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.ruleNameFieldLabel,
        '规则名称仅允许字母、数字、-、_、.，且不允许以 -、_、. 开头或结尾',
      );
      await utils.expectRuleFormDrawerStillOpen(page);
      await utils.closeTopDrawer(page);
    }
  });
});

/**
 * 路由管理 - RT-V-10 表达式合法语法
 */

const VALID_EXPR = 'default_t()';

test.describe('路由管理 - RT-V-10 表达式合法语法', () => {
  let clusters;
  let ruleName = null;

  test('验证合法表达式可本地保存并出现在规则表格', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
    });

    await test.step('获取可用集群', async () => {
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('打开添加规则抽屉并填写合法表达式', async () => {
      ruleName = 'rt_valid_expr_' + Date.now();
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, VALID_EXPR);
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

    await test.step('本地保存成功，抽屉关闭且规则可见', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });
  });
});

/**
 * 路由管理 - RT-V-13 规则名称重复（同路由表内唯一）
 */

test.describe('路由管理 - RT-V-13 规则名称重复', () => {
  let clusters;
  let duplicateName;

  test('同一 Global 路由表提交两条同名规则，后端校验失败', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      duplicateName = 'rt_dup_v13_' + Date.now();
    });

    await test.step('1. 添加两条同名规则', async () => {
      for (let i = 0; i < 2; i++) {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, duplicateName);
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
      const rows = utils.routeRulesTable(page).dataRows();
      await expect(rows.filter({ hasText: duplicateName })).toHaveCount(2);
    });

    await test.step('2. 提交并生效，预期后端校验失败', async () => {
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

/**
 * 路由管理 - RT-V-06 权重和等于 100 通过
 */

test.describe('路由管理 - RT-V-06 权重和等于 100 通过', () => {
  let clusters;
  let ruleName = null;

  test('两个目标权重 30+70 本地保存成功', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await resourceApi.initRouteTestData(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('添加两个目标，权重分别为 30 和 70', async () => {
      ruleName = 'rt_weight_sum_100_' + Date.now();
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
      await utils.fillRuleTargetWeight(page, 0, 30);

      await utils.addRuleTargetRow(page);
      await utils.selectRuleTargetCluster(
        page,
        1,
        clusters[1]?.name || clusters[0].name,
      );
      const cluster1 = clusters[1] || clusters[0];
      // 使用不同模型避免"目标组合重复"校验失败
      const modelIndex = clusters[1]
        ? 0
        : cluster1.llm_config?.models?.length > 1
          ? 1
          : 0;
      if (cluster1.llm_config?.models?.length > 0) {
        await utils.selectRuleTargetModel(
          page,
          1,
          cluster1.llm_config.models[modelIndex],
        );
      }
      await utils.fillRuleTargetWeight(page, 1, 70);
    });

    await test.step('本地保存成功，抽屉关闭且规则可见', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });
  });
});

/**
 * 路由管理 - RT-V-07 备用集群可选
 */

test.describe('路由管理 - RT-V-07 备用集群可选', () => {
  let clusters;
  let ruleName = null;

  test('不填写备用集群时规则可本地保存', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('填写规则名称、表达式、目标集群，不填备用集群', async () => {
      ruleName = 'rt_no_fallback_' + Date.now();
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
      await utils.expectNoFallbackPlaceholder(page);
    });

    await test.step('本地保存成功，抽屉关闭且规则可见', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });
  });
});

/**
 * 路由管理 - RT-V-08 添加/删除目标集群 + 下拉搜索
 */

test.describe('路由管理 - RT-V-08 添加/删除目标集群', () => {
  let clusters;

  test('目标集群行可增删，最后一条删除后表单校验失败', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('打开添加规则抽屉，默认已有 1 个目标行', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.expectRuleTargetRowCount(page, 1);
    });

    await test.step('添加目标行，再删除新增的目标行', async () => {
      await utils.addRuleTargetRow(page);
      await utils.expectRuleTargetRowCount(page, 2);
      await utils.deleteRuleTargetRow(page, 1);
      await utils.expectRuleTargetRowCount(page, 1);
    });

    await test.step('仅剩一条目标行时删除按钮不可见，保存无集群行被拦截', async () => {
      const remainingRow = page
        .locator('.rule-form')
        .locator('.dynamic-row.target-row')
        .filter({
          has: page.getByPlaceholder('请选择目标集群（可输入集群名查找）'),
        })
        .first();
      await expect(
        remainingRow.locator('.delete-btn').getByText('删除'),
      ).not.toBeVisible();
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormError(
        page,
        utils.DOC_ROUTE_RULE_FORM.clusterFieldLabel,
        utils.DOC_ROUTE_RULE_FORM.targetClusterRequiredMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });

  test('目标集群下拉支持输入关键词搜索并选择', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('通过关键词搜索并选择目标集群', async () => {
      await utils.openAddRuleDrawer(page);
      const keyword = clusters[0].name.slice(0, 3);
      await utils.searchAndSelectRuleTargetCluster(
        page,
        0,
        keyword,
        clusters[0].name,
      );
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.fillRuleName(page, 'rt_target_search_' + Date.now());
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
    });
  });
});

/**
 * 路由管理 - RT-V-09 添加/删除备用集群
 */

test.describe('路由管理 - RT-V-09 添加/删除备用集群', () => {
  let clusters;

  test('备用集群行可增删，无备用时显示占位', async ({ page }) => {
    await test.step('进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      await utils.expectRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
    });

    await test.step('打开添加规则抽屉，默认无备用集群占位', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.expectNoFallbackPlaceholder(page);
      await utils.expectRuleFallbackRowCount(page, 0);
    });

    await test.step('添加两条备用集群行', async () => {
      await utils.addRuleFallbackRow(page);
      await utils.addRuleFallbackRow(page);
      await utils.expectRuleFallbackRowCount(page, 2);
    });

    await test.step('依次删除备用集群行，回到无备用状态', async () => {
      await utils.deleteRuleFallbackRow(page, 1);
      await utils.expectRuleFallbackRowCount(page, 1);
      await utils.deleteRuleFallbackRow(page, 0);
      await utils.expectRuleFallbackRowCount(page, 0);
      await utils.expectNoFallbackPlaceholder(page);
    });
  });
});

/**
 * 路由管理 - RT-V-17 规则名称合法格式通过
 */

test.describe('路由管理 - RT-V-17 规则名称合法格式通过', () => {
  let clusters;

  const validNames = [
    { name: 'a', desc: '最短合法名称' },
    { name: 'global-rule-01', desc: '常见命名' },
    { name: 'rule.name_v1', desc: '含 . 与 _' },
    { name: 'a'.repeat(64), desc: '最长合法名称' },
  ];

  test.beforeEach(async ({ page }) => {
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.ensureGlobalRouteTableDisabledViaUI(page);
    await utils.openGlobalRouteTableDetail(page);
    await utils.enterRouteRulesEditMode(page);
    await utils.expectRouteRulesEditMode(page);
    clusters = await utils.getAvailableClustersForRule(page);
    expect(clusters.length, '环境中无可用集群').toBeGreaterThan(0);
  });

  for (const { name, desc } of validNames) {
    test(`${desc} "${name.slice(0, 10)}${name.length > 10 ? '...' : ''}" 可本地保存`, async ({
      page,
    }) => {
      const suffix = '_' + Date.now();
      const ruleName = name.length + suffix.length <= 64 ? name + suffix : name;
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
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });
  }
});

/**
 * 路由管理 - RT-V-13a 同名规则组内唯一（提交时后端拦截）
 * 与 RT-V-13 语义一致，独立编号用例：编辑模式下本地保存两条同名规则后提交
 */

test.describe('路由管理 - RT-V-13a 同名规则提交后端拦截', () => {
  let clusters;
  let duplicateName;

  test('本地保存两条同名规则后提交，后端拦截 ruleNameDuplicate', async ({
    page,
  }) => {
    await test.step('前置：进入 Global 路由表编辑模式', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.enterRouteRulesEditMode(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      duplicateName = 'rt_dup_v13a_' + Date.now();
    });

    await test.step('本地保存两条同名规则', async () => {
      for (let i = 0; i < 2; i++) {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, duplicateName);
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
      const rows = utils
        .routeRulesTable(page)
        .dataRows()
        .filter({ hasText: duplicateName });
      await expect(rows).toHaveCount(2);
    });

    await test.step('提交并生效，预期后端校验失败', async () => {
      await page
        .getByRole('button', { name: utils.DOC_ROUTE_TABLE.submitAndEffect })
        .click();
      await page.waitForTimeout(2000);
      // 拦截后仍停留在编辑模式并提示规则名重复
      await utils.expectRouteRulesEditMode(page);
      await utils.expectRouteRulesSubmitError(page, /duplicate|重复|参数非法/);
    });

    await test.step('清理所有同名规则', async () => {
      await utils.deleteAllRulesByName(page, duplicateName);
      await utils.submitGlobalRouteRulesAndWait(page);
    });
  });
});
