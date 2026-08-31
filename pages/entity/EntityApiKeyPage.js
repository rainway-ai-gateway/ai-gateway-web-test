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
const { expect, test } = require('@playwright/test');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const { PageTableComponent } = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuFormComponent,
  IvuModalComponent,
  IvuSelectComponent,
  IvuMessageComponent,
} = require('../../components/iview');
const { ElSelectComponent } = require('../../components/element');
const {
  DRAWER_TITLE,
  DOC_API_KEY,
  API_KEY_SEARCH_PLACEHOLDER,
  API_KEY_SEARCH_PLACEHOLDER_KEY,
  API_KEY_SEARCH_PLACEHOLDER_KEY_ID,
  ivuDrawer,
  apiKeyDetailDrawer,
  ivuModal,
  expectApiKeyDetailDrawerOpen,
  expectEntityManagementLayout,
  gotoEntityManagementPage,
  ensureAppSession,
  navigateToApiKeyManagementByUrl,
  navigateToApiKeyManagement,
  isApiKeyManagementPageReady,
  selectElDrawerField,
  expectElDrawerFieldSelectedContains,
  waitForPageSettled,
  waitForApiKeyManagementShell,
  RATE_LIMIT_FIELD,
  resolveRateLimitSection,
  resolveRateLimitFieldKey,
} = require('./entity-shared');
const {
  getUserData,
  getOpenApiBaseUrl,
  findEntityByNameViaApi,
  findApiKeyByDescriptionViaApi,
  findApiKeyByIdViaApi,
  normalizeApiList,
  createApiKeyTestCleanup,
} = require('../../api/entity-api-utils');
const {
  apiKeyTable,
  apiKeyForm,
  expectDrawerFormErrorContains,
  expectResetQuotaDrawerOpen,
  fillResetQuotaForm,
  submitResetQuotaFormAndWaitForSuccess,
  waitAfterEntityMutation,
} = require('./EntityOrgPage');
// selectRuleModelInSection: lazy require in addApiKeyRateLimitRule to break circular dependency

async function gotoApiKeyManagementPage(page) {
  if (await isApiKeyManagementPageReady(page)) {
    common.log('已在 API-Key 管理页面，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  await ensureAppSession(page);
  await navigateToApiKeyManagement(page);
}

async function expectApiKeyManagementPageTitle(page) {
  await expect(
    page.locator('.bfe-breadcrumb').getByText('API Key 管理', { exact: true }),
  ).toBeVisible();
}

async function expectAddApiKeyButtonVisible(page) {
  await expect(page.getByRole('button', { name: '创建' })).toBeVisible();
}

async function expectApiKeyTableVisible(page) {
  const table = apiKeyTable(page);
  await expect(table.rootLocator()).toBeVisible();
}

async function expectApiKeyPageLayout(page) {
  await expectEntityManagementLayout(page);
  await expectApiKeyManagementPageTitle(page);
  await expectAddApiKeyButtonVisible(page);
  await expectApiKeyTableVisible(page);
  // 验证 Key ID 列存在（表头含排序图标字符，不能锚定全文匹配）
  await expect(
    page
      .locator('th')
      .filter({ hasText: /Key ID/ })
      .first(),
  ).toBeVisible();
}

async function openAddApiKeyDrawer(page) {
  const recovered = await umUtils.handleUrlInvalidAlert(page);
  if (recovered) {
    await gotoApiKeyManagementPage(page);
  }
  await page.getByRole('button', { name: '创建' }).click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.addApiKey);
}

async function openEditApiKeyDrawer(page, description) {
  await apiKeyTable(page).rowAction(description, '编辑').click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editApiKey);
  // 等待描述输入框加载并包含值
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.editApiKey);
  const descInput = drawer.locator('input[placeholder="请输入API-Key描述"]');
  await expect(descInput).toBeVisible({ timeout: 10000 });
  await expect(descInput).not.toHaveValue('', { timeout: 10000 });
}

async function openApiKeyDetail(page, description) {
  await expect(ivuDrawer(page).withTitle(DRAWER_TITLE.addApiKey)).toBeHidden({
    timeout: 10000,
  });
  const table = apiKeyTable(page);
  let row = table.dataRows().filter({ hasText: description });
  if ((await row.count()) === 0) {
    await searchApiKeyByDescription(page, description);
    row = table.dataRows().filter({ hasText: description });
  }
  const targetRow = row.first();
  await expect(targetRow).toBeVisible({ timeout: 15000 });
  // 点击描述列（第 3 列），避免误点操作按钮；iView 行点击需落在数据单元格上
  const descCell = targetRow.locator('td').nth(2);
  await descCell.scrollIntoViewIfNeeded();
  await descCell.click();
  await page.waitForTimeout(500);
  await expectApiKeyDetailDrawerOpen(page);
}

async function selectApiKeyFormSelect(
  page,
  label,
  optionText,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  // 通过表单 label 元素精确匹配，避免校验错误提示文本（如“…将最大并发设为…”）
  // 挂在其它 FormItem 内导致 hasText 误匹配到错误的 .ivu-select
  const trigger = drawer
    .locator('.ivu-form-item')
    .filter({
      has: drawer
        .page()
        .locator('.ivu-form-item-label')
        .getByText(label)
        .first(),
    })
    .locator('.ivu-select')
    .first();
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await new IvuSelectComponent(page, trigger).selectOptionExact(optionText);
}

async function fillApiKeyDescription(
  page,
  description,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await apiKeyForm(page, drawerTitle).fillInput('描述', description);
}

