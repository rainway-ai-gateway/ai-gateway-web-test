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
 * @Description: 只读系统管理员视角的共享基础设施（各模块 docs/<module>/02-功能测试用例/*只读视角*.md 用例共用）
 *
 * 产品依据：ai-gateway-web `design-docs/modifications/2026-10-12-readonly-admin/ui-code-changes.md`
 * - 后端以 `role` 枚举取代 `is_admin`：`system_admin` / `system_admin_readonly`；
 * - 只读视角（`role === 'system_admin_readonly'`）经全局指令 `v-has` 给写元素加
 *   `.v-has-hidden { display: none !important; }`，仅保留查看 / 详情 / 查询等只读入口；
 * - `ModelPrices` 等少数页面用 `store.isReadonly()` 在 JS 里控制，不挂 `v-has-hidden`。
 *
 * 两条硬约束（沿用 tests/api-key/test_06_api_key_readonly.spec.js 的既有设计）：
 * 1. 只读登录只写当前 page 的 localStorage，**不写 auth.json**，避免覆盖默认 admin 会话；
 * 2. 只读导航**不得**调用 `ensureSessionHealthy` / `ensureLoggedIn` / `handleUrlInvalidAlert`：
 *    它们在检测到异常时用 conf.json 的 admin 凭证重登并回写 auth.json，
 *    会把只读态悄悄换回管理员态，使断言失真。本模块只做直连 URL + 就绪判定。
 *
 * 用法（一个 test 内先管理员对照，再切只读）：
 *   test.step('管理员对照', async () => {
 *     await utils.gotoAiCachePage(page);
 *     await readonly.expectAdminVisible(utils.ruleHeader(page).getByRole('button', { name: '进入编辑模式' }), '进入编辑模式');
 *   });
 *   test.step('以只读系统管理员登录', async () => { await readonly.loginAsReadonly(page); });
 *   test.step('只读视角进入页面', async () => { await readonly.gotoAsReadonly(page, 'ai-cache-rules', utils.rulePane(page)); });
 *   test.step('写入口被 v-has 隐藏', async () => { await readonly.expectVHasHidden(...); });
 */
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const common = require('./common');
const userUtils = require('../pages/user/UserPage');

const CONF_PATH = path.join(__dirname, '../conf.json');

let confInfo = {};
try {
  confInfo = JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

/** 产品前端基地址（去掉 /login） */
function getAppBaseUrl() {
  return (confInfo['ctlHost'] || '').replace('/login', '');
}

/**
 * 只读系统管理员账号。conf.json 只配置了管理员，只读账号按
 * `docs/<module>/02-功能测试用例/*只读视角*.md` 的「测试数据」约定硬编码；
 * 该账号已在联调环境存在（`GET /open-api/v1/auth/users` 可见 `viewer` → `system_admin_readonly`）。
 */
const READONLY_USER = {
  name: 'viewer',
  password: 'viewer123',
  role: 'system_admin_readonly',
};

const ADMIN_ROLE = 'system_admin';

/** 只读视角隐藏写元素的 class（src/assets/css/global.less `.v-has-hidden`） */
const V_HAS_HIDDEN_CLASS = 'v-has-hidden';

/** 退出编辑模式二次确认文案（aiCache/aiContext/trafficMirror/intentConfig.exitConfirm 四模块同串） */
const EXIT_CONFIRM_TEXT =
  '当前有未提交的改动，退出编辑模式将丢弃这些改动，确认退出？';

/** 未提交离开页面的拦截文案（route.tipUnsavedLeave 等） */
const INFO_TIPS_TITLE = '信息提示';

// ---------------------------------------------------------------------------
// 登录与会话
// ---------------------------------------------------------------------------

/** 读取当前页面 localStorage 里的 user（含 role / sessionKey） */
async function readStoredUser(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  });
}

/**
 * 以只读系统管理员做 UI 登录（不写 auth.json）。
 * 登录后校验 localStorage.user.role 确为只读角色，避免静默停留在管理员态。
 */
async function loginAsReadonly(page, options = {}) {
  const user = options.user || READONLY_USER;
  await userUtils.loginAsUser(
    page,
    user.name,
    user.password,
    user.role,
    options.timeout || 20000,
  );
  const stored = await readStoredUser(page);
  expect(
    stored?.role,
    `只读登录后 localStorage.user.role 应为 ${user.role}`,
  ).toBe(user.role);
  common.log(`已以只读系统管理员登录：${user.name}（role=${user.role}）`);
  return stored;
}

