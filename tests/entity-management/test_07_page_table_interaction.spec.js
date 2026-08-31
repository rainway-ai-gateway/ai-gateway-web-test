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
const utils = require('../../pages/entity/EntityPage');
const { PageTableComponent } = require('../../components/layout');

const DOC = utils.DOC_API_KEY;

/**
 * PageTable 通用组件交互测试
 *
 * 覆盖手工测试发现的两个通用表格组件缺陷：
 * - Bug 2: 添加/编辑后搜索条件残留（未清空但已失效）
 * - Bug 3: 翻页编辑后数据跑到第一页，但页脚页码仍在第二页
 *
 * 使用 API-Key 管理页面作为测试载体，因为 PageTable 是所有列表的公用组件。
 */

function apiKeyDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createApiKeyTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

// ==================== Bug 2: 添加/编辑后搜索条件残留 ====================

apiKeyDescribe('PageTable - PT-01 添加后搜索条件应被清空', (cleanup) => {
  let description;

  test('验证添加API-Key成功后，之前输入的搜索条件被清空', async ({ page }) => {
    description = DOC.searchDescription + '_pt_clear_' + Date.now();

    await test.step('前置：进入API-Key管理页面', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 输入一个查不到数据的搜索条件', async () => {
      await utils.searchApiKeyByDescription(page, '不存在的描述_xyz');
      // 等待列表响应完成
      await page.waitForTimeout(1000);
    });

    await test.step('2. 验证搜索框中有值', async () => {
      const table = new PageTableComponent(page);
      const searchInput = page.getByPlaceholder(
        utils.API_KEY_SEARCH_PLACEHOLDER,
      );
      await expect(searchInput).toHaveValue('不存在的描述_xyz');
    });

    await test.step('3. 点击"添加"按钮并创建API-Key', async () => {
      await utils.openAddApiKeyDrawer(page);
      await utils.fillApiKeyDescription(page, description);
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('4. 验证添加成功后搜索条件被清空', async () => {
      const searchInput = page.getByPlaceholder(
        utils.API_KEY_SEARCH_PLACEHOLDER,
      );
      // 预期：添加成功后搜索条件应被清空
      await expect(searchInput).toHaveValue('');
    });

    await test.step('5. 验证新创建的API-Key在列表中可见', async () => {
      await utils.ensureApiKeyRowVisible(page, description);
      const apiKey = await utils.findApiKeyByDescriptionViaApi(
        page,
        description,
      );
      if (apiKey?.id) {
        cleanup.trackApiKeyId(apiKey.id);
      }
    });
  });
});

apiKeyDescribe('PageTable - PT-02 编辑后搜索条件应被清空', (cleanup) => {
  let description;
  let apiKeyId;
  const newDescription = DOC.editDescription + '_pt_clear_' + Date.now();

  test('验证编辑API-Key成功后，之前输入的搜索条件被清空', async ({ page }) => {
    description = DOC.searchDescription + '_pt_edit_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
      await utils.ensureApiKeyRowVisible(page, description);
    });

    await test.step('1. 输入搜索条件筛选出部分数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const searchInput = page.getByPlaceholder(
        utils.API_KEY_SEARCH_PLACEHOLDER,
      );
      await expect(searchInput).toHaveValue(description);
    });

    await test.step('2. 编辑该API-Key的描述', async () => {
      await utils.openEditApiKeyDrawer(page, description);
      await utils.fillApiKeyDescription(page, newDescription, '编辑 API-Key');
      await utils.submitApiKeyFormAndWaitForEditSuccess(page);
    });

    await test.step('3. 验证编辑成功后搜索条件被清空', async () => {
      const searchInput = page.getByPlaceholder(
        utils.API_KEY_SEARCH_PLACEHOLDER,
      );
      // 预期：编辑成功后搜索条件应被清空
      await expect(searchInput).toHaveValue('');
    });

    await test.step('4. 验证编辑后的数据在列表中可见', async () => {
      await utils.ensureApiKeyRowVisible(page, newDescription);
    });
  });
});

