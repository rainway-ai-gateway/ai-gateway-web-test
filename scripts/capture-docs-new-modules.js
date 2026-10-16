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
 * 用户手册「新增模块」界面截图脚本
 *
 * 生成手册各章「截图待补清单」中缺失的截图（04 / 12 / 15 / 16 / 17 / 18 / 19 / 20 章），
 * 与既有 capture-docs-screenshots.js 保持同一约定：auth.json 登录态、lang=zh、
 * 输出目录 ../../ai-gateway-web/docs/zh-cn/images、1920x1080 列表截图视口。
 *
 * 运行（node 18）：
 *   cd ai-gateway-web-test
 *   source ~/.nvm/nvm.sh && nvm use 18
 *   TEST_BASE_URL=http://localhost:8180 node scripts/capture-docs-new-modules.js
 *   # 只跑某个模块：
 *   TEST_BASE_URL=http://localhost:8180 node scripts/capture-docs-new-modules.js --only=ai-cache
 *
 * 演示数据：统一 demo- 前缀（demo-provider / demo-cluster / demo-cache-* /
 * demo-mirror-* / demo-context-* / demo_intent_*），按既有 capture-docs-screenshots.js
 * 的约定保留在环境中（截图可复现）。
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const resourcePage = require('../pages/resource/ResourcePage');
const umUtils = require('../pages/user/UserPage');
const providerApi = require('../api/provider-api-utils');
const aiCachePage = require('../pages/ai-cache/AICachePage');
const trafficMirrorPage = require('../pages/traffic-mirror/TrafficMirrorPage');
const intentConfigPage = require('../pages/intent-config/IntentConfigPage');
const aiContextPage = require('../pages/ai-context/AIContextPage');
const reencryptPage = require('../pages/security/ReencryptSweepPage');
const reportPage = require('../pages/report/ReportPage');
const batchPage = require('../pages/batch-tasks/BatchTaskPage');
const aiCacheApi = require('../api/ai-cache-api-utils');
const trafficMirrorApi = require('../api/traffic-mirror-api-utils');
const intentConfigApi = require('../api/intent-config-api-utils');
const aiContextApi = require('../api/ai-context-api-utils');
const common = require('../utils/common');

const authPath = path.join(__dirname, '../auth.json');
const outputDir = path.join(
  __dirname,
  '../../ai-gateway-web/docs/zh-cn/images',
);
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8180';

// 与 capture-docs-screenshots.js 一致的演示数据约定
const DEMO_PROVIDER = 'demo-provider';
const DEMO_CLUSTER = 'demo-cluster';
const DEMO_MODEL = 'doubao-pro-32k';
const DEMO_BACKEND_ADDR = '172.19.1.187';
const DEMO_BACKEND_PORT = 13801;
const DEMO_MIRROR_CLUSTER = 'test';

// 只读管理员账号（文档约定凭证，见 01-login-and-user.md §1.2.6）
const READONLY_USER = { name: 'viewer', password: 'viewer123' };

const captured = [];
const skipped = [];

// ---------------------------------------------------------------------------
// 通用工具（对齐 capture-docs-screenshots.js）
// ---------------------------------------------------------------------------

/** 截图内容摘要（用于核对画面是否包含预期文案，非断言） */
async function digest(locator, maxChars = 700) {
  const text = await locator
    .innerText()
    .catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

async function screenshot(page, name, scope = null) {
  const filePath = path.join(outputDir, name);
  await page.screenshot({ path: filePath, fullPage: false });
  captured.push(name);
  const size = page.viewportSize();
  console.log(`Screenshot: ${name} [${size.width}x${size.height}]`);
  if (scope) {
    console.log(`  内容: ${await digest(scope)}`);
  }
}

async function screenshotElement(locator, name) {
  const filePath = path.join(outputDir, name);
  await locator.screenshot({ path: filePath });
  captured.push(name);
  const box = await locator.boundingBox().catch(() => null);
  const dim = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '?';
  console.log(`Element screenshot: ${name} [${dim}]`);
  console.log(`  内容: ${await digest(locator)}`);
}

async function setViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
}

async function safeClick(page, locator, label) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    common.log(`Clicked: ${label}`);
    await page.waitForTimeout(300);
    return true;
  }
  common.log(`Not visible, skipped: ${label}`);
  return false;
}

/** 清掉 ivu-message / ivu-notice 气泡，避免截图带出成功提示 */
async function dismissMessages(page) {
  for (let i = 0; i < 5; i += 1) {
    const count = await page
      .locator('.ivu-message, .ivu-notice')
      .count()
      .catch(() => 0);
    if (!count) {
      return;
    }
    await page.evaluate(() => {
      document
        .querySelectorAll('.ivu-message, .ivu-notice')
        .forEach((el) => el.remove());
    });
    await page.waitForTimeout(200);
  }
}

/** 等待加载遮罩消失（.ivu-spin / table loading） */
async function waitForSettle(page, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const busy = await page
      .locator('.ivu-spin-fix:visible, .ivu-loading-bar:visible')
      .count()
      .catch(() => 0);
    if (!busy) {
      break;
    }
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
}

