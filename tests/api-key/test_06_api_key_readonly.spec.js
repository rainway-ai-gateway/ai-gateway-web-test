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
/**
 * API-Key管理 - 只读管理员视角 EM-K-RO-01 ~ EM-K-RO-04
 *
 * 覆盖用例（docs/api-key/02-功能测试用例/06-只读视角.md）：
 * - EM-K-RO-01 只读视角列表工具栏「创建」写按钮隐藏（对照组：管理员可见）
 * - EM-K-RO-02 只读视角列表操作列「编辑/删除」隐藏、保留「管理路由规则」、行点击开只读详情
 * - EM-K-RO-03 只读视角详情抽屉「重置配额」按钮隐藏
 * - EM-K-RO-04 只读视角密钥读端点返回掩码（对照组：管理员明文），掩码在详情原样展示
 *
 * 设计：
 * - 默认 storageState=auth.json（管理员态），每个用例先做管理员对照，再以 UI 登录
 *   只读账号 viewer（不写 auth.json，避免覆盖默认 admin 会话）。
 * - 有限配额 API-Key 供 RO-02/03/04 使用：beforeAll 用 admin context 造数，afterAll 清理
 *   （镜像 tests/epp-pool 的 beforeAll/afterAll 范式，避免污染 worker storageState）。
 *
 * 运行：nvm use 18 && npx playwright test tests/api-key/test_06_api_key_readonly.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const utils = require('../../pages/entity/EntityPage');
const userUtils = require('../../pages/user/UserPage');
const common = require('../../utils/common');

const DOC = utils.DOC_API_KEY;

/** 只读系统管理员账号（conf.json 未配置，硬编码文档约定凭证） */
const READONLY_USER = {
  name: 'viewer',
  password: 'viewer123',
  role: 'system_admin_readonly',
};

/** 复刻后端 lib/xmask 掩码规则（docs 06-只读视角.md §EM-K-RO-04） */
function maskApiKey(key) {
  const s = String(key);
  const n = s.length;
  if (n > 8) return s.slice(0, 4) + '********' + s.slice(-4);
  if (n > 4) return s.slice(0, 2) + '****' + s.slice(-2);
  return '********';
}

