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
 * 用户管理 - 角色与只读视角 UM-45 ~ UM-49、UM-52
 *
 * 覆盖用例（docs/user-management/02-功能测试用例/10-角色与只读视角.md）：
 * - UM-45 用户列表角色列展示（role 渲染、与接口 role 映射一一对应、无 is_admin 列）
 * - UM-46 用户角色筛选（枚举两档；选中仅命中对应角色行；清空恢复全部）
 * - UM-47 变更角色成功（普通用户：抽屉两档单选默认当前角色、PATCH body、列表刷新）
 * - UM-48 内置 admin 账号角色不可变更（抽屉固定提示、前端拦截、接口 422、角色保持 system_admin）
 * - UM-49 创建用户角色单选（两档单选、默认系统管理员、必填、请求体只含 role、列表展示所选角色）
 * - UM-52 只读视角用户管理页写按钮隐藏（工具栏 / 行内 / Token 操作列写入口 + Token 详情掩码）
 * 说明：UM-50（Token 创建 scope 三档）属 Token管理章节、UM-51（只读账号登录）属登录认证章节，
 * 分别由 tests/user/test_05_token_manage.spec.js、tests/user/test_06_login_auth.spec.js 覆盖，
 * 不在本 spec 范围（该文档其他编号亦非只读用例）。
 *
 * 设计（结构沿用 tests/ai-cache/test_06_ai_cache_readonly.spec.js 范式）：
 * - 默认 storageState=auth.json（管理员态）；UM-52 先做管理员对照，再以 UI 登录只读账号
 *   viewer（只写当前 page 的 localStorage，不写 auth.json，避免覆盖默认 admin 会话）。
 * - 只读路径不调用 ensureSessionHealthy / ensureLoggedIn / handleUrlInvalidAlert /
 *   gotoUserManagementPage（后者内部带会话自愈，会把只读态换回管理员态）。
 * - 文案以实际 UI 为准：Token Tab 的工具栏按钮产品文案是「创建」（com.establish），
 *   用例文档写的「令牌创建」按同一按钮理解。
 *
 * 数据策略：
 * - 复用环境已有数据：`admin`（system_admin）与 `viewer`（system_admin_readonly）两个常驻账号，
 *   用于 UM-45/46/48/52 的角色展示与只读视角。
 * - 造数 + 还原：UM-47 需要一个「非内置、可变更角色」的普通账号，UM-52 预期3/4 需要一个
 *   可开详情、可断言掩码的 Token → beforeAll 用独立 admin context 经 OpenAPI 造数
 *   （`user_ro_*` / `token_ro_*`），UM-49 由用例本身经 UI 创建两个账号；
 *   上述账号与 Token 统一在 afterAll 用 OpenAPI 删除（不污染共享环境，不留残留）。
 *
 * 运行：nvm use 18 && npx playwright test tests/user/test_10_role_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/user/UserPage');
const readonly = require('../../utils/readonly');
const common = require('../../utils/common');

/** 内置账号（模型/后端以 EqualFold 判定大小写不敏感保护） */
const ADMIN_BUILTIN = 'admin';
const AUTH_STATE = path.join(__dirname, '../../auth.json');