async function preparePage(page) {
  await umUtils.dismissAuthAlertModal(page).catch(() => {});
  await umUtils.ensureLoggedIn(page).catch(() => {});
  await page.waitForTimeout(500);
}

async function closeVisibleModal(page) {
  const wrap = page.locator('.ivu-modal-wrap:visible').first();
  if (!(await wrap.isVisible().catch(() => false))) {
    return false;
  }
  const cancel = wrap.getByRole('button', { name: '取消' }).first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    await page.waitForTimeout(400);
    return true;
  }
  const close = wrap.locator('.ivu-modal-close').first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

/** 当前可见的抽屉内容容器（.ivu-drawer-content） */
function visibleDrawerContent(page) {
  return page.locator('.ivu-drawer-content:visible').last();
}

/** 把当前可见抽屉的 body 滚到顶部 */
async function scrollDrawerTop(page) {
  await page
    .locator('.ivu-drawer-body:visible')
    .last()
    .evaluate((el) => el.scrollTo(0, 0))
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function dismissAuthAlert(page) {
  await umUtils.dismissAuthAlertModal(page).catch(() => {});
  await umUtils.handleUrlInvalidAlert(page).catch(() => {});
}

/** 关闭编辑模式（若处于编辑模式）：退出编辑模式 → 确认「确定」 */
async function ensureViewMode(page, header, { exitLabel = '退出编辑模式' } = {}) {
  const exit = header.getByRole('button', { name: exitLabel, exact: true });
  if (!(await exit.isVisible().catch(() => false))) {
    return;
  }
  await exit.click();
  await page.waitForTimeout(500);
  const ok = page
    .locator('.ivu-modal-wrap:visible')
    .getByRole('button', { name: '确定' })
    .first();
  if (await ok.isVisible().catch(() => false)) {
    await ok.click();
    await page.waitForTimeout(800);
  }
  await dismissMessages(page);
}

// ---------------------------------------------------------------------------
// 演示数据
// ---------------------------------------------------------------------------

async function ensureDemoProvider(page) {
  await umUtils.ensureLoggedIn(page).catch(() => {});
  const names = await providerApi.getProviderNamesViaApi(page);
  if (names && names.includes(DEMO_PROVIDER)) {
    return;
  }
  const data = await providerApi.createProviderViaApi(page, {
    name: DEMO_PROVIDER,
    description: '演示用服务商',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    instance_pool: [
      { addr: DEMO_BACKEND_ADDR, port: DEMO_BACKEND_PORT, weight: 100 },
    ],
    models: [DEMO_MODEL],
    keys: [],
  });
  if (!data) {
    common.log('ensureDemoProvider: 服务商创建失败');
  }
}

/** AI 缓存规则集合：3 条，覆盖三种缓存键策略 / TTL 0 与正值 / 语义缓存开与关 */
async function ensureDemoAiCacheRules(page) {
  const rules = [
    {
      name: 'demo-cache-last-question',
      cond: 'req_path_in("/v1/chat/completions", false)',
      cache_key_strategy: 'lastQuestion',
      cache_ttl: 0,
      max_body_bytes: 1048576,
      max_value_bytes: 1048576,
      enable_semantic_cache: true,
    },
    {
      name: 'demo-cache-all-questions',
      cond: 'req_path_prefix_in("/v1/chat/completions", true)',
      cache_key_strategy: 'allQuestions',
      cache_ttl: 3600,
      max_body_bytes: 1048576,
      max_value_bytes: 1048576,
      enable_semantic_cache: false,
    },
    {
      name: 'demo-cache-bypass',
      cond: 'req_path_in("/v1/embeddings", false)',
      cache_key_strategy: 'disabled',
      cache_ttl: 0,
      max_body_bytes: 1048576,
      max_value_bytes: 1048576,
      enable_semantic_cache: false,
    },
  ];
  const current = (await aiCacheApi.fetchAiCacheRulesViaApi(page)) || [];
  const names = current.map((r) => r.name);
  const wanted = rules.map((r) => r.name);
  if (wanted.every((n) => names.includes(n))) {
    common.log('演示 AI 缓存规则已存在，跳过造数');
    return;
  }
  // 保留非演示规则，演示规则置于最前
  const keep = current.filter((r) => !wanted.includes(r.name));
  const ok = await aiCacheApi.putAiCacheRulesViaApi(page, [...rules, ...keep]);
  if (!ok) {
    common.log('演示 AI 缓存规则造数失败');
  }
}

/** 流量镜像规则集合：3 条，覆盖头部剔除三态 */
async function ensureDemoTrafficMirrorRules(page) {
  const rules = [
    {
      name: 'demo-mirror-new-model',
      cond: 'req_path_prefix_in("/v1/chat/completions", true) && req_body_json_in("model", "doubao-pro-32k", false)',
      mirror_cluster: DEMO_MIRROR_CLUSTER,
      percentage: 10,
      set_headers: { 'X-Shadow-Env': 'pre-release' },
      body_rewrites: [{ path: 'model', value: 'doubao-pro-32k-shadow' }],
    },
    {
      name: 'demo-mirror-fallback-drill',
      cond: 'req_path_in("/v1/embeddings", false)',
      mirror_cluster: DEMO_MIRROR_CLUSTER,
      percentage: 1,
      remove_headers: [
        'Authorization',
        'Cookie',
        'X-Api-Key',
        'X-Custom-Secret',
      ],
    },
    {
      name: 'demo-mirror-standby',
      cond: 'default_t()',
      mirror_cluster: DEMO_MIRROR_CLUSTER,
      percentage: 100,
      remove_headers: [],
      path_rewrite: '/v1/internal/chat/completions',
    },
  ];
  const current = (await trafficMirrorApi.fetchTrafficMirrorRulesViaApi(page)) || [];
  const names = current.map((r) => r.name);
  const wanted = rules.map((r) => r.name);
  if (wanted.every((n) => names.includes(n))) {
    common.log('演示流量镜像规则已存在，跳过造数');
    return;
  }
  const keep = current.filter((r) => !wanted.includes(r.name));
  const ok = await trafficMirrorApi.putTrafficMirrorRulesViaApi(page, [
    ...rules,
    ...keep,
  ]);
  if (!ok) {
    common.log('演示流量镜像规则造数失败（镜像集群 ' + DEMO_MIRROR_CLUSTER + ' 是否存在？）');
  }
}

/** 意图配置：0.6 + choice 1 题 + score 1 题 */
async function ensureDemoIntentConfig(page) {
  const questions = [
    {
      name: 'demo_task_type',
      type: 'choice',
      instructions: '判断用户请求属于哪一类任务',
      criteria: {
        coding: '编写或修改代码',
        qa: '知识问答与检索',
        doc: '撰写文档或总结',
      },
    },
    {
      name: 'demo_complexity',
      type: 'score',
      instructions: '评估请求的复杂度档位',
      levels: [
        { name: 'simple', description: '单步即可完成' },
        { name: 'medium', description: '需要多步推理' },
        { name: 'complex', description: '需深度推理与多轮工具调用' },
      ],
    },
  ];
  const res = await intentConfigApi.fetchIntentConfigViaApi(page);
  const published = res && res.published ? res.data : null;
  const names = published ? published.questions.map((q) => q.name) : [];
  if (names.includes('demo_task_type') && names.includes('demo_complexity')) {
    common.log('演示意图配置已发布，跳过造数');
    return;
  }
  const keep = published
    ? published.questions.filter(
        (q) => q.name !== 'demo_task_type' && q.name !== 'demo_complexity',
      )
    : [];
  const ok = await intentConfigApi.putIntentConfigViaApi(page, {
    min_confidence: 0.6,
    questions: [...questions, ...keep],
  });
  if (!ok) {
    common.log('演示意图配置造数失败');
  }
}

/** AI 上下文压缩规则集合：4 条，覆盖四种压缩档位（含 off 与 0 预算） */
async function ensureDemoAiContextRules(page) {
  const rules = [
    {
      cond: 'req_path_in("/v1/chat/completions", false)',
      mode: 'off',
      max_context_tokens: 0,
      reserve_tokens: 0,
    },
    {
      cond: 'req_path_prefix_in("/v1/chat/completions", true)',
      mode: 'conservative',
      max_context_tokens: 131072,
      reserve_tokens: 8192,
    },
    {
      cond: 'req_body_json_in("model", "doubao-pro-32k", false)',
      mode: 'balanced',
      max_context_tokens: 32768,
      reserve_tokens: 4096,
    },
    {
      cond: 'default_t()',
      mode: 'aggressive',
      max_context_tokens: 0,
      reserve_tokens: 0,
    },
  ];
  const current = (await aiContextApi.fetchAiContextRulesViaApi(page)) || [];
  const conds = current.map((r) => r.cond);
  if (rules.every((r) => conds.includes(r.cond))) {
    common.log('演示 AI 上下文压缩规则已存在，跳过造数');
    return;
  }
  const wanted = rules.map((r) => r.cond);
  const keep = current.filter((r) => !wanted.includes(r.cond));
  const ok = await aiContextApi.putAiContextRulesViaApi(page, [...rules, ...keep]);
  if (!ok) {
    common.log('演示 AI 上下文压缩规则造数失败');
  }
}

// ---------------------------------------------------------------------------
// 04 章：AI 业务集群 EPP 配置 / EPP 运行时参数
// ---------------------------------------------------------------------------

async function gotoClusterPageWithSessionRetry(page) {
  for (let i = 0; i < 3; i++) {
    await resourcePage.gotoBusinessClusterManagementPage(page);
    const handled = await umUtils
      .dismissAuthAlertModal(page)
      .catch(() => false);
    if (!handled) {
      return;
    }
    await umUtils.ensureLoggedIn(page).catch(() => {});
    common.log('会话修复后重新导航到集群页');
  }
}

async function captureClusterEppScreenshots(page) {
  common.log('=== 04 章：AI 业务集群 EPP 配置 ===');
  await preparePage(page);
  await ensureDemoProvider(page);
  await gotoClusterPageWithSessionRetry(page);
  await closeVisibleModal(page);

  await resourcePage.openCreateBusinessClusterDrawer(page);
  await page.waitForTimeout(600);
  await resourcePage.fillBasicStep(page, {
    clusterName: DEMO_CLUSTER,
    protocol: 'https',
    stickySessionsEnabled: '停用',
  });
  await page.waitForTimeout(400);
  await resourcePage.clickWizardNext(page); // 超时和重传
  await resourcePage.clickWizardNext(page); // 被动健康检查
  await resourcePage.clickWizardNext(page); // 大模型配置
  await page.waitForTimeout(1200);

  try {
    await resourcePage.fillModelStep(page, {
      provider: DEMO_PROVIDER,
      modelName: DEMO_MODEL,
      stripPrefix: false,
    });
  } catch (e) {
    common.log('fillModelStep failed (non-critical): ' + e.message);
  }
  await page.waitForTimeout(600);

  await resourcePage.setBalanceMode(page, 'EPP');
  await page.waitForTimeout(800);

  // 视口拉高，保证卡片完整排版（卡片截图为整卡元素）
  await setViewport(page, 1600, 1600);
  await dismissMessages(page);

  const balanceCard = resourcePage.balanceModeCard(page);
  await balanceCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await screenshotElement(balanceCard, '04-cluster-epp-config.png');

  const runtimeCard = resourcePage.eppRuntimeCard(page);
  await runtimeCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await screenshotElement(runtimeCard, '04-cluster-epp-runtime.png');

  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭集群创建抽屉',
  );
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------------------
// 12 章：数据报表全局过滤栏
// ---------------------------------------------------------------------------

async function captureReportFilterBar(page) {
  common.log('=== 12 章：数据报表全局过滤栏 ===');
  await preparePage(page);
  await reportPage.gotoReportPage(page);
  await page.waitForTimeout(2500);
  await dismissAuthAlert(page);
  await dismissMessages(page);
  await waitForSettle(page);

  const bar = reportPage.filterBar(page);
  await bar.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await screenshotElement(bar, '14-report-filter-bar.png');
  common.log('注：本环境无报表流量数据，模型/Host 等多选下拉无可选项，未保留下拉展开态');
}

// ---------------------------------------------------------------------------
// 15 章：AI 缓存规则
// ---------------------------------------------------------------------------

async function captureAiCacheScreenshots(page) {
  common.log('=== 15 章：AI 缓存规则 ===');
  await preparePage(page);
  await ensureDemoAiCacheRules(page);

  await aiCachePage.gotoAiCachePageAndWaitForRules(page);
  await page.waitForTimeout(1200);
  await dismissAuthAlert(page);
  await aiCachePage.switchToRulesTab(page);
  await ensureViewMode(page, aiCachePage.ruleHeader(page));
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1920, 1080);
  await screenshot(page, '15-ai-cache-list.png', page.locator('.ai-cache'));

  // 添加缓存规则抽屉（编辑模式）
  await aiCachePage.enterEditMode(page);
  await page.waitForTimeout(400);
  await aiCachePage.openAddRuleDrawer(page);
  await aiCachePage.fillRuleName(page, 'demo-cache-new-rule');
  await aiCachePage.fillRuleCond(
    page,
    'req_path_in("/v1/chat/completions", false)',
  );
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1400);
  await scrollDrawerTop(page);
  await dismissMessages(page);
  await screenshotElement(visibleDrawerContent(page), '15-ai-cache-rule-form.png');
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭添加缓存规则抽屉',
  );
  await page.waitForTimeout(500);

  // 查看缓存规则抽屉（缓存豁免一条）
  await ensureViewMode(page, aiCachePage.ruleHeader(page));
  await aiCachePage.openViewRuleDrawer(page, 'demo-cache-bypass');
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1200);
  await dismissMessages(page);
  await screenshotElement(visibleDrawerContent(page), '15-ai-cache-rule-view.png');
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭查看缓存规则抽屉',
  );
  await page.waitForTimeout(500);

  // 语义设置（按环境实际值截图，不做临时改写）
  await aiCachePage.switchToSemanticTab(page);
  await page.waitForTimeout(1000);
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1600, 1000);
  await screenshotElement(
    aiCachePage.semanticPane(page),
    '15-ai-cache-semantic.png',
  );
  await setViewport(page, 1920, 1080);
}

