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
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * 数据报表（Report）API 工具函数
 *
 * 端点列表：
 *   GET /open-api/v1/report/overview   — 总览指标卡
 *   GET /open-api/v1/report/timeseries — 时序数据
 *   GET /open-api/v1/report/rankings   — 维度排行
 *   GET /open-api/v1/report/distribution — 占比分布
 *   GET /open-api/v1/report/logs       — 日志明细分页
 */
const common = require('../utils/common');
const fs = require('fs');
const path = require('path');

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function getOpenApiBaseUrl() {
  const base = confInfo.apiHost || confInfo.ctlHost.replace('/login', '');
  return base + '/open-api/v1';
}

/**
 * 获取请求头（含 sessionKey）
 */
async function getHeaders(page) {
  const userData = await getUserData(page);
  return {
    'Content-Type': 'application/json',
    'Authorization': userData ? 'Session ' + userData.sessionKey : '',
  };
}

async function getUserData(page) {
  try {
    const userStr = await page.evaluate(() => localStorage.getItem('user'));
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (e) {
    /* ignore */
  }
  try {
    const auth = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../auth.json'), 'utf-8'),
    );
    for (const item of auth.origins || []) {
      const entry = (item.localStorage || []).find((e) => e.name === 'user');
      if (entry && entry.value) {
        return JSON.parse(entry.value);
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

/**
 * 获取总览指标
 * GET /open-api/v1/report/overview
 */
async function fetchReportOverview(page, params = {}) {
  const url = new URL(getOpenApiBaseUrl() + '/report/overview');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const headers = await getHeaders(page);
  const res = await page.request.get(url.toString(), { headers });
  const body = await res.json();
  return body?.Data ?? body?.data ?? body;
}

/**
 * 获取时序数据
 * GET /open-api/v1/report/timeseries?metric=...
 */
async function fetchReportTimeseries(page, metric, params = {}) {
  const url = new URL(getOpenApiBaseUrl() + '/report/timeseries');
  url.searchParams.set('metric', metric);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const headers = await getHeaders(page);
  const res = await page.request.get(url.toString(), { headers });
  const body = await res.json();
  return body?.Data ?? body?.data ?? body;
}

/**
 * 获取维度排行
 * GET /open-api/v1/report/rankings?dimension=...
 */
async function fetchReportRankings(page, dimension, params = {}) {
  const url = new URL(getOpenApiBaseUrl() + '/report/rankings');
  url.searchParams.set('dimension', dimension);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const headers = await getHeaders(page);
  const res = await page.request.get(url.toString(), { headers });
  const body = await res.json();
  return body?.Data ?? body?.data ?? body;
}

/**
 * 获取占比分布
 * GET /open-api/v1/report/distribution?dimension=...
 */
async function fetchReportDistribution(page, dimension, params = {}) {
  const url = new URL(getOpenApiBaseUrl() + '/report/distribution');
  url.searchParams.set('dimension', dimension);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const headers = await getHeaders(page);
  const res = await page.request.get(url.toString(), { headers });
  const body = await res.json();
  return body?.Data ?? body?.data ?? body;
}

/**
 * 获取日志明细
 * GET /open-api/v1/report/logs
 */
async function fetchReportLogs(page, params = {}) {
  const url = new URL(getOpenApiBaseUrl() + '/report/logs');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  });
  const headers = await getHeaders(page);
  const res = await page.request.get(url.toString(), { headers });
  const body = await res.json();
  return normalizeLogsResponse(body?.Data ?? body?.data ?? body);
}

/**
 * 归一化日志列表响应：
 * 接口返回 { total, page, page_size, items }
 * 返回 { total, page, pageSize, list }
 */
function normalizeLogsResponse(data) {
  if (!data) {
    return { total: 0, page: 1, pageSize: 20, list: [] };
  }
  return {
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.page_size ?? 20,
    list: data.items ?? [],
  };
}

module.exports = {
  getOpenApiBaseUrl,
  fetchReportOverview,
  fetchReportTimeseries,
  fetchReportRankings,
  fetchReportDistribution,
  fetchReportLogs,
  normalizeLogsResponse,
};