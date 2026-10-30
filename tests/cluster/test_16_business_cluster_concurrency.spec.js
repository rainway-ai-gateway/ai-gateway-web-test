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
 * AI业务集群 - 并发与竞态（BC-C-01~03，docs/覆盖缺口清单.md #5）
 *
 * 共享控制面的三人称视角：不做真实并发点击（易抖动），而是用「API 侧变更 +
 * UI 侧旧状态提交」构造确定性的竞态场景，断言系统行为与降级表现。
 *
 * 覆盖：
 * - BC-C-01 编辑期间他人修改：UI 提交覆盖为本地值（last-write-wins，无乐观锁）
 *   —— 以产品实际行为断言并记录为已知偏差（02i），提示运维避免并发编辑
 * - BC-C-02 编辑期间集群被删除：提交被拒（404）→ 有可读错误提示、抽屉可关闭、
 *   列表可继续使用（无白屏/无卡死）
 * - BC-C-03 重复点击提交：同一名称只落库一条（POST 重复请求被后端唯一约束拒绝），
 *   UI 不产生重复行
 *
 * 造数：API 服务商 + 集群（provider_<ts>，afterEach 先删集群再删服务商）。
 *
 * 运行：npx playwright test tests/cluster/test_16_business_cluster_concurrency.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resApi = require('../../api/resource-api-utils');

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
    description: '自动化测试-并发与竞态',
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

function clusterPayload(name, provider, overrides = {}) {
  return {
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
      provider,
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
    ...overrides,
  };
}

/** 编辑向导：从第 1 步连续下一步到复查页 */
async function advanceEditWizardToReview(page) {
  for (let i = 0; i < 4; i += 1) {
    await utils.clickWizardNext(page);
  }
  await utils.expectWizardStep(
    page,
    '复查&检查',
    utils.DRAWER_TITLE.editBusinessCluster,
  );
}

test.describe('AI业务集群 - BC-C 并发与竞态', () => {
  let cleanup;
  let providerCleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
    providerName = await createProvider({ page, cleanup: providerCleanup });
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('BC-C-01 编辑期间他人修改：UI 提交覆盖为本地值（last-write-wins）', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    await utils.createCluster(
      page,
      clusterPayload(clusterName, providerName, {
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
      }),
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 1. 打开编辑向导（读到旧状态）
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.expectWizardStep(
      page,
      '基础配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    // 2. 模拟「他人」通过 API 修改描述（PATCH Body 不允许含 name，含则 422）
    const { name: _ignoredName, ...patchBase } = clusterPayload(
      clusterName,
      providerName,
    );
    const others = await resApi.updateClusterWithResponse(
      page,
      clusterName,
      { ...patchBase, description: 'changed-by-others' },
    );
    expect(others.status, '他人修改应成功').toBe(200);

    // 3. UI 侧填新描述并直接提交（不重新加载数据）
    await utils.fillBasicStep(
      page,
      { description: 'ui-value' },
      utils.DRAWER_TITLE.editBusinessCluster,
    );
    await advanceEditWizardToReview(page);
    await utils.waitForClusterPatchRequest(page, () =>
      utils.clickWizardSubmit(page),
    );

    // 4. 产品现状：无乐观锁/版本校验 → UI 提交覆盖他人修改（后写覆盖）
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);
    const after = await utils.getCluster(page, clusterName);
    expect(after.description, '后写覆盖（无乐观锁，见 02i 已知偏差记录）').toBe(
      'ui-value',
    );
  });

  test('BC-C-02 编辑期间集群被删除：提交被拒且页面可继续使用', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);
    await utils.createCluster(
      page,
      clusterPayload(clusterName, providerName),
    );
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.ensureBusinessClusterRowVisible(page, clusterName);

    // 1. 打开编辑向导
    await utils.openEditBusinessClusterDrawer(page, clusterName);
    await utils.expectWizardStep(
      page,
      '基础配置',
      utils.DRAWER_TITLE.editBusinessCluster,
    );

    // 2. 模拟「他人」删除该集群
    const deleted = await resApi.deleteCluster(page, clusterName);
    expect(deleted, '删除应成功').toBe(true);

    // 3. UI 提交：PATCH 目标已不存在 → 被拒（4xx），且不抛未捕获异常
    await advanceEditWizardToReview(page);
    const [patchResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'PATCH' && r.url().includes('/clusters/'),
        { timeout: 30000 },
      ),
      utils.clickWizardSubmit(page),
    ]);
    expect(patchResponse.status()).toBeGreaterThanOrEqual(400);
    expect(patchResponse.status()).toBeLessThan(500);

    // 4. 抽屉可关闭，刷新后列表不再出现该集群（无白屏/无卡死）
    await utils.closeBusinessClusterEditDrawer(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await utils.businessClusterTable(page).waitForLoaded();
    await expect(
      utils.businessClusterTable(page).rowByText(clusterName),
    ).toHaveCount(0);
  });

  test('BC-C-03 重复点击提交：同一名称仅落库一条', async ({ page }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.fillCreateWizardThroughReview(page, {
      clusterName,
      protocol: 'https',
      model: { provider: providerName, models: [MODEL_A1] },
    });

    // 连点两次提交（第二次点击不应产生第二条记录；后端以名称唯一约束兜底）
    const posts = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/clusters')) {
        posts.push(req.url());
      }
    });
    const submitBtn = utils
      .ivuDrawer(page)
      .active()
      .getByRole('button', { name: '提交' });
    await submitBtn.click();
    await submitBtn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 断言：同名集群仅一条；UI 列表无重复行
    const list = await resApi.getClusterList(page);
    const matched = (list || []).filter((c) => c.name === clusterName);
    expect(matched, '同名集群只应存在一条').toHaveLength(1);
    expect(posts.length, '提交请求次数应为 1~2（第二次被 UI 或后端拒绝）').toBeLessThanOrEqual(2);

    await utils.ensureBusinessClusterRowVisible(page, clusterName);
  });
});