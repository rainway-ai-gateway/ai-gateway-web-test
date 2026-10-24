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
/*
 * @Description: 会话自愈能力（Session Key 失效自动恢复）
 *
 * 背景：后端每个用户只保留 1 个 Session Key，任何一次登录都会立刻作废之前的 Key。
 * 因此「另一个会话/另一轮跑测登录过」或「本轮前面的用例登录过」都会让 auth.json
 * 里记录的 Key 失效；失效时产品前端弹出「Session Key 错误」模态框（.ivu-modal-wrap
 * 遮罩），表现为「元素可见但点击被遮挡 / locator.click 超时」或接口 401，进而引发
 * 整模块级联假失败。
 *
 * 本模块提供：失效模态框识别 → 关闭模态框 → 用 conf.json 账号重新登录
 * （优先复用 global-setup 的 POST /open-api/v1/auth/session-keys，失败回退 UI 登录）
 * → 注入新会话并回写 auth.json → reload 页面拿到新态；并提供导航入口统一使用的
 * ensureSessionHealthy(page) 守卫。
 */
const fs = require('fs');
const path = require('path');
const common = require('./common');

const AUTH_PATH = path.join(__dirname, '../auth.json');
const CONF_PATH = path.join(__dirname, '../conf.json');
const API_PREFIX = '/open-api/v1';

// 产品「Session Key 错误」类模态框文案（后端 i18n：Session Key Wrong / Expired / Not Exist）
const SESSION_ERROR_TEXTS = [
  'Session Key 错误',
  'Session Key Wrong',
  'Session Key 过期',
  'Session Key Expired',
  'Session Key 不存在',
  'Session Key Not Exist',
];

// 同一根因（会话/登录态失效）导致的前端模态框：401 时产品提示后跳转登录页
const SESSION_EXPIRED_TEXTS = [
  '当前未登录或者登录已过期请前往登录',
  '当前url非法',
];

const ALL_AUTH_ALERT_TEXTS = SESSION_ERROR_TEXTS.concat(SESSION_EXPIRED_TEXTS);

const MODAL_OK_BUTTON = /^\s*(确定|确认|OK)\s*$/i;

// UI 登录兜底由 pages/user/UserPage.js 注册（避免 utils 反向依赖 pages 造成循环引用）
let uiLoginHandler = null;

function registerUiLoginHandler(handler) {
  uiLoginHandler = handler;
}

function readConf() {
  try {
    return JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
  } catch (e) {
    common.log('读取 conf.json 失败: ' + e.message);
    return {};
  }
}

/** 产品前端基地址（去掉 /login） */
function getAppBaseUrl() {
  const conf = readConf();
  return (conf.ctlHost || '').replace('/login', '');
}

/** 后端 OpenAPI 基地址 */
function getApiBaseUrl() {
  const conf = readConf();
  return conf.apiHost || getAppBaseUrl();
}

function toRegExp(texts) {
  return new RegExp(
    texts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  );
}

/**
 * 可见的会话异常模态框（必须是「可见」的 .ivu-modal-wrap 且文案命中，
 * 以免把删除确认等普通确认框误判为会话失效）
 */
async function visibleAuthModal(page, texts = ALL_AUTH_ALERT_TEXTS) {
  const wrap = page
    .locator('.ivu-modal-wrap')
    .filter({ visible: true })
    .filter({ hasText: toRegExp(texts) });
  if ((await wrap.count()) === 0) {
    return null;
  }
  return wrap.last();
}

/** 是否正在展示「Session Key 错误」类模态框 */
async function isSessionErrorModalVisible(page) {
  return (await visibleAuthModal(page, SESSION_ERROR_TEXTS)) !== null;
}

/** 是否正在展示「登录已过期 / url 非法」类模态框（同根因） */
async function isAuthExpiredModalVisible(page) {
  return (await visibleAuthModal(page, SESSION_EXPIRED_TEXTS)) !== null;
}

async function isAnyAuthAlertVisible(page) {
  return (await visibleAuthModal(page)) !== null;
}

/**
 * 关闭会话异常模态框，返回是否命中。
 * 注意：产品的错误模态框点「确定」后会 push 到登录路由，因此调用方需在之后重新登录。
 */
