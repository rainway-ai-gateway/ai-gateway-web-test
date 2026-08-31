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
 * 模型服务商 - 详情页验证（PR-D-01 / PR-D-02）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/03-详情页验证.md）：
 * - PR-D-01：详情页全字段与接口数据一致性（基本信息 / 实例池 / 模型服务配置 /
 *   服务鉴权 Keys / 模型列表 / 分段计价配置，只读卡片形态不渲染输入框）
 * - PR-D-02：详情页分段计价配置 Card（已配置展示时区 + 忙时（peak）+ 时间段表；
 *   未配置展示「未配置」提示、不渲染空表；Card 仅展示不含编辑入口）
 *
 * 文档偏差记录（docs/providers/02 验收优先，已保留 02 验收断言）：
 * 1. PR-D-01 预期 Key 值脱敏形如「sk-a****aaaa」（示例性表述，首尾少量字符+中间掩码）：
 *    当前 UI 按 maskSecretKey 算法（ai-gateway-web/src/utils/const.js）：≤12 位 → '****'；
 *    >12 位 → 前 8 位 + '****' + 后 4 位（如 'sk-aaaaa****aaaa'）。语义一致（不展示明文），
 *    spec 按 UI 算法精确断言脱敏值并校验含 '****'。
 * 2. PR-D-02 预期未配置时提示「未配置分段计价」（文档示例性表述）：当前 UI 详情 Card
 *    展示 i18n「未配置」（ProviderPage.js 文件头偏差记录 3 一致）。spec 断言「未配置」+
 *    不渲染空表 + Card 无编辑入口，符合 02 验收「展示提示、不渲染空表、仅展示」。
 *
 * 运行：npx playwright test tests/providers/test_03_provider_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');

