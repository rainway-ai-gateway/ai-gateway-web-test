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
 * 模型服务商 - 字段校验矩阵（PR-V-01~PR-V-15）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/06-字段校验矩阵.md）：
 * - PR-V-01 name 必填校验（留空 / 仅空白提交被拦截；创建成功后名称不可修改）
 * - PR-V-02 name 格式校验（非法字符 / 首尾非法 / 含空白拦截；合法值通过）
 * - PR-V-03 description 长度与控制字符校验（256 通过 / 257 截断 / 控制字符拦截 / 留空合法）
 * - PR-V-04 instance_pool 至少 1 个（至少保留 1 行，删除按钮禁用；单行可提交）
 * - PR-V-05 instance.addr 必填与格式校验（IP 模式仅接受 IP；域名模式接受域名）
 * - PR-V-06 instance.port 范围校验（边界 1/65535/443 通过；空值拦截）
 * - PR-V-07 instance.weight 范围与至少一个 >0（非整数拦截；权重和=100 通过）
 * - PR-V-08 model_protocols 至少 1 个且不重复（选项仅 openai/anthropic）
 * - PR-V-09 model_endpoint.schema 校验（下拉仅 http/https，默认 https）
 * - PR-V-10 model_endpoint.uri 校验（不以 / 开头拦截；空值默认 /v1/models）
 * - PR-V-11 keys.name 必填与唯一校验（留空 / 重复 / 129 字符拦截）
 * - PR-V-12 keys.key 必填与长度校验（留空 / 513 拦截；512 通过）
 * - PR-V-13 models 回填非空不重复（mock 探测回填，输入框只读）
 * - PR-V-14 time_zone IANA 校验（Asia/Shanghai/UTC/America/Los_Angeles 通过；
 *   GMT+8/ABC/空 拦截）
 * - PR-V-15 tiers / time_ranges 校验（weekdays 固定 7 项、格式 / end<=start / 重叠拦截；
 *   weekdays=[] 每天配置提交成功）
 *
 * 文档偏差记录（02 验收优先，UI 实现差异如下，断言以 UI 可复现行为为准并在文件头记录）：
 * 1. PR-V-01 预期「提示名称必填」：UI 留空提示「请输入名称」（com.tipEnterX）、仅空白
 *    提示 tipNameRule「长度1-64字符；…」，文案与 02 不一致 → 本 spec 断言名称错误提示
 *    可见（拦截语义为验收，不锁定具体文案）。
 * 2. PR-V-02/03 预期「长度 >64/257 拦截」：name/description 输入框 maxlength(64/256)，
 *    Playwright fill 被硬性截断，超限分支不可经 UI 复现，用例断言输入值被截断至上限。
 *    description 控制字符校验需用 \u0001 等可保留控制字符：\n 会被浏览器对单行 input
 *    的值净化剔除，经 fill 无法复现（本 spec 用 \u0001 断言拦截）。
 * 3. PR-V-04 预期「空实例池提交被拦截」：UI 至少保留 1 行实例（仅剩 1 行删除按钮 disabled），
 *    空实例池不可达，以删除按钮禁用断言「至少保留 1 行」。
 * 4. PR-V-05 预期「IP 模式下输入合法 Hostname（api.deepseek.com）通过」：UI IP 模式
 *    validateInstanceAddr 仅接受 IP（isIP 4/6），域名一律提示「请输入IP地址」；域名需切换
 *    「服务商域名」模式。本用例 IP 模式验证 IP 合法/非法（含域名被拒的记录），域名模式
 *    验证域名合法。
 * 5. PR-V-06 预期「0/65536/非数字拦截」：InputNumber 默认 activeChange=true，setValue
 *    不执行 min/max 钳制 → 0/65536 越界值保留在输入框并触发「取值范围1-65535」拦截；
 *    非数字被还原为原值；合法值 1/65535 可通过（拦截语义一致，表达差异记录于此）。
 * 6. PR-V-07 预期「-1/101 拦截」：权重 InputNumber 同不钳制，-1/101 保留原值并触发
 *    「实例权重必须是0～100的整数」；非整数 1.5 同文案拦截（符合 02「非整数拦截」语义）。
 * 7. PR-V-07 预期「全部为 0 拦截（至少一个 weight > 0）」：UI 权重和=100 校验先于正权重
 *    校验，全 0 提示「实例权重之和必须等于100」→ 本 spec 断言 UI 实际文案（拦截语义一致，
 *    文案差异记录于此；见 ProviderPage.js 文件头偏差 2/7）。
 * 8. PR-V-13 预期「回填不重复」：UI discoverModels 仅 filter(Boolean) 不去重（buildPayload
 *    才用 Set 去重），mock 传唯一列表；el-select tag 可点击删除（既有偏差 PR-C-10）。
 *    空列表重新探测后 tag 经 el-tag 离场过渡异步移除，断言需自动等待（expectModelTags）。
 * 9. PR-V-15 预期「time_ranges 为空拦截 / weekdays 越界拦截」：UI 至少保留 1 个时间段
 *    （timeRanges.length<=1 删除按钮 disabled）；weekdays 为固定 7 项 Checkbox 不会越界，
 *    两分支不可经 UI 复现。
 * 10. PR-V-14/15 校验错误经 $Message.error 全局提示（PR-T 系列同）；start/end 为原生
 *     type=time input，非法时间值（25:00/12:60）Playwright fill 直接抛 Malformed value，
 *     仅空值可复现「须为 HH:MM 格式」拦截。
 *
 * 运行：npx playwright test tests/providers/test_06_provider_validation.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');

