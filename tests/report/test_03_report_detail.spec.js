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
 * 数据报表 - 详情 Drawer（RP-L-11 / RP-L-12 / RP-L-13 / RP-L-14 / RP-L-15 /
 * RP-L-21 / RP-L-22 / RP-L-23 / RP-L-24 详情侧）
 *
 * 断言策略：详情抽屉的字段全集与展示口径经 rp.mockReportLogs 注入受控 items
 * （字段口径与 GET report/logs 的 item 一致，含 JSON 列与 level1Name~level5——
 * 种子脚本 scripts/seed-report-data.js 不写这些列，真实环境恒为 NULL），
 * 打开抽屉本身仍走真实页面交互（行内「详情」按钮 → 右侧 Drawer）；列表侧
 * 一致性由 test_02 RP-L-24 覆盖，本文件不重复。
 *
 * 设计依据：docs/report/02-功能测试用例/04-明细新列与过滤.md
 * 运行：PW_WORKERS=1 npx playwright test tests/report/test_03_report_detail.spec.js
 */
const { test, expect } = require('@playwright/test');
const rp = require('../../pages/report/ReportPage');

/**
 * 构造一条明细 fixture（字段口径与 GET report/logs 返回的 item 一致，共 49 字段）
 */
function buildDetailItem(overrides = {}) {
  return {
    logid: 12345,
    log_time: 1791995397,
    hostid: 'gw-01',
    product: 'default',
    ai_apikey_id: 'key-demo-a',
    ai_requested_model: 'deepseek-chat',
    ai_target_model: 'deepseek-chat',
    ai_provider: 'deepseek',
    ai_protocol: 'openai',
    ai_mode: 'chat',
    ai_stream: 1,
    res_status_code: 200,
    err_code: '',
    err_msg: '',
    ai_input_tokens: 551,
    ai_output_tokens: 292,
    ai_total_tokens: 843,
    all_time: 621,
    ai_ttft_us: 687282,
    ai_tpot_us: 199382,
    ai_cost_value: 0.00005,
    ai_cost_currency: 'RMB',
    ai_rate_limit_hits: '[{"rate_limit_policy_id":"p1","rule_names":["r1"]}]',
    ai_auth_reject_quota_plans: '["plan-a"]',
    level1Name: 'dep',
    level1: 'ops',
    level2Name: 'team',
    level2: 'core',
    level3Name: 'app',
    level3: 'gateway',
    level4Name: 'env',
    level4: 'prod',
    level5Name: 'ver',
    level5: 'v1',
    client_ip: '10.0.0.1',
    header_host: 'api.example.org',
    origin_uri: '/v1/chat',
    req_headers: '[{"X-Test":["1"]}]',
    res_headers: '[{"Server":["nginx"]}]',
    ai_cache_status: 'hit',
    mirror_hit: true,
    mirror_cluster: 'mirror-bj',
    ai_intent_question: 'task_type',
    ai_intent_answer: 'coding',
    ai_intent_confidence: 0.95,
    ai_intent_source: 'classifier',
    ai_intent_latency_us: 1200,
    ai_intent_cache_hit: true,
    ai_intent_questions_version: 'v3',
    ...overrides,
  };
}

/**
 * 进入明细页签并加载 mock items，返回首个 report/logs 响应
 */
async function loadMockedDetailRows(page, items, options = {}) {
  await rp.gotoReportPage(page);
  await rp.mockReportLogs(page, { items, ...options });
  const response = await rp.waitForReportLogsResponse(page, () =>
    rp.switchToTab(page, rp.DOC.logsTab),
  );
  await rp.reportLogsTable(page).waitForLoaded();
  return response;
}

// ====== 展示口径（与 Logs.vue / index.vue 对齐，见 04 文档 RP-L-12 ~ RP-L-15、RP-L-24）======

