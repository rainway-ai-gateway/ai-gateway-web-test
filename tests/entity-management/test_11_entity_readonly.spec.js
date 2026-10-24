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
 * Entity管理（Entity 组织管理 / Entity 类型管理）- 只读管理员视角
 * EM-E-RO-01 ~ EM-E-RO-03
 *
 * 覆盖用例（docs/entity-management/02-功能测试用例/10-只读视角.md §9）：
 * - EM-E-RO-01 只读视角列表工具栏写按钮隐藏（组织管理「创建Entity」/ 类型管理「创建类型」）
 * - EM-E-RO-02 只读视角列表操作列写按钮隐藏（隐藏「编辑」「删除」，保留「管理路由规则」）
 * - EM-E-RO-03 只读视角详情抽屉「重置配额」按钮隐藏
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（只写当前 page 的 localStorage，不写 auth.json，避免覆盖默认会话）。
 * - 只读导航只走 `utils/readonly.gotoAsReadonly` + page object 的 `gotoEntityPageReadonly` /
 *   `switchToEntityTypeTabReadonly`：不调用 ensureSessionHealthy / ensureLoggedIn /
 *   handleUrlInvalidAlert / gotoEntityOrgManagementPage（它们会以 conf.json 的 admin 凭证
 *   重登并回写 auth.json，把只读态换回管理员态，见 utils/readonly.js 文件头约束 2）。
 * - 断言：Entity 模块写入口全部由全局指令 `v-has` 加 `.v-has-hidden` 隐藏（模块内无
 *   `store.isReadonly()` / `v-show` 模式收敛分支），故一律用 `readonly.expectVHasHidden`
 *   钉住「元素仍在 DOM + class 含 v-has-hidden + 不可见」。
 * - 数据：beforeAll 用独立 admin context 选取「有限配额 Entity」（EM-E-RO-03 前置）与
 *   「Entity 类型」（EM-E-RO-01/02 前置）——环境已有则复用，缺失才造数并在 afterAll 清理。
 *   只读用例本身不写任何数据。
 *
 * 运行：nvm use 18 && npx playwright test tests/entity-management/test_11_entity_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/entity/EntityPage');
const apiUtils = require('../../api/entity-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 只读用例共享数据：目标 Entity / 目标 Entity 类型（EM-E-RO-01~03 前置） */
let targetEntityName = null;
let targetTypeName = null;
/** 本次造数登记的清理目标；复用环境已有数据时保持 null（不清理别人的数据） */
let createdEntityId = null;
let createdTypeName = null;

/**
 * 有限配额判定：与 EntityView.vue:382 `quotaPlanUnlimited` 取反一致
 * （`unlimited === true || unlimited === 'true'` 才是无限配额，其余按有限配额渲染
 * 配额信息区与「重置配额」写入口）。列表响应缺 `quota_plan` 时不算有限配额，
 * 避免选中详情区不渲染配额信息的行。
 */
function isLimitedQuotaEntity(entity) {
  const plan = entity?.quota_plan;
  if (!plan) {
    return false;
  }
  return !(plan.unlimited === true || plan.unlimited === 'true');
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(readonly.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // 1) Entity 类型：复用环境已有（列表任意一条），空列表才造数
    const types = await apiUtils.fetchAllEntityTypesViaApi(page);
    const reusableType = types[0];
    if (reusableType) {
      targetTypeName = reusableType.type_name || reusableType.type;
      common.log('[beforeAll] 复用环境已有 Entity 类型: ' + targetTypeName);
    } else {
      createdTypeName = 'ro-type-' + Date.now();
      await apiUtils.createEntityTypeViaApi(
        page,
        createdTypeName,
        '只读视角用例类型',
        1,
      );
      targetTypeName = createdTypeName;
      common.log('[beforeAll] 环境无 Entity 类型，已创建: ' + createdTypeName);
    }

    // 2) 有限配额 Entity：复用环境已有（EM-E-RO-03 前置），没有才造数
    const entities = await apiUtils.fetchAllEntitiesViaApi(page);
    const reusableEntity = entities.find(isLimitedQuotaEntity);
    if (reusableEntity) {
      targetEntityName = reusableEntity.name;
      common.log(
        '[beforeAll] 复用环境已有有限配额 Entity: ' + targetEntityName,
      );
    } else {
      const name = 'ro-entity-' + Date.now();
      const created = await utils.createEntityWithQuotaViaApi(
        page,
        name,
        targetTypeName,
        100000,
        'total_token',
        'monthly',
      );
      targetEntityName = name;
      createdEntityId =
        created?.id || (await apiUtils.findEntityIdByNameViaApi(page, name));
      common.log(
        '[beforeAll] 环境无有限配额 Entity，已创建: ' + name + ' id=' + createdEntityId,
      );
    }
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
  } finally {
    await context.close();
  }

  expect(
    targetTypeName,
    '只读用例前置数据：应确定一个 Entity 类型（复用环境已有或造数）',
  ).toBeTruthy();
  expect(
    targetEntityName,
    '只读用例前置数据：应确定一个有限配额 Entity（复用环境已有或造数）',
  ).toBeTruthy();
});

