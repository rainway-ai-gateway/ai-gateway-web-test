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
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function globalSetup() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  let confInfo = {};
  try {
    const confPath = path.join(__dirname, './conf.json');
    confInfo = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
  } catch (e) {
    console.log('读取配置文件失败: ' + e.message);
    process.exit(1);
  }

  console.log('=== 全局登录开始 ===');

  const authPath = path.join(__dirname, 'auth.json');

  await page.addInitScript(() => {
    localStorage.setItem('lang', 'zh');
  });

  try {
    await page.goto(confInfo['ctlHost'], {
      timeout: 20000,
      waitUntil: 'domcontentloaded',
    });
  } catch (e) {
    if (
      e.message.includes('ERR_CONNECTION_REFUSED') ||
      e.message.includes('ERR_CONNECTION_RESET') ||
      e.message.includes('net::ERR')
    ) {
      if (fs.existsSync(authPath)) {
        console.log(
          '⚠️ 服务连接失败，但存在已有 auth.json，尝试复用: ' + e.message,
        );
        await browser.close();
        return;
      }
      console.log('❌ 服务连接失败: ' + e.message);
      console.log('❌ 没有可用的 auth.json，测试无法继续');
      await browser.close();
      process.exit(1);
    }
    throw e;
  }
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.waitForTimeout(1000);

  if (await page.locator("//input[@placeholder='请输入用户名']").isVisible()) {
    await page
      .locator("//input[@placeholder='请输入用户名']")
      .fill(confInfo['username']);
  } else if (
    await page
      .locator("//input[@placeholder='Please input Username']")
      .isVisible()
  ) {
    await page
      .locator("//input[@placeholder='Please input Username']")
      .fill(confInfo['username']);
  } else {
    console.log('未找到用户名输入框，可能已登录');
    await context.storageState({ path: authPath });
    console.log('=== 已登录，状态已保存到 auth.json ===');
    await browser.close();
    return;
  }
  console.log('输入用户名：' + confInfo['username']);

  await page.waitForTimeout(200);

  if (await page.locator("//input[@placeholder='请输入密码']").isVisible()) {
    await page
      .locator("//input[@placeholder='请输入密码']")
      .fill(confInfo['password']);
  } else if (
    await page
      .locator("//input[@placeholder='Please input Password']")
      .isVisible()
  ) {
    await page
      .locator("//input[@placeholder='Please input Password']")
      .fill(confInfo['password']);
  }
  console.log('输入密码：' + confInfo['password']);

  await page.waitForTimeout(200);

  if (await page.locator("//input[@name='captcha']").isVisible()) {
    await page.locator("//input[@name='captcha']").fill('1234');
    console.log('输入验证码：1234');
    await page.waitForTimeout(200);
  }

  if (await page.locator("//button/span[text()='登录']").isVisible()) {
    await page.locator("//button/span[text()='登录']").click();
  } else if (await page.locator("//button/span[text()='Login']").isVisible()) {
    await page.locator("//button/span[text()='Login']").click();
  } else if (await page.locator("//button[text()='登录']").isVisible()) {
    await page.locator("//button[text()='登录']").click();
  } else if (await page.locator("//button[text()='Login']").isVisible()) {
    await page.locator("//button[text()='Login']").click();
  }
  console.log('点击登录按钮');

  await page.waitForTimeout(500);
  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });
  } catch (e) {
    await page
      .waitForLoadState('domcontentloaded', { timeout: 10000 })
      .catch(() => {});
  }
  console.log('登录后URL: ' + page.url());

  const userData = await page.evaluate(() => {
    return localStorage.getItem('user');
  });
  console.log(
    'localStorage user: ' +
      (userData ? userData.substring(0, 50) + '...' : '空'),
  );

  if (!userData && page.url().includes('/login')) {
    console.log('警告: UI 登录未成功，尝试通过 apiHost 直连获取 session...');
    const apiHost = confInfo.apiHost || confInfo.ctlHost.replace('/login', '');
    try {
      const loginResp = await page.request.post(
        `${apiHost}/open-api/v1/auth/session-keys`,
        {
          data: {
            user_name: confInfo.username,
            password: confInfo.password,
          },
        },
      );
      const loginBody = await loginResp.json();
      if (loginBody.ErrNum === 200 && loginBody.Data?.session_key) {
        const injected = {
          name: loginBody.Data.user_name,
          sessionKey: loginBody.Data.session_key,
          is_admin: loginBody.Data.is_admin,
        };
        await page.evaluate((user) => {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('lang', 'zh');
        }, injected);
        console.log('已通过直连 API 注入 session: ' + injected.sessionKey);
      } else {
        console.log(
          '直连 API 登录失败: ' + JSON.stringify(loginBody).substring(0, 200),
        );
      }
    } catch (apiErr) {
      console.log('直连 API 登录异常: ' + apiErr.message);
    }
  }

  const finalUserData = await page.evaluate(() => localStorage.getItem('user'));
  if (!finalUserData) {
    console.log(
      '警告: auth.json 可能无效。请检查 conf.json 中的账号密码及 apiHost 服务是否可用。',
    );
    if (fs.existsSync(authPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
        const hadUser = (existing.origins || []).some((origin) =>
          (origin.localStorage || []).some(
            (item) => item.name === 'user' && item.value,
          ),
        );
        if (hadUser) {
          console.log('保留已有 auth.json（含 user session），不覆盖为空状态');
          await browser.close();
          return;
        }
      } catch (_) {
        /* 解析失败则继续写入 */
      }
    }
  }

  await context.storageState({ path: authPath });
  console.log('=== 全局登录完成，状态已保存到 auth.json ===');

  await browser.close();
}

module.exports = globalSetup;
