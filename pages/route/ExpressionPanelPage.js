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
 * 条件原语面板（Expression 组件）页面对象
 *
 * 覆盖用例：docs/route-management/02-功能测试用例/07-条件原语面板.md RT-E-08~RT-E-11
 *
 * 产品依据（ai-gateway-web，**权威清单以源码为准**）：
 * - `src/components/Expression/ExpressionConfig.js:17-603` —— `controller(conditionVars)`
 *   返回 20 个分组 / 61 个条件原语 / 5 个逻辑连接符；`connController:604-641` 是另一套
 *   （`default_t` + 逻辑连接符），**不在本面板内**（`default_t` 属手输表达式，不占面板按钮）；
 * - `src/components/Expression/index.vue:18-57` —— DOM 结构：
 *   `.expression` > `.expression-item` > `.expression-item-box` > `.title` +
 *   `.expression-item-body` > Tooltip > `.vars-expression-show`；分组 `buttons` 为空时
 *   **不渲染 `.expression-item-box`**（`v-if`，`vars` 条件变量组即此情形）；
 * - `src/components/Expression/index.vue:85-90,104-111` —— `hideGroups` 按分组 id 过滤，
 *   且**仅 `type === 'controller'` 生效**。四个请求阶段表单均传 `['response']`：
 *   `RouteTable/components/RuleForm.vue:36`、`TrafficMirror:34`、`AICache:34`、`AIContext:27`
 *   → 抽屉内应为 19 个 `.expression-item` / 18 个 `.expression-item-box`（`.title`）/
 *   63 个 `.vars-expression-show` / 58 条非空 tooltip 签名；
 * - `src/components/Expression/index.vue:160-166` —— `onBtnClick`：`readonly` 为真直接
 *   `return`（`.readonly` class 由 `:class="['vars-expression-show', { readonly }]"` 挂在按钮上），
 *   否则 `this.localExpression += data.expression` —— **追加到 textarea 末尾**（连点会粘接，
 *   不做光标插入）并调用 `changeExpression()`；
 * - `src/components/Expression/index.vue:137-158` —— `changeExpression()` 发
 *   `PATCH /open-api/v1/expression/verify`（前端 `url: 'expression/verify'` + `openapi: true`，
 *   前缀见 `src/utils/request.js:57`），每次
 *   on-change 一次请求；编译失败经 `expressionChanged` 回传 `errmsg` 由 RuleForm 内联展示。
 *
 * 基线化（「刷新基线」的落点）：`EXPRESSION_PANEL_GROUPS` 与 `PRIMITIVE_SIGNATURES` 是
 * **从 `ExpressionConfig.js` 逐条抄录的快照**（组顺序、组标题 i18n 取值、组内按钮顺序、
 * 文档签名文本）。产品增删原语 / 改签名 / 调分组顺序后，RT-E-08、RT-E-09 会失败，
 * 必须显式更新本文件——这正是「面板变更须刷新 UI 自动化基线」的检查项。
 *
 * 四条定位纪律：
 * 1. `.expression` 既是面板根 div 也是 iView `Input` wrapper 的 class（strict violation）
 *    → 面板内元素一律走 `.rule-form .expression-item` / `.rule-form .expression-item-box .title`
 *    / `.rule-form .vars-expression-show`；textarea 用 `.rule-form .expression textarea` + `first()`；
 * 2. 按钮文本与分组标题一律 `innerText().trim()` 后**精确比较**再定位（`hasText` 是子串匹配，
 *    `in` / `value_in` / `header_key_in` 会互相串位）；
 * 3. tooltip 是 `:transfer="true"` → 弹层常驻 `document.body` 且**始终渲染**（iView Tooltip
 *    只用 `v-show` 控制可见性，见 `node_modules/iview/src/components/tooltip/tooltip.vue:6-24`）
 *    → 读签名可一次性扫 body，但**可见性断言必须用 `.ivu-tooltip-inner:visible` 过滤**，
 *    否则会命中全部 63 个隐藏弹层；
 * 4. `mode === 'view'` 的只读面板在路由模块**无 UI 入口**（`RouteRules.vue:296-302` 视图模式
 *    操作列只渲染「查看」→ 打开 `RuleView`；含面板的规则抽屉只由 `onAddRule` / `onEditRule`
 *    打开，二者都要求 `mode === 'edit'`）→ RT-E-11 的只读断言按仓库既有 `__vue__` 手法置位
 *    （只改 UI 状态、不发写请求），见 `forceRouteRulesViewModeWithDrawerOpen`。
 */
const { expect } = require('@playwright/test');
const common = require('../../utils/common');

// ---------------------------------------------------------------------------
// 基线：逐条抄录自 ai-gateway-web/src/components/Expression/ExpressionConfig.js
// ---------------------------------------------------------------------------

