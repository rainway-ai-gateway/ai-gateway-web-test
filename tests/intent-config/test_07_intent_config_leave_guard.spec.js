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
 * 意图配置 - 离开拦截与退出确认 IC-DR-01 ~ IC-DR-02
 *
 * 覆盖用例（docs/intent-config/02-功能测试用例/06-离开拦截与退出确认.md）：
 * - IC-DR-01 离开拦截：编辑模式且有未提交改动时点侧栏其它菜单 → 弹确认框
 *   （标题「信息提示」+ 正文 `.ivu-modal-confirm-body` = 「当前有未提交的改动，退出编辑模式将丢弃这些改动，确认退出？」）；
 *   取消 → 留在本页且 **URL 一字不变**、改动保留；确定 → 跳走到目标模块。另含负向对照：
 *   视图模式（无未提交改动）点同一菜单不弹确认框、直接放行。
 * - IC-DR-02 退出编辑模式二次确认：无改动 → 不弹确认直接回视图模式；
 *   有改动 → 弹确认，确定后回滚为进入编辑模式时的快照（阈值）并提示「已退出编辑模式」。
 *
 * 设计：
 * - 离开拦截**必须走应用内路由跳转**（侧栏菜单点击 → `$router.push`）才触发 `beforeRouteLeave`；
 *   `page.goto()` / 刷新是整页跳转，Vue 路由守卫不执行（见
 *   `pages/route/RoutePage.js`「SPA 的离开确认框不会拦硬跳转」），用硬跳转验证会得到假通过。
 * - 阈值期望值**不硬编码**：前置用 `GET /intent-config` 读环境快照 `min_confidence`，
 *   改动值取「快照 ≠ 0.6 ? 0.6 : 0.8」，回滚断言比对同一快照值，避免环境数据差异导致假失败/假通过。
 * - 数据：本 spec 全程只改本地草稿，**不点击「保存并发布」、不写后端**（用请求监听断言无
 *   `PUT /intent-config`）；`beforeAll` 用独立 admin context 读快照，**仅当环境为未发布（404）**时
 *   才 `PUT` 造数（0.6 + 空问题列表）并在 `afterAll` 还原，环境已发布则零写入复用。
 *
 * 运行：nvm use 18 && npx playwright test tests/intent-config/test_07_intent_config_leave_guard.spec.js
 * 注意：本 spec 必须**串行**执行（同工作区并行会话会互相顶掉会话，见
 * 2026-10-16-route-table-type-mapping 记录 §7 的同类现象）；只读视角不经本文件。
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/intent-config/IntentConfigPage');
const common = require('../../utils/common');

const P = utils.DOC_INTENT_CONFIG_PAGE;

