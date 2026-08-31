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
const fs = require('fs');
const path = require('path');
const common = require('../utils/common');
const umUtils = require('../pages/user/UserPage');

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function getOpenApiBaseUrl() {
  // 优先使用 apiHost（直连后端 8183），避免 8088 代理层超时
  const base = confInfo['apiHost'] || confInfo['ctlHost'].replace('/login', '');
  return base + '/open-api/v1';
}

async function getUserData(page) {
  const userData = await page.evaluate(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      return null;
    }
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  });

  if (!userData || !userData.sessionKey) {
    throw new Error('无法从页面获取 session_key');
  }
  return userData;
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

async function forceDeleteEntityTypeViaApi(page, typeName) {
  // 先删除该类型下所有关联 entity，再删除类型本身
  try {
    const entities = await fetchAllEntitiesViaApi(page);
    for (const entity of entities) {
      if (
        entity &&
        (entity.type === typeName || entity.type_name === typeName)
      ) {
        await deleteEntityViaApi(page, entity.id);
      }
    }
  } catch (error) {
    common.log('清理关联 Entity 异常: ' + error.message);
  }
  return deleteEntityTypeViaApi(page, typeName);
}

async function fetchAllEntityTypesViaApi(page) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/entity-types',
      {
        headers: {
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    if (responseBody.ErrNum === 200) {
      const data = responseBody.Data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.list)) return data.list;
      return [];
    }
    return [];
  } catch (error) {
    common.log('接口获取 Entity 类型列表异常: ' + error.message);
    return [];
  }
}

async function ensureEntityTestData(page) {
  const DEFAULT_TYPE_NAME = 'qa-auto-dep';
  const DEFAULT_TYPE_LEVEL = 1;
  const DEFAULT_ENTITY_NAME = 'qa-auto-op';

  try {
    // 1. 确保至少有一个 Entity 类型
    const types = await fetchAllEntityTypesViaApi(page);
    if (types.length === 0) {
      common.log('Entity 类型列表为空，自动创建默认类型...');
      await createEntityTypeViaApi(
        page,
        DEFAULT_TYPE_NAME,
        '自动初始化部门类型',
        DEFAULT_TYPE_LEVEL,
      );
    }

    // 2. 确保至少有一个 Entity 组织
    const entities = await fetchAllEntitiesViaApi(page);
    const entityList = Array.isArray(entities) ? entities : [];
    if (entityList.length === 0) {
      common.log('Entity 组织列表为空，自动创建默认组织...');
      await createEntityViaApi(page, DEFAULT_ENTITY_NAME, DEFAULT_TYPE_NAME);
    }
  } catch (error) {
    common.log('ensureEntityTestData 异常: ' + error.message);
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
    common.log('接口创建 Entity 请求数据: ' + JSON.stringify(data));
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

function normalizeApiList(data) {
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.list)) {
    return data.list;
  }
  return [];
}

async function fetchAllEntitiesViaApi(page) {
  const userData = await getUserData(page);
  const pageSize = 100;
  let pageNum = 1;
  const all = [];

  while (true) {
    const response = await page.request.get(getOpenApiBaseUrl() + '/entities', {
      params: { page: pageNum, page_size: pageSize },
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    });
    const responseBody = await response.json();
    if (responseBody.ErrNum !== 200) {
      common.log(
        '接口查询 Entity 列表失败: ' +
          JSON.stringify(responseBody).slice(0, 300),
      );
      break;
    }

    const list = normalizeApiList(responseBody.Data);
    all.push(...list);

    const pagination = responseBody.Data?.pagination;
    const total = pagination?.total ?? list.length;
    if (list.length === 0 || pageNum * pageSize >= total) {
      break;
    }
    pageNum += 1;
  }

  return all;
}

async function findEntityByNameViaApi(page, entityName) {
  try {
    const all = await fetchAllEntitiesViaApi(page);
    common.log('接口查询 Entity 列表响应: 共 ' + all.length + ' 条');
    return all.find((item) => item.name === entityName) || null;
  } catch (error) {
    common.log('接口查询 Entity 列表异常: ' + error.message);
    return null;
  }
}

async function fetchAllApiKeysViaApi(page) {
  const userData = await getUserData(page);
  const pageSize = 100;
  let pageNum = 1;
  const all = [];

  while (true) {
    const response = await page.request.get(getOpenApiBaseUrl() + '/api-keys', {
      params: { page: pageNum, page_size: pageSize },
      headers: {
        Authorization: 'Session ' + userData.sessionKey,
      },
    });
    const responseBody = await response.json();
    if (responseBody.ErrNum !== 200) {
      common.log(
        '接口查询 API-Key 列表失败: ' +
          JSON.stringify(responseBody).slice(0, 300),
      );
      break;
    }

    const list = normalizeApiList(responseBody.Data);
    all.push(...list);

    const pagination = responseBody.Data?.pagination;
    const total = pagination?.total ?? list.length;
    if (list.length === 0 || pageNum * pageSize >= total) {
      break;
    }
    pageNum += 1;
  }

  return all;
}

async function findApiKeyByDescriptionViaApi(page, description) {
  try {
    const all = await fetchAllApiKeysViaApi(page);
    common.log('接口查询 API-Key 列表响应: 共 ' + all.length + ' 条');
    return all.find((item) => item.description === description) || null;
  } catch (error) {
    common.log('接口查询 API-Key 列表异常: ' + error.message);
    return null;
  }
}

async function findApiKeyByIdViaApi(page, apiKeyId) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/api-keys/' + apiKeyId,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口获取 API-Key 详情响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      return responseBody.Data;
    }
    return null;
  } catch (error) {
    common.log('接口获取 API-Key 详情异常: ' + error.message);
    return null;
  }
}