/** UM-47：可变更角色的普通账号（beforeAll 造数） */
let roleChangeUser = null;
/** UM-52 预期3/4：可开详情、可断言掩码的 Token（beforeAll 造数） */
let readonlyTokenName = null;
/** afterAll 清理清单（用户 / Token） */
const trackedUsers = [];
const trackedTokens = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const page = await context.newPage();
  try {
    await page.goto(readonly.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    roleChangeUser = 'user_ro_' + Date.now();
    await utils.addUserViaApi(
      page,
      roleChangeUser,
      utils.getDocPassword(),
      'system_admin',
    );
    trackedUsers.push(roleChangeUser);

    readonlyTokenName = 'token_ro_' + Date.now();
    const token = await utils.createTokenViaApi(page, readonlyTokenName, 'System');
    trackedTokens.push(readonlyTokenName);

    common.log(
      '[beforeAll] 只读用例数据已就绪: user=' +
        roleChangeUser +
        ' token=' +
        readonlyTokenName +
        ' token_len=' +
        String(token.token || '').length,
    );
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (trackedUsers.length === 0 && trackedTokens.length === 0) {
    return;
  }
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const page = await context.newPage();
  try {
    await page.goto(readonly.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    for (const username of [...trackedUsers].reverse()) {
      try {
        await utils.deleteUserViaApi(page, username);
      } catch (e) {
        common.log('[afterAll] 清理用户异常: ' + username + ' ' + e.message);
      }
    }
    for (const tokenName of [...trackedTokens].reverse()) {
      try {
        await utils.deleteTokenViaApi(page, tokenName);
      } catch (e) {
        common.log('[afterAll] 清理 Token 异常: ' + tokenName + ' ' + e.message);
      }
    }
    common.log(
      '[afterAll] 只读用例造数已清理: users=' +
        trackedUsers.join(',') +
        ' tokens=' +
        trackedTokens.join(','),
    );
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('用户管理 - UM-45 用户列表角色列展示', () => {
  test('「角色」列由 role 渲染且与接口 role 映射一一对应、无 is_admin 布尔列', async ({
    page,
  }) => {
    const viewer = readonly.READONLY_USER.name;

    await test.step('管理员对照：进入「用户管理」页面（「用户」Tab 选中）', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.switchToUserTab(page);
      await utils.waitForUserTableRows(page);
      await utils.expectUserManagementPageTitle(page);
    });

    await test.step('预期1：存在「角色」列，且不再有 is_admin 布尔列', async () => {
      await utils.expectUserTableHasRoleColumn(page);
    });

    await test.step('预期2：role=system_admin → 展示「系统管理员」', async () => {
      await utils.expectUserRowVisibleByName(page, ADMIN_BUILTIN);
      await utils.expectUserRoleCellText(
        page,
        ADMIN_BUILTIN,
        utils.ROLE_LABEL.system_admin,
      );
    });

    await test.step('预期3：role=system_admin_readonly → 展示「系统管理员（只读）」', async () => {
      await utils.expectUserRowVisibleByName(page, viewer);
      await utils.expectUserRoleCellText(
        page,
        viewer,
        utils.ROLE_LABEL.system_admin_readonly,
      );
    });

    await test.step('预期4：接口 role 与列表「角色」列文案逐行一一对应，无错配', async () => {
      await utils.clearUserColumnFilter(page);

      const apiUsers = await utils.fetchUsersViaApi(page);
      expect(apiUsers.length, '接口应返回至少一个用户').toBeGreaterThan(0);

      // 预期1（接口侧）：role 为 string 枚举，不再有 is_admin 字段
      for (const user of apiUsers) {
        expect(
          typeof user.role,
          `用户 ${user.user_name} 的 role 应为字符串枚举`,
        ).toBe('string');
        expect(
          Object.keys(utils.ROLE_LABEL),
          `用户 ${user.user_name} 的 role 应属于枚举`,
        ).toContain(user.role);
        expect(
          user.is_admin,
          '接口不应再返回 is_admin 字段',
        ).toBeUndefined();
      }
      // 前置条件：列表中两种角色各至少一个
      expect(
        apiUsers.some((u) => u.role === 'system_admin'),
        '环境应存在 role=system_admin 的用户',
      ).toBe(true);
      expect(
        apiUsers.some((u) => u.role === 'system_admin_readonly'),
        '环境应存在 role=system_admin_readonly 的用户',
      ).toBe(true);

      const rendered = await utils.readRenderedUserRoles(page);
      expect(rendered.length, '列表当前页应有数据行').toBeGreaterThan(0);
      for (const row of rendered) {
        const apiUser = apiUsers.find((u) => u.user_name === row.name);
        expect(apiUser, `接口应返回列表中的用户 ${row.name}`).toBeTruthy();
        expect(
          row.role,
          `用户 ${row.name} 的「角色」文案应与接口 role 映射一致`,
        ).toBe(utils.ROLE_LABEL[apiUser.role]);
      }
    });
  });
});

test.describe('用户管理 - UM-46 用户角色筛选', () => {
  test('「角色」筛选枚举两档：选中仅命中对应角色行，清空后恢复全部', async ({
    page,
  }) => {
    let unfilteredRowCount = 0;

    await test.step('管理员对照：进入「用户管理」页面（「用户」Tab）', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.switchToUserTab(page);
      await utils.waitForUserTableRows(page);
      unfilteredRowCount = await utils.countRenderedUserRows(page);
      expect(unfilteredRowCount, '未筛选时列表应有数据行').toBeGreaterThan(0);
    });

    await test.step('预期1：打开「角色」筛选控件，枚举恰为两档角色（无 is_admin 布尔项）', async () => {
      // 就绪判定：控件可见 + 占位文案指向「角色」列（iView 非 filterable Select 不渲染 input，
      // 占位是 `.ivu-select-placeholder` 文本，不是 input 的 placeholder 属性）
      await utils.expectRoleFilterVisible(page);
      await utils.openRoleFilter(page);
      await utils.expectRoleFilterOptions(page);
    });

    await test.step('预期2：选中「系统管理员」后仅命中 role=system_admin 的行', async () => {
      await utils.selectRoleFilter(page, utils.ROLE_LABEL.system_admin);

      // 留意（2026-10-16）：pageTable 的前端筛选对「带 render 的列」用
      // 「渲染文案 ↔ 筛选值」比较（src/components/table/pageTable.vue:379-402），
      // 而角色列的筛选值是枚举 `system_admin`、渲染文案是「系统管理员」。
      // 若本步在环境中失败（命中 0 行），属产品侧缺陷（枚举值应与渲染文案之一对齐），
      // 不是断言写错——预期按用例文档原样保留。
      const rows = await utils.readRenderedUserRoles(page);
      expect(rows.length, '选中「系统管理员」后应命中至少一行').toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          row.role,
          `筛选结果中 ${row.name} 的角色应为「系统管理员」`,
        ).toBe(utils.ROLE_LABEL.system_admin);
      }
    });

    await test.step('预期3：选中「系统管理员（只读）」后仅命中 role=system_admin_readonly 的行', async () => {
      await utils.selectRoleFilter(
        page,
        utils.ROLE_LABEL.system_admin_readonly,
      );

      const rows = await utils.readRenderedUserRoles(page);
      expect(
        rows.length,
        '选中「系统管理员（只读）」后应命中至少一行',
      ).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          row.role,
          `筛选结果中 ${row.name} 的角色应为「系统管理员（只读）」`,
        ).toBe(utils.ROLE_LABEL.system_admin_readonly);
      }
      expect(
        rows.some((r) => r.name === readonly.READONLY_USER.name),
        '只读账号 viewer 应出现在「系统管理员（只读）」筛选结果中',
      ).toBe(true);
    });

    await test.step('预期4：清空筛选后恢复显示全部用户', async () => {
      await utils.clearRoleFilter(page);
      await utils.expectRoleFilterCleared(page);

      expect(
        await utils.countRenderedUserRows(page),
        '清空筛选后列表行数应恢复到未筛选时的行数',
      ).toBe(unfilteredRowCount);

      const rows = await utils.readRenderedUserRoles(page);
      for (const row of rows) {
        expect(
          Object.values(utils.ROLE_LABEL),
          `清空后 ${row.name} 的角色文案应仍为合法角色文案`,
        ).toContain(row.role);
      }
    });
  });
});