// 与 ProviderView.vue 实例池多实例一致（2 实例，权重和 100，IP 模式端口不按 schema 同步）
const INSTANCES = [
  { addr: '172.18.1.10', port: 8080, weight: 60 },
  { addr: '172.18.1.11', port: 8080, weight: 40 },
];
// 与 maskSecretKey（utils/const.js：>12 位 → 前 8 + '****' + 后 4）一致的脱敏结果
const MASKED_KEYS = ['sk-aaaaa****aaaa', 'sk-bbbbb****bbbb'];
// 分段计价：时区 + peak 两段时间段（工作日 1-5）
const TIERS = [
  {
    name: 'peak',
    time_ranges: [
      { weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
      { weekdays: [1, 2, 3, 4, 5], start: '14:00', end: '18:00' },
    ],
  },
];

// 详情卡通用造数：创建字段完整的服务商并进入列表页（命名前缀 provider_，afterEach 清理）
async function setupFullProvider({ page }) {
  const cleanup = api.createProviderTestCleanup();
  const providerName = 'provider_' + Date.now().toString(36);

  const data = await api.createProviderViaApi(page, {
    name: providerName,
    description: '自动化测试-详情页全字段',
    model_protocols: ['openai', 'anthropic'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: ['gpt-4o-mini', 'deepseek-chat'],
    keys: [
      { name: 'key-primary', key: 'sk-aaaaaaaaaaaa' },
      { name: 'key-secondary', key: 'sk-bbbbbbbbbbbb' },
    ],
    instance_pool: INSTANCES,
    time_zone: 'Asia/Shanghai',
    tiers: TIERS,
  });
  expect(data).not.toBeNull();
  cleanup.trackName(providerName);

  await pp.gotoProvidersPage(page);
  await pp.providerTable(page).expectRowVisible(providerName);
  return { cleanup, providerName };
}

test.describe('模型服务商 - PR-D-01 详情页全字段与接口数据一致性', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupFullProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('进入详情 GET /providers/{name} 200，各 Card 展示与接口数据一致且无输入框', async ({
    page,
  }) => {
    // 1. 打开详情：触发 GET /providers/{name} 返回 200
    const [detailResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/open-api/v1/providers/' + providerName) &&
          r.request().method() === 'GET',
        { timeout: 15000 },
      ),
      pp.openViewDrawer(page, providerName),
    ]);
    expect(detailResp.status()).toBe(200);
    await pp.expectViewScopeVisible(page);

    // 接口读回数据作为比对基准
    const apiData = await api.getProviderViaApi(page, providerName);
    expect(apiData).not.toBeNull();

    // 2. 基本信息：名称 / 描述 / 创建时间 / 更新时间（时间戳转换后展示）
    expect(await pp.viewInfoValue(page, '基本信息', '名称')).toBe(providerName);
    expect(await pp.viewInfoValue(page, '基本信息', '描述')).toBe(
      '自动化测试-详情页全字段',
    );
    // 与组件同一浏览器环境计算期望值，避免 locale/时区差异
    const tsText = (ts) =>
      ts
        ? page.evaluate((t) => new Date(Number(t) * 1000).toLocaleString(), ts)
        : Promise.resolve('-');
    expect(await pp.viewInfoValue(page, '基本信息', '创建时间')).toBe(
      await tsText(apiData.create_time),
    );
    expect(await pp.viewInfoValue(page, '基本信息', '更新时间')).toBe(
      await tsText(apiData.update_time),
    );

    // 3. 实例池：实例形态 IP + 多实例逐行 地址 / 端口 / 权重
    expect(await pp.viewInfoValue(page, '实例池', '实例形态')).toBe('IP');
    const instRows = pp.viewTableRows(page, '实例池');
    await expect(instRows).toHaveCount(INSTANCES.length);
    for (let i = 0; i < INSTANCES.length; i += 1) {
      const cells = instRows.nth(i).locator('td');
      await expect(cells.nth(0)).toHaveText(INSTANCES[i].addr);
      await expect(cells.nth(1)).toHaveText(String(INSTANCES[i].port));
      await expect(cells.nth(2)).toHaveText(String(INSTANCES[i].weight));
    }

    // 4. 模型服务配置：模型协议（join 展示）+ 模型列表接口 schema://host:port/uri
    const protocolText = await pp.viewInfoValue(
      page,
      '模型服务配置',
      '模型协议',
    );
    expect(protocolText).toContain('openai');
    expect(protocolText).toContain('anthropic');
    // 多实例 IP 模式端口不按 schema 同步，endpoint host = 首实例 addr:port
    expect(await pp.viewInfoValue(page, '模型服务配置', '模型列表接口')).toBe(
      'https://172.18.1.10:8080/v1/models',
    );

    // 5. 服务鉴权 Keys：Key 名称 + Key 值脱敏（含 ****，不展示明文）
    const keyRows = pp.viewTableRows(page, '服务鉴权 Keys');
    await expect(keyRows).toHaveCount(2);
    await expect(keyRows.nth(0).locator('td').nth(0)).toHaveText('key-primary');
    await expect(keyRows.nth(0).locator('td').nth(1)).toHaveText(
      MASKED_KEYS[0],
    );
    await expect(keyRows.nth(1).locator('td').nth(0)).toHaveText(
      'key-secondary',
    );
    await expect(keyRows.nth(1).locator('td').nth(1)).toHaveText(
      MASKED_KEYS[1],
    );
    await expect(keyRows.nth(0)).toContainText('****');
    await expect(keyRows.nth(0)).not.toContainText('sk-aaaaaaaaaaaa');

    // 6. 模型列表：全部模型 Tag 展示
    // 注：viewCard 按 hasText 子串匹配，『模型服务配置』Card 内的「模型列表接口」
    // 标签与「模型列表」Card 标题存在子串重叠，命中 2 张 Card；DOM 顺序中
    // 「模型列表」Card 位于「模型服务配置」之后，取 .last() 精确锁定
    const modelCard = pp.viewCard(page, '模型列表').last();
    await expect(modelCard).toBeVisible();
    for (const model of ['gpt-4o-mini', 'deepseek-chat']) {
      await expect(modelCard).toContainText(model);
    }

    // 7. 分段计价配置：时区 / 忙时（peak）/ 时间段表（适用时段 / 开始时间 / 结束时间）
    expect(await pp.viewInfoValue(page, '分段计价配置', '时区')).toBe(
      'Asia/Shanghai',
    );
    expect(await pp.viewInfoValue(page, '分段计价配置', '计价时段')).toBe(
      '忙时（peak）',
    );
    const tierCard = pp.viewCard(page, '分段计价配置');
    await expect(tierCard).toContainText('适用时段');
    await expect(tierCard).toContainText('开始时间');
    await expect(tierCard).toContainText('结束时间');
    const tierRows = pp.viewTableRows(page, '分段计价配置');
    await expect(tierRows).toHaveCount(2);
    await expect(tierRows.nth(0)).toContainText('一、二、三、四、五');
    await expect(tierRows.nth(0)).toContainText('09:00');
    await expect(tierRows.nth(0)).toContainText('12:00');
    await expect(tierRows.nth(1)).toContainText('14:00');
    await expect(tierRows.nth(1)).toContainText('18:00');

    // 8. 只读卡片形态：详情不渲染任何输入框
    await pp.expectViewNoInputs(page);
  });
});

