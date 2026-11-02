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
 * 长链路配置场景用例（SC-L-01 / SC-L-02，docs/跨模块横切用例.md H-4 族）
 *
 * 设计背景（docs/跨模块横切用例.md H-4）：把「一次配置变更在 3+ 模块间的传播
 * 与一致性」固化为用例，弥补既有用例只覆盖单模块/双模块联动的空白。
 *
 * - SC-L-01 服务商实例池变更传播链（providers → cluster → route → operation-logs）：
 *   UI 编辑服务商实例池 → 引用集群派生实例池同步（cluster_table 导出断言）→
 *   全局路由规则不受影响 → 操作日志留痕。
 *   复用 PR-LINK-05 的造数/同步断言模式（tests/providers/test_07_provider_linkage.spec.js），
 *   链路延伸点为「路由配置不变」与「操作日志」两站。
 * - SC-L-02 引用解除与级联删除链（route → cluster → provider → operation-logs）：
 *   删服务商被集群引用拦截（409 含引用方）→ 删集群被路由规则引用拦截（409 含规则名）
 *   → 改全局规则目标集群 → 级联删除成功 → 派生实例池级联消失 → 操作日志链完整。
 *
 * 造数/清理：服务商/集群 API 造数（唯一命名），全局路由规则走
 * routeApi.createRouteTestCleanup 快照恢复；afterEach 按
 * 「路由规则 → 集群 → 服务商」顺序清理。
 *
 * 运行：npx playwright test tests/providers/test_10_provider_scenario_chains.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const utils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resourceApi = require('../../api/resource-api-utils');
const routeApi = require('../../api/route-api-utils');
const logApi = require('../../api/operation-log-api-utils');

const MODEL_CHAT = 'deepseek-chat';

/** 归一化实例列表（忽略后端附加字段），跨模块比较服务商实例池与集群派生实例池 */
function normalizeInstances(instances) {
  return (instances || [])
    .map((it) => ({
      addr: it.addr !== undefined ? it.addr : it.Addr,
      port: Number(it.port !== undefined ? it.port : it.Port),
      weight: Number(it.weight !== undefined ? it.weight : it.Weight),
    }))
    .sort((a, b) => a.addr.localeCompare(b.addr) || a.port - b.port);
}

/** 取集群派生实例池的 RS 条目并归一化（cluster_table 导出 Config[C][C]） */
function clusterBackends(clusterTable, clusterName) {
  const backends =
    (clusterTable.Config && clusterTable.Config[clusterName]
      ? clusterTable.Config[clusterName][clusterName]
      : null) || [];
  return normalizeInstances(
    backends.map((b) => ({ addr: b.Addr, port: b.Port, weight: b.Weight })),
  );
}