test.describe('用户管理 - UM-47 变更角色成功（普通用户）', () => {
  test('抽屉两档单选默认当前角色，提交 PATCH body={role}，抽屉关闭且列表角色列刷新', async ({
    page,
  }) => {
    await test.step('前置：beforeAll 已创建可变更角色的普通账号', async () => {
      expect(
        roleChangeUser,
        'beforeAll 应已创建 role=system_admin 的普通测试账号',
      ).toBeTruthy();
    });

    await test.step('管理员对照：目标行操作列存在「变更角色」，当前角色为「系统管理员」', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.switchToUserTab(page);
      await utils.waitForUserTableRows(page);
      await utils.expectUserRowVisibleByName(page, roleChangeUser);
      await readonly.expectAdminVisible(
        utils.userChangeRoleButton(page, roleChangeUser),
        '变更角色',
      );
      await utils.expectUserRoleCellText(
        page,
        roleChangeUser,
        utils.ROLE_LABEL.system_admin,
      );
    });

    await test.step('预期1：点击「变更角色」打开角色变更抽屉', async () => {
      await utils.openChangeRoleDrawer(page, roleChangeUser);
    });

    await test.step('预期2：抽屉内为两档角色单选，且默认选中该用户当前角色', async () => {
      await utils.expectChangeRoleOptions(page);
      await utils.expectChangeRoleChecked(
        page,
        utils.ROLE_LABEL.system_admin,
      );
    });

    await test.step('预期3：提交发起 PATCH /auth/users/{user_name}/role，Body 为 {"role":"system_admin_readonly"}', async () => {
      await utils.selectChangeRole(
        page,
        utils.ROLE_LABEL.system_admin_readonly,
      );
      const [request] = await Promise.all([
        page.waitForRequest(
          (r) =>
            r.method() === 'PATCH' && /\/auth\/users\/[^/]+\/role$/.test(r.url()),
        ),
        utils.submitChangeRole(page),
      ]);
      expect(
        request.postDataJSON(),
        'PATCH body 应为 { role: "system_admin_readonly" }',
      ).toEqual({ role: 'system_admin_readonly' });
    });

    await test.step('预期4：抽屉关闭，列表该用户「角色」列刷新为「系统管理员（只读）」', async () => {
      await utils.expectChangeRoleDrawerClosed(page);
      await utils.ensureUserRowVisible(page, roleChangeUser);
      await utils.expectUserRoleCellText(
        page,
        roleChangeUser,
        utils.ROLE_LABEL.system_admin_readonly,
      );
    });

    await test.step('接口复核：该用户 role 已变为 system_admin_readonly', async () => {
      const detail = await utils.fetchUserViaApi(page, roleChangeUser);
      expect(detail.role, '接口复核角色已变更').toBe('system_admin_readonly');
    });
  });
});

