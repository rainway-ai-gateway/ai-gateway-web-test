#!/usr/bin/env node
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
 * 批量任务测试数据造数（写入控制面 API 的 MySQL 库，表 batch_tasks / batch_files）
 *
 * 背景：批量任务只能由数据面经 provider 透传产生（控制面无创建接口），本机环境
 * 长期为空，导致 tests/batch-tasks/ 的列表 / 详情 / 取消用例大面积「环境无数据」跳过。
 * 本脚本按用例前置条件直接灌数（含多种状态、多种字段完整度与文件关联形态）。
 *
 * 用法（在 ai-gateway-web-test/ 目录下执行）：
 *   node scripts/seed-batch-task-data.cjs                 # 预览将要写入的行（默认）
 *   node scripts/seed-batch-task-data.cjs --execute        # 先删本脚本旧数据再写入
 *   node scripts/seed-batch-task-data.cjs --clean          # 预览将删除的行
 *   node scripts/seed-batch-task-data.cjs --clean --execute  # 只删除本脚本造的数据
 *
 * 库连接默认取自 ai-gateway-runtime/conf/ai_gateway_api.toml 的 [Databases.bfe_db]
 * （可用 BATCH_SEED_DB_HOST / _PORT / _USER / _PASSWORD / _NAME 覆盖）。
 * mysql 客户端可用 MYSQL_BIN 指定。
 *
 * 数据标记：batch_id 前缀 `batch-seed-`、file_id 前缀 `file-seed-`，删除只按这两个前缀，
 * 不影响 provider 真实透传产生的数据。
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const TEST_ROOT = path.resolve(__dirname, '..');
const RUNTIME_CONF = path.resolve(
  TEST_ROOT,
  '../ai-gateway-runtime/conf/ai_gateway_api.toml',
);

const BATCH_PREFIX = 'batch-seed-';
const FILE_PREFIX = 'file-seed-';
const PRODUCT_NAME = 'AI_product';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const cleanOnly = args.includes('--clean');

/* ------------------------------------------------------------------ *
 * 库连接
 * ------------------------------------------------------------------ */

function readRuntimeDbConfig() {
  const fallback = {
    host: '127.0.0.1',
    port: '3306',
    user: 'root',
    password: '123456',
    name: 'open_bfe',
  };
  let text = '';
  try {
    text = fs.readFileSync(RUNTIME_CONF, 'utf-8');
  } catch (e) {
    console.log(
      '[warn] 读不到 ' + RUNTIME_CONF + '，改用默认连接参数: ' + e.message,
    );
    return fallback;
  }
  const section = text.split(/^\[Databases\.bfe_db\]$/m)[1];
  if (!section) {
    console.log('[warn] runtime 配置缺少 [Databases.bfe_db]，改用默认连接参数');
    return fallback;
  }
  const pick = (key) => {
    const m = section.match(new RegExp('^' + key + '\\s*=\\s*"([^"]*)"', 'm'));
    return m ? m[1] : '';
  };
  const addr = pick('Addr') || fallback.host + ':' + fallback.port;
  const [host, port] = addr.split(':');
  return {
    host: host || fallback.host,
    port: port || fallback.port,
    user: pick('User') || fallback.user,
    password: pick('Passwd') || fallback.password,
    name: pick('DBName') || fallback.name,
  };
}

function resolveDbConfig() {
  const base = readRuntimeDbConfig();
  return {
    host: process.env.BATCH_SEED_DB_HOST || base.host,
    port: process.env.BATCH_SEED_DB_PORT || base.port,
    user: process.env.BATCH_SEED_DB_USER || base.user,
    password: process.env.BATCH_SEED_DB_PASSWORD || base.password,
    name: process.env.BATCH_SEED_DB_NAME || base.name,
  };
}

function resolveMysqlBin() {
  const candidates = [
    process.env.MYSQL_BIN,
    'mysql',
    '/usr/local/mysql/bin/mysql',
    '/opt/homebrew/bin/mysql',
  ].filter(Boolean);
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf-8' });
    if (!probe.error && probe.status === 0) {
      return bin;
    }
  }
  throw new Error(
    '找不到 mysql 客户端，请用 MYSQL_BIN 指定（如 MYSQL_BIN=/usr/local/mysql/bin/mysql）',
  );
}

