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
const { expect, test } = require('@playwright/test');
const common = require('../../utils/common');
const sessionUtils = require('../../utils/session');
const publicFunc = require('../../utils/public');
const {
  AppSidebarComponent,
  LayoutShellComponent,
  PageTableComponent,
} = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuModalComponent,
  IvuSelectComponent,
  IvuTabsComponent,
} = require('../../components/iview');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const DOC_PASSWORD = 'Itm@2026';
const DOC_USER = {
  tipNameRule:
    '用户名长度1-64字符，仅允许数字、大小写字母、点、下划线、中划线，且不能以点、下划线、中划线开头或结尾；保留用户名不可用',
  tipReservedUserName:
    '「admin」「root」「system」为保留用户名，创建用户时不可使用',
  tipPasswordRule:
    '密码长度8-72字节（bcrypt 上限），不能包含空白字符，且不能与用户名相同或为其逆序',
  // 产品把密码规则拆成三条互斥提示（长度 / 空白字符 / 与用户名同形），断言按样本取对应提示
  tipPasswordLength: '密码长度须为 8-72 字节（bcrypt 上限，按 UTF-8 字节计）',
  tipPasswordWhitespace: '密码不能包含空白字符',
  tipPasswordUserName: '密码不能等于用户名或其逆序',
  tipTokenNameRule:
    'Token名称长度1-64字符，仅允许数字、大小写字母、点、下划线、中划线，且不能以点、下划线、中划线开头或结尾；保留名称不可用',
  tipRoleFixedBuiltin: '内置账号 admin 角色固定为系统管理员，不可变更',
};
const DRAWER_TITLE = {
  addUser: '添加用户',
  editPassword: '修改密码',
  tokenDetail: '详情',
  changeRole: '变更角色',
};

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

function ivuModal(page) {
  return new IvuModalComponent(page);
}

function userManagementTabs(page) {
  return new IvuTabsComponent(page);
}

var confInfo = {};
try {
  var confPath = path.join(__dirname, '../../conf.json');
  confInfo = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

const apiBaseHost = confInfo.apiHost || confInfo.ctlHost.replace('/login', '');
const baseUrl = apiBaseHost + '/open-api/v1';
let sessionKey = '';

async function getSessionKeyFromPage(page) {
  sessionKey = await page.evaluate(() => {
    return localStorage.getItem('session_key') || '';
  });
  if (sessionKey) {
    common.log(
      '从localStorage获取session_key成功: ' +
        sessionKey.substring(0, 10) +
        '...',
    );
    return sessionKey;
  }

  const cookies = await page.context().cookies();
  for (const cookie of cookies) {
    if (
      cookie.name === 'session_key' ||
      cookie.name === 'token' ||
      cookie.name === 'access_token'
    ) {
      sessionKey = cookie.value;
      common.log(
        '从cookie获取session_key成功: ' + sessionKey.substring(0, 10) + '...',
      );
      return sessionKey;
    }
  }

  throw new Error('无法从页面获取session_key');
}

async function getSessionKey() {
  if (sessionKey) {
    return sessionKey;
  }
  throw new Error('session_key未初始化，请先调用getSessionKeyFromPage(page)');
}

async function addUserViaApi(page, username, password, role = 'system_admin') {
  try {
    const userData = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          return JSON.parse(userStr);
        } catch (e) {
          return null;
        }
      }
      return null;
    });

    if (!userData || !userData.sessionKey) {
      throw new Error('无法从 localStorage.user 获取 session_key');
    }

    const response = await page.request.post(baseUrl + '/auth/users', {
      data: {
        user_name: username,
        password: password,
        role: role,
      },
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Session ' + userData.sessionKey,
      },
    });
    const responseBody = await response.json();
    common.log('接口添加用户响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum !== 200) {
      // 早期版本静默返回 false，会让用例在后续「行操作点击」处超时，
      // 掩盖真实原因（如 payload 字段已废弃）；此处直接抛出接口错误。
      throw new Error(
        '接口添加用户失败: ' +
          username +
          ' ErrNum=' +
          responseBody.ErrNum +
          ' ErrMsg=' +
          responseBody.ErrMsg,
      );
    }
    common.log('接口添加用户成功: ' + username);
    return true;
  } catch (error) {
    common.log('接口添加用户异常: ' + error.message);
    throw error;
  }
}

async function deleteUserViaApi(page, username) {
  try {
    const userData = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          return JSON.parse(userStr);
        } catch (e) {
          return null;
        }
      }
      return null;
    });

    if (!userData || !userData.sessionKey) {
      common.log('无法获取session_key');
      return false;
    }

    const response = await page.request.delete(
      baseUrl + '/auth/users/' + username,
      {
        headers: {
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口删除用户响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      common.log('接口删除用户成功: ' + username);
      return true;
    }
    common.log('接口删除用户失败: ' + responseBody.ErrMsg);
    return false;
  } catch (error) {
    common.log('接口删除用户异常: ' + error.message);
    return false;
  }
}

/**
 * 读取当前页面登录态中的 Session Key（localStorage.user.sessionKey）。
 * 以页面身份直接调接口做「接口 ↔ 页面」比对时使用（管理员态取管理员 Key，
 * 只读态取 viewer Key），不触发任何会话自愈。
 */
async function readSessionKeyFromPage(page) {
  const sessionKey = await page.evaluate(() => {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    try {
      return JSON.parse(raw).sessionKey || '';
    } catch (e) {
      return '';
    }
  });
  if (!sessionKey) {
    throw new Error('无法从 localStorage.user 获取 session_key');
  }
  return sessionKey;
}

function sessionHeaders(sessionKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Session ' + sessionKey,
  };
}

/** GET /auth/users：以当前页面身份查询用户列表（UM-45 接口 ↔ 页面比对） */
async function fetchUsersViaApi(page) {
  const sessionKey = await readSessionKeyFromPage(page);
  const response = await page.request.get(baseUrl + '/auth/users', {
    headers: sessionHeaders(sessionKey),
  });
  const body = await response.json();
  if (body.ErrNum !== 200) {
    throw new Error(
      '接口查询用户列表失败: ErrNum=' + body.ErrNum + ' ErrMsg=' + body.ErrMsg,
    );
  }
  return body.Data || [];
}

/** GET /auth/users/{user_name}：单用户详情（UM-48 复核内置 admin 角色未变） */
async function fetchUserViaApi(page, username) {
  const sessionKey = await readSessionKeyFromPage(page);
  const response = await page.request.get(
    baseUrl + '/auth/users/' + username,
    { headers: sessionHeaders(sessionKey) },
  );
  const body = await response.json();
  if (body.ErrNum !== 200) {
    throw new Error(
      '接口查询用户详情失败: ErrNum=' + body.ErrNum + ' ErrMsg=' + body.ErrMsg,
    );
  }
  return body.Data;
}

/**
 * PATCH /auth/users/{user_name}/role：直接发起角色变更请求。
 * 返回 httpStatus/errNum，供 UM-48 断言内置 admin 被后端拒绝（422）。
 */
async function patchUserRoleViaApi(page, username, role) {
  const sessionKey = await readSessionKeyFromPage(page);
  const response = await page.request.patch(
    baseUrl + '/auth/users/' + username + '/role',
    {
      data: { role },
      headers: sessionHeaders(sessionKey),
    },
  );
  const body = await response.json().catch(() => ({}));
  common.log(
    '接口变更角色响应: ' +
      username +
      ' → ' +
      role +
      ' HTTP=' +
      response.status() +
      ' ErrNum=' +
      body.ErrNum,
  );
  return { httpStatus: response.status(), errNum: body.ErrNum, errMsg: body.ErrMsg };
}

/** POST /auth/tokens：造一个 Token 并拿回明文值（Token 无删除接口之外的读路径） */
async function createTokenViaApi(page, tokenName, scope = 'System') {
  const sessionKey = await readSessionKeyFromPage(page);
  const response = await page.request.post(baseUrl + '/auth/tokens', {
    data: { name: tokenName, scope },
    headers: sessionHeaders(sessionKey),
  });
  const body = await response.json();
  if (body.ErrNum !== 200) {
    throw new Error(
      '接口创建 Token 失败: ErrNum=' + body.ErrNum + ' ErrMsg=' + body.ErrMsg,
    );
  }
  return body.Data || {};
}

