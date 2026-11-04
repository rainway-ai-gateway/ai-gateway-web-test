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
const { expect } = require('@playwright/test');
const { PageTableComponent } = require('../../components/layout');
const { IvuStepsComponent } = require('../../components/iview/IvuSteps');
const { IvuMessageComponent } = require('../../components/iview/IvuMessage');
const { ElSelectComponent } = require('../../components/element');
const common = require('../../utils/common');
const readonly = require('../../utils/readonly');
const resourceApi = require('../../api/resource-api-utils');
const {
  DRAWER_TITLE,
  BUSINESS_CLUSTER_SEARCH_PLACEHOLDER,
  BUSINESS_CLUSTER_STEPS,
  DOC_BUSINESS_CLUSTER,
  ivuDrawer,
  businessClusterTable,
  waitAfterResourceMutation,
  waitForClustersListResponse,
  waitForVisibleSelectItems,
  expectRowVisibleInAllPages,
} = require('./ResourcePageCommon');

function businessClusterDrawerBody(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return ivuDrawer(page).withTitle(drawerTitle).locator('.ivu-drawer-body');
}

function businessClusterSteps(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  return new IvuStepsComponent(page, drawer);
}

async function openCreateBusinessClusterDrawer(page) {
  await page.getByRole('button', { name: '添加集群' }).click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createBusinessCluster);
  await waitAfterResourceMutation(page, 200);
}

async function openEditBusinessClusterDrawer(page, clusterName) {
  await businessClusterTable(page).rowAction(clusterName, '编辑').click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editBusinessCluster);
}

async function openBusinessClusterDetail(page, clusterName) {
  await businessClusterTable(page).rowAction(clusterName, '详情').click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.businessClusterDetail);
  await waitAfterResourceMutation(page, 500);
}

async function closeBusinessClusterDetail(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.businessClusterDetail);
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.businessClusterDetail),
  ).toBeHidden();
}

async function closeBusinessClusterEditDrawer(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.editBusinessCluster);
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.editBusinessCluster),
  ).toBeHidden();
}

async function clickWizardNext(page) {
  const drawer = ivuDrawer(page).active();
  await drawer.getByRole('button', { name: '下一步' }).click();
  await waitAfterResourceMutation(page, 200);
}

async function clickWizardPrev(page) {
  const drawer = ivuDrawer(page).active();
  await drawer.getByRole('button', { name: '上一步' }).click();
  await waitAfterResourceMutation(page, 200);
}

async function clickWizardSubmit(page) {
  const drawer = ivuDrawer(page).active();
  await drawer.getByRole('button', { name: '提交' }).click();
  await waitAfterResourceMutation(page, 200);
}

async function expectWizardStep(
  page,
  stepName,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const steps = businessClusterSteps(page, drawerTitle);
  await steps.expectCurrent(stepName);
}

async function fillBasicStep(
  page,
  {
    clusterName,
    description,
    protocol,
    idleConnections,
    stickySessionsEnabled,
    hashStrategy,
    hashHeader,
    bufferSize,
    closeOnClientClose,
  },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const form = ivuDrawer(page).form(drawerTitle);
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const body = drawer.locator('.ivu-drawer-body');

  if (clusterName !== undefined) {
    await form.fillInput('集群名称', clusterName);
  }
  if (description !== undefined) {
    await form.fillInput('集群说明', description);
  }
  if (protocol !== undefined) {
    // 精确匹配「协议」label，避免与第 4 步「推理内容补齐协议」表单项歧义（2026-11-04）
    const protocolSelect = body
      .locator('.ivu-form-item')
      .filter({
        has: page.locator('.ivu-form-item-label', { hasText: /^\s*协议\s*$/ }),
      })
      .locator('.ivu-select-selection');
    await protocolSelect.click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .getByText(protocol, { exact: true })
      .click();
    await waitAfterResourceMutation(page, 300);
  }
  if (idleConnections !== undefined) {
    await form.fillInput('单个后端最大空闲连接数', String(idleConnections));
  }
  if (hashStrategy !== undefined && stickySessionsEnabled === undefined) {
    stickySessionsEnabled = '启用';
  }
  if (stickySessionsEnabled !== undefined) {
    const sessionSelect = body
      .locator('.ivu-form-item')
      .filter({ hasText: '会话保持' })
      .locator('.ivu-select-selection');
    await sessionSelect.click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .getByText(stickySessionsEnabled, { exact: true })
      .click();
    await waitAfterResourceMutation(page, 300);
  }
  if (hashStrategy !== undefined) {
    const hashSelect = body
      .locator('.ivu-form-item')
      .filter({ hasText: '哈希策略' })
      .locator('.ivu-select-selection');
    await hashSelect.click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .getByText(hashStrategy, { exact: true })
      .click();
    await waitAfterResourceMutation(page, 300);
  }
  // 选择 CLIENT_ID_ONLY / CLIENT_ID_PREFERED 时必须填写哈希头部，未显式传入时给默认值
  if (
    hashHeader === undefined &&
    (hashStrategy === 'CLIENT_ID_ONLY' || hashStrategy === 'CLIENT_ID_PREFERED')
  ) {
    hashHeader = 'Cookie:USERID';
  }
  if (hashHeader !== undefined) {
    await form.fillInput('哈希头部', hashHeader);
  }
  if (bufferSize !== undefined) {
    await form.fillInput('请求写缓存大小（Byte）', String(bufferSize));
  }
  if (closeOnClientClose !== undefined) {
    const closeSelect = body
      .locator('.ivu-form-item')
      .filter({ hasText: '后端连接随客户端连接关闭' })
      .locator('.ivu-select-selection');
    await closeSelect.click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .getByText(closeOnClientClose, { exact: true })
      .click();
    await waitAfterResourceMutation(page, 300);
  }
}

async function fillTimeoutStep(
  page,
  {
    clientIdleTimeout,
    readBodyTimeout,
    connectBackendTimeout,
    readBackendHeaderTimeout,
    writeResponseTimeout,
    sameSubClusterRetry,
  },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const form = ivuDrawer(page).form(drawerTitle);

  if (clientIdleTimeout !== undefined) {
    await form.fillInput('客户端连接空闲超时(ms)', String(clientIdleTimeout));
  }
  if (readBodyTimeout !== undefined) {
    await form.fillInput('读客户端请求Body超时(ms)', String(readBodyTimeout));
  }
  if (connectBackendTimeout !== undefined) {
    await form.fillInput('连接后端超时(ms)', String(connectBackendTimeout));
  }
  if (readBackendHeaderTimeout !== undefined) {
    await form.fillInput(
      '读后端响应头部超时(ms)',
      String(readBackendHeaderTimeout),
    );
  }
  if (writeResponseTimeout !== undefined) {
    await form.fillInput('写响应超时(ms)', String(writeResponseTimeout));
  }
  if (sameSubClusterRetry !== undefined) {
    await form.fillInput('集群内重试次数', String(sameSubClusterRetry));
  }
}

async function fillHealthStep(
  page,
  { failureThreshold, healthInterval, healthHost, healthUri, expectedStatus },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const form = ivuDrawer(page).form(drawerTitle);

  if (failureThreshold !== undefined) {
    await form.fillInput(
      '故障阈值（触发设置实例为不可用，启动被动健康检查）',
      String(failureThreshold),
    );
  }
  if (healthInterval !== undefined) {
    await form.fillInput('健康检查间隔(ms)', String(healthInterval));
  }
  if (healthHost !== undefined) {
    await form.fillInput('健康检查Host', healthHost);
  }
  if (healthUri !== undefined) {
    await form.fillInput('健康检查Uri', healthUri);
  }
  if (expectedStatus !== undefined) {
    await form.fillInput('健康检查期望的状态码', String(expectedStatus));
  }
}

async function fillInstanceConfigStep(
  page,
  { mode = 'ip', instances = [], domain } = {},
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const form = ivuDrawer(page).form(drawerTitle);
  const body = ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body');

  if (mode === 'domain') {
    const modeSelect = body
      .locator('.ivu-form-item')
      .filter({ hasText: '实例形态' })
      .locator('.ivu-select')
      .first();
    if ((await modeSelect.count()) > 0) {
      await modeSelect.click();
      await waitAfterResourceMutation(page, 300);
      await page
        .locator('.ivu-select-item')
        .filter({ hasText: /服务商域名|域名/ })
        .first()
        .click();
      await waitAfterResourceMutation(page, 300);
    }
    if (domain !== undefined) {
      await form.fillInput('服务商域名', domain);
    }
  } else {
    const table = body.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const ipInputs = body.locator('input[placeholder="请输入IP地址"]');
      if ((await ipInputs.count()) <= i) {
        await clickAddInstanceRow(page, drawerTitle);
      }
      const ipInput = ipInputs.nth(i);
      if (inst.addr !== undefined) {
        await ipInput.fill(inst.addr);
      }
      if (inst.port !== undefined) {
        const row = ipInput.locator('xpath=ancestor::tr');
        const portInput = row.locator('.ivu-input-number-input').first();
        if ((await portInput.count()) > 0) {
          await portInput.fill(String(inst.port));
          await portInput.blur();
        } else {
          const fallbackPortInput = body
            .locator('input[placeholder="请输入端口"]')
            .nth(i);
          if ((await fallbackPortInput.count()) > 0) {
            await fallbackPortInput.fill(String(inst.port));
            await fallbackPortInput.blur();
          }
        }
        await waitAfterResourceMutation(page, 300);
      }
      if (inst.weight !== undefined) {
        await fillInstanceWeight(page, i, inst.weight, drawerTitle);
      }
    }
    await waitAfterResourceMutation(page, 500);
  }
}

function instanceConfigBody(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return ivuDrawer(page).withTitle(drawerTitle).locator('.ivu-drawer-body');
}

async function clickAddInstanceRow(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  const addBtn = body.getByRole('button', { name: /\+.*创建|添加实例/ });
  await addBtn.click();
  await waitAfterResourceMutation(page, 300);
}

async function fillInstanceWeight(
  page,
  rowIndex,
  weight,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  const ipInput = body
    .locator('input[placeholder="请输入IP地址"]')
    .nth(rowIndex);
  const row = ipInput.locator('xpath=ancestor::tr');
  const weightInput = row
    .locator('td')
    .nth(2)
    .locator('.ivu-input-number input');
  await weightInput.fill('');
  await weightInput.fill(String(weight));
  await weightInput.blur();
  await waitAfterResourceMutation(page, 300);
}

async function expectInstanceConfigError(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  const matcher = message instanceof RegExp ? message : String(message);
  // 2026-08-06: 校验改为 iView 标准 FormItem，错误提示 class 为 .ivu-form-item-error-tip
  // 2026-08-12: 多行重复 IP 会产生多个 error-tip 元素，加 .first() 避免 strict mode 违规
  await expect(
    body
      .locator('.ivu-form-item-error-tip, .instance-error-tip')
      .filter({ hasText: matcher })
      .first(),
  ).toBeVisible({
    timeout: 10000,
  });
}

async function navigateToInstanceConfigStep(
  page,
  clusterName,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await fillBasicStep(
    page,
    {
      clusterName,
      protocol: 'https',
    },
    drawerTitle,
  );
  await clickWizardNext(page);
  await clickWizardNext(page);
  await clickWizardNext(page);
  await expectWizardStep(page, '实例配置', drawerTitle);
}

async function waitForClusterCreateRequest(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/clusters'),
      { timeout: 30000 },
    ),
    action(),
  ]);
  return request;
}

// 等待编辑集群的 PATCH 请求（RM-BC-109 编辑场景）
async function waitForClusterPatchRequest(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes('/clusters/'),
      { timeout: 30000 },
    ),
    action(),
  ]);
  return request;
}

async function navigateToHealthStep(
  page,
  clusterName,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await fillBasicStep(
    page,
    {
      clusterName,
      protocol: 'https',
    },
    drawerTitle,
  );
  await clickWizardNext(page);
  await clickWizardNext(page);
  await expectWizardStep(page, '被动健康检查', drawerTitle);
}

async function navigateToModelStep(
  page,
  clusterName,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await fillBasicStep(
    page,
    {
      clusterName,
      protocol: 'https',
    },
    drawerTitle,
  );
  await clickWizardNext(page);
  await clickWizardNext(page);
  await clickWizardNext(page);
  await expectWizardStep(page, '大模型配置', drawerTitle);
}

async function expectHashStrategyFieldVisible(
  page,
  visible,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body');
  const field = body.locator('.ivu-form-item').filter({ hasText: '哈希策略' });
  if (visible) {
    await expect(field).toBeVisible();
  } else {
    await expect(field).toHaveCount(0);
  }
}

async function expectWizardFormFieldError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await ivuDrawer(page).form(drawerTitle).expectFieldError(label, message);
}

async function switchInstanceMode(
  page,
  mode,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  const modeSelect = body
    .locator('.ivu-form-item')
    .filter({ hasText: '实例形态' })
    .locator('.ivu-select')
    .first();
  await modeSelect.click();
  await waitAfterResourceMutation(page, 300);
  const pattern = mode === 'domain' ? /服务商域名|域名/ : /^IP$/;
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: pattern })
    .first()
    .click();
  await waitAfterResourceMutation(page, 300);
}

async function expectInstanceModeUi(
  page,
  mode,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  if (mode === 'domain') {
    await expect(body.getByPlaceholder(/服务商域名/)).toBeVisible();
    await expect(body.locator('input[placeholder="请输入IP地址"]')).toHaveCount(
      0,
    );
  } else {
    await expect(
      body.locator('input[placeholder="请输入IP地址"]'),
    ).toBeVisible();
  }
}

