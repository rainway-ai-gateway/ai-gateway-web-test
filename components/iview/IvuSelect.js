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
        const dropdownItems = exactDropdownItem(this.page, optionText);

        // 触发器的点击是「展开/收起」切换，**不能假设点击前下拉是收起的**：
        // 旧实现在点完 trigger 后只等 200ms，再用「是否存在可见下拉」决定要不要补点。
        // 但 iView 下拉的开合动画是 0.3s（.ivu-transition-drop-leave-active/enter-active
        // animation-duration:.3s），200ms 时下拉仍在收合动画中 → 依旧「可见」→ 判定为
        // 「已展开」而跳过补点 → 随后点选项时元素先 not stable 再 not visible，10s 超时。
        // 实测复现：tests/user/test_10_role_readonly.spec.js UM-46（2026-10-16，下拉已在
        // 上一步展开，此处点击把它收起后卡死）。
        // 现改为「以选项是否真的可见为准」的收敛循环：不可见就点一次，**每次都等动画落定
        // （450ms > 0.3s）再看**——这样「已展开 / 已收起 / 正在收起（点击前 <0.3s 才收起）」
        // 三种初始状态都能收敛，且不会在收合动画中途误判为「已展开」。
        for (let attempt = 0; attempt < 4; attempt += 1) {
            if ((await dropdownItems.count()) === 0) {
                await this.trigger.click();
            }
            await this.page.waitForTimeout(450);
            if ((await dropdownItems.count()) > 0) {
                break;
            }
        }

        await (0, test_1.expect)(dropdownItems.first()).toBeVisible({
            timeout: 10000,
        });
        await dropdownItems.first().click();
    }
}
exports.IvuSelectComponent = IvuSelectComponent;
