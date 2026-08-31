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
/**
 * entity-shared.js
 *
 * Shared constants and utility functions for Entity management pages.
 * Extracted from EntityPage.js to break circular dependencies between
 * EntityPage ↔ EntityTypePage / EntityOrgPage / EntityApiKeyPage.
 *
 * This module MUST NOT require any of:
 *   ./EntityPage, ./EntityTypePage, ./EntityOrgPage, ./EntityApiKeyPage
 */
const { expect, test } = require('@playwright/test');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const {
  AppSidebarComponent,
  LayoutShellComponent,
  PageTableComponent,
} = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuFormComponent,
  IvuModalComponent,
  IvuTabsComponent,
  IvuSelectComponent,
  IvuRadioGroupComponent,
  IvuMessageComponent,
} = require('../../components/iview');
const { ElSelectComponent } = require('../../components/element');
const entityApiUtils = require('../../api/entity-api-utils');

// ── Shared Constants ────────────────────────────────────────────────

const DRAWER_TITLE = {
  createType: '创建类型',
  editType: '编辑类型',
  createEntity: '创建Entity',
  editEntity: '编辑Entity',
  entityDetail: 'Entity详情',
  addApiKey: '创建 API-Key',
  editApiKey: '编辑 API-Key',
  apiKeyDetail: 'API-Key详情',
  resetQuota: '重置配额',
};

/** Entity 详情抽屉：用内容特征匹配 */
const ENTITY_DETAIL_DRAWER_PARTS = ['详情', '基本信息'];

/** API-Key 详情抽屉：用内容特征匹配 */
const API_KEY_DETAIL_DRAWER_PARTS = ['详情', '基本信息'];

const ENTITY_TYPE_SEARCH_PLACEHOLDER = '请输入类型名查询';
const ENTITY_SEARCH_PLACEHOLDER_NAME = '请输入名称查询';
const ENTITY_SEARCH_PLACEHOLDER_TYPE = '请输入类型查询';
const ENTITY_SEARCH_PLACEHOLDER_PARENT = '请输入父Entity查询';
const ENTITY_SEARCH_PLACEHOLDER_QUOTA = '请输入配额查询';
const ENTITY_SEARCH_PLACEHOLDER_ID = '请输入ID查询';
const API_KEY_SEARCH_PLACEHOLDER = '请输入描述查询';
const API_KEY_SEARCH_PLACEHOLDER_KEY = '请输入Key 值查询';
const API_KEY_SEARCH_PLACEHOLDER_KEY_ID = '请输入Key ID查询';

/** 与 docs/entity-management/02-功能测试用例.md 对齐的测试数据 */
const DOC_ENTITY_TYPE = {
  listSample: { typeName: 'dep2', description: '二级部门', level: 2 },
  createSuccess: {
    typeName: 'test-dep',
    description: '测试部门类型',
    level: 1,
  },
  createSuccessMsg: /创建成功!?/,
  duplicate: { typeName: 'dep2', level: 1 },
  formatInvalid1: 'TEST-DEP',
  formatInvalid2: '测试类型',
  formatErrorMsg: '类型名格式不正确，不能以下划线或连字符开头或结尾',
  typeNameRequiredMsg: '请输入类型名',
  levelRequiredMsg: '请选择级别',
  searchPartial: 'dep',
  searchNotExist: 'nonexistent',
  nameMaxLength: 32,
  nameOverLength: 33,
};

