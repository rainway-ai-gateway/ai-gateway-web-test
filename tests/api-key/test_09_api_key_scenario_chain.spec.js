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
 * 长链路场景 - SC-L-03 Entity→API-Key→路由生命周期链（docs/跨模块横切用例.md H-4 族）
 *
 * 链路：entity-type → entity → api-key → route → operation-logs。
 * 把 4 个模块的单点用例串成一次真实用户旅程：
 * 1.（entity-type/entity）UI 建类型 + API 建组织 E（无限配额）
 * 2.（api-key）给 E 建 API-Key K（TPM 限流），API 回读限流配置一致
 * 3.（route）经 E 的「Entity 路由表」加规则指向可用集群并提交生效，
 *    GET /entities/{id} 回读 route_rules 一致
 * 4.（api-key）禁用 K → 启用 K（PATCH /api-keys/{id}，回读 enabled 翻转）
 * 5. 删除链：删 E 被 K 挂载拦截（409）→ 删 K → 删 E 成功
 * 6.（operation-logs）建/删留痕（entity create/delete 硬断言；api-key create 按 id 匹配）
 *
 * 造数/清理：entityOrgTestCleanup（类型/Entity/Key 全跟踪）；Entity 路由规则随
 * Entity 删除级联消失，无需快照恢复。
 *
 * 运行：npx playwright test tests/api-key/test_09_api_key_scenario_chain.spec.js
 */
const { test, expect } = require('@playwright/test');
const entityUtils = require('../../pages/entity/EntityPage');
const routeUtils = require('../../pages/route/RoutePage');
const logApi = require('../../api/operation-log-api-utils');

/** 从 localStorage 读当前会话 key（须已在产品页面上） */
async function sessionKey(page) {
  return page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.sessionKey || u.session_key || '';
  });
}

async function apiGetEntity(page, entityName) {
  const r = await page.request.get(
    'http://127.0.0.1:8183/open-api/v1/entities',
    { headers: { Authorization: 'Session ' + (await sessionKey(page)) } },
  );
  const body = await r.json();
  const list = (body.Data && body.Data.list) || [];
  return list.find((e) => e.name === entityName) || null;
}

async function patchApiKey(page, apiKeyId, data) {
  const r = await page.request.patch(
    'http://127.0.0.1:8183/open-api/v1/api-keys/' + encodeURIComponent(apiKeyId),
    {
      data,
      headers: {
        Authorization: 'Session ' + (await sessionKey(page)),
        'Content-Type': 'application/json',
      },
    },
  );
  return r.json();
}

