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
 * 访问日志 - 字段校验与后端兜底（ACL-10 / ACL-11 / ACL-13）
 *
 * 设计依据：docs/access-log/02-功能测试用例/02a-配置展示与编辑.md
 * 接口依据：design-docs/api-define/OpenAPI接口定义/access-log.md（元素格式 / 归一去重 / 敏感头 → 422）
 * 运行：npx playwright test tests/access-log/test_04_access_log_validation.spec.js
 */
const { test, expect } = require('@playwright/test');
const ap = require('../../pages/access-log/AccessLogPage');
const api = require('../../api/access-log-api-utils');

test.describe('访问日志 - ACL-10 Header 名称格式校验', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await api.restoreAccessLogConfigViaApi(page, {
      req_headers: [],
      res_headers: [],
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ap.expectAccessLogPageReady(page);
    await ap.enterEdit(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('空值 / 纯空白 / 超 128 字节 / 非法字符拦截；合法名称通过', async ({
    page,
  }) => {
    const card = () => ap.requestCard(page);

    await test.step('1. 空值 → 名称不能为空', async () => {
      await ap.addButton(page, card()).click();
      await ap.expectInlineError(page, ap.DOC.emptyName);
      await ap.expectDraftTagCount(page, card(), 0);
    });

    await test.step('2. 纯空白 → trim 后为空，同样拦截', async () => {
      await ap.tryAddHeader(page, card(), '   ');
      await ap.expectInlineError(page, ap.DOC.emptyName);
      await ap.expectDraftTagCount(page, card(), 0);
    });

    await test.step('3. 129 字节 → 长度超限拦截；128 字节可添加', async () => {
      await ap.tryAddHeader(page, card(), 'a'.repeat(129));
      await ap.expectInlineError(page, ap.DOC.nameTooLong(128));
      await ap.expectDraftTagCount(page, card(), 0);

      await ap.addHeader(page, card(), 'a'.repeat(128));
      await ap.expectDraftTagCount(page, card(), 1);
      await ap.removeHeader(page, card(), 'a'.repeat(128));
    });

    await test.step('4. 含空格 / 冒号 / @ → 非法字符拦截', async () => {
      const illegalNames = ['x id', 'x:id', 'x@id'];
      for (const name of illegalNames) {
        await ap.tryAddHeader(page, card(), name);
        await ap.expectInlineError(page, ap.DOC.nameIllegalChars);
      }
      await ap.expectDraftTagCount(page, card(), 0);
    });

    await test.step('5. 合法名称可添加', async () => {
      await ap.addHeader(page, card(), 'x-request-id');
      await ap.expectDraftTagCount(page, card(), 1);
      await ap.expectNoInlineError(page);
    });
  });
});

test.describe('访问日志 - ACL-11 大小写不敏感判重', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await api.restoreAccessLogConfigViaApi(page, {
      req_headers: ['X-Id'],
      res_headers: [],
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ap.expectAccessLogPageReady(page);
    await ap.enterEdit(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('同一 Header 的小写与大写变体均被判重拦截', async ({ page }) => {
    const card = () => ap.requestCard(page);

    await test.step('1. 小写 x-id 被判重', async () => {
      await ap.tryAddHeader(page, card(), 'x-id');
      await ap.expectInlineError(page, ap.DOC.duplicateHeader('x-id'));
      await ap.expectDraftTagCount(page, card(), 1);
    });

    await test.step('2. 大写 X-ID 同样被判重', async () => {
      await ap.tryAddHeader(page, card(), 'X-ID');
      await ap.expectInlineError(page, ap.DOC.duplicateHeader('X-ID'));
      await ap.expectDraftTagCount(page, card(), 1);
      await expect(ap.tagContainer(page, card())).toContainText('X-Id');
    });
  });
});

test.describe('访问日志 - ACL-13 后端 422 兜底与零变更', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('绕过前端直接 PUT 非法配置：422 且 GET 回读零变更', async ({ page }) => {
    const baseline = {
      req_headers: ['X-Request-Id'],
      res_headers: ['X-Trace-Id'],
    };
    await api.restoreAccessLogConfigViaApi(page, baseline);

    const illegalCases = [
      {
        label: '敏感头 Authorization',
        config: { req_headers: ['Authorization'], res_headers: [] },
      },
      {
        label: '归一去重（x-id 与 X-ID）',
        config: { req_headers: ['x-id', 'X-ID'], res_headers: [] },
      },
      {
        label: '超 128 字节名称',
        config: { req_headers: ['a'.repeat(129)], res_headers: [] },
      },
      {
        label: '非法字符（含空格）',
        config: { req_headers: ['x request id'], res_headers: [] },
      },
    ];

    for (let i = 0; i < illegalCases.length; i++) {
      const item = illegalCases[i];
      await test.step(`${i + 1}. ${item.label} → HTTP 422`, async () => {
        const result = await api.updateAccessLogConfigViaApi(page, item.config);
        expect(result.status, `${item.label} 应返回 422`).toBe(422);
      });

      await test.step(`${i + 1}. ${item.label} 失败后 GET 回读零变更`, async () => {
        const current = await api.fetchAccessLogHeadersViaApi(page);
        expect(current.req_headers).toEqual(baseline.req_headers);
        expect(current.res_headers).toEqual(baseline.res_headers);
      });
    }
  });
});