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
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const resourceApi = require('../../api/resource-api-utils');

const MULTI_MODEL_CLUSTER_NAME = 'test_multi_model_cluster_' + Date.now();
const SECOND_MODEL_CLUSTER_NAME = 'test_second_model_cluster_' + Date.now();

async function enterGlobalRuleEdit(page) {
  await utils.ensureRouteTableModuleAvailable(page);
  // 初始化测试数据：确保集群存在
  await resourceApi.initRouteTestData(page);
  await utils.ensureGlobalRouteTableDisabledViaUI(page);
  await utils.openGlobalRouteTableDetail(page);
  await utils.enterRouteRulesEditMode(page);
}

async function createMultiModelCluster(page) {
  const ok = await resourceApi.createClusterWithProvider(
    page,
    MULTI_MODEL_CLUSTER_NAME,
    ['model-a', 'model-b'],
  );
  if (!ok) {
    throw new Error('创建多模型测试集群失败: ' + MULTI_MODEL_CLUSTER_NAME);
  }
}

async function deleteMultiModelCluster(page) {
  await resourceApi.deleteCluster(page, MULTI_MODEL_CLUSTER_NAME);
}

async function createSecondModelCluster(page) {
  const ok = await resourceApi.createClusterWithProvider(
    page,
    SECOND_MODEL_CLUSTER_NAME,
    ['claude-3'],
  );
  if (!ok) {
    throw new Error('创建第二模型测试集群失败: ' + SECOND_MODEL_CLUSTER_NAME);
  }
}

async function deleteSecondModelCluster(page) {
  await resourceApi.deleteCluster(page, SECOND_MODEL_CLUSTER_NAME);
}

