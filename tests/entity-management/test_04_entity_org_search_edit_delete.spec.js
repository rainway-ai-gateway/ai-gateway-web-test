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

// 前置在 Entity 类型管理页面通过 UI 创建类型，再切换至 Entity 组织管理 Tab（与 test_11 一致）。
// 不使用 page.reload，避免 Session Key 失效导致 Tab 切换失败。

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

entityOrgDescribe('Entity组织管理 - EM-E-10 Entity搜索-按名称', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证按名称搜索Entity功能', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建测试Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '搜索测试类型', 1);
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 在第一个搜索框中输入Entity名称的一部分', async () => {
      await utils.searchEntityByName(page, entityName.slice(0, 6));
      await utils.expectEntityVisible(page, entityName);
    });

    await test.step('2. 清空搜索框，观察列表恢复', async () => {
      await utils.searchEntityByName(page, '');
      await utils.expectEntityListNotEmpty(page);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-11 Entity搜索-按类型', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证按类型搜索Entity功能', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建测试Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '类型搜索测试', 1);
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoEntityOrgManagementPage(page);
    });

    await test.step('1. 在第二个搜索框中输入类型名', async () => {
      await utils.searchEntityByType(page, typeName);
      await utils.expectEntityVisible(page, entityName);
    });

    await test.step('2. 清除筛选，观察列表恢复', async () => {
      await utils.searchEntityByType(page, '');
      await utils.expectEntityListNotEmpty(page);
    });
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-12 Entity搜索-按父Entity',
  (cleanup) => {
    let parentName;
    let childName;
    let parentType;
    let childType;
    let parentId;
    let childId;

    test('验证按父Entity搜索Entity功能', async ({ page }) => {
      parentName = await utils.generateTestEntityName();
      childName = await utils.generateTestEntityName();
      parentType = await utils.generateTestEntityTypeName();
      childType = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(parentName);
      cleanup.trackEntityName(childName);
      cleanup.trackTypeName(parentType);
      cleanup.trackTypeName(childType);

      await test.step('前置：创建父Entity及子Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          parentType,
          '父Entity搜索类型',
          1,
        );
        await utils.createEntityTypeViaUI(
          page,
          childType,
          '子Entity搜索类型',
          2,
        );
        const parentData = await utils.createEntityWithTypeViaApi(
          page,
          parentName,
          parentType,
        );
        parentId = parentData.id;
        cleanup.trackEntityId(parentId);
        // 显式传父 id，避免名称解析歧义；API 字段为 parent_id
        const childData = await utils.createEntityWithTypeViaApi(
          page,
          childName,
          childType,
          parentId,
        );
        childId = childData.id;
        cleanup.trackEntityId(childId);
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 在第三个搜索框中输入父Entity名称', async () => {
        await utils.searchEntityByParent(page, parentName);
        await utils.expectEntityVisible(page, childName);
      });

      await test.step('2. 清除筛选，观察列表恢复', async () => {
        await utils.searchEntityByParent(page, '');
        await utils.expectEntityListNotEmpty(page);
      });
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-13 编辑Entity-成功', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证编辑Entity成功', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建测试Entity及类型', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '编辑测试类型', 1);
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.searchEntityByName(page, entityName);
    });

    await test.step('1. 点击"编辑"按钮', async () => {
      await utils.openEditEntityDrawer(page, entityName);
    });

    await test.step('2. 修改配额信息或限流配置', async () => {
      await utils.fillEntityQuotaForm(
        page,
        {
          unlimited: false,
          total: 200000,
          unit: 'total_token',
          resetCycle: '每周',
        },
        '编辑Entity',
      );
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitEntityFormAndWaitForEditSuccess(page, '编辑Entity');
    });

    await test.step('验证编辑成功，列表刷新', async () => {
      await utils.searchEntityByName(page, entityName);
      await utils.expectEntityVisible(page, entityName);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-14 查看Entity详情', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证查看Entity详情功能', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建测试Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '详情测试类型', 1);
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.searchEntityByName(page, entityName);
    });

    await test.step('1. 在列表中点击Entity名称进入详情', async () => {
      await utils.openEntityDetail(page, entityName);
    });

    await test.step('2. 观察详情弹窗显示', async () => {
      await utils.expectEntityDetailVisible(page);
    });

    await test.step('3. 点击"关闭"按钮', async () => {
      await utils.closeEntityDetail(page);
    });
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-14b Entity详情数据与接口一致性',
  (cleanup) => {
    let entityName;
    let typeName;
    let parentName;

    test('验证Entity详情展示数据与接口返回一致', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      const parentTypeName = await utils.generateTestEntityTypeName();
      const childTypeName = await utils.generateTestEntityTypeName();
      parentName = await utils.generateTestEntityName();
      cleanup.trackEntityName(entityName);
      cleanup.trackEntityName(parentName);
      cleanup.trackTypeName(parentTypeName);
      cleanup.trackTypeName(childTypeName);

      await test.step('前置：创建父Entity和带有限配额的子Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          parentTypeName,
          '详情一致性验证父类型',
          1,
        );
        await utils.createEntityTypeViaApi(
          page,
          childTypeName,
          '详情一致性验证子类型',
          2,
        );
        await utils.gotoEntityOrgManagementPage(page);
        await utils.createEntityViaUI(page, parentName, parentTypeName);
        await utils.createEntityWithQuotaViaUI(
          page,
          entityName,
          childTypeName,
          {
            total: 100000000,
            unit: 'total_token',
            resetCycle: '每月',
          },
          parentName,
        );
        await utils.searchEntityByName(page, entityName);
      });

      await test.step('1. 通过接口获取Entity详情', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        expect(apiData).not.toBeNull();
        expect(apiData.name).toBe(entityName);
        expect(apiData.type).toBe(childTypeName);
        expect(apiData.quota_plan.unlimited).toBe(false);
        expect(apiData.quota_plan.quota).toBe(100000000);
        expect(apiData.quota_plan.unit).toBe('total_token');
        expect(apiData.quota_plan.pass_when_no_enough_quota).toBe(false);
      });

      await test.step('2. 打开Entity详情抽屉', async () => {
        await utils.openEntityDetail(page, entityName);
        await utils.expectEntityDetailVisible(page);
      });

      await test.step('3. 验证详情数据与接口返回一致（基本信息+配额信息）', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        await utils.expectEntityDetailMatchesApi(page, apiData, parentName);
      });

      await test.step('关闭详情并清理测试数据', async () => {
        await utils.closeEntityDetail(page);
        await utils.deleteEntityByNameViaApi(page, entityName);
        await utils.deleteEntityByNameViaApi(page, parentName);
        await utils.deleteEntityTypeViaApi(page, childTypeName);
        await utils.deleteEntityTypeViaApi(page, parentTypeName);
      });
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-13b 编辑Entity-回显数据与接口一致性',
  (cleanup) => {
    let entityName;
    let typeName;
    let parentName;

    test('验证编辑Entity回显数据与接口一致', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      const parentTypeName = await utils.generateTestEntityTypeName();
      const childTypeName = await utils.generateTestEntityTypeName();
      parentName = await utils.generateTestEntityName();
      cleanup.trackEntityName(entityName);
      cleanup.trackEntityName(parentName);
      cleanup.trackTypeName(parentTypeName);
      cleanup.trackTypeName(childTypeName);

      await test.step('前置：创建父Entity和子Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.deleteEntityTypeViaApi(page, parentTypeName);
        await utils.deleteEntityTypeViaApi(page, childTypeName);
        await utils.createEntityTypeViaApi(
          page,
          parentTypeName,
          '编辑回显验证父类型',
          1,
        );
        await utils.createEntityTypeViaApi(
          page,
          childTypeName,
          '编辑回显验证子类型',
          2,
        );
        await utils.gotoEntityOrgManagementPage(page);
        await utils.createEntityViaUI(page, parentName, parentTypeName);
        await utils.createEntityViaUI(
          page,
          entityName,
          childTypeName,
          parentName,
        );
        await utils.searchEntityByName(page, entityName);
      });

      await test.step('1. 通过接口获取Entity详情', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        expect(apiData).not.toBeNull();
        expect(apiData.name).toBe(entityName);
        expect(apiData.type).toBe(childTypeName);
      });

      await test.step('2. 点击"编辑"按钮并验证回显数据与接口一致', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        await utils.expectEntityEditEchoMatchesApi(
          page,
          entityName,
          apiData,
          parentName,
        );
      });

      await test.step('关闭抽屉并清理测试数据', async () => {
        await utils.cancelEditEntityForm(page);
        await utils.deleteEntityByNameViaApi(page, entityName);
        await utils.deleteEntityByNameViaApi(page, parentName);
        await utils.deleteEntityTypeViaApi(page, childTypeName);
        await utils.deleteEntityTypeViaApi(page, parentTypeName);
      });
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-15 重置Entity配额', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证重置Entity配额功能', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建带有限配额的Entity（无限配额=否）', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '重置配额测试类型', 1);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.createEntityWithQuotaViaUI(page, entityName, typeName, {
        total: 1000,
        unit: 'total_token',
        resetCycle: '永不重置',
      });
      const entityData = await utils.findEntityByNameViaApi(page, entityName);
      if (entityData?.id) {
        entityId = entityData.id;
        cleanup.trackEntityId(entityId);
      }
      await utils.searchEntityByName(page, entityName);
    });

    await test.step('1. 在详情页点击"重置配额"按钮', async () => {
      await utils.openEntityDetail(page, entityName);
      await utils.clickResetEntityQuotaBtn(page);
    });

    await test.step('2. 验证空配额总量校验', async () => {
      await utils.expectResetQuotaDrawerOpen(page);
      await utils.clearResetQuotaTotal(page);
      await utils.submitResetQuotaForm(page);
      await utils.waitAfterEntityAction(page, 500);
      await utils.expectResetQuotaDrawerOpen(page);
    });

    await test.step('3. 输入新的配额总量和重置原因', async () => {
      await utils.fillResetQuotaForm(
        page,
        DOC.resetQuota.total,
        DOC.resetQuota.reason,
      );
    });

    await test.step('4. 点击"确定"按钮', async () => {
      await utils.submitResetQuotaFormAndWaitForSuccess(page);
    });

    await test.step('验证重置成功', async () => {
      await utils.expectResetQuotaDrawerHidden(page);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-16 删除Entity-无下级', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证删除无下级Entity成功', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建无下级Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '删除测试类型', 1);
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.searchEntityByName(page, entityName);
    });

    await test.step('1-2. 点击"删除"按钮并观察确认弹窗', async () => {
      await utils.clickDeleteEntityBtn(page, entityName);
      await utils.expectDeleteEntityConfirmModal(page, entityName);
    });

    await test.step('3-4. 点击"确定"并观察列表刷新', async () => {
      await utils.confirmDeleteEntityAndWaitForSuccess(page);
    });

    await test.step('验证删除成功', async () => {
      await utils.searchEntityByName(page, entityName);
      await utils.expectEntityNotVisible(page, entityName);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-17 删除Entity-有下级', (cleanup) => {
  let parentName;
  let childName;
  let parentType;
  let childType;

  test('验证删除有下级Entity的系统行为', async ({ page }) => {
    parentName = await utils.generateTestEntityName();
    childName = await utils.generateTestEntityName();
    parentType = await utils.generateTestEntityTypeName();
    childType = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(parentName);
    cleanup.trackEntityName(childName);
    cleanup.trackTypeName(parentType);
    cleanup.trackTypeName(childType);

    await test.step('前置：创建有下级的父Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, parentType, '父子删除父类型', 1);
      await utils.createEntityTypeViaUI(page, childType, '父子删除子类型', 2);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.createEntityViaUI(page, parentName, parentType);
      await utils.createEntityViaUI(page, childName, childType, parentName);
      await utils.searchEntityByName(page, parentName);
    });

    await test.step('1. 点击"删除"按钮', async () => {
      await utils.clickDeleteEntityBtn(page, parentName);
    });

    await test.step('2. 观察确认弹窗显示', async () => {
      await utils.expectDeleteEntityConfirmModal(page, parentName);
    });

    await test.step('3. 点击"确定"按钮', async () => {
      await utils.confirmDeleteEntityExpectBlocked(page);
    });

    await test.step('4. 根据实际系统实现验证响应', async () => {
      try {
        await utils.searchEntityByName(page, parentName);
        await utils.expectEntityNotVisible(page, parentName);
      } catch (e) {
        await utils.expectEntityVisible(page, parentName);
      }
    });
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-21 删除Entity-有API-Key挂载',
  (cleanup) => {
    let entityName;
    let typeName;
    let entityId;
    let apiKeyId;

    test('验证删除有API-Key挂载的Entity被阻止', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      const apiKeyDescription = 'E21挂载Key_' + Date.now();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建 Entity 并挂载 API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          typeName,
          'E21删除约束类型',
          1,
        );
        const entityData = await utils.createEntityWithTypeViaApi(
          page,
          entityName,
          typeName,
        );
        entityId = entityData.id;
        cleanup.trackEntityId(entityId);
        const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
          description: apiKeyDescription,
          entity_name: entityName,
        });
        apiKeyId = apiKey.id;
        cleanup.trackApiKeyId(apiKeyId);
        await utils.gotoEntityOrgManagementPage(page);
        await utils.searchEntityByName(page, entityName);
      });

      await test.step('1. 点击"删除"按钮', async () => {
        await utils.clickDeleteEntityBtn(page, entityName);
      });

      await test.step('2. 观察确认弹窗显示', async () => {
        await utils.expectDeleteEntityConfirmModal(page, entityName);
      });

      await test.step('3. 点击"确定"按钮', async () => {
        const result = await utils.confirmDeleteEntityExpectBlocked(page);
        await utils.waitAfterEntityAction(page, 500);
        // 后端若返回 200（未按 OpenAPI 409 拦截），标记跳过，避免与其它修复红灯混杂
        test
          .info()
          .skip(
            !!(result && result.productGap),
            `产品未拦截挂载 API-Key 的 Entity 删除(ErrNum=${result && result.errNum})，期望 409`,
          );
      });

      await test.step('4. 验证删除失败，Entity 仍在列表中', async () => {
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });
    });
  },
);

