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
 * 「系统安全 → 访问日志」页面封装（src/modules/AccessLog/index.vue）
 *
 * 页面形态：展示态（只读 tag + 右上角「编辑」）↔ 编辑态（「取消 / 保存」+ 带边框 tag 容器 + 输入框 +「添加」）。
 * 验收文案来源：docs/access-log/02-功能测试用例/02a-配置展示与编辑.md（ACL-01~ACL-13）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const rc = require('../resource/ResourcePageCommon');
const sessionUtils = require('../../utils/session');

const AUTH_PATH = path.join(__dirname, '../../auth.json');

/** 「系统安全 → 访问日志」前端路由路径（src/router/router.js: `path: 'access-log'`） */
const ACCESS_LOG_PATH = '/access-log';

// GET / PUT /open-api/v1/access-log/config（单例，无 /{id}）
const CONFIG_URL_RE = /\/open-api\/v1\/access-log\/config(?:\?.*)?$/;

const DOC = {
  pageTitle: '访问日志',
  alertTitle: '访问日志 Header 白名单',
  reqCardTitle: '请求头白名单（req_headers）',
  resCardTitle: '响应头白名单（res_headers）',
  reqEmpty: '未配置（不采集任何请求头）',
  resEmpty: '未配置（不采集任何响应头）',
  edit: '编辑',
  save: '保存',
  cancel: '取消',
  add: '添加',
  reqPlaceholder: '输入请求头名称，如 x-request-id',
  resPlaceholder: '输入响应头名称，如 x-trace-id',
  saveSuccess: '保存成功',
  readonlyHint: '当前账号为只读角色，仅可查看配置。',
  sensitiveHeader: (name) => `${name} 为敏感凭证头，禁止采集（服务端返回 422）`,
  emptyName: 'Header 名称不能为空',
  nameTooLong: (max) => `Header 名称长度不能超过 ${max} 字节`,
  nameIllegalChars: 'Header 名称含非法字符（仅允许 RFC 7230 token 字符）',
  duplicateHeader: (name) => `Header 已存在（大小写不敏感）：${name}`,
};

const PAGE_ROOT = '.access-log-page';

