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
const DRAWER_TITLE = utils.DRAWER_TITLE;

/**
 * Entity 描述（EM-DESC-01~05）
 *
 * 验收依据：docs/entity-management/02-功能测试用例/09-描述字段.md
 * - EM-DESC-01 列表描述列展示与搜索（P0）
 * - EM-DESC-02 创建描述非必填（P0）
 * - EM-DESC-03 创建描述长度与字符校验（P1）
 * - EM-DESC-04 编辑描述回显与清空语义（P0）
 * - EM-DESC-05 详情页描述字段展示（P1）
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

/**
 * 前置：在 Entity 类型管理页通过 UI 创建类型，再回到组织管理页打开创建 Entity 抽屉
 * （创建流程需要在表单内选择类型，UI 造数可避免类型下拉数据同步延迟）
 */
async function prepareTypeAndCreateDrawer(page, cleanup) {
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, 'EMDESC type', 1);
  await page.waitForTimeout(1000);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 1000);
  await utils.openCreateEntityDrawer(page);
  return { typeName };
}

/**
 * 前置：接口创建类型与 Entity
 * descriptions 的 key 为返回结果别名，value 为描述（'' 表示描述留空）
 */
async function prepareEntitiesViaApi(page, cleanup, descriptions) {
  await utils.gotoEntityOrgManagementPage(page);
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackTypeName(typeName);
  await utils.createEntityTypeViaApi(page, typeName, 'EMDESC type', 1);
  // 等待类型创建生效，避免后端数据同步延迟
  await page.waitForTimeout(2000);

  const names = {};
  for (const [key, description] of Object.entries(descriptions)) {
    const name = await utils.generateTestEntityName();
    cleanup.trackEntityName(name);
    await utils.createEntityWithTypeViaApi(page, {
      name,
      type: typeName,
      description,
    });
    names[key] = name;
  }

  await utils.reloadEntityOrgManagementPage(page);
  await utils.expectEntityOrgTableVisible(page);
  return { typeName, ...names };
}

