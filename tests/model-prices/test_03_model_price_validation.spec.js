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
 * 模型定价 - 字段校验（MP-V-01/03/04/05）
 *
 * 覆盖用例（P0）：
 * - MP-V-01 必填字段校验（provider / model / base_model / mode）
 * - MP-V-03 mode 枚举值校验（13 种选项 + 合法枚举可进入唯一性校验阶段）
 * - MP-V-04 prices 至少包含一个价格字段
 * - MP-V-05 prices 字段值非负校验
 *
 * 已知 UI 缺陷（作为断言基准）：
 * 1. 创建唯一性校验恒拦截：合法表单提交后被「该 (provider, model, mode) 组合已存在」
 *    拦截。因此「合法值可提交」类断言统一以到达唯一性校验阶段（duplicateCombo 提示）
 *    作为「校验通过」的证据。
 * 2. MP-V-01-4 mode 必填：表单默认 mode='chat'，需通过 setModeViaModel('') 清空
 *    以模拟「未选择 mode」场景。
 *
 * 文案偏差（docs/model-prices/02-功能测试用例/ 参考文案 vs 实际 UI i18n）：
 * - design/02 参考文案如「请输入 Provider」「请至少配置一个价格项」「价格不能为负数」等，
 *   与实际 UI i18n 存在差异。当前断言以 UI 实际文案为准（产品已确认：文案以实际 UI 一致即可）。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/model-prices/test_03_model_price_validation.spec.js
 */
const { test, expect } = require('@playwright/test');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');

test.describe('模型定价 - MP-V-01 必填字段校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('MP-V-01-1 provider 清空后提交触发必填错误', async ({ page }) => {
    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: '',
      model: 'v-model',
      base_model: 'v-base',
      mode: 'chat',
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: 0.00003,
    });
    await mp.clickSubmit(page);
    await mp.expectFieldError(page, mp.LABEL.provider, mp.MSG.providerRequired);
  });

  test('MP-V-01-2 model 清空后提交触发必填错误', async ({ page }) => {
    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: 'v-provider',
      model: '',
      base_model: 'v-base',
      mode: 'chat',
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: 0.00003,
    });
    await mp.clickSubmit(page);
    await mp.expectFieldError(page, mp.LABEL.model, mp.MSG.modelRequired);
  });

  test('MP-V-01-3 base_model 清空后提交触发必填错误', async ({ page }) => {
    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: 'v-provider',
      model: 'v-model',
      base_model: '',
      mode: 'chat',
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: 0.00003,
    });
    await mp.clickSubmit(page);
    await mp.expectFieldError(
      page,
      mp.LABEL.baseModel,
      mp.MSG.baseModelRequired,
    );
  });

  test('MP-V-01-4 mode 未选择时提交触发必填错误', async ({ page }) => {
    await mp.openCreateDrawer(page);
    // 表单默认 mode='chat'，通过 Vue 模型注入清空以模拟未选择
    await mp.fillCreateForm(page, {
      provider: 'v-provider',
      model: 'v-model',
      base_model: 'v-base',
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: 0.00003,
    });
    await mp.setModeViaModel(page, '');
    await mp.clickSubmit(page);
    await mp.expectFieldError(page, mp.LABEL.mode, mp.MSG.modeRequired);
  });
});

test.describe('模型定价 - MP-V-03 mode 枚举值校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('下拉选项共 13 种且与后端枚举一致，合法枚举可进入唯一性校验阶段', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-v-mode',
      model: 'qa-v-mode-model',
      base_model: 'qa-v-mode-model',
    };
    cleanup.trackCombo(combo.provider, combo.model, 'realtime');

    await mp.openCreateDrawer(page);
    // 枚举下拉选项与接口定义一致（13 种）
    const options = await mp.getModeDropdownOptions(page);
    expect(options.length).toBe(13);
    expect(options).toEqual(mp.MODE_OPTIONS);

    // 选择非默认枚举值 realtime，填其余必填项后提交
    await mp.selectMode(page, 'realtime');
    await mp.expectModeSelected(page, 'realtime');
    await mp.fillProvider(page, combo.provider);
    await mp.fillModel(page, combo.model);
    await mp.fillBaseModel(page, combo.base_model);
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });

    // 枚举值合法 → 必填/价格校验均通过 → 提交成功创建记录
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);
    const created = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      'realtime',
    );
    expect(created).not.toBeNull();
    expect(created.mode).toBe('realtime');
  });
});