function runSql(db, sql) {
  const bin = resolveMysqlBin();
  const result = spawnSync(
    bin,
    [
      '-h',
      db.host,
      '-P',
      db.port,
      '-u',
      db.user,
      '-p' + db.password,
      '--default-character-set=utf8mb4',
      db.name,
    ],
    { input: sql, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || '').trim() || 'mysql 退出码 ' + result.status,
    );
  }
  return (result.stdout || '').trim();
}

/* ------------------------------------------------------------------ *
 * 数据集
 * ------------------------------------------------------------------ *
 * 覆盖用例前置条件：
 *  - 总量 > 20（UI 固定 limit=20）→ 游标翻页 / 末页置灰可验证
 *  - id 升序首行字段齐全（provider / api_key_id / entity_id / 金额 / 用量）→ 列表一致性
 *  - 4 种非终态（validating/queued/in_progress/finalizing）→ 取消类用例
 *  - 4 种终态（completed/failed/expired/cancelled）+ cancelling → 置灰断言
 *  - 部分行带 batch_files（输入+输出）、部分行无文件、部分行无输出文件 → 详情文件表格
 *  - sync_source 含 redis 与 log、settle_status 含 reserved/settled/released
 */

const API_KEYS = [
  { id: 'api-key-9', entity: 'entity-2' },
  { id: 'api-key-6', entity: '' },
  { id: 'api-key-7', entity: 'entity-2' },
  { id: 'api-key-10', entity: '' },
];
const PROVIDERS = ['deepseek', 'demo-provider'];

// [序号, 状态, settle_status, over_reserved, 文件形态, sync_source]
// 文件形态：both=输入+输出都有元数据；input=只有输入；none=无文件关联
const PLAN = [
  // 首行 = 用例 BT-L-12 前置要求的「字段完整、各字段均有值」样本（终态 completed，
  // usage/reserve/settle/entity_id 全有值）——该用例固定取接口返回的 list[0]
  [1, 'completed', 'settled', 0, 'both', 'redis'],
  [2, 'in_progress', 'reserved', 0, 'both', 'redis'],
  [3, 'validating', 'reserved', 0, 'input', 'redis'],
  [4, 'finalizing', 'reserved', 0, 'input', 'redis'],
  [5, 'cancelling', 'released', 0, 'none', 'redis'],
  [6, 'completed', 'settled', 0, 'both', 'redis'],
  [7, 'completed', 'settled', 1, 'both', 'redis'],
  [8, 'completed', 'settled', 0, 'none', 'redis'],
  [9, 'completed', 'settled', 0, 'none', 'redis'],
  [10, 'completed', 'settled', 0, 'none', 'redis'],
  [11, 'failed', 'released', 0, 'input', 'redis'],
  [12, 'failed', 'released', 0, 'none', 'log'],
  [13, 'expired', 'released', 0, 'none', 'redis'],
  [14, 'cancelled', 'released', 0, 'none', 'redis'],
  [15, 'completed', 'settled', 0, 'none', 'redis'],
  [16, 'completed', 'settled', 0, 'none', 'redis'],
  [17, 'completed', 'settled', 1, 'none', 'redis'],
  [18, 'failed', 'released', 0, 'none', 'redis'],
  [19, 'completed', 'settled', 0, 'none', 'redis'],
  [20, 'completed', 'settled', 0, 'none', 'redis'],
  [21, 'completed', 'settled', 0, 'none', 'redis'],
  [22, 'queued', 'reserved', 0, 'none', 'redis'],
  [23, 'completed', 'settled', 0, 'none', 'redis'],
  [24, 'expired', 'released', 0, 'none', 'redis'],
  [25, 'in_progress', 'reserved', 0, 'none', 'redis'],
];

const TERMINAL = ['completed', 'failed', 'expired', 'cancelled'];

function branchNo(i) {
  return String(i).padStart(2, '0');
}