function fmtUsDetail(us) {
  // fmtUsDetail：null 或 0 视为「未设置」→ '-'，否则 (us/1000).toFixed(1) ms
  if (us == null || us === 0) return '-';
  return `${(us / 1000).toFixed(1)} ms`;
}

function fmtLevel(name, value) {
  if (name == null && value == null) return '-';
  return `${name || '-'} = ${value || '-'}`;
}

function fmtCacheStatus(status) {
  if (status == null) return '-';
  return status === '' ? '未启用' : String(status);
}

function fmtMirrorHitDetail(item) {
  if (item.mirror_hit == null) return '-';
  if (!item.mirror_hit) return '否';
  return item.mirror_cluster ? `是（${item.mirror_cluster}）` : '是';
}

function fmtCost(item) {
  if (item.ai_cost_value == null) return '-';
  return `${item.ai_cost_value} ${item.ai_cost_currency || ''}`;
}

function orDash(value) {
  return value == null || value === '' ? '-' : String(value);
}

/**
 * 由 item 推导详情抽屉 38 个字段项的期望展示值
 */
function expectedDetailValues(item) {
  return {
    日志ID: item.logid == null ? '-' : String(item.logid),
    时间: rp.formatTimestamp(item.log_time),
    主机ID: orDash(item.hostid),
    产品线: orDash(item.product),
    'API Key': orDash(item.ai_apikey_id),
    请求模型: orDash(item.ai_requested_model),
    目标模型: orDash(item.ai_target_model),
    服务商: orDash(item.ai_provider),
    协议: orDash(item.ai_protocol),
    模式: orDash(item.ai_mode),
    流式:
      item.ai_stream == null ? '-' : item.ai_stream === 1 ? '是' : '否',
    状态码: item.res_status_code == null ? '-' : String(item.res_status_code),
    错误码: orDash(item.err_code),
    错误: orDash(item.err_msg),
    输入Tokens: rp.formatMetricNumber(item.ai_input_tokens),
    输出Tokens: rp.formatMetricNumber(item.ai_output_tokens),
    总Tokens: rp.formatMetricNumber(item.ai_total_tokens),
    耗时: item.all_time == null ? '-' : `${item.all_time} ms`,
    TTFT: fmtUsDetail(item.ai_ttft_us),
    TPOT: fmtUsDetail(item.ai_tpot_us),
    费用: fmtCost(item),
    一级归类: fmtLevel(item.level1Name, item.level1),
    二级归类: fmtLevel(item.level2Name, item.level2),
    三级归类: fmtLevel(item.level3Name, item.level3),
    四级归类: fmtLevel(item.level4Name, item.level4),
    五级归类: fmtLevel(item.level5Name, item.level5),
    客户端IP: orDash(item.client_ip),
    'Header Host': orDash(item.header_host),
    原始URI: orDash(item.origin_uri),
    缓存状态: fmtCacheStatus(item.ai_cache_status),
    镜像命中: fmtMirrorHitDetail(item),
    意图问题: orDash(item.ai_intent_question),
    意图答案: orDash(item.ai_intent_answer),
    意图置信度:
      item.ai_intent_confidence == null
        ? '-'
        : String(item.ai_intent_confidence),
    意图来源: orDash(item.ai_intent_source),
    // 意图延迟沿用 fmtUs（接口不写 0，无「未设置」口径）；TTFT / TPOT 走 fmtUsDetail
    意图延迟:
      item.ai_intent_latency_us == null
        ? '-'
        : `${(item.ai_intent_latency_us / 1000).toFixed(1)} ms`,
    意图缓存命中:
      item.ai_intent_cache_hit == null
        ? '-'
        : item.ai_intent_cache_hit
          ? '是'
          : '否',
    意图问题版本: orDash(item.ai_intent_questions_version),
  };
}

/**
 * 逐项断言抽屉展示值与 item 一致
 * @param {object} only 仅核对指定字段（{ 标签: 期望值 }）
 */
