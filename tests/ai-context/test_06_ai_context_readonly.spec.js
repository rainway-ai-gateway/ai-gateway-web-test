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
 * AI 上下文压缩 - 只读管理员视角 AX-RO-01 ~ AX-RO-03
 *
 * 覆盖用例（docs/ai-context/02-功能测试用例/06-只读视角.md）：
 * - AX-RO-01 只读视角页头工具栏写按钮隐藏（进入编辑模式 / 添加规则 / 提交并生效）
 * - AX-RO-02 只读视角列表操作列写按钮隐藏、仅保留「查看」且可开只读抽屉
 * - AX-RO-03 只读视角「全局设置」Tab 编辑与保存按钮隐藏、查看态文案正常
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（不写 auth.json，避免覆盖默认 admin 会话）。
 * - 数据：压缩规则为集合级配置（PUT 整体替换），beforeAll 用独立 admin context
 *   「快照 → 补一条测试规则」，afterAll 整体还原快照；只读断言只读不写。
 * - 写入口判定依据 `src/modules/AIContext/index.vue`：页头两处 `.route-header-submit`
 *   挂 `v-has`（用 expectVHasHidden）；操作列写按钮、`drag-tip`、`SettingsView`
 *   由 `mode === 'view'` 分支收敛（只读恒 view → 不渲染，用 expectHidden）。
 *
 * 运行：nvm use 18 && npx playwright test tests/ai-context/test_06_ai_context_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/ai-context/AIContextPage');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 只读用例共享数据：目标压缩规则（无 name/id，cond 即身份） */
let targetCond = null;
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

    cleanup = utils.createAiContextTestCleanup();
    await cleanup.saveOriginalState(page);

    const rule = utils.buildTestRule();
    targetCond = rule.cond;
    await utils.ensureAiContextRuleExistsViaApi(page, rule);
    common.log('[beforeAll] 只读用例数据已就绪: cond=' + targetCond);
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
    common.log('[afterAll] 规则集合 / 全局设置已还原');
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('AI 上下文压缩 - AX-RO-01 只读视角页头工具栏写按钮隐藏', () => {
  test('只读视角隐藏页头全部写入口且页面恒停留视图模式；管理员可见「进入编辑模式」（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：页头「进入编辑模式」可见', async () => {
      await utils.gotoAiContextPage(page);
      await utils.expectAiContextPageReady(page);
      await readonly.expectAdminVisible(
        utils.ruleHeaderEnterEditBtn(page),
        '进入编辑模式',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入「压缩规则」Tab', async () => {
      await utils.gotoAiContextPageReadonly(page);
      await utils.expectAiContextPageReadyReadonly(page);
      await utils.expectActiveTab(page, utils.DOC_AI_CONTEXT_PAGE.tabRules);
    });

    await test.step('页头写入口区仍渲染但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.ruleHeaderSubmit(page),
        '规则页头写入口区',
      );
    });

    await test.step('「进入编辑模式」写入口不可见', async () => {
      await readonly.expectHidden(
        utils.ruleHeaderEnterEditBtn(page),
        '进入编辑模式',
      );
    });

    await test.step('「添加压缩规则」写入口不可见', async () => {
      await readonly.expectHidden(
        utils.ruleHeaderAddRuleBtn(page),
        '添加压缩规则',
      );
    });

    await test.step('页头不含「提交并生效」写入口', async () => {
      await readonly.expectHidden(
        utils.ruleHeaderSubmitAndEffectBtn(page),
        '提交并生效',
      );
    });

    await test.step('页面恒停留视图模式（编辑模式提示条不渲染）', async () => {
      await readonly.expectHidden(utils.rulesDragTip(page), '编辑模式提示条');
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('AI 上下文压缩 - AX-RO-02 只读视角列表操作列写按钮隐藏仅保留查看', () => {
  test('只读视角行内仅「查看」可开只读抽屉；管理员编辑模式下「编辑/删除」可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：进入编辑模式后行内「编辑/删除」可见', async () => {
      await utils.gotoAiContextPage(page);
      await utils.expectAiContextPageReady(page);
      expect(
        await utils.ensureRuleRowVisible(page, targetCond),
        '管理员视角应能检索到目标规则行',
      ).toBe(true);
      await utils.enterEditMode(page);
      await utils.expectRuleRowEditDeleteActions(page, targetCond);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入页面并定位目标规则行', async () => {
      await utils.gotoAiContextPageReadonly(page);
      expect(
        await utils.ensureRuleRowVisible(page, targetCond),
        '只读视角应能检索到目标规则行',
      ).toBe(true);
    });

    await test.step('操作列仅保留「查看」，不渲染「编辑」「删除」', async () => {
      await utils.expectRuleRowOnlyViewAction(page, targetCond);
    });

    await test.step('点击「查看」仍可打开只读抽屉（查看能力保留）', async () => {
      await utils.openViewRuleDrawer(page, targetCond);
      await utils.expectViewDrawerFieldLabels(page);
      await utils.closeViewDrawer(page);
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('AI 上下文压缩 - AX-RO-03 只读视角全局设置Tab编辑与保存按钮隐藏', () => {
  test('只读视角「全局设置」Tab 隐藏「编辑」且不出现「取消/保存」，查看态 8 项文案正常；管理员可见「编辑」（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：「全局设置」Tab 查看态「编辑」可见，且可进入编辑态出现「保存」', async () => {
      await utils.gotoAiContextPage(page);
      await utils.expectAiContextPageReady(page);
      await utils.switchToSettingsTab(page);
      await utils.expectSettingsViewMode(page);
      await utils.enterSettingsEditMode(page);
      await utils.expectSettingsEditMode(page);
      await utils.cancelSettingsEditMode(page);
      await utils.expectSettingsViewMode(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入「全局设置」Tab', async () => {
      await utils.gotoAiContextPageReadonly(page);
      await utils.switchToSettingsTab(page);
      await utils.expectSettingsViewLabels(page);
    });

    await test.step('全局设置页头写入口区被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        utils.settingsHeaderSubmit(page),
        '全局设置页头写入口区',
      );
      await readonly.expectHidden(
        utils.settingsHeaderEditBtn(page),
        '全局设置「编辑」',
      );
    });

    await test.step('不出现「取消」「保存」编辑态控件', async () => {
      await readonly.expectHidden(
        utils.settingsHeader(page).getByRole('button', {
          name: utils.DOC_AI_CONTEXT_SETTINGS.cancelButton,
          exact: true,
        }),
        '全局设置「取消」',
      );
      await readonly.expectHidden(
        utils.settingsHeader(page).getByRole('button', {
          name: utils.DOC_AI_CONTEXT_SETTINGS.saveButton,
          exact: true,
        }),
        '全局设置「保存」',
      );
    });

    await test.step('查看态 8 项设置纯文案（含 rewrite 嵌套两项）正常只读展示', async () => {
      await utils.expectSettingsViewLabels(page);
      await readonly.expectStillReadonly(page);
    });
  });
});