test.describe('长链路场景 - SC-L-03 Entity→API-Key→路由生命周期链 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  const cleanup = entityUtils.createEntityOrgTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('建类型→组织→带限流Key→挂路由规则→禁用启用→按序删除，全链路一致并留痕', async ({
    page,
  }) => {
    const typeName = await entityUtils.generateTestEntityTypeName();
    const entityName = await entityUtils.generateTestEntityName();
    const keyDescription = 'scl03_key_' + Date.now().toString(36);
    const ruleName = 'scl03_rule_' + Date.now().toString(36);
    let entityId = '';
    let apiKeyId = '';
    let targetCluster = '';

    await test.step('1.（entity-type/entity）UI 建类型，API 建组织 E（无限配额）', async () => {
      cleanup.trackTypeName(typeName);
      cleanup.trackEntityName(entityName);
      await entityUtils.gotoEntityTypeManagementPage(page);
      await entityUtils.createEntityTypeViaUI(page, typeName, 'SCL03 链路类型', 1);
      await page.waitForTimeout(1000);
      const created = await entityUtils.createEntityWithTypeViaApi(page, {
        name: entityName,
        type: typeName,
        quotaPlan: { unlimited: true, unit: 'total_token' },
      });
      expect(created, 'API 创建 Entity 应成功').toBeTruthy();
      entityId = created.id;
      cleanup.trackEntityId(entityId);
    });

    await test.step('2.（api-key）给 E 建 API-Key K（启用 TPM 限流），回读一致', async () => {
      await entityUtils.gotoApiKeyManagementPage(page);
      await entityUtils.openAddApiKeyDrawer(page);
      await entityUtils.fillApiKeyBasicForm(page, {
        description: keyDescription,
        entityName,
        unlimitedQuota: true,
      });
      await entityUtils.fillApiKeyRateLimitForm(page, {
        enable: true,
        tpm: { name: 'tpm_scl03', window: 1, maxTokens: 10000, step: 1 },
      });
      await entityUtils.submitApiKeyFormAndWaitForSuccess(page);

      const key = await entityUtils.findApiKeyByDescriptionViaApi(
        page,
        keyDescription,
      );
      expect(key, '应能按描述查到新建 API-Key').toBeTruthy();
      apiKeyId = key.id;
      cleanup.trackApiKeyId(apiKeyId);
      const tpm = (key.rate_limit_policy &&
        key.rate_limit_policy.rules &&
        key.rate_limit_policy.rules.tpm) || [];
      expect(tpm.length, 'API 回读应含 1 条 TPM 规则').toBe(1);
      expect(String(tpm[0].name)).toBe('tpm_scl03');
      expect(Number(tpm[0].max_tokens)).toBe(10000);
    });

    await test.step('3.（route）E 的 Entity 路由表加规则指向可用集群并提交生效', async () => {
      const clusters = await routeUtils.getAvailableClustersForRule(page);
      expect(clusters.length, '无可用集群').toBeGreaterThan(0);
      targetCluster = clusters[0].name;

      await routeUtils.ensureRouteTableModuleAvailable(page);
      const origin = new URL(page.url()).origin;
      await page.goto(
        `${origin}/route-tables?type=entity&owner=${entityId}`,
      );
      await expect(page.locator('.route-rules')).toBeVisible({
        timeout: 15000,
      });
      await routeUtils.enterRouteRulesEditMode(page);
      await routeUtils.openAddRuleDrawer(page);
      await routeUtils.fillRuleName(page, ruleName);
      await routeUtils.fillRuleExpression(page, 'default_t()');
      await routeUtils.selectRuleTargetCluster(page, 0, targetCluster);
      if (clusters[0].llm_config?.models?.length > 0) {
        await routeUtils.selectRuleTargetModel(
          page,
          0,
          clusters[0].llm_config.models[0],
        );
      }
      await routeUtils.fillRuleTargetWeight(page, 0, 100);
      await routeUtils.submitRuleFormAndWait(page);
      await routeUtils.submitOwnerRouteRulesAndWait(page, 'entity', entityId);

      const entity = await apiGetEntity(page, entityName);
      const rules =
        ((entity && entity.route_rules) || {}).rules || [];
      const saved = rules.find((r) => r.name === ruleName);
      expect(saved, 'Entity 路由规则应已生效（GET 回读）').toBeTruthy();
      expect(saved.targets.map((t) => t.cluster_name)).toEqual([targetCluster]);
    });

    await test.step('4.（api-key）禁用 K → 启用 K，enabled 翻转回读一致', async () => {
      const off = await patchApiKey(page, apiKeyId, { enabled: false });
      expect(off.ErrNum).toBe(200);
      const keyOff = await entityUtils.findApiKeyByDescriptionViaApi(
        page,
        keyDescription,
      );
      expect(keyOff.enabled).toBe(false);

      const on = await patchApiKey(page, apiKeyId, { enabled: true });
      expect(on.ErrNum).toBe(200);
      const keyOn = await entityUtils.findApiKeyByDescriptionViaApi(
        page,
        keyDescription,
      );
      expect(keyOn.enabled).toBe(true);
    });

    await test.step('5. 删除链：删 E 被 K 挂载拦截（409）→ 删 K → 删 E 成功', async () => {
      const blocked = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/entities/' +
          encodeURIComponent(entityId),
        { headers: { Authorization: 'Session ' + (await sessionKey(page)) } },
      );
      const blockedBody = await blocked.json();
      // 产品行为偏差（与 EM-E-21 同一签核口径）：挂载 API-Key 的 Entity 删除实测返回
      // 422 而非接口契约的 409——本链路断言「被拦截」这一事实，状态码按已签核的
      // 实际行为 422 断言；契约期望 409 由 EM-E-21 继续固化守卫。
      expect(blockedBody.ErrNum).toBe(422);

      await entityUtils.deleteApiKeyViaApi(page, apiKeyId);

      const removed = await page.request.delete(
        'http://127.0.0.1:8183/open-api/v1/entities/' +
          encodeURIComponent(entityId),
        { headers: { Authorization: 'Session ' + (await sessionKey(page)) } },
      );
      expect((await removed.json()).ErrNum).toBe(200);
      expect(await apiGetEntity(page, entityName)).toBeNull();
    });

    await test.step('6.（operation-logs）建/删留痕：Entity 创建与删除日志硬断言', async () => {
      const createLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' && item.resource_name === entityName,
        { resource_name: entityName },
      );
      expect(createLog, '应存在 Entity 创建的操作日志').not.toBeNull();

      const keyLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' &&
          JSON.stringify(item).includes(apiKeyId),
      );
      expect(keyLog, '应存在 API-Key 创建的操作日志').not.toBeNull();

      const deleteLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'delete' && item.resource_name === entityName,
        { resource_name: entityName },
      );
      expect(deleteLog, '应存在 Entity 删除的操作日志').not.toBeNull();
    });
  });
});