async function expectDetailMatchesItem(page, item, only) {
  const expected = expectedDetailValues(item);
  const labels = only ? Object.keys(only) : Object.keys(expected);
  for (const label of labels) {
    const want = only ? only[label] : expected[label];
    await rp.expectDetailFieldValue(page, label, want);
  }
}

/**
 * 明细某列各行的单元格文本
 */
async function columnCells(page, columnTitle) {
  const idx = rp.LOG_TABLE_COLUMNS_15.indexOf(columnTitle);
  expect(idx, `列「${columnTitle}」应存在于 15 列定义`).toBeGreaterThanOrEqual(0);
  const count = await rp.reportLogsMainRows(page).count();
  const texts = [];
  for (let i = 0; i < count; i++) {
    const cells = await rp.getLogsMainRowCellTexts(page, i);
    texts.push(cells[idx]);
  }
  return texts;
}

test.describe('数据报表 - RP-L-11 详情抽屉展示新字段', () => {
  test('验证详情抽屉渲染缓存 / 镜像 / 意图九个新字段并与接口一致', async ({
    page,
  }) => {
    const item = buildDetailItem({
      ai_cache_status: 'hit',
      mirror_hit: true,
      mirror_cluster: 'mirror-bj',
      ai_intent_question: 'task_type',
      ai_intent_answer: 'coding',
      ai_intent_confidence: 0.95,
      ai_intent_source: 'classifier',
      ai_intent_latency_us: 1200,
      ai_intent_cache_hit: true,
      ai_intent_questions_version: 'v3',
    });
    await loadMockedDetailRows(page, [item]);

    await test.step('打开第一行详情抽屉', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await rp.expectDetailDrawerOpen(page);
    });

    await test.step('九个新字段存在且展示值与 item 一致', async () => {
      await rp.expectDetailFieldsPresent(page, [
        '缓存状态',
        '镜像命中',
        '意图问题',
        '意图答案',
        '意图置信度',
        '意图来源',
        '意图延迟',
        '意图缓存命中',
        '意图问题版本',
      ]);
      await expectDetailMatchesItem(page, item, {
        缓存状态: 'hit',
        镜像命中: '是（mirror-bj）',
        意图问题: 'task_type',
        意图答案: 'coding',
        意图置信度: '0.95',
        意图来源: 'classifier',
        意图延迟: '1.2 ms',
        意图缓存命中: '是',
        意图问题版本: 'v3',
      });
    });

    await test.step('新字段与基础字段全集同屏渲染', async () => {
      await rp.expectDetailFieldsPresent(page);
      await rp.closeDetailDrawer(page);
    });
  });
});

