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
exports.IvuDrawerComponent = void 0;
const test_1 = require("@playwright/test");
const IvuForm_1 = require("./IvuForm");
const constants_1 = require("./constants");
/**
 * iView Drawer（添加域名、实例池等业务抽屉）
 */
class IvuDrawerComponent {
    constructor(page) {
        this.page = page;
    }
    active() {
        return this.page.locator(constants_1.IVU_DRAWER_VISIBLE).last();
    }
    withTitle(title) {
        return this.page
            .locator(constants_1.IVU_DRAWER_VISIBLE)
            .filter({ hasText: title })
            .first();
    }
    withTitleParts(...parts) {
        let locator = this.page.locator(constants_1.IVU_DRAWER_VISIBLE);
        for (const part of parts) {
            locator = locator.filter({ hasText: part });
        }
        return locator.first();
    }
    form(title) {
        return new IvuForm_1.IvuFormComponent(this.withTitle(title));
    }
    formInActive() {
        return new IvuForm_1.IvuFormComponent(this.active());
    }
    async expectOpen(title) {
        const drawer = this.withTitle(title);
        await (0, test_1.expect)(drawer).toBeVisible();
        return drawer;
    }
    async expectOpenWithParts(...parts) {
        const drawer = this.withTitleParts(...parts);
        await (0, test_1.expect)(drawer).toBeVisible();
        return drawer;
    }
    async clickFooterButton(title, buttonName) {
        await this.withTitle(title)
            .getByRole('button', { name: buttonName })
            .click();
    }
    async clickActiveFooterButton(buttonName) {
        await this.active().getByRole('button', { name: buttonName }).click();
    }
    async close(title, options) {
        const closeLabel = options?.closeLabel ?? '关闭';
        const cancelLabel = options?.cancelLabel ?? '取消';
        const drawer = this.withTitle(title);
        const closeBtn = drawer.getByRole('button', { name: closeLabel });
        if (await closeBtn.isVisible()) {
            await closeBtn.click();
        }
        else {
            await drawer.getByRole('button', { name: cancelLabel }).click();
        }
        await (0, test_1.expect)(drawer).toBeHidden({ timeout: 10000 });
    }
    async closeByX(title) {
        await this.withTitle(title).locator('.ivu-drawer-close').click();
    }
    async closeActiveByX() {
        await this.active().locator('.ivu-drawer-close').click();
    }
    async fillTextareaByLabel(title, label, value) {
        await this.form(title).fillTextarea(label, value);
    }
}
exports.IvuDrawerComponent = IvuDrawerComponent;
