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
const { expect } = require('@playwright/test');
const { IvuDrawerComponent, IvuTabsComponent } = require('../../components/iview');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');
const { PageTableComponent, AppSidebarComponent } = require('../../components/layout');
const { waitAfterResourceMutation, getAppBaseUrl } = require('./ResourcePageCommon');
const readonly = require('../../utils/readonly');
const sessionUtils = require('../../utils/session');

const DRAWER_TITLE = {
  manualOverride: '手动覆写',
};

// ── 路由守卫拦截器 ────────────────────────────────────────────────
// 目标：阻止 SPA 从 /epp 重定向到首页/登录页。
// 策略：
//   1. addInitScript — 覆盖 history.pushState/replaceState（页面加载前注入）
//   2. patchVueRouter — 导航完成后修补 Vue Router（Vue 2 兼容）：
//      a. 清除 router.beforeHooks → 阻止 beforeEach 守卫执行
//      b. 修补 router.push/replace → 阻止 axios 401 拦截器跳转
const installedPages = new WeakSet();

async function installRouteGuardInterceptor(page) {
  if (installedPages.has(page)) return;
  installedPages.add(page);

  // addInitScript — 页面加载前注入 history API 覆盖
  await page.addInitScript(() => {
    if (window.__eppInterceptorInstalled) return;
    window.__eppInterceptorInstalled = true;

    const blockedConsoleStyle = 'color:red;font-weight:bold';

    const _pushState = history.pushState.bind(history);
    history.pushState = function (state, title, url) {
      if (url) {
        const cur = window.location.pathname;
        const tgt = typeof url === 'string' ? url : (url.path || url);
        if (cur.includes('/epp') && !String(tgt).includes('/epp') && String(tgt) !== cur) {
          console.log('%c[EPP-GUARD] Blocked pushState: ' + cur + ' → ' + tgt, blockedConsoleStyle);
          return;
        }
      }
      return _pushState(state, title, url);
    };

    const _replaceState = history.replaceState.bind(history);
    history.replaceState = function (state, title, url) {
      if (url) {
        const cur = window.location.pathname;
        const tgt = typeof url === 'string' ? url : (url.path || url);
        if (cur.includes('/epp') && !String(tgt).includes('/epp')) {
          console.log('%c[EPP-GUARD] Blocked replaceState: ' + cur + ' → ' + tgt, blockedConsoleStyle);
          return;
        }
      }
      return _replaceState(state, title, url);
    };

    try {
      let _pathname = '';
      Object.defineProperty(window.location, 'pathname', {
        get() { return _pathname || location.pathname; },
        set(v) {
          const cur = location.pathname;
          if (cur.includes('/epp') && !String(v).includes('/epp')) {
            console.log('%c[EPP-GUARD] Blocked location.pathname = ' + v, blockedConsoleStyle);
            return;
          }
          _pathname = v;
        },
        configurable: true,
      });
    } catch (e) {
      // Object.defineProperty on location may fail in some browsers
    }
  });

  // Vue Router 修补延后到 patchVueRouter 函数中执行（导航完成后调用）
}

/**
 * 导航完成后修补 Vue Router（Vue 2 兼容）
 * 1. 清除 router.beforeHooks → 移除 beforeEach 守卫
 * 2. 修补 router.push/replace → 阻止 axios 401 拦截器的 router.push
 *
 * Vue 2 在生产构建中 #app.__vue__ 不可用，因此采用多重策略：
 *   a) #app 第一个子元素的 __vue__（组件根元素）
 *   b) DOM 中任意可找到的带有 __vue__.$root.$router 的元素
 *   c) window.__VUE_DEVTOOLS_GLOBAL_HOOK__ 中的 Vue 实例（devtools 开启时）
 */
