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
const { expect, test } = require('@playwright/test');
const moment = require('moment');
const common = require('../../utils/common');
const umUtils = require('../user/UserPage');
const apiUtils = require('../../api/resource-api-utils');
const {
  AppSidebarComponent,
  PageTableComponent,
} = require('../../components/layout');
const { IvuDrawerComponent } = require('../../components/iview');
const fs = require('fs');
const path = require('path');

const PRODUCT_PREFIX = apiUtils.DEFAULT_PRODUCT_NAME;
const GATEWAY_POOL_PREFIX = 'BFE';

const DRAWER_TITLE = {
  createInstancePool: '添加实例池',
  editInstancePool: '编辑实例池',
  businessPoolDetail: '详情',
  createBusinessCluster: '添加集群',
  editBusinessCluster: '编辑集群',
  businessClusterDetail: '详情',
};

const INSTANCE_POOL_SEARCH_PLACEHOLDER = '请输入实例池名称查询';
const BUSINESS_CLUSTER_SEARCH_PLACEHOLDER = '请输入名称查询';

const DOC_GATEWAY_POOL = {
  defaultInstance: { hostname: 'node1', ip: '127.0.0.1', port: 80 },
};

const DOC_BUSINESS_POOL = {
  defaultInstance: { hostname: 'srv1', ip: '127.0.0.1', port: 80 },
};

const DOC_BUSINESS_CLUSTER = {
  createSuccessToast: '集群添加成功',
  clusterNameRequiredMsg: '请输入集群名称',
  deleteConfirmText: '是否删除',
  subClusterMountRequiredMsg: '请至少挂载一个子集群',
  scheduleTotalMustBe100Msg: 'AI网关集群下的子集群比重总和必须为100',
  serviceNameRequiredMsg: '请输入服务名称',
  serviceNameLengthMsg: '长度必须在 20 到 200 之间',
  healthHostRequiredMsg: '请输入健康检查Host',
  healthUriRequiredMsg: '请输入健康检查Uri',
  healthUriFormatMsg: '请求uri必须以 / 开头',
  healthHostFormatMsg: '格式错误',
  hashHeaderRequiredMsg: '哈希头部不能为空',
  timeoutRequiredMsg: '输入不能为空',
  // 2026-08-27 集群描述长度校验（i18n cluster.descriptionLengthError）
  descriptionLengthErrorMsg: '集群描述不能超过256个字符',
  // 2026-08-27 大模型配置新文案（对齐 i18n gatewayConfig.*）
  matchPrefixRequiredMsg: '开启裁剪前缀时，匹配前缀必填',
  matchPrefixMustEndWithSlashMsg: '匹配前缀必须以 / 结尾',
  providerLabel: '所属服务商',
  ownedProviderRequiredMsg: '请选择所属服务商',
  forwardModelsLabel: '转发模型',
  modelsRequiredMsg: '请选择模型',
  modelNotInProviderMsg: (model) => `模型 ${model} 不在所属服务商的模型列表中`,
  matchPrefixLabel: '匹配前缀',
  stripPrefixLabel: '裁剪前缀',
  providerKeyPlaceholder: '请选择服务商 Key',
  keyNameRequiredMsg: 'Key 名称必填',
  keyNameDuplicateMsg: 'Key 名称不能重复',
  keyWeightRangeMsg: '权重范围 0-100',
  keysWeightSumMsg: '所有 Key 的权重之和必须等于 100',
  keyNotInProviderMsg: (name) => `Key ${name} 不在所属服务商的 Keys 中`,
  keyPolicyStrategyInvalidMsg: '选择策略仅支持 weighted_random',
  keyPolicyMaxRetriesInvalidMsg: '最大重试次数必须大于或等于 0',
  keyPolicyBackoffInvalidMsg: '退避时间必须大于或等于 0',
  keyPolicyBackoffMaxInvalidMsg: '最大退避时间必须大于或等于初始退避时间',
  duplicateModelNameMsg: '原请求的模型名称不能重复',
  modelMappingKeyRequiredMsg: (line) =>
    `第 ${line} 行的"原请求模型名称"不能为空`,
  modelMappingValueRequiredMsg: (line) =>
    `第 ${line} 行的"转发的后端模型名称"不能为空`,
  modelServiceConfigCard: '模型服务配置',
  modelRedirectCard: '模型重定向',
  serviceAuthKeysCard: '服务鉴权 Keys',
  keyPolicyCard: 'Key 路由策略',
  // 2026-08-26 Key 亲和性（RM-BC-87~91）
  keyAffinityCard: 'Key 亲和性',
  keyAffinityEnabledLabel: '是否启用',
  keyAffinityEnabledOn: '启用',
  keyAffinityEnabledOff: '停用',
  keyAffinityTtlLabel: '空闲超时(秒)',
  keyAffinityPenaltyLabel: 'Key 惩罚',
  keyAffinityRedisPrefixLabel: 'Redis Key 前缀',
  keyAffinityTtlInvalidMsg: '须为大于 0 的整数',
  keyAffinityRedisPrefixRequiredMsg: 'Redis Key 前缀不能为空',
  defaultRedisPrefix: 'bfe:ai:key_affinity',
};

