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
 * 模型定价 - YAML 导入（MP-I-02/03/05/06，P0）
 *
 * 覆盖用例：
 * - MP-I-01 YAML 解析预览（按实际 UI 适配：无解析预览按钮，仅文件名展示）
 * - MP-I-02 YAML 校验失败提示（7 个子场景）
 * - MP-I-03 YAML 批量导入成功（replace 模式）
 * - MP-I-04 YAML 导入取消 / 关闭
 * - MP-I-05 merge 模式导入（增量合并）
 * - MP-I-06 重复记录导入处理（replace / merge 差异）
 *
 * 错误链路说明（决定断言文案）：
 * - 前端拦截（validateYaml / beforeUpload）：
 *   · invalid-syntax.yaml      → 「YAML 解析失败」+ js-yaml 错误信息
 *   · usd-currency.yaml        → 「default_currency 必须为 RMB」
 *   · not-yaml.txt             → 「请选择 YAML 文件」（扩展名校验，不进入上传）
 * - 后端 422（iView Upload on-error → 通用「导入失败」）：
 *   · missing-mode.yaml / empty-prices.yaml / duplicate-combo.yaml / invalid-version.yaml
 *
 * 基线恢复：replace 模式会清空整表，afterEach 统一用 model-list.yaml 以
 * replace 模式重新导入以恢复 deepseek/openai 基线数据。
 *
 * 文案偏差（docs/model-prices/02-功能测试用例/ 参考文案 vs 实际 UI i18n）：
 * - design/02 期望「导入成功，共导入 2 条」，UI 实际为「导入成功」。
 *   当前断言以 UI 实际文案为准（产品已确认：文案以实际 UI 一致即可）。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/model-prices/test_05_model_price_import.spec.js
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');

const DATA_DIR = path.join(__dirname, '../../test-files/model-prices');
const filePath = (name) => path.join(DATA_DIR, name);
const MODEL_LIST_YAML = fs.readFileSync(filePath('model-list.yaml'), 'utf8');

async function reloadToList(page) {
  await page.reload();
  await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(500);
}

test.describe('模型定价 - MP-I-02 YAML 校验失败提示', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
    await mp.openImportModal(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('子用例 1：YAML 语法错误（前端解析失败）', async ({ page }) => {
    await mp.uploadImportFile(page, filePath('invalid-syntax.yaml'));
    await mp.clickImportButton(page);
    await mp.expectMessage(page, mp.MSG.parseYamlFailed);
    await mp.expectImportScopeVisible(page);
  });

  test('子用例 2：缺少 mode 字段（后端 422）', async ({ page }) => {
    await mp.uploadImportFile(page, filePath('missing-mode.yaml'));
    await mp.clickImportButton(page);
    await mp.expectMessage(page, mp.MSG.importFailed);
    await mp.expectImportScopeVisible(page);
  });

  test('子用例 3：prices 为空对象（后端 422）', async ({ page }) => {
    await mp.uploadImportFile(page, filePath('empty-prices.yaml'));
    await mp.clickImportButton(page);
    await mp.expectMessage(page, mp.MSG.importFailed);
    await mp.expectImportScopeVisible(page);
  });

  test('子用例 4：文件内 (provider, model, mode) 重复（后端 422）', async ({
    page,
  }) => {
    await mp.uploadImportFile(page, filePath('duplicate-combo.yaml'));
    await mp.clickImportButton(page);
    await mp.expectMessage(page, mp.MSG.importFailed);
    await mp.expectImportScopeVisible(page);
  });

  test('子用例 5：default_currency 非 RMB（前端拦截）', async ({ page }) => {
    await mp.uploadImportFile(page, filePath('usd-currency.yaml'));
    await mp.clickImportButton(page);
    await mp.expectMessage(page, mp.MSG.currencyMustBeRMB);
    await mp.expectImportScopeVisible(page);
  });

  test('子用例 6：version 非法（后端 422）', async ({ page }) => {
    await mp.uploadImportFile(page, filePath('invalid-version.yaml'));
    await mp.clickImportButton(page);
    await mp.expectMessage(page, mp.MSG.importFailed);
    await mp.expectImportScopeVisible(page);
  });

  test('子用例 7：非 YAML 扩展名文件（前端拦截，不显示文件名）', async ({
    page,
  }) => {
    await mp.uploadImportFile(page, filePath('not-yaml.txt'));
    await mp.expectMessage(page, mp.MSG.yamlFileRequired);
    // 文件未被选中 → 不显示文件名
    await expect(mp.importScope(page).locator('.file-name')).toHaveCount(0);
    await mp.expectImportScopeVisible(page);
  });
});

