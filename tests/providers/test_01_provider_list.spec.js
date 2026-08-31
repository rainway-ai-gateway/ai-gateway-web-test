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
 * 模型服务商 - 列表页（PR-L-01 全量拉取与数据展示，P0）
 *
 * 覆盖用例：
 * - PR-L-01 列表加载与全量拉取：GET /providers 不携带 page/page_size 等分页/筛选 Query；
 *   列头 名称/描述/协议/模型/操作；协议列 join 展示；模型列 2 Tag + `+N`（空模型显示 `-`）。
 * - PR-L-02 名称筛选：本地筛选、大小写不敏感、清空恢复、不触发列表请求。
 * - PR-L-03 描述筛选：本地筛选、空描述不参与匹配、清空恢复。
 * - PR-L-04 协议筛选：下拉选项仅 openai/anthropic；选中后本地筛选，多协议任一命中。
 * - PR-L-05 模型筛选：基于 models join 本地筛选、大小写不敏感。
 * - PR-L-06 组合筛选：名称+协议+模型为与关系，任一条件清空后对应过滤失效。
 * - PR-L-07 前端分页：API 造数 21 条，翻页/切 pageSize 不触发列表请求，行分页正确。
 * - PR-L-08 模型列 2 Tag + `+N`：悬停 +N Tooltip 展示全部模型；空 models 显示 `-`。
 * - PR-L-09 空列表展示空态（环境依赖：系统已有服务商则跳过，见偏差 1）。
 * - PR-L-10 操作列 5 个按钮（详情/查询模型价格/分段计价配置/编辑/删除），
 *   分段计价配置为 warning 风格。
 * - PR-L-11 查询模型价格跳转 ModelPrice 列表（URL 携带 provider=<name>&autoView=1）；
 *   无定价记录提示「未找到提供商」；有定价记录自动打开详情。
 *
 * 文档/封装偏差记录（02 文档验收断言均已保留，不改 pages/api/其他 spec）：
 * 1. PR-L-09 环境依赖偏差：空列表验收要求「系统无任何服务商」，而测试环境通常已存在
 *    服务商（不可删除真实数据），故用例先 fetchProvidersViaApi 探测，非空则 test.skip。
 * 2. filterListSearch 封装（ProviderPage）仅 fill，而 iView Input 的 on-change 在失焦时
 *    才触发（fill 只派发 input 事件，不派发 change）。spec 内以 filterListSearchBlur 包装
 *    补充 blur（沿用 pp.providerTable().searchInput() 定位，不引入裸 selector）。
 * 3. PR-L-04「下拉选项仅 openai/anthropic」为断言型读取：仅枚举 dropdown 选项文本，
 *    交互仍走 pp.filterListByProtocol。
 * 4. PR-L-11 跨模块断言 ModelPrice 列表页（ProviderPage 无对应封装）：以文本/可访问性
 *    定位（getByRole/getByText）断言，详情 Drawer 以标题「定价详情」判定自动打开。
 * 5. PR-L-08 Tooltip 定位限制：.provider-models-tooltip 为 iView transfer 弹层，凡含
 *    `+N` 折叠 Tag 的行在渲染时即生成该 div（即使未悬停）；封装 expectModelsTooltip 使用
 *    未限定作用域的 locator，表格存在多个 `+N` 行时会触发 strict mode 冲突。spec 在
 *    beforeEach 先按唯一名称前缀本地筛选，确保表格仅剩本用例行（其他 `+N` 行的 Tooltip
 *    随行卸载），再悬停断言。
 * 6. PR-L-11 autoView 一次性 token：ModelPrices 页 handleAutoViewAfterFetch 消费 autoView
 *    后立即 $router.replace 将其从 URL 清除（避免刷新重复打开详情）。「URL 携带
 *    provider=<name>&autoView=1」仅为瞬时状态，spec 在点击前注册 waitForURL 捕获该瞬时
 *    URL；点击后持久 URL 仅含 provider=<name>（与 02 文档「URL 携带 autoView=1」的差异
 *    已在断言侧记录为一次性 token 行为，功能验收以自动打开详情/未找到提示为准）。
 *
 * 运行：npx playwright test tests/providers/test_01_provider_list.spec.js
 */
