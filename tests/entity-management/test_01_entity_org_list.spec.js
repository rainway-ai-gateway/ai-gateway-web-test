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

const DOC = utils.DOC_ENTITY_ORG;

// 前置在 Entity 类型管理页面通过 UI 创建类型，再切换至 Entity 组织管理 Tab。
// 已知产品缺陷：UI 创建成功后 GET /entity-types 列表可能不立即返回新数据，影响组织管理页类型下拉。

test.describe('Entity组织管理 - EM-E-01 Entity组织列表展示', () => {
  test('验证Entity组织列表页面正确渲染', async ({ page }) => {
    await test.step('进入Entity组织管理页面', async () => {
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('验证页面布局', async () => {
      await utils.expectEntityOrgPageLayout(page);
      // 验证 ID 列存在（th 内除 ID 外还含排序图标，不能用 ^ID$ 精确匹配）
      await expect(
        page.locator('th').filter({ hasText: /^ID/ }).first(),
      ).toBeVisible();
      // 验证操作列有"管理路由规则"按钮（用数据行选择器，排除 searchTable 搜索行）
      const firstRow = utils.entityOrgTable(page).dataRows().first();
      await expect(
        firstRow.getByRole('button', { name: '管理路由规则' }),
      ).toBeVisible();
    });
  });
});

test.describe('Entity组织管理 - EM-E-01b Entity组织列表数据与接口一致性', () => {
  const entityName = 'test-org-api-chk';
  const typeName = 'test-dep-api-chk';

  test('验证Entity组织列表展示数据与接口返回一致', async ({ page }) => {
    await test.step('前置：清理可能残留的数据', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.deleteEntityByNameViaApi(page, entityName);
      await utils.deleteEntityTypeViaApi(page, typeName);
    });

    await test.step('1. 通过接口创建Entity（有限配额+启用限流）', async () => {
      await utils.createEntityTypeViaApi(
        page,
        typeName,
        'API一致性验证类型',
        1,
      );
      // 等待类型创建生效，避免后端数据同步延迟
      await page.waitForTimeout(2000);
      await utils.createEntityWithTypeViaApi(page, {
        name: entityName,
        type: typeName,
        quotaPlan: { unlimited: false, quota: 100000, unit: 'total_token' },
        rateLimitPolicy: {
          enabled: true,
          rules: {
            rpm: [
              { name: 'rpm_rule_1', model: '*', count: 100, window_minutes: 1 },
            ],
          },
        },
      });
    });

    await test.step('2. 刷新页面使列表加载新数据', async () => {
      await utils.reloadEntityOrgManagementPage(page);
      await utils.expectEntityOrgTableVisible(page);
    });

    await test.step('3. 通过接口获取Entity详情', async () => {
      const apiData = await utils.findEntityByNameViaApi(page, entityName);
      expect(apiData).not.toBeNull();
      expect(apiData.name).toBe(entityName);
      expect(apiData.type).toBe(typeName);
      expect(apiData.quota_plan.unlimited).toBe(false);
      expect(apiData.rate_limit_policy.enabled).toBe(true);
    });

    await test.step('4. 验证列表行数据与接口返回一致（名称、类型、限流状态）', async () => {
      const apiData = await utils.findEntityByNameViaApi(page, entityName);
      await utils.expectEntityRowMatchesApi(page, entityName, apiData);
    });

    await test.step('清理测试数据', async () => {
      await utils.deleteEntityViaApi(page, entityName);
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('Entity 管理 - EM-E-10b 按 ID 搜索 Entity', () => {
  test('EM-E-10b 按 ID 搜索 Entity', async ({ page }) => {
    // TODO: 前置需要已创建的 Entity
    // 在 ID 搜索框输入 Entity ID
    // 验证列表过滤
  });
});

test.describe('Entity 管理 - EM-E-16b 管理路由规则按钮跳转', () => {
  test('EM-E-16b 管理路由规则按钮跳转', async ({ page }) => {
    // TODO: 前置需要已创建的 Entity
    // 点击"管理路由规则"按钮
    // 验证跳转到路由规则页面
    // 验证 URL 包含 type='entity' 和 owner=Entity ID
  });
});
