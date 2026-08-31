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
const { ElSelectComponent } = require('../../components/element');
const common = require('../../utils/common');
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
    const protocolSelect = body
      .locator('.ivu-form-item')
      .filter({ hasText: '协议' })
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
  // 等待表格行可见
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
  await select.open();
  await select.dropdownItems().filter({ hasText: '全选' }).first().click();
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

// 转发模型（el-select multiple）下拉选项为空断言（RM-BC-74）
async function expectForwardModelsDropdownEmpty(
  page,
  empty,
  drawerTitle = DRAWER_TITLE.createBusinessCluster,
) {
  const body = modelStepBody(page, drawerTitle);
  const item = body
    .locator('.ivu-form-item')
    .filter({ hasText: DOC_BUSINESS_CLUSTER.forwardModelsLabel })
    .first();
  const select = item.locator('.el-select').first();
  await expect(select).toBeVisible({ timeout: 10000 });
  await select.click();
  await page.waitForTimeout(300);
  const items = page.locator(
    '.el-select-dropdown:visible .el-select-dropdown__item',
  );
  const count = await items.count();
  await page.keyboard.press('Escape');
  await waitAfterResourceMutation(page, 200);
  if (empty) {
    expect(count).toBe(0);
  } else {
    expect(count).toBeGreaterThan(0);
  }
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

// 大模型配置步骤 Card 分组展示（RM-BC-56：5 张 Card）
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
  { enabled, ttl, penaltyEnable, redisPrefix },
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
    redisPrefix = await card
      .locator('.ivu-form-item')
      .filter({ hasText: DOC_BUSINESS_CLUSTER.keyAffinityRedisPrefixLabel })
      .locator('input')
      .first()
      .inputValue();
  }
  return { enabled, ttl, penaltyEnable, redisPrefix };
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
      .filter({ hasText: '协议' })
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
  setKeyAffinityFieldViaModel,
  expectKeyAffinityFieldsVisible,
  expectKeyAffinityError,
  expectKeyAffinityErrorHidden,
  expectModelCardGrouping,
  selectProvider,
  selectForwardModels,
  selectAllForwardModels,
  fillModelMappingRow,
  fillProvider,
  expectProviderFieldVisible,
  expectProviderValue,
  expectSelectedForwardModels,
  expectProviderKeyOptionsEmpty,
  getModelKeyRowOptions,
  expectForwardModelsDropdownEmpty,
  expectProviderDropdownOptions,
  waitForClusterCreateRequest,
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
  confirmDeleteBusinessCluster,
  expectBusinessClusterFormFieldError,
  cancelCreateBusinessCluster,
  expectCreateBusinessClusterDrawerHidden,
  DOC_BUSINESS_CLUSTER,
};