test.describe('数据报表 - RP-L-12 详情空值显示占位符', () => {
  test('验证空值 / 空串 / null 字段展示占位 - 且无明文外露', async ({
    page,
  }) => {
    const emptyItem = buildDetailItem({
      logid: null,
      hostid: null,
      product: null,
      ai_apikey_id: null,
      ai_protocol: null,
      ai_mode: null,
      ai_stream: null,
      err_code: null,
      err_msg: null,
      client_ip: null,
      header_host: null,
      origin_uri: null,
      level1Name: null,
      level1: null,
      level2Name: null,
      level2: null,
      level3Name: null,
      level3: null,
      level4Name: null,
      level4: null,
      level5Name: null,
      level5: null,
      ai_cache_status: null,
      mirror_hit: null,
      mirror_cluster: '',
      ai_intent_question: '',
      ai_intent_answer: '',
      ai_intent_confidence: null,
      ai_intent_source: '',
      ai_intent_latency_us: null,
      ai_intent_cache_hit: null,
      ai_intent_questions_version: null,
    });
    const zeroItem = buildDetailItem({
      ai_intent_confidence: 0,
      ai_stream: 0,
      mirror_hit: false,
      ai_intent_cache_hit: false,
      ai_intent_latency_us: 0,
    });
    await loadMockedDetailRows(page, [emptyItem, zeroItem]);

    await test.step('全空行：字符串 / 布尔 / 归类字段统一展示 -', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await expectDetailMatchesItem(page, emptyItem, {
        日志ID: '-',
        主机ID: '-',
        产品线: '-',
        'API Key': '-',
        协议: '-',
        模式: '-',
        流式: '-',
        错误码: '-',
        错误: '-',
        客户端IP: '-',
        'Header Host': '-',
        原始URI: '-',
        一级归类: '-',
        二级归类: '-',
        三级归类: '-',
        四级归类: '-',
        五级归类: '-',
        镜像命中: '-',
        意图问题: '-',
        意图答案: '-',
        意图置信度: '-',
        意图来源: '-',
        意图延迟: '-',
        意图缓存命中: '-',
        意图问题版本: '-',
      });
      const drawerText = await rp.getDetailDrawerText(page);
      expect(drawerText).not.toContain('undefined');
      expect(drawerText).not.toContain('null');
      await rp.closeDetailDrawer(page);
    });

    await test.step('零值 / false 行：0 展示 0，布尔 false 展示「否」', async () => {
      await rp.openDetailByRowIndex(page, 1);
      await expectDetailMatchesItem(page, zeroItem, {
        流式: '否',
        镜像命中: '否',
        意图置信度: '0',
        意图缓存命中: '否',
        意图延迟: '0.0 ms',
      });
      await rp.closeDetailDrawer(page);
    });
  });
});

test.describe('数据报表 - RP-L-13 意图延迟格式化', () => {
  test('验证意图延迟 / TTFT / TPOT 的 μs → ms 换算与 0 值口径', async ({
    page,
  }) => {
    const items = [
      buildDetailItem({
        ai_intent_latency_us: 1200,
        ai_ttft_us: 687282,
        ai_tpot_us: 199382,
      }),
      buildDetailItem({
        ai_intent_latency_us: 0,
        ai_ttft_us: 0,
        ai_tpot_us: 0,
      }),
      buildDetailItem({
        ai_intent_latency_us: null,
        ai_ttft_us: null,
        ai_tpot_us: null,
      }),
    ];
    await loadMockedDetailRows(page, items);

    await test.step('非空值：μs 换算为 ms 并保留 1 位小数', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await expectDetailMatchesItem(page, items[0], {
        意图延迟: '1.2 ms',
        TTFT: '687.3 ms',
        TPOT: '199.4 ms',
      });
      await rp.closeDetailDrawer(page);
    });

    await test.step('0 与 null：详情侧统一展示 -（0 视为未设置）', async () => {
      await rp.openDetailByRowIndex(page, 1);
      await expectDetailMatchesItem(page, items[1], {
        意图延迟: '0.0 ms',
        TTFT: '-',
        TPOT: '-',
      });
      await rp.closeDetailDrawer(page);

      await rp.openDetailByRowIndex(page, 2);
      await expectDetailMatchesItem(page, items[2], {
        意图延迟: '-',
        TTFT: '-',
        TPOT: '-',
      });
      await rp.closeDetailDrawer(page);
    });

    await test.step('列表侧 TTFT 列仍为 fmtUs 口径（0 展示 0.0 ms，未随详情改动）', async () => {
      expect(await columnCells(page, 'TTFT')).toEqual([
        '687.3 ms',
        '0.0 ms',
        '-',
      ]);
    });
  });
});

