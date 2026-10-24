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
 * 流量镜像规则 - 只读管理员视角 TM-RO-01 ~ TM-RO-03
 *
 * 覆盖用例（docs/traffic-mirror/02-功能测试用例/05-只读视角.md）：
 * - TM-RO-01 只读视角页头工具栏写按钮隐藏（进入编辑模式 / 提交并生效）
 * - TM-RO-02 只读视角列表操作列写按钮隐藏、仅保留「查看」且可开只读抽屉
 * - TM-RO-03 只读视角「添加规则」「提交并生效」写入口不可达、仅保留查看与只读检索/排序
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（不写 auth.json，避免覆盖默认 admin 会话）。
 * - 数据策略：TM-RO-02/03 需集合内 ≥1 条镜像规则，文档「测试数据」写的是「存在 1 条以上」，
 *   故**优先复用环境已有规则**（取 GET /traffic-mirror-rules 首条为目标行）；仅当集合为空时
 *   才经 API 造 1 条测试规则兜底（镜像集群取 GET /clusters 首项，避免引用校验 422）。
 *   beforeAll 用独立 admin context 快照原集合，afterAll 用快照整体 PUT 还原（复用时为幂等写回）。
 * - 写入口判定依据 src/modules/TrafficMirror/index.vue：页头 `.route-header-submit` 挂 `v-has`
 *   （用 expectVHasHidden）；「添加规则」`v-show="mode === 'edit'"` + `v-has`、操作列编辑/删除
 *   分支 `mode === 'view'` 收敛、`.drag-tip` 用 `v-if="mode === 'edit'"`（只读恒停留视图模式 →
 *   不产出可见元素，用 expectHidden）。
 * - 只读路径**不得**调用 ensureSessionHealthy / handleUrlInvalidAlert / gotoTrafficMirrorPage：
 *   它们会以 conf.json 的 admin 凭证重登并回写 auth.json，把只读态悄悄换回管理员态（断言失真）。
 *
 * 运行：nvm use 18 && npx playwright test tests/traffic-mirror/test_06_traffic_mirror_rule_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/traffic-mirror/TrafficMirrorPage');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 只读用例共享数据：目标镜像规则名（复用环境已有规则，集合为空时兜底造数） */
