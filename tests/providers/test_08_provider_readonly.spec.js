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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 模型服务商 - 只读管理员视角 PR-RO-01 ~ PR-RO-03
 *
 * 覆盖用例（docs/providers/02-功能测试用例/08-只读视角.md）：
 * - PR-RO-01 只读视角列表工具栏「添加服务商」写按钮隐藏（管理员可见为对照组）
 * - PR-RO-02 只读视角列表操作列写按钮隐藏、仅保留「详情」「查询模型价格」
 * - PR-RO-03 只读视角服务商 keys 掩码展示（列表 / 详情两处）与掩码值不可复用为鉴权 Key
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（只写当前 page 的 localStorage，不写 auth.json，避免覆盖默认 admin 会话）。
 * - 数据：beforeAll 用独立 admin context 造 1 条专用服务商
 *   `provider_ro_<ts>`，含 4 个不同长度（15/8/4/3）的 key 以覆盖掩码边界；afterAll 删除还原。
 *   其余断言复用环境既有服务商数据。
 * - 只读路径不调用 ensureSessionHealthy / ensureLoggedIn / handleUrlInvalidAlert，
 *   也不复用 gotoProvidersPage（其内部带会话自愈，会用 admin 凭证重登）。
 *
 * 已知断言边界（如实记录，不做「假装通过」）：
 * 1. PR-RO-03 预期 2「掩码值在列表与详情抽屉中原样展示（前端不做二次脱敏）」与源码不符：
 *    `src/modules/Providers/components/ProviderView.vue:140` 详情抽屉对 key 再调用
 *    `maskSecretKey`（`src/utils/const.js:562`：长度 ≤12 → `****`；>12 → 前 8 + `****` + 后 4）。
 *    因此 UI 实际展示的是「后端 xmask 结果再经前端掩码」的二次结果；本 spec 按**源码实际行为**
 *    断言（期望值 = displayMaskSecretKey(xmask(明文))），偏差已回写 08-只读视角.md。
 *    明文长度 >12 时两条规则结果恰好一致（如 `sk-aaaaaaaaaaaa` → `sk-a********aaaa`）。
 * 2. PR-RO-03 预期 4「掩码值不可用于鉴权」：上游鉴权发生在网关注入上游请求时，管理台 UI 无
 *    该链路入口，无法在 UI 层复现。本 spec 以「掩码值 ≠ 明文且不含完整明文，无法原样复用」
 *    的可观测断言落地，上游拒绝属后端/网关行为，由后端用例覆盖。
 * 3. v-has 写元素**必须用 CSS/文本定位**（`readonly.buttonByText`），不得用 `getByRole`：
 *    `v-has` 的隐藏手段是 `display:none`，而 Playwright role 定位基于无障碍树，看不见
 *    `display:none` 的元素——2026-10-16 首轮实测 PR-RO-01「添加服务商」、PR-RO-02
 *    「分段计价配置」即因 `getByRole` 在只读态返回 count 0 而误报。管理员对照与只读断言
 *    现已共用同一 CSS/文本定位（`providerRowActionButton`），仅可见性相反。
 *
 * 运行：nvm use 18 && npx playwright test tests/providers/test_08_provider_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const pp = require('../../pages/providers/ProviderPage');
