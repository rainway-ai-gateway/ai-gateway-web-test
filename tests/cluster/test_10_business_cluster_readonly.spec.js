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
 * AI 业务集群 - 只读管理员视角 RM-BC-RO-01
 *
 * 覆盖用例（docs/business-cluster/02-功能测试用例/02f-只读视角.md）：
 * - RM-BC-RO-01 只读管理员视角-写按钮隐藏
 *   预期 1 列表页隐藏「添加集群」，操作列仅保留「详情」，编辑/删除隐藏
 *   预期 2 向导内隐藏「提交」，保留「下一步」
 *   预期 3 「详情」可正常打开，只读查看能力保留、无写按钮残留
 *   预期 4 系统管理员视角写按钮（添加集群 / 编辑 / 删除 / 提交）全部正常显示（对照组）
 *   预期 5 隐藏通过 `.v-has-hidden`（display:none !important）实现，与 v-show 共存不冲突；
 *          写操作在接口层由后端按角色强制拒绝
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录只读账号
 *   viewer（只写当前 page 的 localStorage，不写 auth.json，避免顶掉默认 admin 会话）。
 * - 只读导航只用 pages/resource/BusinessClusterPage.js 的 `gotoBusinessClusterPageReadonly`
 *   （直连 /cluster + 就绪断言），不触发 ensureSessionHealthy/ensureLoggedIn/handleUrlInvalidAlert
 *   会话自愈（见 utils/readonly.js 文件头约束 2）；只读断言全程只读、不写库。
 * - 只读态写入口被 v-has 隐藏 → 创建向导抽屉不会渲染，无法从 UI 进入；验收预期 2/5 需要
 *   在真实渲染的向导内观察「提交」的 `.v-has-hidden`，故按仓库既有 `__vue__` 手法把抽屉与
 *   步骤置位（只改 UI 状态，不发起写请求）；管理员对照用同一手法置位，两组唯一差异是角色。
 * - 后端拒绝语义按产品实测：HTTP 402 + `Authorizate Fail: Feature Access Deny`
 *   （ai-gateway-api `lib/xerror/resolve.go` etAuthorizateFail；`model/iauth/features.go`
 *   ScopeSystemReadonly 对 FeatureProductCluster 仅授 ActionRead → 写被拒）。
 *   02f 文档预期 5 写的 403 与实现不符，已在文档「自动化实现说明」登记。
 * - 文档预期 2 中的「取消」在产品 5 步向导内无对应按钮（底部只有 提交 / 下一步 / 上一步），
 *   退出向导由抽屉右上关闭入口承担，本 spec 按实际 UI 断言。
 *
 * 数据（策略见 02f-只读视角.md「测试数据」）：
 * - 只复用环境已有 AI 业务集群（`GET /clusters` 第 1 条），**不造数、不写库**，因此无清理动作；
 *   beforeAll 仅用独立 admin context（storageState=auth.json）读取目标集群名，不做任何写操作。
 * - 环境无任何集群时，用例 1 的前置断言失败并提示（前置条件：环境存在 ≥1 个集群）。
 *
 * 运行：nvm use 18 && npx playwright test tests/cluster/test_10_business_cluster_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/resource/ResourcePage');
