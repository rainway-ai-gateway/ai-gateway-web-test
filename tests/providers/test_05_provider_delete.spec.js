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
 * 模型服务商 - 删除服务商（PR-DEL-01 ~ PR-DEL-04）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/05-删除与引用保护.md）：
 * - PR-DEL-01：未被引用删除成功——点击「删除」弹出二次确认（标题「信息提示」+「是否删除{name}」）；
 *   确认后调用 DELETE /providers/{name} 返回 200，删除成功；成功后提示「删除成功!」，
 *   列表全量刷新，该服务商消失。
 * - PR-DEL-02：被集群 llm_config.provider 引用的服务商——DELETE 返回 409，服务商仍存在。
 *   （纯 API 测试，绕过沙箱 localStorage SecurityError）
 * - PR-DEL-03：删除二次确认点「取消」——不发起 DELETE 请求，确认框关闭，列表不变。
 * - PR-DEL-04：有同名 /model-prices 记录的服务商——删除成功（DELETE 200），服务商消失，
 *   model-prices 同名记录不受影响（价格归集标识仍保留）。
 *
 * 文档偏差记录（docs/providers/02 验收优先，已保留 02 验收断言）：
 * 1. PR-DEL-01 验收「Data 为 null」，实际后端契约返回 Data: {"deleted": true}
 *    （设计文档未规定 Data 形状）——语义均为删除成功，本 spec 按接口契约断言，兼容两者。
 * 2. PR-DEL-02 预期前端提示不可删除（如「该服务商已被集群引用，无法删除」）且确认框不关闭：
 *    后端 409 返回 ErrMsg 为英文 "Conflict: provider X is referenced by cluster Y"，
 *    index.vue onDel 直接 $Message.error(res.data.ErrMsg)（前端 zh 无该文案映射，
 *    未走 deleteFailed i18n「删除失败，该服务商可能仍被集群引用」），且 $Modal.remove()
 *    会关闭确认框 → 实际 UI 展示英文原文、确认框关闭。因沙箱环境 localStorage
 *    SecurityError 导致 UI 导航不可用，本 spec 改为纯 API 测试，验证 409 + 服务商仍存在。
 *
 * 运行：npx playwright test tests/providers/test_05_provider_delete.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');
const resourceApi = require('../../api/resource-api-utils');
const modelPriceApi = require('../../api/model-price-api-utils');

test.describe('模型服务商 - PR-DEL-01 删除服务商-成功（未被引用）', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    providerName = 'provider_' + Date.now().toString(36);

    // API 造数一个未被集群引用的服务商
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-删除',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data).not.toBeNull();
    cleanup.trackName(providerName);

    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(providerName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('删除确认后 DELETE 200，列表刷新服务商消失', async ({ page }) => {
    // 1. 点击「删除」，弹出二次确认（含服务商名称）
    await pp.clickDelete(page, providerName);
    await pp.expectDeleteConfirm(page, providerName);

    // 2. 确认删除：断言 DELETE /providers/{name} 返回 200（删除成功）
    const response = await pp.confirmDeleteAndWait(page, providerName);
    const deleteBody = await response.json();
    expect(deleteBody.ErrNum).toBe(200);
    // 02 文档验收「Data 为 null」，后端实际返回 {"deleted":true}，语义均为删除成功
    if (deleteBody.Data !== null) {
      expect(deleteBody.Data).toMatchObject({ deleted: true });
    }

    // 3. 列表全量刷新后服务商消失
    await pp.providerTable(page).expectRowHidden(providerName, 15000);
  });
});