/**
 * 只读视角直连 URL 进入模块页面（不做会话自愈，见文件头约束 2）。
 *
 * 页面加载完再断言很重要：写入口是接口返回后渲染的，若在渲染前统计「可见写入口」，
 * 会得到假通过（0 个）。故这里先等网络静默（部分页面有轮询，故静默失败不视为错误），
 * 再给固定沉降时间。
 *
 * @param {string} pagePath 前端路由路径，如 'ai-cache-rules'（见 src/router/router.js）
 * @param {object} options { ready: Locator 就绪判定元素; timeout: number }
 */
async function gotoAsReadonly(page, pagePath, options = {}) {
  const url = `${getAppBaseUrl()}/${String(pagePath).replace(/^\//, '')}`;
  common.log('只读视角直连 URL 进入: ' + url);
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: options.navTimeout || 30000,
  });
  await settlePage(page, options);
  if (options.ready) {
    await expect(options.ready).toBeVisible({ timeout: options.timeout || 15000 });
  }
  return url;
}

/**
 * 等待页面渲染稳定：先等网络静默（有轮询的页面会超时，忽略），再沉降一段固定时间。
 * 供「统计可见元素」类断言使用——渲染未完成时统计会得到假结果。
 */
async function settlePage(page, options = {}) {
  await page
    .waitForLoadState('networkidle', { timeout: options.idleTimeout || 8000 })
    .catch(() => {});
  await page.waitForTimeout(options.settle || 1500);
}

/** 断言仍是只读态（防止中途被会话自愈换回 admin） */
async function expectStillReadonly(page) {
  const stored = await readStoredUser(page);
  expect(
    stored?.role,
    '当前页面应仍处于只读系统管理员态（role=system_admin_readonly）',
  ).toBe(READONLY_USER.role);
}

// ---------------------------------------------------------------------------
// 可见性断言
// ---------------------------------------------------------------------------

/** 管理员对照：元素可见 */
async function expectAdminVisible(locator, label, options = {}) {
  await expect(locator, `管理员视角「${label}」应可见（对照组）`).toBeVisible({
    timeout: options.timeout || 10000,
  });
}

/** 管理员对照：元素可见且可点击（按钮未被置灰） */
async function expectAdminEnabled(locator, label, options = {}) {
  await expectAdminVisible(locator, label, options);
  await expect(locator, `管理员视角「${label}」应可用（未置灰）`).toBeEnabled();
}

/**
 * 只读视角写元素不可见。
 * `toBeHidden()` 同时覆盖「被 v-has 隐藏」与「因模式收敛根本不渲染（count=0）」两种实现。
 */
async function expectHidden(locator, label) {
  await expect(locator, `只读视角「${label}」不应可见`).toBeHidden();
}

/** 一次断言多个写元素全部不可见 */
async function expectAllHidden(entries) {
  for (const [label, locator] of entries) {
    await expectHidden(locator, label);
  }
}

/**
 * 用「CSS/文本」定位按钮（**不要用 `getByRole` 定位 v-has 写元素**）。
 *
 * 坑：`v-has` 的隐藏手段是 `display: none`，而 Playwright 的 role 定位基于无障碍树，
 * 看不见 `display:none` 的元素——`getByRole('button', { name })` 对已隐藏的 v-has 写按钮
 * 会返回 count 0，断言「仍在 DOM 中」就必然失败（2026-10-16 实测：providers「添加服务商」、
 * security「触发任务」均因此误报）。本函数用 CSS 选择器 + 文本过滤，能正确命中隐藏元素。
 */
function buttonByText(scope, text) {
  return scope
    .locator('button, .ivu-btn, [role="button"]')
    .filter({ hasText: text });
}

/**
 * 只读视角的 `v-has` 元素：仍在 DOM 中，class 含 `.v-has-hidden` 且不可见。
 * 比单纯 `toBeHidden()` 更强——同时钉住「隐藏由 v-has 机制实现」。
 *
 * 仅适用于**只读态下仍会渲染**的写元素。若元素同时受 `v-if` / 空数据等条件约束
 * （只读态本就不渲染），应改用 `expectHidden`，否则会误报。
 */
