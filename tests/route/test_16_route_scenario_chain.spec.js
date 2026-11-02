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
 * 长链路场景 - SC-L-05 路由目标集群失效切换链（docs/跨模块横切用例.md H-4 族）
 *
 * 链路：cluster → route → cluster（恢复）。
 * 1.（cluster/route）前置：集群 C + 全局规则 R 指向 C（提交生效）
 * 2.（route 失效态构造）删 R → 删 C（200）→ 再加回 R 指向已不存在的 C：
 *    后端 PUT **不校验集群存在性**（200 接受悬空目标，2026-11-02 探针实测固化）
 * 3.（route 悬空展示口径）行内与详情抽屉目标原样展示「{C}/: 100%」，**无失效告警**
 *    （探针实测口径——产品对悬空目标无任何健康/存在性指示，如实固化）
 * 4.（cluster 恢复）重建同名集群 C：规则零修改自动重新「命中」（名字松耦合引用，
 *    GET 规则 targets 不变、UI 展示不变）
 * 5.（operation-logs）集群删除/重建 + 路由变更留痕
 *
 * 造数/清理：全局路由规则走 createRouteTestCleanup 快照恢复；
 * 集群 → 服务商顺序清理（引用的服务商一并造数删除）。
 *
 * 运行：npx playwright test tests/route/test_16_route_scenario_chain.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const resourceUtils = require('../../pages/resource/ResourcePage');
const api = require('../../api/provider-api-utils');
const resourceApi = require('../../api/resource-api-utils');
const routeApi = require('../../api/route-api-utils');
const logApi = require('../../api/operation-log-api-utils');

const MODEL = 'deepseek-chat';

test.describe('长链路场景 - SC-L-05 路由目标集群失效切换链 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  let resourceCleanup;
  let providerCleanup;
  let routeCleanup;

  test.beforeEach(async ({ page }) => {
    resourceCleanup = resourceUtils.createResourceTestCleanup();
    providerCleanup = api.createProviderTestCleanup();
    routeCleanup = routeApi.createRouteTestCleanup();
    await utils.ensureRouteTableModuleAvailable(page);
    await routeCleanup.saveGlobalRouteRulesOriginalState(page);
  });

  test.afterEach(async ({ page }) => {
    await routeCleanup.cleanup(page);
    await resourceCleanup.cleanup(page);
    await providerCleanup.cleanup(page);
  });

  test('集群删除后规则悬空→原样展示无告警→重建同名集群自动重新命中', async ({
    page,
  }) => {
    const providerName =
      'provider_scl05_' + Date.now().toString(36) + '_1';
    const clusterName = resourceUtils.generateTestBusinessClusterName();
    resourceCleanup.trackBusinessCluster(clusterName);
    const ruleName = 'scl05_rule_' + Date.now().toString(36);

    const createNamedCluster = (name) =>
      resourceApi.createProviderReferencingCluster(page, {
        name,
        provider: providerName,
        models: [MODEL],
        description: '自动化测试-长链路场景-失效切换',
      });

    const putRules = async (mutate) => {
      const current = await routeApi.getGlobalRouteRulesViaApi(page);
      const rules = mutate((current?.rules || []).slice());
      const ok = await routeApi.setGlobalRouteRulesViaApi(page, {
        enabled: current?.enabled === true,
        rules,
      });
      expect(ok, '全局路由规则写操作应成功').toBe(true);
    };

    await test.step('1.（cluster/route）前置：服务商+集群 C+全局规则 R 指向 C', async () => {
      const data = await api.createProviderViaApi(page, {
        name: providerName,
        description: '自动化测试-长链路场景-失效切换',
        model_protocols: ['openai'],
        model_endpoint: { schema: 'https', uri: '/v1/models' },
        models: [MODEL],
        keys: [],
        instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
      });
      expect(data, 'API 造数服务商应成功').not.toBeNull();
      providerCleanup.trackName(providerName);

      const created = await createNamedCluster(clusterName);
      expect(created, 'API 造数集群应成功').toBe(true);

      await putRules((rules) => [
        ...rules.filter((r) => r.name !== ruleName),
        {
          name: ruleName,
          cond: 'default_t()',
          targets: [{ cluster_name: clusterName, model: MODEL, weight: 100 }],
          fallbacks: [],
        },
      ]);
    });

    await test.step('2.（route 失效态）删 R→删 C→加回 R 指向悬空集群（后端不校验存在性）', async () => {
      await putRules((rules) => rules.filter((r) => r.name !== ruleName));
      // 集群删除走原始 DELETE
      const session = await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.sessionKey || u.session_key || '';
      });
      const r1 = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/clusters/' + encodeURIComponent(clusterName),
        { headers: { Authorization: 'Session ' + session } },
      );
      expect((await r1.json()).ErrNum).toBe(200);

      // 悬空目标：后端 PUT 200 接受（2026-11-02 探针实测）
      await putRules((rules) => [
        ...rules.filter((r) => r.name !== ruleName),
        {
          name: ruleName,
          cond: 'default_t()',
          targets: [{ cluster_name: clusterName, model: MODEL, weight: 100 }],
          fallbacks: [],
        },
      ]);
      const current = await routeApi.getGlobalRouteRulesViaApi(page);
      const rule = (current?.rules || []).find((r) => r.name === ruleName);
      expect(rule, '悬空目标规则应被后端接受').toBeTruthy();
      expect(rule.targets.map((t) => t.cluster_name)).toEqual([clusterName]);
    });

    await test.step('3.（route 悬空展示口径）行内与详情目标原样展示、无失效告警', async () => {
      await utils.openGlobalRouteTableDetail(page);
      const row = await utils.routeRuleRowByName(page, ruleName);
      const cells = await row.locator('td').allInnerTexts();
      const targetCell = cells[2] || '';
      expect(targetCell, '悬空目标应原样展示集群名').toContain(clusterName);

      const idx = await utils.routeRuleRowIndexByName(page, ruleName);
      await utils.openViewRuleDrawerByRowIndex(page, idx);
      const drawer = page.locator('.ivu-drawer:visible').last();
      const drawerText = (await drawer.innerText()).replace(/\s+/g, ' ');
      expect(drawerText).toContain(clusterName + '/');
      // 无失效告警口径：抽屉不出现「不存在/失效/异常」类提示（探针实测无告警）
      expect(drawerText).not.toContain('集群不存在');
      expect(drawerText).not.toContain('已失效');
    });

    await test.step('4.（cluster 恢复）重建同名集群：规则零修改自动重新命中', async () => {
      const created = await createNamedCluster(clusterName);
      expect(created, '重建同名集群应成功').toBe(true);

      // 规则 targets 未变（last-write-wins / 名字松耦合引用）
      const current = await routeApi.getGlobalRouteRulesViaApi(page);
      const rule = (current?.rules || []).find((r) => r.name === ruleName);
      expect(rule.targets.map((t) => t.cluster_name)).toEqual([clusterName]);
    });

    await test.step('5.（operation-logs）集群删除/重建与路由变更留痕', async () => {
      const clusterDeleteLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'delete' && item.resource_name === clusterName,
        { resource_name: clusterName },
      );
      expect(clusterDeleteLog, '应存在集群删除日志').not.toBeNull();

      const clusterCreateLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' && item.resource_name === clusterName,
        { resource_name: clusterName },
      );
      expect(clusterCreateLog, '应存在集群重建日志').not.toBeNull();

      const routeLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'update' &&
          item.resource_type === 'route' &&
          item.resource_name === 'global',
        { resource_type: 'route' },
      );
      expect(routeLog, '应存在路由规则变更日志').not.toBeNull();
    });
  });
});
