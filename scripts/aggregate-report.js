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
 * @Description: 生成「仓库内受跟踪」的全量回归报告，按运行日期归档到 `regression-reports/`。
 *
 * 为什么单独有这份报告：`report/`、`test-reports/`、`test-results.json` 全在 `.gitignore` 里
 * （见 `.gitignore:9-18`），因此历次人读报告**都不在版本控制内、可被清理**——`docs/` 里已经出现
 * 引用到已丢失报告的情况，也让「全站到底还差几条没跑通」无处可查。本脚本把 Playwright 的
 * 结构化产物 `test-results.json` 汇总成**受跟踪、可 diff、按日期归档**的 Markdown。
 *
 * 用法：
 *   node scripts/aggregate-report.js                  # 全量回归后生成 regression-reports/TEST-REPORT-<日期>.md
 *   node scripts/aggregate-report.js --json <path>    # 指定 test-results.json
 *   node scripts/aggregate-report.js --out <path>     # 另存到指定文件（不写归档索引）
 *   node scripts/aggregate-report.js --out <path> --force  # 非全量也另存（默认只在覆盖全部 spec 时写入）
 *
 * 设计要点：
 * - **只在全量时写入受跟踪报告**：定向批次（跑单个模块）不会覆盖全站结论；非全量时打印
 *   覆盖度差值并提示加上 `--out` 另存，避免「一次局部回归把全量报告的结论冲掉」。
 * - **按日期归档、不覆盖**：默认文件名 `TEST-REPORT-YYYY-MM-DD.md`；同一天第二次全量回归
 *   追加 `-HHmmss`。同一份 `test-results.json` 反复生成（运行时间相同）时覆盖原文件，不产生重复归档。
 * - **索引自动更新**：每次写入归档后重建 `regression-reports/README.md`，最新报告排在最前。
 * - **历史表累积**：扫描归档目录内既有报告的「历史全量回归」表并追加本轮，不丢历史。
 * - 模块维度由 spec 路径 `tests/<目录>/` 推导（复用 `utils/generate_report.js` 的 `inferModule`），
 *   不再出现「全部归到『其他』」的问题。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_JSON = path.join(ROOT, 'test-results.json');
const ARCHIVE_DIR = path.join(ROOT, 'regression-reports');
const INDEX_FILE = path.join(ARCHIVE_DIR, 'README.md');
/** 迁移前的单文件报告位置：仅作为历史行兼容读取，不再写入 */
const LEGACY_OUT = path.join(ROOT, 'TEST-REPORT.md');
const WORKSPACE_ROOT = path.join(ROOT, '..');
/** 被 playwright.config.js 的 testIgnore 排除的模块（回归外，单列说明） */
const IGNORED_MODULE_DIR = 'cert';

