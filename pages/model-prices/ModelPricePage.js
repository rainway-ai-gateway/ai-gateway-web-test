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
const readonly = require('../../utils/readonly');
const { PageTableComponent } = require('../../components/layout');
const { ElSelectComponent } = require('../../components/element/ElSelect');
const {
  IvuMessageComponent,
  IvuSelectComponent,
} = require('../../components/iview');
const { IVU_DRAWER_VISIBLE } = require('../../components/iview/constants');

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
 * - 价格值：普通 Input（.price-input），失焦按量级格式化；limits 仍为 InputNumber
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
  priceObject: '默认价格',
  tierPriceObject: '分时段价格',
  tierObject: '时段对象',
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
  pricesOverflow: '价格过大：价格 × 1e8 不得超过 2^53（约 9e15）',
  limitsValueInvalid: 'limits 值必须为非负整数',
  yamlFileRequired: '请选择 YAML 文件',
  yamlVersionRequired: 'version 字段必填',
  currencyMustBeRMB: 'default_currency 必须为 RMB',
  parseYamlFailed: 'YAML 解析失败',
  importSucc: '导入成功',
  importFailed: '导入失败',
  noPricingForProvider: '未找到提供商 {provider} 的模型定价',
  modelSearchNeedsProviderMode: '按模型名查询需同时选择提供商与模型模式',
};

const DRAWER_TITLE = {
  create: '新增定价',
  edit: '编辑定价',
  view: '定价详情',
};

// 与 `ModelPriceUpsert.vue` / `index.vue` 的 MODE_OPTIONS 及
// design-docs/api-define/OpenAPI接口定义/model-prices.md §1 `mode` 枚举一致（14 种，含 batch）
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
  'batch',
];

const PRICE_KEY_INPUT_COST = 'input_cost_per_token';
const PRICE_KEY_OUTPUT_COST = 'output_cost_per_token';
const PRICE_KEY_CACHE_CREATION_1H = 'cache_creation_input_token_cost_1h';
const PRICE_KEY_INPUT_256K = 'input_cost_per_token_above_256k_tokens';
const PRICE_KEY_OUTPUT_256K = 'output_cost_per_token_above_256k_tokens';
const PRICE_KEY_INPUT_272K = 'input_cost_per_token_above_272k_tokens';
const PRICE_KEY_OUTPUT_272K = 'output_cost_per_token_above_272k_tokens';
const PRICE_KEY_INPUT_512K = 'input_cost_per_token_above_512k_tokens';
const PRICE_KEY_OUTPUT_512K = 'output_cost_per_token_above_512k_tokens';
const PRICE_KEY_INPUT_IMAGE = 'input_cost_per_image_token';
const PRICE_KEY_INPUT_AUDIO = 'input_cost_per_audio_token';
const PRICE_KEY_OUTPUT_AUDIO = 'output_cost_per_audio_token';

// 10 个新增价格键名（MP-T-10）
const NEW_PRICE_KEYS = [
  'cache_creation_input_token_cost_1h',
  'input_cost_per_token_above_256k_tokens',
  'output_cost_per_token_above_256k_tokens',
  'input_cost_per_token_above_272k_tokens',
  'output_cost_per_token_above_272k_tokens',
  'input_cost_per_token_above_512k_tokens',
  'output_cost_per_token_above_512k_tokens',
  'input_cost_per_image_token',
  'input_cost_per_audio_token',
  'output_cost_per_audio_token',
];

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