test.describe('模型定价 - MP-V-07 (provider, model, mode) 唯一性校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('重复组合提交被拦截，修改 mode 后仍可继续编辑表单', async ({ page }) => {
    // 确保基线数据存在
    await api.ensureBaselineData(page);

    const dup = {
      provider: 'deepseek',
      model: 'deepseek-v3',
      base_model: 'deepseek-v3',
    };
    // 基线已存在 (deepseek, deepseek-v3, chat)
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        dup.provider,
        dup.model,
        'chat',
      ),
    ).not.toBeNull();

    // 步骤 1：重复组合（与基线完全相同）提交 → 被唯一性校验拦截，
    // drawer 仍保持打开，用户可继续编辑
    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: dup.provider,
      model: dup.model,
      base_model: dup.base_model,
      mode: 'chat',
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: 0.00003,
    });
    await mp.clickSubmit(page);
    await mp.expectMessage(page, mp.MSG.duplicateCombo);
    await mp.expectUpsertScopeVisible(page);

    // 步骤 2：改 mode 为 completion（组合不再重复）→ 提交成功，drawer 关闭
    cleanup.trackCombo(dup.provider, dup.model, 'completion');
    await mp.selectMode(page, 'completion');
    await mp.submitUpsertAndWait(page);
    await mp.expectUpsertScopeHidden(page);
  });
});

// 注：文档中 MP-V-01-5（prices 必填，至少一个价格字段）与 MP-V-04（prices 空对象不合法）
// 描述同一校验，本用例统一以 MP-V-04 编号实现，同时覆盖 MP-V-01-5。
test.describe('模型定价 - MP-V-04 prices 至少一个价格字段', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('不添加价格项提交报错，添加后校验通过', async ({ page }) => {
    cleanup.trackCombo('qa-v-prices', 'qa-v-prices-model', 'chat');
    await mp.openCreateDrawer(page);
    await mp.fillProvider(page, 'qa-v-prices');
    await mp.fillModel(page, 'qa-v-prices-model');
    await mp.fillBaseModel(page, 'qa-v-prices-model');
    await mp.selectMode(page, 'chat');

    // 无价格项 → 提交被拦截
    await mp.clickSubmit(page);
    await mp.expectPricesError(page, mp.MSG.pricesRequired);

    // 添加一个价格项 → 重新提交后 prices 校验通过 → 提交成功创建记录
    // （直接 submitUpsertAndWait 一次点击提交；此前重复 clickSubmit 会在
    //   按钮 loading 期间被 detach 导致 locator.click 超时）
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });
    await mp.submitUpsertAndWait(page);
    await mp.expectPricesErrorHidden(page);
    await mp.expectDrawerHidden(page);
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        'qa-v-prices',
        'qa-v-prices-model',
        'chat',
      ),
    ).not.toBeNull();
  });
});

