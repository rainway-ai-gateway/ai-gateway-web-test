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
 * 意图配置 - 只读管理员视角 IC-RO-01 ~ IC-RO-03
 *
 * 覆盖用例（docs/intent-config/02-功能测试用例/05-只读视角.md）：
 * - IC-RO-01 只读视角工具栏写按钮隐藏（「添加问题」/「进入编辑模式」隐藏，恒停留视图模式）
 * - IC-RO-02 只读视角问题行写按钮隐藏（「编辑」「删除」隐藏，保留「查看」并可开只读抽屉）
 * - IC-RO-03 只读视角模式切换与提交按钮隐藏（「退出编辑模式」「保存并发布」不出现、不发 PUT）
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（不写 auth.json，避免覆盖默认 admin 会话）。
 * - 只读断言按产品源码实现取断言口径（src/modules/IntentConfig/index.vue）：
 *   · 挂 `v-has` 的元素（`.ic-actions:22`、`.ic-list-toolbar:74`）→ `expectVHasHidden`
 *     （仍在 DOM + class 含 `.v-has-hidden` + 不可见）；
 *   · 由 `v-if`/`v-else`/`v-show` 模式收敛控制的元素
 *     （render 行操作 `index.vue:254` 恒走 `mode === 'view'` 分支、「退出编辑模式/保存并发布」
 *     走 `template v-else` `index.vue:28`）→ `expectHidden` / `expectAbsent`。
 * - 数据：意图配置为单例共享资源，beforeAll 用独立 admin context 读一次环境现状 ——
 *   已发布且 `questions` 非空则**直接复用、不造数、不清理**；为空/未发布才造数
 *   （choice + score 各 1 题），afterAll 用快照还原。
 *
 * 运行：nvm use 18 && npx playwright test tests/intent-config/test_06_intent_config_readonly.spec.js
 * 注意：本 spec 必须**串行**执行（`--workers=1` 或单独运行）。只读用例二次登录 viewer，
 * 而会话守卫 `ensureSessionHealthy` / `ensureLoggedIn` / `handleUrlInvalidAlert` 会以
 * conf.json 的 admin 凭证重登并回写 auth.json，并发跑多个进程会互相顶掉会话、把只读态
 * 换成管理员态，使断言失真（见 utils/readonly.js 文件头约束 2）。
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/intent-config/IntentConfigPage');
const apiUtils = require('../../api/intent-config-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 单例配置的原始状态快照（cleanup 句柄） */
let cleanup = null;
/** 是否由本 spec 造数（true 时 afterAll 必须还原快照） */
let dataInjected = false;

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
    await utils.ensureChineseLang(page);

    cleanup = apiUtils.createIntentConfigTestCleanup();
    await cleanup.saveOriginalState(page);

    const current = await apiUtils.fetchIntentConfigViaApi(page);
    const questions =
      current && current.published ? current.data.questions || [] : [];
    if (questions.length >= 1) {
      common.log(
        `[beforeAll] 复用环境已发布配置（问题数 ${questions.length}），本 spec 不造数`,
      );
      return;
    }

    // 环境为「未发布(404)」或「questions 为空数组（停用意图分类）」：造数保证
    // IC-RO-02「问题列表非空」前置（choice + score 各 1 题，覆盖两种类型展示）
    const questionsToPublish = [
      apiUtils.buildTestChoiceQuestion(),
      apiUtils.buildTestScoreQuestion(),
    ];
    dataInjected = true;
    await apiUtils.ensureIntentConfigPublishedViaApi(page, {
      minConfidence: 0.6,
      questions: questionsToPublish,
    });
    common.log('[beforeAll] 环境配置为空/未发布，已造数：choice + score 各 1 题');
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!dataInjected || !cleanup) {
    common.log('[afterAll] 复用环境既有配置（未造数），无需还原');
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
    await cleanup.cleanup(page);
    common.log('[afterAll] 意图配置已还原 beforeAll 快照');
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('意图配置 - IC-RO-01 意图配置页只读视角工具栏写按钮隐藏', () => {
  test('只读视角隐藏「添加问题」「进入编辑模式」且恒停留视图模式；管理员可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：「进入编辑模式」可见，「添加问题」在编辑模式可见', async () => {
      await utils.gotoIntentConfigPage(page);
      await utils.expectViewMode(page);
      await readonly.expectAdminVisible(
        utils.headerEnterEditBtn(page),
        '进入编辑模式',
      );
      await utils.enterEditMode(page);
      await readonly.expectAdminVisible(
        utils.questionToolbarAddBtn(page),
        '添加问题',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角直连 URL 进入意图配置页', async () => {
      await utils.gotoIntentConfigPageReadonly(page);
      await utils.expectIntentConfigPageReadyReadonly(page);
    });

    await test.step('「添加问题」工具栏容器被 v-has 隐藏、按钮不可见', async () => {
      await readonly.expectVHasHidden(
        utils.questionToolbar(page),
        '问题列表「添加问题」工具栏',
      );
      await readonly.expectHidden(
        utils.questionToolbarAddBtn(page),
        '添加问题',
      );
    });

    await test.step('页头写入口容器 .ic-actions 仍在 DOM 中但被 v-has 隐藏，「进入编辑模式」不可见', async () => {
      await readonly.expectVHasHidden(
        utils.headerActions(page),
        '意图配置页头写入口区',
      );
      await readonly.expectHidden(
        utils.headerEnterEditBtn(page),
        '进入编辑模式',
      );
    });

    await test.step('全局阈值以纯文案展示、问题表格展示正常（只读查看能力保留）', async () => {
      await utils.expectGlobalThresholdPureText(page);
      await utils.expectQuestionTableHeaders(page);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('意图配置 - IC-RO-02 意图配置页只读视角问题行写按钮隐藏', () => {
  test('只读视角问题行仅保留「查看」并可开只读抽屉；管理员编辑模式下「编辑/删除」可见（对照组）', async ({
    page,
  }) => {
    let questionName = null;

    await test.step('管理员对照：进入编辑模式后问题行「编辑/删除」可见', async () => {
      await utils.gotoIntentConfigPage(page);
      await utils.expectViewMode(page);
      questionName = (await utils.getQuestionNamesInOrder(page))[0];
      expect(questionName, '前置数据应至少包含 1 个问题').toBeTruthy();
      await utils.enterEditMode(page);
      await utils.expectQuestionRowEditDeleteActions(page, questionName);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面并定位目标问题行', async () => {
      await utils.gotoIntentConfigPageReadonly(page);
      questionName = (await utils.getQuestionNamesInOrder(page))[0];
      expect(questionName, '只读视角问题列表应非空').toBeTruthy();
      await utils.expectQuestionRowVisible(page, questionName);
      await readonly.expectStillReadonly(page);
    });

    await test.step('问题行操作列隐藏「编辑」「删除」写操作按钮', async () => {
      await readonly.expectHidden(
        utils.questionRowEditBtn(page, questionName),
        '问题行「编辑」',
      );
      await readonly.expectHidden(
        utils.questionRowDeleteBtn(page, questionName),
        '问题行「删除」',
      );
    });

    await test.step('问题行操作列保留「查看」只读入口', async () => {
      await readonly.expectReadonlyVisible(
        utils.questionRowViewBtn(page, questionName),
        '问题行「查看」',
      );
    });

    await test.step('点击「查看」打开只读抽屉：全字段纯文案、footer 隐藏', async () => {
      await utils.openViewQuestionDrawer(page, questionName);
      await utils.expectViewDrawerFieldLabels(page);
      await utils.expectViewDrawerNoInputs(page);
      await utils.expectViewDrawerNoFooterButtons(page);
      await utils.closeViewQuestionDrawer(page);
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('意图配置 - IC-RO-03 意图配置页只读视角模式切换与提交按钮隐藏', () => {
  test('只读视角不可进入编辑模式、「退出编辑模式/保存并发布」不出现且不发起 PUT；管理员链路正常（对照组）', async ({
    page,
  }) => {
    let tracker = null;

    await test.step('管理员对照：「进入编辑模式 → 保存并发布」链路正常可用', async () => {
      await utils.gotoIntentConfigPage(page);
      await utils.expectViewMode(page);
      await utils.enterEditMode(page);
      await utils.expectEditMode(page);
      await readonly.expectAdminEnabled(
        utils.headerSaveAndPublishBtn(page),
        '保存并发布',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入意图配置页（进入前开启变更请求监听）', async () => {
      tracker = utils.trackIntentConfigRequests(page);
      await utils.gotoIntentConfigPageReadonly(page);
      await utils.expectIntentConfigPageReadyReadonly(page);
    });

    await test.step('「进入编辑模式」不可见，无法进入编辑模式', async () => {
      await readonly.expectHidden(
        utils.headerEnterEditBtn(page),
        '进入编辑模式',
      );
    });

    await test.step('提交类写按钮「退出编辑模式」「保存并发布」均不出现', async () => {
      await readonly.expectAbsent(
        utils.headerExitEditBtn(page),
        '退出编辑模式',
      );
      await readonly.expectAbsent(
        utils.headerSaveAndPublishBtn(page),
        '保存并发布',
      );
    });

    await test.step('恒停留视图模式：页头写入口容器被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.headerActions(page),
        '意图配置页头写入口区',
      );
    });

    await test.step('只读视角不发起 PUT /intent-config 变更请求', async () => {
      await page.waitForTimeout(1000);
      expect(
        tracker.state.get,
        '只读视角应至少发起 1 次 GET /intent-config（证明监听已生效）',
      ).toBeGreaterThan(0);
      utils.expectNoIntentConfigMutationRequest(tracker);
      tracker.stop();
      await readonly.expectStillReadonly(page);
    });
  });
});