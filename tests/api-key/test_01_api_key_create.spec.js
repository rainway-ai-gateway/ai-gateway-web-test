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

test.describe('API-Key管理 - EM-K-01 API-Key列表展示', () => {
  test('验证API-Key列表页面正确渲染', async ({ page }) => {
    const cleanup = utils.createApiKeyTestCleanup();

    await test.step('前置：接口创建一条测试API-Key，保证列表存在数据行', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const apiKey = await utils.createApiKeyViaApi(page, {
        description: DOC.createSuccess.description + '_layout_' + Date.now(),
        enabled: true,
        quota_plan: { unlimited: true },
      });
      expect(apiKey, '前置接口创建 API-Key 失败').not.toBeNull();
      cleanup.trackApiKeyId(apiKey.id);
      await page.reload();
      await utils.gotoApiKeyManagementPage(page);
    });

    await test.step('进入API-Key管理页面', async () => {
      await utils.gotoApiKeyManagementPage(page);
    });

    await test.step('验证页面布局', async () => {
      await utils.expectApiKeyPageLayout(page);
      // 验证 Key ID 列存在（表头含排序图标字符，不能锚定全文匹配）
      await expect(
        page
          .locator('th')
          .filter({ hasText: /Key ID/ })
          .first(),
      ).toBeVisible();
      // 验证操作列有"管理路由规则"按钮
      // 注意：不能使用 page.locator('tbody tr').first()，
      // 页面首个 tbody 是列头搜索行（.searchTable），需定位数据表格行；
      // 也不能按刚创建的描述过滤，列表分页（20条/页）时新建行可能不在首页
      const firstRow = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .first();
      await expect(
        firstRow.getByRole('button', { name: '管理路由规则' }),
      ).toBeVisible();
    });

    await test.step('清理测试数据', async () => {
      await cleanup.cleanup(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-02 创建API-Key-成功', () => {
  let description;

  test('验证创建API-Key成功', async ({ page }) => {
    description = DOC.createSuccess.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述并提交', async () => {
      await utils.fillApiKeyDescription(page, description);
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证创建成功', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-03 创建API-Key-必填校验', () => {
  test('验证描述必填校验', async ({ page }) => {
    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 保持描述为空', async () => {
      await utils.fillApiKeyDescription(page, '');
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
    });

    await test.step('4. 观察校验提示', async () => {
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyFormFieldError(
        page,
        '描述',
        DOC.descriptionRequiredMsg,
      );
    });

    await test.step('关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-04 创建API-Key-带配额计划', () => {
  let description;

  test('验证创建带配额计划的API-Key成功', async ({ page }) => {
    description = DOC.withQuota.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述', async () => {
      await utils.fillApiKeyDescription(page, description);
    });

    await test.step('3. 配置配额计划', async () => {
      await utils.fillApiKeyBasicForm(page, {
        unlimitedQuota: false,
        quotaTotal: DOC.withQuota.quotaTotal,
        quotaUnit: DOC.withQuota.quotaUnit,
        resetCycle: DOC.withQuota.resetCycle,
      });
    });

    await test.step('4. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证列表显示配额信息', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
      await utils.expectApiKeyRowContainsText(
        page,
        description,
        DOC.limitedQuotaLabel,
      );
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-05 创建API-Key-带限流策略', () => {
  let description;

  test('验证创建带限流策略的API-Key成功', async ({ page }) => {
    description = DOC.withRateLimit.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述', async () => {
      await utils.fillApiKeyDescription(page, description);
    });

    await test.step('3. 配置限流策略', async () => {
      await utils.fillApiKeyRateLimitForm(page, {
        enable: true,
        tpm: DOC.withRateLimit.tpm,
        rpm: DOC.withRateLimit.rpm,
        maxConcurrency: DOC.withRateLimit.maxConcurrency,
      });
    });

    await test.step('4. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证限流状态显示已启用', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
      await utils.expectApiKeyRowContainsText(page, description, '已启用');
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-06 创建API-Key-挂载Entity', () => {
  let description;
  let entityName;
  let typeName;
  let entityId;

  test('验证创建挂载Entity的API-Key成功', async ({ page }) => {
    description = DOC.withEntity.description + '_' + Date.now();
    entityName = await utils.generateTestEntityName();
    typeName = await utils.generateTestEntityTypeName();

    await test.step('前置：创建Entity', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaApiAndRefresh(
        page,
        typeName,
        '挂载API-Key类型',
        1,
      );
      const entityData = await utils.createEntityWithTypeViaApi(
        page,
        entityName,
        typeName,
      );
      entityId = entityData.id;
      await utils.gotoApiKeyManagementPage(page);
    });

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述并选择挂载Entity', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyEntity(page, entityName);
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证挂载Entity列显示Entity名称', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
      await utils.expectApiKeyRowContainsText(page, description, entityName);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
      await utils.deleteEntityViaApi(page, entityId);
      await utils.deleteEntityTypeViaApi(page, typeName);
    });
  });
});

test.describe('API-Key管理 - EM-K-07 创建API-Key-不挂载Entity', () => {
  let description;

  test('验证创建不挂载Entity的API-Key成功', async ({ page }) => {
    description = DOC.withoutEntity.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述，挂载Entity保持为空', async () => {
      await utils.fillApiKeyDescription(page, description);
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证挂载Entity列为空或显示"-"', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-08 创建API-Key-无限配额', () => {
  let description;

  test('验证创建无限配额的API-Key成功', async ({ page }) => {
    description = DOC.unlimited.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述并选择无限配额', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '是');
    });

    await test.step('3. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证配额类型列显示无限配额', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
      await utils.expectApiKeyRowContainsText(page, description, '无限配额');
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-09 创建API-Key表单默认值', () => {
  test('验证创建API-Key表单默认值', async ({ page }) => {
    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 观察弹窗显示并检查默认值', async () => {
      await utils.expectAddApiKeyDrawerOpen(page);
      const drawer = page
        .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
        .filter({ hasText: '创建 API-Key' })
        .first();
      await expect(drawer.getByText('描述').first()).toBeVisible();
      await expect(
        drawer.locator('input[type="checkbox"]').first(),
      ).toBeChecked();
      await utils.expectApiKeyFormSelectValue(page, '启用状态', '启用');
      await utils.expectApiKeyFormSelectValue(page, '执行配额检查', '是');
      await utils.expectApiKeyAllowedModelDefault(page, '全部模型');
      await expect(drawer.getByPlaceholder('默认"*"表示不限制')).toHaveValue(
        '*',
      );
      await utils.expectApiKeyFormSelectValue(page, '无限配额', '是');
      await utils.expectApiKeyFormSelectValue(page, '启用限流', '否');
      await expect(drawer.getByRole('button', { name: '提交' })).toBeVisible();
      await expect(drawer.getByRole('button', { name: '取消' })).toBeVisible();
    });

    await test.step('关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-10 创建API-Key-过期时间校验', () => {
  let description;

  test('验证过期时间校验', async ({ page }) => {
    description = DOC.expired.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述并取消永不过期', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyExpiryLimited(page);
    });

    await test.step('3. 不选择过期时间直接提交', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
    });

    await test.step('4. 验证错误提示', async () => {
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyFormInlineError(
        page,
        '过期时间',
        DOC.expiryRequiredMsg,
      );
    });

    await test.step('5. 选择过期时间并重新提交', async () => {
      await utils.selectApiKeyExpiryForever(page);
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证创建成功', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-11 创建API-Key-允许子网校验', () => {
  let description;

  test('验证允许子网校验', async ({ page }) => {
    description = DOC.subnet.description + '_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入描述', async () => {
      await utils.fillApiKeyDescription(page, description);
    });

    await test.step('3. 输入重复CIDR并提交', async () => {
      await utils.fillApiKeyAllowedSubnets(page, DOC.subnet.duplicate);
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
    });

    await test.step('4. 验证重复错误提示', async () => {
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyFormInlineError(
        page,
        '允许子网',
        DOC.subnetDuplicateMsg,
      );
    });

    await test.step('5. 清除输入框，输入包含关系的CIDR', async () => {
      await utils.fillApiKeyAllowedSubnets(page, DOC.subnet.contained);
    });

    await test.step('6. 点击"提交"按钮', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
    });

    await test.step('7. 验证包含关系错误提示', async () => {
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyFormInlineError(
        page,
        '允许子网',
        DOC.subnetContainedMsg,
      );
    });

    await test.step('8. 清除输入框，输入不重复且无包含关系的CIDR', async () => {
      await utils.fillApiKeyAllowedSubnets(page, DOC.subnet.valid);
    });

    await test.step('9. 点击"提交"按钮', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });

    await test.step('验证创建成功', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-24 创建API-Key-限流至少配置一项', () => {
  let description;

  test('验证启用限流时至少配置一项', async ({ page }) => {
    description = DOC.createSuccess.description + '_rl_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 填写描述并启用限流（不配置规则）', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyEnableRateLimit(page, '是');
      // 默认 max_concurrency=-1 会被当成已配置；清空为 null 后点提交才会挂行内 tip
      await utils.prepareApiKeyRateLimitRequiredState(page);
    });

    await test.step('3. 提交并验证被拦截', async () => {
      await utils.submitApiKeyFormExpectRateLimitError(
        page,
        utils.DOC_API_KEY.rateLimitRuleRequiredMsg,
      );
      await utils.expectAddApiKeyDrawerOpen(page);
    });

    await test.step('4. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-25 创建API-Key-TPM时间窗口边界', () => {
  let description;

  test('验证 TPM 时间窗口 0 触发边界校验', async ({ page }) => {
    description = DOC.createSuccess.description + '_tpm_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 填写描述，启用限流并添加非法 TPM 规则', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.fillApiKeyRateLimitForm(page, {
        enable: true,
        tpm: { name: 'tpm_invalid', window: 0, maxTokens: 100 },
      });
    });

    await test.step('3. 提交并验证错误提示', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectDrawerFormErrorContains(
        page,
        utils.formatRuleValidationMsg(
          DOC.tpmWindowMinutesInvalidMsgTemplate,
          1,
        ),
        '创建 API-Key',
      );
    });

    await test.step('4. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-26 创建API-Key-有限配额总量必填', () => {
  let description;

  test('验证无限配额=否时配额总量必填', async ({ page }) => {
    description = DOC.createSuccess.description + '_quota_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 填写描述，选择有限配额但不填总量', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.clearApiKeyQuotaTotal(page);
    });

    await test.step('3. 提交并验证错误提示', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyQuotaTotalRequired(page);
    });

    await test.step('4. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-27 创建API-Key-配额总量小数校验', () => {
  let description;

  test('验证无限配额=否时配额总量不可为小数', async ({ page }) => {
    description = DOC.createSuccess.description + '_decimal_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 填写描述并输入小数配额总量', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.fillApiKeyQuotaTotalAndBlur(page, DOC.quotaDecimal);
    });

    await test.step('5. 提交并验证错误提示', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyQuotaIntegerError(page);
    });

    await test.step('6. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-28 创建API-Key-配额总量上界校验', () => {
  let description;

  test('验证无限配额=否时配额总量不可超过 int64 上界', async ({ page }) => {
    description = DOC.createSuccess.description + '_max_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 填写描述并输入超上界配额总量', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.fillApiKeyQuotaTotalAndBlur(page, DOC.quotaOverMax);
    });

    await test.step('5. 提交并验证错误提示', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyQuotaMaxError(page);
    });

    await test.step('6. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-29 创建API-Key-描述长度边界', () => {
  test('验证描述超过 512 字符触发校验', async ({ page }) => {
    const overLengthDescription = utils.makeStringOfLength(
      DOC.descriptionMaxLength + 1,
    );

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 输入超过 512 字符的描述', async () => {
      await utils.fillApiKeyDescriptionRaw(page, overLengthDescription);
    });

    await test.step('3. 提交并验证错误提示', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyDescriptionLengthError(page);
    });

    await test.step('4. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-31 创建API-Key-最大并发上界校验', () => {
  let description;

  test('验证启用限流时最大并发不可超过 int32 上界', async ({ page }) => {
    description =
      DOC.createSuccess.description + '_concurrency_max_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 填写描述，启用限流并输入超上界最大并发', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyEnableRateLimit(page, '是');
      await utils.fillApiKeyMaxConcurrencyAndBlur(
        page,
        DOC.maxConcurrencyOverMax,
      );
    });

    await test.step('5. 提交并验证错误提示', async () => {
      await utils.submitApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyMaxConcurrencyMaxError(page);
    });

    await test.step('6. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-12 创建API-Key-取消操作', () => {
  let description;

  test('验证取消创建API-Key不刷新列表', async ({ page }) => {
    description = DOC.createSuccess.description + '_cancel_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2. 填写API-Key信息', async () => {
      await utils.fillApiKeyDescription(page, description);
    });

    await test.step('3. 点击"取消"按钮', async () => {
      await utils.cancelApiKeyForm(page);
      await utils.waitAfterApiKeyAction(page, 500);
    });

    await test.step('验证取消操作，列表不刷新', async () => {
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyNotVisible(page, description);
    });
  });
});

test.describe('Entity 管理 - EM-K-18b API-Key 管理路由规则按钮跳转', () => {
  test('EM-K-18b 管理路由规则按钮跳转', async ({ page }) => {
    // TODO: 前置需要已创建的 API-Key
    // 点击"管理路由规则"按钮
    // 验证跳转到路由规则页面
    // 验证 URL 包含 type='api_key' 和 owner=Key ID
  });
});

// ── 2026-08-16 UI 变更：unit=RMB 配额规则（小数/4位小数/9000万上限）──

test.describe('API-Key管理 - EM-K-52 创建API-Key-RMB配额小数校验', () => {
  let description;

  test('验证RMB单位下配额总量允许小数（最多4位）', async ({ page }) => {
    description = DOC.createSuccess.description + '_rmb_dec_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 填写描述，选择RMB并输入小数配额总量', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.selectApiKeyQuotaUnit(page, 'RMB');
      await utils.fillApiKeyQuotaTotal(page, 100.56);
    });

    await test.step('5. 提交并验证创建成功', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-53 创建API-Key-RMB配额4位小数边界', () => {
  let description;

  test('验证4位小数合法、5位小数被拦截', async ({ page }) => {
    description = DOC.createSuccess.description + '_rmb_prec_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('5-6. 4位小数配额提交成功', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.selectApiKeyQuotaUnit(page, 'RMB');
      await utils.fillApiKeyQuotaTotal(page, 100.1234);
      await utils.submitApiKeyFormAndWaitForSuccess(page);
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('7-8. 5位小数写模型触发精度校验', async () => {
      // InputNumber :precision=4 界面截断，自动化经 Vue 模型注入
      const overPrecisionDescription =
        DOC.createSuccess.description + '_rmb_prec_over_' + Date.now();
      await utils.openAddApiKeyDrawer(page);
      await utils.fillApiKeyDescription(page, overPrecisionDescription);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.selectApiKeyQuotaUnit(page, 'RMB');
      await utils.setApiKeyQuotaTotalModel(page, 100.12345);
      await utils.expectApiKeyQuotaRmbPrecisionError(page);
      await utils.expectAddApiKeyDrawerOpen(page);
    });

    await test.step('9. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-54 创建API-Key-total_token配额必须整数', () => {
  let description;

  test('验证total_token单位下配额总量不可为小数', async ({ page }) => {
    description = DOC.createSuccess.description + '_int_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 选择total_token并写入小数配额总量', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.selectApiKeyQuotaUnit(page, 'total_token');
      await utils.setApiKeyQuotaTotalModel(page, DOC.quotaDecimal);
      await utils.expectApiKeyQuotaIntegerError(page);
    });

    await test.step('5. 再次触发校验并确认 tip 仍在', async () => {
      await utils.setApiKeyQuotaTotalModel(page, DOC.quotaDecimal);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyQuotaIntegerError(page);
    });

    await test.step('6. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-57 创建API-Key-RMB配额总量9000万上界校验', () => {
  let description;

  test('验证RMB配额总量不可超过9000万元', async ({ page }) => {
    description = DOC.createSuccess.description + '_rmb_max_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 选择RMB并写入超过9000万元的配额总量', async () => {
      // InputNumber :max=90000000 会钳制界面输入，自动化经 Vue 模型注入
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.selectApiKeyQuotaUnit(page, 'RMB');
      await utils.setApiKeyQuotaTotalModel(page, DOC.quotaRmbOverMax);
      await utils.expectApiKeyQuotaRmbMaxError(page);
    });

    await test.step('5. 再次触发校验并确认 tip 仍在', async () => {
      await utils.setApiKeyQuotaTotalModel(page, DOC.quotaRmbOverMax);
      await utils.expectAddApiKeyDrawerOpen(page);
      await utils.expectApiKeyQuotaRmbMaxError(page);
    });

    await test.step('6. 关闭抽屉', async () => {
      await utils.cancelApiKeyForm(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-58 创建API-Key-RMB配额总量9000万边界值合法', () => {
  let description;

  test('验证9000万元边界值可正常创建', async ({ page }) => {
    description = DOC.createSuccess.description + '_rmb_edge_' + Date.now();

    await test.step('1. 点击"添加"按钮', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.openAddApiKeyDrawer(page);
    });

    await test.step('2-4. 选择RMB并输入边界值90000000.00', async () => {
      await utils.fillApiKeyDescription(page, description);
      await utils.selectApiKeyUnlimitedQuota(page, '否');
      await utils.selectApiKeyQuotaUnit(page, 'RMB');
      await utils.fillApiKeyQuotaTotal(page, DOC.quotaRmbMax);
    });

    await test.step('5. 提交并验证创建成功', async () => {
      await utils.submitApiKeyFormAndWaitForSuccess(page);
      await utils.expectAddApiKeyDrawerHidden(page);
      await utils.searchApiKeyByDescription(page, description);
      await utils.expectApiKeyVisible(page, description);
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-60 编辑API-Key-RMB配额总量9000万上界校验', () => {
  let description;

  test('验证编辑表单中RMB配额上限同样生效', async ({ page }) => {
    description = DOC.createSuccess.description + '_rmb_edit_' + Date.now();

    await test.step('前置：创建 unit=RMB 的API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.createApiKeyWithQuotaViaUI(page, description, {
        total: 100,
        unit: 'RMB',
      });
      await utils.ensureApiKeyRowVisible(page, description);
    });

    await test.step('1. 打开编辑抽屉', async () => {
      await utils.openEditApiKeyDrawer(page, description);
    });

    await test.step('2-4. 写入超过9000万元的配额总量并触发校验', async () => {
      await utils.setApiKeyQuotaTotalModel(
        page,
        DOC.quotaRmbOverMax,
        utils.DRAWER_TITLE.editApiKey,
      );
      await utils.expectApiKeyQuotaRmbMaxError(
        page,
        utils.DRAWER_TITLE.editApiKey,
      );
    });

    await test.step('5. 修改为边界值提交成功', async () => {
      await utils.setApiKeyQuotaTotalModel(
        page,
        DOC.quotaRmbMax,
        utils.DRAWER_TITLE.editApiKey,
      );
      await utils.submitApiKeyFormAndWaitForEditSuccess(page);
      await expect(
        utils.ivuDrawer(page).withTitle(utils.DRAWER_TITLE.editApiKey),
      ).toBeHidden({ timeout: 10000 });
    });

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});

test.describe('API-Key管理 - EM-K-59 重置配额弹窗-unit=RMB-9000万上界校验', () => {
  let description;

  test('验证重置配额弹窗中RMB配额上限同样生效', async ({ page }) => {
    description = DOC.createSuccess.description + '_rmb_reset_' + Date.now();

    await test.step('前置：创建 unit=RMB 的API-Key', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.createApiKeyWithQuotaViaUI(page, description, {
        total: 100,
        unit: 'RMB',
      });
      await utils.ensureApiKeyRowVisible(page, description);
    });

    await test.step('1. 打开详情并点击"重置配额"按钮', async () => {
      await utils.openApiKeyDetail(page, description);
      await utils.clickResetApiKeyQuotaBtn(page);
    });

    await test.step('2. 确认详情配额为RMB格式、重置弹窗已打开', async () => {
      // 弹窗本身不展示单位文本，详情抽屉"配额总量"行 RMB 时带 ¥ 前缀（驱动弹窗 RMB 上限行为）
      await utils.expectApiKeyDetailQuotaRmb(page);
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

    await test.step('清理测试数据', async () => {
      await utils.searchApiKeyByDescription(page, description);
      const row = page
        .locator('.show-iView-Table .ivu-table tbody tr')
        .filter({ hasText: description })
        .first();
      const apiKeyId = await row.getAttribute('data-row-key');
      if (apiKeyId) {
        await utils.deleteApiKeyViaApi(page, apiKeyId);
      }
    });
  });
});