async function fillInstancePortAtRow(
  page,
  rowIndex,
  port,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  // 端口是 InputNumber 组件，使用 .ivu-input-number-input 选择器
  const rows = body.locator('table tbody tr');
  await rows
    .nth(rowIndex)
    .locator('.ivu-input-number-input')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
  const row = rows.nth(rowIndex);
  const portInput = row.locator('.ivu-input-number-input').first();
  await portInput.fill(String(port));
  await portInput.blur();
  await waitAfterResourceMutation(page, 300);
}

async function fillInstanceIpAtRow(
  page,
  rowIndex,
  ip,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = instanceConfigBody(page, drawerTitle);
  const ipInput = body
    .locator('input[placeholder="请输入IP地址"]')
    .nth(rowIndex);
  await ipInput.fill(ip);
  await ipInput.blur();
  await waitAfterResourceMutation(page, 300);
}

async function expectModelEndpointDefaults(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body');
  const endpointRow = body
    .locator('.ivu-form-item')
    .filter({ hasText: '模型列表接口' });
  await expect(
    endpointRow.locator('.ivu-select-selected-value').first(),
  ).toContainText('https');
  await expect(endpointRow.locator('input').nth(1)).toHaveValue('/v1/models');
}

async function mountSubCluster(page, subClusterName) {
  const drawer = ivuDrawer(page).active();
  const poolTable = new PageTableComponent(
    page,
    drawer.locator('.page-table').first(),
  );
  await poolTable.rowAction(subClusterName, '挂载').click();
  await waitAfterResourceMutation(page, 500);
}

async function unmountSubCluster(page, subClusterName) {
  const drawer = ivuDrawer(page).active();
  const mountedTable = new PageTableComponent(
    page,
    drawer.locator('.page-table').nth(1),
  );
  await mountedTable.rowAction(subClusterName, '卸载').click();
  await waitAfterResourceMutation(page, 500);
}

async function fillModelStep(
  page,
  {
    provider,
    modelProvider,
    models,
    modelName,
    redirectSource,
    redirectTarget,
    stripPrefix,
    matchPrefix,
  },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);

  if (provider !== undefined || modelProvider !== undefined) {
    await selectProvider(page, provider || modelProvider, drawerTitle);
  }
  if (models !== undefined || modelName !== undefined) {
    await selectForwardModels(
      page,
      models || (modelName ? [modelName] : []),
      drawerTitle,
    );
  }
  // 2026-08-16: GatewayConfig 新增裁剪前缀开关，开启时联动显示匹配前缀输入框
  if (stripPrefix !== undefined) {
    const switchEl = body
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.stripPrefixLabel })
      .locator('.ivu-switch');
    const isChecked = await switchEl.evaluate((el) =>
      el.classList.contains('ivu-switch-checked'),
    );
    if (stripPrefix !== isChecked) {
      await switchEl.click();
      await waitAfterResourceMutation(page, 300);
    }
  }
  if (matchPrefix !== undefined) {
    const matchInput = body
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.matchPrefixLabel })
      .locator('input')
      .first();
    await matchInput.fill(matchPrefix);
  }
  if (redirectSource !== undefined || redirectTarget !== undefined) {
    await fillModelMappingRow(
      page,
      0,
      { source: redirectSource, target: redirectTarget },
      drawerTitle,
    );
  }
}

// 所属服务商（必填下拉，el-select，选项来自 get-provider-names）—— RM-BC-71
async function selectProvider(
  page,
  providerName,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const select = ElSelectComponent.fromFormItem(
    page,
    body,
    DOC_BUSINESS_CLUSTER.providerLabel,
  );
  await select.selectOptionExact(providerName);
  await expect(
    body
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.providerLabel })
      .locator('.el-select'),
  ).toBeVisible({ timeout: 10000 });
  // 选中后拉取 provider 详情（models / keys 联动）
  await page.waitForTimeout(800);
}

// 转发模型（el-select multiple，必填，选项为所属服务商模型子集）—— RM-BC-72/73/74
async function selectForwardModels(
  page,
  modelNames,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const select = ElSelectComponent.fromFormItem(
    page,
    body,
    DOC_BUSINESS_CLUSTER.forwardModelsLabel,
  );
  // 打开一次后连续选择：multiple 选中后下拉保持打开，若每个模型都 open()
  // 会触发 toggle 关闭下拉，导致后续选项点击时元素消失。
  await select.open();
  for (const name of modelNames) {
    await select.dropdownItems().getByText(name, { exact: true }).click();
    await page.waitForTimeout(200);
  }
}

async function selectAllForwardModels(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const select = ElSelectComponent.fromFormItem(
    page,
    body,
    DOC_BUSINESS_CLUSTER.forwardModelsLabel,
  );
  // 若下拉已处于打开状态（如刚完成子集选择，multiple 选中后下拉保持打开），
  // 再触发 open() 的 toggle 会把下拉关掉，导致后续点击超时；仅在下拉未打开时才打开。
  if ((await select.dropdownItems().count()) === 0) {
    await select.open();
  }
  await select
    .dropdownItems()
    .filter({ hasText: '全选' })
    .first()
    .click({ force: true, timeout: 10000 });
  await page.waitForTimeout(300);
}

// 模型重定向行填写：source_model 为 Input、target_model 为 Select（选项来自转发模型）—— RM-BC-08/81
async function fillModelMappingRow(
  page,
  rowIndex,
  { source, target },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const card = body
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.modelRedirectCard });
  const rows = card.locator('table tbody tr');
  if ((await rows.count()) <= rowIndex) {
    const addBtn = card.locator('button').filter({ hasText: /添加|新增/i });
    await addBtn.first().click();
    await waitAfterResourceMutation(page, 300);
  }
  const row = card.locator('table tbody tr').nth(rowIndex);
  if (source !== undefined) {
    const sourceInput = row.locator('input[placeholder*="原模型" i]').first();
    await sourceInput.fill(source);
  }
  if (target !== undefined) {
    await row.locator('.ivu-select-selection').first().click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .getByText(target, { exact: true })
      .click();
    await waitAfterResourceMutation(page, 300);
  }
}

async function expectModelMappingSource(
  page,
  rowIndex,
  expected,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const card = body
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.modelRedirectCard });
  const row = card.locator('table tbody tr').nth(rowIndex);
  const sourceInput = row.locator('input[placeholder*="原模型" i]').first();
  await expect(sourceInput).toHaveValue(expected, { timeout: 10000 });
}

async function expectProviderFieldVisible(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  // 注意：不能先取 .filter().first() 再找 .el-select——「健康检查Host」的提示文案
  // 含「所属服务商」会干扰 hasText 匹配。应先 filter 再定位其内 .el-select。
  const select = body
    .locator('.ivu-form-item, .el-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.providerLabel })
    .locator('.el-select')
    .first();
  await expect(select).toBeVisible({ timeout: 10000 });
}

async function expectProviderValue(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const select = body
    .locator('.ivu-form-item, .el-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.providerLabel })
    .locator('.el-select')
    .first();
  const input = select.locator('.el-input__inner').first();
  // el-select 单选（filterable）：选中值渲染在内部 input.value
  await expect(input).toHaveValue(value, { timeout: 10000 });
}

// 转发模型（el-select multiple）已选值断言（顺序无关）—— RM-BC-72/73
async function expectSelectedForwardModels(
  page,
  modelNames,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const item = body
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.forwardModelsLabel })
    .first();
  const selected = item.locator('.el-select__tags-text');
  const count = await selected.count();
  const texts = [];
  for (let i = 0; i < count; i++) {
    texts.push(((await selected.nth(i).textContent()) || '').trim());
  }
  expect(texts.sort()).toEqual([...modelNames].sort());
}

async function expectStripPrefixSwitchState(
  page,
  checked,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const body = drawer.locator('.ivu-drawer-body');
  const switchEl = body
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.stripPrefixLabel })
    .locator('.ivu-switch')
    .first();
  const isChecked = await switchEl.evaluate((el) =>
    el.classList.contains('ivu-switch-checked'),
  );
  expect(isChecked).toBe(checked);
}

async function expectMatchPrefixFieldVisible(
  page,
  visible,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const body = drawer.locator('.ivu-drawer-body');
  const matchInput = body
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.matchPrefixLabel })
    .locator('input')
    .first();
  if (visible) {
    await expect(matchInput).toBeVisible();
  } else {
    await expect(matchInput).toBeHidden();
  }
}

// ===== 2026-08-16 多 Key / key_policy / provider（RM-BC-43~57、60~64）=====

function modelKeysTable(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return modelStepBody(page, drawerTitle).locator('table.keys-table');
}

async function expectModelKeysRowCount(page, count, drawerTitle) {
  await expect(
    modelKeysTable(page, drawerTitle).locator('tbody tr'),
  ).toHaveCount(count, { timeout: 10000 });
}

// 服务商无 keys 时 Keys 配置不可用（RM-BC-78）
// 2026-08-27 UI 偏差：原型与实现均始终渲染 keys-table（不做隐藏），
// 无 keys 时“服务商 Key”下拉无可用选项。按实际行为断言下拉选项数。
async function expectProviderKeyOptionsEmpty(
  page,
  empty,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const row = modelStepBody(page, drawerTitle)
    .locator('table.keys-table tbody tr')
    .first();
  await row.waitFor({ state: 'visible', timeout: 10000 });
  await row.locator('.ivu-select-selection').first().click();
  await waitForVisibleSelectItems(page).catch(() => {});
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const count = await items.count();
  await page.keyboard.press('Escape');
  await waitAfterResourceMutation(page, 200);
  if (empty) {
    expect(count).toBe(0);
  } else {
    expect(count).toBeGreaterThan(0);
  }
}

// 获取某 Key 行“服务商 Key”下拉的可用选项名（RM-BC-76）
async function getModelKeyRowOptions(
  page,
  rowIndex,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const row = modelKeysTable(page, drawerTitle)
    .locator('tbody tr')
    .nth(rowIndex);
  await row.locator('.ivu-select-selection').first().click();
  await waitForVisibleSelectItems(page);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const texts = (await items.allTextContents()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await waitAfterResourceMutation(page, 200);
  return texts.filter((t) => t !== '');
}

// 所属服务商下拉选项断言（RM-BC-71：展开时选项为全部服务商名）
async function expectProviderDropdownOptions(
  page,
  expectedNames,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const select = ElSelectComponent.fromFormItem(
    page,
    body,
    DOC_BUSINESS_CLUSTER.providerLabel,
  );
  await select.open();
  const texts = (await select.dropdownItems().allTextContents()).map((t) =>
    t.trim(),
  );
  await page.keyboard.press('Escape');
  await waitAfterResourceMutation(page, 200);
  for (const name of expectedNames) {
    expect(texts).toContain(name);
  }
}

async function addModelKeyRow(page, drawerTitle) {
  await modelStepBody(page, drawerTitle)
    .getByRole('button', { name: /添加 Key/i })
    .click();
  await waitAfterResourceMutation(page, 300);
}

async function removeModelKeyRow(page, rowIndex, drawerTitle) {
  const row = modelKeysTable(page, drawerTitle)
    .locator('tbody tr')
    .nth(rowIndex);
  await row.getByRole('button', { name: '删除' }).click();
  await waitAfterResourceMutation(page, 300);
}

async function fillModelKeyRow(
  page,
  rowIndex,
  { name, weight },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const row = modelKeysTable(page, drawerTitle)
    .locator('tbody tr')
    .nth(rowIndex);
  await row.waitFor({ state: 'visible', timeout: 10000 });
  if (name !== undefined) {
    // 服务商 Key 下拉（iView Select，选项为该服务商 keys 的 name）
    await row.locator('.ivu-select-selection').first().click();
    await page
      .locator('.ivu-select-dropdown:visible .ivu-select-item')
      .getByText(name, { exact: true })
      .click();
    await waitAfterResourceMutation(page, 200);
  }
  if (weight !== undefined) {
    const weightInput = row.locator('.ivu-input-number-input');
    await weightInput.fill('');
    await weightInput.fill(String(weight));
    await weightInput.blur();
    await waitAfterResourceMutation(page, 300);
  }
}

async function getModelKeyRowValues(
  page,
  rowIndex,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const row = modelKeysTable(page, drawerTitle)
    .locator('tbody tr')
    .nth(rowIndex);
  return {
    name: (
      (await row
        .locator('.ivu-select-selected-value, .ivu-select-selection')
        .first()
        .textContent()) || ''
    ).trim(),
    weight: await row.locator('.ivu-input-number-input').inputValue(),
  };
}

// 表单级错误断言：keys FormItem error tip 或 keys 卡片内的 .weight-error 提示
async function expectModelKeysError(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const matcher = message instanceof RegExp ? message : String(message);
  await expect(
    body
      .locator('.ivu-form-item-error-tip, .weight-error')
      .filter({ hasText: matcher })
      .first(),
  ).toBeVisible({ timeout: 10000 });
}

async function expectModelKeysErrorHidden(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const matcher = message instanceof RegExp ? message : String(message);
  await expect(
    body
      .locator('.ivu-form-item-error-tip, .weight-error')
      .filter({ hasText: matcher })
      .first(),
  ).toBeHidden({ timeout: 5000 });
}

// 单行 weight 越界校验：InputNumber 会钳制键盘输入，需通过 Vue 模型注入触发 FormItem 校验
async function setModelKeyWeightViaModel(
  page,
  rowIndex,
  weight,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const injected = await page.evaluate(
    (payload) => {
      const allForms = document.querySelectorAll('.ivu-form');
      for (const formEl of allForms) {
        const formVue = formEl.__vue__;
        if (!formVue) continue;
        let current = formVue;
        for (let i = 0; i < 10 && current; i++) {
          if (
            current.formData &&
            'model_mappings' in current.formData &&
            Array.isArray(current.formData.keys)
          ) {
            current.formData.keys[payload.index].weight = payload.weight;
            current.$forceUpdate();
            if (current.$refs.formData) {
              current.$refs.formData.validateField(
                `keys.${payload.index}.weight`,
              );
            }
            return true;
          }
          current = current.$parent;
        }
      }
      return false;
    },
    { index: rowIndex, weight },
  );
  if (!injected) {
    throw new Error('无法通过表单设置 keys weight 字段');
  }
  await waitAfterResourceMutation(page, 200);
}

// key_policy 字段填写（max_retries / retry_backoff_initial / retry_backoff_max 依次为 Card 内 3 个 InputNumber）
async function fillKeyPolicyStep(
  page,
  { maxRetries, retryBackoffInitial, retryBackoffMax },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const card = body
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.keyPolicyCard });
  const inputs = card.locator('.ivu-input-number-input');
  const setters = [
    [0, maxRetries],
    [1, retryBackoffInitial],
    [2, retryBackoffMax],
  ];
  for (const [idx, value] of setters) {
    if (value === undefined) continue;
    await inputs.nth(idx).fill('');
    await inputs.nth(idx).fill(String(value));
    await inputs.nth(idx).blur();
  }
  await waitAfterResourceMutation(page, 300);
}