/** GET /auth/tokens/{token_name}：Token 详情（管理员返回明文、只读返回掩码） */
async function fetchTokenViaApi(page, tokenName) {
  const sessionKey = await readSessionKeyFromPage(page);
  const response = await page.request.get(
    baseUrl + '/auth/tokens/' + tokenName,
    { headers: sessionHeaders(sessionKey) },
  );
  const body = await response.json();
  if (body.ErrNum !== 200) {
    throw new Error(
      '接口查询 Token 详情失败: ErrNum=' + body.ErrNum + ' ErrMsg=' + body.ErrMsg,
    );
  }
  return body.Data;
}

/** DELETE /auth/tokens/{token_name}：清理造数用 Token */
async function deleteTokenViaApi(page, tokenName) {
  const sessionKey = await readSessionKeyFromPage(page);
  const response = await page.request.delete(
    baseUrl + '/auth/tokens/' + tokenName,
    { headers: sessionHeaders(sessionKey) },
  );
  const body = await response.json().catch(() => ({}));
  if (body.ErrNum === 200) {
    common.log('接口删除 Token 成功: ' + tokenName);
    return true;
  }
  common.log('接口删除 Token 失败: ' + tokenName + ' ' + body.ErrMsg);
  return false;
}

async function login(page) {
  await publicFunc.login(page, confInfo['username'], confInfo['password']);
}

async function logout(page) {
  await publicFunc.logout(page);
}

async function switchToChinese(page) {
  for (let t = 1; t <= 3; t++) {
    await page.waitForTimeout(t * 500);
    const langBtn = page.locator("//span[text()='English']");
    if (await langBtn.isVisible()) {
      await page.evaluate(() => {
        localStorage.setItem('lang', 'zh');
      });
      common.log('已设置 localStorage lang=zh');

      await page.reload();
      await page.waitForTimeout(3000);

      const chineseLangBtn = page.locator("//span[text()='中文']");
      if (await chineseLangBtn.isVisible()) {
        common.log('语言切换为中文成功');
      } else {
        common.log('语言切换失败');
        throw new Error('语言切换失败，刷新后仍为英文');
      }
      break;
    }
  }
}

async function isLoginPage(page) {
  if (page.url().includes('/login')) {
    return true;
  }
  return (await page.getByPlaceholder('请输入用户名').count()) > 0;
}

async function waitForLoginPage(page) {
  try {
    await page.waitForURL(/\/login/, { timeout: 15000 });
  } catch (e) {
    await page.getByPlaceholder('请输入用户名').waitFor({ timeout: 15000 });
  }
}

async function hasStoredUser(page) {
  return !!(await page.evaluate(() => localStorage.getItem('user')));
}

async function persistAuthState(page) {
  return sessionUtils.persistAuthState(page);
}

async function clearClientSession(page) {
  sessionKey = '';
  await page.evaluate(() => {
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('session_key');
    } catch (_) {
      /* ignore */
    }
  });
}

/**
 * 纯 UI 登录（不做事前探测），登录后回写 auth.json。
 * 供 utils/session.js 在「接口登录不可用」时兜底调用：
 * 后端每个用户只保留 1 个 Session Key，登录会让旧 Key 立即失效，
 * 不回写 auth.json 会导致后续用例拿着失效 Key 请求而 401（级联假失败）。
 */
async function loginThroughUi(page, username, password) {
  const user = username || confInfo['username'];
  const pass = password || confInfo['password'];

  await page.addInitScript(() => {
    localStorage.setItem('lang', 'zh');
  });
  await page.goto(confInfo['ctlHost'], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  if (!(await isLoginPage(page))) {
    // 仍带着旧会话：清掉本地会话并重载，让前端回到登录页
    await clearClientSession(page);
    await page
      .reload({ waitUntil: 'domcontentloaded' })
      .catch(() => {});
    await page.waitForTimeout(1000);
  }

  await waitForLoginPage(page);
  await fillLoginForm(page, user, pass);
  await submitLoginForm(page);
  await page.waitForTimeout(2000);

  try {
    await page.waitForFunction(
      () =>
        localStorage.getItem('user') ||
        !window.location.pathname.includes('/login'),
      { timeout: 30000 },
    );
  } catch (e) {
    if (!(await hasStoredUser(page)) && (await isLoginPage(page))) {
      throw new Error(
        `登录失败（账号 ${user}），请检查 conf.json 凭证或服务端用户是否存在`,
      );
    }
  }

  await page.waitForTimeout(1000);
  if (await hasStoredUser(page)) {
    await persistAuthState(page);
  }
}

// 注册给 utils/session.js，供会话自愈时兜底（接口登录失败才走 UI 登录）
sessionUtils.registerUiLoginHandler(loginThroughUi);

async function dismissAuthAlertModal(page) {
  return sessionUtils.dismissAuthAlertModal(page);
}

/**
 * 会话自愈 + 断言已登录（见 utils/session.js）：
 * 会话失效（模态框 / 停在登录页 / Key 探测 401）时自动重新登录并回写 auth.json。
 */
async function ensureLoggedIn(page) {
  return sessionUtils.ensureSessionHealthy(page);
}

async function handleUrlInvalidAlert(page) {
  return sessionUtils.handleAuthAlert(page);
}

function isConnectionError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('net::ERR')
  );
}

async function isVisibleSafe(locator) {
  return locator.isVisible().catch(() => false);
}

async function isTabActive(page, tabText) {
  const tab = page.locator('.ivu-tabs-nav').getByText(tabText).first();
  if (!(await isVisibleSafe(tab))) {
    return false;
  }
  return tab
    .evaluate((el) => el.classList.contains('ivu-tabs-tab-active'))
    .catch(() => false);
}

async function isUserManagementShellVisible(page) {
  // 严格要求"添加用户"按钮可见，仅面包屑可见不足以说明页面已就绪
  return isVisibleSafe(page.getByRole('button', { name: '添加用户' }));
}

async function isUserTabReady(page) {
  return (
    (await isUserManagementShellVisible(page)) &&
    (await isTabActive(page, '用户')) &&
    (await isVisibleSafe(page.getByRole('button', { name: '添加用户' })))
  );
}

async function isTokenTabReady(page) {
  return (
    (await isUserManagementShellVisible(page)) &&
    (await isTabActive(page, 'Token')) &&
    (await isVisibleSafe(page.getByRole('button', { name: '创建' })))
  );
}

async function refreshAuthSession(page) {
  const targetUrl = getAppBaseUrl() + '/user';
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  if (await dismissAuthAlertModal(page)) {
    await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
    return;
  }
  if (
    (await isLoginPage(page)) ||
    !(await isUserManagementShellVisible(page))
  ) {
    await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });
  }
}

async function ensureAppSession(page) {
  if (common.isServiceDown()) {
    test.skip(true, '服务不可用，跳过所有测试用例');
  }

  try {
    await sessionUtils.ensureSessionHealthy(page, {
      retryUrl: getAppBaseUrl() + '/user',
    });
    await handleUrlInvalidAlert(page);
    await ensureAuthenticatedShell(page);
  } catch (e) {
    if (isConnectionError(e)) {
      common.setServiceDown(true);
      throw new Error(
        '❌ 服务连接失败: ' + e.message + '\n❌ 将跳过剩余所有测试用例',
      );
    }
    throw e;
  }
}

function getAppBaseUrl() {
  return confInfo['ctlHost'].replace('/login', '');
}

async function ensureAuthenticatedShell(page) {
  await handleUrlInvalidAlert(page);

  const baseUrl = getAppBaseUrl();
  const currentUrl = page.url();

  if ((await isLoginPage(page)) || currentUrl.includes('/login')) {
    common.log('当前在登录页，先加载首页: ' + page.url());
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await handleUrlInvalidAlert(page);
  }
}

async function waitForUserManagementShell(page) {
  await expect(page.getByRole('button', { name: '添加用户' })).toBeVisible({
    timeout: 15000,
  });
}

async function navigateToUserManagementByUrl(page) {
  const baseUrl = getAppBaseUrl();
  common.log('使用直连 URL 进入用户管理页面');
  await page.goto(baseUrl + '/user', { waitUntil: 'domcontentloaded' });
  await waitForUserManagementShell(page);
  await page.waitForTimeout(1000);
}

