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
 * 路由管理 - route table list
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');

/**
 * 路由管理 - RT-L-10 启用 Global 路由表
 * Skill 阶段 1 P0 标杆
 */

test.describe('路由管理 - RT-L-10 启用 Global 路由表', () => {
  const cleanup = utils.createRouteTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证启用 Global 路由表成功', async ({ page }) => {
    await test.step('前置：保存原始状态并将 Global 路由表设为停用', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await cleanup.saveGlobalRouteRulesOriginalState(page);
      await utils.ensureGlobalRouteTableDisabledViaUI(page);
    });

    await test.step('进入路由表列表页', async () => {
      await utils.reloadRouteTableListPage(page);
    });

    await test.step('验证 Global 路由表当前为停用状态', async () => {
      await utils.expectGlobalRouteTableRowVisible(page);
      await utils.expectGlobalRouteTableStatus(page, false);
      await utils.expectGlobalRouteTableToggleButtons(page, false);
    });

    await test.step('点击「启用」按钮', async () => {
      await utils.enableGlobalRouteTableAndWait(page);
    });

    await test.step('验证启用成功：状态变为启用，按钮状态正确', async () => {
      await utils.expectGlobalRouteTableStatus(page, true);
      await utils.expectGlobalRouteTableToggleButtons(page, true);
    });

    await test.step('通过 API 验证 enabled=true', async () => {
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      expect(rules).not.toBeNull();
      expect(rules.enabled).toBe(true);
    });
  });
});

/**
 * 路由管理 - RT-L-11 停用 Global 路由表
 * Skill 阶段 1 P0 标杆
 */

test.describe('路由管理 - RT-L-11 停用 Global 路由表', () => {
  const cleanup = utils.createRouteTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证停用 Global 路由表成功', async ({ page }) => {
    await test.step('前置：保存原始状态并将 Global 路由表设为启用', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      await cleanup.saveGlobalRouteRulesOriginalState(page);
      await utils.ensureGlobalRouteTableEnabledViaUI(page);
    });

    await test.step('进入路由表列表页', async () => {
      await utils.reloadRouteTableListPage(page);
    });

    await test.step('验证 Global 路由表当前为启用状态', async () => {
      await utils.expectGlobalRouteTableRowVisible(page);
      await utils.expectGlobalRouteTableStatus(page, true);
      await utils.expectGlobalRouteTableToggleButtons(page, true);
    });

    await test.step('点击「停用」按钮', async () => {
      await utils.disableGlobalRouteTableAndWait(page);
    });

    await test.step('验证停用成功：状态变为停用，按钮状态正确', async () => {
      await utils.expectGlobalRouteTableStatus(page, false);
      await utils.expectGlobalRouteTableToggleButtons(page, false);
    });

    await test.step('通过 API 验证 enabled=false', async () => {
      const rules = await utils.getGlobalRouteRulesViaApi(page);
      expect(rules).not.toBeNull();
      expect(rules.enabled).toBe(false);
    });
  });
});

/**
 * 路由管理 - RT-L-12 启用 Entity 路由表
 */

const ENTITY_TYPE = utils.DOC_ROUTE_TABLE.entityTypeLabel;

test.describe('路由管理 - RT-L-12 启用 Entity 路由表', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let entityId;
  let entityName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证启用 Entity 路由表成功', async ({ page }) => {
    await test.step('前置：获取 Entity 路由表并设为停用', async () => {
      const resolved = await utils.resolveEntityRouteTableOwner(page, cleanup);
      entityId = resolved.ownerId;
      entityName = resolved.ownerName;
      await utils.ensureRouteTableDisabledViaUI(
        page,
        ENTITY_TYPE,
        entityId,
        entityId,
      );
    });

    await test.step('验证 Entity 路由表当前为停用状态', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableRowVisible(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableStatus(page, ENTITY_TYPE, entityId, false);
      await utils.expectRouteTableToggleButtons(
        page,
        ENTITY_TYPE,
        entityId,
        false,
      );
    });

    await test.step('点击「启用」按钮', async () => {
      await utils.enableRouteTableAndWait(
        page,
        ENTITY_TYPE,
        entityId,
        entityId,
      );
    });

    await test.step('验证启用成功', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableStatus(page, ENTITY_TYPE, entityId, true);
      await utils.expectRouteTableToggleButtons(
        page,
        ENTITY_TYPE,
        entityId,
        true,
      );
    });
  });
});

