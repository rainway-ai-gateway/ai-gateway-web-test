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
const {
  IvuMessageComponent,
  IvuSelectComponent,
} = require('../../components/iview');

const AUTH_PATH = path.join(__dirname, '../../auth.json');

/**
 * 模型服务商（Providers）页面封装
 *
 * UI 技术栈：iView Form/Input/Select + InstancePool（复用 Cluster 组件）+ el-select（模型列表）
 * - 列表页：.action-bar「添加服务商」+ pageTable（server-pagination=false，前端筛选/分页）
 * - 创建/编辑：Drawer 内 ProviderUpsert（.provider-upsert）
 * - 详情：Drawer 内 ProviderView（.provider-view）
 * - 分段计价：Drawer 内 ProviderPricingTiers（.provider-pricing-tiers）
 *
 * 文档偏差记录（docs/providers/02，待产品确认，已保留 02 验收断言）：
 * 1. PR-C-01/13 预期「提交体 instance_pool[].name 不传」：当前 UI 经
 *    InstancePool.formatInstancePoolForApi 提交的实例对象附带 name=addr（服务端同名默认，
 *    后端以 addr 为准）。spec 中仅断言 addr/port/weight，name 字段不纳入验收断言。
 * 2. PR-V-07 预期「至少一个 weight > 0 即通过」：当前 InstancePool.validateInstanceList
 *    要求「实例权重之和必须等于100」（cluster 遗留）。创建成功用例保持单实例 weight=100。
 * 3. PR-D-02 预期「未配置分段计价」：当前 UI 详情 Card 未配置时展示 i18n「未配置」。
 * 4. PR-V-01 预期「提示名称必填」：UI 实际为 com.tipEnterX+com.name=「请输入名称」
 *    （留空）或 tipNameRule（仅空白字符），文案与 02 不一致（PR-V-01 断言将失败，如实记录）。
 * 5. PR-V-02/03 预期「长度 >64/257 拦截」：name/description 输入框带 maxlength(64/256)，
 *    Playwright fill 被 maxlength 硬性截断，长度超限分支不可经 UI 复现。
 * 6. PR-V-06/07 预期「0/65536/-1/101/非数字拦截」：iView InputNumber :min/:max 对
 *    fill 硬性 clamp（0→1、65536→65535、-1→0、101→100），非数字被还原为原值，
 *    越界/非整数拦截不可复现；仅 fill('') 触发「取值范围1-65535」/「请输入实例权重」。
 * 7. PR-V-07 预期「全部为 0 拦截（至少一个 weight > 0）」：UI 权重和=100 校验先于
 *    正权重校验，全 0 提示「实例权重之和必须等于100」（PR-V-07 断言 02 文案将失败）。
 * 8. PR-V-04 预期「空实例池提交被拦截」：UI 至少保留 1 行实例（仅剩 1 行时删除按钮
 *    disabled），空实例池不可达，以删除按钮禁用断言「至少保留 1 行」。
 * 9. PR-V-13 预期「回填不重复」：UI discoverModels 仅 filter(Boolean) 不去重（buildPayload
 *    才用 Set 去重），mock 传唯一列表；el-select tag 可点击删除（既有偏差）。
 * 10. PR-V-15 预期「time_ranges 为空拦截 / weekdays 越界拦截」：UI 至少保留 1 个时间段
 *    （timeRanges.length<=1 删除按钮 disabled）；weekdays 为固定 7 项 Checkbox 不会越界，
 *    两分支不可经 UI 复现。
 */

const LABEL = {
  name: '名称',
  description: '描述',
  instanceMode: '实例形态',
  instanceList: '实例IP列表',
  domain: '服务商域名',
  keyName: 'Key 名称',
  keyValue: 'Key 值',
  timeZone: '时区',
  tierType: '计价时段',
  timeRanges: '时间段',
};

const MSG = {
  submitSuccess: '提交成功!',
  deleteSuccess: '删除成功!',
  pricingTiersUpdated: '分段计价配置已更新',
  deleteConfirmTitle: '信息提示',
  deleteConfirmContentPrefix: '是否删除',
  timeZoneRequired: '请填写时区',
  timeZoneInvalid: '时区须为合法 IANA 时区名',
  endAfterStart: '结束时间须大于开始时间',
  rangesOverlap: '时间段存在重叠',
};

const DRAWER_TITLE = {
  create: '添加服务商',
  edit: '编辑服务商',
  view: '详情',
  pricingTiers: '分段计价配置',
};

const COLUMN_HEADERS = ['名称', '描述', '协议', '模型', '操作'];

