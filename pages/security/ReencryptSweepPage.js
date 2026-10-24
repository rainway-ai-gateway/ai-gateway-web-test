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
'use strict';
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const rc = require('../resource/ResourcePageCommon');
const sessionUtils = require('../../utils/session');
const readonly = require('../../utils/readonly');
const { IvuDrawerComponent, IvuSelectComponent } = require('../../components/iview');

const AUTH_PATH = path.join(__dirname, '../../auth.json');

/** 「系统安全 → 密钥收敛」前端路由路径（src/router/router.js:200 `path: 'security'`） */
const SECURITY_PATH = 'security';

// 触发：POST /security/reencrypt-sweeps；轮询/查询：GET /security/reencrypt-sweeps/{id}
const TRIGGER_URL_RE = /\/open-api\/v1\/security\/reencrypt-sweeps$/;
const SWEEP_DETAIL_URL_RE = /\/open-api\/v1\/security\/reencrypt-sweeps\/[^/?]+$/;
// 列表：GET /security/reencrypt-sweeps(?query)；与 detail（带 /{id}）区分
const LIST_URL_RE = /\/open-api\/v1\/security\/reencrypt-sweeps(?:\?.*)?$/;

const TOTAL_MSG_RE = /reencrypt-sweeps(?:\?|$)/;

const DOC = {
  pageTitle: '密钥收敛',
  triggerCardTitle: '触发收敛任务',
  runningCardTitle: '当前运行任务',
  historyCardTitle: '历史任务',
  mode: '变换方向',
  scope: '扫描范围',
  dryRun: '预演模式',
  dryRunLabel: '预演模式',
  dryRunHint: '开启后仅统计"将要重写"的行数，不落库',
  dryRunYes: '是（仅统计，不落库）',
  dryRunNo: '否',
  trigger: '触发任务',
  modeHelp:
    'reencrypt：明文物或旧 keyID 密文行重写为 active 钥密文；decrypt：全部密文行解密为明文，仅用于回滚预案，日常禁止触发',
  triggerSuccess: '任务已触发，task_id: {id}，轮询进度中',
  conflictPrefix:
    '409 已有任务运行中，task_id: {id}，请等待完成；可直接轮询该任务，不排队。',
  conflictToast: '已有任务运行中，task_id: {id}，请等待完成',
  taskNotFound: '未找到任务：{id}',
  triggerFailed: '触发收敛任务失败',
  loadFailed: '加载任务失败',
  noRunningTask: '当前无运行中任务，可直接触发。',
  noHistory: '暂无历史任务。',
  detailTitle: '任务详情',
  detail: '详情',
  columnTaskId: '任务ID',
  columnStatus: '状态',
  columnMode: '变换方向',
  columnScope: '扫描范围',
  columnDryRun: '预演',
  columnCreatedBy: '触发者',
  columnStartedAt: '开始时间',
  columnDuration: '耗时(ms)',
  columnOperation: '操作',
  dryRunYesShort: '是',
  dryRunNoShort: '否',
  // 筛选栏
  filterStatus: '任务状态',
  filterMode: '变换方向',
  filterScope: '扫描范围',
  filterDryRun: '预演模式',
  filterDryRunYes: '是',
  filterDryRunNo: '否',
  filterStartTime: '开始时间起',
  filterEndTime: '开始时间止',
  search: '查询',
  reset: '重置',
  allOption: '全部',
  // 详情字段
  taskId: '任务ID',
  status: '状态',
  polling: '轮询中…',
  createdBy: '触发者',
  activeKeyId: '活跃密钥ID',
  startEndTime: '开始 / 结束时间',
  duration: '耗时',
  durationMs: '{ms} ms',
  providersSummary: 'providers 表收敛统计',
  apiKeysSummary: 'api_keys 表收敛统计',
  scanned: '已扫描 scanned',
  rewritten: '已重写 rewritten',
  skipped: '已跳过 skipped',
  summaryRunning: '任务运行中，统计将于完成后写入。',
  dryRunNote: '预演任务（dry_run）：rewritten 为"将要重写"的行数，未落库。',
  error: '错误',
  errorPrefix: '错误：',
};

const MODE_LABELS = {
  reencrypt: '重加密',
  decrypt: '解密',
};

const SCOPE_LABELS = {
  all: '全部',
  providers: '仅 providers 表',
  api_keys: '仅 api_keys 表',
};

const STATUS_TEXT = {
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
};

const HISTORY_COLUMN_HEADERS = [
  DOC.columnTaskId,
  DOC.columnStatus,
  DOC.columnMode,
  DOC.columnScope,
  DOC.columnDryRun,
  DOC.columnCreatedBy,
  DOC.columnStartedAt,
  DOC.columnDuration,
  DOC.columnOperation,
];

const HISTORY_COLUMN_INDEX = {
  taskId: 0,
  status: 1,
  mode: 2,
  scope: 3,
  dryRun: 4,
  createdBy: 5,
  startedAt: 6,
  duration: 7,
  operation: 8,
};

function modeText(mode) {
  return MODE_LABELS[mode] || mode || '-';
}

function scopeText(scope) {
  return SCOPE_LABELS[scope] || scope || '-';
}

function statusText(status) {
  if (status === 'running') {
    return STATUS_TEXT.running;
  }
  if (status === 'succeeded') {
    return STATUS_TEXT.succeeded;
  }
  return STATUS_TEXT.failed;
}