const { test, expect } = require('@playwright/test');
const pp = require('../../pages/providers/ProviderPage');
const api = require('../../api/provider-api-utils');
const mpa = require('../../api/model-price-api-utils');

const LIST_RE = /\/open-api\/v1\/providers$/;

async function createProviderViaApiAndTrack(page, cleanup, payload) {
  const data = await api.createProviderViaApi(page, {
    name: payload.name,
    description: payload.description,
    model_protocols: payload.model_protocols,
    model_endpoint: { schema: 'https', uri: '/v1/models' },
    models: payload.models,
    keys: [{ name: 'key-primary', key: 'sk-test' }],
    instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
  });
  expect(data).not.toBeNull();
  cleanup.trackName(payload.name);
  return payload;
}

test.describe('模型服务商 - PR-L-01 列表加载与全量拉取', () => {
  let cleanup;
  let created;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    await pp.gotoProvidersPage(page);

    // API 造数 3 个服务商：覆盖多模型(3个)/双协议/空模型
    const base = 'provider_' + Date.now().toString(36);
    created = [];
    const payloads = [
      {
        name: base + 'a',
        description: '自动化测试-多模型',
        model_protocols: ['openai'],
        models: ['qa-m-a', 'qa-m-b', 'qa-m-c'],
      },
      {
        name: base + 'b',
        description: '自动化测试-双协议',
        model_protocols: ['openai', 'anthropic'],
        models: [],
      },
      {
        name: base + 'c',
        description: '自动化测试-空模型',
        model_protocols: ['anthropic'],
        models: [],
      },
    ];
    for (const payload of payloads) {
      created.push(await createProviderViaApiAndTrack(page, cleanup, payload));
    }
    await pp.expectProvidersPageReady(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('列表请求不携带分页参数，列头完整，协议/模型列展示正确', async ({
    page,
  }) => {
    const pa = created[0];
    const pb = created[1];
    const pc = created[2];

    // 1. 捕获 reload 触发的 GET /providers 列表请求，断言不携带 page/page_size 等 Query
    const reqUrls = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && LIST_RE.test(req.url())) {
        reqUrls.push(req.url());
      }
    });
    await page.reload();
    await pp.expectProvidersPageReady(page);
    expect(reqUrls.length).toBeGreaterThan(0);
    for (const url of reqUrls) {
      expect(url, '列表请求不得携带 page 参数').not.toContain('page=');
      expect(url, '列表请求不得携带 page_size 参数').not.toContain(
        'page_size=',
      );
      expect(url, '列表请求不得携带 model_protocol 筛选参数').not.toContain(
        'model_protocol=',
      );
    }

    // 2. URL 为服务商列表页
    expect(page.url()).toContain('/providers');

    // 3. 列头完整：名称/描述/协议/模型/操作
    await pp.expectTableHeaders(page);

    // 4. 造数的 3 个服务商行可见
    const table = pp.providerTable(page);
    await table.expectRowVisible(pa.name);
    await table.expectRowVisible(pb.name);
    await table.expectRowVisible(pc.name);

    // 5. 协议列为 model_protocols join 展示（双协议行包含 "openai, anthropic"）
    const rowB = table.rowByText(pb.name);
    await expect(rowB.locator('td').nth(2)).toContainText('openai, anthropic');
    const rowA = table.rowByText(pa.name);
    await expect(rowA.locator('td').nth(2)).toContainText('openai');

    // 6. 模型列：models=3 → 最多展示 2 个 Tag + `+1` 折叠 Tag
    await expect(rowA.locator('.provider-model-tag')).toHaveCount(2);
    await expect(rowA.locator('.provider-model-more-tag')).toHaveText('+1');

    // 7. models 为空 → 模型列展示占位符 `-`
    const rowC = table.rowByText(pc.name);
    await expect(rowC.locator('td').nth(3)).toHaveText('-');
  });
});

// ---------- PR-L-02 ~ PR-L-11 ----------

/**
 * filterListSearch 的 spec 侧包装：iView Input 的 on-change 需失焦才触发（fill 只派发
 * input 事件），封装仅 fill 不会执行 pageTable 本地筛选，故补充一次 blur（偏差记录 2）。
 */
