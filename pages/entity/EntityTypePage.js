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
const { PageTableComponent } = require('../../components/layout');
const {
  IvuDrawerComponent,
  IvuFormComponent,
  IvuModalComponent,
  IvuSelectComponent,
  IvuMessageComponent,
} = require('../../components/iview');
const { ElSelectComponent } = require('../../components/element');
const {
  DRAWER_TITLE,
  DOC_ENTITY_TYPE,
  ENTITY_TYPE_SEARCH_PLACEHOLDER,
  ENTITY_DETAIL_DRAWER_PARTS,
  API_KEY_DETAIL_DRAWER_PARTS,
  getAppBaseUrl,
  ivuDrawer,
  entityDetailDrawer,
  apiKeyDetailDrawer,
  ivuModal,
  entityTabs,
  entityTypeTable,
  expectEntityDetailDrawerOpen,
  expectApiKeyDetailDrawerOpen,
  expectEntityManagementLayout,
  expectEntityManagementPageTitle,
  expectEntityManagementTabs,
  switchToEntityTypeTab,
  switchToEntityOrgTab,
  generateTestEntityTypeName,
  waitForPageSettled,
  waitForEntityManagementShell,
} = require('./entity-shared');
const {
  getUserData,
  getOpenApiBaseUrl,
  findEntityByNameViaApi,
} = require('../../api/entity-api-utils');
// Lazy requires to break horizontal circular dependency

function entityTypeForm(page, drawerTitle = DRAWER_TITLE.createType) {
  return ivuDrawer(page).form(drawerTitle);
}

async function openCreateEntityTypeDrawer(page) {
  const recovered = await umUtils.handleUrlInvalidAlert(page);
  if (recovered) {
    await gotoEntityTypeManagementPage(page);
  }
  await page.getByRole('button', { name: '创建类型' }).click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createType);
}

async function openEditEntityTypeDrawer(page, typeName) {
  await entityTypeTable(page).rowAction(typeName, '编辑').click();
  await page.waitForTimeout(500);
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editType);
}

async function fillEntityTypeForm(
  page,
  { typeName, description, level },
  drawerTitle = DRAWER_TITLE.createType,
) {
  const form = entityTypeForm(page, drawerTitle);
  if (typeName !== undefined) {
    await form.fillInput('类型名', typeName);
  }
  if (description !== undefined) {
    await form.fillInput('描述', description);
  }
  if (level !== undefined) {
    await selectEntityTypeLevel(page, level, drawerTitle);
  }
}

async function selectEntityTypeLevel(
  page,
  level,
  drawerTitle = DRAWER_TITLE.createType,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  const trigger = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '级别' })
    .locator('.ivu-select');
  await new IvuSelectComponent(page, trigger).selectOptionExact(String(level));
}

async function submitEntityTypeForm(
  page,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '确认');
}

async function createEntityTypeViaUI(
  page,
  typeName,
  description = '测试类型',
  level = 1,
) {
  await openCreateEntityTypeDrawer(page);
  await submitCreateEntityTypeFormAndWait(page, {
    typeName,
    description,
    level,
  });
  await expectCreateEntityTypeDrawerHidden(page);
}

async function cancelEntityTypeForm(
  page,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await ivuDrawer(page).clickFooterButton(drawerTitle, '取消');
}

async function closeEntityTypeDrawerByX(
  page,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await ivuDrawer(page).closeByX(drawerTitle);
}

async function expectCreateEntityTypeDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createType);
}

async function expectCreateEntityTypeDrawerHidden(page) {
  await expect(ivuDrawer(page).withTitle(DRAWER_TITLE.createType)).toBeHidden();
}

async function expectEditEntityTypeDrawerOpen(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.editType);
}

async function expectEntityTypeFormFieldError(
  page,
  label,
  message,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await entityTypeForm(page, drawerTitle).expectFieldError(label, message);
}

async function expectEntityTypeFormFieldValid(
  page,
  label,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await entityTypeForm(page, drawerTitle).expectFieldValid(label);
}

async function fillEntityTypeNameAndBlur(
  page,
  typeName,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await entityTypeForm(page, drawerTitle).fillAndValidate('类型名', typeName);
}