// 与 ModelPriceUpsert.vue 中 PRICE_KEY_OPTIONS 枚举常量保持一致（30 键）
const PRICE_KEY_OPTIONS = [
  'input_cost_per_token',
  'output_cost_per_token',
  'cache_read_input_token_cost',
  'cache_creation_input_token_cost',
  'cache_creation_input_token_cost_1h',
  'input_cost_per_token_above_200k_tokens',
  'output_cost_per_token_above_200k_tokens',
  'input_cost_per_token_above_256k_tokens',
  'output_cost_per_token_above_256k_tokens',
  'input_cost_per_token_above_272k_tokens',
  'output_cost_per_token_above_272k_tokens',
  'input_cost_per_token_above_512k_tokens',
  'output_cost_per_token_above_512k_tokens',
  'output_cost_per_image',
  'input_cost_per_image_token',
  'output_cost_per_pixel',
  'output_cost_per_image_low_quality',
  'output_cost_per_image_high_quality',
  'input_cost_per_audio_per_second',
  'input_cost_per_audio_token',
  'output_cost_per_audio_token',
  'input_cost_per_video_per_second',
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

/** 前端路由路径（见 ai-gateway-web src/router/router.js:180，只读视角直连 URL 用） */
const MODEL_PRICE_PATH = 'model-prices';

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

/**
 * 直达模型定价列表并携带 provider 筛选参数（MP-LINK-02）：
 * 模拟从服务商列表「查询模型价格」跳转后的落地页（index.vue 读取
 * $route.query.provider → applyQueryFromRoute 应用筛选）
 */
async function gotoModelPricePageWithProvider(page, provider) {
  await rc.ensureAppSession(page);
  await page.goto(
    getAppBaseUrl() + '/model-prices?provider=' + encodeURIComponent(provider),
  );
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

async function expectProviderFilterSelected(page, provider) {
  await expect(
    modelPriceTable(page)
      .searchArea()
      .locator('.ivu-select-selected-value')
      .filter({ hasText: provider }),
  ).toBeVisible({ timeout: 15000 });
}

async function expectNoPricingForProvider(page, provider) {
  await expectMessage(
    page,
    MSG.noPricingForProvider.replace('{provider}', provider),
  );
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

// ---------- provider 自动补全（iView AutoComplete） ----------

/**
 * provider 字段为 iView AutoComplete（可下拉选择 / 手写），候选来自
 * GET /providers/actions/get-provider-names（ModelPriceUpsert.fetchProviderNames），
 * 非 transfer 模式，下拉面板渲染在组件内部（.ivu-auto-complete .ivu-select-dropdown，
 * 选项为 li.ivu-select-item）
 */
function providerAutoComplete(page) {
  return upsertFormItem(upsertScope(page), LABEL.provider)
    .locator('.ivu-auto-complete')
    .first();
}

/** 聚焦 provider 自动补全框，展开全部候选（on-focus 清空过滤文本） */
async function openProviderDropdown(page) {
  const input = providerAutoComplete(page).locator('input').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click();
  await page.waitForTimeout(300);
}

/** 读取当前展开的 provider 自动补全候选文本列表 */
async function getProviderDropdownOptions(page) {
  const panel = providerAutoComplete(page).locator('.ivu-select-dropdown');
  await expect(panel).toBeVisible({ timeout: 10000 });
  const items = panel.locator('li.ivu-select-item');
  const count = await items.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(((await items.nth(i).textContent()) || '').trim());
  }
  return result;
}

/** 断言候选包含指定服务商名（MP-LINK-01：候选含已创建服务商） */
async function expectProviderCandidate(page, provider) {
  const options = await getProviderDropdownOptions(page);
  expect(options, '提供商自动补全候选应包含服务商 ' + provider).toContain(
    provider,
  );
}

/** 从自动补全下拉中点选指定候选（与手写填入等价的下拉选中路径） */
async function selectProviderCandidate(page, provider) {
  const panel = providerAutoComplete(page).locator('.ivu-select-dropdown');
  await expect(panel).toBeVisible({ timeout: 10000 });
  const escaped = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await panel
    .locator('li.ivu-select-item')
    .filter({ hasText: new RegExp('^\\s*' + escaped + '\\s*$') })
    .first()
    .click();
  await page.waitForTimeout(300);
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
  if (items.length === 0) return;
  if (items.length === 1) {
    await sel.selectOptionFilterable(items[0]);
    return;
  }
  // 多项选择：一次性打开下拉，逐个点击选项（不筛选，方法同 selectMultiOptions）
  await sel.open();
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

async function selectSupportedParameters(page, items) {
  const sel = supportedParametersSelect(page);
  if (items.length === 0) return;
  if (items.length === 1) {
    await sel.selectOptionFilterable(items[0]);
    return;
  }
  // 多项选择：一次性打开下拉，逐个点击选项（不筛选，方法同 selectMultiOptions）
  await sel.open();
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
 * 获取默认价格区第一个价格行的键名下拉选项（用于断言新增价格键名是否存在）
 *
 * el-select 下拉挂载在 body，同一抽屉内可能同时存在多个可见下拉（例如本用例
 * 先前打开过的「模型模式」下拉），全局 dropdownItems() 会混入其它下拉的选项，
 * 故按本 select 自身的 popper 限定读取
 */
async function getPriceKeyDropdownOptions(page) {
  const card = pricesCard(page);
  const keySel = new ElSelectComponent(
    page,
    card.locator('.kv-table').first().locator('tbody tr').first().locator('.el-select').first(),
  );
  await keySel.open();
  const result = await keySel.ownDropdownOptions();
  // 关闭下拉，避免遮挡后续操作
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return result;
}

// ---------- 价格配置块（默认价格 / 分时段价格 / 批量折扣系数） ----------

/**
 * 「价格」Card 内的配置块容器（同级 .price-config-block：默认价格 + 分时段价格 +
 * 批量折扣系数，共 3 个；批量折扣系数块仅 mode != batch 时渲染）
 */
function priceConfigGroup(page) {
  return pricesCard(page).locator('.price-config-group');
}

function priceConfigBlocks(page) {
  return priceConfigGroup(page).locator('.price-config-block');
}

/** ① 默认价格块（prices，必填） */
function defaultPriceBlock(page) {
  return priceConfigBlocks(page).nth(0);
}

/** ② 分时段价格块（tier_prices.peak，可选） */
function tierPriceBlock(page) {
  return priceConfigBlocks(page).nth(1);
}

/**
 * ③ 批量折扣系数块（batch_discount，可选；默认 0.5，取值 (0,1]）
 * 2026-10-10 新增（`batch_discount`），仅 mode != batch 时渲染（mode=batch 无此块，见 MP-V-14）
 */
function batchDiscountBlock(page) {
  return priceConfigBlocks(page).nth(2);
}

/** 分时段价格块内的动态价格行（kv-table tbody tr，行结构同默认价格行） */
function tierRows(page) {
  return tierPriceBlock(page).locator('.kv-table tbody tr');
}

async function addTierPriceRow(page) {
  await tierPriceBlock(page)
    .getByRole('button', { name: /添加价格/ })
    .click();
  await page.waitForTimeout(200);
}

async function removeTierPriceRow(page, index) {
  await tierRows(page)
    .nth(index)
    .getByRole('button', { name: '删除' })
    .click();
  await page.waitForTimeout(200);
}

async function expectTierPriceRowCount(page, count) {
  await expect(tierRows(page)).toHaveCount(count);
}

async function fillTierPriceRow(page, index, payload) {
  const row = tierRows(page).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  if (payload.key !== undefined) {
    const keySel = new ElSelectComponent(
      page,
      row.locator('.el-select').first(),
    );
    await keySel.selectOptionFilterable(payload.key);
  }
  if (payload.value !== undefined) {
    const valueInput = row.locator('td').nth(1).locator('input').first();
    await expect(valueInput).toBeVisible({ timeout: 10000 });
    await valueInput.click({ clickCount: 3 });
    await valueInput.fill(String(payload.value));
    await valueInput.blur();
  }
  await page.waitForTimeout(200);
}

async function getTierPriceRowValues(page, index) {
  const row = tierRows(page).nth(index);
  const keySel = row.locator('.el-select').first();
  const keyInput = keySel.locator('input').first();
  const keyFromInput = (await keyInput.inputValue().catch(() => '')) || '';
  const keyText = await keySel
    .locator('.el-input__inner, .el-select__selection')
    .first()
    .textContent();
  const value = await row
    .locator('td')
    .nth(1)
    .locator('input')
    .first()
    .inputValue();
  return { key: (keyFromInput || keyText || '').trim(), value };
}

async function findTierPriceRowIndexByKey(page, key) {
  const rows = tierRows(page);
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const vals = await getTierPriceRowValues(page, i);
    if (vals.key === key) {
      return i;
    }
  }
  throw new Error('未找到分时段价格键: ' + key);
}

async function expectTierPriceRowInputValue(page, index, expected) {
  const { value } = await getTierPriceRowValues(page, index);
  expect(value).toBe(String(expected));
}

/** 分时段价格块校验错误（.error-text，如 tierValueInvalid / tierOverflow / tierDuplicateKey） */
async function expectTierError(page, message) {
  const err = tierPriceBlock(page).locator('.error-text');
  if (message !== undefined) {
    await expect(err.filter({ hasText: message }).first()).toBeVisible({
      timeout: 10000,
    });
    return;
  }
  await expect(err.first()).toBeVisible({ timeout: 10000 });
}

async function expectTierErrorHidden(page) {
  await expect(tierPriceBlock(page).locator('.error-text')).toBeHidden();
}

/**
 * 获取分时段价格块第一个价格行的键名下拉选项（MP-T-10 内嵌下拉枚举校验）
 * 同 getPriceKeyDropdownOptions，按本 select 自身 popper 限定读取
 */
async function getTierPriceKeyDropdownOptions(page) {
  const keySel = new ElSelectComponent(
    page,
    tierRows(page).first().locator('.el-select').first(),
  );
  await keySel.open();
  const result = await keySel.ownDropdownOptions();
  // 关闭下拉，避免遮挡后续操作
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return result;
}

/**
 * 悬停分时段价格块的 ios-help-circle-outline 图标，断言 Tooltip 展示 fallback 语义文案
 * （iView Tooltip transfer 挂载在 body，popper 以文案过滤定位）
 */
async function hoverTierPriceTooltip(page) {
  await tierPriceBlock(page).locator('.price-config-help-icon').hover();
  const popper = page
    .locator('.ivu-tooltip-popper:visible')
    .filter({ hasText: MSG.tierPriceTip });
  await expect(popper.first()).toBeVisible({ timeout: 10000 });
  return popper.first();
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
    const valueInput = row.locator('td').nth(1).locator('input').first();
    await expect(valueInput).toBeVisible({ timeout: 10000 });
    await valueInput.click({ clickCount: 3 });
    await valueInput.fill(String(payload.value));
    await valueInput.blur();
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
  const keyInput = keySel.locator('input').first();
  const keyFromInput = (await keyInput.inputValue().catch(() => '')) || '';
  const keyText = await keySel
    .locator('.el-input__inner, .el-select__selection')
    .first()
    .textContent();
  const value = await row
    .locator('td')
    .nth(1)
    .locator('input')
    .first()
    .inputValue();
  return { key: (keyFromInput || keyText || '').trim(), value };
}

async function findPriceRowIndexByKey(page, key) {
  const rows = priceRows(pricesCard(page));
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const vals = await getPriceRowValues(page, i);
    if (vals.key === key) {
      return i;
    }
  }
  throw new Error('未找到价格键: ' + key);
}

async function expectPriceRowInputValue(page, index, expected) {
  const { value } = await getPriceRowValues(page, index);
  expect(value).toBe(String(expected));
}

function expectNumericPriceEqual(actual, expected) {
  expect(Number(actual)).toBe(Number(expected));
}

async function expectViewPricesNumericallyEqual(page, prices) {
  const entries = await viewKvEntries(page, LABEL.prices);
  const ui = {};
  entries.forEach((e) => {
    ui[e.key] = Number(String(e.value).replace(/^¥/, '').trim());
  });
  const expected = prices || {};
  expect(Object.keys(ui).sort()).toEqual(Object.keys(expected).sort());
  Object.keys(expected).forEach((key) => {
    expect(ui[key]).toBe(Number(expected[key]));
  });
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
  if (message !== undefined) {
    await expect(err.filter({ hasText: message }).first()).toBeVisible({
      timeout: 10000,
    });
    return;
  }
  await expect(err.first()).toBeVisible({ timeout: 10000 });
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

/**
 * 前端校验拦截：提交后不应发出 POST/PUT /model-prices
 */
async function clickSubmitExpectNoModelPriceWrite(page) {
  const write = page
    .waitForResponse(
      (r) => {
        if (!r.url().includes('/open-api/v1/model-prices')) {
          return false;
        }
        const method = r.request().method();
        return method === 'POST' || method === 'PUT';
      },
      { timeout: 3000 },
    )
    .then(() => true)
    .catch(() => false);
  await clickSubmit(page);
  expect(await write).toBe(false);
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

async function expectViewScopeHidden(page) {
  await expect(viewScope(page)).toHaveCount(0);
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

/**
 * 读取详情页分时段价格分组（MP-T-08）：
 * 返回 [{ label: '时段对象：忙时（peak）', entries: [{ key, value }] }]
 * 无 tier_prices 或 tier 值为空对象时返回 []
 */
async function viewTierPriceGroups(page) {
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });
  const groups = scope.locator('.tier-price-group');
  const count = await groups.count();
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const label = (
      (await groups.nth(i).locator('.tier-price-label').textContent()) || ''
    ).trim();
    const rows = groups.nth(i).locator('.kv-table tbody tr');
    const rowCount = await rows.count();
    const entries = [];
    for (let j = 0; j < rowCount; j += 1) {
      const tds = rows.nth(j).locator('td');
      entries.push({
        key: ((await tds.nth(0).textContent()) || '').trim(),
        value: ((await tds.nth(1).textContent()) || '').trim(),
      });
    }
    result.push({ label, entries });
  }
  return result;
}

/** 详情页分时段价格区展示空占位「-」（MP-T-08：无 tier_prices 记录不展示空分组） */
async function expectViewTierEmpty(page) {
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });
  const row = scope
    .locator('.info-row')
    .filter({ hasText: LABEL.tierPriceObject })
    .first();
  await expect(row.locator('.empty-text')).toBeVisible({ timeout: 10000 });
  await expect(scope.locator('.tier-price-group')).toHaveCount(0);
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

/**
 * 点击导入并等待后端 POST 响应返回后，断言导入失败消息
 * （处理后端 422 场景：等待响应完成再检查 iView 错误提示）
 * 注：后端 422 返回的具体 ErrMsg 会替代 fallback "导入失败"，
 * 因此此处不检查特定文本，只检查有错误消息显示即可。
 */
async function clickImportAndWaitForFailure(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/model-prices/import') &&
        r.request().method() === 'POST',
      { timeout: 15000 },
    ),
    clickImportButton(page),
  ]);
  // 等待响应体加载完成，确保前端 on-error 已触发
  await response.finished().catch(() => {});
  await page.waitForTimeout(500);
  // 检查任意 iView 错误消息可见（后端 422 ErrMsg 不是固定 "导入失败"）
  await expect(
    page.locator('.ivu-message-error').first(),
  ).toBeVisible({ timeout: 15000 });
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

