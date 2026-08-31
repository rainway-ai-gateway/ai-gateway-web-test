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
const {
  IvuInputNumberComponent,
} = require('../../components/iview');
const common = require('../../utils/common');
const {
  DRAWER_TITLE,
  INSTANCE_POOL_SEARCH_PLACEHOLDER,
  ivuDrawer,
  gatewayPoolTable,
  businessPoolTable,
  businessPoolDetailTable,
  waitAfterResourceMutation,
  waitForBfePoolsListResponse,
  waitForProductInstancePoolsListResponse,
  expectRowVisibleInAllPages,
  toBusinessPoolShortName,
} = require('./ResourcePageCommon');

// ==================== Instance Pool (shared drawer) ====================

async function openCreateInstancePoolDrawer(page) {
  await page.getByRole('button', { name: '添加实例池' }).click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createInstancePool);
  await waitAfterResourceMutation(page, 500);
}

function instancePoolDrawerBody(
  page,
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  return ivuDrawer(page).withTitle(drawerTitle).locator('.ivu-drawer-body');
}

async function fillInstancePoolFirstRow(
  page,
  instance,
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  const body = instancePoolDrawerBody(page, drawerTitle);
  const dataRow = body.locator('table tr').nth(1);
  const inputNumber = new IvuInputNumberComponent(body);

  await dataRow.locator('td').nth(0).locator('input').fill(instance.hostname);
  await dataRow.locator('td').nth(1).locator('input').fill(instance.ip);
  await inputNumber.fillInCell(dataRow.locator('td').nth(2), instance.port);

  if (instance.weight !== undefined) {
    await inputNumber.fillInCell(dataRow.locator('td').nth(3), instance.weight);
  }
}

async function fillInstancePoolForm(
  page,
  { poolShortName, instance },
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  await ivuDrawer(page)
    .form(drawerTitle)
    .fillInput('实例池名称', poolShortName);
  await fillInstancePoolFirstRow(page, instance, drawerTitle);
}

async function submitInstancePoolForm(
  page,
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '提交');
}

async function fillInstancePoolRow(
  page,
  rowIndex,
  instance,
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  const body = instancePoolDrawerBody(page, drawerTitle);
  const dataRow = body.locator('table tr').nth(rowIndex + 1);
  const inputNumber = new IvuInputNumberComponent(body);

  await dataRow.locator('td').nth(0).locator('input').fill(instance.hostname);
  await dataRow.locator('td').nth(1).locator('input').fill(instance.ip);
  await inputNumber.fillInCell(dataRow.locator('td').nth(2), instance.port);
}

async function clickCreateInstanceRow(
  page,
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  const body = instancePoolDrawerBody(page, drawerTitle);
  await body.getByText('+ 创建').click();
  await waitAfterResourceMutation(page, 500);
}

async function deleteInstanceRow(
  rowIndex,
  page,
  drawerTitle = DRAWER_TITLE.createInstancePool,
) {
  const body = instancePoolDrawerBody(page, drawerTitle);
  const dataRow = body.locator('table tr').nth(rowIndex + 1);
  await dataRow.getByRole('button', { name: '删除' }).click();
  await waitAfterResourceMutation(page, 300);
}

async function expectInstancePoolFormFieldError(page, message) {
  await ivuDrawer(page)
    .form(DRAWER_TITLE.createInstancePool)
    .expectFieldError('实例池名称', message);
}

async function cancelInstancePoolForm(page) {
  const modal = page.locator('.ivu-modal-wrap:not(.ivu-modal-hidden)');
  const modalVisible = await modal.isVisible().catch(() => false);
  if (modalVisible) {
    const confirmBtn = modal.getByRole('button', { name: '确定' });
    const cancelBtn = modal.getByRole('button', { name: '取消' });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    } else if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
    }
    await waitAfterResourceMutation(page, 500);
  }
  await ivuDrawer(page).closeByX(DRAWER_TITLE.createInstancePool);
}

async function expectInstanceRowDeleteButtonState(page, rowIndex, state) {
  const body = instancePoolDrawerBody(page);
  const dataRow = body.locator('table tr').nth(rowIndex + 1);
  const deleteBtn = dataRow.getByRole('button', { name: '删除' });
  if (state === 'disabled') {
    await expect(deleteBtn).toBeDisabled();
  } else {
    await expect(deleteBtn).toBeEnabled();
  }
}

async function expectCreateInstancePoolDrawerHidden(page) {
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.createInstancePool),
  ).toBeHidden();
}

async function submitCreateGatewayPoolFormAndWaitForSuccess(page) {
  await waitForBfePoolsListResponse(page, () => submitInstancePoolForm(page));
}

async function submitCreateBusinessPoolFormAndWaitForSuccess(page) {
  await waitForProductInstancePoolsListResponse(page, () =>
    submitInstancePoolForm(page),
  );
}

// ==================== Gateway Pool ====================

async function confirmDeleteGatewayPool(page) {
  const modal = page.locator('.ivu-modal-wrap').filter({ hasText: '是否删除' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: '确定' }).click();
  await expect(modal).toBeHidden({ timeout: 10000 });
}