/**
 * 面板分组基线（源码顺序）：`buttons` 为该分组内 `.vars-expression-show` 的显示文本，
 * `title` 为 `.expression-item-box .title` 的文案（i18n：`route.exprGroup.*`，
 * `logical` 组用 `route.logicalConnector`；中英语言包取值一致，均为英文原文，
 * 唯 `cip → clientIP`、`vars → condition vars`）。
 */
const EXPRESSION_PANEL_GROUPS = [
  { id: 'logical', title: '逻辑连接符', buttons: ['(', ')', '&&', '||', '!'] },
  { id: 'host', title: 'host', buttons: ['in', 'suffix_in', 'regmatch', 'tag_in'] },
  { id: 'port', title: 'port', buttons: ['in'] },
  { id: 'method', title: 'method', buttons: ['in'] },
  {
    id: 'path',
    title: 'path',
    buttons: [
      'in',
      'contain',
      'prefix_in',
      'element_prefix_in',
      'suffix_in',
      'regmatch',
    ],
  },
  {
    id: 'query',
    title: 'query',
    buttons: [
      'exist',
      'key_in',
      'key_prefix_in',
      'value_in',
      'value_prefix_in',
      'value_suffix_in',
      'value_contain',
      'value_regmatch',
      'value_hash_in',
    ],
  },
  {
    id: 'cookie',
    title: 'cookie',
    buttons: [
      'key_in',
      'value_in',
      'value_prefix_in',
      'value_suffix_in',
      'value_contain',
      'value_hash_in',
    ],
  },
  {
    id: 'header',
    title: 'header',
    buttons: [
      'key_in',
      'value_in',
      'value_prefix_in',
      'value_suffix_in',
      'value_contain',
      'value_regmatch',
      'value_hash_in',
      'ua_regmatch',
    ],
  },
  { id: 'cip', title: 'clientIP', buttons: ['range', 'trusted', 'hash_in'] },
  { id: 'vip', title: 'vip', buttons: ['in', 'range'] },
  { id: 'proto', title: 'proto', buttons: ['match', 'secure'] },
  { id: 'context', title: 'context', buttons: ['value_in'] },
  { id: 'tag', title: 'tag', buttons: ['match'] },
  { id: 'url', title: 'url', buttons: ['regmatch'] },
  { id: 'intent', title: 'intent', buttons: ['in'] },
  {
    id: 'body',
    title: 'body',
    buttons: [
      'req_body_json_in',
      'req_body_json_prefix_in',
      'req_body_larger_than',
      'req_body_less_than',
    ],
  },
  { id: 'response', title: 'response', buttons: ['code', 'header_key_in', 'header_value_in'] },
  {
    id: 'session',
    title: 'session',
    buttons: [
      'sip_range',
      'vip_range',
      'tls_sni_in',
      'tls_client_auth',
      'tls_client_ca_in',
    ],
  },
  {
    id: 'system',
    title: 'system',
    buttons: ['bfe_time_range', 'bfe_periodic_time_range', 'time_weekday_in'],
  },
  { id: 'vars', title: 'condition vars', buttons: [] },
];

/**
 * 原语签名基线：`<分组 id>.<按钮显示名>` → tooltip 标题行文本（源码 `description`，
 * 与 BFE v1.8.9-dev 文档签名逐字一致）。逻辑连接符无签名（`description` 为空 → tooltip
 * 内容为空），故 61 条；`vars` 条件变量组无按钮。
 */