const DOC_ENTITY_ORG = {
  createRoot: { name: 'root-entity', typeName: 'dep' },
  createRequired: { name: 'required-entity', typeName: 'dep' },
  duplicate: { name: 'root-entity' },
  withQuota: {
    name: 'quota-entity',
    typeName: 'dep',
    quotaTotal: 100000,
    quotaUnit: 'total_token',
    resetCycle: '每月',
  },
  withRateLimit: {
    name: 'ratelimit-entity',
    typeName: 'dep',
    enableRateLimit: true,
    tpm: { name: 'tpm_rule_1', window: 1, maxTokens: 10000, step: 1 },
    rpm: { name: 'rpm_rule_1', window: 1, maxRequests: 100 },
    maxConcurrency: 50,
  },
  child: { name: 'child-entity', typeName: 'team', parentName: 'root-entity' },
  multiLevel: {
    level1: { name: 'level1-entity', typeName: 'dep' },
    level2: { name: 'level2-entity', typeName: 'team' },
    level3: { name: 'level3-entity', typeName: 'person' },
  },
  searchName: 'root',
  searchType: 'dep',
  searchParent: 'root-entity',
  editDescription: '编辑后的Entity描述',
  resetQuota: { total: 100000000, reason: '月度重置' },
  deleteParent: { name: 'parent-entity' },
  deleteChild: { name: 'child-under-parent', typeName: 'team' },
  quotaTotalRequiredMsg: '配额总量不能为空',
  quotaRangeErrorMsg: '配额不能为负数',
  quotaIntegerErrorMsg: '配额总量必须为非负整数',
  quotaMaxErrorMsg: '配额总量超出允许范围',
  quotaDecimal: 5.3,
  quotaOverMax: '66666666666666660000',
  int32Max: '2147483647',
  // 2026-08-16: unit=RMB 时配额上限为 9000 万元（RMB_QUOTA_MAX）
  quotaRmbMax: 90000000,
  quotaRmbOverMax: 90000001,
  quotaRmbMaxErrorMsg: 'RMB 配额不能超过 9000 万元',
  quotaRmbPrecisionErrorMsg: 'RMB 配额最多保留 4 位小数',
  maxConcurrencyOverMax: '2147483648',
  maxConcurrencyMaxErrorMsg: '最大并发超出允许范围',
  // TPM/RPM 规则字段仍为 int64，溢出值需超过 int64 上界
  ruleValueOverMax: '9223372036854775808',
  rateLimitRuleRequiredMsg:
    /请添加 TPM\/RPM 规则|最大并发.*封禁.*限制并发数|启用限流时，至少(需要配置TPM、RPM或最大并发中的一项|配置一项限流规则\s*[（(]TPM\/RPM\/最大并发[）)])/,
  deleteBlockedMsg:
    /无法删除|API-Key|api.?key|挂载|Conflict|associated|in use/i,
  tpmWindowMinutesInvalidMsgTemplate:
    '第{index}条TPM规则时间窗口范围为1-360分钟',
  tpmWindowMinutesRequiredMsgTemplate: '第{index}条TPM规则时间窗口不能为空',
  tpmRuleNameRequiredMsgTemplate: '第{index}条TPM规则请输入规则名称',
  tpmStepMinutesRangeMsgTemplate: '第{index}条TPM规则滑动步长范围为1-360分钟',
  tpmStepMinutesRequiredMsgTemplate: '第{index}条TPM规则滑动步长不能为空',
  tpmMaxTokensMinErrorMsgTemplate: '第{index}条TPM规则最大Token数必须大于0',
  tpmMaxTokensMaxErrorMsgTemplate: '第{index}条TPM规则最大Token数超出允许范围',
  tpmMaxTokensRequiredMsgTemplate: '第{index}条TPM规则最大Token数不能为空',
  rpmWindowMinutesInvalidMsgTemplate:
    '第{index}条RPM规则时间窗口范围为1-360分钟',
  rpmWindowMinutesRequiredMsgTemplate: '第{index}条RPM规则时间窗口不能为空',
  rpmRuleNameRequiredMsgTemplate: '第{index}条RPM规则请输入规则名称',
  rpmMaxRequestsMinErrorMsgTemplate: '第{index}条RPM规则最大请求数必须大于0',
  rpmMaxRequestsMaxErrorMsgTemplate: '第{index}条RPM规则最大请求数超出允许范围',
  rpmMaxRequestsRequiredMsgTemplate: '第{index}条RPM规则最大请求数不能为空',
  nameLeadingTrailingWhitespaceMsg: 'Entity名称不能包含前导或尾随空格',
  nameLengthErrorMsg: 'Entity名称长度不能超过64字符',
  nameControlCharsErrorMsg: 'Entity名称不能包含控制字符',
  tpmCombinationDuplicateMsg:
    '存在相同的TPM规则组合（模型、时间窗口、最大Token数、滑动步长）',
  rpmCombinationDuplicateMsg:
    '存在相同的RPM规则组合（模型、时间窗口、最大请求数）',
  ruleNameLengthErrorMsg: '规则名称长度不能超过128字符',
};

