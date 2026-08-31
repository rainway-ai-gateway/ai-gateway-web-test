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
const { generateReport } = require('./utils/generate_report');

module.exports = async function globalTeardown() {
  const rootDir = __dirname;
  const jsonPath = path.join(rootDir, 'test-results.json');
  const reportDir = path.join(rootDir, 'report');
  const outputPath = path.join(reportDir, 'test-report.md');

  if (!fs.existsSync(jsonPath)) {
    console.log('⚠️ 未找到 test-results.json，跳过 Markdown 报告生成');
    return;
  }

  try {
    generateReport(jsonPath, outputPath, { rootDir });
  } catch (error) {
    console.error('❌ Markdown 报告生成失败:', error.message);
  }
};
