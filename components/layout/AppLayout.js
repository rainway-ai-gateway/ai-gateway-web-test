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
exports.AppLayoutComponent = void 0;
const test_1 = require("@playwright/test");
/**
 * 应用主布局壳层
 */
class AppLayoutComponent {
    constructor(page) {
        this.page = page;
    }
    root() {
        return this.page.locator('.app-layout');
    }
    contentView() {
        return this.page.locator('.bfe-content-view, .routerView').first();
    }
    sidebar() {
        return this.page.locator('.bfe-sidebar');
    }
    header() {
        return this.page.locator('.bfe-header');
    }
    breadcrumb() {
        return this.page.locator('.bfe-breadcrumb');
    }
    async expectAuthenticatedShell() {
        await (0, test_1.expect)(this.root()).toBeVisible();
        await (0, test_1.expect)(this.sidebar()).toBeVisible();
        await (0, test_1.expect)(this.header()).toBeVisible();
        await (0, test_1.expect)(this.contentView()).toBeVisible();
    }
}
exports.AppLayoutComponent = AppLayoutComponent;