const DOC_API_KEY = {
  createSuccess: { description: '测试用API-Key' },
  createRequired: { description: '必填校验API-Key' },
  descriptionRequiredMsg: '请填写！',
  limitedQuotaLabel: '有限',
  expiryRequiredMsg: '请选择过期时间',
  subnetDuplicateMsg: '重复',
  subnetContainedMsg: '192.168.0.0/24"包含"192.168.0.0/25',
  withQuota: {
    description: '带配额的API-Key',
    quotaTotal: 100000,
    quotaUnit: 'total_token',
    resetCycle: '每月',
  },
  withRateLimit: {
    description: '带限流的API-Key',
    enableRateLimit: true,
    tpm: { name: 'tpm_rule_1', window: 1, maxTokens: 10000, step: 1 },
    rpm: { name: 'rpm_rule_1', window: 1, maxRequests: 100 },
    maxConcurrency: 50,
  },
  withEntity: { description: '挂载Entity的API-Key', entityName: 'op' },
  withoutEntity: { description: '不挂载Entity的API-Key' },
  unlimited: { description: '无限配额的API-Key' },
  expired: { description: '测试过期时间校验' },
  subnet: {
    description: '测试子网校验',
    duplicate: ['192.168.0.0/24', '192.168.0.0/24'],
    contained: ['192.168.0.0/24', '192.168.0.0/25'],
    valid: ['192.168.0.0/24', '192.168.1.0/24'],
  },
  searchDescription: 'API-Key',
  searchStatus: '启用',
  editDescription: '编辑后的API-Key描述',
  quotaTotalRequiredMsg: '请填写配额总量',
  quotaIntegerErrorMsg: '配额总量必须为非负整数',
  quotaMaxErrorMsg: '配额总量超出允许范围',
  quotaDecimal: 5.3,
  quotaOverMax: '66666666666666660000',
  descriptionMaxLength: 512,
  descriptionLengthErrorMsg: '描述不能超过512个字符',
  // 2026-08-16: unit=RMB 时配额上限为 9000 万元（RMB_QUOTA_MAX）
  quotaRmbMax: 90000000,
  quotaRmbOverMax: 90000001,
  quotaRmbMaxErrorMsg: 'RMB 配额不能超过 9000 万元',
  quotaRmbPrecisionErrorMsg: 'RMB 配额最多保留 4 位小数',
  int32Max: '2147483647',
  maxConcurrencyOverMax: '2147483648',
  maxConcurrencyMaxErrorMsg: '最大并发超出允许范围',
  // TPM/RPM 规则字段仍为 int64，溢出值需超过 int64 上界
  ruleValueOverMax: '9223372036854775808',
  rateLimitRuleRequiredMsg:
    /请添加 TPM\/RPM 规则|最大并发.*封禁.*限制并发数|启用限流时，至少配置一项限流规则\s*[（(]TPM\/RPM\/最大并发[）)]/,
  tpmWindowMinutesInvalidMsgTemplate: '第{index}条规则时间窗口范围为1-360分钟',
  tpmWindowMinutesRequiredMsgTemplate: '第{index}条规则时间窗口不能为空',
  tpmRuleNameRequiredMsgTemplate: '第{index}条规则名称不能为空',
  tpmStepMinutesRangeMsgTemplate: '第{index}条规则滑动步长范围为1-360分钟',
  tpmStepMinutesRequiredMsgTemplate: '第{index}条规则滑动步长不能为空',
  tpmMaxTokensMinErrorMsgTemplate: '第{index}条规则最大Token数必须大于0',
  tpmMaxTokensMaxErrorMsgTemplate: '第{index}条规则最大Token数超出允许范围',
  tpmMaxTokensRequiredMsgTemplate: '第{index}条规则最大Token数不能为空',
  rpmWindowMinutesInvalidMsgTemplate: '第{index}条规则时间窗口范围为1-360分钟',
  rpmWindowMinutesRequiredMsgTemplate: '第{index}条规则时间窗口不能为空',
  rpmRuleNameRequiredMsgTemplate: '第{index}条规则名称不能为空',
  rpmMaxRequestsMinErrorMsgTemplate: '第{index}条规则最大请求数必须大于0',
  rpmMaxRequestsMaxErrorMsgTemplate: '第{index}条规则最大请求数超出允许范围',
  rpmMaxRequestsRequiredMsgTemplate: '第{index}条规则最大请求数不能为空',
  tpmCombinationDuplicateMsg:
    '存在相同的TPM规则组合（模型、时间窗口、最大Token数、滑动步长）',
  rpmCombinationDuplicateMsg:
    '存在相同的RPM规则组合（模型、时间窗口、最大请求数）',
  ruleNameLengthErrorMsg: '规则名称长度不能超过128字符',
  resetQuota: { total: 100000000, reason: '月度重置' },
};

