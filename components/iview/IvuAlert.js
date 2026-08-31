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
exports.IvuAlertComponent = void 0;
const test_1 = require("@playwright/test");
/**
 * iView Alert（ModBase 稳定性提示、表单校验提示等）
 * UI: .ivu-alert / ModBase .alert
 */
class IvuAlertComponent {
    constructor(page) {
        this.page = page;
    }
    alert(scope) {
        const root = scope ?? this.page;
        return root.locator('.ivu-alert, .alert');
    }
    byText(text, scope) {
        return this.alert(scope).filter({ hasText: text });
    }
    async expectVisible(text, scope) {
        await (0, test_1.expect)(this.byText(text, scope)).toBeVisible();
    }
    async expectType(type, scope) {
        await (0, test_1.expect)(this.alert(scope)).toHaveClass(new RegExp(`ivu-alert-${type}|alert-${type}`));
    }
}
exports.IvuAlertComponent = IvuAlertComponent;
