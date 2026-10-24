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
 * 用户管理 - UM-53 只读视角全站巡检（跨模块写入口不变量）
 *
 * 定位：只读是**一个横切机制**（后端 `role` 枚举 + 前端全局指令 `v-has`），不是各模块独立功能。
 * 各模块 `*只读视角*.md` 的用例负责「本模块哪些按钮该隐、哪些只读入口该留」的细粒度预期；
 * 本 spec 只回答另一个问题：**只读态下全站还有没有漏网的写入口**——
 * 即某个页面/新按钮忘了挂 `v-has`、或 `v-has` 机制被改坏时，能有一条用例报警。
 *
 * 覆盖用例（docs/user-management/02-功能测试用例/10-角色与只读视角.md §UM-53）：
 * - UM-53-1（本文件 16 条路由用例）：只读视角逐路由可达，且全站**无可见写操作入口**
 * - UM-53-2（本文件 baseline 用例）：管理员视角下写入口基线**非空**（防止巡检表空转成假通过），
 *   且 `.v-has-hidden` 在管理员态下一个都不存在（证明该 mechanism 确为只读视角专属）
 *
 * 判定依据（不手写模块清单，而是从产品源码枚举）：
 * - 写入口文案基线 `WRITE_CONTROL_PATTERN` 见 `utils/readonly.js`，
 *   枚举方式：`grep -rn "v-has" ai-gateway-web/src/` 后逐个反查 `src/i18n/zh.js`；
 * - `.v-has-hidden` 的隐藏由 `src/assets/css/global.less` 的 `display:none !important` 实现，
 *   故断言「挂该 class 的元素自身 computed display 必须为 none」可覆盖
 *   「有人去掉 !important 被 v-show 内联样式压过」这类回归。
 *
 * 设计：默认 storageState=auth.json（管理员态）；每条路由先用管理员口径记录可见写入口数量，
 * 再 UI 登录只读账号 viewer 复核。
 *
 * 运行：nvm use 18 && PW_WORKERS=1 npx playwright test tests/user/test_11_readonly_sweep.spec.js
 */
const { test, expect } = require('@playwright/test');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 管理员态可见写入口数量台账，由各路由用例写入，供 baseline 用例人工核对 */
const adminWriteControlTally = {};

for (const route of readonly.SWEEP_ROUTES) {
  test.describe(`用户管理 - UM-53 只读视角全站巡检 /${route.slug}`, () => {
    test(`只读视角 ${route.label}（/${route.slug}）可达且无可见写入口`, async ({
      page,
    }) => {
      await test.step(`管理员对照：${route.label} 可达并记录写入口基线`, async () => {
        await page.goto(`${readonly.getAppBaseUrl()}/${route.slug}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        // 必须等渲染稳定：写入口是接口返回后才渲染的，等太短会把基线数漏计（2026-10-16 实测 /security 因此漏计）
        await readonly.settlePage(page);
        await readonly.expectRouteReachable(page, route.slug);
        const adminControls = await readonly.visibleWriteControls(page);
        adminWriteControlTally[route.slug] = adminControls.length;
        common.log(
          `[巡检基线] /${route.slug} 管理员可见写入口 ${adminControls.length} 个: ` +
            adminControls.join(' | '),
        );
      });

      await test.step('以只读系统管理员登录', async () => {
        await readonly.loginAsReadonly(page);
      });

      await test.step(`只读视角进入 ${route.label}`, async () => {
        await readonly.gotoAsReadonly(page, route.slug, {
          ready: readonly.contentView(page),
        });
        await readonly.expectRouteReachable(page, route.slug);
      });

      await test.step('全站无可见写操作入口（漏挂 v-has 时会在此报出）', async () => {
        const leaked = await readonly.visibleWriteControls(page);
        expect(
          leaked,
          `路由 /${route.slug} 在只读态下仍存在可见写入口：${leaked.join(' | ')}`,
        ).toEqual([]);
      });

      await test.step('.v-has-hidden 机制未被绕过（挂 class 的元素自身必须 display:none）', async () => {
        const violations = await readonly.vHasHiddenViolations(page);
        expect(violations, '存在挂 .v-has-hidden 但未被隐藏的元素').toEqual([]);
      });

      await test.step('只读态未被会话自愈换回管理员态', async () => {
        await readonly.expectStillReadonly(page);
      });
    });
  });
}

test.describe('用户管理 - UM-53 只读视角全站巡检（写入口基线非空）', () => {
  test('管理员视角全站写入口基线非空且管理员态不存在 .v-has-hidden', async ({
    page,
  }) => {
    // 本用例要串行遍历 16 条路由，默认 2 分钟用例超时不够（2026-10-16 实测撞到 120s 超时）
    test.setTimeout(300000);

    let totalWriteControls = 0;
    let totalVHasHidden = 0;
    const perRoute = [];

    await test.step('以管理员口径遍历全部路由并统计', async () => {
      for (const route of readonly.SWEEP_ROUTES) {
        await page.goto(`${readonly.getAppBaseUrl()}/${route.slug}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        // 轮询类页面（batches/security）永远等不到 networkidle，故这里用较短的静默超时 + 沉降，
        // 保证 16 条路由能在用例超时内跑完
        await readonly.settlePage(page, { idleTimeout: 3000, settle: 800 });
        const controls = await readonly.visibleWriteControls(page);
        const vHasCount = await readonly.vHasHiddenCount(page);
        totalWriteControls += controls.length;
        totalVHasHidden += vHasCount;
        perRoute.push(`/${route.slug}=${controls.length}`);
        common.log(
          `[巡检基线] /${route.slug} 写入口=${controls.length} v-has-hidden=${vHasCount}`,
        );
      }
      common.log('[巡检基线] 各路由写入口数量: ' + perRoute.join(', '));
    });

    await test.step('全站写入口基线非空（否则只读巡检会空转成假通过）', async () => {
      expect(
        totalWriteControls,
        '管理员视角全站可见写入口为 0，巡检基线失去意义',
      ).toBeGreaterThan(0);
    });

    await test.step('管理员态不存在 .v-has-hidden（该隐藏机制为只读视角专属）', async () => {
      expect(
        totalVHasHidden,
        '管理员态不应出现 .v-has-hidden 元素',
      ).toBe(0);
    });
  });
});