const PRIMITIVE_SIGNATURES = {
  'host.in': 'req_host_in(host_list)',
  'host.suffix_in': 'req_host_suffix_in(suffix_list)',
  'host.regmatch': 'req_host_regmatch(reg_exp)',
  'host.tag_in': 'req_host_tag_in(tag_list)',
  'port.in': 'req_port_in(port_list)',
  'method.in': 'req_method_in(method_list)',
  'path.in': 'req_path_in(path_list, case_insensitive)',
  'path.contain': 'req_path_contain(path_list, case_insensitive)',
  'path.prefix_in': 'req_path_prefix_in(prefix_list, case_insensitive)',
  'path.element_prefix_in':
    'req_path_element_prefix_in(prefix_list, case_insensitive)',
  'path.suffix_in': 'req_path_suffix_in(suffix_list, case_insensitive)',
  'path.regmatch': 'req_path_regmatch(reg_exp)',
  'query.exist': 'req_query_exist()',
  'query.key_in': 'req_query_key_in(key_list)',
  'query.key_prefix_in': 'req_query_key_prefix_in(prefix_list)',
  'query.value_in': 'req_query_value_in(key, value_list, case_insensitive)',
  'query.value_prefix_in':
    'req_query_value_prefix_in(key, prefix_list, case_insensitive)',
  'query.value_suffix_in':
    'req_query_value_suffix_in(key, suffix_list, case_insensitive)',
  'query.value_contain': 'req_query_value_contain(key, value_list, case_insensitive)',
  'query.value_regmatch': 'req_query_value_regmatch(key, reg_exp)',
  'query.value_hash_in':
    'req_query_value_hash_in(key, hash_value_list, case_insensitive)',
  'cookie.key_in': 'req_cookie_key_in(key_list)',
  'cookie.value_in': 'req_cookie_value_in(key, value_list, case_insensitive)',
  'cookie.value_prefix_in':
    'req_cookie_value_prefix_in(key, prefix_list, case_insensitive)',
  'cookie.value_suffix_in':
    'req_cookie_value_suffix_in(key, suffix_list, case_insensitive)',
  'cookie.value_contain':
    'req_cookie_value_contain(key, value_list, case_insensitive)',
  'cookie.value_hash_in':
    'req_cookie_value_hash_in(key, hash_value_list, case_insensitive)',
  'header.key_in': 'req_header_key_in(key_list)',
  'header.value_in':
    'req_header_value_in(header_name, value_list, case_insensitive)',
  'header.value_prefix_in':
    'req_header_value_prefix_in(header_name, prefix_list, case_insensitive)',
  'header.value_suffix_in':
    'req_header_value_suffix_in(header_name, suffix_list, case_insensitive)',
  'header.value_contain':
    'req_header_value_contain(header_name, value_list, case_insensitive)',
  'header.value_regmatch': 'req_header_value_regmatch(header_name, reg_exp)',
  'header.value_hash_in':
    'req_header_value_hash_in(header_name, hash_value_list, case_insensitive)',
  'header.ua_regmatch': 'req_ua_regmatch(reg_exp)',
  'cip.range': 'req_cip_range(start_ip, end_ip)',
  'cip.trusted': 'req_cip_trusted()',
  'cip.hash_in': 'req_cip_hash_in(value_list)',
  'vip.in': 'req_vip_in(vip_list)',
  'vip.range': 'req_vip_range(start_ip, end_ip)',
  'proto.match': 'req_proto_match(proto)',
  'proto.secure': 'req_proto_secure()',
  'context.value_in': 'req_context_value_in(key, value_list, case_insensitive)',
  'tag.match': 'req_tag_match(tagName, tagValue)',
  'url.regmatch': 'req_url_regmatch(reg_exp)',
  'intent.in': 'req_ai_intent_in(question_name, value_list, min_confidence)',
  'body.req_body_json_in':
    'req_body_json_in(json_path, value_list, case_insensitive)',
  'body.req_body_json_prefix_in':
    'req_body_json_prefix_in(json_path, value_prefix_list, case_insensitive)',
  'body.req_body_larger_than': 'req_body_larger_than(size)',
  'body.req_body_less_than': 'req_body_less_than(size)',
  'response.code': 'res_code_in(codes)',
  'response.header_key_in': 'res_header_key_in(key_list)',
  'response.header_value_in':
    'res_header_value_in(key, value_list, case_insensitive)',
  'session.sip_range': 'ses_sip_range(start_ip, end_ip)',
  'session.vip_range': 'ses_vip_range(start_ip, end_ip)',
  'session.tls_sni_in': 'ses_tls_sni_in(host_list)',
  'session.tls_client_auth': 'ses_tls_client_auth()',
  'session.tls_client_ca_in': 'ses_tls_client_ca_in(ca_list)',
  'system.bfe_time_range': 'bfe_time_range(start_time, end_time)',
  'system.bfe_periodic_time_range':
    'bfe_periodic_time_range(start_time, end_time, period)',
  'system.time_weekday_in': 'time_weekday_in(weekday_list, zone)',
};

/**
 * 按钮点击后追加的模板（源码 `expression`）——RT-E-11 用；
 * 断言形式：点击后 textarea 值 === 点击前值 + 本模板（末尾追加，粘接不补分隔符）。
 */
const PRIMITIVE_TEMPLATES = {
  'logical.&&': '&&',
  'logical.(': '(',
  'host.in': 'req_host_in("")',
  'port.in': 'req_port_in("")',
  'cip.range': 'req_cip_range("", "")',
  'intent.in': 'req_ai_intent_in("", "")',
};

/** tooltip 示例（源码 `example`，RT-E-10 抽查用；片段级断言避免 `<p>`/`<br/>` 结构依赖） */
const PRIMITIVE_TOOLTIP_EXAMPLES = {
  'cip.range': ['req_cip_range("1.1.1.1", "2.2.2.2")'],
  'body.req_body_larger_than': [
    'req_body_larger_than(8192)',
    '基于 Content-Length，单位字节；无 Content-Length 时不匹配',
  ],
  'system.time_weekday_in': [
    'time_weekday_in("0|6", "H")',
    'time_weekday_in("1|2|3|4|5", "H")',
  ],
  'intent.in': ['req_ai_intent_in("task_type", "test_writing|doc_writing", 0.9)'],
};