test.describe('路由管理 - RT-V-03-4 目标组合重复拦截', () => {
  test('同一规则内 targets 组合重复时本地保存被拦截', async ({ page }) => {
    let clusters;
    await test.step('前置：进入 Global 编辑模式', async () => {
      await enterGlobalRuleEdit(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
    });

    await test.step('添加两行相同 ClusterName+Model', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, 'rt_target_dup_' + Date.now());
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 50);
      await utils.addRuleTargetRow(page);
      await utils.selectRuleTargetCluster(page, 1, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 1, 50);
    });

    await test.step('本地保存应提示组合重复', async () => {
      await utils.submitRuleFormExpectLocalSaveMessage(
        page,
        utils.DOC_ROUTE_RULE_FORM.targetDuplicateMsg,
      );
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

test.describe('路由管理 - RT-V-03-3 同集群不同 Model 允许', () => {
  test.beforeEach(async ({ page }) => {
    await createMultiModelCluster(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteMultiModelCluster(page);
  });

  test('同一集群不同 Model 可本地保存成功', async ({ page }) => {
    let cluster;
    await test.step('前置：查找至少两个 Model 的集群', async () => {
      await enterGlobalRuleEdit(page);
      const clusters = await utils.getAvailableClustersForRule(page);
      cluster = utils.findClusterWithMultipleModels(clusters);
      expect(cluster, '需要至少一个集群配置两个 Model').toBeTruthy();
    });

    const ruleName = 'rt_same_cluster_models_' + Date.now();
    const [modelA, modelB] = cluster.llm_config.models;

    await test.step('添加两行同集群不同 Model', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, cluster.name);
      await utils.selectRuleTargetModel(page, 0, modelA);
      await utils.fillRuleTargetWeight(page, 0, 50);
      await utils.addRuleTargetRow(page);
      await utils.selectRuleTargetCluster(page, 1, cluster.name);
      await utils.selectRuleTargetModel(page, 1, modelB);
      await utils.fillRuleTargetWeight(page, 1, 50);
    });

    await test.step('本地保存成功', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });

    await test.step('清理规则', async () => {
      await utils.deleteRuleByNameAndSubmit(page, ruleName);
    });
  });
});

test.describe('路由管理 - RT-V-12-1 备用组合去重', () => {
  test('目标与备用同集群相同 Model 被拦截（RT-V-12-1 A）', async ({ page }) => {
    let cluster;
    await test.step('前置：查找可用集群', async () => {
      await enterGlobalRuleEdit(page);
      const clusters = await utils.getAvailableClustersForRule(page);
      cluster = clusters[0];
      expect(cluster, '需要至少一个集群').toBeTruthy();
    });

    const ruleName = 'rt_cross_list_same_key_' + Date.now();
    const [model] = cluster.llm_config.models;

    await test.step('目标与备用同 ClusterName+Model', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, cluster.name);
      await utils.selectRuleTargetModel(page, 0, model);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 0, cluster.name);
      await utils.selectRuleFallbackModel(page, 0, model);
    });

    // 修订说明（2026-08-17）：UI 为 targets ↔ fallbacks 跨列表合并去重（同键拦截，
    // route.clusterModelUsedInFallback / clusterModelUsedInTarget），不再允许跨列表同键保存
    await test.step('本地保存应被拦截（跨列表同键，抽屉保持打开）', async () => {
      await utils.submitRuleFormExpectLocalSaveMessage(page, '该组合已在');
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });

  // 验证：fallbacks 列表内只选集群不选模型时，集群重复也应被拦截
  test('fallbacks 内组合重复时本地保存被拦截（仅集群重复）', async ({
    page,
  }) => {
    let clusters;
    await test.step('前置：进入 Global 编辑模式', async () => {
      await enterGlobalRuleEdit(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length, '需要至少两个集群').toBeGreaterThanOrEqual(2);
    });

    await test.step('添加两行相同备用集群（不选模型）', async () => {
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, 'rt_fallback_dup_' + Date.now());
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 0, clusters[1].name);
      await utils.addRuleFallbackRow(page);
      await utils.selectRuleFallbackCluster(page, 1, clusters[1].name);
    });

    await test.step('本地保存应被拦截（抽屉保持打开）', async () => {
      await page
        .locator('.rule-form')
        .getByRole('button', {
          name: utils.DOC_ROUTE_RULE_FORM.localSaveButton,
        })
        .click();
      await page.waitForTimeout(1000);
      // 抽屉应保持打开状态（校验未通过）
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });

  test.describe('路由管理 - RT-V-12-1 需要多模型集群', () => {
    test.beforeEach(async ({ page }) => {
      await createMultiModelCluster(page);
    });

    test.afterEach(async ({ page }) => {
      await deleteMultiModelCluster(page);
    });

    // 验证：选择相同集群+相同模型时，前端应拦截
    test('fallbacks 内集群+模型组合重复时本地保存被拦截', async ({ page }) => {
      let cluster;
      await test.step('前置：查找至少两个 Model 的集群', async () => {
        await enterGlobalRuleEdit(page);
        const clusters = await utils.getAvailableClustersForRule(page);
        cluster = utils.findClusterWithMultipleModels(clusters);
        expect(cluster, '需要至少一个集群配置两个 Model').toBeTruthy();
      });

      const [modelA] = cluster.llm_config.models;

      await test.step('添加两行相同备用集群+相同模型', async () => {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, 'rt_fallback_dup_model_' + Date.now());
        await utils.fillRuleExpression(page, 'default_t()');
        await utils.selectRuleTargetCluster(page, 0, cluster.name);
        await utils.fillRuleTargetWeight(page, 0, 100);
        await utils.addRuleFallbackRow(page);
        await utils.selectRuleFallbackCluster(page, 0, cluster.name);
        await utils.selectRuleFallbackModel(page, 0, modelA);
        await utils.addRuleFallbackRow(page);
        await utils.selectRuleFallbackCluster(page, 1, cluster.name);
        await utils.selectRuleFallbackModel(page, 1, modelA);
      });

      await test.step('本地保存应提示备用组合重复', async () => {
        await utils.submitRuleFormExpectLocalSaveMessage(
          page,
          utils.DOC_ROUTE_RULE_FORM.fallbackDuplicateMsg,
        );
        await utils.expectRuleFormDrawerStillOpen(page);
      });
    });

    test('目标与备用同集群不同 Model 可本地保存成功', async ({ page }) => {
      let cluster;
      await test.step('前置：查找至少两个 Model 的集群', async () => {
        await enterGlobalRuleEdit(page);
        const clusters = await utils.getAvailableClustersForRule(page);
        cluster = utils.findClusterWithMultipleModels(clusters);
        expect(cluster, '需要至少一个集群配置两个 Model').toBeTruthy();
      });

      const ruleName = 'rt_target_fallback_models_' + Date.now();
      const [modelA, modelB] = cluster.llm_config.models;

      await test.step('目标与备用同集群不同 Model', async () => {
        await utils.openAddRuleDrawer(page);
        await utils.fillRuleName(page, ruleName);
        await utils.fillRuleExpression(page, 'default_t()');
        await utils.selectRuleTargetCluster(page, 0, cluster.name);
        await utils.selectRuleTargetModel(page, 0, modelA);
        await utils.fillRuleTargetWeight(page, 0, 100);
        await utils.addRuleFallbackRow(page);
        await utils.selectRuleFallbackCluster(page, 0, cluster.name);
        await utils.selectRuleFallbackModel(page, 0, modelB);
      });

      await test.step('本地保存成功', async () => {
        await utils.submitRuleFormAndWait(page);
        await utils.expectRuleFormDrawerHidden(page);
        await utils.expectRuleRowVisible(page, ruleName);
      });

      await test.step('清理规则', async () => {
        await utils.deleteRuleByNameAndSubmit(page, ruleName);
      });
    });
  });
});