test.describe('模型定价 - MP-V-05 prices 字段值非负校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('创建表单输入负值被 InputNumber 钳制为 0（非负强制生效）', async ({
    page,
  }) => {
    await mp.openCreateDrawer(page);
    await mp.fillProvider(page, 'qa-v-negative');
    await mp.fillModel(page, 'qa-v-negative-model');
    await mp.fillBaseModel(page, 'qa-v-negative-model');
    await mp.selectMode(page, 'chat');
    await mp.addPriceRow(page);

    // 输入负数 -0.0001：价格值输入框为 el-input-number(:min=0)，失焦时钳制为 0，
    // 保证价格字段不可能为负（UI 层非负强制，无「价格不能为负数」错误提示）
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: -0.0001,
    });
    const rowValues = await mp.getPriceRowValues(page, 0);
    expect(rowValues.value).toBe('0.00000000');

    // 0 为合法非负值 → 提交成功创建记录
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);
    const created = await api.findModelPriceByComboViaApi(
      page,
      'qa-v-negative',
      'qa-v-negative-model',
      'chat',
    );
    expect(created).not.toBeNull();
    expect(created.prices.input_cost_per_token).toBe(0);
  });

  test('编辑路径输入负值被钳制为 0，接口数据更新为非负值', async ({ page }) => {
    const combo = {
      provider: 'qa-v-neg-edit',
      model: 'qa-v-neg-edit-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);
    const created = await api.createModelPriceViaApi(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.model,
      mode: combo.mode,
      prices: { input_cost_per_token: 0.00001 },
    });
    expect(created).not.toBeNull();

    // 刷新列表后打开编辑（组合未变更 → 绕过唯一性校验直接 PUT）
    await page.reload();
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);
    await mp.openEditDrawer(page, combo.provider);

    // 价格改为负数 → el-input-number(:min=0) 失焦钳制为 0（非负强制）
    await mp.fillPriceRow(page, 0, { value: -0.0001 });
    const rowValues = await mp.getPriceRowValues(page, 0);
    expect(rowValues.value).toBe('0.00000000');

    // 0 为合法值 → 提交成功，接口数据更新为 0（非负保证生效）
    await mp.clickSubmit(page);
    await mp.expectDrawerHidden(page);
    const record = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(record).not.toBeNull();
    expect(record.prices.input_cost_per_token).toBe(0);
  });
});

test.describe('模型定价 - MP-V-02 字符串长度边界校验（1-255）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  async function fillBaseValidForm(page, overrides = {}) {
    await mp.openCreateDrawer(page);
    await mp.fillProvider(page, overrides.provider || 'qa-v-len');
    await mp.fillModel(page, overrides.model || 'qa-v-len-model');
    await mp.fillBaseModel(page, overrides.base_model || 'qa-v-len-base');
    await mp.selectMode(page, 'chat');
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });
  }

  test('MP-V-02-1 provider：1 字符与 255 字符可提交成功，256 字符报长度错误', async ({
    page,
  }) => {
    cleanup.trackCombo('a', 'qa-v-len-model', 'chat');
    cleanup.trackCombo('a'.repeat(255), 'qa-v-len-model', 'chat');

    // 1 字符 → 必填/长度校验通过 → 提交成功创建记录
    await fillBaseValidForm(page, { provider: 'a' });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        'a',
        'qa-v-len-model',
        'chat',
      ),
    ).not.toBeNull();

    // 255 字符 → 同样通过长度校验，提交成功创建记录
    await fillBaseValidForm(page, { provider: 'a'.repeat(255) });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        'a'.repeat(255),
        'qa-v-len-model',
        'chat',
      ),
    ).not.toBeNull();

    // 256 字符 → blur 触发长度校验（min1/max255）→ 行内错误
    await mp.openCreateDrawer(page);
    await mp.fillProvider(page, 'a'.repeat(256));
    await mp.expectFieldError(page, mp.LABEL.provider, '长度 1-255');
  });

  test('MP-V-02-2 model：256 字符触发长度错误', async ({ page }) => {
    await fillBaseValidForm(page, { model: 'a'.repeat(256) });
    await mp.expectFieldError(page, mp.LABEL.model, '长度 1-255');
  });

  test('MP-V-02-3 base_model：256 字符触发长度错误', async ({ page }) => {
    await fillBaseValidForm(page, { base_model: 'a'.repeat(256) });
    await mp.expectFieldError(page, mp.LABEL.baseModel, '长度 1-255');
  });
});

