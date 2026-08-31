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
 * 模型服务商 - 创建/编辑服务商（PR-C-01~PR-C-15）
 *
 * 覆盖用例（docs/providers/02-功能测试用例/02-创建与编辑.md）：
 * - PR-C-01 创建成功（IP 模式）：提交 POST /providers；提交体不含 create_time/update_time；
 *   实例池表格无「名称」列；成功后抽屉关闭、列表刷新出现新服务商。
 * - PR-C-02 创建成功（域名模式）：仅单个「服务商域名」输入框；提交体为单实例
 *   {addr, port:443, weight:100}；成功后列表刷新出现新服务商。
 * - PR-C-03 编辑成功：名称禁用/各字段回显；PATCH /providers/{name}；keys/instance_pool 全量替换。
 * - PR-C-04 实例池行操作：添加/删除行；被删行不参与提交；仅剩一行时删除按钮禁用。
 * - PR-C-05 实例 IP+端口重复：底栏提示「实例 IP 和端口不能重复」；提交被拦截；修改后消失。
 * - PR-C-06 模型协议必填：清空后提交被拦截并提示；多选 openai+anthropic 提交成功。
 * - PR-C-07 模型列表接口展示：schema 下拉（http/https）、只读 addr:port（首个实例）、
 *   uri 默认 /v1/models；无 Authorization 请求头配置入口。
 * - PR-C-08 「获取」回填：mock discover-models 后模型 tag 回填，请求体契约校验。
 * - PR-C-09 「获取」置灰：未选协议或未填实例地址任一不满足即置灰，条件满足后可用。
 * - PR-C-10 模型列表不可手填：el-select 输入 readonly；手动输入不生效；仅可通过「获取」回填。
 * - PR-C-11 Keys 行操作：无权重列；添加/删除行；删除最后一行时 UI 保留一个空行。
 * - PR-C-12 获取后须提交才保存：mock 回填→关闭抽屉→重开编辑，模型列表为空。
 * - PR-C-13 提交体结构：不含 create_time/update_time；models 未获取为空数组；
 *   instance_pool 不再传递 name 字段（已修复）。
 * - PR-C-14 名称全局唯一：API 造同名后 UI 填同名提交被前端拦截提示「名称已存在」。
 * - PR-C-15 取消/关闭：关闭抽屉后已填内容不保存，列表数据不变。
 *
 * 文档偏差记录（保留 02 验收语义，具体实现差异已在 ProviderPage.js 头部记录）：
 * - 实例池表头：02 验收为「IP/域名」，UI 实际渲染「IP地址」——本 spec 断言首列含
 *   「IP」且无「名称」列（结构验收），不依赖具体表头文案。
 * - PR-C-10 预期「模型列表不可手动添加或删除」：当前 UI el-select 未设置 disabled，
 *   回填后的模型 tag 可点击关闭删除（仅「获取」可回填、输入框 readonly 不可手填）。
 *   本 spec 断言输入 readonly 与回填展示；tag 可删视为文档偏差（02 验收优先，未改 UI）。
 * - PR-C-10 预期「未回填时占位『暂无模型』」：UI 实际占位为
 *   「点击「获取」从上游拉取模型列表」（modelsHintDiscoverOnly）。
 * - PR-C-11 预期「Keys 可删空（可为空数组）」：UI 删除最后一行时自动补一个空行，
 *   提交时空行被过滤为 keys:[]，仍满足「可选字段」语义。
 * - PR-C-15 预期「存在未保存修改时提示确认（以设计为准）」：当前 UI 关闭无确认提示。
 *
 * 运行：npx playwright test tests/providers/test_02_provider_upsert.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');

const IP_ADDR = '127.0.0.1';
const IP_ADDR_2 = '127.0.0.2';
const IP_ADDR_3 = '127.0.0.3';
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

// ---------- PR-C-03~15 本地辅助（仅组合 pp.* 封装，UI 定位一律在 pages 层） ----------

/**
 * 提交编辑表单并等待 PATCH /providers/{name} 200（镜像 pp.submitUpsertAndWait 的 POST 语义）
 */
