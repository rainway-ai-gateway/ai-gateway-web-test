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
 * 模型服务商 - 分段计价配置（PR-T-01~PR-T-10）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/04-分段计价配置.md）：
 * - PR-T-01：打开分段计价 Drawer 结构（标题/只读服务商名/时区文本输入/忙时 Tag/时间段表格）
 * - PR-T-02：时区 IANA 校验（合法 Asia/Shanghai、America/New_York 可提交；
 *   abc/123 与留空被拦截提示「时区须为合法 IANA 时区名」「请填写时区」）
 * - PR-T-03：适用时段 Checkbox 语义（默认工作日 5 勾选；勾选周六/周日全选 7 天提交
 *   weekdays=[]；全部取消提交 weekdays=[]）
 * - PR-T-04：快捷链接 全选/工作日/周末 → PUT body weekdays 语义（[]/[1,2,3,4,5]/[0,6]）
 * - PR-T-05：时间段添加/删除（多行增删；仅剩一行删除按钮禁用）
 * - PR-T-06：时间格式校验（end<=start 提交拦截提示；非法 HH:MM 受原生 type=time 限制）
 * - PR-T-07：同 tier 时间段重叠校验（重叠拦截提示，改不重叠可提交）
 * - PR-T-08：提交 PUT pricing-tiers 请求体结构（既有用例）
 * - PR-T-09：编辑回填与提交后 GET /providers/{name} 读回 tiers 一致
 * - PR-T-10：取消不保存，Drawer 关闭且服务商数据不变
 *
 * 文档偏差记录（docs/providers/02 验收优先，已保留 02 预期断言）：
 * 1. PR-T-01 预期「忙时 Tag + peak 代码」：当前 UI（ProviderPricingTiers.vue）仅渲染
 *    「忙时」Tag（.ivu-tag-warning），无独立 peak 代码元素（.tier-code 样式未在模板使用），
 *    spec 仅断言「忙时」Tag 文本。
 * 2. PR-T-05 预期「空表提交被拦截」：UI 至少保留 1 个时间段（timeRanges.length<=1 时
 *    删除按钮 disabled），空表状态不可达，该分支无法经 UI 复现。
 * 3. PR-T-06 预期「小时/分钟越界提示『…时间无效』」：start/end 为原生 type=time input，
 *    Playwright fill 对非法时间值（25:00/12:60）直接抛 Malformed value，非法值无法经 UI
 *    输入，组件「时间无效」分支不可复现；空值（非 HH:MM 格式）可复现「须为 HH:MM 格式」提示。
 * 4. PR-T-03 全部取消的 UI 语义：逐个取消到 0 时 weekdays=[]（表示每天），
 *    getWeekdaySelection([]) 在 Drawer 内渲染为 7 天全选，因此全部取消后提交 weekdays=[]，
 *    与「全选 7 天提交 weekdays=[]」的 PUT 语义一致（spec 以 PUT body 为准断言）。
 *
 * 运行：npx playwright test tests/providers/test_04_provider_pricing_tiers.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');

const ROW0 = {
  weekdays: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '12:00',
};
const ROW1 = {
  weekdays: [1, 2, 3, 4, 5],
  start: '14:00',
  end: '18:00',
};