function readSessionFromAuthFile() {
  try {
    const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    for (const item of auth.origins || []) {
      const userEntry = (item.localStorage || []).find((e) => e.name === 'user');
      if (userEntry && userEntry.value) {
        const parsed = JSON.parse(userEntry.value);
        if (parsed && parsed.sessionKey) {
          return parsed;
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

async function ensureLocalStorageSession(page) {
  const session = readSessionFromAuthFile();
  if (!session) return;
  try {
    await page.evaluate((user) => {
      if (!localStorage.getItem('user')) {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('lang', 'zh');
      }
    }, session);
  } catch (e) {
    /* sandbox 下可能 SecurityError */
  }
}

// ====== 导航 ======

async function gotoAccessLogPage(page) {
  const session = readSessionFromAuthFile();
  if (session) {
    await page.addInitScript((user) => {
      try {
        if (!localStorage.getItem('user')) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('lang', 'zh');
        }
      } catch (e) {
        /* ignore */
      }
    }, session);
  }

  await rc.ensureAppSession(page);
  await page.goto(rc.getAppBaseUrl() + ACCESS_LOG_PATH, {
    waitUntil: 'domcontentloaded',
  });
  await ensureLocalStorageSession(page);
  // 会话 Key 失效时页面会弹遮罩拦截点击，先自愈再断言就绪
  await sessionUtils.ensureSessionHealthy(page, {
    retryUrl: rc.getAppBaseUrl() + ACCESS_LOG_PATH,
  });
  await expectAccessLogPageReady(page);
}

async function expectAccessLogPageReady(page) {
  await expect(page.locator(PAGE_ROOT)).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator(PAGE_ROOT).getByRole('button', { name: DOC.edit }),
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(200);
}

// ====== 区域定位 ======

function pageRoot(page) {
  return page.locator(PAGE_ROOT);
}

function alertBlock(page) {
  return pageRoot(page).locator('.ivu-alert').first();
}

function cardByTitle(page, title) {
  return pageRoot(page).locator('.ivu-card').filter({ hasText: title }).first();
}

function requestCard(page) {
  return cardByTitle(page, DOC.reqCardTitle);
}

function responseCard(page) {
  return cardByTitle(page, DOC.resCardTitle);
}

function editButton(page) {
  return pageRoot(page).getByRole('button', { name: DOC.edit });
}

function saveButton(page) {
  return pageRoot(page).getByRole('button', { name: DOC.save });
}

function cancelButton(page) {
  return pageRoot(page).getByRole('button', { name: DOC.cancel });
}

/** 编辑态出错时的行内错误（iView Alert type=error） */
function errorAlert(page) {
  return pageRoot(page).locator('.ivu-alert-error');
}

// ====== 展示态 ======

async function expectViewTags(page, card, names) {
  const tags = card.locator('.ivu-tag');
  await expect(tags).toHaveCount(names.length, { timeout: 10000 });
  for (let i = 0; i < names.length; i++) {
    await expect(tags.nth(i)).toContainText(names[i]);
  }
}

async function expectViewEmpty(page, card, emptyText) {
  await expect(card).toContainText(emptyText);
  await expect(card.locator('.ivu-tag')).toHaveCount(0);
}

async function expectAlertText(page, text) {
  await expect(alertBlock(page)).toContainText(text);
}

// ====== 编辑态 ======

async function enterEdit(page) {
  await editButton(page).click();
  await expect(saveButton(page)).toBeVisible({ timeout: 10000 });
  await expect(cancelButton(page)).toBeVisible({ timeout: 5000 });
}

async function cancelEdit(page) {
  await cancelButton(page).click();
  await expect(editButton(page)).toBeVisible({ timeout: 10000 });
}

/** 编辑态输入框（卡片内唯一 input） */
function headerInput(page, card) {
  return card.locator('.al-add-row input').first();
}

function addButton(page, card) {
  return card.getByRole('button', { name: DOC.add });
}

/** 编辑态 tag 容器（带边框） */
function tagContainer(page, card) {
  return card.locator('.al-tags');
}

/** 编辑态「添加」：填输入框后点按钮（等价回车） */
async function addHeader(page, card, name) {
  const input = headerInput(page, card);
  await input.fill(name);
  await addButton(page, card).click();
  await expect(tagContainer(page, card)).toContainText(name, { timeout: 5000 });
}

/** 负向用例：填输入框后点「添加」，不预期入列（由调用方断言错误提示） */
async function tryAddHeader(page, card, name) {
  const input = headerInput(page, card);
  await input.fill(name);
  await addButton(page, card).click();
}

/** 编辑态按名称关闭某条 tag */
async function removeHeader(page, card, name) {
  const tag = tagContainer(page, card)
    .locator('.ivu-tag')
    .filter({ hasText: name })
    .first();
  await tag.locator('.ivu-icon-ios-close').click();
  await expect(tagContainer(page, card)).not.toContainText(name, {
    timeout: 5000,
  });
}

/**
 * 保存并等待 PUT 响应：返回响应对象（调用方断言请求体）。
 */
async function saveAndWait(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        CONFIG_URL_RE.test(res.url()) && res.request().method() === 'PUT',
      { timeout: 20000 },
    ),
    saveButton(page).click(),
  ]);
  return response;
}

/** 编辑态就绪：保存/取消可见、tag 容器与添加输入存在 */
async function expectEditControls(page, card) {
  await expect(saveButton(page)).toBeVisible({ timeout: 10000 });
  await expect(cancelButton(page)).toBeVisible({ timeout: 5000 });
  await expect(tagContainer(page, card)).toBeVisible({ timeout: 5000 });
  await expect(headerInput(page, card)).toBeVisible({ timeout: 5000 });
  await expect(addButton(page, card)).toBeVisible({ timeout: 5000 });
}

/** 添加后输入框被清空 */
async function expectHeaderInputCleared(page, card) {
  await expect(headerInput(page, card)).toHaveValue('', { timeout: 5000 });
}

/** 编辑态 tag 数量 */
async function expectDraftTagCount(page, card, count) {
  await expect(tagContainer(page, card).locator('.ivu-tag')).toHaveCount(count, {
    timeout: 10000,
  });
}

/** 保存后应回到展示态并提示成功（iView Message 渲染在 body 级容器） */
async function expectBackToViewWithToast(page) {
  await expect(editButton(page)).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.ivu-message')).toContainText(DOC.saveSuccess, {
    timeout: 10000,
  });
}

// ====== 校验提示 ======

async function expectInlineError(page, text) {
  await expect(errorAlert(page)).toContainText(text, { timeout: 10000 });
}

async function expectNoInlineError(page) {
  await expect(errorAlert(page)).toHaveCount(0);
}

module.exports = {
  ACCESS_LOG_PATH,
  DOC,
  gotoAccessLogPage,
  expectAccessLogPageReady,
  pageRoot,
  alertBlock,
  requestCard,
  responseCard,
  editButton,
  saveButton,
  cancelButton,
  errorAlert,
  expectEditControls,
  expectHeaderInputCleared,
  expectDraftTagCount,
  expectViewTags,
  expectViewEmpty,
  expectAlertText,
  enterEdit,
  cancelEdit,
  headerInput,
  addButton,
  tagContainer,
  addHeader,
  tryAddHeader,
  removeHeader,
  saveAndWait,
  expectBackToViewWithToast,
  expectInlineError,
  expectNoInlineError,
};
