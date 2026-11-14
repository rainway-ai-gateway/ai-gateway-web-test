/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * 布局健壮性断言库（DOM 指标级，不做像素比对）
 *
 * 背景：项目无视觉回归（无 toHaveScreenshot / 像素比对），「输入到最大长度后样式混乱或
 * 不可见」此前无覆盖（2026-11-02 盘点，见 docs/覆盖缺口清单.md §27）。这里用确定性
 * 的 DOM 指标替代截图比对：scrollWidth/clientWidth、getBoundingClientRect 重叠与
 * 越界、getComputedStyle 的 white-space / text-overflow / line-height。
 *
 * 适用场景与既有断言互补：
 * - utils/readonly.js：只读态可见性；本库：布局尺寸与溢出
 * - route RT-E-06 的单行提示断言：本库 expectSingleLine 是其通用化
 * - cluster RM-BC-123 的网格补位：本库 expectNoRectOverlap 的矩形重叠是其子集
 *
 * 阈值约定（1px 容差）：
 * - 溢出：scrollWidth > clientWidth + 1 视为横向溢出
 * - 重叠：两矩形垂直间隔 < -1 视为重叠（相邻贴边允许）
 * - 行数：ceil(scrollHeight / lineHeight) 估算；ellipsis 生效（text-overflow=ellipsis
 *   且内容被裁切）时单行无限宽截断视为合理
 */
const { expect } = require('@playwright/test');

const OVERFLOW_TOLERANCE = 1;

/**
 * 读取布局指标（调试与复杂断言用）
 * @returns {Promise<{width,height,top,left,scrollWidth,clientWidth,scrollHeight,clientHeight,lineHeight,fontSize,whiteSpace,textOverflow}>}
 */
async function readLayoutMetrics(locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      lineHeight: parseFloat(style.lineHeight) || 0,
      fontSize: parseFloat(style.fontSize) || 0,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
    };
  });
}

/**
 * 容器无横向溢出：scrollWidth <= clientWidth + 1。
 * 长文本/最大长度输入是否把容器撑出横向滚动条。
 */
async function expectNoHorizontalOverflow(container, label = '') {
  const m = await readLayoutMetrics(container);
  expect(
    m.scrollWidth,
    `${label || '容器'} 横向溢出：scrollWidth=${m.scrollWidth} > clientWidth=${m.clientWidth}`,
  ).toBeLessThanOrEqual(m.clientWidth + OVERFLOW_TOLERANCE);
}

/**
 * 元素完整落在视口内（宽、高均不超 viewport）。
 * 「不可见」类问题的兜底断言。
 */
async function expectWithinViewport(locator, label = '') {
  const m = await readLayoutMetrics(locator);
  const vw = await locator.page().evaluate(() => window.innerWidth);
  const vh = await locator.page().evaluate(() => window.innerHeight);
  expect(
    m.left + m.width,
    `${label || '元素'} 右边界 ${m.left + m.width} 超出视口宽度 ${vw}`,
  ).toBeLessThanOrEqual(vw + OVERFLOW_TOLERANCE);
  expect(
    m.top + m.height,
    `${label || '元素'} 下边界 ${m.top + m.height} 超出视口高度 ${vh}`,
  ).toBeLessThanOrEqual(vh + OVERFLOW_TOLERANCE);
  expect(m.left, `${label || '元素'} 左边界为负（视口外）`).toBeGreaterThanOrEqual(
    -OVERFLOW_TOLERANCE,
  );
}

/**
 * 单行断言（route RT-E-06 的通用化）：无换行、高度 ≤ 单行行高上限。
 */
async function expectSingleLine(locator, label = '') {
  const m = await readLayoutMetrics(locator);
  const text = (await locator.innerText().catch(() => '')) || '';
  expect(
    text.includes('\n'),
    `${label || '元素'} 文本包含换行符`,
  ).toBe(false);
  const singleLineLimit = Math.max(m.lineHeight || 0, m.fontSize * 1.6);
  expect(
    m.height,
    `${label || '元素'} 高度 ${m.height}px 超过单行上限 ${singleLineLimit}px`,
  ).toBeLessThanOrEqual(singleLineLimit + OVERFLOW_TOLERANCE);
}

