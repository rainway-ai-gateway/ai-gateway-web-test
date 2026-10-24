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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 路由管理 - 只读管理员视角 RT-RO-01 ~ RT-RO-03
 *
 * 覆盖用例（docs/route-management/02-功能测试用例/06-只读视角.md）：
 * - RT-RO-01 路由表列表页只读视角仅保留查看
 * - RT-RO-02 路由规则详情页只读视角工具栏写按钮隐藏
 * - RT-RO-03 路由规则详情页只读视角规则行写按钮隐藏
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（只写当前 page 的 localStorage，不写 auth.json，避免覆盖默认 admin 会话）。
 * - 数据策略：**复用环境已有数据、零写入**——Global 路由表与其规则均为环境既有
 *   （see 模块索引「环境 Global 规则 `[global-default-rule, test, test123]`」）。
 *   `beforeAll` 用独立 admin context 只做只读快照（`createRouteTestCleanup`）并解析
 *   目标规则名，`afterAll` 校验快照未被改动（仅在确有改动时还原）；不造数、不落写请求。
 * - 只读路径只用 `utils/readonly.js`（直连 URL + 就绪断言）与只读控件/入口，
 *   **不调用** `ensureSessionHealthy` / `ensureLoggedIn` / `handleUrlInvalidAlert`：
 *   它们会以 conf.json 的 admin 凭证重登并回写 auth.json，把只读态换回管理员态。
 *
 * 断言与产品实现的对应（`expectVHasHidden` / `expectHidden` 的判定依据）：
 * - 列表「启用 / 停用」= `RouteTable/index.vue:148,154` 的 `directives: [{ name: 'has' }]`
 *   → 只读视角 DOM 常在、加 `.v-has-hidden`，用 `expectVHasHidden`；
 * - 详情「进入编辑模式」= `RouteTable/components/RouteRules.vue:30,33`（`v-if="mode === 'view'"` + `v-has`），
 *   只读视角无法离开视图模式 → DOM 常在，用 `expectVHasHidden`；
 * - 详情「添加规则」= `RouteRules.vue:72`（`v-show="mode === 'edit'"` + `v-has`）→ DOM 常在，用 `expectVHasHidden`；
 * - 详情「退出编辑模式 / 提交并生效」= `RouteRules.vue:37` 的 `v-if="mode !== 'view'"` 模板分支
 *   → 只读视角恒不渲染，用 `expectHidden`；
 * - 规则行「编辑 / 删除 / 复制」= `RouteRules.vue:296` 在视图模式下整个操作列只 render 一个「查看」按钮
 *   → 随模式收敛根本不渲染，用 `expectHidden`。
 *
 * 两条纪律（2026-10-16 批次失败后固化，详见 `pages/route/RoutePage.js` 只读块文件头）：
 * - **写入口一律用 `readonly.buttonByText`（CSS/文本）定位**：v-has 的 `display:none` 元素
 *   不在无障碍树里，`getByRole` 对隐藏写按钮恒为 count 0，会让 `expectVHasHidden`
 *   与「点开详情」类断言误报；只读视角保留可见的「查看」仍用 `getByRole`。
 * - **行内写入口以「行已渲染」为前提**：列表 `searchParams` 默认 `{ enabled: 'true' }`
 *   （`RouteTable/index.vue:75`）而环境路由表全为停用态 → 首屏列表为空，
 *   必须先用 `clearRouteTableStatusFilterReadonly` 清空「状态」筛选并硬校验数据行数 > 0
 *   （同 docs RT-L-17 / `test_06` 的既有坑）。
 *
 * RT-RO-02 预期 4 的对照组说明：「添加规则」与「进入编辑模式」在产品里是互斥的两个模式分支
 * （`v-show="mode === 'edit'"` vs `v-if="mode === 'view'"`），故对照组按模式分别断言：
 * 视图模式下「进入编辑模式」可见，点击进入编辑模式后「添加规则」「提交并生效」可见。
 *
 * 运行：nvm use 18 && npx playwright test tests/route/test_13_route_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/route/RoutePage');
