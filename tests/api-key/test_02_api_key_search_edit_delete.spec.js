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

const DOC = utils.DOC_API_KEY;

function apiKeyDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createApiKeyTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

apiKeyDescribe('API-Key管理 - EM-K-13 API-Key搜索-按描述', (cleanup) => {
  let description;
  let apiKeyId;

  test('验证按描述搜索API-Key功能', async ({ page }) => {
    description = DOC.searchDescription + '_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 在搜索框中输入描述的一部分', async () => {
      await utils.searchApiKeyByDescription(page, description.slice(0, 6));
      await utils.expectApiKeyVisibleInAllPages(page, description);
    });

    await test.step('2. 清空搜索框，观察列表恢复', async () => {
      await utils.searchApiKeyByDescription(page, '');
      await expect(
        page.locator('.show-iView-Table .ivu-table tbody tr').first(),
      ).toBeVisible();
    });
  });
});

apiKeyDescribe(
  'API-Key管理 - EM-K-19b API-Key详情数据与接口一致性',
  (cleanup) => {
    let description;
    let apiKeyId;
    let entityName;
    let typeName;

    test('验证API-Key详情展示数据与接口返回一致', async ({ page }) => {
      description = DOC.searchDescription + '_detail_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity和带有限配额的API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApiAndRefresh(
          page,
          typeName,
          '详情一致性验证类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
        });
        cleanup.trackEntityName(entityName);
        await utils.gotoApiKeyManagementPage(page);
        await utils.createApiKeyWithQuotaViaUI(page, description, {
          total: 100000000,
          unit: 'total_token',
          resetCycle: '每月',
        });
        await utils.ensureApiKeyRowVisible(page, description);
        // API 列表可能有短暂同步延迟，重试查找
        let apiKey = null;
        for (let i = 0; i < 5; i++) {
          apiKey = await utils.findApiKeyByDescriptionViaApi(page, description);
          if (apiKey) break;
          await page.waitForTimeout(1000);
        }
        apiKeyId = apiKey ? apiKey.id : null;
        if (apiKeyId) {
          cleanup.trackApiKeyId(apiKeyId);
        }
      });

      await test.step('1. 通过接口获取API-Key详情', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        expect(apiData).not.toBeNull();
        expect(apiData.description).toBe(description);
        expect(apiData.quota_plan.unlimited).toBe(false);
        expect(apiData.quota_plan.quota).toBe(100000000);
        expect(apiData.quota_plan.unit).toBe('total_token');
      });

      await test.step('2. 打开API-Key详情抽屉', async () => {
        await utils.openApiKeyDetail(page, description);
        await utils.expectApiKeyDetailVisible(page);
      });

      await test.step('3. 验证详情数据与接口返回一致（基本信息+配额信息+限流状态）', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        await utils.expectApiKeyDetailMatchesApi(page, apiData);
      });

      await test.step('关闭详情并清理测试数据', async () => {
        await utils.closeApiKeyDetail(page);
        await utils.deleteApiKeyViaApi(page, apiKeyId);
        await utils.deleteEntityByNameViaApi(page, entityName);
        await utils.deleteEntityTypeViaApi(page, typeName);
      });
    });
  },
);

apiKeyDescribe('API-Key管理 - EM-K-14 API-Key搜索-按状态', (cleanup) => {
  let description;
  let apiKeyId;

  test('验证按状态筛选API-Key功能', async ({ page }) => {
    description = DOC.searchDescription + '_status_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
        status: 'enabled',
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 选择状态筛选', async () => {
      await utils.selectApiKeyStatusFilter(page, '启用');
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisibleInAllPages(page, description);
    });

    await test.step('2. 清除筛选，观察列表恢复', async () => {
      await utils.clearApiKeyStatusFilter(page);
      await expect(
        page.locator('.show-iView-Table .ivu-table tbody tr').first(),
      ).toBeVisible();
    });
  });
});