// ---------------------------------------------------------------------------
// 只读管理员视角（docs/model-prices/02-功能测试用例/08-只读视角.md MP-RO-01~03）
//
// 产品依据（ai-gateway-web src/modules/ModelPrices/）：
// - index.vue:18 `.action-bar` 整体挂 `v-has`（含「+ 新增定价」「YAML 导入」）→ 只读加
//   `.v-has-hidden`，元素仍在 DOM，用 `readonly.expectVHasHidden` 断言；
// - index.vue:179 操作列 `if (!store.isReadonly())` 才 push 「编辑」「删除」→ 只读下
//   根本不渲染（count=0），用 `readonly.expectHidden` / `expectAbsent` 断言；
// - ModelPriceView.vue 详情抽屉为纯展示组件（无任何 Button），只读与管理员一致。
// ---------------------------------------------------------------------------

/** 模块根容器（只读视角下同样渲染，作为就绪判定锚点） */
function modelPriceRoot(page) {
  return page.locator('.model-prices');
}

/** 页头写入口容器（挂 `v-has`：新增定价 + YAML 导入） */
function modelPriceActionBar(page) {
  return modelPriceRoot(page).locator('.action-bar');
}

/** 页头「+ 新增定价」写按钮 */
function modelPriceCreateBtn(page) {
  return modelPriceActionBar(page).getByRole('button', { name: '新增定价' });
}

