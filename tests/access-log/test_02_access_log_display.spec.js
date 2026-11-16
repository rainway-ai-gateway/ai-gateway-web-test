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
/**
 * 访问日志 - 页面展示与只读视角（ACL-01 / ACL-02 / ACL-03）
 *
 * 设计依据：docs/access-log/02-功能测试用例/02a-配置展示与编辑.md
 * 运行：npx playwright test tests/access-log/test_02_access_log_display.spec.js
 */
const { test, expect } = require('@playwright/test');
const ap = require('../../pages/access-log/AccessLogPage');
const api = require('../../api/access-log-api-utils');
const readonly = require('../../utils/readonly');

test.describe('访问日志 - ACL-01 Alert 提示与卡片标题展示', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('Alert 标题/说明与两张卡片标题正确，标题不含 mod_access_pb3', async ({
    page,
  }) => {
    await test.step('1. Alert 为 info 类型且标题正确', async () => {
      const alert = ap.alertBlock(page);
      await expect(alert).toBeVisible();
      await expect(alert).toHaveClass(/ivu-alert-info/);
      await ap.expectAlertText(page, ap.DOC.alertTitle);
    });

    await test.step('2. 标题不含数据面模块名（mod_access_pb3）', async () => {
      await expect(ap.alertBlock(page).locator('.al-alert-title')).toHaveText(
        ap.DOC.alertTitle,
      );
      await expect(ap.alertBlock(page).locator('.al-alert-title')).not.toContainText(
        'mod_access_pb3',
      );
    });

    await test.step('3. 两张卡片标题与展示态按钮正确', async () => {
      await expect(ap.requestCard(page)).toContainText(ap.DOC.reqCardTitle);
      await expect(ap.responseCard(page)).toContainText(ap.DOC.resCardTitle);
      await expect(ap.editButton(page)).toBeVisible();
      await expect(ap.saveButton(page)).toHaveCount(0);
      await expect(ap.cancelButton(page)).toHaveCount(0);
    });
  });
});

test.describe('访问日志 - ACL-02 两段均未配置时的空态', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await api.restoreAccessLogConfigViaApi(page, {
      req_headers: [],
      res_headers: [],
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ap.expectAccessLogPageReady(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('未配置时两段展示空态文案且无 tag', async ({ page }) => {
    await ap.expectViewEmpty(page, ap.requestCard(page), ap.DOC.reqEmpty);
    await ap.expectViewEmpty(page, ap.responseCard(page), ap.DOC.resEmpty);
    await expect(ap.errorAlert(page)).toHaveCount(0);
  });
});

test.describe('访问日志 - ACL-03 只读管理员视角', () => {
  // 本用例不修改配置，故不做 API 造数 / 还原（只读会话无权 PUT，避免无意义的 402）
  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
  });

  test('只读角色：显示只读提示、隐藏编辑入口，仍可只读查看', async ({ page }) => {
    await test.step('1. 管理员对照：编辑按钮可见', async () => {
      await readonly.expectAdminVisible(
        ap.editButton(page),
        '访问日志-编辑',
      );
    });

    await test.step('2. 以只读系统管理员登录并进入页面', async () => {
      await readonly.loginAsReadonly(page);
      await readonly.gotoAsReadonly(page, 'access-log', {
        ready: ap.pageRoot(page),
      });
    });

    await test.step('3. 只读提示可见，写入口被 v-has 隐藏', async () => {
      await expect(ap.pageRoot(page)).toContainText(ap.DOC.readonlyHint);
      // v-has 挂在按钮容器上：断言容器带隐藏标记 + 按钮不可见
      await readonly.expectVHasHidden(
        ap.pageRoot(page).locator('.al-actions'),
        '访问日志写入口容器',
      );
      await readonly.expectHidden(
        readonly.buttonByText(ap.pageRoot(page), ap.DOC.edit),
        '编辑',
      );
    });

    await test.step('4. 白名单仍可只读查看（两段卡片可见）', async () => {
      await expect(ap.requestCard(page)).toBeVisible();
      await expect(ap.responseCard(page)).toBeVisible();
      await expect(ap.saveButton(page)).toHaveCount(0);
    });
  });
});