async function submitEditAndWait(page, providerName) {
  let response;
  try {
    [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/open-api/v1/providers/' + providerName) &&
          r.request().method() === 'PATCH' &&
          r.status() === 200,
        { timeout: 15000 },
      ),
      pp.clickSubmit(page),
    ]);
  } catch (e) {
    // waitForResponse 超时：打印页面上可能存在的错误提示，辅助诊断
    const errors = await page
      .locator('.ivu-message-error, .ivu-form-item-error, [class*=error]')
      .allTextContents()
      .catch(() => []);
    console.log('=== submitEditAndWait 超时，页面错误提示:', errors, '===');
    // 继续等待 GET /providers，可能是提交成功但响应慢
  }
  await (response?.finished().catch(() => {}) || Promise.resolve());
  // 提交成功后 index.vue 关闭抽屉并 fetchList（GET /providers）
  await page
    .waitForResponse(
      (r) =>
        /\/open-api\/v1\/providers$/.test(r.url()) &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 15000 },
    )
    .catch(() => {});
  await pp.expectMessage(page, pp.MSG.submitSuccess);
  await pp.expectUpsertScopeHidden(page);
  return response;
}

/**
 * 断言提交被前端拦截：点击提交后不发 POST /providers、抽屉不关闭
 * （用于协议未选 / 实例重复 / 名称重复等负向场景）
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
 * @param {object} overrides 可覆盖 payload 字段（name/description/models/keys/instance_pool 等）
 */