/** 页头「YAML 导入」写按钮 */
function modelPriceImportBtn(page) {
  return modelPriceActionBar(page).getByRole('button', { name: 'YAML 导入' });
}

/**
 * 列表数据行，按 (provider, model, mode) 三重文本过滤。
 * 单用 provider 会命中该 provider 全部行，单用 model 会被同名子串
 * （如 deepseek-v3 与 deepseek-v3-0324）误命中，故三重过滤。
 */
function modelPriceRowByCombo(page, combo) {
  return modelPriceTable(page)
    .dataRows()
    .filter({ hasText: combo.provider })
    .filter({ hasText: combo.model })
    .filter({ hasText: combo.mode })
    .first();
}

/** 行内只读入口「查看」（文档称「详情」，UI 文案取自 com.see） */
function modelPriceRowViewBtn(page, combo) {
  return modelPriceRowByCombo(page, combo).getByRole('button', { name: '查看' });
}

/** 行内写入口「编辑」（只读视角不渲染） */
function modelPriceRowEditBtn(page, combo) {
  return modelPriceRowByCombo(page, combo).getByRole('button', { name: '编辑' });
}

/** 行内写入口「删除」（只读视角不渲染） */
function modelPriceRowDeleteBtn(page, combo) {
  return modelPriceRowByCombo(page, combo).getByRole('button', { name: '删除' });
}