// ── Config ──────────────────────────────────────────────────────────

var confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

const baseUrl = confInfo['ctlHost'].replace('/login', '') + '/open-api/v1';

// ── Name sequence ───────────────────────────────────────────────────

let testNameSequence = 0;

function nextTestNameSequence() {
  testNameSequence += 1;
  return testNameSequence;
}

// ── Helper factory functions ────────────────────────────────────────

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

function entityDetailDrawer(page) {
  return ivuDrawer(page).withTitleParts(...ENTITY_DETAIL_DRAWER_PARTS);
}

async function expectEntityDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpenWithParts(...ENTITY_DETAIL_DRAWER_PARTS);
}

function apiKeyDetailDrawer(page) {
  return ivuDrawer(page).withTitle('API-Key 详情');
}

async function expectApiKeyDetailDrawerOpen(page) {
  await ivuDrawer(page).expectOpen('API-Key 详情');
}

function ivuModal(page) {
  return new IvuModalComponent(page);
}

function entityTabs(page) {
  return new IvuTabsComponent(page);
}

function entityTypeTable(page) {
  return new PageTableComponent(page);
}

// ── URL / Navigation helpers ────────────────────────────────────────

function getAppBaseUrl() {
  return confInfo['ctlHost'].replace('/login', '');
}

function buildProductPageUrl(page, path, query = '') {
  const normalizedPath = path.replace(/^\//, '');
  return `${getAppBaseUrl()}/${normalizedPath}${query}`;
}

// ── Visibility / Tab helpers ────────────────────────────────────────

function isConnectionError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('net::ERR')
  );
}

async function isVisibleSafe(locator) {
  return locator.isVisible().catch(() => false);
}

async function isTabActive(page, tabText) {
  const tab = page.locator('.ivu-tabs-nav').getByText(tabText).first();
  if (!(await isVisibleSafe(tab))) {
    return false;
  }
  return tab
    .evaluate((el) => el.classList.contains('ivu-tabs-tab-active'))
    .catch(() => false);
}

async function isEntityManagementShellVisible(page) {
  const breadcrumb = page
    .locator('.bfe-breadcrumb')
    .getByText('Entity管理', { exact: true });
  const tabs = page
    .locator('.ivu-tabs-nav')
    .getByText('Entity类型管理')
    .first();
  return (await isVisibleSafe(breadcrumb)) && (await isVisibleSafe(tabs));
}

async function isEntityTypeTabReady(page) {
  return (
    (await isTabActive(page, 'Entity类型管理')) &&
    (await isVisibleSafe(page.getByRole('button', { name: '创建类型' })))
  );
}

async function isEntityOrgTabReady(page) {
  return (
    (await isTabActive(page, 'Entity组织管理')) &&
    (await isVisibleSafe(page.getByRole('button', { name: '创建Entity' })))
  );
}

async function isApiKeyManagementPageReady(page) {
  const breadcrumb = page
    .locator('.bfe-breadcrumb')
    .getByText('API Key 管理', { exact: true });
  return (
    (await isVisibleSafe(breadcrumb)) &&
    (await isVisibleSafe(page.getByRole('button', { name: '创建' })))
  );
}

/** 限流规则表单字段 label（与 zh.js entity/apiKey 模块 i18n 对齐） */
const RATE_LIMIT_FIELD = {
  RULE_NAME: '规则名称',
  TIME_WINDOW: '时间窗口(分)',
  MAX_TOKENS: '最大Token数',
  MAX_REQUESTS: '最大请求数',
  STEP_MINUTES: '滑动步长(分)',
};

const RATE_LIMIT_FIELD_KEYS = {
  规则名称: 'name',
  '时间窗口(分)': 'window_minutes',
  时间窗口: 'window_minutes',
  最大Token数: 'max_tokens',
  最大请求数: 'max_requests',
  '滑动步长(分)': 'step_minutes',
  滑动步长: 'step_minutes',
};

function rateLimitSectionTitle(ruleType) {
  return String(ruleType).endsWith('规则') ? ruleType : `${ruleType}规则`;
}