test.describe('数据报表 - RP-L-14 镜像命中展示集群', () => {
  test('验证详情「镜像命中」与列表「镜像」列的集群追加与空值口径', async ({
    page,
  }) => {
    const items = [
      buildDetailItem({ mirror_hit: true, mirror_cluster: 'mirror-bj' }),
      buildDetailItem({ mirror_hit: true, mirror_cluster: '' }),
      buildDetailItem({ mirror_hit: false, mirror_cluster: '' }),
      buildDetailItem({ mirror_hit: null, mirror_cluster: '' }),
    ];
    await loadMockedDetailRows(page, items);

    await test.step('列表「镜像」列：命中追加集群，未命中 / 空值展示 -', async () => {
      expect(await columnCells(page, '镜像')).toEqual([
        '命中（mirror-bj）',
        '命中',
        '-',
        '-',
      ]);
    });

    await test.step('详情「镜像命中」：是（集群）/ 是 / 否 / -', async () => {
      const expected = ['是（mirror-bj）', '是', '否', '-'];
      for (let i = 0; i < items.length; i++) {
        await rp.openDetailByRowIndex(page, i);
        await expectDetailMatchesItem(page, items[i], {
          镜像命中: expected[i],
        });
        await rp.closeDetailDrawer(page);
      }
    });
  });
});

test.describe('数据报表 - RP-L-15 缓存状态空串展示未启用', () => {
  test('验证缓存状态空串展示「未启用」、null 展示 -、命中态原值', async ({
    page,
  }) => {
    const items = [
      buildDetailItem({ ai_cache_status: '' }),
      buildDetailItem({ ai_cache_status: 'hit' }),
      buildDetailItem({ ai_cache_status: null }),
    ];
    await loadMockedDetailRows(page, items);

    await test.step('列表「缓存」列：空串命中占位展示 -（列表口径未改）', async () => {
      expect(await columnCells(page, '缓存')).toEqual(['-', 'hit', '-']);
    });

    await test.step('详情「缓存状态」：空串 → 未启用，null → -，命中态原值', async () => {
      const expected = ['未启用', 'hit', '-'];
      for (let i = 0; i < items.length; i++) {
        await rp.openDetailByRowIndex(page, i);
        await expectDetailMatchesItem(page, items[i], {
          缓存状态: expected[i],
        });
        await rp.closeDetailDrawer(page);
      }
    });
  });
});

test.describe('数据报表 - RP-L-21 详情抽屉全字段展示', () => {
  test('验证抽屉覆盖接口 49 字段：38 个字段项 + 4 个 JSON 区块', async ({
    page,
  }) => {
    const item = buildDetailItem();
    await loadMockedDetailRows(page, [item]);

    await test.step('打开抽屉', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await rp.expectDetailDrawerOpen(page);
    });

    await test.step('38 个字段项按模板顺序渲染，无缺失无多余', async () => {
      const labels = await rp.getDetailFieldLabels(page);
      expect(labels).toEqual(rp.DETAIL_FIELD_LABELS);
      expect(labels.length).toBe(38);
    });

    await test.step('4 个 JSON 区块按固定顺序渲染', async () => {
      expect(await rp.getDetailJsonLabels(page)).toEqual(rp.DETAIL_JSON_FIELDS);
    });

    await test.step('接口 49 字段与抽屉渲染项一一对应', async () => {
      // 49 = 38 个字段项承载的 45 个 key（费用 / 镜像 / 一级~五级归类为 name+value 成对合并）
      //      + 4 个 JSON 区块 key
      const keys = Object.keys(item);
      expect(keys.length).toBe(49);
      const pairedExtraKeys = 7; // ai_cost_currency + mirror_cluster + level2Name~level5Name 共 5
      expect(rp.DETAIL_FIELD_LABELS.length + pairedExtraKeys).toBe(45);
      expect(45 + rp.DETAIL_JSON_FIELDS.length).toBe(keys.length);
      for (const field of rp.DETAIL_JSON_FIELDS) {
        expect(keys).toContain(field);
      }
    });

    await test.step('字段展示值与 item 逐项一致（含格式化口径）', async () => {
      await expectDetailMatchesItem(page, item);
    });

    await test.step('抽屉不再存在接口已返回却未渲染的字段', async () => {
      await expectDetailMatchesItem(page, item, {
        日志ID: '12345',
        时间: rp.formatTimestamp(item.log_time),
        请求模型: 'deepseek-chat',
        目标模型: 'deepseek-chat',
        服务商: 'deepseek',
        状态码: '200',
        错误: '-',
        总Tokens: '843',
        耗时: '621 ms',
        TTFT: '687.3 ms',
        费用: '0.00005 RMB',
        二级归类: 'team = core',
        三级归类: 'app = gateway',
        四级归类: 'env = prod',
        五级归类: 'ver = v1',
      });
      await rp.closeDetailDrawer(page);
    });
  });
});