// 02 文档（PR-L-01/PR-T-01 等）验收文案，作为断言基准（design/02 优先于 i18n）
const DOC = {
  listHeaders: COLUMN_HEADERS,
  createButton: '添加服务商',
  pricingTiersTitle: '分段计价配置',
  defaultTimeZone: 'Asia/Shanghai',
  defaultRange: { weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
  instanceModeIp: 'IP',
  instanceModeDomain: '服务商域名',
  get: '获取',
};

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

async function ensureLocalStorageSession(page) {
  let hasUser = false;
  try {
    hasUser = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      try {
        const user = JSON.parse(userStr);
        return !!user.sessionKey;
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    // localStorage 可能因 SecurityError 不可用（页面未就绪），走 auth.json 兜底
  }
  if (hasUser) return;

  const session = readSessionFromAuthFile();
  if (session) {
    try {
      await page.evaluate((user) => {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('lang', 'zh');
      }, session);
    } catch (e) {
      // sandbox 下 page.evaluate 可能 SecurityError，由 addInitScript 兜底
    }
  }
}

// ---------- 导航 ----------

async function gotoProvidersPage(page) {
  await rc.ensureAppSession(page);

  // 在导航前注入 initScript，确保页面加载时 localStorage 已就绪
  // （sandbox 下 page.evaluate 会 SecurityError，initScript 在文档创建时执行可绕过）
  const session = readSessionFromAuthFile();
  if (session) {
    await page.addInitScript((user) => {
      try {
        if (!localStorage.getItem('user')) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('lang', 'zh');
        }
      } catch (e) {
        // 忽略 SecurityError
      }
    }, session);
  }

  await page.goto(rc.getAppBaseUrl() + '/providers');
  await page.waitForLoadState('domcontentloaded');
  await ensureLocalStorageSession(page);
  await expect(
    page.getByRole('button', { name: DOC.createButton }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
}

async function expectProvidersPageReady(page) {
  await expect(
    page.getByRole('button', { name: DOC.createButton }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
}

// ---------- 表格 / 消息 ----------

function providerTable(page) {
  return new PageTableComponent(page);
}

function messages(page) {
  return new IvuMessageComponent(page);
}

/**
 * 断言 iView $Message 全局提示包含指定文本（处理同时存在多个消息的情况）
 */
async function expectMessage(page, text) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15000 });
}

async function expectTableHeaders(page) {
  await providerTable(page).expectHeaders(...COLUMN_HEADERS);
}

function rowAction(page, rowText, action) {
  return providerTable(page).rowAction(rowText, action);
}

async function clickRowAction(page, rowText, action) {
  await rowAction(page, rowText, action).click();
  await page.waitForTimeout(500);
}

// ---------- Drawer 通用 ----------

async function waitForDrawerContent(page, selector, title) {
  // 页面存在多个 Drawer（upsert / pricingTiers），仅取当前可见的抽屉
  const drawer = page.locator('.ivu-drawer:visible').last();
  await expect(drawer).toBeVisible({ timeout: 10000 });
  if (title) {
    await expect(drawer.locator('.ivu-drawer-header-inner')).toContainText(
      title,
    );
  }
  await expect(page.locator(selector).last()).toBeVisible({ timeout: 10000 });
}

// ---------- Upsert（创建 / 编辑） ----------

function upsertScope(page) {
  return page.locator('.provider-upsert');
}

async function expectUpsertScopeVisible(page) {
  await expect(upsertScope(page)).toBeVisible({ timeout: 10000 });
}

async function expectUpsertScopeHidden(page) {
  await expect(upsertScope(page)).toBeHidden({ timeout: 10000 });
}

function upsertFormItem(scope, label) {
  const scopePage = scope.page();
  // 非 exact 匹配：必填项 label 可能带「* 」前缀（如 "* 名称"）
  return scope.locator('.ivu-form-item').filter({
    has: scopePage.locator('.ivu-form-item-label').getByText(label).first(),
  });
}

async function openCreateDrawer(page) {
  await page.getByRole('button', { name: DOC.createButton }).click();
  await waitForDrawerContent(page, '.provider-upsert', DRAWER_TITLE.create);
}

async function openEditDrawer(page, rowText) {
  await clickRowAction(page, rowText, '编辑');
  await waitForDrawerContent(page, '.provider-upsert', DRAWER_TITLE.edit);
}

async function openViewDrawer(page, rowText) {
  await clickRowAction(page, rowText, '详情');
  await waitForDrawerContent(page, '.provider-view', DRAWER_TITLE.view);
}

// ---------- 基本信息 ----------

async function fillInput(input, value) {
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click({ clickCount: 3 });
  await input.fill(String(value));
  await input.blur();
}

async function fillInputByLabel(page, scope, label, value) {
  const item = upsertFormItem(scope, label);
  const input = item.locator('input:not([type="hidden"])').first();
  await fillInput(input, value);
}

async function getInputByLabelValue(page, scope, label) {
  const item = upsertFormItem(scope, label);
  const input = item.locator('input:not([type="hidden"])').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  return input.inputValue();
}

async function fillName(page, value) {
  await fillInputByLabel(page, upsertScope(page), LABEL.name, value);
}

async function fillDescription(page, value) {
  await fillInputByLabel(page, upsertScope(page), LABEL.description, value);
}

// ---------- 实例池 ----------

function instanceListScope(page) {
  return upsertFormItem(upsertScope(page), LABEL.instanceList);
}

function instanceRows(page) {
  return instanceListScope(page)
    .locator('.formBox table tr')
    .filter({ has: page.locator('input') });
}

/**
 * 切换实例形态（IP / 服务商域名）
 */
async function selectInstanceMode(page, modeLabel) {
  const item = upsertFormItem(upsertScope(page), LABEL.instanceMode);
  const select = new IvuSelectComponent(
    page,
    item.locator('.ivu-select').first(),
  );
  await select.selectOptionExact(modeLabel);
}

/**
 * 填写一行 IP 模式实例（addr / port / weight）
 */
async function fillInstanceRow(page, index, { addr, port, weight }) {
  const row = instanceRows(page).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  if (addr !== undefined) {
    await fillInput(row.locator('td').nth(0).locator('input').first(), addr);
  }
  if (port !== undefined) {
    await fillInputNumber(
      row.locator('td').nth(1).locator('.ivu-input-number-input'),
      port,
    );
  }
  if (weight !== undefined) {
    await fillInputNumber(
      row.locator('td').nth(2).locator('.ivu-input-number-input'),
      weight,
    );
  }
  await page.waitForTimeout(200);
}

async function fillInputNumber(input, value) {
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click({ clickCount: 3 });
  await input.fill(String(value));
  await input.blur();
  // iView InputNumber 的 :min/:max 与 v-model 校验依赖 native change 事件
  await input.evaluate((el) => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await input.blur();
}

/**
 * 填写服务商域名（domain 模式单输入框）
 */
async function fillDomainName(page, domain) {
  const item = upsertFormItem(upsertScope(page), LABEL.domain);
  const input = item.locator('input:not([type="hidden"])').first();
  await fillInput(input, domain);
}

async function expectInstanceListError(page, message) {
  const err = instanceListScope(page).locator('.instance-list-error');
  await expect(err).toBeVisible({ timeout: 10000 });
  if (message !== undefined) {
    await expect(err).toHaveText(message);
  }
}

// ---------- 模型协议 / 模型获取 ----------

/**
 * 选择模型协议（openai / anthropic）。
 * 创建抽屉默认已选中 ['openai']，已选协议跳过点击，避免多选反选清空。
 * 注意：iView multiple Select 选中后下拉保持展开；若下拉展开时点击抽屉内其他按钮
 * （如「提交」），click-outside 会在捕获阶段 stopPropagation 吞掉该点击，导致按钮失效。
 * 因此只要有实际点击操作，选择结束后统一按 Escape 收起下拉。
 */
async function selectProtocols(page, protocols) {
  const item = upsertFormItem(upsertScope(page), '模型协议');
  const select = new IvuSelectComponent(
    page,
    item.locator('.ivu-select').first(),
  );
  const tagTexts = await item
    .locator(
      '.ivu-select-selection .ivu-tag-content, .ivu-select-selection .ivu-tag',
    )
    .allTextContents()
    .catch(() => []);
  const selected = new Set(tagTexts.map((t) => t.trim()).filter(Boolean));
  let clicked = false;
  for (const protocol of protocols) {
    if (selected.has(protocol)) {
      continue;
    }
    await select.selectOptionExact(protocol);
    selected.add(protocol);
    clicked = true;
    await page.waitForTimeout(200);
  }
  if (clicked) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

function discoverButton(page) {
  return upsertScope(page).getByRole('button', { name: DOC.get });
}

async function expectDiscoverDisabled(page) {
  await expect(discoverButton(page)).toBeDisabled();
}

async function expectDiscoverEnabled(page) {
  await expect(discoverButton(page)).toBeEnabled();
}

/**
 * 点击「获取」探测模型并等待 discover-models 响应
 */
async function discoverModelsAndWait(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/providers/tools/discover-models') &&
        r.request().method() === 'POST',
      { timeout: 15000 },
    ),
    discoverButton(page).click(),
  ]);
  await response.finished().catch(() => {});
  return response;
}

// ---------- Keys ----------

function keysTable(page) {
  return upsertScope(page).locator('.keys-table');
}

function keyRows(page) {
  return keysTable(page).locator('tbody tr');
}

async function expectKeysHeaders(page) {
  const headers = keysTable(page).locator('th');
  await expect(headers).toHaveCount(3);
  await expect(headers.nth(0)).toHaveText(LABEL.keyName);
  await expect(headers.nth(1)).toHaveText(LABEL.keyValue);
  await expect(headers.nth(2)).toHaveText('操作');
}

async function addKeyRow(page) {
  await upsertScope(page)
    .getByRole('button', { name: /添加 Key/ })
    .click();
  await page.waitForTimeout(200);
}

async function fillKeyRow(page, index, { name, key }) {
  const row = keyRows(page).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  if (name !== undefined) {
    await fillInput(row.locator('td').nth(0).locator('input').first(), name);
  }
  if (key !== undefined) {
    await fillInput(row.locator('td').nth(1).locator('input').first(), key);
  }
  await page.waitForTimeout(200);
}

// ---------- 提交 / 取消 ----------

async function clickSubmit(page) {
  await upsertScope(page).getByRole('button', { name: '提交' }).click();
}

async function expectDrawerHidden(page) {
  await expectUpsertScopeHidden(page);
}

/**
 * 提交创建表单并等待列表刷新（Promise.all + waitForResponse）
 * 返回 POST /providers 响应（可断言请求体）
 */
async function submitUpsertAndWait(page, { expectSuccess = true } = {}) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith('/open-api/v1/providers') &&
        r.request().method() === 'POST' &&
        r.status() === 200,
      { timeout: 15000 },
    ),
    clickSubmit(page),
  ]);
  await response.finished().catch(() => {});
  // 提交成功后 index.vue 关闭抽屉并 fetchList（GET /providers）
  await page
    .waitForResponse(
      (r) =>
        /\/open-api\/v1\/providers$/.test(r.url()) &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    )
    .catch(() => {});
  if (expectSuccess) {
    await expectMessage(page, MSG.submitSuccess);
    await expectUpsertScopeHidden(page);
  }
  return response;
}