async function fillApiKeyDescriptionRaw(
  page,
  description,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const input = apiKeyForm(page, drawerTitle).input('描述');
  await input.evaluate((el, value) => {
    el.removeAttribute('maxlength');
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, description);
  await input.blur();
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await drawer.evaluate((drawerEl, value) => {
    const formEl = drawerEl.querySelector('.ivu-form');
    if (!formEl || !formEl.__vue__) {
      return;
    }
    let vm = formEl.__vue__;
    while (vm && !vm.formData) {
      vm = vm.$parent;
    }
    if (vm && vm.formData) {
      vm.formData.description = value;
      if (vm.$forceUpdate) {
        vm.$forceUpdate();
      }
    }
  }, description);
  await page.waitForTimeout(300);
}

async function selectApiKeyExpiryForever(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const checkbox = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '过期时间' })
    .locator('.ivu-checkbox-wrapper')
    .first();
  const input = checkbox.locator('input[type="checkbox"]');
  if (!(await input.isChecked())) {
    await checkbox.click();
  }
}

async function selectApiKeyExpiryLimited(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const checkbox = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '过期时间' })
    .locator('.ivu-checkbox-wrapper')
    .first();
  const input = checkbox.locator('input[type="checkbox"]');
  if (await input.isChecked()) {
    await checkbox.click();
  }
}

async function selectApiKeyStatus(
  page,
  status,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await selectApiKeyFormSelect(page, '启用状态', status, drawerTitle);
}

async function selectApiKeyQuotaCheck(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await selectApiKeyFormSelect(page, '执行配额检查', value, drawerTitle);
}

async function selectApiKeyAllowedModel(
  page,
  model,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await selectElDrawerField(page, drawerTitle, '允许模型', model);
}

async function fillApiKeyAllowedSubnets(
  page,
  subnets,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const textarea = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '允许子网' })
    .locator('textarea');
  const value = subnets.length > 0 ? subnets.join('\n') : '';
  await expect(textarea).toBeVisible({ timeout: 15000 });
  await textarea.fill(value);
  await textarea.blur();
  await page.waitForTimeout(500);
}

async function clearApiKeyAllowedSubnets(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await fillApiKeyAllowedSubnets(page, [], drawerTitle);
}

async function selectApiKeyEntity(
  page,
  entityName,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  if (!entityName) {
    return;
  }
  await selectElDrawerField(page, drawerTitle, '挂载Entity', entityName);
}

async function clearApiKeyEntity(page, drawerTitle = DRAWER_TITLE.addApiKey) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const formItem = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '挂载Entity' })
    .first();
  const elSelect = formItem.locator('.el-select').first();
  await expect(elSelect).toBeVisible({ timeout: 15000 });
  // Element UI el-select clearable：hover 后出现清除图标
  await elSelect.hover();
  await page.waitForTimeout(300);
  const clearIcon = elSelect
    .locator('.el-select__close, .el-icon-circle-close, .el-icon-close')
    .first();
  await expect(clearIcon).toBeVisible({ timeout: 10000 });
  await clearIcon.click();
  await page.waitForTimeout(300);
}

async function selectApiKeyUnlimitedQuota(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await selectApiKeyFormSelect(page, '无限配额', value, drawerTitle);
}

async function fillApiKeyQuotaTotal(
  page,
  total,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await apiKeyForm(page, drawerTitle).fillInput('配额总量', String(total));
}

/**
 * 直接写入 Vue 模型的 quota_plan.quota，绕过 InputNumber 的 precision 钳制。
 * 用于小数校验场景：InputNumber :precision=0 会在 blur 时自动取整。
 */
async function setApiKeyQuotaTotalModel(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await expect(drawer).toBeVisible({ timeout: 15000 });
  const result = await drawer.evaluate((drawerEl, quotaValue) => {
    const formEl = drawerEl.querySelector('.ivu-form');
    if (!formEl || !formEl.__vue__) return { ok: false, reason: 'no-form-vue' };
    let vm = formEl.__vue__;
    while (vm && !vm.formData) vm = vm.$parent;
    if (!vm || !vm.formData) return { ok: false, reason: 'no-formData' };
    // API-Key 表单可能用 quota_plan.quota 或 quota_total
    if (!vm.formData.quota_plan) vm.formData.quota_plan = {};
    const formRef = (vm.$refs && (vm.$refs.formData || vm.$refs.form)) || null;
    if (typeof vm.$set === 'function') {
      vm.$set(vm.formData.quota_plan, 'quota', quotaValue);
    } else {
      vm.formData.quota_plan.quota = quotaValue;
    }
    // 触发校验
    if (formRef && Array.isArray(formRef.fields)) {
      const field = formRef.fields.find(
        (f) => f.prop === 'quota_plan.quota' || f.prop === 'quota_total',
      );
      if (field && typeof field.validate === 'function') {
        field.validate('blur');
      }
    }
    return { ok: true };
  }, value);
  await page.waitForTimeout(300);
  return result;
}

async function fillApiKeyQuotaTotalAndBlur(
  page,
  total,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const num = Number(total);
  // 小数：InputNumber :precision=0 会在 blur 时自动取整，须直接写 Vue 模型
  if (Number.isFinite(num) && !Number.isInteger(num)) {
    await setApiKeyQuotaTotalModel(page, num, drawerTitle);
    return;
  }
  // 大整数（超出 JS 安全范围）：使用 typeAndValidate 逐字输入，避免精度丢失
  if (Number.isFinite(num) && num > Number.MAX_SAFE_INTEGER) {
    await apiKeyForm(page, drawerTitle).typeAndValidate(
      '配额总量',
      String(total),
    );
    await page.waitForTimeout(300);
    return;
  }
  // 普通整数：使用 typeAndValidate
  await apiKeyForm(page, drawerTitle).typeAndValidate(
    '配额总量',
    String(total),
  );
  await page.waitForTimeout(300);
}

async function clearApiKeyQuotaTotal(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const input = apiKeyForm(page, drawerTitle).input('配额总量');
  await expect(input).toBeVisible({ timeout: 15000 });
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.evaluate((el) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await input.blur();
  await page.waitForTimeout(300);
}

async function selectApiKeyQuotaUnit(
  page,
  unit,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const trigger = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '配额单位' })
    .locator('.ivu-select')
    .first();
  await new IvuSelectComponent(page, trigger).selectOptionExact(unit);
}

