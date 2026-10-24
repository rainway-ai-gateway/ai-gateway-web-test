#!/usr/bin/env node
/**
 * 既有用例影响扫描（impact-scan）
 *
 * 给一组变更关键词，扫描测试文档与测试代码，列出**可能受影响的既有用例**，
 * 作为「既有用例影响评估」的起点（清单须人工确认处置后再写入
 * `ai-gateway-web/design-docs/modifications/<批次>/ui-code-changes.md` §5）。
 *
 * 用法：
 *   node scripts/impact-scan.js <关键词...> [--module=<模块目录名>] [--json]
 *
 * --module 同时限定 docs/<名>/、tests/<名>/、pages/<名>/；docs 与 tests 目录名不一致时按
 * 顶部 MODULE_ALIAS_GROUPS 的别名互通（如 business-cluster 与 cluster 互为别名）。
 *
 * 扫描范围（默认全量）：
 *   docs/**\/02-功能测试用例/*.md、docs/**\/01-测试场景概览.md、tests/**\/*.spec.js、pages/**\/*.js
 *
 * 归属解析：
 *   02 文档 → 向上找最近的 `### <用例编号>：<标题>`（或 `### <N.N> <标题>` + 正文 `**用例编号**`）
 *   spec    → 向上找最近的 `test('...')` / `describe('...')` 标题，并从标题提取用例编号
 *   其它    → 向上找最近的 Markdown 标题；解析不到用例编号标 `(未归属)`
 *
 * 零依赖，Node 18/20 均可运行。
 *
 * 运行：node scripts/impact-scan.js "上游错误归一" --module=business-cluster
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set(['node_modules', 'test-results', 'test-reports', 'report', '.git']);
const MAX_TEXT = 80;
const NO_OWNER = '(未归属)';

// 模块别名（双向生效）：docs/ 与 tests/ 的目录名并不一一对应，来源为 `ls docs/` 与 `ls tests/` 的实际差异。
// 同组内任一名都能解析出整组，例如 --module=business-cluster 与 --module=cluster 都会扫
// docs/business-cluster/ 与 tests/cluster/。
// 名称一致的模块（ai-cache、ai-context、api-key、batch-tasks、entity-management、entity-type、
// epp-pool、intent-config、model-prices、operation-logs、providers、reencrypt-sweep、report、
// traffic-mirror）无需别名。（原 tests/gateway-pool/ 孤儿目录已于 2026-10-15 删除，此处不再列出。）
const MODULE_ALIAS_GROUPS = [
  ['business-cluster', 'cluster'],
  ['cert-management', 'cert'],
  ['route-management', 'route'],
  ['user-management', 'user'],
];

const MODULE_ALIASES = new Map();
for (const group of MODULE_ALIAS_GROUPS) {
  const names = new Set(group);
  for (const name of group) MODULE_ALIASES.set(name, names);
}

const USAGE = `用法: node scripts/impact-scan.js <关键词...> [--module=<模块目录名>] [--json]

给一组变更关键词，扫描测试文档与测试代码，列出可能受影响的既有用例。

  关键词          一个或多个，任一命中即计入（大小写不敏感）
  --module=<名>   限定扫描该模块的 docs/<名>/、tests/<名>/、pages/<名>/
                  docs 与 tests 目录名不一致时按别名互通（business-cluster=cluster、
                  cert-management=cert、route-management=route、user-management=user）
  --json          输出结构化 JSON（便于接入流程）

扫描范围: docs/**/02-功能测试用例/*.md、docs/**/01-测试场景概览.md、
          tests/**/*.spec.js、pages/**/*.js

示例: npm run impact-scan -- "上游错误归一" --module=business-cluster`;

const CASE_IN_HEADING = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)\s*[：:]\s*(.+)$/;
const CASE_ID_SOURCE = '[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\\d+';
const CASE_ID_GLOBAL = new RegExp(CASE_ID_SOURCE, 'g');
const CASE_ID_BOLD = new RegExp('\\*\\*用例编号\\*\\*\\s*[:：]\\s*(' + CASE_ID_SOURCE + ')');
const MD_HEADING = /^#{1,6}\s+\S/;
const MD_H3 = /^###\s+(.+)$/;
const SPEC_CALL = /(?:^|[^\w$])(?:test|describe)(?:\.(?:describe|only|skip|fixme|fail))?\s*\(\s*(['"`])([^'"`]*)\1/;

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const keywords = [];
  let moduleName = null;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    } else if (arg.startsWith('--module=')) {
      moduleName = arg.slice('--module='.length).trim();
    } else if (arg === '--module') {
      moduleName = (argv[i + 1] || '').trim();
      i++;
    } else if (arg.startsWith('-')) {
      fail('未知参数: ' + arg + '\n\n' + USAGE);
    } else if (arg.trim()) {
      keywords.push(arg);
    }
  }

  return { keywords, moduleName, json };
}