// 公共造数：创建未配置分段计价的服务商并进入列表页（命名前缀 provider_，afterEach 清理）
async function setupProvider({ page }) {
  const cleanup = api.createProviderTestCleanup();
  const providerName = 'provider_' + Date.now().toString(36);
  const data = await api.createProviderViaApi(page, {
    name: providerName,
    description: '自动化测试-分段计价',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [],
    keys: [{ name: 'key-primary', key: 'sk-test' }],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data).not.toBeNull();
  cleanup.trackName(providerName);
  await pp.gotoProvidersPage(page);
  await pp.providerTable(page).expectRowVisible(providerName);
  return { cleanup, providerName };
}

test.describe('模型服务商 - PR-T-01 打开分段计价 Drawer', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('Drawer 标题固定、只读服务商名、时区文本输入、忙时 Tag、时间段表格齐全', async ({
    page,
  }) => {
    // 1. 打开独立 Drawer（openPricingTiersDrawer 内断言标题「分段计价配置」）
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.expectPricingTiersScopeVisible(page);

    // 2. 顶部展示只读服务商名（span 展示，无输入框）
    const nameItem = pp
      .pricingTiersScope(page)
      .locator('.ivu-form-item')
      .filter({ hasText: '服务商名称' })
      .first();
    await expect(nameItem.locator('span.provider-name')).toHaveText(
      providerName,
    );
    await expect(nameItem.locator('input')).toHaveCount(0);

    // 3. 时区为文本输入框（非下拉），占位如 Asia/Shanghai，默认值 Asia/Shanghai
    const tzItem = pp
      .pricingTiersScope(page)
      .locator('.ivu-form-item')
      .filter({ hasText: '时区' })
      .first();
    const tzInput = tzItem.locator('input:not([type="hidden"])').first();
    await expect(tzInput).toBeVisible({ timeout: 10000 });
    await expect(tzInput).toHaveAttribute('placeholder', '如 Asia/Shanghai');
    await expect(tzItem.locator('select')).toHaveCount(0);
    expect(await pp.getTimeZoneValue(page)).toBe(pp.DOC.defaultTimeZone);

    // 4. 计价时段：只读「忙时」Tag（peak 代码独立元素见文件头偏差记录 1）
    const tierItem = pp
      .pricingTiersScope(page)
      .locator('.ivu-form-item')
      .filter({ hasText: '计价时段' })
      .first();
    await expect(tierItem.locator('.ivu-tag-warning')).toContainText('忙时');

    // 5. 时间段表格：表头 适用时段/开始时间/结束时间/操作；未配置默认一行回填
    const thead = pp.pricingTiersScope(page).locator('.ranges-table thead');
    await expect(thead).toContainText('适用时段');
    await expect(thead).toContainText('开始时间');
    await expect(thead).toContainText('结束时间');
    await pp.expectTimeRangeRowCount(page, 1);
    expect(await pp.getTimeInputValue(page, 0, 'start')).toBe(ROW0.start);
    expect(await pp.getTimeInputValue(page, 0, 'end')).toBe(ROW0.end);
    await pp.expectWeekdayCheckedCount(page, 0, 5);
  });
});

test.describe('模型服务商 - PR-T-02 时区输入与 IANA 校验', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('合法时区可提交；非法 abc/123 与留空提交被拦截并提示', async ({
    page,
  }) => {
    // 1. 合法 Asia/Shanghai 可提交（PUT 200 + 成功提示 + Drawer 关闭）
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.fillTimeZone(page, 'Asia/Shanghai');
    let response = await pp.submitPricingTiersAndWait(page);
    expect(response.request().postDataJSON().time_zone).toBe('Asia/Shanghai');

    // 2. 合法 America/New_York 可提交
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.fillTimeZone(page, 'America/New_York');
    response = await pp.submitPricingTiersAndWait(page);
    expect(response.request().postDataJSON().time_zone).toBe(
      'America/New_York',
    );

    // 3. 非法 abc/123 → 提交被拦截，提示「时区须为合法 IANA 时区名」，Drawer 不关闭
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.fillTimeZone(page, 'abc/123');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '时区须为合法 IANA 时区名');
    await pp.expectPricingTiersScopeVisible(page);

    // 4. 留空 → 提交被拦截，提示「请填写时区」，Drawer 不关闭
    await pp.fillTimeZone(page, '');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '请填写时区');
    await pp.expectPricingTiersScopeVisible(page);
  });
});

test.describe('模型服务商 - PR-T-03 适用时段 Checkbox 与全选语义', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('默认工作日 5 勾选；勾选周六/周日全选 7 天提交 weekdays=[]（每天）', async ({
    page,
  }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. 表头「适用时段」，控件为 Checkbox（周一~周日）；默认勾选工作日 5 个
    const thead = pp.pricingTiersScope(page).locator('.ranges-table thead');
    await expect(thead).toContainText('适用时段');
    await pp.expectWeekdayCheckedCount(page, 0, 5);

    // 2. 勾选 周六、周日 → 7 天全选
    await pp.clickWeekdayCheckbox(page, 0, '周六');
    await pp.clickWeekdayCheckbox(page, 0, '周日');
    await pp.expectWeekdayCheckedCount(page, 0, 7);

    // 3. 提交 → PUT body 第一行 weekdays=[]（表示每天）
    const response = await pp.submitPricingTiersAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.tiers[0].time_ranges[0].weekdays).toEqual([]);
  });

  test('全部取消提交 weekdays=[]', async ({ page }) => {
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.expectWeekdayCheckedCount(page, 0, 5);

    // 逐个取消 周一~周五。取消到 0 时 weekdays=[]（表示每天），Drawer 内渲染为 7 天全选
    // （见文件头偏差记录 4），故此处不断言勾选数，以 PUT body weekdays=[] 为验收依据。
    for (const label of ['周一', '周二', '周三', '周四', '周五']) {
      await pp.clickWeekdayCheckbox(page, 0, label);
    }

    // 提交 → PUT body weekdays=[]（全部取消 = 每天）
    const response = await pp.submitPricingTiersAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.tiers[0].time_ranges[0].weekdays).toEqual([]);
  });
});