async function searchGatewayPool(page, keyword) {
  await gatewayPoolTable(page).search(
    keyword,
    INSTANCE_POOL_SEARCH_PLACEHOLDER,
  );
}

async function searchGatewayPoolAndWait(page, keyword) {
  await waitForBfePoolsListResponse(page, () =>
    searchGatewayPool(page, keyword),
  );
}

async function expectGatewayPoolVisibleInAllPages(
  page,
  fullPoolName,
  timeout = 30000,
) {
  await expectRowVisibleInAllPages(
    page,
    gatewayPoolTable(page),
    fullPoolName,
    waitForBfePoolsListResponse,
    'AI网关实例池',
    timeout,
  );
}

async function ensureGatewayPoolRowVisible(page, fullPoolName) {
  const shortName = fullPoolName.split('.').slice(1).join('.');
  await searchGatewayPoolAndWait(page, shortName);
  await expectGatewayPoolVisibleInAllPages(page, fullPoolName);
}

// ==================== Business Pool ====================

async function confirmDeleteBusinessPool(page) {
  const modal = page.locator('.ivu-modal-wrap').filter({ hasText: '是否删除' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: '确定' }).click();
  await expect(modal).toBeHidden({ timeout: 10000 });
}

async function searchBusinessPool(page, keyword) {
  await businessPoolTable(page).search(
    keyword,
    INSTANCE_POOL_SEARCH_PLACEHOLDER,
  );
}

async function searchBusinessPoolAndWait(page, keyword) {
  await waitForProductInstancePoolsListResponse(page, () =>
    searchBusinessPool(page, keyword),
  );
}

async function expectBusinessPoolVisibleInAllPages(
  page,
  fullPoolName,
  timeout = 30000,
) {
  await expectRowVisibleInAllPages(
    page,
    businessPoolTable(page),
    fullPoolName,
    waitForProductInstancePoolsListResponse,
    'AI业务实例池',
    timeout,
  );
}

async function ensureBusinessPoolRowVisible(page, fullPoolName) {
  const shortName = toBusinessPoolShortName(fullPoolName);
  await searchBusinessPoolAndWait(page, shortName);
  await expectBusinessPoolVisibleInAllPages(page, fullPoolName);
}

async function openBusinessPoolDetail(page, fullPoolName) {
  await businessPoolTable(page).rowAction(fullPoolName, '查看').click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.businessPoolDetail);
  await waitAfterResourceMutation(page, 500);
}

async function closeBusinessPoolDetail(page) {
  await ivuDrawer(page).clickFooterButton(
    DRAWER_TITLE.businessPoolDetail,
    '关闭',
  );
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.businessPoolDetail),
  ).toBeHidden();
}

async function openBusinessPoolEditDrawer(page, fullPoolName) {
  await businessPoolTable(page).rowAction(fullPoolName, '编辑').click();
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editInstancePool);
}

async function closeBusinessPoolEditDrawer(page) {
  await ivuDrawer(page).closeByX(DRAWER_TITLE.editInstancePool);
  await expect(
    ivuDrawer(page).withTitle(DRAWER_TITLE.editInstancePool),
  ).toBeHidden();
}

async function expectBusinessPoolEditFormMatchesApi(page, apiData) {
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.editInstancePool);
  const body = drawer.locator('.ivu-drawer-body');

  const shortName = toBusinessPoolShortName(apiData.name);
  const nameInput = body.locator('input').first();
  await expect(nameInput).toHaveValue(shortName);
  await expect(nameInput).toBeDisabled();

  const instances = apiData.instances || [];
  const dataRows = body.locator('table tr');

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const row = dataRows.nth(i + 1);
    const cells = row.locator('td');

    await expect(cells.nth(0).locator('input')).toHaveValue(inst.hostname);
    await expect(cells.nth(1).locator('input')).toHaveValue(inst.ip);
    await expect(
      cells.nth(2).locator('input[placeholder="端口值"]'),
    ).toHaveValue(String(inst.ports?.Default ?? ''));
  }
}

async function expectBusinessPoolDetailMatchesApi(page, apiData) {
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.businessPoolDetail);
  await expect(drawer.locator('.info-value')).toContainText(apiData.name);

  const table = businessPoolDetailTable(page);
  const instances = apiData.instances || [];

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const row = table.dataRows().nth(i);
    await expect(row).toContainText(inst.hostname);
    await expect(row).toContainText(inst.ip);
    await expect(row).toContainText(String(inst.ports?.Default ?? ''));
    await expect(row).toContainText(String(inst.weight ?? ''));
    const tagsText = JSON.stringify(inst.tags || {});
    await expect(row).toContainText(tagsText);
  }
}

// ==================== Gateway Pool Inline Edit ====================

async function openGatewayPoolEditMode(page) {
  await page.getByRole('button', { name: '编辑' }).click();
  await expectGatewayPoolEditMode(page);
}