async function expectVHasHidden(locator, label) {
  const count = await locator.count();
  if (count === 0) {
    throw new Error(
      `只读视角「${label}」在 DOM 中不存在（count=0），无法断言 v-has 隐藏。两种可能：\n` +
        '  ① locator 用了 getByRole —— Playwright role 定位看不见 display:none 的元素，' +
        'v-has 写元素被隐藏后必须改用 CSS/文本定位（用本模块的 buttonByText / 具体 CSS 锚点）；\n' +
        '  ② 该元素同时受模式收敛（v-if / mode）或数据缺失（如列表为空）约束，' +
        '只读态本就不渲染它 —— 此时应改用 expectHidden。',
    );
  }
  // 隐藏标记有两种载体：class `.v-has-hidden` 与同名属性 `[v-has-hidden]`（产品两处都落）。
  // class 可能被抹掉：元素自身若有响应式 class（如 iView Button 的 :class 由 props 计算），
  // 其组件重渲染时 Vue 的 class 模块会整串重写 class 属性，命令式加上的类被清空；
  // 此时由属性兜底。故断言口径 = **元素必须不可见** + 两种标记至少存在一种。
  await expectHidden(locator, label);
  const marked = await locator.evaluate(
    (el, cls) => el.classList.contains(cls) || el.hasAttribute(cls),
    V_HAS_HIDDEN_CLASS,
  );
  expect(
    marked,
    `只读视角「${label}」应带 .v-has-hidden 类或 [v-has-hidden] 属性（v-has 指令）`,
  ).toBe(true);
}

/** 只读视角保留的只读入口：可见 */
async function expectReadonlyVisible(locator, label, options = {}) {
  await expect(locator, `只读视角「${label}」应可见`).toBeVisible({
    timeout: options.timeout || 10000,
  });
}

/** 元素完全不存在（如只读视角下不渲染的写按钮） */
async function expectAbsent(locator, label) {
  await expect(locator, `「${label}」应不存在`).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// 掩码（复刻后端 lib/xmask 规则，仅用于只读视角的期望值）
// ---------------------------------------------------------------------------

/**
 * 密钥掩码规则（api-keys.key / providers.keys[].key / tokens.token 同规则）：
 * - 长度 > 8：前 4 + `********` + 后 4
 * - 4 < 长度 ≤ 8：前 2 + `****` + 后 2
 * - 长度 ≤ 4：全掩码
 */
function maskSecret(value) {
  const s = String(value ?? '');
  const n = s.length;
  if (n > 8) return s.slice(0, 4) + '********' + s.slice(-4);
  if (n > 4) return s.slice(0, 2) + '****' + s.slice(-2);
  return '********';
}

// ---------------------------------------------------------------------------
// 全站巡检（跨模块不变量，供只读巡检 spec 使用）
// ---------------------------------------------------------------------------

/**
 * 写操作入口文案基线（只读态下**不应存在可见匹配**）。
 *
 * 来源：`ai-gateway-web/src/i18n/zh.js` 中所有挂在全局指令 `v-has` 上的写控件文案
 * （枚举方式：`grep -rn "v-has" ai-gateway-web/src/`，再逐个反查 zh.js 取值），
 * 另含靠模式收敛隐藏的写控件（覆写编辑 / 保存并发布 / 启用 / 停用 / 添加{obj}）。
 *
 * 注意：不含裸的「重置」（检索栏的「重置」是只读控件），只含「重置配额」。
 */
const WRITE_CONTROL_PATTERN = new RegExp(
  [
    '^添加', // com.createX 添加{obj}、aiCache/aiContext/trafficMirror.addRule、eppPool.addGroup（+ 添加组）
    '^创建', // com.create / com.establish / entity.createType / entity.createEntity / apiKey
    '^新增', // modelPrices.create 新增定价
    'YAML 导入', // modelPrices.importYaml
    '^编辑', // com.edit / eppPool.edit / modelPrices 编辑定价
    '^删除', // com.del
    '^保存', // com.save / eppPool.save
    '^提交', // com.submit / com.submitAndEffect
    '保存并发布', // intentConfig.saveAndPublish
    '^变更角色', // user.changeRole
    '^修改密码', // user.changePassword
    '^重置配额', // apiKey.resetQuota / entity.resetQuota
    '^触发任务', // security.trigger
    '^覆写', // epp 调度分配「覆写编辑」
    '^启用$', // route table 行内启用
    '^停用$', // route table 行内停用
    '^进入编辑模式$', // route.enterEditMode
    '^退出编辑模式$', // route.exitEditMode
    '^取消$', // com.cancel（编辑态控件，只读态不可达；模态框按钮不可见故不误报）
  ].join('|'),
);

/** 可交互元素（按钮/链接）——限定为按钮类，避免把列头「创建时间」等普通文本误判为写入口 */
const INTERACTIVE_SELECTOR = 'button, a[href], .ivu-btn, [role="button"]';

/**
 * 遍历前端路由（`ai-gateway-web/src/router/router.js`）。
 * `cert` 未列入：该模块 2026-09-11 随菜单移除，`playwright.config.js` 有 testIgnore。
 */
const SWEEP_ROUTES = [
  { slug: 'user', label: '用户管理' },
  { slug: 'providers', label: '模型服务商' },
  { slug: 'cluster', label: 'AI 业务集群' },
  { slug: 'route-tables', label: '路由表列表' },
  { slug: 'ai-cache-rules', label: 'AI 缓存规则' },
  { slug: 'ai-context-rules', label: 'AI 上下文压缩' },
  { slug: 'traffic-mirror-rules', label: '流量镜像规则' },
  { slug: 'intent-config', label: '意图配置' },
  { slug: 'api-key', label: 'API-Key 管理' },
  { slug: 'batches', label: '批量任务' },
  { slug: 'Entity', label: 'Entity 管理' },
  { slug: 'epp', label: 'EPP 调度' },
  { slug: 'model-prices', label: '模型定价' },
  { slug: 'operation-logs', label: '操作日志' },
  { slug: 'security', label: '密钥收敛' },
  { slug: 'report', label: '数据报表' },
];

/** 页面内容容器（layout.vue 恒定渲染，与具体模块无关） */
function contentView(page) {
  return page.locator('.bfe-content-view').first();
}

/** 当前可见的写操作入口文案列表（只读态应为空数组） */
async function visibleWriteControls(page) {
  return page.evaluate(
    ({ selector, pattern }) => {
      const re = new RegExp(pattern);
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return true;
      };
      const out = [];
      document.querySelectorAll(selector).forEach((el) => {
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || !isVisible(el)) return;
        if (re.test(text)) out.push(text.replace(/\s+/g, ' '));
      });
      return out;
    },
    { selector: INTERACTIVE_SELECTOR, pattern: WRITE_CONTROL_PATTERN.source },
  );
}

