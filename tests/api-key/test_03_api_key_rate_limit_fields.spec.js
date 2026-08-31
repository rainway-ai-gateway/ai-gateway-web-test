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

/** n = 出错规则在 TPM/RPM 列表中的序号（从 1 开始） */
function ruleMsg(template, index) {
  return utils.formatRuleValidationMsg(template, index);
}

async function prepareApiKeyRateLimitTest(page) {
  const description = DOC.createSuccess.description + '_rl_' + Date.now();
  await utils.gotoApiKeyManagementPage(page);
  await utils.waitForApiKeyManagementShell(page);
  await utils.waitForPageSettled(page, 500);
  await utils.openAddApiKeyDrawer(page);
  await utils.setupApiKeyCreateWithRateLimit(page, description);
  return description;
}

test.describe('API-Key管理 - EM-K-32 TPM规则-名称必填', () => {
  test('验证 TPM 规则名称不能为空', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmRuleNameRequiredMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-33 TPM规则-时间窗口下界', () => {
  test('验证 TPM 时间窗口不能小于 1', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'TPM', {
      name: 'tpm_window_low',
      window: 0,
      maxTokens: 100,
      step: 1,
    });
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmWindowMinutesInvalidMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-34 TPM规则-时间窗口上界', () => {
  test('验证 TPM 时间窗口不能大于 360', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_window_high',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '361');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '最大Token数',
      '100',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmWindowMinutesInvalidMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-35 TPM规则-滑动步长下界', () => {
  test('验证 TPM 滑动步长不能小于 1', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_step_low',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '10');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '最大Token数',
      '100',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '0');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmStepMinutesRangeMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-36 TPM规则-滑动步长上界', () => {
  test('验证 TPM 滑动步长不能大于 360', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_step_high',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '10');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '最大Token数',
      '100',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '361');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmStepMinutesRangeMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-37 TPM规则-最大Token数下界', () => {
  test('验证 TPM 最大Token数允许为 0', async ({ page }) => {
    const description = await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'TPM', {
      name: 'tpm_tokens_zero',
      window: 10,
      maxTokens: 0,
      step: 1,
    });
    await utils.selectApiKeyMaxConcurrencyOption(page, 50);
    await utils.submitApiKeyFormAndWaitForSuccess(page);
    await utils.searchApiKeyByDescription(page, description);
    await utils.expectApiKeyVisible(page, description);
    await utils.deleteApiKeyAndWait(page, description);
  });
});

test.describe('API-Key管理 - EM-K-38 TPM规则-最大Token数上界', () => {
  test('验证 TPM 最大Token数不能超过 int64 上界', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_tokens_high',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '10');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '最大Token数',
      DOC.ruleValueOverMax,
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmMaxTokensMaxErrorMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-39 RPM规则-名称必填', () => {
  test('验证 RPM 规则名称不能为空', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'RPM');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.rpmRuleNameRequiredMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-40 RPM规则-时间窗口下界', () => {
  test('验证 RPM 时间窗口不能小于 1', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'RPM', {
      name: 'rpm_window_low',
      window: 0,
      maxRequests: 100,
    });
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.rpmWindowMinutesInvalidMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-41 RPM规则-时间窗口上界', () => {
  test('验证 RPM 时间窗口不能大于 360', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'RPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'RPM',
      '规则名称',
      'rpm_window_high',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'RPM', '时间窗口', '361');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'RPM',
      '最大请求数',
      '100',
    );
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.rpmWindowMinutesInvalidMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

test.describe('API-Key管理 - EM-K-42 RPM规则-最大请求数下界', () => {
  test('验证 RPM 最大请求数允许为 0', async ({ page }) => {
    const description = await prepareApiKeyRateLimitTest(page);
    await utils.addApiKeyRateLimitRule(page, 'RPM', {
      name: 'rpm_requests_zero',
      window: 10,
      maxRequests: 0,
    });
    await utils.selectApiKeyMaxConcurrencyOption(page, 50);
    await utils.submitApiKeyFormAndWaitForSuccess(page);
    await utils.searchApiKeyByDescription(page, description);
    await utils.expectApiKeyVisible(page, description);
    await utils.deleteApiKeyAndWait(page, description);
  });
});

test.describe('API-Key管理 - EM-K-43 RPM规则-最大请求数上界', () => {
  test('验证 RPM 最大请求数不能超过 int64 上界', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'RPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'RPM',
      '规则名称',
      'rpm_requests_high',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'RPM', '时间窗口', '10');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'RPM',
      '最大请求数',
      DOC.ruleValueOverMax,
    );
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.rpmMaxRequestsMaxErrorMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

// ==================== EM-K-44 最大并发下拉选项校验 ====================

test.describe('API-Key管理 - EM-K-44 最大并发下拉选项校验', () => {
  test('验证最大并发下拉选择「不限制」时必须有 TPM/RPM 规则，选择「封禁」时可创建成功', async ({
    page,
  }) => {
    await prepareApiKeyRateLimitTest(page);

    await test.step('选择「不限制」且不添加规则，提交应失败', async () => {
      await utils.selectApiKeyMaxConcurrencyOption(page, '不限制');
      await utils.submitApiKeyFormExpectRateLimitError(
        page,
        DOC.rateLimitRuleRequiredMsg,
      );
    });

    await test.step('切换为「封禁」，提交应成功', async () => {
      await utils.selectApiKeyMaxConcurrencyOption(page, '封禁');
      await utils.submitApiKeyFormAndWaitForSuccess(page);
    });
  });
});

// ==================== EM-K-45 TPM滑动步长必填 ====================

test.describe('API-Key管理 - EM-K-45 TPM规则-滑动步长必填', () => {
  test('验证 TPM 滑动步长不能为空', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_rule_step_required',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '1');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '最大Token数',
      '10000',
    );
    // 清除滑动步长（UI 自动填充了默认值，需通过 DOM 清除）
    await utils.clearApiKeyRateLimitRuleField(page, 'TPM', '滑动步长');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmStepMinutesRequiredMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

// ==================== EM-K-46 TPM时间窗口必填 ====================

test.describe('API-Key管理 - EM-K-46 TPM规则-时间窗口必填', () => {
  test('验证 TPM 时间窗口不能为空', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_rule_window_required',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '最大Token数',
      '10000',
    );
    // 清除时间窗口（UI 自动填充了默认值，需通过 DOM 清除）
    await utils.clearApiKeyRateLimitRuleField(page, 'TPM', '时间窗口');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmWindowMinutesRequiredMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

// ==================== EM-K-47 TPM最大Token数必填 ====================

test.describe('API-Key管理 - EM-K-47 TPM规则-最大Token数必填', () => {
  test('验证 TPM 最大Token数不能为空', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'TPM',
      '规则名称',
      'tpm_rule_token_required',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '1');
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
    // 清除最大Token数（UI 自动填充了默认值，需通过 DOM 清除）
    await utils.clearApiKeyRateLimitRuleField(page, 'TPM', '最大Token数');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmMaxTokensRequiredMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});

// ==================== EM-K-48 RPM最大请求数必填 ====================

test.describe('API-Key管理 - EM-K-48 RPM规则-最大请求数必填', () => {
  test('验证 RPM 最大请求数不能为空', async ({ page }) => {
    await prepareApiKeyRateLimitTest(page);
    await utils.clickAddApiKeyRateLimitRule(page, 'RPM');
    await utils.fillApiKeyRateLimitRuleFieldRaw(
      page,
      'RPM',
      '规则名称',
      'rpm_rule_request_required',
    );
    await utils.fillApiKeyRateLimitRuleFieldRaw(page, 'RPM', '时间窗口', '1');
    // 清除最大请求数（UI 自动填充了默认值，需通过 DOM 清除）
    await utils.clearApiKeyRateLimitRuleField(page, 'RPM', '最大请求数');
    await utils.submitApiKeyFormExpectRateLimitError(
      page,
      ruleMsg(DOC.rpmMaxRequestsRequiredMsgTemplate, 1),
    );
    await utils.cancelApiKeyForm(page);
  });
});
