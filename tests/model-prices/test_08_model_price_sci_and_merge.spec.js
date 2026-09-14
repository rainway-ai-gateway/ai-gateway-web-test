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
 * 模型定价 - 价格精度与 PUT 键级合并（MP-V-11 / MP-V-12 / MP-C-05）
 *
 * 覆盖用例（P0 标杆）：
 * - MP-V-11 prices 科学计数法与失焦格式化
 * - MP-V-12 prices 上限校验（价格 × 1e8 < 2^53）
 * - MP-C-05 编辑模型定价-prices 键级合并
 *
 * 验收来源：docs/model-prices/02-功能测试用例/07-变更回归-价格精度与键级合并.md
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/model-prices/test_08_model_price_sci_and_merge.spec.js
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

test.describe('模型定价 - MP-V-11 prices 科学计数法与失焦格式化', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('科学计数法与十进制失焦格式化后可提交，读回数值等价', async ({
    page,
  }) => {
    const comboSci = {
      provider: 'qa-sci-v11',
      model: 'qa-sci-v11-model',
      base_model: 'qa-sci-v11-model',
      mode: 'chat',
    };
    const comboDec = {
      provider: 'qa-sci-v11-dec',
      model: 'qa-sci-v11-dec-model',
      base_model: 'qa-sci-v11-dec-model',
      mode: 'chat',
    };
    cleanup.trackCombo(comboSci.provider, comboSci.model, comboSci.mode);
    cleanup.trackCombo(comboDec.provider, comboDec.model, comboDec.mode);

    await test.step('1.5e-6 失焦后仍为科学计数法', async () => {
      await mp.openCreateDrawer(page);
      await mp.fillCreateForm(page, {
        provider: comboSci.provider,
        model: comboSci.model,
        base_model: comboSci.base_model,
        mode: comboSci.mode,
        priceKey: mp.PRICE_KEY_INPUT_COST,
        priceValue: '1.5e-6',
      });
      await mp.expectPriceRowInputValue(page, 0, '1.5e-6');
    });

    await test.step('0.0000015 失焦后格式化为 1.5e-6', async () => {
      await mp.fillPriceRow(page, 0, { value: '0.0000015' });
      await mp.expectPriceRowInputValue(page, 0, '1.5e-6');
    });

    await test.step('7.6234102728e-08 不被截断，提交后读回数值等价', async () => {
      await mp.fillPriceRow(page, 0, { value: '7.6234102728e-08' });
      const row = await mp.getPriceRowValues(page, 0);
      expect(row.value.toLowerCase()).toContain('e-');
      mp.expectNumericPriceEqual(row.value, '7.6234102728e-08');
      expect(row.value).not.toBe('0');

      await mp.submitUpsertAndWait(page);
      await mp.expectDrawerHidden(page);
      const record = await api.findModelPriceByComboViaApi(
        page,
        comboSci.provider,
        comboSci.model,
        comboSci.mode,
      );
      expect(record).not.toBeNull();
      mp.expectNumericPriceEqual(
        record.prices.input_cost_per_token,
        '7.6234102728e-08',
      );
    });

    await test.step('0.04 失焦后仍为十进制并可提交', async () => {
      await mp.openCreateDrawer(page);
      await mp.fillCreateForm(page, {
        provider: comboDec.provider,
        model: comboDec.model,
        base_model: comboDec.base_model,
        mode: comboDec.mode,
        priceKey: mp.PRICE_KEY_INPUT_COST,
        priceValue: '0.04',
      });
      await mp.expectPriceRowInputValue(page, 0, '0.04');
      await mp.submitUpsertAndWait(page);
      await mp.expectDrawerHidden(page);
      const record = await api.findModelPriceByComboViaApi(
        page,
        comboDec.provider,
        comboDec.model,
        comboDec.mode,
      );
      expect(record).not.toBeNull();
      mp.expectNumericPriceEqual(record.prices.input_cost_per_token, '0.04');
    });
  });
});

test.describe('模型定价 - MP-V-12 prices 上限校验', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('过大价格前端拦截，改为合法小值后可提交', async ({ page }) => {
    const combo = {
      provider: 'qa-sci-v12',
      model: 'qa-sci-v12-model',
      base_model: 'qa-sci-v12-model',
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
      priceValue: '1e8',
    });

    await test.step('价格 × 1e8 ≥ 2^53 时拦截且不发 POST', async () => {
      await mp.clickSubmitExpectNoModelPriceWrite(page);
      await mp.expectPricesError(page, mp.MSG.pricesOverflow);
      await mp.expectUpsertScopeVisible(page);
    });

    await test.step('改为 1.5e-6 后提交成功', async () => {
      await mp.fillPriceRow(page, 0, { value: '1.5e-6' });
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
        record.prices.input_cost_per_token,
        '1.5e-6',
      );
    });
  });
});

test.describe('模型定价 - MP-C-05 编辑模型定价-prices 键级合并', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('只改 input 价后提交，output 键仍保留', async ({ page }) => {
    const combo = {
      provider: 'qa-sci-c05',
      model: 'qa-sci-c05-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    const created = await api.createModelPriceViaApi(page, {
      provider: combo.provider,
      model: combo.model,
      base_model: combo.model,
      mode: combo.mode,
      prices: {
        input_cost_per_token: 1.5e-6,
        output_cost_per_token: 4.5e-6,
      },
    });
    expect(created).not.toBeNull();
    await reloadToList(page);

    await mp.openEditDrawer(page, combo.provider);
    const inputIndex = await mp.findPriceRowIndexByKey(
      page,
      mp.PRICE_KEY_INPUT_COST,
    );
    await mp.fillPriceRow(page, inputIndex, { value: '3.1e-6' });

    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    const updated = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(updated).not.toBeNull();
    mp.expectNumericPriceEqual(updated.prices.input_cost_per_token, '3.1e-6');
    mp.expectNumericPriceEqual(updated.prices.output_cost_per_token, '4.5e-6');

    await mp.openViewDrawer(page, combo.provider);
    await mp.expectViewPricesNumericallyEqual(page, {
      input_cost_per_token: 3.1e-6,
      output_cost_per_token: 4.5e-6,
    });
  });
});
