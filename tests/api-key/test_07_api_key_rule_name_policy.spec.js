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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * API-Key 限流规则 name 策略（EM-CV-05 / EM-CV-08）
 *
 * 文档：docs/api-key/02-功能测试用例/05-名称校验.md
 * - EM-CV-05 限流规则 name 字符集校验（字符集 [a-zA-Z0-9_-]、长度 1–128）
 * - EM-CV-08 限流规则 name 创建后不可修改（编辑态禁用 + 只读提示）
 *
 * 审计背景（2026-11-01，api-key 深度审计）：
 * 这两条自 2026-10 起在 entity-management 与 api-key 两处文档中声明，但**从未有自动化**，
 * 覆盖缺口清单 #30 长期标注「阻塞于产品口径」。本轮核对源码确认口径已统一：
 * - `src/utils/const.js` `RateLimitRuleNameRegCheck`：`/^[a-zA-Z0-9_-]+$/`、长度 1–128；
 * - `src/i18n/zh.js`（apiKey 段）`ruleNameFormatTip`：「字符集 [a-zA-Z0-9_-]，1–128 字符」；
 * - `Upsert.vue` `normalizeRateLimitRules`：编辑态已有名称的规则置 `_nameLocked=true`
 *   → 名称 Input `:disabled`，提示改为「创建后不可修改」。
 * 早期「1–64 且允许 .」的文案属 **route 模块**（`route.ruleNameLengthError`），与 api-key 无关，
 * 原「口径冲突」结论为误判，至此关闭 #30 的 api-key 侧。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const { findApiKeyByDescriptionViaApi } = require('../../api/entity-api-utils');

const DRAWER_TITLE = utils.DRAWER_TITLE;

/** i18n `apiKey.ruleNameFormatError` / `apiKey.ruleNameLengthError` / `apiKey.ruleNameReadonlyTip` */
const MSG_CHARSET = '规则名称字符集为 [a-zA-Z0-9_-]，长度 1–128';
const MSG_LENGTH = '规则名称长度不能超过128字符';
const TIP_READONLY = '创建后不可修改';
const TIP_FORMAT = '字符集 [a-zA-Z0-9_-]，1–128 字符';

function apiKeyDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createApiKeyTestCleanup();
    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });
    register(cleanup);
  });
}

async function openCreateDrawer(page, description) {
  await utils.gotoApiKeyManagementPage(page);
  await utils.waitForApiKeyManagementShell(page);
  await utils.waitForPageSettled(page, 500);
  await utils.openAddApiKeyDrawer(page);
  await utils.fillApiKeyDescription(page, description);
  await utils.selectApiKeyEnableRateLimit(page, '是');
}

/** 通过 UI 创建带 1 条 TPM 规则的 API-Key，返回 description */
async function createApiKeyWithTpmRule(page, cleanup, ruleName) {
  const description = 'cv08_' + Date.now();
  await openCreateDrawer(page, description);
  await utils.addApiKeyRateLimitRule(page, 'TPM', {
    name: ruleName,
    window: 1,
    maxTokens: 100,
    step: 1,
  });
  await utils.submitApiKeyFormAndWaitForSuccess(page, DRAWER_TITLE.addApiKey);
  await utils.expectAddApiKeyDrawerHidden(page);
  const created = await findApiKeyByDescriptionViaApi(page, description);
  expect(created, 'UI 创建 API-Key 后应能查到记录').toBeTruthy();
  cleanup.trackApiKeyId(created.id);
  return description;
}

apiKeyDescribe('API-Key管理 - EM-CV-05 限流规则 name 字符集', (cleanup) => {
  test('点号/中文/空格被拦截，128 字符合法，129 字符超限', async ({ page }) => {
    const description = 'cv05_' + Date.now();
    await test.step('前置：打开添加抽屉并启用限流，新增 1 条 TPM 规则', async () => {
      await openCreateDrawer(page, description);
      await utils.addApiKeyRateLimitRule(page, 'TPM', {
        name: 'tpm_rule_1',
        window: 1,
        maxTokens: 100,
        step: 1,
      });
    });

    await test.step('含点号 tpm.rule 被拦截（字符集提示）', async () => {
      await utils.fillApiKeyRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm.rule',
      );
      await utils.submitApiKeyFormExpectRateLimitError(page, MSG_CHARSET);
    });

    await test.step('含中文被拦截', async () => {
      await utils.fillApiKeyRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        '规则一',
      );
      await utils.submitApiKeyFormExpectRateLimitError(page, MSG_CHARSET);
    });

    await test.step('含空格被拦截', async () => {
      await utils.fillApiKeyRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'tpm rule',
      );
      await utils.submitApiKeyFormExpectRateLimitError(page, MSG_CHARSET);
    });

    await test.step('129 字符超限被拦截（长度提示）', async () => {
      await utils.fillApiKeyRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'a'.repeat(129),
      );
      await utils.submitApiKeyFormExpectRateLimitError(page, MSG_LENGTH);
    });

    await test.step('128 字符合法：提交成功', async () => {
      await utils.fillApiKeyRateLimitRuleFieldRaw(
        page,
        'TPM',
        '规则名称',
        'b'.repeat(128),
      );
      await utils.submitApiKeyFormAndWaitForSuccess(page, DRAWER_TITLE.addApiKey);
      await utils.expectAddApiKeyDrawerHidden(page);
      const created = await findApiKeyByDescriptionViaApi(page, description);
      expect(created, '128 字符规则名创建后应能查到记录').toBeTruthy();
      cleanup.trackApiKeyId(created.id);
    });
  });
});

apiKeyDescribe('API-Key管理 - EM-CV-08 限流规则 name 创建后不可修改', (cleanup) => {
  test('编辑态规则名输入框禁用并展示「创建后不可修改」', async ({ page }) => {
    const ruleName = 'tpm_lock_1';
    let description;

    await test.step('前置：UI 创建带 TPM 规则的 API-Key', async () => {
      description = await createApiKeyWithTpmRule(page, cleanup, ruleName);
    });

    await test.step('添加态：规则名可编辑，提示为字符集说明', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.waitForApiKeyManagementShell(page);
      await utils.openAddApiKeyDrawer(page);
      await utils.fillApiKeyDescription(page, 'cv08_add_' + Date.now());
      await utils.selectApiKeyEnableRateLimit(page, '是');
      await utils.clickAddApiKeyRateLimitRule(page, 'TPM');
      const row = await firstTpmRuleRow(page);
      const nameInput = row.locator('input').first();
      await expect(nameInput).toBeEnabled();
      await expect(row.locator('.form-tip').first()).toHaveText(TIP_FORMAT);
      await utils.cancelApiKeyForm(page);
    });

    await test.step('编辑态：名称输入框禁用、提示改为「创建后不可修改」', async () => {
      await utils.searchApiKeyByDescription(page, description);
      await utils.openEditApiKeyDrawer(page, description);
      const row = await firstTpmRuleRow(page, DRAWER_TITLE.editApiKey);
      const nameInput = row.locator('input').first();
      await expect(nameInput).toBeDisabled();
      await expect(nameInput).toHaveValue(ruleName);
      await expect(row.locator('.form-tip').first()).toHaveText(TIP_READONLY);
      await utils.cancelApiKeyForm(page, DRAWER_TITLE.editApiKey);
    });
  });
});

async function firstTpmRuleRow(page, drawerTitle = DRAWER_TITLE.addApiKey) {
  const drawer = utils.drawerScope(page, drawerTitle);
  const section = drawer
    .locator('.rules-section')
    .filter({ hasText: 'TPM' })
    .first();
  const row = section.locator('.rule-row').first();
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
}
