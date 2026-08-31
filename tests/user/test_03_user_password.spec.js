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

test.describe('用户管理 - UM-11 管理员修改其他用户密码-成功场景', () => {
  let username;
  const password = utils.getDocPassword();
  const newPassword = 'NewP@ss2026';
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证管理员修改其他用户密码成功', async ({ page }) => {
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

    await test.step('打开修改密码抽屉', async () => {
      await utils.openEditPasswordDrawer(page, username);
    });

    await test.step('验证无原密码字段', async () => {
      await utils.expectEditPasswordOldPasswordField(page, false);
    });

    await test.step('填写新密码并提交', async () => {
      await utils.fillEditPasswordForm(page, newPassword, newPassword);
      await utils.submitEditPasswordForm(page);
      await page.waitForTimeout(2000);
    });

    await test.step('验证用户仍存在', async () => {
      await utils.searchUser(page, username);
      await utils.expectUserVisible(page, username);
    });
  });
});

test.describe('用户管理 - UM-12 用户修改自己密码-原密码错误', () => {
  test('验证原密码错误时修改失败', async ({ page }) => {
    await test.step('进入用户管理页面', async () => {
      await utils.gotoUserManagementPage(page);
    });

    await test.step('对当前登录用户 admin 打开修改密码', async () => {
      await utils.searchUser(page, 'admin');
      await utils.openEditPasswordDrawer(page, 'admin');
    });

    await test.step('验证显示原密码字段', async () => {
      await utils.expectEditPasswordOldPasswordField(page, true);
    });

    await test.step('填写错误原密码并提交', async () => {
      await utils.fillEditPasswordForm(
        page,
        'NewP@ss2026',
        'NewP@ss2026',
        'WrongP@ss',
      );
      await utils.submitEditPasswordForm(page);
      await page.waitForTimeout(1500);
    });

    await test.step('验证修改密码抽屉保持打开', async () => {
      await utils.expectEditPasswordDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeEditPasswordDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-13 修改密码-新密码不匹配', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证新密码不匹配时无法提交', async ({ page }) => {
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

    await test.step('打开修改密码抽屉', async () => {
      await utils.openEditPasswordDrawer(page, username);
    });

    await test.step('填写不匹配的密码', async () => {
      await utils.fillEditPasswordForm(page, 'NewP@ss2026', 'NewP@ss2027');
      await utils.submitEditPasswordForm(page);
      await page.waitForTimeout(1000);
    });

    await test.step('验证抽屉未关闭', async () => {
      await utils.expectEditPasswordDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeEditPasswordDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-14 管理员修改其他用户密码-必填项校验', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证必填项校验', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);

    await test.step('准备测试用户', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.addUserViaApi(page, username, password);
      await page.reload();
      await page.waitForTimeout(2000);
      await utils.switchToUserTab(page);
      await utils.searchUser(page, username);
      await utils.openEditPasswordDrawer(page, username);
    });

    await test.step('不填写任何字段直接提交', async () => {
      await utils.submitEditPasswordForm(page);
      await page.waitForTimeout(1000);
      await utils.expectEditPasswordDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeEditPasswordDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-14-2 用户修改自己密码-必填项校验', () => {
  test('验证自己修改密码必填项校验', async ({ page }) => {
    await test.step('进入用户管理并对 admin 打开修改密码', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.searchUser(page, 'admin');
      await utils.openEditPasswordDrawer(page, 'admin');
    });

    await test.step('验证显示当前密码字段', async () => {
      await utils.expectEditPasswordOldPasswordField(page, true);
    });

    await test.step('不填写任何字段直接提交', async () => {
      await utils.submitEditPasswordForm(page);
      await page.waitForTimeout(1000);
      await utils.expectEditPasswordDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeEditPasswordDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-15 修改密码-密码格式校验', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证不合规新密码无法提交', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);

    await test.step('准备测试用户', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.addUserViaApi(page, username, password);
      await page.reload();
      await page.waitForTimeout(2000);
      await utils.switchToUserTab(page);
      await utils.searchUser(page, username);
      await utils.openEditPasswordDrawer(page, username);
    });

    await test.step('7 字符密码被拦截', async () => {
      await utils.fillEditPasswordForm(page, '1234567', '1234567');
      await utils.submitEditPasswordForm(page);
      await utils.expectEditPasswordDrawerOpen(page);
      await utils.expectEditPasswordFormFieldError(
        page,
        '新密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('含空格密码被拦截', async () => {
      await utils.fillEditPasswordForm(page, 'pass word123', 'pass word123');
      await utils.submitEditPasswordForm(page);
      await utils.expectEditPasswordDrawerOpen(page);
      await utils.expectEditPasswordFormFieldError(
        page,
        '新密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('密码等于用户名被拦截', async () => {
      await utils.fillEditPasswordForm(page, username, username);
      await utils.submitEditPasswordForm(page);
      await utils.expectEditPasswordDrawerOpen(page);
      await utils.expectEditPasswordFormFieldError(
        page,
        '新密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('密码等于用户名逆序被拦截', async () => {
      const reversed = username.split('').reverse().join('');
      await utils.fillEditPasswordForm(page, reversed, reversed);
      await utils.submitEditPasswordForm(page);
      await utils.expectEditPasswordDrawerOpen(page);
      await utils.expectEditPasswordFormFieldError(
        page,
        '新密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeEditPasswordDrawer(page);
    });
  });

  test('验证合规新密码可提交成功', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);
    const newPassword = 'newpass2026';

    await test.step('准备测试用户', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.addUserViaApi(page, username, password);
      await page.reload();
      await page.waitForTimeout(2000);
      await utils.switchToUserTab(page);
      await utils.searchUser(page, username);
      await utils.openEditPasswordDrawer(page, username);
    });

    await test.step('提交合规新密码', async () => {
      await utils.fillEditPasswordForm(page, newPassword, newPassword);
      await utils.submitEditPasswordForm(page);
      await utils.expectEditPasswordDrawerHidden(page);
    });
  });
});

test.describe('用户管理 - UM-16 修改密码-新密码与原密码相同', () => {
  test('验证新密码与原密码相同时失败', async ({ page }) => {
    await test.step('对 admin 打开修改密码（修改自己密码场景）', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.searchUser(page, 'admin');
      await utils.openEditPasswordDrawer(page, 'admin');
    });

    await test.step('填写相同的新旧密码并提交', async () => {
      const samePassword = utils.getDocPassword();
      await utils.fillEditPasswordForm(
        page,
        samePassword,
        samePassword,
        samePassword,
      );
      await utils.submitEditPasswordForm(page);
      await page.waitForTimeout(1500);
    });

    await test.step('验证抽屉保持打开或提交失败', async () => {
      await utils.expectEditPasswordDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeEditPasswordDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-17 修改密码-取消操作', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证取消操作不修改密码', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);

    await test.step('准备测试用户', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.addUserViaApi(page, username, password);
      await page.reload();
      await page.waitForTimeout(2000);
      await utils.switchToUserTab(page);
      await utils.searchUser(page, username);
      await utils.openEditPasswordDrawer(page, username);
    });

    await test.step('填写新密码后取消', async () => {
      await utils.fillEditPasswordForm(page, 'NewP@ss2026', 'NewP@ss2026');
      await utils.closeEditPasswordDrawer(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证抽屉已关闭且用户仍存在', async () => {
      await utils.expectEditPasswordDrawerHidden(page);
      await utils.expectUserVisible(page, username);
    });
  });
});