async function navigateToUserManagement(page) {
  if (await isUserManagementShellVisible(page)) {
    common.log('已在用户管理页面，跳过侧栏导航');
    await handleUrlInvalidAlert(page);
    return;
  }

  await switchToChinese(page);
  await handleUrlInvalidAlert(page);
  await ensureAuthenticatedShell(page);

  const sidebar = new AppSidebarComponent(page);
  const menuLabels = ['用户管理', 'User Manage'];
  let navigated = false;

  for (const label of menuLabels) {
    const hasMenuItem = (await sidebar.menuItem(label).count()) > 0;
    const hasSubmenu = (await sidebar.submenuTitle(label).count()) > 0;
    const hasListItem =
      (await page.getByRole('listitem', { name: label }).count()) > 0;
    if (hasMenuItem || hasSubmenu || hasListItem) {
      common.log('通过侧栏导航：' + label);
      await sidebar.navigate(label);
      navigated = true;
      break;
    }
  }

  if (!navigated) {
    await navigateToUserManagementByUrl(page);
  } else {
    await waitForUserManagementShell(page);
  }

  await handleUrlInvalidAlert(page);
  await page.waitForTimeout(2000);
}

async function expectUserManagementLayout(page) {
  const shell = new LayoutShellComponent(page);
  await shell.expectLoaded();
}

function pageTable(page) {
  return new PageTableComponent(page);
}

function paginationLocator(page) {
  return pageTable(page).pagination();
}

async function gotoUserManagementPage(page) {
  const addBtn = page.getByRole('button', { name: '添加用户' });
  const baseUrl = getAppBaseUrl();
  const targetUrl = baseUrl + '/user';

  // 导航入口统一会话守卫：Session Key 已失效时先自愈（重新登录 + 回写 auth.json），
  // 否则页面带着失效 Key 加载，列表 401 弹出「Session Key 错误」遮罩拦截后续点击。
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });

  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await recoverFromAuthAlert(page, targetUrl);
  await addBtn.waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * 会话已失效时列表接口 401 会弹出「Session Key 错误」类遮罩弹框，
 * 此时页面元素「可见」但被 .ivu-modal-wrap 拦截点击（表现为 locator.click 超时）。
 * 检测到即重新登录、回写 auth.json，然后重新加载目标页。
 */
async function recoverFromAuthAlert(page, retryUrl) {
  await page.waitForTimeout(800);
  if (!(await sessionUtils.ensureSessionHealthy(page, { retryUrl }))) {
    return false;
  }
  await page.waitForTimeout(800);
  return true;
}

async function gotoTokenManagementPage(page) {
  const targetUrl = getAppBaseUrl() + '/user';
  await sessionUtils.ensureSessionHealthy(page, { retryUrl: targetUrl });

  if (await isTokenTabReady(page)) {
    common.log('已在用户管理-Token Tab，跳过导航');
    await handleUrlInvalidAlert(page);
    return;
  }
  if (await isUserManagementShellVisible(page)) {
    await switchToTokenTab(page);
    return;
  }
  await ensureAppSession(page);
  await navigateToUserManagement(page);
  await recoverFromAuthAlert(page, targetUrl);
  await switchToTokenTab(page);
}

async function expectUserManagementTabs(page) {
  await userManagementTabs(page).expectTabsVisible('用户', 'Token');
}

function getDocPassword() {
  return DOC_PASSWORD;
}

async function searchUser(page, keyword) {
  await pageTable(page).search(keyword);
}

async function clearSearch(page) {
  await pageTable(page).clearSearch();
}

/**
 * 行定位与行断言（分页无关）
 *
 * pageTable 前端分页默认 20 条/页，只渲染当前页；造数产生的新行若落在第 2/3 页，
 * 直接断言「当前页可见」或直接点行操作按钮必然超时。统一先按「用户」列做本地筛选
 * 把目标行收敛到第 1 页，再断言 / 点击，与数据总量和排列顺序解耦。
 */
async function locateUserRowByName(page, username) {
  const table = pageTable(page);
  await table.filterByColumn('用户', username);
  return table.rowByText(username);
}

async function expectUserRowVisibleByName(page, username, timeout = 15000) {
  const table = pageTable(page);
  await table.filterByColumn('用户', username);
  await table.expectRowVisible(username, timeout);
}

async function expectUserRowHiddenByName(page, username, timeout = 15000) {
  const table = pageTable(page);
  await table.filterByColumn('用户', username);
  await table.expectRowHidden(username, timeout);
}

async function clickUserRowAction(page, username, action) {
  const row = await locateUserRowByName(page, username);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: action }).click();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 按单选项文案「精确」点击：iView 单选项用 hasText 子串匹配，
 * 「系统管理」会同时命中「系统管理（只读）」（Token scope 三档、角色两档均如此），
 * 触发 strict mode violation，故锚定整串匹配。
 */
async function selectRadioOptionExact(form, groupLabel, optionText) {
  const group = form.item(groupLabel).locator('.ivu-radio-group');
  await group
    .locator('.ivu-radio-wrapper')
    .filter({ hasText: new RegExp('^\\s*' + escapeRegExp(optionText) + '\\s*$') })
    .click();
}

/**
 * 新增用户抽屉的「角色」已由旧版固定勾选系统管理员改为单选（系统管理员 / 系统管理员（只读）），
 * 故按单选项文案精确点击（旧实现走 .ivu-select 下拉，控件形态已不存在）。
 */
async function selectUserRole(page, role) {
  await selectRadioOptionExact(
    ivuDrawer(page).form(DRAWER_TITLE.addUser),
    '角色',
    role,
  );
}

async function fillEditPasswordForm(
  page,
  newPassword,
  confirmPassword,
  currentPassword,
) {
  const form = ivuDrawer(page).form(DRAWER_TITLE.editPassword);
  if (currentPassword) {
    const oldPwd = form.input('原密码');
    if ((await oldPwd.count()) > 0) {
      await oldPwd.fill(currentPassword);
    }
  }
  await form.fillInput('新密码', newPassword);
  await form.fillInput('确认密码', confirmPassword || newPassword);
}

async function changePageSize(page, sizeText) {
  await pageTable(page).changePageSize(sizeText);
}

async function openUserDropdown(page) {
  await page.getByText(confInfo['username'], { exact: true }).first().click();
  await page.waitForTimeout(500);
}

async function clickLogoutMenu(page) {
  await openUserDropdown(page);
  await page.getByText('注销').click();
  await page.waitForTimeout(500);
}

async function loginAndNavigate(page) {
  await login(page);
  await navigateToUserManagement(page);
}

async function generateTestUsername() {
  return 'user_' + moment().format('YYYYMMDDHHmmssSSS');
}

async function generateTestPassword() {
  return DOC_PASSWORD;
}

async function generateTestTokenName() {
  return 'token_' + moment().format('YYYYMMDDHHmmssSSS');
}

async function switchToUserTab(page) {
  if (await isUserTabReady(page)) {
    return;
  }
  await userManagementTabs(page).clickTabByText('用户');
  await page.waitForTimeout(1000);
}

async function switchToTokenTab(page) {
  if (await isTokenTabReady(page)) {
    return;
  }
  await userManagementTabs(page).clickTabByText('Token');
  await page.waitForTimeout(1000);
}

async function navigateToTokenManagement(page) {
  await navigateToUserManagement(page);
  await switchToTokenTab(page);
}

async function expectUserVisible(page, username) {
  await expectUserRowVisibleByName(page, username);
}

async function expectUserNotVisible(page, username) {
  await expectUserRowHiddenByName(page, username);
}

async function openAddUserDrawer(page) {
  // 尝试多种定位器
  let addBtn = page.locator('button:has-text("添加用户")').first();
  if (!(await addBtn.isVisible().catch(() => false))) {
    addBtn = page.getByRole('button', { name: '添加用户' });
  }
  await addBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addBtn.click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.addUser);
}

async function fillAddUserForm(page, username, password, confirmPassword) {
  const form = ivuDrawer(page).form(DRAWER_TITLE.addUser);
  await form.fillInput('用户名', username);
  await form.fillInput('密码', password);
  await form.fillInput('确认密码', confirmPassword || password);
}

async function submitAddUserForm(page) {
  await ivuDrawer(page).clickFooterButton(DRAWER_TITLE.addUser, '创建');
}

async function closeAddUserDrawer(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.addUser);
}

async function expectAddUserDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.addUser);
}

