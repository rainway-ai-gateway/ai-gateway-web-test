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

const DOC = utils.DOC_ENTITY_ORG;

/**
 * Entity Org 详情页全字段一致性测试
 *
 * 通用的详情页字段验证用例，把详情页上展示的每一个字段都与接口返回的数据逐一比对。
 * 覆盖的字段包括：
 * - 基本信息：名称、类型、父Entity、描述
 * - 配额信息：无限配额、配额总量、已使用、剩余量、配额单位、重置周期、配额不足时放行
 * - 限流信息：限流状态、TPM规则、RPM规则、最大并发
 * - 时间信息：创建时间、更新时间
 */

function entityOrgDescribe(title, register) {
  test.describe(title, () => {
    const cleanup = utils.createEntityOrgTestCleanup();

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

entityOrgDescribe(
  'EntityOrg展示 - EOD-01 详情页全字段与接口数据一致性',
  (cleanup) => {
    let entityName;
    let typeName;
    let parentName;
    let parentTypeName;

    test('验证Entity详情页所有字段与接口返回数据一致', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      parentName = await utils.generateTestEntityName();
      parentTypeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackEntityName(parentName);
      cleanup.trackTypeName(typeName);
      cleanup.trackTypeName(parentTypeName);

      await test.step('前置：创建父Entity和带完整配置的子Entity', async () => {
        // 创建类型
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          parentTypeName,
          '全字段验证父类型',
          1,
        );
        await utils.createEntityTypeViaApi(
          page,
          typeName,
          '全字段验证子类型',
          2,
        );

        // 创建父Entity
        await utils.gotoEntityOrgManagementPage(page);
        await utils.createEntityViaUI(page, parentName, parentTypeName);

        // 创建带配额和限流的子Entity
        await utils.openCreateEntityDrawer(page);
        await utils.fillEntityFormBasic(page, {
          name: entityName,
          typeName,
          parentName,
        });
        await utils.fillEntityQuotaForm(page, {
          unlimited: false,
          total: 100000000,
          unit: 'total_token',
          resetCycle: '每月',
        });
        await utils.fillEntityRateLimitForm(page, {
          enable: true,
          tpm: {
            name: 'tpm-rule',
            window: 60,
            maxTokens: 10000,
          },
          rpm: {
            name: 'rpm-rule',
            window: 1,
            maxRequests: 100,
          },
          maxConcurrency: '不限制',
        });
        await utils.waitForEntitiesListResponse(page, () =>
          utils.submitEntityForm(page),
        );
        await utils.waitAfterEntityMutation(page);

        // 等待1秒后编辑，确保 update_time 与 create_time 不同
        await page.waitForTimeout(1500);

        // 通过接口编辑 Entity，触发 update_time 更新
        const entity = await utils.findEntityByNameViaApi(page, entityName);
        const userData = await getUserData(page);
        const editResponse = await page.request.put(
          getOpenApiBaseUrl() + '/entities/' + entity.id,
          {
            data: {
              name: entityName,
              type: typeName,
              description: '全字段验证描述',
            },
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Session ' + userData.sessionKey,
            },
          },
        );
        const editBody = await editResponse.json();
        expect(editBody.ErrNum).toBe(200);

        await utils.reloadEntityOrgManagementPage(page);
        await utils.searchEntityByName(page, entityName);
      });

      await test.step('1. 通过接口获取Entity完整数据', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        expect(apiData).not.toBeNull();

        // 记录接口数据供后续对比
        test.info().annotations.push({
          type: 'api_data',
          description: JSON.stringify({
            name: apiData.name,
            type: apiData.type,
            description: apiData.description,
            unlimited: apiData.quota_plan.unlimited,
            quota: apiData.quota_plan.quota,
            used: apiData.quota_plan.used,
            remaining: apiData.quota_plan.remaining,
            unit: apiData.quota_plan.unit,
            reset_period: apiData.quota_plan.reset_period,
            pass_when_no_enough_quota:
              apiData.quota_plan.pass_when_no_enough_quota,
            rateLimitEnabled: apiData.rate_limit_policy.enabled,
            create_time: apiData.create_time,
            update_time: apiData.update_time,
          }),
        });
      });

      await test.step('2. 打开Entity详情抽屉', async () => {
        await utils.openEntityDetail(page, entityName);
        await utils.expectEntityDetailVisible(page);
      });

      await test.step('3. 验证基本信息字段', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'Entity 详情' })
          .first();
        const drawerText = await drawer.textContent();

        // 名称
        await expect(drawerText).toContain(apiData.name);

        // 类型
        await expect(drawerText).toContain(apiData.type);

        // 父Entity
        await expect(drawerText).toContain(parentName);

        // 描述（如果有）
        if (apiData.description) {
          await expect(drawerText).toContain(apiData.description);
        }
      });

      await test.step('4. 验证配额信息字段', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'Entity 详情' })
          .first();
        const drawerText = await drawer.textContent();
        const quota = apiData.quota_plan;

        // 无限配额
        const unlimitedText = quota.unlimited ? '是' : '否';
        await expect(drawerText).toContain(unlimitedText);

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

        // 配额不足时放行
        if (quota.pass_when_no_enough_quota !== undefined) {
          const passText = quota.pass_when_no_enough_quota ? '是' : '否';
          await expect(drawerText).toContain(passText);
        }
      });

      await test.step('5. 验证限流信息字段', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'Entity 详情' })
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
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'Entity 详情' })
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
        await utils.closeEntityDetail(page);
      });
    });
  },
);

