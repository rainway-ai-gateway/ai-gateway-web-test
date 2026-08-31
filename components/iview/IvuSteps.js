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
exports.IvuStepsComponent = void 0;
const test_1 = require("@playwright/test");
/**
 * iView Steps 向导（VirtualServers 等多步表单）
 * UI: .ivu-steps + .ivu-steps-item
 */
class IvuStepsComponent {
    constructor(page, scope) {
        this.page = page;
        this.scope = scope;
    }
    root() {
        return (this.scope ?? this.page).locator('.ivu-steps');
    }
    item(title) {
        return this.root().locator('.ivu-steps-item').filter({ hasText: title });
    }
    async expectCurrent(title) {
        await (0, test_1.expect)(this.item(title)).toHaveClass(/ivu-steps-status-process/);
    }
    async expectFinished(title) {
        await (0, test_1.expect)(this.item(title)).toHaveClass(/ivu-steps-status-finish/);
    }
}
exports.IvuStepsComponent = IvuStepsComponent;
