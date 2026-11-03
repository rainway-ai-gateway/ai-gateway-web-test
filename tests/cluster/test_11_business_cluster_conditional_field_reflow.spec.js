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
 * AI业务集群 - 大模型配置条件项隐藏后自动补位（RM-BC-123）
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02d-大模型与校验.md §2.123）：
 * - 预期 1：affinity=off 且会话亲和关闭时，「前缀缓存亲和性」「会话亲和性」
 *   「会话亲和性 Header」均不渲染（DOM 无节点、无占位空元素）
 * - 预期 2：网格可见项顺序为 实例负载画像 → 亲和强度 → KV 缓存利用率上限 →
 *   排队长度过滤阈值 → 执行中请求数过滤阈值 → 无端点时回退派发 → 指标失效剔除阈值（ms）
 *   （2026-11-02 起「在飞请求数过滤阈值」更名，见 RM-BC-105/RM-BC-124）
 * - 预期 3：每行两项、每项 50% 宽；无「左空白 + 右单项」半行、无整行拉伸、无占位元素
 * - 预期 4：切为 low / medium / high 后两个亲和开关回到第二行两格，KV 顺延第三行左格
 * - 预期 5：会话亲和开启时 Header 出现在 KV 右侧同一行，关闭后排队长度过滤阈值补位
 * - 预期 6：任何显隐组合下都不出现「off 时不生效」类提示/后缀
 * - 预期 7、8：隐藏期间字段值休眠保留、提交体不丢值
 * - 预期 9：Header 字段级条件必填在 off 时跳过（提交路径的完整结论见 RM-BC-98
 *   的独立用例与 docs/business-cluster/测试问题复盘.md BUG-BC-03）
 *
 * 断言依据：`.llm-form-grid`（display:flex; flex-wrap:wrap，`.llm-form-grid-item` 宽 50%），
 * 同排判定取 getBoundingClientRect 的 top 坐标（pages/resource/BusinessClusterPage.js
 * 的 getLlmFormGridLayout / expectLlmFormGridNoBlankBlock）。
 *
 * 造数：API 创建服务商（provider_<ts>），afterEach 清理集群与服务商。
 *
 * 运行：npx playwright test tests/cluster/test_11_business_cluster_conditional_field_reflow.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const DOC = utils.DOC_BUSINESS_CLUSTER;
const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-条件项补位',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_A1],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

async function openModelStep(page, clusterName) {
  await utils.openCreateBusinessClusterDrawer(page);
  await utils.navigateToModelStep(page, clusterName);
}

async function fillProviderAndModels(page, providerName) {
  await utils.selectProvider(page, providerName);
  await utils.selectForwardModels(page, [MODEL_A1]);
}

function labelsOf(layout) {
  return layout.items.map((item) => item.label);
}