async function filterListSearchBlur(page, title, keyword) {
  await pp.filterListSearch(page, title, keyword);
  await pp
    .providerTable(page)
    .searchInput('请输入' + title + '查询')
    .blur();
  await page.waitForTimeout(300);
}

async function clearListSearchBlur(page, title) {
  await filterListSearchBlur(page, title, '');
}

test.describe('模型服务商 - PR-L-02 名称筛选（本地，不触发请求）', () => {
  let cleanup;
  let names;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const base = 'provider_' + Date.now().toString(36);
    names = [];
    const payloads = [
      { name: base + 'a', description: '自动化测试-名称筛选-甲' },
      { name: base + 'b', description: '自动化测试-名称筛选-乙' },
      { name: base + 'c', description: '自动化测试-名称筛选-丙' },
    ];
    for (const payload of payloads) {
      names.push(
        (
          await createProviderViaApiAndTrack(page, cleanup, {
            ...payload,
            model_protocols: ['openai'],
            models: [],
          })
        ).name,
      );
    }
    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(names[0]);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('名称关键词本地筛选（大小写不敏感）且清空恢复，全程不触发列表请求', async ({
    page,
  }) => {
    const [n1, n2, n3] = names;

    // 1. 输入名称关键词（故意全大写，验证大小写不敏感）→ 仅命中 n1
    await pp.expectNoListRequestDuring(page, async () => {
      await filterListSearchBlur(page, '名称', n1.toUpperCase());
      await pp.providerTable(page).expectRowVisible(n1);
      await pp.providerTable(page).expectRowHidden(n2);
      await pp.providerTable(page).expectRowHidden(n3);
    });

    // 2. 清空关键词 → 恢复全部记录
    await pp.expectNoListRequestDuring(page, async () => {
      await clearListSearchBlur(page, '名称');
      await pp.providerTable(page).expectRowVisible(n1);
      await pp.providerTable(page).expectRowVisible(n2);
      await pp.providerTable(page).expectRowVisible(n3);
    });
  });
});

test.describe('模型服务商 - PR-L-03 描述筛选（本地，空描述不匹配）', () => {
  let cleanup;
  let p1;
  let p2;
  let p3;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const base = 'provider_' + Date.now().toString(36);
    p1 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'a',
        description: '自动化测试-描述筛选-甲',
        model_protocols: ['openai'],
        models: [],
      })
    ).name;
    p2 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'b',
        description: '',
        model_protocols: ['openai'],
        models: [],
      })
    ).name;
    p3 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'c',
        description: '其他描述-丙',
        model_protocols: ['openai'],
        models: [],
      })
    ).name;
    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(p1);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('描述关键词本地筛选：仅命中含关键词行，空描述行不参与匹配，清空恢复', async ({
    page,
  }) => {
    // 1. 描述含「描述筛选」的行命中；空描述行与其他描述行隐藏
    await pp.expectNoListRequestDuring(page, async () => {
      await filterListSearchBlur(page, '描述', '描述筛选');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowHidden(p2);
      await pp.providerTable(page).expectRowHidden(p3);
    });

    // 2. 清空描述关键词 → 恢复全部记录
    await pp.expectNoListRequestDuring(page, async () => {
      await clearListSearchBlur(page, '描述');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowVisible(p2);
      await pp.providerTable(page).expectRowVisible(p3);
    });
  });
});