async function expectEditPasswordDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editPassword);
}

async function expectAddUserFormFieldValue(page, label, value) {
  await expect(
    ivuDrawer(page).form(DRAWER_TITLE.addUser).input(label),
  ).toHaveValue(value);
}

async function expectAddUserFormFieldError(page, label, message) {
  await ivuDrawer(page)
    .form(DRAWER_TITLE.addUser)
    .expectFieldError(label, message);
}

async function expectEditPasswordFormFieldError(page, label, message) {
  await ivuDrawer(page)
    .form(DRAWER_TITLE.editPassword)
    .expectFieldError(label, message);
}

async function expectAddUserDrawerClosed(page) {
  await expect(ivuDrawer(page).withTitle(DRAWER_TITLE.addUser)).toBeHidden({
    timeout: 10000,
  });
}

async function expectUserManagementPageTitle(page) {
  await expect(
    page.locator('.bfe-breadcrumb').getByText('用户管理', { exact: true }),
  ).toBeVisible();
}

async function expectEditPasswordDrawerHidden(page) {
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.editPassword),
  ).toBeHidden();
}

async function expectEditPasswordOldPasswordField(page, visible = true) {
  const field = ivuDrawer(page).form(DRAWER_TITLE.editPassword).input('原密码');
  if (visible) {
    await expect(field).toBeVisible();
  } else {
    await expect(field).toHaveCount(0);
  }
}

async function expectDeleteConfirmModal(page) {
  await ivuModal(page).expectText('信息提示');
}

async function expectLogoutConfirmModal(page) {
  await ivuModal(page).expectText('确认注销？');
}

async function confirmDeleteUserIfVisible(page) {
  if (await ivuModal(page).visible().isVisible()) {
    await ivuModal(page).confirm('确定');
    await page.waitForTimeout(1500);
  }
}

async function expectCreateTokenDrawerOpen(page) {
  common.log('验证创建Token抽屉打开...');
  const drawer = ivuDrawer(page).active();
  common.log('drawer count: ' + (await drawer.count()));
  await expect(drawer).toBeVisible();
  common.log('创建Token抽屉已打开');
  await expect(drawer.getByRole('button', { name: '提交' })).toBeVisible();
  common.log('提交按钮可见');
}

async function expectCreateTokenDrawerHidden(page) {
  await expect(ivuDrawer(page).active()).toBeHidden();
}

async function expectTokenDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.tokenDetail);
}

async function expectCreateTokenFormFieldValue(page, label, value) {
  await expect(ivuDrawer(page).formInActive().input(label)).toHaveValue(value);
}

async function expectCreateTokenFormFieldError(page, label, message) {
  await ivuDrawer(page).formInActive().expectFieldError(label, message);
}

async function expectLoginPageVisible(page) {
  await expect(page.getByPlaceholder('请输入用户名')).toBeVisible();
  await expect(page.getByPlaceholder('请输入密码')).toBeVisible();
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
}

async function expectLoginPageNoCaptcha(page) {
  await expect(
    page.locator('input[name="captcha"], input[placeholder*="验证码"]'),
  ).toHaveCount(0);
  await expect(page.locator('img[name="captcha"], .captcha img')).toHaveCount(
    0,
  );
  await expect(page.getByText('换一张')).toHaveCount(0);
}

async function fillLoginForm(page, username, password) {
  await page.getByPlaceholder('请输入用户名').fill(username);
  await page.getByPlaceholder('请输入密码').fill(password);
}

async function closeAddUserDrawerByX(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.addUser);
}

async function resetAddUserForm(page) {
  await ivuDrawer(page).clickFooterButton(DRAWER_TITLE.addUser, '重置');
}

async function openEditPasswordDrawer(page, username) {
  await clickUserRowAction(page, username, '修改密码');
  await page.waitForTimeout(1000);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editPassword);
}

async function submitEditPasswordForm(page) {
  await ivuDrawer(page).clickFooterButton(DRAWER_TITLE.editPassword, '提交');
}

async function closeEditPasswordDrawer(page) {
  await ivuDrawer(page).close(DRAWER_TITLE.editPassword);
}

async function clickDeleteUserBtn(page, username) {
  await clickUserRowAction(page, username, '删除');
  await page.waitForTimeout(500);
}

async function confirmDeleteUser(page) {
  await ivuModal(page).confirm('确定');
}

async function cancelDeleteUser(page) {
  await ivuModal(page).cancel();
}

async function deleteUser(page, username) {
  await clickDeleteUserBtn(page, username);
  await expect(ivuModal(page).visible()).toBeVisible();
  await confirmDeleteUser(page);
}

async function openCreateTokenDrawer(page) {
  const createBtn = page.getByRole('button', { name: '创建' });
  common.log('查找创建按钮...');
  const btnCount = await createBtn.count();
  common.log('创建按钮数量: ' + btnCount);
  await expect(createBtn).toBeVisible();
  common.log('点击创建按钮');
  await createBtn.click();
  await page.waitForTimeout(2000);
  await expectCreateTokenDrawerOpen(page);
}

async function fillCreateTokenForm(page, tokenName, role) {
  const form = ivuDrawer(page).formInActive();
  await form.fillInput('名称', tokenName);
  if (role) {
    await selectRadioOptionExact(form, '角色', role);
  }
}

async function submitCreateTokenForm(page) {
  await ivuDrawer(page).clickActiveFooterButton('提交');
}

async function waitForCreateTokenSuccess(page, tokenName, timeout = 30000) {
  await expectCreateTokenDrawerHidden(page);
  await expectTokenVisibleInAllPages(page, tokenName, timeout);
}

async function closeCreateTokenDrawer(page) {
  await ivuDrawer(page).closeActiveByX();
}

async function closeCreateTokenDrawerByX(page) {
  await ivuDrawer(page).closeActiveByX();
}

async function resetCreateTokenForm(page) {
  await ivuDrawer(page).clickActiveFooterButton('重置');
}

/**
 * Token 表未开放列搜索（列定义无 searchable），行定位只能逐页查找。
 * 新建 Token 追加在列表末页（列表按创建时间升序），故先算最大页码再逐页定位，
 * 避免「行不在当前页」被当成「行不存在」。
 */
async function tokenListMaxPage(page) {
  const labels = await pageTable(page)
    .pagination()
    .locator('.el-pager li.number')
    .allInnerTexts();
  const nums = labels
    .map((text) => parseInt(String(text).trim(), 10))
    .filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) : 1;
}

async function waitForTokenTableReady(page) {
  const table = pageTable(page);
  await expect(table.rootLocator()).toBeVisible({ timeout: 10000 });
  await table.waitForLoaded(10000);
  await page.waitForTimeout(500);
}

/** 逐页定位 Token 行；找到后当前页即该行所在页，返回是否找到 */
async function locateTokenRowInAllPages(page, tokenName, perPageTimeout = 3000) {
  const table = pageTable(page);
  const maxPage = await tokenListMaxPage(page);
  for (let i = 1; i <= maxPage; i++) {
    if (i > 1) {
      await table.clickPageNumber(i);
    }
    const found = await table
      .rowByText(tokenName)
      .waitFor({ state: 'visible', timeout: perPageTimeout })
      .then(() => true)
      .catch(() => false);
    if (found) {
      return true;
    }
  }
  return false;
}

async function openTokenDetail(page, tokenName) {
  if (!(await locateTokenRowInAllPages(page, tokenName))) {
    throw new Error('在所有页面中未找到Token: ' + tokenName);
  }
  await pageTable(page).rowAction(tokenName, '详情').click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.tokenDetail);
}

async function closeTokenDetail(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.tokenDetail);
}

async function clickDeleteTokenBtn(page, tokenName) {
  if (!(await locateTokenRowInAllPages(page, tokenName))) {
    throw new Error('在所有页面中未找到Token: ' + tokenName);
  }
  await pageTable(page).rowAction(tokenName, '删除').click();
  await page.waitForTimeout(500);
}

async function confirmDeleteToken(page) {
  await ivuModal(page).confirm('确定');
}

async function cancelDeleteToken(page) {
  await ivuModal(page).cancel();
}

async function deleteToken(page, tokenName) {
  await clickDeleteTokenBtn(page, tokenName);
  await confirmDeleteToken(page);
}

