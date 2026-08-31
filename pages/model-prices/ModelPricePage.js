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
'use strict';
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const rc = require('../resource/ResourcePageCommon');
const { PageTableComponent } = require('../../components/layout');
const { ElSelectComponent } = require('../../components/element/ElSelect');
const {
  IvuMessageComponent,
  IvuSelectComponent,
} = require('../../components/iview');

const AUTH_PATH = path.join(__dirname, '../../auth.json');

function readSessionFromAuthFile() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    for (const item of auth.origins || []) {
      const userEntry = (item.localStorage || []).find(
        (e) => e.name === 'user',
      );
      if (userEntry && userEntry.value) {
        const parsed = JSON.parse(userEntry.value);
        if (parsed && parsed.sessionKey) {
          return parsed;
        }
      }
    }
  } catch (e) {
    /* 忽略 */
  }
  return null;
}

/**
 * 模型定价（ModelPrices）页面封装
 *
 * UI 技术栈：iView Form/Input/InputNumber + Element UI el-select（混合）
 * - 列表页：.action-bar（新增定价 / YAML 导入）+ pageTable
 * - 新增/编辑：Drawer 内 ModelPriceUpsert（.model-price-upsert）
 * - 详情：Drawer 内 ModelPriceView（.model-price-view）
 * - 导入：Modal 内 ModelPriceImport（.model-price-import）
 *
 * 已知 UI 缺陷（编写断言基准，详见各 spec 注释）：
 * 1. 创建唯一性校验恒拦截：后端组合查询恒 200，res.data.Data 恒真 → 任何新组合都被拦截
 * 2. 分页 total 恒为 0：fetchData 读 data.total 而非 data.pagination.total
 * 3. 列表搜索无响应：pageTable 仅 emit on-search-change，index.vue 未监听
 *
 * 文案说明：
 * 以下 MSG 常量优先采用 UI 实际 i18n 文案，与 docs/model-prices/02-功能测试用例/
 * 中 design/02 描述的参考文案存在偏差。按 ai-gateway-test-generation skill 要求，
 * 已在对应用例注释中标注偏差，待产品确认后统一校准。
 */

const LABEL = {
  basicInfo: '基本信息',
  provider: '提供商',
  model: '模型名',
  baseModel: '归一化模型名',
  mode: '模型模式',
  capabilities: '模型能力',
  supportedParameters: '支持参数',
  limits: '限制对象',
  prices: '价格',
  metadata: '元数据',
  source: '价格来源',
  notes: '备注',
  timestamps: '时间戳',
  createdAt: '创建时间',
  updatedAt: '更新时间',
};

const MSG = {
  providerRequired: '提供商必填',
  modelRequired: '模型名必填',
  baseModelRequired: '归一化模型名必填',
  modeRequired: '请求模式必填',
  pricesRequired: '至少添加一个价格项',
  duplicateCombo: '该 (provider, model, mode) 组合已存在',
  submitSuccess: '提交成功!',
  submitFailed: '提交失败!',
  tipValidateError: '请检查参数填写是否规范!',
  deleteConfirmTitle: '确认删除',
  deleteSuccess: '删除成功',
  sourceUrlInvalid: 'source 必须是有效的 URL',
  pricesValueInvalid: 'prices 值必须为非负数',
  limitsValueInvalid: 'limits 值必须为非负整数',
  yamlFileRequired: '请选择 YAML 文件',
  yamlVersionRequired: 'version 字段必填',
  currencyMustBeRMB: 'default_currency 必须为 RMB',
  parseYamlFailed: 'YAML 解析失败',
  importSucc: '导入成功',
  importFailed: '导入失败',
};

const DRAWER_TITLE = {
  create: '新增定价',
  edit: '编辑定价',
  view: '定价详情',
};

const MODE_OPTIONS = [
  'chat',
  'completion',
  'responses',
  'image_generation',
  'image_edit',
  'embedding',
  'rerank',
  'audio_speech',
  'audio_transcription',
  'video_generation',
  'ocr',
  'search',
  'realtime',
];

const PRICE_KEY_INPUT_COST = 'input_cost_per_token';