test.describe('用户管理 - UM-48 内置 admin 账号角色不可变更', () => {
  test('抽屉提示角色固定不可变更、提交被前端拦截，接口拒绝降级且 admin 角色保持 system_admin', async ({
    page,
  }) => {
    const patchRequests = [];

    await test.step('管理员对照：进入「用户管理」页面并定位内置 admin 行', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.switchToUserTab(page);
      await utils.waitForUserTableRows(page);
      await utils.expectUserRowVisibleByName(page, ADMIN_BUILTIN);
      await readonly.expectAdminVisible(
        utils.userChangeRoleButton(page, ADMIN_BUILTIN),
        '变更角色',
      );
    });

    await test.step('预期1：抽屉提示角色固定不可变更，且不渲染角色单选', async () => {
      await utils.openChangeRoleDrawer(page, ADMIN_BUILTIN);
      await readonly.expectReadonlyVisible(
        utils.changeRoleFixedTip(page),
        '内置账号角色固定提示',
      );
      await readonly.expectAbsent(
        utils.changeRoleRadioGroup(page),
        '内置账号的角色单选',
      );
    });

    await test.step('预期3（页面侧）：强行提交不发起 PATCH，出现变更失败提示', async () => {
      page.on('request', (r) => {
        if (r.method() === 'PATCH' && /\/auth\/users\/[^/]+\/role$/.test(r.url())) {
          patchRequests.push(r.url());
        }
      });
      await utils.submitChangeRole(page);
      await utils.expectErrorMessage(page, utils.DOC_USER.tipRoleFixedBuiltin);
      expect(
        patchRequests,
        '内置 admin 提交被前端拦截，不应发起 PATCH /auth/users/admin/role',
      ).toEqual([]);
      await utils.closeChangeRoleDrawer(page);
    });

    await test.step('预期3（接口侧）：PATCH /auth/users/admin/role 返回 422', async () => {
      const resp = await utils.patchUserRoleViaApi(
        page,
        ADMIN_BUILTIN,
        'system_admin_readonly',
      );
      expect(resp.errNum, '内置 admin 降级应返回 422').toBe(422);
      expect(resp.httpStatus, 'HTTP 状态应与 ErrNum 一致（422）').toBe(422);
    });

    await test.step('预期4：admin 的 role 保持 system_admin 不变', async () => {
      const detail = await utils.fetchUserViaApi(page, ADMIN_BUILTIN);
      expect(detail.role, '内置 admin 角色不应被降级').toBe('system_admin');
    });

    await test.step('预期2：内置账号名判定大小写不敏感（Admin 变体同样受保护）', async () => {
      // 大写变体在「名字解析」层可能取不到（大小写敏感库 → 404）或解析到内置账号后
      // 被后端 EqualFold 拒绝（422）；两种实现都属于「受保护」，此处只钉「不是 200」，
      // 不锁定具体状态码；页面侧如需点开 `Admin` 行，前提是环境存在该账号（保留名，
      // 前端受限不可创建），故该预期以接口侧验证。
      const resp = await utils.patchUserRoleViaApi(
        page,
        'Admin',
        'system_admin_readonly',
      );
      expect(
        resp.httpStatus,
        '内置账号大小写变体不得被降级为只读',
      ).not.toBe(200);

      const detail = await utils.fetchUserViaApi(page, ADMIN_BUILTIN);
      expect(detail.role, 'admin 角色仍应为 system_admin').toBe('system_admin');
    });
  });
});

