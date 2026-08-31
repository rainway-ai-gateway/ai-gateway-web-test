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
 * 模型定价 - CRUD（MP-C-01/02/03/04）
 *
 * 覆盖用例（P0 + P1）：
 * - MP-C-01 创建模型定价成功
 * - MP-C-02 编辑模型定价成功
 * - MP-C-03 删除模型定价（确认）
 * - MP-C-04 删除模型定价（取消）
 *
 * 已知 UI 缺陷（作为断言基准）：
 * 1. 编辑模式下 (provider, model, mode) 未变更时直接 doSubmit（PUT），
 *    不经过唯一性校验 → MP-C-02 可通过 UI 完成。
 *    创建时的唯一性校验已修复：正确判断组合查询结果（data.id / list.length），
 *    合法新组合可正常创建成功。
 *
 * 文案偏差（docs/model-prices/02-功能测试用例/ 参考文案 vs 实际 UI i18n）：
 * - design/02 期望「创建成功/修改成功/删除成功」，UI 统一使用「提交成功!」「删除成功」。
 *   当前断言以 UI 实际文案为准（产品已确认：文案以实际 UI 一致即可）。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/model-prices/test_02_model_price_crud.spec.js
 */
const { test, expect } = require('@playwright/test');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');

function comboPayload(provider, model, price) {
  return {
    provider,
    model,
    base_model: model,
    mode: 'chat',
    prices: { input_cost_per_token: price || 0.00001 },
  };
}

async function reloadToList(page) {
  await page.reload();
  await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(500);
}

test.describe('模型定价 - MP-C-01 创建模型定价', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('填写合法唯一组合后提交创建成功，接口产生记录', async ({ page }) => {
    const combo = {
      provider: 'qa-crud-create',
      model: 'qa-crud-create-model',
      base_model: 'qa-crud-create-model',
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
      priceValue: 0.00003,
    });

    // 表单必填项全部合法 → 提交成功，抽屉关闭
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    // 接口侧已产生记录，价格正确
    const record = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(record).not.toBeNull();
    expect(record.prices.input_cost_per_token).toBe(0.00003);
  });
});

test.describe('模型定价 - MP-C-02 编辑模型定价成功', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('API 预置组合 → UI 编辑价格 → 提交成功且接口同步更新', async ({
    page,
  }) => {
    const combo = {
      provider: 'qa-crud-edit',
      model: 'qa-crud-edit-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    const created = await api.createModelPriceViaApi(
      page,
      comboPayload(combo.provider, combo.model, 0.00001),
    );
    expect(created).not.toBeNull();
    await reloadToList(page);

    // 打开编辑抽屉，断言回显
    await mp.openEditDrawer(page, combo.provider);
    expect(await mp.getProviderValue(page)).toBe(combo.provider);
    expect(await mp.getModelValue(page)).toBe(combo.model);
    expect(await mp.getBaseModelValue(page)).toBe(combo.model);
    await mp.expectModeSelected(page, combo.mode);

    // 修改价格后提交（编辑模式组合未变更 → 直接 PUT）
    await mp.fillPriceRow(page, 0, { value: 0.00005 });
    await mp.submitUpsertAndWait(page);
    await mp.expectDrawerHidden(page);

    // 接口验证更新结果
    const updated = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(updated).not.toBeNull();
    expect(updated.prices.input_cost_per_token).toBe(0.00005);
  });
});

test.describe('模型定价 - MP-C-03 删除模型定价（确认）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('删除确认后记录从列表消失且接口已删除', async ({ page }) => {
    const combo = {
      provider: 'qa-crud-del',
      model: 'qa-crud-del-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    const created = await api.createModelPriceViaApi(
      page,
      comboPayload(combo.provider, combo.model, 0.00001),
    );
    expect(created).not.toBeNull();
    await reloadToList(page);

    // 点击删除 → 二次确认弹窗 → 确定
    await mp.clickRowAction(page, combo.provider, '删除');
    await mp.expectDeleteConfirm(page, combo.model);
    await mp.confirmDeleteAndWait(page);

    await mp.modelPriceTable(page).expectRowHidden(combo.provider);
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        combo.provider,
        combo.model,
        combo.mode,
      ),
    ).toBeNull();
  });
});

test.describe('模型定价 - MP-C-04 删除模型定价（取消）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('删除确认弹窗点取消，记录保留且接口数据未变化', async ({ page }) => {
    const combo = {
      provider: 'qa-crud-cancel',
      model: 'qa-crud-cancel-model',
      mode: 'chat',
    };
    cleanup.trackCombo(combo.provider, combo.model, combo.mode);

    const created = await api.createModelPriceViaApi(
      page,
      comboPayload(combo.provider, combo.model, 0.00002),
    );
    expect(created).not.toBeNull();
    await reloadToList(page);

    await mp.clickRowAction(page, combo.provider, '删除');
    await mp.expectDeleteConfirm(page, combo.model);
    await mp.clickDeleteConfirmCancel(page);

    await mp.modelPriceTable(page).expectRowVisible(combo.provider);
    const stillExists = await api.findModelPriceByComboViaApi(
      page,
      combo.provider,
      combo.model,
      combo.mode,
    );
    expect(stillExists).not.toBeNull();
    expect(stillExists.prices.input_cost_per_token).toBe(0.00002);
  });
});
