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
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 报表模块「测试侧自造数」脚本
 *
 * 用途：
 *   为 tests/report/test_02_report_logs.spec.js 造出落在默认「最近 1 小时」
 *   查询窗口内的报表数据，替代此前人工维护、会随时间滑出窗口的演示数据。
 *   每次执行都会把种子数据刷新到当前窗口，因此可反复执行（幂等）。
 *
 * 造数口径：
 *   - 存储时间 = 本地当前时间 - offset-hours（默认 8）。
 *     背景：运行实例 Go 驱动按 UTC 绑定时间参数、MySQL 会话为 CST，报表查询
 *     窗口整体偏移 -8h（等效 UTC）；以「本地 - 8h」落库后双偏移抵消，界面在
 *     默认窗口内可见且显示时间正确。修复 DSN（加 loc=Local）是独立待办，
 *     不在本脚本范围；若 DSN 已加 loc=Local，请把 offset 改为 0
 *     （--offset-hours=0 或 REPORT_SEED_OFFSET_HOURS=0）。
 *   - bfe_ai_metrics_1m：6 行/分钟桶（2 模型 × 2 API Key × 2 主机），
 *     覆盖缓存 hit/miss/skip、镜像 0/1（命中带 mirror-bj）、
 *     意图 coding/chat/unknown、状态码 200/429/500，request_count 20~80 波动。
 *   - bfe_ai_request_log：4 行/分钟桶（同维度组合，时间戳带秒级抖动）。
 *
 * 数据标记与安全：
 *   - 种子行统一以 product='rptseed' 标记（apikey 同时用 rptseed_key_a/b
 *     前缀命名便于肉眼识别）。清理与删除条件只命中该标记，严禁触碰
 *     真实/演示数据。
 *   - 分区兜底：两表为 RANGE(TO_DAYS) 分区，探测种子时间所在日期分区，
 *     缺失时自动补 pYYYYMMDD（幂等，存在即跳过）。
 *
 * 用法：
 *   node scripts/seed-report-data.js [--minutes=12] [--offset-hours=8]
 *   node scripts/seed-report-data.js --cleanup   # 只清理种子行（spec afterAll 用，
 *     避免种子数据影响依赖「默认窗口为空」的其它 spec，如 test_01 RP-O-03/RP-O-13）
 *   环境变量：REPORT_SEED_MINUTES / REPORT_SEED_OFFSET_HOURS /
 *             REPORT_MYSQL_BIN / REPORT_MYSQL_HOST / REPORT_MYSQL_PORT /
 *             REPORT_MYSQL_USER / REPORT_MYSQL_PASSWORD / REPORT_MYSQL_DB
 *
 * 数据库连接默认值（127.0.0.1:3306 / root / open_bfe）取自本机运行实例配置
 * ai-gateway-runtime/conf/ai_gateway_api.toml 的 [Databases.bfe_db]；
 * 密码默认值 123456 为本地开发环境值，可用 REPORT_MYSQL_PASSWORD 覆盖。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

const args = parseArgs(process.argv);
const MINUTES = Number(args.minutes || process.env.REPORT_SEED_MINUTES || 12);
const OFFSET_HOURS = Number(
  args['offset-hours'] || process.env.REPORT_SEED_OFFSET_HOURS || 8,
);
const MYSQL_BIN =
  process.env.REPORT_MYSQL_BIN ||
  (fs.existsSync('/usr/local/mysql/bin/mysql')
    ? '/usr/local/mysql/bin/mysql'
    : 'mysql');
const DB_HOST = process.env.REPORT_MYSQL_HOST || '127.0.0.1';
const DB_PORT = process.env.REPORT_MYSQL_PORT || '3306';
const DB_USER = process.env.REPORT_MYSQL_USER || 'root';
const DB_PASS = process.env.REPORT_MYSQL_PASSWORD || '123456';
const DB_NAME = process.env.REPORT_MYSQL_DB || 'open_bfe';

