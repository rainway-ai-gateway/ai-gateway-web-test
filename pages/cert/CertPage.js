/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 */
'use strict';

const { expect, test } = require('@playwright/test');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/cert-api-utils');
const {
  AppSidebarComponent,
  LayoutShellComponent,
  PageTableComponent,
} = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuMessageComponent,
  IvuModalComponent,
} = require('../../components/iview');

const CONF_PATH = path.join(__dirname, '../../conf.json');
const AUTH_PATH = path.join(__dirname, '../../auth.json');
const TEST_FILES_DIR = path.join(__dirname, '../../test-files/cert');
const CERT_ROUTE = '/cert';

const DRAWER_TITLE = {
  addCert: '添加证书',
};

const SEARCH_PLACEHOLDER = {
  certName: '请输入证书名称查询',
  expiredTime: '请输入过期时间查询',
};

const TABLE_HEADERS = ['证书名称', '设为默认', '过期时间', '操作'];

/** 验收文案对齐当前 UI i18n */
const DOC_CERT = {
  pageTitle: '证书管理',
  addCertButton: '添加证书',
  submitButton: '提交',
  resetButton: '重置',
  deleteButton: '删除',
  confirmButton: '确定',
  cancelButton: '取消',
  submitSuccessToast: '证书添加成功!',
  deleteSuccessToast: '删除成功!',
  certNameRequiredMsg: '请输入证书名称',
  descriptionRequiredMsg: '请输入描述',
  certFileRequiredMsg: '请上传证书文件',
  keyFileRequiredMsg: '请上传私钥文件',
  expiredDatePending: '上传证书文件后自动解析',
  cannotDeleteDefaultTooltip: '默认证书不可删除',
  duplicateNameErrorPattern: /已存在|Record Existed/i,
  deleteConfirmText: '是否删除证书',
  globalDefaultCertLabel: '全局缺省证书',
  isDefaultLabel: '设为默认',
  defaultCertTag: '全局缺省证书',
  switchDefaultConfirmPrefix: '是否将证书',
  switchDefaultConfirmSuffix: '设置为默认',
};

const DEFAULT_CERT_FILE = 'qa_auto_test_bfe_i_bfe.crt';
const DEFAULT_KEY_FILE = 'qa_auto_test_bfe_i_bfe_prv.pem';

let testNameSequence = 0;

function nextTestNameSequence() {
  testNameSequence += 1;
  return testNameSequence;
}

let confInfo = {};
try {
  confInfo = JSON.parse(fs.readFileSync(CONF_PATH, 'utf-8'));
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

function ivuModal(page) {
  return new IvuModalComponent(page);
}

function certTable(page) {
  return new PageTableComponent(page);
}

function getAppBaseUrl() {
  return confInfo['ctlHost'].replace('/login', '');
}

function isConnectionError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('net::ERR')
  );
}

async function ensureChineseLang(page) {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'zh');
  });
  await page.evaluate(() => localStorage.setItem('lang', 'zh')).catch(() => {});
}

