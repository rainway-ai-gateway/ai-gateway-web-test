/**
 * 证书管理 - 表单校验（CM-C-03~CM-C-07、CM-C-05 过期时间预览）
 */
const { test } = require('@playwright/test');
const utils = require('../../pages/cert/CertPage');

const DOC = utils.DOC_CERT;

test.describe('证书管理 - CM-C-03 证书名称必填', () => {
  test('@smoke @regression 验证证书名称为空时提交被拦截', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);

    await utils.fillCertDescription(page, 'test description');
    await utils.uploadCertFile(page, utils.getCertFilePath(utils.DEFAULT_CERT_FILE));
    await utils.uploadKeyFile(page, utils.getCertFilePath(utils.DEFAULT_KEY_FILE));
    await utils.checkIsDefault(page, true);

    await utils.submitCertForm(page);
    await utils.waitAfterResourceMutation(page, 1000);
    await utils.expectCertFormFieldError(page, '证书名称', DOC.certNameRequiredMsg);
    await utils.closeCertDrawer(page);
  });
});

test.describe('证书管理 - CM-C-04 描述必填', () => {
  test('@smoke @regression 验证描述为空时提交被拦截', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);

    await utils.fillCertName(page, 'test_cert_' + Date.now());
    await utils.uploadCertFile(page, utils.getCertFilePath(utils.DEFAULT_CERT_FILE));
    await utils.uploadKeyFile(page, utils.getCertFilePath(utils.DEFAULT_KEY_FILE));
    await utils.checkIsDefault(page, true);

    await utils.submitCertForm(page);
    await utils.waitAfterResourceMutation(page, 1000);
    await utils.expectCertFormFieldError(page, '描述', DOC.descriptionRequiredMsg);
    await utils.closeCertDrawer(page);
  });
});

test.describe('证书管理 - CM-C-05 上传证书后展示过期时间预览', () => {
  test('@regression 验证上传证书后自动解析过期时间', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);

    await utils.expectExpiredDatePreview(page, DOC.expiredDatePending);
    await utils.uploadCertFile(page, utils.getCertFilePath(utils.DEFAULT_CERT_FILE));
    await utils.expectExpiredDatePreview(page, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

    await utils.closeCertDrawer(page);
  });
});

test.describe('证书管理 - CM-C-06 证书文件必填', () => {
  test('@smoke @regression 验证证书文件未上传时提交被拦截', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);

    await utils.fillCertName(page, 'test_cert_' + Date.now());
    await utils.fillCertDescription(page, 'test description');
    await utils.uploadKeyFile(page, utils.getCertFilePath(utils.DEFAULT_KEY_FILE));
    await utils.checkIsDefault(page, true);

    await utils.submitCertForm(page);
    await utils.waitAfterResourceMutation(page, 1000);
    await utils.expectCertFormFieldError(page, '证书文件', DOC.certFileRequiredMsg);
    await utils.closeCertDrawer(page);
  });
});

test.describe('证书管理 - CM-C-07 私钥文件必填', () => {
  test('@smoke @regression 验证私钥文件未上传时提交被拦截', async ({ page }) => {
    await utils.gotoCertPage(page);
    await utils.openAddCertDrawer(page);

    await utils.fillCertName(page, 'test_cert_' + Date.now());
    await utils.fillCertDescription(page, 'test description');
    await utils.uploadCertFile(page, utils.getCertFilePath(utils.DEFAULT_CERT_FILE));
    await utils.checkIsDefault(page, true);

    await utils.submitCertForm(page);
    await utils.waitAfterResourceMutation(page, 1000);
    await utils.expectCertFormFieldError(page, '私钥文件', DOC.keyFileRequiredMsg);
    await utils.closeCertDrawer(page);
  });
});
