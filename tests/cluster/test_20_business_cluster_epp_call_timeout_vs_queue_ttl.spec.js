// ===== RM-BC-124 调用超时 vs 队列 TTL 跨字段校验（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-2）=====
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
 * AI业务集群 - 调用超时 vs 队列 TTL 跨字段校验（RM-BC-124，2026-11-02 前端新增）
 *
 * 背景：api 文档未定义该约束（timeout.call 仅要求 >0 的合法 duration），本次为
 * 纯前端新增校验（ai-gateway-web design-docs/modifications/
 * 2026-11-02-cluster-epp-ui-copy-and-call-timeout-check）：
 * - 仅 balance_mode=EPP 时生效，WRR（含休眠保留的 epp_runtime）不校验；
 * - 调用超时（按 Go duration 解析）须「严格大于」max(队列 TTL, 无端点队列 TTL) 秒；
 * - TTL 留空按默认 9 计，无端点 TTL 留空跟随队列 TTL；
 * - 两个 TTL 均为 0（显式禁用驱逐）时不约束；
 * - 调用超时留空按默认 11s 参与比较；
 * - 2026-11-11 默认值调整（api：queue_ttl/no_endpoint_queue_ttl 9s、timeout.call 11s）后，
 *   默认组合本身合法（11 > 9），原「默认值被拦截」用例改为显式填入 TTL 60 构造拦截，
 *   并新增「默认值组合可直接提交」用例；
 * - 修改任一 TTL 字段后立即重新校验调用超时（change 触发）。
 *
 * 本文件同时覆盖 2026-11-02 文案更名断言：「在飞请求数过滤阈值」→「执行中请求数过滤阈值」
 *（i18n zh.js runningRequestsMax/runningRequestsMaxTip/runningRequestsMaxInvalid）。
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02b-向导步骤.md §2b-2）：
 * - 用例一（创建向导）：默认值拦截、等于最大值仍拦截（严格大于）、TTL 调大后错误
 *   即时更新（max 取两者）、调大调用超时后通过并提交体正确、双 0 豁免、文案更名断言。
 * - 用例二（WRR 豁免）：休眠保留 epp_runtime（call=3s）+ flow_control TTL=60 的 WRR
 *   集群，编辑直达复查页不受跨字段校验拦截。
 *
 * 造数：通过 api/provider-api-utils 的 createProviderViaApi 创建服务商
 * （命名前缀 provider_<ts>，afterEach 清理）。
 *
 * 运行：npx playwright test tests/cluster/test_20_business_cluster_epp_call_timeout_vs_queue_ttl.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resApi = require('../../api/resource-api-utils');

const MODEL_A1 = 'Qwen/Qwen2.5-3B-Instruct';

const DOC = utils.DOC_BUSINESS_CLUSTER;
const EPP_MODE = 'EPP';
const WRR_MODE = 'WRR';

let nameSeq = 0;

function uniqueProviderName() {
  nameSeq += 1;
  return 'provider_' + Date.now().toString(36) + '_' + nameSeq;
}

// 跨字段校验错误文案（{max} 替换为 TTL 最大值）
function callTimeoutVsQueueTtlMsg(max) {
  return DOC.eppCallTimeoutVsQueueTtlMsgTemplate.replace('{max}', String(max));
}