// ---------------------------------------------------------------------------
// 16 章：流量镜像规则
// ---------------------------------------------------------------------------

async function captureTrafficMirrorScreenshots(page) {
  common.log('=== 16 章：流量镜像规则 ===');
  await preparePage(page);
  await ensureDemoTrafficMirrorRules(page);

  await trafficMirrorPage.gotoTrafficMirrorPageAndWaitForRules(page);
  await page.waitForTimeout(1200);
  await dismissAuthAlert(page);
  await ensureViewMode(page, trafficMirrorPage.ruleHeader(page));
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1920, 1080);
  await screenshot(page, '16-traffic-mirror-list.png', page.locator('.traffic-mirror'));

  // 编辑模式
  await trafficMirrorPage.enterEditMode(page);
  await page.waitForTimeout(600);
  await dismissMessages(page);
  await screenshot(page, '16-traffic-mirror-edit-mode.png', page.locator('.traffic-mirror'));

  // 添加镜像规则抽屉（头部剔除策略=自定义剔除列表）
  await trafficMirrorPage.openAddRuleDrawer(page);
  await trafficMirrorPage.fillRuleName(page, 'demo-mirror-new');
  await trafficMirrorPage.fillRuleCond(
    page,
    'req_path_in("/v1/chat/completions", false)',
  );
  await trafficMirrorPage.selectMirrorCluster(page, DEMO_MIRROR_CLUSTER);
  await trafficMirrorPage.selectHeaderMode(
    page,
    trafficMirrorPage.DOC_TM_RULE_FORM.headerModeCustom,
  );
  await trafficMirrorPage.fillCustomRemoveHeaders(
    page,
    'Authorization,Cookie,X-Api-Key',
  );
  await trafficMirrorPage.clickAddSetHeader(page);
  await trafficMirrorPage.fillSetHeaderRow(page, 0, 'X-Shadow-Env', 'pre-release');
  await trafficMirrorPage.clickAddBodyRewrite(page);
  await trafficMirrorPage.fillBodyRewriteRow(page, 0, 'doubao-pro-32k-shadow');
  await trafficMirrorPage.fillPathRewrite(page, '/v1/internal/chat/completions');
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1500);
  await scrollDrawerTop(page);
  await dismissMessages(page);
  await screenshotElement(visibleDrawerContent(page), '16-traffic-mirror-form.png');
  await setViewport(page, 1920, 1080);

  // 本地保存（仅本地编辑态，不提交生效），用于拍「退出编辑模式」二次确认弹窗
  await trafficMirrorPage.submitRuleFormAndWait(page);
  await page.waitForTimeout(800);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭添加镜像规则抽屉',
  );
  await page.waitForTimeout(500);

  // 退出编辑模式二次确认弹窗（附带产出，非清单必填）
  const exitBtn = trafficMirrorPage
    .ruleHeader(page)
    .getByRole('button', { name: '退出编辑模式', exact: true });
  if (await exitBtn.isVisible().catch(() => false)) {
    await exitBtn.click();
    await page.waitForTimeout(600);
    const modal = page.locator('.ivu-modal-wrap:visible').first();
    if (await modal.isVisible().catch(() => false)) {
      await screenshot(page, '16-traffic-mirror-exit-confirm.png', modal);
      await safeClick(
        page,
        modal.getByRole('button', { name: '取消' }).first(),
        '取消退出编辑模式',
      );
      await page.waitForTimeout(500);
    } else {
      common.log('退出编辑模式未出现二次确认弹窗（无未提交改动？）');
    }
  }

  // 查看镜像规则抽屉
  await ensureViewMode(page, trafficMirrorPage.ruleHeader(page));
  await trafficMirrorPage.openViewRuleDrawer(page, 'demo-mirror-new-model');
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1200);
  await dismissMessages(page);
  await screenshotElement(visibleDrawerContent(page), '16-traffic-mirror-view.png');
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭查看镜像规则抽屉',
  );
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// 17 章：意图配置
// ---------------------------------------------------------------------------

