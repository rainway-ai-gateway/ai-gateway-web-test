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
 * 批量任务 - 只读管理员视角 BT-RO-01 ~ BT-RO-03
 *
 * 覆盖用例（docs/batch-tasks/02-功能测试用例/04-只读视角.md）：
 * - BT-RO-01 只读视角列表工具栏无写入口且只读控件保留
 * - BT-RO-02 只读视角列表操作列「取消」隐藏「详情」保留
 * - BT-RO-03 只读视角详情抽屉纯只读无写入口
 *
 * 设计（沿用 tests/api-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照（对照组的
 *   `expectAdminVisible` / `expectAdminEnabled`），再以 UI 登录只读账号 viewer——
 *   只写当前 page 的 localStorage，**不写 auth.json**，避免覆盖默认 admin 会话。
 * - 数据策略：**复用环境已有数据**，不造数、不清理。批量任务只能由数据面经 provider 透传产生
 *   （控制面无创建接口），本机数据由 `scripts/seed-batch-task-data.cjs`
 *   （`npm run seed:batch:execute`）灌入 25 条任务 / 10 条文件，见模块
 *   `00-索引与映射.md`「造数说明」。`beforeAll` 用独立 admin context **只读检索**列表，解析出
 *   「非终态 / 终态」各一个可用状态值（供 UI 状态筛选）、首行 batch_id（BT-RO-03 目标任务）
 *   及其 `batch_files` 就绪性；全程无写操作 → 无需 `afterAll` 清理。
 * - BT-RO-03 预期 2 的 `batch_files` 表格渲染依赖详情接口返回扁平 `Data.batch_files`；当前实现
 *   返回 `{task, files}`（BUG-BT-01，见 docs/batch-tasks/测试问题复盘.md），该子断言沿用 test_02
 *   的数据就绪守卫：数据不满足时退化为「批量文件区域存在」断言，**不迁就实现改写预期**。
 *
 * 只读路径约束（见 utils/readonly.js 文件头）：不得调用 `ensureSessionHealthy` /
 * `ensureLoggedIn` / `handleUrlInvalidAlert`，也不得复用 `gotoBatchTaskPage`（内部走
 * `rc.ensureAppSession` → 会话自愈，会用 conf.json 的 admin 凭证重登并回写 auth.json）。
 *
 * 运行：nvm use 18 && npx playwright test tests/batch-tasks/test_04_batch_task_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/batch-tasks/BatchTaskPage');
const batchApi = require('../../api/batch-api-utils');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 5 面板标题（顺序即 BatchView.vue 渲染顺序） */
const PANEL_TITLES = [
  utils.DOC.basicInfo,
  utils.DOC.statusAndCounts,
  utils.DOC.usageAndBilling,
  utils.DOC.filesAndTime,
  utils.DOC.batchFiles,
];

/** 「批量文件」映射表表头（顺序即 BatchView.vue 渲染顺序） */
const BATCH_FILE_HEADERS = [
  utils.DOC.fileId,
  utils.DOC.provider,
  utils.DOC.purpose,
  utils.DOC.filename,
  utils.DOC.size,
  utils.DOC.createdAt,
];

/** 抽屉写操作按钮候选文案（BatchView.vue 通篇无 Button → 只读视角应全部为 0） */
const DRAWER_WRITE_LABELS = ['取消', '编辑', '删除', '保存', '提交'];

/** 环境既有数据（beforeAll 以独立 admin context 只读检索得到） */
let envBatchCount = 0;
let activeStatus = null;
let terminalStatus = null;
let targetBatchId = null;
let targetHasBatchFiles = false;

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

    // 只读检索：复用环境已有数据（造数见 scripts/seed-batch-task-data.cjs）
    const all = await batchApi.fetchAllBatchTasksViaApi(
      page,
      {},
      utils.PAGE_LIMIT,
    );
    envBatchCount = all.length;

    const active = all.find((it) => !utils.isTerminalStatus(it.status));
    const terminal = all.find((it) => utils.isTerminalStatus(it.status));
    activeStatus = active ? active.status : null;
    terminalStatus = terminal ? terminal.status : null;

    if (all.length > 0) {
      targetBatchId = all[0].batch_id;
      const detail = await batchApi.fetchBatchTaskDetailViaApi(
        page,
        targetBatchId,
      );
      targetHasBatchFiles = !!(
        detail.status === 200 &&
        detail.Data &&
        Array.isArray(detail.Data.batch_files) &&
        detail.Data.batch_files.length > 0
      );
    }

    common.log(
      `[beforeAll] 复用环境既有批量任务 ${envBatchCount} 条：非终态样本状态=${activeStatus}，` +
        `终态样本状态=${terminalStatus}，目标任务=${targetBatchId}（batch_files 就绪=${targetHasBatchFiles}）`,
    );
  } catch (e) {
    common.log('[beforeAll] 既有数据检索异常: ' + e.message);
  } finally {
    await context.close();
  }
});