apiKeyDescribe(
  'PageTable - PT-03 筛选条件下添加后搜索条件应被清空',
  (cleanup) => {
    let description;

    test('验证在有筛选条件时添加API-Key后，筛选条件被清空', async ({
      page,
    }) => {
      description = DOC.searchDescription + '_pt_filter_' + Date.now();

      await test.step('前置：进入API-Key管理页面', async () => {
        await utils.gotoApiKeyManagementPage(page);
        await utils.reloadApiKeyManagementPage(page);
      });

      await test.step('1. 选择状态筛选条件"启用"', async () => {
        await utils.selectApiKeyStatusFilter(page, '启用');
        await page.waitForTimeout(500);
      });

      await test.step('2. 点击"添加"按钮并创建API-Key', async () => {
        await utils.openAddApiKeyDrawer(page);
        await utils.fillApiKeyDescription(page, description);
        await utils.submitApiKeyFormAndWaitForSuccess(page);
      });

      await test.step('3. 验证添加成功后筛选条件被清空或重置', async () => {
        // 预期：添加成功后，筛选条件应被清空或重置为"全部"
        const searchArea = page.locator('.page-table .searchTable').first();
        const statusSelect = searchArea.locator('.ivu-select').nth(0);
        const selectText = await statusSelect.innerText();
        // 筛选条件应被重置为"全部"或清空
        const isCleared =
          selectText.includes('全部') ||
          selectText.includes('请选择') ||
          selectText.trim() === '';
        expect(isCleared).toBeTruthy();
      });

      await test.step('4. 验证新创建的API-Key在列表中可见', async () => {
        await utils.ensureApiKeyRowVisible(page, description);
        const apiKey = await utils.findApiKeyByDescriptionViaApi(
          page,
          description,
        );
        if (apiKey?.id) {
          cleanup.trackApiKeyId(apiKey.id);
        }
      });
    });
  },
);

// ==================== Bug 3: 翻页编辑后页码异常 ====================

apiKeyDescribe(
  'PageTable - PT-04 编辑第二页数据后页码应回到第一页',
  (cleanup) => {
    let descriptions = [];

    test('验证编辑第二页的数据后，页码正确回到第一页', async ({ page }) => {
      // 需要创建足够多的 API-Key 以触发分页（默认每页 20 条）
      const count = 22;
      let editDesc;

      await test.step('前置：批量创建API-Key以触发分页', async () => {
        await utils.gotoApiKeyManagementPage(page);
        for (let i = 0; i < count; i++) {
          const desc =
            DOC.searchDescription + '_pt_page_' + Date.now() + '_' + i;
          descriptions.push(desc);
          const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
            description: desc,
          });
          if (apiKey?.id) {
            cleanup.trackApiKeyId(apiKey.id);
          }
        }
        await utils.reloadApiKeyManagementPage(page);
        await page.waitForTimeout(1000);
      });

      await test.step('1. 验证分页控件可见且有多页', async () => {
        const table = new PageTableComponent(page);
        const hasMulti = await table.hasMultiplePages();
        expect(hasMulti).toBeTruthy();
      });

      await test.step('2. 翻到第二页', async () => {
        const table = new PageTableComponent(page);
        await utils.waitForApiKeysListResponse(page, () =>
          table.clickPageNumber(2),
        );
        await page.waitForTimeout(500);
      });

      await test.step('3. 验证当前在第二页（页码按钮2可见）', async () => {
        const pagination = page.locator('.el-pagination').first();
        const page2Btn = pagination
          .getByRole('listitem')
          .filter({ hasText: '2' });
        await expect(page2Btn).toBeVisible({ timeout: 5000 });
      });

      await test.step('4. 记录第二页第一条数据并编辑', async () => {
        const table = new PageTableComponent(page);
        const firstDataRow = table.dataRows().first();
        await expect(firstDataRow).toBeVisible({ timeout: 5000 });
        const descCell = firstDataRow.locator('td').nth(2);
        const originalText = await descCell.innerText();
        editDesc = originalText.trim() + '_edited';

        await utils.openEditApiKeyDrawer(page, originalText.trim());
        await utils.fillApiKeyDescription(page, editDesc, '编辑 API-Key');
        await utils.submitApiKeyFormAndWaitForEditSuccess(page);
      });

      await test.step('5. 验证编辑后页码与数据一致', async () => {
        const pagination = page.locator('.el-pagination').first();
        if ((await pagination.count()) === 0) {
          return;
        }

        // 获取分页组件中当前激活的页码
        // Element UI 分页激活页码有 .active class
        const paginationHtml = await pagination.innerHTML();
        const activeMatch = paginationHtml.match(
          /class="[^"]*active[^"]*"[^>]*>(\d+)</,
        );
        const activePage = activeMatch ? parseInt(activeMatch[1]) : null;

        // 获取当前表格第一行的描述
        const table = new PageTableComponent(page);
        const firstRow = table.dataRows().first();
        if ((await firstRow.count()) === 0) return;
        const currentFirstDesc = await firstRow
          .locator('td')
          .nth(2)
          .innerText();

        // 核心检测逻辑：
        // 如果当前显示的数据不在第二页的数据范围内（说明数据已刷新到第一页），
        // 但分页仍显示第二页为激活状态，则说明存在 Bug 3
        if (activePage === 2) {
          // 分页显示在第2页，但实际数据可能已经是第1页的数据
          // 验证：编辑后的数据（editDesc）应该可见
          const editedRow = table.rowByText(editDesc);
          if ((await editedRow.count()) === 0) {
            // 编辑后的数据不可见，说明数据已刷新到第一页
            // 但分页仍在第二页 → 这就是 Bug 3
            throw new Error(
              `Bug 3 检出：分页组件仍显示第${activePage}页，` +
                `但表格数据已刷新（编辑后的"${editDesc}"不可见）。` +
                `当前第一行显示: "${currentFirstDesc.trim()}"`,
            );
          }
        }
      });
    });
  },
);