/**
 * 路由管理 - RT-L-13 停用 Entity 路由表
 */

test.describe('路由管理 - RT-L-13 停用 Entity 路由表', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let entityId;
  let entityName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证停用 Entity 路由表成功', async ({ page }) => {
    await test.step('前置：获取 Entity 路由表并设为启用', async () => {
      const resolved = await utils.resolveEntityRouteTableOwner(page, cleanup);
      entityId = resolved.ownerId;
      entityName = resolved.ownerName;
      await utils.ensureRouteTableEnabledViaUI(
        page,
        ENTITY_TYPE,
        entityId,
        entityId,
      );
    });

    await test.step('验证 Entity 路由表当前为启用状态', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableRowVisible(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableStatus(page, ENTITY_TYPE, entityId, true);
      await utils.expectRouteTableToggleButtons(
        page,
        ENTITY_TYPE,
        entityId,
        true,
      );
    });

    await test.step('点击「停用」按钮', async () => {
      await utils.disableRouteTableAndWait(
        page,
        ENTITY_TYPE,
        entityId,
        entityId,
      );
    });

    await test.step('验证停用成功', async () => {
      await utils.navigateToRouteTableByOwner(page, ENTITY_TYPE, entityId);
      await utils.expectRouteTableStatus(page, ENTITY_TYPE, entityId, false);
      await utils.expectRouteTableToggleButtons(
        page,
        ENTITY_TYPE,
        entityId,
        false,
      );
    });
  });
});

/**
 * 路由管理 - RT-L-14 启用 API-Key 路由表
 */

const APIKEY_TYPE = utils.DOC_ROUTE_TABLE.apiKeyTypeLabel;