apiKeyDescribe('API-Key管理 - EM-K-15 API-Key搜索-按Entity', (cleanup) => {
  let description;
  let entityName;
  let typeName;
  let apiKeyId;
  let entityId;

  test('验证按Entity筛选API-Key功能', async ({ page }) => {
    description = DOC.searchDescription + '_entity_' + Date.now();
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();
    cleanup.trackTypeName(typeName);

    await test.step('前置：创建Entity并挂载API-Key', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaApiAndRefresh(
        page,
        typeName,
        '筛选Entity类型',
        1,
      );
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      cleanup.trackEntityId(entityId);
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
        entity_name: entityName,
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 验证挂载Entity列显示Entity名称', async () => {
      await utils.ensureApiKeyRowVisible(page, description);
      await utils.expectApiKeyRowContainsText(page, description, entityName);
    });

    await test.step('2. 清空搜索，观察列表恢复', async () => {
      await utils.searchApiKeyByDescription(page, '');
      await expect(
        page.locator('.show-iView-Table .ivu-table tbody tr').first(),
      ).toBeVisible();
    });
  });
});

apiKeyDescribe('API-Key管理 - EM-K-16 编辑API-Key-修改信息', (cleanup) => {
  let description;
  let apiKeyId;
  const newDescription = DOC.editDescription + '_' + Date.now();

  test('验证编辑API-Key修改信息成功', async ({ page }) => {
    description = DOC.searchDescription + '_edit_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
      await utils.ensureApiKeyRowVisible(page, description);
    });

    await test.step('1. 点击"编辑"按钮', async () => {
      await utils.openEditApiKeyDrawer(page, description);
    });

    await test.step('2. 修改描述信息', async () => {
      await utils.fillApiKeyDescription(page, newDescription, '编辑 API-Key');
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForEditSuccess(page);
    });

    await test.step('验证编辑成功', async () => {
      await utils.ensureApiKeyRowVisible(page, newDescription);
    });
  });
});

apiKeyDescribe(
  'API-Key管理 - EM-K-16b 编辑API-Key-回显数据与接口一致性',
  (cleanup) => {
    let description;
    let apiKeyId;
    let entityName;
    let typeName;

    test('验证编辑API-Key回显数据与接口一致', async ({ page }) => {
      description = DOC.searchDescription + '_echo_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity和带挂载的API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApiAndRefresh(
          page,
          typeName,
          '编辑回显验证类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
        });
        cleanup.trackEntityName(entityName);
        await utils.gotoApiKeyManagementPage(page);
        const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
          description,
          enabled: true,
          entity_name: entityName,
        });
        apiKeyId = apiKey.id;
        cleanup.trackApiKeyId(apiKeyId);
        await utils.reloadApiKeyManagementPage(page);
        await utils.ensureApiKeyRowVisible(page, description);
      });

      await test.step('1. 通过接口获取API-Key详情', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        expect(apiData).not.toBeNull();
        expect(apiData.description).toBe(description);
        expect(apiData.enabled).toBe(true);
      });

      await test.step('2. 点击"编辑"按钮并验证回显数据与接口一致', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        await utils.expectApiKeyEditEchoMatchesApi(
          page,
          description,
          apiData,
          entityName,
        );
      });

      await test.step('关闭抽屉并清理测试数据', async () => {
        await utils.cancelApiKeyForm(page, '编辑 API-Key');
        await utils.deleteApiKeyViaApi(page, apiKeyId);
        await utils.deleteEntityByNameViaApi(page, entityName);
        await utils.deleteEntityTypeViaApi(page, typeName);
      });
    });
  },
);

apiKeyDescribe(
  'API-Key管理 - EM-K-17 编辑API-Key-修改挂载Entity',
  (cleanup) => {
    let description;
    let entityName;
    let typeName;
    let apiKeyId;
    let entityId;

    test('验证编辑API-Key修改挂载Entity成功', async ({ page }) => {
      description = DOC.withEntity.description + '_edit_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity和API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApiAndRefresh(
          page,
          typeName,
          '编辑挂载类型',
          1,
        );
        const entityData = await utils.createEntityWithTypeViaApi(
          page,
          entityName,
          typeName,
        );
        entityId = entityData.id;
        cleanup.trackEntityId(entityId);
        await utils.gotoApiKeyManagementPage(page);
        const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
          description,
        });
        apiKeyId = apiKey.id;
        cleanup.trackApiKeyId(apiKeyId);
        await utils.reloadApiKeyManagementPage(page);
        await utils.ensureApiKeyRowVisible(page, description);
      });

      await test.step('1. 点击"编辑"按钮', async () => {
        await utils.openEditApiKeyDrawer(page, description);
      });

      await test.step('2. 修改挂载Entity', async () => {
        await utils.selectApiKeyEntity(page, entityName, '编辑 API-Key');
      });

      await test.step('3. 点击"提交"按钮', async () => {
        await utils.submitApiKeyFormAndWaitForEditSuccess(page);
      });

      await test.step('验证挂载Entity更新', async () => {
        await utils.ensureApiKeyRowVisible(page, description);
        await utils.expectApiKeyRowContainsText(page, description, entityName);
      });
    });
  },
);

