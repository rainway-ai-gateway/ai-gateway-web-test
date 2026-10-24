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
 * 模型定价 - 只读管理员视角 MP-RO-01 ~ MP-RO-03
 *
 * 覆盖用例（docs/model-prices/02-功能测试用例/08-只读视角.md）：
 * - MP-RO-01 只读视角列表工具栏写按钮隐藏
 * - MP-RO-02 只读视角列表操作列写操作隐藏、只读入口「详情」保留
 * - MP-RO-03 只读视角详情页纯只读、无写操作入口
 *
 * 设计（沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（只写当前 page 的 localStorage，**不写 auth.json**，避免覆盖
 *   默认 admin 会话）。
 * - 只读导航走 `ModelPricePage.gotoModelPricePageReadonly`（仅直连 URL + 就绪判定），
 *   **不调用** `ensureSessionHealthy` / `ensureLoggedIn` / `handleUrlInvalidAlert`：
 *   它们会以 conf.json 的 admin 凭证重登并回写 auth.json，把只读态换成管理员态。
 * - 数据策略：文档「测试数据」约定**复用环境既有记录，不造数**——beforeAll 用独立
 *   admin context 取目标记录（优先环境基线 deepseek/deepseek-v3/chat，缺失时回退列表
 *   首条）并留字段快照，afterAll 仅回读复核该记录未被改动；全程无写入，无需清理。
 * - 隐藏机制分类（见 pages/model-prices/ModelPricePage.js 只读块头注释）：
 *   `.action-bar` 挂 `v-has` → `expectVHasHidden`；操作列「编辑 / 删除」由
 *   `store.isReadonly()` 分支收敛、根本不渲染 → `expectHidden`。
 *
 * 文案偏差：文档 MP-RO-02 称只读入口为「详情」，UI 实际按钮文案为「查看」
 * （`com.see`，ai-gateway-web src/i18n/zh.js:57），两者为同一只读入口。
 *
 * 运行：nvm use 18 && PW_WORKERS=1 npx playwright test tests/model-prices/test_09_model_price_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const mp = require('../../pages/model-prices/ModelPricePage');
