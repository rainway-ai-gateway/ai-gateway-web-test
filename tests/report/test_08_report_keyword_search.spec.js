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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 数据报表 - 明细关键字搜索（RP-L-20）
 *
 * 审计背景（2026-11-01，report 模块深度审计）：
 * 索引声明 RP-L-20「关键字搜索」（P1），`Logs.vue` 也确实实现了 `keyword` 参数与
 * `String(keyword || '').length > 128` 的前置判长，但**全模块无用例**（RP-L-18/19 与
 * RP-L-03/04 同义，RP-L-20 是真空白）。
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/report/ReportPage');

const DOC = utils.DOC;

test.describe('数据报表 - RP-L-20 明细关键字搜索', () => {
  test('合法关键字携带 keyword、清空不带、超 128 字符被拦截且不发请求', async ({
    page,
  }) => {
    await utils.gotoReportPage(page);
    await utils.switchToTab(page, DOC.logsTab);

    await test.step('前置：确认工具栏关键字输入框占位文案', async () => {
      await expect(utils.keywordInput(page)).toBeVisible({ timeout: 15000 });
      await expect(utils.keywordInput(page)).toHaveAttribute(
        'placeholder',
        DOC.keywordPlaceholder,
      );
    });

    await test.step('合法关键字：请求携带 keyword 且页码复位', async () => {
      const response = await utils.searchByKeyword(page, 'probe-kw');
      expect(response, '应发起 report/logs 请求').toBeTruthy();
      const url = new URL(response.url());
      expect(url.searchParams.get('keyword')).toBe('probe-kw');
      expect(url.searchParams.get('page')).toBe('1');
    });

    await test.step('超 128 字符：提示「关键词长度不能超过 128 字符」且不发请求', async () => {
      const requests = [];
      const handler = (req) => {
        if (req.url().includes('/report/logs')) requests.push(req.url());
      };
      page.on('request', handler);
      try {
        await utils.keywordInput(page).fill('a'.repeat(129));
        await utils.triggerLogsSearch(page);
        await utils.expectMessageError(page, '关键词长度不能超过 128 字符');
        await page.waitForTimeout(800);
        expect(
          requests.filter((u) => u.includes('keyword=')),
          '超长关键字不应发出带 keyword 的请求',
        ).toEqual([]);
      } finally {
        page.off('request', handler);
      }
    });

    await test.step('清空关键字：请求不携带 keyword', async () => {
      const response = await utils.searchByKeyword(page, '');
      expect(response).toBeTruthy();
      const url = new URL(response.url());
      expect(url.searchParams.get('keyword')).toBeNull();
    });
  });
});
