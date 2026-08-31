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

test.describe('用户管理 - UM-18 删除用户-成功场景', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证删除用户成功', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);

    await test.step('准备测试用户', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.addUserViaApi(page, username, password);
      await page.reload();
      await page.waitForTimeout(2000);
      await utils.switchToUserTab(page);
      await utils.searchUser(page, username);
    });

    await test.step('点击删除按钮', async () => {
      await utils.clickDeleteUserBtn(page, username);
      await utils.expectDeleteConfirmModal(page);
    });

    await test.step('确认删除', async () => {
      await utils.confirmDeleteUser(page);
      await page.waitForTimeout(2000);
    });

    await test.step('验证用户已从列表消失', async () => {
      await utils.searchUser(page, username);
      await utils.expectUserNotVisible(page, username);
    });
  });
});

test.describe('用户管理 - UM-19 删除用户-取消操作', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证取消删除用户保留记录', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);

    await test.step('准备测试用户', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.addUserViaApi(page, username, password);
      await page.reload();
      await page.waitForTimeout(2000);
      await utils.switchToUserTab(page);
      await utils.searchUser(page, username);
    });

    await test.step('点击删除并取消', async () => {
      await utils.clickDeleteUserBtn(page, username);
      await utils.cancelDeleteUser(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证用户仍存在', async () => {
      await utils.expectUserVisible(page, username);
    });
  });
});