async function selectApiKeyResetCycle(
  page,
  cycle,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const trigger = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '重置周期' })
    .locator('.ivu-select')
    .first();
  await new IvuSelectComponent(page, trigger).selectOptionExact(cycle);
}

async function selectApiKeyEnableRateLimit(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await selectApiKeyFormSelect(page, '启用限流', value, drawerTitle);
}

async function addApiKeyRateLimitRule(
  page,
  ruleType,
  rule,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const { selectRuleModelInSection } = require('./EntityOrgPage');
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const section = await resolveRateLimitSection(drawer, ruleType);
  await section.getByRole('button', { name: '添加规则' }).click();
  await page.waitForTimeout(500);

  // 只在最后一条规则行内操作
  const lastRuleRow = section.locator('.rule-row').last();
  const form = new IvuFormComponent(lastRuleRow);
  if (rule.name !== undefined) {
    await form.fillInput(RATE_LIMIT_FIELD.RULE_NAME, rule.name);
  }

  await selectRuleModelInSection(page, lastRuleRow, rule.model || '全部模型');

  if (rule.window !== undefined) {
    await form.fillInput(RATE_LIMIT_FIELD.TIME_WINDOW, String(rule.window));
  }
  if (rule.maxTokens !== undefined) {
    await form.fillInput(RATE_LIMIT_FIELD.MAX_TOKENS, String(rule.maxTokens));
  }
  if (rule.maxRequests !== undefined) {
    await form.fillInput(
      RATE_LIMIT_FIELD.MAX_REQUESTS,
      String(rule.maxRequests),
    );
  }
  if (rule.step !== undefined) {
    await form.fillInput(RATE_LIMIT_FIELD.STEP_MINUTES, String(rule.step));
  }
}

async function apiKeyRateLimitSection(
  page,
  ruleType,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  return resolveRateLimitSection(drawer, ruleType);
}

async function clickAddApiKeyRateLimitRule(
  page,
  ruleType,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const section = await apiKeyRateLimitSection(page, ruleType, drawerTitle);
  await section.getByRole('button', { name: '添加规则' }).click();
  await page.waitForTimeout(500);
}

async function fillApiKeyRateLimitRuleFieldRaw(
  page,
  ruleType,
  label,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const fieldKey = resolveRateLimitFieldKey(label);
  let modelValue = value;
  if (fieldKey !== 'name') {
    const raw = String(value);
    if (value === null || value === undefined || raw === '') {
      modelValue = null;
    } else if (
      /^\d+$/.test(raw) &&
      (raw.length >= 19 || Number(raw) > Number.MAX_SAFE_INTEGER)
    ) {
      modelValue = 1e20;
    } else {
      modelValue = Number(value);
    }
  }
  return setApiKeyRateLimitRuleFieldModel(
    page,
    ruleType,
    fieldKey,
    modelValue,
    0,
    drawerTitle,
  );
}

/**
 * 清除限流规则字段的 DOM 输入框值（用于测试"必填"校验）
 */
async function clearApiKeyRateLimitRuleField(
  page,
  ruleType,
  label,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const section = await apiKeyRateLimitSection(page, ruleType, drawerTitle);
  const fieldLabel =
    label === '时间窗口'
      ? RATE_LIMIT_FIELD.TIME_WINDOW
      : label === '滑动步长'
        ? RATE_LIMIT_FIELD.STEP_MINUTES
        : label;
  const formItem = section
    .locator('.ivu-form-item')
    .filter({ hasText: fieldLabel })
    .first();
  const input = formItem.locator('input').first();
  await input.fill('');
  await input.dispatchEvent('blur');
  await page.waitForTimeout(300);
}