test.describe('用户管理 - UM-49 创建用户角色单选', () => {
  test('「角色」两档单选且必填、默认系统管理员；请求体只含 role；列表展示所选角色文案', async ({
    page,
  }) => {
    let readonlyRoleUser = null;
    let adminRoleUser = null;

    await test.step('管理员对照：进入页面并打开「添加用户」抽屉', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.switchToUserTab(page);
      await utils.waitForUserTableRows(page);
      await readonly.expectAdminVisible(utils.tabAddButton(page), '添加用户');
      await utils.openAddUserDrawer(page);
    });

    await test.step('预期1：角色为两档单选，默认选中「系统管理员」', async () => {
      await utils.expectAddUserRoleOptions(page);
      await utils.expectAddUserRoleChecked(
        page,
        utils.ROLE_LABEL.system_admin,
      );
    });

    await test.step('预期2：角色为必填项', async () => {
      await utils.expectAddUserRoleRequired(page);
    });

    await test.step('预期3+5：选「系统管理员（只读）」提交，请求体只含 role 枚举，列表展示所选角色', async () => {
      readonlyRoleUser = 'user_ro_pick01_' + Date.now();
      trackedUsers.push(readonlyRoleUser);
      await utils.fillAddUserForm(
        page,
        readonlyRoleUser,
        utils.getDocPassword(),
        utils.getDocPassword(),
      );
      await utils.selectAddUserRole(
        page,
        utils.ROLE_LABEL.system_admin_readonly,
      );
      const [request] = await Promise.all([
        page.waitForRequest(
          (r) => r.method() === 'POST' && /\/auth\/users$/.test(r.url()),
        ),
        utils.submitAddUserForm(page),
      ]);
      const body = request.postDataJSON();
      expect(
        body.role,
        '请求体 role 应为 string 枚举 system_admin_readonly',
      ).toBe('system_admin_readonly');
      expect(body.is_admin, '请求体不应再含 is_admin').toBeUndefined();

      await utils.expectAddUserDrawerClosed(page);
      await utils.ensureUserRowVisible(page, readonlyRoleUser);
      await utils.expectUserRoleCellText(
        page,
        readonlyRoleUser,
        utils.ROLE_LABEL.system_admin_readonly,
      );
    });

    await test.step('预期1+3+5：保持默认角色再创建一个用户，请求体 role=system_admin', async () => {
      adminRoleUser = 'user_ro_pick02_' + Date.now();
      trackedUsers.push(adminRoleUser);
      await utils.openAddUserDrawer(page);
      await utils.expectAddUserRoleChecked(
        page,
        utils.ROLE_LABEL.system_admin,
      );
      await utils.fillAddUserForm(
        page,
        adminRoleUser,
        utils.getDocPassword(),
        utils.getDocPassword(),
      );
      const [request] = await Promise.all([
        page.waitForRequest(
          (r) => r.method() === 'POST' && /\/auth\/users$/.test(r.url()),
        ),
        utils.submitAddUserForm(page),
      ]);
      const body = request.postDataJSON();
      expect(
        body.role,
        '未改角色时请求体 role 应为默认的 system_admin',
      ).toBe('system_admin');
      expect(body.is_admin, '请求体不应再含 is_admin').toBeUndefined();

      await utils.expectAddUserDrawerClosed(page);
      await utils.ensureUserRowVisible(page, adminRoleUser);
      await utils.expectUserRoleCellText(
        page,
        adminRoleUser,
        utils.ROLE_LABEL.system_admin,
      );
    });

    // 预期4「不选择角色（清空）后直接提交 → 提示角色必填、不发起请求」在 UI 层不可达：
    // 产品「角色」是 iView RadioGroup 单选项，表单初始即选中 `system_admin`，
    // 单选组没有「取消选中/清空」交互（页内「重置」也只是 resetFields 回默认值），
    // 无法构造「角色为空」的提交态。与之等价的必填约束由预期2（FormItem 带 required 规则）
    // 覆盖；如后续产品改为可清空控件，再补该步。
  });
});