test.describe('数据报表 - RP-L-22 JSON 字段折叠展开', () => {
  test('验证 JSON 区块仅非 null 渲染、默认折叠且展开互不影响', async ({
    page,
  }) => {
    const withJson = buildDetailItem();
    const withoutJson = buildDetailItem({
      ai_rate_limit_hits: null,
      ai_auth_reject_quota_plans: null,
      req_headers: null,
      res_headers: null,
    });
    await loadMockedDetailRows(page, [withJson, withoutJson]);

    await test.step('非 null 的 4 个 JSON 字段按固定顺序渲染', async () => {
      await rp.openDetailByRowIndex(page, 0);
      expect(await rp.getDetailJsonLabels(page)).toEqual(rp.DETAIL_JSON_FIELDS);
    });

    await test.step('默认折叠，点击标题展开后内容可见，再次点击折叠', async () => {
      await rp.expectJsonFieldCollapsed(page, 'req_headers');
      await rp.expectJsonFieldCollapsible(page, 'req_headers');
    });

    await test.step('各 JSON 字段展开 / 折叠互相独立', async () => {
      await rp.toggleJsonField(page, 'ai_rate_limit_hits');
      await rp.toggleJsonField(page, 'ai_auth_reject_quota_plans');
      await rp.expectJsonFieldExpanded(page, 'ai_rate_limit_hits');
      await rp.expectJsonFieldExpanded(page, 'ai_auth_reject_quota_plans');
      await rp.toggleJsonField(page, 'ai_rate_limit_hits');
      await rp.expectJsonFieldCollapsed(page, 'ai_rate_limit_hits');
      await rp.expectJsonFieldExpanded(page, 'ai_auth_reject_quota_plans');
      await rp.closeDetailDrawer(page);
    });

    await test.step('JSON 字段全为 null 的记录不渲染 JSON 区块', async () => {
      await rp.openDetailByRowIndex(page, 1);
      expect(await rp.getDetailJsonLabels(page)).toEqual([]);
      await rp.closeDetailDrawer(page);
    });
  });
});

test.describe('数据报表 - RP-L-23 关闭详情抽屉', () => {
  test('验证 X 按钮关闭，遮罩点击不关闭（maskClosable=false）', async ({
    page,
  }) => {
    const item = buildDetailItem();
    await loadMockedDetailRows(page, [item]);

    await test.step('X 按钮关闭后可再次打开并展示所选行数据', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await rp.expectDetailDrawerOpen(page);
      await rp.closeDetailDrawer(page);
      await rp.openDetailByRowIndex(page, 0);
      await expectDetailMatchesItem(page, item, {
        日志ID: '12345',
        请求模型: 'deepseek-chat',
      });
      await rp.closeDetailDrawer(page);
    });

    await test.step('遮罩点击不关闭（maskClosable=false）', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await rp.closeDetailDrawerByMask(page);
    });
  });
});