test.describe('模型服务商 - PR-D-02 详情页分段计价配置 Card', () => {
  let cleanup;
  let configuredName;
  let unconfiguredName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const ts = Date.now().toString(36);
    configuredName = 'provider_' + ts + '_cfg';
    unconfiguredName = 'provider_' + ts + '_nocfg';

    // 已配置：Asia/Shanghai + peak 两段时间段
    const cfg = await api.createProviderViaApi(page, {
      name: configuredName,
      description: '自动化测试-已配置分段计价',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
      time_zone: 'Asia/Shanghai',
      tiers: TIERS,
    });
    expect(cfg).not.toBeNull();
    cleanup.trackName(configuredName);

    // 未配置：不传 time_zone / tiers
    const nocfg = await api.createProviderViaApi(page, {
      name: unconfiguredName,
      description: '自动化测试-未配置分段计价',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: [],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(nocfg).not.toBeNull();
    cleanup.trackName(unconfiguredName);

    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(configuredName);
    await pp.providerTable(page).expectRowVisible(unconfiguredName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('已配置展示时区+忙时（peak）+时间段表；未配置展示「未配置」且不渲染空表、无编辑入口', async ({
    page,
  }) => {
    // 1. 已配置服务商详情：分段计价 Card 与接口 tiers 一致
    await pp.openViewDrawer(page, configuredName);
    await pp.expectViewScopeVisible(page);
    expect(await pp.viewInfoValue(page, '分段计价配置', '时区')).toBe(
      'Asia/Shanghai',
    );
    expect(await pp.viewInfoValue(page, '分段计价配置', '计价时段')).toBe(
      '忙时（peak）',
    );
    const tierRows = pp.viewTableRows(page, '分段计价配置');
    await expect(tierRows).toHaveCount(2);
    await expect(tierRows.nth(0)).toContainText('一、二、三、四、五');
    await expect(tierRows.nth(0)).toContainText('09:00');
    await expect(tierRows.nth(0)).toContainText('12:00');
    await expect(tierRows.nth(1)).toContainText('14:00');
    await expect(tierRows.nth(1)).toContainText('18:00');
    // 该 Card 仅展示，不含编辑入口（编辑走列表「分段计价配置」Drawer）
    await expect(
      pp.viewCard(page, '分段计价配置').locator('button'),
    ).toHaveCount(0);
    await pp.expectViewNoInputs(page);

    // 2. 重新进入列表，打开未配置服务商详情
    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(unconfiguredName);
    await pp.openViewDrawer(page, unconfiguredName);
    await pp.expectViewScopeVisible(page);

    // 未配置：时区回落默认 Asia/Shanghai、计价时段恒为忙时（peak）
    expect(await pp.viewInfoValue(page, '分段计价配置', '时区')).toBe(
      'Asia/Shanghai',
    );
    expect(await pp.viewInfoValue(page, '分段计价配置', '计价时段')).toBe(
      '忙时（peak）',
    );
    // 未配置：展示「未配置」提示（02 文档示例「未配置分段计价」，当前 UI 为 i18n「未配置」）
    expect(await pp.viewInfoValue(page, '分段计价配置', '时间段')).toBe(
      '未配置',
    );
    // 不渲染空表
    await expect(
      pp.viewCard(page, '分段计价配置').locator('table.kv-table'),
    ).toHaveCount(0);
    // 该 Card 仅展示，不含编辑入口
    await expect(
      pp.viewCard(page, '分段计价配置').locator('button'),
    ).toHaveCount(0);
    await pp.expectViewNoInputs(page);
  });
});