// 复刻 SweepView.buildSummary
function buildSummary(raw) {
  const data = raw || {};
  const scanned = data.scanned || 0;
  const rewritten = data.rewritten || 0;
  const skipped = data.skipped || 0;
  const total = scanned + skipped;
  const percent =
    total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;
  return { scanned, rewritten, skipped, total, percent };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

/* ------------------------------------------------------------------ *
 * 页面导航
 * ------------------------------------------------------------------ */

function readSessionFromAuthFile() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    for (const item of auth.origins || []) {
      const userEntry = (item.localStorage || []).find((e) => e.name === 'user');
      if (userEntry && userEntry.value) {
        const parsed = JSON.parse(userEntry.value);
        if (parsed && parsed.sessionKey) {
          return parsed;
        }
      }
    }
  } catch (e) {
    /* 忽略 */
  }
  return null;
}

async function ensureLocalStorageSession(page) {
  const session = readSessionFromAuthFile();
  if (!session) {
    return;
  }
  try {
    await page.evaluate((user) => {
      if (!localStorage.getItem('user')) {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('lang', 'zh');
      }
    }, session);
  } catch (e) {
    /* sandbox 下可能 SecurityError */
  }
}

async function gotoReencryptSweepPage(page) {
  const session = readSessionFromAuthFile();
  if (session) {
    await page.addInitScript((user) => {
      try {
        if (!localStorage.getItem('user')) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('lang', 'zh');
        }
      } catch (e) {
        /* 忽略 */
      }
    }, session);
  }

  await rc.ensureAppSession(page);
  await page.goto(rc.getAppBaseUrl() + '/security');
  await page.waitForLoadState('domcontentloaded');
  await ensureLocalStorageSession(page);
  // 导航后会话守卫：Key 失效时页面会弹「Session Key 错误」遮罩拦截点击，先自愈再断言就绪
  await sessionUtils.ensureSessionHealthy(page, {
    retryUrl: rc.getAppBaseUrl() + '/security',
  });
  await expectReencryptSweepPageReady(page);
}

async function expectReencryptSweepPageReady(page) {
  await expect(
    page.getByRole('button', { name: DOC.trigger }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

async function reloadReencryptSweepPage(page) {
  await sessionUtils.ensureSessionHealthy(page, {
    retryUrl: rc.getAppBaseUrl() + '/security',
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expectReencryptSweepPageReady(page);
}

async function expectPageLayout(page) {
  expect(page.url()).toContain('/security');
  await expect(page.locator('.security-page')).toBeVisible();
  await expect(triggerCard(page)).toBeVisible();
  await expect(runningCard(page)).toBeVisible();
  await expect(historyCard(page)).toBeVisible();
}

/* ------------------------------------------------------------------ *
 * Card 区域
 * ------------------------------------------------------------------ */

function card(page, title) {
  return page
    .locator('.security-page .ivu-card')
    .filter({ has: page.locator('.ivu-card-head', { hasText: title }) })
    .first();
}

function triggerCard(page) {
  return card(page, DOC.triggerCardTitle);
}

function runningCard(page) {
  return card(page, DOC.runningCardTitle);
}

function historyCard(page) {
  return card(page, DOC.historyCardTitle);
}

/* ------------------------------------------------------------------ *
 * 触发区
 * ------------------------------------------------------------------ */

function modeFormItem(page) {
  return page
    .locator('.security-page .sec-form-item')
    .filter({ has: page.locator('.sec-form-label', { hasText: DOC.mode }) })
    .first();
}

function scopeFormItem(page) {
  return page
    .locator('.security-page .sec-form-item')
    .filter({ has: page.locator('.ivu-form-item-label', { hasText: DOC.scope }) })
    .first();
}

function modeSelectTrigger(page) {
  return modeFormItem(page).locator('.ivu-select').first();
}

function scopeSelectTrigger(page) {
  return scopeFormItem(page).locator('.ivu-select').first();
}

function dryRunSwitch(page) {
  return page.locator('.security-page .sec-switch-row .ivu-switch').first();
}

function dryRunHint(page) {
  return page.locator('.security-page .sec-hint').first();
}

function triggerButton(page) {
  return page
    .locator('.security-page')
    .getByRole('button', { name: DOC.trigger })
    .first();
}

function conflictAlert(page) {
  return page.locator('.security-page .sec-conflict').first();
}

async function getSelectOptions(page, trigger) {
  // iView Select 的下拉默认不 transfer，Dropdown 就在该 .ivu-select 内部
  // （iview/select/select.vue:55-67 + dropdown.vue）。页面级
  // `.ivu-select-dropdown:visible` 在前一个下拉的收起动画（transition-drop）尚未结束时
  // 仍判定为 visible，会把上一个下拉的选项拼进来（RS-T-01「扫描范围」串读到「变换方向」）。
  // 因此必须把读取范围限定到当前触发器的下拉容器。
  await trigger.click();
  await page.waitForTimeout(200);
  const dropdown = trigger.locator('.ivu-select-dropdown');
  const options = await dropdown.locator('.ivu-select-item').allTextContents();
  await page.keyboard.press('Escape');
  return options.map((t) => t.trim()).filter(Boolean);
}

async function getModeOptions(page) {
  return getSelectOptions(page, modeSelectTrigger(page));
}

async function getScopeOptions(page) {
  return getSelectOptions(page, scopeSelectTrigger(page));
}

async function selectModeOption(page, optionLabel) {
  const select = new IvuSelectComponent(page, modeSelectTrigger(page));
  await select.selectOptionExact(optionLabel);
}

async function selectScopeOption(page, optionLabel) {
  const select = new IvuSelectComponent(page, scopeSelectTrigger(page));
  await select.selectOptionExact(optionLabel);
}

async function toggleDryRun(page) {
  await dryRunSwitch(page).click();
  await page.waitForTimeout(150);
}

async function isDryRunOn(page) {
  const cls = (await dryRunSwitch(page).getAttribute('class')) || '';
  return cls.includes('ivu-switch-checked');
}

async function clickTrigger(page) {
  return waitForTriggerResponse(page, async () => {
    await triggerButton(page).click();
  });
}

// 当前「变换方向」Select 的选中项文本
async function selectedModeText(page) {
  return (await modeFormItem(page)
    .locator('.ivu-select-selected-value')
    .first()
    .textContent())?.trim();
}

// 当前「扫描范围」Select 的选中项文本
async function selectedScopeText(page) {
  return (await scopeFormItem(page)
    .locator('.ivu-select-selected-value')
    .first()
    .textContent())?.trim();
}

// 悬停「变换方向」帮助 icon，读取 Tooltip 文案
async function modeHelpText(page) {
  const icon = modeFormItem(page).locator('.sec-help-icon').first();
  await icon.hover();
  await page.waitForTimeout(300);
  const text = (
    await page.locator('.ivu-tooltip-inner:visible').last().textContent()
  )?.trim();
  await page.mouse.move(0, 0);
  return text;
}

/* ------------------------------------------------------------------ *
 * 响应等待
 * ------------------------------------------------------------------ */

async function waitForTriggerResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        TRIGGER_URL_RE.test(r.url()),
      { timeout },
    ),
    action(),
  ]);
  return response;
}

async function waitForSweepDetailResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        SWEEP_DETAIL_URL_RE.test(r.url()),
      { timeout },
    ),
    action(),
  ]);
  return response;
}

