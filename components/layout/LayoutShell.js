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
exports.LayoutShellComponent = void 0;
const AppBreadcrumb_1 = require("./AppBreadcrumb");
const AppLayout_1 = require("./AppLayout");
const AppSidebar_1 = require("./AppSidebar");
/**
 * Layout 壳层统一入口（登录后各业务页共用）
 */
class LayoutShellComponent {
    constructor(page) {
        this.page = page;
        this.layout = new AppLayout_1.AppLayoutComponent(page);
        this.breadcrumb = new AppBreadcrumb_1.AppBreadcrumbComponent(page);
        this.sidebar = new AppSidebar_1.AppSidebarComponent(page);
    }
    async expectLoaded() {
        await this.layout.expectAuthenticatedShell();
    }
}
exports.LayoutShellComponent = LayoutShellComponent;