const PANEL_BASELINE = {
  source: 'ai-gateway-web/src/components/Expression/ExpressionConfig.js:17-603',
  groupCount: 20,
  primitiveCount: 61,
  connectorCount: 5,
  /** 请求阶段四个表单（RouteTable / TrafficMirror / AICache / AIContext）传的 hideGroups */
  hiddenInRequestPhaseForms: ['response'],
};

/** 已删除原语（`bfe_cluster_in`，运行时 condition.Build 不存在 → 面板必须无残留） */
const REMOVED_PRIMITIVE = 'bfe_cluster_in';

/** 响应阶段原语（请求阶段表单必须整体不渲染） */
const RESPONSE_GROUP_ID = 'response';

/** 请求阶段抽屉内必须不出现的 response 按钮显示名 */
const RESPONSE_BUTTON_NAMES = ['code', 'header_key_in', 'header_value_in'];

/** expression/verify 请求 URL 片段（前端 `url: 'expression/verify'` → open-api 前缀） */
const EXPRESSION_VERIFY_URL = '/expression/verify';

function groupById(groupId) {
  return EXPRESSION_PANEL_GROUPS.find((g) => g.id === groupId) || null;
}

/** 分组标题（`.title` 文本 = 标题 + ':'） */
function groupTitle(groupId) {
  const group = groupById(groupId);
  if (!group) {
    throw new Error(`条件原语面板基线里没有分组 ${groupId}`);
  }
  return group.title;
}

/** 请求阶段表单（hideGroups 生效后）应渲染的分组（基线顺序） */
function requestPhaseGroups() {
  return EXPRESSION_PANEL_GROUPS.filter(
    (g) => !PANEL_BASELINE.hiddenInRequestPhaseForms.includes(g.id),
  );
}

/** 请求阶段表单内应有的分组标题序列（空按钮组标题为 null，不渲染 box） */
function requestPhaseTitles() {
  return requestPhaseGroups().map((g) => (g.buttons.length > 0 ? `${g.title}:` : null));
}

/** 请求阶段表单内应有的一组按钮文本序列（与面板 DOM 顺序同构） */
function requestPhaseButtonTexts() {
  return requestPhaseGroups().map((g) => g.buttons);
}

/** 请求阶段表单内应有的签名集合（61 - response 3 = 58） */
function requestPhaseSignatures() {
  const ids = requestPhaseGroups().map((g) => g.id);
  return Object.entries(PRIMITIVE_SIGNATURES)
    .filter(([key]) => ids.includes(key.split('.')[0]))
    .map(([, signature]) => signature);
}

/** 请求阶段表单的期望规模（由基线推导，不硬编码） */
function requestPhaseExpectedCounts() {
  const groups = requestPhaseGroups();
  return {
    items: groups.length,
    boxes: groups.filter((g) => g.buttons.length > 0).length,
    buttons: groups.reduce((sum, g) => sum + g.buttons.length, 0),
    signatures: requestPhaseSignatures().length,
  };
}

function allSignatureValues() {
  return Object.values(PRIMITIVE_SIGNATURES);
}

// ---------------------------------------------------------------------------
// 定位（抽屉内面板；`.rule-form` 为四个模块 RuleForm 的共同根）
// ---------------------------------------------------------------------------

function panelItems(page) {
  return page.locator('.rule-form .expression-item');
}

function panelBoxes(page) {
  return page.locator('.rule-form .expression-item-box');
}

function panelTitles(page) {
  return page.locator('.rule-form .expression-item-box .title');
}

function panelButtons(page) {
  return page.locator('.rule-form .vars-expression-show');
}

/** 面板 textarea（`.expression` 同时命中面板根与 Input wrapper → 需 first()） */
function expressionTextarea(page) {
  return page.locator('.rule-form .expression textarea').first();
}

/**
 * 分组条目内的三个子节点（入参为 `panelGroupItem` / `panelItems().nth(i)` 返回的 Locator）：
 * 供 spec 断言「某分组有无 box / 标题文案 / 组内按钮」，spec 内不写裸选择器。
 */
function groupBox(groupItem) {
  return groupItem.locator('.expression-item-box');
}

function groupBoxTitle(groupItem) {
  return groupItem.locator('.expression-item-box .title');
}

function groupButtons(groupItem) {
  return groupItem.locator('.vars-expression-show');
}