test.describe('模型服务商 - PR-L-04 协议筛选（下拉选项仅 openai/anthropic）', () => {
  let cleanup;
  let pOpenai;
  let pAnthropic;
  let pBoth;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const base = 'provider_' + Date.now().toString(36);
    pOpenai = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'oa',
        description: '自动化测试-协议筛选',
        model_protocols: ['openai'],
        models: [],
      })
    ).name;
    pAnthropic = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'an',
        description: '自动化测试-协议筛选',
        model_protocols: ['anthropic'],
        models: [],
      })
    ).name;
    pBoth = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'both',
        description: '自动化测试-协议筛选',
        model_protocols: ['openai', 'anthropic'],
        models: [],
      })
    ).name;
    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(pBoth);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('下拉选项仅 openai/anthropic；选中后本地筛选，多协议任一命中，不触发请求', async ({
    page,
  }) => {
    // 1. 打开协议筛选下拉，枚举选项文本断言仅 openai、anthropic（不含 gemini 等）
    //    （偏差记录 3：断言型读取，仅枚举选项文本，不驱动交互）
    const protocolSelect = pp
      .providerTable(page)
      .searchArea()
      .locator('.ivu-select')
      .first();
    await protocolSelect.click();
    await page.waitForTimeout(300);
    const optionTexts = await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .allTextContents();
    expect(
      optionTexts.map((t) => t.trim()).filter(Boolean),
      '协议筛选下拉应仅含 openai/anthropic',
    ).toEqual(['openai', 'anthropic']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 2. 选 openai → openai 行与双协议行可见，纯 anthropic 行隐藏
    await pp.expectNoListRequestDuring(page, async () => {
      await pp.filterListByProtocol(page, 'openai');
      await pp.providerTable(page).expectRowVisible(pOpenai);
      await pp.providerTable(page).expectRowVisible(pBoth);
      await pp.providerTable(page).expectRowHidden(pAnthropic);
    });

    // 3. 换选 anthropic → anthropic 行与双协议行可见，纯 openai 行隐藏
    await pp.expectNoListRequestDuring(page, async () => {
      await pp.filterListByProtocol(page, 'anthropic');
      await pp.providerTable(page).expectRowVisible(pAnthropic);
      await pp.providerTable(page).expectRowVisible(pBoth);
      await pp.providerTable(page).expectRowHidden(pOpenai);
    });
  });
});

test.describe('模型服务商 - PR-L-05 模型筛选（models join 本地筛选）', () => {
  let cleanup;
  let p1;
  let p2;
  let p3;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    const base = 'provider_' + Date.now().toString(36);
    p1 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'a',
        description: '自动化测试-模型筛选',
        model_protocols: ['openai'],
        models: ['deepseek-chat', 'gpt-4o'],
      })
    ).name;
    p2 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'b',
        description: '自动化测试-模型筛选',
        model_protocols: ['openai'],
        models: ['claude-3-5-sonnet'],
      })
    ).name;
    p3 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'c',
        description: '自动化测试-模型筛选',
        model_protocols: ['openai'],
        models: [],
      })
    ).name;
    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(p1);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('模型关键词基于 models join 本地筛选（大小写不敏感），清空恢复，不触发请求', async ({
    page,
  }) => {
    // 1. 输入模型名关键词（全大写，验证大小写不敏感）→ 命中含 deepseek-chat 的行
    await pp.expectNoListRequestDuring(page, async () => {
      await filterListSearchBlur(page, '模型', 'DEEPSEEK');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowHidden(p2);
      await pp.providerTable(page).expectRowHidden(p3);
    });

    // 2. 清空模型关键词 → 恢复全部记录
    await pp.expectNoListRequestDuring(page, async () => {
      await clearListSearchBlur(page, '模型');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowVisible(p2);
      await pp.providerTable(page).expectRowVisible(p3);
    });
  });
});

