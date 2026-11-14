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

const DOC = utils.DOC_ENTITY_TYPE;

/**
 * Entity 类型管理 - 布局与最大长度（EM-TL-01 / EM-TL-02）
 *
 * 背景（docs/覆盖缺口清单.md §27）：项目无视觉回归测试。本文件用 DOM 指标断言
 * （utils/layout.js）覆盖类型创建抽屉满载（描述 255 + 类型名 32）场景：
 * - EM-TL-01 描述字数计数器渲染为 255/255 且与输入框同一行（P1）
 * - EM-TL-02 抽屉布局健康：无横向溢出、提示行不遮挡「级别」字段、底部按钮在视口内，
 *   1280×720 / 1440×900 两视口（P1）
 *
 * 修复记录（2026-11-02）：本项目 iView 3.5.4 的 Input 组件源码无
 * `showWordLimit`/`ivu-input-word-count`（dist 全文检索 0 命中），原
 * `EntityTypeUpsert.vue` 与 `EntityUpsert.vue` 的 `show-word-limit` 为无效属性。
 * 已自实现计数器（`.word-limit-field` 包裹 Input + 绝对定位
 * `.ivu-input-word-count` 显示 `n/上限`：类型名 n/32、描述 n/255、Entity 名称 n/64），
 * 移除无效属性；EM-TL-01 断言「255/255 且与输入框同一行」为真实通过。
 *
 * 验收依据：docs/entity-type/02-功能测试用例/03-布局与最大长度.md
 */
async function openFilledCreateDrawer(page, vp) {
  await page.setViewportSize(vp);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.openCreateEntityTypeDrawer(page);
  await utils.fillEntityTypeForm(page, {
    typeName: 't'.repeat(DOC.nameMaxLength),
    description: 'd'.repeat(255),
  });
  return utils.drawerScope(page, utils.DRAWER_TITLE.createType);
}

test.describe('Entity类型管理 - EM-TL-01 描述字数计数器', () => {
  test('描述 255 字符时计数器渲染为 255/255 且与输入框同一行', async ({
    page,
  }) => {
    await openFilledCreateDrawer(page, { width: 1280, height: 720 });

    const descWrapper = utils
      .entityTypeForm(page)
      .item('描述')
      .locator('.word-limit-field')
      .first();
    await layout.expectWordLimitInline(descWrapper, '类型描述输入框');
    await expect(descWrapper.locator('.ivu-input-word-count')).toHaveText(
      '255/255',
    );

    await utils.cancelEntityTypeForm(page);
    await utils.expectCreateEntityTypeDrawerHidden(page);
  });
});

test.describe('Entity类型管理 - EM-TL-02 创建抽屉布局健康', () => {
  for (const vp of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    test(`视口 ${vp.width}×${vp.height}：类型名 32 + 描述 255，无横向溢出、提示不遮挡、按钮可见`, async ({
      page,
    }) => {
      const drawer = await openFilledCreateDrawer(page, vp);

      await test.step('1. 抽屉内容区无横向溢出', async () => {
        await layout.expectNoHorizontalOverflow(
          drawer.locator('.ivu-drawer-body').first(),
          `类型创建抽屉内容区（${vp.width}px）`,
        );
      });

      await test.step('2. 描述提示行与「级别」字段不重叠', async () => {
        const descTip = drawer
          .locator('.form-tip')
          .filter({ hasText: '255字节' })
          .first();
        await expect(descTip).toBeVisible();
        await layout.expectNoRectOverlap(
          descTip,
          utils.entityTypeForm(page).item('级别').first(),
          '描述提示行 / 级别字段',
        );
      });

      await test.step('3. 底部按钮区在视口内', async () => {
        await layout.expectFooterVisibleInViewport(
          drawer.locator('.drawer-footer').first(),
          `类型创建抽屉底部按钮区（${vp.width}px）`,
        );
      });

      await utils.cancelEntityTypeForm(page);
      await utils.expectCreateEntityTypeDrawerHidden(page);
    });
  }
});
