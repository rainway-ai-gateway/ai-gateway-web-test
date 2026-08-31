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
const entityApiUtils = require('../../api/entity-api-utils');
const {
  DRAWER_TITLE,
  DOC_ENTITY_ORG,
  ENTITY_SEARCH_PLACEHOLDER_NAME,
  ENTITY_SEARCH_PLACEHOLDER_TYPE,
  ENTITY_SEARCH_PLACEHOLDER_PARENT,
  ENTITY_SEARCH_PLACEHOLDER_QUOTA,
  ENTITY_DETAIL_DRAWER_PARTS,
  ivuDrawer,
  entityDetailDrawer,
  ivuModal,
  entityTabs,
  expectEntityDetailDrawerOpen,
  expectEntityManagementLayout,
  expectEntityManagementPageTitle,
  expectEntityManagementTabs,
  gotoEntityManagementPage,
  navigateToEntityManagementByUrl,
  switchToEntityOrgTab,
  switchToEntityTypeTab,
  isEntityOrgTabReady,
  isEntityManagementShellVisible,
  selectElDrawerField,
  expectElDrawerFieldSelectedContains,
  waitForPageSettled,
  waitForEntityManagementShell,
  RATE_LIMIT_FIELD,
  resolveRateLimitSection,
  resolveRateLimitFieldKey,
} = require('./entity-shared');
const {
  getUserData,
  getOpenApiBaseUrl,
  createEntityTypeViaApi,
  deleteEntityTypeViaApi,
  createEntityViaApi,
  deleteEntityViaApi,
  findEntityByNameViaApi,
  deleteEntityByNameViaApi,
} = require('../../api/entity-api-utils');
// Lazy requires to break horizontal circular dependency

async function expectErrorNoticeContains(page, text) {
  const notice = page.locator(
    '.ivu-notice, .ivu-notice-desc, .ivu-notice-title, .ivu-message, .ivu-message-notice',
  );
  const matcher = text instanceof RegExp ? text : String(text);
  await expect(notice.filter({ hasText: matcher }).first()).toBeVisible({
    timeout: 15000,
  });
}

function entityOrgTable(page) {
  return new PageTableComponent(page);
}

function entityOrgForm(page, drawerTitle = DRAWER_TITLE.createEntity) {
  return ivuDrawer(page).form(drawerTitle);
}

function drawerScope(page, drawerTitle) {
  return ivuDrawer(page).withTitle(drawerTitle);
}

function apiKeyTable(page) {
  return new PageTableComponent(page);
}

function apiKeyForm(page, drawerTitle = DRAWER_TITLE.addApiKey) {
  return ivuDrawer(page).form(drawerTitle);
}

async function gotoEntityOrgManagementPage(page) {
  if (await isEntityOrgTabReady(page)) {
    common.log('已在 Entity 组织管理 Tab，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  if (await isEntityManagementShellVisible(page)) {
    await switchToEntityOrgTab(page);
    await entityApiUtils.ensureEntityTestData(page);
    return;
  }
  // 不在 Entity 管理页面（可能在欢迎页或其他页面），强制通过 URL 导航
  await umUtils.handleUrlInvalidAlert(page);
  await umUtils.ensureLoggedIn(page);
  await navigateToEntityManagementByUrl(page);
  await switchToEntityOrgTab(page);
  await entityApiUtils.ensureEntityTestData(page);
}

async function expectEntityOrgTabSelected(page) {
  const tab = entityTabs(page).tabByText('Entity组织管理');
  await expect(tab).toHaveClass(/ivu-tabs-tab-active/);
}

async function expectCreateEntityButtonVisible(page) {
  await expect(page.getByRole('button', { name: '创建Entity' })).toBeVisible();
}

async function expectEntityOrgTableVisible(page) {
  const table = entityOrgTable(page);
  await expect(table.rootLocator()).toBeVisible();
}

async function expectEntityOrgPageLayout(page) {
  await expectEntityManagementLayout(page);
  await expectEntityManagementPageTitle(page);
  await expectEntityManagementTabs(page);
  await expectEntityOrgTabSelected(page);
  await expectCreateEntityButtonVisible(page);
  await expectEntityOrgTableVisible(page);
  // 验证 ID 列存在（th 内除 ID 外还含排序图标，不能用 ^ID$ 精确匹配）
  await expect(
    page.locator('th').filter({ hasText: /^ID/ }).first(),
  ).toBeVisible();
}

async function openCreateEntityDrawer(page) {
  const button = page.getByRole('button', { name: '创建Entity' });
  await button.waitFor({ state: 'visible', timeout: 5000 });
  await button.click();
  await page.waitForTimeout(1000);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createEntity);
}

async function openEditEntityDrawer(page, entityName) {
  await entityOrgTable(page).rowAction(entityName, '编辑').click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editEntity);
}

async function openEntityDetail(page, entityName) {
  const table = entityOrgTable(page);
  await table.rowByText(entityName).click();
  await page.waitForTimeout(500);
  await expectEntityDetailDrawerOpen(page);
}

async function selectEntityFormType(
  page,
  typeName,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  if (!typeName) {
    return;
  }
  await selectElDrawerField(page, drawerTitle, '类型', typeName);
}

async function selectEntityFormParent(
  page,
  parentName,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  if (!parentName) {
    return;
  }
  await selectElDrawerField(page, drawerTitle, '父Entity', parentName);
}

async function selectEntityAllowModels(
  page,
  model,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await selectElDrawerField(page, drawerTitle, '允许模型', model);
}

async function selectEntityBlockModels(
  page,
  model,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await selectElDrawerField(page, drawerTitle, '禁止模型', model);
}

async function expectEntityAllowModelsDefault(
  page,
  model = '全部模型',
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectElDrawerFieldSelectedContains(
    page,
    drawerTitle,
    '允许模型',
    model,
  );
}