// 等待 GET 列表响应（query 可存在）
async function waitForListResponse(page, action, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' && LIST_URL_RE.test(r.url()),
      { timeout },
    ),
    action(),
  ]);
  return response;
}

// 等待「query 满足条件」的 GET 列表响应。
// 复位（onReset）等动作可能连发多次列表请求，上一次动作的残留响应会被
// waitForListResponse 抢先命中（抓到的是 mode 未生效的那次），断言随即误判。
// 用谓词过滤，让不匹配的残留响应被跳过，直到本次动作真正生效的那一次。
async function waitForListResponseWhere(page, action, predicate, options = {}) {
  const timeout = options.timeout ?? 15000;
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        LIST_URL_RE.test(r.url()) &&
        predicate(parseListQuery(r.url())),
      { timeout },
    ),
    action(),
  ]);
  return response;
}

// 解析列表响应 URL 的 query 参数
function parseListQuery(url) {
  const u = new URL(url);
  return Object.fromEntries(u.searchParams.entries());
}

/* ------------------------------------------------------------------ *
 * 网络 Mock / 监听（正则匹配，列表 query 亦可命中）
 * ------------------------------------------------------------------ */

// Mock 列表 GET：返回指定 list/pagination（构造 running 任务 / 分页断言）
async function mockReencryptSweepListResponse(
  page,
  { status = 200, list = [], pagination = null, errMsg = '' } = {},
) {
  await page.route(LIST_URL_RE, (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    if (status === 200) {
      const total = pagination ? pagination.total : list.length;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          ErrMsg: 'success',
          Data: {
            list,
            pagination: pagination || { page: 1, page_size: 20, total },
          },
        }),
      });
    } else {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ErrNum: status, ErrMsg: errMsg, Data: null }),
      });
    }
  });
}

// Mock 单个任务 GET：固定返回 data（可保持 running 以维持轮询）
async function mockReencryptSweepDetailResponse(
  page,
  { status = 200, data = {}, errMsg = '' } = {},
) {
  await page.route(SWEEP_DETAIL_URL_RE, (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        status === 200
          ? { ErrNum: 200, ErrMsg: 'success', Data: data }
          : { ErrNum: status, ErrMsg: errMsg, Data: null },
      ),
    });
  });
}

// Mock 单个任务 GET 并始终保持 running：从请求 URL 动态解析 task_id，
// 避免固定 task_id 在轮询合并（Object.assign({}, activeTask, data)）时覆盖真实 task_id。
// options.delayMs：给响应加延迟，用于让「轮询到达前的中间态」可被稳定观测（RS-P-04）。
async function mockReencryptSweepDetailRunning(page, overrides = {}, options = {}) {
  const delayMs = options.delayMs || 0;
  await page.route(SWEEP_DETAIL_URL_RE, async (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    const matched = route.request().url().match(SWEEP_DETAIL_URL_RE);
    const taskId = matched
      ? matched[0].split('/').pop().split('?')[0]
      : 'rsp-unknown';
    const data = {
      task_id: taskId,
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
      ...overrides,
    };
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ErrNum: 200, ErrMsg: 'success', Data: data }),
    });
  });
}

// Mock 触发 POST：成功 200 或 409 冲突（errMsg 可携带持有者 task_id）
async function mockReencryptSweepTriggerResponse(
  page,
  { status = 200, data = {}, errMsg = '', delayMs = 0 } = {},
) {
  await page.route(TRIGGER_URL_RE, (route) => {
    if (route.request().method() !== 'POST') {
      route.continue();
      return;
    }
    const fulfill = () =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(
          status === 200
            ? { ErrNum: 200, ErrMsg: 'success', Data: data }
            : { ErrNum: status, ErrMsg: errMsg, Data: null },
        ),
      });
    if (delayMs > 0) {
      setTimeout(fulfill, delayMs);
    } else {
      fulfill();
    }
  });
}