const resourceApi = require('../../api/resource-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 只读用例共享数据：目标集群名（复用环境已有数据，不造数） */
let targetClusterName = null;

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

    const existing = await resourceApi.getClusterList(page);
    const list = Array.isArray(existing) ? existing : [];
    if (list.length > 0) {
      targetClusterName = list[0].name || list[0].Name;
    }
    common.log(
      '[beforeAll] 只读用例复用环境已有集群: ' +
        targetClusterName +
        '（共 ' +
        list.length +
        ' 个，本 spec 不造数、不写库）',
    );
  } catch (e) {
    common.log('[beforeAll] 前置数据读取异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('AI 业务集群 - RM-BC-RO-01 只读管理员视角-写按钮隐藏', () => {
  test('预期 1/3：只读视角列表页隐藏「添加集群」与行内「编辑/删除」、仅保留「详情」；管理员对照全部可见', async ({
    page,
  }) => {
    expect(
      targetClusterName,
      '前置条件：环境应存在 ≥1 个 AI 业务集群（02f 数据策略：复用环境已有数据，本 spec 不造数；环境无数据时请先造集群）',
    ).toBeTruthy();

    await test.step('管理员对照：列表页「添加集群」与行内「详情/编辑/删除」均可见可用', async () => {
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.expectBusinessClusterPageLayout(page);
      await readonly.expectAdminEnabled(
        utils.clusterListAddBtn(page),
        '添加集群',
      );
      await utils.ensureBusinessClusterRowVisibleByFilter(page, targetClusterName);
      await readonly.expectAdminVisible(
        utils.clusterRowAction(page, targetClusterName, '详情'),
        '行内「详情」',
      );
      await readonly.expectAdminVisible(
        utils.clusterRowAction(page, targetClusterName, '编辑'),
        '行内「编辑」',
      );
      await readonly.expectAdminVisible(
        utils.clusterRowAction(page, targetClusterName, '删除'),
        '行内「删除」',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入 AI 业务集群列表页并定位目标集群行', async () => {
      await utils.gotoBusinessClusterPageReadonly(page);
      expect(
        await utils.ensureBusinessClusterRowVisibleByFilter(
          page,
          targetClusterName,
        ),
        '只读视角应能筛选到目标集群行',
      ).toBe(true);
    });

    await test.step('预期 1：列表页「添加集群」仍渲染但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(utils.clusterListAddBtn(page), '添加集群');
    });

    await test.step('预期 1：操作列「编辑」「删除」仍渲染但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.clusterRowWriteBtn(page, targetClusterName, '编辑'),
        '行内「编辑」',
      );
      await readonly.expectVHasHidden(
        utils.clusterRowWriteBtn(page, targetClusterName, '删除'),
        '行内「删除」',
      );
    });

    await test.step('预期 1/3：操作列仅保留「详情」，且只读态可打开详情抽屉查看（无写按钮残留）', async () => {
      await readonly.expectReadonlyVisible(
        utils.clusterRowAction(page, targetClusterName, '详情'),
        '行内「详情」',
      );
      await utils.expectBusinessClusterDetailReadonly(page, targetClusterName);
      await utils.closeBusinessClusterDetail(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });

  test('预期 2/5：只读视角向导隐藏「提交」并保留「下一步」，v-has 与 v-show 共存；管理员对照「提交」可见可用', async ({
    page,
  }) => {
    await test.step('管理员对照：进入创建向导并置位到复查步骤，底部「提交」可见可用', async () => {
      await utils.gotoBusinessClusterManagementPage(page);
      await utils.expectBusinessClusterPageLayout(page);
      await utils.openCreateBusinessClusterDrawer(page);
      await utils.jumpClusterWizardToReviewStepByModel(page);
      await readonly.expectAdminEnabled(
        utils.clusterWizardSubmitBtn(page),
        '向导「提交」',
      );
      await utils.cancelCreateBusinessCluster(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('预期 2：只读态写入口隐藏，创建/编辑向导抽屉不渲染（无法从 UI 进入）', async () => {
      await utils.gotoBusinessClusterPageReadonly(page);
      await readonly.expectVHasHidden(utils.clusterListAddBtn(page), '添加集群');
      await readonly.expectAbsent(
        utils.clusterCreateWizardDrawer(page),
        '创建向导抽屉',
      );
      await readonly.expectAbsent(
        utils.clusterEditWizardDrawer(page),
        '编辑向导抽屉',
      );
    });

    await test.step('预期 2：向导内「提交」被 v-has 隐藏、「下一步」保留', async () => {
      await utils.openCreateBusinessClusterDrawerByModel(page);
      await readonly.expectVHasHidden(
        utils.clusterWizardSubmitBtn(page),
        '向导「提交」',
      );
      await readonly.expectReadonlyVisible(
        utils.clusterWizardNextBtn(page),
        '向导「下一步」',
      );
      await readonly.expectReadonlyVisible(
        utils.clusterWizardCloseBtn(page),
        '向导退出入口（抽屉关闭）',
      );
    });

    await test.step('预期 5：步骤推进到复查后「提交」仍带 .v-has-hidden 且不可见（v-show 与 v-has 共存不冲突）', async () => {
      await utils.jumpClusterWizardToReviewStepByModel(page);
      await readonly.expectVHasHidden(
        utils.clusterWizardSubmitBtn(page),
        '复查步骤「提交」',
      );
      await readonly.expectReadonlyVisible(
        utils.clusterWizardPrevBtn(page),
        '复查步骤「上一步」',
      );
    });

    await test.step('预期 5：写操作在接口层被后端按只读角色拒绝（探针：删除不存在的集群名，无副作用）', async () => {
      const probeName = 'readonly-probe-' + Date.now();
      const { status, body } = await utils.probeClusterDeleteAsReadonly(
        page,
        probeName,
      );
      expect(
        status,
        '只读角色写操作应被后端拒绝（402 Authorizate Fail）',
      ).toBe(utils.RO_WRITE_DENIED.status);
      expect(
        body.ErrMsg || '',
        '拒绝原因应为 Feature Access Deny',
      ).toContain(utils.RO_WRITE_DENIED.message);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});