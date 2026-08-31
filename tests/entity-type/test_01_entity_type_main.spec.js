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

test.describe('Entity类型管理 - EM-T-01 Entity类型列表展示', () => {
  test('验证Entity类型列表页面正确渲染', async ({ page }) => {
    await test.step('1. 打开浏览器，访问AI网关管理控制台', async () => {
      await utils.gotoEntityTypeManagementPage(page);
    });

    await test.step('2. 在左侧导航栏中，找到并点击"Entity管理"菜单项', async () => {
      await utils.expectEntityManagementPageTitle(page);
    });

    await test.step('3. 观察页面加载情况', async () => {
      await utils.expectEntityManagementLayout(page);
    });

    await test.step('4. 确认当前Tab为"Entity类型管理"（默认选中）', async () => {
      await utils.expectEntityManagementTabs(page);
      await utils.expectEntityTypeTabSelected(page);
    });

    await test.step('5. 查看页面中间区域的Entity类型列表表格', async () => {
      await utils.expectCreateEntityTypeButtonVisible(page);
      await utils.expectEntityTypeSearchVisible(page);
      await utils.expectEntityTypeTableVisible(page);
      if ((await utils.getEntityTypeListRowCount(page)) > 0) {
        await utils.expectEntityTypeTableRowActions(page);
      }
      await utils.expectEntityTypePaginationVisible(page);
    });
  });
});