async function dismissAuthAlertModal(page) {
  const modal = await visibleAuthModal(page);
  if (!modal) {
    return false;
  }

  const text = (await modal.innerText().catch(() => ''))
    .replace(/\s+/g, ' ')
    .trim();
  common.log('检测到会话失效模态框：' + text.substring(0, 60));

  const okBtn = modal.getByRole('button', { name: MODAL_OK_BUTTON }).last();
  if ((await okBtn.count()) > 0) {
    await okBtn.click({ timeout: 5000 }).catch(async () => {
      await page
        .getByRole('button', { name: MODAL_OK_BUTTON })
        .last()
        .click({ timeout: 5000 })
        .catch(() => {});
    });
    // 产品点「确定」后会 push 到登录路由，等页面稳定后再交给上层重新登录
    await page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  return true;
}

async function isLoginPage(page) {
  try {
    if (page.url().includes('/login')) {
      return true;
    }
    return (
      (await page.getByPlaceholder(/请输入用户名|Please input Username/).count()) >
      0
    );
  } catch (e) {
    return false;
  }
}

/** 页面是否已经加载过产品页（about:blank / 未导航时为 false） */
function isAppPageLoaded(page) {
  const url = page.url();
  return url.startsWith('http') && !url.includes('/login');
}

/** 在 timeout 内等待会话异常模态框出现（出现即返回 true） */
async function waitForAuthAlert(page, timeout = 800) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isAnyAuthAlertVisible(page)) {
      return true;
    }
    await page.waitForTimeout(150);
  }
  return await isAnyAuthAlertVisible(page);
}

async function readStoredUser(page) {
  try {
    return await page.evaluate(() => {
      const raw = localStorage.getItem('user');
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    });
  } catch (e) {
    return null;
  }
}

async function getStoredSessionKey(page) {
  const user = await readStoredUser(page);
  return user && user.sessionKey ? user.sessionKey : '';
}

/** 读取共享 auth.json 中的登录态（用例刚启动、页面还是 about:blank 时的唯一来源） */
function readAuthJsonUser() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    for (const origin of auth.origins || []) {
      const entry = (origin.localStorage || []).find((e) => e.name === 'user');
      if (entry && entry.value) {
        try {
          return JSON.parse(entry.value);
        } catch (e) {
          /* 解析失败继续找下一个 */
        }
      }
    }
  } catch (e) {
    /* 文件不存在/解析失败，视为无共享会话 */
  }
  return null;
}

