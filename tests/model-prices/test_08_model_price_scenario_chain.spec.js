/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * 长链路场景 - SC-L-04 模型定价配置传播链（docs/跨模块横切用例.md H-4 族）
 *
 * 链路：providers → model-prices → cluster → 前端直达。
 * 1.（providers/model-prices）服务商 P 声明模型 M + API 建 M 的定价记录，回读一致
 * 2.（cluster）引用集群 C 选 P 的 M：集群配置与定价**解耦**——集群 GET 不携带 pricing
 * 3.（前端直达）服务商行「查询模型价格」→ 跳转 provider={P} 筛选且 M 行可见
 * 4.（model-prices）删除 M 的定价记录 → 直达变为空态提示
 * 5.（cluster 解耦固化）删除定价后 C 的 llm_config 仍 provider=P、models 含 M
 *    （软关联：定价不级联影响集群配置，与 PR-LINK-08 删除服务商保留定价同向互补）
 *
 * 复用：PR-LINK-01/06/08 的造数与直达断言模式
 * （tests/providers/test_07_provider_linkage.spec.js）。
 *
 * 造数/清理：集群 → 定价 → 服务商顺序自清理（createReferencingCluster 模式）。
 *
 * 运行：npx playwright test tests/model-prices/test_08_model_price_scenario_chain.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const mp = require('../../pages/model-prices/ModelPricePage');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resourceApi = require('../../api/resource-api-utils');
const modelPriceApi = require('../../api/model-price-api-utils');

const MODEL_CHAT = 'deepseek-chat';
const MODE_CHAT = 'chat';
const INPUT_COST = 0.00001;

async function sessionKey(page) {
  return page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.sessionKey || u.session_key || '';
  });
}

async function apiGetCluster(page, clusterName) {
  const r = await page.request.get('http://127.0.0.1:8183/open-api/v1/clusters', {
    headers: { Authorization: 'Session ' + (await sessionKey(page)) },
  });
  const body = await r.json();
  const list = Array.isArray(body.Data) ? body.Data : (body.Data && body.Data.list) || [];
  return list.find((c) => c.name === clusterName) || null;
}

test.describe('长链路场景 - SC-L-04 模型定价配置传播链 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  let resourceCleanup;
  let providerCleanup;
  let mpCleanup;
  let providerName;
  let clusterName;

  test.beforeEach(async ({ page }) => {
    resourceCleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    mpCleanup = modelPriceApi.createModelPriceTestCleanup();

    providerName =
      'provider_scl04_' + Date.now().toString(36) + '_' + (test.info().parallelIndex + 1);
    clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);

    // 前置：服务商 P（模型 M）+ 引用集群 C（llm_config 选 P 的 M）
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-长链路场景-定价链',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [MODEL_CHAT],
      keys: [],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data, 'API 造数服务商应成功').not.toBeNull();
    providerCleanup.trackName(providerName);

    const created = await resourceApi.createCluster(page, {
      name: clusterName,
      description: '自动化测试-长链路场景-定价链集群',
      basic: {
        protocol: 'https',
        connection: { max_idle_conn_per_rs: 2, cancel_on_client_close: false },
        retries: { max_retry_in_cluster: 2 },
        buffers: { req_write_buffer_size: 512 },
        timeouts: {
          timeout_conn_serv: 2000,
          timeout_response_header: 60000,
          timeout_readbody_client: 30000,
          timeout_read_client_again: 60000,
          timeout_write_client: 60000,
        },
      },
      llm_config: {
        provider: providerName,
        model_endpoint: { schema: 'https', uri: '/v1/models', headers: {} },
        models: [MODEL_CHAT],
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
    expect(created, 'API 造数引用集群应成功').toBe(true);
  });

  test.afterEach(async ({ page }) => {
    await resourceCleanup.cleanup(page);
    await mpCleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('定价记录→集群解耦→前端直达→删定价后集群不受影响', async ({ page }) => {
    // 先导航到产品页（确立会话域，apiGetCluster 读 localStorage 取 session）
    await pp.gotoProvidersPage(page);

    await test.step('1.（providers/model-prices）建 M 的定价记录并 API 回读一致', async () => {
      const created = await modelPriceApi.createModelPriceViaApi(page, {
        provider: providerName,
        model: MODEL_CHAT,
        base_model: MODEL_CHAT,
        mode: MODE_CHAT,
        prices: { input_cost_per_token: INPUT_COST },
      });
      expect(created, 'POST /model-prices 应成功').not.toBeNull();
      mpCleanup.trackCombo(providerName, MODEL_CHAT, MODE_CHAT);

      const record = await modelPriceApi.findModelPriceByComboViaApi(
        page,
        providerName,
        MODEL_CHAT,
        MODE_CHAT,
      );
      expect(record, '应能按组合查到定价记录').toBeTruthy();
      expect(Number(record.prices.input_cost_per_token)).toBe(INPUT_COST);
    });

    await test.step('2.（cluster）集群配置与定价解耦：C 引用 P 的 M，但 GET 不携带 pricing', async () => {
      const cluster = await apiGetCluster(page, clusterName);
      expect(cluster, '应能查到引用集群').toBeTruthy();
      expect(cluster.llm_config.provider).toBe(providerName);
      expect(cluster.llm_config.models).toContain(MODEL_CHAT);
      expect(cluster.llm_config.pricing).toBeUndefined();
      expect(cluster.llm_config.prices).toBeUndefined();
    });

    await test.step('3.（前端直达）服务商行「查询模型价格」→ provider 筛选 + M 行可见', async () => {
      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
      await pp.clickViewModelPrices(page, providerName);

      await expect(page).toHaveURL(/\/model-prices/, { timeout: 15000 });
      expect(page.url()).toContain(
        'provider=' + encodeURIComponent(providerName),
      );
      expect(page.url()).not.toContain('autoView');
      await mp.expectProviderFilterSelected(page, providerName);
      await mp.modelPriceTable(page).expectRowVisible(MODEL_CHAT);
      await mp.expectViewScopeHidden(page);
    });

    await test.step('4.（model-prices）删除 M 的定价记录 → 直达变为空态提示', async () => {
      const deleted = await modelPriceApi.deleteModelPriceByComboViaApi(
        page,
        providerName,
        MODEL_CHAT,
        MODE_CHAT,
      );
      expect(deleted, '按组合删除定价记录应成功').toBe(true);
      expect(
        await modelPriceApi.findModelPriceByComboViaApi(
          page,
          providerName,
          MODEL_CHAT,
          MODE_CHAT,
        ),
      ).toBeNull();

      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
      await pp.clickViewModelPrices(page, providerName);
      await mp.expectNoPricingForProvider(page, providerName);
    });

    await test.step('5.（cluster 解耦固化）删定价后 C 的 llm_config 引用不受影响', async () => {
      const cluster = await apiGetCluster(page, clusterName);
      expect(cluster, '删定价后集群仍应存在').toBeTruthy();
      expect(cluster.llm_config.provider).toBe(providerName);
      expect(cluster.llm_config.models).toContain(MODEL_CHAT);
    });
  });
});