async function createApiKeyViaApi(page, data) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/api-keys',
      {
        data: data,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口创建 API-Key 响应: ' + JSON.stringify(responseBody));
    if (responseBody.ErrNum === 200) {
      return responseBody.Data;
    }
    common.log('接口创建 API-Key 失败: ' + JSON.stringify(responseBody));
    return null;
  } catch (error) {
    common.log('接口创建 API-Key 异常: ' + error.message);
    return null;
  }
}

async function deleteEntityByNameViaApi(page, entityName) {
  const entity = await findEntityByNameViaApi(page, entityName);
  if (entity && entity.id) {
    await deleteEntityViaApi(page, entity.id);
    return true;
  }
  common.log('未找到 Entity 进行删除: ' + entityName);
  return false;
}

function createApiKeyTestCleanup() {
  const tracked = {
    apiKeyIds: [],
    entityIds: [],
    entityNames: [],
    typeNames: [],
  };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    trackApiKeyId(id) {
      pushUnique(tracked.apiKeyIds, id);
    },
    trackEntityId(id) {
      pushUnique(tracked.entityIds, id);
    },
    trackEntityName(name) {
      pushUnique(tracked.entityNames, name);
    },
    trackTypeName(name) {
      pushUnique(tracked.typeNames, name);
    },
    async cleanup(page) {
      const {
        deleteApiKeyViaApi,
      } = require('../pages/entity/EntityApiKeyPage');
      for (const apiKeyId of [...tracked.apiKeyIds].reverse()) {
        try {
          await deleteApiKeyViaApi(page, apiKeyId);
        } catch (error) {
          common.log('清理 API-Key 失败: ' + apiKeyId + ' ' + error.message);
        }
      }
      for (const entityId of [...tracked.entityIds].reverse()) {
        try {
          await deleteEntityViaApi(page, entityId);
        } catch (error) {
          common.log('清理 Entity ID 失败: ' + entityId + ' ' + error.message);
        }
      }
      for (const entityName of [...tracked.entityNames].reverse()) {
        try {
          await deleteEntityByNameViaApi(page, entityName);
        } catch (error) {
          common.log('清理 Entity 失败: ' + entityName + ' ' + error.message);
        }
      }
      for (const typeName of [...tracked.typeNames].reverse()) {
        try {
          await deleteEntityTypeViaApi(page, typeName);
        } catch (error) {
          common.log('清理 Entity 类型失败: ' + typeName + ' ' + error.message);
        }
      }
      tracked.apiKeyIds = [];
      tracked.entityIds = [];
      tracked.entityNames = [];
      tracked.typeNames = [];
    },
  };
}

function createEntityOrgTestCleanup() {
  const tracked = {
    entityIds: [],
    entityNames: [],
    typeNames: [],
    apiKeyIds: [],
  };

  function pushUnique(list, value) {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  }

  return {
    trackEntityId(id) {
      pushUnique(tracked.entityIds, id);
    },
    trackEntityName(name) {
      pushUnique(tracked.entityNames, name);
    },
    trackTypeName(name) {
      pushUnique(tracked.typeNames, name);
    },
    trackApiKeyId(id) {
      pushUnique(tracked.apiKeyIds, id);
    },
    async cleanup(page) {
      const {
        deleteApiKeyViaApi,
      } = require('../pages/entity/EntityApiKeyPage');
      for (const apiKeyId of [...tracked.apiKeyIds].reverse()) {
        try {
          await deleteApiKeyViaApi(page, apiKeyId);
        } catch (error) {
          common.log('清理 API-Key 失败: ' + apiKeyId + ' ' + error.message);
        }
      }
      for (const entityId of [...tracked.entityIds].reverse()) {
        try {
          await deleteEntityViaApi(page, entityId);
        } catch (error) {
          common.log('清理 Entity ID 失败: ' + entityId + ' ' + error.message);
        }
      }
      for (const entityName of [...tracked.entityNames].reverse()) {
        try {
          await deleteEntityByNameViaApi(page, entityName);
        } catch (error) {
          common.log('清理 Entity 失败: ' + entityName + ' ' + error.message);
        }
      }
      for (const typeName of [...tracked.typeNames].reverse()) {
        try {
          await deleteEntityTypeViaApi(page, typeName);
        } catch (error) {
          common.log('清理 Entity 类型失败: ' + typeName + ' ' + error.message);
        }
      }
      tracked.entityIds = [];
      tracked.entityNames = [];
      tracked.typeNames = [];
      tracked.apiKeyIds = [];
    },
  };
}

async function updateEntityViaApi(page, entityId, data) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.put(
      getOpenApiBaseUrl() + '/entities/' + entityId,
      {
        data,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Session ' + userData.sessionKey,
        },
      },
    );
    const responseBody = await response.json();
    common.log('接口更新 Entity 响应: ' + JSON.stringify(responseBody));
    return responseBody.ErrNum === 200;
  } catch (error) {
    common.log('接口更新 Entity 异常: ' + error.message);
    return false;
  }
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  isConnectionError,
  isVisibleSafe,
  createEntityTypeViaApi,
  fetchEntityTypeByNameViaApi,
  deleteEntityTypeViaApi,
  forceDeleteEntityTypeViaApi,
  fetchAllEntityTypesViaApi,
  ensureEntityTestData,
  createEntityViaApi,
  findEntityIdByNameViaApi,
  deleteEntityViaApi,
  normalizeApiList,
  fetchAllEntitiesViaApi,
  findEntityByNameViaApi,
  fetchAllApiKeysViaApi,
  findApiKeyByDescriptionViaApi,
  findApiKeyByIdViaApi,
  createApiKeyViaApi,
  deleteEntityByNameViaApi,
  createApiKeyTestCleanup,
  createEntityOrgTestCleanup,
  updateEntityViaApi,
};
