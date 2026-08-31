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
const path = require('path');

const DOC = utils.DOC_USER;

// 恢复登录状态，避免受 test_06 的 test.use 影响
test.use({ storageState: path.join(__dirname, '../../auth.json') });

test.describe('用户管理 - UM-36 用户名格式校验', () => {
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证非法用户名格式被拦截，合法用户名可提交', async ({ page }) => {
    await utils.gotoUserManagementPage(page);
    await utils.openAddUserDrawer(page);

    const invalidNames = ['-invalid', 'invalid.', 'user@name', 'user name'];
    for (const username of invalidNames) {
      await utils.fillAddUserForm(page, username, utils.getDocPassword());
      await utils.submitAddUserForm(page);
      await utils.expectAddUserFormFieldError(page, '用户名', DOC.tipNameRule);
    }

    const validName = await utils.generateTestUsername();
    cleanup.trackUsername(validName);
    await utils.fillAddUserForm(page, validName, utils.getDocPassword());
    await utils.submitAddUserForm(page);
    await utils.expectAddUserDrawerClosed(page);
    await utils.searchUser(page, validName);
    await utils.expectUserVisible(page, validName);
  });
});

test.describe('用户管理 - UM-37 用户名保留名', () => {
  test('验证保留用户名被拦截', async ({ page }) => {
    await utils.gotoUserManagementPage(page);
    await utils.openAddUserDrawer(page);

    for (const username of ['admin', 'root', 'system', 'Admin']) {
      await utils.fillAddUserForm(page, username, utils.getDocPassword());
      await utils.submitAddUserForm(page);
      await utils.expectAddUserFormFieldError(page, '用户名', DOC.tipNameRule);
    }

    await utils.closeAddUserDrawer(page);
  });
});

test.describe('用户管理 - UM-38 用户名长度边界', () => {
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证用户名长度 1-64 边界', async ({ page }) => {
    await utils.gotoUserManagementPage(page);

    await utils.openAddUserDrawer(page);
    const longName = 'a'.repeat(65);
    await utils.fillAddUserForm(page, longName, utils.getDocPassword());
    await utils.submitAddUserForm(page);
    await utils.expectAddUserDrawerOpen(page);
    await utils.closeAddUserDrawer(page);

    const shortName = 'z';
    cleanup.trackUsername(shortName);
    await utils.openAddUserDrawer(page);
    await utils.fillAddUserForm(page, shortName, utils.getDocPassword());
    await utils.submitAddUserForm(page);
    await utils.expectAddUserDrawerClosed(page);
    await utils.searchUser(page, shortName);
    await utils.expectUserVisible(page, shortName);
  });
});