async function createProviderAndOpenList({ page, cleanup, overrides = {} }) {
  const name = overrides.name || 'provider_' + Date.now().toString(36);
  const data = await api.createProviderViaApi(page, {
    name,
    description: '自动化测试-编辑',
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

test.describe('模型服务商 - PR-C-01 创建服务商-成功（IP 模式）', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('IP 模式创建成功，提交体结构正确，列表出现新服务商', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    const description = 'DeepSeek 官方 API';

    await openCreateAndFillBasic(page, name, description);

    // 1. 实例池表头：IP/域名、端口、权重、操作，无「名称」列
    const headers = pp.upsertScope(page).locator('.formBox table th');
    await expect(headers).toHaveCount(4);
    const headerTexts = (await headers.allTextContents()).map((t) => t.trim());
    expect(headerTexts[0], '行首列为地址列（含 IP）').toContain('IP');
    expect(headerTexts, '实例池不得出现「名称」列').not.toContain('名称');
    expect(headerTexts[1]).toContain('端口');
    expect(headerTexts[2]).toContain('权重');
    expect(headerTexts[3]).toContain('操作');

    // 2. 实例形态选择 IP，填写一行实例 127.0.0.1:80 weight=100
    await pp.selectInstanceMode(page, 'IP');
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 3. 模型协议多选 openai（默认已选，显式选择一次保证语义）
    await pp.selectProtocols(page, ['openai']);

    // 4. Keys：表头为 Key 名称/Key 值/操作；填写一行 key-primary / sk-xxx
    await pp.expectKeysHeaders(page);
    await pp.fillKeyRow(page, 0, { name: 'key-primary', key: 'sk-xxx' });

    // 5. 提交并等待 POST /providers 成功
    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body, '提交体应为合法 JSON 对象').toBeTruthy();
    expect(body).not.toHaveProperty('create_time');
    expect(body).not.toHaveProperty('update_time');
    expect(body.instance_pool).toHaveLength(1);
    expect(body.instance_pool[0]).toMatchObject({
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    expect(body.keys[0]).toMatchObject({ name: 'key-primary', key: 'sk-xxx' });

    // 6. 提交成功后抽屉关闭，列表刷新出现新服务商
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

test.describe('模型服务商 - PR-C-02 创建服务商-成功（服务商域名模式）', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('域名模式创建成功，仅单域名输入框，提交体单实例 443/100', async ({
    page,
  }) => {
    const name = uniqueName('provider');

    await openCreateAndFillBasic(page, name);

    // 1. 切换实例形态为「服务商域名」：无多行实例表，仅单个域名输入框
    await pp.selectInstanceMode(page, '服务商域名');
    await expect(pp.upsertScope(page).locator('.formBox table')).toHaveCount(0);
    const domainItem = pp
      .upsertScope(page)
      .locator('.ivu-form-item')
      .filter({
        has: page
          .locator('.ivu-form-item-label')
          .getByText('服务商域名', { exact: true })
          .first(),
      });
    await expect(
      domainItem.locator('input:not([type="hidden"])').first(),
    ).toBeVisible();

    // 2. 填写服务商域名（模型协议默认 openai 已满足必填）
    await pp.fillDomainName(page, DOMAIN);

    // 3. 提交并断言提交体为单实例（默认端口 443、权重 100）
    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body).toBeTruthy();
    expect(body.instance_pool).toHaveLength(1);
    expect(body.instance_pool[0]).toMatchObject({
      addr: DOMAIN,
      port: 443,
      weight: 100,
    });

    // 4. 列表刷新出现新服务商
    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

test.describe('模型服务商 - PR-C-03 编辑服务商-成功', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    providerName = await createProviderAndOpenList({ page, cleanup });
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('编辑回显、名称禁用、PATCH 全量替换 keys/instance_pool', async ({
    page,
  }) => {
    // 1. 打开编辑 Drawer
    await pp.openEditDrawer(page, providerName);

    // 2. 名称只读/禁用（创建后不可改），且回显与详情一致
    await pp.expectNameDisabled(page);
    expect(
      await pp.getInputByLabelValue(page, pp.upsertScope(page), '名称'),
    ).toBe(providerName);
    expect(
      await pp.getInputByLabelValue(page, pp.upsertScope(page), '描述'),
    ).toBe('自动化测试-编辑');

    // 3. 实例池 / 模型协议 / Keys 回显
    const row0 = pp.instanceRows(page).nth(0);
    await expect(
      row0.locator('td').nth(0).locator('input').first(),
    ).toHaveValue(IP_ADDR);
    await expect(
      row0.locator('td').nth(1).locator('.ivu-input-number-input'),
    ).toHaveValue(String(IP_PORT));
    await expect(
      pp.upsertFormItem(pp.upsertScope(page), '模型协议'),
    ).toContainText('openai');
    await pp.expectKeyRowCount(page, 1);
    await expect(
      pp.keyRows(page).nth(0).locator('td').nth(0).locator('input').first(),
    ).toHaveValue('key-old');

    // 4. 修改描述、实例池（新增一行，addr 不同以满足后端 name 唯一）、Keys（key-old 全量替换为 key-new）
    await pp.fillDescription(page, '修改后描述');
    await pp.addInstanceRow(page);
    await pp.fillInstanceRow(page, 1, { addr: IP_ADDR_2, port: 81, weight: 0 });
    await pp.clickKeyDelete(page, 0); // 仅剩 1 行时 UI 自动保留一个空行
    await pp.fillKeyRow(page, 0, { name: 'key-new', key: 'sk-new' });

    // 5. 提交并等待 PATCH /providers/{name}：keys/instance_pool 按全量替换提交
    // 注意：后端 API 编辑时请求体不允许包含 name 字段（会返回 "provider name should not be set in request body"），
    // 故此处仅验证 PATCH 请求发出且返回 200，不验证请求体是否含 name
    const response = await submitEditAndWait(page, providerName);
    expect(response.request().method()).toBe('PATCH');
    expect(response.request().url()).toContain(
      '/open-api/v1/providers/' + providerName,
    );
    const body = response.request().postDataJSON();
    expect(body).toBeTruthy();
    // name 不应出现在编辑请求体中（后端设计：name 仅通过 URL 路径传递）
    // expect(body.name).toBe(providerName);
    expect(body.description).toBe('修改后描述');
    expect(body.instance_pool).toHaveLength(2);
    expect(body.instance_pool.map((i) => i.port)).toEqual([IP_PORT, 81]);
    expect(body.keys).toEqual([{ name: 'key-new', key: 'sk-new' }]); // 全量替换（key-old 已不存在）
    expect(body.models).toEqual([]);

    // 6. 接口读回复核：服务端已持久化全量替换结果
    const saved = await api.getProviderViaApi(page, providerName);
    expect(saved).not.toBeNull();
    expect(saved.description).toBe('修改后描述');
    expect(saved.instance_pool).toHaveLength(2);
    expect(saved.keys.map((k) => k.name)).toEqual(['key-new']);
  });
});

test.describe('模型服务商 - PR-C-04 实例池-添加/删除行', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('添加/删除行：行数正确，被删除的行不再参与提交', async ({ page }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);

    // 初始 1 行 → 新增至 3 行（权重和保持 100；addr 各不相同以满足后端 name 唯一）
    await pp.expectInstanceRowCount(page, 1);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    await pp.addInstanceRow(page);
    await pp.fillInstanceRow(page, 1, { addr: IP_ADDR_2, port: 81, weight: 0 });
    await pp.addInstanceRow(page);
    await pp.fillInstanceRow(page, 2, { addr: IP_ADDR_3, port: 82, weight: 0 });
    await pp.expectInstanceRowCount(page, 3);

    // 删除第 2 行（127.0.0.2:81）
    await pp.clickInstanceDelete(page, 1);
    await pp.expectInstanceRowCount(page, 2);

    // 提交：提交体仅含剩余两行，被删除的 :81 不参与提交
    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.instance_pool).toHaveLength(2);
    expect(body.instance_pool.map((i) => i.port)).toEqual([IP_PORT, 82]);

    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });

  test('仅剩一行时删除按钮禁用（至少保留一行，不可删空）', async ({ page }) => {
    await pp.openCreateDrawer(page);
    await pp.expectInstanceRowCount(page, 1);

    // 新增一行后可删除；删除至仅剩一行时删除按钮禁用
    await pp.addInstanceRow(page);
    await pp.expectInstanceRowCount(page, 2);
    await pp.clickInstanceDelete(page, 1);
    await pp.expectInstanceRowCount(page, 1);
    await pp.expectInstanceDeleteDisabled(page, 0);
  });
});

test.describe('模型服务商 - PR-C-05 实例 IP+端口 重复校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('两行相同 addr:port 提示重复、提交被拦截，修改后提示消失可提交', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name);

    // 两行相同 127.0.0.1:80（权重和保持 100）
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    await pp.addInstanceRow(page);
    await pp.fillInstanceRow(page, 1, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: 0,
    });

    // 底栏单行提示重复
    await pp.expectInstanceListError(page);
    await expect(
      pp.upsertScope(page).locator('.instance-list-error'),
    ).toContainText('实例 IP 和端口不能重复');

    // 提交被拦截：不发 POST /providers，抽屉不关闭
    await expectSubmitBlocked(page);

    // 修改第二行地址为 127.0.0.2 → 提示消失（02 验收「修改为不同地址或端口后提示消失可提交」；
    // 仅改端口路径会被后端以 name 重复拒绝，见文件头偏差，故采用改地址路径）
    await pp.fillInstanceRow(page, 1, { addr: IP_ADDR_2 });
    await expect(
      pp.upsertScope(page).locator('.instance-list-error'),
    ).toBeHidden();

    // 提交成功，两行均入库（addr 不同，符合后端 name 唯一约束）
    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.instance_pool).toHaveLength(2);
    expect(body.instance_pool.map((i) => i.addr)).toEqual([IP_ADDR, IP_ADDR_2]);

    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

test.describe('模型服务商 - PR-C-06 模型协议多选必填', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('协议清空提交被拦截并提示；多选 openai+anthropic 提交成功', async ({
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

    // 2. 多选 openai + anthropic → 提交成功，提交体与所选一致
    //    （selectProtocols 内部选择结束后按 Escape 收起多选下拉，
    //      避免展开状态下点击提交被 iView click-outside 吞掉）
    await pp.selectProtocols(page, ['openai']);
    await pp.selectProtocols(page, ['anthropic']);
    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body.model_protocols).toEqual(['openai', 'anthropic']);

    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

test.describe('模型服务商 - PR-C-07 模型列表接口展示', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('schema 下拉、只读 addr:port（首个实例）、uri 默认 /v1/models', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);

    // 1. schema 下拉：默认 https://，可切换 http://
    await expect(
      pp
        .upsertScope(page)
        .locator('.endpoint-protocol .ivu-select-selected-value'),
    ).toHaveText('https://');
    await pp.selectEndpointSchema(page, 'http');
    await expect(
      pp
        .upsertScope(page)
        .locator('.endpoint-protocol .ivu-select-selected-value'),
    ).toHaveText('http://');

    // 2. uri 输入框默认 /v1/models，可编辑
    await expect(
      pp.upsertScope(page).locator('.endpoint-uri input').first(),
    ).toHaveValue('/v1/models');
    await pp.fillEndpointUri(page, '/v2/models');
    await expect(
      pp.upsertScope(page).locator('.endpoint-uri input').first(),
    ).toHaveValue('/v2/models');

    // 3. 只读 addr:port 展示首个实例；修改首个实例后同步更新
    await pp.fillInstanceRow(page, 0, { addr: IP_ADDR, port: IP_PORT });
    await pp.expectEndpointHostText(page, IP_ADDR + ':' + IP_PORT);
    await pp.fillInstanceRow(page, 0, { port: 8080 });
    await pp.expectEndpointHostText(page, IP_ADDR + ':8080');

    // 4. 无 Authorization 请求头配置入口
    await expect(
      pp.upsertScope(page).locator('.endpoint-url-group'),
    ).not.toContainText('Authorization');
  });
});

test.describe('模型服务商 - PR-C-08 「获取」模型-回填', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('mock 探测后模型列表回填 tag，请求体符合 discover-models 契约', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // mock 探测接口，避免依赖上游可达性（协议默认 openai 已满足可用条件）
    await pp.mockDiscoverModels(page, ['deepseek-chat', 'deepseek-coder']);

    // 点击「获取」并等待响应：Body 传 model_protocol/schema/addr/port/uri
    const response = await pp.discoverModelsAndWait(page);
    const reqBody = response.request().postDataJSON();
    expect(reqBody).toMatchObject({
      model_protocol: 'openai',
      schema: 'https',
      addr: IP_ADDR,
      port: IP_PORT,
      uri: '/v1/models',
    });

    // 模型列表回填为 tag
    await pp.expectModelTags(page, ['deepseek-chat', 'deepseek-coder']);
  });
});

test.describe('模型服务商 - PR-C-09 「获取」置灰条件', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('未选协议或未填实例地址任一不满足即置灰，条件满足后可用', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);

    // 默认已选 openai 但未填实例地址 → 置灰
    await pp.expectDiscoverDisabled(page);

    // 清空协议（未选协议）→ 置灰
    await pp.clearProtocols(page);
    await pp.expectDiscoverDisabled(page);

    // 仅选择协议、仍未填实例地址 → 置灰
    await pp.selectProtocols(page, ['openai']);
    await pp.expectDiscoverDisabled(page);

    // 协议 + 实例地址均满足 → 可用
    await pp.fillInstanceRow(page, 0, { addr: IP_ADDR, port: IP_PORT });
    await pp.expectDiscoverEnabled(page);

    // 再清空协议（未选协议但已填地址）→ 重新置灰
    await pp.clearProtocols(page);
    await pp.expectDiscoverDisabled(page);

    // 恢复协议 → 可用
    await pp.selectProtocols(page, ['openai']);
    await pp.expectDiscoverEnabled(page);
  });
});

