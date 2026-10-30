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
 * 模型服务商 - 详情页验证（PR-D-01 ~ PR-D-05）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/03-详情页验证.md）：
 * - PR-D-01：详情页全字段与接口数据一致性（基本信息 / 实例池 / 模型服务配置
 *   （含模型列表 Tag） / 服务鉴权 Keys / 分段计价配置，只读卡片形态不渲染输入框）
 * - PR-D-02：详情页分段计价配置 Card（已配置展示时区 + 忙时（peak）+ 时间段表；
 *   未配置展示「未配置」提示、不渲染空表；Card 仅展示不含编辑入口）
 * - PR-D-03：详情页协议路径映射卡片展示（已配置展示映射，未配置不展示）
 * - PR-D-04：详情页 K8s 分支展示（实例来源 = K8s 实例池（k8s_pool）、只读标签
 *   「K8s 实例池」、实例表「实例地址/端口/权重」数据源为 GET /k8s_pools/{name}
 *   的实时 instances，逐行一致；只读卡片形态）
 * - PR-D-05：详情页 K8s 池实例列表实时读取与降级（场景 ① 池实例变更后重新打开详情
 *   即为最新数据；场景 ② 空池文案「当前池暂无实例（空池为合法状态）」；
 *   场景 ③ 池不存在（404）文案「K8s 池不存在（≡ 零实例）」）
 *
 * 文档偏差记录（docs/providers/02 验收优先，已保留 02 验收断言）：
 * 1. PR-D-01 预期 Key 值脱敏形如「sk-a****aaaa」（示例性表述，首尾少量字符+中间掩码）：
 *    当前 UI 按 maskSecretKey 算法（ai-gateway-web/src/utils/const.js）：≤12 位 → '****'；
 *    >12 位 → 前 8 位 + '****' + 后 4 位（如 'sk-aaaaa****aaaa'）。语义一致（不展示明文），
 *    spec 按 UI 算法精确断言脱敏值并校验含 '****'。
 * 2. PR-D-02 预期未配置时提示「未配置分段计价」（文档示例性表述）：当前 UI 详情 Card
 *    展示 i18n「未配置」（ProviderPage.js 文件头偏差记录 3 一致）。spec 断言「未配置」+
 *    不渲染空表 + Card 无编辑入口，符合 02 验收「展示提示、不渲染空表、仅展示」。
 * 3. PR-D-03 预期「openai → /v1, anthropic → /v2」：protocol_paths 为 map，
 *    后端 JSON 序列化按 key 字典序返回（anthropic 在前）且 UI 按返回顺序渲染；
 *    02 未约定行序，spec 改为按协议名定位行后校验路径（不做位置断言）。
 * 4. PR-D-03 预期未配置时「不展示卡片，或展示提示」：UI 采用后者，Card 保留并展示
 *    空态「-」（ProviderView.vue .empty-text），不渲染映射表；spec 按此断言。
 * 5. 前端分页适配（2026-10-15）：列表前端分页默认 20 条/页且只渲染当前页，API 造数后
 *    新行可能落在第 2/3 页，原「造数后直接断言行可见」必然超时；统一改用
 *    pp.expectProviderRowVisibleByName（先按名称本地筛选再断言行可见），断言内容不变。
 *
 * 数据隔离（PR-D-04/05）：K8s 池经 InnerAPI 造数（`api/k8s-pool-api-utils.js`，
 * 命名前缀 qa_pool_），provider 命名前缀 provider_；afterEach 删除，不触碰环境既有池
 * （test-pool 由 K8s 侧同步维护）。造池/删池复用页面 Session，不得再调 session-keys
 * （会让已下发的 Session Key 失效）。
 *
 * PR-D-05 场景 ③ 观测到的产品缺陷（保留 02 验收断言，未改断言迁就实现）：
 * 池详情返回 404 时，ProviderView 期望走 `catch(err => err.response.status === 404)` 分支
 * 打上 `k8sPoolState = 'notfound'` 并展示「K8s 池不存在（≡ 零实例）」；但全局
 * `src/utils/request.js` 的响应拦截器把错误响应 `return error.response`（**resolve**，
 * 不 reject），因此 `then(res => { if (res.status !== 200) return; })` 直接返回，
 * catch 永不执行 → `k8sPoolState` 恒为空 → 实例区始终显示空池文案
 * 「当前池暂无实例（空池为合法状态）」。实测：GET /k8s_pools/{name} 返回 404，
 * 详情实例区文案仍为空池文案（见 PR-D-05 场景 ③ 失败截图）。
 *
 * 运行：npx playwright test tests/providers/test_03_provider_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');
