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
 * 模块名：路由管理 - 条件原语面板（Expression 组件）基线
 * 用例范围（docs/route-management/02-功能测试用例/07-条件原语面板.md）：
 * - RT-E-08 面板清单基线：20 组 / 61 原语 + 5 连接符、组标题集合、
 *           `bfe_cluster_in` 不存在、`time_weekday_in` 与 `intent` 存在
 * - RT-E-09 hideGroups：路由表 / 流量镜像 / AI 缓存 / AI 上下文 四个请求阶段表单抽屉内
 *           19 个 `.expression-item` / 18 个 `.title` / 63 个按钮 / 58 条签名，
 *           `response` 组的 `code` / `header_key_in` / `header_value_in` 不渲染
 * - RT-E-10 原语签名与示例 tooltip 抽查（`req_cip_range(start_ip, end_ip)`、
 *           `req_body_larger_than(8192)`、`time_weekday_in(weekday_list, zone)`、
 *           `req_ai_intent_in(question_name, value_list, min_confidence)`）
 * - RT-E-11 点击插入语义：模板追加到 textarea 末尾 + 触发 `PATCH expression/verify`；
 *           查看模式下原语按钮带 `.readonly` 且点击无效果
 *
 * 设计：
 * - 面板**常驻在规则抽屉的第 2 个 FormItem**（`RuleForm.vue:32-39`），无独立开关 →
 *   打开方式为「进入编辑模式 → 打开『添加规则』抽屉」；抽屉内只读面板不写后端。
 * - 期望清单全部来自 `pages/route/ExpressionPanelPage.js` 的基线常量（逐条抄录自
 *   `ExpressionConfig.js`），spec 内不写裸选择器、不写面板文本硬编码清单。
 * - 「刷新基线」语义：面板增删原语 / 改签名 / 调分组 → 本 spec 必失败，需显式更新基线常量。
 * - RT-E-09 覆盖四个模块的抽屉：只进入编辑模式 + 打开抽屉（本地 UI 状态），不提交、零写入。
 * - RT-E-11 的只读态在路由模块**无 UI 入口**（`RouteRules.vue:296-302` 视图模式操作列只渲染
 *   「查看」→ 打开不含面板的 `RuleView`；含面板的抽屉只由 `onAddRule`/`onEditRule` 打开，
 *   二者要求 `mode === 'edit'`）→ 按仓库既有 `__vue__` 手法置位组件状态（只改 UI 状态、
 *   不发写请求），对照组为同一抽屉的编辑模式。
 * - 数据纪律：全程零写入。需要打开 Global 行详情时先清空列表「状态=启用」筛选，
 *   `beforeAll` 不造数；每个用例 `createGlobalRouteRulesGuard` 快照 + 收尾校验未改动。
 *
 * 运行（单次串行，勿并发：并发多进程会互相顶掉 viewer/会话）：
 *   nvm use 18 && PW_WORKERS=1 npx playwright test tests/route/test_14_route_expression_primitive_panel.spec.js
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const panel = require('../../pages/route/ExpressionPanelPage');
const aiCache = require('../../pages/ai-cache/AICachePage');
const aiContext = require('../../pages/ai-context/AIContextPage');
const trafficMirror = require('../../pages/traffic-mirror/TrafficMirrorPage');

/** 表达式初值（合法表达式，便于点击追加后仍可提交） */
const EXPRESSION_SEED = 'req_host_in("a")';

/**
 * 打开路由模块「添加规则」抽屉并等待面板就绪（编辑模式内，零写入）
 *
 * 前置与既有 RT-D-28/RT-D-29 一致：列表默认「状态=启用」筛选会挡住全停用的路由表，
 * 故先清空状态筛选再进 Global 行详情。
 */
async function openRouteRuleDrawerWithPanel(page) {
  await utils.ensureRouteTableModuleAvailable(page);
  await utils.clearRouteTableSearchFilter(
    page,
    utils.ROUTE_TABLE_SEARCH_COLUMN.status,
  );
  await utils.openGlobalRouteTableDetail(page);
  await utils.enterRouteRulesEditMode(page);
  await utils.openAddRuleDrawer(page);
  await expect(panel.expressionTextarea(page)).toBeVisible();
}

/** 关闭抽屉并退出编辑模式（无本地改动 → 不弹二次确认） */
async function closeRouteRuleDrawer(page) {
  await utils.closeTopDrawer(page);
  await utils.clickExitEditMode(page);
  await utils.expectRouteRulesViewMode(page);
}

/**
 * 四个请求阶段表单的抽屉开关（RT-E-09 用）。
 * 四个模块的 `RuleForm.vue` 都把 `<Expression :hide-groups="['response']">` 放在
 * 规则抽屉的第 2 个 FormItem 内，抽屉根 class 统一为 `.rule-form`。
 */
