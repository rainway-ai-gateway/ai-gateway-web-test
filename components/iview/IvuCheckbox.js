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
exports.IvuCheckboxComponent = void 0;
/**
 * iView Checkbox
 * UI: Checkbox 或 CheckboxGroup
 */
class IvuCheckboxComponent {
    constructor(scope) {
        this.scope = scope;
    }
    byLabel(text) {
        return this.scope.locator('.ivu-checkbox-wrapper').filter({ hasText: text });
    }
    async check(text) {
        const box = this.byLabel(text);
        const input = box.locator('input[type="checkbox"]');
        if (!(await input.isChecked())) {
            await box.click();
        }
    }
    async uncheck(text) {
        const box = this.byLabel(text);
        const input = box.locator('input[type="checkbox"]');
        if (await input.isChecked()) {
            await box.click();
        }
    }
}
exports.IvuCheckboxComponent = IvuCheckboxComponent;