/** 悬停后**可见**的 tooltip 弹层（弹层常驻 body，必须过滤可见性） */
function visibleExpressionTooltip(page, signature) {
  const base = page.locator('.ivu-tooltip-inner:visible');
  return signature === undefined ? base : base.filter({ hasText: signature });
}

/**
 * 面板分组条目（`.expression-item`）——按分组标题精确定位，避免标题与按钮文本互相串位
 * （如 `header` 组标题与 `key_in` 按钮）。
 */
async function panelGroupItem(page, groupId) {
  const expected = groupTitle(groupId);
  const items = panelItems(page);
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const titleEl = items.nth(i).locator('.expression-item-box .title');
    if ((await titleEl.count()) === 0) {
      continue;
    }
    const text = (await titleEl.first().innerText()).trim();
    if (text === `${expected}:`) {
      return items.nth(i);
    }
  }
  throw new Error(
    `条件原语面板未找到分组「${groupId}」（期望标题「${expected}:」）；` +
      `当前面板标题：${JSON.stringify(await readPanelTitles(page))}`,
  );
}

/** 分组内某个原语按钮（按 innerText 精确比较，避免 `in` / `value_in` 子串串位） */
async function primitiveButton(page, groupId, buttonName) {
  const item = await panelGroupItem(page, groupId);
  const buttons = item.locator('.vars-expression-show');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    if ((await buttons.nth(i).innerText()).trim() === buttonName) {
      return buttons.nth(i);
    }
  }
  throw new Error(
    `条件原语面板分组「${groupId}」内未找到原语按钮「${buttonName}」`,
  );
}

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------

/** 一次 evaluate 读回面板结构：逐条 `.expression-item` 的标题 + 组内按钮文本序列 */
async function readPanelStructure(page) {
  return page.evaluate(() => {
    const items = Array.from(
      document.querySelectorAll('.rule-form .expression-item'),
    );
    return items.map((item) => {
      const titleEl = item.querySelector('.expression-item-box .title');
      const buttons = Array.from(
        item.querySelectorAll('.vars-expression-show'),
      ).map((b) => (b.innerText || b.textContent || '').trim());
      return {
        title: titleEl
          ? (titleEl.innerText || titleEl.textContent || '').trim()
          : null,
        buttons,
      };
    });
  });
}

async function readPanelTitles(page) {
  const structure = await readPanelStructure(page);
  return structure.map((item) => item.title).filter((t) => t !== null);
}

async function readPanelButtonTexts(page) {
  const structure = await readPanelStructure(page);
  return structure.flatMap((item) => item.buttons);
}

/**
 * 读回 body 内全部 tooltip 签名（弹层常驻 body，含 `vars-expression-show` 的 63 个）。
 * 逻辑连接符无 `description` → `.vars-expression-title` 为空串，调用方自行过滤。
 */
async function readTooltipSignatures(page) {
  return page.evaluate(() => {
    const contents = Array.from(
      document.querySelectorAll('.ivu-tooltip-inner .expression-content'),
    );
    return {
      contentCount: contents.length,
      signatures: contents.map((el) => {
        const title = el.querySelector('.vars-expression-title');
        return title ? (title.innerText || title.textContent || '').trim() : '';
      }),
    };
  });
}

/** 读回面板结构 + 签名（打开抽屉后调用） */
async function readExpressionPanel(page) {
  const structure = await readPanelStructure(page);
  const tooltip = await readTooltipSignatures(page);
  return {
    structure,
    titles: structure.map((item) => item.title),
    buttonTexts: structure.flatMap((item) => item.buttons),
    signatures: tooltip.signatures.filter(Boolean),
    tooltipContentCount: tooltip.contentCount,
  };
}

/** textarea 当前值（表达式） */
async function ruleExpressionValue(page) {
  return expressionTextarea(page).inputValue();
}

/**
 * 统计动作期间发出的 `PATCH /expression/verify` 请求（每次 on-change 一次）。
 * 返回 `{ count, methods }`；调用方负责在动作后 `stop()` 并断言。
 */
function trackExpressionVerifyRequests(page) {
  const hits = [];
  const handler = (request) => {
    if (request.url().includes(EXPRESSION_VERIFY_URL)) {
      hits.push({ method: request.method(), url: request.url() });
    }
  };
  page.on('request', handler);
  return {
    async stop() {
      page.off('request', handler);
      return { count: hits.length, methods: hits.map((h) => h.method) };
    },
    count() {
      return hits.length;
    },
  };
}

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------