// ---------- 详情页（ProviderView） ----------

function viewScope(page) {
  return page.locator('.provider-view');
}

async function expectViewScopeVisible(page) {
  await expect(viewScope(page)).toBeVisible({ timeout: 10000 });
}

async function viewInfoValue(page, cardTitle, label) {
  const scope = viewScope(page);
  await expect(scope).toBeVisible({ timeout: 10000 });

  const card = scope
    .locator('.ivu-card.info-card')
    .filter({ hasText: cardTitle });
  await expect(card).toBeVisible({ timeout: 10000 });

  const row = card.locator('.info-row').filter({ hasText: label }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  return ((await row.locator('.info-value').textContent()) || '').trim();
}

// ---------- 分段计价（ProviderPricingTiers） ----------

function pricingTiersScope(page) {
  return page.locator('.provider-pricing-tiers');
}

async function expectPricingTiersScopeVisible(page) {
  await expect(pricingTiersScope(page)).toBeVisible({ timeout: 10000 });
}

async function expectPricingTiersScopeHidden(page) {
  await expect(pricingTiersScope(page)).toBeHidden({ timeout: 10000 });
}

async function openPricingTiersDrawer(page, rowText) {
  await clickRowAction(page, rowText, DOC.pricingTiersTitle);
  await waitForDrawerContent(
    page,
    '.provider-pricing-tiers',
    DRAWER_TITLE.pricingTiers,
  );
}

async function fillTimeZone(page, value) {
  const item = upsertFormItem(pricingTiersScope(page), LABEL.timeZone);
  const input = item.locator('input:not([type="hidden"])').first();
  await fillInput(input, value);
}

async function getTimeZoneValue(page) {
  const item = upsertFormItem(pricingTiersScope(page), LABEL.timeZone);
  const input = item.locator('input:not([type="hidden"])').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  return input.inputValue();
}

async function expectPricingError(page, message) {
  const err = pricingTiersScope(page).locator('.error-text');
  await expect(err).toBeVisible({ timeout: 10000 });
  if (message !== undefined) {
    await expect(err).toHaveText(message);
  }
}

function timeRangeRows(page) {
  return pricingTiersScope(page).locator('.ranges-table tbody tr');
}

async function expectTimeRangeRowCount(page, count) {
  await expect(timeRangeRows(page)).toHaveCount(count);
}

async function addTimeRangeRow(page) {
  await pricingTiersScope(page)
    .getByRole('button', { name: /添加时间段/ })
    .click();
  await page.waitForTimeout(200);
}

async function fillTimeInput(page, rowIndex, field, value) {
  const row = timeRangeRows(page).nth(rowIndex);
  await expect(row).toBeVisible({ timeout: 10000 });
  const input = row.locator('input.time-input').nth(field === 'start' ? 0 : 1);
  await fillInput(input, value);
}

async function getTimeInputValue(page, rowIndex, field) {
  const row = timeRangeRows(page).nth(rowIndex);
  const input = row.locator('input.time-input').nth(field === 'start' ? 0 : 1);
  await expect(input).toBeVisible({ timeout: 10000 });
  return input.inputValue();
}

/**
 * 点击快捷链接（全选 / 工作日 / 周末）
 */
async function clickWeekdayQuickLink(page, label) {
  await pricingTiersScope(page)
    .locator('.weekday-quick-link')
    .filter({ hasText: label })
    .first()
    .click();
  await page.waitForTimeout(200);
}

async function clickSubmitPricingTiers(page) {
  await pricingTiersScope(page).getByRole('button', { name: '提交' }).click();
}

/**
 * 提交分段计价并等待 PUT 响应 + 成功提示 + Drawer 关闭
 */
async function submitPricingTiersAndWait(page, { expectSuccess = true } = {}) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/pricing-tiers') &&
        r.request().method() === 'PUT' &&
        r.status() === 200,
      { timeout: 15000 },
    ),
    clickSubmitPricingTiers(page),
  ]);
  await response.finished().catch(() => {});
  // 提交成功后 index.vue 关闭 Drawer 并 fetchList
  await page
    .waitForResponse(
      (r) =>
        /\/open-api\/v1\/providers$/.test(r.url()) &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    )
    .catch(() => {});
  if (expectSuccess) {
    await expectMessage(page, MSG.pricingTiersUpdated);
    await expectPricingTiersScopeHidden(page);
  }
  return response;
}