/**
 * 用 provider + mode 服务端筛选把目标行带入当前页并断言可见。
 * 默认 pageSize=50，不在首页的行直接断言会假失败；筛选后目标行必然落在第 1 页。
 * 路径与 tests/model-prices/test_01_model_price_list.spec.js 的 MP-L-02/05 相同
 * （下拉筛选走 `onSearchChange` → `index.vue:41` 已监听该事件）。
 */
async function focusModelPriceRow(page, combo) {
  await searchField(page, 'provider', combo.provider);
  await searchField(page, 'mode', combo.mode);
  await expect(modelPriceRowByCombo(page, combo)).toBeVisible({
    timeout: 15000,
  });
}

/** 点击行内「查看」打开只读详情抽屉 */
async function openViewModelPriceDrawer(page, combo) {
  await modelPriceRowViewBtn(page, combo).click();
  await waitForDrawerContent(page, '.model-price-view', DRAWER_TITLE.view);
}

/** 当前可见的详情抽屉容器（iView Drawer wrap，选择器取 components/iview/constants） */
function viewDrawer(page) {
  return page.locator(IVU_DRAWER_VISIBLE).last();
}

/** 详情抽屉内的写操作按钮——MP-RO-03 断言其不存在 */
function viewDrawerWriteActionButtons(page) {
  return viewDrawer(page).getByRole('button', { name: /编辑|删除|保存|导入/ });
}