test.describe('用户管理 - UM-52 只读视角用户管理页写按钮隐藏', () => {
  test('只读视角隐藏工具栏/行内/Token 操作列写入口、保留详情与掩码展示；管理员写入口可见（对照组）', async ({
    page,
  }) => {
    const viewer = readonly.READONLY_USER.name;
    let adminTokenPlaintext = null;

    await test.step('管理员对照：用户 Tab 工具栏「添加用户」与行内写入口可见', async () => {
      await utils.gotoUserManagementPage(page);
      await utils.switchToUserTab(page);
      await utils.waitForUserTableRows(page);
      await readonly.expectAdminVisible(utils.tabAddButton(page), '添加用户');
      await utils.ensureUserRowVisible(page, viewer);
      await readonly.expectAdminVisible(
        utils.userChangeRoleButton(page, viewer),
        '变更角色',
      );
      await readonly.expectAdminVisible(
        utils.userChangePasswordButton(page, viewer),
        '修改密码',
      );
      await readonly.expectAdminVisible(
        utils.userRowDeleteButton(page, viewer),
        '删除',
      );
    });

    await test.step('管理员对照：Token Tab「创建」/行内「详情+删除」可见，详情 token 为明文', async () => {
      await utils.switchToTokenTab(page);
      await readonly.expectAdminVisible(utils.tabAddButton(page), '创建');
      await utils.expectTokenRowLocated(page, readonlyTokenName);
      await readonly.expectAdminVisible(
        utils.tokenDetailButton(page, readonlyTokenName),
        '详情',
      );
      await readonly.expectAdminVisible(
        utils.tokenDeleteButton(page, readonlyTokenName),
        '删除',
      );

      const adminToken = await utils.fetchTokenViaApi(page, readonlyTokenName);
      adminTokenPlaintext = adminToken.token;
      expect(adminTokenPlaintext, '管理员读 Token 详情应返回明文').toBeTruthy();
      expect(adminTokenPlaintext).not.toContain('*');

      await utils.openTokenDetail(page, readonlyTokenName);
      expect(
        await utils.readTokenDetailTokenValue(page),
        '管理员详情内 token 应为明文',
      ).toBe(adminTokenPlaintext);
      await utils.closeTokenDetail(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await readonly.loginAsReadonly(page);
    });

    await test.step('只读视角进入用户管理页（默认「用户」Tab）', async () => {
      await utils.gotoUserManagementPageReadonly(page);
      await utils.switchToUserTabReadonly(page);
      await utils.waitForUserTableRows(page);
    });

    await test.step('预期1：用户 Tab 工具栏「添加用户」仍在 DOM 但被 v-has 隐藏', async () => {
      await readonly.expectVHasHidden(utils.tabAddButton(page), '添加用户');
    });

    await test.step('预期2：用户列表操作列「变更角色/修改密码/删除」被 v-has 隐藏，列表与角色列仍可读', async () => {
      await utils.ensureUserRowVisible(page, viewer);
      await readonly.expectVHasHidden(
        utils.userChangeRoleButton(page, viewer),
        '变更角色',
      );
      await readonly.expectVHasHidden(
        utils.userChangePasswordButton(page, viewer),
        '修改密码',
      );
      await readonly.expectVHasHidden(
        utils.userRowDeleteButton(page, viewer),
        '删除',
      );
      // 用户列表无「查看/详情」类只读入口（产品未提供），故操作列写按钮全部隐藏后
      // 该行只剩用户名 + 角色文案可读——即「仅保留只读入口」在当前产品下的形态。
      await utils.expectUserRoleCellText(
        page,
        viewer,
        utils.ROLE_LABEL.system_admin_readonly,
      );
    });

    await test.step('预期1：切到 Token Tab，工具栏「创建」被 v-has 隐藏', async () => {
      await utils.switchToTokenTabReadonly(page);
      await readonly.expectVHasHidden(utils.tabAddButton(page), '创建');
    });

    await test.step('预期3：Token 操作列仅保留「详情」，「删除」被 v-has 隐藏', async () => {
      await utils.expectTokenRowLocated(page, readonlyTokenName);
      await readonly.expectReadonlyVisible(
        utils.tokenDetailButton(page, readonlyTokenName),
        '详情',
      );
      await readonly.expectVHasHidden(
        utils.tokenDeleteButton(page, readonlyTokenName),
        '删除',
      );
    });

    await test.step('预期4：Token 详情 token 字段展示后端返回的掩码值（前端原样展示）', async () => {
      const expectedMask = readonly.maskSecret(adminTokenPlaintext);

      const viewerToken = await utils.fetchTokenViaApi(page, readonlyTokenName);
      expect(
        viewerToken.token,
        '只读读 Token 详情应返回掩码值',
      ).toBe(expectedMask);
      expect(viewerToken.token, '掩码值应含 * 且不是明文').not.toBe(
        adminTokenPlaintext,
      );

      await utils.openTokenDetail(page, readonlyTokenName);
      expect(
        await utils.readTokenDetailTokenValue(page),
        '详情内 token 应原样展示后端返回的掩码值',
      ).toBe(expectedMask);
      await utils.closeTokenDetail(page);

      await readonly.expectStillReadonly(page);
    });
  });
});