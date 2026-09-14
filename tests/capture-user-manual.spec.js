/*
 * 用户手册截图脚本：自动登录控制台并截取各章节所需的基础 UI 截图。
 * 场景实战（07 章）带数据的截图由 recapture-scenario-flow.spec.js 生成。
 * 运行：npx playwright test docs/user-manual/scripts/capture-screenshots.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

function resolveWebTestRoot() {
  const fromTests = path.join(__dirname, '..');
  if (fs.existsSync(path.join(fromTests, 'pages/user/UserPage.js'))) {
    return fromTests;
  }
  const fromManual = path.join(__dirname, '../../ai-gateway-web-test');
  if (fs.existsSync(path.join(fromManual, 'pages/user/UserPage.js'))) {
    return fromManual;
  }
  throw new Error('无法定位 ai-gateway-web-test 目录');
}

const WEB_TEST_ROOT = resolveWebTestRoot();
const userUtils = require(path.join(WEB_TEST_ROOT, 'pages/user/UserPage'));
const entityUtils = require(path.join(WEB_TEST_ROOT, 'pages/entity/EntityPage'));
const routeUtils = require(path.join(WEB_TEST_ROOT, 'pages/route/RoutePage'));
const clusterUtils = require(path.join(WEB_TEST_ROOT, 'pages/resource/BusinessClusterPage'));
const certUtils = require(path.join(WEB_TEST_ROOT, 'pages/cert/CertPage'));
const oplogUtils = require(path.join(WEB_TEST_ROOT, 'pages/operation-logs/OperationLogPage'));
const entityApi = require(path.join(WEB_TEST_ROOT, 'api/entity-api-utils'));

const IMG_DIR = fs.existsSync(path.join(__dirname, '..', 'images'))
  ? path.join(__dirname, '..', 'images')
  : path.join(__dirname, '../../ai-gateway-user-manual/images');
fs.mkdirSync(IMG_DIR, { recursive: true });

const BASE = 'http://localhost:8088';

const captured = [];
const skipped = [];

async function shot(page, name) {
  await page.screenshot({ path: path.join(IMG_DIR, name) });
  captured.push(name);
  console.log('[shot] ' + name);
}

async function tryStep(name, fn) {
  try {
    await fn();
  } catch (e) {
    const msg = String(e.message).split('\n')[0];
    skipped.push(name + ' :: ' + msg);
    console.log('[skip] ' + name + ' :: ' + msg);
  }
}

function drawer(page) {
  return page.locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)').last();
}

function modal(page) {
  return page.locator('.ivu-modal-wrap:not(.ivu-modal-hidden)').last();
}

async function closeOverlays(page) {
  for (let i = 0; i < 2; i++) {
    const cancel = page
      .locator(
        '.ivu-drawer-wrap:not(.ivu-drawer-hidden) button, .ivu-modal-wrap:not(.ivu-modal-hidden) button',
      )
      .filter({ hasText: /取消|关闭/ });
    if ((await cancel.count()) > 0) {
      await cancel
        .last()
        .click()
        .catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

async function sidebarNav(page, text) {
  const menu = page.locator('.bfe-sidebar .Menu');
  const item = menu.locator('.ivu-menu-item', { hasText: text });
  const sub = menu.locator('.ivu-menu-submenu-title', { hasText: text });
  if ((await item.count()) > 0) {
    await item.first().click();
  } else if ((await sub.count()) > 0) {
    await sub.first().click();
  } else {
    throw new Error('未找到侧栏菜单: ' + text);
  }
  console.log('通过侧栏导航：' + text);
  await page.waitForTimeout(1500);
}

async function ensureOrgData(page) {
  console.log('Entity 组织列表为空，自动创建默认组织...');
  const data = { name: 'qa-auto-op', type: 'qa-auto-dep' };
  console.log('接口创建 Entity 请求数据: ' + JSON.stringify(data));
  const resp = await entityApi.createEntityViaApi(page, data.name, data.type);
  console.log('接口创建 Entity 响应: ' + JSON.stringify(resp));
}

test('01 登录与用户管理截图', async ({ page }) => {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  // 清空会话以展示登录页；保留中文语言设置，避免占位符变英文
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'zh');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await shot(page, '01-login-page.png');

  await tryStep('登录错误提示', async () => {
    await page.getByPlaceholder('请输入用户名').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('wrong-password');
    const captcha = page.locator("input[name='captcha']");
    if (await captcha.isVisible().catch(() => false)) {
      await captcha.fill('1234');
    }
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForTimeout(1500);
    await shot(page, '01-login-error.png');
  });

  await userUtils.ensureLoggedIn(page);

  await tryStep('用户列表', async () => {
    await userUtils.gotoUserManagementPage(page);
    await page.waitForTimeout(800);
    await shot(page, '01-user-list.png');
  });
  await tryStep('创建用户', async () => {
    await page.getByRole('button', { name: /添加用户/ }).click();
    await page.waitForTimeout(600);
    await shot(page, '01-user-create.png');
  });
  await tryStep('用户表单校验', async () => {
    await modal(page)
      .getByRole('button', { name: /确认|确定/ })
      .click();
    await page.waitForTimeout(600);
    await shot(page, '01-user-validation.png');
  });
  await closeOverlays(page);

  await tryStep('Token列表', async () => {
    await userUtils.gotoTokenManagementPage(page);
    await page.waitForTimeout(800);
    await shot(page, '01-token-list.png');
  });
  await tryStep('创建Token', async () => {
    await page.getByRole('button', { name: /创建Token|创建 Token/ }).click();
    await page.waitForTimeout(600);
    await shot(page, '01-token-create.png');
  });
  await closeOverlays(page);
});

test('03 实例池与业务集群截图', async ({ page }) => {
  await userUtils.ensureLoggedIn(page);

  await tryStep('实例池列表', async () => {
    const url = BASE + '/instance-pool-ai';
    console.log('使用直连 URL 进入 AI 网关实例池页面: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shot(page, '03-pool-list.png');
  });
  await tryStep('实例池编辑与新增', async () => {
    await page.getByRole('button', { name: '编辑' }).first().click();
    await page.waitForTimeout(600);
    await shot(page, '03-pool-edit-mode.png');
    await page
      .getByRole('button', { name: /新增|添加/ })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, '03-pool-create.png');
    await page
      .getByRole('button', { name: /取消/ })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(500);
  });

  await tryStep('业务集群列表', async () => {
    await sidebarNav(page, 'AI业务集群');
    await shot(page, '04-cluster-list.png');
  });

  await tryStep('集群创建向导', async () => {
    await clusterUtils.openCreateBusinessClusterDrawer(page);
    await page.waitForTimeout(600);
    await shot(page, '04-cluster-wizard-base.png');

    // 会话保持 + 哈希策略（进阶 B 截图）；集群名必填，否则下一步被校验拦截
    await clusterUtils.fillBasicStep(page, {
      clusterName: 'demo-cluster',
      stickySessionsEnabled: '启用',
      hashStrategy: 'CLIENT_ID_PREFERED',
      hashHeader: 'x-client-id',
    });
    const body = drawer(page).locator('.ivu-drawer-body');
    await body
      .locator('.ivu-form-item')
      .filter({ hasText: '哈希策略' })
      .locator('.ivu-select-selection')
      .click();
    await page.waitForTimeout(400);
    await shot(page, '04-cluster-hash-options.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await shot(page, '04-cluster-hash-header.png');
    // 恢复为停用，避免校验拦截
    await clusterUtils.fillBasicStep(page, { stickySessionsEnabled: '停用' });
    await page.waitForTimeout(300);

    await clusterUtils.clickWizardNext(page);
    await page.waitForTimeout(600);
    await shot(page, '04-cluster-wizard-timeout.png');

    await clusterUtils.clickWizardNext(page);
    await page.waitForTimeout(600);
    await shot(page, '04-cluster-wizard-health.png');

    await clusterUtils.clickWizardNext(page);
    await page.waitForTimeout(600);
    await clusterUtils.fillInstanceConfigStep(page, {
      mode: 'ip',
      instances: [{ addr: '172.19.1.187', port: 13801, weight: 100 }],
    });
    await shot(page, '04-cluster-wizard-instance.png');

    await clusterUtils.clickWizardNext(page);
    await page.waitForTimeout(600);
  });

  await tryStep('集群向导-大模型配置', async () => {
    const body = drawer(page).locator('.ivu-drawer-body');
    const providerSelect = body
      .locator('.ivu-form-item')
      .filter({ hasText: '模型服务商' })
      .locator('.ivu-select-selection');
    await expect(providerSelect).not.toHaveValue('');
    await shot(page, '04-cluster-wizard-model.png');
  });

  await tryStep('集群向导-复查汇总', async () => {
    await clusterUtils.clickWizardNext(page);
    await page.waitForTimeout(600);
    await shot(page, '04-cluster-wizard-review.png');
  });
  await closeOverlays(page);
});

test('05 Entity 管理截图', async ({ page }) => {
  await userUtils.ensureLoggedIn(page);

  await tryStep('Entity类型列表', async () => {
    await entityUtils.gotoEntityTypeManagementPage(page);
    await shot(page, '05-type-list.png');
  });
  await tryStep('创建类型抽屉', async () => {
    await page.getByRole('button', { name: '创建类型' }).click();
    await page.waitForTimeout(600);
    await shot(page, '05-type-create.png');
  });
  await tryStep('类型表单校验', async () => {
    await drawer(page).getByRole('button', { name: '确认' }).click();
    await page.waitForTimeout(600);
    await shot(page, '05-type-validation.png');
  });
  await closeOverlays(page);

  await tryStep('Entity组织列表', async () => {
    await page.goto(BASE + '/Entity', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page
      .locator('.ivu-tabs-tab')
      .filter({ hasText: 'Entity组织管理' })
      .click();
    await page.waitForTimeout(1000);
    await shot(page, '05-org-list.png');
  });
  await tryStep('创建组织抽屉', async () => {
    await page.getByRole('button', { name: '创建Entity' }).click();
    await page.waitForTimeout(600);
    await shot(page, '05-org-create.png');
  });
  await closeOverlays(page);

  await tryStep('API-Key列表', async () => {
    const url = BASE + '/api-key';
    console.log('使用直连 URL 进入 API-Key 管理页面: ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shot(page, '05-apikey-list.png');
  });
  await tryStep('创建 API-Key 抽屉', async () => {
    await page.getByRole('button', { name: '创建' }).first().click();
    await page.waitForTimeout(600);
    await shot(page, '05-apikey-create.png');
  });
  await closeOverlays(page);
});

test('06 路由管理截图', async ({ page }) => {
  await userUtils.ensureLoggedIn(page);

  await tryStep('路由表列表', async () => {
    await routeUtils.gotoRouteTableListPage(page);
    await shot(page, '06-table-list.png');
  });
  await tryStep('全局路由规则列表', async () => {
    await routeUtils.openGlobalRouteTableDetail(page);
    await page.waitForTimeout(800);
    await shot(page, '06-rules-list.png');
  });
  await tryStep('进入编辑模式', async () => {
    await page.getByRole('button', { name: '进入编辑模式' }).click();
    await page.waitForTimeout(600);
    await shot(page, '06-rule-edit-mode.png');
  });
  await tryStep('添加规则表单', async () => {
    await page.getByRole('button', { name: '添加规则' }).click();
    await page.waitForTimeout(700);
    await shot(page, '06-rule-form.png');
  });
  await tryStep('规则目标与权重', async () => {
    const d = drawer(page);
    await d
      .getByRole('button', { name: /添加目标/ })
      .first()
      .click();
    await page.waitForTimeout(500);
    await shot(page, '06-rule-targets.png');
  });
  await closeOverlays(page);
  await tryStep('退出编辑模式', async () => {
    await page
      .getByRole('button', { name: '退出编辑模式' })
      .click({ timeout: 5000 });
    await page.waitForTimeout(500);
  });
});

test('09 证书管理截图', async ({ page }) => {
  await userUtils.ensureLoggedIn(page);

  await tryStep('证书列表', async () => {
    await certUtils.gotoCertPage(page);
    await page.waitForTimeout(800);
    await shot(page, '07-cert-list.png');
  });
  await tryStep('添加证书抽屉', async () => {
    await certUtils.openAddCertDrawer(page);
    await page.waitForTimeout(600);
    await shot(page, '07-cert-create.png');
  });
  await tryStep('证书表单校验', async () => {
    await drawer(page).getByRole('button', { name: '提交' }).click();
    await page.waitForTimeout(600);
    await shot(page, '07-cert-validation.png');
    await certUtils.closeCertDrawer(page).catch(() => closeOverlays(page));
  });
  await closeOverlays(page);

  await closeOverlays(page);

  await tryStep('切换默认证书确认', async () => {
    await certUtils.gotoCertPage(page);
    await closeOverlays(page);
    const certs = await certUtils.getCertList(page);
    const target = (certs || []).find((c) => !c.is_default);
    if (!target) {
      throw new Error('没有可切换的非默认证书');
    }
    await page.locator('.show-cert-isdefult .ivu-select-selection').click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .filter({ hasText: target.cert_name })
      .first()
      .click();
    await expect(page.locator('.ivu-modal-wrap')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(page, '07-cert-switch-default.png');
    await page.keyboard.press('Escape');
  });

  await tryStep('删除确认弹窗', async () => {
    await certUtils.gotoCertPage(page);
    await closeOverlays(page);
    const certs = await certUtils.getCertList(page);
    const target = (certs || []).find((c) => !c.is_default);
    if (!target) {
      throw new Error('没有可删除的非默认证书');
    }
    await certUtils.searchCertByName(page, target.cert_name);
    await page.waitForTimeout(500);
    await certUtils.certTable(page).rowAction(target.cert_name, '删除').click();
    await expect(page.locator('.ivu-modal-wrap')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(page, '07-cert-delete.png');
    await certUtils.cancelDeleteCert(page).catch(() => {});
  });
  await closeOverlays(page);
});

test('10 操作日志截图', async ({ page }) => {
  await userUtils.ensureLoggedIn(page);

  await tryStep('操作日志列表', async () => {
    await oplogUtils.gotoOperationLogPage(page);
    await page.waitForTimeout(800);
    await shot(page, '08-oplog-list.png');
  });
  await tryStep('日志详情', async () => {
    let table = oplogUtils.operationLogTable(page);
    await table.waitForLoaded();
    if ((await table.dataRows().count()) === 0) {
      await entityApi.createEntityViaApi(page, 'manual-oplog-org', 'qa-auto-dep').catch(
        () => {},
      );
      await oplogUtils.gotoOperationLogPage(page);
      table = oplogUtils.operationLogTable(page);
      await table.waitForLoaded();
    }
    const rowCount = await table.dataRows().count();
    if (rowCount === 0) {
      throw new Error('操作日志列表为空');
    }
    await table.dataRows().first().getByRole('button', { name: '详情' }).click();
    await page.waitForTimeout(800);
    await shot(page, '08-oplog-detail.png');
    const drawer = oplogUtils.detailDrawer(page);
    if (await drawer.locator('.change-summary').count()) {
      await shot(page, '08-oplog-change-summary.png');
    }
  });
  await closeOverlays(page);
});

test('99 截图汇总', async ({}) => {
  console.log('==== 截图完成 ====');
  console.log('已截取 ' + captured.length + ' 张: ' + captured.join(', '));
  if (skipped.length) {
    console.log('跳过 ' + skipped.length + ' 项: ' + skipped.join(', '));
  }
});
