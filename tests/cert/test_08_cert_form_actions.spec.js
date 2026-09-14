/**
 * 证书管理 - 名称唯一性 / 重置 / 关闭抽屉（CM-C-08、CM-C-10、CM-C-11）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');

const DOC = utils.DOC_CERT;
const PAIR2_CERT = 'qa_auto_test_r_san_example.org.crt';
const PAIR2_KEY = 'qa_auto_test_r_san_example.org_prv.pem';

test.describe('证书管理 - CM-C-08 证书名称唯一性', () => {
  const cleanup = utils.createCertTestCleanup();
  let existingName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证重复证书名称提交失败', async ({ page }) => {
    existingName = utils.generateTestCertName('dup');
    cleanup.trackCertName(existingName);

    await utils.ensureDefaultCertExists(page);
    await utils.createCertViaApi(page, existingName, false, PAIR2_CERT, PAIR2_KEY);

    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);
    await utils.fillCertFormForSubmit(page, {
      certName: existingName,
      certFile: PAIR2_CERT,
      keyFile: PAIR2_KEY,
      isDefault: false,
    });

    const beforeCount = await utils.countCertRows(page, existingName);
    const response = await utils.submitCertFormAndWaitResponse(page);
    expect(response.status()).not.toBe(200);

    await utils.expectCertCreateDuplicateError(page);
    await utils.expectCertDrawerOpen(page);

    await utils.gotoCertPage(page);
    await utils.searchCertAndWait(page, existingName);
    await expect(await utils.countCertRows(page, existingName)).toBe(beforeCount);
  });
});

test.describe('证书管理 - CM-C-10 重置表单', () => {
  test('@regression 验证重置后表单恢复初始状态且抽屉不关闭', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);

    await utils.fillCertName(page, 'reset_test_cert');
    await utils.fillCertDescription(page, 'reset description');
    await utils.uploadCertFile(page, utils.getCertFilePath(utils.DEFAULT_CERT_FILE));
    await utils.uploadKeyFile(page, utils.getCertFilePath(utils.DEFAULT_KEY_FILE));
    await utils.checkIsDefault(page, true);

    await utils.resetCertForm(page);
    await utils.expectCertFormReset(page);
    await utils.expectCertDrawerOpen(page);
    await utils.closeCertDrawer(page);
  });
});

test.describe('证书管理 - CM-C-11 关闭抽屉', () => {
  test('@regression 验证关闭抽屉不保存数据', async ({ page }) => {
    const draftName = utils.generateTestCertName('draft');

    await utils.gotoCertPage(page);
    const beforeCount = await utils.countCertRows(page, draftName);

    await utils.openAddCertDrawer(page);
    await utils.fillCertName(page, draftName);
    await utils.fillCertDescription(page, 'draft description');
    await utils.closeCertDrawer(page);
    await utils.expectCertDrawerHidden(page);

    await utils.gotoCertPage(page);
    await expect(await utils.countCertRows(page, draftName)).toBe(beforeCount);
  });
});