const REQUEST_PHASE_FORMS = [
  {
    label: '路由表规则（RouteTable）',
    open: async (page) => {
      await openRouteRuleDrawerWithPanel(page);
    },
    close: async (page) => {
      await closeRouteRuleDrawer(page);
    },
  },
  {
    label: 'AI 缓存规则（AICache）',
    open: async (page) => {
      await aiCache.gotoAiCachePageAndWaitForRules(page);
      await aiCache.enterEditMode(page);
      await aiCache.openAddRuleDrawer(page);
    },
    close: async (page) => {
      await aiCache.closeRuleFormDrawer(page);
      await aiCache.clickExitEditMode(page);
    },
  },
  {
    label: 'AI 上下文压缩规则（AIContext）',
    open: async (page) => {
      await aiContext.gotoAiContextPageAndWaitForRules(page);
      await aiContext.enterEditMode(page);
      await aiContext.openAddRuleDrawer(page);
    },
    close: async (page) => {
      await aiContext.closeRuleFormDrawer(page);
      await aiContext.clickExitEditMode(page);
    },
  },
  {
    label: '流量镜像规则（TrafficMirror）',
    open: async (page) => {
      await trafficMirror.gotoTrafficMirrorPageAndWaitForRules(page);
      await trafficMirror.enterEditMode(page);
      await trafficMirror.openAddRuleDrawer(page);
    },
    close: async (page) => {
      await trafficMirror.closeRuleFormDrawer(page);
      await trafficMirror.clickExitEditMode(page);
    },
  },
];

test.describe('路由管理 - RT-E-08 条件原语面板清单基线', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  test('RT-E-08 面板清单基线：20 组 / 61 原语 + 5 连接符、组标题集合、bfe_cluster_in 不存在、time_weekday_in 与 intent 存在', async ({
    page,
  }) => {
    let panelData = null;

    await test.step('基线常量自检：20 组 / 61 原语 / 5 连接符，组 id、标题与组内按钮名唯一，61 条签名条目齐备', async () => {
      panel.expectPanelBaselineConsistent();
      expect(panel.PANEL_BASELINE.source).toContain('ExpressionConfig.js');
      expect(
        panel.requestPhaseExpectedCounts(),
        '请求阶段表单的期望规模应由基线推导',
      ).toEqual({ items: 19, boxes: 18, buttons: 63, signatures: 58 });
    });

    await test.step('前置：进入编辑模式并打开「添加规则」抽屉（面板常驻第 2 个 FormItem）', async () => {
      await openRouteRuleDrawerWithPanel(page);
      await guard.capture(page);
    });

    await test.step('抽屉内面板 = 基线剔除 hideGroups：19 个分组条目 / 18 个组标题 / 63 个原语按钮 / 58 条签名', async () => {
      panelData = await panel.expectRequestPhasePanelBaseline(page);
    });

    await test.step('组标题集合与顺序：逻辑连接符 + host/port/method/path/query/cookie/header/clientIP/vip/proto/context/tag/url/intent/body/session/system，条件变量组无按钮故无标题', async () => {
      expect(
        panelData.titles,
        '组标题序列应与基线（hideGroups 生效后）一致，末位为无 box 的条件变量组',
      ).toEqual(panel.requestPhaseTitles());
      expect(
        panelData.titles,
        '组标题集合应覆盖 baseline 全部 19 个可见分组',
      ).toEqual(
        panel
          .requestPhaseGroups()
          .map((g) => (g.buttons.length > 0 ? `${g.title}:` : null)),
      );
    });

    await test.step('条件变量组恒空：`vars` 组渲染为空条目、无 box（固有实现特征，不与 box 数做相等断言）', async () => {
      const lastItem = panel.panelItems(page).last();
      await expect(panel.groupBox(lastItem)).toHaveCount(0);
      await expect(panel.groupButtons(lastItem)).toHaveCount(0);
      expect(
        panel.groupById('vars').buttons,
        '基线中条件变量组按钮为空（无 vars 入参）',
      ).toEqual([]);
    });

    await test.step('已删除原语 bfe_cluster_in 在面板与 tooltip 弹层中均无残留（带 time_weekday_in 正对照）', async () => {
      await panel.expectRemovedPrimitiveAbsent(page);
      expect(panelData.buttonTexts).not.toContain(panel.REMOVED_PRIMITIVE);
    });

    await test.step('time_weekday_in（system 组）与 intent 组存在，签名与 BFE v1.8.9-dev 文档一致', async () => {
      await panel.expectPrimitiveExists(page, 'system', 'time_weekday_in');
      expect(panel.PRIMITIVE_SIGNATURES['system.time_weekday_in']).toBe(
        'time_weekday_in(weekday_list, zone)',
      );
      const intentGroup = await panel.panelGroupItem(page, 'intent');
      await expect(panel.groupBoxTitle(intentGroup)).toHaveText('intent:');
      await panel.expectPrimitiveExists(page, 'intent', 'in');
      expect(panel.PRIMITIVE_SIGNATURES['intent.in']).toBe(
        'req_ai_intent_in(question_name, value_list, min_confidence)',
      );
    });

    await test.step('default_t 不在面板：它属 connController（手输表达式），面板按钮序列与基线均不含它', async () => {
      expect(
        panelData.buttonTexts,
        '条件原语面板不应渲染 default_t（属 connController 手输表达式）',
      ).not.toContain('default_t');
      expect(
        JSON.stringify(panel.EXPRESSION_PANEL_GROUPS).includes('default_t'),
        '基线清单不应含 default_t',
      ).toBe(false);
    });

    await test.step('收尾：关闭抽屉、退出编辑模式，后端 Global 路由规则未改动（零写入）', async () => {
      await closeRouteRuleDrawer(page);
      await guard.verifyUnchanged(page);
    });
  });
});

