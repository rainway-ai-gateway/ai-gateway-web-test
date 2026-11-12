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
 * Entity 类型 - 描述字节口径 / 级别筛选（EM-T-16 / EM-T-17）
 *
 * 审计背景（2026-11-01，entity-type 深度审计）：
 * - 2026-10-22 变更把「类型描述」上限从 1024 字符收口为 **255 UTF-8 字节**并加控制字符校验，
 *   索引声明由 EM-T-02 / EM-T-10 覆盖，但实测两条用例只填正常文本，**没有任何字节/控制字符断言**。
 * - 列表「级别」列是 `searchType: 'select'`（1~5），全模块无筛选用例（同 entity 主模块 EM-E-67）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const {
  fetchEntityTypeByNameViaApi,
  deleteEntityTypeViaApi,
} = require('../../api/entity-api-utils');

const DRAWER_TITLE = utils.DRAWER_TITLE;
const MSG_LENGTH = '类型描述不能超过255字节（按 UTF-8 字节计）';
const MSG_CONTROL = '类型描述不能包含控制字符';

test.describe('Entity类型管理 - EM-T-16 类型描述字节与控制字符', () => {
  test.afterEach(async ({ page }) => {
    await utils.cancelEntityTypeForm(page).catch(() => {});
  });

  test('255 字节通过；86 汉字（258 字节）与控制字符被拦截', async ({ page }) => {
    const typeName = await utils.generateTestEntityTypeName();
    await utils.gotoEntityTypeManagementPage(page);
    await utils.openCreateEntityTypeDrawer(page);

    await test.step('前置：填写类型名与级别', async () => {
      await utils.fillEntityTypeForm(page, { typeName, level: 1 });
    });

    await test.step('86 个汉字 = 258 字节：拦截并提示字节上限', async () => {
      await utils.fillEntityTypeForm(page, { description: '汉'.repeat(86) });
      await utils.expectEntityTypeFormFieldError(page, '描述', MSG_LENGTH);
    });

    await test.step('含控制字符：拦截并提示', async () => {
      await utils.fillEntityTypeForm(page, { description: 'desc\u0001value' });
      await utils.expectEntityTypeFormFieldError(page, '描述', MSG_CONTROL);
    });

    await test.step('255 个 ASCII 字符（255 字节）：校验通过且可提交', async () => {
      await utils.fillEntityTypeForm(page, { description: 'a'.repeat(255) });
      await utils.expectEntityTypeFormFieldValid(page, '描述');
      await utils.submitEntityTypeForm(page, DRAWER_TITLE.createType);
      await utils.expectCreateEntityTypeDrawerHidden(page);
      const apiData = await fetchEntityTypeByNameViaApi(page, typeName);
      expect(apiData, '接口应能查到新建类型').toBeTruthy();
      expect(apiData.description.length, '接口描述应为 255 字符').toBe(255);
    });

    await test.step('清理', async () => {
      await deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity类型管理 - EM-T-17 列表按级别筛选', () => {
  const typeNames = [];
  test.afterEach(async ({ page }) => {
    for (const name of typeNames.reverse()) {
      await deleteEntityTypeViaApi(page, name).catch(() => {});
    }
    typeNames.length = 0;
  });

  test('级别 1 / 2 筛选互斥，清除后恢复全部', async ({ page }) => {
    await utils.gotoEntityTypeManagementPage(page);
    const level1 = await utils.generateTestEntityTypeName();
    const level2 = await utils.generateTestEntityTypeName();
    typeNames.push(level1, level2);

    await test.step('前置：造级别 1 与级别 2 两个类型', async () => {
      await utils.createEntityTypeViaApi(page, level1, 'level1 type', 1);
      await utils.createEntityTypeViaApi(page, level2, 'level2 type', 2);
      await page.waitForTimeout(2000);
      // 接口造数后必须重新加载页面，否则列表还是旧数据（无 level 2 行）
      await utils.reloadEntityTypeManagementPage(page);
      await utils.waitForPageSettled(page, 1500);
    });

    await test.step('筛选级别 1：级别 2 的类型被过滤', async () => {
      await utils.filterEntityTypeByLevel(page, '1');
      await utils.searchEntityType(page, level1);
      await utils.expectEntityTypeVisible(page, level1);
      await utils.searchEntityType(page, level2);
      await utils.expectEntityTypeNotVisible(page, level2);
    });

    await test.step('筛选级别 2：级别 1 的类型被过滤', async () => {
      await utils.filterEntityTypeByLevel(page, '2');
      await utils.searchEntityType(page, level2);
      await utils.expectEntityTypeVisible(page, level2);
      await utils.searchEntityType(page, level1);
      await utils.expectEntityTypeNotVisible(page, level1);
    });

    await test.step('清除级别筛选：两者均可见', async () => {
      await utils.filterEntityTypeByLevel(page, '全部');
      await utils.searchEntityType(page, level1);
      await utils.expectEntityTypeVisible(page, level1);
      await utils.searchEntityType(page, level2);
      await utils.expectEntityTypeVisible(page, level2);
    });
  });
});