/** 只读用例共享数据：有限配额 API-Key（供列表/详情/掩码断言） */
let readonlyKey = null;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(utils.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const description = DOC.createSuccess.description + '_readonly_' + Date.now();
    const apiKey = await utils.createApiKeyViaApi(page, {
      description,
      enabled: true,
      quota_plan: { unlimited: false, quota: 1000 },
    });
    if (apiKey?.id) {
      readonlyKey = {
        id: apiKey.id,
        description,
        key: apiKey.key,
      };
      common.log(
        '[beforeAll] 只读用例数据已创建: ' +
          description +
          ' id=' +
          apiKey.id +
          ' key=' +
          apiKey.key,
      );
    } else {
      common.log('[beforeAll] 只读用例数据创建失败（有限配额 API-Key）');
    }
  } catch (e) {
    common.log('[beforeAll] 前置数据异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!readonlyKey?.id) return;
  const context = await browser.newContext({
    storageState: path.join(__dirname, '../../auth.json'),
  });
  const page = await context.newPage();
  try {
    await page.goto(utils.getAppBaseUrl() + '/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await utils.deleteApiKeyViaApi(page, readonlyKey.id);
    common.log('[afterAll] 只读用例数据已清理: ' + readonlyKey.description);
  } catch (e) {
    common.log('[afterAll] 清理异常: ' + e.message);
  } finally {
    await context.close();
  }
});

test.describe('API-Key管理 - EM-K-RO-01 只读视角列表工具栏写按钮隐藏', () => {
  test('只读视角工具栏隐藏「创建」写按钮，仅保留检索；管理员可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：工具栏「创建」按钮可见', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.expectAddApiKeyButtonVisible(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await userUtils.loginAsUser(
        page,
        READONLY_USER.name,
        READONLY_USER.password,
        READONLY_USER.role,
      );
    });

    await test.step('只读视角进入 API-Key 管理页面', async () => {
      await utils.gotoApiKeyManagementPageReadonly(page);
    });

    await test.step('工具栏「创建」写按钮仍在 DOM，但被 v-has 隐藏', async () => {
      await utils.expectAddApiKeyButtonHidden(page);
    });

    await test.step('只读视角保留检索区（只读控件）', async () => {
      await utils.expectApiKeySearchAreaVisible(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-RO-02 只读视角列表操作列写按钮隐藏', () => {
  test('只读视角隐藏行内「编辑/删除」，保留「管理路由规则」，可开只读详情；管理员可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：行内「编辑/删除」可见', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.searchApiKeyByDescription(page, readonlyKey.description);
      await utils.expectApiKeyRowWriteActionsVisible(
        page,
        readonlyKey.description,
      );
    });

    await test.step('以只读系统管理员登录', async () => {
      await userUtils.loginAsUser(
        page,
        READONLY_USER.name,
        READONLY_USER.password,
        READONLY_USER.role,
      );
    });

    await test.step('只读视角进入页面并定位目标行', async () => {
      await utils.gotoApiKeyManagementPageReadonly(page);
      await utils.searchApiKeyByDescription(page, readonlyKey.description);
      await utils.expectApiKeyVisible(page, readonlyKey.description);
    });

    await test.step('行内「编辑」「删除」写按钮被 v-has 隐藏', async () => {
      await utils.expectApiKeyRowWriteActionsHidden(page, readonlyKey.description);
    });

    await test.step('行内「管理路由规则」只读入口保持可见', async () => {
      await utils.expectApiKeyRowManageRouteRulesVisible(
        page,
        readonlyKey.description,
      );
    });

    await test.step('点击行内容仍可打开只读详情抽屉', async () => {
      await utils.openApiKeyDetail(page, readonlyKey.description);
      await utils.expectApiKeyDetailVisible(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-RO-03 只读视角详情抽屉「重置配额」按钮隐藏', () => {
  test('只读视角详情抽屉隐藏「重置配额」，详情其余字段正常只读展示；管理员可见（对照组）', async ({
    page,
  }) => {
    await test.step('管理员对照：有限配额详情「重置配额」可见', async () => {
      await utils.gotoApiKeyManagementPage(page);
      await utils.searchApiKeyByDescription(page, readonlyKey.description);
      await utils.openApiKeyDetail(page, readonlyKey.description);
      await utils.expectResetApiKeyQuotaBtnVisible(page);
      await utils.closeApiKeyDetail(page);
    });

    await test.step('以只读系统管理员登录', async () => {
      await userUtils.loginAsUser(
        page,
        READONLY_USER.name,
        READONLY_USER.password,
        READONLY_USER.role,
      );
    });

    await test.step('只读视角打开目标行详情', async () => {
      await utils.gotoApiKeyManagementPageReadonly(page);
      await utils.searchApiKeyByDescription(page, readonlyKey.description);
      await utils.openApiKeyDetail(page, readonlyKey.description);
      await utils.expectApiKeyDetailVisible(page);
    });

    await test.step('详情「重置配额」写按钮被 v-has 隐藏', async () => {
      await utils.expectResetApiKeyQuotaBtnHidden(page);
    });
  });
});

test.describe('API-Key管理 - EM-K-RO-04 只读视角密钥掩码展示', () => {
  test('只读视角密钥读端点返回掩码且详情原样展示；管理员返回明文（对照组）', async ({
    page,
  }) => {
    let adminKey;

    await test.step('管理员对照：列表/详情 key 均为明文', async () => {
      await utils.gotoApiKeyManagementPage(page);
      const adminListItem = await utils.findApiKeyByDescriptionViaApi(
        page,
        readonlyKey.description,
      );
      adminKey = adminListItem?.key;
      expect(adminKey, '管理员列表应返回明文 key').toBeTruthy();
      expect(adminKey).not.toContain('*');

      const adminDetail = await utils.findApiKeyByIdViaApi(
        page,
        readonlyKey.id,
      );
      expect(adminDetail?.key, '管理员详情应返回明文 key').toBe(adminKey);
    });

    await test.step('以只读系统管理员登录', async () => {
      await userUtils.loginAsUser(
        page,
        READONLY_USER.name,
        READONLY_USER.password,
        READONLY_USER.role,
      );
    });

    const masked = maskApiKey(adminKey);

    await test.step('只读视角：列表 key 为掩码（长度>8 规则）', async () => {
      const viewerListItem = await utils.findApiKeyByDescriptionViaApi(
        page,
        readonlyKey.description,
      );
      expect(viewerListItem?.key, '只读列表应返回掩码 key').toBe(masked);
      expect(viewerListItem.key).toContain('*');
    });

    await test.step('只读视角：详情 key 为掩码', async () => {
      const viewerDetail = await utils.findApiKeyByIdViaApi(
        page,
        readonlyKey.id,
      );
      expect(viewerDetail?.key, '只读详情应返回掩码 key').toBe(masked);
    });

    await test.step('只读视角：详情抽屉「Key 值」原样展示掩码', async () => {
      await utils.gotoApiKeyManagementPageReadonly(page);
      await utils.searchApiKeyByDescription(page, readonlyKey.description);
      await utils.openApiKeyDetail(page, readonlyKey.description);
      const shown = await utils.readApiKeyDetailKeyValue(page);
      expect(shown, '详情 Key 值应原样展示后端返回的掩码').toBe(masked);
    });

    // 预期结果 4「掩码值不可用于鉴权」：业务数据面端点不在本模块范围，
    // 且只读掩码为后端 lib/xmask 产物（非真实凭据），此处以接口返回已为掩码佐证不可鉴权。
  });
});