/** 基线常量自检（不依赖页面）：分组/原语/连接符数量、组内唯一性、签名条目完整性 */
function expectPanelBaselineConsistent() {
  expect(EXPRESSION_PANEL_GROUPS.length, '面板分组数基线').toBe(
    PANEL_BASELINE.groupCount,
  );
  const ids = EXPRESSION_PANEL_GROUPS.map((g) => g.id);
  expect(new Set(ids).size, '面板分组 id 应唯一').toBe(ids.length);
  const titles = EXPRESSION_PANEL_GROUPS.map((g) => g.title);
  expect(new Set(titles).size, '面板分组标题应唯一').toBe(titles.length);

  const primitives = EXPRESSION_PANEL_GROUPS.filter(
    (g) => g.id !== 'logical',
  ).reduce((sum, g) => sum + g.buttons.length, 0);
  expect(primitives, '条件原语数基线').toBe(PANEL_BASELINE.primitiveCount);
  expect(
    groupById('logical').buttons.length,
    '逻辑连接符数基线',
  ).toBe(PANEL_BASELINE.connectorCount);
  expect(
    Object.keys(PRIMITIVE_SIGNATURES).length,
    '原语签名条目数应与原语数一致',
  ).toBe(primitives);

  for (const g of EXPRESSION_PANEL_GROUPS) {
    expect(
      new Set(g.buttons).size,
      `分组 ${g.id} 内按钮显示名应唯一`,
    ).toBe(g.buttons.length);
  }
  for (const key of Object.keys(PRIMITIVE_SIGNATURES)) {
    const [gid, ...rest] = key.split('.');
    const name = rest.join('.');
    const group = groupById(gid);
    expect(group, `签名 ${key} 引用的分组不存在`).toBeTruthy();
    expect(group.buttons, `签名 ${key} 引用的按钮不在分组 ${gid} 内`).toContain(
      name,
    );
  }
  for (const g of EXPRESSION_PANEL_GROUPS) {
    if (g.id === 'logical') {
      continue;
    }
    for (const name of g.buttons) {
      expect(
        PRIMITIVE_SIGNATURES[`${g.id}.${name}`],
        `原语 ${g.id}.${name} 缺签名基线`,
      ).toBeTruthy();
    }
  }
  expect(
    allSignatureValues().some((s) => s.includes(REMOVED_PRIMITIVE)),
    `签名基线不应含已删除原语 ${REMOVED_PRIMITIVE}`,
  ).toBe(false);
  expect(
    JSON.stringify(EXPRESSION_PANEL_GROUPS).includes(REMOVED_PRIMITIVE),
    `分组基线不应含已删除原语 ${REMOVED_PRIMITIVE}`,
  ).toBe(false);
}

/**
 * 抽屉内面板基线断言（请求阶段表单）：19 个 `.expression-item` / 18 个 `.title` /
 * 63 个 `.vars-expression-show` / 58 条签名，且**标题序列、按钮序列、签名集合**与基线
 * （去掉 hideGroups 的分组）逐项一致；`response` 组整体不渲染。
 */
async function expectRequestPhasePanelBaseline(page, panel = null) {
  const data = panel || (await readExpressionPanel(page));
  const expected = requestPhaseExpectedCounts();

  expect(
    data.structure.map((item) => item.title),
    '面板分组标题序列应与基线（hideGroups 生效后）一致',
  ).toEqual(requestPhaseTitles());
  expect(
    data.structure.map((item) => item.buttons),
    '面板各分组按钮文本序列应与基线一致',
  ).toEqual(requestPhaseButtonTexts());
  expect(data.structure.length, '面板 .expression-item 数').toBe(expected.items);
  expect(data.titles.filter((t) => t !== null).length, '面板 .title 数').toBe(
    expected.boxes,
  );
  expect(data.buttonTexts.length, '面板 .vars-expression-show 数').toBe(
    expected.buttons,
  );
  expect(data.signatures.length, 'tooltip 签名数').toBe(expected.signatures);
  expect(
    data.signatures.slice().sort(),
    'tooltip 签名集合应与基线（hideGroups 生效后）逐字一致',
  ).toEqual(requestPhaseSignatures().slice().sort());

  const responseTitles = EXPRESSION_PANEL_GROUPS.filter(
    (g) => g.id === RESPONSE_GROUP_ID,
  ).map((g) => `${g.title}:`);
  for (const title of responseTitles) {
    expect(data.titles, `response 组标题「${title}」不应出现`).not.toContain(
      title,
    );
  }
  for (const name of RESPONSE_BUTTON_NAMES) {
    expect(
      data.buttonTexts,
      `response 组按钮「${name}」不应出现`,
    ).not.toContain(name);
  }
  for (const key of Object.keys(PRIMITIVE_SIGNATURES).filter((k) =>
    k.startsWith(`${RESPONSE_GROUP_ID}.`),
  )) {
    expect(
      data.signatures,
      `response 组签名「${PRIMITIVE_SIGNATURES[key]}」不应出现`,
    ).not.toContain(PRIMITIVE_SIGNATURES[key]);
  }

  // 面板 DOM 规模锚点（.expression-item-box 数 = .title 数）
  await expect(panelBoxes(page)).toHaveCount(expected.boxes);
  await expect(panelItems(page)).toHaveCount(expected.items);
  await expect(panelButtons(page)).toHaveCount(expected.buttons);
  return data;
}

