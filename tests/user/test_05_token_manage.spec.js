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
const utils = require('../../pages/user/UserPage');

test.describe('用户管理 - UM-21 Token管理', () => {
  let testTokenName;
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test.beforeEach(async ({ page }) => {
    testTokenName = await utils.generateTestTokenName();
    await utils.gotoTokenManagementPage(page);
  });

  test('UM-21 Token列表展示', async ({ page }) => {
    await test.step('验证页面标题', async () => {
      await utils.expectUserManagementPageTitle(page);
    });

    await test.step('验证Token Tab', async () => {
      await utils.expectUserManagementTabs(page);
    });

    await test.step('验证创建按钮', async () => {
      await expect(page.getByRole('button', { name: '创建' })).toBeVisible();
    });

    await test.step('验证提示信息', async () => {
      await expect(
        page.getByText(/Token 是内部程序访问APIServer的鉴权凭证/),
      ).toBeVisible();
    });

    await test.step('验证Token列表表格', async () => {
      await expect(utils.pageTable(page).rootLocator()).toBeVisible();
    });

    await test.step('验证分页控件', async () => {
      await utils.pageTable(page).expectPaginationVisible();
    });
  });

  test('UM-22 Token-创建成功', async ({ page }) => {
    cleanup.trackTokenName(testTokenName);

    await test.step('打开创建Token抽屉', async () => {
      await utils.openCreateTokenDrawer(page);
    });

    await test.step('填写表单并提交', async () => {
      await utils.fillCreateTokenForm(page, testTokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.waitForCreateTokenSuccess(page, testTokenName);
    });
  });

  test('UM-23 Token-创建-名称为空', async ({ page }) => {
    await test.step('打开创建Token抽屉', async () => {
      await utils.openCreateTokenDrawer(page);
    });

    await test.step('不填名称，选择角色后提交', async () => {
      await utils.fillCreateTokenForm(page, '', '系统管理');
      await utils.submitCreateTokenForm(page);
      await page.waitForTimeout(1000);
    });

    await test.step('验证抽屉未关闭', async () => {
      await utils.expectCreateTokenDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeCreateTokenDrawer(page);
    });
  });

  test('UM-24 Token-创建-角色为空', async ({ page }) => {
    await test.step('打开创建Token抽屉', async () => {
      await utils.openCreateTokenDrawer(page);
    });

    await test.step('填写名称，不选角色后提交', async () => {
      await utils.fillCreateTokenForm(page, 'token_test_role_empty', '');
      await utils.submitCreateTokenForm(page);
      await page.waitForTimeout(1000);
    });

    await test.step('验证抽屉未关闭', async () => {
      await utils.expectCreateTokenDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeCreateTokenDrawer(page);
    });
  });

  test('UM-25 Token-创建-选择系统管理角色', async ({ page }) => {
    const tokenName = 'token_sys_admin_' + Date.now();
    cleanup.trackTokenName(tokenName);

    await test.step('创建Token', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, tokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.waitForCreateTokenSuccess(page, tokenName);
    });

    await test.step('验证scope为系统管理', async () => {
      await expect(utils.pageTable(page).rootLocator()).toContainText(
        '系统管理',
      );
    });
  });

  test('UM-26 Token-创建-选择内部支持角色', async ({ page }) => {
    const tokenName = 'token_internal_support_' + Date.now();
    cleanup.trackTokenName(tokenName);

    await test.step('创建Token', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, tokenName, '内部支持');
      await utils.submitCreateTokenForm(page);
      await utils.waitForCreateTokenSuccess(page, tokenName);
    });

    await test.step('验证scope为内部支持', async () => {
      await expect(utils.pageTable(page).rootLocator()).toContainText(
        '内部支持',
      );
    });
  });

  test('UM-27 Token-查看详情', async ({ page }) => {
    cleanup.trackTokenName(testTokenName);

    await test.step('先创建测试Token', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, testTokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.waitForCreateTokenSuccess(page, testTokenName);
    });

    await test.step('打开Token详情', async () => {
      await utils.openTokenDetail(page, testTokenName);
    });

    await test.step('验证详情抽屉打开', async () => {
      await utils.expectTokenDetailDrawerOpen(page);
    });

    await test.step('关闭详情', async () => {
      await utils.closeTokenDetail(page);
    });
  });

  test('UM-28 Token-删除成功', async ({ page }) => {
    cleanup.trackTokenName(testTokenName);

    await test.step('先创建测试Token', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, testTokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.waitForCreateTokenSuccess(page, testTokenName);
    });

    await test.step('删除Token', async () => {
      await utils.deleteToken(page, testTokenName);
    });

    await test.step('验证Token已删除', async () => {
      await utils.expectTokenNotVisible(page, testTokenName, 30000);
    });
  });

  test('UM-29 Token-删除取消', async ({ page }) => {
    cleanup.trackTokenName(testTokenName);

    await test.step('先创建测试Token', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, testTokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.waitForCreateTokenSuccess(page, testTokenName);
    });

    await test.step('点击删除并取消', async () => {
      await utils.clickDeleteTokenBtn(page, testTokenName);
      await utils.cancelDeleteToken(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证Token仍存在', async () => {
      await utils.expectTokenVisibleInAllPages(page, testTokenName, 30000);
    });
  });

  test('UM-30 Token-重置表单', async ({ page }) => {
    await test.step('打开创建Token抽屉并填写', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, 'token_reset_test', '系统管理');
    });

    await test.step('点击重置', async () => {
      await utils.resetCreateTokenForm(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证名称已清空', async () => {
      await utils.expectCreateTokenFormFieldValue(page, '名称', '');
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeCreateTokenDrawer(page);
    });
  });

  test('UM-31 Token-关闭创建弹窗', async ({ page }) => {
    await test.step('打开创建Token抽屉并填写', async () => {
      await utils.openCreateTokenDrawer(page);
      await utils.fillCreateTokenForm(page, 'token_close_test', '内部支持');
    });

    await test.step('点击关闭按钮', async () => {
      await utils.closeCreateTokenDrawerByX(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证抽屉已关闭', async () => {
      await utils.expectCreateTokenDrawerHidden(page);
    });
  });
});
