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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 用户管理 - 改密生效 / 删除当前登录用户 / 用户名排序（UM-54 / UM-55 / UM-56）
 *
 * 审计背景（2026-11-01，user 模块深度审计）：
 * - UM-17「合规新密码可提交成功」只断言**抽屉关闭**，没有任何用例验证「新密码真的生效、旧密码失效」——
 *   改密链路一旦断（前端未下发 password / 接口未更新），现有用例仍全绿。
 * - 「删除当前登录用户 → 提示『当前用户已被删除请重新登录』→ 强制退出」是 `User.vue` 的独立分支，无用例。
 * - 「用户名」列 `sortable: 'custom'`，但全模块无用例覆盖列排序。
 *
 * 本文件涉及多身份切换，统一使用空 storageState，避免污染 auth.json。
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const utils = require('../../pages/user/UserPage');

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../conf.json'), 'utf-8'),
  );
} catch (e) {
  confInfo = {};
}

test.use({ storageState: { cookies: [], origins: [] } });

const USER_ROW = '.show-iView-Table .ivu-table tbody tr';

async function loginAsAdmin(page) {
  await utils.login(page);
  await utils.gotoUserManagementPage(page);
}

/**
 * 注销：utils.clickLogoutMenu 按固定 confInfo.username（admin）定位下拉入口，
 * 以临时用户登录时必然超时；这里按当前登录用户名定位（header 显示的就是用户名）。
 */
