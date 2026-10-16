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
 * 模型定价 - 分时段价格（tier_prices）（MP-T-01 ~ MP-T-10）
 *
 * 覆盖用例（docs/model-prices/02-功能测试用例/05-分时段价格.md）：
 * - MP-T-01 价格 Card 三配置块（默认价格必填 / 分时段价格可选 / 批量折扣系数可选）
 * - MP-T-02 分时段价格 ? Tooltip（fallback 语义）与说明文案位置
 * - MP-T-03 时段对象只读「忙时」Tag（橙色，非下拉）
 * - MP-T-04 分时段价格动态添加 / 删除条目
 * - MP-T-05 不填分时段价格 → 提交体不含 tier_prices（fallback 到 prices）
 * - MP-T-06 分时段价格字段校验（负数拦截 / 科学计数法合法）
 * - MP-T-07 提交体结构 tier_prices.peak（键名同 prices 枚举，剥离 id/时间戳/price_currency）
 * - MP-T-08 详情页分时段价格分组展示（无 tier_prices 不展示空分组）
 * - MP-T-09 编辑回显 tier_prices，改值保存后 GET 读回一致
 * - MP-T-10 prices 键名枚举：默认 / 分时段块下拉均含全部 10 个新增键
 *
 * 与 test_08_model_price_sci_and_merge.spec.js 的交集划分：
 * - test_08 MP-V-11/MP-V-12 已覆盖「默认价格（prices）」的科学计数法与上限校验；
 *   本文件 MP-T-06 只覆盖「分时段价格（tier_prices.peak）」的负数拦截与科学计数法
 *   合法性（前端校验逻辑独立：pricesValueError vs tierValueError），重叠部分仅
 *   复用 mp.clickSubmitExpectNoModelPriceWrite / mp.expectNumericPriceEqual 等 helper。
 * - test_08 MP-C-05 覆盖 prices 的 PUT 键级合并；本文件 MP-T-09 在读回断言中顺带
 *   覆盖 tier_prices 的键级合并（未修改的 tier 键保留），注释中标注对应关系。
 *
 * 已知 UI 偏差（作为断言基准，待产品确认后统一校准）：
 * 1. docs MP-T-02-3 预期「默认价格块无 Tooltip」，实际 UI 默认价格块同样有
 *    ios-help-circle-outline Tooltip（i18n priceDefaultTip）。按实际 UI 断言并在
 *    用例内注释标注偏差。
 *
 * 运行：npx playwright test tests/model-prices/test_06_model_price_tier.spec.js
 */
const { test, expect } = require('@playwright/test');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');

async function reloadToList(page) {
  await page.reload();
  await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(500);
}

/**
 * 点击提交并捕获 POST /open-api/v1/model-prices 请求体（MP-T-05/07 提交体结构断言）
 */
async function captureCreatePostBody(page, clickAction) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith('/open-api/v1/model-prices') &&
        r.request().method() === 'POST',
      { timeout: 15000 },
    ),
    clickAction(),
  ]);
  expect(response.status()).toBe(200);
  return JSON.parse(response.request().postData() || '{}');
}

// 详情页价格值为 ¥ 前缀格式化文本，剥前缀后做数值等价比较
function expectKvEntriesNumericallyEqual(entries, expected) {
  const ui = {};
  entries.forEach((e) => {
    ui[e.key] = Number(String(e.value).replace(/^¥/, '').trim());
  });
  expect(Object.keys(ui).sort()).toEqual(Object.keys(expected).sort());
  Object.keys(expected).forEach((key) => {
    expect(ui[key]).toBe(Number(expected[key]));
  });
}

