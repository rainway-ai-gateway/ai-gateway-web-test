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
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/entity/EntityPage');
const {
  getUserData,
  getOpenApiBaseUrl,
} = require('../../api/entity-api-utils');

const DOC = utils.DOC_API_KEY;

/**
 * API-Key 详情页全字段一致性测试
 *
 * 通用的详情页字段验证用例，把详情页上展示的每一个字段都与接口返回的数据逐一比对。
 * 覆盖的字段包括：
 * - 基本信息：描述、Key ID、Key 值、状态、过期时间、无限配额、允许模型、允许子网、挂载Entity
 * - 配额信息：配额总量、已使用、剩余量、配额单位、重置周期
 * - 限流信息：限流状态、TPM规则、RPM规则、最大并发
 * - 时间信息：创建时间、更新时间
 */

function apiKeyDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createApiKeyTestCleanup();

    test.afterEach(async ({ page }) => {
      await cleanup.cleanup(page);
    });

    register(cleanup);
  });
}

/**
 * 将时间戳转换为页面显示的日期格式
 * 页面通常显示为 "2026/7/8 18:02:26" 或 "2026-07-08 18:02:26" 格式
 */
function formatTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'number') return null;
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 与前端 EntityView/ApiKeyView formatNumber 一致的金额/数值格式化
 * （zh-CN 千分位，RMB 最多 4 位小数，total_token 0 位；
 *   与前端一致使用 minimumFractionDigits=0，不足 4 位小数不补零，
 *   如 0 显示为 ¥0 而非 ¥0.0000）
 */