/** 已删除原语 `bfe_cluster_in` 在整页（含 body 内 tooltip 弹层）无残留 */
async function expectRemovedPrimitiveAbsent(page) {
  const scan = await page.evaluate(
    ({ removed, control }) => {
      const html = document.body.innerHTML || '';
      const text = document.body.innerText || '';
      return {
        inHtml: html.includes(removed),
        inText: text.includes(removed),
        controlInHtml: html.includes(control),
      };
    },
    { removed: REMOVED_PRIMITIVE, control: 'time_weekday_in' },
  );
  expect(
    scan.controlInHtml,
    '正对照：body 内应能扫到 time_weekday_in（证明 tooltip 弹层确在 body、扫描有效）',
  ).toBe(true);
  expect(
    scan.inHtml,
    `已删除原语 ${REMOVED_PRIMITIVE} 不应残留在页面 DOM（含 tooltip 弹层）`,
  ).toBe(false);
  expect(
    scan.inText,
    `已删除原语 ${REMOVED_PRIMITIVE} 不应残留在可见文本中`,
  ).toBe(false);
}

/** 原语存在性 + 签名一致（面板可见文本 + tooltip 签名） */
async function expectPrimitiveExists(page, groupId, buttonName) {
  const button = await primitiveButton(page, groupId, buttonName);
  await expect(button).toBeVisible();
  const signature = PRIMITIVE_SIGNATURES[`${groupId}.${buttonName}`];
  expect(
    signature,
    `原语 ${groupId}.${buttonName} 缺签名基线`,
  ).toBeTruthy();
  return button;
}

/**
 * 悬停原语按钮并断言 tooltip：可见弹层内签名行 = 基线签名，示例片段齐全。
 * 用 `:visible` 过滤（弹层常驻 body，不过滤会命中隐藏弹层）。
 */
async function expectPrimitiveTooltip(
  page,
  groupId,
  buttonName,
  { examples = [] } = {},
) {
  const signature = PRIMITIVE_SIGNATURES[`${groupId}.${buttonName}`];
  expect(signature, `原语 ${groupId}.${buttonName} 缺签名基线`).toBeTruthy();
  const button = await primitiveButton(page, groupId, buttonName);
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  const tip = visibleExpressionTooltip(page, signature).first();
  await expect(tip, `原语 ${groupId}.${buttonName} 的 tooltip 应可见`).toBeVisible(
    { timeout: 10000 },
  );
  await expect(tip.locator('.vars-expression-title')).toHaveText(signature);
  for (const fragment of examples) {
    await expect(
      tip,
      `原语 ${groupId}.${buttonName} 的 tooltip 示例应含「${fragment}」`,
    ).toContainText(fragment);
  }
  return tip;
}

/** 点击原语按钮：断言模板**追加到 textarea 末尾**且触发一次 `PATCH expression/verify` */
async function clickPrimitiveAndExpectAppend(page, groupId, buttonName) {
  const template = PRIMITIVE_TEMPLATES[`${groupId}.${buttonName}`];
  expect(
    template,
    `原语 ${groupId}.${buttonName} 缺模板基线（PRIMITIVE_TEMPLATES）`,
  ).toBeTruthy();
  const before = await ruleExpressionValue(page);
  const tracker = trackExpressionVerifyRequests(page);
  const button = await primitiveButton(page, groupId, buttonName);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(800);
  const after = await ruleExpressionValue(page);
  const { count, methods } = await tracker.stop();
  expect(
    after,
    `点击原语 ${groupId}.${buttonName} 应按模板追加到表达式末尾（追加前「${before}」）`,
  ).toBe(before + template);
  expect(
    count,
    `点击原语 ${groupId}.${buttonName} 应触发 1 次 expression/verify 校验`,
  ).toBe(1);
  expect(methods, 'expression/verify 请求方法应为 PATCH').toEqual(['PATCH']);
  return after;
}

/** 只读态面板：全部原语按钮带 `.readonly`、textarea 置灰不可编辑 */
async function expectPanelReadonly(page, readonlyExpected = true) {
  const buttons = panelButtons(page);
  const count = await buttons.count();
  expect(count, '只读态面板仍应渲染全部原语按钮').toBe(
    requestPhaseExpectedCounts().buttons,
  );
  if (readonlyExpected) {
    for (let i = 0; i < count; i += 1) {
      await expect(buttons.nth(i)).toHaveClass(/readonly/);
    }
    await expect(expressionTextarea(page)).toBeDisabled();
  } else {
    for (let i = 0; i < count; i += 1) {
      await expect(buttons.nth(i)).not.toHaveClass(/readonly/);
    }
    await expect(expressionTextarea(page)).toBeEnabled();
  }
}

