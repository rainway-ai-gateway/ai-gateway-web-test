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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 覆盖映射核对：00-索引与映射.md 的「Playwright 自动化映射」表声明的用例号，
 * 必须出现在对应 spec 文件中（文件全文匹配：头注释 / test 名 / 步骤注释均可）。
 *
 * 背景（docs/覆盖缺口清单.md #22）：映射表声称的覆盖曾与实际不符
 * （如 key_affinity「复查/回显归入 test_03」实际无 review 断言），
 * 本脚本兜住「声明了映射但 spec 里连用例号都不出现」这一类失真。
 * 注意：本脚本只核「用例号出现」，不核「断言存在」——后者靠评审与覆盖率目检。
 *
 * 用法：
 *   node scripts/check-coverage-mapping.js              # 全模块扫描
 *   node scripts/check-coverage-mapping.js business-cluster route-management
 *   node scripts/check-coverage-mapping.js --json       # 结构化输出
 *
 * 口径：
 * - 只核「spec 文件存在且生命周期非待实现」的映射行（spec 缺失由全量回归的
 *   missing 检查兜住；待实现行本来就无文件）。
 * - 区间与省略前缀：`RM-BC-93~109、115~122` → 后者继承前者前缀（RM-BC-115~122）；
 *   `RT-V-03-3、03-4` 同理。
 * - 例外：`scripts/coverage-mapping-exceptions.json` 登记的拆解/拆分覆盖
 *   （如 RM-BC-29 由 test_06 的 RM-BC-71/73 拆解覆盖），须有文字说明，禁止裸登记。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXCEPTIONS_FILE = path.join(__dirname, 'coverage-mapping-exceptions.json');

/** 用例号 token：前缀-数字，支持 RT-V-03-3 这类带小节后缀的编号 */
const CASE_TOKEN = /([A-Z]{2,}(?:-[A-Z]{2,})?-[A-Z]{1,3})-(\d+(?:-\d+)*)~/g;

function loadExceptions() {
  if (!fs.existsSync(EXCEPTIONS_FILE)) return {};
  return JSON.parse(fs.readFileSync(EXCEPTIONS_FILE, 'utf-8'));
}

/** 展开覆盖用例列：返回 { full: string } 列表（继承前缀处理区间） */
function expandCaseList(cell) {
  // 去掉括注（…/…）与「不含…」说明，保留主体 token
  const cleaned = cell
    .replace(/[（(][^（）()]*[)）]/g, ' ')
    .replace(/（不含[^）]*）/g, ' ');
  const tokens = cleaned.split(/[、,，\s]+/).filter(Boolean);
  const cases = [];
  let lastPrefix = null;
  for (const token of tokens) {
    const range = token.match(/^([A-Za-z][\w-]*?-)?(\d+)~(\d+)$/);
    if (range) {
      const prefix = range[1] ? range[1].slice(0, -1) : lastPrefix;
      if (!prefix) continue;
      const from = parseInt(range[2], 10);
      const to = parseInt(range[3], 10);
      if (to - from > 200) continue; // 防误解析
      // 零填充口径：仅当区间起点显式带前导零时按起点宽度填充
      //（RM-BC-03~05 → RM-BC-03/04/05；RM-BC-93~109 → 不填充）
      const width = range[2].startsWith('0') ? range[2].length : 0;
      for (let n = from; n <= to; n += 1) {
        cases.push(width > 0 ? `${prefix}-${String(n).padStart(width, '0')}` : `${prefix}-${n}`);
      }
      continue;
    }
    const single = token.match(/^([A-Za-z][\w-]*?)-(\d+(?:-\d+)*)$/);
    if (single) {
      lastPrefix = single[1];
      cases.push(token);
    }
  }
  return cases;
}

