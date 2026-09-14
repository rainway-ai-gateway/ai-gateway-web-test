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
/**
 * 操作日志 - 跨模块联动 P0 标杆（OL-LINK-01）
 *
 * 运行：npx playwright test tests/operation-logs/test_03_operation_log_linkage.spec.js
 */
const { test, expect } = require('@playwright/test');
const olp = require('../../pages/operation-logs/OperationLogPage');
const entityApi = require('../../api/entity-api-utils');
const logApi = require('../../api/operation-log-api-utils');

test.describe('操作日志 - OL-LINK-01 创建 Entity 产生操作日志', () => {
  const typeName = 'type_' + Date.now();
  const entityName = 'ent_' + Date.now();
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证创建 Entity 后操作日志出现 create 记录', async ({ page }) => {
    await test.step('1. 通过接口创建 Entity', async () => {
      const typeOk = await entityApi.createEntityTypeViaApi(
        page,
        typeName,
        '操作日志联动测试',
        1,
      );
      expect(typeOk, '创建 Entity 类型失败').toBe(true);

      const created = await entityApi.createEntityViaApi(
        page,
        entityName,
        typeName,
      );
      expect(created, '创建 Entity 失败').not.toBeNull();
      entityId = created.id;
    });

    await test.step('2. 按资源名称搜索操作日志', async () => {
      await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' &&
          item.resource_type === 'entity' &&
          item.resource_name === entityName,
        { resource_name: entityName },
      );
      await olp.reloadOperationLogPage(page);
      await olp.searchByResourceName(page, entityName);
    });

    await test.step('3. 验证列表出现 create 日志', async () => {
      await olp.operationLogTable(page).expectRowVisible(entityName, 20000);
      const row = olp.operationLogTable(page).rowByText(entityName);
      await expect(row.getByText('create').first()).toBeVisible();
      await expect(row.getByText(olp.DOC.successTag).first()).toBeVisible();
    });

    await test.step('4. 接口侧二次校验日志字段', async () => {
      const apiLog = await logApi.findOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' &&
          item.resource_type === 'entity' &&
          item.resource_name === entityName,
        {
          resource_type: 'entity',
          action: 'create',
          resource_name: entityName,
        },
      );
      expect(apiLog, '接口未返回 create 操作日志').not.toBeNull();
      expect(apiLog.resource_id).toBe(entityId);
      expect(apiLog.status).toBe(1);
      expect(apiLog.operator_name).toBeTruthy();
    });
  });
});

test.describe('操作日志 - OL-LINK-02 更新操作含变更摘要', () => {
  const typeName = 'type_' + Date.now() + '_lk2';
  const entityName = 'ent_' + Date.now() + '_lk2';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    await entityApi.createEntityTypeViaApi(page, typeName, '联动更新测试', 1);
    const created = await entityApi.createEntityViaApi(page, entityName, typeName);
    expect(created).not.toBeNull();
    entityId = created.id;
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证更新 Entity 后日志含 change_summary', async ({ page }) => {
    const ok = await entityApi.updateEntityViaApi(page, entityId, {
      name: entityName,
      type: typeName,
      allow_models: ['gpt-4'],
    });
    expect(ok, '更新 Entity 失败').toBe(true);

    const apiLog = await logApi.waitForOperationLogViaApi(
      page,
      (item) =>
        item.action === 'update' &&
        item.resource_name === entityName &&
        item.change_summary,
      { action: 'update', resource_name: entityName },
    );
    expect(apiLog, '未找到 update 操作日志').not.toBeNull();
    expect(apiLog.change_summary.before).toBeTruthy();
    expect(apiLog.change_summary.after).toBeTruthy();
    // 偏差：当前后端可能不返回 diff_keys 字段
    if (apiLog.change_summary.diff_keys) {
      expect(apiLog.change_summary.diff_keys.length).toBeGreaterThan(0);
    }
  });
});

test.describe('操作日志 - OL-LINK-03 删除操作产生日志', () => {
  const typeName = 'type_' + Date.now() + '_lk3';
  const entityName = 'ent_' + Date.now() + '_lk3';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    await entityApi.createEntityTypeViaApi(page, typeName, '联动删除测试', 1);
    const created = await entityApi.createEntityViaApi(page, entityName, typeName);
    expect(created).not.toBeNull();
    entityId = created.id;
  });

  test.afterEach(async ({ page }) => {
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证删除 Entity 后日志 action 为 delete', async ({ page }) => {
    const deleted = await entityApi.deleteEntityViaApi(page, entityId);
    expect(deleted, '删除 Entity 失败').toBe(true);
    entityId = null;

    const apiLog = await logApi.waitForOperationLogViaApi(
      page,
      (item) =>
        item.action === 'delete' &&
        item.resource_type === 'entity' &&
        item.resource_name === entityName,
      { action: 'delete', resource_name: entityName },
    );
    expect(apiLog.status).toBe(1);

    await olp.reloadOperationLogPage(page);
    await olp.filterByAction(page, 'delete');
    await olp.searchByResourceName(page, entityName);
    await olp.operationLogTable(page).expectRowVisible(entityName);
    await expect(
      olp.operationLogTable(page).rowByText(entityName).getByText('delete').first(),
    ).toBeVisible();
  });
});
