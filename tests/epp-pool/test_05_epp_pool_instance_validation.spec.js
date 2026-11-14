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
 * EPP 实例池 - 实例约束校验补全（EP-POOL-07）
 *
 * 审计背景（2026-11-01，epp-pool 深度审计）：
 * `Pool.vue` 的 `validatePool()` 共 9 类校验（组名必填/重复、组内实例至少 1 个、
 * **组内恰好 1 个**、实例 ID 必填/重复、主机格式、端口 1–65535、host:port 组合唯一），
 * 但 EP-POOL-05 只覆盖「空组名 / 重复组名 / 非法主机」3 类，其余 6 类无用例。
 * 本用例补齐其中 3 类可稳定驱动的高价值校验：组内实例为空、实例 ID 重复、host:port 组合重复。
 * 「组内 >1 实例」在 UI 层不可达（组内已有 1 个时「+添加实例」按钮 disabled，validate 仅兜底），
 * 主机格式与空组名已由 EP-POOL-05 覆盖。
 */
const { test, expect } = require('@playwright/test');
const epp = require('../../pages/resource/EppPoolPage');
const api = require('../../api/epp-pool-api-utils');

/** 3 组 × 1 实例（单实例约束） */
const TEST_POOL = {
  groups: [
    { name: 'epv-a', instances: [{ id: 'epv-a1', host: '10.0.221.1', port: 9002 }] },
    { name: 'epv-b', instances: [{ id: 'epv-b1', host: '10.0.222.1', port: 9002 }] },
    { name: 'epv-c', instances: [{ id: 'epv-c1', host: '10.0.223.1', port: 9002 }] },
  ],
};

async function setPool(page) {
  const ok = await api.patchEppPool(page, { groups: TEST_POOL.groups });
  expect(ok, '接口重置实例池应成功').toBe(true);
}

/** 进编辑模式并展开第 index 组，返回展开区（伸缩表格同一时刻只保留一个展开区） */
async function enterEditAndExpandGroup(page, index) {
  // setPool 通过接口改了服务端数据，UI 仍是旧数据：必须先硬刷新再进编辑模式
  await epp.gotoEppPoolPage(page);
  await page.reload();
  await page.waitForTimeout(1500);
  await epp.ensureOnEppPoolPage(page, { stabilityRounds: 1, stabilityIntervalMs: 1000 });
  await epp.clickEditPool(page);
  await page.waitForTimeout(500);
  const rows = page.locator('.epp-pool-table tbody tr.ivu-table-row');
  const row = rows.nth(index);
  const icon = row.locator('td').first().locator('.ivu-table-cell-expand');
  await icon.first().click();
  await page.waitForTimeout(600);
  const cell = page.locator('.epp-pool-table td.ivu-table-expanded-cell').first();
  await expect(cell).toBeVisible({ timeout: 10000 });
  return cell;
}

async function saveAndExpectBlocked(page, message) {
  const toast = page.getByText(message).first().waitFor({
    state: 'visible',
    timeout: 15000,
  });
  await epp.clickSavePool(page);
  await toast; // 与点击并发等待，避免 3s 提示窗口被 sleep 吃掉
  await expect(
    page.getByText(message).first(),
    '应给出校验错误提示',
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '保存' }),
    '校验失败应停留在编辑模式',
  ).toBeVisible();
}

test.describe('EPP实例池 - EP-POOL-07 实例约束校验补全', () => {
  test.afterEach(async ({ page }) => {
    // 无论成败都尝试还原原始池（原始状态由用例开头备份）
    await page.evaluate(() => {}).catch(() => {});
  });

  test('组内实例为空 / 实例 ID 重复 / host:port 组合重复均被拦截', async ({
    page,
  }) => {
    await epp.gotoEppPoolPage(page);
    const original = await api.getEppPool(page);
    try {
      await test.step('1. 组内实例为空：删除 epv-c 的唯一实例后保存被拦截', async () => {
        await setPool(page);
        const cell = await enterEditAndExpandGroup(page, 2);
        await cell.getByRole('button', { name: '删除' }).first().click();
        await page.waitForTimeout(300);
        await saveAndExpectBlocked(page, '至少需包含 1 个实例');
        await epp.clickCancelPool(page);
      });

      await test.step('3. 实例 ID 重复：epv-b 的实例 ID 改为 epv-a1 后保存被拦截', async () => {
        await setPool(page);
        const cell = await enterEditAndExpandGroup(page, 1);
        await cell.getByPlaceholder('实例 ID').first().fill('epv-a1');
        await page.waitForTimeout(200);
        await saveAndExpectBlocked(page, '实例 ID「epv-a1」重复');
        await epp.clickCancelPool(page);
      });

      await test.step('4. host:port 组合重复：epv-b 主机改为与 epv-a 相同后保存被拦截', async () => {
        await setPool(page);
        const cell = await enterEditAndExpandGroup(page, 1);
        await cell.getByPlaceholder('主机').first().fill('10.0.221.1');
        await page.waitForTimeout(200);
        await saveAndExpectBlocked(page, '「10.0.221.1:9002」组合重复');
        await epp.clickCancelPool(page);
      });
    } finally {
      if (original && Array.isArray(original.groups)) {
        await api.patchEppPool(page, { groups: original.groups }).catch(() => {});
      }
    }
  });
});