const IP_ADDR = '127.0.0.1';
const IP_ADDR_2 = '127.0.0.2';
const IP_PORT = 80;
const IP_WEIGHT = 100;
const DOMAIN = 'api.deepseek.com';

let nameSeq = 0;

function uniqueName(prefix) {
  nameSeq += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + nameSeq;
}

async function openCreateAndFillBasic(page, name, description) {
  await pp.openCreateDrawer(page);
  await pp.fillName(page, name);
  if (description) {
    await pp.fillDescription(page, description);
  }
}

/**
 * 断言提交被前端拦截：点击提交后不发 POST /providers、抽屉不关闭
 */
async function expectSubmitBlocked(page) {
  let createPosted = false;
  const handler = (req) => {
    if (
      req.method() === 'POST' &&
      /\/open-api\/v1\/providers$/.test(req.url())
    ) {
      createPosted = true;
    }
  };
  page.on('request', handler);
  await pp.clickSubmit(page);
  await page.waitForTimeout(800);
  page.off('request', handler);
  expect(createPosted, '提交应被前端拦截，不应发出 POST /providers').toBe(
    false,
  );
  await pp.expectUpsertScopeVisible(page);
}

/**
 * API 造数一个基础服务商并进入列表页（命名前缀 provider_，afterEach 清理）
 */
async function createProviderAndOpenList({ page, cleanup, overrides = {} }) {
  const name = overrides.name || 'provider_' + Date.now().toString(36);
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-校验',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [],
    keys: [{ name: 'key-old', key: 'sk-old' }],
    instance_pool: [{ addr: IP_ADDR, port: IP_PORT, weight: IP_WEIGHT }],
    ...overrides,
  });
  expect(data, 'API 造数服务商应成功').not.toBeNull();
  cleanup.trackName(name);
  await pp.gotoProvidersPage(page);
  await pp.providerTable(page).expectRowVisible(name);
  return name;
}

/**
 * 公共造数：创建未配置分段计价的服务商并进入列表页（PR-V-14/15 使用）
 */
async function setupProvider({ page }) {
  const cleanup = api.createProviderTestCleanup();
  const providerName = 'provider_' + Date.now().toString(36);
  const data = await api.createProviderViaApi(page, {
    name: providerName,
    description: '自动化测试-字段校验',
    model_protocols: ['openai'],
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: [],
    keys: [{ name: 'key-primary', key: 'sk-test' }],
    instance_pool: [{ addr: IP_ADDR, port: IP_PORT, weight: IP_WEIGHT }],
  });
  expect(data).not.toBeNull();
  cleanup.trackName(providerName);
  await pp.gotoProvidersPage(page);
  await pp.providerTable(page).expectRowVisible(providerName);
  return { cleanup, providerName };
}

// ---------- PR-V-01：name 必填校验 ----------