apiKeyDescribe('API-Key管理 - EM-K-18 删除API-Key', (cleanup) => {
  let description;
  let apiKeyId;

  test('验证删除API-Key成功', async ({ page }) => {
    description = DOC.searchDescription + '_delete_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
      await utils.ensureApiKeyRowVisible(page, description);
    });

    await test.step('1-2. 点击"删除"按钮并观察确认弹窗', async () => {
      await utils.clickDeleteApiKeyBtn(page, description);
      await utils.expectDeleteApiKeyConfirmModal(page, description);
    });

    await test.step('3-4. 点击"确认"并观察列表刷新', async () => {
      await utils.confirmDeleteApiKeyAndWaitForSuccess(page);
      apiKeyId = null;
    });

    await test.step('验证删除成功', async () => {
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyNotVisible(page, description);
    });
  });
});

apiKeyDescribe('API-Key管理 - EM-K-19 重置API-Key配额', (cleanup) => {
  let description;
  let apiKeyId;

  test('验证重置API-Key配额成功', async ({ page }) => {
    description = DOC.searchDescription + '_reset_' + Date.now();

    await test.step('前置：创建带有限配额的API-Key（无限配额=否）', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.createApiKeyWithQuotaViaUI(page, description, {
        total: 1000,
        unit: 'total_token',
        resetCycle: '永不重置',
      });
      await utils.ensureApiKeyRowVisible(page, description);
      // API 列表可能有短暂同步延迟，重试查找
      let apiKey = null;
      for (let i = 0; i < 5; i++) {
        apiKey = await utils.findApiKeyByDescriptionViaApi(page, description);
        if (apiKey) break;
        await page.waitForTimeout(1000);
      }
      apiKeyId = apiKey ? apiKey.id : null;
      if (apiKeyId) {
        cleanup.trackApiKeyId(apiKeyId);
      }
    });

    await test.step('1. 在详情页点击"重置配额"按钮', async () => {
      await utils.openApiKeyDetail(page, description);
      await utils.clickResetApiKeyQuotaBtn(page);
    });

    await test.step('2. 验证空配额总量校验', async () => {
      await utils.expectResetQuotaDrawerOpen(page);
      await utils.clearResetQuotaTotal(page);
      await utils.submitResetQuotaForm(page);
      await expect(page.getByText(DOC.quotaTotalRequiredMsg)).toBeVisible();
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

// ==================== EM-K-15b API-Key搜索-按Key值 ====================

apiKeyDescribe('API-Key管理 - EM-K-15b API-Key搜索-按Key值', (cleanup) => {
  let description;
  let apiKeyId;
  let keyValue;

  test('验证按Key值搜索API-Key功能', async ({ page }) => {
    description = DOC.searchDescription + '_key_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
      });
      apiKeyId = apiKey.id;
      // API 返回的 Key 值字段名可能是 api_key / key / secret_key
      keyValue =
        apiKey.api_key || apiKey.key || apiKey.secret_key || apiKey.apiKey;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 在Key值搜索框中输入Key值的一部分', async () => {
      await utils.searchApiKeyByKeyValue(page, keyValue.slice(0, 10));
      await utils.expectApiKeyVisibleInAllPages(page, description);
    });

    await test.step('2. 清空搜索框，观察列表恢复', async () => {
      await utils.searchApiKeyByKeyValue(page, '');
      await expect(
        page.locator('.show-iView-Table .ivu-table tbody tr').first(),
      ).toBeVisible();
    });
  });
});

// ==================== EM-K-15c API-Key筛选-按限流状态 ====================

apiKeyDescribe('API-Key管理 - EM-K-15c API-Key筛选-按限流状态', (cleanup) => {
  let description;
  let apiKeyId;

  test('验证按限流状态筛选API-Key功能', async ({ page }) => {
    description = DOC.searchDescription + '_ratelimit_' + Date.now();

    await test.step('前置：创建启用限流的API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      // 使用 UI 创建启用限流的 API-Key
      await utils.openAddApiKeyDrawer(page);
      await utils.setupApiKeyCreateWithRateLimit(page, description);
      await utils.submitApiKeyFormAndWaitForSuccess(page);
      // 通过 API 获取 API-Key ID 用于清理
      const apiKey = await utils.findApiKeyByDescriptionViaApi(
        page,
        description,
      );
      if (apiKey?.id) {
        apiKeyId = apiKey.id;
        cleanup.trackApiKeyId(apiKeyId);
      }
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('1. 选择限流状态筛选「已启用」', async () => {
      await utils.filterApiKeyByRateLimitStatus(page, '已启用');
      await utils.expectApiKeyVisibleInAllPages(page, description);
    });

    await test.step('2. 清除筛选，观察列表恢复', async () => {
      await utils.filterApiKeyByRateLimitStatus(page, '全部');
      await expect(
        page.locator('.show-iView-Table .ivu-table tbody tr').first(),
      ).toBeVisible();
    });
  });
});

apiKeyDescribe('Entity 管理 - EM-K-15d 按 Key ID 搜索', (cleanup) => {
  let description;
  let apiKeyId;

  test('EM-K-15d 按 Key ID 搜索 API-Key', async ({ page }) => {
    description = DOC.searchDescription + '_' + Date.now();

    await test.step('前置：创建测试API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
        description,
      });
      apiKeyId = apiKey.id;
      cleanup.trackApiKeyId(apiKeyId);
      await utils.reloadApiKeyManagementPage(page);
    });

    await test.step('按 Key ID 精确搜索', async () => {
      await utils.searchApiKeyByKeyId(page, apiKeyId);
    });

    await test.step('验证搜索结果包含目标 API-Key', async () => {
      await utils.ensureApiKeyRowVisible(page, description);
    });

    await test.step('使用不存在的 Key ID 搜索，验证列表不包含目标 API-Key', async () => {
      await utils.searchApiKeyByKeyId(page, 'nonexistent-id-xyz');
      await utils.expectApiKeyNotVisible(page, description);
    });

    await test.step('清空 Key ID 搜索框，恢复列表', async () => {
      await utils.searchApiKeyByKeyId(page, '');
    });
  });
});

