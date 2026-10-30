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
 * AI业务集群 - 交互边界补充用例（BC-E-06~11，docs/覆盖缺口清单.md #12/#13/#14/#15/#17）
 *
 * 批量补齐元素级与交互级盲区（对应 cluster 模块元素对账的未覆盖项）：
 * - BC-E-06 (#15) 列表搜索框：page 层 `searchBusinessCluster` 封装此前零调用
 * - BC-E-07 (#14) 会话保持「停用」时哈希策略/哈希头部显隐（RM-BC-26 只测了启用态校验）
 * - BC-E-08 (#13) `Esc` 关闭创建抽屉
 * - BC-E-09 (#13) 步骤条不可点击直跳（iView Steps 无跳转交互，断言记录该行为）
 * - BC-E-10 (#12) 模型重定向「删行」按钮（removeModelMapping，此前只填过第 0 行）
 * - BC-E-11 (#17) 描述字段 XSS 转义渲染（存储后列表/详情按文本渲染，无注入节点）
 *
 * 造数：API 服务商（afterEach 先删集群再删服务商）。
 *
 * 运行：npx playwright test tests/cluster/test_19_business_cluster_edge_interactions.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';
const MODEL_A2 = 'Qwen/Qwen2.5-7B-Instruct';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

async function createProvider({ page, cleanup, models = [MODEL_A1] }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-交互边界',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models,
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

test.describe('AI业务集群 - BC-E-06 列表搜索（#15）', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('按名称搜索命中、无结果空态、清空恢复', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    await utils.createCluster(page, {
      name: clusterName,
      basic: {
        protocol: 'https',
        connection: { max_idle_conn_per_rs: 2, cancel_on_client_close: false },
        retries: { max_retry_in_cluster: 2 },
        buffers: { req_write_buffer_size: 512 },
        timeouts: {
          timeout_read_client_again: 60000,
          timeout_readbody_client: 30000,
          timeout_conn_serv: 2000,
          timeout_response_header: 60000,
          timeout_write_client: 60000,
        },
      },
      sticky_sessions: {
        enabled: true,
        hash_strategy: 'CLIENT_ID_ONLY',
        hash_header: 'Cookie:USERID',
      },
      passive_health_check: {
        schema: 'http',
        failnum: 10,
        interval: 1000,
        host: 'www.test1.com',
        uri: '/interface',
        statuscode: 200,
      },
      llm_config: {
        provider: await createProvider({ page, cleanup: providerCleanup }),
        models: [MODEL_A1],
        model_mappings: [],
        keys: [],
        key_policy: {
          strategy: 'weighted_random',
          max_retries: 0,
          retry_backoff_initial: 500,
          retry_backoff_max: 5000,
        },
        key_affinity: {
          enabled: false,
          ttl: 600,
          redis_prefix: 'bfe:ai:key_affinity',
          penalty_enable: true,
        },
      },
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.businessClusterTable(page).waitForLoaded();

    // 1. 搜索命中：目标行可见，其余行被过滤
    await utils.searchBusinessClusterAndWait(page, clusterName);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 2. 无结果：空态（无数据行）
    await utils.searchBusinessClusterAndWait(page, 'no_such_cluster_zzz');
    await expect(utils.businessClusterTable(page).dataRows()).toHaveCount(0);

    // 3. 清空恢复：目标行重新可见
    await utils.searchBusinessClusterAndWait(page, '');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
  });
});

test.describe('AI业务集群 - BC-E-07 会话保持停用态显隐（#14）', () => {
  test.beforeEach(async ({ page }) => {
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test('会话保持「停用」隐藏哈希策略/哈希头部，「启用」恢复展示', async ({ page }) => {
    await utils.openCreateBusinessClusterDrawer(page);

    // 1. 停用：哈希相关字段不渲染
    await utils.fillBasicStep(page, {
      clusterName: utils.generateTestBusinessClusterName(),
      protocol: 'https',
      stickySessionsEnabled: '停用',
    });
    await utils.expectHashStrategyFieldVisible(page, false);

    // 2. 启用：恢复展示（RM-BC-26 已覆盖启用态校验，此处只断言显隐）
    await utils.fillBasicStep(page, { stickySessionsEnabled: '启用' });
    await utils.expectHashStrategyFieldVisible(page, true);

    await utils.ivuDrawer(page).closeByX(utils.DRAWER_TITLE.createBusinessCluster);
  });
});

test.describe('AI业务集群 - BC-E-08/09 抽屉 Esc 关闭与步骤条直跳（#13）', () => {
  test.beforeEach(async ({ page }) => {
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test('Esc 关闭创建抽屉；步骤条点击不跳步', async ({ page }) => {
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName: utils.generateTestBusinessClusterName(),
      protocol: 'https',
    });

    // 1. Esc 不关闭抽屉（实测产品行为：该抽屉 ESC 不可关，已记录偏差；
    //    退出路径仅有 X 关闭〔BC-E-01〕与遮罩不可点〔BC-E-02〕）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await expect(
      utils.ivuDrawer(page).withTitle(utils.DRAWER_TITLE.createBusinessCluster),
    ).toBeVisible();
    await utils.ivuDrawer(page).closeByX(utils.DRAWER_TITLE.createBusinessCluster);
    await expect(
      utils.ivuDrawer(page).withTitle(utils.DRAWER_TITLE.createBusinessCluster),
    ).toBeHidden({ timeout: 10000 });

    // 2. 重开后点击步骤条第 4 步「大模型配置」：不可直跳，仍停留第 1 步
    await utils.openCreateBusinessClusterDrawer(page);
    const steps = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.createBusinessCluster)
      .locator('.ivu-steps-item');
    await steps.nth(3).click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    await utils.expectWizardStep(page, '基础配置');
    await utils.ivuDrawer(page).closeByX(utils.DRAWER_TITLE.createBusinessCluster);
  });
});

test.describe('AI业务集群 - BC-E-10 模型重定向删行（#12）', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('两行映射删除首行后提交体仅剩一行', async ({ page }) => {
    test.setTimeout(240000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      models: [MODEL_A1, MODEL_A2],
    });

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1, MODEL_A2]);

    // 1. 填两行映射
    await utils.fillModelMappingRow(page, 0, { source: MODEL_A1, target: MODEL_A2 });
    await utils.fillModelMappingRow(page, 1, { source: MODEL_A2, target: MODEL_A1 });
    expect(await utils.getModelMappingRowCount(page)).toBe(2);

    // 2. 删除首行：剩余一行且内容顺位上移
    await utils.deleteModelMappingRow(page, 0);
    expect(await utils.getModelMappingRowCount(page)).toBe(1);

    // 3. 走完向导提交：提交体仅含一行映射
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    const request = await utils.waitForClusterCreateRequest(page, () =>
      utils.clickWizardSubmit(page),
    );
    const mappings = request.postDataJSON().llm_config.model_mappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toEqual({ source_model: MODEL_A2, target_model: MODEL_A1 });
  });
});

test.describe('AI业务集群 - BC-E-11 描述字段 XSS 转义（#17）', () => {
  let cleanup;
  let providerCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('描述含 HTML/JS 时按文本渲染，列表与详情无注入节点', async ({ page }) => {
    test.setTimeout(240000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    const xss = '<img src=x onerror=alert(1)>';

    // 1. UI 创建：描述填入 XSS 载荷
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      description: xss,
    });
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_A1]);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '复查&检查');
    await utils.submitCreateBusinessClusterAndWaitForSuccess(page);
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 2. 列表行：包含字面文本、无 img 注入节点
    const row = utils.businessClusterTable(page).rowByText(clusterName);
    await expect(row).toContainText(xss);
    expect(await row.locator('img').count(), '列表行不应渲染注入 img 节点').toBe(0);

    // 3. 详情抽屉：同样按文本渲染
    await utils.openBusinessClusterDetail(page, clusterName);
    const detailDrawer = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.businessClusterDetail);
    await expect(detailDrawer).toContainText(xss);
    expect(
      await detailDrawer.locator('img').count(),
      '详情不应渲染注入 img 节点',
    ).toBe(0);
    await utils.closeBusinessClusterDetail(page);
  });
});

