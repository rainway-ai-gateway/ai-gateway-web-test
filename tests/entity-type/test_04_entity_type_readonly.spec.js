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
 * Entity 类型管理 - 只读管理员视角 EM-T-RO-01 ~ EM-T-RO-03
 *
 * 覆盖用例（docs/entity-type/02-功能测试用例/02-只读视角.md）：
 * - EM-T-RO-01 只读视角「创建类型」按钮隐藏
 * - EM-T-RO-02 只读视角列表操作列「编辑」「删除」隐藏
 * - EM-T-RO-03 只读视角列表只读查看能力保留
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（不写 auth.json，避免覆盖默认 admin 会话）。
 * - 只读导航只走 utils/readonly.gotoAsReadonly + page object 的
 *   gotoEntityTypeManagementPageReadonly（不做会话自愈，见 utils/readonly.js 文件头约束 2）。
 * - 数据：**复用环境已有 Entity 类型**（docs 02-只读视角.md「测试数据」= 列表存在
 *   ≥1 条 / 多条记录），不造数、不清理，故本 spec 无 beforeAll/afterAll 造数块；
 *   目标类型名在管理员对照阶段经 `GET /entity-types` 读取，只读阶段用只读会话再读一次
 *   做「列表数据与接口返回一致」核对。
 *
 * 运行：nvm use 18 && npx playwright test tests/entity-type/test_04_entity_type_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 行内写按钮文案（EntityTypeList.vue 操作列 directives has） */
const ROW_WRITE_LABELS = ['编辑', '删除'];

test.describe('Entity 类型管理 - EM-T-RO-01 只读视角「创建类型」按钮隐藏', () => {
  test('只读视角隐藏页头「创建类型」写入口、保留检索与分页；管理员可见且可用（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：页头「创建类型」按钮可见且可用', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await readonly.expectAdminEnabled(
        utils.entityTypeCreateBtn(page),
        '创建类型',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 Entity 类型管理页', async () => {
      await utils.gotoEntityTypeManagementPageReadonly(page);
    });

    await test.step('「创建类型」按钮仍在 DOM 但被 v-has 隐藏（display:none !important）', async () => {
      await readonly.expectVHasHidden(
        utils.entityTypeCreateBtn(page),
        '「创建类型」按钮',
      );
    });

    await test.step('页面不提供任何新增类型的写入口（创建抽屉未打开）', async () => {
      await utils.expectEntityTypeCreateEntryHiddenReadonly(page);
    });

    await test.step('搜索、分页等只读能力正常', async () => {
      await utils.expectEntityTypeReadonlyCapabilitiesVisible(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('Entity 类型管理 - EM-T-RO-02 只读视角列表操作列「编辑」「删除」隐藏', () => {
  test('只读视角行内「编辑」「删除」隐藏、行数据正常展示；管理员操作列可见（对照组）', async ({
    page,
  }) => {
    let targetType = null;

    await test.step('管理员对照：操作列「编辑」「删除」可见且可用', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      const apiTypes = await utils.fetchAllEntityTypesViaApi(page);
      expect(
        apiTypes.length,
        '环境应已存在 ≥1 条 Entity 类型（GET /entity-types）',
      ).toBeGreaterThan(0);
      targetType = apiTypes[0].type_name;
      await utils.searchEntityType(page, targetType);
      await utils.expectEntityTypeVisible(page, targetType);
      for (const label of ROW_WRITE_LABELS) {
        await readonly.expectAdminEnabled(
          utils.entityTypeRowWriteBtn(page, targetType, label),
          `行内「${label}」`,
        );
      }
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面并检索目标类型行', async () => {
      await utils.gotoEntityTypeManagementPageReadonly(page);
      await utils.searchEntityTypeAndExpectRowReadonly(page, targetType);
    });

    await test.step('操作列「编辑」「删除」仍渲染但被 v-has 隐藏，页面无修改/删除写入口', async () => {
      await utils.expectEntityTypeRowWriteActionsHiddenReadonly(
        page,
        targetType,
      );
    });

    await test.step('列表行数据（类型名、描述、级别、创建时间）正常展示且与接口一致', async () => {
      const apiData = await utils.fetchEntityTypeByNameViaApi(page, targetType);
      expect(
        apiData,
        `GET /entity-types/${targetType} 应返回类型详情`,
      ).not.toBeNull();
      await utils.expectEntityTypeRowFieldsMatchApiReadonly(
        page,
        targetType,
        apiData,
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('Entity 类型管理 - EM-T-RO-03 只读视角列表只读查看能力保留', () => {
  test('只读视角列表加载 / 搜索 / 分页可用且与接口一致，全程无写入口；管理员检索可用（对照组）', async ({
    page,
  }) => {
    let targetType = null;

    await test.step('管理员对照：列表检索能力可用', async () => {
      await utils.gotoEntityTypeManagementPage(page);
      await utils.expectEntityTypeTableVisible(page);
      const apiTypes = await utils.fetchAllEntityTypesViaApi(page);
      expect(
        apiTypes.length,
        '环境应已存在 ≥1 条 Entity 类型（GET /entity-types）',
      ).toBeGreaterThan(0);
      targetType = apiTypes[0].type_name;
      await utils.searchEntityType(page, targetType);
      await utils.expectEntityTypeVisible(page, targetType);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 Entity 类型管理页', async () => {
      await utils.gotoEntityTypeManagementPageReadonly(page);
    });

    await test.step('列表正常加载，展示类型名 / 描述 / 级别 / 创建时间', async () => {
      await utils.expectEntityTypeTableVisible(page);
      await utils.expectEntityTypeReadonlyCapabilitiesVisible(page);
    });

    await test.step('列表数据与 GET /entity-types 返回一致（行数 + 行内字段）', async () => {
      const snapshot =
        await utils.expectEntityTypeListConsistentWithApiReadonly(page);
      expect(
        snapshot.apiCount,
        '接口应返回 ≥1 条 Entity 类型',
      ).toBeGreaterThan(0);
      expect(
        snapshot.rowCount,
        `列表第 1 页行数应为 min(每页 ${snapshot.pageSize} 条, 接口 ${snapshot.apiCount} 条)`,
      ).toBe(Math.min(snapshot.pageSize, snapshot.apiCount));
      targetType = snapshot.targetType;
      common.log(
        `列表与接口一致：接口 ${snapshot.apiCount} 条 / 第 1 页 ${snapshot.rowCount} 行 / 每页 ${snapshot.pageSize} 条 / 目标类型 ${snapshot.targetType}`,
      );
    });

    await test.step('搜索框按类型名检索可用（只读查询）', async () => {
      await utils.searchEntityTypeAndExpectRowReadonly(page, targetType);
      await utils.clearEntityTypeSearch(page);
    });

    await test.step('分页可正常切换（只读）', async () => {
      const multiPage = await utils.expectEntityTypePaginationUsableReadonly(
        page,
      );
      common.log(
        multiPage
          ? '环境数据多于一页，已实际翻页并回到第 1 页'
          : '环境数据不足一页，已断言分页器存在且当前页为 1（不造数，见文档数据策略）',
      );
    });

    await test.step('全程无任何写操作入口出现', async () => {
      await utils.expectEntityTypeCreateEntryHiddenReadonly(page);
      await utils.searchEntityTypeAndExpectRowReadonly(page, targetType);
      await utils.expectEntityTypeRowWriteActionsHiddenReadonly(
        page,
        targetType,
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});