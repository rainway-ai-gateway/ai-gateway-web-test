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
 * 路由管理 - 表达式变更：请求体大小条件（RT-E-01/02/04/05/06）
 *
 * 文档：docs/route-management/02-功能测试用例/05-表达式变更-请求体大小条件.md
 *
 * 审计背景（2026-11-01，route-management 深度审计）：
 * 索引声明 §5 RT-E-01~RT-E-07 共 7 条，但 `test_08_route_expression_body_size.spec.js`
 * 一直标注「spec 待实现」（覆盖缺口清单 #74）。本轮补齐其中可自动化部分：
 * - RT-E-01 面板含 req_body_larger_than / req_body_less_than（显式点名，补基线计数之外的可读性）
 * - RT-E-02 点击后默认参数分别为 8192 / 2048
 * - RT-E-04 合法表达式校验通过（无内联错误）
 * - RT-E-05 非法表达式校验失败（内联错误非空，抽屉不关闭）
 * - RT-E-06 错误提示展示（1 个 tip；api 编译错误可多行，最多 3 行且不横向溢出；
 *   2026-11-11 经确认放宽原「单行」要求）
 *
 * 未实现（已在文档标注）：
 * - RT-E-03 Tooltip 文案 → 同义覆盖于 RT-E-10（`body.req_body_larger_than` 的示例与 Content-Length 说明）
 * - RT-E-07 无 Content-Length 时不匹配 → 数据面契约，按项目决策不做（用户 2026-10-30 决策：数据面契约测试层不做）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/route/RoutePage');
const panel = require('../../pages/route/ExpressionPanelPage');

const DRAWER_WITH_TEXT = '添加规则';

function ruleDrawer(page) {
  return page.locator('.ivu-drawer').filter({ hasText: DRAWER_WITH_TEXT }).first();
}

function expressionFormItem(page) {
  return ruleDrawer(page)
    .locator('.ivu-form-item')
    .filter({
      has: page.locator('.ivu-form-item-label', { hasText: '表达式' }),
    })
    .first();
}

function expressionErrorTip(page) {
  return expressionFormItem(page).locator('.ivu-form-item-error-tip');
}

async function enterAddRuleDrawer(page) {
  await utils.ensureRouteTableModuleAvailable(page);
  await utils.openGlobalRouteTableDetail(page);
  await utils.enterRouteRulesEditMode(page);
  await utils.openAddRuleDrawer(page);
}

/** 写入表达式并等待 expression/verify 返回（on-change 触发，去抖约 1s） */
async function fillExpressionAndWait(page, expression) {
  await utils.fillRuleExpression(page, expression);
  await page.waitForTimeout(2500);
}

test.describe('路由管理 - RT-E-01 表达式片段含请求体大小条件', () => {
  test('面板包含 req_body_larger_than 与 req_body_less_than', async ({ page }) => {
    await test.step('前置：进入 Global 路由表编辑模式并打开添加规则抽屉', async () => {
      await enterAddRuleDrawer(page);
    });

    await test.step('两个请求体大小原语均出现在面板（body 组）', async () => {
      await panel.expectPrimitiveExists(page, 'body', 'req_body_larger_than');
      await panel.expectPrimitiveExists(page, 'body', 'req_body_less_than');
    });

    await test.step('其余既有片段保持可用（header 组 key_in 正对照）', async () => {
      await panel.expectPrimitiveExists(page, 'header', 'key_in');
    });
  });
});

test.describe('路由管理 - RT-E-02 请求体大小条件默认参数', () => {
  test('点击片段分别追加 req_body_larger_than(8192) 与 req_body_less_than(2048)', async ({
    page,
  }) => {
    await test.step('前置：进入编辑模式并打开添加规则抽屉', async () => {
      await enterAddRuleDrawer(page);
    });

    await test.step('req_body_larger_than 默认 8192，并触发一次 PATCH expression/verify', async () => {
      const value = await panel.clickPrimitiveAndExpectAppend(
        page,
        'body',
        'req_body_larger_than',
      );
      expect(value).toContain('req_body_larger_than(8192)');
    });

    await test.step('req_body_less_than 默认 2048（末尾粘接追加）', async () => {
      const value = await panel.clickPrimitiveAndExpectAppend(
        page,
        'body',
        'req_body_less_than',
      );
      expect(value).toContain('req_body_less_than(2048)');
    });
  });
});