// 解除收敛相关全部 route
async function unmockReencryptSweepNetwork(page) {
  await page.unroute(LIST_URL_RE).catch(() => {});
  await page.unroute(SWEEP_DETAIL_URL_RE).catch(() => {});
  await page.unroute(TRIGGER_URL_RE).catch(() => {});
}

// 监听收敛相关请求：触发 POST / 列表 GET / 详情 GET（含时间戳用于间隔断言）
function trackReencryptSweepRequests(page) {
  const state = {
    trigger: 0,
    triggerUrls: [],
    list: 0,
    listQueries: [],
    detail: 0,
    detailUrls: [],
    detailTimes: [],
  };
  const handler = (request) => {
    const url = request.url();
    const method = request.method().toUpperCase();
    if (!url.includes('/open-api/v1/security/reencrypt-sweeps')) {
      return;
    }
    if (method === 'POST' && TRIGGER_URL_RE.test(url)) {
      state.trigger += 1;
      state.triggerUrls.push(url);
    } else if (method === 'GET' && SWEEP_DETAIL_URL_RE.test(url)) {
      state.detail += 1;
      state.detailUrls.push(url);
      state.detailTimes.push(Date.now());
    } else if (method === 'GET' && LIST_URL_RE.test(url)) {
      state.list += 1;
      try {
        state.listQueries.push(parseListQuery(url));
      } catch (e) {
        state.listQueries.push({});
      }
    }
  };
  page.on('request', handler);
  return {
    state,
    stop() {
      page.off('request', handler);
    },
  };
}

/* ------------------------------------------------------------------ *
 * SweepView 字段读取
 * ------------------------------------------------------------------ */

function sweepView(root) {
  return root.locator('.sweep-view');
}

// 注意：不可用 filter({ has: root.locator(...) })，Playwright 会对 has 定位器整体重定根，
// 使 root（card）层级选择器在 row 内部失配；改用 :has(...:text-is(...)) 精确定位 label。
function svRow(root, label) {
  return root
    .locator(`.sweep-view .sv-row:has(.sv-label:text-is('${label}'))`)
    .first();
}

function svValue(root, label) {
  return svRow(root, label).locator('.sv-value');
}

async function svValueText(root, label) {
  return (await svValue(root, label).textContent())?.trim();
}

function pollingIndicator(root) {
  return root.locator('.sweep-view .sv-polling');
}

function summaryBlock(root, title) {
  return root
    .locator(`.sweep-view .sv-summary-block:has(.sv-summary-title:text-is('${title}'))`)
    .first();
}

async function summaryNumbers(root, title) {
  const block = summaryBlock(root, title);
  const spans = block.locator('.sv-summary-nums span');
  const read = async (index) => {
    const text = await spans.nth(index).locator('b').textContent();
    return Number((text || '0').trim()) || 0;
  };
  return {
    scanned: await read(0),
    rewritten: await read(1),
    skipped: await read(2),
  };
}

async function progressPercent(root, title) {
  const block = summaryBlock(root, title);
  const progress = block.locator('.ivu-progress').first();
  if ((await progress.count()) === 0) {
    return null;
  }
  const textNode = progress.locator('.ivu-progress-text');
  if ((await textNode.count()) === 0) {
    return null;
  }
  const text = (await textNode.first().textContent()) || '';
  const matched = text.match(/(\d+)\s*%/);
  if (matched) {
    return Number(matched[1]);
  }
  // iView Progress 在 percent==100 时于 created() 把 currentStatus 置为 success
  // （iview/progress/progress.vue:handleStatus），文案位渲染勾选图标
  // ivu-icon-ios-checkmark-circle 而非「100%」。此处把该成功态归一化为 100。
  if ((await progress.locator('.ivu-icon-ios-checkmark-circle').count()) > 0) {
    return 100;
  }
  return null;
}

function errorAlert(root) {
  return root.locator('.sweep-view .sv-error').first();
}

function runningSweepView(page) {
  return sweepView(runningCard(page));
}

async function expectNoRunningTask(page) {
  await expect(runningCard(page).locator('.sec-empty')).toBeVisible();
  await expect(runningCard(page)).toContainText(DOC.noRunningTask);
}

async function expectNoHistory(page) {
  await expect(historyCard(page).locator('.sec-empty')).toBeVisible();
  await expect(historyCard(page)).toContainText(DOC.noHistory);
}

/* ------------------------------------------------------------------ *
 * 筛选栏与分页器（历史 Card）
 * ------------------------------------------------------------------ */

function filterBar(page) {
  return historyCard(page).locator('.sec-filter-bar').first();
}

// 按标签定位筛选项（标签文案精确匹配 .sec-filter-label）
function filterItem(page, label) {
  return filterBar(page)
    .locator('.sec-filter-item')
    .filter({
      has: page.locator('.sec-filter-label', { hasText: label }),
    })
    .first();
}

function filterSelectTrigger(page, label) {
  return filterItem(page, label).locator('.ivu-select').first();
}

function filterDateInput(page, label) {
  return filterItem(page, label).locator('input').first();
}

function filterSearchButton(page) {
  return filterBar(page)
    .locator('.sec-filter-actions')
    .getByRole('button', { name: DOC.search });
}

function filterResetButton(page) {
  return filterBar(page)
    .locator('.sec-filter-actions')
    .getByRole('button', { name: DOC.reset });
}

// 打开某筛选 Select 并读取选项文本
async function getFilterOptions(page, label) {
  return getSelectOptions(page, filterSelectTrigger(page, label));
}

