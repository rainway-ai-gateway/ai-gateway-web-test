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
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const {
  getUserData,
  getOpenApiBaseUrl,
  createEntityViaApi,
  findEntityByNameViaApi,
} = require('../../api/entity-api-utils');

const DRAWER_TITLE = utils.DRAWER_TITLE;

/**
 * Entity 模型白名单 / 黑名单（EM-E-63~65）
 *
 * 验收依据：docs/entity-management/02-功能测试用例/11-模型白名单与黑名单.md
 * - EM-E-63 创建 Entity 配置允许模型与禁止模型（P1）
 * - EM-E-64 编辑 Entity 修改允许模型与禁止模型（P1）
 * - EM-E-65 未配置禁止模型时的默认语义（P1）
 *
 * 产品语义依据：ai-gateway-api/design-docs/sys-design/details/API-Key与Entity关联及模型继承.md
 * - allow_models 沿 parent_id 向上取交集（含 `*` 的层级不参与）
 * - block_models 沿 parent_id 向上取并集（含 `*` 的层级不参与）
 * - 前端在「禁止模型」为空时提交 `['*']` 作为“未设置”哨兵，详情页过滤 `*` 后展示 `-`
 */

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

/** 读取环境可用的具体模型名（cluster.llm_config.models 去重） */
async function fetchAvailableModels(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/clusters',
    { headers: { Authorization: 'Session ' + userData.sessionKey } },
  );
  const body = await response.json();
  const data = body && body.Data;
  const list = Array.isArray(data) ? data : (data && (data.clusters || data.list)) || [];
  const models = [];
  for (const cluster of list) {
    const clusterModels =
      (cluster && cluster.llm_config && cluster.llm_config.models) || [];
    for (const model of clusterModels) {
      if (model && !models.includes(model)) {
        models.push(model);
      }
    }
  }
  return models;
}

/** 通过 UI 造 Entity 类型并回到组织管理页（创建 Entity 抽屉需要类型下拉就绪） */
async function createTypeAndReturnToOrg(page, cleanup, desc = 'EM model scope type') {
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, desc, 1);
  await page.waitForTimeout(1000);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 800);
  return typeName;
}

/** 清空「允许模型」默认的「全部模型」标签后再选具体模型 */
async function replaceAllowModels(page, models, drawerTitle) {
  await utils.replaceEntityAllowModelsSelection(page, models, drawerTitle);
}

