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
/**
 * 资源管理 - AI网关实例池测试用例
 * 覆盖：RM-GP-05~RM-GP-07、RM-GP-10~RM-GP-16（编辑场景）
 * API：GET /alb-pool、PATCH /alb-pool（单例模式，无创建/删除）
 * Skill：使用 Page Object 模式，spec 中无裸选择器
 */
const { test, expect } = require('@playwright/test');
const utils = require('../../pages/resource/ResourcePage');

// 网关实例池为单例资源，禁止并行造数/编辑
test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────
// 辅助：设置实例池初始状态
// ─────────────────────────────────────────────
async function setupPoolInstances(page, instances) {
  let ok = false;
  await utils.waitForBfePoolsListResponse(page, async () => {
    ok = await utils.updateBfePool(page, { instances });
  });
  expect(ok).toBe(true);
}

// ─────────────────────────────────────────────
// RM-GP-05 编辑时实例 ip/域名必填
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-05 编辑时实例 ip/域名必填', () => {
  const cleanup = utils.createResourceTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@validation 验证编辑时 ip/域名为空提交被拦截', async ({ page }) => {
    await test.step('前置：保存原始状态并设置测试数据', async () => {
      await cleanup.saveGatewayPoolOriginalState(page);
      await utils.gotoGatewayPoolManagementPage(page);
      await setupPoolInstances(page, [
        {
          hostname: 'node1',
          ip: '127.0.0.1',
          weight: 1,
          ports: { Default: 80 },
        },
      ]);
    });

    await test.step('1. 点击「编辑」进入内联编辑模式', async () => {
      await utils.openGatewayPoolEditMode(page);
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('2. 清空实例行的 ip/域名字段', async () => {
      await utils.fillGatewayPoolEditRow(page, 0, {
        hostname: 'node1',
        ip: '',
        port: 80,
      });
    });

    await test.step('3. 点击「提交」', async () => {
      await utils.submitGatewayPoolEditForm(page);
      await utils.waitAfterResourceMutation(page, 1000);
    });

    await test.step('4. 验证提交被拦截（编辑模式仍保持）', async () => {
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('5. 点击「取消」退出编辑模式', async () => {
      await utils.cancelGatewayPoolEdit(page);
      await utils.expectGatewayPoolListMode(page);
    });
  });
});

// ─────────────────────────────────────────────
// RM-GP-06 编辑时实例端口范围校验
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-06 编辑时实例端口范围校验', () => {
  const cleanup = utils.createResourceTestCleanup();

  const invalidPorts = [
    { port: 0, label: '端口为0' },
    { port: 70000, label: '端口超65535' },
  ];

  for (const { port, label } of invalidPorts) {
    test(`@validation 验证编辑时非法端口 [${label}]: ${port}`, async ({
      page,
    }) => {
      await test.step('前置：保存原始状态并设置测试数据', async () => {
        await cleanup.saveGatewayPoolOriginalState(page);
        await utils.gotoGatewayPoolManagementPage(page);
        await setupPoolInstances(page, [
          {
            hostname: 'node1',
            ip: '127.0.0.1',
            weight: 1,
            ports: { Default: 80 },
          },
        ]);
      });

      await test.step('1. 点击「编辑」进入内联编辑模式', async () => {
        await utils.openGatewayPoolEditMode(page);
        await utils.expectGatewayPoolEditMode(page);
      });

      await test.step(`2. 修改实例行端口为 ${port}`, async () => {
        await utils.fillGatewayPoolEditRow(page, 0, {
          hostname: 'node1',
          ip: '127.0.0.1',
          port,
        });
      });

      await test.step('3. 点击「提交」', async () => {
        await utils.submitGatewayPoolEditForm(page);
        await utils.waitAfterResourceMutation(page, 1000);
      });

      await test.step('4. 验证提交被拦截（编辑模式仍保持）', async () => {
        await utils.expectGatewayPoolEditMode(page);
      });

      await test.step('5. 点击「取消」退出编辑模式', async () => {
        await utils.cancelGatewayPoolEdit(page);
        await utils.expectGatewayPoolListMode(page);
      });
    });
  }
});

// ─────────────────────────────────────────────
// RM-GP-07 编辑实例池
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-07 编辑实例池', () => {
  const cleanup = utils.createResourceTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证编辑实例池（内联编辑模式）', async ({ page }) => {
    await test.step('前置：保存原始状态并设置测试数据', async () => {
      await cleanup.saveGatewayPoolOriginalState(page);
      await utils.gotoGatewayPoolManagementPage(page);
      await setupPoolInstances(page, [
        {
          hostname: 'node1',
          ip: '127.0.0.1',
          weight: 1,
          ports: { Default: 80 },
        },
      ]);
    });

    await test.step('1. 点击列表页顶部「编辑」按钮，进入内联编辑模式', async () => {
      await utils.openGatewayPoolEditMode(page);
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('2. 修改实例 IP', async () => {
      await utils.fillGatewayPoolEditRow(page, 0, {
        hostname: 'node1',
        ip: '127.0.0.2',
        port: 80,
      });
    });

    await test.step('3. 点击「提交」', async () => {
      await utils.submitGatewayPoolEditAndWaitForSuccess(page);
    });

    await test.step('4. 验证编辑成功', async () => {
      await utils.expectGatewayPoolEditSuccess(page);
      await utils.expectGatewayPoolListMode(page);
    });
  });
});