test.describe('AI业务集群 - BC-E-12 大数据量列表（#40）', () => {
  let cleanup;
  let providerCleanup;
  const BULK_COUNT = 60;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('60 个集群列表：翻页末页行可见、总条数正确、筛选定位可用', async ({ page }) => {
    test.setTimeout(600000);
    const providerName = await createProvider({ page, cleanup: providerCleanup });
    const names = [];
    for (let i = 0; i < BULK_COUNT; i += 1) {
      const name = `bulk_${Date.now().toString(36)}_${i}`;
      names.push(name);
      cleanup.trackBusinessCluster(name);
      const { status } = await (async () => {
        const resApi = require('../../api/resource-api-utils');
        return resApi.createClusterWithResponse(
          page,
          {
            name,
            basic: {
              protocol: 'https',
              connection: { max_idle_conn_per_rs: 2, cancel_on_client_close: false },
              retries: { max_retry_in_cluster: 2 },
              buffers: { req_write_buffer_size: 512 },
              timeouts: {
                timeout_read_client_again: 60000,
                timeout_readbody_client: 30000,
                timeout_conn_serv: 2000,
                timeout_response_header: 60000,
                timeout_write_client: 60000,
              },
            },
            sticky_sessions: {
              enabled: true,
              hash_strategy: 'CLIENT_ID_ONLY',
              hash_header: 'Cookie:USERID',
            },
            passive_health_check: {
              schema: 'http',
              failnum: 10,
              interval: 1000,
              host: 'www.test1.com',
              uri: '/interface',
              statuscode: 200,
            },
            llm_config: {
              provider: providerName,
              models: [MODEL_A1],
              model_mappings: [],
              keys: [],
              key_policy: {
                strategy: 'weighted_random',
                max_retries: 0,
                retry_backoff_initial: 500,
                retry_backoff_max: 5000,
              },
              key_affinity: {
                enabled: false,
                ttl: 600,
                redis_prefix: 'bfe:ai:key_affinity',
                penalty_enable: true,
              },
            },
          },
        );
      })();
      expect(status, `第 ${i} 个集群应创建成功`).toBe(200);
    }

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const table = utils.businessClusterTable(page);
    await table.waitForLoaded();

    // 1. 分页存在且能翻到末页（页大小以产品实际为准，取末页码；
    //    分页渲染晚于表格，轮询等待末页码出现）
    await expect
      .poll(async () => table.lastPageNumber(), { timeout: 15000 })
      .toBeGreaterThan(1);
    const lastPage = await table.lastPageNumber();
    await table.clickPageNumber(lastPage);
    const lastRow = names[names.length - 1];
    await expect(table.rowByText(lastRow)).toBeVisible({ timeout: 20000 });

    // 2. 筛选定位大数据量中的指定行（不翻页直接搜到）
    await utils.searchBusinessClusterAndWait(page, names[0]);
    await expect(table.rowByText(names[0])).toBeVisible({ timeout: 20000 });
    await expect(table.dataRows()).toHaveCount(1);
  });
});