/** 详情内容区（`.model-price-view`）内的全部按钮——纯只读展示下应为 0 个 */
function viewScopeButtons(page) {
  return viewScope(page).getByRole('button');
}

/** 详情四张 Card（基本信息 / 限制对象 / 价格 / 元数据）均可见 */
async function expectViewCards(page) {
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });
  const titles = [LABEL.basicInfo, LABEL.limits, LABEL.prices, LABEL.metadata];
  for (const title of titles) {
    // 「元数据」卡片含「价格来源」，纯 hasText 过滤会同时命中价格卡片 → 取首个
    await expect(viewCard(scope, title).first()).toBeVisible({ timeout: 10000 });
  }
}

/**
 * 写入口在只读视角不可被触发（MP-RO-01 测试步骤 4 / 预期结果 4）。
 * 用 `click({ trial: true })` 只做可操作性检查、不真正点击：被 v-has 置为
 * `display:none !important` 的元素必然判为不可触发，且不产生任何副作用。
 */
async function expectWriteEntryUntriggerable(locator, label, timeout = 1500) {
  const outcome = await locator
    .click({ trial: true, timeout })
    .then(() => 'triggerable')
    .catch(() => 'blocked');
  expect(outcome, `只读视角「${label}」不应可被触发`).toBe('blocked');
}

/**
 * 只读视角直连 URL 进入模型定价列表页。
 * 不走 `gotoModelPricePage`——它内部 `rc.ensureAppSession` →
 * `ensureSessionHealthy` / `handleUrlInvalidAlert` 会以 conf.json 的 admin 凭证重登
 * 并回写 auth.json，把只读态换成管理员态（见 utils/readonly.js 文件头约束 2）。
 */
async function gotoModelPricePageReadonly(page) {
  await readonly.gotoAsReadonly(page, MODEL_PRICE_PATH, {
    ready: modelPriceRoot(page),
  });
  await readonly.expectStillReadonly(page);
}

/**
 * 只读视角就绪判定：模块根容器 + 表头（只读下同样渲染的锚点）
 * + 页头写入口区已挂 `.v-has-hidden`。
 * 不能用 `gotoModelPricePage` 的「新增定价」可见性判定——只读视角该按钮被 v-has 隐藏。
 */