async function captureIntentConfigScreenshots(page) {
  common.log('=== 17 章：意图配置 ===');
  await preparePage(page);
  await ensureDemoIntentConfig(page);

  await intentConfigPage.gotoIntentConfigPageAndWaitForConfig(page);
  await page.waitForTimeout(1200);
  await dismissAuthAlert(page);
  await ensureViewMode(page, intentConfigPage.headerActions(page));
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1920, 1080);
  await screenshot(page, '17-intent-config-list.png', page.locator('.intent-config'));

  // 编辑模式
  await intentConfigPage.enterEditMode(page);
  await page.waitForTimeout(600);
  await dismissMessages(page);
  await screenshot(page, '17-intent-config-edit-mode.png', page.locator('.intent-config'));

  // 添加问题抽屉（choice）
  await intentConfigPage.openAddQuestionDrawer(page);
  await intentConfigPage.selectQuestionType(
    page,
    intentConfigPage.DOC_INTENT_CONFIG_QUESTIONS.typeChoice,
  );
  await intentConfigPage.fillQuestionName(page, 'demo_doc_type');
  await intentConfigPage.fillQuestionInstructions(
    page,
    '判断用户请求需要产出的文档类型',
  );
  await intentConfigPage.clickAddOption(page);
  await intentConfigPage.fillOptionRow(page, 0, 'api', '接口文档');
  await intentConfigPage.clickAddOption(page);
  await intentConfigPage.fillOptionRow(page, 1, 'guide', '操作指南');
  await intentConfigPage.clickAddOption(page);
  await intentConfigPage.fillOptionRow(page, 2, 'faq', '常见问题');
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1400);
  await scrollDrawerTop(page);
  await dismissMessages(page);
  await screenshotElement(
    visibleDrawerContent(page),
    '17-intent-config-question-form.png',
  );
  const optionValues = await intentConfigPage
    .optionRows(page)
    .locator('input')
    .evaluateAll((els) => els.map((el) => el.value));
  common.log('  选项行回显: ' + JSON.stringify(optionValues));
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭添加问题抽屉',
  );
  await page.waitForTimeout(500);

  // 查看问题抽屉（score，含档位）
  await ensureViewMode(page, intentConfigPage.headerActions(page));
  await intentConfigPage.openViewQuestionDrawer(page, 'demo_complexity');
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1200);
  await dismissMessages(page);
  await screenshotElement(
    visibleDrawerContent(page),
    '17-intent-config-question-view.png',
  );
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭查看问题抽屉',
  );
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// 18 章：AI 上下文压缩
// ---------------------------------------------------------------------------

