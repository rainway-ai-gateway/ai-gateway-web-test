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
Object.defineProperty(exports, '__esModule', { value: true });
exports.IvuMessageComponent = void 0;
const test_1 = require('@playwright/test');
/**
 * iView 全局提示（Message / Notice）
 */
class IvuMessageComponent {
  constructor(page) {
    this.page = page;
  }
  async expectText(text, timeout = 15000) {
    await (0, test_1.expect)(this.page.getByText(text).first()).toBeVisible({
      timeout,
    });
  }
  async waitForTextDuringAction(text, action, timeout = 5000) {
    await Promise.all([
      (0, test_1.expect)(this.page.getByText(text).first()).toBeVisible({
        timeout,
      }),
      action(),
    ]);
  }
  errorNotice() {
    // 含 .ivu-notice：自定义 render 的错误文案不在 .ivu-notice-desc
    return this.page.locator(
      '.ivu-notice, .ivu-notice-desc, .ivu-message-error, .ivu-message-notice',
    );
  }
}
exports.IvuMessageComponent = IvuMessageComponent;