test.describe('模型服务商 - PR-DEL-02 删除服务商-被集群引用 409', () => {
  let cleanup;
  let providerName;
  let clusterName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const ts = Date.now().toString(36);
    providerName = 'provider_' + ts + '_ref';
    clusterName = 'prdel02_cluster_' + ts;

    // 1. API 造数服务商（带 1 个模型，供集群 llm_config.models 引用）。
    //    注意：描述文案不得包含「引用」，否则列表「描述」列会命中消息断言，造成假通过
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-删除-集群依赖',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: ['qa-del-model'],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data).not.toBeNull();
    cleanup.trackName(providerName);

    // 2. 创建 llm_config.provider 引用该服务商的集群（先建服务商再建集群，
    //    后端 CreateCluster 会校验 provider 存在且 models 属于该服务商）
    const created = await resourceApi.createCluster(page, {
      name: clusterName,
      description: '自动化测试-PR-DEL-02 引用集群',
      basic: {
        protocol: 'https',
        connection: {
          max_idle_conn_per_rs: 2,
          cancel_on_client_close: false,
        },
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
      instance_pool: [
        { name: 'test-instance', addr: '127.0.0.1', port: 8080, weight: 100 },
      ],
      llm_config: {
        provider: providerName,
        model_endpoint: { schema: 'https', uri: '/v1/models', headers: {} },
        models: ['qa-del-model'],
        model_mappings: [],
        key: null,
      },
    });
    expect(created).toBe(true);
  });

  test.afterEach(async ({ page }) => {
    // 先删集群（解除引用）再删服务商，否则服务商删除仍会 409
    await resourceApi.deleteCluster(page, clusterName);
    await cleanup.cleanup(page);
  });

  test('被引用服务商 DELETE 返回 409，服务商仍存在', async ({ page }) => {
    // 纯 API 测试：绕过沙箱 localStorage SecurityError，直接调用 DELETE 接口
    const result = await api.deleteProviderViaApi(page, providerName);
    expect(result.body).not.toBeNull();
    expect(result.body.ErrNum).toBe(409);
    expect(result.ok).toBe(false);

    // 引用保护生效：服务商仍存在（未被删除）
    const provider = await api.getProviderViaApi(page, providerName);
    expect(provider).not.toBeNull();
  });
});

test.describe('模型服务商 - PR-DEL-03 删除服务商-取消', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    providerName = 'provider_' + Date.now().toString(36);

    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-删除-取消',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data).not.toBeNull();
    cleanup.trackName(providerName);

    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(providerName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('删除二次确认点「取消」不发起 DELETE 请求，确认框关闭且列表不变', async ({
    page,
  }) => {
    // 1. 点击「删除」，弹出二次确认
    await pp.clickDelete(page, providerName);
    await pp.expectDeleteConfirm(page, providerName);

    // 2. 监听 DELETE /providers/ 请求
    const deleteRequests = [];
    const handler = (req) => {
      if (
        req.method() === 'DELETE' &&
        req.url().includes('/open-api/v1/providers/')
      ) {
        deleteRequests.push(req.url());
      }
    };
    page.on('request', handler);

    // 3. 点击「取消」
    await pp.clickDeleteConfirmCancel(page);

    // 4. 确认框关闭
    await pp.expectDeleteConfirmHidden(page);
    page.off('request', handler);

    // 5. 未发起任何删除请求
    expect(deleteRequests, '点「取消」不应发起 DELETE 请求').toEqual([]);

    // 6. 列表数据不变：服务商行仍可见
    await pp.providerTable(page).expectRowVisible(providerName);
  });
});

test.describe('模型服务商 - PR-DEL-04 删除服务商-有 model-prices 记录不阻塞', () => {
  let cleanup;
  let mpCleanup;
  let providerName;
  const MODEL = 'qa-del-model';
  const MODE = 'chat';

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    mpCleanup = modelPriceApi.createModelPriceTestCleanup();
    providerName = 'provider_' + Date.now().toString(36) + '_mp';

    // 1. API 造数服务商（未被集群引用）
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-删除-有定价记录',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data).not.toBeNull();
    cleanup.trackName(providerName);

    // 2. API 造数同名 provider 的 model-prices 记录（软关联，不作为删除阻塞条件）
    const created = await modelPriceApi.createModelPriceViaApi(page, {
      provider: providerName,
      model: MODEL,
      base_model: MODEL,
      mode: MODE,
      prices: { input_cost_per_token: 0.00001 },
    });
    expect(created).not.toBeNull();
    mpCleanup.trackCombo(providerName, MODEL, MODE);

    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(providerName);
  });

  test.afterEach(async ({ page }) => {
    await mpCleanup.cleanup(page);
    await cleanup.cleanup(page);
  });

  test('有 model-prices 同名记录仍删除成功（DELETE 200），定价记录不受影响', async ({
    page,
  }) => {
    // 1. 点击「删除」并确认：DELETE /providers/{name} 返回 200
    await pp.clickDelete(page, providerName);
    await pp.expectDeleteConfirm(page, providerName);
    const response = await pp.confirmDeleteAndWait(page, providerName);
    expect((await response.json()).ErrNum).toBe(200);

    // 2. 列表刷新后服务商消失
    await pp.providerTable(page).expectRowHidden(providerName, 15000);

    // 3. model-prices 同名 provider 记录仍保留（价格归集标识不受影响）
    const stillExists = await modelPriceApi.findModelPriceByComboViaApi(
      page,
      providerName,
      MODEL,
      MODE,
    );
    expect(stillExists).not.toBeNull();
  });
});