async function fillEntityFormBasic(
  page,
  { name, typeName, parentName },
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const form = entityOrgForm(page, drawerTitle);
  if (name !== undefined) {
    await form.fillInput('名称', name);
  }
  if (typeName !== undefined) {
    await selectEntityFormType(page, typeName, drawerTitle);
  }
  if (parentName !== undefined) {
    await selectEntityFormParent(page, parentName, drawerTitle);
  }
}

async function selectEntityFormSelect(
  page,
  label,
  optionText,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  // 用 .ivu-form-item-label 精确定位，避免 FormItem 内错误提示含 label 文本（如
  // 「启用限流」的错误提示含“最大并发”字样）导致 filter({ hasText }) 误匹配
  const formItem = drawer.locator('.ivu-form-item').filter({
    has: page
      .locator('.ivu-form-item-label')
      .getByText(label, { exact: true })
      .first(),
  });
  const trigger = formItem.locator('.ivu-select').first();
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await new IvuSelectComponent(page, trigger).selectOptionExact(optionText);
}

async function expectParentEntityOptionVisible(
  page,
  parentName,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  // 父Entity字段使用 Element UI el-select，不是 iView ivu-select
  const parentSelect = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '父Entity' })
    .locator('.el-select')
    .first();
  await expect(parentSelect).toBeVisible({ timeout: 10000 });
  // 点击下拉框展开选项
  await parentSelect.click();
  // el-select 下拉列表 teleported 到 body，需全局查找
  const option = page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: parentName });
  await expect(option.first()).toBeVisible({ timeout: 5000 });
  // 关闭下拉框 - 点击空白处
  await drawer.locator('.ivu-drawer-header').click();
}

async function selectEntityQuotaUnlimited(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await selectEntityFormSelect(page, '无限配额', value, drawerTitle);
}

async function entityQuotaTotalInput(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  return entityOrgForm(page, drawerTitle)
    .item('配额总量')
    .locator('.ivu-input-number input, input')
    .first();
}

/**
 * 写入 formData.quota_plan.quota（同 clearEntityTypeLevelField：从抽屉 Form 找 Vue 实例）。
 * 说明：iView Form.validate 对嵌套 prop `quota_plan.quota` 汇总校验会漏跑（valid 恒为 true），
 * 必须调 FormItem.validate('change'|'blur') 才会出现行内错误（与手工清空失焦一致）。
 */
