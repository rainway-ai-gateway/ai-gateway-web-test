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
const sessionUtils = require('../../utils/session');
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

    await test.step('同步共享登录态（auth.json）', async () => {
      // 后端每个用户只保留 1 个 Session Key：本次登录已让 auth.json 里的旧 Key 失效，
      // 若不回写，后续 spec 会拿着失效 Key 请求并弹出「Session Key 错误」遮罩，
      // 表现为元素可见但点击被遮挡（locator.click 超时）。
      await utils.persistAuthState(page);

      // 回写有效性与可观测性：auth.json 必须带上本次登录的新 Key
      const shared = sessionUtils.readAuthJsonUser();
      expect(shared && shared.sessionKey).toBeTruthy();
      common.log(
        'auth.json 已同步本次登录的 Session Key: ' +
          shared.sessionKey.substring(0, 10) +
          '...',
      );
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