test.describe('AI业务集群 - RM-BC-123 大模型配置条件项隐藏后自动补位（无空白块）', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    // 先删集群再删服务商：集群仍引用 provider 时删除会 409
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('验证 affinity=off 时三个条件项不渲染、后续项自动补位且无 off 提示', async ({ page }) => {
    test.setTimeout(180000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await openModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);
    const grid = utils.eppConfigGrid(page);

    await test.step('1. affinity=medium、会话亲和关闭：9 项两列排布，每项 50% 宽且无空白块', async () => {
      const layout = await utils.expectLlmFormGridNoBlankBlock(
        grid,
        '均衡模式配置 EPP 网格（medium）',
      );
      expect(labelsOf(layout)).toEqual([
        DOC.schedulingProfileLabel,
        DOC.cacheAffinityLabel,
        DOC.prefixCacheAffinityLabel,
        DOC.sessionAffinityEnabledLabel,
        DOC.kvCacheUtilizationMaxLabel,
        DOC.waitingQueueMaxLabel,
        DOC.runningRequestsMaxLabel,
        DOC.fallbackOnEmptyLabel,
        DOC.metricsStalenessThresholdMsLabel,
      ]);
      expect(layout.rows).toEqual([
        [DOC.schedulingProfileLabel, DOC.cacheAffinityLabel],
        [DOC.prefixCacheAffinityLabel, DOC.sessionAffinityEnabledLabel],
        [DOC.kvCacheUtilizationMaxLabel, DOC.waitingQueueMaxLabel],
        [DOC.runningRequestsMaxLabel, DOC.fallbackOnEmptyLabel],
        [DOC.metricsStalenessThresholdMsLabel],
      ]);
    });

    await test.step('2. affinity=off：三项不渲染，可见项顺序与第二行排布符合预期（无补位空块）', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });

      // 预期 1：三项均不渲染（DOM 无节点）
      await utils.expectEppGridFieldHidden(page, DOC.prefixCacheAffinityLabel);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityEnabledLabel);
      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);

      // 预期 2 + 3：7 项顺次补位，第二行为 KV | 排队长度过滤阈值
      const layout = await utils.expectLlmFormGridNoBlankBlock(
        grid,
        '均衡模式配置 EPP 网格（off）',
      );
      expect(labelsOf(layout)).toEqual([
        DOC.schedulingProfileLabel,
        DOC.cacheAffinityLabel,
        DOC.kvCacheUtilizationMaxLabel,
        DOC.waitingQueueMaxLabel,
        DOC.runningRequestsMaxLabel,
        DOC.fallbackOnEmptyLabel,
        DOC.metricsStalenessThresholdMsLabel,
      ]);
      expect(layout.rows).toEqual([
        [DOC.schedulingProfileLabel, DOC.cacheAffinityLabel],
        [DOC.kvCacheUtilizationMaxLabel, DOC.waitingQueueMaxLabel],
        [DOC.runningRequestsMaxLabel, DOC.fallbackOnEmptyLabel],
        [DOC.metricsStalenessThresholdMsLabel],
      ]);

      // 预期 6：无「off 时不生效」后缀与提示
      await utils.expectNoAffinityOffHint(page);
    });

    await test.step('3. 其余区块同口径回归：Key 亲和性网格条件项隐藏后仅剩 1 项且不被拉伸', async () => {
      const keyGrid = utils.llmFormGrid(page, DOC.keyAffinityCard);

      let layout = await utils.expectLlmFormGridNoBlankBlock(
        keyGrid,
        'Key 亲和性网格（启用）',
      );
      expect(labelsOf(layout)).toEqual([
        DOC.keyAffinityEnabledLabel,
        DOC.keyAffinityRedisPrefixLabel,
        DOC.keyAffinityTtlLabel,
        DOC.keyAffinityPenaltyLabel,
      ]);

      await utils.fillKeyAffinityStep(page, { enabled: false });
      layout = await utils.expectLlmFormGridNoBlankBlock(
        keyGrid,
        'Key 亲和性网格（停用）',
      );
      expect(labelsOf(layout), '停用后三个条件项不渲染，仅剩「是否启用」').toEqual([
        DOC.keyAffinityEnabledLabel,
      ]);
      expect(layout.rows).toEqual([[DOC.keyAffinityEnabledLabel]]);

      await utils.fillKeyAffinityStep(page, { enabled: true });
      layout = await utils.expectLlmFormGridNoBlankBlock(
        keyGrid,
        'Key 亲和性网格（重新启用）',
      );
      expect(labelsOf(layout)).toHaveLength(4);
    });
  });

  test('验证 low/medium/high 下条件项回归排布与会话亲和 Header 的同行补位', async ({ page }) => {
    test.setTimeout(180000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await openModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);
    const grid = utils.eppConfigGrid(page);

    await test.step('1. 由 off 切为 low/medium/high：两个亲和开关回到第二行两格，KV 顺延第三行左格', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });
      expect(labelsOf(await utils.getEppGridLayout(page))).not.toContain(
        DOC.prefixCacheAffinityLabel,
      );

      for (const mode of ['low', 'medium', 'high']) {
        await utils.fillEppConfig(page, { cacheAffinity: mode });

        const layout = await utils.expectLlmFormGridNoBlankBlock(
          grid,
          `均衡模式配置 EPP 网格（${mode}）`,
        );
        expect(labelsOf(layout), `affinity=${mode} 时条件项应回归`).toEqual([
          DOC.schedulingProfileLabel,
          DOC.cacheAffinityLabel,
          DOC.prefixCacheAffinityLabel,
          DOC.sessionAffinityEnabledLabel,
          DOC.kvCacheUtilizationMaxLabel,
          DOC.waitingQueueMaxLabel,
          DOC.runningRequestsMaxLabel,
          DOC.fallbackOnEmptyLabel,
          DOC.metricsStalenessThresholdMsLabel,
        ]);
        expect(layout.rows[1], `affinity=${mode} 第二行应为两个亲和开关`).toEqual([
          DOC.prefixCacheAffinityLabel,
          DOC.sessionAffinityEnabledLabel,
        ]);
        expect(layout.rows[2], `affinity=${mode} 第三行左格应为 KV 缓存利用率上限`).toEqual([
          DOC.kvCacheUtilizationMaxLabel,
          DOC.waitingQueueMaxLabel,
        ]);
      }
    });

    await test.step('2. 会话亲和开启：Header 出现在 KV 缓存利用率上限右侧同一行（第三行右格）', async () => {
      await utils.fillEppConfig(page, { sessionAffinityEnabled: true });

      const layout = await utils.expectLlmFormGridNoBlankBlock(
        grid,
        '均衡模式配置 EPP 网格（HEADER 显示）',
      );
      expect(layout.rows[2]).toEqual([
        DOC.kvCacheUtilizationMaxLabel,
        DOC.sessionAffinityHeaderLabel,
      ]);
      expect(layout.rows).toHaveLength(5);
    });

    await test.step('3. 关闭会话亲和：Header 消失，排队长度过滤阈值补到 KV 右侧', async () => {
      await utils.fillEppConfig(page, { sessionAffinityEnabled: false });

      await utils.expectEppGridFieldHidden(page, DOC.sessionAffinityHeaderLabel);
      const layout = await utils.expectLlmFormGridNoBlankBlock(
        grid,
        '均衡模式配置 EPP 网格（HEADER 隐藏）',
      );
      expect(layout.rows[2]).toEqual([
        DOC.kvCacheUtilizationMaxLabel,
        DOC.waitingQueueMaxLabel,
      ]);
    });
  });

  test('验证 off↔medium 往复切换时隐藏字段值休眠保留且提交体不丢值', async ({ page }) => {
    test.setTimeout(180000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    await openModelStep(page, clusterName);
    await utils.setBalanceMode(page, 'EPP');
    await fillProviderAndModels(page, providerName);

    await test.step('1. medium 下填写前缀缓存亲和性=false、会话亲和=开启 + Header', async () => {
      await utils.fillEppConfig(page, { prefixCacheAffinity: false });
      await utils.fillEppConfig(page, { sessionAffinityEnabled: true });
      await utils.fillEppConfig(page, { sessionAffinityHeader: 'x-reflow-sleep' });

      const values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity).toBe(false);
      expect(values.sessionAffinityEnabled).toBe(true);
      expect(values.sessionAffinityHeader).toBe('x-reflow-sleep');
    });

    await test.step('2. off：三项不渲染，值不因隐藏而改变（再次读取时为 null 表示不可见）', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });

      const layout = await utils.expectLlmFormGridNoBlankBlock(
        utils.eppConfigGrid(page),
        '均衡模式配置 EPP 网格（off）',
      );
      expect(labelsOf(layout)).toHaveLength(7);

      const values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity, 'off 时开关不可见').toBeNull();
      expect(values.sessionAffinityEnabled, 'off 时开关不可见').toBeNull();
      expect(values.sessionAffinityHeader, 'off 时 Header 不可见').toBeNull();
    });

    await test.step('3. 切回 medium：三项恢复展示且回显休眠保留的原值', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'medium' });

      const values = await utils.getEppConfigValues(page);
      expect(values.prefixCacheAffinity, '前缀缓存亲和性保持 false').toBe(false);
      expect(values.sessionAffinityEnabled, '会话亲和性保持开启').toBe(true);
      expect(values.sessionAffinityHeader, 'Header 保持已填值').toBe('x-reflow-sleep');
    });

    await test.step('4. off 状态提交：epp_config 三个字段均不丢值（后端在 off 时忽略亲和）', async () => {
      await utils.fillEppConfig(page, { cacheAffinity: 'off' });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');

      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.epp_config.affinity).toBe('off');
      expect(body.epp_config.prefix_cache_affinity, '隐藏不丢值').toBe(false);
      expect(body.epp_config.session_affinity_enabled, '隐藏不丢值').toBe(true);
      expect(body.epp_config.session_affinity_header, 'Header 已填值随提交体下发').toBe(
        'x-reflow-sleep',
      );
    });
  });
});