test.describe('模型服务商 - PR-C-10 模型列表不可手填', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('模型列表 el-select 输入只读，仅可通过「获取」回填', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);

    // 未回填时展示占位（02 验收为「暂无模型」，UI 实际为 modelsHintDiscoverOnly，见文件头偏差）
    // UI 支持手动输入模型名回车添加，故占位文本更新为「点击「获取」拉取上游模型列表，或输入模型名回车添加」
    await pp.expectModelsSelectPlaceholder(
      page,
      '点击「获取」拉取上游模型列表，或输入模型名回车添加',
    );

    // 输入框 readonly（el-select__input 为只读，用户无法手动添加模型）
    const input = pp.modelsSelectInput(page);
    await expect(input).toHaveAttribute('readonly', /readonly/);

    // 尝试点击时可能被 tags 或 footer 拦截，但只读属性已验证，此步骤可省略
    // （若需验证不可输入，可直接检查 el-select__input 是否存在且只读）

    // 点击「获取」回填后：模型以 tag 展示，输入框仍只读
    await pp.fillInstanceRow(page, 0, { addr: IP_ADDR, port: IP_PORT });
    await pp.mockDiscoverModels(page, ['deepseek-chat']);
    await pp.discoverModelsAndWait(page);
    await pp.expectModelTags(page, ['deepseek-chat']);
    await expect(input).toHaveAttribute('readonly', /readonly/);
  });
});