test.describe('模型定价 - MP-V-06 limits 字段值非负整数校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('创建表单输入负 limits 提交被前端校验拦截（非负整数校验生效）', async ({
    page,
  }) => {
    await mp.openCreateDrawer(page);
    await mp.fillProvider(page, 'qa-v-limit');
    await mp.fillModel(page, 'qa-v-limit-model');
    await mp.fillBaseModel(page, 'qa-v-limit-model');
    await mp.selectMode(page, 'chat');
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });
    await mp.addLimitRow(page);
    await mp.fillLimitRow(page, 0, { key: 'context_window', value: -1 });

    // 负值保留（InputNumber :min=0 不钳制手动输入），提交被前端非负整数校验拦截
    const rowValues = await mp.getLimitRowValues(page, 0);
    expect(rowValues.value).toBe('-1');
    await mp.clickSubmit(page);
    await mp.expectLimitsError(page, mp.MSG.limitsValueInvalid);
    await mp.expectUpsertScopeVisible(page);
    // 接口侧未产生记录
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        'qa-v-limit',
        'qa-v-limit-model',
        'chat',
      ),
    ).toBeNull();
  });

  test('编辑路径负 limits 被前端校验拦截；正整数 limits 提交成功', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-v-limit-edit',
      model: 'qa-v-limit-edit-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);
    const created = await api.createModelPriceViaApi(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.model,
      mode: combo.mode,
      prices: { input_cost_per_token: 0.00001 },
    });
    expect(created).not.toBeNull();

    await page.reload();
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    // 步骤 A：limits 填 -1 → 提交 → 前端非负整数校验拦截（limits 应为非负，
    // 与 prices 非负校验一致），抽屉保持打开，接口数据未变化
    await mp.openEditDrawer(page, combo.provider);
    await mp.addLimitRow(page);
    await mp.fillLimitRow(page, 0, { key: 'context_window', value: -1 });
    await mp.clickSubmit(page);
    await mp.expectLimitsError(page, mp.MSG.limitsValueInvalid);
    await mp.expectUpsertScopeVisible(page);

    const unchanged = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(unchanged).not.toBeNull();
    expect(unchanged.limits || {}).toEqual({});

    // 步骤 B：limits 改 8192（正整数）→ 提交成功 → 接口持久化
    await mp.fillLimitRow(page, 0, { key: 'context_window', value: 8192 });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    const updated = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(updated).not.toBeNull();
    expect(updated.limits.context_window).toBe(8192);
  });
});

test.describe('模型定价 - MP-V-08 capabilities 多选标签交互', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('勾选/取消勾选 tags 正确，选项枚举 21 种，提交不受影响', async ({
    page,
  }) => {
    await mp.openCreateDrawer(page);

    // 下拉选项与 UI 枚举一致（21 种）
    const options = await mp.getMultiDropdownOptions(
      page,
      mp.LABEL.capabilities,
    );
    expect(options.length).toBe(21);
    expect(options).toEqual(mp.CAPABILITY_OPTIONS);

    // 依次勾选 chat / vision / tools → 取消 tools
    await mp.selectMultiOptions(page, mp.LABEL.capabilities, [
      'chat',
      'vision',
      'tools',
    ]);
    expect(await mp.getMultiSelectedTags(page, mp.LABEL.capabilities)).toEqual([
      'chat',
      'vision',
      'tools',
    ]);
    await mp.deselectMultiOption(page, mp.LABEL.capabilities, 'tools');
    expect(await mp.getMultiSelectedTags(page, mp.LABEL.capabilities)).toEqual([
      'chat',
      'vision',
    ]);

    // 填写必填项后提交 → capabilities 不阻塞提交（提交成功，无重复）
    await mp.fillProvider(page, 'qa-v-cap');
    await mp.fillModel(page, 'qa-v-cap-model');
    await mp.fillBaseModel(page, 'qa-v-cap-model');
    await mp.selectMode(page, 'chat');
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });
    cleanup.trackCombo('qa-v-cap', 'qa-v-cap-model', 'chat');
    await mp.submitUpsertAndWait(page);
  });

  test('编辑路径勾选 capabilities 持久化到接口', async ({ page }) => {
    const combo = {
      provider: 'qa-v-cap-edit',
      model: 'qa-v-cap-edit-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);
    const created = await api.createModelPriceViaApi(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.model,
      mode: combo.mode,
      prices: { input_cost_per_token: 0.00001 },
      capabilities: [],
    });
    expect(created).not.toBeNull();

    await page.reload();
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    await mp.openEditDrawer(page, combo.provider);
    await mp.selectMultiOptions(page, mp.LABEL.capabilities, [
      'chat',
      'vision',
    ]);
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    const updated = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(updated).not.toBeNull();
    expect(updated.capabilities).toEqual(['chat', 'vision']);
  });
});