async function setApiKeyRateLimitRuleFieldModel(
  page,
  ruleType,
  fieldKey,
  value,
  ruleIndex = 0,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const listKey = String(ruleType).toLowerCase().startsWith('rpm')
    ? 'rpm'
    : 'tpm';
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await expect(drawer).toBeVisible({ timeout: 15000 });
  const result = await drawer.evaluate(
    (drawerEl, payload) => {
      const formEl = drawerEl.querySelector('.ivu-form');
      if (!formEl || !formEl.__vue__) {
        return { ok: false, reason: 'no-form-vue' };
      }
      let vm = formEl.__vue__;
      while (vm && !vm.formData) {
        vm = vm.$parent;
      }
      if (!vm || !vm.formData || !vm.formData.rate_limit_policy) {
        return { ok: false, reason: 'no-rate_limit_policy' };
      }
      if (!vm.formData.rate_limit_policy.rules) {
        vm.formData.rate_limit_policy.rules = { tpm: [], rpm: [] };
      }
      const list = vm.formData.rate_limit_policy.rules[payload.listKey];
      if (!Array.isArray(list) || !list[payload.ruleIndex]) {
        return {
          ok: false,
          reason: 'no-rule-row',
          listLen: Array.isArray(list) ? list.length : -1,
        };
      }
      if (typeof vm.$set === 'function') {
        vm.$set(list[payload.ruleIndex], payload.fieldKey, payload.value);
      } else {
        list[payload.ruleIndex][payload.fieldKey] = payload.value;
      }
      const formRef =
        (vm.$refs && (vm.$refs.formData || vm.$refs.form)) || null;
      const prop = `rate_limit_policy.rules.${payload.listKey}.${payload.ruleIndex}.${payload.fieldKey}`;
      const field =
        formRef &&
        Array.isArray(formRef.fields) &&
        formRef.fields.find((f) => f.prop === prop);
      if (!field || typeof field.validate !== 'function') {
        return {
          ok: false,
          reason: 'no-field',
          prop,
          props:
            formRef && formRef.fields ? formRef.fields.map((f) => f.prop) : [],
        };
      }
      return new Promise((resolve) => {
        field.validate('change', (errorMessage) => {
          resolve({
            ok: true,
            errorMessage: errorMessage || null,
            value: list[payload.ruleIndex][payload.fieldKey],
            validateMessage: field.validateMessage,
            validateState: field.validateState,
          });
        });
      });
    },
    { listKey, fieldKey, value, ruleIndex },
  );
  if (!result || !result.ok) {
    throw new Error(
      `未能写入 API-Key 限流规则字段到 Vue formData: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(300);
  return result;
}

async function setupApiKeyCreateWithRateLimit(page, description) {
  await fillApiKeyDescription(page, description);
  await selectApiKeyEnableRateLimit(page, '是');
}

async function submitApiKeyFormExpectRateLimitError(
  page,
  message,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await submitApiKeyForm(page);
  await waitAfterApiKeyAction(page, 500);
  await expectAddApiKeyDrawerOpen(page);
  await expectDrawerFormErrorContains(page, message, drawerTitle);
}

/**
 * 选择最大并发下拉选项
 * @param {string|number} value - 可以是选项文本（'不限制'/'封禁'/'限制并发数'）或数值（-1/<-1/>0）
 */
async function selectApiKeyMaxConcurrencyOption(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  let optionText;
  // 如果传入的是文本，直接使用
  if (
    typeof value === 'string' &&
    ['不限制', '封禁', '限制并发数'].includes(value)
  ) {
    optionText = value;
  } else {
    // 否则按数值转换
    const num = Number(value);
    if (num === -1) {
      optionText = '不限制';
    } else if (num < -1) {
      optionText = '封禁';
    } else {
      optionText = '限制并发数';
    }
  }
  await selectApiKeyFormSelect(page, '最大并发', optionText, drawerTitle);
  return optionText;
}

async function fillApiKeyMaxConcurrency(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  // 最大并发改为下拉（不限制 / 封禁 / 限制并发数）+ 条件输入
  const optionText = await selectApiKeyMaxConcurrencyOption(
    page,
    value,
    drawerTitle,
  );
  if (optionText === '限制并发数') {
    // FormItem 内有 Select 的 hidden input 和 InputNumber 的可见 input，
    // 必须跳过 hidden 定位到可见的数字输入框
    const formItem = apiKeyForm(page, drawerTitle)
      .scope.locator('.ivu-form-item')
      .filter({ hasText: '最大并发' });
    const numberInput = formItem.locator('input:not([type=hidden])').first();
    await numberInput.fill(String(value));
  }
  return { ok: true, value };
}

async function clearApiKeyMaxConcurrency(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  return prepareApiKeyRateLimitRequiredState(page, drawerTitle);
}

async function prepareApiKeyRateLimitRequiredState(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await expect(drawer).toBeVisible({ timeout: 15000 });
  const result = await drawer.evaluate((drawerEl) => {
    const formEl = drawerEl.querySelector('.ivu-form');
    if (!formEl || !formEl.__vue__) {
      return { ok: false, reason: 'no-form-vue' };
    }
    let vm = formEl.__vue__;
    while (vm && !vm.formData) {
      vm = vm.$parent;
    }
    if (!vm || !vm.formData || !vm.formData.rate_limit_policy) {
      return { ok: false, reason: 'no-rate_limit_policy' };
    }
    if (!vm.formData.rate_limit_policy.rules) {
      vm.formData.rate_limit_policy.rules = { tpm: [], rpm: [] };
    }
    vm.formData.rate_limit_policy.enabled = 'true';
    vm.formData.rate_limit_policy.rules.tpm = [];
    vm.formData.rate_limit_policy.rules.rpm = [];
    if (typeof vm.$set === 'function') {
      vm.$set(vm.formData.rate_limit_policy.rules, 'max_concurrency', null);
    } else {
      vm.formData.rate_limit_policy.rules.max_concurrency = null;
    }
    const formRef = (vm.$refs && (vm.$refs.formData || vm.$refs.form)) || null;
    const enabledFields =
      formRef && Array.isArray(formRef.fields)
        ? formRef.fields.filter((f) => f.prop === 'rate_limit_policy.enabled')
        : [];
    if (
      !enabledFields.length ||
      typeof enabledFields[0].validate !== 'function'
    ) {
      return {
        ok: false,
        reason: 'no-enabled-field',
        props:
          formRef && formRef.fields ? formRef.fields.map((f) => f.prop) : [],
      };
    }
    return new Promise((resolve) => {
      let pending = enabledFields.length;
      let lastError = null;
      enabledFields.forEach((field) => {
        field.validate('change', (errorMessage) => {
          if (errorMessage) {
            lastError = errorMessage;
          }
          pending -= 1;
          if (pending === 0) {
            resolve({
              ok: true,
              errorMessage: lastError,
              enabled: vm.formData.rate_limit_policy.enabled,
              maxConcurrency:
                vm.formData.rate_limit_policy.rules.max_concurrency,
              validateState: field.validateState,
              validateMessage: field.validateMessage,
            });
          }
        });
      });
    });
  });
  if (!result || !result.ok) {
    throw new Error(
      `未能准备 API-Key 限流必填校验态: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(400);
  return result;
}

async function triggerApiKeyRateLimitEnabledValidate(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await drawer.evaluate((drawerEl) => {
    const formEl = drawerEl.querySelector('.ivu-form');
    if (!formEl || !formEl.__vue__) {
      return;
    }
    let vm = formEl.__vue__;
    while (vm && !vm.formData) {
      vm = vm.$parent;
    }
    if (!vm) {
      return;
    }
    if (typeof vm.validateRateLimitEnabledField === 'function') {
      vm.validateRateLimitEnabledField();
      return;
    }
    const formRef = vm.$refs && (vm.$refs.formData || vm.$refs.form);
    if (formRef && typeof formRef.validateField === 'function') {
      formRef.validateField('rate_limit_policy.enabled');
    }
  });
  await page.waitForTimeout(400);
}

async function fillApiKeyMaxConcurrencyAndBlur(
  page,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await fillApiKeyMaxConcurrency(page, value, drawerTitle);
  await page.waitForTimeout(300);
}

async function submitApiKeyForm(page, drawerTitle = DRAWER_TITLE.addApiKey) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '提交');
}