const BUSINESS_CLUSTER_STEPS = [
  '基础配置',
  '超时和重传',
  '被动健康检查',
  '大模型配置',
  '复查&检查',
];

let testNameSequence = 0;

function nextTestNameSequence() {
  testNameSequence += 1;
  return testNameSequence;
}

var confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function ivuDrawer(page) {
  return new IvuDrawerComponent(page);
}

function gatewayPoolTable(page) {
  return new PageTableComponent(page);
}

function businessPoolTable(page) {
  return new PageTableComponent(page);
}

function businessPoolDetailTable(page) {
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.businessPoolDetail);
  return new PageTableComponent(page, drawer.locator('.page-table').first());
}

function businessClusterTable(page) {
  return new PageTableComponent(page);
}

function getAppBaseUrl() {
  return confInfo['ctlHost'].replace('/login', '');
}

function isConnectionError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_CONNECTION_RESET') ||
    msg.includes('net::ERR')
  );
}

async function isVisibleSafe(locator) {
  return locator.isVisible().catch(() => false);
}

async function ensureChineseLang(page) {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'zh');
  });
  await page.evaluate(() => localStorage.setItem('lang', 'zh')).catch(() => {});
}

async function waitAfterResourceMutation(page, ms = 200) {
  if (ms <= 0) {
    return;
  }
  await page.waitForTimeout(ms);
}

async function waitForVisibleSelectItems(page, timeout = 10000) {
  await expect(
    page.locator('.ivu-select-dropdown:visible .ivu-select-item').first(),
  ).toBeVisible({ timeout });
}

async function ensureAuthenticatedShell(page) {
  await umUtils.handleUrlInvalidAlert(page);

  const currentUrl = page.url();
  const isAppPage =
    currentUrl.includes('/instance-pool-ai') || currentUrl.includes('/cluster');
  if (
    currentUrl.includes('/login') ||
    (!isAppPage && currentUrl !== 'about:blank')
  ) {
    common.log('当前不在产品页，先加载首页: ' + page.url());
    await ensureChineseLang(page);
    await page.goto(getAppBaseUrl() + '/instance-pool-ai');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({
      timeout: 15000,
    });
    await umUtils.handleUrlInvalidAlert(page);
  }
}

async function ensureAppSession(page) {
  if (common.isServiceDown()) {
    test.skip(true, '服务不可用，跳过所有测试用例');
  }

  try {
    await ensureChineseLang(page);
    await umUtils.handleUrlInvalidAlert(page);
    await umUtils.ensureLoggedIn(page);
    await ensureAuthenticatedShell(page);
  } catch (e) {
    if (isConnectionError(e)) {
      common.setServiceDown(true);
      test.skip(true, '服务连接失败: ' + e.message);
    }
    throw e;
  }
}

async function navigateBySidebar(page, labels) {
  const sidebar = new AppSidebarComponent(page);
  for (const label of labels) {
    const hasMenuItem = (await sidebar.menuItem(label).count()) > 0;
    const hasSubmenu = (await sidebar.submenuTitle(label).count()) > 0;
    if (hasMenuItem || hasSubmenu) {
      common.log('通过侧栏导航：' + label);
      await sidebar.navigate(label);
      await umUtils.handleUrlInvalidAlert(page);
      await page.waitForLoadState('domcontentloaded');
      return true;
    }
  }
  return false;
}

function generateTestGatewayPoolShortName() {
  return 'test' + moment().format('YYYYMMDDHHmmssSSS') + nextTestNameSequence();
}

function generateTestBusinessPoolShortName() {
  return 'pool' + moment().format('YYYYMMDDHHmmssSSS') + nextTestNameSequence();
}

function generateTestBusinessClusterName() {
  return (
    'cluster' + moment().format('YYYYMMDDHHmmssSSS') + nextTestNameSequence()
  );
}