async function getKeyPolicyValues(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const card = body
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.keyPolicyCard });
  const inputs = card.locator('.ivu-input-number-input');
  return {
    strategy: await card
      .locator('.ivu-select-selected-value')
      .first()
      .textContent(),
    maxRetries: await inputs.nth(0).inputValue(),
    retryBackoffInitial: await inputs.nth(1).inputValue(),
    retryBackoffMax: await inputs.nth(2).inputValue(),
  };
}

// key_policy 负数/小数/大小关系校验：InputNumber 钳制，需模型注入触发 FormItem 校验
async function setKeyPolicyFieldViaModel(
  page,
  field,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const injected = await page.evaluate(
    (payload) => {
      const allForms = document.querySelectorAll('.ivu-form');
      for (const formEl of allForms) {
        const formVue = formEl.__vue__;
        if (!formVue) continue;
        let current = formVue;
        for (let i = 0; i < 10 && current; i++) {
          if (
            current.formData &&
            'model_mappings' in current.formData &&
            current.formData.key_policy
          ) {
            current.formData.key_policy[payload.field] = payload.value;
            current.$forceUpdate();
            if (current.$refs.formData) {
              current.$refs.formData.validateField(
                `key_policy.${payload.field}`,
              );
            }
            return true;
          }
          current = current.$parent;
        }
      }
      return false;
    },
    { field, value },
  );
  if (!injected) {
    throw new Error(`无法通过表单设置 key_policy.${field} 字段`);
  }
  await waitAfterResourceMutation(page, 200);
}

// strategy 下拉（Key 路由策略）选项断言
async function expectKeyPolicyStrategyOptions(
  page,
  options,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const card = body
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.keyPolicyCard });
  await card.locator('.ivu-select-selection').first().click();
  await waitAfterResourceMutation(page, 200);
  const items = page.locator('.ivu-select-dropdown:visible .ivu-select-item');
  const texts = await items.allTextContents();
  await page.keyboard.press('Escape');
  const normalized = texts.map((t) => t.trim()).filter((t) => t !== '');
  expect(normalized).toEqual(options);
}

// 大模型配置步骤 Card 分组展示（RM-BC-56：WRR 下 7 张 Card；EPP 下追加流控配置与 EPP 运行时参数共 9 张）
async function expectModelCardGrouping(
  page,
  cardTitles,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const cards = body.locator('.llm-section-card');
  await expect(cards).toHaveCount(cardTitles.length, { timeout: 10000 });
  for (const title of cardTitles) {
    await expect(
      body.locator('.llm-section-card').filter({ hasText: title }).first(),
    ).toBeVisible();
  }
}

// ===== 2026-08-26 Key 亲和性（RM-BC-87~91）=====

function keyAffinityCard(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityCard });
}

// 启用开关（el-select：停用/启用）+ 条件字段（空闲超时/Key 惩罚/Redis 前缀）
async function fillKeyAffinityStep(
  page,
  { enabled, ttl, penaltyEnable, penaltyTtl429, penaltyTtlAuth, redisPrefix },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = keyAffinityCard(page, drawerTitle);
  if (enabled !== undefined) {
    const select = ElSelectComponent.fromFormItem(
      page,
      card,
      DOC_BUSINESS_CLUSTER.keyAffinityEnabledLabel,
    );
    await select.selectOptionExact(
      enabled
        ? DOC_BUSINESS_CLUSTER.keyAffinityEnabledOn
        : DOC_BUSINESS_CLUSTER.keyAffinityEnabledOff,
    );
    await waitAfterResourceMutation(page, 300);
  }
  if (ttl !== undefined) {
    const input = card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityTtlLabel })
      .locator('.ivu-input-number-input');
    await input.fill('');
    await input.fill(String(ttl));
    await input.blur();
    await waitAfterResourceMutation(page, 200);
  }
  if (penaltyEnable !== undefined) {
    const select = ElSelectComponent.fromFormItem(
      page,
      card,
      DOC_BUSINESS_CLUSTER.keyAffinityPenaltyLabel,
    );
    await select.selectOptionExact(
      penaltyEnable
        ? DOC_BUSINESS_CLUSTER.keyAffinityEnabledOn
        : DOC_BUSINESS_CLUSTER.keyAffinityEnabledOff,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (penaltyTtl429 !== undefined) {
    const input = card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityPenaltyTtl429Label })
      .locator('.ivu-input-number-input');
    await input.fill('');
    await input.fill(String(penaltyTtl429));
    await input.blur();
    await waitAfterResourceMutation(page, 200);
  }
  if (penaltyTtlAuth !== undefined) {
    const input = card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityPenaltyTtlAuthLabel })
      .locator('.ivu-input-number-input');
    await input.fill('');
    await input.fill(String(penaltyTtlAuth));
    await input.blur();
    await waitAfterResourceMutation(page, 200);
  }
  if (redisPrefix !== undefined) {
    const input = card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityRedisPrefixLabel })
      .locator('input')
      .first();
    await input.fill(redisPrefix);
    await input.blur();
    await waitAfterResourceMutation(page, 200);
  }
}

async function getKeyAffinityValues(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = keyAffinityCard(page, drawerTitle);
  const enabledSelect = ElSelectComponent.fromFormItem(
    page,
    card,
    DOC_BUSINESS_CLUSTER.keyAffinityEnabledLabel,
  );
  // el-select 单选（非 filterable）：选中项文案渲染在内部 input.value（textContent 为空）
  const enabledValue = await enabledSelect
    .rootLocator()
    .locator('.el-input__inner')
    .first()
    .inputValue();
  const enabled = enabledValue === DOC_BUSINESS_CLUSTER.keyAffinityEnabledOn;
  let ttl = '';
  let penaltyEnable = null;
  let penaltyTtl429 = '';
  let penaltyTtlAuth = '';
  let redisPrefix = '';
  if (enabled) {
    ttl = await card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityTtlLabel })
      .locator('.ivu-input-number-input')
      .inputValue();
    const penaltySelect = ElSelectComponent.fromFormItem(
      page,
      card,
      DOC_BUSINESS_CLUSTER.keyAffinityPenaltyLabel,
    );
    const penaltyValue = await penaltySelect
      .rootLocator()
      .locator('.el-input__inner')
      .first()
      .inputValue();
    penaltyEnable = penaltyValue === DOC_BUSINESS_CLUSTER.keyAffinityEnabledOn;
    if (penaltyEnable) {
      penaltyTtl429 = await card
        .locator('.ivu-form-item')
        .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityPenaltyTtl429Label })
        .locator('.ivu-input-number-input')
        .inputValue();
      penaltyTtlAuth = await card
        .locator('.ivu-form-item')
        .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityPenaltyTtlAuthLabel })
        .locator('.ivu-input-number-input')
        .inputValue();
    }
    redisPrefix = await card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityRedisPrefixLabel })
      .locator('input')
      .first()
      .inputValue();
  }
  return { enabled, ttl, penaltyEnable, penaltyTtl429, penaltyTtlAuth, redisPrefix };
}

async function expectKeyAffinityFieldsVisible(
  page,
  visible,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = keyAffinityCard(page, drawerTitle);
  const ttlItem = card
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityTtlLabel });
  if (visible) {
    await expect(ttlItem).toBeVisible({ timeout: 10000 });
    await expect(
      card
        .locator('.ivu-form-item')
        .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityRedisPrefixLabel }),
    ).toBeVisible();
  } else {
    await expect(ttlItem).toHaveCount(0);
  }
}

async function expectKeyAffinityError(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = keyAffinityCard(page, drawerTitle);
  const matcher = message instanceof RegExp ? message : String(message);
  await expect(
    card
      .locator('.ivu-form-item-error-tip, .el-form-item__error')
      .filter({ hasText: matcher })
      .first(),
  ).toBeVisible({ timeout: 10000 });
}

async function expectKeyAffinityErrorHidden(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = keyAffinityCard(page, drawerTitle);
  const matcher = message instanceof RegExp ? message : String(message);
  await expect(
    card
      .locator('.ivu-form-item-error-tip, .el-form-item__error')
      .filter({ hasText: matcher })
      .first(),
  ).toBeHidden({ timeout: 5000 });
}

// ttl / redis_prefix 校验：InputNumber 会钳制输入，通过 Vue 模型注入触发 FormItem 校验
async function setKeyAffinityFieldViaModel(
  page,
  field,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const injected = await page.evaluate(
    (payload) => {
      const allForms = document.querySelectorAll('.ivu-form');
      for (const formEl of allForms) {
        const formVue = formEl.__vue__;
        if (!formVue) continue;
        let current = formVue;
        for (let i = 0; i < 10 && current; i++) {
          if (
            current.formData &&
            'model_mappings' in current.formData &&
            current.formData.key_affinity
          ) {
            if (payload.field === 'ttl') {
              current.formData.key_affinity.ttl = payload.value;
            } else if (payload.field === 'redis_prefix') {
              current.formData.key_affinity.redis_prefix = payload.value;
            } else if (payload.field === 'enabled') {
              current.formData.key_affinity.enabled = payload.value;
            } else if (
              payload.field === 'penalty_ttl_429' ||
              payload.field === 'penalty_ttl_auth'
            ) {
              current.formData.key_affinity[payload.field] = payload.value;
            }
            current.$forceUpdate();
            if (current.$refs.formData) {
              // key_affinity 条件字段（ttl/redis_prefix）仅在 enabled 时渲染，
              // iView Form 的 fields 在 FormItem mounted 时注册，故需 nextTick
              // 后再 validateField；未启用（字段未挂载）时跳过校验。
              current.$nextTick(() => {
                try {
                  current.$refs.formData.validateField(
                    `key_affinity.${payload.field}`,
                  );
                } catch (e) {
                  /* 字段未挂载：无校验可执行 */
                }
              });
            }
            return true;
          }
          current = current.$parent;
        }
      }
      return false;
    },
    { field, value },
  );
  if (!injected) {
    throw new Error(`无法通过表单设置 key_affinity.${field} 字段`);
  }
  await waitAfterResourceMutation(page, 200);
}

// ---------------------------------------------------------------------------
// 上游错误归一（normalize_upstream_error，RM-BC-110~114）
// Card 渲染在「Key 亲和性」与「均衡模式配置」之间；3 个 iView Switch +
// enabled 条件渲染的 iView Select（未识别错误体处理）与 InputNumber（读取上限）。
// 提交体恒含 normalize_upstream_error（GatewayConfig.buildData 按默认补齐）。
// ---------------------------------------------------------------------------

function normalizeUpstreamErrorCard(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.normalizeUpstreamErrorCard });
}

