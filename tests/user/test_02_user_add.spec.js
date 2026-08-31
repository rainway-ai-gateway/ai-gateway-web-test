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

test.describe('用户管理 - UM-04 添加用户-成功场景', () => {
  let username;
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证添加用户成功', async ({ page }) => {
    username = await utils.generateTestUsername();
    cleanup.trackUsername(username);

    await test.step('进入用户管理页面', async () => {
      await utils.gotoUserManagementPage(page);
    });

    await test.step('打开添加用户抽屉', async () => {
      await utils.openAddUserDrawer(page);
    });

    await test.step('填写添加用户表单', async () => {
      await utils.fillAddUserForm(page, username, password, password);
    });

    await test.step('提交表单', async () => {
      await utils.submitAddUserForm(page);
      await page.waitForTimeout(2000);
    });

    await test.step('验证用户已添加', async () => {
      await utils.searchUser(page, username);
      await utils.expectUserVisible(page, username);
    });
  });
});

test.describe('用户管理 - UM-05 添加用户-密码不匹配', () => {
  test('验证密码不匹配时无法提交', async ({ page }) => {
    await test.step('进入用户管理页面并打开抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.openAddUserDrawer(page);
    });

    await test.step('填写不匹配的密码', async () => {
      await utils.fillAddUserForm(
        page,
        'testuser01',
        utils.getDocPassword(),
        'Itm@2027',
      );
    });

    await test.step('提交并验证抽屉未关闭', async () => {
      await utils.submitAddUserForm(page);
      await page.waitForTimeout(1000);
      await utils.expectAddUserDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeAddUserDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-06 添加用户-必填项校验', () => {
  test('验证必填项校验', async ({ page }) => {
    await test.step('进入用户管理页面并打开抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.openAddUserDrawer(page);
    });

    await test.step('不填写任何字段直接提交', async () => {
      await utils.submitAddUserForm(page);
      await page.waitForTimeout(1000);
      await utils.expectAddUserDrawerOpen(page);
    });

    await test.step('仅填写用户名', async () => {
      await utils.fillAddUserForm(page, 'testuser_empty', '', '');
      await utils.submitAddUserForm(page);
      await page.waitForTimeout(1000);
      await utils.expectAddUserDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeAddUserDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-07 添加用户-重复用户名', () => {
  test('验证重复用户名无法添加', async ({ page }) => {
    await test.step('进入用户管理页面并打开抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.openAddUserDrawer(page);
    });

    await test.step('填写已存在的用户名 admin', async () => {
      await utils.fillAddUserForm(
        page,
        'admin',
        utils.getDocPassword(),
        utils.getDocPassword(),
      );
    });

    await test.step('提交并验证失败', async () => {
      await utils.submitAddUserForm(page);
      await page.waitForTimeout(1500);
      await utils.expectAddUserDrawerOpen(page);
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeAddUserDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-08 添加用户-密码格式校验', () => {
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证不合规密码无法提交', async ({ page }) => {
    await test.step('进入用户管理页面并打开抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.openAddUserDrawer(page);
    });

    await test.step('7 字符密码被拦截', async () => {
      await utils.fillAddUserForm(page, 'testuser02', '1234567', '1234567');
      await utils.submitAddUserForm(page);
      await utils.expectAddUserFormFieldError(
        page,
        '密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('含空格密码被拦截', async () => {
      await utils.fillAddUserForm(
        page,
        'testuser02',
        'pass word123',
        'pass word123',
      );
      await utils.submitAddUserForm(page);
      await utils.expectAddUserFormFieldError(
        page,
        '密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('密码等于用户名被拦截', async () => {
      await utils.fillAddUserForm(
        page,
        'testuser02',
        'testuser02',
        'testuser02',
      );
      await utils.submitAddUserForm(page);
      await utils.expectAddUserFormFieldError(
        page,
        '密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('密码等于用户名逆序被拦截', async () => {
      await utils.fillAddUserForm(page, 'abc', 'cba', 'cba');
      await utils.submitAddUserForm(page);
      await utils.expectAddUserFormFieldError(
        page,
        '密码',
        utils.DOC_USER.tipPasswordRule,
      );
    });

    await test.step('合规密码可提交', async () => {
      const username = await utils.generateTestUsername();
      cleanup.trackUsername(username);
      await utils.fillAddUserForm(page, username, 'password123', 'password123');
      await utils.submitAddUserForm(page);
      await utils.expectAddUserDrawerClosed(page);
      await utils.searchUser(page, username);
      await utils.expectUserVisible(page, username);
    });
  });
});

test.describe('用户管理 - UM-09 添加用户-重置表单', () => {
  test('验证重置表单清空字段', async ({ page }) => {
    await test.step('进入用户管理页面并打开抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.openAddUserDrawer(page);
    });

    await test.step('填写表单内容', async () => {
      await utils.fillAddUserForm(
        page,
        'testuser03',
        utils.getDocPassword(),
        utils.getDocPassword(),
      );
    });

    await test.step('点击重置按钮', async () => {
      await utils.resetAddUserForm(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证表单已清空', async () => {
      await utils.expectAddUserFormFieldValue(page, '用户名', '');
    });

    await test.step('关闭抽屉', async () => {
      await utils.closeAddUserDrawer(page);
    });
  });
});

test.describe('用户管理 - UM-10 添加用户-关闭弹窗', () => {
  test('验证关闭抽屉不添加用户', async ({ page }) => {
    await test.step('进入用户管理页面并打开抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.openAddUserDrawer(page);
    });

    await test.step('填写部分内容', async () => {
      await utils.fillAddUserForm(page, 'testuser04', '', '');
    });

    await test.step('点击关闭按钮', async () => {
      await utils.closeAddUserDrawerByX(page);
      await page.waitForTimeout(500);
    });

    await test.step('验证抽屉已关闭', async () => {
      await utils.searchUser(page, 'testuser04');
      await utils.expectUserNotVisible(page, 'testuser04');
    });
  });
});