async function submitApiKeyFormAndWaitForSuccess(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction('添加成功', () =>
    waitForApiKeysListResponse(page, () => submitApiKeyForm(page, drawerTitle)),
  );
  await waitAfterApiKeyMutation(page);
}

async function submitApiKeyFormAndWaitForEditSuccess(
  page,
  drawerTitle = DRAWER_TITLE.editApiKey,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction('修改成功', () =>
    waitForApiKeysListResponse(page, () => submitApiKeyForm(page, drawerTitle)),
  );
  await waitAfterApiKeyMutation(page);
}

async function cancelApiKeyForm(page, drawerTitle = DRAWER_TITLE.addApiKey) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '取消');
}

async function expectAddApiKeyDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.addApiKey);
}

async function expectAddApiKeyDrawerHidden(page) {
  await expect(ivuDrawer(page).withTitle(DRAWER_TITLE.addApiKey)).toBeHidden();
}

async function expectApiKeyFormFieldError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await apiKeyForm(page, drawerTitle).expectFieldError(label, message);
}

async function expectApiKeyFormInlineError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const formItem = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: label })
    .first();
  const errorTip = formItem
    .locator('.ivu-form-item-error-tip')
    .filter({ hasText: message });
  if ((await errorTip.count()) > 0) {
    await expect(errorTip).toBeVisible({ timeout: 10000 });
    return;
  }
  await expect(formItem).toContainText(message);
}

async function expectApiKeyRateLimitRequired(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  // tip 挂在底部无标题 FormItem（.rate-limit-policy-error），不在「启用限流」标签项内
  await expectDrawerFormErrorContains(
    page,
    DOC_API_KEY.rateLimitRuleRequiredMsg,
    drawerTitle,
  );
}

async function expectApiKeyQuotaTotalRequired(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormInlineError(
    page,
    '配额总量',
    DOC_API_KEY.quotaTotalRequiredMsg,
    drawerTitle,
  );
}

async function expectApiKeyQuotaIntegerError(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormInlineError(
    page,
    '配额总量',
    DOC_API_KEY.quotaIntegerErrorMsg,
    drawerTitle,
  );
}

async function expectApiKeyQuotaMaxError(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormInlineError(
    page,
    '配额总量',
    DOC_API_KEY.quotaMaxErrorMsg,
    drawerTitle,
  );
}

async function expectApiKeyQuotaRmbMaxError(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormInlineError(
    page,
    '配额总量',
    DOC_API_KEY.quotaRmbMaxErrorMsg,
    drawerTitle,
  );
}

async function expectApiKeyQuotaRmbPrecisionError(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormInlineError(
    page,
    '配额总量',
    DOC_API_KEY.quotaRmbPrecisionErrorMsg,
    drawerTitle,
  );
}

async function expectApiKeyDescriptionLengthError(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormFieldError(
    page,
    '描述',
    DOC_API_KEY.descriptionLengthErrorMsg,
    drawerTitle,
  );
}

async function expectApiKeyMaxConcurrencyMaxError(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectApiKeyFormInlineError(
    page,
    '最大并发',
    DOC_API_KEY.maxConcurrencyMaxErrorMsg,
    drawerTitle,
  );
}

async function expectApiKeyFormSelectValue(
  page,
  label,
  value,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const formItem = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: label })
    .first();
  await expect(formItem.locator('.ivu-select-selection')).toContainText(value);
}

async function expectApiKeyAllowedModelDefault(
  page,
  model = '全部模型',
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  await expectElDrawerFieldSelectedContains(
    page,
    drawerTitle,
    '允许模型',
    model,
  );
}

async function searchApiKeyByDescription(page, keyword) {
  // 搜索是 pageTable 纯前端过滤（serverPagination=false），不触发 GET /api-keys，
  // 不要包 waitForApiKeysListResponse，否则每次搜索必然 15s 超时后重放，白白浪费时间
  await apiKeyTable(page).search(keyword, API_KEY_SEARCH_PLACEHOLDER);
}

function apiKeySearchStatusSelect(page) {
  return apiKeyTable(page).searchArea().locator('.ivu-select').nth(0);
}

async function selectApiKeyStatusFilter(page, status) {
  const trigger = apiKeySearchStatusSelect(page);
  await expect(trigger).toBeVisible({ timeout: 15000 });
  const currentValue = ((await trigger.innerText()) || '').replace(/\s+/g, '');
  if (currentValue.includes(status)) {
    return;
  }
  await waitForApiKeysListResponse(page, () =>
    new IvuSelectComponent(page, trigger).selectOptionExact(status),
  );
}

async function clearApiKeyStatusFilter(page) {
  const trigger = apiKeySearchStatusSelect(page);
  await waitForApiKeysListResponse(page, async () => {
    const clearIcon = trigger.locator('.ivu-icon-ios-close');
    if ((await clearIcon.count()) > 0) {
      await clearIcon.click();
    } else {
      await trigger.click();
      await page.keyboard.press('Escape');
    }
  });
}

async function searchApiKeyByKeyValue(page, keyword) {
  // 列表 Key 列展示为前 8 位 + **** + 后 4 位，前端搜索按展示文本匹配
  const searchKey =
    keyword && keyword.length > 8 ? keyword.slice(0, 8) : keyword;
  // 纯前端过滤，不触发 GET /api-keys，直接搜索（同 searchApiKeyByDescription）
  await apiKeyTable(page).search(searchKey, API_KEY_SEARCH_PLACEHOLDER_KEY);
}