// ─────────────────────────────────────────────
// RM-GP-10 实例行删除门槛
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-10 实例行删除门槛', () => {
  const cleanup = utils.createResourceTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@validation 验证仅 1 行时删除按钮禁用', async ({ page }) => {
    await test.step('前置：保存原始状态并设置测试数据', async () => {
      await cleanup.saveGatewayPoolOriginalState(page);
      await utils.gotoGatewayPoolManagementPage(page);
      await setupPoolInstances(page, [
        {
          hostname: 'node1',
          ip: '127.0.0.1',
          weight: 1,
          ports: { Default: 80 },
        },
      ]);
    });

    await test.step('1. 点击「编辑」进入内联编辑模式', async () => {
      await utils.openGatewayPoolEditMode(page);
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('2. 验证 1 行时删除按钮禁用', async () => {
      await utils.expectGatewayPoolEditRowDeleteButtonState(
        page,
        0,
        'disabled',
      );
    });

    await test.step('3. 点击「+ 创建」增至 2 行', async () => {
      await utils.clickGatewayPoolCreateRow(page);
    });

    await test.step('4. 验证 2 行时两行删除按钮均可点击', async () => {
      await utils.expectGatewayPoolEditRowDeleteButtonState(page, 0, 'enabled');
      await utils.expectGatewayPoolEditRowDeleteButtonState(page, 1, 'enabled');
    });

    await test.step('5. 删除一行，回到 1 行', async () => {
      await utils.deleteGatewayPoolEditRow(page, 1);
    });

    await test.step('6. 验证回到 1 行后删除按钮再次禁用', async () => {
      await utils.expectGatewayPoolEditRowDeleteButtonState(
        page,
        0,
        'disabled',
      );
    });

    await test.step('7. 点击「取消」退出编辑模式', async () => {
      await utils.cancelGatewayPoolEdit(page);
      await utils.expectGatewayPoolListMode(page);
    });
  });
});

// ─────────────────────────────────────────────
// RM-GP-11 编辑时实例 ip+端口组合不可重复
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-11 编辑时 ip+端口组合不可重复', () => {
  const cleanup = utils.createResourceTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@validation 验证编辑时相同 ip+端口组合被拦截', async ({ page }) => {
    await test.step('前置：保存原始状态并设置测试数据', async () => {
      await cleanup.saveGatewayPoolOriginalState(page);
      await utils.gotoGatewayPoolManagementPage(page);
      await setupPoolInstances(page, [
        {
          hostname: 'node1',
          ip: '127.0.0.1',
          weight: 1,
          ports: { Default: 80 },
        },
      ]);
    });

    await test.step('1. 点击「编辑」进入内联编辑模式', async () => {
      await utils.openGatewayPoolEditMode(page);
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('2. 点击「+ 创建」新增第二行实例', async () => {
      await utils.clickGatewayPoolCreateRow(page);
    });

    await test.step('3. 填写第二行实例与第一行相同的 ip+端口（机器名不同）', async () => {
      await utils.fillGatewayPoolEditRow(page, 1, {
        hostname: 'node2',
        ip: '127.0.0.1',
        port: 80,
      });
    });

    await test.step('4. 点击「提交」', async () => {
      await utils.submitGatewayPoolEditForm(page);
      await utils.waitAfterResourceMutation(page, 1000);
    });

    await test.step('5. 验证提交被拦截（编辑模式仍保持）', async () => {
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('6. 点击「取消」退出编辑模式', async () => {
      await utils.cancelGatewayPoolEdit(page);
      await utils.expectGatewayPoolListMode(page);
    });
  });
});

// ─────────────────────────────────────────────
// RM-GP-14 编辑时实例机器名必填
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-14 编辑时实例机器名必填', () => {
  const cleanup = utils.createResourceTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@validation 验证编辑时机器名为空提交被拦截', async ({ page }) => {
    await test.step('前置：保存原始状态并设置测试数据', async () => {
      await cleanup.saveGatewayPoolOriginalState(page);
      await utils.gotoGatewayPoolManagementPage(page);
      await setupPoolInstances(page, [
        {
          hostname: 'node1',
          ip: '127.0.0.1',
          weight: 1,
          ports: { Default: 80 },
        },
      ]);
    });

    await test.step('1. 点击「编辑」进入内联编辑模式', async () => {
      await utils.openGatewayPoolEditMode(page);
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('2. 清空实例行的机器名字段', async () => {
      await utils.fillGatewayPoolEditRow(page, 0, {
        hostname: '',
        ip: '127.0.0.1',
        port: 80,
      });
    });

    await test.step('3. 点击「提交」', async () => {
      await utils.submitGatewayPoolEditForm(page);
      await utils.waitAfterResourceMutation(page, 1000);
    });

    await test.step('4. 验证提交被拦截（编辑模式仍保持）', async () => {
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('5. 点击「取消」退出编辑模式', async () => {
      await utils.cancelGatewayPoolEdit(page);
      await utils.expectGatewayPoolListMode(page);
    });
  });
});