/**
 * 幂等删除 Token：存在则删，不存在/已删除则跳过（供 afterEach 兜底清理使用）
 *
 * 早期实现只等 2s 且在「当前页」找行：Token 落在末页或列表尚未渲染完时会误判为
 * 「不存在」而跳过删除，导致每轮回归都残留 Token（残留又会把新 Token 挤到末页）。
 */
async function deleteTokenIfExists(page, tokenName) {
  try {
    await gotoTokenManagementPage(page);
    await waitForTokenTableReady(page);
    if (!(await locateTokenRowInAllPages(page, tokenName))) {
      common.log('Token 不存在，跳过删除: ' + tokenName);
      return false;
    }
    await deleteToken(page, tokenName);
    await page.waitForTimeout(500);
    return true;
  } catch (error) {
    common.log('Token 删除失败，跳过: ' + tokenName + ' ' + error.message);
    return false;
  }
}

/**
 * 用户模块测试数据清理工厂：track 用户名/Token 名，afterEach 统一清理
 * - 用户走 API 删除；Token 无删除接口，走 UI 幂等删除（deleteTokenIfExists）
 */
function createUserTestCleanup() {
  const tracked = { usernames: [], tokenNames: [] };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    trackUsername(name) {
      pushUnique(tracked.usernames, name);
    },
    trackTokenName(name) {
      pushUnique(tracked.tokenNames, name);
    },
    async cleanup(page) {
      for (const username of [...tracked.usernames].reverse()) {
        try {
          await deleteUserViaApi(page, username);
        } catch (error) {
          common.log('清理用户失败: ' + username + ' ' + error.message);
        }
      }
      for (const tokenName of [...tracked.tokenNames].reverse()) {
        try {
          await deleteTokenIfExists(page, tokenName);
        } catch (error) {
          common.log('清理 Token 失败: ' + tokenName + ' ' + error.message);
        }
      }
      tracked.usernames = [];
      tracked.tokenNames = [];
    },
  };
}

async function expectTokenVisible(page, tokenName, timeout) {
  await pageTable(page).expectRowVisible(tokenName, timeout);
}

async function expectTokenNotVisible(page, tokenName, timeout) {
  await pageTable(page).expectRowHidden(tokenName, timeout);
}

async function expectTokenVisibleInAllPages(page, tokenName, timeout) {
  if (!(await locateTokenRowInAllPages(page, tokenName))) {
    // 未找到时仍走标准断言，失败信息里给出实际列表内容，便于定位
    await pageTable(page).expectRowVisible(tokenName, timeout);
  }
}

async function gotoLoginPage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'zh');
  });
  await page.goto(confInfo['ctlHost'], { waitUntil: 'domcontentloaded' });
  await waitForLoginPage(page);
}

async function submitLoginForm(page) {
  await page.getByRole('button', { name: '登录' }).click();
}

/**
 * 以指定账号登录（用于只读视角等非默认账号），登录后等待 localStorage.user.role 变为期望值。
 * 不调用 persistAuthState，避免覆盖 auth.json 中默认 admin 会话。
 */
async function loginAsUser(page, username, password, expectedRole, timeout = 20000) {
  await gotoLoginPage(page);
  await fillLoginForm(page, username, password);
  await submitLoginForm(page);
  await page.waitForFunction(
    (role) => {
      const raw = localStorage.getItem('user');
      if (!raw) return false;
      try {
        return JSON.parse(raw).role === role;
      } catch (e) {
        return false;
      }
    },
    expectedRole,
    { timeout },
  );
  await page.waitForTimeout(500);
}

async function openLogoutMenu(page) {
  await page.getByText(confInfo['username'], { exact: true }).hover();
  await page.getByText('注销').click();
  await page.waitForTimeout(500);
}

async function confirmLogout(page) {
  await ivuModal(page).confirm('确定');
}

async function cancelLogout(page) {
  await ivuModal(page).cancel();
}

// ---------------------------------------------------------------------------
// 只读管理员视角（docs/user-management/02-功能测试用例/10-角色与只读视角.md）
// UM-45/46/47/48/49（role 枚举与角色变更）+ UM-52（只读视角写入口隐藏、Token 掩码）
// ---------------------------------------------------------------------------

/** 前端路由路径（src/router/router.js：path 'user'，name 'user.list'） */
const USER_MANAGEMENT_PATH = 'user';

/** role 枚举 → 列表「角色」列文案（src/modules/User/components/User.vue roleLabel） */
const ROLE_LABEL = {
  system_admin: '系统管理员',
  system_admin_readonly: '系统管理员（只读）',
};

/** 用户表列序号（0 基）：用户 / 角色 / 操作 */
const USER_COLUMN_INDEX = { name: 0, role: 1, action: 2 };

/** Token 表列序号（0 基）：名称 / scope / 操作 */
const TOKEN_COLUMN_INDEX = { name: 0, scope: 1, action: 2 };

/** 角色单选两档（User.vue 角色变更抽屉 / CreateUser.vue 创建用户表单同一枚举） */
const ROLE_OPTIONS = [ROLE_LABEL.system_admin, ROLE_LABEL.system_admin_readonly];

/**
 * utils/readonly.js 反向依赖本文件（readonly.loginAsReadonly → 本文件 loginAsUser），
 * 顶层 require 会构成循环依赖并拿到未赋值的 exports（{}），故惰性 require。
 */
function readonlyUtils() {
  return require('../../utils/readonly');
}

/** 整串文案匹配（iView 组件 textContent 带换行缩进，hasText 正则不做 trim） */
function exactTextRegex(text) {
  return new RegExp('^\\s*' + escapeRegExp(text) + '\\s*$');
}

function userManagementBreadcrumb(page) {
  return page.locator('.bfe-breadcrumb').getByText('用户管理', { exact: true });
}

/** 当前激活的 Tab 面板。
 *  User/index.vue 两个 TabPane 的内容用 v-if 互斥渲染（非激活面板是空 div）；
 *  iView 3.5 用内联 `style.visibility` 控制面板显隐（**没有** `-active`/`-inactive` class），
 *  故用 `.ivu-tabs-tabpane:visible` 选中当前面板（visibility:hidden 的面板被 :visible 排除）。 */
function userManagementTabPane(page) {
  return page.locator('.ivu-tabs-content .ivu-tabs-tabpane:visible');
}

/**
 * 当前 Tab 的主写入口：用户 Tab = 「添加用户」，Token Tab = 「创建」。
 * 两个 Tab 各自只有一个挂了 v-has 的主按钮（class .add-button，
 * src/modules/User/components/User.vue:33、Token.vue:33）。
 */
function tabAddButton(page) {
  return userManagementTabPane(page).locator('.add-button');
}

/**
 * Token Tab 专属提示（user.tipInnerUserDel），用于确认 Tab 已切换。
 * 不能用「创建」按钮当就绪锚点——只读视角下它被 v-has 隐藏。
 */
function tokenTabAlert(page) {
  return page.getByText(/Token 是内部程序访问APIServer的鉴权凭证/);
}

// --- 用户列表行 / 单元格 -----------------------------------------------------

function userRow(page, username) {
  return pageTable(page)
    .dataRows()
    .filter({ has: page.getByText(username, { exact: true }) })
    .first();
}

function userCell(page, username, columnIndex) {
  return userRow(page, username).locator(`td:nth-child(${columnIndex + 1})`);
}

function userRoleCell(page, username) {
  return userCell(page, username, USER_COLUMN_INDEX.role);
}

function userActionCell(page, username) {
  return userCell(page, username, USER_COLUMN_INDEX.action);
}

/**
 * 行内操作按钮（CSS :has-text 定位，不用 getByRole）。
 * getByRole 默认排除 ARIA 隐藏元素，而只读视角下这些按钮正是被
 * `.v-has-hidden{display:none!important}` 隐藏的——用 getByRole 会得到 count=0，
 * 无法断言「仍在 DOM 中且带 .v-has-hidden」。
 */
function userRowActionButton(page, username, label) {
  return userActionCell(page, username).locator(`button:has-text("${label}")`);
}

function userChangeRoleButton(page, username) {
  return userRowActionButton(page, username, '变更角色');
}

function userChangePasswordButton(page, username) {
  return userRowActionButton(page, username, '修改密码');
}

function userRowDeleteButton(page, username) {
  return userRowActionButton(page, username, '删除');
}

