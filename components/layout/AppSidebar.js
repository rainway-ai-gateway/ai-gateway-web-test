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
exports.AppSidebarComponent = void 0;
class AppSidebarComponent {
    constructor(page) {
        this.page = page;
    }
    root() {
        return this.page.locator('.bfe-sidebar');
    }
    menu() {
        return this.root().locator('.Menu');
    }
    menuItem(text) {
        return this.menu().locator('.ivu-menu-item', { hasText: text });
    }
    submenuTitle(text) {
        return this.menu().locator('.ivu-menu-submenu-title', { hasText: text });
    }
    async navigate(text) {
        const menuItem = this.menuItem(text);
        const submenuTitle = this.submenuTitle(text);
        if ((await menuItem.count()) > 0) {
            await menuItem.click();
        }
        else if ((await submenuTitle.count()) > 0) {
            await submenuTitle.click();
        }
        else {
            await this.page.getByRole('listitem', { name: text }).click();
        }
        await this.page.waitForTimeout(1500);
    }
}
exports.AppSidebarComponent = AppSidebarComponent;
