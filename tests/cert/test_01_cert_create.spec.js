/**
 * 证书管理 - 添加证书（CM-C-01、CM-C-02）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');
const apiUtils = require('../../api/cert-api-utils');

const DOC = utils.DOC_CERT;
const TEST_CERT_FILE = 'qa_auto_test_r_san_example.org.crt';
const TEST_KEY_FILE = 'qa_auto_test_r_san_example.org_prv.pem';

test.describe('证书管理 - CM-C-01 进入证书管理页面', () => {
  test('@regression 验证页面布局', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.expectCertPageLayout(page);
  });
});

test.describe('证书管理 - CM-C-02 添加证书成功', () => {
  const cleanup = utils.createCertTestCleanup();
  let certName;

  test.beforeEach(async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.deleteAllCertsViaApi(page);
    await utils.waitAfterResourceMutation(page, 2000);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@smoke @regression 验证 API 造数后列表展示', async ({ page }) => {
    await test.step('1. 进入证书管理页面', async () => {
      await utils.gotoCertPage(page);
      await utils.expectCertPageLayout(page);
    });

    await test.step('2. 通过 API 创建非默认证书', async () => {
      certName = utils.generateTestCertName();
      cleanup.trackCertName(certName);
      const payload = utils.buildCertApiPayload(
        certName,
        false,
        TEST_CERT_FILE,
        TEST_KEY_FILE,
      );
      expect(await apiUtils.createCert(page, payload)).toBe(true);
    });

    await test.step('3. 验证证书出现在列表中', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await utils.waitAfterResourceMutation(page, 2000);
      await utils.ensureCertRowVisible(page, certName);

      const detail = await apiUtils.getCertDetail(page, certName);
      const row = utils.certTable(page).rowByText(certName);
      await expect(row).toContainText(detail.expired_date);
    });

    await test.step('4. 验证全局缺省证书下拉仍显示默认证书', async () => {
      const certs = await apiUtils.getCertList(page);
      const defaultCert = certs.find((c) => c.is_default === true);
      expect(defaultCert).toBeTruthy();
      await utils.expectGlobalDefaultCert(page, defaultCert.cert_name);
    });
  });

  test('@regression 验证 UI 添加证书成功', async ({ page }) => {
    certName = utils.generateTestCertName('ui');
    cleanup.trackCertName(certName);

    await utils.gotoCertPage(page);
    await utils.createCertViaUi(page, {
      certName,
      description: 'ui create cert',
      certFile: TEST_CERT_FILE,
      keyFile: TEST_KEY_FILE,
      isDefault: false,
    });

    await utils.ensureCertRowVisible(page, certName);
    await utils.expectCertDrawerHidden(page);
  });
});
