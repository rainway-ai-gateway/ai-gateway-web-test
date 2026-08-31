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
  'Entity组织管理 - EM-E-02 创建Entity-成功（根节点）',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证创建根节点Entity成功', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, '根节点类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2. 输入名称、选择类型', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      });

      await test.step('3. 点击"提交"按钮', async () => {
        await utils.submitEntityFormAndWaitForSuccess(page);
      });

      await test.step('验证创建成功', async () => {
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-03 创建Entity-必填校验', (cleanup) => {
  let typeName;

  test('验证Entity名称和类型必填校验', async ({ page }) => {
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackTypeName(typeName);

    await test.step('前置：在页面上创建Entity类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '必填校验类型', 1);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 点击"创建Entity"按钮', async () => {
      await utils.openCreateEntityDrawer(page);
    });

    await test.step('2. 保持必填项为空', async () => {
      await utils.fillEntityFormBasic(page, { name: '', typeName: '' });
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitEntityForm(page);
      await utils.waitAfterEntityAction(page, 500);
    });

    await test.step('4. 观察校验提示', async () => {
      await utils.expectCreateEntityDrawerOpen(page);
      await utils.expectEntityFormFieldError(page, '名称', '请输入Entity名称');
      await utils.expectEntityFormFieldError(page, '类型', '请选择类型');
    });

    await test.step('关闭抽屉', async () => {
      await utils.cancelEntityForm(page);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-04 创建Entity-名称重复', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证重复Entity名称无法创建', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：在页面上创建Entity类型及已存在Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '重复校验类型', 1);
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 点击"创建Entity"按钮', async () => {
      await utils.openCreateEntityDrawer(page);
    });

    await test.step('2. 输入已存在的名称', async () => {
      await utils.fillEntityFormBasic(page, { name: entityName, typeName });
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitEntityForm(page);
      await utils.waitAfterEntityAction(page, 2000);
    });

    await test.step('4. 观察错误提示', async () => {
      await utils.expectCreateEntityDrawerOpen(page);
      await utils.expectErrorNoticeContains(page, '重复');
    });

    await test.step('关闭抽屉', async () => {
      await utils.cancelEntityForm(page);
    });
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-05 创建Entity-带配额计划',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证创建带配额计划的Entity成功', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, '配额测试类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2. 输入名称、选择类型', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      });

      await test.step('3. 配置配额计划', async () => {
        await utils.fillEntityQuotaForm(page, {
          unlimited: false,
          total: DOC.withQuota.quotaTotal,
          unit: DOC.withQuota.quotaUnit,
          resetCycle: DOC.withQuota.resetCycle,
        });
      });

      await test.step('4. 点击"提交"按钮', async () => {
        await utils.waitForEntitiesListResponse(page, () =>
          utils.submitEntityForm(page),
        );
        await utils.waitAfterEntityMutation(page);
      });

      await test.step('验证创建成功', async () => {
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-05 有限配额总量必填校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证无限配额=否时配额总量必填', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, '配额校验类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2. 填写基本信息，选择有限配额并清空默认总量', async () => {
        // UI：无限配额=否时「配额总量」默认 100000000，需清空后才出必填 tip
        // （Form.validate 对 quota_plan.quota 会漏校验，utils 走 FormItem.validate）
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.clearEntityQuotaTotal(page);
        await utils.expectEntityQuotaTotalRequired(page);
      });

      await test.step('3. 再次触发校验并确认 tip 仍在', async () => {
        // 不点提交：产品 Form.validate 汇总会漏掉该字段，提交可能仍成功
        await utils.clearEntityQuotaTotal(page);
        await utils.expectCreateEntityDrawerOpen(page);
        await utils.expectEntityQuotaTotalRequired(page);
      });

      await test.step('4. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-05 配额不能为负数校验', (cleanup) => {
  let entityName;
  let typeName;

  test('验证有限配额时配额总量不能为负数', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：在页面上创建Entity类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '负配额校验类型', 1);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 点击"创建Entity"按钮', async () => {
      await utils.openCreateEntityDrawer(page);
    });

    await test.step('2. 填写基本信息，有限配额并输入负数', async () => {
      // InputNumber :min=0，键盘难稳输入 -1；utils 写模型 + FormItem.validate
      await utils.fillEntityFormBasic(page, { name: entityName, typeName });
      await utils.fillEntityQuotaForm(page, { unlimited: false });
      await utils.fillEntityQuotaTotal(page, -1);
      await utils.expectEntityQuotaRangeError(page);
    });

    await test.step('3. 再次触发校验并确认 tip 仍在', async () => {
      await utils.fillEntityQuotaTotal(page, -1);
      await utils.expectCreateEntityDrawerOpen(page);
      await utils.expectEntityQuotaRangeError(page);
    });

    await test.step('4. 关闭抽屉', async () => {
      await utils.cancelEntityForm(page);
    });
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-23 创建Entity-配额总量小数校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证有限配额时配额总量不可为小数', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          '配额小数校验类型',
          1,
        );
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 填写基本信息并写入小数配额总量', async () => {
        // UI InputNumber :precision=0，界面无法真正输入小数；utils 写模型触发「必须为非负整数」
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.fillEntityQuotaTotal(page, DOC.quotaDecimal);
        await utils.expectEntityQuotaIntegerError(page);
      });

      await test.step('5. 再次触发校验并确认 tip 仍在', async () => {
        // 不点提交：Form.validate 对 quota_plan.quota 会漏跑，提交可能仍成功
        await utils.fillEntityQuotaTotal(page, DOC.quotaDecimal);
        await utils.expectCreateEntityDrawerOpen(page);
        await utils.expectEntityQuotaIntegerError(page);
      });

      await test.step('6. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-24 创建Entity-配额总量上界校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证有限配额时配额总量不可超过 int64 上界', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          '配额上界校验类型',
          1,
        );
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 填写基本信息并输入超上界配额总量', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.fillEntityQuotaTotalAndBlur(page, DOC.quotaOverMax);
      });

      await test.step('5. 提交并验证错误提示', async () => {
        await utils.submitEntityForm(page);
        await utils.waitAfterEntityAction(page, 500);
        await utils.expectCreateEntityDrawerOpen(page);
        await utils.expectEntityQuotaMaxError(page);
      });

      await test.step('6. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-25 创建Entity-最大并发上界校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证启用限流时最大并发不可超过 int32 上界', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          '最大并发上界校验类型',
          1,
        );
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 填写基本信息，启用限流并写入超上界最大并发', async () => {
        // 最大并发改为下拉选择"限制并发数"后填写数值，超 int32 上界触发校验错误
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.selectEntityEnableRateLimit(page, '是');
        await utils.fillEntityMaxConcurrency(page, DOC.maxConcurrencyOverMax);
        await utils.expectEntityMaxConcurrencyMaxError(page);
      });

      await test.step('5. 再次触发校验并确认 tip 仍在', async () => {
        await utils.fillEntityMaxConcurrency(page, DOC.maxConcurrencyOverMax);
        await utils.expectCreateEntityDrawerOpen(page);
        await utils.expectEntityMaxConcurrencyMaxError(page);
      });

      await test.step('6. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-09 创建Entity-取消操作', (cleanup) => {
  let entityName;
  let typeName;

  test('验证取消创建Entity不刷新列表', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackTypeName(typeName);

    await test.step('前置：在页面上创建Entity类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '取消测试类型', 1);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 点击"创建Entity"按钮', async () => {
      await utils.openCreateEntityDrawer(page);
    });

    await test.step('2. 填写Entity信息', async () => {
      await utils.fillEntityFormBasic(page, { name: entityName, typeName });
    });

    await test.step('3. 点击"取消"按钮', async () => {
      await utils.cancelEntityForm(page);
      await utils.waitAfterEntityAction(page, 500);
    });

    await test.step('验证取消操作，列表不刷新', async () => {
      await utils.expectCreateEntityDrawerHidden(page);
      await utils.searchEntityByName(page, entityName);
      await utils.expectEntityNotVisible(page, entityName);
    });
  });
});