async function expectModelPricePageReadyReadonly(page) {
  await expect(modelPriceRoot(page)).toBeVisible();
  await expectTableHeaders(page);
  await readonly.expectVHasHidden(
    modelPriceActionBar(page),
    '模型定价页头写入口区',
  );
  await readonly.expectStillReadonly(page);
}

module.exports = {
  LABEL,
  MSG,
  DRAWER_TITLE,
  MODE_OPTIONS,
  PRICE_KEY_INPUT_COST,
  PRICE_KEY_OUTPUT_COST,
  PRICE_KEY_CACHE_CREATION_1H,
  PRICE_KEY_INPUT_256K,
  PRICE_KEY_OUTPUT_256K,
  PRICE_KEY_INPUT_272K,
  PRICE_KEY_OUTPUT_272K,
  PRICE_KEY_INPUT_512K,
  PRICE_KEY_OUTPUT_512K,
  PRICE_KEY_INPUT_IMAGE,
  PRICE_KEY_INPUT_AUDIO,
  PRICE_KEY_OUTPUT_AUDIO,
  NEW_PRICE_KEYS,
  CAPABILITY_OPTIONS,
  SUPPORTED_PARAMETER_OPTIONS,
  LIMIT_KEY_OPTIONS,
  PRICE_KEY_OPTIONS,
  SEARCH_INPUT_PLACEHOLDER,
  SEARCH_SELECT_PLACEHOLDER,
  COLUMN_HEADERS,
  getAppBaseUrl,
  gotoModelPricePage,
  gotoModelPricePageWithProvider,
  modelPriceTable,
  messages,
  expectMessage,
  rowAction,
  clickRowAction,
  searchField,
  expectProviderFilterSelected,
  expectNoPricingForProvider,
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
  openProviderDropdown,
  getProviderDropdownOptions,
  expectProviderCandidate,
  selectProviderCandidate,
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
  getPriceKeyDropdownOptions,
  priceConfigGroup,
  priceConfigBlocks,
  defaultPriceBlock,
  tierPriceBlock,
  batchDiscountBlock,
  tierRows,
  addTierPriceRow,
  removeTierPriceRow,
  expectTierPriceRowCount,
  fillTierPriceRow,
  getTierPriceRowValues,
  findTierPriceRowIndexByKey,
  expectTierPriceRowInputValue,
  expectTierError,
  expectTierErrorHidden,
  getTierPriceKeyDropdownOptions,
  hoverTierPriceTooltip,
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
  findPriceRowIndexByKey,
  expectPriceRowInputValue,
  expectNumericPriceEqual,
  expectViewPricesNumericallyEqual,
  expectFieldError,
  expectFieldValid,
  expectPricesError,
  expectLimitsError,
  expectPricesErrorHidden,
  clickSubmit,
  clickSubmitExpectNoModelPriceWrite,
  clickCancel,
  expectDrawerHidden,
  submitUpsertAndWait,
  fillCreateForm,
  viewScope,
  expectViewScopeVisible,
  expectViewScopeHidden,
  viewInfoValue,
  viewKvEntries,
  viewTierPriceGroups,
  expectViewTierEmpty,
  viewTags,
  importScope,
  expectImportScopeVisible,
  expectImportScopeHidden,
  openImportModal,
  selectImportMode,
  uploadImportFile,
  clickImportButton,
  clickImportAndWaitForFailure,
  clickImportCancel,
  clickImportCloseIcon,
  submitImportAndWait,
  expectImportModalHidden,
  expectSelectedFileName,
  expectDeleteConfirm,
  clickDeleteConfirmOk,
  clickDeleteConfirmCancel,
  confirmDeleteAndWait,
  // 只读管理员视角（docs/model-prices/02-功能测试用例/08-只读视角.md）
  MODEL_PRICE_PATH,
  modelPriceRoot,
  modelPriceActionBar,
  modelPriceCreateBtn,
  modelPriceImportBtn,
  modelPriceRowByCombo,
  modelPriceRowViewBtn,
  modelPriceRowEditBtn,
  modelPriceRowDeleteBtn,
  focusModelPriceRow,
  openViewModelPriceDrawer,
  viewDrawer,
  viewDrawerWriteActionButtons,
  viewScopeButtons,
  expectViewCards,
  expectWriteEntryUntriggerable,
  gotoModelPricePageReadonly,
  expectModelPricePageReadyReadonly,
};