test.describe('模型定价 - MP-T-01~04 分时段价格 UI 结构', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('MP-T-01 价格 Card 三配置块（默认价格必填/分时段价格可选/批量折扣系数可选）', async ({
    page,
  }) => {
    await mp.openCreateDrawer(page);

    const group = mp.priceConfigGroup(page);
    await expect(group).toBeVisible();
    // 三个同级并列的 .price-config-block（批量折扣系数块仅在 mode != batch 时渲染）
    await expect(mp.priceConfigBlocks(page)).toHaveCount(3);

    const defaultBlock = mp.defaultPriceBlock(page);
    const tierBlock = mp.tierPriceBlock(page);
    const batchDiscountBlock = mp.batchDiscountBlock(page);
    // ① 默认价格（prices）：必填（is-required 星标）
    await expect(defaultBlock.locator('.price-config-title')).toContainText(
      '默认价格',
    );
    await expect(defaultBlock.locator('.price-config-title')).toHaveClass(
      /is-required/,
    );
    // ② 分时段价格（tier_prices.peak）：可选（无 is-required）
    await expect(tierBlock.locator('.price-config-title')).toContainText(
      '分时段价格',
    );
    await expect(tierBlock.locator('.price-config-title')).not.toHaveClass(
      /is-required/,
    );
    // ③ 批量折扣系数（batch_discount）：可选（无 is-required），InputNumber 输入框
    //    （默认 mode=chat 故渲染；默认值 0.5，取值 (0,1]，见 MP-V-13 / MP-V-14）
    await expect(batchDiscountBlock.locator('.price-config-title')).toContainText(
      '批量折扣系数',
    );
    await expect(batchDiscountBlock.locator('.price-config-title')).not.toHaveClass(
      /is-required/,
    );
    await expect(batchDiscountBlock.locator('.ivu-input-number')).toHaveCount(1);
    // 文案为「默认价格」「分时段价格」（非「价格对象」「分时段价格对象」）
    await expect(
      defaultBlock.locator('.price-config-title'),
    ).not.toContainText('价格对象');
    await expect(
      tierBlock.locator('.price-config-title'),
    ).not.toContainText('价格对象');

    // 基础信息（模型能力、支持参数等）不单独成 Card，与价格区同抽屉展示
    await expect(
      mp.upsertScope(page)
        .locator('.ivu-card')
        .filter({ hasText: mp.LABEL.basicInfo }),
    ).toHaveCount(0);
    await expect(
      mp.upsertScope(page).getByText(mp.LABEL.capabilities, { exact: true }),
    ).toBeVisible();
    await expect(
      mp.upsertScope(page).getByText(mp.LABEL.supportedParameters, {
        exact: true,
      }),
    ).toBeVisible();

    await mp.clickCancel(page);
  });

  test('MP-T-02 分时段价格 ? Tooltip 展示 fallback 语义，说明移至 Tooltip', async ({
    page,
  }) => {
    await mp.openCreateDrawer(page);

    // 悬停分时段价格标题旁 ios-help-circle-outline → Tooltip 说明 fallback 语义
    const popper = await mp.hoverTierPriceTooltip(page);
    await expect(popper).toContainText(
      '分时段价格配置专属的价格；不在这些时段内时将使用默认价格，可选填。',
    );

    // 分时段价格块无正文长说明段落（说明移至 Tooltip）
    await expect(mp.tierPriceBlock(page).locator('.price-hint')).toHaveCount(0);
    // 默认价格块有正文说明（priceHint 输入格式说明）
    await expect(
      mp.defaultPriceBlock(page).locator('.price-hint').first(),
    ).toBeVisible();

    // 已知 UI 偏差（docs MP-T-02-3 预期「默认价格块无 Tooltip」）：实际 UI 默认价格块
    // 同样有 ios-help-circle-outline Tooltip（i18n priceDefaultTip），按实际 UI 断言，
    // 待产品确认后统一校准。
    await expect(
      mp.defaultPriceBlock(page).locator('.price-config-help-icon'),
    ).toBeVisible();

    await mp.clickCancel(page);
  });

  test('MP-T-03 时段对象只读「忙时」Tag（橙色，非下拉）', async ({ page }) => {
    await mp.openCreateDrawer(page);

    const metaRow = mp.tierPriceBlock(page).locator('.tier-meta-row');
    await expect(metaRow).toBeVisible();
    await expect(metaRow.locator('.tier-meta-label')).toHaveText(
      mp.LABEL.tierObject,
    );
    // 只读 Tag「忙时」（橙色 ivu-tag-warning），对应提交字段 tier_prices.peak
    const tag = metaRow.locator('.ivu-tag');
    await expect(tag).toHaveText('忙时');
    await expect(tag).toHaveClass(/ivu-tag-warning/);
    // 非下拉：无 iView / el-select 组件、无输入框，不可修改
    await expect(metaRow.locator('.ivu-select, .el-select')).toHaveCount(0);
    await expect(metaRow.locator('input')).toHaveCount(0);

    await mp.clickCancel(page);
  });

  test('MP-T-04 分时段价格动态添加/删除条目，删除后不参与提交', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-tier-t04',
      model: 'qa-tier-t04-model',
      base_model: 'qa-tier-t04-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.base_model,
      mode: combo.mode,
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: '0.000002',
    });

    // 初始分时段价格块无条目（kv-table 未渲染）
    await mp.expectTierPriceRowCount(page, 0);
    // 动态添加两个条目并填值
    await mp.addTierPriceRow(page);
    await mp.expectTierPriceRowCount(page, 1);
    await mp.fillTierPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: '0.000004',
    });
    await mp.addTierPriceRow(page);
    await mp.fillTierPriceRow(page, 1, {
      key: mp.PRICE_KEY_OUTPUT_COST,
      value: '0.000008',
    });
    await mp.expectTierPriceRowCount(page, 2);
    // 删除第一个条目，剩余条目为 output_cost_per_token
    await mp.removeTierPriceRow(page, 0);
    await mp.expectTierPriceRowCount(page, 1);
    const remaining = await mp.getTierPriceRowValues(page, 0);
    expect(remaining.key).toBe(mp.PRICE_KEY_OUTPUT_COST);

    // 删除的条目不参与提交；分时段价格整体可选（此处剩余 1 条仍提交 tier_prices）
    const body = await captureCreatePostBody(page, () => mp.clickSubmit(page));
    expect(Object.keys(body.tier_prices.peak)).toEqual([
      mp.PRICE_KEY_OUTPUT_COST,
    ]);
    mp.expectNumericPriceEqual(
      body.tier_prices.peak[mp.PRICE_KEY_OUTPUT_COST],
      '0.000008',
    );
    await mp.expectMessage(page, mp.MSG.submitSuccess);
    await mp.expectDrawerHidden(page);
  });
});

