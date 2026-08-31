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
const utils = require('../../pages/entity/EntityPage');

const DOC = utils.DOC_ENTITY_ORG;

// 前置在 Entity 类型管理页面通过 UI 创建类型，再切换至 Entity 组织管理 Tab。
// 已知产品缺陷：UI 创建成功后 GET /entity-types 列表可能不立即返回新数据，影响组织管理页类型下拉。

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

entityOrgDescribe(
  'Entity组织管理 - EM-E-06 创建Entity-带限流策略',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证创建带限流策略的Entity成功', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, '限流测试类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2. 输入名称、选择类型', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      });

      await test.step('3. 配置限流策略', async () => {
        await utils.fillEntityRateLimitForm(page, {
          enable: true,
          tpm: DOC.withRateLimit.tpm,
          rpm: DOC.withRateLimit.rpm,
          maxConcurrency: DOC.withRateLimit.maxConcurrency,
        });
      });

      await test.step('4. 点击"提交"按钮', async () => {
        await utils.waitForEntitiesListResponse(page, () =>
          utils.submitEntityForm(page),
        );
        await utils.waitAfterEntityMutation(page);
      });

      await test.step('验证创建成功，限流状态显示已启用', async () => {
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
        await utils.expectEntityRowContainsRateLimitStatus(
          page,
          entityName,
          '已启用',
        );
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-20 创建Entity-限流至少配置一项',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证启用限流时至少配置一项', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, '限流校验类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2. 填写基本信息并启用限流（不配置规则）', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.selectEntityEnableRateLimit(page, '是');
        // 默认 max_concurrency=-1 会被当成已配置；清空为 null 后点提交才会挂行内 tip
        await utils.prepareEntityRateLimitRequiredState(page);
      });

      await test.step('3. 提交并验证被拦截', async () => {
        await utils.submitEntityFormExpectRateLimitError(
          page,
          utils.DOC_ENTITY_ORG.rateLimitRuleRequiredMsg,
        );
        await utils.expectCreateEntityDrawerOpen(page);
      });

      await test.step('4. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-07 创建Entity-子节点', (cleanup) => {
  let parentName;
  let childName;
  let parentType;
  let childType;
  let parentId;

  test('验证创建子节点Entity成功', async ({ page }) => {
    parentName = await utils.generateTestEntityName();
    childName = await utils.generateTestEntityName();
    parentType = await utils.generateTestEntityTypeName();
    childType = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(parentName);
    cleanup.trackEntityName(childName);
    cleanup.trackTypeName(parentType);
    cleanup.trackTypeName(childType);

    await test.step('前置：在页面上创建父/子Entity类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, parentType, '父类型', 1);
      await utils.createEntityTypeViaUI(page, childType, '子类型', 2);
      const parentData = await utils.createEntityWithTypeViaApi(
        page,
        parentName,
        parentType,
      );
      parentId = parentData.id;
      cleanup.trackEntityId(parentId);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 点击"创建Entity"按钮', async () => {
      await utils.openCreateEntityDrawer(page);
    });

    await test.step('2. 输入名称、选择类型、选择父Entity', async () => {
      await utils.fillEntityFormBasic(page, {
        name: childName,
        typeName: childType,
        parentName,
      });
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.waitForEntitiesListResponse(page, () =>
        utils.submitEntityForm(page),
      );
      await utils.waitAfterEntityMutation(page);
    });

    await test.step('验证创建成功，父Entity列显示正确', async () => {
      await utils.expectCreateEntityDrawerHidden(page);
      await utils.searchEntityByName(page, childName);
      await utils.expectEntityVisible(page, childName);
      await utils.expectEntityRowContainsParent(page, childName, parentName);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-08 创建Entity-多层级', (cleanup) => {
  let level1Name;
  let level2Name;
  let level3Name;
  let type1;
  let type2;
  let type3;

  test('验证创建多层级Entity成功', async ({ page }) => {
    level1Name = await utils.generateTestEntityName();
    level2Name = await utils.generateTestEntityName();
    level3Name = await utils.generateTestEntityName();
    type1 = await utils.generateTestEntityTypeName();
    type2 = await utils.generateTestEntityTypeName();
    type3 = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(level1Name);
    cleanup.trackEntityName(level2Name);
    cleanup.trackEntityName(level3Name);
    cleanup.trackTypeName(type1);
    cleanup.trackTypeName(type2);
    cleanup.trackTypeName(type3);

    await test.step('前置：在页面上创建三级Entity类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, type1, '一级类型', 1);
      await utils.createEntityTypeViaUI(page, type2, '二级类型', 2);
      await utils.createEntityTypeViaUI(page, type3, '三级类型', 3);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 创建第一级Entity', async () => {
      await utils.openCreateEntityDrawer(page);
      await utils.fillEntityFormBasic(page, {
        name: level1Name,
        typeName: type1,
      });
      await utils.waitForEntitiesListResponse(page, () =>
        utils.submitEntityForm(page),
      );
      await utils.waitAfterEntityMutation(page);
      await utils.searchEntityByName(page, level1Name);
      await utils.expectEntityVisible(page, level1Name);
    });

    await test.step('2. 创建第二级Entity', async () => {
      await utils.openCreateEntityDrawer(page);
      await utils.fillEntityFormBasic(page, {
        name: level2Name,
        typeName: type2,
        parentName: level1Name,
      });
      await utils.waitForEntitiesListResponse(page, () =>
        utils.submitEntityForm(page),
      );
      await utils.waitAfterEntityMutation(page);
      await utils.searchEntityByName(page, level2Name);
      await utils.expectEntityVisible(page, level2Name);
    });

    await test.step('3. 创建第三级Entity', async () => {
      await utils.openCreateEntityDrawer(page);
      await utils.fillEntityFormBasic(page, {
        name: level3Name,
        typeName: type3,
        parentName: level2Name,
      });
      await utils.waitForEntitiesListResponse(page, () =>
        utils.submitEntityForm(page),
      );
      await utils.waitAfterEntityMutation(page);
      await utils.searchEntityByName(page, level3Name);
      await utils.expectEntityVisible(page, level3Name);
    });

    await test.step('验证三个Entity层级关系正确', async () => {
      await utils.searchEntityByName(page, level3Name);
      await utils.expectEntityRowContainsParent(page, level3Name, level2Name);
      await utils.searchEntityByName(page, level2Name);
      await utils.expectEntityRowContainsParent(page, level2Name, level1Name);
    });
  });
});
