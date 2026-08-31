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
const common = require('../../utils/common');
const utils = require('../../pages/user/UserPage');
const fs = require('fs');
const path = require('path');

let confInfo = {};
try {
  const confPath = path.join(__dirname, '../../conf.json');
  confInfo = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

test.describe('用户管理 - UM-32 登录认证', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('UM-32 登录-成功', async ({ page }) => {
    await test.step('访问登录页面', async () => {
      await utils.gotoLoginPage(page);
    });

    await test.step('验证登录页面元素（已无验证码）', async () => {
      await utils.expectLoginPageVisible(page);
      await utils.expectLoginPageNoCaptcha(page);
    });

    await test.step('填写用户名密码并提交', async () => {
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

    await test.step('验证登录成功跳转', async () => {
      const url = page.url();
      common.log('登录后URL: ' + url);
      expect(url).not.toContain('/login');
    });
  });

  test('UM-33 登录-用户名错误', async ({ page }) => {
    await test.step('访问登录页面', async () => {
      await utils.gotoLoginPage(page);
    });

    await test.step('使用不存在的用户名登录', async () => {
      await utils.fillLoginForm(page, 'user_not_exist', 'wrongpass');
      await utils.submitLoginForm(page);
      await page.waitForTimeout(2000);
    });

    await test.step('验证停留在登录页', async () => {
      expect(page.url()).toContain('/login');
    });
  });

  test('UM-33-2 登录-密码错误', async ({ page }) => {
    await test.step('访问登录页面', async () => {
      await utils.gotoLoginPage(page);
    });

    await test.step('使用错误密码登录', async () => {
      await utils.fillLoginForm(
        page,
        confInfo['username'],
        'wrong_password_999',
      );
      await utils.submitLoginForm(page);
      await page.waitForTimeout(2000);
    });

    await test.step('验证停留在登录页', async () => {
      expect(page.url()).toContain('/login');
    });
  });
});