test.describe('路由管理 - RT-L-14 启用 API-Key 路由表', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let apiKeyId;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证启用 API-Key 路由表成功', async ({ page }) => {
    await test.step('前置：获取 API-Key 路由表并设为停用', async () => {
      const resolved = await utils.resolveApiKeyRouteTableOwner(page, cleanup);
      apiKeyId = resolved.ownerId;
      await utils.ensureRouteTableDisabledViaUI(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('验证 API-Key 路由表当前为停用状态', async () => {
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableRowVisible(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableStatus(page, APIKEY_TYPE, apiKeyId, false);
      await utils.expectRouteTableToggleButtons(
        page,
        APIKEY_TYPE,
        apiKeyId,
        false,
      );
    });

    await test.step('点击「启用」按钮', async () => {
      await utils.enableRouteTableAndWait(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('验证启用成功', async () => {
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableStatus(page, APIKEY_TYPE, apiKeyId, true);
      await utils.expectRouteTableToggleButtons(
        page,
        APIKEY_TYPE,
        apiKeyId,
        true,
      );
    });
  });
});

/**
 * 路由管理 - RT-L-15 停用 API-Key 路由表
 */

test.describe('路由管理 - RT-L-15 停用 API-Key 路由表', () => {
  const cleanup = utils.createRouteLinkedTestCleanup();
  let apiKeyId;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('验证停用 API-Key 路由表成功', async ({ page }) => {
    await test.step('前置：获取 API-Key 路由表并设为启用', async () => {
      const resolved = await utils.resolveApiKeyRouteTableOwner(page, cleanup);
      apiKeyId = resolved.ownerId;
      await utils.ensureRouteTableEnabledViaUI(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('验证 API-Key 路由表当前为启用状态', async () => {
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableRowVisible(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableStatus(page, APIKEY_TYPE, apiKeyId, true);
      await utils.expectRouteTableToggleButtons(
        page,
        APIKEY_TYPE,
        apiKeyId,
        true,
      );
    });

    await test.step('点击「停用」按钮', async () => {
      await utils.disableRouteTableAndWait(page, APIKEY_TYPE, apiKeyId);
    });

    await test.step('验证停用成功', async () => {
      await utils.navigateToRouteTableByOwner(page, APIKEY_TYPE, apiKeyId);
      await utils.expectRouteTableStatus(page, APIKEY_TYPE, apiKeyId, false);
      await utils.expectRouteTableToggleButtons(
        page,
        APIKEY_TYPE,
        apiKeyId,
        false,
      );
    });
  });
});

/**
 * 路由管理 - RT-L-01 ~ RT-L-09, RT-L-16 路由表列表 P1/P2 用例
 */

const ROUTE_TABLES_URL = '**/open-api/v1/route-tables**';
const TYPE_LABELS = {
  global: 'Global',
  entity: 'Entity',
  apikey: 'API-Key',
};
const STATUS_LABELS = {
  true: '启用',
  false: '停用',
};

/**
 * mock 数据行的 type 取值 = **接口返回值**：后端 `RouteTableTypeAPIKey = 'api_key'`
 * （自 2026-08-31 起），不是 UI 下拉的 value `apikey`。
 * 列表「类型」列显示的是 `TYPE_MAP[row.type]`（`RouteTable/index.vue:53-58,96`），
 * 故此处的 type 取值直接决定单元格是否命中 `api_key → API-Key` 映射 —— 用 `apikey`
 * 会绕开产品 792bb73 补的那条映射，让 mock 用例覆盖不到该修复。
 */
const API_TYPE = { global: 'global', entity: 'entity', apikey: 'api_key' };

function makeRouteTableItem(type, index, enabled) {
  const owner = type === 'global' ? 'global' : `${type}-${index}`;
  return { type: API_TYPE[type] || type, owner, enabled };
}

function buildMockList(counts) {
  const list = [];
  let index = 0;
  for (const [type, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      list.push(makeRouteTableItem(type, index++, i % 2 === 0));
    }
  }
  return list;
}

/**
 * 列表「类型」筛选的「查询值 → 数据行 type」映射。
 *
 * 查询值取 UI 下拉的 value（`RouteTable/index.vue:91-95`：global / entity / **apikey**），
 * 数据行 type 取接口原值（`api_key`）。两种查询写法都接受并映射到同一数据取值 ——
 * 原实现只登记了 `api_key` 键，而 UI 实际发的是 `apikey`，于是「按 API-Key 类型筛选」
 * 在 mock 里静默不过滤（`TYPE_MAP[typeVal]` 为 undefined → 整表返回），
 * 任何基于该筛选的断言都会退化成恒真。
 */
const TYPE_MAP = {
  global: 'global',
  entity: 'entity',
  apikey: 'api_key',
  api_key: 'api_key',
};

async function mockRouteTablesList(page, fullList) {
  await page.route(ROUTE_TABLES_URL, async (route) => {
    const url = new URL(route.request().url());
    let list = [...fullList];

    // 类型筛选
    const typeVal = url.searchParams.get('type');
    if (typeVal && TYPE_MAP[typeVal]) {
      list = list.filter((item) => item.type === TYPE_MAP[typeVal]);
    }

    // 属主搜索（精确匹配）
    const owner = url.searchParams.get('owner');
    if (owner) {
      list = list.filter((item) => item.owner === owner);
    }

    // 状态筛选
    const enabledVal = url.searchParams.get('enabled');
    if (enabledVal !== null && enabledVal !== '') {
      const enabled = enabledVal === 'true';
      list = list.filter((item) => item.enabled === enabled);
    }

    // 分页
    const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);
    const total = list.length;
    const start = (pageNum - 1) * pageSize;
    const pagedList = list.slice(start, start + pageSize);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: 200,
        ErrMsg: 'success',
        Data: {
          list: pagedList,
          pagination: {
            page: pageNum,
            page_size: pageSize,
            total,
          },
        },
      }),
    });
  });
}

async function mockRouteTablesFailure(page) {
  await page.route(ROUTE_TABLES_URL, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ErrNum: 500, ErrMsg: 'internal server error' }),
    });
  });
}