test.describe('模型定价 - MP-I-03 YAML 批量导入成功（replace 模式）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    // 先把表重置为基线，保证开始时环境干净
    await api.resetModelPricesToBaseline(page);
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    // replace 清空了整表 → 恢复基线（deepseek/openai）
    await api.resetModelPricesToBaseline(page);
    await cleanup.cleanup(page);
  });

  test('replace 导入 valid-import.yaml 后列表仅剩 3 条新记录', async ({
    page,
  }) => {
    // 预置一条临时记录，验证 replace 会清空
    await api.createModelPriceViaApi(page, {
      provider: 'qa-replace-temp',
      model: 'qa-replace-temp-model',
      base_model: 'qa-replace-temp-model',
      mode: 'chat',
      prices: { input_cost_per_token: 0.000009 },
    });
    cleanup.trackCombo('qa-replace-temp', 'qa-replace-temp-model', 'chat');
    await reloadToList(page);

    await mp.openImportModal(page);
    await mp.selectImportMode(page, '全量替换');
    await mp.uploadImportFile(page, filePath('valid-import.yaml'));
    await mp.submitImportAndWait(page);
    await mp.expectImportModalHidden(page);
    await reloadToList(page);

    // replace 清空整表后写入 3 条 qa-import-*
    await mp.modelPriceTable(page).expectRowVisible('qa-import-1');
    await mp.modelPriceTable(page).expectRowVisible('qa-import-2');
    await mp.modelPriceTable(page).expectRowVisible('qa-import-3');
    await mp.modelPriceTable(page).expectRowHidden('qa-replace-temp');
    const { total } = await api.fetchModelPricesViaApi(page);
    expect(total).toBe(3);
  });
});

test.describe('模型定价 - MP-I-05 merge 模式导入（增量合并）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    // 先把表重置为基线，保证开始时只有 deepseek/openai
    await api.resetModelPricesToBaseline(page);
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    // 恢复基线，避免污染后续用例
    await api.resetModelPricesToBaseline(page);
    await cleanup.cleanup(page);
  });

  test('merge 导入更新已有组合并新增记录，基线保留', async ({ page }) => {
    // 预置 qa-import-1（价格与 YAML 中不同，验证被更新）
    await api.createModelPriceViaApi(page, {
      provider: 'qa-import-1',
      model: 'qa-import-1-model',
      base_model: 'qa-import-1-model',
      mode: 'chat',
      prices: { input_cost_per_token: 0.000009 },
    });
    cleanup.trackCombo('qa-import-1', 'qa-import-1-model', 'chat');
    cleanup.trackCombo('qa-import-2', 'qa-import-2-model', 'completion');
    cleanup.trackCombo('qa-import-3', 'qa-import-3-model', 'embedding');

    // 基线 2 条 + 预置的 qa-import-1 = 3 条
    const beforeTotal = 3;

    await mp.openImportModal(page);
    await mp.selectImportMode(page, '增量合并');
    await mp.uploadImportFile(page, filePath('valid-import.yaml'));
    await mp.submitImportAndWait(page);
    await mp.expectImportModalHidden(page);

    // qa-import-1 被覆盖更新为 YAML 新值 0.000001
    const updated = await api.findModelPriceByComboViaApi(
      page,
      'qa-import-1',
      'qa-import-1-model',
      'chat',
    );
    expect(updated).not.toBeNull();
    expect(updated.prices.input_cost_per_token).toBe(0.000001);

    // qa-import-2/3 新增，基线保留
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        'qa-import-2',
        'qa-import-2-model',
        'completion',
      ),
    ).not.toBeNull();
    expect(
      await api.findModelPriceByComboViaApi(
        page,
        'qa-import-3',
        'qa-import-3-model',
        'embedding',
      ),
    ).not.toBeNull();
    const { total } = await api.fetchModelPricesViaApi(page);
    // valid-import.yaml 共 3 条，其中 qa-import-1 已存在（merge 更新），实际新增 2 条
    expect(total).toBe(beforeTotal + 2);
  });
});

