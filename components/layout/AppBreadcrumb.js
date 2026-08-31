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
exports.AppBreadcrumbComponent = void 0;
const test_1 = require("@playwright/test");
/**
 * 面包屑导航
 * UI: src/layout/sidebar/breadCrumb.vue → .bfe-breadcrumb
 */
class AppBreadcrumbComponent {
    constructor(page) {
        this.page = page;
    }
    root() {
        return this.page.locator('.bfe-breadcrumb');
    }
    items() {
        return this.root().locator('.ivu-breadcrumb-item');
    }
    async expectTrail(...labels) {
        for (const label of labels) {
            await (0, test_1.expect)(this.root().getByText(label, { exact: true })).toBeVisible();
        }
    }
    async expectCurrentPage(title) {
        await (0, test_1.expect)(this.items().last()).toContainText(title);
    }
}
exports.AppBreadcrumbComponent = AppBreadcrumbComponent;