test.describe('模型服务商 - PR-V-01 name 必填校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('名称留空 / 仅空白提交被拦截并提示（文案差异见文件头偏差 1）', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);

    // 1. 名称留空提交 → 被拦截，名称错误提示可见（UI 实际「请输入名称」）
    await expectSubmitBlocked(page);
    await pp.expectFormItemError(page, '名称');

    // 2. 仅输入空白字符 → blur 校验即提示（UI 实际 tipNameRule，长度1-64字符规则）
    await pp.fillName(page, '   ');
    await pp.expectFormItemError(page, '名称');
    await pp.expectUpsertScopeVisible(page);
  });

  test('创建成功后名称不可修改（编辑态禁用）', async ({ page }) => {
    const name = await createProviderAndOpenList({ page, cleanup });

    await pp.openEditDrawer(page, name);
    await pp.expectNameDisabled(page);
    expect(
      await pp.getInputByLabelValue(page, pp.upsertScope(page), '名称'),
    ).toBe(name);
  });
});

// ---------- PR-V-02：name 格式校验 ----------

test.describe('模型服务商 - PR-V-02 name 格式校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('非法字符 / 首尾非法 / 含空白均拦截', async ({ page }) => {
    await pp.openCreateDrawer(page);
    const invalidNames = [
      'deep seek',
      'deep*seek',
      'deep.',
      '.deepseek',
      '-deepseek',
      '_deepseek',
      'deepseek-',
    ];
    for (const invalid of invalidNames) {
      await pp.fillName(page, invalid);
      await pp.expectFormItemError(page, '名称');
    }
  });

  test('长度 >64 被 maxlength 截断为 64（偏差 2：超限分支不可经 UI 复现）', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);
    await pp.fillName(page, 'a'.repeat(65));
    expect(
      (await pp.getInputByLabelValue(page, pp.upsertScope(page), '名称'))
        .length,
    ).toBe(64);
  });

  test('合法值（deep-seek.v2 格式）提交通过', async ({ page }) => {
    const name = uniqueName('deep-seek.v2');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().name).toBe(name);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-03：description 长度与控制字符校验 ----------

test.describe('模型服务商 - PR-V-03 description 长度与控制字符校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('257 字符被 maxlength 截断为 256；256 字符提交通过（偏差 2）', async ({
    page,
  }) => {
    const name = uniqueName('provider');

    // 1. 257 字符 → 截断为 256
    await pp.openCreateDrawer(page);
    await pp.fillName(page, name);
    await pp.fillDescription(page, 'd'.repeat(257));
    expect(
      (await pp.getInputByLabelValue(page, pp.upsertScope(page), '描述'))
        .length,
    ).toBe(256);

    // 2. 256 字符 → 提交成功，提交体 description 256 字符
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.description.length).toBe(256);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });

  test('含控制字符拦截；留空合法', async ({ page }) => {
    const name = uniqueName('provider');
    await pp.openCreateDrawer(page);
    await pp.fillName(page, name);

    // 1. 含控制字符（\u0001）→ blur 校验拦截（偏差 2：\n 会被单行 input 值净化剔除）
    await pp.fillDescription(page, '第一行\u0001第二行');
    await pp.expectFormItemError(page, '描述');

    // 2. 清空为留空 → 合法（可选字段），提交成功
    await pp.fillDescription(page, '');
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().description).toBe('');
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-04：instance_pool 至少 1 个 ----------

test.describe('模型服务商 - PR-V-04 instance_pool 至少 1 个', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('至少保留 1 行（删除按钮禁用）；单行可提交（偏差 3：空池不可达）', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);

    // 1. 初始 1 行，删除按钮禁用（至少保留 1 行，不可删空）
    await pp.expectInstanceRowCount(page, 1);
    await pp.expectInstanceDeleteDisabled(page, 0);

    // 2. 新增 1 行后可删除；删至仅剩 1 行时恢复禁用
    await pp.addInstanceRow(page);
    await pp.expectInstanceRowCount(page, 2);
    await pp.clickInstanceDelete(page, 1);
    await pp.expectInstanceRowCount(page, 1);
    await pp.expectInstanceDeleteDisabled(page, 0);

    // 3. 单行填写完整 → 提交成功
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().instance_pool).toHaveLength(1);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-05：instance.addr 必填与格式校验 ----------

test.describe('模型服务商 - PR-V-05 instance.addr 必填与格式校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('IP 模式：空地址 / 非法值 / 合法域名被拒（偏差 4），合法 IP 通过', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);

    // 1. 地址留空提交 → 拦截 + 提示「请输入IP地址」
    await expectSubmitBlocked(page);
    await pp.expectInstanceListError(page, '请输入IP地址');

    // 2. 非法 Hostname（http://x、单字符 a）→ 拦截
    await pp.fillInstanceRow(page, 0, { addr: 'http://x' });
    await pp.expectInstanceListError(page, '请输入IP地址');
    await pp.fillInstanceRow(page, 0, { addr: 'a' });
    await pp.expectInstanceListError(page, '请输入IP地址');

    // 3. 合法域名 api.deepseek.com 在 IP 模式下同样被拒（02 预期通过，UI 偏差见文件头 4）
    await pp.fillInstanceRow(page, 0, { addr: DOMAIN });
    await pp.expectInstanceListError(page, '请输入IP地址');

    // 4. 合法 IP → 提示消失 → 提交成功
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().instance_pool[0].addr).toBe(
      IP_ADDR,
    );
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });

  test('域名模式：非法域名拦截，合法域名通过', async ({ page }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.selectInstanceMode(page, '服务商域名');

    // 1. 非法域名（-abc.com）→ 拦截并提示
    await pp.fillDomainName(page, '-abc.com');
    await pp.expectFormItemError(
      page,
      '服务商域名',
      '请输入正确的服务商域名或IP地址格式，例如 example.com 或 192.168.1.1',
    );
    await expectSubmitBlocked(page);

    // 2. 合法域名 → 提交成功
    await pp.fillDomainName(page, DOMAIN);
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().instance_pool[0].addr).toBe(
      DOMAIN,
    );
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-06：instance.port 范围校验 ----------

test.describe('模型服务商 - PR-V-06 instance.port 范围校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('0/65536/非数字被 InputNumber 钳制（偏差 5）；边界 65535 提交通过', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, { addr: IP_ADDR });

    const portInput = pp
      .instanceRows(page)
      .nth(0)
      .locator('td')
      .nth(1)
      .locator('.ivu-input-number-input');

    // 1. 越界值不被钳制（偏差 5）：0 → 保留 0 并提示「取值范围1-65535」
    await pp.fillInstanceRow(page, 0, { port: 0 });
    await expect(portInput).toHaveValue('0');
    await pp.expectInstanceListError(page, '取值范围1-65535');

    // 2. 65536 → 保留 65536 并提示（越界分支不可经 UI 提交）
    await pp.fillInstanceRow(page, 0, { port: 65536 });
    await expect(portInput).toHaveValue('65536');
    await pp.expectInstanceListError(page, '取值范围1-65535');

    // 3. 非数字 → 还原为原值（65536）
    await pp.fillInstanceRow(page, 0, { port: 'abc' });
    await expect(portInput).toHaveValue('65536');

    // 4. 边界值 65535 → 错误清除 → 提交成功
    await pp.fillInstanceRow(page, 0, { port: 65535 });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().instance_pool[0].port).toBe(65535);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });

  test('端口留空提交被拦截并提示；边界值 1 提交通过', async ({ page }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, { addr: IP_ADDR });

    // 1. 留空 → 「取值范围1-65535」拦截 + 提交被拦截
    await pp.fillInstanceRow(page, 0, { port: '' });
    await pp.expectInstanceListError(page, '取值范围1-65535');
    await expectSubmitBlocked(page);

    // 2. 边界值 1 → 提示消失 → 提交成功
    await pp.fillInstanceRow(page, 0, { port: 1 });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().instance_pool[0].port).toBe(1);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-07：instance.weight 范围与至少一个 >0 ----------