function toGatewayPoolFullName(shortName) {
  return GATEWAY_POOL_PREFIX + '.' + shortName;
}

function toBusinessPoolFullName(shortName) {
  return PRODUCT_PREFIX + '.' + shortName;
}

function toBusinessPoolShortName(fullName) {
  const parts = fullName.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : fullName;
}

async function expectRowVisibleInAllPages(
  page,
  table,
  rowKey,
  waitListResponse,
  label,
  timeout = 30000,
) {
  try {
    await table.expectRowVisible(rowKey, timeout);
    return;
  } catch (e) {
    common.log('第一页未找到 ' + label + '，尝试翻页查找...');
  }

  const pagination = table.pagination();
  const pageCount = await pagination.getByRole('listitem').count();

  for (let i = 2; i <= pageCount; i++) {
    await waitListResponse(page, () => table.clickPageNumber(i));
    try {
      await table.expectRowVisible(rowKey, timeout);
      return;
    } catch (err) {
      common.log('第' + i + '页未找到 ' + label);
    }
  }

  throw new Error('在所有页面中未找到 ' + label + ': ' + rowKey);
}

async function isGatewayPoolPageReady(page) {
  const breadcrumb = page
    .locator('.bfe-breadcrumb')
    .getByText('AI网关实例池', { exact: true });
  const editBtn = page.getByRole('button', { name: '编辑' });
  return (await isVisibleSafe(breadcrumb)) && (await isVisibleSafe(editBtn));
}

async function gotoGatewayPoolManagementPage(page) {
  if (await isGatewayPoolPageReady(page)) {
    common.log('已在 AI 网关实例池页面，跳过导航');
    await umUtils.handleUrlInvalidAlert(page);
    return;
  }

  await ensureAppSession(page);

  const navigated = await navigateBySidebar(page, [
    'AI网关实例池',
    'AI Gateway Instance Pool Manage',
  ]);
  if (!navigated) {
    const url = getAppBaseUrl() + '/instance-pool-ai';
    common.log('使用直连 URL 进入 AI 网关实例池页面: ' + url);
    await ensureChineseLang(page);
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
  }

  await umUtils.handleUrlInvalidAlert(page);

  const submitBtn = page.getByRole('button', { name: '提交' });
  if (await submitBtn.isVisible().catch(() => false)) {
    common.log('检测到页面处于编辑模式，点击「取消」回到列表模式');
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({
      timeout: 10000,
    });
  }

  await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({
    timeout: 15000,
  });
}

async function gotoBusinessClusterManagementPage(page) {
  await ensureAppSession(page);

  const navigated = await navigateBySidebar(page, [
    'AI业务集群',
    'AI Business Cluster Manage',
  ]);
  if (!navigated) {
    const url = getAppBaseUrl() + '/cluster';
    common.log('使用直连 URL 进入 AI 业务集群页面: ' + url);
    await ensureChineseLang(page);
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
  }

  await umUtils.handleUrlInvalidAlert(page);

  // 关闭任何可能打开的弹窗/抽屉，避免遮挡后续操作
  const openModal = page.locator('.ivu-modal-wrap:not(.ivu-modal-hidden)');
  if ((await openModal.count()) > 0) {
    const closeBtn = openModal.locator('.ivu-modal-close').first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click();
      await openModal.waitFor({ state: 'hidden', timeout: 5000 });
    }
  }
  const openDrawer = page.locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)');
  if ((await openDrawer.count()) > 0) {
    await page.keyboard.press('Escape');
    await openDrawer.waitFor({ state: 'hidden', timeout: 5000 });
  }

  await expect(page.getByRole('button', { name: '添加集群' })).toBeVisible({
    timeout: 15000,
  });
}

async function expectBusinessClusterPageLayout(page) {
  await expect(page.getByRole('button', { name: '添加集群' })).toBeVisible({
    timeout: 15000,
  });
}

async function waitForBfePoolsListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/alb-pool') &&
          (res.request().method() === 'GET' ||
            res.request().method() === 'PATCH') &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    if (e.message.includes('Timeout')) {
      await action();
      await page.waitForLoadState('domcontentloaded');
      return null;
    }
    throw e;
  }
}

async function waitForProductInstancePoolsListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/instance-pools') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    if (e.message.includes('Timeout')) {
      await action();
      await page.waitForLoadState('domcontentloaded');
      return null;
    }
    throw e;
  }
}

async function waitForClustersListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/clusters') &&
          res.request().method() === 'GET' &&
          res.status() === 200,
        { timeout: 15000 },
      ),
      action(),
    ]);
    return response;
  } catch (e) {
    if (e.message.includes('Timeout')) {
      await action();
      await page.waitForLoadState('domcontentloaded');
      return null;
    }
    throw e;
  }
}

