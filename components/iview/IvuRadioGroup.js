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
exports.IvuRadioGroupComponent = void 0;
/**
 * iView RadioGroup / Radio
 * UI: RadioGroup + Radio label="true|false|..."
 */
class IvuRadioGroupComponent {
    constructor(scope) {
        this.scope = scope;
    }
    group(label) {
        if (label) {
            return this.scope.locator('.ivu-form-item').filter({ hasText: label }).locator('.ivu-radio-group');
        }
        return this.scope.locator('.ivu-radio-group').first();
    }
    /** 点击 Radio 文案，如「启用」「不启用」 */
    option(groupLabel, optionText) {
        const root = groupLabel ? this.group(groupLabel) : this.group();
        return root.locator('.ivu-radio-wrapper').filter({ hasText: optionText });
    }
    async select(groupLabel, optionText) {
        await this.option(groupLabel, optionText).click();
    }
}
exports.IvuRadioGroupComponent = IvuRadioGroupComponent;