async function gotoListPageWithMock(page, list) {
  await mockRouteTablesList(page, list);
  await utils.ensureRouteTableModuleAvailable(page);
  await utils.reloadRouteTableListPage(page);
  const table = utils.routeTableList(page);
  await table.waitForLoaded();
  return table;
}

test.describe('路由管理 - RT-L-01 进入路由表列表页', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-01 进入路由表列表页，布局元素完整', async ({ page }) => {
    const table = await gotoListPageWithMock(page, [
      makeRouteTableItem('global', 0, true),
      makeRouteTableItem('entity', 1, false),
    ]);
    await table.expectHeaders('路由表类型', '路由表属主', '状态', '操作');
    await table.expectPaginationVisible();
    await expect(
      table.searchArea().getByText('请选择路由表类型'),
    ).toBeVisible();
    await expect(
      table.searchArea().getByPlaceholder('请输入路由表属主查询'),
    ).toBeVisible();
    // 状态列搜索控件默认取「启用」，placeholder「请选择状态」不渲染，
    // 布局断言改为「控件可见 + 默认值正确」（默认值行为详见 RT-L-17）
    await expect(
      utils.routeTableSearchSelect(page, utils.ROUTE_TABLE_SEARCH_COLUMN.status),
    ).toBeVisible();
    await utils.expectRouteTableSearchFilterValue(
      page,
      utils.ROUTE_TABLE_SEARCH_COLUMN.status,
      '启用',
    );
  });
});

test.describe('路由管理 - RT-L-02 按路由表类型筛选 Entity', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-02 按路由表类型筛选 Entity', async ({ page }) => {
    const table = await gotoListPageWithMock(
      page,
      buildMockList({ global: 2, entity: 3, apikey: 2 }),
    );
    // 状态列默认「启用」会先滤掉停用行，按类型筛选前显式清空，
    // 保证断言的是「类型」筛选本身的完整结果集
    await utils.clearRouteTableStatusFilter(page);
    await utils.selectRouteTableTypeFilter(page, 'Entity');
    await expect(table.dataRows().filter({ hasText: 'Entity' })).toHaveCount(3);
    await expect(table.dataRows().filter({ hasText: 'Global' })).toHaveCount(0);
    await expect(table.dataRows().filter({ hasText: 'API-Key' })).toHaveCount(
      0,
    );
  });
});

test.describe('路由管理 - RT-L-03 按属主搜索 apikey-001', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-03 按属主搜索 apikey-001', async ({ page }) => {
    const list = [
      { type: 'apikey', owner: 'apikey-001', enabled: true },
      { type: 'apikey', owner: 'apikey-002', enabled: false },
      { type: 'entity', owner: 'entity-001', enabled: true },
    ];
    const table = await gotoListPageWithMock(page, list);
    await utils.searchRouteTableOwner(page, 'apikey-001');
    await expect(
      table.dataRows().filter({ hasText: 'apikey-001' }),
    ).toHaveCount(1);
    await expect(
      table.dataRows().filter({ hasText: 'apikey-002' }),
    ).toHaveCount(0);
    await expect(
      table.dataRows().filter({ hasText: 'entity-001' }),
    ).toHaveCount(0);
  });
});

test.describe('路由管理 - RT-L-04 按启用状态筛选', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-04 按启用状态筛选', async ({ page }) => {
    const table = await gotoListPageWithMock(
      page,
      buildMockList({ global: 2, entity: 2, apikey: 2 }),
    );
    // 状态列默认已是「启用」，先清空拿到全量 6 行，
    // 再显式选「启用」，证明列表条数确实由该筛选驱动
    await utils.clearRouteTableStatusFilter(page);
    await expect(table.dataRows()).toHaveCount(6);
    await utils.selectRouteTableSearchFilter(
      page,
      utils.ROUTE_TABLE_SEARCH_COLUMN.status,
      '启用',
    );
    await expect(table.dataRowsByStatus('启用')).toHaveCount(3);
    await expect(table.dataRowsByStatus('停用')).toHaveCount(0);
  });
});