/** 用户表列头：存在「角色」列，且不再有 is_admin 布尔列（UM-45 预期1） */
async function expectUserTableHasRoleColumn(page) {
  const headers = pageTable(page).headers();
  await expect(
    headers.filter({ hasText: '角色' }).first(),
    '用户表应有「角色」列',
  ).toBeVisible();
  await expect(
    headers.filter({ hasText: 'is_admin' }),
    '用户表不应再有 is_admin 布尔列',
  ).toHaveCount(0);
}

async function expectUserRoleCellText(page, username, expected) {
  await expect(userRoleCell(page, username), `用户 ${username} 的「角色」列`).toHaveText(
    expected,
  );
}

/** 当前页所有渲染行的「用户名 + 角色文案」（UM-45 预期4 逐行比对用） */
async function readRenderedUserRoles(page) {
  const rows = pageTable(page).dataRows();
  const count = await rows.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const name = ((await rows.nth(i).locator('td:nth-child(1)').innerText()) || '').trim();
    const role = ((await rows.nth(i).locator('td:nth-child(2)').innerText()) || '').trim();
    result.push({ name, role });
  }
  return result;
}

async function countRenderedUserRows(page) {
  return pageTable(page).dataRows().count();
}

/**
 * 等用户表首行渲染完成（列表接口异步返回）。
 * 直接读行/按列筛选前必须先等，否则会在空数据上筛选——数据到达时
 * pageTable 会清空搜索条件，筛选结果与后来到达的数据不一致。
 */
async function waitForUserTableRows(page, timeout = 15000) {
  await pageTable(page).waitForLoaded(timeout);
  await expect(pageTable(page).dataRows().first()).toBeVisible({ timeout });
}

/**
 * 定位并确认用户行（对「提交后列表异步刷新」健壮）。
 * 用户表是前端分页 + 列筛选：若在数据刷新前套上筛选，数据到达时 pageTable 会清空
 * 搜索条件（columns 的 searchValue 被置空），目标行（新用户通常排在末页）随即落回
 * 后面的页，筛选结果与预期不一致。故「等表就绪 → 筛选 → 判断 → 重试」。
 */
async function ensureUserRowVisible(page, username, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    await waitForUserTableRows(page);
    await pageTable(page).filterByColumn('用户', username);
    const row = userRow(page, username);
    if (await row.isVisible().catch(() => false)) {
      return row;
    }
    await page.waitForTimeout(1000);
  }
  await expect(
    userRow(page, username),
    `用户 ${username} 的行应可见`,
  ).toBeVisible({ timeout: 5000 });
  return userRow(page, username);
}

async function clearUserColumnFilter(page) {
  await pageTable(page).filterByColumn('用户', '');
}

// --- 用户 Tab「角色」列筛选控件 ----------------------------------------------

function userSearchArea(page) {
  return pageTable(page).searchArea();
}

/** 搜索行内唯一的下拉控件（User.vue 角色列 searchType=select） */
function roleFilterSelect(page) {
  return userSearchArea(page).locator('.ivu-select').first();
}

/**
 * 「角色」列筛选控件的占位/选中值展示节点。
 * 注意（2026-10-16 实测修正）：pageTable 的角色列筛选 **没有传 filterable**，而 iView 的
 * Select 仅在 filterable 时才渲染 `<input>`（`iSelectHead` 渲染里 `e.filterable ? input : empty`），
 * 所以 `input[placeholder="..."]` 在真实 DOM 里 **根本不存在**；占位文案是
 * `singleDisplayValue`（= 未选中时取 localePlaceholder）渲染出的文本节点，
 * 未选中 → class `ivu-select-placeholder`，已选中 → class `ivu-select-selected-value`。
 */
function roleFilterDisplay(page) {
  return roleFilterSelect(page).locator('.ivu-select-placeholder, .ivu-select-selected-value');
}

/** 未选中时的占位文案节点（值 = com.tipSelectX(obj=列标题) = 「请选择角色」） */
function roleFilterPlaceholder(page) {
  return roleFilterSelect(page).locator('.ivu-select-placeholder');
}

/** 已选中时的展示值节点（文案为选项 label，如「系统管理员」） */
function roleFilterSelectedValue(page) {
  return roleFilterSelect(page).locator('.ivu-select-selected-value');
}

/**
 * 隐藏域里存的是选中项的 value（= role 枚举 `system_admin` / `system_admin_readonly`），
 * 而可见文案是选项 label（中文）——UM-46 预期2/3 的判定依赖这个差异。
 */
function roleFilterValueInput(page) {
  return roleFilterSelect(page).locator('input[type="hidden"]');
}

/** 「角色」列筛选控件就绪：可见，且占位/选中文案指向角色列（含「角色」字样） */
async function expectRoleFilterVisible(page) {
  await expect(
    roleFilterSelect(page),
    '用户表应有「角色」列下拉筛选控件',
  ).toBeVisible({ timeout: 10000 });
  await expect(
    roleFilterDisplay(page),
    '「角色」列筛选控件的展示文案应指向角色列',
  ).toContainText('角色');
  await expect(
    roleFilterPlaceholder(page),
    '未筛选时应展示占位文案「请选择角色」',
  ).toHaveText('请选择角色');
}

/**
 * 下拉项统一在 **page 作用域** 定位：pageTable 给列头 Select 传了 `transfer: true`，
 * 下拉 DOM 挂在 document.body 下（不在用户管理页容器内），限定在页面容器里必然点不到。
 */
function roleFilterOptions(page) {
  return page.locator('.ivu-select-dropdown:visible .ivu-select-item');
}

/** 单个下拉项：与 IvuSelect.exactDropdownItem 同口径（`:text-is` 整串、归一化空白） */
function roleFilterItem(page, label) {
  const quoted = String(label)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return page.locator(
    '.ivu-select-dropdown:visible .ivu-select-item:text-is("' + quoted + '")',
  );
}

/**
 * 展开「角色」筛选下拉并等选项就绪（**幂等**）。
 * 触发器点击是开/合切换，盲点一次会在「上一步已展开」时把下拉关掉，
 * 故先看选项是否已经在，再决定要不要点；末尾等 >0.3s 让开合动画落定
 * （iView `.ivu-transition-drop-*-active` animation-duration:.3s）。
 */
async function openRoleFilter(page) {
  const items = roleFilterOptions(page);
  if ((await items.count()) === 0) {
    await roleFilterSelect(page).click();
  }
  await page.waitForTimeout(400);
  await expect(
    items.first(),
    '「角色」筛选下拉应展开出选项',
  ).toBeVisible({ timeout: 10000 });
}

async function selectRoleFilter(page, label) {
  // 复用 components/iview/IvuSelect.js 的封装（内部按 page 作用域 + `:text-is` 定位，
  // 并已按「选项是否真的可见」收敛开合状态）；后续点选/读取前统一补一次动画落定等待。
  await new IvuSelectComponent(page, roleFilterSelect(page)).selectOptionExact(label);
  await page.waitForTimeout(500);
}

/** 核对筛选枚举：下拉项应恰好为两档角色文案（不再有 is_admin 布尔项，UM-46 预期1） */
async function expectRoleFilterOptions(page, labels = ROLE_OPTIONS) {
  const texts = (await roleFilterOptions(page).allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => t !== '');
  expect(texts, '「角色」筛选下拉项应恰为两档角色枚举').toEqual(labels);
}

/**
 * 清空筛选（点击 clearable Select 的清除图标）。
 * iView 的清除图标是 head 里 `resetSelect` 时才渲染的 `type=ios-close-circle` 的 Icon
 * （class `ivu-icon-ios-close-circle` + `ivu-select-arrow`；注意与 i-input 的
 * `.ivu-icon-ios-close` 不是同一个类名），而 `canBeCleared = (hover 或 下拉展开) && 有值 && clearable`，
 * 所以先 hover，hover 未生效再展开下拉兜底。
 */
async function clearRoleFilter(page) {
  const select = roleFilterSelect(page);
  const clearIcon = select.locator('.ivu-icon-ios-close-circle');

  await select.hover();
  await page.waitForTimeout(300);
  if ((await clearIcon.count()) === 0) {
    await select.click();
    await page.waitForTimeout(300);
  }
  if ((await clearIcon.count()) === 0) {
    await select.hover();
    await page.waitForTimeout(300);
  }
  if ((await clearIcon.count()) === 0) {
    throw new Error('「角色」筛选控件未出现清除图标，无法清空筛选');
  }

  await clearIcon.first().click();
  await page.waitForTimeout(500);
}