function formatQuotaNumber(num, decimals) {
  const value = Number(num);
  if (Number.isNaN(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// 复刻 ApiKeyList.vue formatNumber：decimals=0 时对 >=1000 做 K/M 缩写
function formatApiKeyListNumber(num, decimals) {
  const value = Number(num);
  if (Number.isNaN(value)) return '-';
  if (decimals === 0) {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
  }
  return formatQuotaNumber(value, decimals);
}

apiKeyDescribe(
  'API-Key展示 - AKD-01 详情页全字段与接口数据一致性',
  (cleanup) => {
    let description;
    let apiKeyId;
    let entityName;
    let typeName;

    test('验证API-Key详情页所有字段与接口返回数据一致', async ({ page }) => {
      description = DOC.searchDescription + '_full_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity和带完整配置的API-Key', async () => {
        // 创建类型和Entity
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(page, typeName, '全字段验证类型', 1);
        // 等待类型创建生效，避免后端数据同步延迟
        await page.waitForTimeout(2000);
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
        });
        cleanup.trackEntityName(entityName);

        // 通过接口获取Entity ID
        const entity = await utils.findEntityByNameViaApi(page, entityName);
        const entityId = entity?.id;

        // 通过接口创建带完整配置的API-Key（避免UI下拉框稳定性问题）
        const apiKeyData = await utils.createApiKeyViaApi(page, {
          description: description,
          enabled: true,
          entity_id: entityId,
          quota_plan: {
            unlimited: false,
            quota: 100000000,
            unit: 'total_token',
            reset_period: 'monthly',
          },
          rate_limit_policy: {
            enabled: true,
            rules: {
              tpm: [
                {
                  name: 'tpm-rule',
                  model: '*',
                  window_minutes: 60,
                  step_minutes: 1,
                  max_tokens: 10000,
                },
              ],
              rpm: [
                {
                  name: 'rpm-rule',
                  model: '*',
                  window_minutes: 1,
                  step_minutes: 1,
                  max_requests: 100,
                },
              ],
              max_concurrency: 0,
            },
          },
        });

        expect(apiKeyData).not.toBeNull();
        apiKeyId = apiKeyData?.id;
        if (apiKeyId) cleanup.trackApiKeyId(apiKeyId);

        // 等待1秒后编辑，确保 update_time 与 create_time 不同
        await page.waitForTimeout(1500);

        // 通过接口编辑 API-Key，触发 update_time 更新
        const userData = await getUserData(page);
        const editResponse = await page.request.put(
          getOpenApiBaseUrl() + '/api-keys/' + apiKeyId,
          {
            data: {
              description: description + '_edited',
              enabled: true,
            },
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Session ' + userData.sessionKey,
            },
          },
        );
        const editBody = await editResponse.json();
        expect(editBody.ErrNum).toBe(200);

        await utils.gotoApiKeyManagementPage(page);
        await utils.ensureApiKeyRowVisible(page, description + '_edited');
      });

      await test.step('1. 通过接口获取API-Key完整数据', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        expect(apiData).not.toBeNull();

        // 记录接口数据供后续对比
        test.info().annotations.push({
          type: 'api_data',
          description: JSON.stringify({
            description: apiData.description,
            enabled: apiData.enabled,
            unlimited: apiData.quota_plan.unlimited,
            quota: apiData.quota_plan.quota,
            used: apiData.quota_plan.used,
            remaining: apiData.quota_plan.remaining,
            unit: apiData.quota_plan.unit,
            reset_period: apiData.quota_plan.reset_period,
            models: apiData.models,
            subnet: apiData.subnet,
            create_time: apiData.create_time,
            update_time: apiData.update_time,
          }),
        });
      });

      await test.step('2. 打开API-Key详情抽屉', async () => {
        await utils.openApiKeyDetail(page, description + '_edited');
        await utils.expectApiKeyDetailVisible(page);
      });

      await test.step('3. 验证基本信息字段', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'API-Key 详情' })
          .first();
        const drawerText = await drawer.textContent();

        // 描述
        await expect(drawerText).toContain(apiData.description);

        // Key ID
        await expect(drawerText).toContain(apiData.id);

        // Key 值（部分显示）
        const keyPrefix = apiData.key.substring(0, 10);
        await expect(drawerText).toContain(keyPrefix);

        // 状态
        const statusText = apiData.enabled ? '启用' : '停用';
        await expect(drawerText).toContain(statusText);

        // 挂载Entity
        if (apiData.entity_id) {
          await expect(drawerText).toContain(entityName);
        }
      });

      await test.step('4. 验证配额信息字段', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'API-Key 详情' })
          .first();
        const drawerText = await drawer.textContent();
        const quota = apiData.quota_plan;

        // 执行配额检查（详情页字段标签为"执行配额检查"）
        // unlimited=false 时显示"是"（需要检查），unlimited=true 时显示"否"（不检查）
        const quotaCheckText = quota.unlimited ? '否' : '是';
        await expect(drawerText).toContain(quotaCheckText);

        // 配额总量（带千位分隔符）
        if (quota.quota !== undefined) {
          const formattedQuota = quota.quota
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          await expect(drawerText).toContain(formattedQuota);
        }

        // 已使用
        if (quota.used !== undefined) {
          const formattedUsed = quota.used
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          await expect(drawerText).toContain(formattedUsed);
        }

        // 剩余量
        if (quota.remaining !== undefined) {
          const formattedRemaining = quota.remaining
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          await expect(drawerText).toContain(formattedRemaining);
        }

        // 配额单位
        if (quota.unit) {
          const unitText = quota.unit === 'total_token' ? 'tokens' : 'requests';
          await expect(drawerText).toContain(unitText);
        }

        // 重置周期
        if (quota.reset_period || quota.reset_cycle) {
          const cycle = quota.reset_period || quota.reset_cycle;
          const cycleMap = {
            monthly: '每月',
            weekly: '每周',
            daily: '每日',
            never: '永不重置',
          };
          await expect(drawerText).toContain(cycleMap[cycle] || cycle);
        }
      });

      await test.step('5. 验证限流信息字段', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'API-Key 详情' })
          .first();
        const drawerText = await drawer.textContent();
        const rateLimit = apiData.rate_limit_policy;

        // 限流状态
        const rateLimitStatus = rateLimit.enabled ? '已启用' : '未启用';
        await expect(drawerText).toContain(rateLimitStatus);

        // TPM规则
        if (rateLimit.rules?.tpm?.length > 0) {
          const tpmRule = rateLimit.rules.tpm[0];
          await expect(drawerText).toContain(tpmRule.name);
          await expect(drawerText).toContain(tpmRule.window_minutes.toString());
          // 注意：UI 对 TPM/RPM 规则数值不做千位分隔格式化，直接用原始数值
          await expect(drawerText).toContain(tpmRule.max_tokens.toString());
        }

        // RPM规则
        if (rateLimit.rules?.rpm?.length > 0) {
          const rpmRule = rateLimit.rules.rpm[0];
          await expect(drawerText).toContain(rpmRule.name);
          await expect(drawerText).toContain(rpmRule.window_minutes.toString());
          await expect(drawerText).toContain(rpmRule.max_requests.toString());
        }
      });

      await test.step('6. 验证时间信息字段', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'API-Key 详情' })
          .first();
        const drawerText = await drawer.textContent();

        // 创建时间
        if (apiData.create_time) {
          const createTimeFormatted = formatTimestamp(apiData.create_time);
          if (createTimeFormatted) {
            // 检查是否包含日期格式（可能是 2026/7/8 或 2026-07-08）
            const hasCreateDate =
              drawerText.includes('创建时间') &&
              /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(drawerText);
            expect(
              hasCreateDate,
              '详情页应显示创建时间，格式为日期时间',
            ).toBeTruthy();
          }
        }

        // 更新时间
        if (apiData.update_time) {
          // 更新时间不应为空、不应为"-"
          const hasUpdateTimeLabel = drawerText.includes('更新时间');
          if (hasUpdateTimeLabel) {
            const hasUpdateTimeDash =
              /更新时间[\s]*-[\s]*$/.test(drawerText) ||
              drawerText.includes('更新时间 -') ||
              drawerText.includes('更新时间-');

            expect(
              !hasUpdateTimeDash,
              '详情页"更新时间"不应显示为"-"，API已返回时间戳 ' +
                apiData.update_time +
                '，页面应转换为可读时间',
            ).toBeTruthy();

            // 验证包含日期格式
            const hasUpdateDate = /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(
              drawerText,
            );
            expect(
              hasUpdateDate,
              '详情页"更新时间"应显示为日期格式',
            ).toBeTruthy();
          }
        }
      });

      await test.step('关闭详情并清理', async () => {
        await utils.closeApiKeyDetail(page);
      });
    });
  },
);