apiKeyDescribe('PageTable - PT-05 嵌套字段列排序应生效', () => {
  test('验证配额列与挂载 Entity 列排序后行顺序发生变化', async ({ page }) => {
    await test.step('前置：进入 API-Key 管理页面', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 读取排序前的配额列与 Entity 列', async () => {
      const table = new PageTableComponent(page);
      const rows = table.dataRows();
      await expect(rows.first()).toBeVisible({ timeout: 5000 });
      const rowCount = await rows.count();
      test.skip(rowCount < 2, '至少需要 2 条 API-Key 数据才能验证排序');

      const quotaTexts = [];
      const entityTexts = [];
      for (let i = 0; i < Math.min(rowCount, 3); i++) {
        quotaTexts.push((await rows.nth(i).locator('td').nth(5).innerText()).trim());
        entityTexts.push((await rows.nth(i).locator('td').nth(7).innerText()).trim());
      }
      page.__pt05Before = { quotaTexts, entityTexts };
    });

    await test.step('2. 点击配额列排序并验证顺序变化', async () => {
      const table = new PageTableComponent(page);
      const rows = table.dataRows();
      const quotaHeader = page.locator('.show-iView-Table th').filter({ hasText: '配额' }).first();
      await quotaHeader.click();
      await page.waitForTimeout(500);

      const afterQuotaTexts = [];
      const rowCount = await rows.count();
      for (let i = 0; i < Math.min(rowCount, 3); i++) {
        afterQuotaTexts.push((await rows.nth(i).locator('td').nth(5).innerText()).trim());
      }

      const before = page.__pt05Before.quotaTexts.join('|');
      const after = afterQuotaTexts.join('|');
      expect(after).not.toBe(before);
    });

    await test.step('3. 点击挂载 Entity 列排序并验证顺序变化', async () => {
      const rows = new PageTableComponent(page).dataRows();
      const entityHeader = page.locator('.show-iView-Table th').filter({ hasText: '挂载' }).first();
      await entityHeader.click();
      await page.waitForTimeout(500);

      const afterEntityTexts = [];
      const rowCount = await rows.count();
      for (let i = 0; i < Math.min(rowCount, 3); i++) {
        afterEntityTexts.push((await rows.nth(i).locator('td').nth(7).innerText()).trim());
      }

      const uniqueEntities = [...new Set(page.__pt05Before.entityTexts.filter(Boolean))];
      test.skip(uniqueEntities.length < 2, '至少需要 2 个不同 Entity 名称才能验证排序');

      const before = page.__pt05Before.entityTexts.join('|');
      const after = afterEntityTexts.join('|');
      expect(after).not.toBe(before);
    });
  });
});
