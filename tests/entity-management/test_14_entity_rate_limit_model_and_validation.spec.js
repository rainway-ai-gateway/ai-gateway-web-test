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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const {
  getUserData,
  getOpenApiBaseUrl,
  findEntityByNameViaApi,
} = require('../../api/entity-api-utils');

const DRAWER_TITLE = utils.DRAWER_TITLE;
const DOC = utils.DOC_ENTITY_ORG;

/**
 * 限流规则「适用模型」（EM-E-68）/ 批量限流负数（EM-E-58）/ 滑动步长跨字段约束（EM-E-69）
 *
 * 验收依据：docs/entity-management/02-功能测试用例/13-限流规则适用模型与跨字段校验.md
 * - EM-E-68 限流规则「适用模型」选择后提交与回显（P1）
 * - EM-E-58 创建Entity-批量限流负数校验（P2，本 spec 补齐自动化；设计正文见 03-配额与限流校验.md）
 * - EM-E-69 TPM 滑动步长不得大于时间窗口（P1）
 */

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

async function fetchAvailableModels(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(getOpenApiBaseUrl() + '/clusters', {
    headers: { Authorization: 'Session ' + userData.sessionKey },
  });
  const body = await response.json();
  const data = body && body.Data;
  const list = Array.isArray(data) ? data : (data && (data.clusters || data.list)) || [];
  const models = [];
  for (const cluster of list) {
    const clusterModels =
      (cluster && cluster.llm_config && cluster.llm_config.models) || [];
    for (const model of clusterModels) {
      if (model && !models.includes(model)) {
        models.push(model);
      }
    }
  }
  return models;
}

async function prepareRateLimitDrawer(page, cleanup) {
  const entityName = await utils.generateTestEntityName();
  const typeName = await utils.generateTestEntityTypeName();
  cleanup.trackEntityName(entityName);
  cleanup.trackTypeName(typeName);
  await utils.gotoEntityTypeManagementPage(page);
  await utils.createEntityTypeViaUI(page, typeName, 'EM 限流模型/校验类型', 1);
  await utils.gotoEntityOrgManagementPage(page);
  await utils.waitForEntityManagementShell(page);
  await utils.waitForPageSettled(page, 800);
  await utils.openCreateEntityDrawer(page);
  await utils.setupEntityCreateWithRateLimit(page, entityName, typeName);
  return { entityName, typeName };
}

entityOrgDescribe('Entity组织管理 - EM-E-68 限流规则-适用模型', (cleanup) => {
  test('TPM 规则选择具体适用模型后提交，请求体、接口与编辑回显一致', async ({
    page,
  }) => {
    await utils.gotoEntityOrgManagementPage(page);
    const { entityName } = await prepareRateLimitDrawer(page, cleanup);

    const models = await fetchAvailableModels(page);
    if (models.length === 0) {
      test.skip(
        true,
        '环境无可用模型（cluster.llm_config.models 为空），无法验证具体适用模型',
      );
    }
    const model = models[0];

    await test.step('1. 新增 TPM 规则并选择具体适用模型', async () => {
      await utils.addEntityRateLimitRule(page, 'TPM', {
        name: 'tpm_model_scope',
        model,
        window: 1,
        maxTokens: 100,
        step: 1,
      });
      await utils.selectEntityMaxConcurrencyOption(page, '不限制');
    });

    await test.step('2. 提交并校验请求体携带所选模型', async () => {
      const [request] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === 'POST' && /\/entities$/.test(req.url()),
          { timeout: 20000 },
        ),
        utils.submitEntityFormAndWaitForSuccess(page, DRAWER_TITLE.createEntity),
      ]);
      const payload = request.postDataJSON();
      expect(
        payload.rate_limit_policy.rules.tpm[0].model,
        '请求体 TPM 规则 model 应为所选具体模型',
      ).toBe(model);
      await utils.expectCreateEntityDrawerHidden(page);
    });

    await test.step('3. 接口回读规则 model 一致', async () => {
      const apiData = await findEntityByNameViaApi(page, entityName);
      expect(apiData, '接口应能查到新建 Entity').toBeTruthy();
      const tpmRules =
        (apiData.rate_limit_policy &&
          apiData.rate_limit_policy.rules &&
          apiData.rate_limit_policy.rules.tpm) ||
        [];
      expect(tpmRules.length).toBe(1);
      expect(tpmRules[0].model).toBe(model);
    });

    await test.step('4. 编辑抽屉回显所选适用模型', async () => {
      await utils.searchEntityByName(page, entityName);
      await utils.openEditEntityDrawer(page, entityName);
      const section = await utils.entityRateLimitSection(
        page,
        'TPM',
        DRAWER_TITLE.editEntity,
      );
      const ruleRow = section.locator('.rule-row').first();
      await expect(ruleRow).toBeVisible({ timeout: 15000 });
      // Element UI 单选下拉把选中项渲染在 input.value 中（不是 innerText）
      const selectedText = (
        await ruleRow.locator('.el-select input.el-input__inner').first().inputValue()
      ).trim();
      expect(selectedText, '适用模型回显应为所选模型').toContain(model);
      await utils.cancelEditEntityForm(page);
    });
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-58 批量限流-负数校验', (cleanup) => {
  test('批量限流四维度输入负数被拦截，且不产生创建请求', async ({ page }) => {
    await utils.gotoEntityOrgManagementPage(page);
    await prepareRateLimitDrawer(page, cleanup);

    let posted = false;
    page.on('request', (req) => {
      if (req.method() === 'POST' && /\/entities$/.test(req.url())) {
        posted = true;
      }
    });

    await test.step('1. 批量任务创建RPM 注入 -1（键盘无法输入负号）', async () => {
      // issue #139：NumberInput 输入层会剔除负号，键盘敲 -1 实际录入 1；
      // 负值校验场景按 EM-E-05 同口径走 Vue 模型注入
      const result = await utils.setEntityBatchLimitModel(
        page,
        'max_create_rpm',
        -1,
      );
      expect(result.value, '模型应保留注入的负值').toBe(-1);
    });

    await test.step('2. 提交被拦截并提示不能为负数', async () => {
      await utils.submitEntityForm(page, DRAWER_TITLE.createEntity);
      await utils.waitAfterEntityAction(page, 500);
      await utils.expectCreateEntityDrawerOpen(page);
      await utils.expectEntityFormInlineError(
        page,
        '批量任务创建RPM',
        '批量任务创建RPM不能为负数',
      );
      expect(posted, '校验失败时不应发出 POST /entities').toBe(false);
    });

    await utils.cancelEntityForm(page);
  });
});