/** 只读态点击原语：表达式不变、且不发 `expression/verify` 请求 */
async function expectPrimitiveClickNoEffect(page, groupId, buttonName) {
  const before = await ruleExpressionValue(page);
  const tracker = trackExpressionVerifyRequests(page);
  const button = await primitiveButton(page, groupId, buttonName);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(800);
  const after = await ruleExpressionValue(page);
  const { count } = await tracker.stop();
  expect(
    after,
    `只读态点击原语 ${groupId}.${buttonName} 不应改变表达式`,
  ).toBe(before);
  expect(
    count,
    `只读态点击原语 ${groupId}.${buttonName} 不应触发 expression/verify 请求`,
  ).toBe(0);
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

/** 以指定值写入表达式 textarea（fill + blur 触发一次 on-change 校验） */
async function fillRuleExpression(page, expression) {
  const textarea = expressionTextarea(page);
  await expect(textarea).toBeVisible();
  await textarea.fill(expression);
  await textarea.blur();
  await page.waitForTimeout(600);
  await expect(textarea).toHaveValue(expression);
}

/**
 * 在规则抽屉保持打开的前提下把路由模块切到「查看模式」（RT-E-11 只读断言用）。
 *
 * 为什么需要置位：`RouteRules.vue:118` 把 `:readonly="mode === 'view'"` 传给 RuleForm，
 * 但产品**没有**在视图模式打开规则抽屉的入口——视图模式操作列只渲染「查看」
 * （`RouteRules.vue:296-302`）打开的是 `RuleView`（只读信息面板，不含原语面板）；
 * 含面板的抽屉只由 `onAddRule` / `onEditRule` 打开，二者都要求 `mode === 'edit'`
 * （`RouteRules.vue:458-475`）。故只读面板在 UI 上不可达，按仓库既有 `__vue__` 手法
 * （先例：`pages/resource/BusinessClusterPage.js` 的 openCreateBusinessClusterDrawerByModel）
 * 直接置位组件状态：**只改 UI 状态，不发任何写请求**。
 */
async function forceRouteRulesViewModeWithDrawerOpen(page) {
  const switched = await page.evaluate(() => {
    const el = document.querySelector('.route-rules');
    if (!el) {
      return false;
    }
    let vue = el.__vue__;
    for (let i = 0; i < 10 && vue && vue.mode === undefined; i += 1) {
      vue = vue.$parent;
    }
    if (!vue || vue.mode === undefined) {
      return false;
    }
    vue.mode = 'view';
    return true;
  });
  if (!switched) {
    throw new Error(
      '置位路由规则查看模式失败：未取到 .route-rules 的 RouteRules 组件实例（__vue__）',
    );
  }
  common.log('已按 __vue__ 手法把 RouteRules 置位到查看模式（抽屉保持打开）');
  await page.waitForTimeout(600);
}

module.exports = {
  PANEL_BASELINE,
  EXPRESSION_PANEL_GROUPS,
  PRIMITIVE_SIGNATURES,
  PRIMITIVE_TEMPLATES,
  PRIMITIVE_TOOLTIP_EXAMPLES,
  REMOVED_PRIMITIVE,
  RESPONSE_GROUP_ID,
  RESPONSE_BUTTON_NAMES,
  EXPRESSION_VERIFY_URL,
  groupById,
  groupTitle,
  requestPhaseGroups,
  requestPhaseTitles,
  requestPhaseButtonTexts,
  requestPhaseSignatures,
  requestPhaseExpectedCounts,
  allSignatureValues,
  panelItems,
  panelBoxes,
  panelTitles,
  panelButtons,
  expressionTextarea,
  groupBox,
  groupBoxTitle,
  groupButtons,
  visibleExpressionTooltip,
  panelGroupItem,
  primitiveButton,
  readPanelStructure,
  readPanelTitles,
  readPanelButtonTexts,
  readTooltipSignatures,
  readExpressionPanel,
  ruleExpressionValue,
  trackExpressionVerifyRequests,
  expectPanelBaselineConsistent,
  expectRequestPhasePanelBaseline,
  expectRemovedPrimitiveAbsent,
  expectPrimitiveExists,
  expectPrimitiveTooltip,
  clickPrimitiveAndExpectAppend,
  expectPanelReadonly,
  expectPrimitiveClickNoEffect,
  fillRuleExpression,
  forceRouteRulesViewModeWithDrawerOpen,
};