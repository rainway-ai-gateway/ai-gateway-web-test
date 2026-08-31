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
/**
 * EntityPage.js
 *
 * Aggregation entry point for Entity management page utilities.
 * All shared constants and functions live in ./entity-shared.js.
 * This file re-exports everything from the sub-files so that
 * test files can `require('../../pages/entity/EntityPage')` as before.
 */
const entityShared = require('./entity-shared');
const entityApiUtilsDirect = require('../../api/entity-api-utils');

// ── Sub-file imports (loaded AFTER entity-shared, no circular dependency) ──
const entityTypeUtils = require('./EntityTypePage');
const entityOrgUtils = require('./EntityOrgPage');
const entityApiKeyUtils = require('./EntityApiKeyPage');

module.exports = {
  // Re-export everything from entity-shared
  ...entityShared,

  // Re-export all sub-file functions
  ...entityTypeUtils,
  ...entityOrgUtils,
  ...entityApiKeyUtils,

  // Re-export from entity-api-utils (bypass circular dependency)
  createEntityOrgTestCleanup: entityApiUtilsDirect.createEntityOrgTestCleanup,
  createApiKeyTestCleanup: entityApiUtilsDirect.createApiKeyTestCleanup,
  ensureEntityTestData: entityApiUtilsDirect.ensureEntityTestData,
  forceDeleteEntityTypeViaApi: entityApiUtilsDirect.forceDeleteEntityTypeViaApi,

  // Aliases (backward compatibility)
  ensureOnEntityTypeManagementPage: entityShared.gotoEntityTypeManagementPage,
  ensureOnEntityOrgManagementPage: entityOrgUtils.gotoEntityOrgManagementPage,
  ensureOnApiKeyManagementPage: entityApiKeyUtils.gotoApiKeyManagementPage,
};
