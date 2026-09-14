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
 * 操作日志 - 列表页（OL-L-01 ~ OL-L-11）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/operation-logs/test_01_operation_log_list.spec.js
 */
const { test, expect } = require('@playwright/test');
const olp = require('../../pages/operation-logs/OperationLogPage');
const entityApi = require('../../api/entity-api-utils');
const logApi = require('../../api/operation-log-api-utils');

function parseQuery(url) {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

test.describe('操作日志 - OL-L-01 列表加载与服务端分页', () => {
  test('验证列表页加载、列头与服务端分页请求', async ({ page }) => {
    let listResponse;

    await test.step('进入操作日志列表页', async () => {
      listResponse = await olp.waitForOperationLogListResponse(page, () =>
        olp.gotoOperationLogPage(page),
      );
    });

    await test.step('验证页面布局与列头', async () => {
      await olp.expectPageLayout(page);
    });

    await test.step('验证首次列表请求携带 page=1、page_size=20', async () => {
      const query = parseQuery(listResponse.url());
      expect(query.page).toBe('1');
      expect(query.page_size).toBe('20');
    });

    await test.step('验证表格有数据行或空态', async () => {
      const rows = olp.operationLogTable(page).dataRows();
      const count = await rows.count();
      if (count > 0) {
        await expect(rows.first()).toBeVisible();
      } else {
        await expect(page.getByText('暂无数据').first()).toBeVisible();
      }
    });
  });
});

test.describe('操作日志 - OL-L-02 时间范围筛选', () => {
  test('验证时间筛选触发 start_time 与 end_time 查询参数', async ({ page }) => {
    await test.step('进入操作日志列表页', async () => {
      await olp.gotoOperationLogPage(page);
    });

    await test.step('设置时间范围并点击查询', async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const pad = (n) => (n < 10 ? '0' + n : String(n));
      const fmt = (d) =>
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        ' ' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes()) +
        ':' +
        pad(d.getSeconds());

      const response = await olp.queryWithTimeRange(
        page,
        fmt(start),
        fmt(now),
      );
      const query = parseQuery(response.url());
      expect(query.start_time, '应携带 start_time').toBeTruthy();
      expect(query.end_time, '应携带 end_time').toBeTruthy();
      expect(Number(query.start_time)).toBeLessThanOrEqual(
        Number(query.end_time),
      );
    });
  });
});

async function seedEntityCreateLog(page, typeName, entityName) {
  await entityApi.createEntityTypeViaApi(page, typeName, '操作日志列表测试', 1);
  const created = await entityApi.createEntityViaApi(page, entityName, typeName);
  expect(created, '接口创建 Entity 失败').not.toBeNull();
  await logApi.waitForOperationLogViaApi(
    page,
    (item) =>
      item.action === 'create' &&
      item.resource_type === 'entity' &&
      item.resource_name === entityName,
    { resource_name: entityName },
  );
  return created.id;
}

test.describe('操作日志 - OL-L-03 操作人模糊搜索', () => {
  const typeName = 'type_' + Date.now();
  const entityName = 'ent_' + Date.now();
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    entityId = await seedEntityCreateLog(page, typeName, entityName);
    await olp.reloadOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证操作人搜索携带 operator_name 参数', async ({ page }) => {
    const response = await olp.searchByOperatorName(page, 'admin');
    const query = parseQuery(response.url());
    expect(query.operator_name).toBe('admin');
    await olp.operationLogTable(page).expectRowVisible(entityName);
    await olp.clearSearchByOperatorName(page);
  });
});

test.describe('操作日志 - OL-L-04 操作动作筛选', () => {
  const typeName = 'type_' + Date.now() + '_l4';
  const entityName = 'ent_' + Date.now() + '_l4';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    entityId = await seedEntityCreateLog(page, typeName, entityName);
    await entityApi.updateEntityViaApi(page, entityId, {
      name: entityName,
      type: typeName,
      allow_models: ['gpt-4'],
    });
    await logApi.waitForOperationLogViaApi(
      page,
      (item) => item.action === 'update' && item.resource_name === entityName,
      { action: 'update', resource_name: entityName },
    );
    await olp.reloadOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证操作动作下拉与 update 筛选', async ({ page }) => {
    const options = await olp.getActionFilterOptions(page);
    expect(options).toEqual(
      expect.arrayContaining([
        'create',
        'update',
        'delete',
        'reset',
        'import',
        'bind',
        'unbind',
      ]),
    );

    const response = await olp.filterByAction(page, 'update');
    const query = parseQuery(response.url());
    expect(query.action).toBe('update');
    await olp.searchByResourceName(page, entityName);
    await olp.operationLogTable(page).expectRowVisible(entityName);
    await expect(
      olp.operationLogTable(page).rowByText(entityName).getByText('update').first(),
    ).toBeVisible();
  });
});

