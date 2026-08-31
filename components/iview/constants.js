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
exports.IVU_MODAL_VISIBLE = exports.IVU_DRAWER_VISIBLE = void 0;
/** AI 网关 iView 抽屉/弹窗可见态选择器（与 UI 源码一致，禁止各组件各自维护） */
exports.IVU_DRAWER_VISIBLE = '.ivu-drawer-wrap:not(.ivu-drawer-hidden)';
exports.IVU_MODAL_VISIBLE = '.ivu-modal-wrap:not(.hidden):not(.ivu-modal-hidden)';