test.describe('数据报表 - RP-L-24 明细列表与详情展示数据同接口响应一致性（详情侧）', () => {
  test('验证详情抽屉各字段展示值与 report/logs 响应 items 逐字段一致', async ({
    page,
  }) => {
    const items = [
      buildDetailItem({
        logid: 101,
        log_time: 1700000123,
        ai_apikey_id: 'key-a',
        ai_requested_model: 'gpt-4o',
        ai_target_model: 'gpt-4o-mini',
        ai_provider: 'anthropic',
        ai_stream: 0,
        res_status_code: 429,
        all_time: 88,
        ai_input_tokens: 1500,
        ai_output_tokens: 1000,
        ai_total_tokens: 2500,
        ai_ttft_us: 23456,
        ai_tpot_us: 0,
        ai_cost_value: 0.98,
        ai_cost_currency: 'RMB',
        ai_cache_status: 'skip',
        mirror_hit: true,
        mirror_cluster: 'mirror-sh',
        ai_intent_question: 'task_type',
        ai_intent_answer: 'unknown',
        ai_intent_confidence: 0.42,
        ai_intent_source: 'cache',
        ai_intent_latency_us: null,
        ai_intent_cache_hit: false,
        ai_intent_questions_version: 'v9',
      }),
      buildDetailItem({
        logid: 102,
        log_time: 1700000000,
        ai_stream: null,
        err_code: null,
        err_msg: null,
        ai_cache_status: '',
        mirror_hit: false,
        mirror_cluster: '',
        ai_intent_question: '',
        ai_intent_answer: '',
        ai_intent_confidence: null,
        ai_intent_source: '',
        ai_intent_latency_us: null,
        ai_intent_cache_hit: null,
        ai_intent_questions_version: '',
        level1Name: null,
        level1: null,
        client_ip: null,
        header_host: null,
        origin_uri: null,
        req_headers: null,
        res_headers: null,
        ai_rate_limit_hits: null,
        ai_auth_reject_quota_plans: null,
      }),
    ];
    await loadMockedDetailRows(page, items);

    await test.step('行序与响应 items 顺序一致（前端未重排）', async () => {
      const times = await columnCells(page, '时间');
      expect(times).toEqual([
        rp.formatTimestamp(items[0].log_time),
        rp.formatTimestamp(items[1].log_time),
      ]);
    });

    await test.step('首行详情：38 字段展示值与该 item 逐字段一致（含格式化口径）', async () => {
      await rp.openDetailByRowIndex(page, 0);
      await expectDetailMatchesItem(page, items[0]);
      await expectDetailMatchesItem(page, items[0], {
        耗时: '88 ms',
        总Tokens: '2.5K',
        输入Tokens: '1.5K',
        输出Tokens: '1.0K',
        TTFT: '23.5 ms',
        TPOT: '-',
        费用: '0.98 RMB',
        缓存状态: 'skip',
        镜像命中: '是（mirror-sh）',
        意图答案: 'unknown',
        意图置信度: '0.42',
        意图延迟: '-',
        意图缓存命中: '否',
      });
      await rp.closeDetailDrawer(page);
    });

    await test.step('次行详情：空串 / null / false 混合行的占位口径', async () => {
      await rp.openDetailByRowIndex(page, 1);
      await expectDetailMatchesItem(page, items[1], {
        流式: '-',
        错误码: '-',
        错误: '-',
        缓存状态: '未启用',
        镜像命中: '否',
        意图问题: '-',
        意图答案: '-',
        意图置信度: '-',
        意图来源: '-',
        意图缓存命中: '-',
        意图问题版本: '-',
        一级归类: '-',
        客户端IP: '-',
        'Header Host': '-',
        原始URI: '-',
      });
      const drawerText = await rp.getDetailDrawerText(page);
      expect(drawerText).not.toContain('undefined');
      expect(drawerText).not.toContain('null');
      await rp.closeDetailDrawer(page);
    });

    await test.step('重查（改过滤条件）后详情展示值仍与新响应一致', async () => {
      const refetched = [buildDetailItem({ logid: 777, ai_provider: 'openai' })];
      await rp.mockReportLogs(page, { items: refetched });
      await rp.waitForReportLogsResponse(page, () => rp.triggerLogsSearch(page));
      await rp.openDetailByRowIndex(page, 0);
      await expectDetailMatchesItem(page, refetched[0], {
        日志ID: '777',
        服务商: 'openai',
      });
      await rp.closeDetailDrawer(page);
    });
  });
});