test.describe('模型服务商 - PR-L-06 组合筛选（名称+协议+模型 与关系）', () => {
  let cleanup;
  let base;
  let p1;
  let p2;
  let p3;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    base = 'provider_' + Date.now().toString(36);
    p1 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'a',
        description: '自动化测试-组合筛选',
        model_protocols: ['openai'],
        models: ['m-alpha'],
      })
    ).name;
    p2 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'b',
        description: '自动化测试-组合筛选',
        model_protocols: ['anthropic'],
        models: ['m-beta'],
      })
    ).name;
    p3 = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'c',
        description: '自动化测试-组合筛选',
        model_protocols: ['openai', 'anthropic'],
        models: ['m-gamma'],
      })
    ).name;
    await pp.gotoProvidersPage(page);
    await pp.providerTable(page).expectRowVisible(p1);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('名称+协议+模型为与关系；任一条件清空后对应过滤失效；全程不触发请求', async ({
    page,
  }) => {
    // 1. 名称=base → 3 行可见
    await pp.expectNoListRequestDuring(page, async () => {
      await filterListSearchBlur(page, '名称', base);
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowVisible(p2);
      await pp.providerTable(page).expectRowVisible(p3);
    });

    // 2. +协议 openai → p1/p3 可见，p2 隐藏
    await pp.expectNoListRequestDuring(page, async () => {
      await pp.filterListByProtocol(page, 'openai');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowVisible(p3);
      await pp.providerTable(page).expectRowHidden(p2);
    });

    // 3. +模型 m-gamma → 仅 p3（三条件与关系）
    await pp.expectNoListRequestDuring(page, async () => {
      await filterListSearchBlur(page, '模型', 'm-gamma');
      await pp.providerTable(page).expectRowVisible(p3);
      await pp.providerTable(page).expectRowHidden(p1);
      await pp.providerTable(page).expectRowHidden(p2);
    });

    // 4. 清空模型 → 模型条件失效，名称+协议仍生效：p1/p3 可见
    await pp.expectNoListRequestDuring(page, async () => {
      await clearListSearchBlur(page, '模型');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowVisible(p3);
      await pp.providerTable(page).expectRowHidden(p2);
    });

    // 5. 清空名称 → 名称条件失效，协议条件仍生效：openai 行可见
    await pp.expectNoListRequestDuring(page, async () => {
      await clearListSearchBlur(page, '名称');
      await pp.providerTable(page).expectRowVisible(p1);
      await pp.providerTable(page).expectRowVisible(p3);
    });
  });
});

test.describe('模型服务商 - PR-L-07 前端分页（翻页/切 pageSize 不触发请求）', () => {
  let cleanup;
  let base;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    base = 'provider_' + Date.now().toString(36);
    // API 造数 21 条（默认 pageSize=20 → 恰好 2 页，最后一页 1 条）
    for (let i = 0; i < 21; i += 1) {
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + String(i).padStart(2, '0'),
        description: '自动化测试-前端分页',
        model_protocols: ['openai'],
        models: [],
      });
    }
    await pp.gotoProvidersPage(page);
    await pp.expectProvidersPageReady(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('名称筛选出 21 条后翻页/切 pageSize 均为前端分页，行分页正确', async ({
    page,
  }) => {
    // 1. 名称筛选 base → 21 条（筛选与分页叠加：筛选后总条数按筛选结果计算）
    await filterListSearchBlur(page, '名称', base);
    await expect(pp.providerTable(page).dataRows()).toHaveCount(20);
    await expect(
      pp.paginationScope(page).locator('.el-pager li.number'),
    ).toHaveCount(2);

    // 2. 下一页：不触发列表请求，第 2 页 1 行
    await pp.expectNoListRequestDuring(page, async () => {
      await pp.clickPageNext(page);
      await expect(pp.providerTable(page).dataRows()).toHaveCount(1);
    });

    // 3. 上一页：回到第 1 页 20 行
    await pp.expectNoListRequestDuring(page, async () => {
      await pp.clickPagePrev(page);
      await expect(pp.providerTable(page).dataRows()).toHaveCount(20);
    });

    // 4. 每页 30 条：全部 21 行一页展示（页码 1 个），不触发请求
    await pp.expectNoListRequestDuring(page, async () => {
      await pp.selectPageSize(page, 30);
      await expect(pp.providerTable(page).dataRows()).toHaveCount(21);
      await expect(
        pp.paginationScope(page).locator('.el-pager li.number'),
      ).toHaveCount(1);
    });
  });
});