apiKeyDescribe(
  'Entity 管理 - EM-K-17b 通过 clearable 清除挂载 Entity',
  (cleanup) => {
    let description;
    let apiKeyId;
    let entityName;
    let typeName;

    test('EM-K-17b 通过 clearable 清除挂载 Entity', async ({ page }) => {
      description = DOC.withEntity.description + '_clear_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity和挂载Entity的API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApiAndRefresh(
          page,
          typeName,
          'clearable测试类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
        });
        cleanup.trackEntityName(entityName);
        await utils.gotoApiKeyManagementPage(page);
        const apiKey = await utils.createApiKeyViaApiAndAssert(page, {
          description,
          enabled: true,
          entity_name: entityName,
        });
        apiKeyId = apiKey.id;
        cleanup.trackApiKeyId(apiKeyId);
        await utils.reloadApiKeyManagementPage(page);
        await utils.ensureApiKeyRowVisible(page, description);
      });

      await test.step('打开编辑抽屉', async () => {
        await utils.openEditApiKeyDrawer(page, description);
      });

      await test.step('使用 clearable 清除挂载 Entity', async () => {
        await utils.clearApiKeyEntity(page, utils.DRAWER_TITLE.editApiKey);
      });

      await test.step('提交修改', async () => {
        await utils.submitApiKeyFormAndWaitForEditSuccess(page);
      });

      await test.step('验证列表中挂载 Entity 显示为空或 "-"', async () => {
        await utils.ensureApiKeyRowVisible(page, description);
        const row = utils.apiKeyTable(page).rowByText(description);
        // 列顺序：0-Key ID, 1-Key值, 2-描述, 3-状态, 4-配额类型, 5-配额, 6-限流状态, 7-挂载Entity, 8-操作
        const entityCell = row.locator('td').nth(7);
        const entityText = (await entityCell.innerText()).trim();
        const isEmpty = entityText === '-' || entityText === '';
        expect(isEmpty).toBe(true);
      });
    });
  },
);
