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
 * 模型服务商 - 跨模块联动（PR-LINK-01 ~ PR-LINK-08）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/07-跨模块联动.md）：
 * - PR-LINK-01：服务商模型定价——定价记录 provider 与服务商名一致（软关联），
 *   模型定价页 provider 列展示关联服务商名（API 造数 + 列表断言）。
 * - PR-LINK-02：集群大模型配置-所属服务商下拉出现该服务商（选项来自
 *   GET /providers/actions/get-provider-names；选中后调用 GET /providers/{name} 拉详情）。
 * - PR-LINK-03：集群转发模型选择服务商探测模型（子集选择 / 全选），提交集群后
 *   引用关系与模型一致。
 * - PR-LINK-04：集群 Keys 引用服务商 keys（下拉仅 key 名称不含明文，提交体
 *   llm_config.keys 仅 name + weight）。
 * - PR-LINK-05：修改服务商实例池 → 引用集群实例池同步（后端 ProviderInstancePoolSyncer
 *   级联刷新派生实例池）；重命名被引用 Key 被 409 联动校验拦截。
 * - PR-LINK-06：查询模型价格直达——跳转 provider={name} 筛选、不携带 autoView、
 *   不打开详情；无记录时提示「未找到提供商 {name} 的模型定价」。
 * - PR-LINK-07：删除被集群引用的服务商被联动保护（DELETE 409，前端提示，服务商保留）。
 * - PR-LINK-08：删除服务商后模型定价记录保留（软关联，不级联删除）。
 *
 * 与既有用例的重叠处理（本 spec 聚焦跨模块视角，复用 pages/ 封装，不重复实现）：
 * - PR-LINK-02 ≈ RM-BC-71（tests/cluster/test_06_business_cluster_model.spec.js）：
 *   下拉选项断言复用 expectProviderDropdownOptions；差异化点为「选中服务商后拉取
 *   GET /providers/{name} 详情」的网络断言。
 * - PR-LINK-03 ≈ RM-BC-73（转发模型多选/全选）：差异化点为跨模块语义——所选模型为
 *   服务商模型子集 + UI 提交集群后 llm_config 与服务商数据一致。
 * - PR-LINK-04 ≈ RM-BC-76/RM-BC-84（Keys 下拉/提交体结构）：差异化点为
 *   「不含 key 明文」的跨模块安全断言。
 * - PR-LINK-07 ≈ PR-DEL-02（tests/providers/test_05_provider_delete.spec.js，纯 API）：
 *   本 spec 从 UI 删除入口触发并断言前端提示行为。
 * - PR-LINK-08 ≈ PR-DEL-04：本 spec 从 UI 删除后切到模型定价页验证记录保留。
 *
 * 文档偏差记录（docs/providers/02 验收优先，偏差如实记录）：
 * 1. PR-LINK-05 预期「集群详情展示的实例池与服务商最新实例池一致」：当前集群
 *    详情（Review）仅展示基础/健康检查/大模型配置/均衡模式，不展示实例池；
 *    后端将服务商有效实例池同步到引用集群的派生实例池（{product}.{cluster_name}），
 *    同步效果经派生实例池 API（GET /products/{p}/instance-pools/{cluster}）断言，
 *    UI 侧仅执行「打开引用集群详情」步骤。
 * 2. PR-LINK-05 预期「修改服务商 Keys（name 变更）后引用集群 Keys 一并更新」：
 *    后端对移除/重命名被集群引用的 Key 返回 409 联动校验拦截
 *    （ProviderKeyRefChecker，事务内回滚），联动表现为「拦截 + 引用不变」，
 *    本 spec 按实际保护行为断言并保留此偏差记录。
 * 3. PR-LINK-07 预期前端提示「该服务商已被集群引用，无法删除」：后端 409 返回英文
 *    ErrMsg（"Conflict: provider X is referenced by cluster Y"），前端 $Message.error
 *    直接展示英文原文（同 PR-DEL-02 记录），本 spec 断言英文提示原文。
 *
 * 造数/清理：服务商 / 集群 / 模型定价均以 API 造数（唯一命名），afterEach 按
 * 「集群 → 定价 → 服务商」顺序自清理（先解除 llm_config.provider 引用再删服务商）；
 * 删除集群由后端级联删除派生实例池。
 *
 * 运行：npx playwright test tests/providers/test_07_provider_linkage.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const mp = require('../../pages/model-prices/ModelPricePage');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resourceApi = require('../../api/resource-api-utils');
