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

const DOC = utils.DOC_ENTITY_ORG;

/** n = 出错规则在 TPM/RPM 列表中的序号（从 1 开始） */
function ruleMsg(template, index) {
  return utils.formatRuleValidationMsg(template, index);
}

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

async function prepareEntityRateLimitTest(page, cleanup) {
  const entityName = await utils.generateTestEntityName();
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackEntityName(entityName);
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, 'TPM/RPM字段校验类型', 1);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 500);
  await utils.openCreateEntityDrawer(page);
  await utils.setupEntityCreateWithRateLimit(page, entityName, typeName);
  return { entityName, typeName };
}

entityOrgDescribe('Entity组织管理 - EM-E-26 TPM规则-名称必填', (cleanup) => {
  test('验证 TPM 规则名称不能为空', async ({ page }) => {
    await prepareEntityRateLimitTest(page, cleanup);
    await utils.clickAddEntityRateLimitRule(page, 'TPM');
    await utils.submitEntityFormExpectRateLimitError(
      page,
      ruleMsg(DOC.tpmRuleNameRequiredMsgTemplate, 1),
    );
    await utils.cancelEntityForm(page);
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-27 TPM规则-时间窗口下界',
  (cleanup) => {
    test('验证 TPM 时间窗口不能小于 1', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.addEntityRateLimitRule(page, 'TPM', {
        name: 'tpm_window_low',
        window: 0,
        maxTokens: 100,
        step: 1,
      });
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmWindowMinutesInvalidMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-28 TPM规则-时间窗口上界',
  (cleanup) => {
    test('验证 TPM 时间窗口不能大于 360', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_window_high',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '时间窗口',
        '361',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '最大Token数',
        '100',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmWindowMinutesInvalidMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-29 TPM规则-滑动步长下界',
  (cleanup) => {
    test('验证 TPM 滑动步长不能小于 1', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_step_low',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '时间窗口',
        '10',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '最大Token数',
        '100',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '0');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmStepMinutesRangeMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-30 TPM规则-滑动步长上界',
  (cleanup) => {
    test('验证 TPM 滑动步长不能大于 360', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_step_high',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '时间窗口',
        '10',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '最大Token数',
        '100',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '滑动步长',
        '361',
      );
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmStepMinutesRangeMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-31 TPM规则-最大Token数下界',
  (cleanup) => {
    test('验证 TPM 最大Token数允许为 0', async ({ page }) => {
      const { entityName, typeName } = await prepareEntityRateLimitTest(
        page,
        cleanup,
      );
      await utils.addEntityRateLimitRule(page, 'TPM', {
        name: 'tpm_tokens_zero',
        window: 10,
        maxTokens: 0,
        step: 1,
      });
      await utils.selectEntityMaxConcurrencyOption(page, 50);
      await utils.submitEntityFormAndWaitForSuccess(page);
      await utils.ensureEntityRowVisible(page, entityName);
      await utils.deleteEntityAndWait(page, entityName);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-32 TPM规则-最大Token数上界',
  (cleanup) => {
    test('验证 TPM 最大Token数不能超过 int64 上界', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_tokens_high',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '时间窗口',
        '10',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '最大Token数',
        DOC.ruleValueOverMax,
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmMaxTokensMaxErrorMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe('Entity组织管理 - EM-E-33 RPM规则-名称必填', (cleanup) => {
  test('验证 RPM 规则名称不能为空', async ({ page }) => {
    await prepareEntityRateLimitTest(page, cleanup);
    await utils.clickAddEntityRateLimitRule(page, 'RPM');
    await utils.submitEntityFormExpectRateLimitError(
      page,
      ruleMsg(DOC.rpmRuleNameRequiredMsgTemplate, 1),
    );
    await utils.cancelEntityForm(page);
  });
});

entityOrgDescribe(
  'Entity组织管理 - EM-E-34 RPM规则-时间窗口下界',
  (cleanup) => {
    test('验证 RPM 时间窗口不能小于 1', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.addEntityRateLimitRule(page, 'RPM', {
        name: 'rpm_window_low',
        window: 0,
        maxRequests: 100,
      });
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.rpmWindowMinutesInvalidMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-35 RPM规则-时间窗口上界',
  (cleanup) => {
    test('验证 RPM 时间窗口不能大于 360', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'RPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '规则名称',
        'rpm_window_high',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '时间窗口',
        '361',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '最大请求数',
        '100',
      );
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.rpmWindowMinutesInvalidMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-36 RPM规则-最大请求数下界',
  (cleanup) => {
    test('验证 RPM 最大请求数允许为 0', async ({ page }) => {
      const { entityName, typeName } = await prepareEntityRateLimitTest(
        page,
        cleanup,
      );
      await utils.addEntityRateLimitRule(page, 'RPM', {
        name: 'rpm_requests_zero',
        window: 10,
        maxRequests: 0,
      });
      await utils.selectEntityMaxConcurrencyOption(page, 50);
      await utils.submitEntityFormAndWaitForSuccess(page);
      await utils.ensureEntityRowVisible(page, entityName);
      await utils.deleteEntityAndWait(page, entityName);
    });
  },
);

entityOrgDescribe(
  'Entity组织管理 - EM-E-37 RPM规则-最大请求数上界',
  (cleanup) => {
    test('验证 RPM 最大请求数不能超过 int64 上界', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'RPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '规则名称',
        'rpm_requests_high',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '时间窗口',
        '10',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '最大请求数',
        DOC.ruleValueOverMax,
      );
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.rpmMaxRequestsMaxErrorMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

// ==================== EM-E-38 最大并发下拉选项校验 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-38 最大并发下拉选项校验',
  (cleanup) => {
    test('验证最大并发下拉选择「不限制」时必须有 TPM/RPM 规则，选择「封禁」时可创建成功', async ({
      page,
    }) => {
      await prepareEntityRateLimitTest(page, cleanup);

      await test.step('选择「不限制」且不添加规则，提交应失败', async () => {
        await utils.selectEntityMaxConcurrencyOption(page, '不限制');
        await utils.submitEntityFormExpectRateLimitError(
          page,
          DOC.rateLimitRuleRequiredMsg,
        );
      });

      await test.step('切换为「封禁」，提交应成功', async () => {
        await utils.selectEntityMaxConcurrencyOption(page, '封禁');
        await utils.submitEntityFormAndWaitForSuccess(page);
      });
    });
  },
);

// ==================== EM-E-39 TPM滑动步长必填 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-39 TPM规则-滑动步长必填',
  (cleanup) => {
    test('验证 TPM 滑动步长不能为空', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_rule_step_required',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '1');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '最大Token数',
        '10000',
      );
      // 清除滑动步长（UI 自动填充了默认值，需通过 DOM 清除）
      await utils.clearEntityRateLimitRuleField(page, 'TPM', '滑动步长');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmStepMinutesRequiredMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

// ==================== EM-E-40 TPM时间窗口必填 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-40 TPM规则-时间窗口必填',
  (cleanup) => {
    test('验证 TPM 时间窗口不能为空', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_rule_window_required',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '最大Token数',
        '10000',
      );
      // 清除时间窗口（UI 自动填充了默认值，需通过 DOM 清除）
      await utils.clearEntityRateLimitRuleField(page, 'TPM', '时间窗口');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmWindowMinutesRequiredMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

// ==================== EM-E-41 TPM最大Token数必填 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-41 TPM规则-最大Token数必填',
  (cleanup) => {
    test('验证 TPM 最大Token数不能为空', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'TPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm_rule_token_required',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '时间窗口', '1');
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'TPM', '滑动步长', '1');
      // 清除最大Token数（UI 自动填充了默认值，需通过 DOM 清除）
      await utils.clearEntityRateLimitRuleField(page, 'TPM', '最大Token数');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.tpmMaxTokensRequiredMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);

// ==================== EM-E-42 RPM最大请求数必填 ====================

entityOrgDescribe(
  'Entity组织管理 - EM-E-42 RPM规则-最大请求数必填',
  (cleanup) => {
    test('验证 RPM 最大请求数不能为空', async ({ page }) => {
      await prepareEntityRateLimitTest(page, cleanup);
      await utils.clickAddEntityRateLimitRule(page, 'RPM');
      await utils.fillEntityRateLimitRuleFieldRaw(
        page,
        'RPM',
        '规则名称',
        'rpm_rule_request_required',
      );
      await utils.fillEntityRateLimitRuleFieldRaw(page, 'RPM', '时间窗口', '1');
      // 清除最大请求数（UI 自动填充了默认值，需通过 DOM 清除）
      await utils.clearEntityRateLimitRuleField(page, 'RPM', '最大请求数');
      await utils.submitEntityFormExpectRateLimitError(
        page,
        ruleMsg(DOC.rpmMaxRequestsRequiredMsgTemplate, 1),
      );
      await utils.cancelEntityForm(page);
    });
  },
);
