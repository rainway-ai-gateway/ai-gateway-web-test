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
 * 访问日志 - 配置读写（阶段 1 标杆：ACL-07 / ACL-12，均为 P0）
 *
 * 设计依据：docs/access-log/02-功能测试用例/02a-配置展示与编辑.md
 * 接口依据：design-docs/api-define/OpenAPI接口定义/access-log.md
 *
 * 全局单例配置：beforeEach 记录原配置并置空，afterEach 还原，避免影响其它用例。
 * 运行：npx playwright test tests/access-log/test_01_access_log_config.spec.js
 */
const { test, expect } = require('@playwright/test');
const ap = require('../../pages/access-log/AccessLogPage');
const api = require('../../api/access-log-api-utils');

test.describe('访问日志 - ACL-07 保存成功回到展示态并归一展示', () => {
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
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('小写输入保存后：回到展示态、展示归一名称、刷新后持久', async ({
    page,
  }) => {
    await test.step('1. 展示态：Alert 标题与两段空态', async () => {
      await ap.expectAlertText(page, ap.DOC.alertTitle);
      await ap.expectViewEmpty(page, ap.requestCard(page), ap.DOC.reqEmpty);
      await ap.expectViewEmpty(page, ap.responseCard(page), ap.DOC.resEmpty);
      await expect(ap.saveButton(page)).toHaveCount(0);
    });

    await test.step('2. 进入编辑态并添加小写名称', async () => {
      await ap.enterEdit(page);
      await ap.addHeader(page, ap.requestCard(page), 'x-request-id');
      await ap.addHeader(page, ap.responseCard(page), 'x-trace-id');
      await ap.expectNoInlineError(page);
    });

    await test.step('3. 保存：PUT 请求体为两段数组，随后回到展示态并提示成功', async () => {
      const response = await ap.saveAndWait(page);
      expect(response.status()).toBe(200);
      const body = response.request().postDataJSON();
      expect(body.req_headers).toEqual(['x-request-id']);
      expect(body.res_headers).toEqual(['x-trace-id']);
      await ap.expectBackToViewWithToast(page);
    });

    await test.step('4. 展示态展示服务端归一后的名称', async () => {
      await ap.expectViewTags(page, ap.requestCard(page), ['X-Request-Id']);
      await ap.expectViewTags(page, ap.responseCard(page), ['X-Trace-Id']);
    });

    await test.step('5. 刷新后仍为归一名称（已持久化）', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ap.expectAccessLogPageReady(page);
      await ap.expectViewTags(page, ap.requestCard(page), ['X-Request-Id']);
      await ap.expectViewTags(page, ap.responseCard(page), ['X-Trace-Id']);
    });

    await test.step('6. GET 读回与展示一致', async () => {
      const current = await api.fetchAccessLogHeadersViaApi(page);
      expect(current.req_headers).toEqual(['X-Request-Id']);
      expect(current.res_headers).toEqual(['X-Trace-Id']);
    });
  });
});

test.describe('访问日志 - ACL-12 敏感头拒绝', () => {
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

  test('Authorization / 大小写变体 / 响应头 Proxy-Authorization 均被拦截且不落库', async ({
    page,
  }) => {
    const cases = [
      { card: () => ap.requestCard(page), name: 'Authorization' },
      { card: () => ap.requestCard(page), name: 'authorization' },
      { card: () => ap.responseCard(page), name: 'Proxy-Authorization' },
    ];

    for (let i = 0; i < cases.length; i++) {
      const item = cases[i];
      await test.step(`${i + 1}. 添加 ${item.name} → 行内提示拒绝，未入列`, async () => {
        await ap.tryAddHeader(page, item.card(), item.name);
        await ap.expectInlineError(page, ap.DOC.sensitiveHeader(item.name));
        await expect(ap.tagContainer(page, item.card())).not.toContainText(
          item.name,
        );
      });
    }

    await test.step('4. 保存空配置后 GET 读回：不含任何敏感头', async () => {
      await ap.saveAndWait(page);
      await ap.expectBackToViewWithToast(page);
      const current = await api.fetchAccessLogHeadersViaApi(page);
      expect(current.req_headers).toEqual([]);
      expect(current.res_headers).toEqual([]);
    });
  });
});