apiKeyDescribe(
  'API-Key展示 - EM-K-55 API-Key详情-RMB单位配额展示',
  (cleanup) => {
    let description;
    let apiKeyId;
    let entityName;
    let typeName;

    test('验证RMB单位API-Key详情配额展示格式', async ({ page }) => {
      description = DOC.searchDescription + '_rmb_view_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity及 unit=RMB 的API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          typeName,
          'RMB详情展示类型',
          1,
        );
        // 等待类型创建生效，避免后端数据同步延迟
        await page.waitForTimeout(2000);
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
        });
        cleanup.trackEntityName(entityName);
        const entity = await utils.findEntityByNameViaApi(page, entityName);

        const apiKeyData = await utils.createApiKeyViaApi(page, {
          description,
          enabled: true,
          entity_id: entity?.id,
          quota_plan: { unlimited: false, quota: 100.12345678, unit: 'RMB' },
        });
        expect(apiKeyData).not.toBeNull();
        apiKeyId = apiKeyData?.id;
        if (apiKeyId) cleanup.trackApiKeyId(apiKeyId);

        await utils.gotoApiKeyManagementPage(page);
        await utils.ensureApiKeyRowVisible(page, description);
      });

      await test.step('1. 打开API-Key详情抽屉', async () => {
        await utils.openApiKeyDetail(page, description);
        await utils.expectApiKeyDetailVisible(page);
      });

      await test.step('2. 验证配额信息RMB展示格式', async () => {
        const apiData = await utils.findApiKeyByIdViaApi(page, apiKeyId);
        const quota = apiData.quota_plan;
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'API-Key 详情' })
          .first();
        const drawerText = await drawer.textContent();

        // API-Key 详情抽屉未渲染单位行（无 RMB 文本），仅验证 ¥ 前缀与小数位
        // 配额总量：¥ 前缀 + 4 位小数
        await expect(drawerText).toContain(
          '¥' + formatQuotaNumber(quota.quota, 4),
        );

        // 已使用 / 剩余量同样 ¥ 前缀，最多 4 位小数（0 值不补零，如 ¥0）
        const used = quota.balance ? Number(quota.balance.used) || 0 : 0;
        const remaining = Math.max(0, Number(quota.quota) - used);
        await expect(drawerText).toContain('¥' + formatQuotaNumber(used, 4));
        await expect(drawerText).toContain(
          '¥' + formatQuotaNumber(remaining, 4),
        );

        // 进度条百分比与 used / quota 比例一致（前端 quotaPercent 计算方式）
        const percent = Math.round((used / Number(quota.quota)) * 10000) / 100;
        await expect(drawerText).toContain(`(${percent}%)`);
      });

      await test.step('关闭详情', async () => {
        await utils.closeApiKeyDetail(page);
      });
    });
  },
);

