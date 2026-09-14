/**
 * 证书管理 - 全链路（CM-J-01）
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/cert/test_07_cert_journey.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');

test.describe.configure({ mode: 'serial' });

test.describe('证书管理 - CM-J-01 证书全链路 @journey', () => {
  let certA;
  let certB;

  test('@journey 添加→切换默认→删除', async ({ page }) => {
    await test.step('0. 清理环境', async () => {
      await utils.gotoCertPage(page);
      await utils.deleteAllCertsViaApi(page);
    });

    await test.step('1. UI 添加证书 A（设为默认）', async () => {
      certA = utils.generateTestCertName('journey_a');
      await utils.createCertViaUi(page, {
        certName: certA,
        description: 'journey cert A',
        isDefault: true,
      });
      await utils.expectGlobalDefaultCert(page, certA);
    });

    await test.step('2. UI 添加证书 B（非默认）', async () => {
      certB = utils.generateTestCertName('journey_b');
      await utils.createCertViaUi(page, {
        certName: certB,
        description: 'journey cert B',
        certFile: 'qa_auto_test_r_san_example.org.crt',
        keyFile: 'qa_auto_test_r_san_example.org_prv.pem',
        isDefault: false,
      });
      await utils.ensureCertRowVisible(page, certB);
    });

    await test.step('3. 切换默认证书为 B', async () => {
      await utils.switchGlobalDefaultCert(page, certB);
      await utils.expectGlobalDefaultCert(page, certB);
      await utils.expectDefaultCertTag(page, certA, false);
    });

    await test.step('4. 删除证书 A', async () => {
      await utils.deleteCert(page, certA);
      await utils.confirmDeleteCert(page);
      await expect(utils.certTable(page).rowByText(certA)).toHaveCount(0);
    });

    await test.step('5. 验证最终默认证书为 B', async () => {
      await utils.expectGlobalDefaultCert(page, certB);
      await utils.expectDefaultCertTag(page, certB, true);
    });

    await test.step('6. 清理环境', async () => {
      await utils.deleteAllCertsViaApi(page);
    });
  });
});