// 设置上游错误归一各字段；未传入的字段保持原状
async function fillNormalizeUpstreamError(
  page,
  { enabled, streamEnabled, redactSecrets, unrecognizedAction, maxBodyBytes },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = normalizeUpstreamErrorCard(page, drawerTitle);
  if (enabled !== undefined) {
    await setEppSwitchByLabel(card, DOC_BUSINESS_CLUSTER.normalizeEnabledLabel, enabled);
    await waitAfterResourceMutation(page, 300);
  }
  if (streamEnabled !== undefined) {
    await setEppSwitchByLabel(
      card,
      DOC_BUSINESS_CLUSTER.normalizeStreamEnabledLabel,
      streamEnabled,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (redactSecrets !== undefined) {
    await setEppSwitchByLabel(
      card,
      DOC_BUSINESS_CLUSTER.normalizeRedactSecretsLabel,
      redactSecrets,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (unrecognizedAction !== undefined) {
    // 选项文案：passthrough → 「原样透传」；rewrite_generic → 「重写为通用错误（rewrite_generic）」
    const optionText =
      unrecognizedAction === 'passthrough'
        ? DOC_BUSINESS_CLUSTER.normalizePassthroughLabel
        : DOC_BUSINESS_CLUSTER.normalizeRewriteGenericLabel;
    await setEppSelectByLabel(
      page,
      card,
      DOC_BUSINESS_CLUSTER.normalizeUnrecognizedActionLabel,
      optionText,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (maxBodyBytes !== undefined) {
    await fillEppNumberInput(
      card,
      DOC_BUSINESS_CLUSTER.normalizeMaxBodyBytesLabel,
      maxBodyBytes,
    );
    await waitAfterResourceMutation(page, 200);
  }
}

// 读取上游错误归一当前值；enabled=false 时条件字段未渲染，对应键为 null
async function getNormalizeUpstreamErrorValues(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = normalizeUpstreamErrorCard(page, drawerTitle);
  const item = (label) => eppFormItemExact(card, label);
  return {
    enabled: await eppSwitchState(await item(DOC_BUSINESS_CLUSTER.normalizeEnabledLabel)),
    streamEnabled: await eppSwitchState(
      await item(DOC_BUSINESS_CLUSTER.normalizeStreamEnabledLabel),
    ),
    redactSecrets: await eppSwitchState(
      await item(DOC_BUSINESS_CLUSTER.normalizeRedactSecretsLabel),
    ),
    unrecognizedAction: await eppSelectValue(
      await item(DOC_BUSINESS_CLUSTER.normalizeUnrecognizedActionLabel),
    ),
    maxBodyBytes: await eppTextInputValue(
      await item(DOC_BUSINESS_CLUSTER.normalizeMaxBodyBytesLabel),
      '.ivu-input-number-input',
    ),
  };
}

// 校验断言：Card 内错误提示（normalize_upstream_error 的 FormItem 校验）
async function expectNormalizeUpstreamErrorError(
  page,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = normalizeUpstreamErrorCard(page, drawerTitle);
  const matcher = message instanceof RegExp ? message : String(message);
  await expect(
    card
      .locator('.ivu-form-item-error-tip')
      .filter({ hasText: matcher })
      .first(),
  ).toBeVisible({ timeout: 10000 });
}

// max_body_bytes 校验：InputNumber（min=0/max=4194304/precision=0）会钳制越界输入，
// 越界值只能通过 Vue 模型注入触发 FormItem 校验（对齐 setKeyAffinityFieldViaModel）
async function setNormalizeUpstreamErrorFieldViaModel(
  page,
  field,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const injected = await page.evaluate(
    (payload) => {
      const allForms = document.querySelectorAll('.ivu-form');
      for (const formEl of allForms) {
        const formVue = formEl.__vue__;
        if (!formVue) continue;
        let current = formVue;
        for (let i = 0; i < 10 && current; i++) {
          if (
            current.formData &&
            'model_mappings' in current.formData &&
            current.formData.normalize_upstream_error
          ) {
            current.formData.normalize_upstream_error[payload.field] = payload.value;
            current.$forceUpdate();
            if (current.$refs.formData) {
              current.$nextTick(() => {
                try {
                  current.$refs.formData.validateField(
                    `normalize_upstream_error.${payload.field}`,
                  );
                } catch (e) {
                  /* 字段未挂载：无校验可执行 */
                }
              });
            }
            return true;
          }
          current = current.$parent;
        }
      }
      return false;
    },
    { field, value },
  );
  if (!injected) {
    throw new Error(`无法通过表单设置 normalize_upstream_error.${field} 字段`);
  }
  await waitAfterResourceMutation(page, 200);
}

// 复查页 / 详情页的「上游错误归一」区块（Review 组件：已配置时为 policy-card
// 内的 review-item；接口未返回该对象时为「上游错误归一: -」缺省行）
function normalizeReviewBlock(page, drawerTitle) {
  return ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body')
    .locator('ul')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.normalizeUpstreamErrorCard })
    .first();
}

// 读取复查/详情区块展示值（review-label → review-value）；缺省分支（接口未返回
// 该对象）返回 enabled='-'、其余字段 null
async function getNormalizeReviewValues(page, drawerTitle) {
  const block = normalizeReviewBlock(page, drawerTitle);
  if ((await block.locator('.review-item').count()) === 0) {
    const value = ((await block.locator('li.value').first().textContent()) || '').trim();
    return {
      enabled: value,
      streamEnabled: null,
      redactSecrets: null,
      unrecognizedAction: null,
      maxBodyBytes: null,
    };
  }
  const read = async (label) => {
    const item = block.locator('.review-item').filter({ hasText: label }).first();
    if ((await item.count()) === 0) return null;
    return ((await item.locator('.review-value').textContent()) || '').trim();
  };
  const enabled = await read(DOC_BUSINESS_CLUSTER.normalizeEnabledLabel);
  return {
    enabled,
    streamEnabled: await read(DOC_BUSINESS_CLUSTER.normalizeStreamEnabledLabel),
    redactSecrets: await read(DOC_BUSINESS_CLUSTER.normalizeRedactSecretsLabel),
    unrecognizedAction: await read(
      DOC_BUSINESS_CLUSTER.normalizeUnrecognizedActionLabel,
    ),
    maxBodyBytes: await read(DOC_BUSINESS_CLUSTER.normalizeMaxBodyBytesLabel),
  };
}

// 复查页/详情页指定区块（ul.detail-row-block，policy-card 的 review-item 结构）
// 逐项读取：返回 { review-label: review-value }；区块缺省（接口未返回该对象）
// 时为「标题: -」行，返回 { '-': '-' } 形态的缺省标记（enabled 取 li.value 文本）
async function getReviewBlockValues(page, drawerTitle, blockTitle) {
  const block = ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body')
    .locator('ul.detail-row-block')
    .filter({ hasText: blockTitle })
    .first();
  const items = block.locator('.review-item');
  if ((await items.count()) === 0) {
    const value = ((await block.locator('li.value').first().textContent()) || '').trim();
    return { 缺省: value };
  }
  const result = {};
  for (let i = 0; i < (await items.count()); i += 1) {
    const label = (
      (await items.nth(i).locator('.review-label').textContent()) || ''
    ).replace(/[:：]\s*$/, '').trim();
    const value = (
      (await items.nth(i).locator('.review-value').textContent()) || ''
    ).trim();
    result[label] = value;
  }
  return result;
}

// 复查页/详情页「服务鉴权 Keys」表格（mapping-table：Key / 权重两列），
// 返回 [{ name, weight }]；无 Keys 时为「-」缺省行，返回 []
async function getReviewKeysTable(page, drawerTitle) {
  const block = ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body')
    .locator('ul.detail-row-block')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.serviceAuthKeysCard })
    .first();
  const table = block.locator('table.mapping-table');
  if ((await table.count()) === 0) return [];
  const rows = table.locator('tbody tr');
  const result = [];
  for (let i = 0; i < (await rows.count()); i += 1) {
    const cells = rows.nth(i).locator('td');
    result.push({
      name: ((await cells.nth(0).textContent()) || '').trim(),
      weight: ((await cells.nth(1).textContent()) || '').trim(),
    });
  }
  return result;
}

// 模型重定向 Card 内的映射表格作用域
function modelMappingTable(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.modelRedirectCard })
    .locator('table tbody');
}

/** 模型重定向映射行数（BC-E-10 删行断言） */
async function getModelMappingRowCount(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return modelMappingTable(page, drawerTitle).locator('tr').count();
}

/** 删除第 rowIndex 行模型映射（行内「删除」按钮，removeModelMapping） */
async function deleteModelMappingRow(page, rowIndex, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  const row = modelMappingTable(page, drawerTitle).locator('tr').nth(rowIndex);
  await row.getByRole('button', { name: /^删除$/ }).click();
  await waitAfterResourceMutation(page, 300);
}

// provider（所属服务商）下拉：使用 el-select 版 selectProvider（见 fillModelStep 上方）
// 保留 fillProvider 作为兼容别名：选择 provider 并等待详情联动
async function fillProvider(
  page,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await selectProvider(page, value, drawerTitle);
}

async function fillScheduleStep(
  page,
  { bfeCluster, subClusterName, weight },
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const body = drawer.locator('.ivu-drawer-body');
  const table = body.locator('table').first();
  const rows = table.locator('tbody tr');

  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const rowText = await row.textContent();
    if (rowText.includes(subClusterName)) {
      const weightInput = row.locator('.ivu-input-number input');
      await weightInput.fill('');
      await weightInput.fill(String(weight));
      await waitAfterResourceMutation(page, 300);
      return;
    }
  }
}

async function submitCreateBusinessClusterAndWaitForSuccess(page) {
  await waitForClustersListResponse(page, () => clickWizardSubmit(page));
}

function modelStepBody(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return ivuDrawer(page).withTitle(drawerTitle).locator('.ivu-drawer-body');
}

async function getModelListHostValue(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  // 2026-08-06: host 由 textarea 改为只读文本，不再是可编辑的 textarea
  const endpointRow = modelStepBody(page, drawerTitle)
    .locator('.ivu-form-item')
    .filter({ hasText: '模型列表接口' });
  const textarea = endpointRow.locator('textarea');
  const isVisible = await textarea.isVisible().catch(() => false);
  if (isVisible) {
    return (await textarea.inputValue()).trim();
  }
  // 只读文本模式：尝试多种可能的只读元素选择器
  // 2026-08-06: host 展示在 .endpoint-host span 中
  const hostText = endpointRow.locator(
    '.endpoint-host, .model-host-text, .readonly-host, [readonly], .host-text',
  );
  return (await hostText.first().textContent()).trim();
}

async function getModelListPortValue(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  // TODO: 需要根据实际 UI 确定端口显示元素的 selector
  // 端口可能是单独的输入框/文本，也可能是组合 URL 的一部分
  const endpointRow = modelStepBody(page, drawerTitle)
    .locator('.ivu-form-item')
    .filter({ hasText: '模型列表接口' });

  // 尝试1：查找带端口 placeholder 的 input
  const portInput = endpointRow.locator(
    'input[placeholder*="端口" i], input[placeholder*="port" i]',
  );
  const portInputVisible = await portInput
    .first()
    .isVisible()
    .catch(() => false);
  if (portInputVisible) {
    return (await portInput.first().inputValue()).trim();
  }

  // 尝试2：查找 endpointRow 中的数字输入框
  const numberInput = endpointRow.locator('.ivu-input-number-input').first();
  const numberInputVisible = await numberInput.isVisible().catch(() => false);
  if (numberInputVisible) {
    return (await numberInput.inputValue()).trim();
  }

  // 尝试3：从 host 文本中提取端口（如 "172.19.1.187:31801"）
  const hostValue = await getModelListHostValue(page, drawerTitle);
  const portMatch = hostValue.match(/:(\d+)/);
  if (portMatch) {
    return portMatch[1];
  }

  // 尝试4：查找 endpointRow 中第3个 input（protocol=select, host=input/textarea, port=input）
  const inputs = endpointRow.locator('input');
  const inputCount = await inputs.count();
  if (inputCount >= 3) {
    const portValue = await inputs
      .nth(2)
      .inputValue()
      .catch(() => '');
    if (portValue) {
      return portValue.trim();
    }
  }

  return '';
}

async function clickFetchModels(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const fetchBtn = body
    .locator('.ivu-form-item')
    .filter({ hasText: '模型' })
    .locator('button')
    .filter({ hasText: /获取|fetch/i });
  await expect(fetchBtn).toBeVisible();
  await fetchBtn.click();
  await page.waitForResponse(
    (response) =>
      response.url().includes('get-models-from-provider') &&
      response.request().method() === 'POST',
    { timeout: 15000 },
  );
}

async function expectModelDropdownPopulated(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const modelSelect = body
    .locator('.ivu-form-item')
    .filter({ hasText: '模型' })
    .filter({ hasNotText: '重定向' })
    .first()
    .locator('.ivu-select-selection');
  await modelSelect.click();
  await expect(
    page.locator('.ivu-select-dropdown:visible .ivu-select-item').first(),
  ).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');
}

async function addModelListHeader(
  page,
  key,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  await body.getByRole('button', { name: /Header/i }).click();
  const pair = body.locator('.header-pair').last();
  await pair.locator('input[placeholder="Header Key"]').fill(key);
  await pair.locator('input[placeholder="Header Value"]').fill(value);
}

async function fillCreateWizardThroughReview(
  page,
  {
    clusterName,
    protocol = 'https',
    hashStrategy = 'CLIENT_ID_ONLY',
    health = {
      failureThreshold: 10,
      healthInterval: 1000,
      healthHost: 'example.com',
      healthUri: '/example',
      expectedStatus: 200,
    },
    model = {
      provider: 'huoshancodeplan',
      models: ['Qwen/Qwen2.5-3B-Instruct'],
    },
  } = {},
) {
  // 2026-08-27 5 步向导：基础配置 → 超时和重传 → 被动健康检查 → 大模型配置 → 复查&检查（无实例配置）
  await openCreateBusinessClusterDrawer(page);
  await fillBasicStep(page, { clusterName, protocol, hashStrategy });
  await clickWizardNext(page); // 基础配置 -> 超时和重传
  await clickWizardNext(page); // 超时和重传 -> 被动健康检查
  await fillHealthStep(page, health);
  await clickWizardNext(page); // 被动健康检查 -> 大模型配置
  await fillModelStep(page, model);
  await clickWizardNext(page); // 大模型配置 -> 复查&检查
  await expectWizardStep(page, '复查&检查');
}

async function attemptDeleteBusinessCluster(page, clusterName) {
  await businessClusterTable(page).rowAction(clusterName, '删除').click();
  const modal = page.locator('.ivu-modal-wrap').filter({ hasText: '是否删除' });
  await expect(modal).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (req) =>
        req.request().method() === 'DELETE' && req.url().includes('/clusters/'),
      { timeout: 15000 },
    ),
    modal.getByRole('button', { name: '确定' }).click(),
  ]);
  await waitAfterResourceMutation(page, 300);
  let body = {};
  try {
    body = await response.json();
  } catch (_error) {
    body = {};
  }
  return {
    ok: response.ok() && body.ErrNum === 200,
    status: response.status(),
    body,
  };
}