function sqlStr(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function buildRows(now) {
  const tasks = [];
  const files = [];

  PLAN.forEach(([no, status, settleStatus, overReserved, fileShape, syncSource]) => {
    const seq = branchNo(no);
    const batchId = BATCH_PREFIX + seq;
    const key = API_KEYS[(no - 1) % API_KEYS.length];
    // 取消类用例会真的发起 cancel：provider 必须具备「可用实例 + 可用 key」才会走到出网
    // 调用并返回文档规定的 502（降级环境无出网）；demo-provider 的 api_keys 为空，
    // 会让 resolveProviderAccess 直接判为 provider 配置缺失（500）。故非终态行固定 deepseek。
    const provider =
      TERMINAL.indexOf(status) !== -1
        ? PROVIDERS[no % PROVIDERS.length]
        : 'deepseek';
    const isTerminal = TERMINAL.indexOf(status) !== -1;
    const startedAt = new Date(now.getTime() - (PLAN.length - no + 1) * 3 * 3600 * 1000);

    const inputFileId = fileShape === 'none' ? '' : FILE_PREFIX + 'in-' + seq;
    const outputFileId =
      fileShape === 'both' && isTerminal ? FILE_PREFIX + 'out-' + seq : '';

    // 终态行有完整用量与结算；非终态行只留预留
    const usageInput = isTerminal ? 1000 + no * 37 : null;
    const usageOutput = isTerminal ? 400 + no * 11 : null;
    const estLines = 50 + no * 5;
    const reserveUnits = (50 + no * 5) * 1000000;
    const settleUnits = isTerminal ? reserveUnits - no * 10000 : null;

    const task = {
      id: 1000 + no,
      batch_id: batchId,
      api_key_id: key.id,
      entity_id: key.entity,
      provider,
      key_name: provider + '-key-' + seq,
      endpoint: '/v1/chat/completions',
      input_file_id: inputFileId,
      output_file_id: outputFileId,
      status,
      request_counts: {
        total: estLines,
        completed: isTerminal ? estLines - (no % 3) : Math.floor(estLines / 2),
        failed: isTerminal ? no % 3 : 0,
      },
      est_lines: estLines,
      usage_input_tokens: usageInput,
      usage_output_tokens: usageOutput,
      usage_source: isTerminal ? (overReserved ? 'reconcile' : 'download') : null,
      reserve_units: reserveUnits,
      settle_units: settleUnits,
      settle_status: settleStatus,
      over_reserved: overReserved,
      sync_source: syncSource,
      created_at: startedAt,
      terminal_at: isTerminal ? new Date(startedAt.getTime() + 30 * 60 * 1000) : null,
    };
    tasks.push(task);

    ['in', 'out'].forEach((dir) => {
      const fileId = FILE_PREFIX + dir + '-' + seq;
      if (fileId !== inputFileId && fileId !== outputFileId) {
        return;
      }
      files.push({
        id: 2000 + no * 2 + (dir === 'out' ? 1 : 0),
        file_id: fileId,
        provider,
        key_name: provider + '-key-' + seq,
        api_key_id: key.id,
        direction: dir === 'in' ? 'input' : 'output',
        purpose: 'batch',
        line_count: estLines,
        bytes: dir === 'in' ? 4096 + no * 128 : 8192 + no * 256,
        first_seen_at: startedAt,
      });
    });
  });

  return { tasks, files };
}

function fmt(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  );
}

function buildDeleteSql() {
  return [
    'DELETE FROM batch_files WHERE file_id LIKE ' + sqlStr(FILE_PREFIX + '%') + ';',
    'DELETE FROM batch_tasks WHERE batch_id LIKE ' + sqlStr(BATCH_PREFIX + '%') + ';',
  ].join('\n');
}

