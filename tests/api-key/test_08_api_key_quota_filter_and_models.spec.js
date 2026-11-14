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
 * API-Key 配额类型筛选 / 允许模型链路（EM-K-68 / EM-K-69）
 *
 * 审计背景（2026-11-01，api-key 深度审计）：
 * - 列表「配额类型」列是 8 个可搜索列里**唯一没有用例**的维度；页对象的
 *   `selectApiKeyQuotaTypeFilter` 写好后从未被调用（同 entity「级别筛选」缺口）。
 * - 「允许模型」只在详情一致性用例（EM-K-55）里随整段文本断言，没有
 *   「选具体模型 → 提交 → 接口回读」的链路验证（同 entity EM-E-63 缺口）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const {
  getUserData,
  getOpenApiBaseUrl,
  createEntityTypeViaApi,
  createEntityViaApi,
  findApiKeyByIdViaApi,
  findApiKeyByDescriptionViaApi,
  deleteEntityViaApi,
  deleteEntityTypeViaApi,
} = require('../../api/entity-api-utils');

const DRAWER_TITLE = utils.DRAWER_TITLE;

async function createApiKeyViaApi(page, data) {
  const userData = await getUserData(page);
  const response = await page.request.post(getOpenApiBaseUrl() + '/api-keys', {
    data,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Session ' + userData.sessionKey,
    },
  });
  const body = await response.json();
  if (body.ErrNum !== 200) {
    throw new Error('接口创建 API-Key 失败: ' + JSON.stringify(body).slice(0, 200));
  }
  return body.Data;
}

async function fetchClusterModels(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(getOpenApiBaseUrl() + '/clusters', {
    headers: { Authorization: 'Session ' + userData.sessionKey },
  });
  const body = await response.json();
  const data = body && body.Data;
  const list = Array.isArray(data) ? data : (data && (data.clusters || data.list)) || [];
  const models = [];
  for (const cluster of list) {
    for (const model of (cluster.llm_config && cluster.llm_config.models) || []) {
      if (model && !models.includes(model)) {
        models.push(model);
      }
    }
  }
  return models;
}

test.describe('API-Key管理 - EM-K-68 按配额类型筛选', () => {
  let typeName;
  let entityId;
  const apiKeyIds = [];

  test.afterEach(async ({ page }) => {
    for (const id of apiKeyIds) {
      await utils.deleteApiKeyViaApi(page, id).catch(() => {});
    }
    apiKeyIds.length = 0;
    if (entityId) {
      await deleteEntityViaApi(page, entityId).catch(() => {});
      entityId = null;
    }
    if (typeName) {
      await deleteEntityTypeViaApi(page, typeName).catch(() => {});
      typeName = null;
    }
  });

  test('「无限」「有限」筛选只保留对应配额的 API-Key', async ({ page }) => {
    await utils.gotoApiKeyManagementPage(page);
    await test.step('前置：造 1 个无限配额 + 1 个有限配额的 API-Key', async () => {
      typeName = 'ak68_type_' + Date.now();
      await createEntityTypeViaApi(page, typeName, 'EM-K-68 类型', 1);
      await page.waitForTimeout(1500);
      const entity = await createEntityViaApi(
        page,
        'ak68_entity_' + Date.now(),
        typeName,
        null,
        { unlimited: true, unit: 'total_token' },
      );
      entityId = entity.id;
      const unlimited = await createApiKeyViaApi(page, {
        description: 'ak68_unlimited_' + Date.now(),
        entity_id: entityId,
        unlimited_quota: true,
        enabled: true,
      });
      const limited = await createApiKeyViaApi(page, {
        description: 'ak68_limited_' + Date.now(),
        entity_id: entityId,
        unlimited_quota: false,
        quota_plan: { unlimited: false, quota: 1000, unit: 'total_token' },
        enabled: true,
      });
      apiKeyIds.push(unlimited.id, limited.id);
      await utils.reloadApiKeyManagementPage(page);
      await utils.waitForPageSettled(page, 1000);
    });

    await test.step('筛选「无限」：有限配额行被过滤', async () => {
      await utils.searchApiKeyByDescription(page, 'ak68_');
      await utils.selectApiKeyQuotaTypeFilter(page, '无限');
      await utils.expectApiKeyVisible(page, 'ak68_unlimited_');
      await utils.expectApiKeyNotVisible(page, 'ak68_limited_');
    });

    await test.step('筛选「有限」：无限配额行被过滤', async () => {
      await utils.selectApiKeyQuotaTypeFilter(page, '有限');
      await utils.expectApiKeyVisible(page, 'ak68_limited_');
      await utils.expectApiKeyNotVisible(page, 'ak68_unlimited_');
    });
  });
});

test.describe('API-Key管理 - EM-K-69 允许模型选择与回读', () => {
  let typeName;
  let entityId;
  let apiKeyId;

  test.afterEach(async ({ page }) => {
    if (apiKeyId) {
      await utils.deleteApiKeyViaApi(page, apiKeyId).catch(() => {});
      apiKeyId = null;
    }
    if (entityId) {
      await deleteEntityViaApi(page, entityId).catch(() => {});
      entityId = null;
    }
    if (typeName) {
      await deleteEntityTypeViaApi(page, typeName).catch(() => {});
      typeName = null;
    }
  });

  test('选择具体允许模型后提交，POST 请求体与接口回读一致', async ({ page }) => {
    await utils.gotoApiKeyManagementPage(page);
    const models = await fetchClusterModels(page);
    if (models.length === 0) {
      test.skip(true, '环境无可用模型（cluster.llm_config.models 为空）');
    }
    const model = models[0];

    await test.step('前置：造 Entity 以支持挂载', async () => {
      typeName = 'ak69_type_' + Date.now();
      await createEntityTypeViaApi(page, typeName, 'EM-K-69 类型', 1);
      await page.waitForTimeout(1500);
      const entity = await createEntityViaApi(
        page,
        'ak69_entity_' + Date.now(),
        typeName,
        null,
        { unlimited: true, unit: 'total_token' },
      );
      entityId = entity.id;
    });

    const description = 'ak69_' + Date.now();
    await test.step('打开添加抽屉并选择具体允许模型', async () => {
      await utils.openAddApiKeyDrawer(page);
      await utils.fillApiKeyDescription(page, description);
      // 默认「全部模型（*）」，先摘标签再选具体模型
      await utils.replaceEntityAllowModelsSelection(page, [model], DRAWER_TITLE.addApiKey);
      await utils.expectElDrawerFieldSelectedContains(
        page,
        DRAWER_TITLE.addApiKey,
        '允许模型',
        model,
      );
    });

    let payload;
    await test.step('提交并校验请求体只含所选模型', async () => {
      const [request] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === 'POST' && /\/api-keys$/.test(req.url()),
          { timeout: 20000 },
        ),
        utils.submitApiKeyFormAndWaitForSuccess(page, DRAWER_TITLE.addApiKey),
      ]);
      payload = request.postDataJSON();
      expect(payload.models, '请求体 models 应只含所选具体模型').toEqual([model]);
      await utils.expectAddApiKeyDrawerHidden(page);
    });

    await test.step('接口回读 models 与请求体一致', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const created = await findApiKeyByDescriptionViaApi(page, description);
      expect(created, '接口应能按描述查到新 API-Key').toBeTruthy();
      apiKeyId = created.id;
      const apiData = await findApiKeyByIdViaApi(page, apiKeyId);
      expect(apiData).toBeTruthy();
      expect(apiData.models).toEqual([model]);
    });
  });
});