test.describe('操作日志 - OL-L-05 资源类型筛选', () => {
  const typeName = 'type_' + Date.now() + '_l5';
  const entityName = 'ent_' + Date.now() + '_l5';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    entityId = await seedEntityCreateLog(page, typeName, entityName);
    await olp.reloadOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证资源类型 entity 筛选', async ({ page }) => {
    const options = await olp.getResourceTypeFilterOptions(page);
    expect(options).toEqual([
      'entity',
      'entity_type',
      'api_key',
      'provider',
      'cluster',
      'route',
      'certificate',
      'quota_plan',
      'model_price',
      'user',
      'token',
    ]);
    expect(options).not.toEqual(
      expect.arrayContaining(['domain', 'rate_limit_policy']),
    );

    const response = await olp.filterByResourceType(page, 'entity');
    const query = parseQuery(response.url());
    expect(query.resource_type).toBe('entity');
    await olp.operationLogTable(page).expectRowVisible(entityName);
  });
});

test.describe('操作日志 - OL-L-06 资源名称模糊搜索', () => {
  const typeName = 'type_' + Date.now() + '_l6';
  const entityName = 'ent_' + Date.now() + '_l6';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    entityId = await seedEntityCreateLog(page, typeName, entityName);
    await olp.reloadOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证资源名称搜索携带 resource_name 参数', async ({ page }) => {
    const response = await olp.searchByResourceName(page, entityName);
    const query = parseQuery(response.url());
    expect(query.resource_name).toBe(entityName);
    await olp.operationLogTable(page).expectRowVisible(entityName);
  });
});

test.describe('操作日志 - OL-L-07 结果筛选', () => {
  const typeName = 'type_' + Date.now() + '_l7';
  const entityName = 'ent_' + Date.now() + '_l7';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    entityId = await seedEntityCreateLog(page, typeName, entityName);
    await olp.reloadOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证成功结果筛选携带 status=1', async ({ page }) => {
    const response = await olp.filterByStatus(page, olp.DOC.successTag);
    const query = parseQuery(response.url());
    expect(query.status).toBe('1');
    await olp.searchByResourceName(page, entityName);
    await olp.operationLogTable(page).expectRowVisible(entityName);
    await expect(
      olp
        .operationLogTable(page)
        .rowByText(entityName)
        .getByText(olp.DOC.successTag)
        .first(),
    ).toBeVisible();
  });
});

test.describe('操作日志 - OL-L-08 组合筛选', () => {
  const typeName = 'type_' + Date.now() + '_l8';
  const entityName = 'ent_' + Date.now() + '_l8';
  let entityId;

  test.beforeEach(async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    entityId = await seedEntityCreateLog(page, typeName, entityName);
    await olp.reloadOperationLogPage(page);
  });

  test.afterEach(async ({ page }) => {
    if (entityId) {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
  });

  test('验证时间范围与列筛选组合查询', async ({ page }) => {
    await olp.filterByAction(page, 'create');
    await olp.filterByResourceType(page, 'entity');

    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    const fmt = (d) =>
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds());

    const response = await olp.queryWithTimeRange(page, fmt(start), fmt(now));
    const query = parseQuery(response.url());
    expect(query.action).toBe('create');
    expect(query.resource_type).toBe('entity');
    expect(query.start_time).toBeTruthy();
    expect(query.end_time).toBeTruthy();
  });
});