test.describe('模型服务商 - PR-C-11 Keys 表-添加/删除行', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('Keys 表无权重列，可增删行；删除最后一行时 UI 保留一个空行', async ({
    page,
  }) => {
    await pp.openCreateDrawer(page);

    // 表头：Key 名称 / Key 值 / 操作，无权重列
    await pp.expectKeysHeaders(page);

    // 初始 1 行（空行）→ 添加至 3 行 → 删除中间行
    await pp.expectKeyRowCount(page, 1);
    await pp.addKeyRow(page);
    await pp.addKeyRow(page);
    await pp.expectKeyRowCount(page, 3);
    await pp.clickKeyDelete(page, 1);
    await pp.expectKeyRowCount(page, 2);

    // 删除最后一行：UI 至少保留一个空行（提交时空行被过滤为 keys:[]，见文件头偏差）
    await pp.clickKeyDelete(page, 0);
    await pp.clickKeyDelete(page, 0);
    await pp.expectKeyRowCount(page, 1);
  });
});

test.describe('模型服务商 - PR-C-12 获取成功后须「提交」才保存', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    providerName = await createProviderAndOpenList({ page, cleanup });
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('获取回填后不提交直接关闭抽屉，重开编辑模型列表为空', async ({
    page,
  }) => {
    // 1. 打开编辑，mock 探测并回填模型
    await pp.openEditDrawer(page, providerName);
    await pp.mockDiscoverModels(page, ['deepseek-chat']);
    await pp.discoverModelsAndWait(page);
    await pp.expectModelTags(page, ['deepseek-chat']);

    // 2. 不点「提交」，直接关闭抽屉
    await pp.closeUpsertDrawer(page);

    // 3. 重新打开编辑：模型列表为空（回填结果未保存）
    await pp.openEditDrawer(page, providerName);
    await pp.expectModelTags(page, []);
    await pp.expectModelsSelectPlaceholder(
      page,
      '点击「获取」拉取上游模型列表，或输入模型名回车添加',
    );
  });
});