async function expectBusinessClusterDetailProtocol(
  page,
  clusterName,
  expectedProtocol,
) {
  await openBusinessClusterDetail(page, clusterName);
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.businessClusterDetail);
  const body = drawer.locator('.ivu-drawer-body');
  await expect(
    body.locator('.panel').filter({ hasText: '基础配置' }).first(),
  ).toBeVisible();
  await expect(
    body
      .locator('.value')
      .filter({ hasText: new RegExp(`^${expectedProtocol}$`, 'i') })
      .first(),
  ).toBeVisible();
  await closeBusinessClusterDetail(page);
}

async function expectEditWizardProtocolMatches(
  page,
  clusterName,
  expectedProtocol,
) {
  await openEditBusinessClusterDrawer(page, clusterName);
  await expectWizardStep(page, '基础配置', DRAWER_TITLE.editBusinessCluster);
  const body = ivuDrawer(page)
    .withTitle(DRAWER_TITLE.editBusinessCluster)
    .locator('.ivu-drawer-body');
  await expect(
    body
      .locator('.ivu-form-item')
      .filter({
        has: page.locator('.ivu-form-item-label', { hasText: /^\s*协议\s*$/ }),
      })
      .locator('.ivu-select-selected-value'),
  ).toContainText(expectedProtocol);
  await closeBusinessClusterEditDrawer(page);
}

async function expectEditWizardProviderMatches(
  page,
  clusterName,
  expectedProvider,
) {
  await openEditBusinessClusterDrawer(page, clusterName);
  await expectWizardStep(page, '基础配置', DRAWER_TITLE.editBusinessCluster);

  // 2026-08-27 5 步向导：基础配置 -> 超时和重传 -> 被动健康检查 -> 大模型配置
  await clickWizardNext(page);
  await clickWizardNext(page);
  await clickWizardNext(page);
  await expectWizardStep(page, '大模型配置', DRAWER_TITLE.editBusinessCluster);

  // 验证所属服务商已自动回显，选中值与 API 返回的 provider 一致
  await expectProviderValue(
    page,
    expectedProvider,
    DRAWER_TITLE.editBusinessCluster,
  );

  await closeBusinessClusterEditDrawer(page);
}

async function searchBusinessCluster(page, keyword) {
  await businessClusterTable(page).search(
    keyword,
    BUSINESS_CLUSTER_SEARCH_PLACEHOLDER,
  );
}

async function searchBusinessClusterAndWait(page, keyword) {
  await waitForClustersListResponse(page, () =>
    searchBusinessCluster(page, keyword),
  );
}

async function expectBusinessClusterVisibleInAllPages(
  page,
  clusterName,
  timeout = 30000,
) {
  await expectRowVisibleInAllPages(
    page,
    businessClusterTable(page),
    clusterName,
    waitForClustersListResponse,
    'AI业务集群',
    timeout,
  );
}

async function ensureBusinessClusterRowVisible(page, clusterName) {
  await searchBusinessClusterAndWait(page, clusterName);
  await expectBusinessClusterVisibleInAllPages(page, clusterName);
}

// API 造数后刷新列表（UI 列表仅在页面加载时拉取 GET /clusters）
async function refreshBusinessClusterList(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '添加集群' })).toBeVisible({
    timeout: 15000,
  });
  await waitAfterResourceMutation(page, 500);
}

async function confirmDeleteBusinessCluster(page) {
  const modal = page.locator('.ivu-modal-wrap').filter({ hasText: '是否删除' });
  await expect(modal).toBeVisible();
  await waitForClustersListResponse(page, () =>
    modal.getByRole('button', { name: '确定' }).click(),
  );
  await expect(modal).toBeHidden({ timeout: 10000 });
}

async function expectBusinessClusterFormFieldError(page, message) {
  await ivuDrawer(page)
    .form(DRAWER_TITLE.createBusinessCluster)
    .expectFieldError('集群名称', message);
}

async function cancelCreateBusinessCluster(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.createBusinessCluster);
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.createBusinessCluster),
  ).toBeHidden();
}

async function expectCreateBusinessClusterDrawerHidden(page) {
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.createBusinessCluster),
  ).toBeHidden();
}

// ===== 2026-09-09 均衡模式配置（RM-BC-93~103）=====

function balanceModeCard(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.balanceModeConfigCard });
}

// 获取 balance_mode 当前值（WRR/EPP）
// 注意：iView Select 选项可能显示中文注释如 "WRR（加权轮询）"，此处剥离括号中文注释
async function getBalanceModeValue(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  const card = balanceModeCard(page, drawerTitle);
  const selectedValue = await card
    .locator('.ivu-select-selected-value')
    .first()
    .textContent();
  const text = (selectedValue || '').trim();
  const parenIndex = text.indexOf('（');
  return parenIndex > 0 ? text.substring(0, parenIndex) : text;
}

// 设置 balance_mode（WRR/EPP）
// 注意：iView Select 选项可能显示中文注释如 "EPP（弹性代理池）"，使用子串匹配
async function setBalanceMode(page, mode, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  const card = balanceModeCard(page, drawerTitle);
  await card.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: mode })
    .first()
    .click();
  // 关闭下拉菜单，避免后续定位器匹配到下拉列表中的元素
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await waitAfterResourceMutation(page, 300);
}

// iView Select 选项文案为「英文值（中文注释）」，如下拉项 "balanced（均衡，默认）"。
// 2026-10-09 v0.6 破坏性重构：load_profile 枚举 queue-first/balanced/kv-first；
// affinity 枚举 off/low/medium/high（旧 latency-first 等枚举已移除）。
// 剥离选项中文注释，取英文值："balanced（均衡，默认）" -> "balanced"
function stripOptionComment(text) {
  const raw = (text || '').trim();
  const parenIndex = raw.indexOf('（');
  return (parenIndex > 0 ? raw.substring(0, parenIndex) : raw).trim();
}

// 在均衡模式 Card 内按 label 定位表单控件（新字段按 label 精确定位，
// 避免 flow_control 嵌套卡片内 InputNumber 干扰 nth 序号）
function eppFormItem(card, label) {
  return card.locator('.ivu-form-item').filter({ hasText: label }).first();
}

// 按 label 精确匹配表单项：「会话亲和性」与「会话亲和性 Header」互为前缀，
// hasText 会同时命中两项，switch/header 取值必须用精确匹配。
// 未命中时返回空集合（count() === 0），字段因 affinity=off 被 v-if 隐藏时即为此状态。
async function eppFormItemExact(card, label) {
  const items = card.locator('.ivu-form-item');
  const index = await items.evaluateAll(
    (nodes, target) =>
      nodes.findIndex((node) => {
        const labelEl = node.querySelector('.ivu-form-item-label');
        return ((labelEl && labelEl.textContent) || '')
          .replace(/\s+/g, ' ')
          .trim() === target;
      }),
    label,
  );
  return index < 0 ? items.filter({ hasText: '\u0000' }) : items.nth(index);
}

// 读取表单项内 switch 状态；字段未渲染（v-if 隐藏）时返回 null
async function eppSwitchState(item) {
  const switchEl = item.locator('.ivu-switch').first();
  if ((await switchEl.count()) === 0 || !(await switchEl.isVisible())) {
    return null;
  }
  return switchEl.evaluate((el) => el.classList.contains('ivu-switch-checked'));
}

// 读取表单项内文本输入框的值；字段未渲染时返回 null
async function eppTextInputValue(item, selector = 'input') {
  const input = item.locator(selector).first();
  if ((await input.count()) === 0 || !(await input.isVisible())) {
    return null;
  }
  return (await input.inputValue()).trim();
}

// 读取表单项内 iView Select 的选中值（剥离「英文值（中文注释）」注释）；未渲染返回 null
async function eppSelectValue(item) {
  const selected = item.locator('.ivu-select-selected-value').first();
  if ((await selected.count()) === 0) {
    return null;
  }
  return stripOptionComment(await selected.textContent());
}

// 获取 epp_config 当前值；字段因 affinity=off 隐藏时对应键为 null
async function getEppConfigValues(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  const card = balanceModeCard(page, drawerTitle);
  const item = (label) => eppFormItemExact(card, label);

  return {
    schedulingProfile: await eppSelectValue(
      await item(DOC_BUSINESS_CLUSTER.schedulingProfileLabel),
    ),
    cacheAffinity: await eppSelectValue(
      await item(DOC_BUSINESS_CLUSTER.cacheAffinityLabel),
    ),
    prefixCacheAffinity: await eppSwitchState(
      await item(DOC_BUSINESS_CLUSTER.prefixCacheAffinityLabel),
    ),
    sessionAffinityEnabled: await eppSwitchState(
      await item(DOC_BUSINESS_CLUSTER.sessionAffinityEnabledLabel),
    ),
    sessionAffinityHeader: await eppTextInputValue(
      await item(DOC_BUSINESS_CLUSTER.sessionAffinityHeaderLabel),
    ),
    fallbackOnEmpty: await eppSwitchState(
      await item(DOC_BUSINESS_CLUSTER.fallbackOnEmptyLabel),
    ),
    kvCacheUtilizationMax: await eppTextInputValue(
      await item(DOC_BUSINESS_CLUSTER.kvCacheUtilizationMaxLabel),
      '.ivu-input-number-input',
    ),
    waitingQueueMax: await eppTextInputValue(
      await item(DOC_BUSINESS_CLUSTER.waitingQueueMaxLabel),
      '.ivu-input-number-input',
    ),
    runningRequestsMax: await eppTextInputValue(
      await item(DOC_BUSINESS_CLUSTER.runningRequestsMaxLabel),
      '.ivu-input-number-input',
    ),
    metricsStalenessThresholdMs: await eppTextInputValue(
      await item(DOC_BUSINESS_CLUSTER.metricsStalenessThresholdMsLabel),
      '.ivu-input-number-input',
    ),
  };
}

// 按 label 定位 Card 内 InputNumber 输入框并填值（先清空，失焦触发 min/precision 约束）
async function fillEppNumberInput(card, label, value) {
  const item = await eppFormItemExact(card, label);
  const input = item.locator('.ivu-input-number-input').first();
  await input.fill('');
  await input.fill(String(value));
  await input.blur();
}

// 按 label 定位 Card 内 switch 并切换到目标状态
async function setEppSwitchByLabel(card, label, target) {
  const item = await eppFormItemExact(card, label);
  const switchEl = item.locator('.ivu-switch').first();
  if ((await switchEl.count()) === 0) {
    throw new Error(`未找到 label 为「${label}」的开关（字段当前可能已被隐藏）`);
  }
  const isChecked = await switchEl.evaluate((el) =>
    el.classList.contains('ivu-switch-checked'),
  );
  if (target !== isChecked) {
    await switchEl.click();
  }
}