/** 从 context 的 storageState 中取登录态（未导航时它就是「下一次导航会带上的会话」） */
async function readContextUser(page) {
  try {
    const state = await page.context().storageState();
    for (const origin of state.origins || []) {
      const entry = (origin.localStorage || []).find((e) => e.name === 'user');
      if (entry && entry.value) {
        try {
          return JSON.parse(entry.value);
        } catch (e) {
          /* 继续找下一个 origin */
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

/**
 * 解析当前应使用的会话，按「谁真正在这一轮生效」排序：
 * ① 页面 localStorage（运行中前端的真实状态）；
 * ② context.storageState()（用例新建 context 时从 auth.json 装载的会话——
 *    它在导航时才会落到页面，若另一个会话在此之后登录，auth.json 已更新而它已失效，
 *    此时必须以它为准，否则会漏判成「会话有效」而放行加载失效 Key 的页面）；
 * ③ 共享 auth.json 文件。
 */
async function resolveSession(page) {
  const stored = await readStoredUser(page);
  if (stored && stored.sessionKey) {
    return { user: stored, source: 'localStorage' };
  }
  const fromContext = await readContextUser(page);
  if (fromContext && fromContext.sessionKey) {
    return { user: fromContext, source: 'context.storageState' };
  }
  const shared = readAuthJsonUser();
  if (shared && shared.sessionKey) {
    return { user: shared, source: 'auth.json' };
  }
  return { user: null, source: 'none' };
}

/**
 * 探测 Session Key 是否仍然有效（后端每个用户单 Key，IsAlive 只能靠真实请求判断）。
 * 只有 401（会话本身无效）才算失效；403/404 等视为「会话有效但该资源不可访问」，
 * 避免把只读账号、被删除的测试账号误判为会话失效。
 */
async function isSessionKeyAlive(page, sessionKey, userName) {
  if (!sessionKey) {
    return false;
  }
  const name = userName || readConf().username;
  try {
    const resp = await page.request.get(
      `${getApiBaseUrl()}${API_PREFIX}/auth/users/${encodeURIComponent(name)}`,
      {
        headers: { Authorization: 'Session ' + sessionKey },
        timeout: 10000,
      },
    );
    return resp.status() !== 401;
  } catch (e) {
    common.log('会话有效性探测异常（按有效处理）: ' + e.message);
    return true;
  }
}

/**
 * 用 conf.json 账号密码换新的 session key（与 global-setup 直连登录同一接口）
 */
async function loginViaApi(page, conf = readConf()) {
  const resp = await page.request.post(
    `${getApiBaseUrl()}${API_PREFIX}/auth/session-keys`,
    {
      data: { user_name: conf.username, password: conf.password },
      timeout: 15000,
    },
  );
  const body = await resp.json().catch(() => null);
  if (!body || body.ErrNum !== 200 || !body.Data || !body.Data.session_key) {
    throw new Error(
      '接口登录失败：HTTP ' +
        resp.status() +
        ' ' +
        JSON.stringify(body).substring(0, 200),
    );
  }
  return {
    name: body.Data.user_name,
    sessionKey: body.Data.session_key,
    role:
      body.Data.role ||
      (body.Data.is_admin ? 'system_admin' : 'system_admin_readonly'),
  };
}

/**
 * 把会话写入页面 localStorage（前端 store.getUser() 在内存态为空时会回落到
 * localStorage，因此注入后 reload 即可让前端拿到新态）。
 *
 * 刻意不注册 addInitScript：会话自愈发生在导航入口，注入 + reload 后前端会把
 * user 保持在 localStorage 里；而常驻 initScript 会在「用例主动注销」后的导航里
 * 复活会话，破坏注销类断言。
 */
async function injectSessionIntoPage(page, user) {
  const apply = (u) => {
    try {
      localStorage.setItem('user', JSON.stringify(u));
      localStorage.setItem('lang', 'zh');
    } catch (e) {
      /* sandbox 下可能不可用 */
    }
  };

  try {
    await page.evaluate(apply, user);
    return true;
  } catch (e) {
    // 尚未加载任何页面（about:blank，localStorage 不可访问）：先落到应用首页再注入
    try {
      await page.goto(getAppBaseUrl() + '/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.evaluate(apply, user);
      return true;
    } catch (e2) {
      common.log('注入新会话失败: ' + e2.message);
      return false;
    }
  }
}

/** 把当前页面上下文的登录态回写共享 auth.json */
async function persistAuthState(page) {
  try {
    await page.context().storageState({ path: AUTH_PATH });
    common.log('已刷新 auth.json 会话状态');
    return true;
  } catch (e) {
    common.log('刷新 auth.json 失败: ' + e.message);
    return false;
  }
}

/** 读取共享 auth.json 原始内容（失败返回 null） */
function readAuthStateFile() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
  } catch (e) {
    return null;
  }
}

/**
 * 直接用「接口登录拿到的 user」回写 auth.json，不依赖页面状态。
 *
 * 为什么必须单独有这条路径：`recoverFromSessionError` 里接口登录**一旦成功，
 * 后端就已经把旧 Key 作废**。旧实现要到「页面注入 + 页面侧读回校验」都通过之后才
 * `persistAuthState`，一旦页面侧校验没过（页面尚未导航到应用源、context 已关闭等），
 * 就会在写盘之前抛错 —— auth.json 里留着**已失效的旧 Key**，后续每个用例都重复
 * 「探测失效 → 重新登录（又作废一把）→ 校验不过 → 不写盘」，整轮回归级联假失败。
 * 2026-10-16 实测：一次 run 内 29 次接口重登成功、58 次「会话自愈失败」，44 条用例连带全红。
 *
 * 合并写入：保留 auth.json 原有的 cookies 与其它 localStorage 键，只替换 `user`（并确保 `lang`）。
 */
async function persistAuthUser(user) {
  if (!user || !user.sessionKey) {
    return false;
  }
  try {
    const current = readAuthStateFile() || { cookies: [], origins: [] };
    let origin = getAppBaseUrl();
    try {
      origin = new URL(getAppBaseUrl()).origin;
    } catch (e) {
      /* 保持原值 */
    }
    const origins = Array.isArray(current.origins) ? current.origins.slice() : [];
    let target = origins.find((o) => o.origin === origin);
    if (!target) {
      target = { origin, localStorage: [] };
      origins.push(target);
    }
    const stores = Array.isArray(target.localStorage)
      ? target.localStorage.slice()
      : [];
    const upsert = (name, value) => {
      const idx = stores.findIndex((i) => i.name === name);
      if (idx >= 0) {
        stores[idx] = { name, value };
      } else {
        stores.push({ name, value });
      }
    };
    upsert('user', JSON.stringify(user));
    upsert('lang', 'zh');
    target.localStorage = stores;

    fs.writeFileSync(
      AUTH_PATH,
      JSON.stringify({ ...current, origins }, null, 2),
    );
    common.log('已按接口登录结果直接回写 auth.json（不依赖页面状态）');
    return true;
  } catch (e) {
    common.log('直接回写 auth.json 失败: ' + e.message);
    return false;
  }
}

/** 清空共享 auth.json 中的登录态（注销等场景；避免把已失效会话留给后续用例） */
async function clearAuthState(page) {
  try {
    await page
      .evaluate(() => {
        try {
          localStorage.removeItem('user');
        } catch (e) {
          /* ignore */
        }
      })
      .catch(() => {});
    await page.context().storageState({ path: AUTH_PATH });
    common.log('已清除 auth.json 登录态');
    return true;
  } catch (e) {
    common.log('清除 auth.json 失败: ' + e.message);
    return false;
  }
}

/**
 * 重新建立共享登录态：接口登录 → 注入页面 → 回写 auth.json。
 * 用于「本用例自己登录/注销过、已作废 auth.json 旧 Key」的收尾，
 * 避免把失效 Key 留给后续用例（如注销用例）。
 */
async function restoreSharedSession(page, options = {}) {
  const user = await loginViaApi(page);
  common.log(
    '已重建共享登录态，Session Key: ' + user.sessionKey.substring(0, 10) + '...',
  );
  await injectSessionIntoPage(page, user);
  await persistAuthState(page);
  if (options.reload) {
    await reloadAppPage(page, options.retryUrl);
  }
  return user;
}

async function reloadAppPage(page, targetUrl) {
  const appBase = getAppBaseUrl();
  const current = page.url();
  const url =
    targetUrl ||
    (current.startsWith('http') && !current.includes('/login')
      ? current
      : appBase + '/');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
  } catch (e) {
    common.log('自愈后刷新页面失败: ' + e.message);
  }
}

/**
 * 会话自愈：检测到 Session Key 失效（模态框 / 停在登录页 / Key 探测 401）时，
 * 关闭模态框 → 重新登录 → 注入新会话 → 回写 auth.json → reload 页面。
 *
 * @param {Page} page
 * @param {{retryUrl?: string}} [options] 自愈后要重新加载的页面地址（默认当前地址）
 * @returns {Promise<boolean>} 是否发生过自愈
 */
async function recoverFromSessionError(page, options = {}) {
  const modalVisible = await isAnyAuthAlertVisible(page);
  const onLoginPage = await isLoginPage(page);
  const { user: stored, source } = await resolveSession(page);

  let keyAlive = true;
  if (!modalVisible && !onLoginPage && stored && stored.sessionKey) {
    keyAlive = await isSessionKeyAlive(page, stored.sessionKey, stored.name);
  }

  // 页面已加载、页面自己的会话已被前端清掉（401 时 store 会 removeUserData），
  // 但共享会话仍有效：说明这次加载就是带着失效 Key 完成的，模态框稍后才渲染。
  // 这种情况必须自愈，否则用例会在「被遮罩拦截的点击」上超时。
  let pageSessionLost = false;
  if (!modalVisible && !onLoginPage && keyAlive && isAppPageLoaded(page)) {
    const pageUser = await readStoredUser(page);
    if (!pageUser) {
      pageSessionLost = await waitForAuthAlert(page, options.settleMs ?? 800);
    }
  }

  const needLogin =
    modalVisible ||
    pageSessionLost ||
    onLoginPage ||
    !stored ||
    !stored.sessionKey ||
    !keyAlive;
  if (!needLogin) {
    return false;
  }

  common.log('已自愈：Session Key 失效 → 重新登录');
  common.log(
    '  · 触发原因：会话异常模态框=' +
      modalVisible +
      '，页面会话已被清空=' +
      pageSessionLost +
      '，停在登录页=' +
      onLoginPage +
      '，会话来源=' +
      source +
      '，会话有效性=' +
      (keyAlive ? '有效' : '失效'),
  );

  if (modalVisible || pageSessionLost) {
    await dismissAuthAlertModal(page);
  }

  let user = null;
  try {
    user = await loginViaApi(page);
    common.log(
      '接口重新登录成功，新 Session Key: ' +
        user.sessionKey.substring(0, 10) +
        '...',
    );
  } catch (e) {
    common.log('接口重新登录失败: ' + e.message + '，回退 UI 登录');
    if (!uiLoginHandler) {
      throw e;
    }
    await uiLoginHandler(page);
    user = await readStoredUser(page);
  }

  if (user && user.sessionKey) {
    // 关键：接口登录一成功，后端就已作废旧 Key。必须**先把新会话落盘**，
    // 再去做页面注入与页面侧校验 —— 否则页面侧校验一旦不过就会在写盘前抛错，
    // auth.json 留着已失效的旧 Key，后续用例反复「失效→重登→再失效」级联全红。
    await persistAuthUser(user);
    await injectSessionIntoPage(page, user);
  }

  const current = await readStoredUser(page);
  if (!current || !current.sessionKey) {
    throw new Error(
      '会话自愈失败：重新登录后仍未取得 session key（请检查 conf.json 凭证）',
    );
  }

  await persistAuthState(page);
  await reloadAppPage(page, options.retryUrl);
  return true;
}

/**
 * 导航入口统一守卫：自愈 + 断言已登录（不在登录页、无会话异常模态框）。
 * @returns {Promise<boolean>} 是否发生过自愈
 */
async function ensureSessionHealthy(page, options = {}) {
  // 排查用开关：SESSION_GUARD_DISABLED=1 时临时禁用导航入口的会话守卫，
  // 用于判断某条失败到底是不是守卫本身引入的（不改变任何用例断言）。
  if (process.env.SESSION_GUARD_DISABLED === '1') {
    return false;
  }

  const recovered = await recoverFromSessionError(page, options);

  if (await isLoginPage(page)) {
    common.log('会话自愈后仍停留在登录页，执行 UI 登录兜底');
    if (!uiLoginHandler) {
      throw new Error('会话自愈失败：仍停留在登录页（未注册 UI 登录兜底）');
    }
    await uiLoginHandler(page);
    await reloadAppPage(page, options.retryUrl);
  }

  if (await isLoginPage(page)) {
    throw new Error('会话自愈失败：仍停留在登录页');
  }
  if (await isSessionErrorModalVisible(page)) {
    throw new Error('会话自愈失败：仍存在「Session Key 错误」模态框');
  }
  return recovered;
}

/**
 * 兼容既有页面对象的 handleUrlInvalidAlert：只在「模态框可见」或「已在登录页」时
 * 才重新登录（不做主动探测、不改变既有调用点的行为），登录后回写 auth.json。
 * @returns {Promise<boolean>} 是否处理过登录态异常
 */
async function handleAuthAlert(page) {
  const modalVisible = await isAnyAuthAlertVisible(page);
  const onLoginPage = await isLoginPage(page);
  if (!modalVisible && !onLoginPage) {
    return false;
  }
  return recoverFromSessionError(page);
}

module.exports = {
  SESSION_ERROR_TEXTS,
  SESSION_EXPIRED_TEXTS,
  getAppBaseUrl,
  getApiBaseUrl,
  registerUiLoginHandler,
  visibleAuthModal,
  isSessionErrorModalVisible,
  isAuthExpiredModalVisible,
  isAnyAuthAlertVisible,
  dismissAuthAlertModal,
  isLoginPage,
  readStoredUser,
  readAuthJsonUser,
  readContextUser,
  resolveSession,
  getStoredSessionKey,
  isAppPageLoaded,
  waitForAuthAlert,
  isSessionKeyAlive,
  loginViaApi,
  injectSessionIntoPage,
  persistAuthState,
  persistAuthUser,
  clearAuthState,
  restoreSharedSession,
  reloadAppPage,
  recoverFromSessionError,
  ensureSessionHealthy,
  handleAuthAlert,
};