// ---------- 删除 ----------

async function clickDelete(page, rowText) {
  await clickRowAction(page, rowText, '删除');
}

async function expectDeleteConfirm(page, providerName) {
  const modal = page.locator('.ivu-modal-wrap:visible .ivu-modal').first();
  await expect(modal).toBeVisible({ timeout: 10000 });
  await expect(modal).toContainText(MSG.deleteConfirmTitle);
  await expect(modal).toContainText(
    MSG.deleteConfirmContentPrefix + providerName,
  );
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
 * 确认删除并等待 DELETE 响应 + 成功提示 + 列表刷新（Promise.all）
 */
async function confirmDeleteAndWait(
  page,
  providerName,
  { expectSuccess = true } = {},
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/providers/') &&
        r.request().method() === 'DELETE' &&
        r.status() === 200,
      { timeout: 15000 },
    ),
    clickDeleteConfirmOk(page),
  ]);
  await response.finished().catch(() => {});
  // 删除成功后 index.vue 关闭弹窗并 fetchList（全量刷新）
  await page
    .waitForResponse(
      (r) =>
        /\/open-api\/v1\/providers$/.test(r.url()) &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    )
    .catch(() => {});
  if (expectSuccess) {
    await expectMessage(page, MSG.deleteSuccess);
  }
  return response;
}

