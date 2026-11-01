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
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const {
  createEntityTypeViaApi,
  findEntityByNameViaApi,
} = require('../../api/entity-api-utils');

const DRAWER_TITLE = utils.DRAWER_TITLE;

/**
 * 配额重置周期 / 配额不足放行 / 列表级别筛选（EM-E-66~67）
 *
 * 验收依据：docs/entity-management/02-功能测试用例/12-配额周期与级别筛选.md
 * - EM-E-66 创建 Entity 配置重置周期与「配额不足时放行」（P1）
 * - EM-E-67 列表按级（level）筛选（P2）
 *
 * 背景：重置周期（never/weekly/monthly）与「配额不足时放行」此前仅有详情只读一致性
 * （EOD-01）读取，没有任何用例验证“设置后能否落库、能否回显”，属设置路径空白。
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

async function createTypeAndReturnToOrg(page, cleanup, { level = 1, desc } = {}) {
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, desc || 'EM quota/level type', level);
  await page.waitForTimeout(1000);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 800);
  return typeName;
}

entityOrgDescribe('Entity组织管理 - EM-E-66 重置周期与配额不足放行', (cleanup) => {
  test('创建时选择「每周」重置与「配额不足时放行=是」，接口与详情一致', async ({
    page,
  }) => {
    await utils.gotoEntityOrgManagementPage(page);
    const typeName = await createTypeAndReturnToOrg(page, cleanup);

    const entityName = await utils.generateTestEntityName();
    cleanup.trackEntityName(entityName);

    await utils.openCreateEntityDrawer(page);
    await test.step('1. 填写名称/类型并配置有限配额', async () => {
      await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      await utils.fillEntityQuotaForm(page, {
        unlimited: false,
        total: 1000,
        unit: 'total_token',
        resetCycle: '每周',
        passWhenNoQuota: true,
      });
      await utils.expectEntityFormSelectValue(page, '重置周期', '每周');
      await utils.expectEntityFormSelectValue(page, '配额不足时放行', '是');
    });

    await test.step('2. 提交成功', async () => {
      await utils.submitEntityFormAndWaitForSuccess(page, DRAWER_TITLE.createEntity);
      await utils.expectCreateEntityDrawerHidden(page);
    });

    await test.step('3. 接口回读：reset_period=weekly、pass_when_no_enough_quota=true', async () => {
      const apiData = await findEntityByNameViaApi(page, entityName);
      expect(apiData, '接口应能查到新建 Entity').toBeTruthy();
      expect(apiData.quota_plan).toBeTruthy();
      expect(apiData.quota_plan.quota).toBe(1000);
      expect(apiData.quota_plan.unit).toBe('total_token');
      expect(apiData.quota_plan.reset_period).toBe('weekly');
      expect(apiData.quota_plan.pass_when_no_enough_quota).toBe(true);
    });

    await test.step('4. 详情抽屉展示「每周」与「是」', async () => {
      await utils.searchEntityByName(page, entityName);
      await utils.openEntityDetail(page, entityName);
      await utils.expectEntityDetailInfoRow(page, '重置周期', '每周');
      await utils.expectEntityDetailInfoRow(page, '配额不足时放行', '是');
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-67 列表按级别筛选', (cleanup) => {
  test('级别下拉（1~5）只保留对应级别的 Entity', async ({ page }) => {
    await utils.gotoEntityOrgManagementPage(page);

    const typeLevel1 = await utils.generateTestEntityTypeName();
    const typeLevel2 = await utils.generateTestEntityTypeName();
    cleanup.trackTypeName(typeLevel1);
    cleanup.trackTypeName(typeLevel2);
    await createEntityTypeViaApi(page, typeLevel1, 'EM level1 type', 1);
    await createEntityTypeViaApi(page, typeLevel2, 'EM level2 type', 2);
    await page.waitForTimeout(1500);

    const entityLevel1 = await utils.generateTestEntityName();
    const entityLevel2 = await utils.generateTestEntityName();
    cleanup.trackEntityName(entityLevel1);
    cleanup.trackEntityName(entityLevel2);
    const created1 = await utils.createEntityWithTypeViaApi(page, {
      name: entityLevel1,
      type: typeLevel1,
      quotaPlan: { unlimited: true, unit: 'total_token' },
    });
    const created2 = await utils.createEntityWithTypeViaApi(page, {
      name: entityLevel2,
      type: typeLevel2,
      quotaPlan: { unlimited: true, unit: 'total_token' },
    });
    cleanup.trackEntityId(created1.id);
    cleanup.trackEntityId(created2.id);

    await utils.reloadEntityOrgManagementPage(page);
    await utils.waitForPageSettled(page, 1000);

    await test.step('1. 级别列展示与类型级别一致（1 / 2）', async () => {
      await utils.searchEntityByName(page, entityLevel1);
      await utils.expectEntityRowContainsType(page, entityLevel1, typeLevel1);
      const levelCell = await utils.entityRowCellByColumn(page, entityLevel1, '级别');
      const levelText = (await levelCell.innerText()).trim();
      expect(levelText, '级别 1 类型的 Entity 级别列应为 1').toBe('1');

      await utils.searchEntityByName(page, entityLevel2);
      const levelCell2 = await utils.entityRowCellByColumn(page, entityLevel2, '级别');
      const levelText2 = (await levelCell2.innerText()).trim();
      expect(levelText2, '级别 2 类型的 Entity 级别列应为 2').toBe('2');
    });

    await test.step('2. 级别筛选 1：级别 2 的实体被过滤掉', async () => {
      await utils.filterEntityByLevel(page, '1');
      await utils.searchEntityByName(page, entityLevel1);
      await utils.expectEntityVisible(page, entityLevel1);
      await utils.searchEntityByName(page, entityLevel2);
      await utils.expectEntityNotVisible(page, entityLevel2);
    });

    await test.step('3. 级别筛选 2：级别 2 的实体保留、级别 1 被过滤', async () => {
      await utils.filterEntityByLevel(page, '2');
      await utils.searchEntityByName(page, entityLevel2);
      await utils.expectEntityVisible(page, entityLevel2);
      await utils.searchEntityByName(page, entityLevel1);
      await utils.expectEntityNotVisible(page, entityLevel1);
    });

    await test.step('4. 清除级别筛选后两条均可见', async () => {
      await utils.filterEntityByLevel(page, '全部');
      await utils.searchEntityByName(page, entityLevel1);
      await utils.expectEntityVisible(page, entityLevel1);
      await utils.searchEntityByName(page, entityLevel2);
      await utils.expectEntityVisible(page, entityLevel2);
    });
  });
});