test.describe('模型定价 - MP-T-05~07 分时段价格提交体与校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('MP-T-05 不填分时段价格 → 提交体不含 tier_prices（fallback 到 prices）', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-tier-t05',
      model: 'qa-tier-t05-model',
      base_model: 'qa-tier-t05-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    await mp.openCreateDrawer(page);
    // 仅填写默认价格（prices），不填分时段价格
    await mp.fillCreateForm(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.base_model,
      mode: combo.mode,
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: '0.000002',
    });
    await mp.expectTierPriceRowCount(page, 0);

    const body = await captureCreatePostBody(page, () => mp.clickSubmit(page));
    // 请求体不含 tier_prices（或为空），fallback 到 prices
    expect(body.tier_prices === undefined || body.tier_prices === null ||
      Object.keys(body.tier_prices).length === 0).toBe(true);
    expect(Object.keys(body.prices)).toContain(mp.PRICE_KEY_INPUT_COST);
    await mp.expectDrawerHidden(page);

    // 后端读回：记录无 tier_prices
    const record = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(record).not.toBeNull();
    expect(
      record.tier_prices == null || Object.keys(record.tier_prices).length === 0,
    ).toBe(true);
  });

  test('MP-T-06 分时段价格负数拦截，科学计数法合法', async ({ page }) => {
    const combo = {
      provider: 'qa-tier-t06',
      model: 'qa-tier-t06-model',
      base_model: 'qa-tier-t06-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.base_model,
      mode: combo.mode,
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: '0.000002',
    });
    await mp.addTierPriceRow(page);
    await mp.fillTierPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: '-0.5',
    });

    // 键名取自 prices 枚举（MP-T-06-2/3）：UI 以枚举下拉约束，选项均为合法枚举键
    const tierKeyOptions = await mp.getTierPriceKeyDropdownOptions(page);
    tierKeyOptions.forEach((option) => {
      expect(mp.PRICE_KEY_OPTIONS).toContain(option);
    });

    // 负数拦截：不发 POST/PUT，展示 tierValueInvalid，抽屉保持打开
    // （与 test_08 MP-V-12 的默认价格上限校验互补：此处覆盖 tier_prices 值校验）
    await mp.clickSubmitExpectNoModelPriceWrite(page);
    await mp.expectTierError(page, mp.MSG.tierValueInvalid);
    await mp.expectUpsertScopeVisible(page);

    // 科学计数法（如 1.5e-6）合法：改值后提交成功，读回数值等价
    // （test_08 MP-V-11 已覆盖 prices 科学计数法失焦格式化，此处覆盖 tier_prices）
    await mp.fillTierPriceRow(page, 0, { value: '1.5e-6' });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    const record = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(record).not.toBeNull();
    mp.expectNumericPriceEqual(
      record.tier_prices.peak[mp.PRICE_KEY_INPUT_COST],
      '1.5e-6',
    );
  });

  test('MP-T-07 提交体结构 tier_prices.peak：键名同 prices 枚举，剥离 id/时间戳/price_currency', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-tier-t07',
      model: 'qa-tier-t07-model',
      base_model: 'qa-tier-t07-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    await mp.openCreateDrawer(page);
    await mp.fillCreateForm(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.base_model,
      mode: combo.mode,
      priceKey: mp.PRICE_KEY_INPUT_COST,
      priceValue: '0.000002',
    });
    await mp.addPriceRow(page);
    await mp.fillPriceRow(page, 1, {
      key: mp.PRICE_KEY_OUTPUT_COST,
      value: '0.000008',
    });
    // 分时段价格 tier_prices.peak 各若干字段
    await mp.addTierPriceRow(page);
    await mp.fillTierPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_COST,
      value: '0.000004',
    });
    await mp.addTierPriceRow(page);
    await mp.fillTierPriceRow(page, 1, {
      key: mp.PRICE_KEY_OUTPUT_COST,
      value: '0.000016',
    });

    const body = await captureCreatePostBody(page, () => mp.clickSubmit(page));

    // 请求体结构：prices + tier_prices.peak（键为 tier name）
    expect(body.prices).toEqual({
      [mp.PRICE_KEY_INPUT_COST]: 0.000002,
      [mp.PRICE_KEY_OUTPUT_COST]: 0.000008,
    });
    expect(Object.keys(body.tier_prices.peak).sort()).toEqual(
      [mp.PRICE_KEY_INPUT_COST, mp.PRICE_KEY_OUTPUT_COST].sort(),
    );
    // tier_prices.peak 值对象键名与 prices 枚举一致
    Object.keys(body.tier_prices.peak).forEach((key) => {
      expect(mp.PRICE_KEY_OPTIONS).toContain(key);
    });
    mp.expectNumericPriceEqual(
      body.tier_prices.peak[mp.PRICE_KEY_INPUT_COST],
      '0.000004',
    );
    mp.expectNumericPriceEqual(
      body.tier_prices.peak[mp.PRICE_KEY_OUTPUT_COST],
      '0.000016',
    );
    // 请求体不含 price_currency（固定 RMB）、id、create_time / update_time
    ['id', 'create_time', 'update_time', 'price_currency'].forEach((field) => {
      expect(body).not.toHaveProperty(field);
    });
    await mp.expectDrawerHidden(page);
  });
});