test.describe('模型服务商 - PR-T-04 快捷链接（全选 / 工作日 / 周末）', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('快捷 全选/工作日/周末 提交语义符合 02 文档', async ({ page }) => {
    // 1. 快捷 · 全选 → 7 日全部勾选，提交 weekdays=[]（每天）
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.clickWeekdayQuickLink(page, '全选');
    await pp.expectWeekdayCheckedCount(page, 0, 7);
    let response = await pp.submitPricingTiersAndWait(page);
    expect(
      response.request().postDataJSON().tiers[0].time_ranges[0].weekdays,
    ).toEqual([]);

    // 2. 快捷 · 工作日 → 勾选 周一~周五，提交 weekdays=[1,2,3,4,5]
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.clickWeekdayQuickLink(page, '工作日');
    await pp.expectWeekdayCheckedCount(page, 0, 5);
    await pp.expectWeekdayChecked(page, 0, [
      '周一',
      '周二',
      '周三',
      '周四',
      '周五',
    ]);
    await pp.expectWeekdayUnchecked(page, 0, ['周六', '周日']);
    response = await pp.submitPricingTiersAndWait(page);
    expect(
      response.request().postDataJSON().tiers[0].time_ranges[0].weekdays,
    ).toEqual([1, 2, 3, 4, 5]);

    // 3. 快捷 · 周末 → 勾选 周六~周日，提交 weekdays=[0,6]
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.clickWeekdayQuickLink(page, '周末');
    await pp.expectWeekdayCheckedCount(page, 0, 2);
    await pp.expectWeekdayChecked(page, 0, ['周六', '周日']);
    response = await pp.submitPricingTiersAndWait(page);
    expect(
      response.request().postDataJSON().tiers[0].time_ranges[0].weekdays,
    ).toEqual([0, 6]);
  });
});

test.describe('模型服务商 - PR-T-05 时间段添加 / 删除', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('可新增多行/删除多余行；仅剩一行删除按钮禁用；至少保留 1 段可提交', async ({
    page,
  }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. 默认一行，删除按钮禁用（至少保留 1 个时间段）
    await pp.expectTimeRangeRowCount(page, 1);
    await pp.expectDeleteTimeRangeDisabled(page, 0);

    // 2. 新增多行（+2 → 3 行），新行默认 09:00-12:00、工作日 5 勾选
    await pp.addTimeRangeRow(page);
    await pp.addTimeRangeRow(page);
    await pp.expectTimeRangeRowCount(page, 3);
    expect(await pp.getTimeInputValue(page, 1, 'start')).toBe(ROW0.start);
    expect(await pp.getTimeInputValue(page, 1, 'end')).toBe(ROW0.end);
    await pp.expectWeekdayCheckedCount(page, 1, 5);
    expect(await pp.getTimeInputValue(page, 2, 'start')).toBe(ROW0.start);

    // 3. 删除其中一行 → 2 行
    await pp.clickDeleteTimeRange(page, 0);
    await pp.expectTimeRangeRowCount(page, 2);

    // 4. 再删一行 → 仅剩 1 行，删除按钮恢复禁用
    await pp.clickDeleteTimeRange(page, 0);
    await pp.expectTimeRangeRowCount(page, 1);
    await pp.expectDeleteTimeRangeDisabled(page, 0);

    // 5. 忙时至少包含 1 个时间段 → 提交成功
    await pp.submitPricingTiersAndWait(page);
  });
});