test.describe('模型服务商 - PR-L-08 模型列 2 Tag + `+N` 悬停 Tooltip', () => {
  let cleanup;
  let base;
  let pMulti;
  let pEmpty;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    base = 'provider_' + Date.now().toString(36);
    pMulti = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'multi',
        description: '自动化测试-模型列',
        model_protocols: ['openai'],
        models: ['qa-m-1', 'qa-m-2', 'qa-m-3', 'qa-m-4'],
      })
    ).name;
    pEmpty = (
      await createProviderViaApiAndTrack(page, cleanup, {
        name: base + 'empty',
        description: '自动化测试-模型列',
        model_protocols: ['openai'],
        models: [],
      })
    ).name;
    await pp.gotoProvidersPage(page);
    // 偏差 5：先按唯一名称前缀本地筛选，表格仅剩本用例 2 行（其他 `+N` 行 Tooltip 随行卸载，
    // 规避 expectModelsTooltip 未限定作用域导致的 strict mode 冲突；同时保证行必然可见）
    await filterListSearchBlur(page, '名称', base);
    await pp.providerTable(page).expectRowVisible(pMulti);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('models>2 展示 2 Tag + +N；悬停 +N Tooltip 展示全部模型；空 models 显示 -', async ({
    page,
  }) => {
    // 1. models=4 → 最多 2 个 Tag + `+2` 折叠
    const row = pp.providerTable(page).rowByText(pMulti);
    await expect(row.locator('.provider-model-tag')).toHaveCount(2);
    await expect(row.locator('.provider-model-more-tag')).toHaveText('+2');

    // 2. 悬停 `+N` → Tooltip 展示全部 4 个模型（逐行展示）
    await pp.hoverModelMoreTag(page, pMulti);
    await pp.expectModelsTooltip(page, [
      'qa-m-1',
      'qa-m-2',
      'qa-m-3',
      'qa-m-4',
    ]);

    // 3. models 为空 → 模型列占位 `-`（空行不报错）
    await expect(
      pp.providerTable(page).rowByText(pEmpty).locator('td').nth(3),
    ).toHaveText('-');
  });
});

test.describe('模型服务商 - PR-L-09 空列表展示空态（环境依赖，非空则跳过）', () => {
  test('系统无服务商时展示空态，筛选/分页控件正常、添加按钮可用', async ({
    page,
  }) => {
    // 环境依赖偏差（偏差记录 1）：空列表要求「系统无任何服务商」，不可删除真实数据，
    // 故先探测；系统已有服务商则跳过本用例。
    const existing = await api.fetchProvidersViaApi(page);
    test.skip(
      existing.length > 0,
      '系统已有 ' +
        existing.length +
        ' 个服务商，无法构造空列表环境（PR-L-09 环境依赖偏差）',
    );

    await pp.gotoProvidersPage(page);

    // 1. 展示空态（表格无数据占位）
    await pp.expectEmptyProvidersTable(page);

    // 2. 筛选 / 分页控件正常显示但不报错
    await expect(pp.paginationScope(page)).toBeVisible();

    // 3. 「添加服务商」按钮可用
    await expect(
      page.getByRole('button', { name: pp.DOC.createButton }),
    ).toBeEnabled();
  });
});

test.describe('模型服务商 - PR-L-10 操作列 5 个按钮', () => {
  let cleanup;
  let providerName;

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    providerName = 'provider_' + Date.now().toString(36);
    await createProviderViaApiAndTrack(page, cleanup, {
      name: providerName,
      description: '自动化测试-操作列',
      model_protocols: ['openai'],
      models: [],
    });
    await pp.gotoProvidersPage(page);
    // 按唯一名称前缀本地筛选：表格仅剩本用例行，行必然可见且点击精确（与 fullyParallel 下
    // 其他用例并发造数（如 PR-L-07 的 21 条）互不干扰，避免行落到第 2 页导致 expectRowVisible 超时）
    await filterListSearchBlur(page, '名称', providerName);
    await pp.providerTable(page).expectRowVisible(providerName);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('操作列包含 详情/查询模型价格/分段计价配置/编辑/删除，分段计价配置为 warning 风格', async ({
    page,
  }) => {
    // 1. 5 个操作入口按钮均可见
    const row = pp.providerTable(page).rowByText(providerName);
    await expect(row.getByRole('button', { name: '详情' })).toBeVisible();
    await expect(
      row.getByRole('button', { name: '查询模型价格' }),
    ).toBeVisible();
    await expect(
      row.getByRole('button', { name: '分段计价配置' }),
    ).toBeVisible();
    await expect(row.getByRole('button', { name: '编辑' })).toBeVisible();
    await expect(row.getByRole('button', { name: '删除' })).toBeVisible();

    // 2. 「分段计价配置」为 warning 风格按钮
    await expect(row.getByRole('button', { name: '分段计价配置' })).toHaveClass(
      /ivu-btn-warning/,
    );

    // 3. 轻量验证入口可用：点击「详情」打开详情 Drawer（PR-D-01 深测）
    await pp.clickRowAction(page, providerName, '详情');
    await pp.expectViewScopeVisible(page);
  });
});