async function expectEntityTypeNameFieldDisabled(page) {
  const input = entityTypeForm(page, DRAWER_TITLE.editType).input('类型名');
  await expect(input).toBeDisabled();
  const color = await input.evaluate((el) => window.getComputedStyle(el).color);
  expect(color).toMatch(
    /^(rgb\(153, 153, 153\)|rgb\(191, 191, 191\)|#999999|#bfbfbf)$/,
  );
}

async function expectEntityTypeFormFieldValue(
  page,
  label,
  value,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await expect(entityTypeForm(page, drawerTitle).input(label)).toHaveValue(
    value,
  );
}

async function searchEntityType(page, keyword) {
  await entityTypeTable(page).search(keyword, ENTITY_TYPE_SEARCH_PLACEHOLDER);
}

async function clearEntityTypeSearch(page) {
  await entityTypeTable(page).clearSearch(ENTITY_TYPE_SEARCH_PLACEHOLDER);
}

async function expectEntityTypeVisible(page, typeName, timeout) {
  await entityTypeTable(page).expectRowVisible(typeName, timeout);
}

async function expectEntityTypeNotVisible(page, typeName, timeout) {
  await entityTypeTable(page).expectRowHidden(typeName, timeout);
}

async function expectEntityTypeVisibleInAllPages(
  page,
  typeName,
  timeout = 30000,
) {
  const table = entityTypeTable(page);
  try {
    await table.expectRowVisible(typeName, timeout);
    return;
  } catch (e) {
    common.log('第一页未找到 Entity 类型，尝试翻页查找...');
  }

  const pagination = table.pagination();
  const pageCount = await pagination.getByRole('listitem').count();

  for (let i = 2; i <= pageCount; i++) {
    await table.clickPageNumber(i);
    try {
      await table.expectRowVisible(typeName, timeout);
      return;
    } catch (err) {
      common.log('第' + i + '页未找到 Entity 类型');
    }
  }

  throw new Error('在所有页面中未找到 Entity 类型: ' + typeName);
}

async function clickDeleteEntityTypeBtn(page, typeName) {
  await entityTypeTable(page).rowAction(typeName, '删除').click();
  await page.waitForTimeout(500);
}

async function expectDeleteEntityTypeConfirmModal(page, typeName) {
  await ivuModal(page).expectText('是否删除Entity类型 ' + typeName + '？');
}

async function confirmDeleteEntityType(page) {
  await ivuModal(page).confirm();
}

async function cancelDeleteEntityType(page) {
  await ivuModal(page).cancel();
}

async function deleteEntityType(page, typeName) {
  await clickDeleteEntityTypeBtn(page, typeName);
  await confirmDeleteEntityType(page);
}

async function expectSuccessNotice(
  page,
  text = DOC_ENTITY_TYPE.createSuccessMsg,
) {
  await new IvuMessageComponent(page).expectText(text);
}

async function expectErrorNoticeContains(page, text) {
  // $Notice.error 常用自定义 render，文案不在 .ivu-notice-desc，需落到 .ivu-notice 根节点
  const notice = page.locator(
    '.ivu-notice, .ivu-notice-desc, .ivu-notice-title, .ivu-message, .ivu-message-notice',
  );
  const matcher = text instanceof RegExp ? text : String(text);
  await expect(notice.filter({ hasText: matcher }).first()).toBeVisible({
    timeout: 15000,
  });
}

async function waitForEntityTypesListResponse(page, action) {
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/entity-types') &&
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
      await waitForPageSettled(page, 2000);
      return null;
    }
    throw e;
  }
}

async function createEntityTypeViaApi(
  page,
  typeName,
  description = '测试类型',
  level = 1,
) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/entity-types',
      {
        data: {
          type_name: typeName,
          description,
          level,
        },
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口创建 Entity 类型响应: ' + JSON.stringify(responseBody));
    return responseBody.ErrNum === 200;
  } catch (error) {
    common.log('接口创建 Entity 类型异常: ' + error.message);
    return false;
  }
}

async function fetchEntityTypeByNameViaApi(page, typeName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/entity-types/' + encodeURIComponent(typeName),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口获取 Entity 类型详情响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      return responseBody.Data;
    }
    return null;
  } catch (error) {
    common.log('接口获取 Entity 类型详情异常: ' + error.message);
    return null;
  }
}

async function deleteEntityTypeViaApi(page, typeName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/entity-types/' + typeName,
      {
        headers: {
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口删除 Entity 类型响应: ' + JSON.stringify(responseBody));
    return responseBody.ErrNum === 200;
  } catch (error) {
    common.log('接口删除 Entity 类型异常: ' + error.message);
    return false;
  }
}

async function createEntityViaApi(
  page,
  name,
  type,
  parentNameOrId,
  quotaPlan,
  rateLimitPolicy,
) {
  try {
    const userData = await getUserData(page);
    const data = { name, type };
    if (parentNameOrId) {
      // OpenAPI 字段为 parent_id（id 形如 entity-27）；名称则先查 id
      let parentId = parentNameOrId;
      if (!/^entity-/i.test(String(parentNameOrId))) {
        const resolved = await findEntityIdByNameViaApi(page, parentNameOrId);
        if (!resolved) {
          common.log('创建子 Entity 失败：找不到父 Entity: ' + parentNameOrId);
          return null;
        }
        parentId = resolved;
      }
      data.parent_id = parentId;
    }
    if (quotaPlan) {
      data.quota_plan = quotaPlan;
    }
    if (rateLimitPolicy) {
      data.rate_limit_policy = rateLimitPolicy;
    }
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/entities',
      {
        data,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口创建 Entity 响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      return responseBody.Data;
    }
    return null;
  } catch (error) {
    common.log('接口创建 Entity 异常: ' + error.message);
    return null;
  }
}

async function findEntityIdByNameViaApi(page, entityName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(getOpenApiBaseUrl() + '/entities', {
      params: {
        page: 1,
        page_size: 200,
        name: entityName,
      },
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    });
    const responseBody = await response.json();
    if (responseBody.ErrNum !== 200) {
      return null;
    }
    const data = responseBody.Data;
    const list =
      data?.list || data?.entities || (Array.isArray(data) ? data : []);
    const rows = Array.isArray(list) ? list : [];
    const hit = rows.find((item) => item && item.name === entityName);
    return hit ? hit.id : null;
  } catch (error) {
    common.log('按名称查询 Entity 异常: ' + error.message);
    return null;
  }
}