function toRel(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

function isTargetDoc(rel) {
  return /^docs\/[^/]+\/02-功能测试用例\/[^/]+\.md$/.test(rel) ||
    /^docs\/[^/]+\/01-测试场景概览\.md$/.test(rel);
}

function isTargetSpec(rel) {
  return /^tests\/.+\.spec\.js$/.test(rel);
}

function isTargetPage(rel) {
  return /^pages\/.+\.js$/.test(rel);
}

function collectFiles(roots) {
  const files = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const abs = path.join(dir, entry.name);
        const rel = toRel(abs);
        if (isTargetDoc(rel) || isTargetSpec(rel) || isTargetPage(rel)) {
          files.push({ abs, rel });
        }
      }
    }
  };

  roots.forEach(walk);
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

function stripHeadingMarkup(text) {
  return text.replace(/^#{1,6}\s+/, '').replace(/\s+#*$/, '').trim();
}

function resolveDocContext(lines, hitIndex) {
  let headingIndex = -1;
  for (let i = hitIndex; i >= 0; i--) {
    if (MD_H3.test(lines[i])) {
      headingIndex = i;
      break;
    }
  }

  if (headingIndex >= 0) {
    const heading = stripHeadingMarkup(lines[headingIndex]);
    const inline = heading.match(CASE_IN_HEADING);
    if (inline) return { caseId: inline[1], title: inline[2].trim() };

    for (let i = headingIndex; i <= hitIndex; i++) {
      const bold = lines[i].match(CASE_ID_BOLD);
      if (bold) {
        return { caseId: bold[1], title: heading.replace(/^\d+(?:\.\d+)*\s*/, '').trim() };
      }
    }
    return { caseId: null, title: heading.replace(/^\d+(?:\.\d+)*\s*/, '').trim() };
  }

  for (let i = hitIndex; i >= 0; i--) {
    if (MD_HEADING.test(lines[i])) {
      return { caseId: null, title: stripHeadingMarkup(lines[i]) };
    }
  }
  return { caseId: null, title: null };
}

function resolveSpecContext(lines, hitIndex) {
  for (let i = hitIndex; i >= 0; i--) {
    const match = lines[i].match(SPEC_CALL);
    if (match) {
      const title = match[2].trim();
      const ids = title.match(CASE_ID_GLOBAL);
      return { caseId: ids ? ids[0] : null, title };
    }
  }
  return { caseId: null, title: null };
}

function resolveContext(rel, lines, hitIndex) {
  if (isTargetDoc(rel)) return resolveDocContext(lines, hitIndex);
  if (isTargetSpec(rel)) return resolveSpecContext(lines, hitIndex);
  for (let i = hitIndex; i >= 0; i--) {
    const match = lines[i].match(SPEC_CALL);
    if (match) {
      const title = match[2].trim();
      const ids = title.match(CASE_ID_GLOBAL);
      return { caseId: ids ? ids[0] : null, title };
    }
  }
  return { caseId: null, title: null };
}

function truncate(text) {
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '…' : text;
}

function scan(files, keywords) {
  const needles = keywords.map((k) => ({ raw: k, lower: k.toLowerCase() }));
  const hits = [];
  let scanned = 0;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file.abs, 'utf8');
    } catch (err) {
      continue;
    }
    if (content.indexOf('\u0000') !== -1) continue;
    scanned++;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const matched = needles.filter((n) => lower.includes(n.lower)).map((n) => n.raw);
      if (!matched.length) continue;

      const context = resolveContext(file.rel, lines, i);
      hits.push({
        file: file.rel,
        line: i + 1,
        keywords: matched,
        text: truncate(lines[i].trim()),
        caseId: context.caseId,
        title: context.title,
      });
    }
  }

  return { hits, scanned };
}

