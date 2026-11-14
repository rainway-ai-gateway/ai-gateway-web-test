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
const utils = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');
const layout = require('../../utils/layout');

const LAYOUT_DOC = 'docs/providers/02-功能测试用例/09-布局与最大长度.md';
// 服务商名称上限 64、描述上限 256（pages/providers/ProviderPage.js DOC 口径）
const NAME_MAX = 64;
const DESC_MAX = 256;
const MODEL = 'qa-layout-base';

/**
 * 服务商管理 - 布局与最大长度（PR-LAY-01 / PR-LAY-02）
 *
 * 背景（docs/覆盖缺口清单.md §27）：项目无视觉回归测试。本文件用 DOM 指标断言
 * （utils/layout.js）覆盖服务商满载（名称 64 + 描述 256）场景：
 * - PR-LAY-01 列表行满载：表格不横向溢出、名称/描述单元格行数封顶（P1；
 *   2026-11-02 修复：名称/描述列 `ellipsis: true, tooltip: true`，行高回落单行，
 *   见 LAYOUT_DOC「修复记录」）
 * - PR-LAY-02 编辑抽屉满载布局健康：内容区无横向溢出、底部按钮区在视口内（P1，
 *   真实通过）
 *
 * 造数：API 创建服务商（命名前缀 provider_，afterEach 清理）。
 */
function providerDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = api.createProviderTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

async function createMaxProvider({ page, cleanup }) {
  const name =
    'p'.repeat(NAME_MAX - 7) + '_' + Date.now().toString(36).slice(-6);
  const description = 'd'.repeat(DESC_MAX);
  const data = await api.createProviderViaApi(page, {
    name,
    description,
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [MODEL],
    keys: [{ name: 'key-layout', key: 'sk-layout' }],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  return { name, description };
}

providerDescribe('服务商管理 - PR-LAY-01 列表行满载布局', (cleanup) => {
  test('名称 64 + 描述 256：表格不横向溢出且名称/描述单元格行数封顶', async ({
    page,
  }) => {
    const { name } = await createMaxProvider({ page, cleanup });

    await utils.gotoProvidersPage(page);
    await utils.expectProvidersPageReady(page);
    await utils.expectProviderRowVisibleByName(page, name);

    await test.step('1. 表格容器无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        utils.providerTable(page).rootLocator(),
        '服务商列表表格',
      );
    });

    await test.step('2. 名称单元格行数 ≤3 行（或 ellipsis 截断）', async () => {
      await layout.expectCellLineCap(
        utils.providerRow(page, name).locator('td').nth(0).locator('.ivu-table-cell'),
        3,
        `服务商「${name}」名称单元格`,
      );
    });

    await test.step('3. 描述单元格行数 ≤3 行（或 ellipsis 截断）', async () => {
      await layout.expectCellLineCap(
        utils.providerRow(page, name).locator('td').nth(1).locator('.ivu-table-cell'),
        3,
        `服务商「${name}」描述单元格`,
      );
    });
  });
});

providerDescribe('服务商管理 - PR-LAY-02 编辑抽屉满载布局', (cleanup) => {
  test('名称 64 + 描述 256：抽屉无横向溢出、底部按钮区在视口内', async ({
    page,
  }) => {
    const { name, description } = await createMaxProvider({ page, cleanup });

    await utils.gotoProvidersPage(page);
    await utils.expectProvidersPageReady(page);
    await utils.expectProviderRowVisibleByName(page, name);

    await test.step('1. 打开编辑抽屉，名称/描述回显满载值', async () => {
      await utils.openEditDrawer(page, name);
      const scope = utils.upsertScope(page);
      const nameValue = await utils.getInputByLabelValue(
        page,
        scope,
        utils.LABEL.name,
      );
      const descValue = await utils.getInputByLabelValue(
        page,
        scope,
        utils.LABEL.description,
      );
      expect(nameValue).toBe(name);
      expect(descValue).toBe(description);
    });

    await test.step('2. 抽屉内容区无横向溢出', async () => {
      await layout.expectNoHorizontalOverflow(
        page.locator('.ivu-drawer:visible .ivu-drawer-body').last(),
        '服务商编辑抽屉内容区',
      );
    });

    await test.step('3. 底部按钮区在视口内', async () => {
      await layout.expectFooterVisibleInViewport(
        utils.upsertScope(page).locator('.drawer-footer').first(),
        '服务商编辑抽屉底部按钮区',
      );
    });

    await test.step('清理：关闭抽屉', async () => {
      // ProviderUpsert 底部只有「提交」，无取消按钮；经抽屉 X 关闭（未做修改，无拦截）
      await page
        .locator('.ivu-drawer:visible')
        .last()
        .locator('.ivu-drawer-close')
        .click();
    });
  });
});