/**
 * 两元素矩形不重叠（垂直方向间隔 ≥ -1px，允许相邻贴边）。
 */
async function expectNoRectOverlap(a, b, label = '') {
  const ra = await a.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  const rb = await b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  const gap = Math.max(ra.top, rb.top) - Math.min(ra.bottom, rb.bottom);
  expect(
    gap,
    `${label || '两元素'} 垂直重叠 ${-gap}px（A=[${ra.top},${ra.bottom}] B=[${rb.top},${rb.bottom}]）`,
  ).toBeGreaterThanOrEqual(-OVERFLOW_TOLERANCE);
}

/**
 * 省略号裁切实效：text-overflow=ellipsis 且内容确实被裁切。
 */
async function expectEllipsisActive(cell, label = '') {
  const m = await readLayoutMetrics(cell);
  expect(
    m.textOverflow,
    `${label || '单元格'} text-overflow=${m.textOverflow}，期望 ellipsis`,
  ).toBe('ellipsis');
  expect(
    m.scrollWidth,
    `${label || '单元格'} 内容未被裁切（scrollWidth=${m.scrollWidth} <= clientWidth=${m.clientWidth}），ellipsis 无实效`,
  ).toBeGreaterThan(m.clientWidth + OVERFLOW_TOLERANCE);
}

/**
 * 单元格行数封顶：按 lineHeight 估算行数 ≤ maxLines。
 * 若 ellipsis 裁切实效（单行截断），直接通过。
 */
async function expectCellLineCap(cell, maxLines, label = '') {
  const m = await readLayoutMetrics(cell);
  if (
    m.textOverflow === 'ellipsis' &&
    m.scrollWidth > m.clientWidth + OVERFLOW_TOLERANCE
  ) {
    return;
  }
  const lineHeight = m.lineHeight || m.fontSize * 1.5;
  const lines = Math.ceil((m.scrollHeight - OVERFLOW_TOLERANCE) / lineHeight);
  expect(
    lines,
    `${label || '单元格'} 约 ${lines} 行（scrollHeight=${m.scrollHeight}px / lineHeight=${lineHeight}px），超过上限 ${maxLines} 行`,
  ).toBeLessThanOrEqual(maxLines);
}

/**
 * 输入框字数计数器（iView .ivu-input-word-count）与输入框同一行：
 * 计数器垂直中心落在输入框垂直范围内，且不压到下一行元素。
 */
async function expectWordLimitInline(inputWrapper, label = '') {
  const counter = inputWrapper.locator('.ivu-input-word-count');
  await expect(
    counter,
    `${label || '输入框'} 未渲染字数计数器`,
  ).toHaveCount(1, { timeout: 5000 });
  const mi = await readLayoutMetrics(inputWrapper);
  const mc = await readLayoutMetrics(counter.first());
  expect(
    mc.top,
    `${label || '输入框'} 计数器 top=${mc.top} 在输入框范围 [${mi.top}, ${mi.top + mi.height}] 之上`,
  ).toBeGreaterThanOrEqual(mi.top - OVERFLOW_TOLERANCE);
  expect(
    mc.top + mc.height,
    `${label || '输入框'} 计数器下边界 ${mc.top + mc.height} 超出输入框范围 [${mi.top}, ${mi.top + mi.height}]`,
  ).toBeLessThanOrEqual(mi.top + mi.height + OVERFLOW_TOLERANCE);
}

/**
 * 抽屉底部按钮区仍在视口内（长表单滚动后提交按钮不可见的兜底断言）。
 */
async function expectFooterVisibleInViewport(footer, label = '抽屉底部按钮区') {
  await expectWithinViewport(footer, label);
}

module.exports = {
  readLayoutMetrics,
  expectNoHorizontalOverflow,
  expectWithinViewport,
  expectSingleLine,
  expectNoRectOverlap,
  expectEllipsisActive,
  expectCellLineCap,
  expectWordLimitInline,
  expectFooterVisibleInViewport,
};