const modelPriceApi = require('../../api/model-price-api-utils');

const MODEL_CHAT = 'deepseek-chat';
const MODEL_V3 = 'deepseek-v3';
const MODEL_LINK03_A = 'qa-link03-a';
const MODEL_LINK03_B = 'qa-link03-b';
const MODEL_LINK03_C = 'qa-link03-c';
const KEY_PRIMARY = 'key-primary';
const KEY_SECONDARY = 'key-secondary';
const MODE_CHAT = 'chat';

let nameSeq = 0;

function uniqueName(prefix) {
  nameSeq += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + nameSeq;
}

/**
 * 通过 API 创建服务商并登记 provider cleanup
 */
async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueName('provider');
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-跨模块联动',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_CHAT],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

/**
 * 通过 API 创建 llm_config.provider 引用指定服务商的集群（先建服务商再建集群，
 * 后端 CreateCluster 校验 provider 存在且 models 属于该服务商）
 */
async function createReferencingCluster(
  page,
  clusterName,
  providerName,
  models,
  keys = [],
) {
  const created = await resourceApi.createCluster(page, {
    name: clusterName,
    description: '自动化测试-跨模块联动-引用集群',
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
      models,
      model_mappings: [],
      keys,
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
  return created;
}

/**
 * 归一化实例列表为 {addr, port, weight} 集合（忽略后端附加字段如 name），
 * 用于跨模块比较服务商实例池与集群派生实例池
 */
function normalizeInstances(instances) {
  return (instances || [])
    .map((it) => ({
      addr: it.addr,
      port: Number(it.port),
      weight: Number(it.weight),
    }))
    .sort((a, b) => a.addr.localeCompare(b.addr) || a.port - b.port);
}

test.describe('模型服务商 - PR-LINK-01~08 跨模块联动 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  let resourceCleanup;
  let providerCleanup;
  let mpCleanup;

  test.beforeEach(async () => {
    resourceCleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    mpCleanup = modelPriceApi.createModelPriceTestCleanup();
  });

  test.afterEach(async ({ page }) => {
    // 先解除集群引用（级联删除派生实例池），再清理定价，最后删除服务商
    await resourceCleanup.cleanup(page);
    await mpCleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('PR-LINK-01 服务商模型定价-provider列展示关联服务商名并支持查询模型价格直达筛选', async ({
    page,
  }) => {
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: [MODEL_CHAT, MODEL_V3] },
    });

    await test.step('1. API 创建定价记录（provider 与服务商名一致，软关联）', async () => {
      const created = await modelPriceApi.createModelPriceViaApi(page, {
        provider: providerName,
        model: MODEL_V3,
        base_model: MODEL_V3,
        mode: MODE_CHAT,
        prices: { input_cost_per_token: 0.00001 },
      });
      expect(created, 'POST /model-prices 创建成功').not.toBeNull();
      expect(created.provider).toBe(providerName);
      mpCleanup.trackCombo(providerName, MODEL_V3, MODE_CHAT);
    });

    await test.step('2. 服务商列表点击「查询模型价格」跳转定价列表并按该服务商筛选', async () => {
      await pp.gotoProvidersPage(page);
      await pp.providerTable(page).expectRowVisible(providerName);
      await pp.clickViewModelPrices(page, providerName);

      // 跳转 ModelPrice.list 并携带 query.provider，不携带 autoView
      await expect(page).toHaveURL(/\/model-prices/, { timeout: 15000 });
      expect(page.url()).toContain(
        'provider=' + encodeURIComponent(providerName),
      );
      expect(page.url()).not.toContain('autoView');

      // 列表按该服务商筛选，数据行展示该定价记录
      //（按模型名定位数据行：搜索行 provider 下拉已选值与数据行同文，按服务商名
      //  断言会命中搜索行造成 strict mode 冲突）
      await mp.expectProviderFilterSelected(page, providerName);
      await mp.modelPriceTable(page).expectRowVisible(MODEL_V3);

      // 不打开定价详情
      await mp.expectViewScopeHidden(page);
    });
  });

  test('PR-LINK-02 集群大模型配置-所属服务商下拉出现该服务商且选中后拉取详情', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await utils.gotoBusinessClusterManagementPage(page);

    await test.step('1. 进入创建向导第 4 步「大模型配置」，展开「所属服务商」下拉', async () => {
      // 分步拉取：进入抽屉即请求 GET /providers/actions/get-provider-names
      const namesReq = page.waitForResponse(
        (r) =>
          r.url().includes('/providers/actions/get-provider-names') &&
          r.request().method() === 'GET',
        { timeout: 15000 },
      );
      await utils.openCreateBusinessClusterDrawer(page);
      await utils.navigateToModelStep(page, clusterName);
      await namesReq;

      // 下拉选项来自 get-provider-names，包含该服务商
      await utils.expectProviderFieldVisible(page);
      await utils.expectProviderDropdownOptions(page, [providerName]);
    });

    await test.step('2. 选择该服务商后调用 GET /providers/{name} 拉取详情', async () => {
      const detailReq = page.waitForResponse(
        (r) =>
          r.url().includes(
            '/open-api/v1/providers/' + encodeURIComponent(providerName),
          ) &&
          r.request().method() === 'GET',
        { timeout: 15000 },
      );
      await utils.selectProvider(page, providerName);
      const detailResp = await detailReq;
      expect(detailResp.status()).toBe(200);
    });

    // 未提交集群，关闭抽屉（不造集群数据）
    await utils.cancelCreateBusinessCluster(page);
    await utils.expectCreateBusinessClusterDrawerHidden(page);
  });

  test('PR-LINK-03 集群转发模型选择服务商探测模型-子集与全选并提交集群', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);
    const providerModels = [MODEL_LINK03_A, MODEL_LINK03_B, MODEL_LINK03_C];
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: { models: providerModels },
    });

    await utils.gotoBusinessClusterManagementPage(page);
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);

    await test.step('1. 转发模型选项为该服务商探测模型，支持选择子集', async () => {
      // 选择 2/3 个模型：所选模型为服务商模型的子集
      await utils.selectForwardModels(page, [MODEL_LINK03_A, MODEL_LINK03_B]);
      await utils.expectSelectedForwardModels(page, [
        MODEL_LINK03_A,
        MODEL_LINK03_B,
      ]);
    });

    await test.step('2. 支持「全选」：选中该服务商全部模型', async () => {
      await utils.selectAllForwardModels(page);
      await utils.expectSelectedForwardModels(page, providerModels);
    });

    await test.step('3. 提交集群：llm_config 与服务商数据一致', async () => {
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.provider).toBe(providerName);
      expect([...body.llm_config.models].sort()).toEqual(
        [...providerModels].sort(),
      );

      // 打开引用集群详情（UI 步骤），详情/数据与服务商模型一致按 API 断言
      // （偏差记录：集群详情 Review 不展示实例池/模型明细，引用关系经 API 验证）
      const cluster = await resourceApi.getCluster(page, clusterName);
      expect(cluster).not.toBeNull();
      expect(cluster.llm_config.provider).toBe(providerName);
      expect([...cluster.llm_config.models].sort()).toEqual(
        [...providerModels].sort(),
      );

      await utils.openBusinessClusterDetail(page, clusterName);
      await utils.closeBusinessClusterDetail(page);
    });
  });

  test('PR-LINK-04 集群Keys引用服务商keys-下拉仅名称不含明文且提交体仅name+weight', async ({
    page,
  }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({
      page,
      cleanup: providerCleanup,
      overrides: {
        models: [MODEL_CHAT],
        keys: [
          { name: KEY_PRIMARY, key: 'sk-primary-secret' },
          { name: KEY_SECONDARY, key: 'sk-secondary-secret' },
        ],
      },
    });

    await utils.gotoBusinessClusterManagementPage(page);
    await utils.openCreateBusinessClusterDrawer(page);
    await utils.navigateToModelStep(page, clusterName);
    await utils.selectProvider(page, providerName);
    await utils.selectForwardModels(page, [MODEL_CHAT]);

    await test.step('1. Keys 行「服务商 Key」下拉选项为 key 名称，不含 key 值明文', async () => {
      const options = await utils.getModelKeyRowOptions(page, 0);
      expect(options).toEqual([KEY_PRIMARY, KEY_SECONDARY]);
      expect(options).not.toContain('sk-primary-secret');
      expect(options).not.toContain('sk-secondary-secret');
    });

    await test.step('2. 提交集群：llm_config.keys 仅含 name + weight，无 key 明文', async () => {
      await utils.fillModelKeyRow(page, 0, { name: KEY_PRIMARY, weight: 100 });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.llm_config.provider).toBe(providerName);
      expect(body.llm_config.keys).toEqual([
        { name: KEY_PRIMARY, weight: 100 },
      ]);
      expect(body.llm_config.keys[0].key).toBeUndefined();
    });
  });

  test('PR-LINK-05 修改服务商实例池后引用集群实例池同步-被引用Key重命名被409拦截', async ({
    page,
  }) => {
    const providerName = uniqueName('provider');
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);

    // 前置：服务商实例池当前为 1 个实例，已被集群引用（含 Keys 引用）
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-跨模块联动-实例池同步',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [MODEL_CHAT],
      keys: [{ name: KEY_PRIMARY, key: 'sk-primary-secret' }],
      instance_pool: [{ addr: '10.10.0.1', port: 443, weight: 100 }],
    });
    expect(data, 'API 造数服务商应成功').not.toBeNull();
    providerCleanup.trackName(providerName);
    await createReferencingCluster(
      page,
      clusterName,
      providerName,
      [MODEL_CHAT],
      [{ name: KEY_PRIMARY, weight: 100 }],
    );

    const newInstances = [
      { addr: '10.10.0.1', port: 443, weight: 60 },
      { addr: '10.10.0.2', port: 443, weight: 40 },
    ];

    await test.step('1. UI 编辑服务商：新增一个实例并修改权重，提交成功', async () => {
      await pp.gotoProvidersPage(page);
      await pp.providerTable(page).expectRowVisible(providerName);
      await pp.openEditDrawer(page, providerName);

      // 编辑抽屉回填当前 1 行实例
      await pp.expectInstanceRowCount(page, 1);
      await pp.fillInstanceRow(page, 0, { weight: 60 });
      await pp.addInstanceRow(page);
      await pp.fillInstanceRow(page, 1, {
        addr: '10.10.0.2',
        port: 443,
        weight: 40,
      });
      await pp.expectInstanceRowCount(page, 2);

      const response = await pp.submitEditAndWait(page);
      const patchBody = response.request().postDataJSON();
      expect(patchBody.instance_pool).toHaveLength(2);

      // 服务商更新成功：GET /providers/{name} 返回最新实例池
      const provider = await api.getProviderViaApi(page, providerName);
      expect(provider).not.toBeNull();
      expect(normalizeInstances(provider.instance_pool)).toEqual(newInstances);
    });

    await test.step('2. 后端同步：引用集群的派生实例池随之更新（无需重新编辑集群）', async () => {
      // 偏差记录：OpenAPI v1 的 product instance-pool 读接口已下线
      //（optimization plan v1.2，运行时 404），集群 GET/详情也不返回实例池；
      // 同步效果改经 InnerAPI cluster_table 导出中该集群的 RS 后端条目观测——
      // 后端 ProviderInstancePoolSyncer 刷新派生实例池后，导出即反映新实例。
      const clusterTable = await resourceApi.getClusterTableViaApi(page);
      expect(clusterTable, 'cluster_table 导出应存在').not.toBeNull();
      const backends =
        (clusterTable.Config && clusterTable.Config[clusterName]
          ? clusterTable.Config[clusterName][clusterName]
          : null) || [];
      const synced = normalizeInstances(
        backends.map((b) => ({ addr: b.Addr, port: b.Port, weight: b.Weight })),
      );
      expect(synced, '引用集群 RS 条目应与服务商新实例池一致').toEqual(
        newInstances,
      );
    });

    await test.step('3. 打开引用集群详情（UI 步骤）', async () => {
      // 偏差记录：集群详情（Review）不展示实例池，同步效果已在上一步经派生
      // 实例池 API 断言；此处仅执行「打开引用集群详情」的用户路径
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.openBusinessClusterDetail(page, clusterName);
      await utils.closeBusinessClusterDetail(page);
    });

    await test.step('4. 联动校验：重命名被集群引用的 Key 被 409 拦截，引用不变', async () => {
      // 偏差记录：02 预期「name 变更后引用集群 Keys 一并更新」，实际后端
      // ProviderKeyRefChecker 对重命名/移除被引用 Key 返回 409（事务回滚），
      // 联动表现为拦截 + 集群引用不变
      const provider = await api.getProviderViaApi(page, providerName);
      const renamedPayload = {
        description: provider.description,
        model_protocols: provider.model_protocols,
        model_endpoint: provider.model_endpoint,
        models: provider.models,
        keys: [{ name: 'key-renamed', key: 'sk-primary-secret' }],
        instance_pool: provider.instance_pool,
      };
      const result = await api.updateProviderRawViaApi(
        page,
        providerName,
        renamedPayload,
      );
      expect(result.ok).toBe(false);
      expect(result.body.ErrNum).toBe(409);

      // 事务回滚：服务商 Keys 未被重命名
      const after = await api.getProviderViaApi(page, providerName);
      expect(after.keys.map((k) => k.name)).toEqual([KEY_PRIMARY]);

      // 集群配置不受影响：仍引用原 Key 名称
      const cluster = await resourceApi.getCluster(page, clusterName);
      expect(cluster.llm_config.keys.map((k) => k.name)).toEqual([
        KEY_PRIMARY,
      ]);
    });
  });

  test('PR-LINK-06 查询模型价格直达-无记录时提示且不打开详情', async ({
    page,
  }) => {
    const providerName = await createProvider({ page, cleanup: providerCleanup });

    await test.step('1. 服务商列表点击「查询模型价格」', async () => {
      await pp.gotoProvidersPage(page);
      await pp.providerTable(page).expectRowVisible(providerName);
      // 偏差记录：模型定价页 provider 下拉选项来自已有定价记录的 provider 集合
      //（fetchProviderOptions 读取 model-prices），无记录的 provider 不在选项中，
      // 下拉无法回显该值；provider 筛选实际已生效——经列表请求查询参数断言。
      const listResponsePromise = page.waitForResponse(
        (r) =>
          r.url().includes('/open-api/v1/model-prices') &&
          new URL(r.url()).searchParams.get('provider') === providerName,
        { timeout: 15000 },
      );
      await pp.clickViewModelPrices(page, providerName);

      // 跳转 provider={name}，不携带 autoView
      await expect(page).toHaveURL(/\/model-prices/, { timeout: 15000 });
      expect(page.url()).toContain(
        'provider=' + encodeURIComponent(providerName),
      );
      expect(page.url()).not.toContain('autoView');

      const listResponse = await listResponsePromise;
      expect(listResponse.status(), '列表请求应携带 provider 筛选').toBe(200);
      const listBody = await listResponse.json();
      expect(listBody.Data.list || [], '该提供商应无定价记录').toHaveLength(0);
    });

    await test.step('2. 无定价记录：提示「未找到提供商 {name} 的模型定价」，不打开详情', async () => {
      await mp.expectNoPricingForProvider(page, providerName);
      await mp.expectViewScopeHidden(page);
    });
  });

  test('PR-LINK-07 删除被集群引用的服务商被联动保护-409拦截且服务商保留', async ({
    page,
  }) => {
    const providerName = uniqueName('provider');
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);

    // 前置：服务商已被集群 llm_config.provider 引用
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      // 描述不得包含「引用/referenced」等断言关键词，避免消息断言假通过
      description: '自动化测试-跨模块联动-删除保护',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [MODEL_CHAT],
      keys: [],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data, 'API 造数服务商应成功').not.toBeNull();
    providerCleanup.trackName(providerName);
    await createReferencingCluster(page, clusterName, providerName, [
      MODEL_CHAT,
    ]);

    await test.step('1. UI 删除该服务商并确认：DELETE 返回 409', async () => {
      await pp.gotoProvidersPage(page);
      await pp.providerTable(page).expectRowVisible(providerName);
      await pp.clickDelete(page, providerName);
      await pp.expectDeleteConfirm(page, providerName);

      const response = await pp.confirmDeleteAndWaitForStatus(page, {
        status: 409,
      });
      expect(response.status()).toBe(409);

      // 偏差记录：后端 409 ErrMsg 为英文，前端 $Message.error 直接展示英文原文
      //（预期中文「该服务商已被集群引用，无法删除」，见 PR-DEL-02 记录）
      await pp.expectMessageContaining(page, 'referenced by cluster');
    });

    await test.step('2. 联动保护：服务商保留，集群配置不受影响', async () => {
      // 服务商仍存在（列表行可见 + API 可查）
      await pp.providerTable(page).expectRowVisible(providerName);
      const provider = await api.getProviderViaApi(page, providerName);
      expect(provider).not.toBeNull();

      // 集群不受影响：仍引用该服务商
      const cluster = await resourceApi.getCluster(page, clusterName);
      expect(cluster).not.toBeNull();
      expect(cluster.llm_config.provider).toBe(providerName);
    });
  });

  test('PR-LINK-08 删除服务商后模型定价记录保留-软关联不级联删除', async ({
    page,
  }) => {
    const providerName = uniqueName('provider');
    const model = 'qa-link08-model';

    await test.step('1. 前置：服务商未被集群引用，但存在同名 provider 的定价记录', async () => {
      const data = await api.createProviderViaApi(page, {
        name: providerName,
        description: '自动化测试-跨模块联动-删除后定价保留',
        model_protocols: ['openai'],
        model_endpoint: { schema: 'https', uri: '/v1/models' },
        models: [model],
        keys: [],
        instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
      });
      expect(data, 'API 造数服务商应成功').not.toBeNull();
      providerCleanup.trackName(providerName);

      const created = await modelPriceApi.createModelPriceViaApi(page, {
        provider: providerName,
        model,
        base_model: model,
        mode: MODE_CHAT,
        prices: { input_cost_per_token: 0.00001 },
      });
      expect(created, 'POST /model-prices 创建成功').not.toBeNull();
      mpCleanup.trackCombo(providerName, model, MODE_CHAT);
    });

    await test.step('2. UI 删除服务商成功（同名定价记录不阻塞）', async () => {
      await pp.gotoProvidersPage(page);
      await pp.providerTable(page).expectRowVisible(providerName);
      await pp.clickDelete(page, providerName);
      await pp.expectDeleteConfirm(page, providerName);
      const response = await pp.confirmDeleteAndWait(page, providerName);
      expect((await response.json()).ErrNum).toBe(200);
      await pp.providerTable(page).expectRowHidden(providerName, 15000);
    });

    await test.step('3. 模型定价记录保留：列表可查且 API 记录仍在', async () => {
      // 列表按模型名查询：记录仍展示，provider 列保留已删除的服务商名
      await mp.gotoModelPricePage(page);
      await mp.searchField(page, 'model', model);
      await mp.modelPriceTable(page).expectRowVisible(providerName);

      // API：软关联记录仍存在（计费/归集标识不丢失）
      const stillExists = await modelPriceApi.findModelPriceByComboViaApi(
        page,
        providerName,
        model,
        MODE_CHAT,
      );
      expect(stillExists).not.toBeNull();
    });
  });
});
