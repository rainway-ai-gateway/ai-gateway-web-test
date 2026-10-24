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
 * EPP 调度 - 只读管理员视角 EP-RO-01 ~ EP-RO-03
 *
 * 覆盖用例（docs/epp-pool/02-功能测试用例/03-只读视角.md）：
 * - EP-RO-01 只读视角 EPP 实例池编辑入口隐藏（「编辑池」v-has 隐藏；
 *   「添加组 / 添加实例 / 删除组 / 删除 / 保存」行内与写控件模式收敛不渲染；
 *   树形表格实例组 / 实例 ID / 主机 / 端口仅只读展示；管理员对照组可见写入口）
 * - EP-RO-02 只读视角 EPP 调度分配「覆写编辑」入口隐藏（操作列 v-has 隐藏，
 *   集群名称 / 实例组与统计汇总、空闲・未分配区域只读保留；
 *   管理员对照组操作列写入口可见可用）
 * - EP-RO-03 只读视角覆写抽屉「确认」不出现且不发起 epp-assignments 写请求
 *   （入口不可点击 → 抽屉未打开；管理员对照「覆写编辑 → 确认」链路可用）
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（不写 auth.json，避免覆盖默认 admin 会话）。
 * - 数据：**全部复用联调环境现有数据**（EP-RO-01 实例池 g-a/g-b/g-c，
 *   EP-RO-02/03 已分配 EPP 集群 ≥1 个）。beforeAll 仅用独立 admin context 做只读快照
 *   （GET /epp-pool、GET /epp-assignments）作为逐列对照基线，不造数、不写库；
 *   只读断言本身只读不写，因此没有 afterAll 还原步骤。
 * - 只读导航只用 `readonly.gotoAsReadonly` + 就绪断言，不触发会话自愈（会换回管理员态）。
 *
 * 运行：nvm use 18 && npx playwright test tests/epp-pool/test_03_epp_pool_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/resource/EppPoolPage');
const apiUtils = require('../../api/epp-pool-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 环境数据快照（只读获取，供只读视角逐列对照） */
let envPool = null;
let envAssignments = null;

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

    envPool = await apiUtils.getEppPool(page);
    envAssignments = await apiUtils.getEppAssignments(page);

    common.log(
      '[beforeAll] 环境数据快照: 实例组=[' +
        (envPool?.groups || []).map((g) => g.name).join(',') +
        '] 已分配集群=' +
        (envAssignments?.clusters || []).length +
        ' 未分配=' +
        (envAssignments?.unassigned_clusters || []).length +
        ' 空闲实例组=' +
        (envAssignments?.idle_groups || []).length,
    );
  } catch (e) {
    common.log('[beforeAll] 环境数据快照异常: ' + e.message);
  } finally {
    await context.close();
  }
});

