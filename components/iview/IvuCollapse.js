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
exports.IvuCollapseComponent = void 0;
/**
 * iView Collapse 折叠面板
 * UI: Collapse + Panel
 */
class IvuCollapseComponent {
    constructor(scope) {
        this.scope = scope;
    }
    panel(title) {
        return this.scope.locator('.ivu-collapse-item').filter({ hasText: title });
    }
    async expand(title) {
        const panel = this.panel(title);
        const header = panel.locator('.ivu-collapse-header');
        if (!(await panel.locator('.ivu-collapse-content').isVisible())) {
            await header.click();
        }
    }
}
exports.IvuCollapseComponent = IvuCollapseComponent;
