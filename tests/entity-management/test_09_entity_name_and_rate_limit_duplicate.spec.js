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
const { test } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');

const DOC = utils.DOC_ENTITY_ORG;

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

async function prepareEntityCreate(page, cleanup) {
  const entityName = await utils.generateTestEntityName();
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackEntityName(entityName);
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, '名称与限流组合校验', 1);
  // 等待类型创建后页面完全稳定
  await page.waitForTimeout(1000);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 1000);
  await utils.openCreateEntityDrawer(page);
  return { entityName, typeName };
}

entityOrgDescribe('Entity组织管理 - EM-E-43 名称格式校验', (cleanup) => {
  test('验证名称前后空白、超长与控制字符被拦截，合法名称可提交', async ({
    page,
  }) => {
    const { entityName, typeName } = await prepareEntityCreate(page, cleanup);

    await utils.fillEntityFormBasic(page, { name: ' entity1 ', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameLeadingTrailingWhitespaceMsg,
    );

    await utils.fillEntityFormBasic(page, { name: 'a'.repeat(65), typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameLengthErrorMsg,
    );

    await utils.fillEntityFormBasic(page, { name: 'bad\x01name', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameControlCharsErrorMsg,
    );

    await utils.fillEntityFormBasic(page, { name: '@user', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameFormatErrorMsg,
    );

    await utils.fillEntityFormBasic(page, { name: 'user@', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameFormatErrorMsg,
    );

    const atName = await utils.generateTestEntityAtName('user', 'project');
    cleanup.trackEntityName(atName);
    await utils.fillEntityFormBasic(page, { name: atName, typeName });
    await utils.submitEntityFormAndWaitForSuccess(page);
    await utils.ensureEntityRowVisible(page, atName);
    await utils.deleteEntityAndWait(page, atName);

    await utils.openCreateEntityDrawer(page);
    await utils.fillEntityFormBasic(page, { name: entityName, typeName });
    await utils.submitEntityFormAndWaitForSuccess(page);
    await utils.ensureEntityRowVisible(page, entityName);
    await utils.deleteEntityAndWait(page, entityName);
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-44 TPM组合重复校验', (cleanup) => {
  test('验证相同 TPM 组合被拦截', async ({ page }) => {
    const { entityName, typeName } = await prepareEntityCreate(page, cleanup);
    await utils.setupEntityCreateWithRateLimit(page, entityName, typeName);
    await utils.addEntityRateLimitRule(page, 'TPM', {
      name: 'tpm_dup_1',
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.addEntityRateLimitRule(page, 'TPM', {
      name: 'tpm_dup_2',
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.tpmCombinationDuplicateMsg,
    );
    await utils.cancelEntityForm(page);
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-45 TPM规则名称长度校验', (cleanup) => {
  test('验证规则名称超过 128 字符被拦截，短名称合法', async ({ page }) => {
    const { entityName, typeName } = await prepareEntityCreate(page, cleanup);
    await utils.setupEntityCreateWithRateLimit(page, entityName, typeName);
    await utils.addEntityRateLimitRule(page, 'TPM', {
      name: 'a'.repeat(129),
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.ruleNameLengthErrorMsg,
    );

    await utils.cancelEntityForm(page);
    const validEntityName = await utils.generateTestEntityName();
    cleanup.trackEntityName(validEntityName);
    await utils.openCreateEntityDrawer(page);
    await utils.setupEntityCreateWithRateLimit(page, validEntityName, typeName);
    await utils.addEntityRateLimitRule(page, 'TPM', {
      name: 'a',
      window: 1,
      maxTokens: 100,
      step: 1,
    });
    await utils.selectEntityMaxConcurrencyOption(page, 50);
    await utils.submitEntityFormAndWaitForSuccess(page);
    await utils.ensureEntityRowVisible(page, validEntityName);
    await utils.deleteEntityAndWait(page, validEntityName);
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-46 RPM组合重复校验', (cleanup) => {
  test('验证相同 RPM 组合被拦截', async ({ page }) => {
    const { entityName, typeName } = await prepareEntityCreate(page, cleanup);
    await utils.setupEntityCreateWithRateLimit(page, entityName, typeName);
    await utils.addEntityRateLimitRule(page, 'RPM', {
      name: 'rpm_dup_1',
      window: 1,
      maxRequests: 100,
    });
    await utils.addEntityRateLimitRule(page, 'RPM', {
      name: 'rpm_dup_2',
      window: 1,
      maxRequests: 100,
    });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.rpmCombinationDuplicateMsg,
    );
    await utils.cancelEntityForm(page);
  });
});

entityOrgDescribe('Entity组织管理 - EM-CV-01 Entity名称仅允许小写字母', (cleanup) => {
  test('验证大写与空白被拦截，小写合法名可通过', async ({ page }) => {
    const { entityName, typeName } = await prepareEntityCreate(page, cleanup);

    await utils.fillEntityFormBasic(page, { name: 'ops', typeName });
    await utils.expectEntityNameFieldValid(page);
    await utils.fillEntityFormBasic(page, { name: 'ops_team', typeName });
    await utils.expectEntityNameFieldValid(page);
    await utils.fillEntityFormBasic(page, { name: 'ops-team', typeName });
    await utils.expectEntityNameFieldValid(page);

    await utils.fillEntityFormBasic(page, { name: 'Ops', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameFormatErrorMsg,
    );
    await utils.fillEntityFormBasic(page, { name: 'OpsTeam', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameFormatErrorMsg,
    );
    await utils.fillEntityFormBasic(page, { name: 'OPS', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameFormatErrorMsg,
    );
    await utils.fillEntityFormBasic(page, { name: 'Ops Team', typeName });
    await utils.submitEntityFormExpectRateLimitError(
      page,
      DOC.nameFormatErrorMsg,
    );

    await utils.fillEntityFormBasic(page, { name: entityName, typeName });
    await utils.submitEntityFormAndWaitForSuccess(page);
    await utils.ensureEntityRowVisible(page, entityName);
    await utils.deleteEntityAndWait(page, entityName);
  });
});

entityOrgDescribe('Entity组织管理 - EM-CV-02 Entity名称首尾字符限制', (cleanup) => {
  test('验证不能以 _、-、@ 开头或结尾', async ({ page }) => {
    const { typeName } = await prepareEntityCreate(page, cleanup);

    await utils.fillEntityFormBasic(page, { name: 'ops-team', typeName });
    await utils.expectEntityNameFieldValid(page);

    for (const invalid of ['-ops', '_ops', '@ops', 'ops-', 'ops_', 'ops@']) {
      await utils.fillEntityFormBasic(page, { name: invalid, typeName });
      await utils.submitEntityFormExpectRateLimitError(
        page,
        DOC.nameFormatErrorMsg,
      );
    }
  });
});

entityOrgDescribe('Entity组织管理 - EM-CV-09 Entity名称允许中间出现@', (cleanup) => {
  test('验证 user@project 形式可创建，tip 与 placeholder 与原型一致', async ({
    page,
  }) => {
    const { typeName } = await prepareEntityCreate(page, cleanup);
    await utils.expectEntityNamePlaceholder(page);
    await utils.expectEntityNameFormTip(page);

    const aliceName = await utils.generateTestEntityAtName('alice', 'default');
    cleanup.trackEntityName(aliceName);
    await utils.fillEntityFormBasic(page, { name: aliceName, typeName });
    await utils.submitEntityFormAndWaitForSuccess(page);
    await utils.ensureEntityRowVisible(page, aliceName);
    await utils.deleteEntityAndWait(page, aliceName);

    const userName = await utils.generateTestEntityAtName('user', 'project');
    cleanup.trackEntityName(userName);
    await utils.openCreateEntityDrawer(page);
    await utils.fillEntityFormBasic(page, { name: userName, typeName });
    await utils.submitEntityFormAndWaitForSuccess(page);
    await utils.ensureEntityRowVisible(page, userName);
    await utils.deleteEntityAndWait(page, userName);
  });
});