async function waitAfterResourceMutation(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

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

async function gotoCertUrl(page) {
  const url = getAppBaseUrl() + CERT_ROUTE;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ensureLocalStorageSession(page);
  await umUtils.handleUrlInvalidAlert(page);
}

async function expectCertPageReady(page) {
  await expect(page.url()).toContain(CERT_ROUTE);
  await expect(
    page.getByRole('button', { name: DOC_CERT.addCertButton }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

async function ensureAuthenticatedShell(page) {
  await umUtils.handleUrlInvalidAlert(page);

  const currentUrl = page.url();
  const isAppPage = currentUrl.includes(CERT_ROUTE);
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在证书页，先加载: ' + page.url());
    await ensureChineseLang(page);
    await gotoCertUrl(page);
    await page.waitForTimeout(1000);
    await umUtils.handleUrlInvalidAlert(page);
  }
}

async function ensureAppSession(page) {
  if (common.isServiceDown()) {
    test.skip(true, '服务不可用，跳过所有测试用例');
  }

  try {
    await ensureChineseLang(page);
    await umUtils.handleUrlInvalidAlert(page);
    await umUtils.ensureLoggedIn(page);
    await ensureAuthenticatedShell(page);
  } catch (e) {
    if (isConnectionError(e)) {
      common.setServiceDown(true);
      test.skip(true, '服务连接失败: ' + e.message);
    }
    throw e;
  }
}

async function navigateBySidebar(page, labels) {
  const sidebar = new AppSidebarComponent(page);
  for (const label of labels) {
    const hasMenuItem = (await sidebar.menuItem(label).count()) > 0;
    const hasSubmenu = (await sidebar.submenuTitle(label).count()) > 0;
    if (hasMenuItem || hasSubmenu) {
      common.log('通过侧栏导航：' + label);
      await sidebar.navigate(label);
      await umUtils.handleUrlInvalidAlert(page);
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

async function isCertPageReady(page) {
  if (!page.url().includes(CERT_ROUTE)) {
    return false;
  }
  return page
    .getByRole('button', { name: DOC_CERT.addCertButton })
    .isVisible()
    .catch(() => false);
}

async function gotoCertPage(page) {
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

  if (await isCertPageReady(page)) {
    common.log('已在证书管理页面，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  await ensureAppSession(page);

  const navigated = await navigateBySidebar(page, ['证书管理', 'Certificate']);
  if (!navigated) {
    common.log('使用直连 URL 进入证书管理页面');
    await ensureChineseLang(page);
    await gotoCertUrl(page);
  }

  await expectCertPageReady(page);
}

async function expectCertPageLayout(page) {
  await expectCertPageReady(page);
  await new LayoutShellComponent(page).expectLoaded();
  await expect(page.locator('.cert-isdefult')).toContainText(
    DOC_CERT.globalDefaultCertLabel,
  );
  await certTable(page).expectHeaders(...TABLE_HEADERS);
  await certTable(page).expectPaginationVisible();
}

function drawerBody(page) {
  return ivuDrawer(page).withTitle(DRAWER_TITLE.addCert).locator('.ivu-drawer-body');
}

async function openAddCertDrawer(page) {
  await page.getByRole('button', { name: DOC_CERT.addCertButton }).click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.addCert);
  await waitAfterResourceMutation(page, 500);
}

async function closeCertDrawer(page, drawerTitle = DRAWER_TITLE.addCert) {
  await ivuDrawer(page).closeByX(drawerTitle);
  await expect(ivuDrawer(page).withTitle(drawerTitle)).toBeHidden();
}

async function fillCertName(page, name) {
  await ivuDrawer(page).form(DRAWER_TITLE.addCert).fillInput('证书名称', name);
}

async function fillCertDescription(page, description) {
  await ivuDrawer(page)
    .form(DRAWER_TITLE.addCert)
    .fillTextarea('描述', description);
}

async function uploadCertFile(page, filePath) {
  const certFormItem = drawerBody(page)
    .locator('.ivu-form-item')
    .filter({ hasText: '证书文件' });
  await certFormItem.locator('input[type="file"]').setInputFiles(filePath);
  await waitAfterResourceMutation(page, 800);
}

async function uploadKeyFile(page, filePath) {
  const keyFormItem = drawerBody(page)
    .locator('.ivu-form-item')
    .filter({ hasText: '私钥文件' });
  await keyFormItem.locator('input[type="file"]').setInputFiles(filePath);
  await waitAfterResourceMutation(page, 500);
}

async function expectExpiredDatePreview(page, text) {
  const expiredItem = drawerBody(page)
    .locator('.ivu-form-item')
    .filter({ hasText: '过期时间' });
  if (text instanceof RegExp) {
    await expect(expiredItem).toHaveText(text);
  } else {
    await expect(expiredItem).toContainText(text);
  }
}

async function checkIsDefault(page, checked = true) {
  const checkbox = drawerBody(page)
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_CERT.isDefaultLabel })
    .locator('.ivu-checkbox-wrapper');
  const isChecked =
    (await checkbox.locator('.ivu-checkbox-checked').count()) > 0;
  if (checked !== isChecked) {
    await checkbox.click();
    await waitAfterResourceMutation(page, 300);
  }
}

async function expectIsDefaultCheckboxState(page, { checked, disabled }) {
  const formItem = drawerBody(page)
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_CERT.isDefaultLabel });
  const checkbox = formItem.locator('.ivu-checkbox-wrapper');
  if (checked) {
    await expect(checkbox.locator('.ivu-checkbox-checked')).toHaveCount(1);
  } else {
    await expect(checkbox.locator('.ivu-checkbox-checked')).toHaveCount(0);
  }
  if (disabled) {
    await expect(formItem.locator('.ivu-checkbox-disabled')).toHaveCount(1);
  } else {
    await expect(formItem.locator('.ivu-checkbox-disabled')).toHaveCount(0);
  }
}

async function submitCertForm(page) {
  await page.getByRole('button', { name: DOC_CERT.submitButton }).click();
}

async function resetCertForm(page) {
  await page.getByRole('button', { name: DOC_CERT.resetButton }).click();
  await waitAfterResourceMutation(page, 500);
}

function certDrawerForm(page) {
  return ivuDrawer(page).form(DRAWER_TITLE.addCert);
}

async function expectCertNameValue(page, value) {
  await expect(certDrawerForm(page).input('证书名称')).toHaveValue(value);
}

async function expectCertDescriptionValue(page, value) {
  await expect(certDrawerForm(page).textarea('描述')).toHaveValue(value);
}

async function expectCertFormReset(page) {
  await expectCertNameValue(page, '');
  await expectCertDescriptionValue(page, '');
  await expectExpiredDatePreview(page, DOC_CERT.expiredDatePending);
  const formItems = drawerBody(page).locator('.ivu-form-item');
  await expect(formItems.nth(2)).not.toContainText(DEFAULT_CERT_FILE);
  await expect(formItems.nth(3)).not.toContainText(DEFAULT_KEY_FILE);
}

async function expectCertDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.addCert);
}

async function expectCertCreateDuplicateError(page) {
  const notice = new IvuMessageComponent(page).errorNotice();
  await expect(
    notice.filter({ hasText: DOC_CERT.duplicateNameErrorPattern }).first(),
  ).toBeVisible({ timeout: 10000 });
}

async function countCertRows(page, certName) {
  return certTable(page).rowByText(certName).count();
}

async function submitCertFormAndWaitResponse(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/certificates') &&
        res.request().method() === 'POST',
      { timeout: 15000 },
    ),
    submitCertForm(page),
  ]);
  return response;
}

