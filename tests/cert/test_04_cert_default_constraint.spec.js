/**
 * 证书管理 - 默认证书约束（CM-C-09）
 */
const { test } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');

test.describe('证书管理 - CM-C-09 已有默认证书时新增可不勾选设为默认', () => {
  test('@regression 验证设为默认复选框可编辑', async ({ page }) => {
    await utils.ensureDefaultCertExists(page);
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);
    await utils.expectIsDefaultCheckboxState(page, { checked: false, disabled: false });
    await utils.closeCertDrawer(page);
  });
});