test.describe('模型服务商 - PR-L-11 查询模型价格跳转与自动打开详情', () => {
  let cleanup;
  let mpCleanup;
  let providerName;
  const MODEL = 'qa-l11-model';

  test.beforeEach(async ({ page }) => {
    cleanup = api.createProviderTestCleanup();
    mpCleanup = mpa.createModelPriceTestCleanup();
    providerName = 'provider_' + Date.now().toString(36);
    await createProviderViaApiAndTrack(page, cleanup, {
      name: providerName,
      description: '自动化测试-查询模型价格',
      model_protocols: ['openai'],
      models: [],
    });
    await pp.gotoProvidersPage(page);
    // 按唯一名称前缀本地筛选：表格仅剩本用例行，行必然可见且点击精确（与 fullyParallel 下
    // 其他用例并发造数互不干扰）
    await filterListSearchBlur(page, '名称', providerName);
    await pp.providerTable(page).expectRowVisible(providerName);
  });

  test.afterEach(async ({ page }) => {
    await mpCleanup.cleanup(page);
    await cleanup.cleanup(page);
  });

  test('无定价记录：跳转 URL 携带 provider=<name>&autoView=1，提示未找到提供商，不打开详情', async ({
    page,
  }) => {
    // 1. 点击「查询模型价格」→ 跳转 ModelPrice 列表。偏差 6：autoView 为一次性 token，
    //    消费后被应用立即从 URL 清除，故在点击前注册 waitForURL 捕获瞬时 URL
    //    （provider=<name>&autoView=1）；点击后持久 URL 仅含 provider=<name>
    const urlPromise = page.waitForURL(
      (url) =>
        url.searchParams.get('provider') === providerName &&
        url.searchParams.get('autoView') === '1',
      { timeout: 15000 },
    );
    await pp.clickRowAction(page, providerName, '查询模型价格');
    await urlPromise;

    // 2. 模型定价列表页就绪（筛选该 provider）
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });

    // 3. 无定价记录 → 提示「未找到提供商 {provider} 的模型定价」，不打开详情、不报错
    await pp.expectMessageContaining(page, '未找到提供商');
    await pp.expectMessageContaining(page, providerName);
    await expect(page.getByText('定价详情')).toHaveCount(0);
  });

  test('有定价记录：跳转后自动打开第一条详情', async ({ page }) => {
    // 前置：API 造数 1 条该 provider 的定价记录（偏差记录 4：跨模块造数走 api 封装）
    const created = await mpa.createModelPriceViaApi(page, {
      provider: providerName,
      model: MODEL,
      base_model: MODEL,
      mode: 'chat',
      prices: { input_cost_per_token: 0.00001 },
    });
    expect(created).not.toBeNull();
    mpCleanup.trackCombo(providerName, MODEL, 'chat');
    await pp.providerTable(page).expectRowVisible(providerName);

    // 1. 点击「查询模型价格」→ 跳转 ModelPrice 列表。偏差 6：autoView 为一次性 token，
    //    消费后被应用立即从 URL 清除，故在点击前注册 waitForURL 捕获瞬时 URL
    const urlPromise = page.waitForURL(
      (url) =>
        url.searchParams.get('provider') === providerName &&
        url.searchParams.get('autoView') === '1',
      { timeout: 15000 },
    );
    await pp.clickRowAction(page, providerName, '查询模型价格');
    await urlPromise;

    // 2. 模型定价列表页就绪
    await expect(page.getByRole('button', { name: '新增定价' })).toBeVisible({
      timeout: 15000,
    });

    // 3. 列表加载后自动打开第一条该 provider 定价记录的详情 Drawer（标题「定价详情」）
    await expect(page.getByText('定价详情')).toBeVisible({ timeout: 15000 });
  });
});
