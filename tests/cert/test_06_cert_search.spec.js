/**
 * 证书管理 - 搜索（CM-C-18、CM-C-19）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');
const apiUtils = require('../../api/cert-api-utils');

test.describe('证书管理 - CM-C-18 按证书名称搜索', () => {
  const cleanup = utils.createCertTestCleanup();
  let certName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证按名称过滤', async ({ page }) => {
    await utils.ensureDefaultCertExists(page);
    certName = utils.generateTestCertName('search');
    cleanup.trackCertName(certName);
    await utils.createCertViaApi(
      page,
      certName,
      false,
      'qa_auto_test_r_san_example.org.crt',
      'qa_auto_test_r_san_example.org_prv.pem',
    );

    await utils.gotoCertPage(page);
    await utils.searchCertAndWait(page, certName);
    await utils.certTable(page).expectRowVisible(certName);
  });
});

test.describe('证书管理 - CM-C-19 按过期时间搜索', () => {
  const cleanup = utils.createCertTestCleanup();
  let certName;

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证按过期时间过滤', async ({ page }) => {
    certName = utils.generateTestCertName('expire');
    cleanup.trackCertName(certName);
    await utils.createCertViaApi(page, certName, true);

    const detail = await apiUtils.getCertDetail(page, certName);
    const keyword = detail.expired_date.slice(0, 10);

    await utils.gotoCertPage(page);
    await utils.searchCertByExpiredDate(page, keyword);
    await utils.certTable(page).expectRowVisible(certName);
    await expect(utils.certTable(page).rowByText(certName)).toContainText(
      detail.expired_date,
    );
  });
});