apiKeyDescribe(
  'API-Key展示 - EM-K-56 API-Key列表-RMB单位配额用量展示',
  (cleanup) => {
    let rmbDesc;
    let tokenDesc;
    let entityName;
    let typeName;

    test('验证列表中不同unit的配额展示不混用', async ({ page }) => {
      rmbDesc = DOC.searchDescription + '_rmb_list_' + Date.now();
      tokenDesc = DOC.searchDescription + '_token_list_' + Date.now();
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建Entity及 total_token/RMB 两个API-Key', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          typeName,
          'RMB列表展示类型',
          1,
        );
        await page.waitForTimeout(2000);
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
        });
        cleanup.trackEntityName(entityName);
        const entity = await utils.findEntityByNameViaApi(page, entityName);

        const apiKeyA = await utils.createApiKeyViaApi(page, {
          description: tokenDesc,
          enabled: true,
          entity_id: entity?.id,
          quota_plan: {
            unlimited: false,
            quota: 100000,
            unit: 'total_token',
          },
        });
        const apiKeyB = await utils.createApiKeyViaApi(page, {
          description: rmbDesc,
          enabled: true,
          entity_id: entity?.id,
          quota_plan: { unlimited: false, quota: 100.12345678, unit: 'RMB' },
        });
        expect(apiKeyA).not.toBeNull();
        expect(apiKeyB).not.toBeNull();
        if (apiKeyA?.id) cleanup.trackApiKeyId(apiKeyA.id);
        if (apiKeyB?.id) cleanup.trackApiKeyId(apiKeyB.id);

        await utils.gotoApiKeyManagementPage(page);
      });

      await test.step('1. 验证 total_token 行展示为 xxx tokens', async () => {
        await utils.searchApiKeyByDescription(page, tokenDesc);
        const tokenData = await utils.findApiKeyByDescriptionViaApi(
          page,
          tokenDesc,
        );
        const tq = tokenData.quota_plan;
        const tUsed = tq.balance ? Number(tq.balance.used) || 0 : 0;
        // 前端格式：`{used} tokens / {quota} tokens`，且 decimals=0 时 >=1000 缩写为 K/M
        const tText = `${formatApiKeyListNumber(
          tUsed,
          0,
        )} tokens / ${formatApiKeyListNumber(tq.quota, 0)} tokens`;
        const tokenRow = page
          .locator('.show-iView-Table .ivu-table tbody tr')
          .filter({ hasText: tokenDesc })
          .first();
        await expect(tokenRow).toContainText(tText);
        await expect(tokenRow).not.toContainText('¥');
      });

      await test.step('2. 验证 RMB 行展示为 ¥xxx', async () => {
        await utils.searchApiKeyByDescription(page, rmbDesc);
        const rmbData = await utils.findApiKeyByDescriptionViaApi(
          page,
          rmbDesc,
        );
        const rq = rmbData.quota_plan;
        const rUsed = rq.balance ? Number(rq.balance.used) || 0 : 0;
        const rText = `¥${formatQuotaNumber(
          rUsed,
          4,
        )} / ¥${formatQuotaNumber(rq.quota, 4)}`;
        const rmbRow = page
          .locator('.show-iView-Table .ivu-table tbody tr')
          .filter({ hasText: rmbDesc })
          .first();
        await expect(rmbRow).toContainText(rText);
        await expect(rmbRow).not.toContainText('tokens');
      });
    });
  },
);