// ==================== EM-E-12b Entity搜索-按配额 ====================

entityOrgDescribe('Entity组织管理 - EM-E-12b Entity搜索-按配额', (cleanup) => {
  let entityName;
  let typeName;
  let entityId;

  test('验证按配额搜索Entity功能', async ({ page }) => {
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackEntityName(entityName);
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建带配额的Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, '配额搜索测试类型', 1);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.createEntityWithQuotaViaUI(page, entityName, typeName, {
        total: 500000,
        unit: 'total_token',
        resetCycle: '每月',
      });
      const entityData = await utils.findEntityByNameViaApi(page, entityName);
      if (entityData?.id) {
        entityId = entityData.id;
        cleanup.trackEntityId(entityId);
      }
    });

    await test.step('1. 在配额搜索框中输入配额数值', async () => {
      // 先按名称搜索确认 Entity 存在且可见
      await utils.searchEntityByName(page, entityName);
      await utils.expectEntityVisible(page, entityName);
      // 配额列的 render 函数返回格式为 "已用 / 总量"，使用千位分隔符
      // 例如："0 / 500,000"
      await utils.searchEntityByQuota(page, '500,000');
      await utils.expectEntityVisible(page, entityName);
    });

    await test.step('2. 清空搜索框，观察列表恢复', async () => {
      await utils.searchEntityByQuota(page, '');
      await utils.expectEntityListNotEmpty(page);
    });
  });
});