test.describe('模型服务商 - PR-V-07 instance.weight 范围与至少一个 >0', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('-1/101 被钳制（偏差 6）；非整数 1.5 拦截；恢复 100 提交通过', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, { addr: IP_ADDR, port: IP_PORT });

    const weightInput = pp
      .instanceRows(page)
      .nth(0)
      .locator('td')
      .nth(2)
      .locator('.ivu-input-number-input');

    // 1. 越界值不被钳制（偏差 6）：-1 → 保留 -1 并提示整数校验；101 → 保留 101 并提示
    await pp.fillInstanceRow(page, 0, { weight: -1 });
    await expect(weightInput).toHaveValue('-1');
    await pp.expectInstanceListError(page, '实例权重必须是0～100的整数');
    await pp.fillInstanceRow(page, 0, { weight: 101 });
    await expect(weightInput).toHaveValue('101');
    await pp.expectInstanceListError(page, '实例权重必须是0～100的整数');

    // 2. 非整数 1.5 → 保留原值并触发整数校验（符合 02「非整数拦截」）
    await pp.fillInstanceRow(page, 0, { weight: 1.5 });
    await expect(weightInput).toHaveValue('1.5');
    await pp.expectInstanceListError(page, '实例权重必须是0～100的整数');

    // 3. 恢复为 100 → 提交成功
    await pp.fillInstanceRow(page, 0, { weight: IP_WEIGHT });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().instance_pool[0].weight).toBe(
      IP_WEIGHT,
    );
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });

  test('全部权重为 0 拦截（UI 提示权重和=100，偏差 7）；存在 >0 时通过', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);

    // 1. 单行权重 0 → 拦截（UI 实际提示「实例权重之和必须等于100」）
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: 0,
    });
    await pp.expectInstanceListError(page, '实例权重之和必须等于100');
    await expectSubmitBlocked(page);

    // 2. 两行 100+0=100 → 提交通过
    await pp.fillInstanceRow(page, 0, { weight: IP_WEIGHT });
    await pp.addInstanceRow(page);
    await pp.fillInstanceRow(page, 1, {
      addr: IP_ADDR_2,
      port: 81,
      weight: 0,
    });
    const response = await pp.submitUpsertAndWait(page);
    expect(
      response
        .request()
        .postDataJSON()
        .instance_pool.map((i) => i.weight),
    ).toEqual([IP_WEIGHT, 0]);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-08：model_protocols 至少 1 个且不重复 ----------