test.describe('模型定价 - MP-T-08~09 详情展示与编辑回显', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('MP-T-08 详情页分时段价格分组展示，无 tier_prices 记录不展示空分组', async ({
    page,
  }) => {
    const comboWithTier = {
      provider: 'qa-tier-t08a',
      model: 'qa-tier-t08a-model',
      base_model: 'qa-tier-t08a-model',
      mode: 'chat',
    };
    const comboWithoutTier = {
      provider: 'qa-tier-t08b',
      model: 'qa-tier-t08b-model',
      base_model: 'qa-tier-t08b-model',
      mode: 'chat',
    };
    cleanup.trackCombo(
      comboWithTier.provider,
      comboWithTier.model,
      comboWithTier.mode,
    );
    cleanup.trackCombo(
      comboWithoutTier.provider,
      comboWithoutTier.model,
      comboWithoutTier.mode,
    );

    const prices = {
      [mp.PRICE_KEY_INPUT_COST]: 0.000002,
      [mp.PRICE_KEY_OUTPUT_COST]: 0.000008,
    };
    const tierPeak = {
      [mp.PRICE_KEY_INPUT_COST]: 0.000004,
      [mp.PRICE_KEY_OUTPUT_COST]: 0.000016,
    };
    const createdWithTier = await api.createModelPriceViaApi(page, {
      provider: comboWithTier.provider,
      model: comboWithTier.model,
      base_model: comboWithTier.base_model,
      mode: comboWithTier.mode,
      prices,
      tier_prices: { peak: tierPeak },
    });
    expect(createdWithTier).not.toBeNull();
    const createdWithoutTier = await api.createModelPriceViaApi(page, {
      provider: comboWithoutTier.provider,
      model: comboWithoutTier.model,
      base_model: comboWithoutTier.base_model,
      mode: comboWithoutTier.mode,
      prices,
    });
    expect(createdWithoutTier).not.toBeNull();
    await reloadToList(page);

    // 含 tier_prices.peak 的记录：详情展示默认价格 + 分时段价格「忙时（peak）」分组
    await mp.openViewDrawer(page, comboWithTier.provider);
    expectKvEntriesNumericallyEqual(
      await mp.viewKvEntries(page, mp.LABEL.priceObject),
      prices,
    );
    const groups = await mp.viewTierPriceGroups(page);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toContain('忙时（peak）');
    expectKvEntriesNumericallyEqual(groups[0].entries, tierPeak);

    // 无 tier_prices 的记录：仅展示默认价格，分时段价格区为「-」，不展示空分组
    await reloadToList(page);
    await mp.openViewDrawer(page, comboWithoutTier.provider);
    expectKvEntriesNumericallyEqual(
      await mp.viewKvEntries(page, mp.LABEL.priceObject),
      prices,
    );
    await mp.expectViewTierEmpty(page);
  });

  test('MP-T-09 编辑回显 tier_prices，改值保存后 GET 读回一致', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-tier-t09',
      model: 'qa-tier-t09-model',
      base_model: 'qa-tier-t09-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    const created = await api.createModelPriceViaApi(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.base_model,
      mode: combo.mode,
      prices: {
        [mp.PRICE_KEY_INPUT_COST]: 1.5e-6,
        [mp.PRICE_KEY_OUTPUT_COST]: 4.5e-6,
      },
      tier_prices: {
        peak: {
          [mp.PRICE_KEY_INPUT_COST]: 3e-6,
          [mp.PRICE_KEY_OUTPUT_COST]: 9e-6,
        },
      },
    });
    expect(created).not.toBeNull();
    await reloadToList(page);

    await mp.openEditDrawer(page, combo.provider);
    // 分时段价格块回填 tier_prices.peak 各字段（键 + 值，数值等价）
    const inputIndex = await mp.findTierPriceRowIndexByKey(
      page,
      mp.PRICE_KEY_INPUT_COST,
    );
    const inputRow = await mp.getTierPriceRowValues(page, inputIndex);
    mp.expectNumericPriceEqual(inputRow.value, '3e-6');
    const outputIndex = await mp.findTierPriceRowIndexByKey(
      page,
      mp.PRICE_KEY_OUTPUT_COST,
    );
    const outputRow = await mp.getTierPriceRowValues(page, outputIndex);
    mp.expectNumericPriceEqual(outputRow.value, '9e-6');
    // 默认价格块回填 prices
    const defaultInputIndex = await mp.findPriceRowIndexByKey(
      page,
      mp.PRICE_KEY_INPUT_COST,
    );
    const defaultRow = await mp.getPriceRowValues(page, defaultInputIndex);
    mp.expectNumericPriceEqual(defaultRow.value, '1.5e-6');

    // 修改分时段 input 价格并保存
    await mp.fillTierPriceRow(page, inputIndex, { value: '5e-6' });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    // GET 读回与提交一致；未修改的 tier 键（output）保留 —— tier_prices 键级合并，
    // 与 test_08 MP-C-05（prices 键级合并）互补
    const updated = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(updated).not.toBeNull();
    mp.expectNumericPriceEqual(
      updated.tier_prices.peak[mp.PRICE_KEY_INPUT_COST],
      '5e-6',
    );
    mp.expectNumericPriceEqual(
      updated.tier_prices.peak[mp.PRICE_KEY_OUTPUT_COST],
      '9e-6',
    );
    mp.expectNumericPriceEqual(
      updated.prices[mp.PRICE_KEY_INPUT_COST],
      '1.5e-6',
    );
    mp.expectNumericPriceEqual(
      updated.prices[mp.PRICE_KEY_OUTPUT_COST],
      '4.5e-6',
    );
  });
});

