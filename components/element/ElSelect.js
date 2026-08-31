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
exports.ElSelectComponent = void 0;
const test_1 = require("@playwright/test");
const constants_1 = require("./constants");
/**
 * Element UI Select（el-select + el-option）
 * 下拉层 teleported 到 body，选项通过 page 级 locator 定位。
 */
class ElSelectComponent {
    constructor(page, trigger) {
        this.page = page;
        this.trigger = trigger;
    }
    /** 在 scope 内按 FormItem 标签定位 el-select 触发器 */
    static fromFormItem(page, scope, label) {
        const trigger = scope
            .locator('.ivu-form-item, .el-form-item')
            .filter({ hasText: label })
            .locator('.el-select')
            .first();
        return new ElSelectComponent(page, trigger);
    }
    rootLocator() {
        return this.trigger;
    }
    dropdownItems() {
        return this.page.locator(constants_1.EL_SELECT_DROPDOWN_VISIBLE);
    }
    async open() {
        await (0, test_1.expect)(this.trigger).toBeVisible({ timeout: 15000 });
        await this.trigger.click();
        await (0, test_1.expect)(this.dropdownItems().first()).toBeVisible({ timeout: 10000 });
    }
    async selectOption(optionText) {
        await this.open();
        await this.dropdownItems().filter({ hasText: optionText }).first().click();
    }
    async selectOptionExact(optionText) {
        await this.open();
        await this.dropdownItems().getByText(optionText, { exact: true }).click();
    }
    /** filterable / remote el-select：打开后在内部 input 输入关键字再选 */
    async selectOptionFilterable(optionText, keyword) {
        await (0, test_1.expect)(this.trigger).toBeVisible({ timeout: 15000 });
        await this.trigger.click();
        const filterInput = this.trigger.locator('input').first();
        if ((await filterInput.count()) > 0) {
            await filterInput.fill(keyword ?? optionText);
            await this.page.waitForTimeout(300);
        }
        await this.dropdownItems().filter({ hasText: optionText }).first().click();
    }
    async expectSelectedContains(text) {
        const selected = this.trigger.locator('.el-select__tags-text, .el-input__inner').first();
        await (0, test_1.expect)(selected).toContainText(text);
    }
}
exports.ElSelectComponent = ElSelectComponent;