entityOrgDescribe('Entity组织管理 - EM-E-63 创建Entity-允许/禁止模型', (cleanup) => {
  test('创建时选择允许模型与禁止模型，请求体、接口与详情展示一致', async ({
    page,
  }) => {
    await utils.gotoEntityOrgManagementPage(page);
    const typeName = await createTypeAndReturnToOrg(page, cleanup);
    const models = await fetchAvailableModels(page);
    if (models.length < 2) {
      test.skip(
        true,
        `环境可用模型不足 2 个（cluster.llm_config.models 去重后 ${models.length} 个），无法验证具体模型选择`,
      );
    }
    const allowModel = models[0];
    const blockModel = models[1];

    const entityName = await utils.generateTestEntityName();
    cleanup.trackEntityName(entityName);

    await utils.openCreateEntityDrawer(page);
    await test.step('1. 默认允许模型为「全部模型」（`*`）', async () => {
      await utils.expectEntityAllowModelsDefault(page);
    });

    await test.step('2. 选择具体允许模型与禁止模型', async () => {
      await replaceAllowModels(page, [allowModel], DRAWER_TITLE.createEntity);
      await utils.selectEntityBlockModels(page, blockModel);
      await utils.expectElDrawerFieldSelectedContains(
        page,
        DRAWER_TITLE.createEntity,
        '允许模型',
        allowModel,
      );
      await utils.expectElDrawerFieldSelectedContains(
        page,
        DRAWER_TITLE.createEntity,
        '禁止模型',
        blockModel,
      );
    });

    await test.step('3. 填写名称与类型后提交，校验请求体只含所选模型', async () => {
      await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      const [request] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === 'POST' && /\/entities$/.test(req.url()),
          { timeout: 20000 },
        ),
        utils.submitEntityFormAndWaitForSuccess(page, DRAWER_TITLE.createEntity),
      ]);
      const payload = request.postDataJSON();
      expect(
        payload.allow_models,
        '请求体允许模型应只含所选具体模型（不应保留 `*`）',
      ).toEqual([allowModel]);
      expect(payload.block_models, '请求体禁止模型应只含所选模型').toEqual([
        blockModel,
      ]);
      await utils.expectCreateEntityDrawerHidden(page);
    });

    await test.step('4. 接口回读与详情展示一致', async () => {
      const apiData = await findEntityByNameViaApi(page, entityName);
      expect(apiData, '接口应能查到新建 Entity').toBeTruthy();
      expect(apiData.allow_models).toEqual([allowModel]);
      expect(apiData.block_models).toEqual([blockModel]);

      await utils.searchEntityByName(page, entityName);
      await utils.openEntityDetail(page, entityName);
      await utils.expectEntityDetailInfoRow(page, '允许模型', allowModel);
      await utils.expectEntityDetailInfoRow(page, '禁止模型', blockModel);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-64 编辑Entity-允许/禁止模型', (cleanup) => {
  test('编辑时修改允许模型与禁止模型，PATCH 请求体与接口、详情一致', async ({
    page,
  }) => {
    await utils.gotoEntityOrgManagementPage(page);
    const models = await fetchAvailableModels(page);
    if (models.length < 2) {
      test.skip(
        true,
        `环境可用模型不足 2 个（cluster.llm_config.models 去重后 ${models.length} 个），无法验证具体模型选择`,
      );
    }
    const allowModel = models[0];
    const blockModel = models[1];

    const typeName = await utils.generateTestEntityTypeName();
    cleanup.trackTypeName(typeName);
    await utils.createEntityTypeViaApi(page, typeName, 'EM model scope type', 1);
    await page.waitForTimeout(1500);

    const entityName = await utils.generateTestEntityName();
    cleanup.trackEntityName(entityName);
    const created = await createEntityViaApi(
      page,
      entityName,
      typeName,
      null,
      { unlimited: true, unit: 'total_token' },
      null,
      'EM-E-64 前置',
      { allow_models: ['*'], block_models: [] },
    );
    expect(created, '前置接口造数失败').toBeTruthy();
    cleanup.trackEntityId(created.id);

    await utils.reloadEntityOrgManagementPage(page);
    await utils.searchEntityByName(page, entityName);
    await utils.openEditEntityDrawer(page, entityName);

    await test.step('1. 编辑抽屉回显原模型配置', async () => {
      await utils.expectEntityAllowModelsDefault(
        page,
        '全部模型',
        DRAWER_TITLE.editEntity,
      );
    });

    await test.step('2. 修改为具体允许模型与禁止模型后提交', async () => {
      await replaceAllowModels(page, [allowModel], DRAWER_TITLE.editEntity);
      await utils.selectEntityBlockModels(
        page,
        blockModel,
        DRAWER_TITLE.editEntity,
      );
      const payload = await utils.submitEntityEditAndCapturePatchBody(page);
      expect(payload.allow_models, 'PATCH 请求体应携带新的允许模型').toEqual([
        allowModel,
      ]);
      expect(payload.block_models, 'PATCH 请求体应携带新的禁止模型').toEqual([
        blockModel,
      ]);
    });

    await test.step('3. 接口回读与详情展示一致', async () => {
      const apiData = await findEntityByNameViaApi(page, entityName);
      expect(apiData).toBeTruthy();
      expect(apiData.allow_models).toEqual([allowModel]);
      expect(apiData.block_models).toEqual([blockModel]);

      await utils.searchEntityByName(page, entityName);
      await utils.openEntityDetail(page, entityName);
      await utils.expectEntityDetailInfoRow(page, '允许模型', allowModel);
      await utils.expectEntityDetailInfoRow(page, '禁止模型', blockModel);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-65 未配置禁止模型时的默认语义', (cleanup) => {
  test('未选禁止模型时详情展示「-」、编辑回显为空，允许模型仍为「全部模型」', async ({
    page,
  }) => {
    await utils.gotoEntityOrgManagementPage(page);
    const typeName = await createTypeAndReturnToOrg(page, cleanup, 'EM default model type');
    const entityName = await utils.generateTestEntityName();
    cleanup.trackEntityName(entityName);

    await utils.openCreateEntityDrawer(page);
    await utils.fillEntityFormBasic(page, { name: entityName, typeName });

    let payload;
    await test.step('1. 不选模型直接提交，前端以 `*` 作为“未设置”哨兵', async () => {
      const [request] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === 'POST' && /\/entities$/.test(req.url()),
          { timeout: 20000 },
        ),
        utils.submitEntityFormAndWaitForSuccess(page, DRAWER_TITLE.createEntity),
      ]);
      payload = request.postDataJSON();
      expect(payload.allow_models, '允许模型默认应为 `*`').toEqual(['*']);
      expect(
        payload.block_models,
        '禁止模型为空时前端提交 `*` 哨兵（详情页/编辑回显均按“未设置”处理）',
      ).toEqual(['*']);
      await utils.expectCreateEntityDrawerHidden(page);
    });

    await test.step('2. 详情页：允许模型=全部模型，禁止模型=-', async () => {
      await utils.searchEntityByName(page, entityName);
      await utils.openEntityDetail(page, entityName);
      await utils.expectEntityDetailInfoRow(page, '允许模型', '全部模型');
      await utils.expectEntityDetailInfoRow(page, '禁止模型', '-');
      await utils.closeEntityDetail(page);
    });

    await test.step('3. 重新打开编辑抽屉：禁止模型不展示 `*` 标签', async () => {
      await utils.openEditEntityDrawer(page, entityName);
      await utils.expectEntityAllowModelsDefault(
        page,
        '全部模型',
        DRAWER_TITLE.editEntity,
      );
      const blockTags = await utils
        .drawerScope(page, DRAWER_TITLE.editEntity)
        .locator('.ivu-form-item')
        .filter({ hasText: '禁止模型' })
        .first()
        .locator('.el-tag')
        .count();
      expect(blockTags, '禁止模型回显不应包含 `*` 标签').toBe(0);
      await utils.cancelEditEntityForm(page);
    });

    await test.step('4. 接口回读：允许模型 `*`，禁止模型不落任意具体模型', async () => {
      const apiData = await findEntityByNameViaApi(page, entityName);
      expect(apiData).toBeTruthy();
      expect(apiData.allow_models).toEqual(['*']);
      const blockModels = apiData.block_models || [];
      const concreteModels = blockModels.filter((m) => m !== '*');
      expect(concreteModels, '未选择禁止模型时不应落具体模型').toEqual([]);
    });
  });
});
