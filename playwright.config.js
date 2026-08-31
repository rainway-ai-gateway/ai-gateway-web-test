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
/*
 * @Description: playwright 配置文件
 */
const moment = require('moment');
const path = require('path');
const os = require('os');

const testReportDir = moment().format('YYYYMMDDHHmmssSSS');
const defaultWorkers = Math.min(3, Math.max(2, os.cpus().length - 2));

const config = {
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-reports/' + testReportDir, open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  timeout: 2 * 60 * 1000, // 单个 test 超时 2 分钟
  globalTimeout: 60 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: true,
  use: {
    headless: true,
    browserName: 'chromium',
    channel: 'chrome',
    locale: 'zh-CH',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    storageState: path.join(__dirname, 'auth.json'),
    screenshot: 'only-on-failure',
    devtools: false,
    actionTimeout: 10 * 1000,
    navigationTimeout: 20 * 1000,
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-crash-reporter',
        '--disable-component-update',
        '--no-first-run',
      ],
    },
  },
  scope: 'worker',
  workers: process.env.PW_WORKERS
    ? Number(process.env.PW_WORKERS)
    : defaultWorkers,
  retries: process.env.CI ? 1 : 0,
};

module.exports = config;