async function expectSuccessNotice(page, text) {
  const { IvuMessageComponent } = require('../../components/iview');
  await new IvuMessageComponent(page).expectText(text);
}

function createResourceTestCleanup() {
  const tracked = {
    gatewayPoolOriginalInstances: null,
    businessPoolShortNames: [],
    businessClusterNames: [],
  };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    async saveGatewayPoolOriginalState(page) {
      try {
        const poolData = await apiUtils.getBfePool(page);
        if (poolData && poolData.instances) {
          tracked.gatewayPoolOriginalInstances = poolData.instances;
          common.log(
            '保存网关实例池原始状态: ' + JSON.stringify(poolData.instances),
          );
        }
      } catch (error) {
        common.log('保存网关实例池原始状态失败: ' + error.message);
      }
    },
    trackBusinessPoolShortName(shortName) {
      pushUnique(tracked.businessPoolShortNames, shortName);
    },
    trackBusinessPoolFullName(fullName) {
      pushUnique(
        tracked.businessPoolShortNames,
        toBusinessPoolShortName(fullName),
      );
    },
    trackBusinessCluster(clusterName) {
      pushUnique(tracked.businessClusterNames, clusterName);
    },
    async cleanup(page) {
      for (const shortName of [...tracked.businessPoolShortNames].reverse()) {
        try {
          await apiUtils.deleteProductInstancePool(page, shortName);
        } catch (error) {
          common.log('清理业务实例池失败: ' + shortName + ' ' + error.message);
        }
      }
      if (tracked.gatewayPoolOriginalInstances) {
        try {
          await apiUtils.updateBfePool(page, {
            instances: tracked.gatewayPoolOriginalInstances,
          });
          common.log('恢复网关实例池原始状态成功');
        } catch (error) {
          common.log('恢复网关实例池原始状态失败: ' + error.message);
        }
      }
      for (const clusterName of [...tracked.businessClusterNames].reverse()) {
        try {
          await apiUtils.deleteCluster(page, clusterName);
        } catch (error) {
          common.log('清理业务集群失败: ' + clusterName + ' ' + error.message);
        }
      }
      tracked.gatewayPoolOriginalInstances = null;
      tracked.businessPoolShortNames = [];
      tracked.businessClusterNames = [];
    },
  };
}

module.exports = {
  PRODUCT_PREFIX,
  GATEWAY_POOL_PREFIX,
  DRAWER_TITLE,
  INSTANCE_POOL_SEARCH_PLACEHOLDER,
  BUSINESS_CLUSTER_SEARCH_PLACEHOLDER,
  DOC_GATEWAY_POOL,
  DOC_BUSINESS_POOL,
  DOC_BUSINESS_CLUSTER,
  BUSINESS_CLUSTER_STEPS,
  ivuDrawer,
  gatewayPoolTable,
  businessPoolTable,
  businessPoolDetailTable,
  businessClusterTable,
  getAppBaseUrl,
  waitAfterResourceMutation,
  waitForVisibleSelectItems,
  ensureAppSession,
  gotoGatewayPoolManagementPage,
  ensureOnGatewayPoolManagementPage: gotoGatewayPoolManagementPage,
  gotoBusinessClusterManagementPage,
  expectBusinessClusterPageLayout,
  generateTestGatewayPoolShortName,
  generateTestBusinessPoolShortName,
  generateTestBusinessClusterName,
  toGatewayPoolFullName,
  toBusinessPoolFullName,
  toBusinessPoolShortName,
  expectRowVisibleInAllPages,
  expectSuccessNotice,
  waitForBfePoolsListResponse,
  waitForProductInstancePoolsListResponse,
  waitForClustersListResponse,
  createResourceTestCleanup,
  // API re-exports
  getProductInstancePool: apiUtils.getProductInstancePool,
  getProductInstancePoolList: apiUtils.getProductInstancePoolList,
  getBfePool: apiUtils.getBfePool,
  getBfePoolList: apiUtils.getBfePoolList,
  updateBfePool: apiUtils.updateBfePool,
  deleteProductInstancePool: apiUtils.deleteProductInstancePool,
  createProductInstancePool: apiUtils.createProductInstancePool,
  getClusterList: apiUtils.getClusterList,
  getCluster: apiUtils.getCluster,
  deleteCluster: apiUtils.deleteCluster,
  createCluster: apiUtils.createCluster,
};