async function fillCertFormForSubmit(page, options = {}) {
  const {
    certName,
    description = 'auto test cert',
    certFile = DEFAULT_CERT_FILE,
    keyFile = DEFAULT_KEY_FILE,
    isDefault = false,
  } = options;
  await fillCertName(page, certName);
  await fillCertDescription(page, description);
  await uploadCertFile(page, getCertFilePath(certFile));
  await uploadKeyFile(page, getCertFilePath(keyFile));
  if (isDefault) {
    await checkIsDefault(page, true);
  }
}

async function waitForCertListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/certificates') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    if (e.message.includes('Timeout')) {
      await action();
      await waitAfterResourceMutation(page, 2000);
      return null;
    }
    throw e;
  }
}

async function submitCertAndWaitForSuccess(page) {
  await new IvuMessageComponent(page).waitForTextDuringAction(
    DOC_CERT.submitSuccessToast,
    () => waitForCertListResponse(page, () => submitCertForm(page)),
    15000,
  );
  await waitAfterResourceMutation(page, 3000);
}

async function createCertViaUi(page, options = {}) {
  const {
    certName = generateTestCertName(),
    description = 'auto test cert',
    certFile = DEFAULT_CERT_FILE,
    keyFile = DEFAULT_KEY_FILE,
    isDefault = false,
  } = options;

  await openAddCertDrawer(page);
  await fillCertName(page, certName);
  await fillCertDescription(page, description);
  await uploadCertFile(page, getCertFilePath(certFile));
  await uploadKeyFile(page, getCertFilePath(keyFile));
  if (isDefault) {
    await checkIsDefault(page, true);
  }
  await submitCertAndWaitForSuccess(page);
  return certName;
}

async function expectCertFormFieldError(page, fieldLabel, message) {
  const drawer = ivuDrawer(page).active();
  const formItem = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: fieldLabel });
  await expect(formItem.locator('.ivu-form-item-error-tip')).toContainText(
    message,
  );
}

async function expectCertDrawerHidden(
  page,
  drawerTitle = DRAWER_TITLE.addCert,
) {
  await expect(ivuDrawer(page).withTitle(drawerTitle)).toBeHidden();
}

async function deleteCert(page, certName) {
  await certTable(page).rowAction(certName, DOC_CERT.deleteButton).click();
}

async function confirmDeleteCert(page) {
  const modal = page.locator('.ivu-modal-wrap');
  await expect(modal).toBeVisible({ timeout: 5000 });
  await modal.getByRole('button', { name: DOC_CERT.confirmButton }).click();
  await expect(modal).toBeHidden({ timeout: 10000 });
  await waitAfterResourceMutation(page, 3000);
}

async function cancelDeleteCert(page) {
  const modal = page.locator('.ivu-modal-wrap');
  await expect(modal).toBeVisible({ timeout: 5000 });
  await modal.getByRole('button', { name: DOC_CERT.cancelButton }).click();
  await expect(modal).toBeHidden({ timeout: 5000 });
}