async function expectGatewayPoolEditMode(page) {
  await expect(page.getByRole('button', { name: '提交' })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
  await expect(page.getByText('+ 创建')).toBeVisible();
}

async function expectGatewayPoolListMode(page) {
  await expect(page.getByRole('button', { name: '编辑' })).toBeVisible();
  await expect(page.getByRole('button', { name: '提交' })).toBeHidden();
  await expect(page.getByRole('button', { name: '取消' })).toBeHidden();
}

async function fillGatewayPoolEditRow(page, rowIndex, instance) {
  const inputNumber = new IvuInputNumberComponent(page);

  const dataRow = page.locator('table > tr').nth(rowIndex + 1);
  await dataRow.waitFor({ state: 'visible', timeout: 5000 });

  const cells = dataRow.locator('td');

  const hostnameInput = cells.nth(0).locator('input').first();
  await hostnameInput.waitFor({ state: 'visible', timeout: 5000 });
  await hostnameInput.fill(instance.hostname);

  const ipInput = cells.nth(1).locator('input').first();
  await ipInput.waitFor({ state: 'visible', timeout: 5000 });
  await ipInput.fill(instance.ip);

  await inputNumber.fillInCell(cells.nth(2), instance.port);
}

async function clickGatewayPoolCreateRow(page) {
  await page.getByText('+ 创建').click();
  await waitAfterResourceMutation(page, 500);
}

async function deleteGatewayPoolEditRow(page, rowIndex) {
  const dataRow = page.locator('table > tr').nth(rowIndex + 1);
  await dataRow.waitFor({ state: 'visible', timeout: 5000 });

  const deleteBtn = dataRow.getByRole('button', { name: '删除' }).first();
  await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
  await deleteBtn.click();
  await waitAfterResourceMutation(page, 300);
}

async function submitGatewayPoolEditForm(page) {
  await page.getByRole('button', { name: '提交' }).click();
}

async function submitGatewayPoolEditAndWaitForSuccess(page) {
  await waitForBfePoolsListResponse(page, () =>
    submitGatewayPoolEditForm(page),
  );
  await expect(page.getByText('修改成功')).toBeVisible({ timeout: 10000 });
}

async function dismissGatewayPoolValidationModal(page) {
  const modal = page.locator('.ivu-modal-wrap');
  if (await modal.isVisible().catch(() => false)) {
    common.log('检测到验证弹窗，点击「确定」关闭');
    await modal.getByRole('button', { name: '确定' }).click();
    await waitAfterResourceMutation(page, 500);
  }
}

async function cancelGatewayPoolEdit(page) {
  await dismissGatewayPoolValidationModal(page);
  await page.getByRole('button', { name: '取消' }).click();
  await expectGatewayPoolListMode(page);
}

async function expectGatewayPoolEditSuccess(page) {
  await expect(page.getByText('修改成功')).toBeVisible();
}

async function expectGatewayPoolEditRowDeleteButtonState(
  page,
  rowIndex,
  state,
) {
  const dataRow = page.locator('table > tr').nth(rowIndex + 1);
  await dataRow.waitFor({ state: 'visible', timeout: 5000 });

  const deleteBtn = dataRow.getByRole('button', { name: '删除' }).first();
  await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });

  if (state === 'disabled') {
    await expect(deleteBtn).toBeDisabled();
  } else {
    await expect(deleteBtn).toBeEnabled();
  }
}

module.exports = {
  openCreateInstancePoolDrawer,
  fillInstancePoolForm,
  fillInstancePoolRow,
  submitInstancePoolForm,
  clickCreateInstanceRow,
  deleteInstanceRow,
  submitCreateGatewayPoolFormAndWaitForSuccess,
  submitCreateBusinessPoolFormAndWaitForSuccess,
  expectCreateInstancePoolDrawerHidden,
  expectInstancePoolFormFieldError,
  cancelInstancePoolForm,
  expectInstanceRowDeleteButtonState,
  confirmDeleteGatewayPool,
  searchGatewayPool,
  searchGatewayPoolAndWait,
  expectGatewayPoolVisibleInAllPages,
  ensureGatewayPoolRowVisible,
  confirmDeleteBusinessPool,
  searchBusinessPool,
  searchBusinessPoolAndWait,
  expectBusinessPoolVisibleInAllPages,
  ensureBusinessPoolRowVisible,
  openBusinessPoolDetail,
  closeBusinessPoolDetail,
  openBusinessPoolEditDrawer,
  closeBusinessPoolEditDrawer,
  expectBusinessPoolEditFormMatchesApi,
  expectBusinessPoolDetailMatchesApi,
  openGatewayPoolEditMode,
  expectGatewayPoolEditMode,
  expectGatewayPoolListMode,
  fillGatewayPoolEditRow,
  clickGatewayPoolCreateRow,
  deleteGatewayPoolEditRow,
  submitGatewayPoolEditForm,
  submitGatewayPoolEditAndWaitForSuccess,
  cancelGatewayPoolEdit,
  expectGatewayPoolEditSuccess,
  expectGatewayPoolEditRowDeleteButtonState,
};