// ═══════════════════════════════════════════════════════════════════
// EP-RO-01  只读视角 EPP 实例池编辑入口隐藏
// ═══════════════════════════════════════════════════════════════════
test.describe('EPP 实例池 - EP-RO-01 只读视角编辑入口隐藏', () => {
  test('只读视角隐藏「编辑池」并保留只读树形表格；管理员可见「编辑池/添加组/保存」（对照组）', async ({
    page,
  }) => {
    let targetGroup = null;

    await test.step('前置：取环境实例池首个实例组作为只读展示对照', async () => {
      targetGroup = (envPool?.groups || [])[0] || null;
      if (!targetGroup) {
        test.skip(
          true,
          '联调环境 EPP 实例池为空（GET /epp-pool 无实例组），无法验证只读展示',
        );
      }
    });

    await test.step('管理员对照：「编辑池」可见可用，进入编辑模式后「保存」「添加组」可见（预期 4）', async () => {
      await utils.gotoEppPoolPage(page);
      await readonly.expectAdminEnabled(utils.poolToolbarEditBtn(page), '编辑池');
      await utils.enterPoolEditMode(page);
      await readonly.expectAdminEnabled(utils.poolToolbarSaveBtn(page), '保存');
      await readonly.expectAdminVisible(utils.poolAddGroupBtn(page), '添加组');
      await utils.exitPoolEditMode(page);
      await readonly.expectAdminVisible(utils.poolToolbarEditBtn(page), '编辑池');
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角直连 URL 进入「资源管理 → EPP 调度」Tab1 实例池', async () => {
      await utils.gotoEppPoolPageReadonly(page);
      await utils.expectEppPoolPageReadyReadonly(page);
    });

    await test.step('页头工具栏写入口区仍渲染但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.poolToolbar(page),
        'Tab1 页头工具栏写入口区',
      );
    });

    await test.step('隐藏「编辑池」（预期 1）', async () => {
      await readonly.expectHidden(utils.poolToolbarEditBtn(page), '编辑池');
    });

    await test.step('隐藏「保存」「取消」「添加组」「添加实例」「删除组」「删除」写操作按钮（预期 3）', async () => {
      await readonly.expectAllHidden([
        ['保存', utils.poolToolbarSaveBtn(page)],
        ['取消', utils.poolToolbarCancelBtn(page)],
        ['添加组', utils.poolAddGroupBtn(page)],
        ['添加实例', utils.poolAddInstanceBtn(page)],
        ['删除组', utils.poolDeleteGroupBtn(page)],
        ['删除', utils.poolDeleteInstanceBtn(page)],
      ]);
    });

    await test.step('树形表格仅只读展示：无行内编辑控件，实例组名 / 实例 ID / 主机 / 端口可见（预期 2）', async () => {
      await readonly.expectAbsent(
        utils.poolInlineEditInputs(page),
        '表格行内编辑输入框',
      );
      await utils.expectPoolGroupReadonlyDisplay(page, targetGroup);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// EP-RO-02  只读视角 EPP 调度分配覆写编辑入口隐藏
// ═══════════════════════════════════════════════════════════════════
test.describe('EPP 调度分配 - EP-RO-02 只读视角覆写编辑入口隐藏', () => {
  test('只读视角操作列「覆写编辑」被 v-has 隐藏而各列只读保留；管理员操作列「覆写编辑」可见可用（对照组）', async ({
    page,
  }) => {
    let targetCluster = null;

    await test.step('前置：取环境首个已分配 EPP 集群作为行级对照', async () => {
      targetCluster = (envAssignments?.clusters || [])[0] || null;
      if (!targetCluster) {
        test.skip(
          true,
          '联调环境无已分配的 EPP 集群（GET /epp-assignments.clusters 为空），无法验证操作列只读表现',
        );
      }
    });

    await test.step('管理员对照：Tab2 列结构完整且行尾「覆写编辑」可见可用（预期 3）', async () => {
      await utils.gotoEppPoolPage(page);
      await utils.switchToAssignmentsTab(page);
      await utils.expectAssignmentTableHeaders(page);
      await readonly.expectAdminEnabled(
        utils.assignmentOverrideBtn(page, targetCluster.cluster),
        '覆写编辑',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 Tab2「EPP 调度分配」并定位目标集群行', async () => {
      await utils.gotoEppPoolPageReadonly(page);
      await utils.switchToAssignmentsTab(page);
      await utils.expectEppAssignmentsPageReadyReadonly(page);
      await utils.expectAssignmentRowVisible(page, targetCluster.cluster);
    });

    await test.step('操作列「覆写编辑」仍在 DOM 中且带 .v-has-hidden、不可见（预期 1）', async () => {
      await utils.expectAssignmentOverrideActionsHidden(page);
    });

    await test.step('集群名称 / 实例组列正常只读展示（预期 2）', async () => {
      await utils.expectAssignmentTableHeaders(page);
      await utils.expectAssignmentRowReadonlyDisplay(page, targetCluster);
    });

    await test.step('统计汇总与未分配 / 空闲区域只读展示保留（预期 2）', async () => {
      await utils.expectAssignmentSummaryReadonly(page, {
        assigned: (envAssignments.clusters || []).length,
        unassigned: (envAssignments.unassigned_clusters || []).length,
        idle: (envAssignments.idle_groups || []).length,
      });
      await utils.expectAssignmentIdleAreaReadonly(
        page,
        (envAssignments.idle_groups || []).length > 0,
      );
      await utils.expectAssignmentUnassignedAreaReadonly(
        page,
        (envAssignments.unassigned_clusters || []).length > 0,
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// EP-RO-03  只读视角覆写抽屉确认按钮隐藏
// ═══════════════════════════════════════════════════════════════════
test.describe('EPP 调度分配 - EP-RO-03 只读视角覆写抽屉确认按钮隐藏', () => {
  test('只读视角无法打开覆写抽屉、「确认」不出现且不发起 epp-assignments 写请求；管理员「覆写编辑→确认」可用（对照组）', async ({
    page,
  }) => {
    let targetCluster = null;
    let writeTracker = null;

    await test.step('前置：取环境首个已分配 EPP 集群作为覆写对照', async () => {
      targetCluster = (envAssignments?.clusters || [])[0] || null;
      if (!targetCluster) {
        test.skip(
          true,
          '联调环境无已分配的 EPP 集群（GET /epp-assignments.clusters 为空），无法验证覆写抽屉只读表现',
        );
      }
    });

    await test.step('管理员对照：「覆写编辑 → 确认」链路正常可用（预期 4）', async () => {
      await utils.gotoEppPoolPage(page);
      await utils.switchToAssignmentsTab(page);
      await utils.openAssignmentOverrideDrawer(page, targetCluster.cluster);
      await readonly.expectAdminEnabled(
        utils.assignmentOverrideConfirmBtn(page),
        '覆写抽屉「确认」',
      );
      await utils.closeAssignmentOverrideDrawer(page);
      await utils.expectAssignmentOverrideDrawerClosed(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 Tab2 并开始记录 epp-assignments 写请求', async () => {
      writeTracker = utils.trackEppAssignmentsWriteRequests(page);
      await utils.gotoEppPoolPageReadonly(page);
      await utils.switchToAssignmentsTab(page);
      await utils.expectEppAssignmentsPageReadyReadonly(page);
    });

    await test.step('尝试通过操作列入口打开覆写抽屉：无法打开（预期 1）', async () => {
      const clicked = await utils.attemptOpenAssignmentOverrideDrawer(page);
      expect(
        clicked,
        '只读视角「覆写编辑」入口不应可点击（应为 v-has 隐藏）',
      ).toBe(false);
      await utils.expectAssignmentOverrideDrawerClosed(page);
    });

    await test.step('抽屉内「确认」提交类写按钮不出现（预期 2）', async () => {
      await readonly.expectHidden(
        utils.assignmentOverrideConfirmBtn(page),
        '覆写抽屉「确认」',
      );
    });

    await test.step('只读视角未发起 epp-assignments 写请求（预期 3）', async () => {
      const writes = writeTracker.stop();
      expect(
        writes,
        '只读视角不应发起 epp-assignments 写请求（PUT/PATCH）',
      ).toEqual([]);
      await readonly.expectStillReadonly(page);
    });
  });
});