async function expectDeleteConfirmModal(page, certName) {
  const modal = page.locator('.ivu-modal-wrap');
  await expect(modal).toBeVisible({ timeout: 5000 });
  await expect(modal).toContainText(DOC_CERT.deleteConfirmText + certName);
}

async function expectDefaultCertDeleteDisabled(page, certName) {
  const deleteBtn = certTable(page)
    .rowByText(certName)
    .getByRole('button', { name: DOC_CERT.deleteButton });
  await expect(deleteBtn).toBeDisabled();
  await deleteBtn.hover({ force: true });
  await expect(
    page.getByText(DOC_CERT.cannotDeleteDefaultTooltip),
  ).toBeVisible({ timeout: 5000 });
}

async function expectDefaultCertTag(page, certName, visible = true) {
  const row = certTable(page).rowByText(certName);
  const tag = row.getByText(DOC_CERT.defaultCertTag, { exact: true });
  if (visible) {
    await expect(tag).toBeVisible();
  } else {
    await expect(tag).toHaveCount(0);
  }
}

async function selectGlobalDefaultCert(page, certName) {
  const defaultSelect = page.locator('.ivu-select-selection').first();
  await defaultSelect.click();
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .getByText(certName, { exact: true })
    .click();
  await waitAfterResourceMutation(page, 500);
}

async function confirmSwitchDefaultCert(page, certName) {
  const modal = page.locator('.ivu-modal-wrap');
  await expect(modal).toBeVisible({ timeout: 5000 });
  await expect(modal).toContainText(
    DOC_CERT.switchDefaultConfirmPrefix + certName + DOC_CERT.switchDefaultConfirmSuffix,
  );
  await modal.getByRole('button', { name: DOC_CERT.confirmButton }).click();
  await waitAfterResourceMutation(page, 2000);
}

async function switchGlobalDefaultCert(page, certName) {
  await selectGlobalDefaultCert(page, certName);
  await confirmSwitchDefaultCert(page, certName);
}

async function expectGlobalDefaultCert(page, certName) {
  const defaultSelect = page.locator('.ivu-select-selection').first();
  await expect(defaultSelect).toContainText(certName);
}

async function searchCertByName(page, keyword) {
  await certTable(page).search(keyword, SEARCH_PLACEHOLDER.certName);
}

async function searchCertByExpiredDate(page, keyword) {
  await certTable(page).search(keyword, SEARCH_PLACEHOLDER.expiredTime);
}

async function searchCertAndWait(page, keyword) {
  await searchCertByName(page, keyword);
  await waitAfterResourceMutation(page, 500);
}

async function expectCertVisibleInAllPages(page, certName, timeout = 30000) {
  const table = certTable(page);
  try {
    await table.expectRowVisible(certName, timeout);
    return;
  } catch (e) {
    common.log('第一页未找到证书，尝试翻页查找...');
  }

  const pagination = table.pagination();
  const pageCount = await pagination.getByRole('listitem').count();

  for (let i = 2; i <= pageCount; i++) {
    await table.clickPageNumber(i);
    await waitAfterResourceMutation(page, 500);
    try {
      await table.expectRowVisible(certName, timeout);
      return;
    } catch (err) {
      common.log('第' + i + '页未找到证书');
    }
  }

  throw new Error('在所有页面中未找到证书: ' + certName);
}

async function ensureCertRowVisible(page, certName) {
  await searchCertAndWait(page, certName);
  await expectCertVisibleInAllPages(page, certName);
}

function generateTestCertName(prefix) {
  const tag = prefix ? prefix + '_' : '';
  return (
    'cert_' +
    tag +
    moment().format('YYYYMMDDHHmmssSSS') +
    '_' +
    nextTestNameSequence()
  );
}

function getCertFilePath(filename) {
  return path.join(TEST_FILES_DIR, filename);
}

function buildCertApiPayload(certName, isDefault, certFile, keyFile, description) {
  return {
    cert_name: certName,
    description: description || 'auto test cert',
    is_default: isDefault,
    cert_file_content: apiUtils.readCertFileContent(certFile),
    key_file_content: apiUtils.readCertFileContent(keyFile),
  };
}

async function createCertViaApi(
  page,
  certName,
  isDefault = false,
  certFile,
  keyFile,
  description,
) {
  const cf = certFile || DEFAULT_CERT_FILE;
  const kf = keyFile || DEFAULT_KEY_FILE;
  const payload = buildCertApiPayload(certName, isDefault, cf, kf, description);
  const success = await apiUtils.createCert(page, payload);
  if (success) {
    await waitAfterResourceMutation(page, 2000);
    return certName;
  }
  return null;
}

