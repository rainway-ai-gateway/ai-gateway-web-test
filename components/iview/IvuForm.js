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
exports.IvuFormComponent = void 0;
const test_1 = require('@playwright/test');
/**
 * iView Form / FormItem 通用封装
 * UI: Form + FormItem + Input（label-position="top" 或带 label 属性）
 */
class IvuFormComponent {
  constructor(scope) {
    this.scope = scope;
  }
  item(label) {
    return this.scope.locator('.ivu-form-item').filter({ hasText: label });
  }
  input(label) {
    return this.item(label).locator('input:not([type="hidden"])').first();
  }
  textarea(label) {
    return this.item(label).locator('textarea').first();
  }
  errorTip(label) {
    return this.item(label).locator('.ivu-form-item-error-tip');
  }
  async fillInput(label, value) {
    const field = this.input(label);
    await field.click({ clickCount: 3 });
    await field.fill(value);
    await field.blur();
  }
  async fillTextarea(label, value) {
    await this.textarea(label).fill(value);
  }
  /** 填写后 blur，触发 iView change/blur 校验 */
  async fillAndValidate(label, value) {
    const field = this.input(label);
    await field.fill(value);
    await field.blur();
  }
  /**
   * 通过键盘逐字输入，避免 fill() 对 number input 的 JS 精度转换。
   * 适用于大整数（如 int64 边界值）和小数校验场景。
   */
  async typeAndValidate(label, value) {
    const field = this.input(label);
    await field.click({ clickCount: 3 });
    await field.pressSequentially(String(value), { delay: 20 });
    await field.blur();
  }
  async expectFieldError(label, message) {
    const tip = this.errorTip(label);
    await (0, test_1.expect)(tip).toBeVisible();
    if (message !== undefined) {
      await (0, test_1.expect)(tip).toHaveText(message);
    }
  }
  async expectFieldValid(label) {
    await (0, test_1.expect)(this.errorTip(label)).toBeHidden();
  }
  /** 无 label 的 FormItem，按 placeholder 定位 */
  byPlaceholder(placeholder) {
    return this.scope.getByPlaceholder(placeholder);
  }
}
exports.IvuFormComponent = IvuFormComponent;