/** 解析映射表行，返回 { specPath, lifecycle, cases } 或 null */
function parseMappingRow(line) {
  const cells = line
    .split('|')
    .map((c) => c.trim())
    .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
  if (cells.length < 3) return null;
  const [specCell, caseCell, lifecycleCell] = cells;
  // spec 列：全路径 `tests/xxx/test_NN_*.spec.js` 或简称 `test_NN_*`（表形态因模块而异）
  let specPath = specCell.match(/`?(tests\/[\w./-]+\.spec\.js)`?/)?.[1];
  if (!specPath) {
    const short = specCell.match(/`?(test_\w+)\.spec\.js`?/)?.[1];
    if (!short) return null;
    specPath = `tests/${short}.spec.js`;
  }
  if (!/^[A-Z]{2,}-/.test(caseCell) && !/\d/.test(caseCell)) return null;
  return {
    specPath,
    lifecycle: lifecycleCell || '',
    cases: expandCaseList(caseCell),
  };
}

function isPendingLifecycle(lifecycle) {
  return /待实现|待新增|待回填|待评审|已评审（spec 待实现|spec 待实现/.test(lifecycle);
}

function scanModule(moduleDir, exceptions) {
  const indexFile = path.join(ROOT, 'docs', moduleDir, '02-功能测试用例', '00-索引与映射.md');
  if (!fs.existsSync(indexFile)) return null;
  const lines = fs.readFileSync(indexFile, 'utf-8').split('\n');
  // 定位「Playwright 自动化映射」章节内的表格行
  let inMapping = false;
  const problems = [];
  const skipped = [];
  for (const line of lines) {
    if (/^#{2,3}\s+.*(自动化映射|自动化文件映射)/.test(line)) {
      inMapping = true;
      continue;
    }
    if (inMapping && /^#{1,3}\s/.test(line) && !/自动化映射/.test(line)) break;
    if (!inMapping || !line.startsWith('|') || /---/.test(line)) continue;
    const row = parseMappingRow(line);
    if (!row) continue;
    const abs = path.join(ROOT, row.specPath);
    if (!fs.existsSync(abs)) {
      skipped.push({ spec: row.specPath, reason: 'spec 文件不存在' });
      continue;
    }
    if (isPendingLifecycle(row.lifecycle)) {
      skipped.push({ spec: row.specPath, reason: `生命周期待实现（${row.lifecycle}）` });
      continue;
    }
    const source = fs.readFileSync(abs, 'utf-8');
    for (const caseId of row.cases) {
      if (exceptions[caseId]) continue; // 登记过的拆解覆盖
      if (source.includes(caseId)) continue;
      // 零填充变体：映射表写 EM-DESC-1、spec 写 EM-DESC-01（各模块口径不一，视为命中）
      const padded = caseId.replace(/-(\d+)(?!.*-\d)/, (m, digits) => `-${String(digits).padStart(2, '0')}`);
      if (padded !== caseId && source.includes(padded)) continue;
      problems.push({ spec: row.specPath, caseId });
    }
  }
  return { problems, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const modules =
    args.filter((a) => !a.startsWith('--')).length > 0
      ? args.filter((a) => !a.startsWith('--'))
      : fs
          .readdirSync(path.join(ROOT, 'docs'))
          .filter((d) =>
            fs.existsSync(path.join(ROOT, 'docs', d, '02-功能测试用例', '00-索引与映射.md')),
          );
  const exceptions = loadExceptions();

  const report = {};
  let totalProblems = 0;
  for (const mod of modules) {
    const result = scanModule(mod, exceptions);
    if (!result) continue;
    report[mod] = result;
    totalProblems += result.problems.length;
  }

  if (json) {
    console.log(JSON.stringify({ totalProblems, report }, null, 2));
    process.exit(totalProblems > 0 ? 1 : 0);
  }

  for (const [mod, result] of Object.entries(report)) {
    if (result.problems.length === 0 && result.skipped.length === 0) continue;
    console.log(`\n## ${mod}`);
    for (const p of result.problems) {
      console.log(`  ✗ ${p.caseId} 声明于映射表，但 ${p.spec} 中未出现该用例号`);
    }
    for (const s of result.skipped) {
      console.log(`  - 跳过 ${s.spec}（${s.reason}）`);
    }
  }
  console.log(
    `\n${totalProblems === 0 ? '✅' : '❌'} 覆盖映射核对：${totalProblems} 个声明失真的用例映射` +
      `（例外 ${Object.keys(exceptions).length} 条，见 ${path.basename(EXCEPTIONS_FILE)}）`,
  );
  process.exit(totalProblems > 0 ? 1 : 0);
}

main();
