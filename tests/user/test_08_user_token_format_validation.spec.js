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
const { test } = require('@playwright/test');
const utils = require('../../pages/user/UserPage');

const DOC = utils.DOC_USER;

test.describe('用户管理 - UM-39 Token-名称格式校验', () => {
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test.beforeEach(async ({ page }) => {
    await utils.refreshAuthSession(page);
  });

  test('验证非法 Token 名称被拦截、合法名称可创建', async ({ page }) => {
    await utils.gotoTokenManagementPage(page);
    await utils.openCreateTokenDrawer(page);

    for (const tokenName of ['-token', 'token.', 'token name', 'token@1']) {
      await utils.fillCreateTokenForm(page, tokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.expectCreateTokenFormFieldError(
        page,
        '名称',
        DOC.tipTokenNameRule,
      );
    }

    const validName = await utils.generateTestTokenName();
    cleanup.trackTokenName(validName);
    await utils.fillCreateTokenForm(page, validName, '系统管理');
    await utils.submitCreateTokenForm(page);
    await utils.waitForCreateTokenSuccess(page, validName);
  });
});

test.describe('用户管理 - UM-40 Token-名称保留名与长度边界', () => {
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证保留名与长度边界', async ({ page }) => {
    await utils.gotoTokenManagementPage(page);
    await utils.openCreateTokenDrawer(page);

    for (const tokenName of ['admin', 'system', 'default', 'Admin']) {
      await utils.fillCreateTokenForm(page, tokenName, '系统管理');
      await utils.submitCreateTokenForm(page);
      await utils.expectCreateTokenFormFieldError(
        page,
        '名称',
        DOC.tipTokenNameRule,
      );
    }

    // 输入框 maxlength=64；验证 64 字符边界可成功创建（名称需唯一）
    let maxLenName = await utils.generateTestTokenName();
    maxLenName =
      maxLenName.length >= 64
        ? maxLenName.slice(0, 64)
        : maxLenName.padEnd(64, '0');
    cleanup.trackTokenName(maxLenName);
    await utils.fillCreateTokenForm(page, maxLenName, '系统管理');
    await utils.submitCreateTokenForm(page);
    await utils.waitForCreateTokenSuccess(page, maxLenName);

    await utils.openCreateTokenDrawer(page);
    const shortName = await utils.generateTestTokenName();
    cleanup.trackTokenName(shortName);
    await utils.fillCreateTokenForm(page, shortName, '系统管理');
    await utils.submitCreateTokenForm(page);
    await utils.waitForCreateTokenSuccess(page, shortName);
  });
});