async function deleteEntityViaApi(page, entityId) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/entities/' + entityId,
      {
        headers: {
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口删除 Entity 响应: ' + JSON.stringify(responseBody));
    return responseBody.ErrNum === 200;
  } catch (error) {
    common.log('接口删除 Entity 异常: ' + error.message);
    return false;
  }
}

function buildEntityTypeName(length) {
  const prefix = 't';
  if (length <= prefix.length) {
    return prefix.slice(0, length);
  }
  return prefix + 'a'.repeat(length - prefix.length);
}
async function expectCreateEntityTypeButtonVisible(page) {
  await expect(page.getByRole('button', { name: '创建类型' })).toBeVisible();
}

async function expectEntityTypeSearchVisible(page) {
  await expect(
    page.getByPlaceholder(ENTITY_TYPE_SEARCH_PLACEHOLDER),
  ).toBeVisible();
}

async function expectEntityTypeTableVisible(page) {
  const table = entityTypeTable(page);
  await expect(table.rootLocator()).toBeVisible();
  await table.expectHeaders('类型名', '描述', '级别', '创建时间', '操作');
}

async function expectEntityTypeTabSelected(page) {
  const tab = entityTabs(page).tabByText('Entity类型管理');
  await expect(tab).toHaveClass(/ivu-tabs-tab-active/);
}

async function expectEntityTypeTableRowActions(page, typeName) {
  const dataTable = page.locator('.show-iView-Table .ivu-table');
  let row;
  if (typeName) {
    row = dataTable.locator('tbody tr').filter({ hasText: typeName }).first();
  } else {
    row = dataTable.locator('tbody tr').first();
  }
  await expect(row.locator('button', { hasText: '编辑' })).toBeVisible();
  await expect(row.locator('button', { hasText: '删除' })).toBeVisible();
}

async function expectEntityTypeListEmpty(page) {
  const dataTable = page.locator('.show-iView-Table .ivu-table tbody');
  const dataRows = await dataTable.locator('tr').count();
  if (dataRows === 1) {
    const hasEmptyText = await dataTable
      .locator('tr', { hasText: '暂无数据' })
      .count();
    expect(hasEmptyText).toBe(1);
  } else {
    expect(dataRows).toBe(0);
  }
}

async function getEntityTypeListRowCount(page) {
  return entityTypeTable(page).dataRows().count();
}

async function expectCreateEntityTypeDrawerTitle(page) {
  await ivuDrawer(page).expectOpen(DRAWER_TITLE.createType);
}

async function clearEntityTypeLevelField(
  page,
  drawerTitle = DRAWER_TITLE.createType,
) {
  const drawer = ivuDrawer(page).withTitle(drawerTitle);
  await drawer.evaluate(() => {
    const formEl = document.querySelector(
      '.ivu-drawer-wrap:not(.ivu-drawer-hidden) .ivu-form',
    );
    if (!formEl || !formEl.__vue__) {
      return;
    }
    let vm = formEl.__vue__;
    while (vm && !vm.formData) {
      vm = vm.$parent;
    }
    if (vm && vm.formData) {
      vm.formData.level = null;
      if (vm.$forceUpdate) {
        vm.$forceUpdate();
      }
    }
  });
  await page.waitForTimeout(300);
}

async function clearEntityTypeRequiredFields(page) {
  await fillEntityTypeForm(page, { typeName: '' });
  await clearEntityTypeLevelField(page);
}

async function fillEntityTypeNameRawAndBlur(
  page,
  typeName,
  drawerTitle = DRAWER_TITLE.createType,
) {
  const input = entityTypeForm(page, drawerTitle).input('类型名');
  await input.evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, typeName);
  await input.blur();
  await page.waitForTimeout(300);
}

async function expectEntityTypeNameLengthValidation(page) {
  await openCreateEntityTypeDrawer(page);
  const input = entityTypeForm(page, DRAWER_TITLE.createType).input('类型名');
  const maxlength = await input.getAttribute('maxlength');
  expect(maxlength).toBe('32');
  await cancelEntityTypeForm(page);
}

async function expectEntityTypeDuplicateError(page) {
  await expectErrorNoticeContains(page, '重复');
}