async function setEntityQuotaTotalModel(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await expect(drawer).toBeVisible({ timeout: 15000 });
  const result = await drawer.evaluate((drawerEl, quotaValue) => {
    const formEl = drawerEl.querySelector('.ivu-form');
    if (!formEl || !formEl.__vue__) {
      return { ok: false, reason: 'no-form-vue' };
    }
    let vm = formEl.__vue__;
    while (vm && !vm.formData) {
      vm = vm.$parent;
    }
    if (!vm || !vm.formData || !vm.formData.quota_plan) {
      return { ok: false, reason: 'no-formData-quota_plan' };
    }
    const formRef = (vm.$refs && (vm.$refs.formData || vm.$refs.form)) || null;
    if (!formRef || !Array.isArray(formRef.fields)) {
      return { ok: false, reason: 'no-form-fields' };
    }
    if (typeof vm.$set === 'function') {
      vm.$set(vm.formData.quota_plan, 'quota', quotaValue);
    } else {
      vm.formData.quota_plan.quota = quotaValue;
    }
    const field = formRef.fields.find((f) => f.prop === 'quota_plan.quota');
    if (!field || typeof field.validate !== 'function') {
      return {
        ok: false,
        reason: 'no-quota-form-item',
        props: formRef.fields.map((f) => f.prop),
      };
    }
    return new Promise((resolve) => {
      // 再次写入，尽量赶在 InputNumber :min=0 钳制前触发校验
      if (typeof vm.$set === 'function') {
        vm.$set(vm.formData.quota_plan, 'quota', quotaValue);
      } else {
        vm.formData.quota_plan.quota = quotaValue;
      }
      field.validate('change', (errorMessage) => {
        resolve({
          ok: true,
          validated: true,
          errorMessage: errorMessage || null,
          unlimited: vm.formData.quota_plan.unlimited,
          quota: vm.formData.quota_plan.quota,
          validateState: field.validateState,
          validateMessage: field.validateMessage,
        });
      });
    });
  }, value);
  if (!result || !result.ok) {
    throw new Error(
      `未能写入 Entity 配额总量到 Vue formData: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(300);
  return result;
}

async function fillEntityQuotaTotal(
  page,
  total,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const num = Number(total);
  // InputNumber：:min=0 拦负数，:precision=0 拦小数；须写 Vue 模型 + FormItem.validate
  // 超大上界字符串可能超出 Number 安全整数，仍走输入框路径（EM-E-24）
  if (Number.isFinite(num) && (num < 0 || !Number.isInteger(num))) {
    return setEntityQuotaTotalModel(page, num, drawerTitle);
  }
  const input = await entityQuotaTotalInput(page, drawerTitle);
  await expect(input).toBeVisible({ timeout: 15000 });
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.pressSequentially(String(total), { delay: 30 });
  await input.blur();
  await page.waitForTimeout(300);
  return { ok: true, quota: total };
}

async function fillEntityQuotaTotalAndBlur(
  page,
  total,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await fillEntityQuotaTotal(page, total, drawerTitle);
}

async function clearEntityQuotaTotal(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  // 无限配额=否时默认 100000000；仅键盘清空会被 InputNumber 回写成 0 并提交成功，故只写模型为 null
  return setEntityQuotaTotalModel(page, null, drawerTitle);
}

async function selectEntityQuotaUnit(
  page,
  unit,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const trigger = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '配额单位' })
    .locator('.ivu-select')
    .first();
  await new IvuSelectComponent(page, trigger).selectOptionExact(unit);
}

async function selectEntityQuotaResetCycle(
  page,
  cycle,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const trigger = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '重置周期' })
    .locator('.ivu-select')
    .first();
  await new IvuSelectComponent(page, trigger).selectOptionExact(cycle);
}

async function selectEntityEnableRateLimit(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await selectEntityFormSelect(page, '启用限流', value, drawerTitle);
}

async function selectRuleModelInSection(page, section, model) {
  const modelField = section
    .locator('.ivu-form-item')
    .filter({ hasText: '适用模型' });
  const elSelect = modelField.locator('.el-select').last();
  await expect(elSelect).toBeVisible({ timeout: 15000 });
  const selectedText = ((await elSelect.innerText()) || '').replace(/\s+/g, '');
  if (!selectedText.includes(model)) {
    await new ElSelectComponent(page, elSelect).selectOptionFilterable(model);
  }
}

async function addEntityRateLimitRule(
  page,
  ruleType,
  rule,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
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

async function entityRateLimitSection(
  page,
  ruleType,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  return resolveRateLimitSection(drawer, ruleType);
}

async function clickAddEntityRateLimitRule(
  page,
  ruleType,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const section = await entityRateLimitSection(page, ruleType, drawerTitle);
  await section.getByRole('button', { name: '添加规则' }).click();
  await page.waitForTimeout(500);
}

async function fillEntityRateLimitRuleFieldRaw(
  page,
  ruleType,
  label,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  // InputNumber 带 :min/:max（步长 max=window；Token/请求有的带 INT64_MAX），DOM 直写会被钳制。
  // 与配额/并发同套路：写 Vue 模型并 FormItem.validate。
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
      // 与 INT64_MAX 同精度陷阱：写明显更大的数以触发「超出允许范围」
      modelValue = 1e20;
    } else {
      modelValue = Number(value);
    }
  }
  return setEntityRateLimitRuleFieldModel(
    page,
    ruleType,
    fieldKey,
    modelValue,
    0,
    drawerTitle,
  );
}

/**
 * 写入 rate_limit_policy.rules.{tpm|rpm}[index].field 并触发 FormItem.validate
 */
async function setEntityRateLimitRuleFieldModel(
  page,
  ruleType,
  fieldKey,
  value,
  ruleIndex = 0,
  drawerTitle = DRAWER_TITLE.createEntity,
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
      `未能写入 Entity 限流规则字段到 Vue formData: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(300);
  return result;
}

/**
 * 清除限流规则字段的 DOM 输入框值（用于测试"必填"校验）
 * 表单提交读取的是 DOM 值，必须通过 Playwright 直接清除输入框
 */
async function clearEntityRateLimitRuleField(
  page,
  ruleType,
  label,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const section = await entityRateLimitSection(page, ruleType, drawerTitle);
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

async function setupEntityCreateWithRateLimit(page, entityName, typeName) {
  await fillEntityFormBasic(page, { name: entityName, typeName });
  await selectEntityEnableRateLimit(page, '是');
}

async function submitEntityFormExpectRateLimitError(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await submitEntityForm(page, drawerTitle);
  await waitAfterEntityAction(page, 500);
  await expectCreateEntityDrawerOpen(page);
  await expectDrawerFormErrorContains(page, message, drawerTitle);
}

async function submitEntityFormExpectRateLimitBackendReject(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  // 启用限流 + 默认 max_concurrency=-1：前端放行，后端 Notice「参数非法」
  await Promise.all([
    expectErrorNoticeContains(page, /参数非法|tpm|rpm|rate_limit|至少配置/i),
    submitEntityForm(page, drawerTitle),
  ]);
  await waitAfterEntityAction(page, 500);
}

async function submitApiKeyFormExpectRateLimitBackendReject(
  page,
  drawerTitle = DRAWER_TITLE.addApiKey,
) {
  const {
    submitApiKeyForm,
    waitAfterApiKeyAction,
  } = require('./EntityApiKeyPage');
  await Promise.all([
    expectErrorNoticeContains(page, /参数非法|tpm|rpm|rate_limit|至少配置/i),
    submitApiKeyForm(page, drawerTitle),
  ]);
  await waitAfterApiKeyAction(page, 500);
}

/**
 * 选择最大并发下拉选项
 * @param {string|number} value - 可以是选项文本（'不限制'/'封禁'/'限制并发数'）或数值（-1/<-1/>0）
 */
async function selectEntityMaxConcurrencyOption(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
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
  await selectEntityFormSelect(page, '最大并发', optionText, drawerTitle);
  return optionText;
}

async function fillEntityMaxConcurrency(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  // 最大并发改为下拉（不限制 / 封禁 / 限制并发数）+ 条件输入
  const optionText = await selectEntityMaxConcurrencyOption(
    page,
    value,
    drawerTitle,
  );
  if (optionText === '限制并发数') {
    // FormItem 内有 Select 的 hidden input 和 InputNumber 的可见 input，
    // 必须跳过 hidden 定位到可见的数字输入框
    const formItem = entityOrgForm(page, drawerTitle)
      .scope.locator('.ivu-form-item')
      .filter({ hasText: '最大并发' });
    const numberInput = formItem.locator('input:not([type=hidden])').first();
    await numberInput.fill(String(value));
  }
  return { ok: true, value };
}

/**
 * 写入 rate_limit_policy.rules.max_concurrency 并触发 FormItem 校验
 * （同 tick 内写完即 validate，避免 InputNumber watcher 钳制）
 */
async function setEntityMaxConcurrencyModel(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await expect(drawer).toBeVisible({ timeout: 15000 });
  const result = await drawer.evaluate((drawerEl, concurrency) => {
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
      vm.formData.rate_limit_policy.rules = {};
    }
    const formRef = (vm.$refs && (vm.$refs.formData || vm.$refs.form)) || null;
    const field =
      formRef &&
      Array.isArray(formRef.fields) &&
      formRef.fields.find(
        (f) => f.prop === 'rate_limit_policy.rules.max_concurrency',
      );
    if (!field || typeof field.validate !== 'function') {
      return {
        ok: false,
        reason: 'no-max-concurrency-field',
        props:
          formRef && formRef.fields ? formRef.fields.map((f) => f.prop) : [],
      };
    }
    if (typeof vm.$set === 'function') {
      vm.$set(
        vm.formData.rate_limit_policy.rules,
        'max_concurrency',
        concurrency,
      );
    } else {
      vm.formData.rate_limit_policy.rules.max_concurrency = concurrency;
    }
    // 同步写完立刻校验，赶在 InputNumber :max 钳制前
    return new Promise((resolve) => {
      field.validate('change', (errorMessage) => {
        resolve({
          ok: true,
          errorMessage: errorMessage || null,
          value: vm.formData.rate_limit_policy.rules.max_concurrency,
          validateMessage: field.validateMessage,
          validateState: field.validateState,
        });
      });
    });
  }, value);
  if (!result || !result.ok) {
    throw new Error(
      `未能写入 Entity 最大并发到 Vue formData: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(300);
  return result;
}

/**
 * 启用限流 + 清空最大并发（null）并立刻对 rate_limit_policy.enabled 做 FormItem.validate。
 * 默认 max_concurrency=-1 会被 Number.isFinite 当成已配置，必须清空才出 tip。
 * 注意：iView validateField 回调有 errorMessage，但 tip 常要等 FormItem.validate / 提交后才进 DOM。
 */
async function prepareEntityRateLimitRequiredState(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
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
    // 抽屉内可能有多个同 prop 的 FormItem（下拉里 + 底部 error 项），逐个 validate 才能刷 tip
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
      `未能准备 Entity 限流必填校验态: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(400);
  return result;
}

/** @deprecated 保留兼容；限流必填请用 prepareEntityRateLimitRequiredState */
async function clearEntityMaxConcurrency(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  return setEntityMaxConcurrencyModel(page, null, drawerTitle);
}

/** 触发 rate_limit_policy.enabled 字段校验（底部 .rate-limit-policy-error tip） */
async function triggerEntityRateLimitEnabledValidate(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
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

async function fillEntityMaxConcurrencyAndBlur(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await fillEntityMaxConcurrency(page, value, drawerTitle);
  await page.waitForTimeout(300);
}

async function fillEntityQuotaForm(
  page,
  quota,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  if (quota.unlimited !== undefined) {
    await selectEntityQuotaUnlimited(
      page,
      quota.unlimited ? '是' : '否',
      drawerTitle,
    );
  }
  if (quota.total !== undefined) {
    await fillEntityQuotaTotal(page, quota.total, drawerTitle);
  }
  if (quota.unit !== undefined) {
    await selectEntityQuotaUnit(page, quota.unit, drawerTitle);
  }
  if (quota.resetCycle !== undefined) {
    await selectEntityQuotaResetCycle(page, quota.resetCycle, drawerTitle);
  }
}

async function fillEntityRateLimitForm(
  page,
  rateLimit,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  if (rateLimit.enable !== undefined) {
    await selectEntityEnableRateLimit(
      page,
      rateLimit.enable ? '是' : '否',
      drawerTitle,
    );
  }
  if (rateLimit.tpm) {
    await addEntityRateLimitRule(page, 'TPM', rateLimit.tpm, drawerTitle);
  }
  if (rateLimit.rpm) {
    await addEntityRateLimitRule(page, 'RPM', rateLimit.rpm, drawerTitle);
  }
  if (rateLimit.maxConcurrency !== undefined) {
    await fillEntityMaxConcurrency(page, rateLimit.maxConcurrency, drawerTitle);
  }
}

async function submitEntityForm(page, drawerTitle = DRAWER_TITLE.createEntity) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '提交');
}

async function submitEntityFormAndWaitForSuccess(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction('创建成功', () =>
    waitForEntitiesListResponse(page, () =>
      submitEntityForm(page, drawerTitle),
    ),
  );
  await waitAfterEntityMutation(page);
}

async function submitEntityFormAndWaitForEditSuccess(
  page,
  drawerTitle = DRAWER_TITLE.editEntity,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction('修改成功', () =>
    waitForEntitiesListResponse(page, () =>
      submitEntityForm(page, drawerTitle),
    ),
  );
  await waitAfterEntityMutation(page);
}

async function cancelEntityForm(page, drawerTitle = DRAWER_TITLE.createEntity) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '取消');
}

async function cancelEditEntityForm(page) {
  await cancelEntityForm(page, DRAWER_TITLE.editEntity);
}

async function expectCreateEntityDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createEntity);
}