/**
 * 定位 TPM/RPM 规则区块：优先 .rules-section，否则回退到 h4 标题父节点
 */
async function resolveRateLimitSection(drawer, ruleType) {
  const sectionTitle = rateLimitSectionTitle(ruleType);
  let section = drawer
    .locator('.rules-section')
    .filter({ hasText: sectionTitle })
    .first();
  if ((await section.count()) === 0) {
    const heading = drawer.getByRole('heading', { name: sectionTitle });
    await expect(heading).toBeVisible({ timeout: 15000 });
    section = heading.locator('..');
  }
  await expect(section).toBeVisible({ timeout: 15000 });
  return section;
}

function resolveRateLimitFieldKey(label) {
  const key = RATE_LIMIT_FIELD_KEYS[label];
  if (!key) {
    throw new Error(`未知限流规则字段标签: ${label}`);
  }
  return key;
}

// ── Page wait helpers ─────────────────────────────────────────────────

async function waitForPageSettled(page, ms = 500) {
  await page.waitForLoadState('domcontentloaded');
  if (ms > 0) {
    await page.waitForTimeout(ms);
  }
}

async function waitForEntityManagementShell(page, timeout = 15000) {
  await expect(
    page.locator('.bfe-breadcrumb').getByText('Entity管理', { exact: true }),
  ).toBeVisible({ timeout });
  await expect(
    page.locator('.ivu-tabs-nav').getByText('Entity类型管理').first(),
  ).toBeVisible({ timeout });
}

async function waitForApiKeyManagementShell(page, timeout = 15000) {
  await expect(
    page.locator('.bfe-breadcrumb').getByText('API Key 管理', { exact: true }),
  ).toBeVisible({ timeout });
  await expect(page.getByRole('button', { name: '创建' })).toBeVisible({
    timeout,
  });
}

// ── Session / Auth ──────────────────────────────────────────────────

async function ensureAuthenticatedShell(page) {
  await umUtils.handleUrlInvalidAlert(page);

  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    common.log('当前在登录页，先加载首页: ' + page.url());
    await page.goto(getAppBaseUrl() + '/', { waitUntil: 'domcontentloaded' });
    await waitForPageSettled(page, 1000);
    await umUtils.handleUrlInvalidAlert(page);
  }
}

async function ensureAppSession(page) {
  if (common.isServiceDown()) {
    test.skip(true, '服务不可用，跳过所有测试用例');
  }

  try {
    await umUtils.handleUrlInvalidAlert(page);
    await umUtils.ensureLoggedIn(page);
    await ensureAuthenticatedShell(page);
  } catch (e) {
    if (isConnectionError(e)) {
      common.setServiceDown(true);
      test.skip(true, '服务连接失败: ' + e.message);
    }
    throw e;
  }
}

// ── Navigation ──────────────────────────────────────────────────────