function buildInsertSql(tasks, files) {
  const now = fmt(new Date());
  const taskCols = [
    'id',
    'batch_id',
    'api_key_id',
    'product_name',
    'entity_id',
    'provider',
    'key_name',
    'endpoint',
    'input_file_id',
    'output_file_id',
    'status',
    'request_counts',
    'est_lines',
    'usage_input_tokens',
    'usage_output_tokens',
    'usage_source',
    'reserve_units',
    'settle_units',
    'settle_status',
    'over_reserved',
    'sync_source',
    'idem_key',
    'created_at',
    'updated_at',
    'terminal_at',
  ];
  const taskValues = tasks
    .map((t) =>
      [
        t.id,
        sqlStr(t.batch_id),
        sqlStr(t.api_key_id),
        sqlStr(PRODUCT_NAME),
        t.entity_id ? sqlStr(t.entity_id) : 'NULL',
        sqlStr(t.provider),
        sqlStr(t.key_name),
        sqlStr(t.endpoint),
        t.input_file_id ? sqlStr(t.input_file_id) : 'NULL',
        t.output_file_id ? sqlStr(t.output_file_id) : 'NULL',
        sqlStr(t.status),
        sqlStr(JSON.stringify(t.request_counts)),
        t.est_lines,
        t.usage_input_tokens === null ? 'NULL' : t.usage_input_tokens,
        t.usage_output_tokens === null ? 'NULL' : t.usage_output_tokens,
        t.usage_source ? sqlStr(t.usage_source) : 'NULL',
        t.reserve_units,
        t.settle_units === null ? 'NULL' : t.settle_units,
        sqlStr(t.settle_status),
        t.over_reserved,
        sqlStr(t.sync_source),
        // idem_key 恒等于 batch_id（表内 UNIQUE）
        sqlStr(t.batch_id),
        sqlStr(fmt(t.created_at)),
        sqlStr(now),
        t.terminal_at ? sqlStr(fmt(t.terminal_at)) : 'NULL',
      ].join(', '),
    )
    .map((v) => '(' + v + ')')
    .join(',\n  ');

  const fileCols = [
    'id',
    'file_id',
    'provider',
    'key_name',
    'api_key_id',
    'product_name',
    'direction',
    'purpose',
    'line_count',
    'bytes',
    'first_seen_at',
    'last_seen_at',
  ];
  const fileValues = files
    .map((f) =>
      [
        f.id,
        sqlStr(f.file_id),
        sqlStr(f.provider),
        sqlStr(f.key_name),
        sqlStr(f.api_key_id),
        sqlStr(PRODUCT_NAME),
        sqlStr(f.direction),
        sqlStr(f.purpose),
        f.line_count,
        f.bytes,
        sqlStr(fmt(f.first_seen_at)),
        sqlStr(fmt(f.first_seen_at)),
      ].join(', '),
    )
    .map((v) => '(' + v + ')')
    .join(',\n  ');

  return [
    'INSERT INTO batch_tasks (' + taskCols.join(', ') + ') VALUES\n  ' + taskValues + ';',
    'INSERT INTO batch_files (' + fileCols.join(', ') + ') VALUES\n  ' + fileValues + ';',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function summarize(tasks) {
  const byStatus = {};
  tasks.forEach((t) => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  });
  console.log(
    '  状态分布: ' +
      Object.entries(byStatus)
        .map(([k, v]) => k + '=' + v)
        .join(' '),
  );
  console.log('  行数: batch_tasks=' + tasks.length);
  console.log(
    '  游标翻页: limit=20 → 首页 20 行, 末页 ' +
      (tasks.length - 20) +
      ' 行 (next_cursor 末页为 0)',
  );
}

function main() {
  const db = resolveDbConfig();
  const now = new Date();
  const { tasks, files } = buildRows(now);

  console.log(
    '目标库: mysql://' +
      db.user +
      '@' +
      db.host +
      ':' +
      db.port +
      '/' +
      db.name,
  );
  console.log('数据标记: batch_id LIKE ' + BATCH_PREFIX + '% / file_id LIKE ' + FILE_PREFIX + '%');

  if (cleanOnly) {
    const existing = runSql(
      db,
      'SELECT (SELECT COUNT(*) FROM batch_tasks WHERE batch_id LIKE ' +
        sqlStr(BATCH_PREFIX + '%') +
        ') AS tasks, (SELECT COUNT(*) FROM batch_files WHERE file_id LIKE ' +
        sqlStr(FILE_PREFIX + '%') +
        ') AS files;',
    );
    console.log('待删除: \n' + existing);
    if (!execute) {
      console.log('\n仅预览。确认后加 --execute 执行删除。');
      return;
    }
    runSql(db, buildDeleteSql());
    console.log('\n[OK] 已删除本脚本造的批量任务与文件数据');
    return;
  }

  console.log('\n将要写入的数据:');
  summarize(tasks);
  console.log('  batch_files=' + files.length);

  if (!execute) {
    console.log('\n仅预览。确认后加 --execute 写入。');
    return;
  }

  runSql(db, buildDeleteSql() + '\n' + buildInsertSql(tasks, files));

  const check = runSql(
    db,
    'SELECT (SELECT COUNT(*) FROM batch_tasks WHERE batch_id LIKE ' +
      sqlStr(BATCH_PREFIX + '%') +
      ') AS tasks, (SELECT COUNT(*) FROM batch_files WHERE file_id LIKE ' +
      sqlStr(FILE_PREFIX + '%') +
      ') AS files;',
  );
  console.log('\n[OK] 造数完成: \n' + check);
}

try {
  main();
} catch (error) {
  console.error('造数脚本异常: ' + error.message);
  process.exitCode = 1;
}