test.describe('模型服务商 - PR-T-06 时间格式校验（HH:MM、end > start）', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('end<=start（12:00-09:00）提交被拦截提示，修复后提交成功', async ({
    page,
  }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. 合法格式但 end<=start → 提示「结束时间须大于开始时间」，Drawer 不关闭
    await pp.fillTimeInput(page, 0, 'start', '12:00');
    await pp.fillTimeInput(page, 0, 'end', '09:00');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '结束时间须大于开始时间');
    await pp.expectPricingTiersScopeVisible(page);

    // 2. 修复为 end>start（12:00-13:00）→ 提交成功
    await pp.fillTimeInput(page, 0, 'end', '13:00');
    const response = await pp.submitPricingTiersAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.tiers[0].time_ranges[0]).toEqual({
      weekdays: [1, 2, 3, 4, 5],
      start: '12:00',
      end: '13:00',
    });
  });

  test('非法 HH:MM（25:00/12:60）被原生 time input 拒绝；空值提交触发「须为 HH:MM 格式」', async ({
    page,
  }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // start/end 为原生 type=time input：'25:00'/'12:60' 属非法时间值，Playwright fill
    // 直接抛 Malformed value 拒绝输入（见文件头偏差记录 3），组件「…时间无效」分支
    // 无法经 UI 复现。空值（非 HH:MM 格式）可复现「须为 HH:MM 格式」拦截提示。
    await pp.fillTimeInput(page, 0, 'start', '');
    await pp.fillTimeInput(page, 0, 'end', '');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '须为 HH:MM 格式');
    await pp.expectPricingTiersScopeVisible(page);
  });
});

test.describe('模型服务商 - PR-T-07 同 tier 时间段重叠校验', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('重叠时段提交被拦截提示，改为不重叠后可提交', async ({ page }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. 两行均工作日：09:00-12:00 与 10:00-11:00 时间相交 → 提交拦截
    await pp.addTimeRangeRow(page);
    await pp.fillTimeInput(page, 1, 'start', '10:00');
    await pp.fillTimeInput(page, 1, 'end', '11:00');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '个时间段存在重叠');
    await pp.expectPricingTiersScopeVisible(page);

    // 2. 改为不重叠（13:00-18:00）→ 提交通过
    await pp.fillTimeInput(page, 1, 'start', '13:00');
    await pp.fillTimeInput(page, 1, 'end', '18:00');
    const response = await pp.submitPricingTiersAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.tiers[0].time_ranges).toHaveLength(2);
    expect(body.tiers[0].time_ranges[1]).toEqual({
      weekdays: [1, 2, 3, 4, 5],
      start: '13:00',
      end: '18:00',
    });
  });
});