test.describe('模型服务商 - PR-V-08 model_protocols 至少 1 个且不重复', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('未选协议提交被拦截并提示；重复选择不产生重复 tag；选项仅 openai/anthropic', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 1. 清空协议 → 提交被拦截并提示「请至少选择一种模型协议」
    await pp.clearProtocols(page);
    await pp.expectFormItemError(page, '模型协议', '请至少选择一种模型协议');
    await expectSubmitBlocked(page);

    // 2. 默认已选 openai（重复选择 no-op）；加选 anthropic → 恰好 2 个 tag（不重复）
    await pp.selectProtocols(page, ['openai']);
    await pp.selectProtocols(page, ['anthropic']);
    await pp.expectProtocolTagCount(page, 2);
    await pp.selectProtocols(page, ['openai']);
    await pp.expectProtocolTagCount(page, 2);

    // 3. 下拉选项仅 openai / anthropic
    await pp.expectProtocolOptions(page, ['openai', 'anthropic']);

    // 4. 提交成功，提交体与所选一致
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().model_protocols).toEqual([
      'openai',
      'anthropic',
    ]);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-09：model_endpoint.schema 校验 ----------

test.describe('模型服务商 - PR-V-09 model_endpoint.schema 校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('下拉仅 http/https；默认 https；切换 http 提交体与所选一致', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 1. 下拉可选选项仅 http:// 与 https://
    await pp.expectEndpointSchemaOptions(page, ['https://', 'http://']);

    // 2. 默认 https://（不选择）
    await expect(
      pp
        .upsertScope(page)
        .locator('.endpoint-protocol .ivu-select-selected-value'),
    ).toHaveText('https://');

    // 3. 切换 http → 提交体 schema='http'
    await pp.selectEndpointSchema(page, 'http');
    await expect(
      pp
        .upsertScope(page)
        .locator('.endpoint-protocol .ivu-select-selected-value'),
    ).toHaveText('http://');
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().model_endpoint.schema).toBe(
      'http',
    );
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-10：model_endpoint.uri 校验 ----------

test.describe('模型服务商 - PR-V-10 model_endpoint.uri 校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('uri 不以 / 开头提交被拦截并提示；空值使用默认 /v1/models', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 1. 不以 / 开头 → blur 校验拦截
    await pp.fillEndpointUri(page, 'v1/models');
    await pp.expectFormItemError(page, '模型列表接口', 'URI必须以"/"开头');
    await expectSubmitBlocked(page);

    // 2. 清空 → 提交体使用默认 /v1/models
    await pp.fillEndpointUri(page, '');
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().model_endpoint.uri).toBe(
      '/v1/models',
    );
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });

  test('uri 输入 /v1/models 提交通过', async ({ page }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    await pp.fillEndpointUri(page, '/v1/models');
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().model_endpoint.uri).toBe(
      '/v1/models',
    );
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-11：keys.name 必填与唯一校验 ----------

test.describe('模型服务商 - PR-V-11 keys.name 必填与唯一校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('Key 名称留空 / 两行重复 / 129 字符均提交拦截', async ({ page }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 1. Key 名称留空 → 拦截并提示「Key 名称必填」
    await pp.fillKeyRow(page, 0, { name: '', key: 'sk-x' });
    await expectSubmitBlocked(page);
    await pp.expectKeysFormError(page, 'Key 名称必填');

    // 2. 两行 Key 名称相同 → 拦截并提示「Key 名称不能重复」
    await pp.fillKeyRow(page, 0, { name: 'key-same', key: 'sk-1' });
    await pp.addKeyRow(page);
    await pp.fillKeyRow(page, 1, { name: 'key-same', key: 'sk-2' });
    await expectSubmitBlocked(page);
    await pp.expectKeysFormError(page, 'Key 名称不能重复');

    // 3. Key 名称 129 字符 → 拦截并提示「Key 名称长度不能超过 128」
    await pp.fillKeyRow(page, 0, { name: 'k'.repeat(129) });
    await pp.fillKeyRow(page, 1, { name: 'k2', key: 'sk-2' });
    await expectSubmitBlocked(page);
    await pp.expectKeysFormError(page, 'Key 名称长度不能超过 128');
  });
});