/**
 * 确认删除并等待指定状态码的 DELETE 响应（供 409 被引用保护等场景断言）
 * status=0 表示接受任意状态码
 */
async function confirmDeleteAndWaitForStatus(page, { status = 200 } = {}) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/providers/') &&
        r.request().method() === 'DELETE' &&
        (status === 0 || r.status() === status),
      { timeout: 15000 },
    ),
    clickDeleteConfirmOk(page),
  ]);
  await response.finished().catch(() => {});
  return response;
}

async function expectDeleteConfirmHidden(page) {
  await expect(page.locator('.ivu-modal-wrap:visible').first()).toBeHidden({
    timeout: 10000,
  });
}

// ---------- 列表筛选 / 分页（PR-L-02 ~ PR-L-09） ----------

const LIST_URL_RE = /\/open-api\/v1\/providers$/;

function searchInput(page, title) {
  // pageTable 搜索栏（.searchTable）iView Input，placeholder = 请输入{title}查询
  return page.locator('.searchTable input[placeholder*="' + title + '"]');
}

async function filterListSearch(page, title, keyword) {
  const input = searchInput(page, title);
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.click({ clickCount: 3 });
  await input.fill(String(keyword));
  await page.waitForTimeout(300);
}

async function clearListSearch(page, title) {
  await filterListSearch(page, title, '');
}

async function filterListByProtocol(page, protocol) {
  const select = new IvuSelectComponent(
    page,
    page.locator('.searchTable .ivu-select').first(),
  );
  await select.selectOptionExact(protocol);
  await page.waitForTimeout(300);
}

/**
 * 断言某交互（筛选 / 翻页 / 切页大小）不触发 GET /providers 列表请求
 */
async function expectNoListRequestDuring(page, action) {
  const hits = [];
  const handler = (req) => {
    if (req.method() === 'GET' && LIST_URL_RE.test(req.url())) {
      hits.push(req.url());
    }
  };
  page.on('request', handler);
  await action();
  await page.waitForTimeout(800);
  page.off('request', handler);
  expect(hits, '本地筛选/分页不应触发 GET /providers 请求').toEqual([]);
}