async function navigateToEntityManagementByUrl(page) {
  const url = getAppBaseUrl() + '/Entity';
  common.log('使用直连 URL 进入 Entity 管理页面: ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForEntityManagementShell(page);
}

async function navigateToEntityManagement(page) {
  if (await isEntityManagementShellVisible(page)) {
    common.log('已在 Entity 管理页面，跳过侧栏导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  await umUtils.handleUrlInvalidAlert(page);
  await umUtils.ensureLoggedIn(page);
  await ensureAuthenticatedShell(page);

  const sidebar = new AppSidebarComponent(page);
  const menuLabels = ['Entity管理', 'Entity Manage'];
  let navigated = false;

  for (const label of menuLabels) {
    const hasMenuItem = (await sidebar.menuItem(label).count()) > 0;
    const hasSubmenu = (await sidebar.submenuTitle(label).count()) > 0;
    if (hasMenuItem || hasSubmenu) {
      common.log('通过侧栏导航：' + label);
      await sidebar.navigate(label);
      navigated = true;
      break;
    }
  }

  if (!navigated) {
    await navigateToEntityManagementByUrl(page);
  } else {
    await waitForEntityManagementShell(page);
  }

  await umUtils.handleUrlInvalidAlert(page);
}

async function gotoEntityManagementPage(page) {
  if (await isEntityManagementShellVisible(page)) {
    common.log('已在 Entity 管理页面，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  await ensureAppSession(page);
  await navigateToEntityManagement(page);
}

async function navigateToApiKeyManagementByUrl(page) {
  const url = buildProductPageUrl(page, 'api-key');
  common.log('使用直连 URL 进入 API-Key 管理页面: ' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForApiKeyManagementShell(page);
}

async function navigateToApiKeyManagement(page) {
  if (await isApiKeyManagementPageReady(page)) {
    common.log('已在 API-Key 管理页面，跳过侧栏导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  await umUtils.handleUrlInvalidAlert(page);
  await umUtils.ensureLoggedIn(page);
  await ensureAuthenticatedShell(page);

  const sidebar = new AppSidebarComponent(page);
  const menuLabels = ['API Key 管理', 'API Key Manage', 'API Key管理'];
  let navigated = false;

  for (const label of menuLabels) {
    const hasMenuItem = (await sidebar.menuItem(label).count()) > 0;
    const hasSubmenu = (await sidebar.submenuTitle(label).count()) > 0;
    if (hasMenuItem || hasSubmenu) {
      common.log('通过侧栏导航：' + label);
      await sidebar.navigate(label);
      navigated = true;
      break;
    }
  }

  if (!navigated) {
    await navigateToApiKeyManagementByUrl(page);
  } else {
    await waitForApiKeyManagementShell(page);
  }

  await umUtils.handleUrlInvalidAlert(page);
  await entityApiUtils.ensureEntityTestData(page);
}

// ── Layout expectations ─────────────────────────────────────────────

async function expectEntityManagementLayout(page) {
  await new LayoutShellComponent(page).expectLoaded();
}

async function expectEntityManagementPageTitle(page) {
  await expect(
    page.locator('.bfe-breadcrumb').getByText('Entity管理', { exact: true }),
  ).toBeVisible();
}

async function expectEntityManagementTabs(page) {
  await entityTabs(page).expectTabsVisible('Entity类型管理', 'Entity组织管理');
}

async function switchToEntityTypeTab(page) {
  if (await isEntityTypeTabReady(page)) {
    return;
  }
  await umUtils.handleUrlInvalidAlert(page);
  await entityTabs(page).clickTabByText('Entity类型管理');
  try {
    await expect(page.getByRole('button', { name: '创建类型' })).toBeVisible({
      timeout: 10000,
    });
  } catch (e) {
    common.log('Entity 类型管理 Tab 切换未生效，重试');
    await umUtils.handleUrlInvalidAlert(page);
    await entityTabs(page).clickTabByText('Entity类型管理');
    await expect(page.getByRole('button', { name: '创建类型' })).toBeVisible({
      timeout: 10000,
    });
  }
}

async function switchToEntityOrgTab(page) {
  if (await isEntityOrgTabReady(page)) {
    return;
  }
  // 先处理可能阻挡点击的弹窗（如 Session Key 错误）
  await umUtils.handleUrlInvalidAlert(page);
  await entityTabs(page).clickTabByText('Entity组织管理');
  try {
    await expect(page.getByRole('button', { name: '创建Entity' })).toBeVisible({
      timeout: 10000,
    });
  } catch (e) {
    // 重试：再次处理弹窗并重新点击 Tab
    common.log('Entity 组织管理 Tab 切换未生效，重试');
    await umUtils.handleUrlInvalidAlert(page);
    await entityTabs(page).clickTabByText('Entity组织管理');
    await expect(page.getByRole('button', { name: '创建Entity' })).toBeVisible({
      timeout: 10000,
    });
  }
}

async function gotoEntityTypeManagementPage(page) {
  if (await isEntityTypeTabReady(page)) {
    common.log('已在 Entity 类型管理 Tab，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }
  if (await isEntityManagementShellVisible(page)) {
    await switchToEntityTypeTab(page);
    await entityApiUtils.ensureEntityTestData(page);
    return;
  }
  // 不在 Entity 管理页面（可能在欢迎页或其他页面），强制通过 URL 导航
  await umUtils.handleUrlInvalidAlert(page);
  await umUtils.ensureLoggedIn(page);
  await navigateToEntityManagementByUrl(page);
  await switchToEntityTypeTab(page);
  await entityApiUtils.ensureEntityTestData(page);
}

// ── Name generators / formatters ────────────────────────────────────

async function generateTestEntityTypeName() {
  return (
    'type_' +
    moment().format('YYYYMMDDHHmmssSSS') +
    '_' +
    nextTestNameSequence()
  );
}

async function generateTestEntityName() {
  return (
    'ent_' + moment().format('YYYYMMDDHHmmssSSS') + '_' + nextTestNameSequence()
  );
}

function makeStringOfLength(length, char = 'a') {
  return char.repeat(length);
}

function formatRuleValidationMsg(template, index) {
  return template.replace('{index}', String(index));
}

// ── Shared UI helper: selectElDrawerField (moved from EntityOrgPage) ─

async function selectElDrawerField(
  page,
  drawerTitle,
  label,
  optionText,
  { filterable = true, exact = false, skipIfContains = true } = {},
) {
  const cmp = ElSelectComponent.fromFormItem(
    page,
    ivuDrawer(page).withTitle(drawerTitle),
    label,
  );
  const trigger = cmp.rootLocator();
  await expect(trigger).toBeVisible({ timeout: 15000 });
  if (skipIfContains && optionText) {
    const selectedText = ((await trigger.innerText()) || '').replace(
      /\s+/g,
      '',
    );
    if (selectedText.includes(optionText)) {
      return;
    }
  }
  if (filterable) {
    await cmp.selectOptionFilterable(optionText);
  } else if (exact) {
    await cmp.selectOptionExact(optionText);
  } else {
    await cmp.selectOption(optionText);
  }
}

async function expectElDrawerFieldSelectedContains(
  page,
  drawerTitle,
  label,
  text,
) {
  await ElSelectComponent.fromFormItem(
    page,
    ivuDrawer(page).withTitle(drawerTitle),
    label,
  ).expectSelectedContains(text);
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  // Constants
  DRAWER_TITLE,
  RATE_LIMIT_FIELD,
  RATE_LIMIT_FIELD_KEYS,
  rateLimitSectionTitle,
  resolveRateLimitSection,
  resolveRateLimitFieldKey,
  DOC_ENTITY_TYPE,
  DOC_ENTITY_ORG,
  DOC_API_KEY,
  ENTITY_DETAIL_DRAWER_PARTS,
  API_KEY_DETAIL_DRAWER_PARTS,
  ENTITY_TYPE_SEARCH_PLACEHOLDER,
  ENTITY_SEARCH_PLACEHOLDER_NAME,
  ENTITY_SEARCH_PLACEHOLDER_TYPE,
  ENTITY_SEARCH_PLACEHOLDER_PARENT,
  ENTITY_SEARCH_PLACEHOLDER_QUOTA,
  ENTITY_SEARCH_PLACEHOLDER_ID,
  API_KEY_SEARCH_PLACEHOLDER,
  API_KEY_SEARCH_PLACEHOLDER_KEY,
  API_KEY_SEARCH_PLACEHOLDER_KEY_ID,
  baseUrl,
  confInfo,

  // Config / URL helpers
  getAppBaseUrl,
  buildProductPageUrl,

  // Name generators / formatters
  nextTestNameSequence,
  generateTestEntityTypeName,
  generateTestEntityName,
  makeStringOfLength,
  formatRuleValidationMsg,

  // Visibility / Tab helpers
  isTabActive,
  isEntityManagementShellVisible,
  isEntityTypeTabReady,
  isEntityOrgTabReady,
  isApiKeyManagementPageReady,

  // Page wait helpers
  waitForPageSettled,
  waitForEntityManagementShell,
  waitForApiKeyManagementShell,

  // Session / Auth
  ensureAppSession,

  // Navigation
  navigateToEntityManagementByUrl,
  navigateToEntityManagement,
  gotoEntityManagementPage,
  navigateToApiKeyManagementByUrl,
  navigateToApiKeyManagement,
  gotoEntityTypeManagementPage,

  // Layout expectations
  expectEntityManagementLayout,
  expectEntityManagementPageTitle,
  expectEntityManagementTabs,
  switchToEntityTypeTab,
  switchToEntityOrgTab,

  // Helper factory functions
  ivuDrawer,
  entityDetailDrawer,
  expectEntityDetailDrawerOpen,
  apiKeyDetailDrawer,
  expectApiKeyDetailDrawerOpen,
  ivuModal,
  entityTabs,
  entityTypeTable,

  // Shared UI helpers (moved from EntityOrgPage)
  selectElDrawerField,
  expectElDrawerFieldSelectedContains,
};