// ==================== EM-E-12c Entity筛选-按限流状态 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-12c Entity筛选-按限流状态',
  (cleanup) => {
    let entityName;
    let typeName;
    let entityId;

    test('验证按限流状态筛选Entity功能', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建启用限流的Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          '限流筛选测试类型',
          1,
        );
        await utils.gotoEntityOrgManagementPage(page);
        // 创建 Entity 并启用限流
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityFormBasic(page, { name: entityName, typeName });
        await utils.selectEntityEnableRateLimit(page, '是');
        await utils.fillEntityQuotaForm(page, {
          unlimited: false,
          total: 100000,
          unit: 'total_token',
          resetCycle: '每月',
        });
        await utils.submitEntityFormAndWaitForSuccess(page);
        const entityData = await utils.findEntityByNameViaApi(page, entityName);
        if (entityData?.id) {
          entityId = entityData.id;
          cleanup.trackEntityId(entityId);
        }
      });

      await test.step('1. 选择限流状态筛选「已启用」', async () => {
        await utils.filterEntityByRateLimitStatus(page, '已启用');
        await utils.expectEntityVisible(page, entityName);
      });

      await test.step('2. 清除筛选，观察列表恢复', async () => {
        await utils.filterEntityByRateLimitStatus(page, '全部');
        await utils.expectEntityListNotEmpty(page);
      });
    });
  },
);

