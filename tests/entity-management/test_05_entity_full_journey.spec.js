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
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');

const DOC = utils.DOC_API_KEY;

/**
 * 场景串联（@journey）：全 UI 操作，跨 Entity 类型 → 组织 → API-Key。
 * 对应 01 场景四；详细步骤见 docs/entity-management/02 §2.22、§3.30、§4.1
 */
test.describe('Entity 管理 - EM-J-01 场景串联 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  const cleanup = utils.createApiKeyTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('EM-J-01 管理员首次配置：类型 → 组织 → API-Key 全 UI 流程（EM-K-30）', async ({ page }) => {
    const typeName = await utils.generateTestEntityTypeName();
    const entityName = await utils.generateTestEntityName();
    const description = DOC.createSuccess.description + '_journey_' + Date.now();
    const editedDescription = description + '_edited';
    let entityId;
    let apiKeyId;

    cleanup.trackTypeName(typeName);

    await test.step('1. Entity 类型管理：UI 创建类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '场景串联类型', 1);
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
    });

    await test.step('2. Entity 组织管理：UI 创建根节点 Entity', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.openCreateEntityDrawer(page);
      await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      await utils.submitEntityFormAndWaitForSuccess(page);
      await utils.searchEntityByName(page, entityName);
      await utils.expectEntityVisible(page, entityName);
      const entity = await utils.findEntityByNameViaApi(page, entityName);
      entityId = entity?.id;
      if (entityId) {
        cleanup.trackEntityId(entityId);
      }
    });

    await test.step('3. API-Key 管理：UI 创建并挂载 Entity（带有限配额）', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
      await utils.fillApiKeyBasicForm(page, {
        description,
        unlimitedQuota: false,
        quotaTotal: 1000,
        quotaUnit: 'total_token',
        resetCycle: '永不重置',
        entityName,
      });
      await utils.submitApiKeyFormAndWaitForSuccess(page);
      await utils.ensureApiKeyRowVisible(page, description);
      await utils.expectApiKeyRowContainsText(page, description, entityName);
      const apiKey = await utils.findApiKeyByDescriptionViaApi(page, description);
      apiKeyId = apiKey?.id;
      if (apiKeyId) {
        cleanup.trackApiKeyId(apiKeyId);
      }
    });

    await test.step('4. UI 编辑 API-Key 描述', async () => {
      await utils.openEditApiKeyDrawer(page, description);
      await utils.fillApiKeyDescription(page, editedDescription, '编辑 API-Key');
      await utils.submitApiKeyFormAndWaitForEditSuccess(page);
      await utils.ensureApiKeyRowVisible(page, editedDescription);
    });

    await test.step('5. UI 重置 API-Key 配额', async () => {
      await utils.openApiKeyDetail(page, editedDescription);
      await utils.clickResetApiKeyQuotaBtn(page);
      await utils.expectResetQuotaDrawerOpen(page);
      await utils.fillResetQuotaForm(page, DOC.resetQuota.total, DOC.resetQuota.reason);
      await utils.submitResetQuotaFormAndWaitForSuccess(page);
      await utils.expectResetQuotaDrawerHidden(page);
    });

    await test.step('6. UI 删除 API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.ensureApiKeyRowVisible(page, editedDescription);
      await utils.clickDeleteApiKeyBtn(page, editedDescription);
      await utils.expectDeleteApiKeyConfirmModal(page, editedDescription);
      await utils.confirmDeleteApiKeyAndWaitForSuccess(page);
      apiKeyId = null;
      await utils.searchApiKeyByDescription(page, editedDescription);
      await utils.expectApiKeyNotVisible(page, editedDescription);
    });

    await test.step('7. UI 删除 Entity', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.searchEntityByName(page, entityName);
      await utils.deleteEntityAndWait(page, entityName);
      await utils.expectEntityNotVisible(page, entityName);
      entityId = null;
    });

    await test.step('8. UI 删除 Entity 类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.searchEntityType(page, typeName);
      await utils.deleteEntityTypeAndWait(page, typeName);
      await utils.expectEntityTypeNotVisible(page, typeName);
    });
  });

  test('EM-E-22 层级 Entity 创建与删除约束（全 UI 前置）', async ({ page }) => {
    const parentType = await utils.generateTestEntityTypeName();
    const childType = await utils.generateTestEntityTypeName();
    const parentName = await utils.generateTestEntityName();
    const childName = await utils.generateTestEntityName();
    let parentId;
    let childId;

    cleanup.trackTypeName(parentType);
    cleanup.trackTypeName(childType);

    await test.step('1. UI 创建父/子 Entity 类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, parentType, '场景父类型', 1);
      await utils.createEntityTypeViaUI(page, childType, '场景子类型', 2);
    });

    await test.step('2. UI 创建父 Entity', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.openCreateEntityDrawer(page);
      await utils.fillEntityFormBasic(page, { name: parentName, typeName: parentType });
      await utils.submitEntityFormAndWaitForSuccess(page);
      await utils.searchEntityByName(page, parentName);
      await utils.expectEntityVisible(page, parentName);
      const parent = await utils.findEntityByNameViaApi(page, parentName);
      parentId = parent?.id;
      if (parentId) {
        cleanup.trackEntityId(parentId);
      }
    });

    await test.step('3. UI 创建子 Entity', async () => {
      await utils.openCreateEntityDrawer(page);
      await utils.fillEntityFormBasic(page, {
        name: childName,
        typeName: childType,
        parentName,
      });
      await utils.waitForEntitiesListResponse(page, () => utils.submitEntityForm(page));
      await utils.waitAfterEntityMutation(page);
      await utils.searchEntityByName(page, childName);
      await utils.expectEntityVisible(page, childName);
      await utils.expectEntityRowContainsParent(page, childName, parentName);
      const child = await utils.findEntityByNameViaApi(page, childName);
      childId = child?.id;
      if (childId) {
        cleanup.trackEntityId(childId);
      }
    });

    await test.step('4. 删除约束：有关联 Entity 的类型不可删除', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.searchEntityType(page, parentType);
      await utils.clickDeleteEntityTypeBtn(page, parentType);
      await utils.expectDeleteEntityTypeConfirmModal(page, parentType);
      await utils.confirmDeleteEntityType(page);
      await utils.waitAfterEntityTypeAction(page, 2000);
      await utils.expectDeleteEntityTypeBlocked(page);
      await utils.searchEntityType(page, parentType);
      await utils.expectEntityTypeVisible(page, parentType);
    });

    await test.step('5. UI 先删子 Entity，再删父 Entity', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.searchEntityByName(page, childName);
      await utils.deleteEntityAndWait(page, childName);
      await utils.expectEntityNotVisible(page, childName);
      childId = null;

      await utils.searchEntityByName(page, parentName);
      await utils.deleteEntityAndWait(page, parentName);
      await utils.expectEntityNotVisible(page, parentName);
      parentId = null;
    });

    await test.step('6. UI 删除 Entity 类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.searchEntityType(page, childType);
      await utils.deleteEntityTypeAndWait(page, childType);
      await utils.searchEntityType(page, parentType);
      await utils.deleteEntityTypeAndWait(page, parentType);
      await utils.searchEntityType(page, parentType);
      await utils.expectEntityTypeNotVisible(page, parentType);
    });
  });
});
