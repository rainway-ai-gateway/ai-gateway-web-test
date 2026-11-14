/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const layout = require('../../utils/layout');

const LAYOUT_DOC =
  'docs/entity-management/02-功能测试用例/14-布局与最大长度.md';
// Entity 名称上限 64（DOC_ENTITY_ORG.nameLengthErrorMsg 口径：名称长度不能超过64字符）
const NAME_MAX = 64;
const DESC_MAX = 255;

/**
 * Entity 组织管理 - 布局与最大长度（EM-LAY-01~03）
 *
 * 背景（docs/覆盖缺口清单.md §27）：项目无视觉回归测试，「输入到最大长度后样式混乱
 * 或不可见」无覆盖。本文件用 DOM 指标断言（utils/layout.js）覆盖：
 * - EM-LAY-01 创建抽屉满载（名称 64 + 描述 255）：无横向溢出、提示行不遮挡、
 *   底部按钮区在视口内（P1）
 * - EM-LAY-02 列表行满载（描述 255）：表格不横向溢出、描述单元格行数封顶（P1；
 *   2026-11-02 修复：描述列 render span .cell-ellipsis + title 裁剪，行高回落单行，
 *   见 LAYOUT_DOC「修复记录」）
 * - EM-LAY-03 多视口（1280×720 / 1440×900）创建抽屉无横向溢出（P2）
 *
 * 造数：类型经 UI（避免下拉同步延迟），Entity 经 API。afterEach 清理。
 */
function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

async function prepareTypeAndCreateDrawer(page, cleanup) {
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, 'EMLAY type', 1);
  await page.waitForTimeout(1000);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 1000);
  await utils.openCreateEntityDrawer(page);
  return { typeName };
}

entityOrgDescribe('Entity组织管理 - EM-LAY-01 创建抽屉满载布局', (cleanup) => {
  test('名称 64 + 描述 255：无横向溢出、提示行不遮挡、底部按钮在视口内', async ({
    page,
  }) => {
    const { typeName } = await prepareTypeAndCreateDrawer(page, cleanup);
    const drawer = utils.drawerScope(page, utils.DRAWER_TITLE.createEntity);

    await test.step('1. 填满最大长度：名称 64、描述 255', async () => {
      await utils.fillEntityFormBasic(page, {
        name: 'n'.repeat(NAME_MAX),
        typeName,
      });
      await utils.fillEntityDescription(page, 'd'.repeat(DESC_MAX));
    });

    await test.step('2. 抽屉内容区无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        drawer.locator('.ivu-drawer-body').first(),
        'Entity 创建抽屉内容区',
      );
    });

    await test.step('3. 名称提示行与描述输入框不重叠', async () => {
      const nameTip = drawer.locator('.form-tip').first();
      await expect(nameTip).toBeVisible();
      await layout.expectNoRectOverlap(
        nameTip,
        utils.entityDescriptionInput(page),
        '名称提示行 / 描述输入框',
      );
    });

    await test.step('4. 底部按钮区在视口内', async () => {
      await layout.expectFooterVisibleInViewport(
        drawer.locator('.drawer-footer').first(),
        'Entity 创建抽屉底部按钮区',
      );
    });

    await test.step('清理：取消抽屉', async () => {
      await utils.cancelEntityForm(page);
      await utils.expectCreateEntityDrawerHidden(page);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-LAY-02 列表行满载布局', (cleanup) => {
  test('描述 255 字符：表格不横向溢出且描述单元格行数封顶', async ({
    page,
  }) => {
    const entityName = await utils.generateTestEntityName();
    const typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);
    const desc = 'd'.repeat(DESC_MAX);

    await utils.gotoEntityOrgManagementPage(page);
    await utils.createEntityTypeViaApi(page, typeName, 'EMLAY type', 1);
    await page.waitForTimeout(1500);
    await utils.createEntityWithTypeViaApi(page, {
      name: entityName,
      type: typeName,
      description: desc,
    });
    await page.waitForTimeout(1500);
    await page.reload();
    await utils.waitForEntityManagementShell(page);
    await page.waitForTimeout(1500);
    await utils.searchEntityByName(page, entityName);
    await utils.expectEntityVisible(page, entityName);

    await test.step('1. 表格容器无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        utils.entityOrgTable(page).rootLocator(),
        'Entity 组织列表表格',
      );
    });

    await test.step('2. 描述单元格行数 ≤3 行（或 ellipsis 截断）', async () => {
      const descCell = await utils.entityRowCellByColumn(
        page,
        entityName,
        '描述',
      );
      await layout.expectCellLineCap(
        descCell,
        3,
        `Entity「${entityName}」描述单元格`,
      );
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-LAY-03 多视口抽屉布局', (cleanup) => {
  for (const vp of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    test(`视口 ${vp.width}×${vp.height}：描述 255 字符时抽屉无横向溢出、按钮在视口内`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      const { typeName } = await prepareTypeAndCreateDrawer(page, cleanup);
      const drawer = utils.drawerScope(page, utils.DRAWER_TITLE.createEntity);

      await test.step('1. 填满名称 64 与描述 255', async () => {
        await utils.fillEntityFormBasic(page, {
          name: 'n'.repeat(NAME_MAX),
          typeName,
        });
        await utils.fillEntityDescription(page, 'd'.repeat(DESC_MAX));
      });

      await test.step('2. 无横向溢出', async () => {
        await layout.expectNoHorizontalOverflow(
          drawer.locator('.ivu-drawer-body').first(),
          `Entity 创建抽屉内容区（${vp.width}px）`,
        );
      });

      await test.step('3. 底部按钮区在视口内', async () => {
        await layout.expectFooterVisibleInViewport(
          drawer.locator('.drawer-footer').first(),
          `Entity 创建抽屉底部按钮区（${vp.width}px）`,
        );
      });

      await utils.cancelEntityForm(page);
      await utils.expectCreateEntityDrawerHidden(page);
    });
  }
});
