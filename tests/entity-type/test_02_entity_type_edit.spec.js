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

const DOC = utils.DOC_ENTITY_TYPE;

test.describe('Entity类型管理 - EM-T-06 创建Entity类型-类型名长度边界', () => {
  let typeName32;

  test('验证类型名长度边界', async ({ page }) => {
    typeName32 = utils.buildEntityTypeName(DOC.nameMaxLength);

    await test.step('1. 点击"创建类型"按钮', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.openCreateEntityTypeDrawer(page);
    });

    await test.step('2-3. 输入32个字符的类型名，选择级别并点击确定', async () => {
      await utils.submitCreateEntityTypeFormAndWait(page, {
        typeName: typeName32,
        description: '32字符边界测试',
        level: 1,
      });
    });

    await test.step('4. 观察是否创建成功', async () => {
      await utils.expectCreateEntityTypeDrawerHidden(page);
      await utils.searchEntityType(page, typeName32);
      await utils.expectEntityTypeVisible(page, typeName32);
    });

    await test.step('5-6. 验证类型名输入框maxlength属性为32，超过32字符会被截断', async () => {
      await utils.expectEntityTypeNameLengthValidation(page);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName32);
    });
  });
});

test.describe('Entity类型管理 - EM-T-07 创建Entity类型-取消操作', () => {
  test('验证取消创建不刷新列表', async ({ page }) => {
    const typeName = 'test-dep-cancel';

    await test.step('1. 点击"创建类型"按钮', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.openCreateEntityTypeDrawer(page);
    });

    await test.step('2. 输入类型名和描述，选择级别', async () => {
      await utils.fillEntityTypeForm(page, {
        typeName,
        description: DOC.createSuccess.description,
        level: DOC.createSuccess.level,
      });
    });

    await test.step('3-4. 点击"取消"按钮并观察弹窗关闭和列表变化', async () => {
      await utils.cancelEntityTypeForm(page);
      await utils.waitAfterEntityTypeAction(page, 500);
      await utils.expectCreateEntityTypeDrawerHidden(page);
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeNotVisible(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-08 Entity类型搜索功能', () => {
  let extraTypeName;
  let dep2CreatedByTest = false;

  test('验证Entity类型搜索功能', async ({ page }) => {
    await test.step('前置：准备多个 Entity 类型（含 dep 前缀）', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      dep2CreatedByTest = await utils.ensureDocEntityTypeDep2(page);
      extraTypeName = await utils.ensureDocEntityTypesForSearch(page);
    });

    await test.step('1-2. 在搜索框输入 dep，观察列表过滤', async () => {
      await utils.searchEntityType(page, DOC.searchPartial);
      await utils.expectEntityTypeVisible(page, DOC.listSample.typeName);
    });

    await test.step('3. 清空搜索框，观察列表恢复显示所有类型', async () => {
      await utils.clearEntityTypeSearch(page);
      await utils.expectEntityTypeListNotEmpty(page);
    });

    await test.step('4-5. 输入不存在的类型名 nonexistent，观察列表为空', async () => {
      await utils.searchEntityType(page, DOC.searchNotExist);
      await utils.waitAfterEntityTypeAction(page);
      await utils.expectEntityTypeListEmpty(page);
    });

    await test.step('清理测试数据', async () => {
      await utils.clearEntityTypeSearch(page);
      await utils.deleteEntityTypeViaApi(page, extraTypeName);
      await utils.cleanupDocTestDepIfCreated(page, dep2CreatedByTest);
    });
  });
});

test.describe('Entity类型管理 - EM-T-09 Entity类型分页功能', () => {
  const createdTypes = [];

  test('验证Entity类型分页功能', async ({ page }) => {
    await test.step('进入Entity类型管理页面', async () => {
      await utils.gotoEntityTypeManagementPage(page);
    });

    await test.step('1. 查看分页控件当前状态', async () => {
      const types = await utils.ensureEntityTypesForPagination(page);
      createdTypes.push(...types);
      await utils.expectEntityTypePaginationVisible(page);
    });

    await test.step('2-3. 点击"下一页"按钮并观察列表变化', async () => {
      await utils.clickEntityTypeNextPage(page);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypesViaApi(page, createdTypes);
    });
  });
});

test.describe('Entity类型管理 - EM-T-10 编辑Entity类型-成功', () => {
  let typeName;
  const newDescription = '编辑后的描述';

  test('验证编辑Entity类型成功', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：准备待编辑的类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.prepareEntityTypeForTest(page, typeName, '原始描述', 1);
    });

    await test.step('1-2. 点击"编辑"按钮并观察弹窗显示', async () => {
      await utils.openEditEntityTypeDrawer(page, typeName);
      await utils.expectEditEntityTypeDrawerOpen(page);
    });

    await test.step('3-4. 修改描述信息并点击"确认"', async () => {
      await utils.submitOpenEditEntityTypeFormAndWait(page, {
        description: newDescription,
      });
    });

    await test.step('5. 观察弹窗关闭和列表刷新', async () => {
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
      await utils.expectEntityTypeRowContainsText(
        page,
        typeName,
        newDescription,
      );
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-10b 编辑Entity类型-回显数据与接口一致性', () => {
  let typeName;
  const description = '编辑回显验证';
  const level = 1;

  test('验证编辑Entity类型回显数据与接口一致', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：通过接口创建Entity类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.deleteEntityTypeViaApi(page, typeName);
      await utils.createEntityTypeViaApi(page, typeName, description, level);
      await utils.reloadEntityTypeManagementPage(page);
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
    });

    await test.step('1. 通过接口获取类型详情', async () => {
      const apiData = await utils.fetchEntityTypeByNameViaApi(page, typeName);
      expect(apiData).not.toBeNull();
      expect(apiData.type_name).toBe(typeName);
      expect(apiData.description).toBe(description);
      expect(apiData.level).toBe(level);
    });

    await test.step('2. 点击"编辑"按钮并验证回显数据与接口一致', async () => {
      const apiData = await utils.fetchEntityTypeByNameViaApi(page, typeName);
      await utils.expectEntityTypeEditEchoMatchesApi(page, typeName, apiData);
    });

    await test.step('关闭抽屉并清理测试数据', async () => {
      await utils.cancelEditEntityTypeForm(page);
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-11 编辑Entity类型-修改类型名', () => {
  let typeName;

  test('验证编辑时类型名无法修改且显示为灰色', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：准备待编辑的类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.prepareEntityTypeForTest(page, typeName, '类型名锁定测试', 1);
    });

    await test.step('1-2. 在列表中找到要编辑的类型，点击"编辑"按钮并观察弹窗显示', async () => {
      await utils.openEditEntityTypeDrawer(page, typeName);
    });

    await test.step('3. 类型名处于不可编辑状态，显示为灰色', async () => {
      await utils.expectEntityTypeNameFieldDisabled(page);
      await utils.expectEditEntityTypeFormFieldValue(page, '类型名', typeName);
    });

    await test.step('4-5. 点击"取消"按钮并观察弹窗关闭', async () => {
      await utils.cancelEditEntityTypeForm(page);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});