/** 带 `.v-has-hidden` 的元素个数（只读态下应 > 0，证明巡检确有对象） */
/**
 * 只读隐藏标记选择器：**类与属性两种载体都要覆盖**。
 * 产品侧 `v-has` 同时落 `.v-has-hidden` 类与同名属性；类可能被「元素自身有响应式 class
 * 的组件重渲染」抹掉（Vue class 模块整串重写 class 属性），属性作为兜底仍在。
 */
const V_HAS_HIDDEN_SELECTOR = `.${V_HAS_HIDDEN_CLASS}, [${V_HAS_HIDDEN_CLASS}]`;

async function vHasHiddenCount(page) {
  return page.locator(V_HAS_HIDDEN_SELECTOR).count();
}

/**
 * `.v-has-hidden` 机制自检：每个挂该 class 的元素自身 computed display 必须为 none。
 * 该 class 由 `display:none !important` 生效，因此与祖先是否隐藏无关；
 * 若有人去掉 `!important`（被 `v-show` 的内联 display 压过）或改坏 CSS，此处会报。
 */
async function vHasHiddenViolations(page) {
  return page.evaluate((selector) => {
    const out = [];
    document.querySelectorAll(selector).forEach((el) => {
      const display = window.getComputedStyle(el).display;
      if (display !== 'none') {
        out.push(
          (el.tagName || '').toLowerCase() +
            ' display=' +
            display +
            ' text=' +
            (el.innerText || '').trim().slice(0, 40),
        );
      }
    });
    return out;
  }, V_HAS_HIDDEN_SELECTOR);
}

/** 路由可达判定：内容容器可见、URL 命中目标 slug、无会话/URL 异常模态框 */
async function expectRouteReachable(page, slug, options = {}) {
  await expect(
    contentView(page),
    `路由 /${slug} 内容容器应可见`,
  ).toBeVisible({ timeout: options.timeout || 15000 });
  expect(page.url(), `路由应停留在 /${slug}`).toContain(`/${slug}`);
  await expect(
    page.locator('.ivu-modal-wrap').filter({ visible: true }).filter({
      hasText: /当前url非法|当前未登录或者登录已过期|Session Key/,
    }),
    `路由 /${slug} 不应出现会话/URL 异常弹窗`,
  ).toHaveCount(0);
}

module.exports = {
  READONLY_USER,
  ADMIN_ROLE,
  V_HAS_HIDDEN_CLASS,
  EXIT_CONFIRM_TEXT,
  INFO_TIPS_TITLE,
  WRITE_CONTROL_PATTERN,
  SWEEP_ROUTES,
  getAppBaseUrl,
  readStoredUser,
  loginAsReadonly,
  gotoAsReadonly,
  settlePage,
  expectStillReadonly,
  expectAdminVisible,
  expectAdminEnabled,
  expectHidden,
  expectAllHidden,
  buttonByText,
  expectVHasHidden,
  expectReadonlyVisible,
  expectAbsent,
  maskSecret,
  contentView,
  visibleWriteControls,
  vHasHiddenCount,
  vHasHiddenViolations,
  expectRouteReachable,
};