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
 * - 价格列渲染格式为 `¥{value}`（value 为后端 JSON 数字字符串，如 5e-7）。
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

// 与 ModelPriceView.formatPrice 一致：科学计数法转为小数（如 5e-7 → 0.0000005）
function formatPriceLikeUi(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  if (num === 0) return '0';
  let str = num.toString();
  if (/[eE]/.test(str)) {
    str = num.toFixed(20).replace(/\.?0+$/, '');
  }
  return str;
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

    // prices kv 表（UI 前缀 ¥，value 经 formatPrice 处理：科学计数法转小数）
    const priceEntries = await mp.viewKvEntries(page, mp.LABEL.prices);
    expect(kvToMap(priceEntries)).toEqual(
      kvToMap(
        Object.keys(record.prices || {}).map((key) => ({
          key,
          value: '¥' + formatPriceLikeUi(record.prices[key]),
        })),
      ),
    );

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