// 按 label 选中 Card 内 iView Select 的下拉项
async function setEppSelectByLabel(page, card, label, optionText) {
  const item = await eppFormItemExact(card, label);
  await item.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
  await page
    .locator('.ivu-select-dropdown:visible .ivu-select-item')
    .filter({ hasText: optionText })
    .first()
    .click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// 设置 epp_config 各字段值
async function fillEppConfig(page, values, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  const card = balanceModeCard(page, drawerTitle);

  if (values.schedulingProfile !== undefined) {
    // 选项文案以英文值开头（如 "balanced（均衡，默认）"），按英文值子串匹配
    await setEppSelectByLabel(
      page,
      card,
      DOC_BUSINESS_CLUSTER.schedulingProfileLabel,
      values.schedulingProfile,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.cacheAffinity !== undefined) {
    await setEppSelectByLabel(
      page,
      card,
      DOC_BUSINESS_CLUSTER.cacheAffinityLabel,
      values.cacheAffinity,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.prefixCacheAffinity !== undefined) {
    await setEppSwitchByLabel(
      card,
      DOC_BUSINESS_CLUSTER.prefixCacheAffinityLabel,
      values.prefixCacheAffinity,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.sessionAffinityEnabled !== undefined) {
    await setEppSwitchByLabel(
      card,
      DOC_BUSINESS_CLUSTER.sessionAffinityEnabledLabel,
      values.sessionAffinityEnabled,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.sessionAffinityHeader !== undefined) {
    const item = await eppFormItemExact(
      card,
      DOC_BUSINESS_CLUSTER.sessionAffinityHeaderLabel,
    );
    await item.locator('input').first().fill(values.sessionAffinityHeader);
    await waitAfterResourceMutation(page, 200);
  }
  if (values.kvCacheUtilizationMax !== undefined) {
    await fillEppNumberInput(
      card,
      DOC_BUSINESS_CLUSTER.kvCacheUtilizationMaxLabel,
      values.kvCacheUtilizationMax,
    );
    await waitAfterResourceMutation(page, 200);
  }
  // ===== RM-BC-104~107 新增 EPP 调度参数字段 =====
  if (values.waitingQueueMax !== undefined) {
    await fillEppNumberInput(
      card,
      DOC_BUSINESS_CLUSTER.waitingQueueMaxLabel,
      values.waitingQueueMax,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.runningRequestsMax !== undefined) {
    await fillEppNumberInput(
      card,
      DOC_BUSINESS_CLUSTER.runningRequestsMaxLabel,
      values.runningRequestsMax,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.fallbackOnEmpty !== undefined) {
    await setEppSwitchByLabel(
      card,
      DOC_BUSINESS_CLUSTER.fallbackOnEmptyLabel,
      values.fallbackOnEmpty,
    );
    await waitAfterResourceMutation(page, 200);
  }
  if (values.metricsStalenessThresholdMs !== undefined) {
    await fillEppNumberInput(
      card,
      DOC_BUSINESS_CLUSTER.metricsStalenessThresholdMsLabel,
      values.metricsStalenessThresholdMs,
    );
    await waitAfterResourceMutation(page, 200);
  }
}

// ===== 2026-10-28 条件项隐藏 + .llm-form-grid 自适应网格（RM-BC-96~98、RM-BC-123）=====
// 大模型配置各卡由固定 Row(12+12) 改为 .llm-form-grid（flex-wrap，每项 width:50%），
// affinity=off 时条件项 v-if 不渲染，后续字段自动补位；同排判定用 getBoundingClientRect 的 top。

// 同一 flex 行内各项 top 坐标一致，四舍五入后允许 2px 误差
const GRID_ROW_TOLERANCE_PX = 2;

// 均衡模式卡片内 EPP 字段网格：卡片内第一个 .llm-form-grid
//（其后的网格属于「EPP 运行时参数」子卡，不在本组断言范围）
function eppConfigGrid(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return balanceModeCard(page, drawerTitle).locator('.llm-form-grid').first();
}

// 按卡片标题定位 LLM 配置区的分组卡片
function llmSectionCard(
  page,
  cardTitle,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({ hasText: cardTitle })
    .first();
}

// 任意分组卡片内的自适应网格（取卡片内第一个 .llm-form-grid）
function llmFormGrid(
  page,
  cardTitle,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return llmSectionCard(page, cardTitle, drawerTitle)
    .locator('.llm-form-grid')
    .first();
}

// 读取网格的可见项与行排布：每项取 label 文本与 getBoundingClientRect，
// 按 top 坐标聚合成行（行内按 left 排序，即视觉上的左右邻居）
async function getLlmFormGridLayout(grid) {
  const raw = await grid.evaluate((el) => {
    const gridRect = el.getBoundingClientRect();
    const nodes = Array.from(el.children).filter((child) =>
      child.classList.contains('llm-form-grid-item'),
    );
    return {
      width: Math.round(gridRect.width),
      items: nodes.map((node) => {
        const labelEl = node.querySelector('.ivu-form-item-label');
        const rect = node.getBoundingClientRect();
        return {
          label: ((labelEl && labelEl.textContent) || '')
            .replace(/\s+/g, ' ')
            .trim(),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
        };
      }),
    };
  });

  const rows = [];
  for (const item of raw.items) {
    const row = rows.find(
      (candidate) => Math.abs(candidate.y - item.y) <= GRID_ROW_TOLERANCE_PX,
    );
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }
  rows.sort((a, b) => a.y - b.y);
  rows.forEach((row) => row.items.sort((a, b) => a.x - b.x));

  return {
    width: raw.width,
    items: raw.items,
    rows: rows.map((row) => row.items.map((item) => item.label)),
  };
}

// EPP 配置网格布局快照：{ width, items[{label,x,y,width}], rows[[label...]] }
async function getEppGridLayout(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return getLlmFormGridLayout(eppConfigGrid(page, drawerTitle));
}

// EPP 网格已渲染字段的 label 顺序（DOM 顺序 = 视觉顺序）
async function getEppGridLabels(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  const layout = await getEppGridLayout(page, drawerTitle);
  return layout.items.map((item) => item.label);
}

// 断言 EPP 网格中指定字段已渲染
async function expectEppGridFieldVisible(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const labels = await getEppGridLabels(page, drawerTitle);
  expect(
    labels,
    `EPP 网格应渲染「${label}」，实际可见项：${JSON.stringify(labels)}`,
  ).toContain(label);
}

// 断言 EPP 网格中指定字段整体不渲染（v-if 而非 v-show：DOM 中不留占位节点）
async function expectEppGridFieldHidden(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const labels = await getEppGridLabels(page, drawerTitle);
  expect(
    labels,
    `「${label}」应整体隐藏不渲染，实际可见项：${JSON.stringify(labels)}`,
  ).not.toContain(label);
}

// 断言网格排布无空白块：每项 50% 宽（不整行拉伸）、除末行外每行 2 项、
// 单项只出现在末行（flex 换行下不会出现「左空白 + 右单项」）、无占位空元素
async function expectLlmFormGridNoBlankBlock(grid, label = '大模型配置网格') {
  const layout = await getLlmFormGridLayout(grid);
  expect(layout.items.length, `${label} 应有可见表单项`).toBeGreaterThan(0);

  layout.items.forEach((item) => {
    expect(item.label, `${label} 不应存在无 label 的占位项`).not.toBe('');
    const ratio = item.width / layout.width;
    expect(
      ratio,
      `${label}「${item.label}」应占 50% 宽，实际 ${(ratio * 100).toFixed(1)}%`,
    ).toBeGreaterThan(0.45);
    expect(
      ratio,
      `${label}「${item.label}」不应被拉伸成整行宽，实际 ${(ratio * 100).toFixed(1)}%`,
    ).toBeLessThan(0.6);
  });

  layout.rows.forEach((row, index) => {
    const isLastRow = index === layout.rows.length - 1;
    expect(
      row.length,
      `${label} 第 ${index + 1} 行最多并排 2 项，实际：${JSON.stringify(row)}`,
    ).toBeLessThanOrEqual(2);
    expect(
      row.length > 0,
      `${label} 第 ${index + 1} 行不应为空行`,
    ).toBe(true);
    if (!isLastRow) {
      expect(
        row.length,
        `${label} 第 ${index + 1} 行（非末行）应并排 2 项，实际：${JSON.stringify(row)}`,
      ).toBe(2);
    }
  });

  return layout;
}

// 断言 EPP 配置区不出现任何「off 时不生效」类提示：
// 无「不生效」文案、无「（off…）」后缀、无橙色提示元素
async function expectNoAffinityOffHint(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const grid = eppConfigGrid(page, drawerTitle);
  await expect(
    grid,
    '不应出现任何「off 时不生效」类提示文案',
  ).not.toContainText('不生效');
  await expect(
    grid,
    '字段名不应追加「（off 时不生效）」类后缀',
  ).not.toContainText('（off');
  await expect(
    grid.locator('.epp-off-hint'),
    '不应渲染 off 相关提示元素',
  ).toHaveCount(0);
}

// 断言指定 epp_config 字段的内联校验错误（message 省略则只断言有错误）
async function expectEppFieldError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = balanceModeCard(page, drawerTitle);
  const item = await eppFormItemExact(card, label);
  const tip = item.locator('.ivu-form-item-error-tip');
  await expect(tip).toBeVisible();
  if (message !== undefined) {
    await expect(tip).toHaveText(message);
  }
}

// 断言指定 epp_config 字段无内联校验错误
async function expectEppFieldErrorHidden(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = balanceModeCard(page, drawerTitle);
  const item = await eppFormItemExact(card, label);
  await expect(item.locator('.ivu-form-item-error-tip')).toHaveCount(0);
}

// 等待编辑集群的 GET 请求完成
async function waitForClusterGetResponse(page, action) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes('/clusters/') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
      { timeout: 15000 },
    ),
    action(),
  ]);
  return response;
}

// 等待集群复查请求（用于验证展示数据）
async function waitForClusterReviewRequest(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/clusters'),
      { timeout: 30000 },
    ),
    action(),
  ]);
  return request;
}

// ===== 2026-10-13 EPP 运行时参数（RM-BC-115~122）=====
// 「EPP 运行时参数」是 EPP 配置区内第 2 层 Card（外层「均衡模式配置」Card 的 body 内），
// 外层 Card 的 hasText 也包含该标题，故按「自有 card-head 标题」过滤，避免 hasText 命中两层。
// 分组子字段（7 个）：关闭健康检查（switch）、健康检查间隔/冷却时长/连接超时/调用超时
// （DurationInput：数字框 + 单位下拉 ms/s/m）、失败次数阈值/成功次数阈值（InputNumber min=1）；
// 组合写法（如 1m30s）无法拆分时该字段回退为纯文本输入（无 .ivu-input-group / 单位下拉）。

function eppRuntimeCard(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({
      has: page.locator(
        ':scope > .ivu-card-head:has-text("' +
          DOC_BUSINESS_CLUSTER.eppRuntimeCard +
          '")',
      ),
    });
}

// ===== 2026-11-02 流控卡片（RM-BC-124）=====
// 「流控配置」与「EPP 运行时参数」同为 EPP 配置区内层 Card（外层「均衡模式配置」Card 的
// body 内），外层 hasText 也包含该标题，故同样按「自有 card-head 标题」过滤。
function flowControlCard(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return modelStepBody(page, drawerTitle)
    .locator('.llm-section-card')
    .filter({
      has: page.locator(
        ':scope > .ivu-card-head:has-text("' +
          DOC_BUSINESS_CLUSTER.flowControlCard +
          '")',
      ),
    });
}

// 填写流控卡片内 InputNumber 字段（队列 TTL / 无端点队列 TTL / 最大请求数）
async function fillFlowControlNumber(
  page,
  label,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await fillEppNumberInput(flowControlCard(page, drawerTitle), label, value);
  await waitAfterResourceMutation(page, 200);
}

function eppRuntimeCardHead(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return eppRuntimeCard(page, drawerTitle).locator(':scope > .ivu-card-head');
}

function eppRuntimeDurationLabels() {
  return [
    DOC_BUSINESS_CLUSTER.eppCheckIntervalLabel,
    DOC_BUSINESS_CLUSTER.eppCooldownLabel,
    DOC_BUSINESS_CLUSTER.eppConnectTimeoutLabel,
    DOC_BUSINESS_CLUSTER.eppCallTimeoutLabel,
  ];
}

function eppRuntimeThresholdLabels() {
  return [
    DOC_BUSINESS_CLUSTER.eppFailThresholdLabel,
    DOC_BUSINESS_CLUSTER.eppSuccessThresholdLabel,
  ];
}

function eppRuntimeLabels() {
  return [
    DOC_BUSINESS_CLUSTER.eppCheckDisabledLabel,
    ...eppRuntimeDurationLabels(),
    ...eppRuntimeThresholdLabels(),
  ];
}

// 2026-10-13 精简后仅 3 个字段保留 ? 提示图标
function eppRuntimeHelpIconLabels() {
  return [
    DOC_BUSINESS_CLUSTER.eppCheckDisabledLabel,
    DOC_BUSINESS_CLUSTER.eppCooldownLabel,
    DOC_BUSINESS_CLUSTER.eppCallTimeoutLabel,
  ];
}

function eppRuntimeWithoutHelpIconLabels() {
  return [
    DOC_BUSINESS_CLUSTER.eppCheckIntervalLabel,
    ...eppRuntimeThresholdLabels(),
    DOC_BUSINESS_CLUSTER.eppConnectTimeoutLabel,
  ];
}

async function expectEppRuntimeCardVisible(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await expect(eppRuntimeCard(page, drawerTitle)).toHaveCount(1);
  await expect(eppRuntimeCard(page, drawerTitle)).toBeVisible();
}

async function expectEppRuntimeCardHidden(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  await expect(eppRuntimeCard(page, drawerTitle)).toHaveCount(0);
}

// 分组构成：7 子字段 + 4 复合 duration（数字框 + 单位下拉）+ 2 整数阈值
async function expectEppRuntimeFieldComposition(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = eppRuntimeCard(page, drawerTitle);
  await expect(card).toBeVisible();
  await expect(card.locator('.ivu-form-item')).toHaveCount(7);
  for (const label of eppRuntimeLabels()) {
    await expect(eppFormItem(card, label), `子字段「${label}」应展示`).toBeVisible();
  }
  await expect(
    eppFormItem(card, DOC_BUSINESS_CLUSTER.eppCheckDisabledLabel).locator(
      '.ivu-switch',
    ),
    '「关闭后台健康检查」应为 switch 开关',
  ).toHaveCount(1);
  for (const label of eppRuntimeDurationLabels()) {
    const item = eppFormItem(card, label);
    await expect(
      item.locator('.ivu-input-group'),
      `duration 字段「${label}」应为「数字框 + 单位下拉」复合控件`,
    ).toHaveCount(1);
    await expect(item.locator('input.ivu-input')).toHaveCount(1);
    await expect(item.locator('.ivu-select-selected-value')).toHaveCount(1);
  }
  for (const label of eppRuntimeThresholdLabels()) {
    await expect(
      eppFormItem(card, label).locator('.ivu-input-number'),
      `阈值字段「${label}」应为整数数字框（InputNumber）`,
    ).toHaveCount(1);
  }
}

async function expectEppRuntimeHelpIcons(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = eppRuntimeCard(page, drawerTitle);
  await expect(
    card.locator('.provider-help-icon'),
    '? 提示图标应仅保留 3 个字段',
  ).toHaveCount(3);
  for (const label of eppRuntimeHelpIconLabels()) {
    await expect(
      eppFormItem(card, label).locator('.provider-help-icon'),
      `字段「${label}」应保留 ? 提示图标`,
    ).toHaveCount(1);
  }
  for (const label of eppRuntimeWithoutHelpIconLabels()) {
    await expect(
      eppFormItem(card, label).locator('.provider-help-icon'),
      `字段「${label}」不应有 ? 提示图标`,
    ).toHaveCount(0);
  }
}

// 读取单个 duration 字段：{ value, unit, raw }
// raw=true 表示组合写法（如 1m30s）回退为纯文本输入，无单位下拉
async function getEppRuntimeDurationValue(card, label) {
  const item = eppFormItem(card, label);
  const isCombo = (await item.locator('.ivu-input-group').count()) > 0;
  const value = await item.locator('input.ivu-input').first().inputValue();
  const unit = isCombo
    ? (await item.locator('.ivu-select-selected-value').first().innerText()).trim()
    : null;
  return { value, unit, raw: !isCombo };
}