// ─────────────────────────────────────────────
// RM-GP-15 编辑时实例 ip/域名格式校验
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-15 编辑时 ip/域名格式校验', () => {
  const cleanup = utils.createResourceTestCleanup();

  const invalidIps = [
    { value: '256.1.1.1', label: 'IPv4段超255' },
    { value: '1.2.3', label: 'IPv4仅3段' },
    { value: '###invalid', label: '非法字符' },
  ];

  for (const { value, label } of invalidIps) {
    test(`@validation 验证编辑时非法ip格式 [${label}]: ${value}`, async ({
      page,
    }) => {
      await test.step('前置：保存原始状态并设置测试数据', async () => {
        await cleanup.saveGatewayPoolOriginalState(page);
        await utils.gotoGatewayPoolManagementPage(page);
        await setupPoolInstances(page, [
          {
            hostname: 'node1',
            ip: '127.0.0.1',
            weight: 1,
            ports: { Default: 80 },
          },
        ]);
      });

      await test.step('1. 点击「编辑」进入内联编辑模式', async () => {
        await utils.openGatewayPoolEditMode(page);
        await utils.expectGatewayPoolEditMode(page);
      });

      await test.step(`2. 修改实例行 ip/域名为 "${value}"`, async () => {
        await utils.fillGatewayPoolEditRow(page, 0, {
          hostname: 'node1',
          ip: value,
          port: 80,
        });
      });

      await test.step('3. 点击「提交」', async () => {
        await utils.submitGatewayPoolEditForm(page);
        await utils.waitAfterResourceMutation(page, 1000);
      });

      await test.step('4. 验证提交被拦截（编辑模式仍保持）', async () => {
        await utils.expectGatewayPoolEditMode(page);
      });

      await test.step('5. 点击「取消」退出编辑模式', async () => {
        await utils.cancelGatewayPoolEdit(page);
        await utils.expectGatewayPoolListMode(page);
      });
    });
  }
});

// ─────────────────────────────────────────────
// RM-GP-16 网关实例池编辑回显与 OpenAPI 一致
// ─────────────────────────────────────────────
test.describe('AI网关实例池 - RM-GP-16 编辑回显与 OpenAPI 一致', () => {
  const cleanup = utils.createResourceTestCleanup();

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  test('@regression 验证编辑回显数据与 API 一致', async ({ page }) => {
    const testInstances = [
      { hostname: 'node1', ip: '127.0.0.1', weight: 1, ports: { Default: 80 } },
      {
        hostname: 'node2',
        ip: '10.0.0.1',
        weight: 2,
        ports: { Default: 8080 },
      },
    ];

    await test.step('前置：保存原始状态并设置测试数据', async () => {
      await cleanup.saveGatewayPoolOriginalState(page);
      await utils.gotoGatewayPoolManagementPage(page);
      await setupPoolInstances(page, testInstances);
      // 通过 API 更新数据后需刷新页面，使页面加载最新数据
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({
        timeout: 15000,
      });
    });

    await test.step('1. 通过 API 获取实例池详情', async () => {
      const apiData = await utils.getBfePool(page);
      expect(apiData).toBeDefined();
      expect(apiData.instances).toBeDefined();
      expect(apiData.instances.length).toBe(2);
    });

    await test.step('2. 点击「编辑」进入内联编辑模式', async () => {
      await utils.openGatewayPoolEditMode(page);
      await utils.expectGatewayPoolEditMode(page);
    });

    await test.step('3. 验证实例行与 API 数据一致', async () => {
      const apiData = await utils.getBfePool(page);
      const instances = apiData.instances || [];

      // 表格无 <tbody>，<tr> 是 <table> 的直接子元素，第一行是表头
      const dataRows = page.locator('table > tr:not(:first-child)');

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        const row = dataRows.nth(i);
        await row.waitFor({ state: 'visible', timeout: 10000 });

        // 验证机器名
        const hostnameInput = row.locator('td').nth(0).locator('input').first();
        await hostnameInput.waitFor({ state: 'visible', timeout: 5000 });
        await expect(hostnameInput).toHaveValue(inst.hostname);

        // 验证 ip/域名
        const ipInput = row.locator('td').nth(1).locator('input').first();
        await ipInput.waitFor({ state: 'visible', timeout: 5000 });
        await expect(ipInput).toHaveValue(inst.ip);

        // 验证端口（端口单元格有端口名和端口值两个 input，需定位 placeholder="端口值" 的输入框）
        const portInput = row
          .locator('td')
          .nth(2)
          .locator('input[placeholder="端口值"]');
        await portInput.waitFor({ state: 'visible', timeout: 5000 });
        const portKey = Object.keys(inst.ports || {})[0];
        await expect(portInput).toHaveValue(
          String(inst.ports?.[portKey] ?? ''),
        );
      }
    });

    await test.step('4. 点击「取消」退出编辑模式', async () => {
      await utils.cancelGatewayPoolEdit(page);
      await utils.expectGatewayPoolListMode(page);
    });
  });
});