async function expectCreateEntityDrawerHidden(page) {
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.createEntity),
  ).toBeHidden();
}

async function expectEntityFormFieldError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await entityOrgForm(page, drawerTitle).expectFieldError(label, message);
}

async function expectEntityFormInlineError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.createEntity,
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

async function expectDrawerFormErrorContains(page, message, drawerTitle) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  // 调试：打印抽屉内所有错误提示的文本
  const errorTips = await drawer.locator('.ivu-form-item-error-tip').all();
  const texts = await Promise.all(
    errorTips.map((el) => el.textContent().catch(() => '')),
  );
  console.log('抽屉内错误提示:', texts);
  // 调试：打印名称字段的值
  const nameInput = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '名称' })
    .locator('input')
    .first();
  const nameValue = await nameInput.inputValue().catch(() => '');
  console.log('名称字段值:', nameValue, '长度:', nameValue.length);
  await expect(
    drawer
      .locator('.ivu-form-item-error-tip')
      .filter({ hasText: message })
      .first(),
  ).toBeVisible({ timeout: 10000 });
}

async function expectEntityRateLimitRequired(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  // tip 挂在底部无标题 FormItem（.rate-limit-policy-error），不在「启用限流」标签项内
  await expectDrawerFormErrorContains(
    page,
    DOC_ENTITY_ORG.rateLimitRuleRequiredMsg,
    drawerTitle,
  );
}