entityOrgDescribe(
  'EntityOrg展示 - EM-E-50 Entity详情-RMB单位配额展示',
  (cleanup) => {
    let entityName;
    let typeName;

    test('验证RMB单位Entity详情配额展示格式', async ({ page }) => {
      entityName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(entityName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建类型及 unit=RMB 的Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          typeName,
          'RMB详情展示类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: entityName,
          type: typeName,
          quotaPlan: { unlimited: false, quota: 100.12345678, unit: 'RMB' },
        });
        await utils.gotoEntityOrgManagementPage(page);
        await utils.searchEntityByName(page, entityName);
      });

      await test.step('1. 打开详情抽屉', async () => {
        await utils.openEntityDetail(page, entityName);
        await utils.expectEntityDetailVisible(page);
      });

      await test.step('2. 验证配额信息RMB展示格式', async () => {
        const apiData = await utils.findEntityByNameViaApi(page, entityName);
        const quota = apiData.quota_plan;
        const drawer = page
          .locator('.ivu-drawer-wrap:not(.ivu-drawer-hidden)')
          .filter({ hasText: 'Entity 详情' })
          .first();
        const drawerText = await drawer.textContent();

        // 单位行显示 RMB（详情 quotaPlanUnit 原值）
        await expect(drawerText).toContain('RMB');

        // 配额总量：¥ 前缀，最多 4 位小数（0 值不补零，如 ¥0）
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
        await utils.closeEntityDetail(page);
      });
    });
  },
);

entityOrgDescribe(
  'EntityOrg展示 - EM-E-51 Entity列表-RMB单位配额用量展示',
  (cleanup) => {
    let rmbName;
    let tokenName;
    let typeName;

    test('验证列表中不同unit的配额展示不混用', async ({ page }) => {
      rmbName = await utils.generateTestEntityName();
      tokenName = await utils.generateTestEntityName();
      typeName = await utils.generateTestEntityTypeName();
      cleanup.trackEntityName(rmbName);
      cleanup.trackEntityName(tokenName);
      cleanup.trackTypeName(typeName);

      await test.step('前置：创建类型及 total_token/RMB 两个Entity', async () => {
        await utils.gotoEntityTypeManagementPage(page);
        await utils.createEntityTypeViaApi(
          page,
          typeName,
          'RMB列表展示类型',
          1,
        );
        await utils.createEntityWithTypeViaApi(page, {
          name: tokenName,
          type: typeName,
          quotaPlan: { unlimited: false, quota: 100000, unit: 'total_token' },
        });
        await utils.createEntityWithTypeViaApi(page, {
          name: rmbName,
          type: typeName,
          quotaPlan: { unlimited: false, quota: 100.12345678, unit: 'RMB' },
        });
        await utils.gotoEntityOrgManagementPage(page);
      });

      await test.step('1. 验证 total_token 行展示为 xxx tokens', async () => {
        await utils.searchEntityByName(page, tokenName);
        const tokenEntity = await utils.findEntityByNameViaApi(page, tokenName);
        const tq = tokenEntity.quota_plan;
        const tUsed = tq.balance ? Number(tq.balance.used) || 0 : 0;
        // 前端格式：`{used} tokens / {quota} tokens`
        const tText = `${formatQuotaNumber(tUsed, 0)} tokens / ${formatQuotaNumber(
          tq.quota,
          0,
        )} tokens`;
        const tokenRow = page
          .locator('.show-iView-Table .ivu-table tbody tr')
          .filter({ hasText: tokenName })
          .first();
        await expect(tokenRow).toContainText(tText);
        await expect(tokenRow).not.toContainText('¥');
      });

      await test.step('2. 验证 RMB 行展示为 ¥xxx', async () => {
        await utils.searchEntityByName(page, rmbName);
        const rmbEntity = await utils.findEntityByNameViaApi(page, rmbName);
        const rq = rmbEntity.quota_plan;
        const rUsed = rq.balance ? Number(rq.balance.used) || 0 : 0;
        const rText = `¥${formatQuotaNumber(
          rUsed,
          4,
        )} / ¥${formatQuotaNumber(rq.quota, 4)}`;
        const rmbRow = page
          .locator('.show-iView-Table .ivu-table tbody tr')
          .filter({ hasText: rmbName })
          .first();
        await expect(rmbRow).toContainText(rText);
        await expect(rmbRow).not.toContainText('tokens');
      });
    });
  },
);