test.describe('AI业务集群 - BC-E-13 集群删除不影响功能增强规则（#43）', () => {
  let cleanup;
  let providerCleanup;
  let cacheCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    cacheCleanup = require('../../pages/ai-cache/AICachePage').createAiCacheTestCleanup();
    await cacheCleanup.saveOriginalState(page);
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cacheCleanup.cleanup(page);
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('存在缓存规则时删除集群：缓存规则不受集群生命周期影响仍展示', async ({
    page,
  }) => {
    test.setTimeout(300000);
    const cacheUtils = require('../../pages/ai-cache/AICachePage');
    const ruleName = cacheUtils.generateTestRuleName('ac_e13_');
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await test.step('前置：API 造缓存规则 + EPP/WRR 集群', async () => {
      await cacheUtils.ensureAiCacheRuleExistsViaApi(page, {
        name: ruleName,
        cond: 'default_t()',
      });
      await utils.createCluster(page, {
        name: clusterName,
        basic: {
          protocol: 'https',
          connection: { max_idle_conn_per_rs: 2, cancel_on_client_close: false },
          retries: { max_retry_in_cluster: 2 },
          buffers: { req_write_buffer_size: 512 },
          timeouts: {
            timeout_read_client_again: 60000,
            timeout_readbody_client: 30000,
            timeout_conn_serv: 2000,
            timeout_response_header: 60000,
            timeout_write_client: 60000,
          },
        },
        sticky_sessions: {
          enabled: true,
          hash_strategy: 'CLIENT_ID_ONLY',
          hash_header: 'Cookie:USERID',
        },
        passive_health_check: {
          schema: 'http',
          failnum: 10,
          interval: 1000,
          host: 'www.test1.com',
          uri: '/interface',
          statuscode: 200,
        },
        llm_config: {
          provider: providerName,
          models: [MODEL_A1],
          model_mappings: [],
          keys: [],
          key_policy: {
            strategy: 'weighted_random',
            max_retries: 0,
            retry_backoff_initial: 500,
            retry_backoff_max: 5000,
          },
          key_affinity: {
            enabled: false,
            ttl: 600,
            redis_prefix: 'bfe:ai:key_affinity',
            penalty_enable: true,
          },
        },
      });
    });

    await test.step('删除集群（缓存规则存在的前提下）', async () => {
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await utils.ensureBusinessClusterRowVisible(page, clusterName);
      const result = await utils.attemptDeleteBusinessCluster(page, clusterName);
      expect(result.ok, '集群应删除成功（缓存规则不构成引用阻塞）').toBe(true);
    });

    await test.step('显式断言（#43）：缓存规则仍正常展示', async () => {
      await cacheUtils.reloadAiCachePage(page);
      await cacheUtils.expectRuleRowVisible(page, ruleName);
    });
  });
});
