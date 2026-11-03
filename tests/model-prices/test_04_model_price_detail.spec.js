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
 * 模型定价 - 详情页全字段与接口数据一致性（MP-D-01，P0）
 *
 * 覆盖用例：
 * - MP-D-01 详情页全字段与接口数据一致性
 *
 * 断言策略：
 * - 通过 API 读取 deepseek/deepseek-v3/chat 记录的原始数据，逐字段与
 *   详情抽屉（ModelPriceView）渲染结果比对，避免硬编码受浮点序列化影响的期望值。
 * - 价格列前缀 ¥；与接口值做数值等价比对（允许科学计数法与十进制两种写法）。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/model-prices/test_04_model_price_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');

const COMBO = { provider: 'deepseek', model: 'deepseek-v3', mode: 'chat' };

function formatKv(record, keyField) {
  const obj = record[keyField] || {};
  return Object.keys(obj).map((key) => ({
    key,
    value: String(obj[key]),
  }));
}

// 后端 prices/limits 为 Go map，JSON 键序不确定 → 转成 {key: value} 对象比较（顺序无关）
function kvToMap(entries) {
  const map = {};
  entries.forEach((e) => {
    map[e.key] = e.value;
  });
  return map;
}

test.describe('模型定价 - MP-D-01 详情页全字段与接口数据一致性', () => {
  test('deepseek/deepseek-v3 详情各卡片字段与接口数据一致', async ({
    page,
  }) => {
    await mp.gotoModelPricePage(page);

    // 接口基准数据
    const record = await api.findModelPriceByComboViaApi(
      page,
      COMBO.provider,
      COMBO.model,
      COMBO.mode,
    );
    expect(record).not.toBeNull();

    // 打开详情抽屉
    await mp.openViewDrawer(page, COMBO.provider);

    // 基本信息卡片
    expect(
      await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.provider),
    ).toBe(record.provider);
    expect(
      await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.model),
    ).toBe(record.model);
    expect(
      await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.baseModel),
    ).toBe(record.base_model);
    expect(
      await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.mode),
    ).toBe(record.mode);

    // capabilities / supported_parameters 标签
    expect(await mp.viewTags(page, mp.LABEL.capabilities)).toEqual(
      record.capabilities || [],
    );
    expect(await mp.viewTags(page, mp.LABEL.supportedParameters)).toEqual(
      record.supported_parameters || [],
    );

    // limits kv 表（键序不确定 → map 比较）
    expect(kvToMap(await mp.viewKvEntries(page, mp.LABEL.limits))).toEqual(
      kvToMap(formatKv(record, 'limits')),
    );

    // prices kv 表：数值等价（允许 1.5e-6 与 0.0000015），不要按十进制字符串逐字比
    await mp.expectViewPricesNumericallyEqual(page, record.prices);

    // metadata
    const metadata = record.metadata || {};
    expect(
      await mp.viewInfoValue(page, mp.LABEL.metadata, mp.LABEL.source),
    ).toBe(metadata.source || '-');
    expect(
      await mp.viewInfoValue(page, mp.LABEL.metadata, mp.LABEL.notes),
    ).toBe(metadata.notes || '-');

    // timestamps：非空且为本地化时间（含当前年份）
    const createdAt = await mp.viewInfoValue(
      page,
      mp.LABEL.timestamps,
      mp.LABEL.createdAt,
    );
    const updatedAt = await mp.viewInfoValue(
      page,
      mp.LABEL.timestamps,
      mp.LABEL.updatedAt,
    );
    expect(createdAt).not.toBe('-');
    expect(updatedAt).not.toBe('-');
    expect(createdAt).toContain(String(new Date().getFullYear()));
  });
});

/**
 * 模型定价 - MP-D-02 详情页极小价格按量级展示
 *
 * 2026-10-30 补齐（覆盖缺口清单 #30：映射表声称 test_04 覆盖 MP-D-01~02，实际只有 MP-D-01）。
 * 断言极小价格（7.6234102728e-08）不被截成 0、不拉成超长十进制，且与接口数值相等。
 */
test.describe('模型定价 - MP-D-02 详情页极小价格按量级展示', () => {
  const TINY_PRICE = 7.6234102728e-11; // 2026-11-03 单位口径：×1e6 = 7.6e-5 < 1e-4，展示走科学计数法
  const provider = 'qa_tiny_' + Date.now();
  const model = 'qa-tiny-model';
  let createdId;

  test.beforeEach(async ({ page }) => {
    await mp.gotoModelPricePage(page);
    const created = await api.createModelPriceViaApi(page, {
      provider,
      model,
      base_model: model,
      mode: 'chat',
      prices: { output_cost_per_token: TINY_PRICE },
    });
    expect(created, 'API 造数极小价格记录应成功').not.toBeNull();
    createdId = created.id;
  });

  test.afterEach(async ({ page }) => {
    if (createdId) {
      await api.deleteModelPriceViaApi(page, createdId);
      createdId = null;
    }
  });

  test('极小价格按科学计数法展示且与接口数值相等', async ({ page }) => {
    await mp.gotoModelPricePage(page);
    await mp.openViewDrawer(page, provider);

    const entries = await mp.viewKvEntries(page, mp.LABEL.prices);
    const entry = entries.find((e) => e.key === 'output_cost_per_token');
    expect(entry, '详情价格表应含 output_cost_per_token').toBeTruthy();

    // 2026-11-03 单位口径：token 计价项展示为「¥<百万单位> / 百万tokens」，取打头数值
    const cell = String(entry.value).trim();
    const m = cell.match(/^[¥]?\s*([\d.eE+-]+)/);
    expect(m, '详情价格单元格应含数值').toBeTruthy();
    const text = m[1];
    // 1. 不得被截成 0，也不得拉成超长十进制（toFixed(20) 类）
    expect(text, '不应被截成 0').not.toMatch(/^0(\.0*)?$/);
    expect(text.length, '不应是超长十进制').toBeLessThan(24);
    // 2. 与接口数值等价：展示为「元/百万 tokens」= 存储值 ×1e6（相对误差 1e-6 内）
    expect(Number(text) / (TINY_PRICE * 1e6)).toBeCloseTo(1, 6);
    // 3. 量级展示：科学计数法（文档预期 1）
    expect(text, '极小价格应以科学计数法展示').toMatch(/e/i);
  });
});