async function searchApiKeyByKeyId(page, keyId) {
  // Key ID 搜索在表格搜索区域，placeholder 为 "请输入Key ID查询"；纯前端过滤
  await apiKeyTable(page).search(keyId, '请输入Key ID查询');
}

async function filterApiKeyByRateLimitStatus(page, status) {
  // 限流状态下拉框在搜索区域，使用 placeholder 或 label 定位
  const searchArea = apiKeyTable(page).searchArea();
  const selectTrigger = searchArea
    .locator('.ivu-select')
    .filter({ hasText: /限流状态|请选择限流状态/ });
  let trigger;
  if ((await selectTrigger.count()) === 0) {
    // 通常限流状态是最后一个 select
    const allSelects = searchArea.locator('.ivu-select');
    const count = await allSelects.count();
    trigger = allSelects.nth(count - 1);
  } else {
    trigger = selectTrigger;
  }
  // 如果选择"全部"，点击清除图标
  if (status === '全部') {
    await waitForApiKeysListResponse(page, async () => {
      const clearIcon = trigger.locator('.ivu-icon-ios-close');
      if ((await clearIcon.count()) > 0) {
        await clearIcon.click();
      } else {
        await trigger.click();
        await page.keyboard.press('Escape');
      }
    });
    return;
  }
  await trigger.click();
  // iView 下拉列表 teleported 到 body，需全局查找选项
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: status })
    .click();
  await waitForApiKeysListResponse(page, async () => {
    await page.waitForTimeout(500);
  });
}

async function selectApiKeyEntityFilter(page, entityName) {
  const table = apiKeyTable(page);
  const trigger = table
    .searchArea()
    .locator('.ivu-form-item')
    .filter({ hasText: 'Entity' })
    .locator('.ivu-select')
    .first();
  if ((await trigger.count()) === 0) {
    throw new Error('Entity筛选下拉框不存在');
  }
  await new IvuSelectComponent(page, trigger).selectOption(entityName);
  await page.waitForTimeout(1000);
}

async function selectApiKeyQuotaTypeFilter(page, quotaType) {
  const table = apiKeyTable(page);
  const trigger = table
    .searchArea()
    .locator('.ivu-form-item')
    .filter({ hasText: '配额类型' })
    .locator('.ivu-select')
    .first();
  if ((await trigger.count()) === 0) {
    throw new Error('配额类型筛选下拉框不存在');
  }
  await new IvuSelectComponent(page, trigger).selectOption(quotaType);
  await page.waitForTimeout(1000);
}

async function expectApiKeyVisible(page, description, timeout) {
  await apiKeyTable(page).expectRowVisible(description, timeout);
}

async function expectApiKeyNotVisible(page, description, timeout) {
  await apiKeyTable(page).expectRowHidden(description, timeout);
}

async function expectApiKeyVisibleInAllPages(
  page,
  description,
  timeout = 30000,
) {
  const table = apiKeyTable(page);
  try {
    await table.expectRowVisible(description, timeout);
    return;
  } catch (e) {
    common.log('第一页未找到 API-Key，尝试翻页查找...');
  }

  const pagination = table.pagination();
  const pageCount = await pagination.getByRole('listitem').count();

  for (let i = 2; i <= pageCount; i++) {
    await waitForApiKeysListResponse(page, () => table.clickPageNumber(i));
    try {
      await table.expectRowVisible(description, timeout);
      return;
    } catch (err) {
      common.log('第' + i + '页未找到 API-Key');
    }
  }

  throw new Error('在所有页面中未找到 API-Key: ' + description);
}

async function clickDeleteApiKeyBtn(page, description) {
  await apiKeyTable(page).rowAction(description, '删除').click();
  await page.waitForTimeout(500);
}

async function clickApiKeyManageRouteRulesBtn(page, keyDescription) {
  const row = page.locator('tr').filter({ hasText: keyDescription }).first();
  await row.getByRole('button', { name: '管理路由规则' }).click();
}

async function expectDeleteApiKeyConfirmModal(page, description) {
  await ivuModal(page).expectText('是否删除API Key 管理 ' + description);
}

async function confirmDeleteApiKey(page) {
  await ivuModal(page).confirm();
}

async function confirmDeleteApiKeyAndWaitForSuccess(page) {
  await new IvuMessageComponent(page).waitForTextDuringAction('删除成功', () =>
    waitForApiKeysListResponse(page, () => confirmDeleteApiKey(page)),
  );
  await waitAfterApiKeyMutation(page);
}

async function cancelDeleteApiKey(page) {
  await ivuModal(page).cancel('取消');
}

async function deleteApiKeyAndWait(page, description) {
  await clickDeleteApiKeyBtn(page, description);
  await expectDeleteApiKeyConfirmModal(page, description);
  await confirmDeleteApiKeyAndWaitForSuccess(page);
}

async function waitForApiKeysListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api-keys') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    if (e.message.includes('Timeout')) {
      // 超时说明 action 未触发 GET /api-keys（如纯前端搜索/过滤/分页）。
      // 不要重放 action，否则会导致重复搜索、重复点击等副作用
      await waitForPageSettled(page, 2000);
      return null;
    }
    throw e;
  }
}

async function waitAfterApiKeyMutation(page) {
  await waitForPageSettled(page, 1500);
}