// 选择某筛选 Select 的选项（选项文案精确匹配）
async function selectFilterOption(page, label, optionLabel) {
  const select = new IvuSelectComponent(page, filterSelectTrigger(page, label));
  await select.selectOptionExact(optionLabel);
}

// 当前某筛选 Select 的选中项文本
async function selectedFilterText(page, label) {
  return (await filterSelectTrigger(page, label)
    .locator('.ivu-select-selected-value')
    .first()
    .textContent())?.trim();
}

async function clickSearch(page) {
  return waitForListResponse(page, async () => {
    await filterSearchButton(page).click();
  });
}

async function clickReset(page) {
  return waitForListResponse(page, async () => {
    await filterResetButton(page).click();
  });
}

function pager(page) {
  return historyCard(page).locator('.sec-pager').first();
}

// 分页器「共 N 条」文本（iView 渲染为 .ivu-page-total）
async function pagerTotalText(page) {
  const node = pager(page).locator('.ivu-page-total');
  if ((await node.count()) === 0) {
    return '';
  }
  return (await node.first().textContent())?.trim() || '';
}

async function pagerTotalNumber(page) {
  const text = await pagerTotalText(page);
  const matched = text.match(/(\d+)/);
  return matched ? Number(matched[1]) : 0;
}

// 当前页码（.ivu-page-item-active 文本）
async function pagerCurrentPage(page) {
  const node = pager(page).locator('.ivu-page-item-active a');
  if ((await node.count()) === 0) {
    return null;
  }
  const text = (await node.first().textContent())?.trim() || '';
  return Number(text) || null;
}

// 每页条数（.ivu-page-options 内 Select 选中项文本）
async function pagerPageSize(page) {
  const node = pager(page)
    .locator('.ivu-page-options .ivu-select-selected-value')
    .first();
  if ((await node.count()) === 0) {
    return null;
  }
  const text = (await node.textContent())?.trim() || '';
  const matched = text.match(/(\d+)/);
  return matched ? Number(matched[1]) : null;
}

// 跳转指定页码（点击页码项）
async function clickPageNumber(page, pageNumber) {
  const item = pager(page)
    .locator('.ivu-page-item')
    .filter({ hasText: new RegExp('^\\s*' + pageNumber + '\\s*$') })
    .first();
  return waitForListResponse(page, async () => {
    await item.click();
  });
}

/* ------------------------------------------------------------------ *
 * 历史表格（裸 iView Table）
 * ------------------------------------------------------------------ */

function historyTable(page) {
  return historyCard(page).locator('.ivu-table');
}

function historyHeaders(page) {
  return historyCard(page).locator('.ivu-table-header thead th');
}

function historyRows(page) {
  return historyCard(page).locator('.ivu-table-body tbody tr');
}

function historyRowByTaskId(page, taskId) {
  return historyRows(page).filter({ hasText: taskId }).first();
}

function historyRowAction(page, taskId, buttonName) {
  return historyRowByTaskId(page, taskId).getByRole('button', { name: buttonName });
}

async function openHistoryDetail(page, taskId) {
  await historyRowAction(page, taskId, DOC.detail).click();
  await page.waitForTimeout(300);
}

async function getHistoryHeaders(page) {
  return (await historyHeaders(page).allTextContents()).map((t) => t.trim());
}

// 历史表格所有行的任务ID（首列文本）
async function historyRowTaskIds(page) {
  const cells = historyRows(page).locator('td:first-child');
  const texts = await cells.allTextContents();
  return texts.map((t) => t.trim());
}

// 历史表格某任务行全部单元格文本（trim）
async function historyRowCellTexts(page, taskId) {
  return (
    await historyRowByTaskId(page, taskId).locator('td').allTextContents()
  ).map((t) => t.trim());
}

// 历史表格某任务行第 index 列文本（索引见 HISTORY_COLUMN_INDEX）
async function historyRowCellText(page, taskId, index) {
  const texts = await historyRowCellTexts(page, taskId);
  return texts[index];
}

/* ------------------------------------------------------------------ *
 * 详情抽屉
 * ------------------------------------------------------------------ */

function detailDrawer(page) {
  return ivuDrawer(page).withTitle(DOC.detailTitle);
}

async function expectDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DOC.detailTitle);
  await page.waitForTimeout(300);
}

async function closeDetailDrawer(page) {
  await ivuDrawer(page).closeByX(DOC.detailTitle);
  await expect(detailDrawer(page)).toBeHidden({ timeout: 10000 });
}

// 详情抽屉根节点 style（校验宽度 60%）
async function detailDrawerWidthStyle(page) {
  const drawer = detailDrawer(page).locator('.ivu-drawer').first();
  return (await drawer.getAttribute('style')) || '';
}

// 全局提示（Message / Notice / Alert）文案断言
async function expectMessageContains(page, text, timeout = 10000) {
  await expect(
    page
      .locator('.ivu-message, .ivu-notice, .ivu-alert')
      .filter({ hasText: new RegExp(escapeRegExp(text)) })
      .first(),
  ).toBeVisible({ timeout });
}

// 当前是否存在可见详情抽屉
async function hasVisibleDetailDrawer(page) {
  return (await page
    .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
    .count()) > 0;
}

/* ------------------------------------------------------------------ *
 * 阶段4 补全：筛选标签 / 列映射 / 排序 / Tag 颜色 / 统计块
 * ------------------------------------------------------------------ */

// 筛选栏 6 个标签文本（.sec-filter-actions 无 .sec-filter-label，被排除）
async function getFilterLabels(page) {
  return (
    await filterBar(page)
      .locator('.sec-filter-item .sec-filter-label')
      .allTextContents()
  ).map((t) => t.trim());
}