// ---------- PR-V-12：keys.key 必填与长度校验 ----------

test.describe('模型服务商 - PR-V-12 keys.key 必填与长度校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('Key 值留空 / 513 字符拦截；512 字符提交通过', async ({ page }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 1. Key 值留空 → 拦截并提示「Key 值必填」
    await pp.fillKeyRow(page, 0, { name: 'k1', key: '' });
    await expectSubmitBlocked(page);
    await pp.expectKeysFormError(page, 'Key 值必填');

    // 2. Key 值 513 字符 → 拦截并提示「Key 值长度不能超过 512」
    await pp.fillKeyRow(page, 0, { name: 'k1', key: 'v'.repeat(513) });
    await expectSubmitBlocked(page);
    await pp.expectKeysFormError(page, 'Key 值长度不能超过 512');

    // 3. Key 值 512 字符 → 提交成功
    await pp.fillKeyRow(page, 0, { name: 'k1', key: 'v'.repeat(512) });
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().keys[0].key).toBe('v'.repeat(512));
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-13：models 回填非空不重复 ----------

test.describe('模型服务商 - PR-V-13 models 回填非空不重复', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('获取回填模型非空不重复，输入只读；空列表提交 models=[] 合法', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 1. mock 唯一模型列表 → 获取回填 tag 非空且不重复（偏差 8：UI 不去重，mock 传唯一列表）
    await pp.mockDiscoverModels(page, ['deepseek-chat', 'deepseek-coder']);
    await pp.discoverModelsAndWait(page);
    const tags = await pp.modelTagsText(page);
    expect(tags.length).toBeGreaterThan(0);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toEqual(['deepseek-chat', 'deepseek-coder']);
    await expect(pp.modelsSelectInput(page)).toHaveAttribute(
      'readonly',
      /readonly/,
    );

    // 2. 空列表 → tag 经离场过渡异步移除（偏差 8 补充）→ 提交体 models=[]（空数组合法）
    await pp.mockDiscoverModels(page, []);
    await pp.discoverModelsAndWait(page);
    await pp.expectModelTags(page, []);
    const response = await pp.submitUpsertAndWait(page);
    expect(response.request().postDataJSON().models).toEqual([]);
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

// ---------- PR-V-14：time_zone IANA 校验 ----------

test.describe('模型服务商 - PR-V-14 time_zone IANA 校验', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('合法 IANA 时区可提交；GMT+8/ABC/留空提交被拦截', async ({ page }) => {
    // 1. 合法时区 Asia/Shanghai、UTC、America/Los_Angeles → PUT 200（提交后 Drawer 关闭，需重开）
    for (const tz of ['Asia/Shanghai', 'UTC', 'America/Los_Angeles']) {
      await pp.openPricingTiersDrawer(page, providerName);
      await pp.fillTimeZone(page, tz);
      const response = await pp.submitPricingTiersAndWait(page);
      expect(response.request().postDataJSON().time_zone).toBe(tz);
    }

    // 2. 非法值 GMT+8 / ABC → 拦截并提示「时区须为合法 IANA 时区名」，Drawer 不关闭
    await pp.openPricingTiersDrawer(page, providerName);
    for (const bad of ['GMT+8', 'ABC']) {
      await pp.fillTimeZone(page, bad);
      await pp.clickSubmitPricingTiers(page);
      await pp.expectMessageContaining(page, '时区须为合法 IANA 时区名');
      await pp.expectPricingTiersScopeVisible(page);
    }

    // 3. 留空 → 拦截并提示「请填写时区」，Drawer 不关闭
    await pp.fillTimeZone(page, '');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '请填写时区');
    await pp.expectPricingTiersScopeVisible(page);
  });
});

