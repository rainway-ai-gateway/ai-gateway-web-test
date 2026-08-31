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
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IvuInputNumberComponent = void 0;
/**
 * iView InputNumber
 * - 表单：按 label 定位 `.ivu-form-item`
 * - 表格：按单元格 `.ivu-input-number input`（实例池端口/权重等）
 */
class IvuInputNumberComponent {
    constructor(scope) {
        this.scope = scope;
    }
    field(label) {
        return this.scope
            .locator('.ivu-form-item')
            .filter({ hasText: label })
            .locator('.ivu-input-number input');
    }
    inputInCell(cell) {
        return cell.locator('.ivu-input-number input');
    }
    async fill(label, value) {
        const input = this.field(label);
        await input.click();
        await input.fill(String(value));
    }
    /** v-show 隐藏列（如 admin 下权重）在 DOM 中仍存在，不可见则跳过 */
    async fillInCell(cell, value) {
        const input = this.inputInCell(cell);
        if (!(await input.isVisible().catch(() => false))) {
            return;
        }
        await input.fill('');
        await input.fill(String(value));
    }
}
exports.IvuInputNumberComponent = IvuInputNumberComponent;