entityOrgDescribe(
  'Entity组织管理 - EM-DESC-01 Entity列表描述列展示与搜索',
  (cleanup) => {
    test('验证描述列顺序、空值展示、描述搜索与排序', async ({ page }) => {
      const { withDesc, emptyDesc, sortA, sortB } =
        await prepareEntitiesViaApi(page, cleanup, {
          withDesc: DOC.descriptionSample,
          emptyDesc: '',
          sortA: 'EMDESC-A',
          sortB: 'EMDESC-B',
        });

      await test.step('1. 列表列顺序含「描述」列且位于名称与类型之间', async () => {
        await utils.expectEntityOrgPageLayout(page);
        await utils.expectEntityDescriptionColumnOrder(page);
      });

      await test.step('2. 「描述」列搜索框 placeholder 为「请输入描述查询」', async () => {
        await expect(
          utils.entityOrgTable(page).searchInput('请输入描述查询'),
        ).toBeVisible();
      });

      await test.step('3. 有描述行展示原文，描述为空的行展示 -', async () => {
        await utils.ensureEntityRowVisible(page, withDesc);
        await utils.expectEntityRowContainsDescription(
          page,
          withDesc,
          DOC.descriptionSample,
        );
        await utils.ensureEntityRowVisible(page, emptyDesc);
        await utils.expectEntityRowContainsDescription(page, emptyDesc, '-');
      });

      await test.step('4. 按描述模糊搜索仅保留命中行', async () => {
        // 清空步骤 3 按名称定位行时残留的名称过滤，确保仅有描述条件生效
        await utils.searchEntityByName(page, '');
        await utils.searchEntityByDescription(page, 'EMDESC');
        await utils.expectEntityVisible(page, sortA);
        await utils.expectEntityVisible(page, sortB);
        await utils.expectEntityNotVisible(page, withDesc);
      });

      await test.step('5. 点击「描述」列表头排序，顺序按描述重排', async () => {
        const before = await utils.readEntityDescriptionColumnTexts(page);

        // iView 排序循环 normal → asc → desc：首次点击升序，再次点击降序
        const asc = await utils.sortEntityByDescriptionColumn(page);
        const desc = await utils.sortEntityByDescriptionColumn(page);

        // 排序只改变顺序，不增删行
        expect(asc.length).toBe(before.length);
        expect([...asc].sort()).toEqual([...before].sort());
        expect(desc.length).toBe(before.length);
        expect([...desc].sort()).toEqual([...before].sort());

        // 与组件排序同源的比较器（String.prototype.localeCompare）校验单调性
        const isMonotonic = (texts, direction) =>
          texts.every((text, index) => {
            if (index === 0) {
              return true;
            }
            const cmp = texts[index - 1].localeCompare(text);
            return direction === 'asc' ? cmp <= 0 : cmp >= 0;
          });
        expect(isMonotonic(asc, 'asc')).toBe(true);
        expect(isMonotonic(desc, 'desc')).toBe(true);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-DESC-02 创建Entity描述非必填',
  (cleanup) => {
    test('验证描述无必填星号与提示小字，留空与填写均可提交', async ({
      page,
    }) => {
      const { typeName } = await prepareTypeAndCreateDrawer(page, cleanup);

      await test.step('1. 「描述」无必填星号、无提示小字，placeholder 不含「选填」', async () => {
        await utils.expectEntityDescriptionFieldNoStarNoTip(page);
        await utils.expectEntityDescriptionPlaceholder(page);
      });

      await test.step('2. 描述留空可提交成功，列表描述列展示 -', async () => {
        const emptyDescName = await utils.generateTestEntityName();
        cleanup.trackEntityName(emptyDescName);
        await utils.fillEntityFormBasic(page, {
          name: emptyDescName,
          typeName,
        });
        await utils.submitEntityFormAndWaitForSuccess(page);
        await utils.ensureEntityRowVisible(page, emptyDescName);
        await utils.expectEntityRowContainsDescription(
          page,
          emptyDescName,
          '-',
        );
      });

      await test.step('3. 填写描述提交成功，列表描述列展示原文', async () => {
        const withDescName = await utils.generateTestEntityName();
        cleanup.trackEntityName(withDescName);
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityFormBasic(page, {
          name: withDescName,
          typeName,
        });
        await utils.fillEntityDescription(page, DOC.descriptionSample);
        await utils.submitEntityFormAndWaitForSuccess(page);
        await utils.ensureEntityRowVisible(page, withDescName);
        await utils.expectEntityRowContainsDescription(
          page,
          withDescName,
          DOC.descriptionSample,
        );
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-DESC-03 创建Entity描述长度与字符校验',
  (cleanup) => {
    test('验证 255 字符边界、超出截断、控制字符拦截与留空通过', async ({
      page,
    }) => {
      const { typeName } = await prepareTypeAndCreateDrawer(page, cleanup);
      const maxLengthText = utils.makeStringOfLength(DOC.descriptionMaxLength);

      await test.step('1. 描述输入框 maxlength=255', async () => {
        await expect(utils.entityDescriptionInput(page)).toHaveAttribute(
          'maxlength',
          String(DOC.descriptionMaxLength),
        );
      });

      await test.step('2. 超出 255 字符被截断，无法录入第 256 个字符', async () => {
        const input = utils.entityDescriptionInput(page);
        await input.click();
        await input.pressSequentially(
          utils.makeStringOfLength(DOC.descriptionMaxLength + 1),
        );
        await expect(input).toHaveValue(maxLengthText);
        await input.fill('');
      });

      await test.step('3. 含控制字符被校验拦截并提示', async () => {
        await utils.fillEntityDescription(page, 'desc\u0001value');
        await utils.expectEntityDescriptionControlCharsError(page);
        await utils.fillEntityDescription(page, '');
      });

      await test.step('4. 255 字符通过校验并可提交成功', async () => {
        const entityName = await utils.generateTestEntityName();
        cleanup.trackEntityName(entityName);
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityDescription(page, maxLengthText);
        // 校验规则 trigger 为 blur，失焦后确认错误提示已被清除
        await utils.entityDescriptionInput(page).blur();
        await utils.expectEntityDescriptionFieldValid(page);
        await utils.submitEntityFormAndWaitForSuccess(page);
        await utils.ensureEntityRowVisible(page, entityName);
        await utils.expectEntityRowContainsDescription(
          page,
          entityName,
          maxLengthText,
        );
      });

      await test.step('5. 描述留空通过校验（非必填）', async () => {
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityDescription(page, '');
        await utils.expectEntityDescriptionFieldValid(page);
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-DESC-04 编辑Entity描述回显与清空语义',
  (cleanup) => {
    test('验证编辑回显、PATCH 携带原值与清空传空字符串', async ({ page }) => {
      const { withDesc } = await prepareEntitiesViaApi(page, cleanup, {
        withDesc: DOC.descriptionSample,
      });

      await test.step('1. 编辑抽屉回显接口返回的描述原文', async () => {
        await utils.ensureEntityRowVisible(page, withDesc);
        await utils.openEditEntityDrawer(page, withDesc);
        await utils.expectEntityEditDescriptionValue(
          page,
          DOC.descriptionSample,
        );
      });

      await test.step('2. 不修改描述提交：PATCH 请求体携带原值，描述保持不变', async () => {
        const body = await utils.submitEntityEditAndCapturePatchBody(page);
        expect(body.description).toBe(DOC.descriptionSample);
        await utils.reloadEntityOrgManagementPage(page);
        await utils.ensureEntityRowVisible(page, withDesc);
        await utils.expectEntityRowContainsDescription(
          page,
          withDesc,
          DOC.descriptionSample,
        );
      });

      await test.step('3. 清空描述提交：PATCH 请求体显式传 description: ""', async () => {
        await utils.openEditEntityDrawer(page, withDesc);
        await utils.fillEntityDescription(page, '', DRAWER_TITLE.editEntity);
        const body = await utils.submitEntityEditAndCapturePatchBody(page);
        expect(body.description).toBe('');
      });

      await test.step('4. 清空后列表与详情页描述均展示 -', async () => {
        await utils.reloadEntityOrgManagementPage(page);
        await utils.ensureEntityRowVisible(page, withDesc);
        await utils.expectEntityRowContainsDescription(page, withDesc, '-');
        await utils.openEntityDetail(page, withDesc);
        await utils.expectEntityDetailDescriptionRow(page, '-');
        await utils.closeEntityDetail(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-DESC-05 Entity详情页描述字段展示',
  (cleanup) => {
    test('验证详情基本信息区描述行位置与取值', async ({ page }) => {
      const { withDesc, emptyDesc } = await prepareEntitiesViaApi(page, cleanup, {
        withDesc: DOC.descriptionSample,
        emptyDesc: '',
      });

      await test.step('1. 有描述 Entity：描述行位于名称与类型之间并展示原文', async () => {
        await utils.ensureEntityRowVisible(page, withDesc);
        await utils.openEntityDetail(page, withDesc);
        await utils.expectEntityDetailDescriptionRowOrder(page);
        await utils.expectEntityDetailDescriptionRow(
          page,
          DOC.descriptionSample,
        );
        await utils.closeEntityDetail(page);
      });

      await test.step('2. 无描述 Entity：描述行展示 -', async () => {
        await utils.ensureEntityRowVisible(page, emptyDesc);
        await utils.openEntityDetail(page, emptyDesc);
        await utils.expectEntityDetailDescriptionRow(page, '-');
        await utils.closeEntityDetail(page);
      });
    });
  },
);