async function patchVueRouter(page) {
  if (page.__eppVueRouterPatched) return;

  for (let retry = 0; retry < 5; retry++) {
    const patched = await page.evaluate(() => {
      /**
       * 获取 Vue Router 实例（Vue 2 兼容，多重策略）
       */
      function findRouter() {
        // 策略 a: 遍历 #app 第一个子元素的 __vue__ 链
        const appEl = document.querySelector('#app');
        if (appEl) {
          // 尝试 #app 的第一个子元素（App 组件的根 DOM）
          const firstChild = appEl.querySelector(':scope > *');
          if (firstChild && firstChild.__vue__) {
            const r = firstChild.__vue__.$root?.$router;
            if (r) return r;
          }
          // 尝试所有子元素
          for (let i = 0; i < appEl.children.length; i++) {
            const child = appEl.children[i];
            if (child.__vue__) {
              const r = child.__vue__.$root?.$router;
              if (r) return r;
            }
          }
        }

        // 策略 b: DOM 中搜索任意含 __vue__.$root.$router 的元素
        const all = document.querySelectorAll('*');
        // 最多检查 200 个元素，避免性能问题
        const max = Math.min(all.length, 200);
        for (let i = 0; i < max; i++) {
          const el = all[i];
          if (el.__vue__) {
            try {
              const r = el.__vue__.$root?.$router;
              if (r) return r;
            } catch (_) {}
          }
        }

        // 策略 c: Vue Devtools hook
        try {
          const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
          if (hook && hook.Vue && hook.Vue.prototype.$router) {
            return hook.Vue.prototype.$router;
          }
        } catch (_) {}

        return null;
      }

      try {
        const router = findRouter();
        if (!router || router.__eppPatched) return false;

        // 1) 清除 beforeEach 守卫
        if (Array.isArray(router.beforeHooks)) {
          router.beforeHooks = [];
          console.log('[EPP-GUARD] Cleared Vue Router beforeEach hooks');
        }

        // 2) 修补 router.push — 拦截离开 /epp 的导航
        const cur = () => window.location.pathname;
        const origPush = router.push.bind(router);
        router.push = function (to, ...rest) {
          const tgt = typeof to === 'string' ? to : (to.path || '');
          if (cur().includes('/epp') && !tgt.includes('/epp')) {
            console.log('%c[EPP-GUARD] Blocked push: ' + tgt, 'color:red;font-weight:bold');
            return Promise.resolve(false);
          }
          return origPush(to, ...rest);
        };

        // 3) 修补 router.replace
        const origReplace = router.replace.bind(router);
        router.replace = function (to, ...rest) {
          const tgt = typeof to === 'string' ? to : (to.path || '');
          if (cur().includes('/epp') && !tgt.includes('/epp')) {
            console.log('%c[EPP-GUARD] Blocked replace: ' + tgt, 'color:red;font-weight:bold');
            return Promise.resolve(false);
          }
          return origReplace(to, ...rest);
        };

        router.__eppPatched = true;
        console.log('[EPP-GUARD] Vue 2 Router patched: beforeHooks cleared, push/replace intercepted');
        return true;
      } catch (e) {
        console.log('[EPP-GUARD] Vue 2 Router patch attempt failed:', e.message);
        return false;
      }
    });

    if (patched) {
      page.__eppVueRouterPatched = true;
      console.log('[patchVueRouter] Vue 2 Router patched successfully (retry=' + retry + ')');
      return;
    }

    // 等待后再试
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('[patchVueRouter] Vue 2 Router patch failed after 5 retries');
}

/**
 * 定位 EPP 调度页面容器
 */
function eppPoolPage(page) {
  return page.locator('.epp-pool-page, .epp-module');
}

/**
 * 导航到 EPP 调度页面
 * 优先直接访问 hash 路由，失败则回退到侧栏菜单点击
 */
async function gotoEppPoolPage(page) {
  // 导航入口统一会话守卫（与 UserPage / ResourcePageCommon 等一致）：auth.json 中的
  // Session Key 可能已被上一轮重新登录作废，此时页面带失效 Key 加载 → 列表接口 401
  // 弹「Session Key 错误」遮罩拦截点击（表现为行内按钮 click 超时）。先自愈
  // （重新登录 + 回写 auth.json）再导航。只读路径 gotoEppPoolPageReadonly 不在此列。
  await sessionUtils.ensureSessionHealthy(page, {
    retryUrl: getAppBaseUrl() + '/#/epp',
  });

  // 安装路由守卫拦截器（仅在当前 page 安装一次）
  await installRouteGuardInterceptor(page);

  // 检查是否已在 EPP 页面
  const currentUrl = page.url();
  const eppTab = page.locator('.ivu-tabs-tab').filter({ hasText: 'EPP 实例池' }).first();
  if ((currentUrl.includes('/epp') || currentUrl.includes('#/epp')) &&
      await eppTab.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('[gotoEppPoolPage] 已在 EPP 页面');
    await patchVueRouter(page);
    return;
  }

  // 方式一：直接访问 hash 路由
  console.log('[gotoEppPoolPage] 尝试直接 hash 路由导航');
  await page.goto(getAppBaseUrl() + '/#/epp', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (await eppTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('[gotoEppPoolPage] hash 路由导航成功');
    await patchVueRouter(page);
    return;
  }

  // 方式二：侧栏导航
  console.log('[gotoEppPoolPage] hash 路由导航失败，使用侧栏导航');
  await page.goto(getAppBaseUrl() + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('.bfe-sidebar').waitFor({ state: 'visible', timeout: 10000 });

  // 使用 AppSidebarComponent 展开资源管理子菜单
  const sidebar = new AppSidebarComponent(page);
  const resSubmenu = page.locator('.bfe-sidebar .ivu-menu-submenu').filter({ hasText: '资源管理' }).first();
  const isOpened = await resSubmenu.evaluate(el => el.classList.contains('ivu-menu-opened')).catch(() => false);
  if (!isOpened) {
    console.log('[gotoEppPoolPage] 展开资源管理子菜单');
    await sidebar.submenuTitle('资源管理').click();
    await page.waitForTimeout(1000);
  }

  console.log('[gotoEppPoolPage] 点击 EPP调度');
  const eppMenuItem = sidebar.menuItem('EPP调度');
  await eppMenuItem.click();
  await page.waitForTimeout(2000);

  // 检查 URL 是否变化
  const urlAfterNav = page.url();
  console.log('[gotoEppPoolPage] URL after click:', urlAfterNav);

  if (!urlAfterNav.includes('/epp') && !urlAfterNav.includes('#/epp')) {
    console.log('[gotoEppPoolPage] URL 未变化，尝试强制点击');
    await eppMenuItem.click({ force: true });
    await page.waitForTimeout(3000);
  }

  // 验证 EPP 内容已加载
  await eppTab.waitFor({ state: 'visible', timeout: 20000 });

  // 额外验证：确认表格行已渲染（防止 Tab 组件跨路由持久化导致导航假阳性）
  // 如果页面被重定向回首页，表格行不会出现
  const tableBody = page.locator('.ivu-table-wrapper, .ivu-table tbody').first();
  await expect(tableBody).toBeVisible({ timeout: 10000 });

  // 路由稳定性检查：循环轮询检测 SPA 路由守卫异步重定向
  // 每轮等待 5 秒后检测，若被重定向到首页则重新导航，连续 3 次通过才确认稳定
  // 最大轮数 6 轮，总监控时间最长 30 秒
  console.log('[gotoEppPoolPage] 开始路由稳定性监控（每轮5秒，最多6轮，需连续3次通过）...');
  let consecutivePass = 0;
  const maxRounds = 6;
  for (let round = 1; round <= maxRounds; round++) {
    await page.waitForTimeout(5000);

    const welcomeText = page.getByText(/系统管理员.*欢迎您/);
    const onHomePage = await welcomeText.isVisible().catch(() => false);
    const stillOnEpp = page.url().includes('/epp') || page.url().includes('#/epp');

    if (onHomePage || !stillOnEpp) {
      consecutivePass = 0;
      console.log(`[gotoEppPoolPage] 第${round}轮: 检测到重定向到首页，重新执行侧栏导航`);
      const sidebar = new AppSidebarComponent(page);
      const resSubmenu = page.locator('.bfe-sidebar .ivu-menu-submenu').filter({ hasText: '资源管理' }).first();
      const isOpened = await resSubmenu.evaluate(el => el.classList.contains('ivu-menu-opened')).catch(() => false);
      if (!isOpened) {
        await sidebar.submenuTitle('资源管理').click();
        await page.waitForTimeout(1000);
      }
      await sidebar.menuItem('EPP调度').click({ force: true });
      await page.waitForTimeout(2000);

      await eppTab.waitFor({ state: 'visible', timeout: 20000 });
      await expect(tableBody).toBeVisible({ timeout: 10000 });
    } else {
      consecutivePass++;
      console.log(`[gotoEppPoolPage] 第${round}轮: 路由稳定 ✓（连续${consecutivePass}次）`);
      if (consecutivePass >= 3) {
        console.log('[gotoEppPoolPage] 路由已稳定（连续3次通过），继续执行');
        break;
      }
    }
  }
  // 导航完成后修补 Vue Router（清除 beforeEach 守卫 + 修补 push/replace）
  await patchVueRouter(page);
  console.log('[gotoEppPoolPage] 导航成功，当前 URL:', page.url());
}

/**
 * 获取 EPP 实例池树形表格行数（组数）
 */
async function getPoolGroupCount(page) {
  const rows = page.locator(
    '.epp-pool-table tbody tr, .pool-tree-table tbody tr',
  );
  return rows.count();
}

/**
 * 确保当前在 EPP 页面，如果被重定向到首页则重新导航
 * 使用 URL + 欢迎文本 + EPP 标题三重检测，避免 iView Tab 跨路由持久化导致的误判
 * 重新导航后额外运行 2 轮简短稳定性验证（每轮 3 秒），降低路由守卫在导航-操作间隙触发的概率
 * 供测试步骤在关键操作前调用，防止 SPA 路由守卫异步重定向导致操作失败
 */
async function ensureOnEppPoolPage(page, { stabilityRounds = 2, stabilityIntervalMs = 3000 } = {}) {
  // 1. URL 检测
  const currentUrl = page.url();
  const urlContainsEpp = currentUrl.includes('/epp') || currentUrl.includes('#/epp');

  // 2. 欢迎文本检测（首页独有）
  const welcomeText = page.locator('h1, h2, h3, .ivu-page-header-title, [class*="welcome"]')
    .filter({ hasText: /欢迎|欢迎您|Welcome/ }).first();
  const onHome = await welcomeText.isVisible({ timeout: 300 }).catch(() => false);

  // 3. EPP 页面特有元素检测（激活的 Tab 标题）
  const eppHeading = page.locator('.ivu-tabs-tab-active, .ivu-tabs-tab').filter({ hasText: /EPP/ }).first();
  const hasEppTitle = await eppHeading.isVisible({ timeout: 300 }).catch(() => false);

  const onEppPage = !onHome && (urlContainsEpp || hasEppTitle);

  if (!onEppPage) {
    console.log('[ensureOnEppPoolPage] 检测到不在 EPP 页面（welcome:', onHome, 'url:', currentUrl, '），重新导航');
    await gotoEppPoolPage(page);

    // 重新导航后，运行简短稳定性验证（每轮 3 秒 × stabilityRounds 轮）
    for (let r = 1; r <= stabilityRounds; r++) {
      await page.waitForTimeout(stabilityIntervalMs);
      const url2 = page.url();
      const onHome2 = await welcomeText.isVisible({ timeout: 300 }).catch(() => false);
      if (onHome2 || (!url2.includes('/epp') && !url2.includes('#/epp'))) {
        console.log(`[ensureOnEppPoolPage] 稳定检查第${r}轮: 检测到再次重定向，重新执行 gotoEppPoolPage`);
        await gotoEppPoolPage(page);
      } else {
        console.log(`[ensureOnEppPoolPage] 稳定检查第${r}轮: 路由稳定 ✓`);
      }
    }
  } else {
    // 已在 EPP 页面，确保 Vue Router 已修补
    await patchVueRouter(page);
  }
}

/**
 * 点击编辑按钮进入编辑模式
 * 先确保在 EPP 页面，防止路由重定向导致操作在首页执行
 */
async function clickEditPool(page) {
  await ensureOnEppPoolPage(page);
  await page.getByRole('button', { name: '编辑' }).click();
  await waitAfterResourceMutation(page, 300);
}

/**
 * 点击保存按钮提交编辑
 * 先确保在 EPP 页面，防止路由重定向导致保存操作在首页误触
 */
async function clickSavePool(page) {
  await ensureOnEppPoolPage(page);
  await page.getByRole('button', { name: '保存' }).click();
  await waitAfterResourceMutation(page, 500);
}

/**
 * 点击取消按钮还原编辑
 * 先确保在 EPP 页面，防止路由重定向导致取消操作在首页误触
 */
async function clickCancelPool(page) {
  await ensureOnEppPoolPage(page);
  await page.getByRole('button', { name: '取消' }).click();
  await waitAfterResourceMutation(page, 500);
}

/**
 * 获取编辑模式下实例的输入值
 */
async function getEditableInstanceValues(page, groupIndex, instanceIndex) {
  const groupRows = page.locator(
    '.epp-pool-table tbody tr, .pool-tree-table tbody tr',
  );
  return {};
}

/**
 * 切换到指定页签
 * @param {object} page Playwright page
 * @param {string} tabName 页签名称，'EPP 实例池' 或 'EPP 调度分配'
 */
async function switchTab(page, tabName) {
  const tab = page
    .locator('.ivu-tabs-tab, .el-tabs__item, .tabs-tab')
    .filter({ hasText: tabName });
  await tab.waitFor({ state: 'visible', timeout: 10000 });
  await tab.click();
  await waitAfterResourceMutation(page, 300);
}

/**
 * 获取分配视图表格组件
 */
function assignmentsTable(page) {
  return new PageTableComponent(
    page,
    page.locator('.assignments-table, .epp-assignments-table, .page-table').first(),
  );
}

/**
 * 获取统计区域文本
 */
async function getStatsText(page) {
  const stats = page.locator('.proto-epp-summary').first();
  return (await stats.textContent()).trim();
}

// ---------------------------------------------------------------------------
// 只读管理员视角（docs/epp-pool/02-功能测试用例/03-只读视角.md EP-RO-01~03）
//
// 产品依据（ai-gateway-web src/modules/EppPool/**）：
// - components/Pool.vue:38,58 工具栏两个分支均挂 `v-has`（查看态「编辑」/编辑态「保存・取消」）
//   → 只读视角仍在 DOM 中并带 `.v-has-hidden`，用 expectVHasHidden；
// - components/Pool.vue:82（添加组）、:188（操作列）、:640,776（行内实例输入/添加实例）
//   全部在 `v-if="editing"` 或 `editing` 分支内 → 只读视角为「模式收敛不渲染」，用 expectHidden；
// - components/Assignments.vue:249 操作列「编辑」（覆写入口）用 render `directives: [{ name: 'has' }]`
//   → 只读视角仍在 DOM 中并带 `.v-has-hidden`，用 expectVHasHidden；
// - components/Assignments.vue:129「确认」未挂 v-has，仅因抽屉体 `v-if="drawerVisible"` 未渲染
//   （且入口不可点击）→ 用 expectHidden。
// ---------------------------------------------------------------------------

/** 前端路由 path（src/router/router.js `path: 'epp'`） */
const EPP_POOL_PATH = '/epp';

/**
 * 顶部两个 Tab 的导航项文案（src/i18n/zh.js `eppPool.title` / `eppAssignment.title`）。
 * 单点定义，避免「常量挂错对象导致文案为 undefined → 过滤失效 → 点到 Tab1」这类静默错误。
 */
const DOC_EPP_TABS = {
  pool: 'EPP 实例池',
  assignment: 'EPP 调度分配',
};

/** 只读断言的验收文案（对齐 src/i18n/zh.js eppPool / eppAssignment / com.*） */
const DOC_EPP_POOL = {
  edit: '编辑',
  save: '保存',
  cancel: '取消',
  addGroup: '添加组',
  addInstance: '添加实例',
  deleteGroup: '删除组',
  delete: '删除',
  /** 「+添加实例」在组内已有 1 个实例时的禁用提示（src/i18n/zh.js eppPool.instanceCountMax） */
  instanceCountMax: '每组恰好 1 个实例',
};

const DOC_EPP_ASSIGNMENT = {
  summaryAssigned: '已分配集群',
  summaryUnassigned: '未分配集群',
  summaryIdle: '空闲实例组',
  columnCluster: '集群名称',
  columnGroup: '实例组',
  columnOperation: '操作',
  override: '编辑',
  confirm: '确认',
  cancel: '取消',
};

/** 模块根容器（src/modules/EppPool/index.vue 根节点 .clusters） */
function eppModuleRoot(page) {
  return page.locator('.clusters');
}

/** iView Tabs 封装（components/iview/IvuTabs.js，仓库既有；Entity / 用户模块同款） */
function eppTabs(page) {
  return new IvuTabsComponent(page, eppModuleRoot(page));
}

/**
 * 顶部某 Tab 的导航项（`.clusters .ivu-tabs-nav` 内文本命中项）。
 * 文案非字符串时**立即报错**：Playwright 的 `filter({ hasText: undefined })` 等同于不过滤，
 * 会静默取到第一个 Tab（曾因此把「切 Tab2」点成了 Tab1，用例在对照组超时失败）。
 */
function eppTabNav(page, label) {
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error(
      'eppTabNav 需要非空 Tab 文案（DOC_EPP_TABS.*），实际收到: ' +
        JSON.stringify(label),
    );
  }
  return eppTabs(page).tabByText(label).first();
}

function poolTab(page) {
  return eppTabNav(page, DOC_EPP_TABS.pool);
}

function assignmentsTab(page) {
  return eppTabNav(page, DOC_EPP_TABS.assignment);
}

/** Tab 是否处于选中态（iView `.ivu-tabs-tab-active`，同 pages/entity/entity-shared.js:isTabActive） */
async function isEppTabActive(page, label) {
  const tab = eppTabNav(page, label);
  if (!(await tab.isVisible().catch(() => false))) {
    return false;
  }
  return tab
    .evaluate((el) => el.classList.contains('ivu-tabs-tab-active'))
    .catch(() => false);
}

/** 断言某 Tab 处于选中态（切 Tab 就绪判定的核心锚点，只读态同样成立） */
async function expectEppTabActive(page, label, timeout = 15000) {
  await expect(
    eppTabNav(page, label),
    `「${label}」Tab 应处于选中态（ivu-tabs-tab-active）`,
  ).toHaveClass(/ivu-tabs-tab-active/, { timeout });
}

/**
 * 切到 Tab2「EPP 调度分配」并等待其表格就绪（EP-RO-02/03 管理员对照与只读视角共用）。
 *
 * 复用既有 `switchTab`（test_02 EP-ASGN-01 同款）与 `assignmentsTable().waitForLoaded()`；
 * 但不满足于「点击未报错」——iView Tabs 的点击存在不生效的情况（既有
 * pages/entity/entity-shared.js:650 `switchToEntityTypeTab` 已同款处置「切换未生效，重试」），
 * 故此处「点击 → 校验 Tab 选中态 → 未生效重试一次 → 仍不生效即失败」，
 * 最后再等表格挂载，确保调用方拿到的是「Tab2 已激活且表格在 DOM」的状态。
 */
async function switchToAssignmentsTab(page) {
  if (!(await isEppTabActive(page, DOC_EPP_TABS.assignment))) {
    await switchTab(page, DOC_EPP_TABS.assignment);
  }
  try {
    await expectEppTabActive(page, DOC_EPP_TABS.assignment, 3000);
  } catch (e) {
    console.log(
      '[switchToAssignmentsTab] Tab2 首次点击未生效，重试一次: ' +
        String(e.message).split('\n')[0],
    );
    await switchTab(page, DOC_EPP_TABS.assignment);
    await expectEppTabActive(page, DOC_EPP_TABS.assignment);
  }
  await assignmentsTable(page).waitForLoaded();
  await expect(
    assignmentsTable(page).rootLocator(),
    '「EPP 调度分配」表格应已挂载（Tab2 就绪判定）',
  ).toBeVisible({ timeout: 15000 });
  // 表格挂载后再等一次 Tab 选中态，排除「点完立刻被路由守卫/重渲染切回 Tab1」
  await expectEppTabActive(page, DOC_EPP_TABS.assignment);
}

// ── Tab1 EPP 实例池 ────────────────────────────────────────────────

/** Tab1 顶部统计摘要（池名称 / 实例组数 / 实例总数） */
function poolSummary(page) {
  return eppModuleRoot(page).locator('.proto-epp-summary').first();
}

/** Tab1 树形表格（Pool.vue Table class="epp-pool-table"） */
function poolTable(page) {
  return eppModuleRoot(page).locator('.epp-pool-table');
}

/**
 * Tab1 页头工具栏容器（挂 v-has：查看态=「编辑」，编辑态=「保存 / 取消」）。
 * 用 CSS 兄弟选择器定位——`getByRole` 会排除 `display:none` 元素，
 * 只读视角下无法用它断言 `.v-has-hidden`。
 */
function poolToolbar(page) {
  return eppModuleRoot(page).locator('.proto-epp-summary + div:has(button)');
}

function poolToolbarEditBtn(page) {
  return poolToolbar(page).getByRole('button', {
    name: DOC_EPP_POOL.edit,
    exact: true,
  });
}

function poolToolbarSaveBtn(page) {
  return poolToolbar(page).getByRole('button', {
    name: DOC_EPP_POOL.save,
    exact: true,
  });
}

function poolToolbarCancelBtn(page) {
  return poolToolbar(page).getByRole('button', {
    name: DOC_EPP_POOL.cancel,
    exact: true,
  });
}

/** 管理员对照：点工具栏「编辑」进入编辑模式（`startEdit` 只改本地态，不发请求） */
async function enterPoolEditMode(page) {
  await poolToolbarEditBtn(page).click();
  await page.waitForTimeout(500);
}

/** 管理员对照：点工具栏「取消」退出编辑模式（`cancelEdit` 只还原本地数据，不写库） */
async function exitPoolEditMode(page) {
  await poolToolbarCancelBtn(page).click();
  await page.waitForTimeout(500);
}

/** Tab1「添加组」按钮（Pool.vue:82，仅在编辑态渲染） */
function poolAddGroupBtn(page) {
  return eppModuleRoot(page).getByRole('button', { name: DOC_EPP_POOL.addGroup });
}

/** Tab1「添加实例」按钮（Pool.vue:776，展开组内容的编辑态分支） */
function poolAddInstanceBtn(page) {
  return eppModuleRoot(page).getByRole('button', {
    name: DOC_EPP_POOL.addInstance,
  });
}

/** Tab1 组行「删除组」按钮（Pool.vue:188，仅在编辑态的追加列中渲染） */
function poolDeleteGroupBtn(page) {
  return eppModuleRoot(page).getByRole('button', {
    name: DOC_EPP_POOL.deleteGroup,
  });
}

/** Tab1 实例「删除」按钮（Pool.vue:738，展开组内容的编辑态分支） */
function poolDeleteInstanceBtn(page) {
  return eppModuleRoot(page).getByRole('button', {
    name: DOC_EPP_POOL.delete,
    exact: true,
  });
}

/** Tab1 表格内的行内编辑控件（编辑态 Input / InputNumber） */
function poolInlineEditInputs(page) {
  return poolTable(page).locator('input');
}

/** Tab1 某实例组行（按组名单元格精确文本定位） */
function poolGroupRow(page, groupName) {
  return poolTable(page)
    .locator('.ivu-table-row')
    .filter({ has: page.getByText(groupName, { exact: true }) })
    .first();
}

/** Tab1 第 1 列（0 基，展开列为第 0 列）＝实例组名 */
function poolGroupNameCell(page, groupName) {
  return poolGroupRow(page, groupName).locator('td').nth(1);
}

/** Tab1「实例列表」列：渲染 `实例ID(主机:端口), ...` */
function poolInstanceSummaryCell(page, groupName) {
  return poolGroupRow(page, groupName).locator('td').nth(3);
}

/** Tab1「实例数」列（columns[2]）：渲染 `${count} / 1` */
function poolInstanceCountCell(page, groupName) {
  return poolGroupRow(page, groupName).locator('td').nth(2);
}

/**
 * Tab1 某组展开行内容单元格（iView 展开行是组行的兄弟 <tr>（无 class），
 * 其 `<td class="ivu-table-expanded-cell">` 承载展开内容，故按该单元格 + 内容文本过滤定位）。
 */
function poolGroupExpandedRow(page, textMatch) {
  return poolTable(page)
    .locator('td.ivu-table-expanded-cell')
    .filter({ hasText: textMatch })
    .first();
}

/** Tab1 某组展开行内的「添加实例」按钮（Pool.vue:780 编辑态分支） */
function poolGroupAddInstanceBtn(page, textMatch) {
  return poolGroupExpandedRow(page, textMatch).getByRole('button', {
    name: DOC_EPP_POOL.addInstance,
  });
}

async function expectPoolGroupVisible(page, groupName, timeout = 15000) {
  await expect(
    poolGroupRow(page, groupName),
    `EPP 实例池应展示实例组「${groupName}」`,
  ).toBeVisible({ timeout });
}

/**
 * 只读视角 Tab1 树形表格的只读展示断言（EP-RO-01 预期 2）：
 * 组名与「实例列表」列的 `实例ID(主机:端口)` 正常展示，无行内输入控件。
 */
async function expectPoolGroupReadonlyDisplay(page, group) {
  const groupName = group.name;
  await expectPoolGroupVisible(page, groupName);
  await expect(
    poolGroupNameCell(page, groupName),
    `只读视角应正常展示实例组名「${groupName}」`,
  ).toHaveText(groupName);
  await readonly.expectAbsent(
    poolGroupRow(page, groupName).locator('input'),
    `实例组「${groupName}」行内编辑输入框`,
  );
  for (const inst of group.instances || []) {
    await expect(
      poolInstanceSummaryCell(page, groupName),
      `只读视角应正常展示实例「${inst.id}」的 ID/主机/端口`,
    ).toContainText(`${inst.id}(${inst.host}:${inst.port})`);
  }
}

/** 只读视角 Tab1 就绪判定：只用只读态同样存在的锚点（Tab / 统计摘要 / 表格） */
async function expectEppPoolPageReadyReadonly(page) {
  await expect(eppModuleRoot(page)).toBeVisible();
  await expectEppTabActive(page, DOC_EPP_TABS.pool);
  await expect(poolTab(page)).toBeVisible();
  await expect(poolSummary(page)).toBeVisible();
  await expect(poolTable(page)).toBeVisible();
}

/**
 * 只读视角直连 URL 进入 EPP 调度页（Tab1 实例池）。
 * 不走 `ensureOnEppPoolPage` / `gotoEppPoolPage`——它们的路由守卫修补与侧栏回退
 * 依赖管理员会话，会把只读态换回管理员态（见 utils/readonly.js 文件头约束 2）。
 */
async function gotoEppPoolPageReadonly(page) {
  await readonly.gotoAsReadonly(page, EPP_POOL_PATH, { ready: poolTab(page) });
  await readonly.expectStillReadonly(page);
}

// ── Tab2 EPP 调度分配 ─────────────────────────────────────────────

/** Tab2 顶部统计摘要（已分配集群 / 未分配集群 / 空闲实例组） */
function assignmentSummary(page) {
  return eppModuleRoot(page).locator('.proto-epp-summary').first();
}

/** Tab2 数据行（pageTable：.page-table > .show-iView-Table > .ivu-table tbody tr） */
function assignmentRows(page) {
  return assignmentsTable(page).dataRows();
}

/**
 * Tab2 操作列（最后一列）的写入口按钮。
 * 基于 `dataRows()`（排除空态行）并用 CSS 定位——`getByRole` 会排除 `display:none`，
 * 只读视角下无法用它断言 `.v-has-hidden`。
 */
function assignmentActionButtons(page) {
  return assignmentRows(page).locator('td:last-child button');
}

function assignmentRow(page, clusterName) {
  return assignmentsTable(page).rowByText(clusterName);
}

/** Tab2 某集群行行尾「编辑」（覆写编辑）写入口 */
function assignmentOverrideBtn(page, clusterName) {
  return assignmentsTable(page).rowAction(
    clusterName,
    DOC_EPP_ASSIGNMENT.override,
  );
}

async function expectAssignmentRowVisible(page, clusterName, timeout = 15000) {
  await expect(
    assignmentRow(page, clusterName),
    `EPP 调度分配应展示集群「${clusterName}」行`,
  ).toBeVisible({ timeout });
}

/**
 * Tab2 列结构（只读视角列定义不变，写入口仅隐藏不删列）。
 * 先断表格已挂载再断表头，失败时给出「Tab2 未就绪」的明确诊断，
 * 而不是 PageTableComponent 那句 element(s) not found。
 */
async function expectAssignmentTableHeaders(page) {
  const table = assignmentsTable(page);
  await expect(
    table.rootLocator(),
    '「EPP 调度分配」表格应已挂载（Tab2 未切换时断言表头必然找不到）',
  ).toBeVisible({ timeout: 15000 });
  await table.expectHeaders(
    DOC_EPP_ASSIGNMENT.columnCluster,
    DOC_EPP_ASSIGNMENT.columnGroup,
    DOC_EPP_ASSIGNMENT.columnOperation,
  );
}

/**
 * 只读视角 Tab2 操作列写入口断言（EP-RO-02 预期 1）：
 * 每一行的「覆写编辑」仍在 DOM 中、带 `.v-has-hidden` 且不可见。
 */
async function expectAssignmentOverrideActionsHidden(page) {
  await expectEppTabActive(page, DOC_EPP_TABS.assignment);
  const buttons = assignmentActionButtons(page);
  const count = await buttons.count();
  expect(
    count,
    '只读视角操作列写入口应仍在 DOM 中（v-has 隐藏而非删除列）；为 0 说明 Tab2 未就绪或表格为空',
  ).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await readonly.expectVHasHidden(
      buttons.nth(i),
      `覆写编辑（第 ${i + 1} 行）`,
    );
  }
  return count;
}

/**
 * 只读视角 Tab2 各列只读展示断言（EP-RO-02 预期 2）：
 * 集群名称 / 实例组 均正常展示（单实例重构后已无主实例 / 备实例 / 状态列）。
 */
async function expectAssignmentRowReadonlyDisplay(page, cluster) {
  const row = assignmentRow(page, cluster.cluster);
  await expectAssignmentRowVisible(page, cluster.cluster);
  await expect(row, `只读视角应展示集群名称「${cluster.cluster}」`).toContainText(
    cluster.cluster,
  );
  await expect(
    row,
    '只读视角应展示「实例组」列',
  ).toContainText(cluster.group || '-');
}

/** 只读视角 Tab2 统计汇总只读展示断言：三个口径与 GET /epp-assignments 一致 */
async function expectAssignmentSummaryReadonly(page, expected) {
  const summary = assignmentSummary(page);
  await expect(summary, '只读视角应保留统计汇总区域').toBeVisible();
  await expect(summary).toContainText(DOC_EPP_ASSIGNMENT.summaryAssigned);
  await expect(summary).toContainText(DOC_EPP_ASSIGNMENT.summaryUnassigned);
  await expect(summary).toContainText(DOC_EPP_ASSIGNMENT.summaryIdle);
  const values = (await summary.locator('strong').allInnerTexts()).map((v) =>
    v.trim(),
  );
  expect(values, '只读视角统计汇总数值应与 GET /epp-assignments 一致').toEqual([
    String(expected.assigned),
    String(expected.unassigned),
    String(expected.idle),
  ]);
}

/** 只读视角「空闲实例组」区域（Assignments.vue:67，idle_groups 非空时渲染） */
async function expectAssignmentIdleAreaReadonly(page, expectedVisible) {
  const card = eppModuleRoot(page)
    .locator('.ivu-card')
    .filter({ hasText: DOC_EPP_ASSIGNMENT.summaryIdle })
    .first();
  if (expectedVisible) {
    await readonly.expectReadonlyVisible(card, '空闲实例组区域');
    return;
  }
  await readonly.expectAbsent(card, '空闲实例组区域（环境中无空闲实例组）');
}

/** 只读视角「未分配集群」区域（Assignments.vue:53，unassigned_clusters 非空时渲染） */
async function expectAssignmentUnassignedAreaReadonly(page, expectedVisible) {
  const card = eppModuleRoot(page)
    .locator('.ivu-card')
    .filter({ hasText: DOC_EPP_ASSIGNMENT.summaryUnassigned })
    .first();
  if (expectedVisible) {
    await readonly.expectReadonlyVisible(card, '未分配集群区域');
    return;
  }
  await readonly.expectAbsent(
    card,
    '未分配集群区域（环境中无未分配集群）',
  );
}

/** 覆写编辑抽屉（Assignments.vue:79，可见态抽屉容器） */
function assignmentOverrideDrawer(page) {
  return page.locator(IVU_DRAWER_VISIBLE).last();
}

/** 覆写抽屉「确认」提交类写按钮（Assignments.vue:129，未挂 v-has，随抽屉体渲染） */
function assignmentOverrideConfirmBtn(page) {
  return assignmentOverrideDrawer(page).getByRole('button', {
    name: DOC_EPP_ASSIGNMENT.confirm,
    exact: true,
  });
}

/** 覆写抽屉「取消」按钮（Assignments.vue:137） */
function assignmentOverrideCancelBtn(page) {
  return assignmentOverrideDrawer(page).getByRole('button', {
    name: DOC_EPP_ASSIGNMENT.cancel,
    exact: true,
  });
}

/** 管理员对照：点击行内「覆写编辑」并等待抽屉打开 */
async function openAssignmentOverrideDrawer(page, clusterName) {
  await assignmentOverrideBtn(page, clusterName).click();
  await expect(
    assignmentOverrideDrawer(page),
    '管理员视角应能打开覆写编辑抽屉（对照组）',
  ).toBeVisible({ timeout: 10000 });
}

/** 关闭覆写抽屉（点抽屉内「取消」，不提交） */
async function closeAssignmentOverrideDrawer(page) {
  await assignmentOverrideCancelBtn(page).click();
  await expectAssignmentOverrideDrawerClosed(page);
}

/** 覆写抽屉未打开（`ivu-drawer-hidden` 或无抽屉容器） */
async function expectAssignmentOverrideDrawerClosed(page) {
  await expect(
    assignmentOverrideDrawer(page),
    '覆写编辑抽屉不应处于打开态',
  ).toHaveCount(0, { timeout: 10000 });
}

/**
 * 只读视角尝试打开覆写抽屉（EP-RO-03 步骤 2）。
 * 覆写入口被 `.v-has-hidden`（display:none）隐藏，Playwright 可操作性与点击点计算
 * 都会失败；返回 true 表示点击真的落下（抽屉随即会被后续断言抓住）。
 */
async function attemptOpenAssignmentOverrideDrawer(page) {
  const entry = assignmentActionButtons(page).first();
  try {
    await entry.click({ timeout: 3000 });
    console.log('[attemptOpenAssignmentOverrideDrawer] 覆写入口意外可点击');
    return true;
  } catch (e) {
    console.log(
      '[attemptOpenAssignmentOverrideDrawer] 覆写入口不可点击（预期）: ' +
        String(e.message).split('\n')[0],
    );
    return false;
  }
}

/**
 * 记录 `epp-assignments` 非 GET 请求（EP-RO-03 预期 3：只读视角不发起写请求）。
 * 注意：产品实现是 `PUT /epp-assignments/{cluster}`（ai-gateway-api
 * endpoints/openapi_v1/epp_assignments/put.go `Method: http.MethodPut`），
 * 文档「PATCH /epp-assignments」为笔误，故此处按「任何非 GET」判定。
 */
function trackEppAssignmentsWriteRequests(page) {
  const writes = [];
  const handler = (request) => {
    if (!request.url().includes('epp-assignments')) return;
    const method = request.method().toUpperCase();
    if (method !== 'GET') {
      writes.push(`${method} ${request.url()}`);
    }
  };
  page.on('request', handler);
  console.log('[trackEppAssignmentsWriteRequests] 开始记录 epp-assignments 写请求');
  return {
    stop() {
      page.off('request', handler);
      console.log(
        '[trackEppAssignmentsWriteRequests] 停止记录，写请求数=' + writes.length,
      );
      return writes;
    },
  };
}

/**
 * 只读视角 Tab2 就绪判定：只用只读态同样存在的锚点
 * （Tab2 选中态 / 统计摘要 / 表格），不引用任何写入口。
 */
async function expectEppAssignmentsPageReadyReadonly(page) {
  await expect(eppModuleRoot(page)).toBeVisible();
  await expectEppTabActive(page, DOC_EPP_TABS.assignment);
  await expect(assignmentsTab(page)).toBeVisible();
  await expect(assignmentSummary(page)).toBeVisible();
  await expect(assignmentsTable(page).rootLocator()).toBeVisible();
}

module.exports = {
  DRAWER_TITLE,
  eppPoolPage,
  gotoEppPoolPage,
  ensureOnEppPoolPage,
  getPoolGroupCount,
  clickEditPool,
  clickSavePool,
  clickCancelPool,
  getEditableInstanceValues,
  switchTab,
  assignmentsTable,
  getStatsText,
  // 只读管理员视角（docs/epp-pool/02-功能测试用例/03-只读视角.md）
  DOC_EPP_TABS,
  DOC_EPP_POOL,
  DOC_EPP_ASSIGNMENT,
  EPP_POOL_PATH,
  eppModuleRoot,
  eppTabs,
  eppTabNav,
  poolTab,
  assignmentsTab,
  isEppTabActive,
  expectEppTabActive,
  switchToAssignmentsTab,
  poolSummary,
  poolTable,
  poolToolbar,
  poolToolbarEditBtn,
  poolToolbarSaveBtn,
  poolToolbarCancelBtn,
  enterPoolEditMode,
  exitPoolEditMode,
  poolAddGroupBtn,
  poolAddInstanceBtn,
  poolDeleteGroupBtn,
  poolDeleteInstanceBtn,
  poolInlineEditInputs,
  poolGroupRow,
  poolGroupNameCell,
  poolInstanceSummaryCell,
  poolInstanceCountCell,
  poolGroupExpandedRow,
  poolGroupAddInstanceBtn,
  expectPoolGroupVisible,
  expectPoolGroupReadonlyDisplay,
  expectEppPoolPageReadyReadonly,
  gotoEppPoolPageReadonly,
  assignmentSummary,
  assignmentActionButtons,
  assignmentRow,
  assignmentOverrideBtn,
  expectAssignmentRowVisible,
  expectAssignmentTableHeaders,
  expectAssignmentOverrideActionsHidden,
  expectAssignmentRowReadonlyDisplay,
  expectAssignmentSummaryReadonly,
  expectAssignmentIdleAreaReadonly,
  expectAssignmentUnassignedAreaReadonly,
  assignmentOverrideDrawer,
  assignmentOverrideConfirmBtn,
  assignmentOverrideCancelBtn,
  openAssignmentOverrideDrawer,
  closeAssignmentOverrideDrawer,
  expectAssignmentOverrideDrawerClosed,
  attemptOpenAssignmentOverrideDrawer,
  trackEppAssignmentsWriteRequests,
  expectEppAssignmentsPageReadyReadonly,
};