async function ensureDefaultCertExists(page) {
  const certs = await apiUtils.getCertList(page);
  if (Array.isArray(certs) && certs.length > 0) {
    const defaultCert = certs.find((c) => c.is_default === true);
    if (defaultCert) {
      return defaultCert.cert_name;
    }
    await apiUtils.setDefaultCert(page, certs[0].cert_name);
    await waitAfterResourceMutation(page, 1000);
    return certs[0].cert_name;
  }
  const certName = generateTestCertName('default');
  await createCertViaApi(page, certName, true);
  return certName;
}

async function deleteAllCertsViaApi(page) {
  const certs = await apiUtils.getCertList(page);
  if (!Array.isArray(certs) || certs.length === 0) {
    const certName = generateTestCertName('default');
    common.log('无证书，创建默认: ' + certName);
    await createCertViaApi(page, certName, true);
    await waitAfterResourceMutation(page, 1000);
    return;
  }

  const defaultCert = certs.find((c) => c.is_default === true);
  for (const cert of certs) {
    if (cert.cert_name !== defaultCert?.cert_name) {
      common.log('清理非默认证书: ' + cert.cert_name);
      await apiUtils.deleteCert(page, cert.cert_name);
      await waitAfterResourceMutation(page, 500);
    }
  }
}

function createCertTestCleanup() {
  const tracked = { certNames: [] };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    trackCertName(name) {
      pushUnique(tracked.certNames, name);
    },
    async cleanup(page) {
      let defaultName = null;
      try {
        const certs = await apiUtils.getCertList(page);
        if (Array.isArray(certs)) {
          defaultName = certs.find((c) => c.is_default)?.cert_name || null;
        }
      } catch (e) {
        common.log('清理前获取默认证书失败: ' + e.message);
      }

      for (const name of [...tracked.certNames].reverse()) {
        if (name === defaultName) {
          common.log('跳过清理默认证书: ' + name);
          continue;
        }
        common.log('清理证书: ' + name);
        try {
          await apiUtils.deleteCert(page, name);
        } catch (e) {
          common.log('清理证书 ' + name + ' 失败: ' + e.message);
        }
      }
      tracked.certNames = [];
    },
  };
}

module.exports = {
  DRAWER_TITLE,
  SEARCH_PLACEHOLDER,
  DOC_CERT,
  TABLE_HEADERS,
  TEST_FILES_DIR,
  DEFAULT_CERT_FILE,
  DEFAULT_KEY_FILE,
  ivuDrawer,
  ivuModal,
  certTable,
  gotoCertPage,
  expectCertPageLayout,
  openAddCertDrawer,
  closeCertDrawer,
  fillCertName,
  fillCertDescription,
  uploadCertFile,
  uploadKeyFile,
  expectExpiredDatePreview,
  checkIsDefault,
  expectIsDefaultCheckboxState,
  submitCertForm,
  resetCertForm,
  certDrawerForm,
  expectCertNameValue,
  expectCertDescriptionValue,
  expectCertFormReset,
  expectCertDrawerOpen,
  expectCertCreateDuplicateError,
  countCertRows,
  submitCertFormAndWaitResponse,
  fillCertFormForSubmit,
  submitCertAndWaitForSuccess,
  createCertViaUi,
  expectCertFormFieldError,
  expectCertDrawerHidden,
  deleteCert,
  confirmDeleteCert,
  cancelDeleteCert,
  expectDeleteConfirmModal,
  expectDefaultCertDeleteDisabled,
  expectDefaultCertTag,
  selectGlobalDefaultCert,
  confirmSwitchDefaultCert,
  switchGlobalDefaultCert,
  expectGlobalDefaultCert,
  searchCertByName,
  searchCertByExpiredDate,
  searchCertAndWait,
  expectCertVisibleInAllPages,
  ensureCertRowVisible,
  generateTestCertName,
  getCertFilePath,
  buildCertApiPayload,
  createCertViaApi,
  ensureDefaultCertExists,
  deleteAllCertsViaApi,
  createCertTestCleanup,
  waitAfterResourceMutation,
  getCertList: apiUtils.getCertList,
  getCertDetail: apiUtils.getCertDetail,
  createCert: apiUtils.createCert,
  deleteCertApi: apiUtils.deleteCert,
  setDefaultCert: apiUtils.setDefaultCert,
};