async function createProviderWithCleanup(page, cleanup, overrides = {}) {
  const name = 'provider_scl_' + Date.now().toString(36) + '_' + (createProviderWithCleanup.seq = (createProviderWithCleanup.seq || 0) + 1);
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-长链路场景',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL_CHAT],
    keys: [],
    instance_pool: [{ addr: '10.10.0.1', port: 443, weight: 100 }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return name;
}

/** 全局路由规则「读-改-写」：在现有规则集上追加/替换一条指向目标集群的规则 */
async function upsertGlobalRuleTargeting(page, ruleName, clusterName, model) {
  const current = await routeApi.getGlobalRouteRulesViaApi(page);
  const rules = (current?.rules || []).filter((r) => r.name !== ruleName);
  rules.push({
    name: ruleName,
    cond: 'default_t()',
    targets: [{ cluster_name: clusterName, model, weight: 100 }],
    fallbacks: [],
  });
  const ok = await routeApi.setGlobalRouteRulesViaApi(page, {
    enabled: current?.enabled === true,
    rules,
  });
  expect(ok, '全局路由规则追加应成功').toBe(true);
}

test.describe('长链路场景 - 服务商/集群/路由配置链 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  let resourceCleanup;
  let providerCleanup;
  let routeCleanup;

  test.beforeEach(async ({ page }) => {
    resourceCleanup = utils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    routeCleanup = routeApi.createRouteTestCleanup();
    await routeCleanup.saveGlobalRouteRulesOriginalState(page);
  });

  test.afterEach(async ({ page }) => {
    // 先恢复全局路由规则（解除集群引用），再删集群（级联删派生实例池），最后删服务商
    await routeCleanup.cleanup(page);
    await resourceCleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('SC-L-01 服务商实例池变更传播链：改实例池→集群同步→路由不变→日志留痕', async ({
    page,
  }) => {
    const providerName = await createProviderWithCleanup(page, providerCleanup);
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);
    const ruleName = 'scl01_rule_' + Date.now().toString(36);

    await test.step('前置：引用集群 + 全局规则指向该集群', async () => {
      expect(
        await resourceApi.createProviderReferencingCluster(page, {
          name: clusterName,
          provider: providerName,
          models: [MODEL_CHAT],
        }),
        'API 造数引用集群应成功',
      ).toBe(true);
      await upsertGlobalRuleTargeting(page, ruleName, clusterName, MODEL_CHAT);
    });

    const newInstances = [
      { addr: '10.10.0.1', port: 443, weight: 60 },
      { addr: '10.10.0.2', port: 443, weight: 40 },
    ];

    await test.step('1.（providers）UI 编辑服务商实例池：改权重并新增实例，提交成功', async () => {
      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
      await pp.openEditDrawer(page, providerName);
      await pp.expectInstanceRowCount(page, 1);
      await pp.fillInstanceRow(page, 0, { weight: 60 });
      await pp.addInstanceRow(page);
      await pp.fillInstanceRow(page, 1, {
        addr: '10.10.0.2',
        port: 443,
        weight: 40,
      });
      const response = await pp.submitEditAndWait(page);
      expect(response.request().postDataJSON().instance_pool).toHaveLength(2);

      const provider = await api.getProviderViaApi(page, providerName);
      expect(normalizeInstances(provider.instance_pool)).toEqual(newInstances);
    });

    await test.step('2.（cluster）变更传播：引用集群派生实例池同步为新实例池', async () => {
      const clusterTable = await resourceApi.getClusterTableViaApi(page);
      expect(clusterTable, 'cluster_table 导出应存在').not.toBeNull();
      expect(clusterBackends(clusterTable, clusterName)).toEqual(newInstances);
    });

    await test.step('3.（route）变更隔离：全局路由规则不受影响，仍指向该集群', async () => {
      const current = await routeApi.getGlobalRouteRulesViaApi(page);
      const rule = (current?.rules || []).find((r) => r.name === ruleName);
      expect(rule, '全局规则应仍存在').toBeTruthy();
      expect(rule.targets.map((t) => t.cluster_name)).toEqual([clusterName]);
      expect(rule.targets.map((t) => t.model)).toEqual([MODEL_CHAT]);
    });

    await test.step('4.（operation-logs）操作日志：服务商更新留痕', async () => {
      const log = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'update' && item.resource_name === providerName,
        { resource_name: providerName },
      );
      expect(log, '应存在服务商更新的操作日志').not.toBeNull();
    });
  });

  test('SC-L-02 引用解除与级联删除链：路由→集群→服务商依次解锁并删除，日志链完整', async ({
    page,
  }) => {
    const providerName = await createProviderWithCleanup(page, providerCleanup);
    const clusterName = utils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);
    const ruleName = 'scl02_rule_' + Date.now().toString(36);
    const fallbackCluster = 'test';

    await test.step('前置：服务商←集群←全局规则三层引用', async () => {
      // 先导航到产品页（确立会话域，后续 raw DELETE 才能读 localStorage 取 session）
      await pp.gotoProvidersPage(page);
      expect(
        await resourceApi.createProviderReferencingCluster(page, {
          name: clusterName,
          provider: providerName,
          models: [MODEL_CHAT],
        }),
        'API 造数引用集群应成功',
      ).toBe(true);
      await upsertGlobalRuleTargeting(page, ruleName, clusterName, MODEL_CHAT);
    });

    await test.step('1. 删服务商被集群引用拦截（409，文案含集群名）', async () => {
      const r = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/providers/' + encodeURIComponent(providerName),
        { headers: { Authorization: 'Session ' + (await logApiGetSession(page)) } },
      );
      const body = await r.json();
      expect(body.ErrNum).toBe(409);
      expect(String(body.ErrMsg)).toContain(clusterName);
      // 拦截后服务商仍在
      expect(await api.getProviderViaApi(page, providerName)).not.toBeNull();
    });

    await test.step('2. 删集群被路由规则引用拦截（409，文案含规则名）', async () => {
      const r = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/clusters/' + encodeURIComponent(clusterName),
        { headers: { Authorization: 'Session ' + (await logApiGetSession(page)) } },
      );
      const body = await r.json();
      expect(body.ErrNum).toBe(409);
      expect(String(body.ErrMsg)).toContain(ruleName);
    });

    await test.step('3.（route）解除引用：全局规则目标改挂固定集群 test 并提交生效', async () => {
      const current = await routeApi.getGlobalRouteRulesViaApi(page);
      const rules = (current?.rules || []).map((r) =>
        r.name === ruleName
          ? { ...r, targets: [{ cluster_name: fallbackCluster, model: MODEL_CHAT, weight: 100 }] }
          : r,
      );
      const ok = await routeApi.setGlobalRouteRulesViaApi(page, {
        enabled: current?.enabled === true,
        rules,
      });
      expect(ok, '改挂目标集群应成功').toBe(true);
      const after = await routeApi.getGlobalRouteRulesViaApi(page);
      const rule = (after?.rules || []).find((r) => r.name === ruleName);
      expect(rule.targets.map((t) => t.cluster_name)).toEqual([fallbackCluster]);
    });

    await test.step('4.（cluster）解除引用后删集群成功，派生实例池级联消失', async () => {
      const r = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/clusters/' + encodeURIComponent(clusterName),
        { headers: { Authorization: 'Session ' + (await logApiGetSession(page)) } },
      );
      expect((await r.json()).ErrNum).toBe(200);
      const clusterTable = await resourceApi.getClusterTableViaApi(page);
      expect(
        clusterTable.Config && clusterTable.Config[clusterName],
        '集群删除后派生实例池应级联消失',
      ).toBeFalsy();
    });

    await test.step('5.（providers）再删服务商成功，列表不再出现', async () => {
      const r = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/providers/' + encodeURIComponent(providerName),
        { headers: { Authorization: 'Session ' + (await logApiGetSession(page)) } },
      );
      expect((await r.json()).ErrNum).toBe(200);
      expect(await api.getProviderViaApi(page, providerName)).toBeNull();
    });

    await test.step('6.（operation-logs）日志链：路由变更、集群删除、服务商删除均留痕', async () => {
      const routeLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'update' &&
          item.resource_type === 'route' &&
          item.resource_name === 'global',
        { resource_type: 'route' },
      );
      expect(routeLog, '应存在路由规则变更的操作日志').not.toBeNull();

      const clusterLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'delete' && item.resource_name === clusterName,
        { resource_name: clusterName },
      );
      expect(clusterLog, '应存在集群删除的操作日志').not.toBeNull();

      const providerLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'delete' && item.resource_name === providerName,
        { resource_name: providerName },
      );
      expect(providerLog, '应存在服务商删除的操作日志').not.toBeNull();
    });
  });
});

/** 从 localStorage 读当前会话 key（与 api-utils 的 getUserData 同口径） */
async function logApiGetSession(page) {
  return page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.sessionKey || u.session_key || '';
  });
}