async function ensureDocEntityTypeDep2(page) {
  const created = await createEntityTypeViaApi(
    page,
    DOC_ENTITY_TYPE.listSample.typeName,
    DOC_ENTITY_TYPE.listSample.description,
    DOC_ENTITY_TYPE.listSample.level,
  );
  if (created) {
    await reloadEntityTypeManagementPage(page);
  }
  return created;
}

async function ensureDocEntityTypesForSearch(page) {
  const extraName = 'dep_search_' + moment().format('HHmmss');
  await createEntityTypeViaApi(page, extraName, '搜索辅助类型', 1);
  await reloadEntityTypeManagementPage(page);
  return extraName;
}

async function submitOpenEditEntityTypeFormAndWait(page, formData) {
  await fillEntityTypeForm(page, formData, DRAWER_TITLE.editType);
  await waitForEntityTypesListResponse(page, () =>
    submitEntityTypeForm(page, DRAWER_TITLE.editType),
  );
  await waitAfterEntityTypeMutation(page);
}

async function cleanupDocTestDepIfCreated(page, wasCreated) {
  if (wasCreated) {
    await deleteEntityTypeViaApi(page, DOC_ENTITY_TYPE.listSample.typeName);
  }
}

async function expectEntityTypePaginationVisible(page) {
  await entityTypeTable(page).expectPaginationVisible();
}

async function expectEntityTypeListPageLayout(page) {
  await expectEntityManagementLayout(page);
  await expectEntityManagementPageTitle(page);
  await expectEntityManagementTabs(page);
  await expectEntityTypeTabSelected(page);
  await expectCreateEntityTypeButtonVisible(page);
  await expectEntityTypeSearchVisible(page);
  await expectEntityTypeTableVisible(page);
  const rowCount = await getEntityTypeListRowCount(page);
  if (rowCount > 0) {
    await expectEntityTypeTableRowActions(page);
  }
  await expectEntityTypePaginationVisible(page);
}

async function reloadEntityTypeManagementPage(page) {
  await page.reload({ waitUntil: 'domcontentloaded', cache: 'no-store' });
  await waitForEntityManagementShell(page);
  await switchToEntityTypeTab(page);
}

async function waitAfterEntityTypeMutation(page) {
  await waitForPageSettled(page, 2000);
}