async function waitAfterApiKeyAction(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function reloadApiKeyManagementPage(page) {
  await waitForApiKeysListResponse(page, () =>
    page.reload({ waitUntil: 'domcontentloaded' }),
  );
  await waitForApiKeyManagementShell(page);
  await waitAfterApiKeyMutation(page);
}

async function ensureApiKeyRowVisible(page, description) {
  await searchApiKeyByDescription(page, description);
  await expectApiKeyVisibleInAllPages(page, description);
}

async function expectApiKeyRowContainsText(page, description, text) {
  const row = apiKeyTable(page).rowByText(description);
  await expect(row).toContainText(text);
}

async function expectApiKeyDetailVisible(page) {
  await expectApiKeyDetailDrawerOpen(page);
}

/** API-Key 详情抽屉：配额总量以 ¥ 前缀展示，证明 unit=RMB（详情无单位文本，RMB 时金额带 ¥） */
async function expectApiKeyDetailQuotaRmb(page) {
  const drawer = apiKeyDetailDrawer(page);
  const row = drawer
    .locator('.info-row')
    .filter({ hasText: '配额总量' })
    .first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row).toContainText('¥');
}

async function closeApiKeyDetail(page) {
  await apiKeyDetailDrawer(page).locator('.ivu-drawer-close').click();
}

async function clickResetApiKeyQuotaBtn(page) {
  const drawer = apiKeyDetailDrawer(page);
  const resetBtn = drawer.getByRole('button', { name: '重置配额' });
  await expect(resetBtn).toBeVisible({ timeout: 10000 });
  await resetBtn.click();
  await page.waitForTimeout(500);
}

async function resetApiKeyQuota(page, total, reason) {
  await clickResetApiKeyQuotaBtn(page);
  await expectResetQuotaDrawerOpen(page);
  await fillResetQuotaForm(page, total, reason);
  await submitResetQuotaFormAndWaitForSuccess(page);
}

async function normalizeCreateApiKeyPayload(page, data) {
  const payload = { ...data };
  if (payload.status !== undefined) {
    payload.enabled = payload.status === 'enabled' || payload.status === true;
    delete payload.status;
  }
  if (payload.entity_name) {
    const entity = await findEntityByNameViaApi(page, payload.entity_name);
    if (entity?.id) {
      payload.entity_id = entity.id;
    }
    delete payload.entity_name;
  }
  if (payload.quota) {
    const quota = payload.quota;
    payload.quota_plan = {
      unlimited: quota.unlimited ?? false,
      pass_when_no_enough_quota: quota.pass_when_no_enough_quota ?? false,
      quota: quota.quota ?? quota.total ?? 0,
      unit: quota.unit ?? 'total_token',
      reset_period: quota.reset_period ?? quota.reset_cycle ?? 'monthly',
    };
    delete payload.quota;
  }
  return payload;
}

async function createApiKeyViaApi(page, data) {
  try {
    const userData = await getUserData(page);
    const payload = await normalizeCreateApiKeyPayload(page, data);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/api-keys',
      {
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口创建 API-Key 响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      return responseBody.Data;
    }
    return null;
  } catch (error) {
    common.log('接口创建 API-Key 异常: ' + error.message);
    return null;
  }
}

async function createApiKeyViaApiAndAssert(page, data) {
  const apiKey = await createApiKeyViaApi(page, data);
  expect(apiKey?.id, '接口创建 API-Key 失败').toBeTruthy();
  return apiKey;
}

async function deleteApiKeyViaApi(page, apiKeyId) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/api-keys/' + apiKeyId,
      {
        headers: {
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口删除 API-Key 响应: ' + JSON.stringify(responseBody));
    return responseBody.ErrNum === 200;
  } catch (error) {
    common.log('接口删除 API-Key 异常: ' + error.message);
    return false;
  }
}

async function createApiKeyWithQuotaViaUI(page, description, quota) {
  await openAddApiKeyDrawer(page);
  await fillApiKeyDescription(page, description);
  await selectApiKeyUnlimitedQuota(page, '否');
  if (quota.total !== undefined) {
    await fillApiKeyQuotaTotal(page, quota.total);
  }
  if (quota.unit !== undefined) {
    await selectApiKeyQuotaUnit(page, quota.unit);
  }
  if (quota.resetCycle !== undefined) {
    await selectApiKeyResetCycle(page, quota.resetCycle);
  }
  await submitApiKeyFormAndWaitForSuccess(page);
}

async function submitCreateApiKeyFormAndWait(page, formData) {
  await fillApiKeyBasicForm(page, formData);
  await submitApiKeyFormAndWaitForSuccess(page);
}

async function fillApiKeyRateLimitForm(
  page,
  rateLimit,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  if (rateLimit.enable !== undefined) {
    await selectApiKeyEnableRateLimit(
      page,
      rateLimit.enable ? '是' : '否',
      drawerTitle,
    );
  }
  if (rateLimit.tpm) {
    await addApiKeyRateLimitRule(page, 'TPM', rateLimit.tpm, drawerTitle);
  }
  if (rateLimit.rpm) {
    await addApiKeyRateLimitRule(page, 'RPM', rateLimit.rpm, drawerTitle);
  }
  if (rateLimit.maxConcurrency !== undefined) {
    await fillApiKeyMaxConcurrency(page, rateLimit.maxConcurrency, drawerTitle);
  }
}