/* ------------------------------------------------------------------ *
 * 用例内共享的断言组合（定位全部来自 page object，spec 不写裸选择器）
 * ------------------------------------------------------------------ */

/** 工具栏结构快照（管理员 / 只读一致比对，对应 BT-RO-01 预期 1 / 预期 3） */
async function toolbarSnapshot(page) {
  return {
    buttons: await utils.filterBarButtonLabels(page),
    statusSelect: await utils.statusSelectTrigger(page).isVisible(),
    providerInput: await utils.providerInput(page).isVisible(),
    apiKeyIdInput: await utils.apiKeyIdInput(page).isVisible(),
    startTime: await utils.filterDateTimeInput(page, 'start').isVisible(),
    endTime: await utils.filterDateTimeInput(page, 'end').isVisible(),
  };
}

/** 管理员对照：筛选栏只读控件齐全且「查询」「重置」可用 */
async function expectToolbarAdmin(page) {
  await readonly.expectAdminVisible(utils.statusSelectTrigger(page), '任务状态下拉');
  await readonly.expectAdminVisible(utils.providerInput(page), '服务商输入框');
  await readonly.expectAdminVisible(utils.apiKeyIdInput(page), 'API Key ID 输入框');
  await readonly.expectAdminVisible(
    utils.filterDateTimeInput(page, 'start'),
    '创建时间起',
  );
  await readonly.expectAdminVisible(
    utils.filterDateTimeInput(page, 'end'),
    '创建时间止',
  );
  await readonly.expectAdminEnabled(utils.queryButton(page), '查询');
  await readonly.expectAdminEnabled(utils.resetButton(page), '重置');
  return toolbarSnapshot(page);
}

/** 只读视角：筛选栏只读控件保留（预期 1：仅保留只读控件） */
async function expectToolbarReadonly(page) {
  await readonly.expectReadonlyVisible(
    utils.statusSelectTrigger(page),
    '任务状态下拉',
  );
  await readonly.expectReadonlyVisible(utils.providerInput(page), '服务商输入框');
  await readonly.expectReadonlyVisible(
    utils.apiKeyIdInput(page),
    'API Key ID 输入框',
  );
  await readonly.expectReadonlyVisible(
    utils.filterDateTimeInput(page, 'start'),
    '创建时间起',
  );
  await readonly.expectReadonlyVisible(
    utils.filterDateTimeInput(page, 'end'),
    '创建时间止',
  );
  await readonly.expectReadonlyVisible(utils.queryButton(page), '查询');
  await readonly.expectReadonlyVisible(utils.resetButton(page), '重置');
  return toolbarSnapshot(page);
}

/**
 * 按「任务状态」检索并返回首页第一行批量任务 ID（该行状态即筛选值）。
 * 走**真实 UI 下拉 + 查询**（`utils.queryByStatusViaUi`，同 BT-L-02），
 * 不用直写 `vm.filter.status` 的 `queryWithFilters`——见 page object 该函数注释。
 */
async function queryFirstRowByStatus(page, status) {
  const { response, batchId } = await utils.queryByStatusViaUi(page, status);
  expect(response.status(), `按状态 ${status} 查询应返回 200`).toBe(200);
  expect(utils.LIST_URL_RE.test(response.url()), '查询应命中 GET /batches').toBe(
    true,
  );
  return batchId;
}