test.describe('模型定价 - MP-T-10 prices 键名枚举（10 个新增键）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('MP-T-10 默认/分时段价格键名下拉均含全部 10 个新增键，选择新键可提交回显', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-tier-t10',
      model: 'qa-tier-t10-model',
      base_model: 'qa-tier-t10-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    await mp.openCreateDrawer(page);
    // 默认价格块已有 1 行（fillCreateForm 添加），分时段价格块添加 1 行以便展开下拉
    await mp.fillCreateForm(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.base_model,
      mode: combo.mode,
      priceKey: mp.PRICE_KEY_CACHE_CREATION_1H,
      priceValue: '0.000001',
    });
    await mp.addTierPriceRow(page);

    // 默认价格 / 分时段价格键名下拉均包含全部 10 个新增键
    const defaultOptions = await mp.getPriceKeyDropdownOptions(page);
    const tierOptions = await mp.getTierPriceKeyDropdownOptions(page);
    mp.NEW_PRICE_KEYS.forEach((key) => {
      expect(defaultOptions).toContain(key);
      expect(tierOptions).toContain(key);
    });

    // 分时段块选择新增键 input_cost_per_audio_token 并填值
    await mp.fillTierPriceRow(page, 0, {
      key: mp.PRICE_KEY_INPUT_AUDIO,
      value: '0.000002',
    });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    // 提交/回显：默认价格含 cache_creation_input_token_cost_1h，tier_prices.peak 含新键
    const record = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(record).not.toBeNull();
    mp.expectNumericPriceEqual(
      record.prices[mp.PRICE_KEY_CACHE_CREATION_1H],
      '0.000001',
    );
    mp.expectNumericPriceEqual(
      record.tier_prices.peak[mp.PRICE_KEY_INPUT_AUDIO],
      '0.000002',
    );
  });
});