function groupHits(hits) {
  const groups = new Map();
  for (const hit of hits) {
    const label = hit.caseId || (hit.title ? NO_OWNER + ' · ' + hit.title : NO_OWNER);
    if (!groups.has(label)) {
      groups.set(label, { caseId: hit.caseId, title: hit.title, hits: [] });
    }
    groups.get(label).hits.push(hit);
  }

  const ordered = Array.from(groups.values());
  ordered.sort((a, b) => {
    if (!!a.caseId !== !!b.caseId) return a.caseId ? -1 : 1;
    const keyA = (a.caseId || a.title || '').toLowerCase();
    const keyB = (b.caseId || b.title || '').toLowerCase();
    return keyA.localeCompare(keyB);
  });
  return ordered;
}

function resolveRoots(moduleName) {
  const roots = [];
  const missingRoots = [];

  if (!moduleName) {
    for (const base of ['docs', 'tests', 'pages']) {
      const abs = path.join(REPO_ROOT, base);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) roots.push(abs);
      else missingRoots.push(base);
    }
    return { roots, missingRoots, moduleAliases: [] };
  }

  const names = Array.from(MODULE_ALIASES.get(moduleName) || [moduleName]);
  for (const base of ['docs', 'tests', 'pages']) {
    let found = false;
    for (const name of names) {
      const abs = path.join(REPO_ROOT, base, name);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        roots.push(abs);
        found = true;
      }
    }
    if (!found) missingRoots.push(base + '/' + moduleName);
  }

  return { roots, missingRoots, moduleAliases: names };
}

function renderText(result) {
  const out = [];
  out.push('既有用例影响扫描 · 关键词: ' + result.keywords.join(' / ') +
    (result.module ? ' · 模块: ' + result.module : '') +
    (result.moduleAliases.length > 1 ? '（别名互通: ' + result.moduleAliases.join(' / ') + '）' : '') +
    ' · 扫描文件 ' + result.scannedFiles + ' 个' +
    (result.roots.length ? ' · 目录: ' + result.roots.join(', ') : '') +
    (result.missingRoots.length ? ' · 未找到目录: ' + result.missingRoots.join(', ') : ''));

  if (!result.groups.length) {
    out.push('');
    out.push('无命中：该组关键词未出现在既有用例文档/测试代码中（仍须在变更记录中显式写「无」）。');
    return out.join('\n');
  }

  for (const group of result.groups) {
    out.push('');
    out.push('▌' + (group.caseId || NO_OWNER) + (group.title && group.title !== group.caseId ? ' · ' + group.title : ''));
    for (const hit of group.hits) {
      out.push('  ' + (hit.caseId || NO_OWNER) + ' | ' + hit.file + ':' + hit.line + ' | ' +
        hit.keywords.join(',') + ' | ' + hit.text);
    }
  }

  out.push('');
  out.push('汇总：命中用例 ' + result.summary.cases + ' 个 · 命中文件 ' + result.summary.files +
    ' 个 · 关键词 ' + result.summary.keywords + ' 个 · 命中行 ' + result.summary.hits + ' 行');
  out.push('提示：本清单为扫描初稿，须逐条确认处置（微调 / 跳过 / 无处置）后写入变更记录 §5「既有用例影响」。');
  return out.join('\n');
}

function main() {
  const { keywords, moduleName, json } = parseArgs(process.argv.slice(2));

  if (!keywords.length) {
    fail(USAGE);
  }

  const { roots, missingRoots, moduleAliases } = resolveRoots(moduleName);

  if (!roots.length) {
    fail('未找到任何可扫描目录（模块名是否有误？）: ' + missingRoots.join(', '));
  }

  const files = collectFiles(roots);
  const { hits, scanned } = scan(files, keywords);
  const groups = groupHits(hits);

  const hitFiles = Array.from(new Set(hits.map((h) => h.file))).sort();
  const result = {
    keywords,
    module: moduleName || null,
    moduleAliases,
    roots: roots.map(toRel),
    missingRoots,
    scannedFiles: scanned,
    hitFiles,
    groups,
    summary: {
      cases: groups.length,
      files: hitFiles.length,
      keywords: keywords.length,
      hits: hits.length,
    },
  };

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(renderText(result) + '\n');
  }
}

main();