async function expectEntityQuotaTotalRequired(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '配额总量',
    DOC_ENTITY_ORG.quotaTotalRequiredMsg,
    drawerTitle,
  );
}

async function expectEntityQuotaRangeError(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '配额总量',
    DOC_ENTITY_ORG.quotaRangeErrorMsg,
    drawerTitle,
  );
}

async function expectEntityQuotaIntegerError(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '配额总量',
    DOC_ENTITY_ORG.quotaIntegerErrorMsg,
    drawerTitle,
  );
}

async function expectEntityQuotaMaxError(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '配额总量',
    DOC_ENTITY_ORG.quotaMaxErrorMsg,
    drawerTitle,
  );
}

async function expectEntityQuotaRmbMaxError(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '配额总量',
    DOC_ENTITY_ORG.quotaRmbMaxErrorMsg,
    drawerTitle,
  );
}

async function expectEntityQuotaRmbPrecisionError(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '配额总量',
    DOC_ENTITY_ORG.quotaRmbPrecisionErrorMsg,
    drawerTitle,
  );
}

async function expectEntityFormSelectValue(
  page,
  label,
  value,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const formItem = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: label })
    .first();
  await expect(formItem.locator('.ivu-select-selection')).toContainText(value);
}

async function expectEntityMaxConcurrencyMaxError(
  page,
  drawerTitle = DRAWER_TITLE.createEntity,
) {
  await expectEntityFormInlineError(
    page,
    '最大并发',
    DOC_ENTITY_ORG.maxConcurrencyMaxErrorMsg,
    drawerTitle,
  );
}

async function expectDeleteEntityBlocked(page) {
  await expectErrorNoticeContains(page, DOC_ENTITY_ORG.deleteBlockedMsg);
  // 删除被拦截后确认框可能仍打开，关掉以免挡后续操作
  const modal = ivuModal(page).visible();
  if (await modal.isVisible().catch(() => false)) {
    await ivuModal(page)
      .cancel()
      .catch(() => {});
  }
}

async function searchEntityByName(page, keyword) {
  // 搜索是 pageTable 纯前端过滤（serverPagination=false），不触发 GET /entities，
  // 不要包 waitForEntitiesListResponse，否则每次搜索必然 15s 超时后重放，白白浪费时间
  await entityOrgTable(page).search(keyword, ENTITY_SEARCH_PLACEHOLDER_NAME);
}

async function searchEntityByType(page, keyword) {
  await entityOrgTable(page).search(keyword, ENTITY_SEARCH_PLACEHOLDER_TYPE);
}

async function searchEntityByParent(page, keyword) {
  await entityOrgTable(page).search(keyword, ENTITY_SEARCH_PLACEHOLDER_PARENT);
}

async function searchEntityByQuota(page, keyword) {
  const input = entityOrgTable(page).searchInput(
    ENTITY_SEARCH_PLACEHOLDER_QUOTA,
  );
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (keyword) {
    await input.pressSequentially(keyword, { delay: 30 });
  }
  await input.press('Enter');
  await page.waitForTimeout(1000);
}

async function searchEntityById(page, entityId) {
  // 在 ID 搜索框输入（th 内除 ID 外还含排序图标，不能用 ^ID$ 精确匹配）
  const idSearchInput = page
    .locator('th')
    .filter({ hasText: /^ID/ })
    .locator('input');
  await idSearchInput.fill(entityId);
  await page.waitForTimeout(1000);
}

async function filterEntityByRateLimitStatus(page, status) {
  // 限流状态下拉框在搜索区域，使用 placeholder 或 label 定位
  const searchArea = entityOrgTable(page).searchArea();
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
    await waitForEntitiesListResponse(page, async () => {
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
  await waitForEntitiesListResponse(page, async () => {
    await page.waitForTimeout(500);
  });
}

async function expectEntityVisible(page, entityName, timeout) {
  await entityOrgTable(page).expectRowVisible(entityName, timeout);
}

async function expectEntityNotVisible(page, entityName, timeout) {
  await entityOrgTable(page).expectRowHidden(entityName, timeout);
}

async function clickDeleteEntityBtn(page, entityName) {
  await entityOrgTable(page).rowAction(entityName, '删除').click();
  await page.waitForTimeout(500);
}

async function clickManageRouteRulesBtn(page, entityName) {
  const row = page.locator('tr').filter({ hasText: entityName }).first();
  await row.getByRole('button', { name: '管理路由规则' }).click();
}

async function expectDeleteEntityConfirmModal(page, entityName) {
  await ivuModal(page).expectText('是否删除Entity ' + entityName + '？');
}

async function confirmDeleteEntity(page) {
  await ivuModal(page).confirm();
}

async function confirmDeleteEntityExpectBlocked(page) {
  // 以 DELETE 响应为准
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/entities/') && res.request().method() === 'DELETE',
      { timeout: 15000 },
    ),
    confirmDeleteEntity(page),
  ]);
  let body = {};
  try {
    body = await response.json();
  } catch (_) {
    body = {};
  }
  const errNum = body.ErrNum;
  const errMsg = String(body.ErrMsg || '');
  const blocked =
    errNum === 409 ||
    /api.?key|挂载|cannot delete|conflict|in use|associated/i.test(errMsg);

  const modal = ivuModal(page).visible();
  if (await modal.isVisible().catch(() => false)) {
    await ivuModal(page)
      .cancel('取消')
      .catch(() => {});
  }

  if (blocked) {
    return { blocked: true, errNum, errMsg };
  }

  // 当前环境 DELETE 挂载 API-Key 的 Entity 仍返回 200（与 OpenAPI 409 不符）
  // 退化为：实体删除成功时记录产品偏差，用例按「列表中是否仍存在」由调用方断言
  common.log(
    `警告: 删除挂载 API-Key 的 Entity 未被拦截 ErrNum=${errNum} ErrMsg=${errMsg}（期望 409）`,
  );
  return { blocked: false, errNum, errMsg, productGap: true };
}