async function waitAfterEntityTypeAction(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function createEntityTypeViaApiAndRefresh(
  page,
  typeName,
  description = '测试类型',
  level = 1,
) {
  await umUtils.handleUrlInvalidAlert(page);
  let ok = await createEntityTypeViaApi(page, typeName, description, level);
  if (!ok) {
    await umUtils.handleUrlInvalidAlert(page);
    ok = await createEntityTypeViaApi(page, typeName, description, level);
  }
  if (!ok) {
    throw new Error('接口创建 Entity 类型失败: ' + typeName);
  }
  await reloadEntityTypeManagementPage(page);
}

async function prepareEntityTypeForTest(
  page,
  typeName,
  description = '测试类型',
  level = 1,
) {
  await createEntityTypeViaApiAndRefresh(page, typeName, description, level);
  await searchEntityType(page, typeName);
}

async function submitEntityTypeFormAndWaitForSuccess(
  page,
  drawerTitle = DRAWER_TITLE.createType,
) {
  await new IvuMessageComponent(page).waitForTextDuringAction(
    DOC_ENTITY_TYPE.createSuccessMsg,
    () =>
      waitForEntityTypesListResponse(page, () =>
        submitEntityTypeForm(page, drawerTitle),
      ),
  );
  await waitAfterEntityTypeMutation(page);
}

async function submitCreateEntityTypeFormAndWait(page, formData) {
  await fillEntityTypeForm(page, formData);
  await submitEntityTypeFormAndWaitForSuccess(page);
}

async function submitEditEntityTypeFormAndWait(page, formData) {
  await fillEntityTypeForm(page, formData, DRAWER_TITLE.editType);
  await waitForEntityTypesListResponse(page, () =>
    submitEntityTypeForm(page, DRAWER_TITLE.editType),
  );
  await waitAfterEntityTypeMutation(page);
}

async function expectEntityTypeListNotEmpty(page) {
  const rowCount = await entityTypeTable(page).rowCount();
  expect(rowCount).toBeGreaterThan(0);
  return rowCount;
}

async function ensureEntityTypesForPagination(page) {
  const table = entityTypeTable(page);
  const createdTypes = [];

  if (!(await table.needsMoreRowsForPagination())) {
    common.log('Entity 类型数量已足够分页，跳过 API 补充');
    return createdTypes;
  }

  const rowCount = await table.rowCount();
  const needCount = 25 - rowCount;
  common.log('Entity 类型不足分页，通过 API 补充 ' + needCount + ' 个');

  for (let i = 0; i < needCount; i++) {
    const typeName = await generateTestEntityTypeName();
    createdTypes.push(typeName);
    await createEntityTypeViaApi(page, typeName, '分页测试', 1);
  }

  await reloadEntityTypeManagementPage(page);
  return createdTypes;
}

async function clickEntityTypeNextPage(page) {
  await entityTypeTable(page).clickNextPage();
}

async function deleteEntityTypesViaApi(page, typeNames) {
  for (const typeName of typeNames) {
    try {
      await deleteEntityTypeViaApi(page, typeName);
    } catch (e) {
      common.log('删除 Entity 类型失败: ' + typeName);
    }
  }
}
async function expectEntityTypeRowContainsLevel(page, typeName, level) {
  const row = entityTypeTable(page).rowByText(typeName);
  await expect(row).toContainText(String(level));
}

async function expectEntityTypeRowContainsText(page, typeName, text) {
  const row = entityTypeTable(page).rowByText(typeName);
  await expect(row).toContainText(text);
}

async function expectEntityTypeRowMatchesApi(page, typeName, apiData) {
  const row = entityTypeTable(page).rowByText(typeName);
  await expect(row).toContainText(apiData.type_name);
  await expect(row).toContainText(apiData.description);
  await expect(row).toContainText(String(apiData.level));
}

async function expectEntityTypeEditEchoMatchesApi(page, typeName, apiData) {
  await openEditEntityTypeDrawer(page, typeName);
  await expectEditEntityTypeFormFieldValue(page, '类型名', apiData.type_name);
  await expectEditEntityTypeFormFieldValue(page, '描述', apiData.description);
  await expectEntityTypeEditLevelMatches(page, apiData.level);
}

async function expectEntityTypeEditLevelMatches(page, level) {
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.editType);
  const levelTrigger = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '级别' })
    .locator('.ivu-select-selected-value');
  const selectedText = await levelTrigger.textContent();
  expect(selectedText.trim()).toBe(String(level));
}
async function expectEntityEditEchoMatchesApi(
  page,
  entityName,
  apiData,
  parentName,
) {
  const { openEditEntityDrawer } = require('./EntityOrgPage');
  await openEditEntityDrawer(page, entityName);
  const drawer = ivuDrawer(page).withTitle(DRAWER_TITLE.editEntity);
  // input 的 value 不会出现在 textContent 中，需要直接读取 input 值
  const nameInput = drawer.locator('input[placeholder="请输入Entity名称"]');
  await expect(nameInput).toHaveValue(apiData.name);
  const typeFormItem = drawer
    .locator('.ivu-form-item')
    .filter({ hasText: '类型' });
  const typeInput = typeFormItem.locator('input[disabled]');
  await expect(typeInput).toHaveValue(apiData.type);
  if (parentName) {
    const parentFormItem = drawer
      .locator('.ivu-form-item')
      .filter({ hasText: '父Entity' });
    const parentInput = parentFormItem.locator('input');
    await expect(parentInput).toHaveValue(parentName);
  }
}
async function expectApiKeyEditEchoMatchesApi(
  page,
  keyId,
  apiData,
  entityName,
) {
  const { openEditApiKeyDrawer } = require('./EntityApiKeyPage');
  await openEditApiKeyDrawer(page, keyId);
  const drawer = ivuDrawer(page).withTitle('编辑 API-Key');
  // input 的 value 不会出现在 textContent 中，需要直接读取 input 值
  const descInput = drawer.locator('input[placeholder="请输入API-Key描述"]');
  await expect(descInput).toHaveValue(apiData.description);
  const drawerText = await drawer.textContent();
  if (apiData.enabled) {
    await expect(drawerText).toContain('启用');
  } else {
    await expect(drawerText).toContain('停用');
  }
  if (entityName) {
    const entityFormItem = drawer
      .locator('.ivu-form-item')
      .filter({ hasText: '挂载Entity' });
    await expect(entityFormItem).toContainText(entityName);
  }
}
async function expectEntityRowMatchesApi(page, entityName, apiData) {
  const { entityOrgTable } = require('./EntityOrgPage');
  const row = entityOrgTable(page).rowByText(entityName);
  await expect(row).toContainText(apiData.name);
  await expect(row).toContainText(apiData.type);
  if (apiData.rate_limit_policy?.enabled) {
    await expect(row).toContainText('已启用');
  } else {
    await expect(row).toContainText('未启用');
  }
}
/**
 * 格式化数字为千位分隔符格式（如 100000000 → 100,000,000）
 */