// 与 ModelPriceUpsert.vue 中枚举常量保持一致
const CAPABILITY_OPTIONS = [
  'chat',
  'vision',
  'audio_input',
  'video_input',
  'reasoning',
  'tools',
  'structured_outputs',
  'function_calling',
  'prompt_caching',
  'computer_use',
  'web_search',
  'serverless',
  'image_generation',
  'embedding',
  'rerank',
  'audio_speech',
  'audio_transcription',
  'video_generation',
  'ocr',
  'search',
  'realtime',
];

// 与 API 文档 model-prices.md / 后端 validate.go 一致的 15 种
// （UI 曾缺 voice/speed/size/quality/style，已在前端修复补齐）
const SUPPORTED_PARAMETER_OPTIONS = [
  'temperature',
  'top_p',
  'max_tokens',
  'tools',
  'tool_choice',
  'response_format',
  'reasoning',
  'image_input',
  'video_input',
  'audio_input',
  'voice',
  'speed',
  'size',
  'quality',
  'style',
];

const LIMIT_KEY_OPTIONS = [
  'context_window',
  'max_input_tokens',
  'max_output_tokens',
  'max_tokens',
];

const PRICE_KEY_OPTIONS = [
  'input_cost_per_token',
  'output_cost_per_token',
  'cache_read_input_token_cost',
  'cache_creation_input_token_cost',
  'input_cost_per_token_above_200k_tokens',
  'output_cost_per_token_above_200k_tokens',
  'output_cost_per_image',
  'output_cost_per_pixel',
  'output_cost_per_second',
  'input_cost_per_query',
  'search_context_cost_per_query',
  'ocr_cost_per_page',
  'output_cost_per_character',
  'output_cost_per_image_hd',
  'output_cost_per_video',
  'output_cost_per_video_per_second',
];

// 列表搜索行 placeholder
// - input 类型：tipEnterX('请输入') + 列名 + query('查询')
// - select 类型：tipSelectX('请选择') + 列名
const SEARCH_INPUT_PLACEHOLDER = {
  model: '请输入模型名查询',
  baseModel: '请输入归一化模型名查询',
};
const SEARCH_SELECT_PLACEHOLDER = {
  provider: '请选择提供商',
  mode: '请选择模型模式',
};

const COLUMN_HEADERS = ['提供商', '模型名', '归一化模型名', '模型模式', '操作'];

function getAppBaseUrl() {
  return rc.getAppBaseUrl();
}

// ---------- 导航 ----------

async function ensureLocalStorageSession(page) {
  const hasUser = await page.evaluate(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    try {
      const user = JSON.parse(userStr);
      return !!user.sessionKey;
    } catch (e) {
      return false;
    }
  });
  if (hasUser) return;

  const session = readSessionFromAuthFile();
  if (session) {
    await page.evaluate((user) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('lang', 'zh');
    }, session);
  }
}

async function gotoModelPricePage(page) {
  await rc.ensureAppSession(page);
  await page.goto(getAppBaseUrl() + '/model-prices');
  await page.waitForLoadState('domcontentloaded');
  await ensureLocalStorageSession(page);
  await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(500);
}

function modelPriceTable(page) {
  return new PageTableComponent(page);
}

function messages(page) {
  return new IvuMessageComponent(page);
}

/**
 * 断言 iView $Message 全局提示包含指定文本（处理同时存在多个消息的情况）
 */
async function expectMessage(page, text) {
  // iView $Message 成功提示文本在 .ivu-message-notice-content-text 内；错误提示在 .ivu-message-error
  await expect(
    page
      .locator(
        '.ivu-message-notice-content-text, .ivu-message-notice-text, .ivu-message-error',
      )
      .filter({ hasText: text })
      .first(),
  ).toBeVisible({ timeout: 15000 });
}

// ---------- 列表行操作 ----------

function rowAction(page, rowText, action) {
  return modelPriceTable(page).rowAction(rowText, action);
}

async function clickRowAction(page, rowText, action) {
  await rowAction(page, rowText, action).click();
  await page.waitForTimeout(500);
}

// ---------- 列表搜索 / 筛选（searchTable 行） ----------

/**
 * 在列表搜索行中填写/选择搜索条件
 * - select 类型（provider/mode）：下拉精确选择
 * - input 类型（model/baseModel）：输入关键字（on-change 触发搜索）
 */