test.describe('路由管理 - RT-L-05 组合筛选 global + 停用', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-05 组合筛选 global + 停用', async ({ page }) => {
    const table = await gotoListPageWithMock(page, [
      { type: 'global', owner: 'global', enabled: true },
      { type: 'global', owner: 'global', enabled: false },
      { type: 'entity', owner: 'entity-1', enabled: false },
    ]);
    await utils.selectRouteTableTypeFilter(page, 'Global');
    // 状态默认「启用」，这里要选「停用」，显式覆盖默认值
    await utils.selectRouteTableStatusFilter(page, '停用');
    await expect(table.dataRows()).toHaveCount(1);
    await expect(
      table
        .dataRows()
        .filter({ hasText: 'Global' })
        .filter({ has: page.locator('.ivu-tag').getByText('停用') }),
    ).toHaveCount(1);
  });
});

test.describe('路由管理 - RT-L-06 分页切换', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-06 分页切换', async ({ page }) => {
    const list = buildMockList({ global: 25 });
    const table = await gotoListPageWithMock(page, list);
    // 状态默认「启用」会把 25 行砍成 13 行，分页断言前先清空筛选拿全量
    await utils.clearRouteTableStatusFilter(page);
    await expect(table.dataRows()).toHaveCount(20);
    await table.clickPageNumber(2);
    await expect(
      table.pagination().getByRole('listitem').filter({ hasText: '2' }).first(),
    ).toHaveClass(/active/);
    await expect(table.dataRows()).toHaveCount(5); // 默认 20 条/页，第 2 页 5 条
  });
});

test.describe('路由管理 - RT-L-07 每页条数切换为 30', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-07 每页条数切换为 30', async ({ page }) => {
    const list = buildMockList({ global: 35 });
    const table = await gotoListPageWithMock(page, list);
    // 同上：先清空默认「启用」筛选，保证 35 行全量参与分页
    await utils.clearRouteTableStatusFilter(page);
    await table.changePageSize('30条/页');
    await expect(table.dataRows()).toHaveCount(30);
  });
});

test.describe('路由管理 - RT-L-08 空列表展示', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-08 空列表展示', async ({ page }) => {
    await gotoListPageWithMock(page, []);
    await expect(page.getByText('暂无数据')).toBeVisible();
  });
});

test.describe('路由管理 - RT-L-09 列表接口失败提示', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-09 列表接口失败提示', async ({ page }) => {
    await mockRouteTablesFailure(page);
    await utils.ensureRouteTableModuleAvailable(page);
    await utils.reloadRouteTableListPage(page);
    await expect(
      page
        .locator('.ivu-message, .ivu-notice, .ivu-alert')
        .filter({ hasText: /错误|失败|error|500/ })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('路由管理 - RT-L-16 启用/停用按钮状态正确', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute(ROUTE_TABLES_URL);
  });

  test('RT-L-16 启用/停用按钮状态正确', async ({ page }) => {
    const table = await gotoListPageWithMock(page, [
      { type: 'global', owner: 'global', enabled: true },
      { type: 'entity', owner: 'entity-1', enabled: false },
    ]);
    // 本用例要同时校验启用行与停用行的按钮态，必须先清空默认「启用」筛选
    await utils.clearRouteTableStatusFilter(page);
    await expect(table.dataRows()).toHaveCount(2);
    const enabledRow = table
      .dataRows()
      .filter({ hasText: 'Global' })
      .filter({ hasText: '启用' })
      .first();
    const disabledRow = table
      .dataRows()
      .filter({ hasText: 'Entity' })
      .filter({ hasText: '停用' })
      .first();

    await expect(
      enabledRow.getByRole('button', { name: '启用' }),
    ).toBeDisabled();
    await expect(
      enabledRow.getByRole('button', { name: '停用' }),
    ).toBeEnabled();
    await expect(
      enabledRow.getByRole('button', { name: '查看' }),
    ).toBeEnabled();

    await expect(
      disabledRow.getByRole('button', { name: '启用' }),
    ).toBeEnabled();
    await expect(
      disabledRow.getByRole('button', { name: '停用' }),
    ).toBeDisabled();
    await expect(
      disabledRow.getByRole('button', { name: '查看' }),
    ).toBeEnabled();
  });
});