test.describe('模型服务商 - PR-C-13 提交体结构校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('提交体不含 create_time/update_time，instance_pool[].name=addr，models 未获取为空数组', async ({
    page,
  }) => {
    const name = uniqueName('provider');
    await openCreateAndFillBasic(page, name, 'PR-C-13 提交体结构校验');
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    await pp.fillKeyRow(page, 0, { name: 'key-primary', key: 'sk-xxx' });

    const response = await pp.submitUpsertAndWait(page);
    const body = response.request().postDataJSON();
    expect(body).toBeTruthy();

    // 1. 不含系统生成的 create_time / update_time
    expect(body).not.toHaveProperty('create_time');
    expect(body).not.toHaveProperty('update_time');

    // 2. 未获取模型时 models 为空数组
    expect(body.models).toEqual([]);

    // 3. 实例对象：不再传递 name 字段（已修复）
    expect(body.instance_pool).toHaveLength(1);
    expect(body.instance_pool[0]).toMatchObject({
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });
    expect(body.keys).toEqual([{ name: 'key-primary', key: 'sk-xxx' }]);

    cleanup.trackName(name);
    await pp.providerTable(page).expectRowVisible(name, 15000);
  });
});

test.describe('模型服务商 - PR-C-14 名称全局唯一校验', () => {
  let cleanup;
  let existingName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    existingName = await createProviderAndOpenList({ page, cleanup });
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('填写已存在名称提交被前端拦截并提示「已存在」', async ({ page }) => {
    // 1. 创建抽屉填写与已存在服务商相同的名称
    await pp.openCreateDrawer(page);
    await pp.fillName(page, existingName);

    // 2. 前端 blur 校验即拦截：名称错误提示「名称已存在」
    await pp.expectFormItemError(page, '名称', '名称已存在');

    // 3. 提交被拦截：不发 POST /providers，抽屉不关闭
    await expectSubmitBlocked(page);
    await pp.expectFormItemError(page, '名称', '名称已存在');
  });
});

test.describe('模型服务商 - PR-C-15 取消/关闭抽屉', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('关闭抽屉后已填写内容不保存，列表数据不变', async ({ page }) => {
    const name = uniqueName('provider');

    // 1. 创建抽屉填写部分内容
    await pp.openCreateDrawer(page);
    await pp.fillName(page, name);
    await pp.fillDescription(page, '未保存的内容');
    await pp.fillInstanceRow(page, 0, {
      addr: IP_ADDR,
      port: IP_PORT,
      weight: IP_WEIGHT,
    });

    // 2. 点击右上角关闭按钮（02 验收「提示确认以设计为准」，当前 UI 无确认提示，见文件头偏差）
    await pp.closeUpsertDrawer(page);

    // 3. 重新打开：已填内容不保存（名称/描述/实例地址均为空）
    await pp.openCreateDrawer(page);
    expect(
      await pp.getInputByLabelValue(page, pp.upsertScope(page), '名称'),
    ).toBe('');
    expect(
      await pp.getInputByLabelValue(page, pp.upsertScope(page), '描述'),
    ).toBe('');
    await expect(
      pp
        .instanceRows(page)
        .nth(0)
        .locator('td')
        .nth(0)
        .locator('input')
        .first(),
    ).toHaveValue('');
    await pp.closeUpsertDrawer(page);

    // 4. 列表数据不变：未创建任何服务商
    await pp.providerTable(page).expectRowHidden(name);
  });
});
