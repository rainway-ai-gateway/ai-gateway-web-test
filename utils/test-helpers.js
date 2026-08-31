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
const common = require('./common');
const utils = require('../pages/user/UserPage');
const fs = require('fs');
const path = require('path');

function loadConf() {
  try {
    const confPath = path.join(__dirname, '../conf.json');
    return JSON.parse(fs.readFileSync(confPath, 'utf-8'));
  } catch (e) {
    common.log('读取配置文件失败: ' + e.message);
    return {};
  }
}

async function enterUserManagement(page, confInfo) {
  await page.goto(confInfo['ctlHost']);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  common.log('当前URL: ' + page.url());
  await utils.handleUrlInvalidAlert(page);
  await utils.navigateToUserManagement(page);
}

async function enterTokenManagement(page, confInfo) {
  await enterUserManagement(page, confInfo);
  await utils.switchToTokenTab(page);
}

module.exports = {
  loadConf,
  enterUserManagement,
  enterTokenManagement,
};
