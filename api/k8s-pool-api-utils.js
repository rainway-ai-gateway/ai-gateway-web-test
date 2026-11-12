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
'use strict';
const common = require('../utils/common');
const { getUserData, authHeaders } = require('./provider-api-utils');
const { getOpenApiBaseUrl } = require('./entity-api-utils');

/**
 * K8s 实例池（Providers「实例来源 = k8s_pool」引用的池）接口工具
 *
 * 接口基准（后端 ai-gateway-api，k8s-pools.md）：
 * - GET    /open-api/v1/k8s_pools                  → Data.list[]（不分页，空列表返回 []）
 * - GET    /open-api/v1/k8s_pools/{name}           → Data{name, instances[], instance_count}；池不存在 404
 * - PUT    /inner-api/v1/k8s_pools/{name}/instances → 造池（body 为数组；空数组 = 合法空池）
 * - DELETE /inner-api/v1/k8s_pools/{name}          → 删池
 *
 * 鉴权：open-api 与 inner-api 共用同一 Session（`Authorization: Session <session_key>`）。
 * **禁止在此再调 POST /auth/session-keys**：该接口会让同一账号已下发的 Session Key 立即失效，
 * 前端会话（auth.json）随之 401，导致整轮用例连锁失败。
 *
 * 命名约定（批量兜底脚本识别前缀）：qa_pool_<ts>（允许字母/数字/_/-/.，首尾不能为 . - _）
 */

const POOL_NAME_PREFIX = 'qa_pool_';

function innerApiBaseUrl() {
  return getOpenApiBaseUrl().replace('/open-api/v1', '/inner-api/v1');
}

async function sessionHeaders(page) {
  const userData = await getUserData(page);
  return authHeaders(userData);
}

/**
 * 拉取全部 K8s 池（GET /open-api/v1/k8s_pools）
 * @returns {Promise<Array>} Data.list（失败返回 []）
 */
async function fetchK8sPoolsViaApi(page) {
  try {
    const headers = await sessionHeaders(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/k8s_pools',
      { headers },
    );
    const body = await response.json();
    if (body.ErrNum !== 200) {
      common.log('接口查询 K8s 池列表失败: ' + JSON.stringify(body).slice(0, 300));
      return [];
    }
    const data = body.Data || {};
    return Array.isArray(data.list) ? data.list : [];
  } catch (error) {
    common.log('接口查询 K8s 池列表异常: ' + error.message);
    return [];
  }
}

/**
 * 拉取全部 K8s 池名称（顺序与接口返回一致，PR-C-25 场景 ① 的比对基准）
 * @returns {Promise<string[]>}
 */
async function getK8sPoolNamesViaApi(page) {
  const list = await fetchK8sPoolsViaApi(page);
  return list
    .filter((item) => item && item.name)
    .map((item) => String(item.name));
}

/**
 * 获取单个 K8s 池详情（GET /open-api/v1/k8s_pools/{name}）
 * @returns {Promise<{status:number, data:object|null, body:object|null}>}
 *   池不存在时 status=404、data=null（PR-D-05 场景 ③）
 */
async function getK8sPoolViaApi(page, name) {
  try {
    const headers = await sessionHeaders(page);
    const response = await page.request.get(
      getOpenApiBaseUrl() + '/k8s_pools/' + encodeURIComponent(name),
      { headers },
    );
    const body = await response.json().catch(() => null);
    const ok = body && body.ErrNum === 200;
    return { status: response.status(), data: ok ? body.Data : null, body };
  } catch (error) {
    common.log('接口获取 K8s 池详情异常: ' + error.message);
    return { status: 0, data: null, body: null };
  }
}

/**
 * 造池 / 覆盖池内实例（PUT /inner-api/v1/k8s_pools/{name}/instances）
 * body 必须是数组（[{addr, port, weight}]），空数组表示合法空池。
 * @returns {Promise<{ok:boolean, body:object|null}>}
 */
async function syncK8sPoolInstancesViaApi(page, name, instances) {
  try {
    const headers = await sessionHeaders(page);
    const response = await page.request.put(
      innerApiBaseUrl() + '/k8s_pools/' + encodeURIComponent(name) + '/instances',
      { data: instances, headers },
    );
    const body = await response.json().catch(() => null);
    common.log(
      'InnerAPI 同步 K8s 池实例: ' + name + ' -> ' + JSON.stringify(body).slice(0, 300),
    );
    return { ok: !!body && body.ErrNum === 200, body };
  } catch (error) {
    common.log('InnerAPI 同步 K8s 池实例异常: ' + error.message);
    return { ok: false, body: null };
  }
}

/**
 * 造池（含实例）并返回池详情
 * @param {{addr:string, port:number, weight:number}[]} instances 空数组 = 合法空池
 * @returns {Promise<object|null>}
 */
async function createK8sPoolViaApi(page, name, instances = []) {
  const { ok } = await syncK8sPoolInstancesViaApi(page, name, instances);
  if (!ok) return null;
  const { data } = await getK8sPoolViaApi(page, name);
  return data;
}

/**
 * 删池（DELETE /inner-api/v1/k8s_pools/{name}）；池不存在视为成功（幂等）
 * @returns {Promise<{ok:boolean, body:object|null}>}
 */
async function deleteK8sPoolViaApi(page, name) {
  try {
    const headers = await sessionHeaders(page);
    const response = await page.request.delete(
      innerApiBaseUrl() + '/k8s_pools/' + encodeURIComponent(name),
      { headers },
    );
    const body = await response.json().catch(() => null);
    const ok = !!body && body.ErrNum === 200;
    if (!ok) {
      common.log('InnerAPI 删除 K8s 池失败: ' + name + ' -> ' + JSON.stringify(body).slice(0, 300));
    }
    return { ok, body };
  } catch (error) {
    common.log('InnerAPI 删除 K8s 池异常: ' + name + ' ' + error.message);
    return { ok: false, body: null };
  }
}

/**
 * 造池/删池清理跟踪器（afterEach 使用）
 */
function createK8sPoolTestCleanup() {
  const tracked = [];

  return {
    trackPool(name) {
      if (name && !tracked.includes(name)) tracked.push(name);
    },
    async cleanup(page) {
      for (const name of [...tracked].reverse()) {
        await deleteK8sPoolViaApi(page, name);
      }
      tracked.length = 0;
    },
  };
}

module.exports = {
  POOL_NAME_PREFIX,
  getK8sPoolNamesViaApi,
  fetchK8sPoolsViaApi,
  getK8sPoolViaApi,
  syncK8sPoolInstancesViaApi,
  createK8sPoolViaApi,
  deleteK8sPoolViaApi,
  createK8sPoolTestCleanup,
};