// 历史表格列头 th（标签精确匹配）
function headerCell(page, label) {
  return historyHeaders(page)
    .filter({ hasText: new RegExp('^\\s*' + escapeRegExp(label) + '\\s*$') })
    .first();
}

// 列头是否可排序（th 内含 .ivu-table-sort，不可排序列无此节点）
async function headerSortable(page, label) {
  return (await headerCell(page, label).locator('.ivu-table-sort').count()) > 0;
}

// 排序 caret：asc → arrow-dropup；desc → arrow-dropdown
function sortCaret(page, label, order) {
  const cls =
    order === 'asc' ? '.ivu-icon-md-arrow-dropup' : '.ivu-icon-md-arrow-dropdown';
  return headerCell(page, label).locator(cls).first();
}

async function clickSortAsc(page, label) {
  return waitForListResponse(page, async () => {
    await sortCaret(page, label, 'asc').click();
  });
}

async function clickSortDesc(page, label) {
  return waitForListResponse(page, async () => {
    await sortCaret(page, label, 'desc').click();
  });
}

// 点击列头本体（.ivu-table-cell，走 handleSortByHead 循环 normal→asc→desc→normal）
async function clickSortHeader(page, label) {
  return waitForListResponse(page, async () => {
    await headerCell(page, label).locator('.ivu-table-cell').first().click();
  });
}

// 历史表格第 index 列（0-based）全部单元格文本
async function historyColumnTexts(page, index) {
  const cells = historyRows(page).locator(`td:nth-child(${index + 1})`);
  return (await cells.allTextContents()).map((t) => t.trim());
}

// 状态 → Tag 颜色（与 impl 的 statusTagColor 一致）
function statusTagColor(status) {
  if (status === 'running') {
    return 'primary';
  }
  if (status === 'succeeded') {
    return 'success';
  }
  return 'error';
}

// 某任务行状态单元格 / 状态 Tag / Tag 颜色
function rowStatusCell(page, taskId) {
  return historyRowByTaskId(page, taskId).locator(
    `td:nth-child(${HISTORY_COLUMN_INDEX.status + 1})`,
  );
}

function rowStatusTag(page, taskId) {
  return rowStatusCell(page, taskId).locator('.ivu-tag').first();
}

async function rowStatusTagColor(page, taskId) {
  const cls = (await rowStatusTag(page, taskId).getAttribute('class')) || '';
  const matched = cls.match(/ivu-tag-(primary|success|error)/);
  return matched ? matched[1] : null;
}

// SweepView 状态行 Tag / 颜色（root 为 card 或抽屉）
function svStatusTag(root) {
  return svValue(root, DOC.status).locator('.ivu-tag').first();
}

async function svStatusTagColor(root) {
  const cls = (await svStatusTag(root).getAttribute('class')) || '';
  const matched = cls.match(/ivu-tag-(primary|success|error)/);
  return matched ? matched[1] : null;
}

// SweepView 全部 .sv-label 文本（顺序即渲染顺序，共 9 行）
async function svLabels(root) {
  return (await root.locator('.sweep-view .sv-label').allTextContents()).map((t) =>
    t.trim(),
  );
}

// 预演提示纯文本块（detail.error === 'dry_run' → .sv-note，非 Alert）
function svNote(root) {
  return root.locator('.sweep-view .sv-note').first();
}

async function svNoteText(root) {
  return (await svNote(root).textContent())?.trim();
}

// 统计块数量（scope 决定 1 或 2）
async function summaryBlockCount(root) {
  return await root.locator('.sweep-view .sv-summary-block').count();
}

/* ------------------------------------------------------------------ *
 * 阶段4 补全：分页器页长 / Vue 直改 / 列表 Server-Sim
 * ------------------------------------------------------------------ */

// 读取分页器页长选项（预期 ['20 条/页','50 条/页','100 条/页']）
async function getPageSizeOptions(page) {
  const trigger = pager(page).locator('.ivu-page-options .ivu-select').first();
  return getSelectOptions(page, trigger);
}

// 切换页长（size ∈ 20/50/100）
async function selectPageSize(page, size) {
  const trigger = pager(page).locator('.ivu-page-options .ivu-select').first();
  const select = new IvuSelectComponent(page, trigger);
  return waitForListResponse(page, async () => {
    await select.selectOptionExact(`${size} 条/页`);
  });
}

// 直改筛选时间（iView DatePicker :editable=false，无法 fill）
async function setFilterDate(page, key, value) {
  await page.evaluate(
    ([k, v]) => {
      const vm = document.querySelector('.security-page').__vue__;
      vm.filter[k] = v ? new Date(v) : '';
      vm.page = 1;
    },
    [key, value],
  );
  await page.waitForTimeout(100);
}

// 强制跳转列表页码（直接驱动 vm）
async function forceListPage(page, pageNumber) {
  return waitForListResponse(page, async () => {
    await page.evaluate((n) => {
      const vm = document.querySelector('.security-page').__vue__;
      vm.page = n;
      vm.fetchList();
    }, pageNumber);
  });
}