test.describe('Entity类型管理 - EM-T-01b Entity类型列表数据与接口一致性', () => {
  const typeName = 'test-dep-api-chk';
  const description = 'API一致性验证';
  const level = 1;

  test('验证Entity类型列表展示数据与接口返回一致', async ({ page }) => {
    await test.step('前置：清理可能残留的数据', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      const existing = await utils.fetchEntityTypeByNameViaApi(page, typeName);
      if (existing) {
        // 有关联 entity 时普通删除会失败，先清理关联 entity 再删类型
        await utils.forceDeleteEntityTypeViaApi(page, typeName);
      }
    });

    await test.step('1. 通过接口创建Entity类型', async () => {
      const ok = await utils.createEntityTypeViaApi(
        page,
        typeName,
        description,
        level,
      );
      if (!ok) {
        await utils.forceDeleteEntityTypeViaApi(page, typeName);
        await utils.createEntityTypeViaApi(page, typeName, description, level);
      }
    });

    await test.step('2. 刷新页面使列表加载新数据', async () => {
      await utils.reloadEntityTypeManagementPage(page);
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
    });

    await test.step('3. 通过接口获取类型详情', async () => {
      const apiData = await utils.fetchEntityTypeByNameViaApi(page, typeName);
      expect(apiData).not.toBeNull();
      expect(apiData.type_name).toBe(typeName);
      expect(apiData.description).toBe(description);
      expect(apiData.level).toBe(level);
    });

    await test.step('4. 验证列表行数据与接口返回一致（类型名、描述、级别）', async () => {
      const apiData = await utils.fetchEntityTypeByNameViaApi(page, typeName);
      await utils.expectEntityTypeRowMatchesApi(page, typeName, apiData);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-02 创建Entity类型-成功', () => {
  const { typeName, description, level } = DOC.createSuccess;

  test('验证创建Entity类型成功', async ({ page }) => {
    await test.step('前置：清理可能残留的 test-dep', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.deleteEntityTypeViaApi(page, typeName);
    });

    await test.step('1. 点击"创建类型"按钮', async () => {
      await utils.openCreateEntityTypeDrawer(page);
    });

    await test.step('2. 观察弹窗显示，标题为"创建类型"', async () => {
      await utils.expectCreateEntityTypeDrawerTitle(page);
    });

    await test.step('3-5. 填写类型名、描述并选择级别', async () => {
      await utils.fillEntityTypeForm(page, { typeName, description, level });
    });

    await test.step('6. 点击"确认"按钮并等待创建成功提示', async () => {
      // UI Notice 为「创建成功!」，须在提交动作期间捕获（toast 稍后消失）
      await utils.submitEntityTypeFormAndWaitForSuccess(page);
    });

    await test.step('7. 观察弹窗关闭和列表刷新情况', async () => {
      await utils.expectCreateEntityTypeDrawerHidden(page);
      await utils.searchEntityType(page, typeName);
      await utils.expectEntityTypeVisible(page, typeName);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-03 创建Entity类型-必填校验', () => {
  test('验证类型名和级别必填校验', async ({ page }) => {
    await test.step('1. 点击"创建类型"按钮', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.openCreateEntityTypeDrawer(page);
    });

    await test.step('2-3. 保持"类型名"和"级别"为空', async () => {
      await utils.clearEntityTypeRequiredFields(page);
    });

    await test.step('4. 点击"确认"按钮', async () => {
      await utils.submitEntityTypeForm(page);
      await utils.waitAfterEntityTypeAction(page);
    });

    await test.step('5. 观察校验提示', async () => {
      await utils.expectCreateEntityTypeDrawerOpen(page);
      await utils.expectEntityTypeFormFieldError(
        page,
        '类型名',
        DOC.typeNameRequiredMsg,
      );
      await utils.expectEntityTypeFormFieldError(
        page,
        '级别',
        DOC.levelRequiredMsg,
      );
    });

    await test.step('关闭抽屉', async () => {
      await utils.cancelEntityTypeForm(page);
    });
  });
});

test.describe('Entity类型管理 - EM-T-04 创建Entity类型-类型名重复', () => {
  let dep2CreatedByTest = false;

  test('验证重复类型名无法创建', async ({ page }) => {
    await test.step('前置：确保系统中已存在 dep2', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      dep2CreatedByTest = await utils.ensureDocEntityTypeDep2(page);
      await utils.searchEntityType(page, DOC.duplicate.typeName);
      await utils.expectEntityTypeVisible(page, DOC.duplicate.typeName);
    });

    await test.step('1. 点击"创建类型"按钮', async () => {
      await utils.openCreateEntityTypeDrawer(page);
    });

    await test.step('2-3. 输入已存在的类型名 dep2 并选择级别', async () => {
      await utils.fillEntityTypeForm(page, {
        typeName: DOC.duplicate.typeName,
        level: DOC.duplicate.level,
      });
    });

    await test.step('4. 点击"确认"按钮', async () => {
      await utils.submitEntityTypeForm(page);
      await utils.waitAfterEntityTypeAction(page, 2000);
    });

    await test.step('5. 观察错误提示', async () => {
      await utils.expectCreateEntityTypeDrawerOpen(page);
      await utils.expectEntityTypeDuplicateError(page);
      await utils.searchEntityType(page, DOC.duplicate.typeName);
      await utils.expectEntityTypeVisible(page, DOC.duplicate.typeName);
    });

    await test.step('关闭抽屉并清理数据', async () => {
      await utils.cancelEntityTypeForm(page);
      await utils.cleanupDocTestDepIfCreated(page, dep2CreatedByTest);
    });
  });
});

test.describe('Entity类型管理 - EM-T-05 创建Entity类型-类型名格式错误', () => {
  test('验证类型名格式校验', async ({ page }) => {
    await test.step('1. 点击"创建类型"按钮', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.openCreateEntityTypeDrawer(page);
    });

    await test.step('2-3. 输入大写字母 TEST-DEP 并观察校验提示', async () => {
      await utils.fillEntityTypeNameAndBlur(page, DOC.formatInvalid1);
      await utils.expectEntityTypeFormFieldError(
        page,
        '类型名',
        DOC.formatErrorMsg,
      );
    });

    await test.step('4-5. 输入中文"测试类型"并观察校验提示', async () => {
      await utils.fillEntityTypeNameAndBlur(page, DOC.formatInvalid2);
      await utils.expectEntityTypeFormFieldError(
        page,
        '类型名',
        DOC.formatErrorMsg,
      );
    });

    await test.step('关闭抽屉', async () => {
      await utils.cancelEntityTypeForm(page);
    });
  });
});
