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
 * AI业务集群 - 向导步骤（RM-BC-03~08、26~32）
 *
 * 5 步向导：基础配置 → 超时和重传 → 被动健康检查 → 大模型配置 → 复查&检查。
 * 不存在「实例配置」步骤（实例池由 Provider 维护），相关用例已移除。
 *
 * 覆盖：
 * - RM-BC-03 向导第1步基础配置（可进入第2步）
 * - RM-BC-04 向导第2步超时和重传字段展示
 * - RM-BC-05 向导第3步被动健康检查字段展示
 * - RM-BC-07 向导第4步大模型基础配置（所属服务商/转发模型等）
 * - RM-BC-08 向导第4步模型重定向（+添加 出现表格）
 * - RM-BC-26 向导第1步必填与联动校验（名称必填 / 会话保持启用时哈希头部必填）
 * - RM-BC-27 向导第2步超时重传数值校验
 * - RM-BC-28 向导第3步健康检查字段校验（可选字段）
 * - RM-BC-31 向导数值字段边界值校验-空闲连接数
 * - RM-BC-32 健康检查 Host 域名格式校验（可选）
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');

const DOC = utils.DOC_BUSINESS_CLUSTER;

test.describe('AI业务集群管理 - RM-BC-03 向导步骤与校验', () => {
  let cleanup;

  test.beforeEach(async ({ page }) => {
    cleanup = utils.createResourceTestCleanup();
    await utils.gotoBusinessClusterManagementPage(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  // RM-BC-03: 向导第1步-基础配置
  test('RM-BC-03 向导第1步基础配置', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.expectWizardStep(page, '基础配置');

    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });

    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');
  });

  // RM-BC-04: 向导第2步-超时和重传
  test('RM-BC-04 向导第2步超时和重传展示', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');

    const drawer = utils.ivuDrawer(page).active();
    const body = drawer.locator('.ivu-drawer-body');

    // 验证超时字段存在
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '客户端连接空闲超时' }),
    ).toBeVisible();
    await expect(
      body
        .locator('.ivu-form-item')
        .filter({ hasText: '读客户端请求Body超时' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '连接后端超时' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '读后端响应头部超时' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '写响应超时' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '集群内重试次数' }),
    ).toBeVisible();
  });

  // RM-BC-05: 向导第3步-被动健康检查
  test('RM-BC-05 向导第3步被动健康检查展示', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '被动健康检查');

    const drawer = utils.ivuDrawer(page).active();
    const body = drawer.locator('.ivu-drawer-body');

    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '故障阈值' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '健康检查间隔' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '健康检查Host' }),
    ).toBeVisible();
    await expect(
      body.locator('.ivu-form-item').filter({ hasText: '健康检查Uri' }),
    ).toBeVisible();
    await expect(
      body
        .locator('.ivu-form-item')
        .filter({ hasText: '健康检查期望的状态码' }),
    ).toBeVisible();
  });

  // RM-BC-07: 向导第4步-大模型基础配置（5 步向导第 4 步，无「实例配置」）
  test('RM-BC-07 向导第4步大模型基础配置', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page); // 1 -> 2
    await utils.clickWizardNext(page); // 2 -> 3
    await utils.clickWizardNext(page); // 3 -> 4
    await utils.expectWizardStep(page, '大模型配置');

    const body = utils
      .ivuDrawer(page)
      .withTitle(utils.DRAWER_TITLE.createBusinessCluster)
      .locator('.ivu-drawer-body');

    // 所属服务商：必填下拉（el-select）。不能 .filter().first()——
    // 第 3 步「健康检查Host」提示含「所属服务商」会先命中隐藏 FormItem。
    await expect(
      body
        .locator('.ivu-form-item, .el-form-item')
        .filter({ hasText: DOC.providerLabel })
        .locator('.el-select')
        .first(),
    ).toBeVisible();
    // 转发模型：多选（el-select multiple filterable）
    await expect(
      body
        .locator('.ivu-form-item, .el-form-item')
        .filter({ hasText: DOC.forwardModelsLabel })
        .locator('.el-select')
        .first(),
    ).toBeVisible();
  });

  // RM-BC-08: 向导第4步-模型重定向
  test('RM-BC-08 向导第4步模型重定向', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page); // 1 -> 2
    await utils.clickWizardNext(page); // 2 -> 3
    await utils.clickWizardNext(page); // 3 -> 4
    await utils.expectWizardStep(page, '大模型配置');

    const drawer = utils.ivuDrawer(page).active();
    const body = drawer.locator('.ivu-drawer-body');

    // 点击 + 添加按钮添加重定向行
    const addBtn = body.getByRole('button', { name: '+添加', exact: true });
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await utils.waitAfterResourceMutation(page, 500);

    // 验证重定向表格出现（使用列标题定位）
    const redirectTable = body
      .locator('table')
      .filter({ hasText: '原请求的模型名称' });
    await expect(redirectTable).toBeVisible();
  });

  // RM-BC-26: 向导第1步必填与联动校验
  test('RM-BC-26 向导第1步必填与联动校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);

    // 场景 1：集群名称留空 → 拦截（停留在第 1 步）
    await utils.fillBasicStep(page, {
      protocol: 'https',
    });
    await utils.clickWizardNext(page);
    await expect(
      utils.ivuDrawer(page).active().locator('.ivu-form-item-error-tip'),
    ).toHaveCount(1, { timeout: 5000 });

    // 场景 2：会话保持启用 + CLIENT_ID_ONLY 且哈希头部留空 → 拦截
    await utils.fillBasicStep(page, {
      clusterName,
      stickySessionsEnabled: '启用',
      hashStrategy: 'CLIENT_ID_ONLY',
      hashHeader: '',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '基础配置');
    await utils.expectWizardFormFieldError(
      page,
      '哈希头部',
      DOC.hashHeaderRequiredMsg,
    );

    // 场景 3：会话保持启用 + CLIENT_ID_PREFERED 且哈希头部留空 → 拦截
    await utils.fillBasicStep(page, {
      hashStrategy: 'CLIENT_ID_PREFERED',
      hashHeader: '',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '基础配置');
    await utils.expectWizardFormFieldError(
      page,
      '哈希头部',
      DOC.hashHeaderRequiredMsg,
    );

    // 场景 4：会话保持启用 + CLIENT_IP_ONLY（不要求哈希头部）→ 可通过
    await utils.fillBasicStep(page, {
      hashStrategy: 'CLIENT_IP_ONLY',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');
  });

  // RM-BC-27: 向导第2步超时重传数值校验
  test('RM-BC-27 向导第2步超时重传数值校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');

    const drawer = utils.ivuDrawer(page).active();
    const form = utils
      .ivuDrawer(page)
      .form(utils.DRAWER_TITLE.createBusinessCluster);

    // 场景 1：清空全部超时字段和重试字段后应可通过（字段可选）
    await utils.fillTimeoutStep(page, {
      clientIdleTimeout: '',
      readBodyTimeout: '',
      connectBackendTimeout: '',
      readBackendHeaderTimeout: '',
      writeResponseTimeout: '',
      sameSubClusterRetry: '',
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '被动健康检查');

    // 返回第 2 步继续验证非法值
    await utils.clickWizardPrev(page);
    await utils.expectWizardStep(page, '超时和重传');

    // 场景 2：超时字段填入 <=0 或非整数应被拦截
    for (const invalidValue of ['0', '-1', '1.5']) {
      await form.fillInput('连接后端超时(ms)', invalidValue);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '超时和重传');
      await expect(drawer.locator('.ivu-form-item-error-tip')).toHaveCount(1, {
        timeout: 5000,
      });
    }

    // 恢复合法值后可通过
    await form.fillInput('连接后端超时(ms)', '2000');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '被动健康检查');

    // 返回第 2 步验证重试字段
    await utils.clickWizardPrev(page);
    await utils.expectWizardStep(page, '超时和重传');

    // 场景 3：集群内重试次数填入 <0 或非整数应被拦截
    for (const invalidValue of ['-1', '1.5']) {
      await form.fillInput('集群内重试次数', invalidValue);
      await utils.clickWizardNext(page);
      await utils.expectWizardStep(page, '超时和重传');
      await expect(drawer.locator('.ivu-form-item-error-tip')).toHaveCount(1, {
        timeout: 5000,
      });
    }

    // 恢复合法值后可通过
    await form.fillInput('集群内重试次数', '0');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '被动健康检查');
  });

  // RM-BC-28: 向导第3步健康检查字段校验（健康检查字段为可选）
  test('RM-BC-28 向导第3步健康检查字段校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '被动健康检查');

    // 健康检查字段为可选，可直接跳过 → 第 4 步大模型配置
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');

    // 返回填写正确格式后继续
    await utils.clickWizardPrev(page);
    const form = utils
      .ivuDrawer(page)
      .form(utils.DRAWER_TITLE.createBusinessCluster);
    await form.fillInput('健康检查Uri', '/interface');
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
  });

  // RM-BC-31: 向导数值字段边界值校验
  test('RM-BC-31 向导数值字段边界值校验-空闲连接数', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);

    // 空闲连接数填-1
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
      idleConnections: -1,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '基础配置');

    // 空闲连接数填100000000（超过99999999）
    await utils.fillBasicStep(page, {
      idleConnections: 100000000,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '基础配置');

    // 空闲连接数填0（下界）
    await utils.fillBasicStep(page, {
      idleConnections: 0,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '超时和重传');
  });

  // RM-BC-32: 健康检查Host域名格式校验（健康检查字段为可选）
  test('RM-BC-32 健康检查Host域名格式校验', async ({ page }) => {
    const clusterName = utils.generateTestBusinessClusterName();
    cleanup.trackBusinessCluster(clusterName);

    await utils.openCreateBusinessClusterDrawer(page);
    await utils.fillBasicStep(page, {
      clusterName,
      protocol: 'https',
      hashStrategy: 'CLIENT_ID_ONLY',
    });
    await utils.clickWizardNext(page);
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '被动健康检查');

    // 健康检查字段为可选，可直接跳过（Host 可不填）→ 第 4 步大模型配置
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');

    // 返回填写正确格式后继续
    await utils.clickWizardPrev(page);
    await utils.fillHealthStep(page, {
      failureThreshold: 10,
      healthInterval: 1000,
      healthHost: 'www.test.com',
      healthUri: '/interface',
      expectedStatus: 200,
    });
    await utils.clickWizardNext(page);
    await utils.expectWizardStep(page, '大模型配置');
  });
});