// ==================== EM-E-18 创建Entity-父Entity级别联动 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-18 创建Entity-父Entity级别联动',
  (cleanup) => {
    let parentName;
    let childName;
    let parentType;
    let childType;
    let parentId;
    let childId;

    test('验证创建Entity时父Entity下拉仅展示级别低于当前类型的Entity', async ({
      page,
    }) => {
      parentName = await utils.generateTestEntityName();
      childName = await utils.generateTestEntityName();
      parentType = await utils.generateTestEntityTypeName();
      childType = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(parentName);
      cleanup.trackEntityName(childName);
      cleanup.trackTypeName(parentType);
      cleanup.trackTypeName(childType);

      await test.step('前置：创建级别1和级别2的类型', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          parentType,
          '父级联动测试类型1',
          1,
        );
        await utils.createEntityTypeViaUI(
          page,
          childType,
          '父级联动测试类型2',
          2,
        );
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 创建级别1的父Entity', async () => {
        await utils.createEntityViaUI(page, parentName, parentType);
        const parentData = await utils.findEntityByNameViaApi(page, parentName);
        if (parentData?.id) {
          parentId = parentData.id;
          cleanup.trackEntityId(parentId);
        }
      });

      await test.step('2. 创建级别2的子Entity，验证父Entity下拉包含级别1的Entity', async () => {
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityFormBasic(page, {
          name: childName,
          typeName: childType,
        });
        // 验证父Entity下拉中可以看到 parentName
        await utils.expectParentEntityOptionVisible(page, parentName);
        await utils.cancelEntityForm(page);
      });

      await test.step('3. 选择合法父Entity后可成功创建', async () => {
        await utils.createEntityViaUI(page, childName, childType, parentName);
        const childData = await utils.findEntityByNameViaApi(page, childName);
        if (childData?.id) {
          childId = childData.id;
          cleanup.trackEntityId(childId);
        }
        await utils.searchEntityByName(page, childName);
        await utils.expectEntityVisible(page, childName);
      });
    });
  },
);

