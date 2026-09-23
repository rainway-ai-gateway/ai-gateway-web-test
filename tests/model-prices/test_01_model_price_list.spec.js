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
 * 模型定价 - 列表页（MP-L-01 ~ MP-L-07，P1/P2）
 *
 * 覆盖用例：
 * - MP-L-01 列表页加载与数据展示（P1）
 * - MP-L-02 Provider 筛选（P1）
 * - MP-L-03 Model 单独查询被后端拒绝（P1）
 * - MP-L-04 Mode 筛选（P1）
 * - MP-L-05 Provider + Mode 组合筛选（P1）
 * - MP-L-06 分页功能（P1）
 * - MP-L-07 空列表展示（P2）
 *
 * 文案偏差（docs/02 参考文案 vs 实际 UI）：
 * - docs 预期空态「暂无数据」，UI iView Table 默认空态文案（中文 locale
 *   iview 3 默认「暂无数据」）。若实际渲染不同，以实际为准并记录。
 *
 * 运行：PW_WORKERS=1 npx playwright test tests/model-prices/test_01_model_price_list.spec.js
 */
const { test, expect } = require('@playwright/test');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');

const LIST_YAML = require('fs').readFileSync(
  require('path').join(
    __dirname,
    '../../test-files/model-prices/model-list.yaml',
  ),
  'utf8',
);

async function reloadToList(page) {
  await page.reload();
  await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(500);
}

test.describe('模型定价 - MP-L-01 列表页加载与数据展示', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
    await api.ensureBaselineData(page);
    await page.reload();
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('页面加载、列头完整、行数据与接口一致', async ({ page }) => {
    // 1. URL 包含 /model-prices
    expect(page.url()).toContain('/model-prices');

    // 2. 列头完整（Provider / 模型名 / 归一化模型名 / 模型模式 / 操作）
    await mp.expectTableHeaders(page);

    // 3. 行数据与接口返回一致（基线 deepseek / openai 两条）
    const { list } = await api.fetchModelPricesViaApi(page);
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const row of list.slice(0, 2)) {
      await mp.modelPriceTable(page).expectRowVisible(row.provider);
    }
    await mp.modelPriceTable(page).expectRowVisible('deepseek-v3');
    await mp.modelPriceTable(page).expectRowVisible('gpt-4o');

    // 4. 搜索行（searchTable）可见：provider/mode 为下拉，model 为 input
    // 注：UI 已移除 base_model 搜索框，仅保留 provider/model/mode
    await mp.expectSearchInputVisible(page, 'provider');
    await mp.expectSearchInputVisible(page, 'model');
    await mp.expectSearchInputVisible(page, 'mode');

    // 5. 分页栏可见、total 正确，页码「1」为当前页
    const { total } = await api.fetchModelPricesViaApi(page);
    const pagination = mp.modelPriceTable(page).pagination();
    await expect(pagination).toBeVisible();
    await expect(
      pagination.getByRole('listitem').filter({ hasText: '1' }),
    ).toBeVisible();
    // 校验 total 来自接口（分页内部元素会展示总条数/页码等，通过「共 X 条」或页码数间接验证）
    if (total <= 20) {
      // 不足一页则只有页码 1
      await expect(
        pagination.getByRole('listitem').filter({ hasText: '2' }),
      ).toHaveCount(0);
    }
  });
});

test.describe('模型定价 - MP-L-02/03/04/05 筛选与搜索', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    await mp.gotoModelPricePage(page);
    await api.ensureBaselineData(page);
    await page.reload();
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });
    await page.waitForTimeout(500);
  });
  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('MP-L-02 Provider 筛选：下拉选择后触发接口请求，列表仅展示对应 provider', async ({
    page,
  }) => {
    const respPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('provider=deepseek'),
      { timeout: 10000 },
    );
    await mp.searchField(page, 'provider', 'deepseek');
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    // 列表中仅 deepseek-v3 可见，openai 的 gpt-4o 应消失
    await mp.modelPriceTable(page).expectRowVisible('deepseek-v3');
    await mp.modelPriceTable(page).expectRowHidden('gpt-4o');
  });

  test('MP-L-03 Model 搜索：model 单独查询被后端拒绝（422），前端提示失败且列表不变', async ({
    page,
  }) => {
    // 后端契约（api-define §3.4/§3.6，issue #170）：列表过滤仅支持 provider/mode，
    // 不含 model；带 model 但 provider/model/mode 三参不齐时一律返回 422 参数错误。
    // 故 UI 的 model 搜索框发出的 model=... 请求会被后端拒绝。
    const respPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('model=gpt-4o'),
      { timeout: 10000 },
    );
    await mp.searchField(page, 'model', 'gpt-4o');
    const resp = await respPromise;
    expect(resp.status()).toBe(422);

    // 前端提示加载失败，列表保持基线数据（既不清空也不过滤）
    await mp.expectMessage(page, '加载模型定价失败');
    await mp.modelPriceTable(page).expectRowVisible('gpt-4o');
    await mp.modelPriceTable(page).expectRowVisible('deepseek-v3');
  });

  test('MP-L-04 Mode 筛选：下拉选择后触发接口请求，列表仅展示对应 mode', async ({
    page,
  }) => {
    const respPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('mode=chat'),
      { timeout: 10000 },
    );
    await mp.searchField(page, 'mode', 'chat');
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    // 基线两条均为 chat 模式，均应可见（行数与接口返回一致）
    await mp.modelPriceTable(page).expectRowVisible('gpt-4o');
    await mp.modelPriceTable(page).expectRowVisible('deepseek-v3');
  });

  test('MP-L-05 Provider + Mode 组合筛选：两个参数同时传递，列表仅展示同时满足的记录', async ({
    page,
  }) => {
    const respPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('provider=deepseek') &&
        r.url().includes('mode=chat'),
      { timeout: 10000 },
    );
    await mp.searchField(page, 'provider', 'deepseek');
    await mp.searchField(page, 'mode', 'chat');
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    // deepseek-v3 应可见，gpt-4o 应消失
    await mp.modelPriceTable(page).expectRowVisible('deepseek-v3');
    await mp.modelPriceTable(page).expectRowHidden('gpt-4o');
  });
});