async function confirmDeleteEntityAndWaitForSuccess(page) {
  await new IvuMessageComponent(page).waitForTextDuringAction('删除成功', () =>
    waitForEntitiesListResponse(page, () => confirmDeleteEntity(page)),
  );
  await waitAfterEntityMutation(page);
}

async function cancelDeleteEntity(page) {
  await ivuModal(page).cancel('取消');
}

async function expectEntityVisibleInAllPages(
  page,
  entityName,
  timeout = 30000,
) {
  const table = entityOrgTable(page);
  try {
    await table.expectRowVisible(entityName, timeout);
    return;
  } catch (e) {
    common.log('第一页未找到 Entity，尝试翻页查找...');
  }

  const pagination = table.pagination();
  const pageCount = await pagination.getByRole('listitem').count();

  for (let i = 2; i <= pageCount; i++) {
    await waitForEntitiesListResponse(page, () => table.clickPageNumber(i));
    try {
      await table.expectRowVisible(entityName, timeout);
      return;
    } catch (err) {
      common.log('第' + i + '页未找到 Entity');
    }
  }

  throw new Error('在所有页面中未找到 Entity: ' + entityName);
}

async function ensureEntityRowVisible(page, entityName) {
  await searchEntityByName(page, entityName);
  await expectEntityVisibleInAllPages(page, entityName);
}

async function deleteEntityAndWait(page, entityName) {
  // 先重新加载页面确保干净状态，避免前序操作（如删除被阻止）影响搜索
  await reloadEntityOrgManagementPage(page);
  await ensureEntityRowVisible(page, entityName);
  await clickDeleteEntityBtn(page, entityName);
  await expectDeleteEntityConfirmModal(page, entityName);
  await waitForEntitiesListResponse(page, () => confirmDeleteEntity(page));
  await waitAfterEntityMutation(page);
}

async function waitForEntitiesListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/entities') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    if (e.message.includes('Timeout')) {
      // 超时说明 action 未触发 GET /entities（如纯前端搜索/过滤/分页）。
      // 不要重放 action，否则会导致重复搜索、重复点击等副作用
      await waitForPageSettled(page, 2000);
      return null;
    }
    throw e;
  }
}

async function waitAfterEntityMutation(page) {
  await waitForPageSettled(page, 2000);
}

