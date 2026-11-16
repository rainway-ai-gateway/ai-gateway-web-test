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
 * 用户手册「17 系统安全：访问日志」章节截图脚本
 *
 * 约定对齐 capture-docs-screenshots.js / capture-docs-new-modules.js：
 * auth.json 登录态、lang=zh、1920x1080 视口、输出目录
 * ../../ai-gateway-web/docs/zh-cn/images（运行副本，产出后 copy 回内容仓）。
 *
 * 生成的截图：
 *   17-access-log-view.png    展示态（两段白名单只读标签 + 右上角「编辑」）
 *   17-access-log-edit.png    编辑态（「取消 / 保存」+ 带边框标签容器 + 添加输入）
 *   17-access-log-invalid.png 敏感头拦截（行内红色提示）
 *
 * 前置：运行副本 dev server 已在 8180 运行（`node configs/dev-server.js 8180`），
 *     后端 API 在 8183 运行，环境内 `access_log_conf` 表已建。
 *
 * 运行（node 18）：
 *   cd ai-gateway-web-test
 *   source ~/.nvm/nvm.sh && nvm use 18
 *   TEST_BASE_URL=http://localhost:8180 node scripts/capture-docs-access-log.js
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const umUtils = require('../pages/user/UserPage');
const accessLogApi = require('../api/access-log-api-utils');
const common = require('../utils/common');

const authPath = path.join(__dirname, '../auth.json');
const outputDir = path.join(
  __dirname,
  '../../ai-gateway-web/docs/zh-cn/images',
);
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8180';

const PAGE_PATH = '/access-log';

/** 截图用的演示配置（与手册示例一致；脚本结束后还原） */
const DEMO_CONFIG = {
  req_headers: ['Business_type', 'X-Request-Id'],
  res_headers: ['X-Trace-Id'],
};

const captured = [];

async function digest(locator, maxChars = 500) {
  const text = await locator.innerText().catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

async function screenshot(page, name, scope = null) {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: false });
  captured.push(name);
  const size = page.viewportSize();
  console.log(`Screenshot: ${name} [${size.width}x${size.height}]`);
  if (scope) console.log(`  内容: ${await digest(scope)}`);
}

async function dismissOverlays(page) {
  await umUtils.dismissAuthAlertModal(page).catch(() => {});
  await umUtils.handleUrlInvalidAlert(page).catch(() => {});
  await page.evaluate(() => {
    document
      .querySelectorAll('.ivu-message, .ivu-notice')
      .forEach((el) => el.remove());
  });
  await page.waitForTimeout(300);
}

async function expectPageReady(page) {
  await page.locator('.access-log-page').waitFor({ state: 'visible', timeout: 20000 });
  await page.getByRole('button', { name: '编辑' }).waitFor({
    state: 'visible',
    timeout: 15000,
  });
  await page.waitForTimeout(400);
}

(async () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    storageState: authPath,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('lang', 'zh'));

  let original = null;

  try {
    await page.goto(baseUrl + PAGE_PATH, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await dismissOverlays(page);
    await umUtils.ensureLoggedIn(page).catch(() => {});
    await page.goto(baseUrl + PAGE_PATH, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await dismissOverlays(page);

    // 记录并写入演示配置（截图内容稳定、可复现）
    original = await accessLogApi.fetchAccessLogHeadersViaApi(page);
    common.log('原配置: ' + JSON.stringify(original));
    await accessLogApi.updateAccessLogConfigViaApi(page, DEMO_CONFIG);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectPageReady(page);

    await screenshot(
      page,
      '17-access-log-view.png',
      page.locator('.access-log-page'),
    );

    // 编辑态
    await page.getByRole('button', { name: '编辑' }).click();
    await page.getByRole('button', { name: '保存' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });
    await page.waitForTimeout(400);
    await screenshot(
      page,
      '17-access-log-edit.png',
      page.locator('.access-log-page'),
    );

    // 敏感头拦截提示
    const reqCard = page
      .locator('.access-log-page .ivu-card')
      .filter({ hasText: '请求头白名单' })
      .first();
    const input = reqCard.locator('.al-add-row input').first();
    await input.fill('Authorization');
    await reqCard.getByRole('button', { name: '添加' }).first().click();
    await page
      .locator('.access-log-page .ivu-alert-error')
      .waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
    await screenshot(
      page,
      '17-access-log-invalid.png',
      page.locator('.access-log-page .ivu-alert-error'),
    );

    // 取消编辑，避免留下未提交状态
    await page.getByRole('button', { name: '取消' }).click();
    await page.waitForTimeout(300);
  } catch (e) {
    console.error('截图失败: ' + e.message);
    process.exitCode = 1;
  } finally {
    // 还原原配置
    try {
      if (original) {
        await accessLogApi.updateAccessLogConfigViaApi(page, original);
      }
    } catch (e) {
      console.error('还原配置失败: ' + e.message);
    }
    await browser.close();
    console.log('\n=== 截图汇总 ===');
    console.log('生成成功: ' + (captured.join(', ') || '（无）'));
    console.log('输出目录: ' + outputDir);
  }
})();