const k8sPoolApi = require('../../api/k8s-pool-api-utils');

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
  await pp.expectProviderRowVisibleByName(page, providerName);
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

    // 6. 模型列表：全部模型 Tag 展示（UI 已并入「模型服务配置」Card，为其中一行）
    // 注：「模型列表接口」与「模型列表」为子串包含关系，filter({ hasText }) 会同时命中
    // 两行且 .first() 指向「模型列表接口」；故按 .info-label 精确文本定位该行
    const modelCard = pp.viewCard(page, '模型服务配置');
    const modelRow = modelCard
      .locator('.info-row')
      .filter({ has: page.locator('.info-label', { hasText: /^模型列表$/ }) });
    await expect(modelRow).toBeVisible();
    for (const model of ['gpt-4o-mini', 'deepseek-chat']) {
      await expect(modelRow).toContainText(model);
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
      models: ['qa-detail-tier-cfg'],
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
      models: ['qa-detail-tier-nocfg'],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(nocfg).not.toBeNull();
    cleanup.trackName(unconfiguredName);

    await pp.gotoProvidersPage(page);
    await pp.expectProviderRowVisibleByName(page, configuredName);
    await pp.expectProviderRowVisibleByName(page, unconfiguredName);
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
    await pp.expectProviderRowVisibleByName(page, unconfiguredName);
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

test.describe('模型服务商 - PR-D-03 详情页协议路径映射卡片展示', () => {
  let cleanup;
  let configuredName;
  let unconfiguredName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const ts = Date.now().toString(36);
    configuredName = 'provider_' + ts + '_pp';
    unconfiguredName = 'provider_' + ts + '_nopp';

    // 已配置 protocol_paths
    const cfg = await api.createProviderViaApi(page, {
      name: configuredName,
      description: '自动化测试-已配置协议路径映射',
      model_protocols: ['openai', 'anthropic'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: ['qa-detail-pp-cfg'],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
      protocol_paths: { openai: '/v1', anthropic: '/v2' },
    });
    expect(cfg).not.toBeNull();
    cleanup.trackName(configuredName);

    // 未配置 protocol_paths
    const nocfg = await api.createProviderViaApi(page, {
      name: unconfiguredName,
      description: '自动化测试-未配置协议路径映射',
      model_protocols: ['openai'],
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: ['qa-detail-pp-nocfg'],
      keys: [{ name: 'key-primary', key: 'sk-test' }],
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(nocfg).not.toBeNull();
    cleanup.trackName(unconfiguredName);

    await pp.gotoProvidersPage(page);
    await pp.expectProviderRowVisibleByName(page, configuredName);
    await pp.expectProviderRowVisibleByName(page, unconfiguredName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('已配置 protocol_paths 时展示只读卡片，未配置时不展示', async ({
    page,
  }) => {
    await test.step('已配置 protocol_paths：展示「协议路径映射」卡片，映射内容正确', async () => {
      await pp.openViewDrawer(page, configuredName);
      await pp.expectViewScopeVisible(page);

      // 卡片可见
      await pp.viewCardVisible(page, '协议路径映射');

      // 表头：02 约定为「协议」/「上游 API 基路径」
      await pp.expectViewTableHeaders(page, '协议路径映射', [
        pp.DOC.protocolPathProto,
        pp.DOC.protocolPathHeader,
      ]);

      // 映射内容：openai → /v1, anthropic → /v2
      // 注：protocol_paths 为 map，后端 JSON 序列化按 key 字典序返回（anthropic 在前），
      // UI 按接口返回顺序渲染；02 仅约定「协议名 → 路径」对应关系，未约定行序，
      // 故按协议名定位行后校验路径，不做位置断言
      const rows = pp.viewTableRows(page, '协议路径映射');
      await expect(rows).toHaveCount(2);
      const openaiRow = rows.filter({ hasText: 'openai' });
      const anthropicRow = rows.filter({ hasText: 'anthropic' });
      await expect(openaiRow).toHaveCount(1);
      await expect(openaiRow).toContainText('/v1');
      await expect(anthropicRow).toHaveCount(1);
      await expect(anthropicRow).toContainText('/v2');

      // 该 Card 仅展示，不含编辑入口
      await expect(
        pp.viewCard(page, '协议路径映射').locator('button'),
      ).toHaveCount(0);
    });

    await test.step('未配置 protocol_paths：卡片展示空态「-」，不渲染空表，仅展示形态', async () => {
      // 返回列表，关闭已配置详情
      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, unconfiguredName);

      await pp.openViewDrawer(page, unconfiguredName);
      await pp.expectViewScopeVisible(page);

      // 02 允许「不展示卡片」或「展示提示」；UI 采用后者：Card 保留并展示空态「-」，
      // 不渲染映射表（记入文件头偏差 4）
      const ppCard = pp.viewCard(page, '协议路径映射');
      await expect(ppCard).toHaveCount(1);
      await expect(ppCard.locator('.empty-text')).toHaveText('-');
      await expect(ppCard.locator('table.kv-table')).toHaveCount(0);

      // 详情仅展示，不含编辑入口
      await pp.expectViewNoInputs(page);
    });
  });
});
// ===================================================================
// PR-D-04 / PR-D-05：详情页 K8s 分支（实例数据源 = GET /k8s_pools/{name} 实时查询）
// 设计见 docs/providers/02-功能测试用例/03-详情页验证.md
// ===================================================================

const K8S_POOL_INSTANCES = [
  { addr: '10.1.0.11', port: 8000, weight: 100 },
  { addr: '10.1.0.12', port: 8001, weight: 60 },
];

let k8sSeq = 0;

function uniqueK8sName(prefix) {
  k8sSeq += 1;
  return prefix + Date.now().toString(36) + '_' + k8sSeq;
}

/**
 * 造池 + 造引用该池的 k8s_pool 服务商，并进入列表页（afterEach 清理池与 provider）
 */
async function setupK8sProvider({
  page,
  cleanup,
  poolCleanup,
  instances = K8S_POOL_INSTANCES,
  deletePoolBeforeProvider = false,
}) {
  const poolName = k8sPoolApi.POOL_NAME_PREFIX + uniqueK8sName('');
  const pool = await k8sPoolApi.createK8sPoolViaApi(page, poolName, instances);
  expect(pool, 'API 造数 K8s 池应成功').not.toBeNull();
  poolCleanup.trackPool(poolName);

  // 池不存在（404）场景：先造池再删池，然后才创建引用该池名的 provider。
  // 实测（2026-10-28）：若 provider 已引用该池再删池，后端会把池记录按空池保留
  // （DELETE 200 后 GET 仍 200 + instances: []），404 分支不可达，故采用此顺序。
  if (deletePoolBeforeProvider) {
    const deleted = await k8sPoolApi.deleteK8sPoolViaApi(page, poolName);
    expect(deleted.ok, 'InnerAPI 删除池应返回成功').toBe(true);
    expect(
      (await k8sPoolApi.getK8sPoolViaApi(page, poolName)).status,
      '删池后池详情应返回 404',
    ).toBe(404);
  }

  const providerName = uniqueK8sName('provider_');
  const data = await api.createProviderViaApi(page, {
    name: providerName,
    description: '自动化测试-详情页 K8s 分支',
    instance_source: 'k8s_pool',
    k8s_pool_name: poolName,
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: ['qa-detail-k8s'],
    keys: [],
  });
  expect(data, 'API 造数 K8s 模式服务商应成功').not.toBeNull();
  cleanup.trackName(providerName);

  await pp.gotoProvidersPage(page);
  await pp.expectProviderRowVisibleByName(page, providerName);
  return { providerName, poolName };
}

test.describe('模型服务商 - PR-D-04 详情页 K8s 分支展示', () => {
  let cleanup;
  let poolCleanup;
  let providerName;
  let poolName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    poolCleanup = k8sPoolApi.createK8sPoolTestCleanup();
    ({ providerName, poolName } = await setupK8sProvider({
      page,
      cleanup,
      poolCleanup,
    }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await poolCleanup.cleanup(page);
  });

  test('详情进入 K8s 分支：实例来源、只读标签「K8s 实例池」、实例表与 GET /k8s_pools/{name} 逐行一致', async ({
    page,
  }) => {
    const response = await pp.openViewDrawerWaitingK8sPool(
      page,
      providerName,
      poolName,
    );
    await pp.expectViewScopeVisible(page);

    await test.step('预期 1/2/3：进入 K8s 分支，实例来源与只读标签「K8s 实例池」正确', async () => {
      expect(response.status()).toBe(200);
      await pp.expectViewK8sPool(page, poolName);
    });

    await test.step('预期 4：实例表表头「实例地址/端口/权重」，数据与实时接口逐行一致', async () => {
      await pp.expectViewK8sInstanceHeaders(page);
      const poolDetail = await k8sPoolApi.getK8sPoolViaApi(page, poolName);
      expect(poolDetail.status).toBe(200);
      await pp.expectViewK8sInstances(
        page,
        poolDetail.data.instances.map((item) => ({
          addr: item.addr,
          port: item.port,
          weight: item.weight,
        })),
      );
    });

    await test.step('预期 6：只读卡片形态，无实例表单 / 编辑控件', async () => {
      await pp.expectViewInstancePoolReadonly(page);
      await pp.expectViewNoInputs(page);
      const provider = await api.getProviderViaApi(page, providerName);
      expect(provider).not.toHaveProperty('k8s_instance_pool');
    });
  });
});

test.describe('模型服务商 - PR-D-05 详情页 K8s 池实例列表实时读取与降级', () => {
  let cleanup;
  let poolCleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    poolCleanup = k8sPoolApi.createK8sPoolTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
    await poolCleanup.cleanup(page);
  });

  test('场景 ①：池内实例变更后重新打开详情即展示最新实例（实时读取，非 provider 镜像）', async ({
    page,
  }) => {
    const { providerName, poolName } = await setupK8sProvider({
      page,
      cleanup,
      poolCleanup,
    });

    await test.step('首次打开详情：实例表 = 造数时的池实例', async () => {
      const response = await pp.openViewDrawerWaitingK8sPool(
        page,
        providerName,
        poolName,
      );
      expect(response.status()).toBe(200);
      await pp.expectViewK8sInstanceHeaders(page);
      await pp.expectViewK8sInstances(page, K8S_POOL_INSTANCES);
    });

    const updatedInstances = [
      { addr: '10.9.0.31', port: 9000, weight: 70 },
      { addr: '10.9.0.32', port: 9000, weight: 30 },
    ];

    await test.step('InnerAPI 覆盖池实例后重新打开详情：展示最新实例（逐行一致）', async () => {
      const sync = await k8sPoolApi.syncK8sPoolInstancesViaApi(
        page,
        poolName,
        updatedInstances,
      );
      expect(sync.ok, 'InnerAPI 覆盖池实例应成功').toBe(true);

      await pp.gotoProvidersPage(page);
      await pp.expectProviderRowVisibleByName(page, providerName);
      const response = await pp.openViewDrawerWaitingK8sPool(
        page,
        providerName,
        poolName,
      );
      expect(response.status()).toBe(200);
      await pp.expectViewK8sInstances(page, updatedInstances);

      // provider 记录本身不含实例镜像（k8s_pools 为唯一事实源）
      const provider = await api.getProviderViaApi(page, providerName);
      expect(provider.instance_source).toBe('k8s_pool');
      expect(provider).not.toHaveProperty('k8s_instance_pool');
    });
  });

  test('场景 ②：空池（200 + instances: []）展示「当前池暂无实例（空池为合法状态）」', async ({
    page,
  }) => {
    const { providerName, poolName } = await setupK8sProvider({
      page,
      cleanup,
      poolCleanup,
      instances: [],
    });

    const response = await pp.openViewDrawerWaitingK8sPool(
      page,
      providerName,
      poolName,
    );
    await pp.expectViewScopeVisible(page);

    await test.step('空池为合法状态：接口 200 + instances: []', async () => {
      expect(response.status()).toBe(200);
      const poolDetail = await k8sPoolApi.getK8sPoolViaApi(page, poolName);
      expect(poolDetail.status).toBe(200);
      expect(poolDetail.data.instances).toEqual([]);
      expect(poolDetail.data.instance_count).toBe(0);
    });

    await test.step('实例区展示空池文案且不渲染实例表', async () => {
      await pp.expectViewK8sPool(page, poolName);
      await pp.expectViewK8sEmptyText(page, pp.DOC.k8sPoolEmpty);
      await pp.expectViewInstancePoolReadonly(page);
    });
  });

  test('场景 ③：池不存在（404）展示「K8s 池不存在（≡ 零实例）」', async ({
    page,
  }) => {
    const { providerName, poolName } = await setupK8sProvider({
      page,
      cleanup,
      poolCleanup,
      deletePoolBeforeProvider: true,
    });

    await test.step('前置：池已被删除（GET /k8s_pools/{name} → 404），provider 保留池名', async () => {
      const provider = await api.getProviderViaApi(page, providerName);
      expect(provider.instance_source).toBe('k8s_pool');
      expect(provider.k8s_pool_name).toBe(poolName);
    });

    const response = await pp.openViewDrawerWaitingK8sPool(
      page,
      providerName,
      poolName,
    );
    await pp.expectViewScopeVisible(page);

    await test.step('池不存在 ≡ 零实例：展示降级文案且不渲染实例表', async () => {
      expect(response.status()).toBe(404);
      await pp.expectViewK8sPool(page, poolName);
      // 02 验收：404 → 「K8s 池不存在（≡ 零实例）」
      // 当前实现回归缺陷：ProviderView 的 404 判定写在 catch 分支，而 $request 拦截器
      // 把错误 resolve，catch 永不执行 → 实际展示空池文案（见文件头偏差说明）。
      await pp.expectViewK8sEmptyText(page, pp.DOC.k8sPoolNotFound);
      await pp.expectViewInstancePoolReadonly(page);
      await pp.expectViewNoInputs(page);
    });
  });
});