test.describe('路由管理 - RT-E-09 hideGroups（四个请求阶段表单）', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  test('RT-E-09 路由表 / 流量镜像 / AI 缓存 / AI 上下文 四个抽屉内均为 19/18/63 且 response 组不渲染', async ({
    page,
  }) => {
    for (const form of REQUEST_PHASE_FORMS) {
      await test.step(`${form.label}：抽屉内 19 个分组条目 / 18 个组标题 / 63 个按钮 / 58 条签名`, async () => {
        await form.open(page);
        if (form.label.startsWith('路由表')) {
          await guard.capture(page);
        }
        await panel.expectRequestPhasePanelBaseline(page);
      });

      await test.step(`${form.label}：response 组的 code / header_key_in / header_value_in 与其签名不渲染`, async () => {
        const data = await panel.readExpressionPanel(page);
        for (const name of panel.RESPONSE_BUTTON_NAMES) {
          expect(
            data.buttonTexts,
            `response 组按钮「${name}」不应在请求阶段表单渲染`,
          ).not.toContain(name);
        }
        for (const key of ['response.code', 'response.header_key_in', 'response.header_value_in']) {
          expect(
            data.signatures,
            `response 组签名「${panel.PRIMITIVE_SIGNATURES[key]}」不应在请求阶段表单渲染`,
          ).not.toContain(panel.PRIMITIVE_SIGNATURES[key]);
        }
        expect(
          data.titles,
          'response 组标题不应出现',
        ).not.toContain('response:');
      });

      await test.step(`${form.label}：关闭抽屉并退出编辑模式（零写入）`, async () => {
        await form.close(page);
      });
    }

    await test.step('收尾：后端 Global 路由规则未改动', async () => {
      await guard.verifyUnchanged(page);
    });
  });
});

test.describe('路由管理 - RT-E-10 原语签名与示例 tooltip', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  test('RT-E-10 tooltip 抽查：签名与 BFE v1.8.9-dev 文档逐字一致，示例随签名展示', async ({
    page,
  }) => {
    await test.step('前置：进入编辑模式并打开「添加规则」抽屉', async () => {
      await openRouteRuleDrawerWithPanel(page);
      await guard.capture(page);
    });

    await test.step('clientIP 组 range：签名 req_cip_range(start_ip, end_ip)、示例 req_cip_range("1.1.1.1", "2.2.2.2")', async () => {
      await panel.expectPrimitiveTooltip(page, 'cip', 'range', {
        examples: panel.PRIMITIVE_TOOLTIP_EXAMPLES['cip.range'],
      });
    });

    await test.step('body 组 req_body_larger_than：签名为 (size)、示例保留 8192 默认值并说明 Content-Length 语义', async () => {
      await panel.expectPrimitiveTooltip(page, 'body', 'req_body_larger_than', {
        examples: panel.PRIMITIVE_TOOLTIP_EXAMPLES['body.req_body_larger_than'],
      });
    });

    await test.step('system 组 time_weekday_in：签名 time_weekday_in(weekday_list, zone)、示例含 "H" 时区写法', async () => {
      await panel.expectPrimitiveTooltip(page, 'system', 'time_weekday_in', {
        examples: panel.PRIMITIVE_TOOLTIP_EXAMPLES['system.time_weekday_in'],
      });
    });

    await test.step('intent 组 in：签名 req_ai_intent_in(question_name, value_list, min_confidence)（BFE v1.8.9-dev 新增索引）', async () => {
      await panel.expectPrimitiveTooltip(page, 'intent', 'in', {
        examples: panel.PRIMITIVE_TOOLTIP_EXAMPLES['intent.in'],
      });
    });

    await test.step('收尾：关闭抽屉、退出编辑模式，后端 Global 路由规则未改动', async () => {
      await closeRouteRuleDrawer(page);
      await guard.verifyUnchanged(page);
    });
  });
});

