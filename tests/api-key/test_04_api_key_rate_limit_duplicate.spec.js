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
const { test } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');

const DOC = utils.DOC_API_KEY;

async function prepareApiKeyRateLimitTest(page) {
  const description = DOC.createSuccess.description + '_dup_' + Date.now();
  await utils.gotoApiKeyManagementPage(page);
  await utils.waitForApiKeyManagementShell(page);
  await utils.waitForPageSettled(page, 500);
  await utils.openAddApiKeyDrawer(page);
  await utils.setupApiKeyCreateWithRateLimit(page, description);
  return description;
}

test.describe('API-Key管理 - EM-K-49 TPM组合重复校验', () => {
  test('验证相同 TPM 组合被拦截', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'TPM', {
      name: 'tpm_dup_1',
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.addApiKeyRateLimitRule(page, 'TPM', {
      name: 'tpm_dup_2',
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      DOC.tpmCombinationDuplicateMsg,
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-50 规则名称长度校验', () => {
  test('验证规则名称超过 128 字符被拦截，短名称合法', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'TPM', {
      name: 'a'.repeat(129),
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      DOC.ruleNameLengthErrorMsg,
    );
    await utils.cancelApiKeyForm(page);

    const description = DOC.createSuccess.description + '_short_' + Date.now();
    await utils.gotoApiKeyManagementPage(page);
    await utils.openAddApiKeyDrawer(page);
    await utils.setupApiKeyCreateWithRateLimit(page, description);
    await utils.addApiKeyRateLimitRule(page, 'RPM', {
      name: 'b',
      window: 1,
      maxRequests: 100,
    });
    await utils.selectApiKeyMaxConcurrencyOption(page, 50);
    await utils.submitApiKeyFormAndWaitForSuccess(page);
    await utils.searchApiKeyByDescription(page, description);
    await utils.expectApiKeyVisible(page, description);
    await utils.deleteApiKeyAndWait(page, description);
  });
});

test.describe('API-Key管理 - EM-K-51 RPM组合重复校验', () => {
  test('验证相同 RPM 组合被拦截', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'RPM', {
      name: 'rpm_dup_1',
      window: 1,
      maxRequests: 100,
    });
    await utils.addApiKeyRateLimitRule(page, 'RPM', {
      name: 'rpm_dup_2',
      window: 1,
      maxRequests: 100,
    });
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      DOC.rpmCombinationDuplicateMsg,
    );
    await utils.cancelApiKeyForm(page);
  });
});