async function logoutViaUi(page, currentUsername = confInfo['username']) {
  await page.getByText(currentUsername, { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('注销', { exact: true }).click();
  await utils.expectLogoutConfirmModal(page);
  await utils.confirmLogout(page);
  await page.waitForTimeout(2000);
}

async function readUserNames(page) {
  const texts = await page
    .locator(`${USER_ROW} td:nth-child(1)`)
    .allInnerTexts();
  return texts.map((t) => t.trim()).filter(Boolean);
}

test.describe('用户管理 - UM-54 改密后新密码生效', () => {
  test('管理员改密后：新密码可登录、旧密码失效', async ({ page }) => {
    const username = await utils.generateTestUsername();
    const oldPassword = 'InitPass2026a';
    const newPassword = 'ChangedPass2026b';

    await test.step('前置：admin 登录并创建测试用户', async () => {
      await loginAsAdmin(page);
      await utils.addUserViaApi(page, username, oldPassword);
    });

    await test.step('管理员通过 UI 将密码改为新密码', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.searchUser(page, username);
      await utils.openEditPasswordDrawer(page, username);
      await utils.fillEditPasswordForm(page, newPassword, newPassword);
      await utils.submitEditPasswordForm(page);
      await utils.expectEditPasswordDrawerHidden(page);
    });

    await test.step('新密码可登录', async () => {
      await logoutViaUi(page, confInfo['username']);
      await utils.loginAsUser(page, username, newPassword, 'system_admin');
      await expect(page, '新密码应能登录成功').not.toHaveURL(/\/login/);
    });

    await test.step('旧密码已失效', async () => {
      await logoutViaUi(page, username);
      await utils.gotoLoginPage(page);
      await utils.fillLoginForm(page, username, oldPassword);
      await utils.submitLoginForm(page);
      await page.waitForTimeout(2500);
      await expect(page, '旧密码不应再能登录').toHaveURL(/\/login/);
    });

    await test.step('恢复 admin 会话并清理测试用户', async () => {
      await utils.login(page);
      await utils.gotoUserManagementPage(page);
      await utils.deleteUserViaApi(page, username);
      await page.waitForTimeout(1000);
      await page.reload();
      await utils.searchUser(page, username);
      await utils.expectUserNotVisible(page, username);
    });
  });
});

test.describe('用户管理 - UM-55 删除当前登录用户', () => {
  // 已知产品缺口（覆盖缺口清单 §十六 #86）：自删成功后弹出「当前用户已被删除请重新登录」，
  // 点确定跳 /login，但服务端会话仍有效 → 应用把 /login 弹回 /user，用户实际未被强制退出。
  // 用 test.fail 固化期望；产品补「删除用户即失效其会话」后本条会意外通过，届时转正常用例。
  test.fail(
    true,
    '自删后跳转 /login 被仍有效的会话弹回 /user（会话未随用户删除失效）',
  );

  test('删除自己：提示「当前用户已被删除请重新登录」并强制退出，账号确实被删除', async ({
    page,
  }) => {
    const username = await utils.generateTestUsername();
    const password = await utils.generateTestPassword();

    await test.step('前置：admin 创建测试用户，再以该用户登录', async () => {
      await loginAsAdmin(page);
      await utils.addUserViaApi(page, username, password);
      await logoutViaUi(page, confInfo['username']);
      await utils.loginAsUser(page, username, password, 'system_admin');
      await utils.gotoUserManagementPage(page);
    });

    await test.step('对自己的行执行删除并确认', async () => {
      await utils.searchUser(page, username);
      await utils.clickDeleteUserBtn(page, username);
      await utils.expectDeleteConfirmModal(page);
      await utils.confirmDeleteUser(page);
    });

    await test.step('出现「当前用户已被删除请重新登录」并跳转登录页', async () => {
      await expect(
        page.getByText('当前用户已被删除请重新登录'),
      ).toBeVisible({ timeout: 20000 });
      // 弹窗为 $Modal.error(loading:true)，点「确定」后跳登录
      await page
        .locator('.ivu-modal-confirm-footer')
        .getByRole('button', { name: '确定' })
        .last()
        .click();
      await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
    });

    await test.step('admin 复核：该用户已不存在', async () => {
      await utils.login(page);
      await utils.gotoUserManagementPage(page);
      await utils.searchUser(page, username);
      await utils.expectUserNotVisible(page, username);
    });
  });
});

test.describe('用户管理 - UM-56 用户名列排序', () => {
  // 已知产品缺口（覆盖缺口清单 §十六 #85）：User.vue 的列配置 sortable: 'custom'
  // 但父组件未监听 on-sort-change，点击表头不会排序。用 test.fail 固化期望：
  // 产品补上排序实现后本条会「意外通过」，届时移除 test.fail 并转为正常用例。
  test.fail(
    true,
    '用户列表「用户名」列标记 sortable 但未实现排序（User.vue 未接 on-sort-change）',
  );

  test('点击「用户名」表头按升/降序重排，二次点击方向翻转', async ({ page }) => {
    await loginAsAdmin(page);

    const baseline = await readUserNames(page);
    expect(baseline.length, '用户列表应有数据').toBeGreaterThan(1);

    const table = utils.pageTable(page);
    const header = table.headers().filter({ hasText: '用户' }).first();
    await expect(header).toBeVisible({ timeout: 15000 });

    await test.step('第一次点击：按升序或降序排列', async () => {
      await header.click();
      await page.waitForTimeout(1500);
      const first = await readUserNames(page);
      expect([...first].sort(), '排序不应改变行集合').toEqual(
        [...baseline].sort(),
      );
      const asc = [...first].sort((a, b) => a.localeCompare(b));
      const desc = [...first].sort((a, b) => b.localeCompare(a));
      const ordered =
        JSON.stringify(first) === JSON.stringify(asc) ||
        JSON.stringify(first) === JSON.stringify(desc);
      expect(ordered, '第一次点击后应按用户名有序').toBe(true);
      test.info().annotations.push({
        type: 'sort_first_click',
        description: JSON.stringify(first.slice(0, 3)),
      });
    });

    await test.step('第二次点击：方向翻转', async () => {
      const beforeSecond = await readUserNames(page);
      await header.click();
      await page.waitForTimeout(1500);
      const second = await readUserNames(page);
      expect([...second].sort(), '排序不应改变行集合').toEqual(
        [...baseline].sort(),
      );
      const asc = [...second].sort((a, b) => a.localeCompare(b));
      const desc = [...second].sort((a, b) => b.localeCompare(a));
      const ordered =
        JSON.stringify(second) === JSON.stringify(asc) ||
        JSON.stringify(second) === JSON.stringify(desc);
      expect(ordered, '二次点击后仍应按用户名有序').toBe(true);
      expect(second, '二次点击应翻转排序方向（前后顺序不同）').not.toEqual(
        beforeSecond,
      );
    });
  });
});
