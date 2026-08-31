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

test.describe('用户管理 - UM-35 注销-取消', () => {
  test('验证取消注销保持登录状态', async ({ page }) => {
    await test.step('进入系统页面', async () => {
      await utils.gotoUserManagementPage(page);
    });

    await test.step('打开注销菜单', async () => {
      await utils.clickLogoutMenu(page);
      await utils.expectLogoutConfirmModal(page);
    });

    await test.step('取消注销', async () => {
      await utils.cancelLogout(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证仍停留在系统页面', async () => {
      await utils.expectUserManagementPageTitle(page);
      expect(page.url()).not.toContain('/login');
    });
  });
});

test.describe('用户管理 - UM-34 注销-成功', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('验证注销成功跳转登录页', async ({ page }) => {
    await test.step('先登录系统', async () => {
      await utils.gotoLoginPage(page);
      const confInfo = require('../../conf.json');
      await utils.fillLoginForm(
        page,
        confInfo['username'],
        confInfo['password'],
      );
      await utils.submitLoginForm(page);
      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 30000,
      });
    });

    await test.step('打开注销菜单', async () => {
      await utils.clickLogoutMenu(page);
      await utils.expectLogoutConfirmModal(page);
    });

    await test.step('确认注销', async () => {
      await utils.confirmLogout(page);
      await page.waitForTimeout(2000);
    });

    await test.step('验证跳转到登录页', async () => {
      expect(page.url()).toContain('/login');
    });
  });
});