// 列表 Server-Sim：按 Query 过滤 / 排序 / 分页返回 fixture，保证断言确定
async function mockReencryptSweepListServer(page, { list = [] } = {}) {
  await page.route(LIST_URL_RE, (route) => {
    if (route.request().method() !== 'GET') {
      route.continue();
      return;
    }
    const q = parseListQuery(route.request().url());
    let rows = list.slice();
    if (q.status) {
      rows = rows.filter((r) => r.status === q.status);
    }
    if (q.mode) {
      rows = rows.filter((r) => r.mode === q.mode);
    }
    if (q.scope) {
      rows = rows.filter((r) => r.scope === q.scope);
    }
    if (q.dry_run === 'true') {
      rows = rows.filter((r) => r.dry_run === true);
    } else if (q.dry_run === 'false') {
      rows = rows.filter((r) => r.dry_run === false);
    }
    if (q.start_time) {
      const lo = Date.parse(q.start_time);
      rows = rows.filter((r) => Date.parse(r.started_at) >= lo);
    }
    if (q.end_time) {
      const hi = Date.parse(q.end_time);
      rows = rows.filter((r) => Date.parse(r.started_at) <= hi);
    }
    const by = q.sort_by || 'started_at';
    const order = q.sort_order || 'desc';
    rows.sort((a, b) => {
      const cmp =
        by === 'task_id'
          ? String(a.task_id).localeCompare(String(b.task_id))
          : Date.parse(a.started_at) - Date.parse(b.started_at);
      return order === 'asc' ? cmp : -cmp;
    });
    const curPage = Number(q.page) || 1;
    const size = Number(q.page_size) || 20;
    const total = rows.length;
    const start = (curPage - 1) * size;
    const pageRows = rows.slice(start, start + size);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ErrNum: 200,
        ErrMsg: 'success',
        Data: {
          list: pageRows,
          pagination: { page: curPage, page_size: size, total },
        },
      }),
    });
  });
}

/* ------------------------------------------------------------------ *
 * 只读管理员视角（docs/reencrypt-sweep/02-功能测试用例/04-只读视角.md RS-RO-01~03）
 *
 * 产品依据：`design-docs/modifications/2026-10-12-readonly-admin/ui-code-changes.md`
 * §3.4（`pages/security.html` 只读视角保留列表 / 详情，隐藏「触发任务」）与 §4
 * （写按钮挂全局指令 `v-has`，只读视角加 `.v-has-hidden`）。
 * 本页仅 `src/modules/Security/index.vue:61-67` 的「触发任务」Button 挂 `v-has`；
 * 列表 / 筛选 / 分页 / 排序 / 操作列「详情」/ 详情抽屉均无 `v-has`，只读视角原样保留。
 *
 * **定位陷阱（2026-10-16 首轮实测）**：`v-has` 用 `display: none` 隐藏写元素，而 Playwright
 * 的 `getByRole` 基于无障碍树、看不见 `display:none` 元素 —— 隐藏后的「触发任务」用
 * `getByRole('button', { name })` 会得到 count 0（RS-RO-01 因此误报）。故本区块：
 * - 只读态针对 `v-has` 元素用 **CSS + 文本** 定位（`readonly.buttonByText` / `INTERACTIVE_SELECTOR`）；
 * - 「无写入口」计数断言也用 CSS，避免被隐藏元素「看不见」而假通过；
 * - 只有**管理员对照组**（元素可见）才用 `getByRole` 的 `triggerButton(page)`。
 * ------------------------------------------------------------------ */

/** 页面根节点（只读视角同样渲染，用作直连就绪锚点） */
function pageRoot(page) {
  return page.locator('.security-page');
}

/**
 * 只读断言用的交互元素选择器（CSS，能命中被 `v-has` 隐藏的元素）。
 * `[role="button"]` 一并保留以兼容非 `<button>` 写法（iView 组件本身不使用该属性）。
 */
const INTERACTIVE_SELECTOR = 'button, .ivu-btn, [role="button"]';

/**
 * 触发区「触发任务」按钮（页面级，CSS + 文本定位）。
 * 只读态该按钮仍在 DOM 中并带 `.v-has-hidden`，是 RS-RO-01「v-has 隐藏」断言的锚点。
 */
function triggerSubmitButton(page) {
  return readonly.buttonByText(pageRoot(page), DOC.trigger);
}

/**
 * 触发卡片内全部交互元素。
 * 只读态应为 **1**（仅剩被 `v-has` 隐藏的「触发任务」）——触发区的「变换方向 / 扫描范围 /
 * 预演模式」是 iView Select / Switch（div / span），不属交互按钮，故不存在其它写入口。
 */
function triggerCardActionButtons(page) {
  return triggerCard(page).locator(INTERACTIVE_SELECTOR);
}

/** 运行中横幅内的全部交互元素（只读视角应为 0：横幅仅只读信息，无触发 / 取消写入口） */
function runningCardActionButtons(page) {
  return runningCard(page).locator(INTERACTIVE_SELECTOR);
}

/**
 * 运行中横幅的「轮询中…」标记。
 * **root 必须传卡片**（`pollingIndicator` 自带 `.sweep-view` 前缀；若传 `runningSweepView(page)`
 * 会拼成 `.sweep-view >> .sweep-view .sv-polling`，永不命中 —— 2026-10-16 首轮 RS-RO-02 即因此
 * 误报为「环境无运行中样本」）。
 */
function runningBannerPollingIndicator(page) {
  return pollingIndicator(runningCard(page));
}

/** 历史表格某任务行操作列的全部交互元素（只读视角仅剩「详情」1 个） */
function historyRowActionButtons(page, taskId) {
  return historyRowByTaskId(page, taskId).locator(INTERACTIVE_SELECTOR);
}

/** 详情抽屉内全部交互元素（只读视角应为 0：详情本身无写操作） */
function detailDrawerActionButtons(page) {
  return detailDrawer(page).locator(INTERACTIVE_SELECTOR);
}

