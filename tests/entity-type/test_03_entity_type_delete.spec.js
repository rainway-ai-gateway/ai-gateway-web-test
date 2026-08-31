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
const { test } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');

test.describe('Entity类型管理 - EM-T-12 删除Entity类型-成功', () => {
  let typeName;

  test('验证删除Entity类型成功', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：准备待删除的类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.prepareEntityTypeForTest(page, typeName, '删除测试类型', 1);
    });

    await test.step('1-2. 点击"删除"按钮并观察确认弹窗', async () => {
      await utils.clickDeleteEntityTypeBtn(page, typeName);
      await utils.expectDeleteEntityTypeConfirmModal(page, typeName);
    });

    await test.step('3-4. 点击"确认"并观察列表刷新', async () => {
      await utils.waitForEntityTypesListResponse(page, () =>
        utils.confirmDeleteEntityType(page),
      );
      await utils.waitAfterEntityTypeMutation(page);
    });

    await test.step('验证删除成功，类型已从列表中移除', async () => {
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeNotVisible(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-13 删除Entity类型-取消操作', () => {
  let typeName;

  test('验证取消删除保留记录', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：准备待删除的类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.prepareEntityTypeForTest(page, typeName, '取消删除测试', 1);
    });

    await test.step('1. 在列表中点击"删除"按钮', async () => {
      await utils.clickDeleteEntityTypeBtn(page, typeName);
      await utils.expectDeleteEntityTypeConfirmModal(page, typeName);
    });

    await test.step('2-3. 点击"取消"并观察列表变化', async () => {
      await utils.cancelDeleteEntityType(page);
      await utils.waitAfterEntityTypeAction(page, 500);
      await utils.expectEntityTypeVisible(page, typeName);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-14 删除Entity类型-有关联Entity', () => {
  let typeName;
  let entityName;
  let entityId;

  test('验证删除有关联Entity的类型失败', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();
    entityName = await utils.generateTestEntityName();

    await test.step('前置：创建类型及关联 Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaApiAndRefresh(
        page,
        typeName,
        '关联删除测试',
        1,
      );
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      await utils.reloadEntityTypeManagementPage(page);
      await utils.searchEntityType(page, typeName);
    });

    await test.step('1. 在列表中找到要删除的类型，点击"删除"按钮', async () => {
      await utils.clickDeleteEntityTypeBtn(page, typeName);
    });

    await test.step('2. 观察确认弹窗显示', async () => {
      await utils.expectDeleteEntityTypeConfirmModal(page, typeName);
    });

    await test.step('3. 点击"确认"按钮', async () => {
      await utils.confirmDeleteEntityType(page);
      await utils.waitAfterEntityTypeAction(page, 2000);
    });

    await test.step('4. 观察系统响应，验证删除失败', async () => {
      await utils.expectDeleteEntityTypeBlocked(page);
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
    });

    await test.step('清理测试数据', async () => {
      await utils.cleanupEntityAndType(page, entityId, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-15 修改Entity类型级别', () => {
  let typeName;

  test('验证修改Entity类型级别', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：准备待编辑的类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.prepareEntityTypeForTest(page, typeName, '级别修改测试', 1);
    });

    await test.step('1-2. 在列表中找到要编辑的类型，点击"编辑"按钮并观察弹窗显示', async () => {
      await utils.openEditEntityTypeDrawer(page, typeName);
    });

    await test.step('3. 修改级别', async () => {
      await utils.selectEntityTypeLevel(page, 3, '编辑类型');
    });

    await test.step('4. 点击"确认"按钮', async () => {
      await utils.waitForEntityTypesListResponse(page, () =>
        utils.submitEntityTypeForm(page, '编辑类型'),
      );
      await utils.waitAfterEntityTypeMutation(page);
    });

    await test.step('5. 观察弹窗关闭和列表刷新', async () => {
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
      await utils.expectEntityTypeRowContainsLevel(page, typeName, 3);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});
