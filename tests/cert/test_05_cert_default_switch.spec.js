/**
 * 证书管理 - 缺省证书切换（CM-C-15~CM-C-17）
 */
const { test } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');

test.describe('证书管理 - CM-C-15 全局缺省证书下拉展示', () => {
  const cleanup = utils.createCertTestCleanup();
  let defaultCertName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证下拉显示当前默认证书', async ({ page }) => {
    defaultCertName = await utils.ensureDefaultCertExists(page);

    await utils.gotoCertPage(page);
    await utils.expectGlobalDefaultCert(page, defaultCertName);
  });
});

test.describe('证书管理 - CM-C-16 切换默认证书', () => {
  const cleanup = utils.createCertTestCleanup();
  let certA;
  let certB;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@smoke @regression 验证切换默认证书成功', async ({ page }) => {
    certA = await utils.ensureDefaultCertExists(page);

    certB = utils.generateTestCertName('switch');
    cleanup.trackCertName(certB);
    await utils.createCertViaApi(
      page,
      certB,
      false,
      'qa_auto_test_r_san_example.org.crt',
      'qa_auto_test_r_san_example.org_prv.pem',
    );

    await utils.gotoCertPage(page);
    await utils.ensureCertRowVisible(page, certB);
    await utils.switchGlobalDefaultCert(page, certB);

    await utils.expectGlobalDefaultCert(page, certB);
    await utils.expectDefaultCertTag(page, certB, true);
    await utils.expectDefaultCertTag(page, certA, false);
  });
});

test.describe('证书管理 - CM-C-17 切换后旧默认证书可删除', () => {
  const cleanup = utils.createCertTestCleanup();
  let certA;
  let certB;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证旧默认证书变为非默认后可删除', async ({ page }) => {
    certA = await utils.ensureDefaultCertExists(page);

    certB = utils.generateTestCertName('newdefault');
    await utils.createCertViaApi(
      page,
      certB,
      false,
      'qa_auto_test_r_san_example.org.crt',
      'qa_auto_test_r_san_example.org_prv.pem',
    );

    await utils.gotoCertPage(page);
    await utils.switchGlobalDefaultCert(page, certB);
    await utils.expectDefaultCertTag(page, certA, false);

    await utils.deleteCert(page, certA);
    await utils.expectDeleteConfirmModal(page, certA);
    await utils.confirmDeleteCert(page);
  });
});
