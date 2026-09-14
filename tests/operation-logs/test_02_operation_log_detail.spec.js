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
 * 操作日志 - 详情页（OL-D-01 ~ OL-D-05）
 *
 * 运行：npx playwright test tests/operation-logs/test_02_operation_log_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const olp = require('../../pages/operation-logs/OperationLogPage');
const entityApi = require('../../api/entity-api-utils');
const logApi = require('../../api/operation-log-api-utils');

test.describe('操作日志 - OL-D-01 打开详情 Drawer', () => {
  test('验证点击详情打开右侧 Drawer', async ({ page }) => {
    await test.step('进入操作日志列表页', async () => {
      await olp.gotoOperationLogPage(page);
    });

    await test.step('打开第一条日志详情', async () => {
      const row = olp.operationLogTable(page).dataRows().first();
      const count = await row.count();
      if (count === 0) {
        test.skip(true, '当前环境无操作日志数据，跳过详情打开用例');
      }
      await row.getByRole('button', { name: olp.DOC.detailButton }).click();
      await olp.expectDetailDrawerOpen(page);
    });

    await test.step('关闭详情 Drawer', async () => {
      await olp.closeDetailDrawer(page);
    });
  });
});

test.describe('操作日志 - OL-D-02 详情字段完整性与接口数据一致', () => {
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

  test('验证详情字段与接口返回一致', async ({ page }) => {
    let apiLog;

    await test.step('前置：创建 Entity 产生操作日志', async () => {
      await entityApi.createEntityTypeViaApi(page, typeName, '操作日志详情测试', 1);
      const created = await entityApi.createEntityViaApi(page, entityName, typeName);
      expect(created, '接口创建 Entity 失败').not.toBeNull();
      entityId = created.id;

      apiLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' &&
          item.resource_type === 'entity' &&
          item.resource_name === entityName,
        { resource_type: 'entity', action: 'create', resource_name: entityName },
      );
      expect(apiLog, '未找到 create 操作日志').not.toBeNull();
    });

    await test.step('筛选并打开对应日志详情', async () => {
      await olp.reloadOperationLogPage(page);
      await olp.searchByResourceName(page, entityName);
      await olp.openDetailByRowText(page, entityName);
      await olp.expectDetailDrawerOpen(page);
    });

    await test.step('验证详情字段与接口数据一致', async () => {
      await olp.expectDetailFieldContains(
        page,
        '操作者类型',
        olp.operatorTypeLabel(apiLog.operator_type),
      );
      await olp.expectDetailFieldContains(page, '操作人', apiLog.operator_name);
      await olp.expectDetailFieldContains(page, '操作动作', apiLog.action);
      await olp.expectDetailFieldContains(page, '资源类型', apiLog.resource_type);
      await olp.expectDetailFieldContains(page, '资源ID', apiLog.resource_id);
      await olp.expectDetailFieldContains(page, '资源名称', apiLog.resource_name);
      await olp.expectDetailFieldContains(
        page,
        olp.DOC.resultLabel,
        apiLog.status === 1 ? olp.DOC.successTag : olp.DOC.failedTag,
      );
      await olp.expectDetailFieldContains(
        page,
        '请求路径',
        apiLog.request_path || '-',
      );
      await olp.expectDetailFieldContains(
        page,
        '请求方式',
        apiLog.request_method || '-',
      );
      await olp.expectDetailFieldContains(page, '客户端IP', apiLog.client_ip || '-');
      await olp.expectDetailFieldContains(
        page,
        '操作时间',
        olp.formatTimestamp(apiLog.created_at),
      );

      const drawer = olp.detailDrawer(page);
      for (const hidden of ['id', 'log_id', 'operator_id']) {
        await expect(drawer.getByText(hidden, { exact: true })).toHaveCount(0);
      }
      if (!apiLog.error_msg) {
        await olp.expectDetailFieldNotVisible(page, '错误信息');
      }
    });
  });
});

