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
 * 长链路场景 - SC-L-06 只读角色跨模块扫链（docs/跨模块横切用例.md H-4 族）
 *
 * 链路：user → 全模块只读视角 → 角色提升恢复。
 * 与 UM-53 全站巡检（test_11，静态 viewer 账号）的区别：本条验证**动态角色变更**——
 * 1.（user）API 新建只读用户 U（role=system_admin_readonly），回读角色
 * 2. 以 U 登录，抽查 3 个代表模块（providers / route-tables / ai-cache-rules）：
 *    只读态无可见写入口（v-has 机制，readonly.visibleWriteControls 为空）
 * 3. 登回管理员，PATCH U 角色为 system_admin（PATCH /auth/users/{name}/role）
 * 4. 再以 U 登录：同 3 模块写入口**恢复可见**（角色变更即时生效，无需重建账号）
 * 5.（operation-logs）用户创建与角色变更留痕
 *
 * 清理：末位以管理员态删除测试用户（deleteUserViaApi）。
 *
 * 运行：npx playwright test tests/user/test_13_user_scenario_chain.spec.js
 */
const { test, expect } = require('@playwright/test');
const um = require('../../pages/user/UserPage');
const readonly = require('../../utils/readonly');
const logApi = require('../../api/operation-log-api-utils');
const common = require('../../utils/common');

const SWEEPS = [
  { slug: 'providers', writeControl: /添加服务商/ },
  { slug: 'route-tables', writeControl: /启用|提交/ },
  { slug: 'ai-cache-rules', writeControl: /添加|进入编辑/ },
];

test.describe('长链路场景 - SC-L-06 只读角色跨模块扫链 @journey', () => {
  test.describe.configure({ mode: 'serial' });

  const username = 'scl06_viewer_' + Date.now().toString(36);
  const password = 'Scl06@' + Date.now().toString(36).slice(-6);

  test('新建只读用户→跨模块无写入口→提升管理员→写入口恢复，全程留痕', async ({
    page,
  }) => {
    await test.step('1.（user）API 新建只读用户 U，回读角色', async () => {
      await um.gotoUserManagementPage(page);
      const created = await um.addUserViaApi(
        page,
        username,
        password,
        'system_admin_readonly',
      );
      expect(created, '新建只读用户应成功').toBe(true);
      const me = await um.fetchUserViaApi(page, username);
      expect(me, '应能回读到新建用户').toBeTruthy();
      expect(me.role).toBe('system_admin_readonly');
    });

    await test.step('2. 以 U 登录，3 个代表模块只读态无可见写入口', async () => {
      await readonly.loginAsReadonly(page, {
        user: { name: username, password, role: 'system_admin_readonly' },
      });
      for (const s of SWEEPS) {
        await readonly.gotoAsReadonly(page, s.slug, {
          ready: readonly.contentView(page),
        });
        await readonly.expectRouteReachable(page, s.slug);
        const leaked = await readonly.visibleWriteControls(page);
        expect(
          leaked,
          `只读态 /${s.slug} 不应存在可见写入口：${leaked.join(' | ')}`,
        ).toEqual([]);
        common.log(`只读态 /${s.slug} 无可见写入口 ✓`);
      }
    });

    await test.step('3. 登回管理员，将 U 提升为 system_admin', async () => {
      const conf = JSON.parse(common.getConf());
      await um.loginAsUser(page, conf.username, conf.password, 'system_admin', 20000);
      const patched = await um.patchUserRoleViaApi(page, username, 'system_admin');
      expect(patched.errNum, '角色提升应成功').toBe(200);
    });

    await test.step('4. 再以 U 登录：同 3 模块写入口恢复可见', async () => {
      await readonly.loginAsReadonly(page, {
        user: { name: username, password, role: 'system_admin' },
      });
      for (const s of SWEEPS) {
        await readonly.gotoAsReadonly(page, s.slug, {
          ready: readonly.contentView(page),
        });
        await readonly.expectRouteReachable(page, s.slug);
        // 正向口径：v-has 全量放行后不应再有任何挂 .v-has-hidden 的元素
        //（route-tables 的写入口是行内开关，不走文案扫描，故用隐藏计数而非文案计数）
        const hidden = await readonly.vHasHiddenCount(page);
        expect(hidden, `管理员态 /${s.slug} 不应存在被隐藏的写入口`).toBe(0);
        const controls = await readonly.visibleWriteControls(page);
        common.log(
          `管理员态 /${s.slug} 隐藏元素 ${hidden} 个，可见写入口 ${controls.length} 个: ${controls.join(' | ')}`,
        );
      }
    });

    await test.step('5.（operation-logs）用户创建与角色变更留痕', async () => {
      const createLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'create' && item.resource_name === username,
        { resource_name: username },
      );
      expect(createLog, '应存在用户创建的操作日志').not.toBeNull();

      const roleLog = await logApi.waitForOperationLogViaApi(
        page,
        (item) =>
          item.action === 'update' &&
          item.resource_name === username,
        { resource_name: username },
      );
      expect(roleLog, '应存在用户角色变更的操作日志').not.toBeNull();
    });

    await test.step('清理：删除测试用户 U', async () => {
      const removed = await um.deleteUserViaApi(page, username);
      expect(removed, '删除测试用户应成功').toBe(true);
    });
  });
});
