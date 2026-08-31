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
exports.IvuModalComponent = void 0;
const test_1 = require("@playwright/test");
const constants_1 = require("./constants");
/**
 * iView Modal / $Modal.confirm（删除确认、提交确认等）
 */
class IvuModalComponent {
    constructor(page) {
        this.page = page;
    }
    visible() {
        return this.page.locator(constants_1.IVU_MODAL_VISIBLE).last();
    }
    withTitle(title) {
        return this.page
            .locator(constants_1.IVU_MODAL_VISIBLE)
            .filter({ hasText: title })
            .last();
    }
    async expectText(text) {
        await (0, test_1.expect)(this.visible().getByText(text)).toBeVisible();
    }
    async expectOpen(title) {
        await (0, test_1.expect)(this.withTitle(title)).toBeVisible();
    }
    async expectHidden(title) {
        await (0, test_1.expect)(this.withTitle(title)).toBeHidden({ timeout: 10000 });
    }
    async confirm(buttonName = '确定') {
        const modal = this.visible();
        const candidates =
            buttonName === '确定'
                ? ['确定', '确认']
                : [buttonName, '确定', '确认'];
        for (const name of candidates) {
            const btn = modal.getByRole('button', { name });
            if (await btn.isVisible().catch(() => false)) {
                await btn.click();
                return;
            }
        }
        throw new Error(`Modal 未找到确认按钮（尝试过: ${candidates.join(', ')}）`);
    }
    async cancel(buttonName = '取消') {
        await this.visible().getByRole('button', { name: buttonName }).click();
    }
    async clickFooterButton(title, buttonName) {
        await this.withTitle(title).getByRole('button', { name: buttonName }).click();
    }
}
exports.IvuModalComponent = IvuModalComponent;