async function searchField(page, field, keyword) {
  const table = modelPriceTable(page);
  if (SEARCH_SELECT_PLACEHOLDER[field]) {
    // select 类型：通过 placeholder 文本定位 iView Select trigger
    const placeholder = SEARCH_SELECT_PLACEHOLDER[field];
    const trigger = table
      .searchArea()
      .locator('.ivu-select')
      .filter({
        has: page.locator('.ivu-select-placeholder').getByText(placeholder),
      });
    const select = new IvuSelectComponent(page, trigger.first());
    await select.selectOptionExact(keyword);
    await page.waitForTimeout(500);
  } else {
    // input 类型
    const placeholder = SEARCH_INPUT_PLACEHOLDER[field];
    const input = table.searchInput(placeholder);
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill(keyword);
    await page.waitForTimeout(500);
  }
}

async function expectSearchInputVisible(page, field) {
  const table = modelPriceTable(page);
  if (SEARCH_SELECT_PLACEHOLDER[field]) {
    const placeholder = SEARCH_SELECT_PLACEHOLDER[field];
    const trigger = table
      .searchArea()
      .locator('.ivu-select')
      .filter({
        has: page.locator('.ivu-select-placeholder').getByText(placeholder),
      });
    await expect(trigger.first()).toBeVisible({ timeout: 10000 });
  } else {
    const placeholder = SEARCH_INPUT_PLACEHOLDER[field];
    await expect(table.searchInput(placeholder)).toBeVisible({
      timeout: 10000,
    });
  }
}

async function expectTableHeaders(page) {
  await modelPriceTable(page).expectHeaders(...COLUMN_HEADERS);
}

async function waitForDrawerContent(page, selector, title) {
  // iView Drawer 动画 + 组件 v-if 渲染需要等待；先定位当前激活的 drawer
  const drawer = page.locator('.ivu-drawer').last();
  await expect(drawer).toBeVisible({ timeout: 10000 });
  if (title) {
    await expect(drawer.locator('.ivu-drawer-header-inner')).toContainText(
      title,
    );
  }
  // 组件可能延迟挂载，直接在整个页面内等 selector 可见（避免 body 层级选择器偶发不匹配）
  await expect(page.locator(selector).last()).toBeVisible({ timeout: 10000 });
}

async function openCreateDrawer(page) {
  await page.getByRole('button', { name: '新增定价' }).click();
  await waitForDrawerContent(page, '.model-price-upsert', DRAWER_TITLE.create);
}

async function openEditDrawer(page, rowText) {
  await clickRowAction(page, rowText, '编辑');
  await waitForDrawerContent(page, '.model-price-upsert', DRAWER_TITLE.edit);
}

async function openViewDrawer(page, rowText) {
  await clickRowAction(page, rowText, '查看');
  await waitForDrawerContent(page, '.model-price-view', DRAWER_TITLE.view);
}

// ---------- Upsert 表单 ----------

function upsertScope(page) {
  return page.locator('.model-price-upsert');
}

async function expectUpsertScopeVisible(page) {
  await expect(upsertScope(page)).toBeVisible({ timeout: 10000 });
}

async function expectUpsertScopeHidden(page) {
  await expect(upsertScope(page)).toBeHidden({ timeout: 10000 });
}

function upsertFormItem(scope, label) {
  const scopePage = scope.page();
  return scope.locator('.ivu-form-item').filter({
    has: scopePage
      .locator('.ivu-form-item-label')
      .getByText(label, { exact: true })
      .first(),
  });
}

async function fillInputByLabel(page, label, value) {
  const item = upsertFormItem(upsertScope(page), label);
  const input = item.locator('input:not([type="hidden"])').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click({ clickCount: 3 });
  await input.fill(value);
  await input.blur();
}

async function getInputByLabelValue(page, label) {
  const item = upsertFormItem(upsertScope(page), label);
  const input = item.locator('input:not([type="hidden"])').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  return input.inputValue();
}

async function fillProvider(page, value) {
  await fillInputByLabel(page, LABEL.provider, value);
}