async function createProvider({ page, cleanup, overrides = {} }) {
  const name = uniqueProviderName();
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-调用超时跨字段校验',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_A1],
    keys: [],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

async function navigateToModelStep(page, clusterName) {
  await utils.openCreateBusinessClusterDrawer(page);
  await utils.fillBasicStep(page, { clusterName, protocol: 'https' });
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.expectWizardStep(page, '大模型配置');
}

async function fillProviderAndModels(page, providerName) {
  await utils.selectProvider(page, providerName);
  await utils.selectForwardModels(page, [MODEL_A1]);
}

// 打开编辑向导向导第 4 步「大模型配置」（先确保数据行可见）
async function navigateToEditModelStep(page, clusterName) {
  await utils.ensureBusinessClusterRowVisible(page, clusterName);
  await utils.openEditBusinessClusterDrawer(page, clusterName);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.clickWizardNext(page);
  await utils.expectWizardStep(page, '大模型配置', utils.DRAWER_TITLE.editBusinessCluster);
}

// 构造 API 造数用的集群请求体（结构与 test_17 一致），overrides 覆盖顶层字段
function buildClusterPayload(clusterName, providerName, overrides = {}) {
  return {
    name: clusterName,
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
    ...overrides,
  };
}

// 合法的完整 epp_config（v0.6 字段）
function validEppConfig(overrides = {}) {
  return {
    load_profile: 'balanced',
    affinity: 'medium',
    prefix_cache_affinity: true,
    session_affinity_enabled: false,
    session_affinity_header: 'x-session-id',
    kv_cache_utilization_max: 0.9,
    waiting_queue_max: 0,
    running_requests_max: 0,
    fallback_on_empty: false,
    metrics_staleness_threshold_ms: 200,
    flow_control: {
      max_requests: -1,
      queue_ttl: 60,
      no_endpoint_queue_ttl: 60,
      enable_eviction: false,
    },
    ...overrides,
  };
}

async function createClusterViaApi(page, cleanup, providerName, overrides = {}) {
  const name = utils.generateTestBusinessClusterName();
  const { status, body } = await resApi.createClusterWithResponse(
    page,
    buildClusterPayload(name, providerName, overrides),
  );
  expect(status, `API 造数集群应创建成功：${JSON.stringify(body)}`).toBe(200);
  cleanup.trackBusinessCluster(name);
  return name;
}

test.describe('AI业务集群 - RM-BC-124 调用超时 vs 队列 TTL 跨字段校验', () => {
  const ctx = {};

  test.beforeEach(async ({ page }) => {
    ctx.cleanup = utils.createResourceTestCleanup();
    ctx.providerCleanup = api.createProviderTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    // 先删集群再删服务商：集群引用中的 provider 被引用时删除会 409
    await ctx.cleanup.cleanup(page);
    await ctx.providerCleanup.cleanup(page);
  });

  test('验证 EPP 模式下调用超时须大于 TTL 最大值、边界与豁免及文案更名', async ({
    page,
  }) => {
    test.setTimeout(300000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, EPP_MODE);
    await fillProviderAndModels(page, providerName);

    await test.step('0. 文案更名：准入水位显示「执行中请求数过滤阈值」，旧文案不残留', async () => {
      const values = await utils.getEppConfigValues(page);
      expect(
        values.runningRequestsMax,
        '「执行中请求数过滤阈值」输入框应按新文案定位到并读出默认值',
      ).not.toBeNull();
      await expect(
        page.getByText('执行中请求数过滤阈值'),
        '新文案「执行中请求数过滤阈值」应可见',
      ).toBeVisible();
      await expect(
        page.getByText('在飞请求数过滤阈值'),
        '旧文案「在飞请求数过滤阈值」不应再出现',
      ).toHaveCount(0);
    });

    await test.step('1. 显式填 TTL 60/60、调用超时 3s：点下一步被拦截，提示最大值 60 秒', async () => {
      // 2026-11-11 起默认组合（9/9 + 11s）本身合法，这里显式构造非法组合验证拦截
      await utils.fillFlowControlNumber(page, DOC.queueTtlLabel, 60);
      await utils.fillFlowControlNumber(page, DOC.noEndpointQueueTtlLabel, 60);
      await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
        value: '3',
        unit: 's',
      });
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '大模型配置');
      await utils.expectEppRuntimeFieldError(
        page,
        DOC.eppCallTimeoutLabel,
        callTimeoutVsQueueTtlMsg(60),
      );
    });

    await test.step('2. 调用超时改为 60s（等于最大值）：仍拦截（须严格大于）', async () => {
      await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
        value: '60',
        unit: 's',
      });
      await utils.expectEppRuntimeFieldError(
        page,
        DOC.eppCallTimeoutLabel,
        callTimeoutVsQueueTtlMsg(60),
      );
    });

    await test.step('3. 无端点队列 TTL 调为 120：错误即时更新为最大值 120 秒', async () => {
      await utils.fillFlowControlNumber(
        page,
        DOC.noEndpointQueueTtlLabel,
        120,
      );
      await utils.expectEppRuntimeFieldError(
        page,
        DOC.eppCallTimeoutLabel,
        callTimeoutVsQueueTtlMsg(120),
      );
    });

    await test.step('4. 调用超时改为 121s：校验通过，进入复查页并提交成功', async () => {
      await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
        value: '121',
        unit: 's',
      });
      await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCallTimeoutLabel);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.epp_runtime.timeout.call, '提交体 timeout.call').toBe('121s');
      expect(body.epp_config.flow_control.no_endpoint_queue_ttl).toBe(120);
      expect(body.epp_config.flow_control.queue_ttl).toBe(60);
    });

    await test.step('5. 双 0 豁免：队列/无端点 TTL 均 0、调用超时 3s 可提交', async () => {
      const clusterName2 = utils.generateTestBusinessClusterName();
      ctx.cleanup.trackBusinessCluster(clusterName2);
      await navigateToModelStep(page, clusterName2);
      await utils.setBalanceMode(page, EPP_MODE);
      await fillProviderAndModels(page, providerName);
      await utils.fillFlowControlNumber(page, DOC.queueTtlLabel, 0);
      await utils.fillFlowControlNumber(page, DOC.noEndpointQueueTtlLabel, 0);
      await utils.fillEppRuntimeDuration(page, DOC.eppCallTimeoutLabel, {
        value: '3',
        unit: 's',
      });
      await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCallTimeoutLabel);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.epp_runtime.timeout.call, '提交体 timeout.call').toBe('3s');
      expect(body.epp_config.flow_control.queue_ttl).toBe(0);
      expect(body.epp_config.flow_control.no_endpoint_queue_ttl).toBe(0);
    });
  });

  test('默认值组合（TTL 9/9、调用超时 11s）合法：不调参即可提交', async ({ page }) => {
    test.setTimeout(240000);
    const clusterName = utils.generateTestBusinessClusterName();
    ctx.cleanup.trackBusinessCluster(clusterName);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    await navigateToModelStep(page, clusterName);
    await utils.setBalanceMode(page, EPP_MODE);
    await fillProviderAndModels(page, providerName);

    const readFlow = async (label) => {
      const item = utils
        .flowControlCard(page)
        .locator('.ivu-form-item')
        .filter({ hasText: label })
        .first();
      return (await item.locator('input').first().inputValue()).trim();
    };

    await test.step('1. 默认值：队列 TTL / 无端点队列 TTL = 9，调用超时 = 11s', async () => {
      expect(await readFlow(DOC.queueTtlLabel), '队列 TTL 默认 9').toBe('9');
      expect(
        await readFlow(DOC.noEndpointQueueTtlLabel),
        '无端点队列 TTL 默认 9',
      ).toBe('9');
      const runtime = await utils.getEppRuntimeValues(page);
      expect(runtime.callTimeout, '调用超时默认 11 + s').toEqual({
        value: '11',
        unit: 's',
        raw: false,
      });
      await utils.expectEppRuntimeFieldErrorHidden(page, DOC.eppCallTimeoutLabel);
    });

    await test.step('2. 直接下一步：默认组合满足 11 > max(9,9)，进入复查页', async () => {
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查');
    });

    await test.step('3. 提交体：queue_ttl=9、no_endpoint_queue_ttl=9、timeout.call=11s', async () => {
      const request = await utils.waitForClusterCreateRequest(page, () =>
        utils.clickWizardSubmit(page),
      );
      const body = request.postDataJSON();
      expect(body.epp_config.flow_control.queue_ttl).toBe(9);
      expect(body.epp_config.flow_control.no_endpoint_queue_ttl).toBe(9);
      expect(body.epp_runtime.timeout.call).toBe('11s');
    });
  });

  test('验证 WRR 模式下休眠保留的 epp_runtime 不受跨字段校验', async ({ page }) => {
    test.setTimeout(300000);
    const providerName = await createProvider({ page, cleanup: ctx.providerCleanup });
    // WRR 集群 + 休眠保留 epp_config（TTL 60/60）与 epp_runtime（call=3s）：
    // 若跨字段校验误作用于 WRR，3s < 60s 将被拦截
    const clusterName = await createClusterViaApi(page, ctx.cleanup, providerName, {
      balance_mode: WRR_MODE,
      epp_config: validEppConfig(),
      epp_runtime: {
        check: {
          disabled: false,
          check_interval: '2s',
          fail_threshold: 3,
          cooldown: '45s',
          success_threshold: 2,
        },
        timeout: { connect: '500ms', call: '3s' },
      },
    });
    // API 造数后须刷新列表：UI 列表仅在页面加载/增删后拉取 GET /clusters（pageTable 列
    // 筛选为前端口径），否则 ensureBusinessClusterRowVisible 搜不到新行（同 test_17）
    await utils.refreshBusinessClusterList(page);

    await navigateToEditModelStep(page, clusterName);

    await test.step('1. WRR 下 EPP 运行时卡片隐藏，直达复查页不被跨字段校验拦截', async () => {
      expect(await utils.getBalanceModeValue(page, utils.DRAWER_TITLE.editBusinessCluster)).toBe(
        WRR_MODE,
      );
      await utils.expectEppRuntimeCardHidden(page, utils.DRAWER_TITLE.editBusinessCluster);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '复查&检查', utils.DRAWER_TITLE.editBusinessCluster);
    });
  });
});
