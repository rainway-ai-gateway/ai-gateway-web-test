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
 * 模块名：路由管理 - 路由表列表状态筛选默认值
 * 用例范围：RT-L-17（状态筛选默认「启用」、改类型保留默认值、清空后不粘回）
 * 说明：只读用例，全程不写后端；断言以请求参数为主，UI 行出现/消失为辅，
 *       不硬编码列表条数（本环境 19 张路由表当前均为停用，默认「启用」列表为空）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');

test.describe('路由管理 - RT-L-17 列表状态筛选默认值', () => {
  test('RT-L-17 状态筛选默认「启用」，改类型保留该默认值，清空后不再粘回', async ({
    page,
  }) => {
    const tracker = utils.trackRouteTableListRequests(page);
    const statusColumn = utils.ROUTE_TABLE_SEARCH_COLUMN.status;
    const typeColumn = utils.ROUTE_TABLE_SEARCH_COLUMN.type;

    await test.step('1. 首屏：状态筛选默认「启用」，首个列表请求携带 enabled=true', async () => {
      await utils.ensureRouteTableModuleAvailable(page);
      const firstUrl = tracker.urls[0];
      expect(firstUrl, '未捕获到 GET /route-tables 列表请求').toBeTruthy();
      const params = utils.getRouteTableListRequestParams(firstUrl);
      expect(params.enabled).toBe('true');
      expect(params.page).toBe('1');
      await utils.expectRouteTableSearchFilterValue(
        page,
        statusColumn,
        utils.DOC_ROUTE_TABLE.enabledLabel,
      );
    });

    await test.step('2. 默认「启用」下表格不出现「停用」行', async () => {
      const table = utils.routeTableList(page);
      await table.waitForLoaded();
      await expect(
        table.dataRowsByStatus(utils.DOC_ROUTE_TABLE.disabledLabel),
      ).toHaveCount(0);
    });

    await test.step('3. 改为按类型筛选时仍保留默认 enabled=true（默认值不再被丢弃）', async () => {
      const url = await utils.waitForRouteTableListRequestUrl(page, () =>
        utils.selectRouteTableSearchFilter(
          page,
          typeColumn,
          utils.DOC_ROUTE_TABLE.globalTypeLabel,
        ),
      );
      expect(url, '切换类型未触发列表请求').toBeTruthy();
      const params = utils.getRouteTableListRequestParams(url);
      expect(params.type).toBe('global');
      expect(params.enabled).toBe('true');
    });

    await test.step('4. 清空状态筛选：请求不再携带 enabled，Global 行重新出现', async () => {
      const globalRow = utils.routeTableRow(
        utils.routeTableList(page),
        utils.DOC_ROUTE_TABLE.globalTypeLabel,
        utils.DOC_ROUTE_TABLE.globalOwner,
      );
      const globalTable = await utils.findGlobalRouteTableViaApi(page);
      const globalEnabled = globalTable?.enabled === true;
      if (!globalEnabled) {
        // 默认「启用」过滤掉停用的 Global 行；Global 处于启用时该行本就可见
        await expect(globalRow).toHaveCount(0);
      }

      const url = await utils.waitForRouteTableListRequestUrl(page, () =>
        utils.clearRouteTableSearchFilter(page, statusColumn),
      );
      expect(url, '清空状态筛选未触发列表请求').toBeTruthy();
      const params = utils.getRouteTableListRequestParams(url);
      expect(params.type).toBe('global');
      expect(params.enabled).toBeUndefined();
      await expect(globalRow).toBeVisible({ timeout: 15000 });
    });

    await test.step('5. 清空后再改类型：默认值不粘回，请求不含 enabled', async () => {
      const url = await utils.waitForRouteTableListRequestUrl(page, () =>
        utils.selectRouteTableSearchFilter(
          page,
          typeColumn,
          utils.DOC_ROUTE_TABLE.entityTypeLabel,
        ),
      );
      expect(url, '清空后切换类型未触发列表请求').toBeTruthy();
      const params = utils.getRouteTableListRequestParams(url);
      expect(params.type).toBe('entity');
      expect(params.enabled).toBeUndefined();
      await expect(
        utils
          .routeTableSearchSelect(page, statusColumn)
          .locator('.ivu-select-selected-value'),
      ).toHaveCount(0);
    });

    tracker.stop();
  });
});