test.describe('操作日志 - OL-D-03 变更摘要可折叠 JSON', () => {
  const typeName = 'type_' + Date.now() + '_d3';
  const entityName = 'ent_' + Date.now() + '_d3';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    await entityApi.createEntityTypeViaApi(page, typeName, '变更摘要测试', 1);
    const created = await entityApi.createEntityViaApi(page, entityName, typeName);
    expect(created).not.toBeNull();
    entityId = created.id;
    await entityApi.updateEntityViaApi(page, entityId, {
      name: entityName,
      type: typeName,
      allow_models: ['gpt-4', 'gpt-4o'],
    });
    await logApi.waitForOperationLogViaApi(
      page,
      (item) =>
        item.action === 'update' &&
        item.resource_name === entityName &&
        item.change_summary,
      { action: 'update', resource_name: entityName },
    );
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证 update 日志展示变更摘要 JSON 区块', async ({ page }) => {
    await olp.reloadOperationLogPage(page);
    await olp.filterByAction(page, 'update');
    await olp.searchByResourceName(page, entityName);
    await olp.openDetailByRowText(page, entityName);
    await olp.expectDetailDrawerOpen(page);
    await olp.expectChangeSummaryVisible(page);
    const drawer = olp.detailDrawer(page);
    const afterSection = drawer
      .locator('.summary-section')
      .filter({ hasText: olp.DOC.after })
      .first();
    await expect(afterSection.locator('.json-viewer-wrap')).toContainText('gpt-4');
    // 偏差：当前后端 change_summary 可能不含 diff_keys，UI 展示为「-」
    await expect(drawer.locator('.diff-keys')).toBeVisible();
  });
});

test.describe('操作日志 - OL-D-04 失败日志错误信息展示', () => {
  const typeName = 'type_' + Date.now();
  const entityName = 'ent_' + Date.now();
  let entityId;
  let clusterCleanup;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (clusterCleanup) {
      await clusterCleanup();
      clusterCleanup = null;
    }
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证失败日志展示错误信息，成功日志不展示错误信息区块', async ({
    page,
  }) => {
    let failedLog;
    let failedResourceName;

    await test.step('造数：获取或生成失败操作日志', async () => {
      failedLog = await logApi.findFailedOperationLogViaApi(page);
      if (!failedLog) {
        const seeded = await logApi.seedFailedClusterDeleteLog(page);
        failedLog = seeded.log;
        clusterCleanup = seeded.cleanup;
        failedResourceName = seeded.clusterName;
      } else {
        failedResourceName = failedLog.resource_name;
      }
      expect(failedLog, '未找到失败操作日志').not.toBeNull();
      expect(failedLog.error_msg, '失败日志应包含 error_msg').toBeTruthy();
    });

    await test.step('列表筛选失败并验证红色 Tag', async () => {
      await olp.reloadOperationLogPage(page);
      await olp.filterByStatus(page, olp.DOC.failedTag);
      await olp.searchByResourceName(page, failedResourceName);
      await olp.operationLogTable(page).expectRowVisible(failedResourceName);
      await olp.expectRowFailedTag(page, failedResourceName);
    });

    await test.step('详情展示失败结果与错误信息', async () => {
      await olp.openDetailByRowText(page, failedResourceName);
      await olp.expectDetailDrawerOpen(page);
      await olp.expectDetailFailedStatus(page);
      await olp.expectDetailErrorMsg(page, failedLog.error_msg);
      await olp.closeDetailDrawer(page);
    });

    await test.step('成功日志不展示错误信息区块', async () => {
      await entityApi.createEntityTypeViaApi(page, typeName, '成功日志对比', 1);
      const created = await entityApi.createEntityViaApi(
        page,
        entityName,
        typeName,
      );
      expect(created, '创建对比用成功 Entity 失败').not.toBeNull();
      entityId = created.id;

      await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' &&
          item.resource_name === entityName &&
          item.status === 1,
        { action: 'create', resource_name: entityName },
      );

      await olp.reloadOperationLogPage(page);
      await olp.filterByStatus(page, olp.DOC.successTag);
      await olp.searchByResourceName(page, entityName);
      const row = olp.operationLogTable(page).rowByText(entityName);
      await row.getByRole('button', { name: olp.DOC.detailButton }).click();
      await olp.expectDetailDrawerOpen(page);
      await olp.expectDetailFieldNotVisible(page, olp.DOC.errorMsgLabel);
      await olp.closeDetailDrawer(page);
    });
  });
});

test.describe('操作日志 - OL-D-05 关闭详情 Drawer', () => {
  test('验证遮罩与 X 按钮均可关闭 Drawer', async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    const row = olp.operationLogTable(page).dataRows().first();
    if ((await row.count()) === 0) {
      test.skip(true, '当前环境无操作日志数据');
    }

    await row.getByRole('button', { name: olp.DOC.detailButton }).click();
    await olp.expectDetailDrawerOpen(page);
    await olp.closeDetailDrawerByMask(page);

    await row.getByRole('button', { name: olp.DOC.detailButton }).click();
    await olp.expectDetailDrawerOpen(page);
    await olp.closeDetailDrawer(page);
  });
});