const apiUtils = require('../../api/provider-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 只读用例专用服务商（beforeAll 造数、afterAll 清理） */
const RO_PROVIDER = {
  description: '自动化测试-只读视角',
  modelProtocols: ['openai'],
  models: ['qa-provider-ro-model'],
  /** 掩码边界样本：15（>8，取前 4 + 8* + 后 4）/ 8（>4，前 2 + 4* + 后 2）/ 4 / 3（全掩码） */
  plainKeys: [
    { name: 'key-long', key: 'sk-aaaaaaaaaaaa' },
    { name: 'key-len8', key: 'abcdefgh' },
    { name: 'key-len4', key: 'abcd' },
    { name: 'key-len3', key: 'abc' },
  ],
};

let targetProviderName = null;
let cleanup = null;

/** 期望的接口层掩码值（后端 lib/xmask 规则） */
function expectedApiMasks() {
  return RO_PROVIDER.plainKeys.map((item) => readonly.maskSecret(item.key));
}

/** 期望的 UI 展示值（后端掩码后再经前端 maskSecretKey 的二次结果） */
function expectedDisplayMasks() {
  return expectedApiMasks().map((value) => pp.displayMaskSecretKey(value));
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(readonly.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    cleanup = apiUtils.createProviderTestCleanup();
    targetProviderName = 'provider_ro_' + Date.now().toString(36);
    const created = await apiUtils.createProviderViaApi(page, {
      name: targetProviderName,
      description: RO_PROVIDER.description,
      model_protocols: RO_PROVIDER.modelProtocols,
      model_endpoint: { schema: 'https', uri: '/v1/models' },
      models: RO_PROVIDER.models,
      keys: RO_PROVIDER.plainKeys,
      instance_pool: [{ addr: '127.0.0.1', port: 80, weight: 100 }],
    });
    expect(
      created,
      '[beforeAll] 只读用例专用服务商应创建成功',
    ).not.toBeNull();
    cleanup.trackName(targetProviderName);
    common.log('[beforeAll] 只读用例数据已就绪: provider=' + targetProviderName);
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!cleanup) return;
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(readonly.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await cleanup.cleanup(page);
    common.log('[afterAll] 只读用例专用服务商已清理');
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('模型服务商 - PR-RO-01 只读视角列表工具栏写按钮隐藏', () => {
  test('只读视角工具栏不显示「添加服务商」；管理员视角该按钮正常显示（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：工具栏「添加服务商」可见', async () => {
      await pp.gotoProvidersPage(page);
      await pp.expectProvidersPageReady(page);
      await readonly.expectAdminEnabled(
        pp.createProviderButton(page),
        '添加服务商',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入服务商列表页', async () => {
      await pp.gotoProvidersPageReadonly(page);
      await pp.expectProvidersPageReadyReadonly(page);
    });

    await test.step('工具栏「添加服务商」仍渲染但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        pp.createProviderButton(page),
        '添加服务商',
      );
    });

    await test.step('工具栏无任何创建 / 新增写入口，仅保留筛选等只读控件', async () => {
      await expect(
        pp.providerToolbarButtons(page),
        '工具栏只应有「添加服务商」1 个写入口（已被 v-has 隐藏）',
      ).toHaveCount(1);
      await expect(
        pp.providerToolbarVisibleButtons(page),
        '只读视角工具栏不应存在任何可见写入口',
      ).toHaveCount(0);
      await readonly.expectReadonlyVisible(
        pp.providerNameSearchInput(page),
        '「名称」列头筛选框',
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('模型服务商 - PR-RO-02 只读视角列表操作列写按钮隐藏', () => {
  test('只读视角行内仅保留「详情」「查询模型价格」并可用；管理员视角写按钮可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：行内「分段计价配置」「编辑」「删除」可见', async () => {
      await pp.gotoProvidersPage(page);
      await pp.expectProvidersPageReady(page);
      await pp.expectProviderRowVisibleByName(page, targetProviderName);
      // 与只读断言共用同一 CSS/文本定位，仅可见性相反（对照组）
      await readonly.expectAdminVisible(
        pp.providerRowActionButton(
          page,
          targetProviderName,
          pp.DOC.pricingTiersTitle,
        ),
        '分段计价配置',
      );
      await readonly.expectAdminVisible(
        pp.providerRowActionButton(page, targetProviderName, '编辑'),
        '编辑',
      );
      await readonly.expectAdminVisible(
        pp.providerRowActionButton(page, targetProviderName, '删除'),
        '删除',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入服务商列表页并定位目标行', async () => {
      await pp.gotoProvidersPageReadonly(page);
      await pp.expectProviderRowVisibleByName(page, targetProviderName);
    });

    await test.step('操作列写按钮「分段计价配置」「编辑」「删除」被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(
        pp.providerRowActionButton(
          page,
          targetProviderName,
          pp.DOC.pricingTiersTitle,
        ),
        '分段计价配置',
      );
      await readonly.expectVHasHidden(
        pp.providerRowActionButton(page, targetProviderName, '编辑'),
        '编辑',
      );
      await readonly.expectVHasHidden(
        pp.providerRowActionButton(page, targetProviderName, '删除'),
        '删除',
      );
    });

    await test.step('操作列保留只读入口「详情」「查询模型价格」', async () => {
      await readonly.expectReadonlyVisible(
        pp.providerRowActionButton(page, targetProviderName, '详情'),
        '详情',
      );
      await readonly.expectReadonlyVisible(
        pp.providerRowActionButton(
          page,
          targetProviderName,
          pp.DOC.viewModelPrices,
        ),
        '查询模型价格',
      );
    });

    await test.step('点击「详情」可打开只读详情抽屉（只读查看能力保留）', async () => {
      await pp.openViewDrawer(page, targetProviderName);
      await pp.expectViewScopeVisible(page);
      await pp.expectViewNoInputs(page);
      await pp.expectViewTableHeaders(page, pp.LABEL.serviceAuthKeys, [
        pp.LABEL.keyName,
        pp.LABEL.keyValue,
      ]);
    });
  });
});

test.describe('模型服务商 - PR-RO-03 只读视角服务商 keys 掩码展示与鉴权失效', () => {
  test('只读视角列表 / 详情两处 keys 均返回掩码值且 UI 按源码规则展示；管理员返回明文（对照组）', async ({
    page,
  }) => {
    let adminDetail = null;

    await test.step('管理员对照：GET /providers/{name} 返回 keys 明文', async () => {
      await pp.gotoProvidersPage(page);
      await pp.expectProvidersPageReady(page);
      adminDetail = await apiUtils.getProviderViaApi(page, targetProviderName);
      expect(
        adminDetail,
        '管理员视角应能取到服务商详情',
      ).not.toBeNull();
      expect(
        (adminDetail.keys || []).map((item) => item.key),
        '管理员视角 keys[].key 应为明文',
      ).toEqual(RO_PROVIDER.plainKeys.map((item) => item.key));
    });

    await test.step('管理员对照：详情抽屉 Key 值按前端 maskSecretKey 规则展示', async () => {
      await pp.openViewDrawer(page, targetProviderName);
      const displayed = await pp.viewKeyValueTexts(page);
      expect(displayed).toEqual(
        RO_PROVIDER.plainKeys.map((item) =>
          pp.displayMaskSecretKey(item.key),
        ),
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入服务商列表页', async () => {
      await pp.gotoProvidersPageReadonly(page);
      await pp.expectProvidersPageReadyReadonly(page);
    });

    await test.step('只读视角 GET /providers 不含 keys 明文', async () => {
      const list = await apiUtils.fetchProvidersViaApi(page);
      const payload = JSON.stringify(list);
      expect(
        payload.includes(RO_PROVIDER.plainKeys[0].key),
        '只读视角列表响应不应出现明文 key（样本 ' +
          RO_PROVIDER.plainKeys[0].name +
          '）',
      ).toBe(false);
      const target = list.find(
        (item) => item && item.name === targetProviderName,
      );
      expect(target, '只读视角列表应能检索到目标服务商').toBeTruthy();
      // 列表接口若返回 keys，其值必须是掩码（不再含可用明文）
      const listKeys = (target.keys || []).map((item) => item.key);
      for (const key of listKeys) {
        expect(String(key), '只读视角列表 keys[].key 应为掩码值').toMatch(
          /\*{4,}/,
        );
      }
      expect(listKeys, '只读视角列表 keys 不应出现任何明文样本').not.toEqual(
        expect.arrayContaining(RO_PROVIDER.plainKeys.map((item) => item.key)),
      );
    });

    await test.step('只读视角 GET /providers/{name} 返回 keys 掩码值（含 15/8/4/3 边界）', async () => {
      const detail = await apiUtils.getProviderViaApi(page, targetProviderName);
      expect(detail, '只读视角应能取到服务商详情').not.toBeNull();
      expect(
        (detail.keys || []).map((item) => item.key),
        '只读视角 keys[].key 应按 lib/xmask 规则返回掩码值',
      ).toEqual(expectedApiMasks());
    });

    await test.step('只读视角详情抽屉掩码值原样展示（前端 maskSecretKey 规则）', async () => {
      await pp.expectProviderRowVisibleByName(page, targetProviderName);
      await pp.openViewDrawer(page, targetProviderName);
      const displayed = await pp.viewKeyValueTexts(page);
      expect(
        displayed,
        '详情抽屉 Key 值应为后端掩码值再经前端 maskSecretKey 的展示结果',
      ).toEqual(expectedDisplayMasks());
      for (const item of RO_PROVIDER.plainKeys) {
        expect(
          displayed.includes(item.key),
          `详情抽屉不应出现明文 key：${item.name}`,
        ).toBe(false);
      }
    });

    await test.step('掩码值不含完整明文，不可原样复用为服务商鉴权 Key', async () => {
      const masks = expectedApiMasks();
      RO_PROVIDER.plainKeys.forEach((item, index) => {
        expect(
          masks[index],
          `掩码值不应等于明文：${item.name}`,
        ).not.toBe(item.key);
        expect(
          item.key.includes(masks[index]),
          `掩码值不应是明文的可用子串：${item.name}`,
        ).toBe(false);
      });
      expect(masks[0], '长明文应保留掩码占位符').toContain('********');
    });
  });
});