const apiUtils = require('../../api/route-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 只读用例共享数据：beforeAll 解析出的环境既有 Global 规则 */
let globalRuleNames = [];
let targetRuleName = null;
/** Global 路由规则只读快照守卫（零写入校验 + 异常兜底还原） */
let cleanup = null;

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

    cleanup = apiUtils.createRouteTestCleanup();
    await cleanup.saveGlobalRouteRulesOriginalState(page);

    const globalTable = await apiUtils.findGlobalRouteTableViaApi(page);
    common.log('[beforeAll] 环境 Global 路由表: ' + JSON.stringify(globalTable));

    const rules = await utils.getGlobalRouteRulesViaApi(page);
    const list = Array.isArray(rules?.rules) ? rules.rules : [];
    globalRuleNames = list.map((rule) => rule.name);
    const withFallback = list.find(
      (rule) => Array.isArray(rule.fallbacks) && rule.fallbacks.length > 0,
    );
    targetRuleName = (withFallback || list[0] || {}).name || null;
    common.log(
      `[beforeAll] 复用环境 Global 规则 ${list.length} 条: ${globalRuleNames.join(', ')}；目标规则=${targetRuleName}`,
    );
  } catch (e) {
    common.log('[beforeAll] 前置快照异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!cleanup) return;
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
    await cleanup.cleanup(page);
    common.log('[afterAll] Global 路由规则只读快照校验/还原完成');
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('路由管理 - RT-RO-01 路由表列表页只读视角仅保留查看', () => {
  test('只读视角操作列「启用/停用」被 v-has 隐藏、「查看」保留且可进详情；管理员行内「启用/停用」可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：Global 行「启用 / 停用」可见', async () => {
      await utils.gotoRouteTableListPage(page);
      await utils.expectRouteTableListLayout(page);
      // 列表默认按「状态=启用」筛选（RouteTable/index.vue:75），环境路由表全为停用态；
      // 按行断言前先清空该只读筛选，否则行内「启用 / 停用」不进 DOM
      await utils.clearRouteTableStatusFilter(page);
      await utils.ensureRouteTableRowReachable(
        page,
        utils.routeTableGlobalRow(page),
      );
      await readonly.expectAdminVisible(
        utils.routeTableGlobalEnableBtn(page),
        'Global 行「启用」',
      );
      await readonly.expectAdminVisible(
        utils.routeTableGlobalDisableBtn(page),
        'Global 行「停用」',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入路由表列表页', async () => {
      await utils.gotoRouteTableListPageReadonly(page);
      await utils.expectRouteTableListPageReadyReadonly(page);
      // 前置数据：列表默认「状态=启用」而环境路由表全为停用 → 先清空该只读筛选，
      // 并硬校验数据行已渲染（否则行内「启用/停用」根本不进 DOM）
      await utils.clearRouteTableStatusFilterReadonly(page);
    });

    await test.step('预期 1：操作列「启用 / 停用」仍在 DOM 但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.routeTableGlobalEnableBtn(page),
        'Global 行「启用」',
      );
      await readonly.expectVHasHidden(
        utils.routeTableGlobalDisableBtn(page),
        'Global 行「停用」',
      );
    });

    await test.step('预期 2：操作列保留「查看」只读入口', async () => {
      await readonly.expectReadonlyVisible(
        utils.routeTableGlobalViewBtn(page),
        'Global 行「查看」',
      );
    });

    await test.step('预期 3：仅保留检索 / 筛选 / 分页只读控件，无新增 / 创建写入口', async () => {
      await readonly.expectReadonlyVisible(
        utils.routeTableTypeFilterSelect(page),
        '列表「路由表类型」筛选',
      );
      await readonly.expectReadonlyVisible(
        utils.routeTableOwnerSearchBox(page),
        '列表「路由表属主」搜索框',
      );
      await readonly.expectReadonlyVisible(
        utils.routeTablePager(page),
        '列表分页器',
      );
      await readonly.expectHidden(
        utils.routeTableListCreateEntries(page),
        '列表页新增 / 创建写入口',
      );
    });

    await test.step('预期 2（续）：点击「查看」可进入路由规则详情页', async () => {
      await utils.openGlobalRouteRulesDetailAsReadonly(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('路由管理 - RT-RO-02 路由规则详情页只读视角工具栏写按钮隐藏', () => {
  test('只读视角工具栏写按钮隐藏且恒停留视图模式；管理员视图模式「进入编辑模式」、编辑模式「添加规则/提交并生效」可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：视图模式「进入编辑模式」可见，进入编辑模式后「添加规则 / 提交并生效」可见', async () => {
      await utils.gotoRouteTableListPage(page);
      await utils.expectRouteTableListLayout(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.expectGlobalRouteTableDetailOpen(page);

      expect(
        targetRuleName,
        '前置：beforeAll 应解析出环境 Global 路由表规则（该路由表需已有 ≥1 条规则）',
      ).toBeTruthy();
      // 交叉校验：beforeAll 由接口解析出的规则确实在规则表格中（未找到会抛错）
      await utils.routeRuleRowIndexByName(page, targetRuleName);

      await readonly.expectAdminVisible(
        utils.routeRulesEnterEditBtn(page),
        '进入编辑模式',
      );
      await utils.enterRouteRulesEditMode(page);
      await readonly.expectAdminVisible(
        utils.routeRulesAddRuleBtn(page),
        '添加规则',
      );
      await readonly.expectAdminVisible(
        utils.routeRulesSubmitAndEffectBtn(page),
        '提交并生效',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 Global 路由规则详情页', async () => {
      await utils.gotoRouteTableListPageReadonly(page);
      await utils.expectRouteTableListPageReadyReadonly(page);
      await utils.openGlobalRouteRulesDetailAsReadonly(page);
      const names = await utils.getRuleNamesInOrder(page);
      expect(
        names.length,
        '前置：Global 路由表需已有 ≥1 条规则（doc RT-RO-02 前置条件 2）',
      ).toBeGreaterThan(0);
    });

    await test.step('预期 1：工具栏「添加规则」仍在 DOM 但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.routeRulesAddRuleBtn(page),
        '添加规则',
      );
    });

    await test.step('预期 2：工具栏「进入编辑模式」被 v-has 隐藏，页面恒停留视图模式、不出现「退出编辑模式」', async () => {
      await readonly.expectVHasHidden(
        utils.routeRulesEnterEditBtn(page),
        '进入编辑模式',
      );
      await readonly.expectHidden(
        utils.routeRulesExitEditBtn(page),
        '退出编辑模式',
      );
      await utils.expectRouteRulesViewModeReadonly(page);
    });

    await test.step('预期 3：不出现「提交并生效」提交类写按钮', async () => {
      await readonly.expectHidden(
        utils.routeRulesSubmitAndEffectBtn(page),
        '提交并生效',
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('路由管理 - RT-RO-03 路由规则详情页只读视角规则行写按钮隐藏', () => {
  test('只读视角规则行不渲染「编辑/删除」且保留「查看」可开含 fallbacks 的详情；管理员编辑模式行内「编辑/删除」可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：进入编辑模式后规则行「编辑 / 删除」可见', async () => {
      await utils.gotoRouteTableListPage(page);
      await utils.expectRouteTableListLayout(page);
      await utils.openGlobalRouteTableDetail(page);
      await utils.expectGlobalRouteTableDetailOpen(page);

      expect(
        targetRuleName,
        '前置：beforeAll 应解析出环境 Global 路由表规则（该路由表需已有 ≥1 条规则）',
      ).toBeTruthy();
      const idx = await utils.routeRuleRowIndexByName(page, targetRuleName);

      await utils.enterRouteRulesEditMode(page);
      await readonly.expectAdminVisible(
        utils.routeRulesRowEditBtn(page, idx),
        '规则行「编辑」',
      );
      await readonly.expectAdminVisible(
        utils.routeRulesRowDeleteBtn(page, idx),
        '规则行「删除」',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 Global 路由规则详情页', async () => {
      await utils.gotoRouteTableListPageReadonly(page);
      await utils.expectRouteTableListPageReadyReadonly(page);
      await utils.openGlobalRouteRulesDetailAsReadonly(page);
    });

    await test.step('预期 1：规则行操作列不渲染「编辑 / 删除」等写操作按钮', async () => {
      const names = await utils.getRuleNamesInOrder(page);
      expect(
        names.length,
        '前置：Global 路由表需已有 ≥1 条规则（doc RT-RO-03 前置条件 2）',
      ).toBeGreaterThan(0);
      const entries = [];
      names.forEach((_, i) => {
        entries.push([`第 ${i + 1} 行「编辑」`, utils.routeRulesRowEditBtn(page, i)]);
        entries.push([`第 ${i + 1} 行「删除」`, utils.routeRulesRowDeleteBtn(page, i)]);
        entries.push([`第 ${i + 1} 行「复制」`, utils.routeRulesRowCopyBtn(page, i)]);
      });
      await readonly.expectAllHidden(entries);
    });

    await test.step('预期 2：规则行保留「查看」，点击打开规则详情（含 fallbacks 展示）', async () => {
      const idx = await utils.findRuleIndexWithFallback(page);
      expect(
        idx,
        '规则表格应存在可定位的规则行（含 fallbacks 的行优先）',
      ).toBeGreaterThanOrEqual(0);
      await readonly.expectReadonlyVisible(
        utils.routeRulesRowViewBtn(page, idx),
        '规则行「查看」',
      );
      await utils.openViewRuleDrawerByRowIndex(page, idx);
      await utils.expectRuleViewDrawerReadyReadonly(page);
      await utils.expectRuleViewFallbackMatchesRow(page, idx);
      await utils.closeTopDrawer(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});