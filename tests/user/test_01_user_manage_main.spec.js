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

test.describe('用户管理 - UM-01 用户列表展示', () => {
  test('验证用户列表页面正确渲染', async ({ page }) => {
    let table;

    await test.step('进入用户管理页面', async () => {
      await utils.gotoUserManagementPage(page);
      table = utils.pageTable(page);
      common.log('当前URL: ' + page.url());
    });

    await test.step('验证布局壳层加载', async () => {
      await utils.expectUserManagementLayout(page);
    });

    await test.step('验证页面标题', async () => {
      await utils.expectUserManagementPageTitle(page);
    });

    await test.step('验证 Tab 页签', async () => {
      await utils.expectUserManagementTabs(page);
    });

    await test.step('验证添加用户按钮', async () => {
      await expect(
        page.getByRole('button', { name: '添加用户' }),
      ).toBeVisible();
    });

    await test.step('验证搜索框', async () => {
      const searchInput = table.searchInput('请输入用户查询');
      if ((await searchInput.count()) > 0) {
        await expect(searchInput).toBeVisible();
      } else {
        await expect(page.getByPlaceholder('请输入用户查询')).toBeVisible();
      }
    });

    await test.step('验证用户列表表格', async () => {
      await expect(table.rootLocator()).toBeVisible();
      await table.expectHeaders('用户', '角色', '操作');
      await table.expectRowVisible('admin');
    });

    await test.step('验证操作列按钮', async () => {
      await expect(table.rowAction('admin', '修改密码')).toBeVisible();
      await expect(table.rowAction('admin', '删除')).toBeVisible();
    });

    await test.step('验证分页控件', async () => {
      await table.expectPaginationVisible();
    });
  });
});

test.describe('用户管理 - UM-02 用户搜索功能', () => {
  test('验证用户搜索功能正常工作', async ({ page }) => {
    let table;

    await test.step('进入用户管理页面', async () => {
      await utils.gotoUserManagementPage(page);
      table = utils.pageTable(page);
    });

    await test.step('搜索已存在用户（部分匹配 adm）', async () => {
      await table.search('adm');
      await table.expectRowVisible('admin');
    });

    await test.step('清空搜索框，验证显示所有用户', async () => {
      await table.clearSearch();
      const rowCount = await table.rowCount();
      expect(rowCount).toBeGreaterThan(0);
    });

    await test.step('搜索不存在的用户', async () => {
      await table.search('testuser999');
      await page.waitForTimeout(1000);
    });
  });
});

test.describe('用户管理 - UM-03 分页功能', () => {
  const password = utils.getDocPassword();
  const cleanup = utils.createUserTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证分页功能正常工作', async ({ page }) => {
    let table;

    await test.step('进入用户管理页面', async () => {
      await utils.gotoUserManagementPage(page);
      table = utils.pageTable(page);
    });

    await test.step('确保数据足够分页', async () => {
      const rowCount = await table.rowCount();
      common.log('当前列表用户数: ' + rowCount);

      if (!(await table.needsMoreRowsForPagination())) {
        common.log('用户数量已足够分页，跳过 API 添加');
        return;
      }

      const needCount = 25 - rowCount;
      common.log('用户不足分页，通过 API 补充 ' + needCount + ' 个用户');
      for (let i = 0; i < needCount; i++) {
        const username = await utils.generateTestUsername();
        cleanup.trackUsername(username);
        await utils.addUserViaApi(page, username, password);
      }

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await utils.navigateToUserManagement(page);
      table = utils.pageTable(page);
    });

    await test.step('验证分页控件显示', async () => {
      await table.expectPaginationVisible();
    });

    await test.step('测试第2页导航', async () => {
      await table.clickPageNumber(2);
    });

    await test.step('测试下一页导航', async () => {
      await table.clickNextPage();
    });

    await test.step('测试上一页导航', async () => {
      await table.clickPreviousPage();
    });

    await test.step('切换每页显示50条', async () => {
      await table.changePageSize('50条/页');
    });
  });
});