const api = require('../../api/model-price-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 环境基线记录（docs 08-只读视角.md「测试数据」），优先复用；缺失时回退列表首条 */
const PREFERRED_COMBO = {
  provider: 'deepseek',
  model: 'deepseek-v3',
  mode: 'chat',
};

/** 只读用例共享数据：目标记录 + beforeAll 异常（用于显式前置条件断言） */
let targetRecord = null;
let beforeAllError = null;

function comboOf(record) {
  return {
    provider: record.provider,
    model: record.model,
    mode: record.mode,
  };
}

/**
 * MP-RO-02 / MP-RO-03 前置条件「列表中存在模型定价记录」。
 * 环境无记录时显式失败（不静默跳过），避免把前置缺失当成只读断言通过。
 */
function requireTargetRecord() {
  if (beforeAllError) throw beforeAllError;
  expect(
    targetRecord,
    '前置条件不成立：列表中存在模型定价记录（见 docs/model-prices/02-功能测试用例/08-只读视角.md「测试数据」）',
  ).not.toBeNull();
  return targetRecord;
}

// KV 表（limits）转成顺序无关的 map 比对（后端 Go map 键序不确定）
function kvToMap(entries) {
  const map = {};
  entries.forEach((e) => {
    map[e.key] = e.value;
  });
  return map;
}

/** 接口 map 字段转 kv 数组（供 kvToMap 比对） */
function formatKv(record, keyField) {
  const obj = record[keyField] || {};
  return Object.keys(obj).map((key) => ({
    key,
    value: String(obj[key]),
  }));
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

    const found =
      (await api.findModelPriceByComboViaApi(
        page,
        PREFERRED_COMBO.provider,
        PREFERRED_COMBO.model,
        PREFERRED_COMBO.mode,
      )) ||
      (await api.fetchModelPricesViaApi(page)).list[0] ||
      null;
    // 统一以详情接口的返回作为字段快照（afterAll 复核基准与列表投影无关）
    targetRecord = found
      ? (await api.getModelPriceByIdViaApi(page, found.id)) || found
      : null;
    if (targetRecord) {
      common.log(
        '[beforeAll] 只读用例复用环境既有记录: ' +
          `${targetRecord.provider}/${targetRecord.model}/${targetRecord.mode} ` +
          `id=${targetRecord.id}`,
      );
    } else {
      common.log(
        '[beforeAll] 环境无模型定价记录，MP-RO-02/03 前置条件不成立（不造数，按文档「测试数据」复用策略）',
      );
    }
  } catch (e) {
    beforeAllError = e;
    common.log('[beforeAll] 前置数据读取异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!targetRecord) return;
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
    // 复用型数据策略：本 spec 全程只读，不造数、不改动环境数据，
    // afterAll 只回读复核目标记录仍在且 prices 未变（被改动即环境异常，需人工排查）。
    // 同目录其它 spec（YAML 导入 / 分页）会 resetModelPricesToBaseline（replace 重建表，
    // id 会变），故按 id 读不到时回退按 (provider, model, mode) 复查，不对 id 漂移报错。
    let after = await api.getModelPriceByIdViaApi(page, targetRecord.id);
    if (!after) {
      common.log('[afterAll] 按 id 未读到目标记录（可能被同目录 spec 的基线重置重建），改按组合复查');
      after = await api.findModelPriceByComboViaApi(
        page,
        targetRecord.provider,
        targetRecord.model,
        targetRecord.mode,
      );
    }
    if (!after) {
      // 记录由环境基线提供、本 spec 从未写入，缺失不归本 spec 负责，仅告警不失败
      common.log(
        '[afterAll] 环境已无目标记录（本 spec 全程只读，未写入），请确认环境基线数据',
      );
      return;
    }
    expect(
      after.prices,
      'afterAll：目标记录 prices 不应被改动',
    ).toEqual(targetRecord.prices);
    common.log('[afterAll] 目标记录复核通过（未被改动），无需清理');
  } catch (e) {
    common.log('[afterAll] 复核异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('模型定价 - MP-RO-01 只读视角列表工具栏写按钮隐藏', () => {
  test('只读视角隐藏「+ 新增定价」「YAML 导入」，仅保留筛选/搜索/分页；管理员可见两写入口（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：页头「+ 新增定价」「YAML 导入」可见且可用', async () => {
      await mp.gotoModelPricePage(page);
      await readonly.expectAdminEnabled(
        mp.modelPriceCreateBtn(page),
        '「+ 新增定价」',
      );
      await readonly.expectAdminEnabled(
        mp.modelPriceImportBtn(page),
        '「YAML 导入」',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入模型定价列表页', async () => {
      await mp.gotoModelPricePageReadonly(page);
      await mp.expectModelPricePageReadyReadonly(page);
    });

    await test.step('预期 1/2：页头写入口区仍在 DOM 但被 v-has 隐藏，两写按钮不可见', async () => {
      await readonly.expectVHasHidden(
        mp.modelPriceActionBar(page),
        '页头写入口区（.action-bar）',
      );
      await readonly.expectHidden(
        mp.modelPriceCreateBtn(page),
        '「+ 新增定价」',
      );
      await readonly.expectHidden(mp.modelPriceImportBtn(page), '「YAML 导入」');
    });

    await test.step('预期 3：只读相关内容（列头、筛选/搜索行、分页）保留可见', async () => {
      await mp.expectTableHeaders(page);
      await mp.expectSearchInputVisible(page, 'provider');
      await mp.expectSearchInputVisible(page, 'model');
      await mp.expectSearchInputVisible(page, 'mode');
      await readonly.expectReadonlyVisible(
        mp.modelPriceTable(page).pagination(),
        '列表分页栏',
      );
    });

    await test.step('预期 4：两写入口均不可被触发（点击可操作性检查失败）', async () => {
      await mp.expectWriteEntryUntriggerable(
        mp.modelPriceCreateBtn(page),
        '「+ 新增定价」',
      );
      await mp.expectWriteEntryUntriggerable(
        mp.modelPriceImportBtn(page),
        '「YAML 导入」',
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('模型定价 - MP-RO-02 只读视角列表操作列写操作隐藏只读入口详情保留', () => {
  test('只读视角行内仅「查看」可开只读详情；管理员行内「编辑」「删除」可见（对照组）', async ({
    page,
  }) => {
    const record = requireTargetRecord();
    const combo = comboOf(record);

    await test.step('管理员对照：定位目标行，「查看」「编辑」「删除」均可见', async () => {
      await mp.gotoModelPricePage(page);
      await mp.focusModelPriceRow(page, combo);
      await readonly.expectAdminVisible(
        mp.modelPriceRowViewBtn(page, combo),
        '行内「查看」',
      );
      await readonly.expectAdminVisible(
        mp.modelPriceRowEditBtn(page, combo),
        '行内「编辑」',
      );
      await readonly.expectAdminVisible(
        mp.modelPriceRowDeleteBtn(page, combo),
        '行内「删除」',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入列表并定位目标行', async () => {
      await mp.gotoModelPricePageReadonly(page);
      await mp.expectModelPricePageReadyReadonly(page);
      await mp.focusModelPriceRow(page, combo);
    });

    await test.step('预期 1：操作列写入口「编辑」「删除」不展示', async () => {
      await readonly.expectHidden(
        mp.modelPriceRowEditBtn(page, combo),
        '行内「编辑」',
      );
      await readonly.expectHidden(
        mp.modelPriceRowDeleteBtn(page, combo),
        '行内「删除」',
      );
    });

    await test.step('预期 2：只读入口「查看」（文档「详情」）保留且可点击', async () => {
      await readonly.expectReadonlyVisible(
        mp.modelPriceRowViewBtn(page, combo),
        '行内「查看」',
      );
    });

    await test.step('预期 3：点击「查看」正常进入详情，且未切回管理员态', async () => {
      await mp.openViewModelPriceDrawer(page, combo);
      await mp.expectViewScopeVisible(page);
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('模型定价 - MP-RO-03 只读视角详情页纯只读无写操作入口', () => {
  test('只读视角详情抽屉仅展示字段、无任何写按钮，字段值与 GET /model-prices/{id} 一致', async ({
    page,
  }) => {
    const record = requireTargetRecord();
    const combo = comboOf(record);

    await test.step('管理员对照：详情抽屉本身即纯只读展示（无写按钮），与只读视角一致', async () => {
      await mp.gotoModelPricePage(page);
      await mp.focusModelPriceRow(page, combo);
      await mp.openViewModelPriceDrawer(page, combo);
      await mp.expectViewCards(page);
      await readonly.expectAbsent(
        mp.viewScopeButtons(page),
        '详情内容区（.model-price-view）按钮（管理员对照）',
      );
      await readonly.expectAbsent(
        mp.viewDrawerWriteActionButtons(page),
        '详情抽屉内写操作按钮（管理员对照）',
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角经列表「查看」进入某条记录详情', async () => {
      await mp.gotoModelPricePageReadonly(page);
      await mp.expectModelPricePageReadyReadonly(page);
      await mp.focusModelPriceRow(page, combo);
      await mp.openViewModelPriceDrawer(page, combo);
      await mp.expectViewScopeVisible(page);
    });

    await test.step('预期 1：四张 Card（基本信息/限制对象/价格/元数据）仅展示字段', async () => {
      await mp.expectViewCards(page);
      await readonly.expectAbsent(
        mp.viewScopeButtons(page),
        '详情内容区（.model-price-view）按钮',
      );
    });

    await test.step('预期 2：抽屉内不出现「编辑」「删除」「保存」「导入」等按钮', async () => {
      await readonly.expectAbsent(
        mp.viewDrawerWriteActionButtons(page),
        '详情抽屉内写操作按钮',
      );
    });

    await test.step('预期 3：详情字段值与 GET /model-prices/{id} 一致（只读视角查询能力保留）', async () => {
      let current = await api.getModelPriceByIdViaApi(page, record.id);
      if (!current) {
        // 目标记录被同目录 spec 的基线重置重建时 id 会变，改按组合定位后重取详情
        const byCombo = await api.findModelPriceByComboViaApi(
          page,
          combo.provider,
          combo.model,
          combo.mode,
        );
        current = byCombo
          ? await api.getModelPriceByIdViaApi(page, byCombo.id)
          : null;
      }
      expect(current, '只读视角应可查询 GET /model-prices/{id}').not.toBeNull();

      expect(
        await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.provider),
      ).toBe(current.provider);
      expect(
        await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.model),
      ).toBe(current.model);
      expect(
        await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.baseModel),
      ).toBe(current.base_model);
      expect(
        await mp.viewInfoValue(page, mp.LABEL.basicInfo, mp.LABEL.mode),
      ).toBe(current.mode);
      await mp.expectViewPricesNumericallyEqual(page, current.prices);
      expect(
        kvToMap(await mp.viewKvEntries(page, mp.LABEL.limits)),
        '详情页「限制对象」应与接口 limits 一致',
      ).toEqual(kvToMap(formatKv(current, 'limits')));
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});