async function fillModel(page, value) {
  await fillInputByLabel(page, LABEL.model, value);
}

async function fillBaseModel(page, value) {
  await fillInputByLabel(page, LABEL.baseModel, value);
}

async function getProviderValue(page) {
  return getInputByLabelValue(page, LABEL.provider);
}

async function getModelValue(page) {
  return getInputByLabelValue(page, LABEL.model);
}

async function getBaseModelValue(page) {
  return getInputByLabelValue(page, LABEL.baseModel);
}

// mode / capabilities / supported_parameters 为 el-select
function modeSelect(page) {
  return ElSelectComponent.fromFormItem(page, upsertScope(page), LABEL.mode);
}

function capabilitiesSelect(page) {
  return ElSelectComponent.fromFormItem(
    page,
    upsertScope(page),
    LABEL.capabilities,
  );
}

function supportedParametersSelect(page) {
  return ElSelectComponent.fromFormItem(
    page,
    upsertScope(page),
    LABEL.supportedParameters,
  );
}

async function selectMode(page, mode) {
  await modeSelect(page).selectOptionFilterable(mode);
}

async function expectModeSelected(page, mode) {
  // el-select 选中项渲染在 input[value] 上，toContainText 读取 textContent 可能为空
  const input = modeSelect(page).rootLocator().locator('input').first();
  await expect(input).toHaveValue(mode);
}

async function selectCapabilities(page, items) {
  const sel = capabilitiesSelect(page);
  for (const item of items) {
    await sel.selectOptionFilterable(item);
  }
}

async function selectSupportedParameters(page, items) {
  const sel = supportedParametersSelect(page);
  for (const item of items) {
    await sel.selectOptionFilterable(item);
  }
}

// ---------- el-select multiple 多选辅助（capabilities / supported_parameters） ----------

function multiSelectByLabel(page, label) {
  return ElSelectComponent.fromFormItem(page, upsertScope(page), label);
}

/**
 * 下拉选项文本匹配模式：锚定到文本开头，忽略已选选项文本后追加的
 * 勾选图标字符（CSS content），同时避免匹配 "web_search" 等含子串的选项。
 */
