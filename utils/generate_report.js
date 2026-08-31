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
const fs = require('fs');
const path = require('path');
const moment = require('moment');

function stripAnsi(text) {
  if (!text) return '';
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function collectSpecs(suite, fileTitle, groups) {
  const currentFile = fileTitle || suite.file || suite.title;

  if (suite.specs && suite.specs.length > 0) {
    groups.push({
      file: currentFile,
      group: suite.title,
      specs: suite.specs,
    });
  }

  if (suite.suites && suite.suites.length > 0) {
    suite.suites.forEach((child) => collectSpecs(child, currentFile, groups));
  }
}

function inferModule(filePath) {
  if (!filePath) return '其他';
  if (filePath.includes('/entity/') || filePath.includes('\\entity\\')) {
    return 'Entity 管理';
  }
  if (filePath.includes('/user/') || filePath.includes('\\user\\')) {
    return '用户管理';
  }
  return '其他';
}

function getHtmlReportDir(report) {
  const reporters = report.config?.reporter || [];
  for (const reporter of reporters) {
    if (Array.isArray(reporter) && reporter[0] === 'html' && reporter[1]?.outputFolder) {
      return reporter[1].outputFolder;
    }
  }
  return '';
}

function readTestHost(rootDir) {
  try {
    const confPath = path.join(rootDir || process.cwd(), 'conf.json');
    const conf = JSON.parse(fs.readFileSync(confPath, 'utf-8'));
    return conf.ctlHost || '';
  } catch {
    return '';
  }
}

function findFailedStep(steps) {
  if (!steps || steps.length === 0) return '';
  const failed = steps.find((step) => step.error);
  return failed ? failed.title : '';
}

function getAttachments(result, rootDir) {
  const attachments = result.attachments || [];
  return attachments
    .filter((item) => item.path)
    .map((item) => ({
      name: item.name,
      contentType: item.contentType,
      path: rootDir ? path.relative(rootDir, item.path) : item.path,
    }));
}

function getTestStats(test, rootDir) {
  const results = test.results || [];
  if (results.length === 0) {
    return {
      status: 'skipped',
      duration: 0,
      errorMsg: '',
      errorStack: '',
      failedStep: '',
      errorLocation: '',
      attachments: [],
      retries: 0,
    };
  }

  const lastResult = results[results.length - 1];
  const error = lastResult.error || {};
  const errorMsg = stripAnsi(error.message || '');
  const errorStack = stripAnsi(error.stack || '');
  const location = error.location || lastResult.errorLocation;

  let errorLocation = '';
  if (location?.file) {
    const relFile = rootDir
      ? path.relative(rootDir, location.file)
      : location.file;
    errorLocation = `${relFile}:${location.line}:${location.column}`;
  }

  return {
    status: lastResult.status,
    duration: lastResult.duration || 0,
    errorMsg,
    errorStack,
    failedStep: findFailedStep(lastResult.steps),
    errorLocation,
    attachments: getAttachments(lastResult, rootDir),
    retries: Math.max(0, results.length - 1),
  };
}

function summarizeByModule(rows) {
  const summary = {};
  rows.forEach((row) => {
    if (!summary[row.module]) {
      summary[row.module] = { total: 0, passed: 0, failed: 0, skipped: 0 };
    }
    summary[row.module].total++;
    if (row.stats.status === 'passed') summary[row.module].passed++;
    else if (row.stats.status === 'failed') summary[row.module].failed++;
    else summary[row.module].skipped++;
  });
  return summary;
}

function formatStackPreview(stack, maxLines = 12) {
  if (!stack) return '';
  const lines = stack.split('\n').filter(Boolean);
  if (lines.length <= maxLines) return stack;
  return lines.slice(0, maxLines).join('\n') + `\n...（共 ${lines.length} 行，完整堆栈见 HTML 报告）`;
}

/**
 * 从 Playwright JSON 报告生成 Markdown 测试报告。
 * @param {string} jsonPath - test-results.json 路径
 * @param {string} outputPath - 输出 md 路径
 * @param {{ rootDir?: string, title?: string }} [options]
 * @returns {{ total: number, passed: number, failed: number, skipped: number, outputPath: string }}
 */
function generateReport(jsonPath, outputPath, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportTitle = options.title || 'AI Gateway UI 自动化测试报告';

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`未找到 JSON 报告: ${jsonPath}`);
  }

  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const groups = [];
  (report.suites || []).forEach((suite) => collectSpecs(suite, null, groups));

  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const rows = [];

  groups.forEach((group) => {
    group.specs.forEach((spec) => {
      spec.tests.forEach((test) => {
        total++;
        const stats = getTestStats(test, rootDir);
        if (stats.status === 'passed') passed++;
        else if (stats.status === 'failed') failed++;
        else skipped++;

        rows.push({
          file: group.file,
          module: inferModule(group.file),
          group: group.group,
          spec: spec.title,
          stats,
        });
      });
    });
  });

  const fileSet = new Set(rows.map((row) => row.file));
  const moduleSummary = summarizeByModule(rows);
  const htmlReportDir = getHtmlReportDir(report);
  const testHost = readTestHost(rootDir);
  const generatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
  const failedRows = rows.filter((row) => row.stats.status === 'failed');

  let md = `# ${reportTitle}\n\n`;
  md += `**生成时间**: ${generatedAt}\n\n`;

  if (testHost) {
    md += `**测试环境**: ${testHost}\n\n`;
  }
  if (htmlReportDir) {
    md += `**HTML 报告**: \`${htmlReportDir}/index.html\`\n\n`;
  }

  if (failed > 0 && passed === 0 && testHost) {
    md += `> **注意**：本次全部失败。若错误含 \`ERR_CONNECTION_REFUSED\`，请先确认测试环境 \`${testHost}\` 可访问后重试。\n\n`;
  }

  md += '## 测试概览\n\n';
  md += '| 指标 | 数值 |\n|------|------|\n';
  md += `| 总用例数 | ${total} |\n`;
  md += `| 通过 | ${passed} |\n`;
  md += `| 失败 | ${failed} |\n`;
  md += `| 跳过 | ${skipped} |\n`;
  md += `| 通过率 | ${total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00'}% |\n\n`;

  md += '## 模块统计\n\n';
  md += '| 模块 | 总数 | 通过 | 失败 | 跳过 |\n';
  md += '|------|------|------|------|------|\n';
  Object.keys(moduleSummary)
    .sort()
    .forEach((moduleName) => {
      const item = moduleSummary[moduleName];
      md += `| ${moduleName} | ${item.total} | ${item.passed} | ${item.failed} | ${item.skipped} |\n`;
    });
  md += '\n';

  md += '## 测试结果详情\n\n';

  let currentFile = '';
  rows.forEach((row) => {
    if (row.file !== currentFile) {
      currentFile = row.file;
      md += `### ${currentFile}\n\n`;
      md += '| 状态 | 用例组 | 用例名称 | 耗时 | 重试 |\n';
      md += '|------|--------|---------|------|------|\n';
    }

    const icon =
      row.stats.status === 'passed'
        ? '✅'
        : row.stats.status === 'failed'
          ? '❌'
          : '⏭️';
    const duration = (row.stats.duration / 1000).toFixed(2) + 's';
    const retryText = row.stats.retries > 0 ? String(row.stats.retries) : '-';
    md += `| ${icon} | ${row.group} | ${row.spec} | ${duration} | ${retryText} |\n`;

    if (row.stats.status === 'failed') {
      if (row.stats.failedStep) {
        md += `| | **失败步骤** | ${row.stats.failedStep} | | |\n`;
      }
      if (row.stats.errorLocation) {
        md += `| | **错误位置** | \`${row.stats.errorLocation}\` | | |\n`;
      }
      if (row.stats.errorMsg) {
        const firstLine = row.stats.errorMsg.split('\n')[0];
        md += `| | **错误摘要** | ${firstLine.replace(/\|/g, '\\|')} | | |\n`;
      }
    }
  });

  if (failedRows.length > 0) {
    md += '\n## 失败详情\n\n';
    failedRows.forEach((row, index) => {
      md += `### ${index + 1}. ${row.group} — ${row.spec}\n\n`;
      md += `- **文件**: \`${row.file}\`\n`;
      if (row.stats.failedStep) {
        md += `- **失败步骤**: ${row.stats.failedStep}\n`;
      }
      if (row.stats.errorLocation) {
        md += `- **错误位置**: \`${row.stats.errorLocation}\`\n`;
      }
      if (row.stats.retries > 0) {
        md += `- **重试次数**: ${row.stats.retries}\n`;
      }

      if (row.stats.errorMsg) {
        md += '\n**错误信息**:\n\n';
        md += '```\n' + row.stats.errorMsg + '\n```\n\n';
      }

      const stackPreview = formatStackPreview(row.stats.errorStack);
      if (stackPreview) {
        md += '**堆栈**:\n\n';
        md += '```\n' + stackPreview + '\n```\n\n';
      }

      const screenshot = row.stats.attachments.find((item) => item.name === 'screenshot');
      const errorContext = row.stats.attachments.find((item) => item.name === 'error-context');
      if (screenshot || errorContext) {
        md += '**附件**:\n\n';
        if (screenshot) {
          md += `- 截图: \`${screenshot.path}\`\n`;
        }
        if (errorContext) {
          md += `- 错误上下文: \`${errorContext.path}\`\n`;
        }
        md += '\n';
      }
    });
  }

  md += '\n## 执行统计\n\n';
  md += `- **测试文件**: ${fileSet.size} 个\n`;
  md += `- **Playwright 版本**: ${report.config?.version || 'unknown'}\n`;
  if (htmlReportDir) {
    md += `- **HTML 报告目录**: \`${htmlReportDir}/\`\n`;
  }
  md += `- **JSON 报告**: \`test-results.json\`\n\n`;
  md += '---\n*报告由 generate_report.js 自动生成*\n';

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, md, 'utf-8');

  const timestampedPath = path.join(
    outputDir,
    `test-report-${moment().format('YYYYMMDD-HHmmss')}.md`,
  );
  fs.writeFileSync(timestampedPath, md, 'utf-8');

  console.log(`Markdown 报告已生成: ${outputPath}`);
  console.log(`归档副本: ${timestampedPath}`);
  console.log(`总计 ${total}，通过 ${passed}，失败 ${failed}，跳过 ${skipped}`);

  return { total, passed, failed, skipped, outputPath, timestampedPath };
}

module.exports = { generateReport };

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonPath = path.resolve(args[0] || 'test-results.json');
  const outputPath = path.resolve(
    args[1] || 'report/test-report.md',
  );
  generateReport(jsonPath, outputPath, { rootDir: process.cwd() });
}