async function getEppRuntimeValues(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = eppRuntimeCard(page, drawerTitle);
  const readNumber = (label) =>
    eppFormItem(card, label).locator('.ivu-input-number-input').first().inputValue();
  return {
    disabled: await eppFormItem(card, DOC_BUSINESS_CLUSTER.eppCheckDisabledLabel)
      .locator('.ivu-switch')
      .first()
      .evaluate((el) => el.classList.contains('ivu-switch-checked')),
    checkInterval: await getEppRuntimeDurationValue(
      card,
      DOC_BUSINESS_CLUSTER.eppCheckIntervalLabel,
    ),
    failThreshold: await readNumber(DOC_BUSINESS_CLUSTER.eppFailThresholdLabel),
    cooldown: await getEppRuntimeDurationValue(
      card,
      DOC_BUSINESS_CLUSTER.eppCooldownLabel,
    ),
    successThreshold: await readNumber(
      DOC_BUSINESS_CLUSTER.eppSuccessThresholdLabel,
    ),
    connectTimeout: await getEppRuntimeDurationValue(
      card,
      DOC_BUSINESS_CLUSTER.eppConnectTimeoutLabel,
    ),
    callTimeout: await getEppRuntimeDurationValue(
      card,
      DOC_BUSINESS_CLUSTER.eppCallTimeoutLabel,
    ),
  };
}

// 默认值：disabled=false、间隔 2+s、失败阈值 3、冷却 45+s、成功阈值 2、连接超时 500+ms、调用超时 3+s
async function expectEppRuntimeDefaultValues(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const values = await getEppRuntimeValues(page, drawerTitle);
  const dft = DOC_BUSINESS_CLUSTER.defaultEppRuntime;
  expect(values.disabled, '关闭后台健康检查默认关闭').toBe(dft.check.disabled);
  expect(values.checkInterval, '健康检查间隔默认 2 + s').toEqual({
    value: '2',
    unit: 's',
    raw: false,
  });
  expect(values.failThreshold, '失败次数阈值默认 3').toBe(
    String(dft.check.fail_threshold),
  );
  expect(values.cooldown, '冷却时长默认 45 + s').toEqual({
    value: '45',
    unit: 's',
    raw: false,
  });
  expect(values.successThreshold, '成功次数阈值默认 2').toBe(
    String(dft.check.success_threshold),
  );
  expect(values.connectTimeout, '连接超时默认 500 + ms').toEqual({
    value: '500',
    unit: 'ms',
    raw: false,
  });
  expect(values.callTimeout, '调用超时默认 3 + s').toEqual({
    value: '3',
    unit: 's',
    raw: false,
  });
  return values;
}

// 单位下拉选项（ms/s/m）
async function expectEppRuntimeUnitOptions(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const item = eppFormItem(eppRuntimeCard(page, drawerTitle), label);
  await item.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
  const options = (
    await item.locator('.ivu-select-dropdown .ivu-select-item').allInnerTexts()
  ).map((text) => text.trim());
  expect(options, `duration 字段「${label}」的单位选项`).toEqual(
    DOC_BUSINESS_CLUSTER.eppDurationUnits,
  );
  await item.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
}

async function selectEppRuntimeDurationUnit(
  page,
  label,
  unit,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const item = eppFormItem(eppRuntimeCard(page, drawerTitle), label);
  await item.locator('.ivu-select-selection').first().click();
  await page.waitForTimeout(200);
  await item
    .locator('.ivu-select-dropdown .ivu-select-item')
    .filter({ hasText: new RegExp('^' + unit + '$') })
    .first()
    .click();
  await page.waitForTimeout(200);
  await waitAfterResourceMutation(page, 150);
}

// 填 duration 字段：先切单位再填数值（切单位会按物理时长换算数值），空串 = 未设置
async function fillEppRuntimeDuration(
  page,
  label,
  { value, unit } = {},
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const card = eppRuntimeCard(page, drawerTitle);
  const item = eppFormItem(card, label);
  if (unit) {
    const isCombo = (await item.locator('.ivu-input-group').count()) > 0;
    const currentUnit = isCombo
      ? (await item.locator('.ivu-select-selected-value').first().innerText()).trim()
      : null;
    if (currentUnit !== unit) {
      await selectEppRuntimeDurationUnit(page, label, unit, drawerTitle);
    }
  }
  const input = item.locator('input.ivu-input').first();
  await input.fill('');
  if (value !== undefined && value !== null && value !== '') {
    await input.fill(String(value));
  }
  await input.blur();
  await waitAfterResourceMutation(page, 150);
}

// 逐字输入 duration 数字框（用于「仅接受数字与小数点」断言），返回输入框最终显示值
async function typeEppRuntimeDuration(
  page,
  label,
  text,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const item = eppFormItem(eppRuntimeCard(page, drawerTitle), label);
  const input = item.locator('input.ivu-input').first();
  await input.fill('');
  await input.pressSequentially(text, { delay: 40 });
  await input.blur();
  await waitAfterResourceMutation(page, 150);
  return input.inputValue();
}

async function fillEppRuntimeThreshold(
  page,
  label,
  value,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const input = eppFormItem(eppRuntimeCard(page, drawerTitle), label)
    .locator('.ivu-input-number-input')
    .first();
  await input.fill('');
  if (value !== undefined && value !== null && value !== '') {
    await input.fill(String(value));
  }
  await input.blur();
  await waitAfterResourceMutation(page, 150);
}

async function expectEppRuntimeSwitchState(
  page,
  expected,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const switchEl = eppFormItem(
    eppRuntimeCard(page, drawerTitle),
    DOC_BUSINESS_CLUSTER.eppCheckDisabledLabel,
  )
    .locator('.ivu-switch')
    .first();
  const checked = await switchEl.evaluate((el) =>
    el.classList.contains('ivu-switch-checked'),
  );
  expect(checked, '「关闭后台健康检查」开关状态').toBe(expected);
  return switchEl;
}

async function toggleEppRuntimeSwitch(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const switchEl = eppFormItem(
    eppRuntimeCard(page, drawerTitle),
    DOC_BUSINESS_CLUSTER.eppCheckDisabledLabel,
  )
    .locator('.ivu-switch')
    .first();
  await switchEl.click();
  await waitAfterResourceMutation(page, 200);
}

async function expectEppRuntimeFieldError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const item = eppFormItem(eppRuntimeCard(page, drawerTitle), label);
  await expect(
    item.locator('.ivu-form-item-error-tip'),
    `字段「${label}」的表单校验提示`,
  ).toHaveText(message);
}

async function expectEppRuntimeFieldErrorHidden(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const item = eppFormItem(eppRuntimeCard(page, drawerTitle), label);
  await expect(
    item.locator('.ivu-form-item-error-tip'),
    `字段「${label}」不应有校验提示`,
  ).toHaveCount(0);
}

// 复查页 / 详情页的「EPP 运行时参数」区块（li.title + li.value）
function eppRuntimeReviewBlock(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return modelStepBody(page, drawerTitle)
    .locator('ul')
    .filter({
      has: page.locator(
        'li.title:has-text("' + DOC_BUSINESS_CLUSTER.eppRuntimeReviewTitle + '")',
      ),
    })
    .first();
}

async function getReviewEppRuntimeValues(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const items = eppRuntimeReviewBlock(page, drawerTitle).locator('.review-item');
  const count = await items.count();
  const values = {};
  for (let i = 0; i < count; i += 1) {
    const label = (await items.nth(i).locator('.review-label').innerText())
      .replace(/[:：]\s*$/, '')
      .trim();
    const value = (await items.nth(i).locator('.review-value').innerText()).trim();
    values[label] = value;
  }
  return values;
}

async function expectReviewEppRuntimeValues(
  page,
  expected,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const values = await getReviewEppRuntimeValues(page, drawerTitle);
  expect(
    Object.keys(values).length,
    '复查页 / 详情页「EPP 运行时参数」应展示 7 项',
  ).toBe(7);
  for (const [label, value] of Object.entries(expected)) {
    expect(values[label], `复查页 / 详情页「${label}」`).toBe(value);
  }
  return values;
}

// 未配置（epp_runtime = null）时展示「未配置（BFE 补默认）」
async function expectReviewEppRuntimeUnset(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const block = eppRuntimeReviewBlock(page, drawerTitle);
  await expect(block).toBeVisible();
  await expect(block.locator('.empty-text')).toHaveText(
    DOC_BUSINESS_CLUSTER.eppRuntimeUnsetHint,
  );
}

async function expectEppRuntimeToast(page, text) {
  await new IvuMessageComponent(page).expectText(text);
}

// 断言全局提示（iView Message 渲染在 body 级，不在抽屉 DOM 内）
async function expectToast(page, text) {
  await new IvuMessageComponent(page).expectText(text);
}

// 记录本轮是否发起过 POST /clusters（用于「校验失败不发起提交」断言）
function watchClusterCreateRequests(page) {
  const state = { count: 0 };
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/clusters')) {
      state.count += 1;
    }
  });
  return state;
}

// ---------------------------------------------------------------------------
// 只读管理员视角（docs/business-cluster/02-功能测试用例/02f-只读视角.md RM-BC-RO-01）
// ---------------------------------------------------------------------------

/** 只读视角相关文案（对齐 src/modules/Clusters/* 实际 UI 文案） */
const RO_CLUSTER_LABEL = {
  addCluster: '添加集群',
  detail: '详情',
  edit: '编辑',
  del: '删除',
  submit: '提交',
  nextStep: '下一步',
  lastStep: '上一步',
  basicConfigPanel: '基础配置',
};

/** 前端路由（src/router/router.js `path: 'cluster'`） */
const BUSINESS_CLUSTER_PATH = '/cluster';

/**
 * 只读角色写操作的后端拒绝语义（ai-gateway-api `lib/xerror/resolve.go`
 * etAuthorizateFail → 402 + `Feature Access Deny`；02f 文档写的 403 与实现不符）。
 */
const RO_WRITE_DENIED = { status: 402, message: 'Feature Access Deny' };

/** 列表页根节点（src/modules/Clusters/index.vue 根 div.clusters） */
function clusterPageRoot(page) {
  return page.locator('.clusters');
}

/**
 * 列表页「添加集群」按钮：`v-has`（src/modules/Clusters/index.vue:33）。
 * 用 CSS 定位——role 定位不匹配 display:none 元素，无法断言 `.v-has-hidden`。
 */
function clusterListAddBtn(page) {
  return page
    .locator('.clusters > button.ivu-btn')
    .filter({ hasText: RO_CLUSTER_LABEL.addCluster });
}

/** 列表行内操作按钮集合（render 内 `directives: [{ name: 'has' }]`，index.vue:161/180） */
function clusterRowActionButtons(page, clusterName) {
  return businessClusterTable(page)
    .rowByText(clusterName)
    .locator('button.ivu-btn');
}

/** 列表行内写按钮（编辑 / 删除）：CSS 定位，用于 `.v-has-hidden` 断言 */
function clusterRowWriteBtn(page, clusterName, label) {
  return clusterRowActionButtons(page, clusterName).filter({ hasText: label });
}

/** 列表行内按钮（role 定位，只匹配可见按钮）：管理员对照与只读「详情」保留断言用 */
function clusterRowAction(page, clusterName, label) {
  return businessClusterTable(page).rowAction(clusterName, label);
}

/** 列表搜索行「名称」列筛选框（占位符「请输入名称查询」） */
function clusterSearchInput(page) {
  return businessClusterTable(page).searchInput(
    BUSINESS_CLUSTER_SEARCH_PLACEHOLDER,
  );
}

/** 创建向导抽屉 */
function clusterCreateWizardDrawer(page) {
  return ivuDrawer(page).withTitle(DRAWER_TITLE.createBusinessCluster);
}

/** 编辑向导抽屉（行内「编辑」入口对应） */
function clusterEditWizardDrawer(page) {
  return ivuDrawer(page).withTitle(DRAWER_TITLE.editBusinessCluster);
}

/**
 * 向导抽屉底部按钮区（src/modules/Clusters/components/index.vue
 * `.com-btn-box.drawer-footer`）
 */
function clusterWizardFooter(page, drawerTitle = DRAWER_TITLE.createBusinessCluster) {
  return ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.com-btn-box.drawer-footer');
}

/**
 * 向导「提交」按钮：`v-has` + `v-show="currentStepIndex === reviewStepIndex"`
 * （components/index.vue:89-90），只读态由 v-has 额外加 `.v-has-hidden`。
 */
function clusterWizardSubmitBtn(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return clusterWizardFooter(page, drawerTitle)
    .locator('button.ivu-btn')
    .filter({ hasText: RO_CLUSTER_LABEL.submit });
}

/** 向导「下一步」按钮（只读态保留的步骤推进入口） */
function clusterWizardNextBtn(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return clusterWizardFooter(page, drawerTitle)
    .locator('button.ivu-btn')
    .filter({ hasText: RO_CLUSTER_LABEL.nextStep });
}

/** 向导「上一步」按钮 */
function clusterWizardPrevBtn(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return clusterWizardFooter(page, drawerTitle)
    .locator('button.ivu-btn')
    .filter({ hasText: RO_CLUSTER_LABEL.lastStep });
}

/**
 * 向导抽屉右上关闭入口（iView Drawer `<a class="ivu-drawer-close">`）。
 * 02f 文档「保留下一步 / 取消」中的「取消」在产品 5 步向导内无对应按钮，
 * 退出向导由该关闭入口承担。
 */