test.describe('路由管理 - RT-E-11 点击插入语义与只读面板', () => {
  const guard = utils.createGlobalRouteRulesGuard();

  test.afterEach(async ({ page }) => {
    await guard.restoreIfChanged(page);
  });

  test('RT-E-11 点击原语：模板追加到表达式末尾（连点粘接）且每次触发 PATCH expression/verify', async ({
    page,
  }) => {
    await test.step('前置：进入编辑模式、打开「添加规则」抽屉，并把表达式置为合法初值', async () => {
      await openRouteRuleDrawerWithPanel(page);
      await guard.capture(page);
      await panel.fillRuleExpression(page, EXPRESSION_SEED);
      expect(await panel.ruleExpressionValue(page)).toBe(EXPRESSION_SEED);
    });

    await test.step('点击逻辑连接符 &&：追加到末尾并触发 1 次 expression/verify', async () => {
      const value = await panel.clickPrimitiveAndExpectAppend(page, 'logical', '&&');
      expect(value).toBe(`${EXPRESSION_SEED}&&`);
    });

    await test.step('点击 port 组 in：模板 req_port_in("") 直接粘接在末尾', async () => {
      const value = await panel.clickPrimitiveAndExpectAppend(page, 'port', 'in');
      expect(value).toBe(`${EXPRESSION_SEED}&&req_port_in("")`);
    });

    await test.step('连点同一原语：再次追加、粘接不补分隔符，仍各触发 1 次校验', async () => {
      const value = await panel.clickPrimitiveAndExpectAppend(page, 'port', 'in');
      expect(value).toBe(`${EXPRESSION_SEED}&&req_port_in("")req_port_in("")`);
    });

    await test.step('点击 clientIP 组 range：追加 req_cip_range("", "") 模板（带双引号空参）', async () => {
      const value = await panel.clickPrimitiveAndExpectAppend(page, 'cip', 'range');
      expect(value).toBe(
        `${EXPRESSION_SEED}&&req_port_in("")req_port_in("")req_cip_range("", "")`,
      );
    });

    await test.step('收尾：关闭抽屉并放弃本地变更、退出编辑模式，后端 Global 路由规则未改动', async () => {
      await closeRouteRuleDrawer(page);
      await guard.verifyUnchanged(page);
    });
  });

  test('RT-E-11 查看模式：原语按钮带 .readonly 且点击无效果（编辑模式为对照组）', async ({
    page,
  }) => {
    let valueInEditMode = null;

    await test.step('前置：进入编辑模式并打开「添加规则」抽屉', async () => {
      await openRouteRuleDrawerWithPanel(page);
      await guard.capture(page);
    });

    await test.step('对照组（编辑模式）：原语按钮不带 .readonly，textarea 可编辑', async () => {
      await panel.expectPanelReadonly(page, false);
      valueInEditMode = await panel.ruleExpressionValue(page);
    });

    await test.step('产品当前无 UI 入口：按 __vue__ 手法把 RouteRules 置位到查看模式（抽屉保持打开）', async () => {
      await panel.forceRouteRulesViewModeWithDrawerOpen(page);
      await expect(
        utils.routeRulesEnterEditBtn(page),
        '置位后详情工具栏应切换回视图模式分支（出现「进入编辑模式」）',
      ).toBeVisible();
    });

    await test.step('查看模式：全部 63 个原语按钮带 .readonly、textarea 置灰', async () => {
      await panel.expectPanelReadonly(page, true);
    });

    await test.step('查看模式点击原语无效果：表达式不变且不发 expression/verify 请求', async () => {
      await panel.expectPrimitiveClickNoEffect(page, 'cip', 'range');
      await panel.expectPrimitiveClickNoEffect(page, 'logical', '&&');
      expect(
        await panel.ruleExpressionValue(page),
        '只读态表达式应与进入查看模式前一致',
      ).toBe(valueInEditMode);
    });

    await test.step('收尾：关闭抽屉并回到列表页，后端 Global 路由规则未改动（零写入）', async () => {
      await utils.closeTopDrawer(page);
      await utils.gotoRouteTableListPage(page);
      await guard.verifyUnchanged(page);
    });
  });
});