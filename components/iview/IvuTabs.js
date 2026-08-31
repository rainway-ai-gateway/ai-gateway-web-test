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
exports.IvuTabsComponent = void 0;
const test_1 = require("@playwright/test");
/**
 * iView Tabs（用户管理、Entity 等模块 Tab 切换）
 */
class IvuTabsComponent {
    constructor(page, scope) {
        this.page = page;
        this.scope = scope ?? page;
    }
    nav() {
        return this.scope.locator('.ivu-tabs-nav');
    }
    tab(index) {
        return this.nav().locator('.ivu-tabs-tab').nth(index);
    }
    tabByText(text) {
        return this.nav().getByText(text, { exact: true });
    }
    async expectTabsVisible(...labels) {
        for (const label of labels) {
            await (0, test_1.expect)(this.tabByText(label)).toBeVisible();
        }
    }
    async clickTabByText(text) {
        await this.tabByText(text).click();
    }
    /**
     * 点击 Tab 并以目标面板内按钮可见性确认切换成功。
     */
    async switchTo(tabIndex, expectedPanelButtonName) {
        const expectedButton = this.scope.getByRole('button', {
            name: expectedPanelButtonName,
        });
        if (await expectedButton.isVisible()) {
            return;
        }
        await this.tab(tabIndex).click();
        await (0, test_1.expect)(expectedButton).toBeVisible({ timeout: 10000 });
    }
}
exports.IvuTabsComponent = IvuTabsComponent;