function paginationScope(page) {
  return page.locator('.page-table .el-pagination');
}

async function clickPageNext(page) {
  await paginationScope(page).locator('.btn-next').click();
  await page.waitForTimeout(300);
}

async function clickPagePrev(page) {
  await paginationScope(page).locator('.btn-prev').click();
  await page.waitForTimeout(300);
}

async function gotoPage(page, number) {
  await paginationScope(page)
    .locator('.el-pager li.number')
    .filter({ hasText: String(number) })
    .click();
  await page.waitForTimeout(300);
}

async function selectPageSize(page, size) {
  await paginationScope(page).locator('.el-select .el-input').click();
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: String(size) })
    .first()
    .click();
  await page.waitForTimeout(300);
}

async function expectPaginationVisible(page) {
  await expect(paginationScope(page)).toBeVisible({ timeout: 10000 });
}

async function expectEmptyProvidersTable(page) {
  const tip = page.locator('.show-iView-Table .ivu-table-tip');
  await expect(tip).toBeVisible({ timeout: 10000 });
}

/**
 * 悬停模型列 `+N` 折叠 Tag，展示全部模型 Tooltip
 */
async function hoverModelMoreTag(page, rowText) {
  const row = providerTable(page).rowByText(rowText);
  await row.locator('.provider-model-more-tag').hover();
}

async function expectModelsTooltip(page, models) {
  const tooltip = page.locator('.provider-models-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 10000 });
  for (const model of models) {
    await expect(tooltip).toContainText(model);
  }
}

// ---------- Upsert：编辑态 / 实例池行操作 / 协议清空 / Keys 行（PR-C-03~15） ----------

async function expectNameDisabled(page) {
  const item = upsertFormItem(upsertScope(page), LABEL.name);
  await expect(item.locator('input').first()).toBeDisabled();
}

async function addInstanceRow(page) {
  await instanceListScope(page).getByRole('button', { name: /创建/ }).click();
  await page.waitForTimeout(200);
}

async function clickInstanceDelete(page, index) {
  const row = instanceRows(page).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td').nth(3).getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(300);
}

async function expectInstanceDeleteDisabled(page, index) {
  const row = instanceRows(page).nth(index);
  await expect(
    row.locator('td').nth(3).getByRole('button', { name: '删除' }),
  ).toBeDisabled();
}

async function expectInstanceRowCount(page, count) {
  await expect(instanceRows(page)).toHaveCount(count);
}

/**
 * 清空全部已选模型协议（多选反选陷阱：默认已选 openai，直接点击会反选清空，
 * 需通过 tag 关闭图标移除）
 */
async function clearProtocols(page) {
  const item = upsertFormItem(upsertScope(page), '模型协议');
  const closeIcons = item.locator(
    '.ivu-select-selection .ivu-tag .ivu-icon-ios-close',
  );
  const n = await closeIcons.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    await closeIcons.first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(200);
}

/**
 * 断言协议多选已选 tag 数量（PR-V-08：多选不允许重复项，重复选择不产生新 tag）
 */
async function expectProtocolTagCount(page, count) {
  const item = upsertFormItem(upsertScope(page), '模型协议');
  await expect(item.locator('.ivu-select-selection .ivu-tag')).toHaveCount(
    count,
  );
}

/**
 * 断言协议下拉可选选项（打开下拉读取全部选项文本，随后按 Escape 收起）
 */
async function expectProtocolOptions(page, options) {
  const item = upsertFormItem(upsertScope(page), '模型协议');
  const select = new IvuSelectComponent(
    page,
    item.locator('.ivu-select').first(),
  );
  const readItems = async () => {
    await select.trigger.click();
    await page.waitForTimeout(200);
    let items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
    if ((await items.count()) === 0) {
      await select.trigger.click();
      await page.waitForTimeout(200);
      items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
    }
    const texts = (await items.allTextContents()).map((t) => t.trim());
    expect(texts).toEqual(options);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  };
  await readItems();
}

async function expectFormItemError(page, label, text) {
  const item = upsertFormItem(upsertScope(page), label);
  const tip = item.locator('.ivu-form-item-error-tip').first();
  await expect(tip).toBeVisible({ timeout: 10000 });
  if (text !== undefined) {
    await expect(tip).toContainText(text);
  }
}

/**
 * 断言 Keys 区表单错误提示（PR-V-11/12：keys 行内 FormItem 无 label（inline-form-item），
 * 无法按 label 定位，需在 upsert 作用域内按错误文案过滤）
 */
async function expectKeysFormError(page, text) {
  const tips = upsertScope(page).locator('.ivu-form-item-error-tip');
  await expect(tips.first()).toBeVisible({ timeout: 10000 });
  if (text !== undefined) {
    await expect(tips.filter({ hasText: text }).first()).toBeVisible({
      timeout: 10000,
    });
  }
}

async function clickKeyDelete(page, index) {
  const row = keyRows(page).nth(index);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(300);
}

async function expectKeyRowCount(page, count) {
  await expect(keyRows(page)).toHaveCount(count);
}

async function closeUpsertDrawer(page) {
  await page.locator('.ivu-drawer:visible .ivu-drawer-close').click();
  await expectUpsertScopeHidden(page);
}

// ---------- Upsert：模型列表接口 / 模型获取（PR-C-07~10、PR-V-09/10） ----------

function endpointItem(page) {
  return upsertFormItem(upsertScope(page), '模型列表接口');
}

async function selectEndpointSchema(page, schema) {
  const select = new IvuSelectComponent(
    page,
    endpointItem(page).locator('.endpoint-protocol').first(),
  );
  await select.selectOptionExact(schema + '://');
}

/**
 * 断言模型列表接口 schema 下拉可选选项（打开下拉读取全部选项文本，随后按 Escape 收起）
 */
async function expectEndpointSchemaOptions(page, schemas) {
  const select = new IvuSelectComponent(
    page,
    endpointItem(page).locator('.endpoint-protocol').first(),
  );
  await select.trigger.click();
  await page.waitForTimeout(200);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const texts = (await items.allTextContents()).map((t) => t.trim());
  expect(texts).toEqual(schemas);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function fillEndpointUri(page, uri) {
  await fillInput(
    endpointItem(page).locator('.endpoint-uri input').first(),
    uri,
  );
}

async function expectEndpointHostText(page, text) {
  await expect(endpointItem(page).locator('.endpoint-host')).toHaveText(text);
}

/**
 * mock POST /providers/tools/discover-models 返回固定模型列表（探测不可达时保证用例稳定）
 */
async function mockDiscoverModels(page, models) {
  await page.route(
    '**/open-api/v1/providers/tools/discover-models',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ErrNum: 200,
          ErrMsg: 'success',
          Data: { models },
        }),
      });
    },
  );
}