function clusterWizardCloseBtn(
  page,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  return ivuDrawer(page).withTitle(drawerTitle).locator('.ivu-drawer-close');
}

/**
 * 读取向导抽屉内按 label 定位的表单输入值（文本/数字框通用）。
 * 用于「关闭后重开应为初始值」类断言（覆盖缺口清单 #4）。
 */
async function getWizardFieldValue(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const item = ivuDrawer(page)
    .withTitle(drawerTitle)
    .locator('.ivu-drawer-body .ivu-form-item')
    .filter({ hasText: label })
    .first();
  const input = item
    .locator('input.ivu-input, .ivu-input-number-input, textarea')
    .first();
  return (await input.inputValue()).trim();
}

/** 「详情」抽屉 */
function clusterDetailDrawer(page) {
  return ivuDrawer(page).withTitle(DRAWER_TITLE.businessClusterDetail);
}

/** 详情抽屉内写按钮（Review 无 footer 且 showFooter=false，只读态应为 0） */
function clusterDetailActionButtons(page) {
  return clusterDetailDrawer(page).locator('button.ivu-btn');
}

/** 详情抽屉「基础配置」面板内「集群名称」值行（Review 第 1 个 ul > li.value） */
function clusterDetailNameValue(page) {
  return clusterDetailDrawer(page)
    .locator('.panel')
    .filter({ hasText: RO_CLUSTER_LABEL.basicConfigPanel })
    .first()
    .locator('li.value')
    .first();
}

/**
 * 只读视角直连 URL 进入 AI 业务集群列表页。
 * 不复用 `gotoBusinessClusterManagementPage`：它经 `ensureAppSession` 调用
 * `ensureSessionHealthy`，会话异常时会以 admin 凭证重登并回写 auth.json，
 * 把只读态换回管理员态（见 utils/readonly.js 文件头约束 2）；
 * 就绪判定也不用「添加集群」（只读态被 v-has 隐藏）。
 */
async function gotoBusinessClusterPageReadonly(page) {
  await readonly.gotoAsReadonly(page, BUSINESS_CLUSTER_PATH, {
    ready: clusterPageRoot(page),
  });
  await expectBusinessClusterPageReadyReadonly(page);
}

/** 只读视角就绪判定：列表页在、筛选行与表头可见（只读也存在的锚点），写入口已隐藏 */
async function expectBusinessClusterPageReadyReadonly(page) {
  await expect(clusterPageRoot(page)).toBeVisible();
  await expect(clusterSearchInput(page)).toBeVisible({ timeout: 15000 });
  await expect(
    businessClusterTable(page).headers().filter({ hasText: '名称' }).first(),
  ).toBeVisible({ timeout: 15000 });
  await readonly.expectVHasHidden(clusterListAddBtn(page), '添加集群');
  await readonly.expectStillReadonly(page);
}

/**
 * 按「名称」列本地筛选并断言行可见（与分页解耦：目标集群可能不在第 1 页）。
 * 不触发列表请求（pageTable 前端筛选），管理员/只读两组通用。
 */
async function ensureBusinessClusterRowVisibleByFilter(page, clusterName) {
  await businessClusterTable(page).filterByColumn('名称', clusterName);
  await expect(
    businessClusterTable(page).rowByText(clusterName),
  ).toBeVisible({ timeout: 15000 });
  return true;
}

/**
 * 只读视角强制展开「添加集群」向导（等价于点开被 v-has 隐藏的「添加集群」）。
 * 只读态写入口已隐藏、抽屉不渲染，而文档预期 2/5 要求在真实渲染的向导内验收
 * 「提交」的 `.v-has-hidden`（与 v-show 共存），故按仓库既有 `__vue__` 手法直接
 * 驱动组件状态——只改 UI 状态，不发起任何写请求。
 */
async function openCreateBusinessClusterDrawerByModel(page) {
  const opened = await page.evaluate(() => {
    const root = document.querySelector('.clusters');
    if (!root) {
      return false;
    }
    let vue = root.__vue__;
    for (let i = 0; i < 10 && vue && vue.upsertVisible === undefined; i += 1) {
      vue = vue.$parent;
    }
    if (!vue || vue.upsertVisible === undefined) {
      return false;
    }
    vue.currentCluster = {};
    vue.isAdd = true;
    vue.upsertVisible = true;
    return true;
  });
  if (!opened) {
    throw new Error('强制展开「添加集群」向导失败：未取到 .clusters 组件实例');
  }
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createBusinessCluster);
  await waitAfterResourceMutation(page, 300);
}

/**
 * 把向导步骤置位到「复查&检查」（reviewStepIndex）。
 * 管理员与只读两组用同一手法，唯一差异是角色：用于把「提交」从 v-show 隐藏态取出，
 * 从而区分只读态的隐藏来自 v-has（`.v-has-hidden`）而非 v-show。
 */
async function jumpClusterWizardToReviewStepByModel(page) {
  const jumped = await page.evaluate(() => {
    const el = document.querySelector('.newClusters');
    if (!el) {
      return false;
    }
    let vue = el.__vue__;
    for (let i = 0; i < 10 && vue && typeof vue.reviewStepIndex !== 'number'; i += 1) {
      vue = vue.$parent;
    }
    if (!vue || typeof vue.reviewStepIndex !== 'number') {
      return false;
    }
    if (vue.currentStepIndex !== vue.reviewStepIndex) {
      vue.currentStepIndex = vue.reviewStepIndex;
    }
    return true;
  });
  if (!jumped) {
    throw new Error('向导步骤置位失败：未取到 .newClusters 组件实例');
  }
  await waitAfterResourceMutation(page, 300);
}

/**
 * 只读视角详情验收：「详情」可打开、只读查看内容在、无写按钮残留（预期 3）。
 * 调用方负责 `closeBusinessClusterDetail`。
 */
async function expectBusinessClusterDetailReadonly(page, clusterName) {
  await openBusinessClusterDetail(page, clusterName);
  await expect(
    clusterDetailDrawer(page)
      .locator('.panel')
      .filter({ hasText: RO_CLUSTER_LABEL.basicConfigPanel })
      .first(),
  ).toBeVisible();
  await expect(clusterDetailNameValue(page)).toHaveText(clusterName);
  await readonly.expectAbsent(
    clusterDetailActionButtons(page),
    '详情抽屉内写按钮',
  );
}

/**
 * 只读态下以只读会话直接调用集群删除接口（探针：目标集群名不存在，任何结果都不产生数据变更），
 * 用于文档预期 5「写操作在接口层由后端按角色强制拒绝」。
 * 返回 `{ status, body }`，期望值为 `RO_WRITE_DENIED`。
 */
async function probeClusterDeleteAsReadonly(page, clusterName) {
  const userData = await resourceApi.getUserData(page);
  const response = await page.request.delete(
    resourceApi.getOpenApiBaseUrl() +
      '/clusters/' +
      encodeURIComponent(clusterName),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Session ' + userData.sessionKey,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  common.log(
    '只读态 DELETE cluster 探针响应: ' +
      response.status() +
      ' ' +
      JSON.stringify(body),
  );
  return { status: response.status(), body };
}

module.exports = {
  openCreateBusinessClusterDrawer,
  openEditBusinessClusterDrawer,
  openBusinessClusterDetail,
  closeBusinessClusterDetail,
  closeBusinessClusterEditDrawer,
  clickWizardNext,
  clickWizardPrev,
  clickWizardSubmit,
  expectWizardStep,
  fillBasicStep,
  fillTimeoutStep,
  fillHealthStep,
  fillInstanceConfigStep,
  clickAddInstanceRow,
  fillInstanceWeight,
  expectInstanceConfigError,
  navigateToInstanceConfigStep,
  navigateToHealthStep,
  navigateToModelStep,
  expectHashStrategyFieldVisible,
  expectWizardFormFieldError,
  switchInstanceMode,
  expectInstanceModeUi,
  fillInstancePortAtRow,
  fillInstanceIpAtRow,
  expectModelEndpointDefaults,
  expectMatchPrefixFieldVisible,
  expectStripPrefixSwitchState,
  expectModelKeysRowCount,
  modelKeysTable,
  addModelKeyRow,
  removeModelKeyRow,
  fillModelKeyRow,
  getModelKeyRowValues,
  expectModelKeysError,
  expectModelKeysErrorHidden,
  setModelKeyWeightViaModel,
  fillKeyPolicyStep,
  getKeyPolicyValues,
  setKeyPolicyFieldViaModel,
  expectKeyPolicyStrategyOptions,
  fillKeyAffinityStep,
  getKeyAffinityValues,
  keyAffinityCard,
  setKeyAffinityFieldViaModel,
  expectKeyAffinityFieldsVisible,
  expectKeyAffinityError,
  expectKeyAffinityErrorHidden,
  normalizeUpstreamErrorCard,
  fillNormalizeUpstreamError,
  getNormalizeUpstreamErrorValues,
  expectNormalizeUpstreamErrorError,
  setNormalizeUpstreamErrorFieldViaModel,
  getNormalizeReviewValues,
  getReviewBlockValues,
  getModelMappingRowCount,
  deleteModelMappingRow,
  getReviewKeysTable,
  expectModelCardGrouping,
  selectProvider,
  selectForwardModels,
  selectAllForwardModels,
  fillModelMappingRow,
  expectModelMappingSource,
  fillProvider,
  expectProviderFieldVisible,
  expectProviderValue,
  expectSelectedForwardModels,
  expectProviderKeyOptionsEmpty,
  getModelKeyRowOptions,
  expectProviderDropdownOptions,
  waitForClusterCreateRequest,
  waitForClusterPatchRequest,
  mountSubCluster,
  unmountSubCluster,
  fillModelStep,
  fillScheduleStep,
  submitCreateBusinessClusterAndWaitForSuccess,
  getModelListHostValue,
  getModelListPortValue,
  clickFetchModels,
  expectModelDropdownPopulated,
  addModelListHeader,
  fillCreateWizardThroughReview,
  attemptDeleteBusinessCluster,
  expectBusinessClusterDetailProtocol,
  expectEditWizardProtocolMatches,
  expectEditWizardProviderMatches,
  searchBusinessCluster,
  searchBusinessClusterAndWait,
  expectBusinessClusterVisibleInAllPages,
  ensureBusinessClusterRowVisible,
  refreshBusinessClusterList,
  confirmDeleteBusinessCluster,
  expectBusinessClusterFormFieldError,
  cancelCreateBusinessCluster,
  expectCreateBusinessClusterDrawerHidden,
  DOC_BUSINESS_CLUSTER,
  // 2026-09-09 均衡模式配置（RM-BC-93~103）
  balanceModeCard,
  getBalanceModeValue,
  setBalanceMode,
  getEppConfigValues,
  fillEppConfig,
  // 2026-10-28 条件项隐藏 + .llm-form-grid 自适应网格（RM-BC-96~98、RM-BC-123）
  eppConfigGrid,
  llmSectionCard,
  llmFormGrid,
  getLlmFormGridLayout,
  getEppGridLayout,
  getEppGridLabels,
  expectEppGridFieldVisible,
  expectEppGridFieldHidden,
  expectLlmFormGridNoBlankBlock,
  expectNoAffinityOffHint,
  expectEppFieldError,
  expectEppFieldErrorHidden,
  waitForClusterGetResponse,
  waitForClusterReviewRequest,
  // 2026-10-13 EPP 运行时参数（RM-BC-115~122）
  eppRuntimeCard,
  expectEppRuntimeCardVisible,
  expectEppRuntimeCardHidden,
  expectEppRuntimeFieldComposition,
  expectEppRuntimeHelpIcons,
  getEppRuntimeValues,
  expectEppRuntimeDefaultValues,
  expectEppRuntimeUnitOptions,
  selectEppRuntimeDurationUnit,
  fillEppRuntimeDuration,
  typeEppRuntimeDuration,
  fillEppRuntimeThreshold,
  expectEppRuntimeSwitchState,
  toggleEppRuntimeSwitch,
  expectEppRuntimeFieldError,
  expectEppRuntimeFieldErrorHidden,
  getReviewEppRuntimeValues,
  expectReviewEppRuntimeValues,
  expectReviewEppRuntimeUnset,
  expectEppRuntimeToast,
  expectToast,
  watchClusterCreateRequests,
  // 2026-11-02 调用超时 vs 队列 TTL 跨字段校验（RM-BC-124）
  flowControlCard,
  fillFlowControlNumber,
  // 只读管理员视角（docs/business-cluster/…/02f-只读视角.md）
  BUSINESS_CLUSTER_PATH,
  RO_CLUSTER_LABEL,
  RO_WRITE_DENIED,
  clusterPageRoot,
  clusterListAddBtn,
  clusterRowActionButtons,
  clusterRowWriteBtn,
  clusterRowAction,
  clusterSearchInput,
  clusterCreateWizardDrawer,
  clusterEditWizardDrawer,
  clusterWizardFooter,
  clusterWizardSubmitBtn,
  clusterWizardNextBtn,
  clusterWizardPrevBtn,
  clusterWizardCloseBtn,
  getWizardFieldValue,
  clusterDetailDrawer,
  clusterDetailActionButtons,
  clusterDetailNameValue,
  gotoBusinessClusterPageReadonly,
  expectBusinessClusterPageReadyReadonly,
  ensureBusinessClusterRowVisibleByFilter,
  openCreateBusinessClusterDrawerByModel,
  jumpClusterWizardToReviewStepByModel,
  expectBusinessClusterDetailReadonly,
  probeClusterDeleteAsReadonly,
};