test.describe('模型定价 - MP-V-09 supported_parameters 多选标签交互', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('勾选/取消勾选 tags 正确，选项枚举 15 种（与 API 文档一致）', async ({
    page,
  }) => {
    await mp.openCreateDrawer(page);

    const options = await mp.getMultiDropdownOptions(
      page,
      mp.LABEL.supportedParameters,
    );
    expect(options.length).toBe(15);
    expect(options).toEqual(mp.SUPPORTED_PARAMETER_OPTIONS);

    // 说明：docs/04 MP-I-01 示例含 'stream'，但 API 文档 / 后端 / UI 枚举均
    // 无 'stream'（属 docs 示例笔误）。UI 曾缺 voice/speed/size/quality/style
    // 5 种（前端缺陷，已修复补齐），此处用新增枚举 voice 验证多选交互。
    await mp.selectMultiOptions(page, mp.LABEL.supportedParameters, [
      'temperature',
      'max_tokens',
      'voice',
    ]);
    expect(
      await mp.getMultiSelectedTags(page, mp.LABEL.supportedParameters),
    ).toEqual(['temperature', 'max_tokens', 'voice']);
    await mp.deselectMultiOption(page, mp.LABEL.supportedParameters, 'voice');
    expect(
      await mp.getMultiSelectedTags(page, mp.LABEL.supportedParameters),
    ).toEqual(['temperature', 'max_tokens']);

    await mp.fillProvider(page, 'qa-v-sp');
    await mp.fillModel(page, 'qa-v-sp-model');
    await mp.fillBaseModel(page, 'qa-v-sp-model');
    await mp.selectMode(page, 'chat');
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });
    cleanup.trackCombo('qa-v-sp', 'qa-v-sp-model', 'chat');
    await mp.submitUpsertAndWait(page);
  });
});

test.describe('模型定价 - MP-V-10 metadata.source URL 格式校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('非法 URL 报错，合法 URL 与空值均通过', async ({ page }) => {
    await mp.openCreateDrawer(page);
    await mp.fillProvider(page, 'qa-v-url');
    await mp.fillModel(page, 'qa-v-url-model');
    await mp.fillBaseModel(page, 'qa-v-url-model');
    await mp.selectMode(page, 'chat');
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: 0.00003,
    });

    // 1. 非法 URL → blur 触发校验 → 行内错误
    await mp.fillInputByLabel(page, mp.LABEL.source, 'not-a-url');
    await mp.expectFieldError(page, mp.LABEL.source, mp.MSG.sourceUrlInvalid);

    // 2. 合法 URL → 字段校验通过（source 格式正确）
    await mp.fillInputByLabel(
      page,
      mp.LABEL.source,
      'https://openai.com/pricing',
    );
    await mp.expectFieldValid(page, mp.LABEL.source);

    // 3. 清空 source → 字段校验通过（metadata 可选）
    await mp.fillInputByLabel(page, mp.LABEL.source, '');
    await mp.expectFieldValid(page, mp.LABEL.source);

    // 4. 完整提交成功（验证 source 字段不阻塞提交）
    cleanup.trackCombo('qa-v-url', 'qa-v-url-model', 'chat');
    await mp.submitUpsertAndWait(page);
  });
});