async function expectModelsSelectPlaceholder(page, text) {
  const input = upsertScope(page).locator(
    '.models-row .el-select .el-input__inner',
  );
  await expect(input).toHaveAttribute('placeholder', text);
}

async function expectModelTags(page, models) {
  const tags = upsertScope(page).locator('.models-row .el-select .el-tag');
  await expect(tags).toHaveCount(models.length);
  for (const model of models) {
    await expect(
      upsertScope(page).locator('.models-row .el-select'),
    ).toContainText(model);
  }
}

function modelsSelectInput(page) {
  return upsertScope(page).locator('.models-row .el-select .el-input__inner');
}

/**
 * 读取模型列表已回填 tag 文本（PR-V-13：断言回填结果非空且不重复）
 */
async function modelTagsText(page) {
  const tags = upsertScope(page).locator('.models-row .el-select .el-tag');
  return (await tags.allTextContents()).map((t) => t.trim()).filter(Boolean);
}

// ---------- 详情页（ProviderView，PR-D-01/02） ----------

function viewCard(page, title) {
  return viewScope(page)
    .locator('.ivu-card.info-card')
    .filter({ hasText: title });
}

async function viewCardVisible(page, title) {
  await expect(viewCard(page, title)).toBeVisible({ timeout: 10000 });
}

function viewTableRows(page, cardTitle) {
  return viewCard(page, cardTitle).locator('table.kv-table tbody tr');
}

async function expectViewNoInputs(page) {
  // 详情只读卡片形态，不渲染任何输入框
  await expect(viewScope(page).locator('input')).toHaveCount(0);
}

// ---------- 分段计价：适用时段 Checkbox / 快捷 / 行删除（PR-T-01~07/09/10） ----------

function weekdayCheckbox(page, rowIndex, dayLabel) {
  const row = timeRangeRows(page).nth(rowIndex);
  return row
    .locator('.weekday-checkboxes .ivu-checkbox-wrapper')
    .filter({ hasText: dayLabel });
}

async function clickWeekdayCheckbox(page, rowIndex, dayLabel) {
  await weekdayCheckbox(page, rowIndex, dayLabel).click();
  await page.waitForTimeout(200);
}

async function expectWeekdayChecked(page, rowIndex, dayLabels) {
  for (const label of dayLabels) {
    await expect(
      weekdayCheckbox(page, rowIndex, label).locator('input'),
    ).toBeChecked();
  }
}

