/**
 * 证书管理 - 删除（CM-C-12~CM-C-14）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');

test.describe('证书管理 - CM-C-12 删除非默认证书', () => {
  const cleanup = utils.createCertTestCleanup();
  let certName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@smoke @regression 验证删除非默认证书成功', async ({ page }) => {
    await test.step('前置：创建默认证书和待删除证书', async () => {
      await utils.ensureDefaultCertExists(page);
      certName = utils.generateTestCertName('delete');
      cleanup.trackCertName(certName);
      await utils.createCertViaApi(
        page,
        certName,
        false,
        'qa_auto_test_r_san_example.org.crt',
        'qa_auto_test_r_san_example.org_prv.pem',
      );
    });

    await test.step('1. 进入证书管理页面', async () => {
      await utils.gotoCertPage(page);
      await utils.expectCertPageLayout(page);
    });

    await test.step('2. 删除非默认证书', async () => {
      await utils.ensureCertRowVisible(page, certName);
      await utils.deleteCert(page, certName);
      await utils.expectDeleteConfirmModal(page, certName);
      await utils.confirmDeleteCert(page);
    });

    await test.step('3. 验证证书已从列表移除', async () => {
      await utils.gotoCertPage(page);
      await expect(utils.certTable(page).rowByText(certName)).toHaveCount(0);
    });
  });
});

test.describe('证书管理 - CM-C-13 删除默认证书约束', () => {
  const cleanup = utils.createCertTestCleanup();
  let defaultCertName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@smoke @regression 验证默认证书删除按钮禁用', async ({ page }) => {
    defaultCertName = await utils.ensureDefaultCertExists(page);

    await utils.gotoCertPage(page);
    await utils.ensureCertRowVisible(page, defaultCertName);
    await utils.expectDefaultCertDeleteDisabled(page, defaultCertName);
    await utils.expectDefaultCertTag(page, defaultCertName, true);
  });
});

test.describe('证书管理 - CM-C-14 删除确认弹窗', () => {
  const cleanup = utils.createCertTestCleanup();
  let certName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证取消删除不生效', async ({ page }) => {
    await utils.ensureDefaultCertExists(page);
    certName = utils.generateTestCertName('cancel');
    cleanup.trackCertName(certName);
    await utils.createCertViaApi(
      page,
      certName,
      false,
      'qa_auto_test_r_san_example.org.crt',
      'qa_auto_test_r_san_example.org_prv.pem',
    );

    await utils.gotoCertPage(page);
    await utils.ensureCertRowVisible(page, certName);
    await utils.deleteCert(page, certName);
    await utils.expectDeleteConfirmModal(page, certName);
    await utils.cancelDeleteCert(page);
    await utils.ensureCertRowVisible(page, certName);
  });
});