entityOrgDescribe('Entity组织管理 - EM-E-69 TPM滑动步长不得大于时间窗口', (cleanup) => {
  test('时间窗口 10、滑动步长 20 时拦截并提示', async ({ page }) => {
    await utils.gotoEntityOrgManagementPage(page);
    await prepareRateLimitDrawer(page, cleanup);

    await utils.addEntityRateLimitRule(page, 'TPM', {
      name: 'tpm_step_over_window',
      window: 10,
      maxTokens: 100,
      step: 1,
    });

    await test.step('1. 步长写为 20 触发跨字段校验', async () => {
      const result = await utils.setEntityRateLimitRuleFieldModel(
        page,
        'TPM',
        'step_minutes',
        20,
      );
      expect(result.errorMessage || '', '字段校验应给出跨字段提示').toContain(
        '不能超过时间窗口',
      );
    });

    await test.step('2. 提交被拦截且行内展示提示', async () => {
      await utils.submitEntityForm(page, DRAWER_TITLE.createEntity);
      await utils.waitAfterEntityAction(page, 500);
      await utils.expectCreateEntityDrawerOpen(page);
      await utils.expectEntityFormInlineError(
        page,
        '滑动步长',
        utils.formatRuleValidationMsg(DOC.tpmStepMinutesInvalidMsgTemplate, 1),
      );
    });

    await utils.cancelEntityForm(page);
  });
});

// ==================== EM-E-70 规则名字符集（与接口文档对齐）====================
//
// 接口文档 `00-common.md` §10/§11 规定 TPM/RPM 规则 name：必填、1–128 字符、
// 字符集 `[a-zA-Z0-9_-]`、同策略内不重复。此前 Entity 表单只校验必填/长度/重复，
// 缺字符集校验（api-key 侧已有）；2026-11-02 已按接口文档补齐前端校验，本用例固化。

entityOrgDescribe(
  'Entity组织管理 - EM-E-70 规则名字符集（接口文档对齐）',
  (cleanup) => {
    test('含点号 / 中文 / 空格的规则名被拦截，合法名可保存', async ({ page }) => {
      const entityName = await utils.generateTestEntityName();
      const typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);
      await utils.gotoEntityTypeManagementPage(page);
      await utils.createEntityTypeViaUI(page, typeName, 'EM 规则名字符集类型', 1);
      await utils.gotoEntityOrgManagementPage(page);
      await utils.waitForEntityManagementShell(page);
      await utils.waitForPageSettled(page, 800);
      await utils.openCreateEntityDrawer(page);
      await utils.setupEntityCreateWithRateLimit(page, entityName, typeName);

      const MSG = '规则名称字符集为 [a-zA-Z0-9_-]，长度 1–128';

      await test.step('含点号 tpm.rule 被拦截', async () => {
        await utils.addEntityRateLimitRule(page, 'TPM', {
          name: 'tpm.rule',
          window: 1,
          maxTokens: 100,
          step: 1,
        });
        await utils.submitEntityFormExpectRateLimitError(page, MSG);
      });

      await test.step('含中文被拦截', async () => {
        await utils.fillEntityRateLimitRuleFieldRaw(
          page,
          'TPM',
          '规则名称',
          '规则一',
        );
        await utils.submitEntityFormExpectRateLimitError(page, MSG);
      });

      await test.step('含空格被拦截', async () => {
        await utils.fillEntityRateLimitRuleFieldRaw(
          page,
          'TPM',
          '规则名称',
          'tpm rule',
        );
        await utils.submitEntityFormExpectRateLimitError(page, MSG);
      });

      await test.step('合法名 tpm_rule-1 可通过校验并创建成功', async () => {
        await utils.fillEntityRateLimitRuleFieldRaw(
          page,
          'TPM',
          '规则名称',
          'tpm_rule-1',
        );
        await utils.selectEntityMaxConcurrencyOption(page, '不限制');
        await utils.submitEntityFormAndWaitForSuccess(
          page,
          utils.DRAWER_TITLE.createEntity,
        );
        await utils.expectCreateEntityDrawerHidden(page);
        await utils.searchEntityByName(page, entityName);
        await utils.expectEntityVisible(page, entityName);
      });

      await utils.cancelEntityForm(page).catch(() => {});
    });
  },
);