function selectItemTextPattern(item) {
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}`);
}

async function selectMultiOptions(page, label, items) {
  const sel = multiSelectByLabel(page, label);
  // multiple 模式下拉保持打开，一次打开后逐个点击选项
  await sel.trigger.click();
  await page.waitForTimeout(200);
  await expect(sel.dropdownItems().first()).toBeVisible({ timeout: 10000 });
  for (const item of items) {
    await sel
      .dropdownItems()
      .filter({ hasText: selectItemTextPattern(item) })
      .first()
      .click();
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function deselectMultiOption(page, label, item) {
  const sel = multiSelectByLabel(page, label);
  await sel.trigger.click();
  await page.waitForTimeout(200);
  // 点击已选选项即取消选中（multiple toggle 行为）；用锚定文本匹配以忽略选中图标
  const target = sel
    .dropdownItems()
    .filter({ hasText: selectItemTextPattern(item) })
    .first();
  await expect(target).toBeVisible({ timeout: 10000 });
  await target.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function getMultiSelectedTags(page, label) {
  const sel = multiSelectByLabel(page, label);
  const tags = sel.rootLocator().locator('.el-select__tags .el-tag');
  const count = await tags.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(((await tags.nth(i).textContent()) || '').trim());
  }
  return result;
}

async function getMultiDropdownOptionCount(page, label) {
  const sel = multiSelectByLabel(page, label);
  await sel.trigger.click();
  await page.waitForTimeout(200);
  const count = await sel.dropdownItems().count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return count;
}

async function getMultiDropdownOptions(page, label) {
  const sel = multiSelectByLabel(page, label);
  await sel.trigger.click();
  await page.waitForTimeout(200);
  const items = sel.dropdownItems();
  const count = await items.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(((await items.nth(i).textContent()) || '').trim());
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return result;
}

async function getModeDropdownOptions(page) {
  const sel = modeSelect(page);
  await sel.open();
  const items = sel.dropdownItems();
  const count = await items.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(((await items.nth(i).textContent()) || '').trim());
  }
  // 关闭下拉，避免遮挡后续操作
  await page.keyboard.press('Escape');
  return result;
}

/**
 * 通过 Vue 模型直接注入 mode（用于模拟「未选择 mode」的必填校验场景）
 */
async function setModeViaModel(page, mode) {
  const injected = await page.evaluate((value) => {
    const root = document.querySelector('.model-price-upsert');
    if (!root) {
      return false;
    }
    let vue = root.__vue__;
    for (let i = 0; i < 10 && vue; i += 1) {
      if (vue.formData && 'mode' in vue.formData) {
        vue.formData.mode = value;
        vue.$forceUpdate();
        if (vue.$refs.formData) {
          vue.$refs.formData.validateField('mode');
        }
        return true;
      }
      vue = vue.$parent;
    }
    return false;
  }, mode);
  if (!injected) {
    throw new Error('无法通过 Vue 模型注入设置 mode');
  }
  await page.waitForTimeout(200);
}

// ---------- limits / prices 动态行 ----------

function dynamicCard(scope, title) {
  return scope.locator('.ivu-card.dynamic-card').filter({ hasText: title });
}

function limitsCard(page) {
  return dynamicCard(upsertScope(page), LABEL.limits);
}

function pricesCard(page) {
  // 价格卡片有特定 class "price-section-card"，用 class 定位避免 "价格" 文本匹配多个卡片
  return upsertScope(page).locator('.ivu-card.dynamic-card.price-section-card');
}

function dynamicRows(card) {
  return card.locator('.dynamic-row');
}

// 价格行使用 kv-table 结构，与 limits 的 dynamic-row 不同
// 价格卡片内有"默认价格"和"阶梯价格"两个 kv-table，用 .first() 定位默认价格区块
function priceRows(card) {
  return card.locator('.kv-table').first().locator('tbody tr');
}

async function addLimitRow(page) {
  await limitsCard(page)
    .getByRole('button', { name: /添加限制/ })
    .click();
  await page.waitForTimeout(200);
}

async function addPriceRow(page) {
  // 价格卡片内有"默认价格"和"阶梯价格"两个区块，各有"添加价格"按钮
  // 用 .first() 定位"默认价格"区块的按钮
  await pricesCard(page)
    .getByRole('button', { name: /添加价格/ })
    .first()
    .click();
  await page.waitForTimeout(200);
}

async function expectPriceRowCount(page, count) {
  await expect(priceRows(pricesCard(page))).toHaveCount(count);
}

async function removeDynamicRow(page, card, index) {
  await dynamicRows(card)
    .nth(index)
    .getByRole('button', { name: '删除' })
    .click();
  await page.waitForTimeout(200);
}

async function removePriceRow(page, index) {
  await priceRows(pricesCard(page))
    .nth(index)
    .getByRole('button', { name: '删除' })
    .click();
  await page.waitForTimeout(200);
}

async function removeLimitRow(page, index) {
  await removeDynamicRow(page, limitsCard(page), index);
}

async function fillDynamicRow(page, card, index, { key, value }) {
  const row = dynamicRows(card).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  if (key !== undefined) {
    const keySel = new ElSelectComponent(
      page,
      row.locator('.el-select').first(),
    );
    await keySel.selectOptionFilterable(key);
  }
  if (value !== undefined) {
    const numInput = row.locator('.ivu-input-number-input').first();
    await numInput.click({ clickCount: 3 });
    await numInput.fill(String(value));
    await numInput.blur();
    // iView InputNumber 的 :min 校验依赖 native change 事件；programmatic fill 不会自动触发
    await numInput.evaluate((el) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  await page.waitForTimeout(200);
}

async function fillLimitRow(page, index, payload) {
  await fillDynamicRow(page, limitsCard(page), index, payload);
}

async function fillPriceRow(page, index, payload) {
  const row = priceRows(pricesCard(page)).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  if (payload.key !== undefined) {
    const keySel = new ElSelectComponent(
      page,
      row.locator('.el-select').first(),
    );
    await keySel.selectOptionFilterable(payload.key);
  }
  if (payload.value !== undefined) {
    // Element Plus el-input-number 使用 .el-input__inner
    const numInput = row.locator('.el-input-number .el-input__inner').first();
    await numInput.click({ clickCount: 3 });
    await numInput.fill(String(payload.value));
    await numInput.blur();
    // Element Plus InputNumber 的 :min 校验依赖 native change 事件
    await numInput.evaluate((el) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  await page.waitForTimeout(200);
}

async function getDynamicRowValues(page, card, index) {
  const row = dynamicRows(card).nth(index);
  const keySel = row.locator('.el-select').first();
  const keyText = await keySel
    .locator('.el-input__inner, .el-select__selection')
    .first()
    .textContent();
  const value = await row
    .locator('.ivu-input-number-input')
    .first()
    .inputValue();
  return { key: (keyText || '').trim(), value };
}

async function getLimitRowValues(page, index) {
  return getDynamicRowValues(page, limitsCard(page), index);
}

async function getPriceRowValues(page, index) {
  const row = priceRows(pricesCard(page)).nth(index);
  const keySel = row.locator('.el-select').first();
  const keyText = await keySel
    .locator('.el-input__inner, .el-select__selection')
    .first()
    .textContent();
  // Element Plus el-input-number 使用 .el-input__inner
  const value = await row
    .locator('.el-input-number .el-input__inner')
    .first()
    .inputValue();
  return { key: (keyText || '').trim(), value };
}

// ---------- 表单校验断言 ----------

async function expectFieldError(page, label, message) {
  const tip = upsertFormItem(upsertScope(page), label).locator(
    '.ivu-form-item-error-tip',
  );
  await expect(tip).toBeVisible({ timeout: 10000 });
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

async function expectFieldValid(page, label) {
  await expect(
    upsertFormItem(upsertScope(page), label).locator(
      '.ivu-form-item-error-tip',
    ),
  ).toBeHidden();
}

async function expectPricesError(page, message) {
  const err = pricesCard(page).locator('.error-text');
  await expect(err).toBeVisible({ timeout: 10000 });
  if (message !== undefined) {
    await expect(err).toHaveText(message);
  }
}

async function expectPricesErrorHidden(page) {
  await expect(pricesCard(page).locator('.error-text')).toBeHidden();
}

async function expectLimitsError(page, message) {
  const err = limitsCard(page).locator('.error-text');
  await expect(err).toBeVisible({ timeout: 10000 });
  if (message !== undefined) {
    await expect(err).toHaveText(message);
  }
}

// ---------- 提交 / 取消 ----------

async function clickSubmit(page) {
  await upsertScope(page).getByRole('button', { name: '提交' }).click();
}

async function clickCancel(page) {
  await upsertScope(page).getByRole('button', { name: '取消' }).click();
}

async function expectDrawerHidden(page) {
  await expectUpsertScopeHidden(page);
}

/**
 * 提交 Upsert 表单并等待列表刷新（Promise.all + waitForResponse）
 */
async function submitUpsertAndWait(page, { expectSuccess = true } = {}) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    ),
    clickSubmit(page),
  ]);
  await response.finished().catch(() => {});
  if (expectSuccess) {
    await expectMessage(page, MSG.submitSuccess);
  }
}

/**
 * 填写创建表单必填项 + 一个价格项（mode 默认 chat）
 */
async function fillCreateForm(page, payload) {
  await fillProvider(page, payload.provider);
  await fillModel(page, payload.model);
  await fillBaseModel(page, payload.base_model);
  if (payload.mode) {
    await selectMode(page, payload.mode);
  }
  if (payload.priceKey || payload.priceValue !== undefined) {
    await addPriceRow(page);
    await fillPriceRow(page, 0, {
      key: payload.priceKey || PRICE_KEY_INPUT_COST,
      value: payload.priceValue === undefined ? 0.00003 : payload.priceValue,
    });
  }
}

// ---------- 详情页（ModelPriceView） ----------

function viewScope(page) {
  return page.locator('.model-price-view');
}

async function expectViewScopeVisible(page) {
  await expect(viewScope(page)).toBeVisible({ timeout: 10000 });
}

function viewCard(scope, title) {
  return scope.locator('.ivu-card.info-card').filter({ hasText: title });
}

async function viewInfoValue(page, cardTitle, label) {
  // 详情页使用 iView Card + scoped style，Playwright filter({ has: ... })
  // 在 scoped 子元素上偶发无法匹配，改用「card 标题 + 行内包含 label 文本」双重过滤。
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });

  // 优先在指定卡片内查找 info-row；时间戳等字段实际位于「基本信息」卡片内
  //（无「时间戳」卡片），卡片匹配不到时退化为全局按 label 查找
  let row = null;
  if (cardTitle) {
    const card = viewCard(scope, cardTitle);
    if (await card.isVisible().catch(() => false)) {
      row = card.locator('.info-row').filter({ hasText: label }).first();
    }
  }
  if (!row) {
    row = scope.locator('.info-row').filter({ hasText: label }).first();
  }
  await expect(row).toBeVisible({ timeout: 10000 });
  return ((await row.locator('.info-value').textContent()) || '').trim();
}

async function viewKvEntries(page, cardTitle) {
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });

  // 价格卡片内有「默认价格 / 阶梯价格」两个 info-row 且各有 kv-table，
  // 按 info-row label 精确定位默认价格表；limits 卡片无 info-row，回退到卡片标题
  const row = scope.locator('.info-row').filter({ hasText: cardTitle }).first();
  let rows;
  if (await row.isVisible().catch(() => false)) {
    rows = row.locator('.kv-table tbody tr');
  } else {
    const card = viewCard(scope, cardTitle);
    await expect(card).toBeVisible({ timeout: 10000 });
    rows = card.locator('.kv-table tbody tr');
  }
  const count = await rows.count();
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const tds = rows.nth(i).locator('td');
    entries.push({
      key: ((await tds.nth(0).textContent()) || '').trim(),
      value: ((await tds.nth(1).textContent()) || '').trim(),
    });
  }
  return entries;
}

async function viewTags(page, label) {
  // capabilities / supported_parameters 标签位于「基本信息」卡片内的 info-row 中
  // （ModelPriceView 布局），按 label 精确定位行，避免把两行 tag 一起读出来
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });
  const row = scope.locator('.info-row').filter({ hasText: label }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  const tags = row.locator('.ivu-tag');
  const count = await tags.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(((await tags.nth(i).textContent()) || '').trim());
  }
  return result;
}

// ---------- YAML 导入 ----------

function importScope(page) {
  return page.locator('.model-price-import');
}

async function expectImportScopeVisible(page) {
  await expect(importScope(page)).toBeVisible({ timeout: 10000 });
}

async function expectImportScopeHidden(page) {
  await expect(importScope(page)).toBeHidden({ timeout: 10000 });
}

function importModal(page) {
  return page.locator('.ivu-modal-wrap:visible .ivu-modal').first();
}

async function openImportModal(page) {
  await page.getByRole('button', { name: 'YAML 导入' }).click();
  await expect(importModal(page)).toBeVisible({ timeout: 10000 });
  await expectImportScopeVisible(page);
  // 确保 footer 的「导入」按钮已渲染，避免后续点击过早
  await expect(
    importModal(page)
      .locator('.ivu-modal-footer')
      .getByRole('button', { name: '导入' }),
  ).toBeVisible({ timeout: 10000 });
}

async function selectImportMode(page, modeLabel) {
  const select = importModal(page).locator('.ivu-select').first();
  await expect(select).toBeVisible({ timeout: 10000 });
  await select.click();
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: modeLabel })
    .first()
    .click();
  await page.waitForTimeout(200);
}

async function uploadImportFile(page, filePath) {
  const input = importModal(page).locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.waitForTimeout(300);
}

async function clickImportButton(page) {
  // 精确点击 Modal 自定义 footer 中的「导入」按钮
  await importModal(page)
    .locator('.ivu-modal-footer')
    .getByRole('button', { name: '导入' })
    .click();
}

async function clickImportCancel(page) {
  // Modal 自定义 footer 中的「取消」按钮（不触发任何导入请求）
  await importModal(page)
    .locator('.ivu-modal-footer')
    .getByRole('button', { name: '取消' })
    .click();
  await page.waitForTimeout(300);
}

async function clickImportCloseIcon(page) {
  await importModal(page).locator('.ivu-modal-close').click();
  await page.waitForTimeout(300);
}

/**
 * 点击导入并等待列表刷新（Promise.all + waitForResponse）
 */
async function submitImportAndWait(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    ),
    clickImportButton(page),
  ]);
  await response.finished().catch(() => {});
  await expectMessage(page, MSG.importSucc);
}

async function expectImportModalHidden(page) {
  await expectImportScopeHidden(page);
}

async function expectSelectedFileName(page, name) {
  await expect(
    importModal(page).locator('.file-name').filter({ hasText: name }),
  ).toBeVisible({ timeout: 10000 });
}

// ---------- 删除确认弹窗 ----------

async function expectDeleteConfirm(page, modelName) {
  const modal = page.locator('.ivu-modal-wrap:visible .ivu-modal').first();
  await expect(modal).toBeVisible({ timeout: 10000 });
  await expect(modal).toContainText(MSG.deleteConfirmTitle);
  await expect(modal).toContainText(`确认删除模型定价 ${modelName} 吗？`);
  return modal;
}

async function clickDeleteConfirmOk(page) {
  await page
    .locator('.ivu-modal-wrap:visible')
    .getByRole('button', { name: '确定' })
    .click();
}

async function clickDeleteConfirmCancel(page) {
  await page
    .locator('.ivu-modal-wrap:visible')
    .getByRole('button', { name: '取消' })
    .click();
  await page.waitForTimeout(300);
}

/**
 * 确认删除并等待列表刷新（Promise.all + waitForResponse）
 */
async function confirmDeleteAndWait(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    ),
    clickDeleteConfirmOk(page),
  ]);
  await response.finished().catch(() => {});
  await expectMessage(page, MSG.deleteSuccess);
}

module.exports = {
  LABEL,
  MSG,
  DRAWER_TITLE,
  MODE_OPTIONS,
  PRICE_KEY_INPUT_COST,
  CAPABILITY_OPTIONS,
  SUPPORTED_PARAMETER_OPTIONS,
  LIMIT_KEY_OPTIONS,
  PRICE_KEY_OPTIONS,
  SEARCH_INPUT_PLACEHOLDER,
  SEARCH_SELECT_PLACEHOLDER,
  COLUMN_HEADERS,
  getAppBaseUrl,
  gotoModelPricePage,
  modelPriceTable,
  messages,
  expectMessage,
  rowAction,
  clickRowAction,
  searchField,
  expectSearchInputVisible,
  expectTableHeaders,
  openCreateDrawer,
  openEditDrawer,
  openViewDrawer,
  upsertScope,
  expectUpsertScopeVisible,
  expectUpsertScopeHidden,
  fillInputByLabel,
  getInputByLabelValue,
  fillProvider,
  fillModel,
  fillBaseModel,
  getProviderValue,
  getModelValue,
  getBaseModelValue,
  selectMode,
  expectModeSelected,
  selectCapabilities,
  selectSupportedParameters,
  selectMultiOptions,
  deselectMultiOption,
  getMultiSelectedTags,
  getMultiDropdownOptionCount,
  getMultiDropdownOptions,
  getModeDropdownOptions,
  setModeViaModel,
  addLimitRow,
  addPriceRow,
  expectPriceRowCount,
  removePriceRow,
  removeLimitRow,
  fillLimitRow,
  fillPriceRow,
  getLimitRowValues,
  getPriceRowValues,
  expectFieldError,
  expectFieldValid,
  expectPricesError,
  expectLimitsError,
  expectPricesErrorHidden,
  clickSubmit,
  clickCancel,
  expectDrawerHidden,
  submitUpsertAndWait,
  fillCreateForm,
  viewScope,
  expectViewScopeVisible,
  viewInfoValue,
  viewKvEntries,
  viewTags,
  importScope,
  expectImportScopeVisible,
  expectImportScopeHidden,
  openImportModal,
  selectImportMode,
  uploadImportFile,
  clickImportButton,
  clickImportCancel,
  clickImportCloseIcon,
  submitImportAndWait,
  expectImportModalHidden,
  expectSelectedFileName,
  expectDeleteConfirm,
  clickDeleteConfirmOk,
  clickDeleteConfirmCancel,
  confirmDeleteAndWait,
};