async function captureAiContextScreenshots(page) {
  common.log('=== 18 章：AI 上下文压缩 ===');
  await preparePage(page);
  await ensureDemoAiContextRules(page);

  await aiContextPage.gotoAiContextPageAndWaitForRules(page);
  await page.waitForTimeout(1200);
  await dismissAuthAlert(page);
  await aiContextPage.switchToRulesTab(page);
  await ensureViewMode(page, aiContextPage.ruleHeader(page));
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1920, 1080);
  await screenshot(page, '18-ai-context-rules-list.png', page.locator('.ai-context'));

  // 添加压缩规则抽屉（编辑模式）
  await aiContextPage.enterEditMode(page);
  await page.waitForTimeout(400);
  await aiContextPage.openAddRuleDrawer(page);
  await aiContextPage.fillRuleCond(
    page,
    'req_path_in("/v1/chat/completions", false)',
  );
  await aiContextPage.selectRuleFormMode(
    page,
    aiContextPage.DOC_AI_CONTEXT_RULES.modeBalanced,
  );
  await aiContextPage.fillRuleFormNumber(
    page,
    aiContextPage.DOC_AI_CONTEXT_RULE_FORM.maxTokensFieldLabel,
    32768,
  );
  await aiContextPage.fillRuleFormNumber(
    page,
    aiContextPage.DOC_AI_CONTEXT_RULE_FORM.reserveTokensFieldLabel,
    4096,
  );
  await page.waitForTimeout(500);

  // 抽屉 60% 宽会盖住页头按钮：先判断页头按钮是否仍可见，决定整页还是元素截图
  const addBtn = aiContextPage
    .ruleHeader(page)
    .getByRole('button', { name: '添加规则', exact: true });
  const exitBtn = aiContextPage
    .ruleHeader(page)
    .getByRole('button', { name: '退出编辑模式', exact: true });
  const drawerBox = await visibleDrawerContent(page).boundingBox().catch(() => null);
  const addBox = await addBtn.boundingBox().catch(() => null);
  const headerVisible =
    !!drawerBox && !!addBox && addBox.x + addBox.width <= drawerBox.x;
  common.log('18 章抽屉与页头按钮是否同框可见: ' + headerVisible);

  await setViewport(page, 1600, 1400);
  await scrollDrawerTop(page);
  await dismissMessages(page);
  if (headerVisible && (await exitBtn.isVisible().catch(() => false))) {
    await setViewport(page, 1920, 1080);
    await screenshot(
      page,
      '18-ai-context-rule-drawer.png',
      page.locator('.ai-context'),
    );
    // 抽屉内 4 个字段与页头按钮是否都在视口内（整页截图不裁切）
    const drawerFields = await visibleDrawerContent(page)
      .locator('.ivu-form-item')
      .allInnerTexts();
    common.log('  抽屉字段: ' + drawerFields.join(' | ').replace(/\s+/g, ' '));
  } else {
    await screenshotElement(
      visibleDrawerContent(page),
      '18-ai-context-rule-drawer.png',
    );
  }
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭添加压缩规则抽屉',
  );
  await page.waitForTimeout(500);

  // 查看压缩规则抽屉
  await ensureViewMode(page, aiContextPage.ruleHeader(page));
  await aiContextPage.openViewRuleDrawer(
    page,
    'req_path_prefix_in("/v1/chat/completions", true)',
  );
  await page.waitForTimeout(500);
  await setViewport(page, 1600, 1200);
  await dismissMessages(page);
  await screenshotElement(
    visibleDrawerContent(page),
    '18-ai-context-rule-view.png',
  );
  await setViewport(page, 1920, 1080);
  await safeClick(
    page,
    page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
    '关闭查看压缩规则抽屉',
  );
  await page.waitForTimeout(500);

  // 全局设置（编辑态，8 个控件）
  await aiContextPage.switchToSettingsTab(page);
  await page.waitForTimeout(1000);
  await waitForSettle(page);
  await dismissMessages(page);
  await aiContextPage.enterSettingsEditMode(page);
  await page.waitForTimeout(600);
  await setViewport(page, 1920, 1500);
  await scrollDrawerTop(page);
  await dismissMessages(page);
  await screenshotElement(
    aiContextPage.settingsPane(page),
    '18-ai-context-global-settings.png',
  );
  // 记录 8 个控件的回显值（数值型为 input value，不在 innerText 中）
  const numericValues = await aiContextPage
    .settingsPane(page)
    .locator('input')
    .evaluateAll((els) => els.map((el) => el.value).filter((v) => v !== ''));
  common.log('  全局设置数值回显: ' + JSON.stringify(numericValues));
  await setViewport(page, 1920, 1080);
  await aiContextPage.cancelSettingsEditMode(page);
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// 19 章：批量任务
// ---------------------------------------------------------------------------

