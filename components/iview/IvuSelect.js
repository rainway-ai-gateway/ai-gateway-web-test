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
exports.IvuSelectComponent = void 0;
const test_1 = require("@playwright/test");
/**
 * iView Select（ModBase.albClustersGroup、表单内下拉等）
 * UI: ivu-select + ivu-select-dropdown
 */
/**
 * 可见下拉项的「整体文案相等」定位。
 *
 * iView 的 .ivu-select-item 文案带换行与缩进（textContent 形如 "\n   test\n  "），
 * hasText 的正则对 textContent 原样匹配、不做 trim，`^test$` 永远匹配不上；
 * Playwright 的 :text-is() 会归一化空白并整体比较（与 getByText exact 同语义），
 * 且仍把定位结果限定在 .ivu-select-item 上。
 */
function exactDropdownItem(page, optionText) {
    const quoted = String(optionText)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
    return page.locator(
        '.ivu-select-dropdown:visible .ivu-select-item:text-is("' + quoted + '")',
    );
}

class IvuSelectComponent {
    constructor(page, trigger) {
        this.page = page;
        this.trigger = trigger;
    }
    async selectOption(optionText) {
        await (0, test_1.expect)(this.trigger).toBeVisible({ timeout: 15000 });
        await this.trigger.click();
        await this.page
            .locator('.ivu-select-dropdown:visible .ivu-select-item')
            .filter({ hasText: optionText })
            .click();
    }
    async selectOptionExact(optionText) {
        await (0, test_1.expect)(this.trigger).toBeVisible({ timeout: 15000 });
        // 第一次点击打开下拉；如果下拉未出现则重试一次
        await this.trigger.click();
        await this.page.waitForTimeout(200);
        let dropdownItems = exactDropdownItem(this.page, optionText);
        if ((await dropdownItems.count()) === 0) {
            // 下拉已展开时再点一次会把它关掉，只在确实未展开时才补点
            const dropdownVisible = await this.page
                .locator('.ivu-select-dropdown:visible')
                .first()
                .isVisible()
                .catch(() => false);
            if (!dropdownVisible) {
                await this.trigger.click();
                await this.page.waitForTimeout(200);
            }
            dropdownItems = exactDropdownItem(this.page, optionText);
        }
        await dropdownItems.first().click();
    }
}
exports.IvuSelectComponent = IvuSelectComponent;