test.describe('模型定价 - MP-I-06 重复记录导入处理', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    // 先把表重置为基线，保证开始时环境干净
    await api.resetModelPricesToBaseline(page);
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await api.resetModelPricesToBaseline(page);
    await cleanup.cleanup(page);
  });

  test('merge 覆盖更新已有组合；replace 清空后仅剩新记录', async ({ page }) => {
    // 预置 qa-rep（merge 验证对象）
    await api.createModelPriceViaApi(page, {
      provider: 'qa-rep',
      model: 'qa-rep-model',
      base_model: 'qa-rep-model',
      mode: 'chat',
      prices: { input_cost_per_token: 0.000009 },
    });
    cleanup.trackCombo('qa-rep', 'qa-rep-model', 'chat');

    // 步骤 A：merge 导入相同组合 → 覆盖更新
    await mp.openImportModal(page);
    await mp.selectImportMode(page, '增量合并');
    await mp.uploadImportFile(page, filePath('repeat-merge.yaml'));
    await mp.submitImportAndWait(page);
    await mp.expectImportModalHidden(page);

    const merged = await api.findModelPriceByComboViaApi(
      page,
      'qa-rep',
      'qa-rep-model',
      'chat',
    );
    expect(merged).not.toBeNull();
    expect(merged.prices.input_cost_per_token).toBe(0.00005);

    // 步骤 B：replace 导入 1 条新记录 → 整表清空，仅剩该记录
    await mp.openImportModal(page);
    await mp.selectImportMode(page, '全量替换');
    await mp.uploadImportFile(page, filePath('replace-only.yaml'));
    await mp.submitImportAndWait(page);
    await mp.expectImportModalHidden(page);

    const { list, total } = await api.fetchModelPricesViaApi(page);
    expect(total).toBe(1);
    expect(list[0].provider).toBe('qa-rep-only');
    expect(list[0].prices.input_cost_per_token).toBe(0.00001);
  });
});

test.describe('模型定价 - MP-I-01 YAML 解析预览（按实际 UI 适配）', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
    await mp.openImportModal(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('选择合法 YAML 后展示文件名、无解析错误，未提交前无预览结果区', async ({
    page,
  }) => {
    // 偏离说明：docs 期望「解析预览」展示记录列表/总条数/默认货币/版本号，
    // 但当前 UI（ModelPriceImport.vue）未实现解析预览按钮与记录预览区，
    // 实际行为仅为选中文件后展示文件名，解析校验延后到点击「导入」时执行。
    // 此处按实际 UI 行为断言，偏离已记录待产品确认。
    await mp.uploadImportFile(page, filePath('valid-import.yaml'));
    await mp.expectSelectedFileName(page, 'valid-import.yaml');
    await expect(page.locator('.ivu-message-error')).toHaveCount(0);
    // 未提交前不展示导入结果区
    await expect(mp.importScope(page).locator('.result-section')).toHaveCount(
      0,
    );
    await mp.expectImportScopeVisible(page);
  });

  test('合法 YAML（model-list.yaml）解析校验通过，点击导入提交成功', async ({
    page,
  }) => {
    await mp.uploadImportFile(page, filePath('model-list.yaml'));
    await mp.expectSelectedFileName(page, 'model-list.yaml');
    await expect(page.locator('.ivu-message-error')).toHaveCount(0);
    // 点击「导入」走完前端 validateYaml（解析 + version + default_currency）→
    // 证明该 YAML 可被成功解析；model-list.yaml 即基线数据，replace 后无数据污染
    await mp.submitImportAndWait(page);
    await mp.expectImportModalHidden(page);
  });
});

test.describe('模型定价 - MP-I-04 YAML 导入取消 / 关闭', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('点击「取消」关闭弹窗，不调用导入接口且列表数据不变', async ({
    page,
  }) => {
    let importRequested = false;
    page.on('request', (req) => {
      if (req.url().includes('/model-prices/import')) importRequested = true;
    });
    const before = await api.fetchModelPricesViaApi(page);

    await mp.openImportModal(page);
    await mp.uploadImportFile(page, filePath('valid-import.yaml'));
    await mp.expectSelectedFileName(page, 'valid-import.yaml');
    await mp.clickImportCancel(page);

    await expect(mp.importScope(page)).toBeHidden({ timeout: 10000 });
    expect(importRequested).toBe(false);
    const after = await api.fetchModelPricesViaApi(page);
    expect(after.total).toBe(before.total);
  });

  test('点击右上角关闭按钮关闭弹窗，重开时文件输入已清空', async ({ page }) => {
    let importRequested = false;
    page.on('request', (req) => {
      if (req.url().includes('/model-prices/import')) importRequested = true;
    });

    await mp.openImportModal(page);
    await mp.uploadImportFile(page, filePath('valid-import.yaml'));
    await mp.expectSelectedFileName(page, 'valid-import.yaml');
    await mp.clickImportCloseIcon(page);

    await expect(mp.importScope(page)).toBeHidden({ timeout: 10000 });
    expect(importRequested).toBe(false);

    // 弹窗组件 v-if="importVisible" → 重开时重新创建，所选文件已清空
    await mp.openImportModal(page);
    await expect(mp.importScope(page).locator('.file-name')).toHaveCount(0);
  });
});