/** 清空后不应再展示已选项（iView 选中值节点类名由 -selected-value 回到 -placeholder） */
async function expectRoleFilterCleared(page) {
  await expect(
    roleFilterSelectedValue(page),
    '清空后「角色」筛选不应再展示已选项',
  ).toHaveCount(0);
  await expect(
    roleFilterPlaceholder(page),
    '清空后「角色」筛选应回到占位文案',
  ).toHaveText('请选择角色');
}

/** iView 全局消息提示容器（$Message） */
function messageToast(page) {
  return page.locator('.ivu-message');
}

async function expectErrorMessage(page, text) {
  await expect(
    messageToast(page).getByText(text),
    `应出现错误提示「${text}」`,
  ).toBeVisible({ timeout: 10000 });
}

// --- 角色变更抽屉（UM-47 / UM-48） ------------------------------------------

function changeRoleDrawer(page) {
  return ivuDrawer(page).withTitle(DRAWER_TITLE.changeRole);
}

function changeRoleForm(page) {
  return ivuDrawer(page).form(DRAWER_TITLE.changeRole);
}

function changeRoleRadioGroup(page) {
  return changeRoleForm(page).item('角色').locator('.ivu-radio-group');
}

function changeRoleRadio(page, label) {
  return changeRoleRadioGroup(page)
    .locator('.ivu-radio-wrapper')
    .filter({ hasText: exactTextRegex(label) });
}

/** 内置 admin 的角色固定提示（预期1） */
function changeRoleFixedTip(page) {
  return changeRoleDrawer(page).getByText(DOC_USER.tipRoleFixedBuiltin);
}

function changeRoleSubmitButton(page) {
  return changeRoleDrawer(page).getByRole('button', { name: '提交', exact: true });
}

async function openChangeRoleDrawer(page, username) {
  // 先按用户名列筛选把目标行收敛到第 1 页，再用「整串相等」的行定位点击：
  // clickUserRowAction 内部是子串匹配，'admin' 会先命中 'user_admin_xxx' 这类账号。
  await pageTable(page).filterByColumn('用户', username);
  const button = userChangeRoleButton(page, username);
  await expect(button, `用户 ${username} 行应有「变更角色」入口`).toBeVisible({
    timeout: 15000,
  });
  await button.click();
  await page.waitForTimeout(1000);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.changeRole);
}

async function closeChangeRoleDrawer(page) {
  await ivuDrawer(page).close(DRAWER_TITLE.changeRole);
}

async function selectChangeRole(page, label) {
  await changeRoleRadio(page, label).click();
  await page.waitForTimeout(200);
}

async function submitChangeRole(page) {
  await changeRoleSubmitButton(page).click();
}

async function expectChangeRoleDrawerClosed(page) {
  await expect(changeRoleDrawer(page)).toBeHidden({ timeout: 10000 });
}

/** 抽屉内角色单选恰好两档（预期2） */
async function expectChangeRoleOptions(page, labels = ROLE_OPTIONS) {
  const texts = (
    await changeRoleRadioGroup(page).locator('.ivu-radio-wrapper').allInnerTexts()
  )
    .map((t) => t.trim())
    .filter((t) => t !== '');
  expect(texts, '角色变更抽屉应为两档角色单选').toEqual(labels);
}

async function expectChangeRoleChecked(page, label) {
  await expect(
    changeRoleRadio(page, label),
    `角色变更抽屉应选中「${label}」（该用户当前角色）`,
  ).toHaveClass(/ivu-radio-wrapper-checked/);
}

// --- 添加用户抽屉的角色单选（UM-49） ----------------------------------------

function addUserRoleFormItem(page) {
  return ivuDrawer(page).form(DRAWER_TITLE.addUser).item('角色');
}

function addUserRoleRadio(page, label) {
  return addUserRoleFormItem(page)
    .locator('.ivu-radio-wrapper')
    .filter({ hasText: exactTextRegex(label) });
}

/** 角色为必填：iView FormItem 带 required 规则时挂 .ivu-form-item-required（预期2） */
async function expectAddUserRoleRequired(page) {
  await expect(
    addUserRoleFormItem(page),
    '「角色」应为必填项（FormItem 带 required 规则）',
  ).toHaveClass(/ivu-form-item-required/);
}

async function expectAddUserRoleOptions(page, labels = ROLE_OPTIONS) {
  const texts = (
    await addUserRoleFormItem(page).locator('.ivu-radio-wrapper').allInnerTexts()
  )
    .map((t) => t.trim())
    .filter((t) => t !== '');
  expect(texts, '创建用户「角色」应恰为两档单选').toEqual(labels);
}

async function expectAddUserRoleChecked(page, label) {
  await expect(
    addUserRoleRadio(page, label),
    `创建用户「角色」应默认选中「${label}」`,
  ).toHaveClass(/ivu-radio-wrapper-checked/);
}

async function selectAddUserRole(page, label) {
  await addUserRoleRadio(page, label).click();
  await page.waitForTimeout(200);
}

// --- Token Tab 行 / 详情（UM-52 预期3/4） -----------------------------------

/**
 * Token 表（Token.vue）未开放列搜索，行只能逐页定位。
 * 断言前必须先 locateTokenRowByName：否则「行不在当前页」与「行不存在」不可区分。
 */
async function locateTokenRowByName(page, tokenName) {
  await waitForTokenTableReady(page);
  return locateTokenRowInAllPages(page, tokenName);
}

async function expectTokenRowLocated(page, tokenName) {
  const found = await locateTokenRowByName(page, tokenName);
  expect(found, `应能在 Token 列表中找到 ${tokenName}`).toBe(true);
}

function tokenCell(page, tokenName, columnIndex) {
  return pageTable(page)
    .dataRows()
    .filter({ has: page.getByText(tokenName, { exact: true }) })
    .first()
    .locator(`td:nth-child(${columnIndex + 1})`);
}

function tokenRowActionButton(page, tokenName, label) {
  return tokenCell(page, tokenName, TOKEN_COLUMN_INDEX.action).locator(
    `button:has-text("${label}")`,
  );
}

function tokenDetailButton(page, tokenName) {
  return tokenRowActionButton(page, tokenName, '详情');
}

function tokenDeleteButton(page, tokenName) {
  return tokenRowActionButton(page, tokenName, '删除');
}

function tokenDetailDrawer(page) {
  return ivuDrawer(page).withTitle(DRAWER_TITLE.tokenDetail);
}

/** 详情抽屉内某字段的值单元格（Token.vue：li.title 标签 + li.value 值） */
function tokenDetailFieldValue(page, label) {
  return tokenDetailDrawer(page)
    .locator('.panel-body ul')
    .filter({ hasText: new RegExp('^\\s*' + escapeRegExp(label) + '\\s*:') })
    .locator('li.value');
}

async function readTokenDetailTokenValue(page) {
  return ((await tokenDetailFieldValue(page, 'Token').innerText()) || '').trim();
}

// --- 只读视角导航与就绪 ------------------------------------------------------

/**
 * 只读视角进入用户管理页。
 * 不走 ensureSessionHealthy / handleUrlInvalidAlert / gotoUserManagementPage——
 * 它们会以 conf.json 的 admin 凭证重登并回写 auth.json，把只读态换回管理员态
 * （见 utils/readonly.js 文件头约束 2）。
 */
async function gotoUserManagementPageReadonly(page) {
  const readonly = readonlyUtils();
  await readonly.gotoAsReadonly(page, USER_MANAGEMENT_PATH, {
    ready: userManagementBreadcrumb(page),
  });
  await expectUserManagementPageReadyReadonly(page);
  await readonly.expectStillReadonly(page);
}

/**
 * 只读视角就绪判定：不使用只读态下被 v-has 隐藏的「添加用户」按钮，
 * 只用只读也存在的锚点：面包屑标题 + Tab + 用户表。
 */
async function expectUserManagementPageReadyReadonly(page) {
  await expect(userManagementBreadcrumb(page)).toBeVisible({ timeout: 15000 });
  await userManagementTabs(page).expectTabsVisible('用户', 'Token');
  await expect(pageTable(page).rootLocator()).toBeVisible({ timeout: 15000 });
  await pageTable(page).waitForLoaded(15000);
}