// ---------- PR-V-15：tiers / time_ranges 校验 ----------

test.describe('模型服务商 - PR-V-15 tiers / time_ranges 校验', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    ({ cleanup, providerName } = await setupProvider({ page }));
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('time_ranges 为空不可达（至少保留 1 行删除禁用）；weekdays 固定 7 项（偏差 9）', async ({
    page,
  }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. 至少保留 1 个时间段（仅剩 1 行时删除按钮禁用，空表不可达）
    await pp.expectTimeRangeRowCount(page, 1);
    await pp.expectDeleteTimeRangeDisabled(page, 0);

    // 2. 适用时段为固定 7 项 Checkbox（周一~周日），不会产生越界取值
    await pp.expectWeekdayOptionsCount(page, 0, 7);
  });

  test('非 HH:MM / end<=start 提交被拦截提示', async ({ page }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. start/end 为空（非 HH:MM 格式）→ 拦截「须为 HH:MM 格式」
    await pp.fillTimeInput(page, 0, 'start', '');
    await pp.fillTimeInput(page, 0, 'end', '');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '须为 HH:MM 格式');
    await pp.expectPricingTiersScopeVisible(page);

    // 2. 合法格式但 end<=start → 拦截「结束时间须大于开始时间」
    await pp.fillTimeInput(page, 0, 'start', '12:00');
    await pp.fillTimeInput(page, 0, 'end', '09:00');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '结束时间须大于开始时间');
    await pp.expectPricingTiersScopeVisible(page);
  });

  test('同 tier 时间段重叠提交被拦截提示，改为不重叠可提交', async ({
    page,
  }) => {
    await pp.openPricingTiersDrawer(page, providerName);

    // 1. 两行均工作日，时间相交（09:00-12:00 与 10:00-11:00）→ 拦截
    await pp.addTimeRangeRow(page);
    await pp.fillTimeInput(page, 1, 'start', '10:00');
    await pp.fillTimeInput(page, 1, 'end', '11:00');
    await pp.clickSubmitPricingTiers(page);
    await pp.expectMessageContaining(page, '个时间段存在重叠');
    await pp.expectPricingTiersScopeVisible(page);

    // 2. 改为不重叠（13:00-18:00）→ 提交成功
    await pp.fillTimeInput(page, 1, 'start', '13:00');
    await pp.fillTimeInput(page, 1, 'end', '18:00');
    const response = await pp.submitPricingTiersAndWait(page);
    expect(response.request().postDataJSON().tiers[0].time_ranges).toHaveLength(
      2,
    );
  });

  test('合法配置：全选 7 天提交 weekdays=[]（表示每天）', async ({ page }) => {
    await pp.openPricingTiersDrawer(page, providerName);
    await pp.clickWeekdayQuickLink(page, '全选');
    await pp.expectWeekdayCheckedCount(page, 0, 7);
    const response = await pp.submitPricingTiersAndWait(page);
    expect(
      response.request().postDataJSON().tiers[0].time_ranges[0].weekdays,
    ).toEqual([]);
  });
});