test.describe('路由管理 - RT-V-03-2 目标集群 model 下拉联动', () => {
  test.beforeEach(async ({ page }) => {
    await createMultiModelCluster(page);
    await createSecondModelCluster(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteSecondModelCluster(page);
    await deleteMultiModelCluster(page);
  });

  test('model 下拉仅展示当前集群模型，切换集群同步更新，支持搜索', async ({
    page,
  }) => {
    let opened;
    await test.step('前置：进入 Global 编辑模式并打开添加抽屉', async () => {
      await enterGlobalRuleEdit(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, 'rt_v03_2_linked_' + Date.now());
      await utils.fillRuleExpression(page, 'default_t()');
    });

    await test.step('选择集群 A 后 model 下拉展示其模型列表', async () => {
      await utils.selectRuleTargetCluster(page, 0, MULTI_MODEL_CLUSTER_NAME);
      opened = await utils.openRuleTargetModelDropdown(page, 0);
      await utils.expectDropdownOptions(page, opened.dropdown, [
        'model-a',
        'model-b',
      ]);
    });

    await test.step('model 下拉支持输入搜索过滤', async () => {
      await utils.searchDropdownKeyword(page, opened.trigger, 'model-b');
      await utils.expectDropdownOptions(page, opened.dropdown, ['model-b']);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    await test.step('切换到集群 B 后 model 下拉同步更新', async () => {
      await utils.selectRuleTargetCluster(page, 0, SECOND_MODEL_CLUSTER_NAME);
      const openedB = await utils.openRuleTargetModelDropdown(page, 0);
      await utils.expectDropdownOptions(page, openedB.dropdown, ['claude-3']);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeTopDrawer(page);
    });
  });
});

test.describe('路由管理 - RT-V-12-2 fallbacks model 下拉联动', () => {
  test.beforeEach(async ({ page }) => {
    await createMultiModelCluster(page);
    await createSecondModelCluster(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteSecondModelCluster(page);
    await deleteMultiModelCluster(page);
  });

  test('fallbacks model 下拉按集群联动，未选集群时为空', async ({ page }) => {
    await test.step('前置：进入 Global 编辑模式并打开添加抽屉', async () => {
      await enterGlobalRuleEdit(page);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, 'rt_v12_2_fb_' + Date.now());
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, MULTI_MODEL_CLUSTER_NAME);
      await utils.fillRuleTargetWeight(page, 0, 100);
    });

    await test.step('未选 cluster 时 model 下拉为空', async () => {
      await utils.addRuleFallbackRow(page);
      const opened = await utils.openRuleFallbackModelDropdown(page, 0);
      await expect(opened.dropdown.locator('.ivu-select-item')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    await test.step('选择集群 A 后 model 下拉展示 A 的模型', async () => {
      await utils.selectRuleFallbackCluster(page, 0, MULTI_MODEL_CLUSTER_NAME);
      const openedA = await utils.openRuleFallbackModelDropdown(page, 0);
      await utils.expectDropdownOptions(page, openedA.dropdown, [
        'model-a',
        'model-b',
      ]);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    await test.step('切换集群 B 后 model 下拉同步更新', async () => {
      await utils.selectRuleFallbackCluster(page, 0, SECOND_MODEL_CLUSTER_NAME);
      const openedB = await utils.openRuleFallbackModelDropdown(page, 0);
      await utils.expectDropdownOptions(page, openedB.dropdown, ['claude-3']);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeTopDrawer(page);
    });
  });
});

test.describe('路由管理 - RT-V-12-3 fallbacks 空数组提交通过', () => {
  test('不添加 fallback 行，提交 payload 中 fallbacks 为 []', async ({
    page,
  }) => {
    const ruleName = 'rt_v12_3_empty_' + Date.now();
    await test.step('前置：进入 Global 编辑模式', async () => {
      await enterGlobalRuleEdit(page);
    });

    let clusters;
    await test.step('创建不带头 fallback 的规则并本地保存', async () => {
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length).toBeGreaterThan(0);
      await utils.openAddRuleDrawer(page);
      await utils.fillRuleName(page, ruleName);
      await utils.fillRuleExpression(page, 'default_t()');
      await utils.selectRuleTargetCluster(page, 0, clusters[0].name);
      await utils.fillRuleTargetWeight(page, 0, 100);
      await utils.expectNoFallbackPlaceholder(page);
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
    });

    await test.step('提交并抓包验证 fallbacks: []', async () => {
      let capturedPayload = null;
      const onRequest = (request) => {
        if (
          request.method() === 'PUT' &&
          request.url().includes('/global-route-rules')
        ) {
          try {
            const data = request.postDataJSON();
            if (data?.rules?.some((r) => r.name === ruleName)) {
              capturedPayload = data;
            }
          } catch (e) {
            // 忽略非 JSON payload
          }
        }
      };
      page.on('request', onRequest);
      await utils.submitGlobalRouteRulesAndWait(page);
      page.off('request', onRequest);
      expect(
        capturedPayload,
        '未捕获包含 ' + ruleName + ' 的提交 payload',
      ).toBeTruthy();
      const saved = capturedPayload.rules.find((r) => r.name === ruleName);
      expect(Array.isArray(saved.fallbacks)).toBe(true);
      expect(saved.fallbacks).toEqual([]);
    });

    await test.step('清理规则', async () => {
      await utils.deleteRuleByNameAndSubmit(page, ruleName);
    });
  });
});

test.describe('路由管理 - RT-V-12-4 fallbacks model 为空（透传）合法', () => {
  test('fallback 选集群留空 model 保存成功，接口 model 为空串且查看显示透传', async ({
    page,
  }) => {
    const ruleName = 'rt_v12_4_pass_' + Date.now();
    let clusters;
    await test.step('前置：进入 Global 编辑模式', async () => {
      await enterGlobalRuleEdit(page);
      clusters = await utils.getAvailableClustersForRule(page);
      expect(clusters.length).toBeGreaterThanOrEqual(2);
    });

    await test.step('创建规则：target 带模型，fallback 选集群留空 model', async () => {
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
      await utils.addRuleFallbackRow(page);
      // 备用集群与目标集群不同，model 留空（透传）
      await utils.selectRuleFallbackCluster(page, 0, clusters[1].name);
    });

    await test.step('本地保存成功并提交', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerHidden(page);
      await utils.expectRuleRowVisible(page, ruleName);
      await utils.submitGlobalRouteRulesAndWait(page);
    });

    await test.step('接口中该 fallback 的 model 为空字符串', async () => {
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      const saved = rules.rules.find((r) => r.name === ruleName);
      expect(saved?.fallbacks).toEqual([
        { cluster_name: clusters[1].name, model: '' },
      ]);
    });

    await test.step('查看抽屉 model 位置显示透传占位', async () => {
      await utils.openViewRuleDrawer(page, ruleName);
      await utils.expectRuleViewFallbackTags(page, [clusters[1].name + '/']);
    });

    await test.step('清理规则', async () => {
      await utils.closeTopDrawer(page);
      await utils.deleteRuleByNameAndSubmit(page, ruleName);
    });
  });
});

test.describe('路由管理 - RT-V-12-5 fallbacks 添加/删除行交互', () => {
  test('fallbacks 行可连续添加/删除，无 weight，删除全部恢复占位', async ({
    page,
  }) => {
    await test.step('前置：进入 Global 编辑模式并打开添加抽屉', async () => {
      await enterGlobalRuleEdit(page);
      await utils.openAddRuleDrawer(page);
    });

    await test.step('初始无行时显示占位', async () => {
      await utils.expectRuleFallbackRowCount(page, 0);
      await utils.expectNoFallbackPlaceholder(page);
    });

    await test.step('连续添加 4 行，每行无 weight 字段', async () => {
      await utils.addRuleFallbackRow(page);
      await utils.addRuleFallbackRow(page);
      await utils.addRuleFallbackRow(page);
      await utils.addRuleFallbackRow(page);
      await utils.expectRuleFallbackRowCount(page, 4);
      await utils.expectRuleFallbackRowHasNoWeight(page);
    });

    await test.step('删除第 2 行后剩余 3 行', async () => {
      await utils.deleteRuleFallbackRow(page, 1);
      await utils.expectRuleFallbackRowCount(page, 3);
    });

    await test.step('删除全部行后恢复占位', async () => {
      await utils.deleteRuleFallbackRow(page, 0);
      await utils.deleteRuleFallbackRow(page, 0);
      await utils.deleteRuleFallbackRow(page, 0);
      await utils.expectRuleFallbackRowCount(page, 0);
      await utils.expectNoFallbackPlaceholder(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeTopDrawer(page);
    });
  });
});