/** 只读视角切到 Token Tab（不能复用 switchToTokenTab：它等「创建」按钮可见） */
async function switchToTokenTabReadonly(page) {
  if (await isTabActive(page, 'Token')) {
    return;
  }
  await userManagementTabs(page).clickTabByText('Token');
  await expect(tokenTabAlert(page)).toBeVisible({ timeout: 10000 });
  await waitForTokenTableReady(page);
}

/** 只读视角切回用户 Tab */
async function switchToUserTabReadonly(page) {
  if (await isTabActive(page, '用户')) {
    return;
  }
  await userManagementTabs(page).clickTabByText('用户');
  await expect(tokenTabAlert(page)).toBeHidden({ timeout: 10000 });
  await expect(pageTable(page).rootLocator()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

// 兼容旧函数名
const clickAddUserBtn = openAddUserDrawer;
const closeAddUserModal = closeAddUserDrawer;
const clickEditPasswordBtn = openEditPasswordDrawer;
const closeEditPasswordModal = closeEditPasswordDrawer;
const click删除UserBtn = clickDeleteUserBtn;
const confirm删除User = confirmDeleteUser;
const cancel删除User = cancelDeleteUser;
const clickAddTokenBtn = openCreateTokenDrawer;
const fillAddTokenForm = fillCreateTokenForm;
const submitAddTokenForm = submitCreateTokenForm;
const closeAddTokenModal = closeCreateTokenDrawer;
const resetAddTokenForm = resetCreateTokenForm;
const click查看TokenBtn = openTokenDetail;
const confirm删除Token = confirmDeleteToken;
const cancel删除Token = cancelDeleteToken;
const fill登录Form = fillLoginForm;
const submit登录Form = submitLoginForm;
const click注销Btn = openLogoutMenu;
const confirm注销 = confirmLogout;
const cancel注销 = cancelLogout;

module.exports = {
  login,
  logout,
  handleUrlInvalidAlert,
  dismissAuthAlertModal,
  ensureLoggedIn,
  refreshAuthSession,
  persistAuthState,
  navigateToUserManagement,
  expectUserManagementLayout,
  paginationLocator,
  pageTable,
  loginAndNavigate,
  gotoUserManagementPage,
  gotoTokenManagementPage,
  ensureOnUserManagementPage: gotoUserManagementPage,
  ensureOnTokenManagementPage: gotoTokenManagementPage,
  expectUserManagementTabs,
  expectUserManagementPageTitle,
  switchToTokenTab,
  switchToUserTab,
  getDocPassword,
  DOC_USER,
  ROLE_LABEL,
  ROLE_OPTIONS,
  USER_MANAGEMENT_PATH,
  USER_COLUMN_INDEX,
  TOKEN_COLUMN_INDEX,
  generateTestUsername,
  generateTestPassword,
  generateTestTokenName,
  addUserViaApi,
  deleteUserViaApi,
  getSessionKeyFromPage,
  searchUser,
  clearSearch,
  locateUserRowByName,
  clickUserRowAction,
  expectUserRowVisibleByName,
  expectUserRowHiddenByName,
  selectRadioOptionExact,
  expectUserVisible,
  expectUserNotVisible,
  openAddUserDrawer,
  expectAddUserDrawerOpen,
  expectEditPasswordDrawerOpen,
  expectEditPasswordDrawerHidden,
  expectEditPasswordOldPasswordField,
  expectAddUserFormFieldValue,
  expectAddUserFormFieldError,
  expectEditPasswordFormFieldError,
  expectAddUserDrawerClosed,
  clickAddUserBtn,
  fillAddUserForm,
  selectUserRole,
  submitAddUserForm,
  closeAddUserDrawer,
  closeAddUserDrawerByX,
  closeAddUserModal,
  resetAddUserForm,
  openEditPasswordDrawer,
  clickEditPasswordBtn,
  fillEditPasswordForm,
  submitEditPasswordForm,
  closeEditPasswordDrawer,
  closeEditPasswordModal,
  clickDeleteUserBtn,
  expectDeleteConfirmModal,
  confirmDeleteUser,
  confirmDeleteUserIfVisible,
  cancelDeleteUser,
  deleteUser,
  click删除UserBtn,
  confirm删除User,
  cancel删除User,
  navigateToTokenManagement,
  openCreateTokenDrawer,
  expectCreateTokenDrawerOpen,
  expectCreateTokenDrawerHidden,
  expectTokenDetailDrawerOpen,
  expectCreateTokenFormFieldValue,
  expectCreateTokenFormFieldError,
  clickAddTokenBtn,
  fillCreateTokenForm,
  fillAddTokenForm,
  submitCreateTokenForm,
  waitForCreateTokenSuccess,
  submitAddTokenForm,
  closeCreateTokenDrawer,
  closeCreateTokenDrawerByX,
  closeAddTokenModal,
  resetCreateTokenForm,
  resetAddTokenForm,
  expectTokenVisible,
  expectTokenNotVisible,
  expectTokenVisibleInAllPages,
  locateTokenRowInAllPages,
  waitForTokenTableReady,
  openTokenDetail,
  closeTokenDetail,
  click查看TokenBtn,
  clickDeleteTokenBtn,
  confirmDeleteToken,
  cancelDeleteToken,
  deleteToken,
  deleteTokenIfExists,
  createUserTestCleanup,
  confirm删除Token,
  cancel删除Token,
  gotoLoginPage,
  expectLoginPageVisible,
  expectLoginPageNoCaptcha,
  fillLoginForm,
  submitLoginForm,
  loginAsUser,
  openUserDropdown,
  openLogoutMenu,
  clickLogoutMenu,
  expectLogoutConfirmModal,
  click注销Btn,
  confirmLogout,
  cancelLogout,
  confirm注销,
  cancel注销,
  changePageSize,
  // 只读管理员视角 / 角色枚举（docs/user-management/02-功能测试用例/10-角色与只读视角.md）
  gotoUserManagementPageReadonly,
  expectUserManagementPageReadyReadonly,
  switchToTokenTabReadonly,
  switchToUserTabReadonly,
  userManagementBreadcrumb,
  userManagementTabPane,
  tabAddButton,
  tokenTabAlert,
  userRow,
  userCell,
  userRoleCell,
  userActionCell,
  userRowActionButton,
  userChangeRoleButton,
  userChangePasswordButton,
  userRowDeleteButton,
  expectUserTableHasRoleColumn,
  expectUserRoleCellText,
  readRenderedUserRoles,
  countRenderedUserRows,
  waitForUserTableRows,
  ensureUserRowVisible,
  clearUserColumnFilter,
  roleFilterSelect,
  roleFilterDisplay,
  roleFilterPlaceholder,
  roleFilterSelectedValue,
  roleFilterValueInput,
  expectRoleFilterVisible,
  roleFilterOptions,
  roleFilterItem,
  openRoleFilter,
  expectRoleFilterOptions,
  selectRoleFilter,
  clearRoleFilter,
  expectRoleFilterCleared,
  messageToast,
  expectErrorMessage,
  changeRoleDrawer,
  changeRoleForm,
  changeRoleRadioGroup,
  changeRoleRadio,
  changeRoleFixedTip,
  changeRoleSubmitButton,
  openChangeRoleDrawer,
  closeChangeRoleDrawer,
  selectChangeRole,
  submitChangeRole,
  expectChangeRoleDrawerClosed,
  expectChangeRoleOptions,
  expectChangeRoleChecked,
  addUserRoleFormItem,
  addUserRoleRadio,
  expectAddUserRoleRequired,
  expectAddUserRoleOptions,
  expectAddUserRoleChecked,
  selectAddUserRole,
  locateTokenRowByName,
  expectTokenRowLocated,
  tokenCell,
  tokenRowActionButton,
  tokenDetailButton,
  tokenDeleteButton,
  tokenDetailDrawer,
  tokenDetailFieldValue,
  readTokenDetailTokenValue,
  // 接口辅助（只读视角对照 / 掩码断言；以页面登录态直接调 OpenAPI）
  readSessionKeyFromPage,
  fetchUsersViaApi,
  fetchUserViaApi,
  patchUserRoleViaApi,
  createTokenViaApi,
  fetchTokenViaApi,
  deleteTokenViaApi,
};