test.describe('路由管理 - RT-E-04 请求体大小条件合法输入校验通过', () => {
  test('req_body_larger_than(8192) 校验通过，表达式字段无内联错误', async ({ page }) => {
    await test.step('前置：进入编辑模式并打开添加规则抽屉', async () => {
      await enterAddRuleDrawer(page);
    });

    await test.step('填写合法请求体大小条件', async () => {
      await fillExpressionAndWait(page, 'req_body_larger_than(8192)');
    });

    await test.step('表达式 FormItem 无错误态与错误提示', async () => {
      await expect(expressionErrorTip(page)).toHaveCount(0);
      await expect(expressionFormItem(page)).not.toHaveClass(
        /ivu-form-item-error/,
      );
    });

    await test.step('组合表达式（&&）同样通过', async () => {
      await fillExpressionAndWait(
        page,
        'req_host_in("api.example.com") && req_body_larger_than(8192)',
      );
      await expect(expressionErrorTip(page)).toHaveCount(0);
    });
  });
});

test.describe('路由管理 - RT-E-05 请求体大小条件非法输入校验', () => {
  test('req_body_larger_than(abc) 校验失败并给出内联提示', async ({ page }) => {
    await test.step('前置：进入编辑模式并打开添加规则抽屉', async () => {
      await enterAddRuleDrawer(page);
    });

    await test.step('填写非法参数（非数字）', async () => {
      await fillExpressionAndWait(page, 'req_body_larger_than(abc)');
    });

    await test.step('表达式字段进入错误态且提示非空', async () => {
      await expect(expressionFormItem(page)).toHaveClass(/ivu-form-item-error/, {
        timeout: 10000,
      });
      await expect(expressionErrorTip(page)).toHaveCount(1);
      const text = (await expressionErrorTip(page).innerText()).trim();
      expect(text.length, '错误提示不应为空').toBeGreaterThan(0);
    });

    await test.step('保存被拦截，抽屉保持打开', async () => {
      await utils.submitRuleFormAndWait(page);
      await utils.expectRuleFormDrawerStillOpen(page);
    });
  });
});

test.describe('路由管理 - RT-E-06 请求体大小条件错误提示展示', () => {
  test('错误提示为单个 tip、可多行编译明细、≤3 行且不横向溢出', async ({ page }) => {
    await test.step('前置：进入编辑模式并打开添加规则抽屉', async () => {
      await enterAddRuleDrawer(page);
    });

    await test.step('触发语法错误', async () => {
      await fillExpressionAndWait(page, 'req_body_larger_than(');
      await expect(expressionErrorTip(page)).toHaveCount(1, { timeout: 10000 });
    });

    await test.step('提示内容与布局：单个 tip、含编译错误摘要、≤3 行且不横向溢出', async () => {
      const tip = expressionErrorTip(page);
      const text = (await tip.innerText()).trim();
      expect(text.length, '错误提示文本不应为空').toBeGreaterThan(0);
      // api /expression/verify 的 message 带编译错误明细（语法错误 + 表达式行 + 插入符行）
      expect(text).toMatch(/syntax error|unexpected token|compile error/i);

      const metrics = await tip.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          height: el.getBoundingClientRect().height,
          lineHeight: parseFloat(style.lineHeight) || 0,
          fontSize: parseFloat(style.fontSize) || 0,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      });
      const lineHeight = Math.max(
        metrics.lineHeight || 0,
        metrics.fontSize * 1.6,
      );
      // 2026-11-11 口径：允许 api 返回的多行编译错误，最多 3 行
      expect(
        metrics.height,
        `提示高度 ${metrics.height}px 应不超过 3 行上限 ${lineHeight * 3}px`,
      ).toBeLessThanOrEqual(lineHeight * 3 + 2);
      expect(
        metrics.scrollWidth,
        '错误提示不应横向溢出（scrollWidth 超出 clientWidth）',
      ).toBeLessThanOrEqual(metrics.clientWidth + 1);
    });
  });
});
