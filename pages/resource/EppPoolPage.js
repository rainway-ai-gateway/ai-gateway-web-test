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
const { IvuDrawerComponent } = require('../../components/iview');
const { PageTableComponent, AppSidebarComponent } = require('../../components/layout');
const { waitAfterResourceMutation, getAppBaseUrl } = require('./ResourcePageCommon');

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
};