async function expectWeekdayUnchecked(page, rowIndex, dayLabels) {
  for (const label of dayLabels) {
    await expect(
      weekdayCheckbox(page, rowIndex, label).locator('input'),
    ).not.toBeChecked();
  }
}

async function expectWeekdayCheckedCount(page, rowIndex, count) {
  const row = timeRangeRows(page).nth(rowIndex);
  await expect(
    row.locator('.weekday-checkboxes .ivu-checkbox-checked'),
  ).toHaveCount(count);
}

/**
 * 断言某行适用时段 Checkbox 总项数（PR-V-15：UI 固定 7 项（周一~周日），不会产生越界）
 */
async function expectWeekdayOptionsCount(page, rowIndex, count) {
  const row = timeRangeRows(page).nth(rowIndex);
  await expect(
    row.locator('.weekday-checkboxes .ivu-checkbox-wrapper'),
  ).toHaveCount(count);
}

async function clickDeleteTimeRange(page, rowIndex) {
  const row = timeRangeRows(page).nth(rowIndex);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(300);
}

async function expectDeleteTimeRangeDisabled(page, rowIndex) {
  const row = timeRangeRows(page).nth(rowIndex);
  await expect(row.getByRole('button', { name: '删除' })).toBeDisabled();
}

// ---------- 消息（部分匹配，用于后端 ErrMsg 文案容差） ----------

async function expectMessageContaining(page, text) {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible({
    timeout: 15000,
  });
}

module.exports = {
  LABEL,
  MSG,
  DRAWER_TITLE,
  COLUMN_HEADERS,
  DOC,
  gotoProvidersPage,
  expectProvidersPageReady,
  providerTable,
  messages,
  expectMessage,
  expectTableHeaders,
  rowAction,
  clickRowAction,
  waitForDrawerContent,
  upsertScope,
  upsertFormItem,
  instanceRows,
  modelsSelectInput,
  expectUpsertScopeVisible,
  expectUpsertScopeHidden,
  openCreateDrawer,
  openEditDrawer,
  openViewDrawer,
  fillInputByLabel,
  getInputByLabelValue,
  fillName,
  fillDescription,
  selectInstanceMode,
  fillInstanceRow,
  fillDomainName,
  expectInstanceListError,
  selectProtocols,
  discoverButton,
  expectDiscoverDisabled,
  expectDiscoverEnabled,
  discoverModelsAndWait,
  keysTable,
  keyRows,
  expectKeysHeaders,
  addKeyRow,
  fillKeyRow,
  clickSubmit,
  expectDrawerHidden,
  submitUpsertAndWait,
  viewScope,
  expectViewScopeVisible,
  viewInfoValue,
  pricingTiersScope,
  expectPricingTiersScopeVisible,
  expectPricingTiersScopeHidden,
  openPricingTiersDrawer,
  fillTimeZone,
  getTimeZoneValue,
  expectPricingError,
  timeRangeRows,
  expectTimeRangeRowCount,
  addTimeRangeRow,
  fillTimeInput,
  getTimeInputValue,
  clickWeekdayQuickLink,
  clickSubmitPricingTiers,
  submitPricingTiersAndWait,
  clickDelete,
  expectDeleteConfirm,
  clickDeleteConfirmOk,
  clickDeleteConfirmCancel,
  confirmDeleteAndWait,
  confirmDeleteAndWaitForStatus,
  expectDeleteConfirmHidden,
  filterListSearch,
  clearListSearch,
  filterListByProtocol,
  expectNoListRequestDuring,
  paginationScope,
  clickPageNext,
  clickPagePrev,
  gotoPage,
  selectPageSize,
  expectPaginationVisible,
  expectEmptyProvidersTable,
  hoverModelMoreTag,
  expectModelsTooltip,
  expectNameDisabled,
  addInstanceRow,
  clickInstanceDelete,
  expectInstanceDeleteDisabled,
  expectInstanceRowCount,
  clearProtocols,
  expectProtocolTagCount,
  expectProtocolOptions,
  expectFormItemError,
  expectKeysFormError,
  clickKeyDelete,
  expectKeyRowCount,
  closeUpsertDrawer,
  selectEndpointSchema,
  expectEndpointSchemaOptions,
  fillEndpointUri,
  expectEndpointHostText,
  mockDiscoverModels,
  expectModelsSelectPlaceholder,
  expectModelTags,
  modelTagsText,
  viewCard,
  viewCardVisible,
  viewTableRows,
  expectViewNoInputs,
  weekdayCheckbox,
  clickWeekdayCheckbox,
  expectWeekdayChecked,
  expectWeekdayUnchecked,
  expectWeekdayCheckedCount,
  expectWeekdayOptionsCount,
  clickDeleteTimeRange,
  expectDeleteTimeRangeDisabled,
  expectMessageContaining,
};
