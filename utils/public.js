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
/*
 * @Description: AI Gateway 公共业务功能（登录 / 注销）
 */
const { expect } = require('@playwright/test');
const common = require('./common');

/**
 * 登录
 * @param {Page} page
 * @param {string} username
 * @param {string} password
 */
async function login(page, username, password) {
  const confInfo = JSON.parse(common.getConf());
  if (!username) username = confInfo.username;
  if (!password) password = confInfo.password;

  const baseUrl = confInfo.ctlHost;
  for (let i = 0; i <= 2; i++) {
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'zh');
    });
    await page.goto(baseUrl);
    await page.setViewportSize({ width: 1920, height: 1080 });

    for (let t = 1; t <= 7; t++) {
      common.log('sleep ' + t + ' ...');
      await page.waitForTimeout(t * 1000);
      if (
        (await page.locator("//input[@placeholder='请输入用户名']").isVisible()) ||
        (await page.locator("//input[@placeholder='Please input Username']").isVisible())
      ) {
        break;
      }
    }

    if (await page.locator("//input[@placeholder='请输入用户名']").isVisible()) {
      await page.locator("//input[@placeholder='请输入用户名']").fill(username);
    } else {
      await page.locator("//input[@placeholder='Please input Username']").fill(username);
    }
    common.log('输入用户名：' + username);

    if (await page.locator("//input[@placeholder='请输入密码']").isVisible()) {
      await page.locator("//input[@placeholder='请输入密码']").fill(password);
    } else {
      await page.locator("//input[@placeholder='Please input Password']").fill(password);
    }
    common.log('输入密码：' + password);

    await page.waitForTimeout(500);

    if (await page.locator("//button/span[text()='登录']").isVisible()) {
      await page.locator("//button/span[text()='登录']").click();
    } else {
      await page.locator("//button/span[text()='Login']").click();
    }

    const welcomeXpath = 'div .routerView h3';
    const welcome2Xpath = "//h3[contains(text(), 'Welcome')]";
    const usernameXpath = "//div[contains(text(), '" + username + "')]";
    const userPassFailXpath =
      "//div[@class='ivu-modal-confirm-body']/div[contains(text(), 'Username or password error')]";
    const userPassFailXpath2 =
      "//span[contains(text(), 'Username or password error')]";
    const passwordExpiredTipXpath =
      "//div[text()='Password expired, logged out']/parent::div/following-sibling::div//button/span[text()='OK']";
    const passwordExpiredTip2Xpath =
      "//p[text()='Your password has expired, please change it']";

    for (let h = 1; h <= 5; h++) {
      common.log('sleep ' + h + ' ...');
      await page.waitForTimeout(h * 1000);
      if (
        (await page.locator(welcomeXpath).isVisible()) ||
        (await page.locator(welcome2Xpath).isVisible()) ||
        (await page.locator(usernameXpath).isVisible()) ||
        (await page.locator(passwordExpiredTipXpath).isVisible()) ||
        (await page.locator(userPassFailXpath).isVisible()) ||
        (await page.locator(userPassFailXpath2).isVisible()) ||
        (await page.locator(passwordExpiredTip2Xpath).isVisible())
      ) {
        break;
      }
    }

    if (
      (await page.locator(welcomeXpath).isVisible()) ||
      (await page.locator(welcome2Xpath).isVisible())
    ) {
      break;
    } else if (await page.locator(passwordExpiredTipXpath).isVisible()) {
      await page.locator(passwordExpiredTipXpath).click();
    } else if (await page.locator(userPassFailXpath).isVisible()) {
      if (i < 2 && confInfo.changePassword) {
        password = confInfo.changePassword;
        continue;
      }
      common.log('用户名或密码错误!!!');
      throw new Error('登录失败：用户名或密码错误');
    } else if (await page.locator(passwordExpiredTip2Xpath).isVisible()) {
      common.log('您的密码已过期，需要修改密码');
      const upass = confInfo.changePassword;
      await page
        .locator("//input[@placeholder='Please input old password']")
        .fill(confInfo.password);
      await page.locator("//input[@placeholder='Please input password']").fill(upass);
      await page
        .locator("//input[@placeholder='Please confirm password again']")
        .fill(upass);
      await page
        .locator(
          passwordExpiredTip2Xpath +
            "/following-sibling::form//button//span[text()='OK']",
        )
        .click();
      common.log('密码修改成功：' + upass);
      confInfo.password = upass;
      common.writeFileSync('conf.json', JSON.stringify(confInfo));
      password = upass;
      continue;
    } else {
      break;
    }
  }

  let welcomeXpath = 'div .routerView h3';
  if (!(await page.locator('div .routerView h3').isVisible())) {
    welcomeXpath = "//h3[contains(text(), '欢迎')]";
  }
  const welcome = page.locator(welcomeXpath);
  const welcomeContent = await page.locator(welcomeXpath).textContent();
  common.log(welcomeContent);
  await expect(welcome).toContainText(username);
  common.log('Login successfully!');
  await switchLanguageToChinese(page);
}

async function switchLanguageToChinese(page) {
  for (let t = 1; t <= 3; t++) {
    await page.waitForTimeout(t * 500);
    const chineseLangBtn = page.locator("//span[text()='中文']");
    if (await chineseLangBtn.isVisible()) {
      common.log('当前语言已是中文，无需切换');
      return;
    }

    const englishLangBtn = page.locator("//span[text()='English']");
    if (await englishLangBtn.isVisible()) {
      common.log('尝试切换语言为中文...');
      await englishLangBtn.click();
      await page.waitForTimeout(1000);
      const chineseOption = page.locator("//li[text()='中文']");
      if (await chineseOption.isVisible()) {
        await chineseOption.click();
        await page.waitForTimeout(3000);
        if (await page.locator("//span[text()='中文']").isVisible()) {
          common.log('语言切换成功');
        } else {
          common.log('语言切换失败');
          throw new Error('语言切换失败');
        }
      } else {
        common.log('未找到中文选项');
        throw new Error('未找到中文选项');
      }
      break;
    }
  }
}

/**
 * 退出登录
 * @param {Page} page
 */
async function logout(page) {
  await page
    .locator(
      "//ul[@class='bfe-header']/li[2]/div[contains(@class, 'header_name')]",
    )
    .click();
  await page.waitForTimeout(1000);
  await page
    .locator(
      "//ul[@class='bfe-header']/li[2]/div[contains(@class, 'header_name')]//li[text()='注销']",
    )
    .click();
  await page
    .locator(
      "//p[text()='确认注销？']/parent::div/following-sibling::div//span[text()='确定']",
    )
    .click();
  common.log('Exit successfully!');
}

module.exports = {
  login,
  logout,
};
