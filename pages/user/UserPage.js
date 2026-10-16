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
};
const DRAWER_TITLE = {
  addUser: '添加用户',
  editPassword: '修改密码',
  tokenDetail: '详情',
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
};