let targetRuleName = null;
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

    cleanup = utils.createTrafficMirrorTestCleanup();
    await cleanup.saveOriginalState(page);

    const existing = (await utils.fetchTrafficMirrorRulesViaApi(page)) || [];
    if (existing.length > 0) {
      targetRuleName = existing[0].name;
      common.log('[beforeAll] 复用环境已有镜像规则: rule=' + targetRuleName);
    } else {
      const clusters = (await utils.fetchClusterNamesViaApi(page)) || [];
      const rule = utils.buildTestRule({ mirror_cluster: clusters[0] || '' });
      targetRuleName = rule.name;
      await utils.ensureTrafficMirrorRuleExistsViaApi(page, rule);
      common.log('[beforeAll] 集合为空，已造数镜像规则: rule=' + targetRuleName);
    }
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
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
    common.log('[afterAll] 流量镜像规则集合已还原');
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('流量镜像规则 - TM-RO-01 只读视角页头工具栏写按钮隐藏', () => {
  test('只读视角页头不显示「进入编辑模式」且不含「提交并生效」等写入口、恒停留视图模式；管理员可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照（预期3）：页头「进入编辑模式」可见', async () => {
      await utils.gotoTrafficMirrorPage(page);
      await utils.expectTrafficMirrorPageReady(page);
      await readonly.expectAdminVisible(
        utils.ruleHeaderEnterEditBtn(page),
        '进入编辑模式',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入流量镜像规则页', async () => {
      await utils.gotoTrafficMirrorPageReadonly(page);
      await utils.expectTrafficMirrorPageReadyReadonly(page);
    });

    await test.step('页头写入口区仍渲染但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.ruleHeaderSubmit(page),
        '页头写入口区',
      );
    });

    await test.step('预期1：页头不显示「进入编辑模式」按钮', async () => {
      await readonly.expectHidden(
        utils.ruleHeaderEnterEditBtn(page),
        '进入编辑模式',
      );
    });

    await test.step('预期2：页头不含「提交并生效」「退出编辑模式」等任何写入口', async () => {
      await readonly.expectHidden(
        utils.ruleHeaderSubmitAndEffectBtn(page),
        '提交并生效',
      );
      await readonly.expectHidden(
        utils.ruleHeaderExitEditBtn(page),
        '退出编辑模式',
      );
    });

    await test.step('预期2：页面恒停留视图模式（编辑模式提示条不渲染）', async () => {
      await readonly.expectHidden(utils.rulesDragTip(page), '编辑模式提示条');
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('流量镜像规则 - TM-RO-02 只读视角列表操作列写按钮隐藏仅保留查看', () => {
  test('只读视角操作列仅「查看」且可开只读抽屉；管理员编辑模式下「编辑/删除」可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照（预期4）：进入编辑模式后操作列「编辑/删除」可见', async () => {
      await utils.gotoTrafficMirrorPage(page);
      await utils.expectTrafficMirrorPageReady(page);
      expect(
        targetRuleName,
        '前置：环境内应存在至少 1 条镜像规则（TM-RO-02 前置）',
      ).toBeTruthy();
      expect(
        await utils.ensureRuleRowVisible(page, targetRuleName),
        '管理员视角应能检索到目标镜像规则行',
      ).toBe(true);
      await utils.enterEditMode(page);
      await utils.expectRuleRowEditDeleteActions(page, targetRuleName);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面并定位目标规则行', async () => {
      await utils.gotoTrafficMirrorPageReadonly(page);
      expect(
        await utils.ensureRuleRowVisible(page, targetRuleName),
        '只读视角应能检索到目标镜像规则行',
      ).toBe(true);
    });

    await test.step('预期1：操作列保留「查看」只读入口（不隐藏）', async () => {
      await readonly.expectReadonlyVisible(
        utils.ruleRowViewBtn(page, targetRuleName),
        '查看',
      );
    });

    await test.step('预期2：操作列不显示「编辑」「删除」等写操作按钮', async () => {
      await utils.expectRuleRowOnlyViewAction(page, targetRuleName);
    });

    await test.step('预期3：点击「查看」仍可打开只读抽屉，纯文案展示规则字段', async () => {
      await utils.openViewRuleDrawer(page, targetRuleName);
      await utils.expectViewDrawerFieldLabels(page);
      await utils.expectViewDrawerNoInputs(page);
      await utils.closeViewDrawer(page);
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('流量镜像规则 - TM-RO-03 只读视角添加规则与提交并生效写入口不可达', () => {
  test('只读视角「添加规则」「提交并生效」不可达且无写提交请求、仅保留查看与只读检索/排序；管理员可进入编辑模式并打开添加抽屉（对照组）', async ({
    page,
  }) => {
    let tracker = null;

    await test.step('管理员对照（预期4）：可进入编辑模式、打开「添加规则」抽屉并见「提交并生效」', async () => {
      await utils.gotoTrafficMirrorPage(page);
      await utils.expectTrafficMirrorPageReady(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.openAddRuleDrawer(page);
      await utils.closeRuleFormDrawer(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面（导航前挂载写请求监听）', async () => {
      tracker = utils.trackTrafficMirrorRuleRequests(page);
      await utils.gotoTrafficMirrorPageReadonly(page);
      await utils.expectTrafficMirrorPageReadyReadonly(page);
    });

    await test.step('预期1：页面恒停留视图模式，「添加规则」入口不可达', async () => {
      await readonly.expectHidden(
        utils.ruleHeaderAddRuleBtn(page),
        '添加规则',
      );
      await readonly.expectHidden(
        utils.ruleHeaderEnterEditBtn(page),
        '进入编辑模式',
      );
      await readonly.expectHidden(utils.rulesDragTip(page), '编辑模式提示条');
    });

    await test.step('预期2：「提交并生效」写按钮不可达，且无任何写提交路径（无 PUT）', async () => {
      await readonly.expectVHasHidden(
        utils.ruleHeaderSubmit(page),
        '页头写入口区',
      );
      await readonly.expectHidden(
        utils.ruleHeaderSubmitAndEffectBtn(page),
        '提交并生效',
      );
      await utils.expectNoRuleMutationRequest(tracker);
    });

    await test.step('预期3：视图模式下仅保留「查看」与只读检索/排序能力', async () => {
      expect(
        targetRuleName,
        '前置：环境内应存在至少 1 条镜像规则（TM-RO-03 预期3）',
      ).toBeTruthy();
      expect(
        await utils.ensureRuleRowVisible(page, targetRuleName),
        '只读视角应能检索到目标镜像规则行',
      ).toBe(true);
      await utils.expectRuleRowOnlyViewAction(page, targetRuleName);
      await utils.expectReadonlySearchAndSortRetained(page);
      tracker.stop();
      await readonly.expectStillReadonly(page);
    });
  });
});