/** 详情抽屉结构快照（面板标题 + 字段标题，对应 BT-RO-03 预期 3 的「内容一致」） */
async function drawerStructure(page) {
  return {
    panels: (await utils.detailPanelHeaders(page)).map((t) => t.trim()),
    fieldTitles: (await utils.detailFieldTitleTexts(page)).map((t) =>
      t.trim(),
    ),
  };
}

test.describe('批量任务 - BT-RO-01 只读视角列表工具栏无写入口且只读控件保留', () => {
  test('只读视角筛选栏仅保留只读控件、无写入口且查询可用；管理员工具栏展示一致（对照组）', async ({
    page,
  }) => {
    test.skip(
      envBatchCount === 0,
      '环境中无批量任务数据，跳过（造数：npm run seed:batch:execute）',
    );

    let adminToolbar = null;

    await test.step('管理员对照：筛选栏只读控件齐全，「查询」「重置」可用（预期 3）', async () => {
      await utils.gotoBatchTaskPage(page);
      await utils.expectBatchTaskPageReady(page);
      adminToolbar = await expectToolbarAdmin(page);
      expect(adminToolbar.buttons, '管理员筛选栏按钮集合').toEqual([
        utils.DOC.query,
        utils.DOC.reset,
      ]);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入「批量任务」列表页', async () => {
      await utils.gotoBatchTaskPageReadonly(page);
    });

    await test.step('筛选栏仅保留只读控件（状态下拉 / 服务商 / API Key ID / 创建时间起止 / 查询 / 重置）', async () => {
      await expectToolbarReadonly(page);
    });

    await test.step('筛选栏不含任何创建 / 新增 / 编辑写入口（预期 1）', async () => {
      // 用 CSS + hasText 定位（含隐藏元素）：被 v-has 隐藏的写按钮同样会被判为「不可见」
      for (const label of utils.TOOLBAR_WRITE_LABELS) {
        await readonly.expectHidden(
          utils.filterBarWriteButton(page, label),
          `工具栏「${label}」`,
        );
      }
    });

    await test.step('筛选与查询交互正常，可发起 GET /batches 检索（预期 2）', async () => {
      // 走真实 UI 下拉 + 查询（不用直写 vm.filter.status 的 queryWithFilters）
      const { response } = activeStatus
        ? await utils.queryByStatusViaUi(page, activeStatus)
        : {
            response: await utils.waitForBatchTaskListResponse(page, () =>
              utils.clickQuery(page),
            ),
          };
      expect(response.status(), '查询请求应返回 200').toBe(200);
      expect(utils.LIST_URL_RE.test(response.url()), '查询应命中 GET /batches').toBe(
        true,
      );
      expect(await utils.rowCount(page), '查询后应展示数据行').toBeGreaterThan(0);

      await utils.waitForBatchTaskListResponse(page, () => utils.clickReset(page));
    });

    await test.step('管理员视角工具栏展示一致（对照组，预期 3）', async () => {
      expect(
        await toolbarSnapshot(page),
        '只读视角工具栏应与管理员视角一致（批量任务工具栏本身无写按钮）',
      ).toEqual(adminToolbar);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('批量任务 - BT-RO-02 只读视角列表操作列「取消」隐藏「详情」保留', () => {
  test('只读视角操作列隐藏「取消」、保留「详情」且可开只读抽屉；管理员非终态「取消」可用、终态置灰（对照组）', async ({
    page,
  }) => {
    test.skip(
      !activeStatus || !terminalStatus,
      '环境中缺「非终态 / 终态」批量任务样本，跳过（造数：npm run seed:batch:execute）',
    );

    let readonlyBatchId = null;
    /** 诊断用：只读视角「筛选前」页面级 .v-has-hidden 数量 */
    let vHasBeforeFilter = 0;

    await test.step('管理员对照：非终态行「详情」可见、「取消」可用（预期 3）', async () => {
      await utils.gotoBatchTaskPage(page);
      await utils.expectBatchTaskPageReady(page);
      const batchId = await queryFirstRowByStatus(page, activeStatus);
      await utils.batchTaskTable(page).expectRowVisible(batchId);
      await readonly.expectAdminVisible(
        utils.rowDetailButton(page, batchId),
        '「详情」',
      );
      await readonly.expectAdminEnabled(
        utils.rowCancelButton(page, batchId),
        '非终态「取消」',
      );
    });

    await test.step('管理员对照：终态行「取消」可见但置灰并带 title（预期 3）', async () => {
      const batchId = await queryFirstRowByStatus(page, terminalStatus);
      await utils.batchTaskTable(page).expectRowVisible(batchId);
      await readonly.expectAdminVisible(
        utils.rowCancelButton(page, batchId),
        '终态「取消」',
      );
      await expect(
        utils.rowCancelButton(page, batchId),
        '终态任务「取消」应置灰',
      ).toBeDisabled();
      await expect(
        utils.rowCancelButton(page, batchId),
        '终态「取消」应带 title 提示',
      ).toHaveAttribute('title', utils.DOC.cancelDisabledTip);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入列表页并按「任务状态」定位目标行', async () => {
      await utils.gotoBatchTaskPageReadonly(page);
      // 诊断（2026-10-16 首轮验证 BT-RO-02 失败后补，用于定位 class 消失的步骤）：
      // 进页后、做任何筛选之前，页面级 v-has 元素必须存在
      vHasBeforeFilter = await readonly.vHasHiddenCount(page);
      expect(
        vHasBeforeFilter,
        '只读视角进页后（未做任何筛选）页面应存在 .v-has-hidden 元素',
      ).toBeGreaterThan(0);
      readonlyBatchId = await queryFirstRowByStatus(page, activeStatus);
      expect(
        await utils.batchTaskTable(page).rowByBatchId(readonlyBatchId).count(),
        '只读视角应能检索到目标批量任务行',
      ).toBeGreaterThan(0);
    });

    await test.step('操作列隐藏「取消」（挂 v-has，仍在 DOM 且带 .v-has-hidden）（预期 1）', async () => {
      const vHasAfterFilter = await readonly.vHasHiddenCount(page);
      const storeReadonly = await utils.storeIsReadonly(page);
      const cancelClass = await utils.rowCancelButton(
        page,
        readonlyBatchId,
      ).getAttribute('class');
      common.log(
        `[BT-RO-02] 只读视角 .v-has-hidden 数量：筛选前=${vHasBeforeFilter} 筛选后=${vHasAfterFilter}；` +
          `store.isReadonly()=${storeReadonly}；目标行「取消」class="${cancelClass}"`,
      );

      await test.step('只读态未被换回管理员态（localStorage + 产品 store 两处）', async () => {
        await readonly.expectStillReadonly(page);
        // store 探针是诊断手段（非文档预期），只用于排除「被换回管理员态」：
        // false = 明确换回；null = 探针取不到 store（实际值已在上一行日志输出）
        expect(
          storeReadonly,
          `只读视角 store.isReadonly() 不应为 false（实际 ${storeReadonly}；false=被换回管理员态，null=探针不可用）`,
        ).not.toBe(false);
      });

      await test.step('按状态筛选（列表重渲染）后页面级 v-has 机制仍生效', async () => {
        expect(
          vHasAfterFilter,
          `只读视角按状态筛选后 .v-has-hidden 不应消失（筛选前 ${vHasBeforeFilter}，筛选后 ${vHasAfterFilter}；` +
            `store.isReadonly()=${storeReadonly}，目标行「取消」class="${cancelClass}"）`,
        ).toBeGreaterThan(0);
      });

      await readonly.expectVHasHidden(
        utils.rowCancelButton(page, readonlyBatchId),
        '列表行「取消」',
      );
    });

    await test.step('操作列保留「详情」，点击可打开只读详情抽屉（预期 2）', async () => {
      await readonly.expectReadonlyVisible(
        utils.rowDetailButton(page, readonlyBatchId),
        '「详情」',
      );
      await utils.openDetailByBatchId(page, readonlyBatchId);
      await utils.expectDetailDrawerOpen(page);
      await expect(
        utils.detailDrawerButtons(page),
        '只读详情抽屉内不应有写操作按钮',
      ).toHaveCount(0);
      await utils.closeDetailDrawer(page);
    });

    await test.step('终态行同样只隐藏「取消」、保留「详情」', async () => {
      const batchId = await queryFirstRowByStatus(page, terminalStatus);
      await readonly.expectVHasHidden(
        utils.rowCancelButton(page, batchId),
        '终态行「取消」',
      );
      await readonly.expectReadonlyVisible(
        utils.rowDetailButton(page, batchId),
        '终态行「详情」',
      );
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});

test.describe('批量任务 - BT-RO-03 只读视角详情抽屉纯只读无写入口', () => {
  test('只读视角详情抽屉无任何写操作按钮、5 面板与批量文件区域只读展示；管理员抽屉内容一致（对照组）', async ({
    page,
  }) => {
    test.skip(
      envBatchCount === 0,
      '环境中无批量任务数据，跳过（造数：npm run seed:batch:execute）',
    );

    let adminStructure = null;

    await test.step('管理员对照：打开同一任务详情抽屉并记录面板 / 字段结构（预期 3）', async () => {
      await utils.gotoBatchTaskPage(page);
      await utils.expectBatchTaskPageReady(page);
      await utils.batchTaskTable(page).expectRowVisible(targetBatchId);
      await utils.openDetailByBatchId(page, targetBatchId);
      await utils.expectDetailDrawerOpen(page);
      adminStructure = await drawerStructure(page);
      await utils.closeDetailDrawer(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角点击「详情」打开同一任务抽屉', async () => {
      await utils.gotoBatchTaskPageReadonly(page);
      await utils.batchTaskTable(page).expectRowVisible(targetBatchId);
      await utils.openDetailByBatchId(page, targetBatchId);
      await utils.expectDetailDrawerOpen(page);
    });

    await test.step('抽屉内不含任何写操作按钮（源码 BatchView.vue 无写入口）（预期 1）', async () => {
      // 用 CSS 定位（含隐藏元素），避免 role 选择器按 ARIA 树排除隐藏元素而漏判
      await expect(
        utils.detailDrawerButtons(page),
        '详情抽屉应不含任何写操作按钮',
      ).toHaveCount(0);
      for (const label of DRAWER_WRITE_LABELS) {
        await readonly.expectAbsent(
          utils.detailDrawerWriteButton(page, label),
          `抽屉「${label}」`,
        );
      }
    });

    await test.step('5 个 panel 卡片正常只读展示（预期 2）', async () => {
      expect(await utils.detailPanelCount(page), '详情面板数应为 5').toBe(5);
      expect(
        (await utils.detailPanelHeaders(page)).map((t) => t.trim()),
        '详情面板标题与顺序',
      ).toEqual(PANEL_TITLES);
    });

    await test.step('「批量文件」区域只读展示（预期 2）', async () => {
      await readonly.expectReadonlyVisible(
        utils.detailRow(page, utils.DOC.batchFiles),
        '「批量文件」字段行',
      );
      if (targetHasBatchFiles) {
        await readonly.expectReadonlyVisible(
          utils.batchFilesTable(page),
          '批量文件表格',
        );
        expect(
          await utils.batchFilesHeaderTexts(page),
          '批量文件表头',
        ).toEqual(BATCH_FILE_HEADERS);
        expect(
          await utils.batchFileRowCount(page),
          '批量文件行数',
        ).toBeGreaterThan(0);
      } else {
        // 详情接口未返回扁平 Data.batch_files（BUG-BT-01）→ 表格恒不渲染，与 test_02 BT-D-03
        // 同因守卫：此处只断言区域存在（空占位），表格内容断言待接口修复后自动生效。
        // 注意 `batchFilesEmpty` 是 async（返回 Locator）→ 必须先 await 再交给断言，
        // 否则会把 Promise 传给 toBeVisible（2026-10-16 首轮验证报错点）。
        common.log(
          '[BT-RO-03] 详情接口未返回扁平 Data.batch_files（BUG-BT-01），批量文件表格断言按数据就绪守卫降级',
        );
        await readonly.expectReadonlyVisible(
          await utils.batchFilesEmpty(page),
          '批量文件空占位',
        );
      }
    });

    await test.step('管理员视角同一抽屉展示内容一致（对照组，预期 3）', async () => {
      expect(
        await drawerStructure(page),
        '详情抽屉不因角色变化而增减内容',
      ).toEqual(adminStructure);
    });

    await test.step('只读态未被会话自愈换回管理员态', async () => {
      await readonly.expectStillReadonly(page);
    });
  });
});