test.describe('模型定价 - MP-L-06 分页功能', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    // 先把表重置为基线，保证不受历史脏数据影响
    await api.resetModelPricesToBaseline(page);
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    // 恢复基线，确保下一个用例环境干净
    await api.resetModelPricesToBaseline(page);
    await cleanup.cleanup(page);
  });

  test('预置 25 条记录：默认 pageSize=50 全量展示，切换分页生效，翻页正常', async ({
    page,
  }) => {
    // 基线固定 2 条（deepseek + openai）
    const baselineCount = 2;

    // 预置 25 条 qa-page-*（基线 2 条 → 共 27 条）
    for (let i = 1; i <= 25; i += 1) {
      const n = String(i).padStart(3, '0');
      cleanup.trackCombo(`qa-page-${n}`, `qa-page-${n}-model`, 'chat');
      await api.createModelPriceViaApi(page, {
        provider: `qa-page-${n}`,
        model: `qa-page-${n}-model`,
        base_model: `qa-page-${n}-model`,
        mode: 'chat',
        prices: { input_cost_per_token: 0.000001 },
      });
    }
    await reloadToList(page);

    const totalCount = 25 + baselineCount;
    const table = mp.modelPriceTable(page);

    // 1. 默认 pageSize=50 → 27 条全部展示在第 1 页，无页码 2
    expect(await table.dataRows().count()).toBe(totalCount);
    const pagination = table.pagination();
    await expect(
      pagination.getByRole('listitem').filter({ hasText: '2' }),
    ).toBeHidden();

    // 2. 切换 pageSize 50 → 20：第 1 页渲染 20 条，页码 2 可见
    const sizeResp20 = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('page_size=20'),
      { timeout: 10000 },
    );
    await table.changePageSize('20');
    const resp20 = await sizeResp20;
    expect(resp20.status()).toBe(200);
    expect(await table.dataRows().count()).toBe(20);
    await expect(
      pagination.getByRole('listitem').filter({ hasText: '2' }),
    ).toBeVisible();

    // 3. 点击下一页 → 第 2 页渲染剩余 totalCount - 20 条
    const nextResp = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('page=2'),
      { timeout: 10000 },
    );
    await table.clickNextPage();
    const resp2 = await nextResp;
    expect(resp2.status()).toBe(200);
    expect(await table.dataRows().count()).toBe(totalCount - 20);

    // 4. 切换 pageSize 20 → 50（默认值）：页码重置为 1，全量展示
    const sizeResp50 = page.waitForResponse(
      (r) =>
        r.url().includes('/open-api/v1/model-prices') &&
        r.url().includes('page_size=50'),
      { timeout: 10000 },
    );
    await table.changePageSize('50');
    const resp50 = await sizeResp50;
    expect(resp50.status()).toBe(200);
    expect(await table.dataRows().count()).toBe(totalCount);
  });
});

test.describe('模型定价 - MP-L-07 空列表展示', () => {
  let cleanup;
  test.beforeEach(async ({ page }) => {
    cleanup = api.createModelPriceTestCleanup();
    // 先把表重置为基线，保证开始时只有 deepseek/openai
    await api.resetModelPricesToBaseline(page);
    await mp.gotoModelPricePage(page);
  });
  test.afterEach(async ({ page }) => {
    // 清空过数据库 → 恢复基线（deepseek/openai）
    await api.resetModelPricesToBaseline(page);
    await cleanup.cleanup(page);
  });

  test('删除全部记录后列表展示空态，新增按钮仍可用', async ({ page }) => {
    // 删除基线 2 条
    await api.deleteModelPriceByComboViaApi(
      page,
      'deepseek',
      'deepseek-v3',
      'chat',
    );
    await api.deleteModelPriceByComboViaApi(page, 'openai', 'gpt-4o', 'chat');
    await reloadToList(page);

    // 1. 接口返回空列表
    const { list, total } = await api.fetchModelPricesViaApi(page);
    expect(list.length).toBe(0);
    expect(total).toBe(0);

    // 2. 表格区域展示空态文案「暂无数据」
    await expect(page.getByText('暂无数据').first()).toBeVisible({
      timeout: 10000,
    });

    // 3. 「新增定价」按钮仍可见且可点击
    const createBtn = page.getByRole('button', { name: '新增定价' });
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await mp.expectUpsertScopeVisible(page);
  });
});