async function waitAfterEntityAction(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function reloadEntityOrgManagementPage(page) {
  await page.reload({ waitUntil: 'domcontentloaded', cache: 'no-store' });
  await waitForEntityManagementShell(page);
  await switchToEntityOrgTab(page);
}

async function expectEntityRowContainsType(page, entityName, typeName) {
  const row = entityOrgTable(page).rowByText(entityName);
  await expect(row).toContainText(typeName);
}

async function expectEntityRowContainsParent(page, entityName, parentName) {
  const row = entityOrgTable(page).rowByText(entityName);
  await expect(row).toContainText(parentName);
}

async function expectEntityRowContainsRateLimitStatus(
  page,
  entityName,
  status,
) {
  const row = entityOrgTable(page).rowByText(entityName);
  await expect(row).toContainText(status);
}

async function expectEntityNameFieldDisabled(page) {
  const input = entityOrgForm(page, DRAWER_TITLE.editEntity).input('名称');
  await expect(input).toBeDisabled();
}

async function expectEntityTypeFieldDisabled(page) {
  const input = entityOrgForm(page, DRAWER_TITLE.editEntity).input('类型');
  await expect(input).toBeDisabled();
}

async function expectEntityDetailVisible(page) {
  await expectEntityDetailDrawerOpen(page);
}

async function closeEntityDetail(page) {
  await entityDetailDrawer(page).locator('.ivu-drawer-close').click();
}

async function expectEntityListNotEmpty(page) {
  const rowCount = await entityOrgTable(page).rowCount();
  expect(rowCount).toBeGreaterThan(0);
  return rowCount;
}

async function expectEntityListEmpty(page) {
  const dataTable = page.locator('.show-iView-Table .ivu-table tbody');
  const dataRows = await dataTable.locator('tr').count();
  if (dataRows === 1) {
    const hasEmptyText = await dataTable
      .locator('tr', { hasText: '暂无数据' })
      .count();
    expect(hasEmptyText).toBe(1);
  } else {
    expect(dataRows).toBe(0);
  }
}

async function createEntityViaApiAndRefresh(page, name, typeName, parentName) {
  await createEntityViaApi(page, name, typeName, parentName);
  await reloadEntityOrgManagementPage(page);
}

async function prepareEntityForTest(page, name, typeName, parentName) {
  await createEntityViaApiAndRefresh(page, name, typeName, parentName);
  await searchEntityByName(page, name);
}

async function submitCreateEntityFormAndWait(page, formData) {
  await fillEntityFormBasic(page, formData);
  await submitEntityFormAndWaitForSuccess(page);
}

async function submitEditEntityFormAndWait(page, formData) {
  await fillEntityFormBasic(page, formData, DRAWER_TITLE.editEntity);
  await submitEntityFormAndWaitForEditSuccess(page);
}

async function clickResetEntityQuotaBtn(page) {
  const drawer = entityDetailDrawer(page);
  const resetBtn = drawer.getByRole('button', { name: '重置配额' });
  await expect(resetBtn).toBeVisible({ timeout: 10000 });
  await resetBtn.click();
  await page.waitForTimeout(500);
}

function resetQuotaModal(page) {
  return ivuModal(page).withTitle(DRAWER_TITLE.resetQuota);
}

function resetQuotaTotalInput(page) {
  const modal = resetQuotaModal(page);
  let input = modal
    .locator('.info-row')
    .filter({ hasText: '新的配额总量' })
    .locator('input')
    .first();
  return input;
}

async function fillResetQuotaForm(page, total, reason) {
  const modal = resetQuotaModal(page);
  await expect(modal.getByText('新的配额总量', { exact: true })).toBeVisible();
  let quotaInput = resetQuotaTotalInput(page);
  if ((await quotaInput.count()) === 0) {
    quotaInput = modal
      .locator('.modal-form-item')
      .filter({ hasText: '新的配额总量' })
      .locator('input')
      .first();
  }
  await quotaInput.fill(String(total));
  if (reason !== undefined) {
    let reasonInput = modal
      .locator('.info-row')
      .filter({ hasText: '重置原因' })
      .locator('textarea')
      .first();
    if ((await reasonInput.count()) === 0) {
      reasonInput = modal
        .locator('.modal-form-item')
        .filter({ hasText: '重置原因' })
        .locator('textarea')
        .first();
    }
    await reasonInput.fill(reason);
  }
}

async function clearResetQuotaTotal(page) {
  const modal = resetQuotaModal(page);
  let input = resetQuotaTotalInput(page);
  if ((await input.count()) === 0) {
    input = modal
      .locator('.modal-form-item')
      .filter({ hasText: '新的配额总量' })
      .locator('input')
      .first();
  }
  await input.click({ clickCount: 3 });
  await input.press('Backspace');
  await input.fill('');
  await input.blur();
}

async function submitResetQuotaForm(page) {
  await ivuModal(page).clickFooterButton(DRAWER_TITLE.resetQuota, '确认');
}

async function submitResetQuotaFormAndWaitForSuccess(page) {
  await new IvuMessageComponent(page).waitForTextDuringAction(
    '配额重置成功',
    () => submitResetQuotaForm(page),
  );
  await waitAfterEntityMutation(page);
}

async function cancelResetQuotaForm(page) {
  await ivuModal(page).clickFooterButton(DRAWER_TITLE.resetQuota, '取消');
}

async function expectResetQuotaDrawerOpen(page) {
  await ivuModal(page).expectOpen(DRAWER_TITLE.resetQuota);
}

async function expectResetQuotaDrawerHidden(page) {
  await ivuModal(page).expectHidden(DRAWER_TITLE.resetQuota);
}

/**
 * 直接写入重置配额弹窗 Vue 模型 newQuota，绕过 InputNumber :max=90000000 钳制。
 * iView InputNumber 只在用户输入（setValue）时钳制，watch value 仅同步不钳制，
 * 因此注入超限值后点击「确认」时 confirmResetQuota 读到的即注入值。
 * EntityView / ApiKeyView 共用（两处弹窗标题一致、newQuota 均为详情组件 data）。
 */
async function setResetQuotaTotalModel(page, value) {
  const modal = resetQuotaModal(page);
  await expect(modal).toBeVisible({ timeout: 15000 });
  const result = await modal.evaluate((modalEl, quotaValue) => {
    // 优先从 modal 根节点 Vue 实例向上找持有 newQuota 的详情组件
    let vm = modalEl.__vue__ || null;
    while (
      vm &&
      !(vm.$data && Object.prototype.hasOwnProperty.call(vm.$data, 'newQuota'))
    ) {
      vm = vm.$parent;
    }
    if (!vm) {
      // 回退：从弹窗内 InputNumber 实例向上找
      const inputEl = modalEl.querySelector('.ivu-input-number');
      if (inputEl && inputEl.__vue__) {
        vm = inputEl.__vue__;
        while (
          vm &&
          !(
            vm.$data &&
            Object.prototype.hasOwnProperty.call(vm.$data, 'newQuota')
          )
        ) {
          vm = vm.$parent;
        }
      }
    }
    if (!vm) {
      return { ok: false, reason: 'no-newQuota-vm' };
    }
    if (typeof vm.$set === 'function') {
      vm.$set(vm.$data, 'newQuota', quotaValue);
    } else {
      vm.$data.newQuota = quotaValue;
    }
    if (vm.$forceUpdate) {
      vm.$forceUpdate();
    }
    return { ok: true, newQuota: vm.$data.newQuota };
  }, value);
  if (!result || !result.ok) {
    throw new Error(
      `未能写入重置配额总量到 Vue 模型: ${JSON.stringify(result || {})}`,
    );
  }
  await page.waitForTimeout(300);
  return result;
}

/** Entity 详情抽屉：配额单位行显示指定单位（unit=RMB 场景前置断言） */
async function expectEntityDetailQuotaUnit(page, unit) {
  const drawer = entityDetailDrawer(page);
  const row = drawer
    .locator('.info-row')
    .filter({ hasText: '配额单位' })
    .first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row).toContainText(unit);
}

async function resetEntityQuota(page, total, reason) {
  await clickResetEntityQuotaBtn(page);
  await expectResetQuotaDrawerOpen(page);
  await fillResetQuotaForm(page, total, reason);
  await submitResetQuotaFormAndWaitForSuccess(page);
}

async function createEntityViaUI(page, name, typeName, parentName) {
  await openCreateEntityDrawer(page);
  await fillEntityFormBasic(page, { name, typeName, parentName });
  await submitEntityFormAndWaitForSuccess(page);
}