/** 单例配置的原始状态快照（cleanup 句柄） */
let cleanup = null;
/** 是否由本 spec 造数（true 时 afterAll 必须还原） */
let seeded = false;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(utils.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await utils.ensureChineseLang(page);

    cleanup = utils.createIntentConfigTestCleanup();
    await cleanup.saveOriginalState(page);

    const current = await utils.getIntentConfigViaApi(page);
    if (current && current.published) {
      common.log(
        `[beforeAll] 复用环境已发布配置（min_confidence=${current.data.min_confidence}、` +
          `问题数=${(current.data.questions || []).length}），本 spec 不造数、不写后端`,
      );
      return;
    }

    // 环境未发布（GET 404）：本 spec 的前置要求「已发布配置可编辑」，
    // 故造数 { min_confidence: 0.6, questions: [] }，afterAll 按快照还原
    seeded = true;
    await utils.ensureIntentConfigPublishedViaApi(page, {
      minConfidence: 0.6,
      questions: [],
    });
    common.log(
      '[beforeAll] 环境未发布意图配置，已造数 { min_confidence: 0.6, questions: [] }',
    );
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!seeded || !cleanup) {
    common.log('[afterAll] 复用环境既有配置（未造数），无需还原');
    return;
  }
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(utils.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await cleanup.cleanup(page);
    common.log('[afterAll] 意图配置已还原 beforeAll 快照');
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

/**
 * 前置：进入意图配置页（视图模式）并读取环境快照阈值。
 * 返回 { snapshotThreshold, dirtyThreshold }（均为字符串，供 UI 文案/输入值断言直接使用）。
 */
async function enterPageAndReadSnapshot(page, trackerRef) {
  await utils.ensureAppSession(page);
  trackerRef.tracker = utils.trackIntentConfigRequests(page);
  await utils.gotoIntentConfigPageAndWaitForConfig(page);
  await utils.expectViewMode(page);

  const current = await utils.getIntentConfigViaApi(page);
  expect(
    current && current.published,
    '前置：意图配置应已发布（本 spec 的 beforeAll 已保证环境可用）',
  ).toBeTruthy();
  const snapshotThreshold = String(current.data.min_confidence);
  const dirtyThreshold = snapshotThreshold === '0.6' ? '0.8' : '0.6';
  common.log(
    `环境快照阈值=${snapshotThreshold}，本用例改动为=${dirtyThreshold}`,
  );
  return { snapshotThreshold, dirtyThreshold };
}

test.describe('意图配置 - IC-DR-01 离开拦截', () => {
  test('编辑模式有未提交改动时点侧栏其它菜单弹确认：取消留页且 URL 不变，确定跳走', async ({
    page,
  }) => {
    const ref = { tracker: null };
    let urlOnIntentConfig = null;
    let snapshotThreshold = null;
    let dirtyThreshold = null;

    await test.step('前置：进入意图配置页（视图模式）并读取环境快照阈值', async () => {
      const snap = await enterPageAndReadSnapshot(page, ref);
      snapshotThreshold = snap.snapshotThreshold;
      dirtyThreshold = snap.dirtyThreshold;
    });

    await test.step('负向对照：视图模式（无未提交改动）点侧栏其它菜单不弹确认，直接跳走', async () => {
      const target = await utils.clickOtherModuleMenuItemExpectNoModal(page);
      await utils.expectNavigatedToOtherModule(page, target.slug);
    });

    await test.step('回到意图配置页，进入编辑模式并改动全局阈值制造未提交改动', async () => {
      await utils.gotoIntentConfigPageAndWaitForConfig(page);
      await utils.expectViewMode(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.fillGlobalThreshold(page, dirtyThreshold);
      await utils.expectGlobalThresholdInputValue(page, dirtyThreshold);
      urlOnIntentConfig = utils.currentUrl(page);
      expect(
        urlOnIntentConfig,
        '前置：应停留在意图配置页',
      ).toContain(utils.INTENT_CONFIG_PATH);
    });

    await test.step('点侧栏其它菜单：弹出离开确认框，标题「信息提示」+ 正文为统一文案，此时尚未跳转', async () => {
      await utils.clickOtherModuleMenuItem(page);
      await utils.expectLeaveConfirmModal(page);
      // 路由被守卫挂起：确认框出现时 URL 仍是意图配置页
      await utils.expectUrlUnchanged(page, urlOnIntentConfig);
    });

    await test.step('点「取消」：弹窗关闭、留在本页、URL 一字不变、改动保留', async () => {
      await utils.cancelLeaveNavigation(page);
      await utils.expectStillOnIntentConfigPage(page, urlOnIntentConfig);
      await utils.expectEditMode(page);
      await utils.expectGlobalThresholdInputValue(page, dirtyThreshold);
    });

    await test.step('再次点侧栏其它菜单并点「确定」：放行跳转到目标模块', async () => {
      const target = await utils.clickOtherModuleMenuItem(page);
      await utils.expectLeaveConfirmModal(page);
      await utils.confirmLeaveNavigation(page);
      await utils.expectNavigatedToOtherModule(page, target.slug);
    });

    await test.step('全程本地草稿：无 PUT /intent-config 写入', async () => {
      await utils.expectNoIntentConfigMutationRequest(ref.tracker);
      ref.tracker.stop();
    });
  });
});

test.describe('意图配置 - IC-DR-02 退出编辑模式二次确认', () => {
  test('无改动不弹确认直接回视图模式；有改动弹确认、确定后回滚到快照并提示「已退出编辑模式」', async ({
    page,
  }) => {
    const ref = { tracker: null };
    let snapshotThreshold = null;
    let dirtyThreshold = null;

    await test.step('前置：进入意图配置页（视图模式）并读取环境快照阈值', async () => {
      const snap = await enterPageAndReadSnapshot(page, ref);
      snapshotThreshold = snap.snapshotThreshold;
      dirtyThreshold = snap.dirtyThreshold;
    });

    await test.step('进入编辑模式且不做任何改动，点「退出编辑模式」：不弹确认框，直接回视图模式', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.clickExitEditMode(page);
      await utils.expectNoModal(page);
      await utils.expectViewMode(page);
      await utils.expectGlobalThresholdText(page, snapshotThreshold);
    });

    await test.step('重新进入编辑模式并改动全局阈值制造未提交改动', async () => {
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await utils.fillGlobalThreshold(page, dirtyThreshold);
      await utils.expectGlobalThresholdInputValue(page, dirtyThreshold);
    });

    await test.step('点「退出编辑模式」：弹二次确认（正文为统一文案），确定前仍停留编辑模式', async () => {
      await utils.clickExitEditMode(page);
      await utils.expectLeaveConfirmModal(page);
      await utils.expectEditMode(page);
    });

    await test.step('点「确定」：提示「已退出编辑模式」、回视图模式、阈值回滚为快照值', async () => {
      await utils.expectIntentConfigMessageDuringAction(
        page,
        P.exitDoneMsg,
        async () => {
          await utils.confirmExitEditMode(page);
        },
      );
      await utils.expectViewMode(page);
      await utils.expectGlobalThresholdText(page, snapshotThreshold);
    });

    await test.step('全程本地草稿：无 PUT /intent-config 写入', async () => {
      await utils.expectNoIntentConfigMutationRequest(ref.tracker);
      ref.tracker.stop();
    });
  });
});