/** 详情抽屉内可编辑控件（只读视角应为 0：纯文案只读展示） */
function detailDrawerEditableControls(page) {
  return detailDrawer(page).locator('input, textarea');
}

/**
 * 只读视角直连 URL 进入密钥收敛页。
 * **不可复用 `gotoReencryptSweepPage`**：它内部调用 `rc.ensureAppSession` /
 * `sessionUtils.ensureSessionHealthy`，会话异常时会用 conf.json 的 admin 凭证重登并回写
 * auth.json，把只读态悄悄换成管理员态（见 utils/readonly.js 文件头约束 2）。
 */
async function gotoReencryptSweepPageReadonly(page) {
  await readonly.gotoAsReadonly(page, SECURITY_PATH, { ready: pageRoot(page) });
  await expectReencryptSweepPageReadyReadonly(page);
  await readonly.expectStillReadonly(page);
}

/**
 * 只读视角就绪判定。**不可复用 `expectReencryptSweepPageReady`**：它断言「触发任务」
 * 按钮可见，而该按钮正是只读视角被 `v-has` 隐藏的元素。此处锚点取只读视角同样存在的
 * 页面根 / 三张卡片 / 历史筛选栏（均为只读也渲染的只读锚点）。
 */
async function expectReencryptSweepPageReadyReadonly(page) {
  await expect(pageRoot(page)).toBeVisible({ timeout: 15000 });
  await expect(triggerCard(page)).toBeVisible({ timeout: 15000 });
  await expect(runningCard(page)).toBeVisible({ timeout: 15000 });
  await expect(historyCard(page)).toBeVisible({ timeout: 15000 });
  await expect(filterBar(page)).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

module.exports = {
  DOC,
  MODE_LABELS,
  SCOPE_LABELS,
  STATUS_TEXT,
  HISTORY_COLUMN_HEADERS,
  HISTORY_COLUMN_INDEX,
  TRIGGER_URL_RE,
  SWEEP_DETAIL_URL_RE,
  LIST_URL_RE,
  TOTAL_MSG_RE,
  modeText,
  scopeText,
  statusText,
  buildSummary,
  gotoReencryptSweepPage,
  ensureOnReencryptSweepPage: gotoReencryptSweepPage,
  expectReencryptSweepPageReady,
  reloadReencryptSweepPage,
  expectPageLayout,
  card,
  triggerCard,
  runningCard,
  historyCard,
  modeFormItem,
  scopeFormItem,
  modeSelectTrigger,
  scopeSelectTrigger,
  dryRunSwitch,
  dryRunHint,
  triggerButton,
  conflictAlert,
  getSelectOptions,
  getModeOptions,
  getScopeOptions,
  selectModeOption,
  selectScopeOption,
  toggleDryRun,
  isDryRunOn,
  clickTrigger,
  selectedModeText,
  selectedScopeText,
  modeHelpText,
  waitForTriggerResponse,
  waitForSweepDetailResponse,
  waitForListResponse,
  parseListQuery,
  mockReencryptSweepListResponse,
  mockReencryptSweepDetailResponse,
  mockReencryptSweepDetailRunning,
  mockReencryptSweepTriggerResponse,
  unmockReencryptSweepNetwork,
  trackReencryptSweepRequests,
  sweepView,
  svRow,
  svValue,
  svValueText,
  pollingIndicator,
  summaryBlock,
  summaryNumbers,
  progressPercent,
  errorAlert,
  waitForListResponseWhere,
  runningSweepView,
  expectNoRunningTask,
  expectNoHistory,
  filterBar,
  filterItem,
  filterSelectTrigger,
  filterDateInput,
  filterSearchButton,
  filterResetButton,
  getFilterOptions,
  selectFilterOption,
  selectedFilterText,
  clickSearch,
  clickReset,
  pager,
  pagerTotalText,
  pagerTotalNumber,
  pagerCurrentPage,
  pagerPageSize,
  clickPageNumber,
  historyTable,
  historyHeaders,
  historyRows,
  historyRowByTaskId,
  historyRowAction,
  openHistoryDetail,
  getHistoryHeaders,
  historyRowTaskIds,
  historyRowCellTexts,
  historyRowCellText,
  detailDrawer,
  expectDetailDrawerOpen,
  closeDetailDrawer,
  detailDrawerWidthStyle,
  expectMessageContains,
  hasVisibleDetailDrawer,
  // 阶段4 补全
  getFilterLabels,
  headerCell,
  headerSortable,
  sortCaret,
  clickSortAsc,
  clickSortDesc,
  clickSortHeader,
  historyColumnTexts,
  statusTagColor,
  rowStatusCell,
  rowStatusTag,
  rowStatusTagColor,
  svStatusTag,
  svStatusTagColor,
  svLabels,
  svNote,
  svNoteText,
  summaryBlockCount,
  getPageSizeOptions,
  selectPageSize,
  setFilterDate,
  forceListPage,
  mockReencryptSweepListServer,
  escapeRegExp,
  // 只读管理员视角（docs/reencrypt-sweep/02-功能测试用例/04-只读视角.md）
  SECURITY_PATH,
  INTERACTIVE_SELECTOR,
  pageRoot,
  triggerSubmitButton,
  triggerCardActionButtons,
  runningCardActionButtons,
  runningBannerPollingIndicator,
  historyRowActionButtons,
  detailDrawerActionButtons,
  detailDrawerEditableControls,
  gotoReencryptSweepPageReadonly,
  expectReencryptSweepPageReadyReadonly,
};