test.describe('模型服务商 - PR-T-08 提交 PUT pricing-tiers', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    providerName = 'provider_' + Date.now().toString(36);

    // API 造数：一个未配置分段计价的服务商
    const data = await api.createProviderViaApi(page, {
      name: providerName,
      description: '自动化测试-分段计价',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(data).not.toBeNull();
    cleanup.trackName(providerName);

    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(providerName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('默认回填正确，添加时间段后提交 PUT 请求体结构符合 02 文档', async ({
    page,
  }) => {
    // 1. 打开分段计价 Drawer，标题固定「分段计价配置」，顶部展示只读服务商名
    await pp.openPricingTiersDrawer(page, providerName);
    await expect(
      pp.pricingTiersScope(page).locator('.provider-name'),
    ).toHaveText(providerName);

    // 2. 时区默认 Asia/Shanghai
    expect(await pp.getTimeZoneValue(page)).toBe(pp.DOC.defaultTimeZone);

    // 3. 默认一行时间段：09:00-12:00，适用时段 周一~周五 勾选（5 个 Checkbox 选中）
    await pp.expectTimeRangeRowCount(page, 1);
    expect(await pp.getTimeInputValue(page, 0, 'start')).toBe(ROW0.start);
    expect(await pp.getTimeInputValue(page, 0, 'end')).toBe(ROW0.end);
    const row0 = pp.timeRangeRows(page).nth(0);
    await expect(
      row0.locator('.weekday-checkboxes .ivu-checkbox-checked'),
    ).toHaveCount(5);

    // 4. 添加第二行时间段 14:00-18:00
    await pp.addTimeRangeRow(page);
    await pp.expectTimeRangeRowCount(page, 2);
    await pp.fillTimeInput(page, 1, 'start', ROW1.start);
    await pp.fillTimeInput(page, 1, 'end', ROW1.end);

    // 5. 提交并等待 PUT 响应
    const response = await pp.submitPricingTiersAndWait(page);
    const body = response.request().postDataJSON();
    expect(body).toBeTruthy();
    expect(body.time_zone).toBe(pp.DOC.defaultTimeZone);
    expect(body.tiers).toHaveLength(1);
    const tier = body.tiers[0];
    expect(tier.name).toBe('peak');
    expect(tier.time_ranges).toHaveLength(2);
    expect(tier.time_ranges[0]).toEqual(ROW0);
    expect(tier.time_ranges[1]).toEqual(ROW1);

    // 6. 成功提示「分段计价配置已更新」+ Drawer 关闭（submitPricingTiersAndWait 内已断言）
  });
});

test.describe('模型服务商 - PR-T-09 编辑回填与提交后回显', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('Drawer 回填与已配置一致；修改提交后 GET /providers/{name} 读回 tiers 一致', async ({
    page,
  }) => {
    // 1. 首次提交一组配置：Asia/Shanghai + 两行（09:00-12:00、14:00-18:00，均工作日）
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.addTimeRangeRow(page);
    await pp.fillTimeInput(page, 1, 'start', ROW1.start);
    await pp.fillTimeInput(page, 1, 'end', ROW1.end);
    await pp.submitPricingTiersAndWait(page);

    // 2. 再次打开 Drawer → 回填：时区、Checkbox 勾选、开始/结束时间与已配置一致
    await pp.openPricingTiersDrawer(page, providerName);
    expect(await pp.getTimeZoneValue(page)).toBe(pp.DOC.defaultTimeZone);
    await pp.expectTimeRangeRowCount(page, 2);
    expect(await pp.getTimeInputValue(page, 0, 'start')).toBe(ROW0.start);
    expect(await pp.getTimeInputValue(page, 0, 'end')).toBe(ROW0.end);
    await pp.expectWeekdayCheckedCount(page, 0, 5);
    expect(await pp.getTimeInputValue(page, 1, 'start')).toBe(ROW1.start);
    expect(await pp.getTimeInputValue(page, 1, 'end')).toBe(ROW1.end);
    await pp.expectWeekdayCheckedCount(page, 1, 5);

    // 3. 修改部分时间段（时区 America/New_York、第二行 20:00-22:00）后提交
    await pp.fillTimeZone(page, 'America/New_York');
    await pp.fillTimeInput(page, 1, 'start', '20:00');
    await pp.fillTimeInput(page, 1, 'end', '22:00');
    await pp.submitPricingTiersAndWait(page);

    // 4. GET /providers/{name} 读回断言 time_zone / tiers 一致
    const data = await api.getProviderViaApi(page, providerName);
    expect(data).not.toBeNull();
    expect(data.time_zone).toBe('America/New_York');
    const tier = (data.tiers || []).find(
      (item) => item && item.name === 'peak',
    );
    expect(tier).toBeTruthy();
    expect(tier.time_ranges).toEqual([
      { weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
      { weekdays: [1, 2, 3, 4, 5], start: '20:00', end: '22:00' },
    ]);

    // 5. 重新打开 Drawer 回显为最新值
    await pp.openPricingTiersDrawer(page, providerName);
    expect(await pp.getTimeZoneValue(page)).toBe('America/New_York');
    expect(await pp.getTimeInputValue(page, 1, 'start')).toBe('20:00');
    expect(await pp.getTimeInputValue(page, 1, 'end')).toBe('22:00');
  });
});

test.describe('模型服务商 - PR-T-10 取消 / 关闭', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('修改后点「取消」Drawer 关闭且服务商数据不变', async ({ page }) => {
    // 1. 先提交一组基线配置（Asia/Shanghai + 09:00-12:00 工作日）
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.submitPricingTiersAndWait(page);

    // 2. 再次打开并修改内容（时区、结束时间），然后点「取消」
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.fillTimeZone(page, 'America/New_York');
    await pp.fillTimeInput(page, 0, 'end', '18:00');
    await pp
      .pricingTiersScope(page)
      .getByRole('button', { name: '取消' })
      .click();
    await pp.expectPricingTiersScopeHidden(page);

    // 3. 修改不保存：GET 读回仍为基线配置
    const data = await api.getProviderViaApi(page, providerName);
    expect(data).not.toBeNull();
    expect(data.time_zone).toBe(pp.DOC.defaultTimeZone);
    const tier = (data.tiers || []).find(
      (item) => item && item.name === 'peak',
    );
    expect(tier).toBeTruthy();
    expect(tier.time_ranges).toEqual([ROW0]);
  });
});