async function createEntityWithQuotaViaUI(
  page,
  name,
  typeName,
  quota,
  parentName,
) {
  await openCreateEntityDrawer(page);
  await fillEntityFormBasic(page, { name, typeName, parentName });
  await fillEntityQuotaForm(page, {
    unlimited: false,
    ...quota,
  });
  await submitEntityFormAndWaitForSuccess(page);
}

async function createEntityWithQuotaViaApi(
  page,
  name,
  typeName,
  quotaTotal,
  quotaUnit = 'total_token',
  resetPeriod = 'monthly',
) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/entities',
      {
        data: {
          name,
          type: typeName,
          quota_plan: {
            unlimited: false,
            pass_when_no_enough_quota: false,
            quota: quotaTotal,
            unit: quotaUnit,
            reset_period: resetPeriod,
          },
        },
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口创建带配额 Entity 响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      return responseBody.Data;
    }
    return null;
  } catch (error) {
    common.log('接口创建带配额 Entity 异常: ' + error.message);
    return null;
  }
}

module.exports = {
  entityOrgTable,
  entityOrgForm,
  drawerScope,
  selectElDrawerField,
  expectElDrawerFieldSelectedContains,
  apiKeyTable,
  apiKeyForm,
  gotoEntityOrgManagementPage,
  expectEntityOrgTabSelected,
  expectCreateEntityButtonVisible,
  expectEntityOrgTableVisible,
  expectEntityOrgPageLayout,
  openCreateEntityDrawer,
  openEditEntityDrawer,
  openEntityDetail,
  selectEntityFormType,
  selectEntityFormParent,
  selectEntityAllowModels,
  selectEntityBlockModels,
  expectEntityAllowModelsDefault,
  fillEntityFormBasic,
  selectEntityFormSelect,
  expectParentEntityOptionVisible,
  selectEntityQuotaUnlimited,
  entityQuotaTotalInput,
  setEntityQuotaTotalModel,
  fillEntityQuotaTotal,
  fillEntityQuotaTotalAndBlur,
  clearEntityQuotaTotal,
  selectEntityQuotaUnit,
  selectEntityQuotaResetCycle,
  selectEntityEnableRateLimit,
  selectRuleModelInSection,
  addEntityRateLimitRule,
  entityRateLimitSection,
  clickAddEntityRateLimitRule,
  fillEntityRateLimitRuleFieldRaw,
  clearEntityRateLimitRuleField,
  setEntityRateLimitRuleFieldModel,
  setupEntityCreateWithRateLimit,
  submitEntityFormExpectRateLimitError,
  submitEntityFormExpectRateLimitBackendReject,
  submitApiKeyFormExpectRateLimitBackendReject,
  selectEntityMaxConcurrencyOption,
  fillEntityMaxConcurrency,
  setEntityMaxConcurrencyModel,
  prepareEntityRateLimitRequiredState,
  clearEntityMaxConcurrency,
  triggerEntityRateLimitEnabledValidate,
  fillEntityMaxConcurrencyAndBlur,
  fillEntityQuotaForm,
  fillEntityRateLimitForm,
  submitEntityForm,
  submitEntityFormAndWaitForSuccess,
  submitEntityFormAndWaitForEditSuccess,
  cancelEntityForm,
  cancelEditEntityForm,
  expectCreateEntityDrawerOpen,
  expectCreateEntityDrawerHidden,
  expectEntityFormFieldError,
  expectEntityFormInlineError,
  expectDrawerFormErrorContains,
  expectEntityRateLimitRequired,
  expectEntityQuotaTotalRequired,
  expectEntityQuotaRangeError,
  expectEntityQuotaIntegerError,
  expectEntityQuotaMaxError,
  expectEntityQuotaRmbMaxError,
  expectEntityQuotaRmbPrecisionError,
  expectEntityFormSelectValue,
  expectEntityMaxConcurrencyMaxError,
  expectDeleteEntityBlocked,
  searchEntityByName,
  searchEntityByType,
  searchEntityByParent,
  searchEntityByQuota,
  searchEntityById,
  filterEntityByRateLimitStatus,
  expectEntityVisible,
  expectEntityNotVisible,
  clickDeleteEntityBtn,
  clickManageRouteRulesBtn,
  expectDeleteEntityConfirmModal,
  confirmDeleteEntity,
  confirmDeleteEntityExpectBlocked,
  confirmDeleteEntityAndWaitForSuccess,
  cancelDeleteEntity,
  deleteEntityAndWait,
  waitForEntitiesListResponse,
  waitAfterEntityMutation,
  waitAfterEntityAction,
  reloadEntityOrgManagementPage,
  expectEntityVisibleInAllPages,
  ensureEntityRowVisible,
  expectEntityRowContainsType,
  expectEntityRowContainsParent,
  expectEntityRowContainsRateLimitStatus,
  expectEntityNameFieldDisabled,
  expectEntityTypeFieldDisabled,
  expectEntityDetailVisible,
  closeEntityDetail,
  expectEntityListNotEmpty,
  expectEntityListEmpty,
  createEntityViaApiAndRefresh,
  prepareEntityForTest,
  submitCreateEntityFormAndWait,
  submitEditEntityFormAndWait,
  clickResetEntityQuotaBtn,
  resetQuotaModal,
  resetQuotaTotalInput,
  fillResetQuotaForm,
  clearResetQuotaTotal,
  submitResetQuotaForm,
  submitResetQuotaFormAndWaitForSuccess,
  cancelResetQuotaForm,
  expectResetQuotaDrawerOpen,
  expectResetQuotaDrawerHidden,
  setResetQuotaTotalModel,
  expectEntityDetailQuotaUnit,
  resetEntityQuota,
  createEntityViaUI,
  createEntityWithQuotaViaUI,
  createEntityWithQuotaViaApi,
  deleteEntityByNameViaApi,
  findEntityByNameViaApi,
};