test.describe('操作日志 - OL-L-09 服务端分页', () => {
  const typeName = 'type_' + Date.now() + '_l9';
  const entityIds = [];
  let seeded = false;

  test.afterEach(async ({ page }) => {
    if (!seeded) {
      return;
    }
    for (const id of entityIds.splice(0)) {
      await entityApi.deleteEntityViaApi(page, id);
    }
    await entityApi.deleteEntityTypeViaApi(page, typeName);
    seeded = false;
  });

  test('验证翻页后页码仍可见且 pagination.total 一致', async ({ page }) => {
    await olp.gotoOperationLogPage(page);
    let { total } = await logApi.fetchOperationLogsViaApi(page, {
      page: 1,
      page_size: 20,
    });

    if (total <= 20) {
      await test.step('前置：造数使日志超过 20 条', async () => {
        await entityApi.createEntityTypeViaApi(page, typeName, '分页测试', 1);
        seeded = true;
        const need = 21 - total;
        let lastName = '';
        for (let i = 0; i < need; i += 1) {
          lastName = 'ent_' + Date.now() + '_l9_' + i;
          const created = await entityApi.createEntityViaApi(
            page,
            lastName,
            typeName,
          );
          expect(created, '接口创建 Entity 失败').not.toBeNull();
          entityIds.push(created.id);
        }
        await logApi.waitForOperationLogViaApi(
          page,
          (item) =>
            item.action === 'create' &&
            item.resource_type === 'entity' &&
            item.resource_name === lastName,
          { resource_name: lastName },
        );
        await olp.reloadOperationLogPage(page);
        ({ total } = await logApi.fetchOperationLogsViaApi(page, {
          page: 1,
          page_size: 20,
        }));
      });
    }

    if (total <= 20) {
      test.skip(true, `日志总数 ${total} 不足 21 条，跳过分页用例`);
    }

    await test.step('第 1 页展示 20 条且页码 1、2 可见', async () => {
      const table = olp.operationLogTable(page);
      await table.waitForLoaded();
      expect(await table.dataRows().count()).toBe(20);
      await olp.expectPaginationPageNumbersVisible(page, 1, 2);
      await olp.expectActivePaginationPage(page, 1);
    });

    await test.step('点击页码 2：page=2、total 不变、页码不消失', async () => {
      const response = await olp.clickPageNumber(page, 2);
      const query = parseQuery(response.url());
      expect(Number(query.page)).toBe(2);

      const paged = logApi.normalizeListResponse((await response.json()).Data);
      expect(
        paged.total,
        '翻页后 pagination.total 应与首页一致（#95：total 丢失会导致页码消失）',
      ).toBe(total);
      expect(paged.page).toBe(2);
      expect(paged.list.length).toBeGreaterThan(0);

      await olp.operationLogTable(page).waitForLoaded();
      await olp.expectPaginationPageNumbersVisible(page, 1, 2);
      await olp.expectActivePaginationPage(page, 2);
      expect(await olp.operationLogTable(page).dataRows().count()).toBe(
        paged.list.length,
      );
    });

    await test.step('点击页码 1：回到首页且页码仍可见', async () => {
      const response = await olp.clickPageNumber(page, 1);
      const query = parseQuery(response.url());
      expect(Number(query.page)).toBe(1);
      const paged = logApi.normalizeListResponse((await response.json()).Data);
      expect(paged.total).toBe(total);
      await olp.operationLogTable(page).waitForLoaded();
      await olp.expectPaginationPageNumbersVisible(page, 1, 2);
      await olp.expectActivePaginationPage(page, 1);
    });
  });
});

test.describe('操作日志 - OL-L-10 空列表展示', () => {
  test('验证未来时间范围筛选后展示空态且分页 total 为 0', async ({ page }) => {
    await olp.gotoOperationLogPage(page);

    const { start, end } = olp.futureDateTimeString(30);
    const response = await olp.queryWithTimeRange(page, start, end);
    const query = parseQuery(response.url());
    expect(query.start_time).toBeTruthy();
    expect(query.end_time).toBeTruthy();

    const body = await response.json();
    const total =
      body?.Data?.pagination?.total ??
      body?.Data?.total ??
      (body?.Data?.list || []).length;
    expect(total).toBe(0);

    await olp.expectEmptyTable(page);
    await olp.expectPaginationTotalZero(page);
  });
});

test.describe('操作日志 - OL-L-11 操作动作 Tag 颜色', () => {
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

  test('验证各 action Tag 颜色与原型一致', async ({ page }) => {
    await test.step('造数：create / update 日志', async () => {
      await entityApi.createEntityTypeViaApi(page, typeName, 'Tag 颜色测试', 1);
      const created = await entityApi.createEntityViaApi(page, entityName, typeName);
      expect(created, '创建 Entity 失败').not.toBeNull();
      entityId = created.id;

      await entityApi.updateEntityViaApi(page, entityId, {
        allow_models: ['gpt-4'],
      });
      await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'update' &&
          item.resource_type === 'entity' &&
          item.resource_name === entityName,
        { resource_name: entityName, action: 'update' },
      );
    });

    await test.step('验证 create / update Tag 颜色', async () => {
      await olp.reloadOperationLogPage(page);
      await olp.searchByResourceName(page, entityName);
      await olp.expectActionTagColor(page, 'create', olp.ACTION_COLOR_MAP.create);
      await olp.expectActionTagColor(page, 'update', olp.ACTION_COLOR_MAP.update);
    });

    await test.step('造数并验证 delete Tag 颜色', async () => {
      await entityApi.deleteEntityViaApi(page, entityId);
      entityId = null;
      await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'delete' &&
          item.resource_type === 'entity' &&
          item.resource_name === entityName,
        { resource_name: entityName, action: 'delete' },
      );
      await olp.reloadOperationLogPage(page);
      await olp.searchByResourceName(page, entityName);
      await olp.expectActionTagColor(page, 'delete', olp.ACTION_COLOR_MAP.delete);
    });

    await test.step('验证环境中其他 action Tag 颜色（若存在）', async () => {
      const otherActions = ['reset', 'import', 'bind', 'unbind'];
      for (const action of otherActions) {
        const { list } = await logApi.fetchOperationLogsViaApi(page, {
          action,
          page_size: 1,
        });
        if (!list.length) {
          continue;
        }
        const log = list[0];
        await olp.reloadOperationLogPage(page);
        await olp.searchByResourceName(page, log.resource_name);
        await olp.expectActionTagColor(
          page,
          action,
          olp.ACTION_COLOR_MAP[action],
        );
      }
    });
  });
});