async function fillApiKeyBasicForm(
  page,
  formData,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  if (formData.description !== undefined) {
    await fillApiKeyDescription(page, formData.description, drawerTitle);
  }
  if (formData.foreverExpiry) {
    await selectApiKeyExpiryForever(page, drawerTitle);
  }
  if (formData.status !== undefined) {
    await selectApiKeyStatus(page, formData.status, drawerTitle);
  }
  if (formData.quotaCheck !== undefined) {
    await selectApiKeyQuotaCheck(page, formData.quotaCheck, drawerTitle);
  }
  if (formData.allowedModel !== undefined) {
    await selectApiKeyAllowedModel(page, formData.allowedModel, drawerTitle);
  }
  if (formData.subnets !== undefined) {
    await fillApiKeyAllowedSubnets(page, formData.subnets, drawerTitle);
  }
  if (formData.entityName !== undefined) {
    await selectApiKeyEntity(page, formData.entityName, drawerTitle);
  }
  if (formData.unlimitedQuota !== undefined) {
    await selectApiKeyUnlimitedQuota(
      page,
      formData.unlimitedQuota ? '是' : '否',
      drawerTitle,
    );
  }
  if (formData.quotaTotal !== undefined) {
    await fillApiKeyQuotaTotal(page, formData.quotaTotal, drawerTitle);
  }
  if (formData.quotaUnit !== undefined) {
    await selectApiKeyQuotaUnit(page, formData.quotaUnit, drawerTitle);
  }
  if (formData.resetCycle !== undefined) {
    await selectApiKeyResetCycle(page, formData.resetCycle, drawerTitle);
  }
  if (
    formData.enableRateLimit !== undefined ||
    formData.tpmRule ||
    formData.rpmRule ||
    formData.maxConcurrency !== undefined
  ) {
    await fillApiKeyRateLimitForm(
      page,
      {
        enable: formData.enableRateLimit,
        tpm: formData.tpmRule,
        rpm: formData.rpmRule,
        maxConcurrency: formData.maxConcurrency,
      },
      drawerTitle,
    );
  }
}

async function prepareApiKeyForTest(page, data) {
  const apiKey = await createApiKeyViaApi(page, data);
  await reloadApiKeyManagementPage(page);
  return apiKey;
}

module.exports = {
  gotoApiKeyManagementPage,
  expectApiKeyManagementPageTitle,
  expectAddApiKeyButtonVisible,
  expectApiKeyTableVisible,
  expectApiKeyPageLayout,
  openAddApiKeyDrawer,
  openEditApiKeyDrawer,
  openApiKeyDetail,
  selectApiKeyFormSelect,
  fillApiKeyDescription,
  fillApiKeyDescriptionRaw,
  selectApiKeyExpiryForever,
  selectApiKeyExpiryLimited,
  selectApiKeyStatus,
  selectApiKeyQuotaCheck,
  selectApiKeyAllowedModel,
  fillApiKeyAllowedSubnets,
  clearApiKeyAllowedSubnets,
  selectApiKeyEntity,
  clearApiKeyEntity,
  selectApiKeyUnlimitedQuota,
  fillApiKeyQuotaTotal,
  fillApiKeyQuotaTotalAndBlur,
  setApiKeyQuotaTotalModel,
  clearApiKeyQuotaTotal,
  selectApiKeyQuotaUnit,
  selectApiKeyResetCycle,
  selectApiKeyEnableRateLimit,
  addApiKeyRateLimitRule,
  apiKeyRateLimitSection,
  clickAddApiKeyRateLimitRule,
  fillApiKeyRateLimitRuleFieldRaw,
  clearApiKeyRateLimitRuleField,
  setApiKeyRateLimitRuleFieldModel,
  setupApiKeyCreateWithRateLimit,
  submitApiKeyFormExpectRateLimitError,
  selectApiKeyMaxConcurrencyOption,
  fillApiKeyMaxConcurrency,
  clearApiKeyMaxConcurrency,
  prepareApiKeyRateLimitRequiredState,
  triggerApiKeyRateLimitEnabledValidate,
  fillApiKeyMaxConcurrencyAndBlur,
  submitApiKeyForm,
  submitApiKeyFormAndWaitForSuccess,
  submitApiKeyFormAndWaitForEditSuccess,
  cancelApiKeyForm,
  expectAddApiKeyDrawerOpen,
  expectAddApiKeyDrawerHidden,
  expectApiKeyFormFieldError,
  expectApiKeyFormInlineError,
  expectApiKeyRateLimitRequired,
  expectApiKeyQuotaTotalRequired,
  expectApiKeyQuotaIntegerError,
  expectApiKeyQuotaMaxError,
  expectApiKeyQuotaRmbMaxError,
  expectApiKeyQuotaRmbPrecisionError,
  expectApiKeyDescriptionLengthError,
  expectApiKeyMaxConcurrencyMaxError,
  expectApiKeyFormSelectValue,
  expectApiKeyAllowedModelDefault,
  searchApiKeyByDescription,
  searchApiKeyByKeyValue,
  searchApiKeyByKeyId,
  apiKeySearchStatusSelect,
  selectApiKeyStatusFilter,
  clearApiKeyStatusFilter,
  filterApiKeyByRateLimitStatus,
  selectApiKeyEntityFilter,
  selectApiKeyQuotaTypeFilter,
  expectApiKeyVisible,
  expectApiKeyNotVisible,
  expectApiKeyVisibleInAllPages,
  clickDeleteApiKeyBtn,
  clickApiKeyManageRouteRulesBtn,
  expectDeleteApiKeyConfirmModal,
  confirmDeleteApiKey,
  confirmDeleteApiKeyAndWaitForSuccess,
  cancelDeleteApiKey,
  deleteApiKeyAndWait,
  waitForApiKeysListResponse,
  waitAfterApiKeyMutation,
  waitAfterApiKeyAction,
  reloadApiKeyManagementPage,
  ensureApiKeyRowVisible,
  expectApiKeyRowContainsText,
  expectApiKeyDetailVisible,
  expectApiKeyDetailQuotaRmb,
  closeApiKeyDetail,
  clickResetApiKeyQuotaBtn,
  resetApiKeyQuota,
  normalizeCreateApiKeyPayload,
  createApiKeyViaApi,
  createApiKeyViaApiAndAssert,
  deleteApiKeyViaApi,
  findApiKeyByDescriptionViaApi,
  findApiKeyByIdViaApi,
  createApiKeyWithQuotaViaUI,
  submitCreateApiKeyFormAndWait,
  fillApiKeyRateLimitForm,
  fillApiKeyBasicForm,
  prepareApiKeyForTest,
};