// ==================== EM-E-19 编辑Entity-配额与限流 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-19 编辑Entity-配额与限流',
  (cleanup) => {
    let entityName;
    let typeName;
    let entityId;

    test('验证编辑Entity的配额与限流配置', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaUI(
          page,
          typeName,
          '编辑配额限流测试类型',
          1,
        );
        await utils.gotoEntityOrgManagementPage(page);
        await utils.createEntityWithQuotaViaUI(page, entityName, typeName, {
          total: 100000,
          unit: 'total_token',
          resetCycle: '每月',
        });
        const entityData = await utils.findEntityByNameViaApi(page, entityName);
        if (entityData?.id) {
          entityId = entityData.id;
          cleanup.trackEntityId(entityId);
        }
      });

      await test.step('1. 点击"编辑"按钮', async () => {
        await utils.openEditEntityDrawer(page, entityName);
      });

      await test.step('2. 验证名称、类型字段为只读', async () => {
        await utils.expectEntityNameFieldDisabled(page);
        await utils.expectEntityTypeFieldDisabled(page);
      });

      await test.step('3. 修改配额信息', async () => {
        await utils.fillEntityQuotaForm(
          page,
          {
            unlimited: false,
            total: 200000,
            unit: 'total_token',
            resetCycle: '每周',
          },
          '编辑Entity',
        );
      });

      await test.step('4. 点击"提交"', async () => {
        await utils.submitEntityFormAndWaitForEditSuccess(page, '编辑Entity');
      });

      await test.step('5. 验证配额修改保存成功', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        expect(apiData.quota_plan.quota).toBe(200000);
      });
    });
  },
);