function formatNumberWithCommas(num) {
  if (num === null || num === undefined) return '';
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 获取重置周期的显示文本
 */
function getResetCycleText(cycle) {
  const cycleMap = {
    monthly: '每月',
    weekly: '每周',
    daily: '每日',
    never: '永不重置',
  };
  return cycleMap[cycle] || cycle;
}

/**
 * 获取配额单位的显示文本
 */
function getQuotaUnitText(unit) {
  const unitMap = {
    total_token: 'tokens',
    request_count: 'requests',
  };
  return unitMap[unit] || unit;
}
async function expectEntityDetailMatchesApi(page, apiData, parentName) {
  const drawer = entityDetailDrawer(page);
  await expect(drawer).toBeVisible();
  const drawerText = await drawer.textContent();

  // 基本信息验证
  await expect(drawerText).toContain(apiData.name);
  await expect(drawerText).toContain(apiData.type);
  if (parentName) {
    await expect(drawerText).toContain(parentName);
  }

  // 配额信息验证
  if (apiData.quota_plan) {
    const quota = apiData.quota_plan;

    // 无限配额
    await expect(drawerText).toContain(quota.unlimited ? '是' : '否');

    // 配额不足时放行
    if (quota.pass_when_no_enough_quota !== undefined) {
      await expect(drawerText).toContain(
        quota.pass_when_no_enough_quota ? '是' : '否',
      );
    }

    // 配额总量（带千位分隔符）
    if (quota.quota !== undefined) {
      await expect(drawerText).toContain(formatNumberWithCommas(quota.quota));
    }

    // 配额单位
    if (quota.unit) {
      await expect(drawerText).toContain(getQuotaUnitText(quota.unit));
    }

    // 已使用（含百分比）
    if (quota.used !== undefined && quota.quota !== undefined) {
      const usedText = formatNumberWithCommas(quota.used);
      await expect(drawerText).toContain(usedText);
      const percentage = Math.round((quota.used / quota.quota) * 100);
      await expect(drawerText).toContain(`${percentage}%`);
    }

    // 剩余量（带千位分隔符）
    if (quota.remaining !== undefined) {
      await expect(drawerText).toContain(
        formatNumberWithCommas(quota.remaining),
      );
    }

    // 重置周期
    if (quota.reset_period || quota.reset_cycle) {
      const cycle = quota.reset_period || quota.reset_cycle;
      await expect(drawerText).toContain(getResetCycleText(cycle));
    }
  }
}

async function expectDetailInfoRowTag(drawer, label, expectedTagText) {
  const body = drawer.locator('.ivu-drawer-body');
  const infoRow = body
    .locator('.info-label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=ancestor::div[contains(@class,"info-row")][1]');
  const tag = infoRow.locator('.ivu-tag');
  if ((await tag.count()) > 0) {
    await expect(
      tag.first(),
      `详情页「${label}」应显示「${expectedTagText}」`,
    ).toHaveText(expectedTagText);
    return;
  }
  await expect(
    infoRow.first(),
    `详情页「${label}」应显示「${expectedTagText}」`,
  ).toContainText(expectedTagText);
}

async function getTableColumnIndex(table, headerLabel) {
  const headerCells = table.rootLocator().locator('.show-iView-Table thead th');
  const count = await headerCells.count();
  for (let i = 0; i < count; i++) {
    const text = await headerCells.nth(i).innerText();
    if (text.includes(headerLabel)) {
      return i;
    }
  }
  throw new Error(`未找到表头列：${headerLabel}`);
}

async function expectRowCellText(row, colIndex, expectedText) {
  await expect(row.locator('td').nth(colIndex)).toContainText(expectedText);
}

/**
 * 验证 API-Key 详情抽屉中的数据与接口返回一致
 * 包含基本信息、配额信息和限流信息的所有字段
 */
async function expectApiKeyDetailMatchesApi(page, apiData, entityName) {
  const drawer = apiKeyDetailDrawer(page);
  await expect(drawer).toBeVisible();
  const drawerText = await drawer.textContent();

  // 基本信息验证
  if (apiData.description) {
    await expect(drawerText).toContain(apiData.description);
  }

  // 状态与限流状态分字段断言，避免限流区「未启用」干扰基本信息「状态」
  await expectDetailInfoRowTag(
    drawer,
    '状态',
    apiData.enabled ? '已启用' : '未启用',
  );

  // 配额信息验证
  if (apiData.quota_plan) {
    const quota = apiData.quota_plan;

    // 无限配额：检查"无限配额"标签后的值
    // 格式通常是 "无限配额" + 值（是/否）
    const unlimitedMatch = drawerText.match(/无限配额[\s\S]{0,20}/);
    if (unlimitedMatch) {
      const unlimitedSection = unlimitedMatch[0];
      if (quota.unlimited) {
        expect(/是/.test(unlimitedSection), '无限配额应显示"是"').toBeTruthy();
      } else {
        expect(/否/.test(unlimitedSection), '有限配额应显示"否"').toBeTruthy();
      }
    }

    // 详情页「执行配额检查」绑定 unlimited_quota，与 pass_when_no_enough_quota 无关
    if (quota.unlimited !== undefined) {
      await expectDetailInfoRowTag(
        drawer,
        '执行配额检查',
        quota.unlimited ? '否' : '是',
      );
    }

    // 配额类型：使用正则精确匹配
    if (quota.unlimited) {
      // 无限配额应显示"无限"
      const hasUnlimited = /无限/.test(drawerText);
      expect(hasUnlimited, '无限配额应显示"无限"').toBeTruthy();
    } else {
      const hasLimited = /有限/.test(drawerText);
      expect(hasLimited, '有限配额应显示"有限"').toBeTruthy();
    }

    // 配额总量（带千位分隔符）
    if (quota.quota !== undefined) {
      await expect(drawerText).toContain(formatNumberWithCommas(quota.quota));
    }

    // 配额单位
    if (quota.unit) {
      await expect(drawerText).toContain(getQuotaUnitText(quota.unit));
    }

    // 已使用（含百分比）
    const used = quota.used ?? quota.balance?.used;
    const remaining = quota.remaining ?? quota.balance?.remaining;
    if (used !== undefined && quota.quota !== undefined) {
      const usedText = formatNumberWithCommas(used);
      await expect(drawerText).toContain(usedText);
      const percentage = Math.round((used / quota.quota) * 100);
      await expect(drawerText).toContain(`${percentage}%`);
    }

    // 剩余量（带千位分隔符）
    if (remaining !== undefined) {
      await expect(drawerText).toContain(formatNumberWithCommas(remaining));
    }

    // 重置周期
    if (quota.reset_period || quota.reset_cycle) {
      const cycle = quota.reset_period || quota.reset_cycle;
      await expect(drawerText).toContain(getResetCycleText(cycle));
    }
  }

  // 限流状态验证
  if (apiData.rate_limit_policy) {
    await expectDetailInfoRowTag(
      drawer,
      '限流状态',
      apiData.rate_limit_policy.enabled ? '已启用' : '未启用',
    );
  }

  // 挂载Entity验证
  if (entityName) {
    await expect(drawerText).toContain(entityName);
  }
}

async function expectApiKeyRowMatchesApi(page, keyId, apiData) {
  const table = new PageTableComponent(page);
  const row = table.rowByText(keyId);
  await expect(row).toContainText(apiData.description);

  const statusColIndex = await getTableColumnIndex(table, '状态');
  const rateLimitColIndex = await getTableColumnIndex(table, '限流状态');
  await expectRowCellText(
    row,
    statusColIndex,
    apiData.enabled ? '启用' : '停用',
  );

  const rowText = await row.innerText();

  // 配额类型验证：使用正则精确匹配
  if (apiData.quota_plan?.unlimited) {
    const hasUnlimited = /无限/.test(rowText);
    expect(hasUnlimited, '列表配额类型应显示"无限"').toBeTruthy();
  } else {
    const hasLimited = /有限/.test(rowText);
    expect(hasLimited, '列表配额类型应显示"有限"').toBeTruthy();
  }

  await expectRowCellText(
    row,
    rateLimitColIndex,
    apiData.rate_limit_policy?.enabled ? '已启用' : '未启用',
  );
}
async function deleteEntityTypeAndWait(page, typeName) {
  await clickDeleteEntityTypeBtn(page, typeName);
  await expectDeleteEntityTypeConfirmModal(page, typeName);
  await waitForEntityTypesListResponse(page, () =>
    confirmDeleteEntityType(page),
  );
  await waitAfterEntityTypeMutation(page);
}

async function editEntityTypeDescription(page, typeName, newDescription) {
  await openEditEntityTypeDrawer(page, typeName);
  await submitEditEntityTypeFormAndWait(page, { description: newDescription });
}

async function editEntityTypeLevel(page, typeName, level) {
  await openEditEntityTypeDrawer(page, typeName);
  await selectEntityTypeLevel(page, level, DRAWER_TITLE.editType);
  await waitForEntityTypesListResponse(page, () =>
    submitEntityTypeForm(page, DRAWER_TITLE.editType),
  );
  await waitAfterEntityTypeMutation(page);
}

async function createEntityWithTypeViaApi(
  page,
  entityNameOrObj,
  typeName,
  parentName,
) {
  await umUtils.handleUrlInvalidAlert(page);

  // 支持对象参数 { name, type, parentName, quotaPlan, rateLimitPolicy } 或分开参数
  let entityName, type, parent, quotaPlan, rateLimitPolicy;
  if (typeof entityNameOrObj === 'object' && entityNameOrObj !== null) {
    entityName = entityNameOrObj.name;
    type = entityNameOrObj.type;
    parent = entityNameOrObj.parentName;
    quotaPlan = entityNameOrObj.quotaPlan;
    rateLimitPolicy = entityNameOrObj.rateLimitPolicy;
  } else {
    entityName = entityNameOrObj;
    type = typeName;
    parent = parentName;
  }

  let entityData = await createEntityViaApi(
    page,
    entityName,
    type,
    parent,
    quotaPlan,
    rateLimitPolicy,
  );
  if (!entityData) {
    // Session 过期时 API 常直接失败，强制走一遍弹框/重登后再试
    await umUtils.handleUrlInvalidAlert(page);
    entityData = await createEntityViaApi(
      page,
      entityName,
      type,
      parent,
      quotaPlan,
      rateLimitPolicy,
    );
  }
  if (!entityData) {
    throw new Error('接口创建 Entity 失败: ' + entityName);
  }
  return entityData;
}
async function cleanupEntityAndType(page, entityId, typeName) {
  await deleteEntityViaApi(page, entityId);
  await deleteEntityTypeViaApi(page, typeName);
}

async function expectDeleteEntityTypeBlocked(page) {
  await expectErrorNoticeContains(page, '无法删除');
  // 删除被拦截后确认框仍打开，关闭以免遮挡后续点击
  const modal = ivuModal(page).visible();
  if (await modal.isVisible().catch(() => false)) {
    await ivuModal(page).cancel();
    await expect(modal).toBeHidden({ timeout: 10000 });
  }
}

async function expectAnyErrorNotice(page) {
  await expect(
    page
      .locator('.ivu-notice-desc, .ivu-notice-title, .ivu-message-notice')
      .first(),
  ).toBeVisible({ timeout: 15000 });
}

async function cancelEditEntityTypeForm(page) {
  await cancelEntityTypeForm(page, DRAWER_TITLE.editType);
}

async function expectEditEntityTypeFormFieldValue(page, label, value) {
  await expectEntityTypeFormFieldValue(
    page,
    label,
    value,
    DRAWER_TITLE.editType,
  );
}

async function expectEntityTypeNameInputMaxLength(page, maxLength) {
  await expectEntityTypeNameLengthValidation(page);
}

module.exports = {
  entityTypeForm,
  openCreateEntityTypeDrawer,
  openEditEntityTypeDrawer,
  fillEntityTypeForm,
  selectEntityTypeLevel,
  submitEntityTypeForm,
  createEntityTypeViaUI,
  cancelEntityTypeForm,
  closeEntityTypeDrawerByX,
  expectCreateEntityTypeDrawerOpen,
  expectCreateEntityTypeDrawerHidden,
  expectEditEntityTypeDrawerOpen,
  expectEntityTypeFormFieldError,
  expectEntityTypeFormFieldValid,
  fillEntityTypeNameAndBlur,
  expectEntityTypeNameFieldDisabled,
  expectEntityTypeFormFieldValue,
  searchEntityType,
  clearEntityTypeSearch,
  expectEntityTypeVisible,
  expectEntityTypeNotVisible,
  expectEntityTypeVisibleInAllPages,
  clickDeleteEntityTypeBtn,
  expectDeleteEntityTypeConfirmModal,
  confirmDeleteEntityType,
  cancelDeleteEntityType,
  deleteEntityType,
  expectSuccessNotice,
  expectErrorNoticeContains,
  waitForEntityTypesListResponse,
  createEntityTypeViaApi,
  fetchEntityTypeByNameViaApi,
  deleteEntityTypeViaApi,
  createEntityViaApi,
  findEntityIdByNameViaApi,
  deleteEntityViaApi,
  buildEntityTypeName,
  expectCreateEntityTypeButtonVisible,
  expectEntityTypeSearchVisible,
  expectEntityTypeTableVisible,
  expectEntityTypeTabSelected,
  expectEntityTypeTableRowActions,
  expectEntityTypeListEmpty,
  getEntityTypeListRowCount,
  expectCreateEntityTypeDrawerTitle,
  clearEntityTypeLevelField,
  clearEntityTypeRequiredFields,
  fillEntityTypeNameRawAndBlur,
  expectEntityTypeNameLengthValidation,
  expectEntityTypeDuplicateError,
  ensureDocEntityTypeDep2,
  ensureDocEntityTypesForSearch,
  submitOpenEditEntityTypeFormAndWait,
  cleanupDocTestDepIfCreated,
  expectEntityTypePaginationVisible,
  expectEntityTypeListPageLayout,
  reloadEntityTypeManagementPage,
  waitAfterEntityTypeMutation,
  waitAfterEntityTypeAction,
  createEntityTypeViaApiAndRefresh,
  prepareEntityTypeForTest,
  submitEntityTypeFormAndWaitForSuccess,
  submitCreateEntityTypeFormAndWait,
  submitEditEntityTypeFormAndWait,
  expectEntityTypeListNotEmpty,
  ensureEntityTypesForPagination,
  clickEntityTypeNextPage,
  deleteEntityTypesViaApi,
  expectEntityTypeRowContainsLevel,
  expectEntityTypeRowContainsText,
  expectEntityTypeRowMatchesApi,
  expectEntityTypeEditEchoMatchesApi,
  expectEntityTypeEditLevelMatches,
  expectEntityEditEchoMatchesApi,
  expectApiKeyEditEchoMatchesApi,
  expectEntityRowMatchesApi,
  formatNumberWithCommas,
  getResetCycleText,
  getQuotaUnitText,
  expectEntityDetailMatchesApi,
  expectApiKeyDetailMatchesApi,
  expectApiKeyRowMatchesApi,
  deleteEntityTypeAndWait,
  editEntityTypeDescription,
  editEntityTypeLevel,
  createEntityWithTypeViaApi,
  cleanupEntityAndType,
  expectDeleteEntityTypeBlocked,
  expectAnyErrorNotice,
  cancelEditEntityTypeForm,
  expectEditEntityTypeFormFieldValue,
  expectEntityTypeNameInputMaxLength,
};