test.afterAll(async ({ browser }) => {
  if (!createdEntityId && !createdTypeName) {
    common.log('[afterAll] 只读用例全部复用环境已有数据，无需清理');
    return;
  }
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(readonly.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    if (createdEntityId) {
      await apiUtils.deleteEntityViaApi(page, createdEntityId);
      common.log('[afterAll] 已清理只读用例造的 Entity: ' + createdEntityId);
    }
    if (createdTypeName) {
      await apiUtils.deleteEntityTypeViaApi(page, createdTypeName);
      common.log('[afterAll] 已清理只读用例造的 Entity 类型: ' + createdTypeName);
    }
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('Entity管理 - EM-E-RO-01 只读视角列表工具栏写按钮隐藏', () => {
  test('只读视角两个 Tab 的工具栏写按钮均命中 .v-has-hidden 不展示；管理员对照组均可见可用', async ({
    page,
  }) => {
    await test.step('管理员对照：「Entity组织管理」工具栏「创建Entity」可见且可用', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await readonly.expectAdminEnabled(
        utils.entityOrgCreateButton(page),
        '创建Entity',
      );
      await utils.expectEntityListNotEmpty(page);
    });

    await test.step('管理员对照：「Entity类型管理」工具栏「创建类型」可见且可用', async () => {
      await utils.switchToEntityTypeTab(page);
      await readonly.expectAdminEnabled(
        utils.entityTypeCreateBtn(page),
        '创建类型',
      );
      await utils.expectEntityTypeTableVisible(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角直连 URL 进入 Entity 管理页（默认「Entity组织管理」Tab）', async () => {
      await utils.gotoEntityPageReadonly(page);
      await utils.expectEntityListNotEmpty(page);
    });

    await test.step('预期 1：组织管理工具栏「创建Entity」命中 .v-has-hidden（display:none）不展示', async () => {
      await readonly.expectVHasHidden(
        utils.entityOrgCreateButton(page),
        '组织管理「创建Entity」',
      );
    });

    await test.step('预期 2：类型管理工具栏「创建类型」同样命中 .v-has-hidden 不展示', async () => {
      await utils.switchToEntityTypeTabReadonly(page);
      await utils.expectEntityTypeTableVisible(page);
      await readonly.expectVHasHidden(
        utils.entityTypeCreateBtn(page),
        '类型管理「创建类型」',
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('Entity管理 - EM-E-RO-02 只读视角列表操作列写按钮隐藏', () => {
  test('只读视角组织/类型操作列隐藏「编辑」「删除」且保留「管理路由规则」；管理员对照组写入口可见', async ({
    page,
  }) => {
    await test.step('管理员对照：组织管理操作列「管理路由规则」「编辑」「删除」全可见', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.ensureEntityRowVisible(page, targetEntityName);
      await utils.expectEntityOrgRowAllActionsVisible(page, targetEntityName);
    });

    await test.step('管理员对照：类型管理操作列「编辑」「删除」可见且可用', async () => {
      await utils.switchToEntityTypeTab(page);
      await utils.searchEntityType(page, targetTypeName);
      await utils.expectEntityTypeVisible(page, targetTypeName);
      for (const label of ['编辑', '删除']) {
        await readonly.expectAdminEnabled(
          utils.entityTypeRowWriteBtn(page, targetTypeName, label),
          `类型行内「${label}」`,
        );
      }
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入组织管理并检索目标 Entity 行（只读查询能力保留）', async () => {
      await utils.gotoEntityPageReadonly(page);
      await utils.ensureEntityRowVisible(page, targetEntityName);
    });

    await test.step('预期 1：操作列隐藏「编辑」「删除」，仅保留「管理路由规则」绿色入口', async () => {
      await utils.expectEntityOrgRowReadonlyActions(page, targetEntityName);
    });

    await test.step('预期 2：类型管理操作列隐藏「编辑」「删除」', async () => {
      await utils.switchToEntityTypeTabReadonly(page);
      await utils.searchEntityTypeAndExpectRowReadonly(page, targetTypeName);
      await utils.expectEntityTypeRowWriteActionsHiddenReadonly(
        page,
        targetTypeName,
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('Entity管理 - EM-E-RO-03 只读视角详情抽屉「重置配额」按钮隐藏', () => {
  test('只读视角详情配额信息区隐藏「重置配额」、其余只读字段正常；管理员对照组可见可用', async ({
    page,
  }) => {
    await test.step('管理员对照：打开有限配额 Entity 详情，「重置配额」可见且可用', async () => {
      await utils.gotoEntityOrgManagementPage(page);
      await utils.ensureEntityRowVisible(page, targetEntityName);
      await utils.openEntityDetail(page, targetEntityName);
      await utils.expectEntityDetailVisible(page);
      await readonly.expectAdminEnabled(
        utils.entityDetailResetQuotaBtn(page),
        '详情「重置配额」',
      );
      await utils.closeEntityDetail(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角点击 Entity 名称打开详情抽屉', async () => {
      await utils.gotoEntityPageReadonly(page);
      await utils.ensureEntityRowVisible(page, targetEntityName);
      await utils.openEntityDetail(page, targetEntityName);
      await utils.expectEntityDetailVisible(page);
    });

    await test.step('预期 1：配额信息区「重置配额」被 v-has 隐藏，其余只读字段正常展示', async () => {
      await readonly.expectVHasHidden(
        utils.entityDetailResetQuotaBtn(page),
        '详情「重置配额」',
      );
      await utils.expectEntityDetailQuotaReadonlyFields(page);
    });

    await test.step('预期 3：Entity 详情不含密钥 / Key 字段（无掩码展示校验）', async () => {
      await utils.expectEntityDetailNoSecretFields(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});