// ── 2026-08-16 UI 变更：unit=RMB 配额规则（小数/4位小数/9000万上限）──

entityOrgDescribe(
  'Entity组织管理 - EM-E-47 创建Entity-unit=RMB-配额小数校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证RMB单位下配额总量允许小数（最多4位）', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, 'RMB小数校验类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 填写基本信息，选择RMB并输入小数配额总量', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.selectEntityQuotaUnit(page, 'RMB');
        await utils.fillEntityQuotaTotal(page, 100.56);
      });

      await test.step('5. 提交并验证创建成功', async () => {
        await utils.submitEntityFormAndWaitForSuccess(page);
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-48 创建Entity-unit=RMB-配额4位小数边界',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证4位小数合法、5位小数被拦截', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, 'RMB小数边界类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('5-6. 4位小数配额提交成功', async () => {
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.selectEntityQuotaUnit(page, 'RMB');
        await utils.fillEntityQuotaTotal(page, 100.1234);
        await utils.submitEntityFormAndWaitForSuccess(page);
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });

      await test.step('7-8. 5位小数写模型触发精度校验', async () => {
        // 新实体验证 5 位小数：InputNumber :precision=4 界面截断，自动化经 Vue 模型注入
        const overPrecisionName = await utils.generateTestEntityName();
        cleanup.trackEntityName(overPrecisionName);
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityFormBasic(page, {
          name: overPrecisionName,
          typeName,
        });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.selectEntityQuotaUnit(page, 'RMB');
        await utils.setEntityQuotaTotalModel(page, 100.12345);
        await utils.expectEntityQuotaRmbPrecisionError(page);
        await utils.expectCreateEntityDrawerOpen(page);
      });

      await test.step('9. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-49 创建Entity-unit=total_token-配额必须整数',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证total_token单位下配额总量不可为小数', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          '整数配额校验类型',
          1,
        );
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 选择total_token并写入小数配额总量', async () => {
        // InputNumber :precision=0 界面无法输入小数，自动化经 Vue 模型注入
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.selectEntityQuotaUnit(page, 'total_token');
        await utils.setEntityQuotaTotalModel(page, DOC.quotaDecimal);
        await utils.expectEntityQuotaIntegerError(page);
      });

      await test.step('5. 再次触发校验并确认 tip 仍在', async () => {
        await utils.setEntityQuotaTotalModel(page, DOC.quotaDecimal);
        await utils.expectCreateEntityDrawerOpen(page);
        await utils.expectEntityQuotaIntegerError(page);
      });

      await test.step('6. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-52 创建Entity-unit=RMB-配额总量9000万上界校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证RMB配额总量不可超过9000万元', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, 'RMB上界校验类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 选择RMB并写入超过9000万元的配额总量', async () => {
        // InputNumber :max=90000000 会钳制界面输入，自动化经 Vue 模型注入
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.selectEntityQuotaUnit(page, 'RMB');
        await utils.setEntityQuotaTotalModel(page, DOC.quotaRmbOverMax);
        await utils.expectEntityQuotaRmbMaxError(page);
      });

      await test.step('5. 再次触发校验并确认 tip 仍在', async () => {
        await utils.setEntityQuotaTotalModel(page, DOC.quotaRmbOverMax);
        await utils.expectCreateEntityDrawerOpen(page);
        await utils.expectEntityQuotaRmbMaxError(page);
      });

      await test.step('6. 关闭抽屉', async () => {
        await utils.cancelEntityForm(page);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-53 创建Entity-unit=RMB-配额总量9000万边界值合法',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证9000万元边界值可正常创建', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：在页面上创建Entity类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(page, typeName, 'RMB边界合法类型', 1);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 点击"创建Entity"按钮', async () => {
        await utils.openCreateEntityDrawer(page);
      });

      await test.step('2-4. 选择RMB并输入边界值90000000.00', async () => {
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.fillEntityQuotaForm(page, { unlimited: false });
        await utils.selectEntityQuotaUnit(page, 'RMB');
        await utils.fillEntityQuotaTotal(page, DOC.quotaRmbMax);
      });

      await test.step('5. 提交并验证创建成功', async () => {
        await utils.submitEntityFormAndWaitForSuccess(page);
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-55 编辑Entity-unit=RMB-配额总量9000万上界校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证编辑表单中RMB配额上限同样生效', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建类型及 unit=RMB 的Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          'RMB编辑上界校验类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
          quotaPlan: { unlimited: false, quota: 100, unit: 'RMB' },
        });
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 打开编辑抽屉并确认单位回显RMB', async () => {
        await utils.openEditEntityDrawer(page, entityName);
        await utils.expectEntityFormSelectValue(
          page,
          '配额单位',
          'RMB',
          utils.DRAWER_TITLE.editEntity,
        );
      });

      await test.step('2-4. 写入超过9000万元的配额总量并触发校验', async () => {
        await utils.setEntityQuotaTotalModel(
          page,
          DOC.quotaRmbOverMax,
          utils.DRAWER_TITLE.editEntity,
        );
        await utils.expectEntityQuotaRmbMaxError(
          page,
          utils.DRAWER_TITLE.editEntity,
        );
      });

      await test.step('5. 修改为边界值提交成功', async () => {
        await utils.setEntityQuotaTotalModel(
          page,
          DOC.quotaRmbMax,
          utils.DRAWER_TITLE.editEntity,
        );
        await utils.submitEntityFormAndWaitForEditSuccess(page);
        await expect(
          utils.ivuDrawer(page).withTitle(utils.DRAWER_TITLE.editEntity),
        ).toBeHidden({ timeout: 10000 });
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-54 重置配额弹窗-unit=RMB-9000万上界校验',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证重置配额弹窗中RMB配额上限同样生效', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建类型及 unit=RMB 的Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          'RMB重置上界校验类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
          quotaPlan: { unlimited: false, quota: 100, unit: 'RMB' },
        });
        await utils.gotoEntityOrgManagementPage(page);
        await utils.searchEntityByName(page, entityName);
      });

      await test.step('1. 打开详情并点击"重置配额"按钮', async () => {
        await utils.openEntityDetail(page, entityName);
        await utils.clickResetEntityQuotaBtn(page);
      });

      await test.step('2. 确认配额单位为RMB、重置弹窗已打开', async () => {
        // 弹窗本身不展示单位文本，详情抽屉"配额单位"行即 RMB 场景依据（驱动弹窗 RMB 上限行为）
        await utils.expectEntityDetailQuotaUnit(page, 'RMB');
        await utils.expectResetQuotaDrawerOpen(page);
      });

      await test.step('3-4. 写入超过9000万元的配额总量并点击"确认"', async () => {
        // InputNumber :max=90000000 会钳制界面输入，自动化经 Vue 模型注入
        await utils.setResetQuotaTotalModel(page, DOC.quotaRmbOverMax);
        await utils.submitResetQuotaForm(page);
      });

      await test.step('验证重置失败并提示上界错误', async () => {
        await utils.expectErrorNoticeContains(page, DOC.quotaRmbMaxErrorMsg);
        await utils.expectResetQuotaDrawerOpen(page);
      });

      await test.step('5. 修改为边界值90000000并提交成功', async () => {
        await utils.setResetQuotaTotalModel(page, DOC.quotaRmbMax);
        await utils.submitResetQuotaFormAndWaitForSuccess(page);
        await utils.expectResetQuotaDrawerHidden(page);
      });
    });
  },
);