const { inferModule } = require('../utils/generate_report');

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { json: DEFAULT_JSON, out: null, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = path.resolve(argv[++i]);
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--force') opts.force = true;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 读取产物
// ---------------------------------------------------------------------------

function readJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(
      `未找到 ${jsonPath}——请先跑一轮 Playwright（json reporter 会写它）`,
    );
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

/** 磁盘上的 spec 全集（相对仓库根、posix 风格），用于算「本轮是否全量」 */
function listSpecFiles(dir = path.join(ROOT, 'tests'), acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSpecFiles(full, acc);
    else if (entry.name.endsWith('.spec.js')) {
      acc.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return acc.sort();
}

/** 统计某目录下的 spec 文件数与非注释行里的 test( 数（用于「回归外」模块的静态口径） */
function countSpecsAndCases(moduleDir) {
  const dir = path.join(ROOT, 'tests', moduleDir);
  const files = listSpecFiles(dir);
  let cases = 0;
  for (const rel of files) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    cases += (source.match(/^\s*test\s*\(/gm) || []).length;
  }
  return { specs: files.length, cases };
}

// ---------------------------------------------------------------------------
// 遍历 Playwright JSON
// ---------------------------------------------------------------------------

function lastResult(test) {
  const results = test.results || [];
  return results.length ? results[results.length - 1] : null;
}

function statusOf(test) {
  if (test.status === 'skipped') return 'skipped';
  const result = lastResult(test);
  const status = result && result.status;
  if (status === 'skipped') return 'skipped';
  if (status === 'passed') return 'passed';
  if (status === 'failed' || status === 'timedOut' || status === 'interrupted') {
    return 'failed';
  }
  if (test.status === 'expected') return 'passed';
  if (test.status === 'unexpected') return 'failed';
  return 'skipped';
}

/** 清洗文本：去 ANSI 转义（Playwright 的 expect 错误带色码）、折叠空白、限长 */
function sanitize(text, limit = 300) {
  return String(text == null ? '' : text)
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function skipReason(test) {
  const result = lastResult(test);
  const fromError = result && result.error && result.error.message;
  if (fromError) return sanitize(fromError);
  // 只取 type=skip 的注解：用例常把接口造数（type=api_data）等旁证一并塞进 annotations，
  // 那些是数据不是跳过原因，混进来会把真正的原因挤掉
  const described = (test.annotations || [])
    .filter((a) => a.type === 'skip')
    .map((a) => a.description)
    .filter(Boolean)
    .join('；');
  return (
    sanitize(described) ||
    '(用例未记录原因——建议在 test.skip 第二参数写明)'
  );
}

function failureInfo(test) {
  const result = lastResult(test);
  const error = (result && result.error) || {};
  const location = error.location || {};
  const retries = Math.max(0, (test.results || []).length - 1);
  const attachments = (result && result.attachments) || [];
  return {
    message: sanitize(error.message || '(无错误信息)', 400),
    location: location.file
      ? `${path.relative(ROOT, location.file).split(path.sep).join('/')}:${location.line}`
      : '(未知位置)',
    retries,
    attachments: attachments
      .map((a) => a.path)
      .filter(Boolean)
      .map((p) => path.relative(ROOT, p).split(path.sep).join('/')),
  };
}

/** 收集每个 spec 的统计与明细 */
function collect(report) {
  const specs = [];
  // Playwright JSON 里 tests[] 条目**没有 title**，用例名在 leaf spec 上；
  // 完整名字需把祖先 suite 的 title 串起来（外层的 describe 链）
  const walk = (suite, inheritedFile, ancestors) => {
    const file = suite.file || inheritedFile;
    const chain = suite.title ? [...ancestors, suite.title] : ancestors;
    for (const spec of suite.specs || []) {
      const specFile =
        spec.file || file || (spec.tests && spec.tests[0] && spec.tests[0].file);
      // 顶层 suite 的 title 是文件路径，已在「spec」列展示，故从用例名里去掉，避免重复
      const nameChain = chain.filter((t) => !/\.spec\.js$/.test(t));
      const fullTitle = [...nameChain, spec.title].filter(Boolean).join(' › ');
      const record = {
        file: specFile
          ? path.relative(ROOT, specFile).split(path.sep).join('/')
          : '(未知文件)',
        title: fullTitle,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        failures: [],
        skips: [],
      };
      for (const test of spec.tests || []) {
        record.total += 1;
        const status = statusOf(test);
        if (status === 'passed') record.passed += 1;
        else if (status === 'failed') {
          record.failed += 1;
          record.failures.push({ title: fullTitle, ...failureInfo(test) });
        } else {
          record.skipped += 1;
          record.skips.push({ title: fullTitle, reason: skipReason(test) });
        }
      }
      specs.push(record);
    }
    for (const child of suite.suites || []) walk(child, file, chain);
  };
  for (const suite of report.suites || []) walk(suite, null, []);

  // 合并到 spec 文件粒度
  const byFile = new Map();
  for (const spec of specs) {
    if (!byFile.has(spec.file)) {
      byFile.set(spec.file, {
        file: spec.file,
        module: inferModule(spec.file),
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        failures: [],
        skips: [],
      });
    }
    const target = byFile.get(spec.file);
    target.total += spec.total;
    target.passed += spec.passed;
    target.failed += spec.failed;
    target.skipped += spec.skipped;
    target.failures.push(...spec.failures);
    target.skips.push(...spec.skips);
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function pct(passed, total) {
  if (!total) return '—';
  return `${((passed / total) * 100).toFixed(2)}%`;
}

function stamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function fmtDuration(ms) {
  const totalSec = Math.round(Number(ms || 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h ? `${h}h${m}m${s}s` : `${m}m${s}s`;
}

// ---------------------------------------------------------------------------
// 归档路径与索引
// ---------------------------------------------------------------------------

/** 归档目录内的报告文件（按文件名升序，即日期升序） */
function listArchiveReports() {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  return fs
    .readdirSync(ARCHIVE_DIR)
    .filter((f) => /^TEST-REPORT-.*\.md$/.test(f))
    .sort()
    .map((f) => path.join(ARCHIVE_DIR, f));
}

/** 读取报告头部的「本轮运行」时间戳，用于判断是否为同一轮的重复生成 */
function readRunStamp(file) {
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf-8');
  const m = content.match(
    /\*\*本轮运行\*\*：(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/,
  );
  return m ? m[1] : null;
}

/**
 * 选择默认归档路径，保证同一天多次全量回归不互相覆盖：
 * - 当天首份：TEST-REPORT-YYYY-MM-DD.md
 * - 同一天第二份起：TEST-REPORT-YYYY-MM-DD-HHmmss.md（极端重名再追加 -2、-3…）
 * - 同一轮重复生成（运行时间一致）：复用原文件覆盖，避免产生重复归档
 */
function pickArchivePath(startTime) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const runStamp = stamp(startTime);
  const date = runStamp.slice(0, 10);
  const base = path.join(ARCHIVE_DIR, `TEST-REPORT-${date}.md`);

  if (!fs.existsSync(base) || readRunStamp(base) === runStamp) return base;

  const time = runStamp.slice(11, 19).replace(/:/g, '');
  let candidate = path.join(ARCHIVE_DIR, `TEST-REPORT-${date}-${time}.md`);
  let seq = 2;
  while (fs.existsSync(candidate) && readRunStamp(candidate) !== runStamp) {
    candidate = path.join(
      ARCHIVE_DIR,
      `TEST-REPORT-${date}-${time}-${seq}.md`,
    );
    seq += 1;
  }
  return candidate;
}

/** 从一份归档报告中提取索引所需字段 */
function parseReportSummary(file) {
  const content = fs.readFileSync(file, 'utf-8');
  const num = (label) => {
    const m = content.match(new RegExp(`\\| ${label} \\| (\\d+) \\|`));
    return m ? Number(m[1]) : null;
  };
  const verdictRaw = (content.match(/\| \*\*判定\*\* \| (.+?) \|/) || [])[1] || '';
  let verdict = '—';
  if (/❌/.test(verdictRaw)) verdict = '❌ 未达 100%';
  else if (/⚠️/.test(verdictRaw)) verdict = '⚠️ 有未签核跳过';
  else if (/✅/.test(verdictRaw)) verdict = '✅ 100% 跑通';
  return {
    file: path.basename(file),
    run: readRunStamp(file) || '—',
    total: num('用例总数'),
    passed: num('通过'),
    failed: num('失败'),
    skipped: num('跳过'),
    verdict,
  };
}

/** 重建 regression-reports/README.md（最新归档在前） */
function renderIndex() {
  const reports = listArchiveReports();
  if (!reports.length) return null;

  const rows = reports
    .map(parseReportSummary)
    .sort((a, b) => b.run.localeCompare(a.run));

  let md = '# 全量回归报告归档\n\n';
  md +=
    '本目录归档每一轮**全量回归**的报告，受版本控制、可长期引用；每轮生成一份，不覆盖历史。\n\n';
  md +=
    '- **命名**：`TEST-REPORT-YYYY-MM-DD.md`；同一天第二次全量回归追加 `-HHmmss`（如 `TEST-REPORT-2026-10-17-233755.md`）。\n';
  md +=
    '- **生成**：跑完全量后执行 `npm run report:tracked`（脚本 `scripts/aggregate-report.js`）；定向批次不会写入本目录。\n';
  md +=
    '- **最新**：下表第一行即最近一次全量回归；历史归档只读不改。\n\n';
  md +=
    '| 报告 | 运行时间 | 用例数 | 通过 | 失败 | 跳过 | 判定 |\n|---|---|---|---|---|---|---|\n';
  const cell = (v) => (v === null || v === undefined ? '—' : String(v));
  for (const r of rows) {
    md += `| [${r.file}](./${encodeURI(r.file)}) | ${r.run} | ${cell(r.total)} | ${cell(r.passed)} | ${cell(r.failed)} | ${cell(r.skipped)} | ${r.verdict} |\n`;
  }
  md +=
    '\n> 每份报告内部还保留「历史全量回归」表，用于跨归档对比；判定口径与跳过签核规则见报告第 8 节。\n';

  fs.writeFileSync(INDEX_FILE, md, 'utf-8');
  return INDEX_FILE;
}

/**
 * 读取所有归档报告的「历史全量回归」行。`exclude` 为本轮即将写入的文件——
 * 同一轮重复生成时跳过旧内容，避免旧行与本轮新行重复。
 */
function readHistory(exclude) {
  const files = listArchiveReports().filter(
    (f) => path.resolve(f) !== path.resolve(exclude || ''),
  );
  if (fs.existsSync(LEGACY_OUT)) files.push(LEGACY_OUT);

  const rows = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let inHistory = false;
    for (const line of content.split('\n')) {
      if (/^##\s+.*历史全量/.test(line)) {
        inHistory = true;
        continue;
      }
      if (inHistory && /^##\s+/.test(line)) break;
      if (!inHistory) continue;
      const cells = line.split('|').map((c) => c.trim());
      // | 日期 | 用例数 | 通过 | 失败 | 跳过 | 通过率 | 耗时 | 证据 |
      if (cells.length < 9) continue;
      if (!/^\d{4}-\d{2}-\d{2}/.test(cells[1])) continue;
      rows.push(cells.slice(1, 9));
    }
  }
  return rows;
}

const ACCEPTED_SKIPS_PATH = path.join(__dirname, 'accepted-skips.json');

/** 读取受跟踪的「跳过签核」清单（缺失/损坏时按空处理，不阻塞出报告） */
function readAcceptedSkips() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ACCEPTED_SKIPS_PATH, 'utf-8'));
    return Array.isArray(parsed.accepted) ? parsed.accepted : [];
  } catch (e) {
    console.log(
      `提示：未读到跳过签核清单（${e.message}），本轮所有跳过将按「待确认」处理`,
    );
    return [];
  }
}

/** 某条跳过是否已签核（按 spec 文件 + 用例编号匹配） */
function matchAccepted(skip, acceptedList) {
  return acceptedList.find(
    (a) => a.spec === skip.file && String(skip.title || '').includes(a.caseId),
  );
}

function render(records, meta) {
  const total = records.reduce((n, r) => n + r.total, 0);
  const passed = records.reduce((n, r) => n + r.passed, 0);
  const failed = records.reduce((n, r) => n + r.failed, 0);
  const skipped = records.reduce((n, r) => n + r.skipped, 0);
  const allFailures = records.flatMap((r) =>
    r.failures.map((f) => ({ ...f, file: r.file, module: r.module })),
  );
  const acceptedSkips = readAcceptedSkips();
  const allSkips = records.flatMap((r) =>
    r.skips.map((s) => {
      const matched = matchAccepted({ ...s, file: r.file }, acceptedSkips);
      return {
        ...s,
        file: r.file,
        module: r.module,
        accepted: matched || null,
        acceptedBy: matched
          ? `${matched.confirmedBy} / ${matched.confirmedAt}`
          : null,
      };
    }),
  );
  const unaccepted = allSkips.filter((s) => !s.acceptedBy);
  const cert = countSpecsAndCases(IGNORED_MODULE_DIR);
  const perModule = new Map();
  for (const r of records) {
    if (!perModule.has(r.module)) {
      perModule.set(r.module, {
        module: r.module,
        specs: 0,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      });
    }
    const m = perModule.get(r.module);
    m.specs += 1;
    m.total += r.total;
    m.passed += r.passed;
    m.failed += r.failed;
    m.skipped += r.skipped;
  }
  const modules = [...perModule.values()].sort((a, b) =>
    a.module.localeCompare(b.module, 'zh-Hans-CN'),
  );

  let md = '';
  md += `# AI 网关 UI 自动化 — ${meta.isFull ? '全量回归报告' : '回归报告（非全量）'}\n\n`;
  if (meta.isFull && meta.archived) {
    md +=
      `> **本文件是 ${stamp(meta.startTime).slice(0, 10)} 全量回归的归档快照**，受版本控制、可长期引用，是"用例是否 100% 跑通"的**唯一权威出口**。\n` +
      '> 全量回归报告按日期归档在 `regression-reports/`（`TEST-REPORT-YYYY-MM-DD.md`，同日多次回归追加 `-HHmmss`），最新一份见 [归档索引](./README.md)。\n' +
      '> 与之并存的是 `report/test-report*.md`：那是**每轮**（含定向批次）的人读报告，落在被 `.gitignore` 忽略的 `report/` 下，**可被清理、不可寻址**。\n' +
      '> 更新方式、判定口径与维护约定见文末；已归档的历史报告只读不改。\n\n';
  } else if (meta.isFull) {
    md +=
      `> **本文件是 ${stamp(meta.startTime).slice(0, 10)} 全量回归的另存快照（未归档）**，仅供本轮查看。\n` +
      '> 正式结论以 `regression-reports/` 下的归档报告为准。\n\n';
  } else {
    md +=
      `> **本文件是 ${stamp(meta.startTime).slice(0, 10)} 的回归快照，非全量、仅供本轮查看**，不作为全站结论或长期凭据。\n` +
      '> 正式结论以 `regression-reports/` 下的全量回归归档为准。\n\n';
  }
  md += `**本轮运行**：${stamp(meta.startTime)}（${meta.isFull ? '**全量**回归' : '**非全量**回归，仅供本轮查看'}，耗时 ${fmtDuration(meta.duration)}）\n\n`;
  md += `**运行命令**：\n\n\`\`\`bash\n${meta.command}\n\`\`\`\n\n`;
  md += `**测试环境**：${meta.env}\n\n`;
  md += `**Playwright**：${meta.playwrightVersion}\n\n`;
  md += `**覆盖度**：${records.length} / ${meta.diskSpecs} 个常规 spec（${meta.coverageNote}）\n\n`;

  md += '## 1. 总体\n\n';
  md += '| 指标 | 数值 |\n|---|---|\n';
  md += `| 用例总数 | ${total} |\n`;
  md += `| 通过 | ${passed} |\n`;
  md += `| 失败 | ${failed} |\n`;
  md += `| 跳过 | ${skipped} |\n`;
  md += `| 通过率（通过 / 总数） | ${pct(passed, total)} |\n`;
  md += `| **判定** | ${
    failed > 0
      ? `❌ **未达 100%**：${failed} 条失败需修复后重跑`
      : skipped === 0
        ? '✅ **100% 跑通**（无失败、无跳过）'
        : unaccepted.length === 0
          ? `✅ **100% 跑通**（无失败；${skipped} 条跳过均已在 \`scripts/accepted-skips.json\` 签核，逐条依据见第 5 节）`
          : `⚠️ **有 ${unaccepted.length} 条未签核的跳过**（无失败）——请先修复；确属环境/设计依赖的，在 \`scripts/accepted-skips.json\` 登记依据与确认人后重新生成本报告`
  } |\n\n`;

  md += '## 2. 按模块\n\n';
  md += '| 模块 | spec 数 | 用例数 | 通过 | 失败 | 跳过 | 状态 |\n|---|---|---|---|---|---|---|\n';
  for (const m of modules) {
    const moduleUnaccepted = unaccepted.filter(
      (s) => s.module === m.module,
    ).length;
    const ok = m.failed > 0 ? '❌' : moduleUnaccepted > 0 ? '⚠️' : '✅';
    md += `| ${m.module} | ${m.specs} | ${m.total} | ${m.passed} | ${m.failed} | ${m.skipped} | ${ok} |\n`;
  }
  md += `| **合计** | **${records.length}** | **${total}** | **${passed}** | **${failed}** | **${skipped}** | ${
    failed > 0 ? '❌' : unaccepted.length > 0 ? '⚠️' : '✅'
  } |\n\n`;

  md += '## 3. 按 spec 明细\n\n';
  md += '| 模块 | spec | 用例数 | 通过 | 失败 | 跳过 | 状态 |\n|---|---|---|---|---|---|---|\n';
  for (const r of records) {
    const specUnaccepted = unaccepted.filter((s) => s.file === r.file).length;
    const ok = r.failed > 0 ? '❌' : specUnaccepted > 0 ? '⚠️' : '✅';
    md += `| ${r.module} | \`${r.file}\` | ${r.total} | ${r.passed} | ${r.failed} | ${r.skipped} | ${ok} |\n`;
  }
  md += '\n';

  md += '## 4. 失败明细\n\n';
  if (!allFailures.length) {
    md += '本轮无失败。\n\n';
  } else {
    md += `共 ${allFailures.length} 条：\n\n`;
    allFailures.forEach((f, i) => {
      md += `${i + 1}. **${f.module}** · \`${f.file}\`\n`;
      md += `   - 用例：${f.title}\n`;
      md += `   - 错误位置：\`${f.location}\`\n`;
      md += `   - 重试次数：${f.retries}\n`;
      md += `   - 错误摘要：${f.message}\n`;
      if (f.attachments.length) {
        md += `   - 附件：${f.attachments.map((a) => `\`${a}\``).join('、')}\n`;
      }
    });
    md += '\n> 附件位于被忽略的 `test-results/`；如需长期留证，请把关键截图/error-context 拷入受跟踪目录后再引用。\n\n';
  }

  md += '## 5. 跳过明细\n\n';
  if (!allSkips.length) {
    md += '本轮无跳过。\n\n';
  } else {
    md += `共 ${allSkips.length} 条。跳过属**运行时条件跳过**（环境数据/UI 控件依赖），不是"用例未实现"；\n`;
    md += `每条须在 \`scripts/accepted-skips.json\` 登记依据与确认人后，才算**已签核**——未签核的跳过会把第 1 节判定降级为 ⚠️。\n\n`;
    md += '| 模块 | spec | 用例 | 运行时原因 | 签核 |\n|---|---|---|---|---|\n';
    for (const s of allSkips) {
      md += `| ${s.module} | \`${s.file}\` | ${s.title} | ${s.reason.replace(/\|/g, '\\|')} | ${
        s.acceptedBy ? `✅ ${s.acceptedBy}` : '⚠️ 待确认'
      } |\n`;
    }
    md += '\n**签核依据**：\n\n';
    for (const s of allSkips) {
      if (!s.accepted) {
        md += `- ⚠️ \`${s.file}\` · ${s.title}：**未签核** —— 修掉该跳过；确属环境/产品行为依赖的，在 \`scripts/accepted-skips.json\` 登记 \`caseId\`/\`reason\`/\`evidence\`/\`confirmedBy\` 后重新生成。\n`;
        continue;
      }
      md += `- ✅ \`${s.file}\` · **${s.accepted.caseId}**（确认：${s.acceptedBy}）\n`;
      md += `  - 定性：${s.accepted.reason || '(未填)'}\n`;
      md += `  - 证据：${s.accepted.evidence || '(未填)'}\n`;
    }
    md += '\n';
  }

  md += `## 6. 回归外模块（\`testIgnore\` 排除）\n\n`;
  md += `\`tests/${IGNORED_MODULE_DIR}/\` 共 **${cert.specs} 个 spec / ${cert.cases} 条用例**，被 \`playwright.config.js\` 的 \`testIgnore\` 排除，**不计入上表分母**。\n`;
  md += '原因：证书管理模块已于 2026-09-11 随菜单移除，UI 入口不复存在（详见 `docs/cert-management/02-功能测试用例/00-索引与映射.md`）。\n';
  md += '恢复条件：删除 `testIgnore` 中的该条并同步回写该模块文档的用例状态。\n\n';

  md += '## 7. 历史全量回归\n\n';
  md += '| 日期 | 用例数 | 通过 | 失败 | 跳过 | 通过率 | 耗时 | 证据 |\n|---|---|---|---|---|---|---|---|\n';
  // 去重：历史行按整行内容去重——同一份 test-results.json 被重复生成（或反复执行本脚本）
  // 时不应再追加一行，否则历史表会出现多份完全相同的记录
  const seen = new Set();
  const history = [];
  for (const row of readHistory(meta.out)) {
    const key = row.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    history.push(row);
  }
  const currentRow = [
    stamp(meta.startTime).slice(0, 10),
    String(total),
    String(passed),
    String(failed),
    String(skipped),
    pct(passed, total),
    fmtDuration(meta.duration),
    meta.archived
      ? `[${path.basename(meta.out)}](${encodeURI(path.basename(meta.out))})`
      : `\`${path.basename(meta.out)}\`（另存，未归档）`,
  ];
  // 历史表只记全量回归；定向批次（--out / --force）不写入历史
  if (meta.isFull && !seen.has(currentRow.join('|'))) history.push(currentRow);
  for (const row of history) md += `| ${row.join(' | ')} |\n`;
  md += '\n> 历史行来自 `regression-reports/` 下既有的归档报告，只增不改；更早的全量回归（如 2026-10-15 的 1002 条 / 807 通过 / 158 失败 / 37 跳过，80.54%）其报告产物随 `report/` 被清理而不可寻址，仅在 `docs/<模块>/…/00-索引与映射.md` 的「取数依据」里留有数字。\n\n';

  md += '## 8. 维护约定\n\n';
  md += '1. **跑全量**：\n\n```bash\nPW_WORKERS=1 npx playwright test tests/ --global-timeout=0\n```\n\n';
  md += '2. **生成本次归档报告**：\n\n```bash\nnpm run report:tracked\n```\n\n';
  md += '   脚本只在「本轮覆盖了全部常规 spec」时写入 `regression-reports/TEST-REPORT-<运行日期>.md`（定向批次不会覆盖全站结论）；同一天第二次全量回归会自动追加 `-HHmmss`，不覆盖已有归档；需要另存时用 `--out <path>`。写入后会自动刷新 `regression-reports/README.md` 索引。\n';
  md += '3. **有失败 → 修到 100%**：修完先重跑受影响 spec，**再跑一次全量**并重新生成，直到第 1 节判定为 ✅。\n';
  md += '4. **跳过要签核**：`skipped > 0` 时，未在 `scripts/accepted-skips.json` 登记的跳过会把判定降级为 ⚠️；确属环境/产品行为依赖（非用例遗漏）的，登记 `spec`/`caseId`/`reason`/`evidence`/`confirmedBy`/`confirmedAt` 后重新生成即升为 ✅，第 5 节会列出逐条依据。**禁止为了好看而登记**。\n';
  md += '5. **提交**：本次归档、`regression-reports/README.md` 索引与相关 spec/文档改动**一起提交**，让"当前通过状态"随代码一起被版本控制；已归档的历史报告只读不改。\n\n';

  return {
    md,
    total,
    passed,
    failed,
    skipped,
    unacceptedSkips: unaccepted.length,
    failures: allFailures.length,
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = readJson(opts.json);
  const records = collect(report);
  const runFiles = new Set(records.map((r) => r.file));
  const diskSpecs = listSpecFiles().filter(
    (f) => !f.startsWith(`tests/${IGNORED_MODULE_DIR}/`),
  );
  const missing = diskSpecs.filter((f) => !runFiles.has(f));
  const extra = [...runFiles].filter((f) => !diskSpecs.includes(f));
  const isFull = missing.length === 0 && extra.length === 0;

  const argv = (report.config && report.config.argv) || [];
  // argv[0]=node 可执行路径、argv[1]=node_modules/.bin/playwright；只保留其后的参数，
  // 让命令可直接复制复现（不出现本机绝对路径）
  const argsAfterRunner = argv.slice(2);
  // workers 不在 argv 里（由 PW_WORKERS / 配置文件决定），必须显式回填：
  // 只读视角用例要求串行（同一用户后端只保留 1 个 Session Key），命令缺了它会误导复现
  const workers = report.config && report.config.workers;
  const command = argsAfterRunner.length
    ? `${typeof workers === 'number' ? `PW_WORKERS=${workers} ` : ''}npx playwright ${argsAfterRunner.join(' ')}`
    : '(未记录)';

  const startTime =
    (report.stats && report.stats.startTime) || new Date().toISOString();
  const out = opts.out || pickArchivePath(startTime);

  const meta = {
    out,
    archived: !opts.out,
    isFull,
    startTime,
    duration: (report.stats && report.stats.duration) || 0,
    command: command || '(未记录)',
    env: (() => {
      try {
        const conf = JSON.parse(
          fs.readFileSync(path.join(ROOT, 'conf.json'), 'utf-8'),
        );
        return conf.ctlHost || '(未配置)';
      } catch (e) {
        return '(读取 conf.json 失败)';
      }
    })(),
    playwrightVersion: (report.config && report.config.version) || '(未知)',
    diskSpecs: diskSpecs.length,
    coverageNote: isFull
      ? '与磁盘 spec 全集一致，属**全量回归**'
      : `**非全量**：另有 ${missing.length} 个 spec 未在本轮（${missing
          .slice(0, 5)
          .map((f) => '`' + f + '`')
          .join('、')}${missing.length > 5 ? ' 等' : ''}）`,
  };

  const { md, total, passed, failed, skipped, unacceptedSkips } = render(
    records,
    meta,
  );

  const customOut = Boolean(opts.out);

  if (!isFull && !customOut) {
    console.log(
      `本轮非全量（覆盖 ${records.length} / ${diskSpecs.length} 个常规 spec），` +
        '按设计**不写入** regression-reports/ 归档。',
    );
    console.log(
      '如需查看本轮汇总，请加 --out <path> 另存（可配合 --force）；归档报告必须由全量回归产生。',
    );
    console.log(`本轮：总计 ${total}，通过 ${passed}，失败 ${failed}，跳过 ${skipped}`);
    return;
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md, 'utf-8');
  console.log(
    `${customOut ? '已写入报告' : '已写入归档报告'}: ${path.relative(WORKSPACE_ROOT, out)}`,
  );
  if (!customOut) {
    const indexPath = renderIndex();
    if (indexPath) {
      console.log(`已更新归档索引: ${path.relative(WORKSPACE_ROOT, indexPath)}`);
    }
  }
  console.log(`覆盖度: ${records.length} / ${diskSpecs.length} 个常规 spec`);
  console.log(`总计 ${total}，通过 ${passed}，失败 ${failed}，跳过 ${skipped}`);
  if (failed || skipped) {
    if (failed) {
      console.log(
        `⚠️ 仍有 ${failed} 条失败：请修复后重跑全量并重新生成，直至判定为 ✅`,
      );
    } else if (unacceptedSkips) {
      console.log(
        `⚠️ 有 ${unacceptedSkips} 条未签核的跳过：请修复，或确属环境/产品行为依赖的到 scripts/accepted-skips.json 登记依据后重新生成`,
      );
    } else {
      console.log(
        `✅ 判定：无失败；${skipped} 条跳过均已在 scripts/accepted-skips.json 签核（依据见报告第 5 节）`,
      );
    }
  } else {
    console.log('✅ 判定：100% 跑通（无失败、无跳过）');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collect,
  render,
  listSpecFiles,
  statusOf,
  inferModule,
  renderIndex,
  pickArchivePath,
  listArchiveReports,
};