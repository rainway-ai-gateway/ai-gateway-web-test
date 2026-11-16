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
 * 访问日志 - 编辑态生命周期（ACL-04 / ACL-05 / ACL-06 / ACL-08 / ACL-09）
 *
 * 设计依据：docs/access-log/02-功能测试用例/02a-配置展示与编辑.md
 * 运行：npx playwright test tests/access-log/test_03_access_log_edit_lifecycle.spec.js
 */
const { test, expect } = require('@playwright/test');
const ap = require('../../pages/access-log/AccessLogPage');
const api = require('../../api/access-log-api-utils');

async function seedConfig(page, config) {
  await api.restoreAccessLogConfigViaApi(page, config);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ap.expectAccessLogPageReady(page);
}

test.describe('访问日志 - ACL-04 进入与退出编辑态', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await seedConfig(page, {
      req_headers: ['X-Request-Id'],
      res_headers: ['X-Trace-Id'],
    });
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('点编辑进入表单、点取消回到展示态且未发请求', async ({ page }) => {
    await test.step('1. 进入编辑态：按钮切换与控件齐备', async () => {
      await ap.enterEdit(page);
      await ap.expectEditControls(page, ap.requestCard(page));
      await expect(ap.editButton(page)).toHaveCount(0);
    });

    await test.step('2. 取消回到展示态，展示原配置', async () => {
      let putSeen = false;
      const onRequest = (req) => {
        if (/\/access-log\/config$/.test(req.url()) && req.method() === 'PUT') {
          putSeen = true;
        }
      };
      page.on('request', onRequest);
      await ap.cancelEdit(page);
      page.off('request', onRequest);
      expect(putSeen, '取消不应发出 PUT 请求').toBe(false);
      await ap.expectViewTags(page, ap.requestCard(page), ['X-Request-Id']);
      await ap.expectViewTags(page, ap.responseCard(page), ['X-Trace-Id']);
    });
  });
});

test.describe('访问日志 - ACL-05 添加 Header tag', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await seedConfig(page, { req_headers: [], res_headers: [] });
    await ap.enterEdit(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('按钮与回车两种方式添加，输入框清空且保留输入原样', async ({ page }) => {
    await test.step('1. 请求头点「添加」', async () => {
      await ap.addHeader(page, ap.requestCard(page), 'x-request-id');
      await ap.expectDraftTagCount(page, ap.requestCard(page), 1);
      await ap.expectHeaderInputCleared(page, ap.requestCard(page));
    });

    await test.step('2. 响应头按回车添加', async () => {
      const input = ap.headerInput(page, ap.responseCard(page));
      await input.fill('x-trace-id');
      await input.press('Enter');
      await expect(
        ap.tagContainer(page, ap.responseCard(page)),
      ).toContainText('x-trace-id', { timeout: 5000 });
      await ap.expectHeaderInputCleared(page, ap.responseCard(page));
    });

    await test.step('3. 编辑态展示用户输入原样（保存后才归一）', async () => {
      await expect(ap.tagContainer(page, ap.requestCard(page))).toContainText(
        'x-request-id',
      );
      await expect(ap.tagContainer(page, ap.requestCard(page))).not.toContainText(
        'X-Request-Id',
      );
    });
  });
});

test.describe('访问日志 - ACL-06 删除 Header tag 并保存', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await seedConfig(page, {
      req_headers: ['X-Request-Id', 'X-Tenant-Id'],
      res_headers: [],
    });
    await ap.enterEdit(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('关闭单条 tag 后保存：展示与 GET 读回均不含被删项', async ({ page }) => {
    await test.step('1. 关闭 X-Tenant-Id', async () => {
      await ap.removeHeader(page, ap.requestCard(page), 'X-Tenant-Id');
      await ap.expectDraftTagCount(page, ap.requestCard(page), 1);
    });

    await test.step('2. 保存后展示态仅剩 X-Request-Id', async () => {
      const response = await ap.saveAndWait(page);
      expect(response.status()).toBe(200);
      expect(response.request().postDataJSON().req_headers).toEqual([
        'X-Request-Id',
      ]);
      await ap.expectBackToViewWithToast(page);
      await ap.expectViewTags(page, ap.requestCard(page), ['X-Request-Id']);
    });

    await test.step('3. GET 读回体现全量替换语义', async () => {
      const current = await api.fetchAccessLogHeadersViaApi(page);
      expect(current.req_headers).toEqual(['X-Request-Id']);
    });
  });
});

test.describe('访问日志 - ACL-08 取消编辑不落库', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await seedConfig(page, {
      req_headers: ['X-Request-Id'],
      res_headers: [],
    });
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('编辑后取消：刷新与 GET 读回均无新增项', async ({ page }) => {
    await ap.enterEdit(page);
    await ap.addHeader(page, ap.requestCard(page), 'x-extra-header');
    await ap.cancelEdit(page);

    await test.step('1. 展示态仍为原配置', async () => {
      await ap.expectViewTags(page, ap.requestCard(page), ['X-Request-Id']);
    });

    await test.step('2. 刷新后仍无草稿项', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ap.expectAccessLogPageReady(page);
      await ap.expectViewTags(page, ap.requestCard(page), ['X-Request-Id']);
    });

    await test.step('3. GET 读回未变', async () => {
      const current = await api.fetchAccessLogHeadersViaApi(page);
      expect(current.req_headers).toEqual(['X-Request-Id']);
      expect(current.res_headers).toEqual([]);
    });
  });
});

test.describe('访问日志 - ACL-09 清空两段后保存为不采集', () => {
  let original;

  test.beforeEach(async ({ page }) => {
    await ap.gotoAccessLogPage(page);
    original = await api.fetchAccessLogHeadersViaApi(page);
    await seedConfig(page, {
      req_headers: ['X-Request-Id'],
      res_headers: ['X-Trace-Id'],
    });
    await ap.enterEdit(page);
  });

  test.afterEach(async ({ page }) => {
    await api.restoreAccessLogConfigViaApi(page, original);
  });

  test('删除全部 tag 后保存：两段为空数组，展示空态', async ({ page }) => {
    await ap.removeHeader(page, ap.requestCard(page), 'X-Request-Id');
    await ap.removeHeader(page, ap.responseCard(page), 'X-Trace-Id');
    await ap.expectDraftTagCount(page, ap.requestCard(page), 0);
    await ap.expectDraftTagCount(page, ap.responseCard(page), 0);

    const response = await ap.saveAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.req_headers).toEqual([]);
    expect(body.res_headers).toEqual([]);
    await ap.expectBackToViewWithToast(page);
    await ap.expectViewEmpty(page, ap.requestCard(page), ap.DOC.reqEmpty);
    await ap.expectViewEmpty(page, ap.responseCard(page), ap.DOC.resEmpty);

    const current = await api.fetchAccessLogHeadersViaApi(page);
    expect(current.req_headers).toEqual([]);
    expect(current.res_headers).toEqual([]);
  });
});