const MARKER = 'rptseed';
const MODELS = [
  { name: 'gpt-4o', provider: 'openai' },
  { name: 'deepseek-chat', provider: 'deepseek' },
];
const KEYS = ['rptseed_key_a', 'rptseed_key_b'];
const HOSTS = ['gw-01', 'gw-02'];

/** 确定性伪随机（同一次运行的同一下标取值稳定） */
function prand(seed) {
  let x = seed >>> 0;
  x = (x * 1103515245 + 12345) & 0x7fffffff;
  return x / 0x7fffffff;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(d) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function runSql(sql) {
  return execFileSync(
    MYSQL_BIN,
    [
      `-h${DB_HOST}`,
      `-P${DB_PORT}`,
      `-u${DB_USER}`,
      `-p${DB_PASS}`,
      '--silent',
      '--skip-column-names',
      DB_NAME,
    ],
    { input: sql, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
  );
}

/** 分区兜底：种子时间所在日期的分区缺失时补 pYYYYMMDD（幂等） */
function ensurePartitions(dates) {
  for (const table of ['bfe_ai_metrics_1m', 'bfe_ai_request_log']) {
    const existing = new Set(
      runSql(
        `SELECT PARTITION_NAME FROM information_schema.PARTITIONS ` +
          `WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='${table}' ` +
          `AND PARTITION_NAME IS NOT NULL;`,
      )
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    for (const d of dates) {
      const pName = `p${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
      if (existing.has(pName)) continue;
      const next = new Date(d.getTime() + 24 * 3600 * 1000);
      // p_future 是 MAXVALUE 尾分区，直接 ADD 会排在它之后报错，
      // 需把 p_future 重组织为「新分区 + 原 MAXVALUE 尾分区」
      runSql(
        `ALTER TABLE ${table} REORGANIZE PARTITION p_future INTO ` +
          `(PARTITION ${pName} VALUES LESS THAN (TO_DAYS('${fmt(next).slice(0, 10)}')), ` +
          `PARTITION p_future VALUES LESS THAN MAXVALUE);`,
      );
      console.log(`  [partition] ${table} 新增 ${pName}`);
    }
  }
}

function buildMetricsRows() {
  const rows = [];
  for (let b = 0; b < MINUTES; b++) {
    const bucket = new Date(baseTime.getTime() - b * 60 * 1000);
    const ts = fmt(bucket).slice(0, 16) + ':00'; // 分钟桶对齐
    let i = 0;
    for (const model of MODELS) {
      for (const key of KEYS) {
        for (const host of HOSTS) {
          const r = prand((b + 1) * 1000 + i * 97);
          const reqCount = 20 + Math.floor(r * 61); // 20~80
          const cache = ['hit', 'miss', 'skip', 'hit', 'miss', 'skip', 'hit', 'miss'][i];
          const mirrorHit = i % 3 === 1 ? 1 : 0;
          const intent =
            i % 2 === 0 ? 'coding' : i % 3 === 1 ? 'chat' : 'unknown';
          let status = 200;
          if (i === 4) status = 429;
          if (i === 5) status = 500;
          const errCount = status >= 400 ? reqCount : 0;
          const inTok = reqCount * (200 + Math.floor(prand(b * 31 + i) * 200));
          const outTok =
            reqCount * (50 + Math.floor(prand(b * 37 + i * 3) * 150));
          rows.push(
            `('${ts}','${host}','${key}','${model.name}','${model.name}',0,` +
              `'${MARKER}','cluster-rptseed','${host}:443','POST',${status},` +
              `${status >= 400 ? `'seed_err_${status}'` : `''`},` +
              `'api.rptseed.local','${model.provider}','openai','chat','RMB',` +
              `'${cache}',${mirrorHit},'${intent}',` +
              `${reqCount},${errCount},0,${inTok},${outTok},${inTok + outTok},` +
              `${reqCount * 300000},${reqCount * 80000},` +
              `${reqCount * 600},${reqCount * 1200},${reqCount * 500},${reqCount * 1500},` +
              `0,0,${reqCount * 800},${reqCount * 700},${reqCount * 650})`,
          );
          i++;
        }
      }
    }
  }
  return rows;
}

function buildLogRows() {
  const rows = [];
  // 每桶 4 行：模型 × Key 组合，主机轮换，覆盖全部新维度
  const combos = [
    { m: 0, k: 0, h: 0 },
    { m: 0, k: 1, h: 1 },
    { m: 1, k: 0, h: 1 },
    { m: 1, k: 1, h: 0 },
  ];
  for (let b = 0; b < MINUTES; b++) {
    for (let i = 0; i < combos.length; i++) {
      const c = combos[i];
      const model = MODELS[c.m];
      const key = KEYS[c.k];
      const host = HOSTS[c.h];
      const sec = (b * 17 + i * 29) % 60; // 秒级抖动
      const bucket = new Date(baseTime.getTime() - b * 60 * 1000);
      const ts = fmt(bucket).slice(0, 17) + pad(sec);
      const cache = ['hit', 'miss', 'skip', 'hit'][i];
      const mirrorHit = i === 1 ? 1 : 0;
      const mirrorCluster = mirrorHit ? 'mirror-bj' : '';
      const answer = ['coding', 'chat', 'unknown', 'coding'][i];
      const source = ['classifier', 'cache', 'classifier', 'explicit_header'][i];
      const confidence =
        answer === 'unknown'
          ? (0.2 + prand(b * 13 + i) * 0.3).toFixed(3)
          : (0.7 + prand(b * 13 + i) * 0.29).toFixed(3);
      const status = i === 3 ? 500 : 200;
      const errCode = status >= 400 ? `'upstream_error'` : 'NULL';
      const errMsg =
        status >= 400
          ? `'seeded 500 for err_only filter'`
          : 'NULL';
      const inTok = 300 + Math.floor(prand(b * 41 + i * 7) * 700);
      const outTok = 80 + Math.floor(prand(b * 43 + i * 11) * 220);
      const costValue = 1000 + Math.floor(prand(b * 47 + i * 5) * 90000);
      rows.push(
        `('${host}','${ts}','${key}','${model.name}',NULL,'${MARKER}',` +
          `${errCode},${errMsg},'POST',NULL,'${model.name}',0,` +
          `${inTok},${outTok},${inTok + outTok},` +
          `${100000 + Math.floor(prand(b * 53 + i) * 900000)},` +
          `${50000 + Math.floor(prand(b * 59 + i) * 150000)},` +
          `'${model.provider}','openai','chat',${costValue},'RMB',${status},` +
          `${300 + Math.floor(prand(b * 61 + i) * 900)},` +
          `'${cache}',${mirrorHit},'${mirrorCluster}','task_type','${answer}',` +
          `${confidence},'${source}',` +
          `${800 + Math.floor(prand(b * 67 + i) * 2500)},1,'')`,
      );
    }
  }
  return rows;
}

/** 清理历史种子行（仅命中 product='rptseed' 标记，不碰真实/演示数据） */
function cleanupSeedRows() {
  const delMetrics = runSql(
    `DELETE FROM bfe_ai_metrics_1m WHERE product='${MARKER}'; ` +
      `SELECT ROW_COUNT();`,
  )
    .trim()
    .split('\n')
    .pop();
  const delLogs = runSql(
    `DELETE FROM bfe_ai_request_log WHERE product='${MARKER}'; ` +
      `SELECT ROW_COUNT();`,
  )
    .trim()
    .split('\n')
    .pop();
  return { metrics: delMetrics, logs: delLogs };
}

// 存储基准时间 = 本地当前时间 - offset-hours
const baseTime = new Date(Date.now() - OFFSET_HOURS * 3600 * 1000);

try {
  // 清理模式：只删种子行（spec afterAll 调用，避免影响依赖空窗口的其它 spec）
  if (Object.prototype.hasOwnProperty.call(args, 'cleanup')) {
    const del = cleanupSeedRows();
    console.log(
      `cleanup-only: 删除种子行 metrics=${del.metrics}, logs=${del.logs}`,
    );
    process.exit(0);
  }

  const dates = new Set();
  for (let b = 0; b < MINUTES; b += 60) {
    dates.add(new Date(baseTime.getTime() - b * 60 * 1000).toDateString());
  }
  // 跨日兜底：把首末桶都纳入探测
  dates.add(baseTime.toDateString());
  dates.add(
    new Date(baseTime.getTime() - (MINUTES - 1) * 60 * 1000).toDateString(),
  );

  console.log(
    `seed-report-data: minutes=${MINUTES}, offset=${OFFSET_HOURS}h, ` +
      `db=${DB_HOST}:${DB_PORT}/${DB_NAME}, mysql=${MYSQL_BIN}`,
  );

  // 0. 分区兜底（幂等）
  ensurePartitions([...dates].map((s) => new Date(s)));

  // 1. 清理历史种子行（仅命中 product='rptseed' 标记，不碰真实/演示数据）
  const del = cleanupSeedRows();
  console.log(`  [cleanup] 删除历史种子行: metrics=${del.metrics}, logs=${del.logs}`);

  // 2. 生成并插入分钟桶数据
  const metricsRows = buildMetricsRows();
  runSql(
    `INSERT INTO bfe_ai_metrics_1m ` +
      `(ts_min,hostid,ai_apikey_id,ai_requested_model,ai_target_model,ai_stream,` +
      `product,cluster,backend_info,method,res_status_code,err_code,header_host,` +
      `ai_provider,ai_protocol,ai_mode,ai_cost_currency,ai_cache_status,mirror_hit,` +
      `ai_intent_answer,request_count,error_count,auth_reject_count,input_tokens,` +
      `output_tokens,total_tokens,ttft_us_sum,tpot_us_sum,req_header_bytes,` +
      `req_body_bytes,res_header_bytes,res_body_bytes,rate_limit_hits,` +
      `backend_retries,all_time_sum,cluster_serve_sum,backend_serve_sum) VALUES ` +
      metricsRows.join(',\n') +
      ';',
  );
  console.log(`  [insert] bfe_ai_metrics_1m: ${metricsRows.length} 行`);

  const logRows = buildLogRows();
  runSql(
    `INSERT INTO bfe_ai_request_log ` +
      `(hostid,log_time,ai_apikey_id,ai_requested_model,logid,product,err_code,` +
      `err_msg,method,cluster,ai_target_model,ai_stream,ai_input_tokens,` +
      `ai_output_tokens,ai_total_tokens,ai_ttft_us,ai_tpot_us,ai_provider,` +
      `ai_protocol,ai_mode,ai_cost_value,ai_cost_currency,res_status_code,` +
      `all_time,ai_cache_status,mirror_hit,mirror_cluster,ai_intent_question,` +
      `ai_intent_answer,ai_intent_confidence,ai_intent_source,` +
      `ai_intent_latency_us,ai_intent_cache_hit,ai_intent_questions_version) VALUES ` +
      logRows.join(',\n') +
      ';',
  );
  console.log(`  [insert] bfe_ai_request_log: ${logRows.length} 行`);

  const newest = fmt(baseTime);
  const oldest = fmt(new Date(baseTime.getTime() - (MINUTES - 1) * 60 * 1000));
  console.log('----------------------------------------');
  console.log(
    `完成：metrics=${metricsRows.length} 行, logs=${logRows.length} 行; ` +
      `存储窗口 ${oldest} ~ ${newest}（本地时间 - ${OFFSET_HOURS}h）`,
  );
  process.exit(0);
} catch (e) {
  console.error('seed-report-data 失败:', e.message);
  process.exit(1);
}