async function captureBatchTasksScreenshots(page) {
  common.log('=== 19 章：批量任务 ===');
  await preparePage(page);
  await batchPage.gotoBatchTaskPage(page);
  await page.waitForTimeout(1500);
  await dismissAuthAlert(page);
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1920, 1080);
  await screenshot(page, '19-batch-tasks-list.png', page.locator('.batch-tasks'));

  const rows = await batchPage.rowCount(page).catch(() => 0);
  if (rows === 0) {
    skipped.push(
      '19-batch-tasks-detail.png（环境无批量任务数据，无行可打开详情抽屉）',
    );
    skipped.push(
      '19-batch-tasks-cancel-confirm.png（环境无批量任务数据，无「取消」按钮可点击）',
    );
    skipped.push(
      '19-batch-tasks-cancel-disabled.png（环境无批量任务数据，无终态行）',
    );
    common.log('批量任务列表为空（数据面透传产生，控制台无创建入口），跳过详情/取消类截图');
  }
}

/** 只读管理员视角的批量任务列表（单独 context，使用 viewer 凭证登录） */
async function captureBatchTasksReadonly(browser) {
  common.log('=== 19 章：批量任务（只读管理员视角）===');
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('lang', 'zh'));
  try {
    await umUtils.loginAsUser(
      page,
      READONLY_USER.name,
      READONLY_USER.password,
      'system_admin_readonly',
    );
    await batchPage.gotoBatchTaskPage(page);
    await page.waitForTimeout(1500);
    await dismissAuthAlert(page);
    await waitForSettle(page);
    await dismissMessages(page);
    await setViewport(page, 1920, 1080);
    const role = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('user') || '{}').role;
      } catch (e) {
        return 'unknown';
      }
    });
    common.log('只读视角截图前登录角色: ' + role);
    await screenshot(page, '19-batch-tasks-readonly.png', page.locator('.batch-tasks'));
  } catch (e) {
    common.log('只读账号登录/截图失败: ' + e.message);
    skipped.push('19-batch-tasks-readonly.png（只读账号 viewer 登录失败: ' + e.message + '）');
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// 20 章：密钥收敛
// ---------------------------------------------------------------------------

/** 在历史表格中按预演/状态条件定位一条任务（返回单元格展示文本中的任务ID） */
async function findHistoryTaskId(page, { dryRun = null, status = null } = {}) {
  const ids = await reencryptPage.historyRowTaskIds(page);
  for (const id of ids) {
    const cells = await reencryptPage.historyRowCellTexts(page, id);
    if (status && (cells[1] || '') !== status) {
      continue;
    }
    if (dryRun !== null) {
      const dryRunCell = (cells[4] || '').trim();
      if (dryRun && dryRunCell !== '是') {
        continue;
      }
      if (!dryRun && dryRunCell !== '否') {
        continue;
      }
    }
    return id;
  }
  return null;
}

async function openHistoryDetail(page, taskId) {
  await reencryptPage.openHistoryDetail(page, taskId);
  await page.waitForTimeout(1200);
}

async function captureKeyReencryptScreenshots(page) {
  common.log('=== 20 章：密钥收敛 ===');
  await preparePage(page);
  await reencryptPage.gotoReencryptSweepPage(page);
  await page.waitForTimeout(2000);
  await dismissAuthAlert(page);
  await waitForSettle(page);
  await dismissMessages(page);
  await setViewport(page, 1920, 1080);

  // 列表全貌：触发卡片 + 当前运行任务空态 + 历史任务表格
  const historyCard = reencryptPage.historyCard(page);
  await historyCard.scrollIntoViewIfNeeded();
  const paginationBox = await reencryptPage
    .pager(page)
    .boundingBox()
    .catch(() => null);
  if (paginationBox && paginationBox.y + paginationBox.height + 24 > 1080) {
    await setViewport(
      page,
      1920,
      Math.ceil(paginationBox.y + paginationBox.height + 24),
    );
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await screenshot(page, '20-key-reencrypt-list.png', page.locator('.security-page'));
  await setViewport(page, 1920, 1080);

  // 成功任务详情（非预演）
  const successId = await findHistoryTaskId(page, { dryRun: false, status: '成功' });
  if (successId) {
    await openHistoryDetail(page, successId);
    await setViewport(page, 1920, 1400);
    await dismissMessages(page);
    await screenshotElement(
      visibleDrawerContent(page),
      '20-key-reencrypt-detail.png',
    );
    await setViewport(page, 1920, 1080);
    await safeClick(
      page,
      page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
      '关闭任务详情抽屉',
    );
    await page.waitForTimeout(500);
  } else {
    skipped.push('20-key-reencrypt-detail.png（历史任务中未找到非预演的成功任务）');
  }

  // 触发一次真实预演任务（dry_run，不落库），用其详情拍预演提示
  const before = new Set(
    (await reencryptPage.historyRowTaskIds(page).catch(() => [])) || [],
  );
  if ((await reencryptPage.isDryRunOn(page).catch(() => false)) === false) {
    await reencryptPage.toggleDryRun(page);
  }
  common.log(
    '预演模式开关状态=' +
      (await reencryptPage.isDryRunOn(page).catch(() => '?')) +
      '，扫描范围=' +
      (await reencryptPage.selectedScopeText(page).catch(() => '?')),
  );
  if ((await reencryptPage.selectedScopeText(page).catch(() => '')) !== '全部') {
    await reencryptPage
      .selectScopeOption(page, reencryptPage.DOC.allOption)
      .catch(() => {});
  }
  await page.waitForTimeout(400);
  await reencryptPage.clickTrigger(page);
  await page.waitForTimeout(2500);
  await dismissMessages(page);
  await reencryptPage.clickReset(page);
  await page.waitForTimeout(1500);
  let dryRunId = await findHistoryTaskId(page, { dryRun: true, status: '成功' });
  const fresh = (await reencryptPage.historyRowTaskIds(page).catch(() => [])) || [];
  const createdId = fresh.find((id) => !before.has(id));
  if (createdId) {
    dryRunId = createdId;
  }
  if (dryRunId) {
    await openHistoryDetail(page, dryRunId);
    await setViewport(page, 1920, 1400);
    await dismissMessages(page);
    await screenshotElement(
      visibleDrawerContent(page),
      '20-key-reencrypt-dryrun.png',
    );
    await setViewport(page, 1920, 1080);
    await safeClick(
      page,
      page.locator('.ivu-drawer:visible .ivu-drawer-close').first(),
      '关闭预演任务详情抽屉',
    );
    await page.waitForTimeout(500);
  } else {
    skipped.push(
      '20-key-reencrypt-dryrun.png（未能在历史列表定位到预演任务）',
    );
  }

  // 409 互斥态：以页面级响应 mock 构造「已有运行中任务」的确定性场景
  // （真实任务在毫秒级完成，无法稳定复现互斥窗口）
  const holder = 'rsp-9f1c2d3e-4a5b-6c7d-8';
  await reencryptPage.mockReencryptSweepListResponse(page, {
    list: [
      {
        task_id: holder,
        status: 'running',
        mode: 'reencrypt',
        dry_run: false,
        scope: 'all',
        active_key_id: 1,
        created_by: 'admin',
        started_at: new Date().toISOString(),
        finished_at: '',
        duration_ms: 0,
        summary: {},
        error: '',
      },
    ],
    pagination: { page: 1, page_size: 20, total: 1 },
  });
  await reencryptPage.mockReencryptSweepDetailRunning(page);
  await reencryptPage.gotoReencryptSweepPage(page);
  await page.waitForTimeout(2000);
  await dismissMessages(page);
  await reencryptPage.triggerButton(page).click();
  await page.waitForTimeout(800);
  await dismissMessages(page);
  await setViewport(page, 1600, 900);
  await reencryptPage.triggerCard(page).scrollIntoViewIfNeeded();
  await screenshotElement(
    reencryptPage.triggerCard(page),
    '20-key-reencrypt-conflict.png',
  );
  await setViewport(page, 1920, 1080);
  await reencryptPage.unmockReencryptSweepNetwork(page);
  common.log('20 章 409 互斥截图：已按模块测试用例的响应 mock 方式构造运行中持有者');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

(async () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('lang', 'zh'));

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1].trim() : '';

  const allTasks = [
    { name: 'cluster-epp', fn: (p) => captureClusterEppScreenshots(p) },
    { name: 'report', fn: (p) => captureReportFilterBar(p) },
    { name: 'ai-cache', fn: (p) => captureAiCacheScreenshots(p) },
    { name: 'traffic-mirror', fn: (p) => captureTrafficMirrorScreenshots(p) },
    { name: 'intent-config', fn: (p) => captureIntentConfigScreenshots(p) },
    { name: 'ai-context', fn: (p) => captureAiContextScreenshots(p) },
    { name: 'batch-tasks', fn: (p) => captureBatchTasksScreenshots(p) },
    { name: 'batch-readonly', fn: () => captureBatchTasksReadonly(browser) },
    { name: 'key-reencrypt', fn: (p) => captureKeyReencryptScreenshots(p) },
  ];

  const tasks = only
    ? allTasks.filter((t) => t.name === only || t.name.startsWith(only))
    : allTasks;

  if (only && !tasks.length) {
    console.error(
      '未知 --only 参数: ' +
        only +
        '，可选: ' +
        allTasks.map((t) => t.name).join(', '),
    );
    process.exit(1);
  }

  for (const task of tasks) {
    try {
      await task.fn(page);
    } catch (e) {
      console.error(`Task failed: ${task.name}`, e.message);
      skipped.push(`${task.name}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\n=== 截图汇总 ===');
  console.log('生成成功: ' + captured.join(', '));
  if (skipped.length) {
    console.log('跳过/失败: ' + skipped.join(' | '));
  }
  console.log('All done.');
})();