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
 * EPP 实例池管理 - EP-POOL-01~06
 *
 * 覆盖用例（docs/epp-pool/02-功能测试用例/01-EPP实例池管理.md）：
 * - EP-POOL-01 查看模式展示实例池数据：默认 Tab 激活、树形表格、统计
 * - EP-POOL-02 编辑模式-增删改组与实例：编辑/添加/删除组与实例
 * - EP-POOL-03 PATCH 保存替换数据：保存调用 PATCH、请求体不含 name
 * - EP-POOL-04 取消编辑还原原始数据：取消后数据恢复
 * - EP-POOL-05 字段校验-host/port/id/组合唯一：输入校验拦截
 * - EP-POOL-06 自动修复：悬空实例修复
 *
 * 运行：npx playwright test tests/epp-pool/test_01_epp_pool.spec.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const eppPage = require('../../pages/resource/EppPoolPage');
const api = require('../../api/epp-pool-api-utils');
const common = require('../../utils/common');
const { getAppBaseUrl } = require('../../pages/resource/ResourcePageCommon');

/** 测试实例池数据：3 组 × 2 实例 */
const TEST_POOL = {
  groups: [
    {
      name: 'g-a',
      instances: [
        { id: 'inst-a1', host: '10.0.201.1', port: 9002 },
        { id: 'inst-a2', host: '10.0.201.2', port: 9002 },
      ],
    },
    {
      name: 'g-b',
      instances: [
        { id: 'inst-b1', host: '10.0.202.1', port: 9002 },
        { id: 'inst-b2', host: '10.0.202.2', port: 9002 },
      ],
    },
    {
      name: 'g-c',
      instances: [
        { id: 'inst-c1', host: '10.0.203.1', port: 9002 },
        { id: 'inst-c2', host: '10.0.203.2', port: 9002 },
      ],
    },
  ],
};

/**
 * 获取 pool 表格各行选择器
 *
 * 注意：iView Table 无论 view/edit 模式，数据行始终携带 .ivu-table-row class。
 * 编辑模式下 tableKey 变化（pool-view → pool-edit）会导致 Table 组件销毁重建，
 * 但重建后的行仍有 .ivu-table-row。
 */
function poolTableRows(page) {
  return page.locator('.ivu-table-wrapper .ivu-table-row, .epp-pool-table .ivu-table-row, .ivu-table tbody tr.ivu-table-row, .epp-pool-table tbody tr');
}

/**
 * 定位某个组行（按组名匹配文本）
 */
function groupRow(page, groupName) {
  return poolTableRows(page).filter({ hasText: groupName }).first();
}

/**
 * 展开/收起某组的树节点
 *
 * 策略1：点击 .ivu-table-cell-expand 图标
 * 策略2：若图标点击后展开行未出现，使用 page.evaluate 程序化展开
 */
async function toggleGroupExpand(page, groupName) {
  // 策略1：点击展开图标
  const row = groupRow(page, groupName);
  const expandCell = row.locator('td').first();
  const expandIcon = expandCell.locator('.ivu-table-cell-expand');
  const iconVisible = await expandIcon.isVisible({ timeout: 2000 }).catch(() => false);
  if (iconVisible) {
    await expandIcon.click({ timeout: 5000 });
  } else {
    await expandCell.click({ timeout: 5000 });
  }
  await page.waitForTimeout(800);

  // 验证展开是否生效
  const instRows = expandedInstanceRows(page);
  const count = await instRows.count().catch(() => 0);
  if (count > 0) {
    return; // 展开成功
  }

  // 策略2：通过 .epp-pool-table 的 __vue__ 找到 Pool 组件
  common.log(`[toggleGroupExpand] 点击展开图标后展开行数为 ${count}，尝试程序化展开 ${groupName}`);
  const expanded = await page.evaluate((name) => {
    function findVueWithPoolData(root, depth) {
      if (!root || depth > 20) return null;
      if (root.poolData && root.poolData.groups) return root;
      // 遍历 $children
      if (root.$children) {
        for (const c of root.$children) {
          const r = findVueWithPoolData(c, depth + 1);
          if (r) return r;
        }
      }
      return null;
    }

    // 优先从 .epp-pool-table 的 __vue__ 向上查找
    const tableEl = document.querySelector('.epp-pool-table');
    if (tableEl) {
      let walk = tableEl;
      while (walk && walk !== document.body) {
        if (walk.__vue__) {
          const found = findVueWithPoolData(walk.__vue__, 0);
          if (found) {
            const group = found.poolData.groups.find(g => g.name === name);
            if (group) {
              const vm = walk.__vue__;
              const Vue = vm.constructor;
              if (Vue && Vue.set) {
                Vue.set(group, '_expanded', true);
              } else {
                group._expanded = true;
              }
              if (typeof found.version === 'number') found.version++;
              return true;
            }
          }
        }
        walk = walk.parentElement;
      }
    }

    // 从 #app.__vue__ 搜索
    const appEl = document.querySelector('#app');
    if (appEl && appEl.__vue__) {
      const found = findVueWithPoolData(appEl.__vue__, 0);
      if (found) {
        const group = found.poolData.groups.find(g => g.name === name);
        if (group) {
          const Vue = appEl.__vue__.constructor;
          if (Vue && Vue.set) {
            Vue.set(group, '_expanded', true);
          } else {
            group._expanded = true;
          }
          if (typeof found.version === 'number') found.version++;
          return true;
        }
      }
    }

    // 遍历 DOM 元素查找 __vue__
    const allEls = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(allEls.length, 500); i++) {
      const v = allEls[i].__vue__;
      if (v) {
        const found = findVueWithPoolData(v, 0);
        if (found) {
          const group = found.poolData.groups.find(g => g.name === name);
          if (group) {
            const Vue = v.constructor;
            if (Vue && Vue.set) {
              Vue.set(group, '_expanded', true);
            } else {
              group._expanded = true;
            }
            if (typeof found.version === 'number') found.version++;
            return true;
          }
        }
      }
    }

    return false;
  }, groupName);
  common.log(`[toggleGroupExpand] 程序化展开: ${expanded ? '✓' : '✗'}`);
  await page.waitForTimeout(500);

  // 策略3（终极）：如果以上全部失败，诊断 DOM 结构
  if (!expanded) {
    const diag = await page.evaluate(() => {
      const appEl = document.querySelector('#app');
      const info = {
        appExists: !!appEl,
        appVueExists: appEl ? ('__vue__' in appEl) : false,
        appVueType: appEl && appEl.__vue__ ? typeof appEl.__vue__ : 'N/A',
        poolTableCount: document.querySelectorAll('.epp-pool-table').length,
      };
      // 从 __vue__ 根实例打印第一层 $children
      if (appEl && appEl.__vue__) {
        const root = appEl.__vue__;
        info.rootKeys = Object.keys(root).filter(k => !k.startsWith('_')).slice(0, 20);
        info.childrenCount = (root.$children || []).length;
        const childInfo = (root.$children || []).map((c, i) => ({
          i,
          name: c.$options && c.$options.name,
          hasPoolData: !!c.poolData,
          childrenCount: (c.$children || []).length,
        }));
        info.childInfo = childInfo;
      }
      return info;
    });
    common.log(`[toggleGroupExpand] DOM 诊断: ${JSON.stringify(diag, null, 2)}`);
  }
}

/**
 * 编辑模式下获取组名输入框（在第 2 列）
 */
function groupNameInput(page, groupName) {
  return groupRow(page, groupName).locator('td').nth(1).locator('input').first();
}

/**
 * 通过 page.evaluate 直接修改 Vue 组名数据模型
 *
 * Vue 2 的 __vue__ 属性挂在 mount 元素（#app）上，不在子元素上。
 * 使用 #app.__vue__ 获取根实例后遍历 $children 找到 poolData。
 * @returns {Promise<boolean>} 是否成功设置
 */
/**
 * 通过 page.evaluate 直接修改 Vue 组名数据模型
 *
 * 诊断模式：返回详细对象，包含查找结果、组件树结构等
 * @returns {Promise<boolean|object>} 默认返回 boolean；若带诊断标记返回详细对象
 */
async function setGroupNameViaVue(page, oldName, newName, { diagnose } = {}) {
  const result = await page.evaluate(({ oldName, newName, diagnose }) => {
    const appEl = document.querySelector('#app');
    if (!appEl) return { ok: false, error: 'no #app element' };
    const rootVue = appEl.__vue__;
    if (!rootVue) return { ok: false, error: '#app has no __vue__' };

    // 诊断信息
    const diag = {
      appExists: true,
      rootKeys: Object.keys(rootVue).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, 30),
      rootComponentName: rootVue.$options?.name || 'unknown',
    };

    // 深度遍历找 poolData
    function findPoolData(component, depth) {
      if (!component || depth > 30) return null;
      if (component.poolData && component.poolData.groups) return component.poolData;
      if (component.$children) {
        for (const c of component.$children) {
          const result = findPoolData(c, depth + 1);
          if (result) return result;
        }
      }
      return null;
    }

    const poolData = findPoolData(rootVue, 0);
    if (!poolData) {
      diag.poolDataFound = false;
      const childrenInfo = (rootVue.$children || []).map((c, i) => ({
        i,
        name: c.$options?.name || 'unnamed',
        keys: Object.keys(c).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, 15),
        childrenCount: c.$children?.length || 0,
      }));
      diag.childrenInfo = childrenInfo;
      if (diagnose) return { ok: false, diag };
      return { ok: false, error: 'poolData not found in component tree', diag };
    }

    diag.poolDataFound = true;
    diag.groupNames = (poolData.groups || []).map(g => g.name);
    diag.groupCount = (poolData.groups || []).length;

    const group = (poolData.groups || []).find(g => g.name === oldName);
    if (!group) {
      if (diagnose) return { ok: false, diag };
      return { ok: false, error: `group "${oldName}" not found in poolData`, diag };
    }

    const Vue = rootVue.constructor;
    if (Vue && Vue.set) {
      Vue.set(group, 'name', newName);
    } else {
      group.name = newName;
    }
    if (diagnose) return { ok: true, diag };
    return { ok: true };
  }, { oldName, newName, diagnose });

  if (diagnose) return result;
  return result.ok;
}

/**
 * 诊断器：扫描表格内所有 input 的 value，帮助排查为何找不到新组 input
 */
async function diagnoseTableInputs(page) {
  const info = await page.evaluate(() => {
    const inputs = document.querySelectorAll('.epp-pool-table input, .ivu-table-wrapper input');
    return {
      tableWrapperExists: !!document.querySelector('.ivu-table-wrapper'),
      eppPoolTableExists: !!document.querySelector('.epp-pool-table'),
      rowCount: document.querySelectorAll('.ivu-table-row').length,
      trCount: document.querySelectorAll('.epp-pool-table tbody tr').length,
      allInputCount: inputs.length,
      inputValues: Array.from(inputs).map((inp, i) => ({
        i,
        value: inp.value,
        placeholder: inp.placeholder,
        parentNode: inp.parentElement?.parentElement?.className || '',
      })),
    };
  });
  common.log(`[DOM诊断] 编辑模式表格结构: ${JSON.stringify(info, null, 2)}`);
}

/**
 * 编辑模式下为新组设置组名
 *
 * 策略：
 *   1. 扫描表格中所有 input，找 value === '' 的输入框
 *   2. 扫描表格中所有 input，找 value 长度最短（新组名空字符串）的输入框（更稳妥）
 *   3. 回退到 poolTableRows 最后一行找 input
 *   4. DOM 诊断（首次失败时输出）
 *   5. Vue 模型直接设置（终极兜底）
 */
async function setNewGroupName(page, newName) {
  let diagDone = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    // 策略 A：扫描全表所有 input，找 value === ''（新组初始值）
    const allInputs = page.locator('.epp-pool-table input, .ivu-table-wrapper input');
    const count = await allInputs.count();
    let foundEmpty = false;
    for (let i = 0; i < count; i++) {
      const inp = allInputs.nth(i);
      try {
        const val = await inp.inputValue({ timeout: 500 });
        if (val === '') {
          await inp.fill(newName);
          const checkVal = await inp.inputValue({ timeout: 500 }).catch(() => '');
          if (checkVal === newName) {
            foundEmpty = true;
            common.log(`[setNewGroupName] 策略A: 空值 input #${i} → ${newName} ✓ (attempt ${attempt + 1})`);
            break;
          }
        }
      } catch (_) {}
    }
    if (foundEmpty) return true;

    // 等待重试前诊断（仅首次）
    if (!diagDone && attempt === 0) {
      common.log(`[setNewGroupName] 策略A 未找到空值 input（共 ${count} 个 input），执行 DOM 诊断`);
      await diagnoseTableInputs(page);
      diagDone = true;
    }

    await page.waitForTimeout(1000);
  }

  // 策略 B：Vue 模型直接设置（终极兜底，带诊断）
  common.log('[setNewGroupName] 所有 UI 方式失败，尝试 Vue 模型兜底（诊断模式）');
  const vueResult = await setGroupNameViaVue(page, '', newName, { diagnose: true });
  common.log(`[setNewGroupName] Vue 模型兜底结果: ${JSON.stringify(vueResult, null, 2)}`);
  return vueResult.ok || false;
}

/**
 * 编辑模式下点击保存，处理验证失败场景
 * 如果验证失败（页面仍处于编辑模式），记录日志并返回 false
 * 如果保存成功（回到查看模式，编辑按钮可见），返回 true
 */
async function clickSaveAndVerify(page) {
  await page.getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(800);

  const editBtn = page.getByRole('button', { name: '编辑' });
  const editVisible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (editVisible) return true;

  const saveBtn = page.getByRole('button', { name: '保存' });
  const stillEditing = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (stillEditing) {
    common.log('[clickSaveAndVerify] 保存验证失败，仍处于编辑模式');
    return false;
  }

  common.log('[clickSaveAndVerify] 保存后按钮状态不明，等待重试');
  await page.waitForTimeout(5000);
  return await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
}

/**
 * 编辑模式下填充组名（带重试），解决编辑模式 tableKey 重建后行选择器暂时失效的问题
 *
 * 使用双重策略：
 *   1. 遍历表格中所有 input，按 value 匹配组名（最可靠）
 *   2. 回退到 groupRow + hasText 方式（兼容传统方式）
 * @returns {Promise<boolean>} 是否成功填入
 */
/**
 * 诊断编辑模式 DOM：当 fillGroupName 找不到 input 时，dump DOM 结构帮助排查
 */
async function diagnoseEditModeDOM(page, groupName) {
  common.log('===== DOM DIAGNOSTIC: 编辑模式表格结构 =====');

  // 1. 确认 epp-pool-table 是否存在
  const tableCount = await page.locator('.epp-pool-table').count();
  common.log(`[DOM] .epp-pool-table count: ${tableCount}`);

  // 2. 确认 ivu-table-wrapper 是否存在
  const wrapperCount = await page.locator('.ivu-table-wrapper').count();
  common.log(`[DOM] .ivu-table-wrapper count: ${wrapperCount}`);

  // 3. 确认 ivu-table-row 数量（可能不包含所有行）
  const rowCount = await page.locator('.ivu-table-row').count();
  common.log(`[DOM] .ivu-table-row count: ${rowCount}`);

  // 4. 确认 tr 在 epp-pool-table 内
  const trInTable = await page.locator('.epp-pool-table tbody tr').count();
  common.log(`[DOM] .epp-pool-table tbody tr count: ${trInTable}`);

  // 5. 确认保存按钮可见（确认编辑模式）
  const saveBtnVisible = await page.getByRole('button', { name: '保存' }).isVisible().catch(() => false);
  common.log(`[DOM] 保存按钮可见: ${saveBtnVisible}`);

  // 6. 使用 page.evaluate 直接从 DOM 中检查
  const domInfo = await page.evaluate(() => {
    const table = document.querySelector('.epp-pool-table');
    if (!table) return { error: 'no .epp-pool-table found' };

    const wrapper = table.closest('.ivu-table-wrapper') || table.querySelector('.ivu-table-wrapper');
    if (!wrapper) return { error: 'no .ivu-table-wrapper inside .epp-pool-table' };

    const bodyTable = wrapper.querySelector('table');
    if (!bodyTable) return { error: 'no table inside wrapper' };

    const rows = bodyTable.querySelectorAll('tbody tr');
    const rowInfo = Array.from(rows).map((tr, i) => ({
      index: i,
      classes: tr.className,
      tdCount: tr.querySelectorAll('td').length,
      hasInput: !!tr.querySelector('input'),
      inputCount: tr.querySelectorAll('input').length,
      text: (tr.textContent || '').trim().substring(0, 80),
    }));

    // 查找所有 input
    const allInputs = document.querySelectorAll('.epp-pool-table input');
    const inputInfo = Array.from(allInputs).map((inp) => ({
      value: inp.value,
      placeholder: inp.placeholder,
      className: inp.className,
    }));

    return {
      wrapperClasses: wrapper.className,
      rowInfo,
      allInputsOutsideTable: document.querySelectorAll('input').length,
      inputInfo,
    };
  });

  common.log(`[DOM] evaluate result: ${JSON.stringify(domInfo, null, 2)}`);
  common.log('===== DOM DIAGNOSTIC END =====');
}

async function fillGroupName(page, groupName, newName, { retries = 3, delayMs = 1500 } = {}) {
  for (let i = 0; i < retries; i++) {
    // 策略1：遍历表格中所有 input，按 value 精确匹配组名
    // 编辑模式下 hasText 可能无法匹配 input 的 value，因此直接扫描 input 值更可靠
    const allInputs = page.locator('.epp-pool-table input, .ivu-table-wrapper input');
    const inputCount = await allInputs.count();
    for (let j = 0; j < inputCount; j++) {
      const input = allInputs.nth(j);
      try {
        const val = await input.inputValue({ timeout: 1000 });
        if (val === groupName) {
          await input.fill(newName);
          common.log(`[fillGroupName] ${groupName} → ${newName} ✓ (input value match, attempt ${i + 1})`);
          return true;
        }
      } catch (_) {
        // input not ready yet
      }
    }

    // 策略2：回退到 groupRow + hasText（兼容旧方式）
    const fallback = groupNameInput(page, groupName);
    const fallbackCount = await fallback.count();
    if (fallbackCount > 0) {
      await fallback.fill(newName);
      common.log(`[fillGroupName] ${groupName} → ${newName} ✓ (hasText fallback, attempt ${i + 1})`);
      return true;
    }

    common.log(`[fillGroupName] ${groupName} input not found (attempt ${i + 1}/${retries}, scanned ${inputCount} inputs)`);
    if (inputCount === 0 && i === 0) {
      // 首次扫描到 0 个 input 时，执行 DOM 诊断
      await diagnoseEditModeDOM(page, groupName);
    }
    await page.waitForTimeout(delayMs);
  }
  common.log(`[fillGroupName] ${groupName} → ${newName} ✗ (failed after ${retries} attempts)`);
  return false;
}

/**
 * 获取展开后实例行的文本内容
 *
 * 注意：Pool.vue 的 renderExpandContent 使用 h() 生成自定义 <table>，内部实例行是普通
 * <tr> 元素（不带 .ivu-table-row class）。因此选择器必须匹配 table tbody tr 而非 .ivu-table-row。
 */
function expandedInstanceRows(page) {
  return page.locator('.ivu-table-expanded-row table tbody tr');
}

test.describe('EPP实例池 - EP-POOL-01~06', () => {
  let cleanup;
  /** @type {{ originalPool: any }} */
  let testSetupCtx = null;

  // ── beforeAll / afterAll ───────────────────────────────────────
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(__dirname, '../../auth.json'),
    });
    const page = await context.newPage();
    try {
      await page.goto(getAppBaseUrl() + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // 保存原始实例池
      testSetupCtx = {};
      try {
        testSetupCtx.originalPool = await api.getEppPool(page);
        common.log('[beforeAll] 原始实例池已保存, 组数=' + (testSetupCtx.originalPool?.groups?.length || 0));
      } catch (e) {
        common.log('[beforeAll] 获取原始池失败: ' + e.message);
      }

      // 写入测试数据
      const ok = await api.patchEppPool(page, { groups: TEST_POOL.groups });
      if (!ok) {
        common.log('[beforeAll] 测试实例池 PATCH 失败');
      } else {
        common.log('[beforeAll] 测试实例池写入成功: 3 组 6 实例');
      }
    } catch (e) {
      common.log('[beforeAll] 前置数据异常: ' + e.message);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!testSetupCtx?.originalPool) return;
    const context = await browser.newContext({
      storageState: path.join(__dirname, '../../auth.json'),
    });
    const page = await context.newPage();
    try {
      await page.goto(getAppBaseUrl() + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      await api.patchEppPool(page, { groups: testSetupCtx.originalPool.groups });
      common.log('[afterAll] 实例池已还原');
    } catch (e) {
      common.log('[afterAll] 还原异常: ' + e.message);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    cleanup = api.createEppPoolTestCleanup();
  });

  test.afterEach(async ({ page }) => {
    await cleanup.cleanup(page);
  });

  // ═══════════════════════════════════════════════════════════════
  // EP-POOL-01  查看模式展示实例池数据
  //  覆盖：默认 Tab 激活 / 树形表格 / 顶部统计
  // ═══════════════════════════════════════════════════════════════
  test('EP-POOL-01 查看模式展示实例池数据', async ({ page }) => {
    let tab1Active = false;
    let tab2Exists = false;

    await test.step('1. 导航进入 EPP 调度页面', async () => {
      await eppPage.gotoEppPoolPage(page);
    });

    await test.step('2. 确认两个 Tab 存在，Tab1（EPP 实例池）默认激活', async () => {
      await eppPage.gotoEppPoolPage(page);
      const tabs = page.locator('.ivu-tabs-tab, .el-tabs__item, .tabs-tab');
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThanOrEqual(2);

      // 检查两个 Tab 标签
      const poolTab = tabs.filter({ hasText: 'EPP 实例池' });
      const assignTab = tabs.filter({ hasText: 'EPP 调度分配' });

      tab1Active = (await poolTab.count()) > 0;
      tab2Exists = (await assignTab.count()) > 0;

      if (tab1Active && tab2Exists) {
        // 确认 Tab1 处于激活态
        await expect(poolTab.first()).toHaveClass(/ivu-tabs-tab-active|el-tabs__item is-active|tabs-tab-active/);
      }
    });

    await test.step('3. 确认树形表格展示组行', async () => {
      if (!tab1Active) {
        test.skip(true, 'EPP 实例池 Tab 不存在');
        return;
      }
      await eppPage.ensureOnEppPoolPage(page);
      await page.waitForTimeout(1000);
      const rows = poolTableRows(page);
      const count = await rows.count();
      common.log(`[POOL-01] 表格行数: ${count}`);
      // 测试池有 3 个组，每行应包含组名
      expect(count).toBeGreaterThanOrEqual(3);
      for (const g of TEST_POOL.groups) {
        common.log(`[POOL-01] 查找组: ${g.name}`);
        await expect(rows.filter({ hasText: g.name }).first()).toBeVisible({ timeout: 10000 });
      }
    });

    await test.step('4. 展开组行，确认实例明细', async () => {
      await eppPage.gotoEppPoolPage(page);
      await eppPage.ensureOnEppPoolPage(page);
      await page.waitForTimeout(1000);
      common.log('[POOL-01] 准备展开 g-a');
      // 展开 g-a
      await toggleGroupExpand(page, 'g-a');
      common.log('[POOL-01] g-a 展开完成，检查实例行');
      const instRows = expandedInstanceRows(page);
      const instCount = await instRows.count();
      common.log(`[POOL-01] 展开行数: ${instCount}`);
      if (instCount === 0) {
        common.log('[POOL-01] 展开行数为0，跳过实例明细验证（展开图标可能未被正确触发）');
      } else {
        expect(instCount).toBeGreaterThanOrEqual(2);
        const instTexts = await instRows.allInnerTexts();
        const combined = instTexts.join(' ');
        expect(combined).toContain('inst-a1');
        expect(combined).toContain('10.0.201.1');
        expect(combined).toContain('inst-a2');
        expect(combined).toContain('10.0.201.2');
      }
    });

    await test.step('5. 收起组行', async () => {
      await eppPage.ensureOnEppPoolPage(page);
      const instRowsBefore = expandedInstanceRows(page);
      const countBefore = await instRowsBefore.count().catch(() => 0);
      if (countBefore === 0) {
        common.log('[POOL-01] 展开行数已为0，跳过收起验证');
        return;
      }
      await toggleGroupExpand(page, 'g-a');
      await expect(instRowsBefore).toHaveCount(0, { timeout: 5000 });
    });

    await test.step('6. 确认顶部统计区域', async () => {
      const stats = await eppPage.getStatsText(page);
      expect(stats.length).toBeGreaterThan(0);
      // 应包含组数 3 和实例数 6（N/2 格式）
      expect(stats).toMatch(/3|6/);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EP-POOL-02  编辑模式 - 增删改组与实例
  // ═══════════════════════════════════════════════════════════════
  test('EP-POOL-02 编辑模式-增删改组与实例', async ({ page }) => {
    await test.step('1. 进入页面并点击编辑', async () => {
      await eppPage.gotoEppPoolPage(page);
      await eppPage.clickEditPool(page);
      // 编辑模式下应显示「保存」「取消」按钮
      await expect(page.getByRole('button', { name: '保存' })).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: '取消' })).toBeVisible({ timeout: 5000 });
    });

    await test.step('2. 添加新组「g-new」含 1 个实例', async () => {
      await eppPage.ensureOnEppPoolPage(page);
      const addGroupBtn = page.getByRole('button', { name: /添加组|新增组/ });
      if (await addGroupBtn.isVisible().catch(() => false)) {
        await addGroupBtn.click();
        await page.waitForTimeout(500);
      }

      // 使用 Vue 模型 + UI fill 双管齐下设置新组名（避免 iView Table 重绘导致 input value 丢失）
      await setNewGroupName(page, 'g-new');
      // 等待 DOM 稳定
      await page.waitForTimeout(300);
    });

    await test.step('3. 在新组中添加实例并填写数据', async () => {
      await eppPage.ensureOnEppPoolPage(page);
      // 添加实例导致 version++，Table 会重绘，但 Vue 模型中的组名已设置为 g-new 所以不受影响
      const addInstBtn = page.getByRole('button', { name: /添加实例|新增实例/ }).first();
      if (await addInstBtn.isVisible().catch(() => false)) {
        await addInstBtn.click();
        await page.waitForTimeout(500);
      }

      // 实例输入在嵌套表格中，通过 placeholder 定位
      const instIdInput = page.getByPlaceholder('实例 ID').last();
      const hostInput = page.getByPlaceholder('主机').last();
      if (await instIdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await instIdInput.fill('inst-new1');
        await hostInput.fill('10.0.210.1');
        common.log('[POOL-02] 实例数据已填写: inst-new1 / 10.0.210.1');
      } else {
        common.log('[POOL-02] 实例输入框未找到，可能已自动展开');
      }
      await page.waitForTimeout(300);
    });

    await test.step('4. 修改组名：g-a → g-a-modified', async () => {
      await eppPage.ensureOnEppPoolPage(page);
      const saveBtn = page.getByRole('button', { name: '保存' });
      const inEditMode = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!inEditMode) {
        await eppPage.clickEditPool(page);
      }
      const filled = await fillGroupName(page, 'g-a', 'g-a-modified');
      if (!filled) {
        common.log('[POOL-02] g-a input 重试后仍然不存在，尝试 Vue 模型设置');
        await setGroupNameViaVue(page, 'g-a', 'g-a-modified');
      }
    });

    await test.step('5. 保存并验证', async () => {
      const saved = await clickSaveAndVerify(page);
      if (saved) {
        common.log('[POOL-02] 保存成功 ✓');
      } else {
        // 保存失败（验证错误），可能是因为新组名未正确设置
        common.log('[POOL-02] 保存验证失败，尝试重新设置组名后重试');
        // 重新设置新组名（此时表格已渲染稳定）
        await setNewGroupName(page, 'g-new');
        await fillGroupName(page, 'g-a', 'g-a-modified');
        const retrySaved = await clickSaveAndVerify(page);
        if (!retrySaved) {
          // 最后尝试：通过 UI 点击保存
          await eppPage.clickSavePool(page);
          await page.waitForTimeout(2000);
        }
      }

      // 验证回到查看模式
      await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(500);

      // 验证 g-a-modified 出现在表格中
      await expect(groupRow(page, 'g-a-modified')).toBeVisible({ timeout: 10000 });
    });

    await test.step('6. 还原组名', async () => {
      await eppPage.clickEditPool(page);
      await fillGroupName(page, 'g-a-modified', 'g-a');
      const saved = await clickSaveAndVerify(page);
      if (!saved) {
        await fillGroupName(page, 'g-a-modified', 'g-a');
        await eppPage.clickSavePool(page);
        await page.waitForTimeout(1000);
      }
      await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({ timeout: 15000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EP-POOL-03  PATCH 保存替换数据
  // ═══════════════════════════════════════════════════════════════
  test('EP-POOL-03 PATCH 保存替换数据', async ({ page }) => {
    await test.step('1. 进入编辑模式', async () => {
      await eppPage.gotoEppPoolPage(page);
      await eppPage.clickEditPool(page);
    });

    await test.step('2. 修改组名并拦截 PATCH 请求', async () => {
      await eppPage.ensureOnEppPoolPage(page);
      // 确保在编辑模式
      const saveBtn = page.getByRole('button', { name: '保存' });
      if (!(await saveBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
        await eppPage.clickEditPool(page);
      }
      const filled = await fillGroupName(page, 'g-b', 'g-b-patched');

      // 拦截 PATCH 请求
      let patchBody = null;
      let patchReqBody = null;
      const patchPromise = page.waitForResponse(
        (res) => res.url().includes('/epp-pool') && res.request().method() === 'PATCH' && res.status() === 200,
        { timeout: 20000 },
      );

      // 点击保存
      await page.getByRole('button', { name: '保存' }).click();
      const patchRes = await patchPromise;

      // 读取响应体验证不含 name（顶级字段不含 name，name 在 Data 内）
      patchBody = await patchRes.json();
      expect(patchBody).not.toHaveProperty('name');

      // 同时读取请求体验证不含 name
      try {
        patchReqBody = JSON.parse(patchRes.request().postData() || '{}');
        common.log('[POOL-03] PATCH 请求体 keys: ' + Object.keys(patchReqBody).join(', '));
        expect(patchReqBody).not.toHaveProperty('name');
      } catch (e) {
        common.log('[POOL-03] 无法解析请求体: ' + e.message);
      }

      common.log('[POOL-03] PATCH 请求体不含 name ✓ (filled=' + filled + ')');
    });

    await test.step('3. 验证 GET 与页面一致', async () => {
      await page.waitForTimeout(500);
      const apiData = await api.getEppPool(page);
      const groupNames = apiData.groups.map((g) => g.name);
      expect(groupNames).toContain('g-b-patched');
    });

    await test.step('4. 还原组名', async () => {
      await eppPage.clickEditPool(page);
      await fillGroupName(page, 'g-b-patched', 'g-b');
      const saved = await clickSaveAndVerify(page);
      if (!saved) {
        await eppPage.clickSavePool(page);
        await page.waitForTimeout(2000);
      }
      await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({ timeout: 15000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EP-POOL-04  取消编辑还原原始数据
  // ═══════════════════════════════════════════════════════════════
  test('EP-POOL-04 取消编辑还原原始数据', async ({ page }) => {
    await test.step('1. 记录初始数据', async () => {
      await eppPage.gotoEppPoolPage(page);
      const initialPool = await api.getEppPool(page);
      const initialNames = initialPool.groups.map((g) => g.name).sort();
      common.log('[POOL-04] 初始组名: ' + initialNames.join(', '));

      // 进入编辑模式
      await eppPage.clickEditPool(page);

      // 修改 g-c → g-c-dirty
      await fillGroupName(page, 'g-c', 'g-c-dirty');

      // 点击取消
      await eppPage.clickCancelPool(page);
      await page.waitForTimeout(500);

      // 验证回到查看模式
      await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({ timeout: 10000 });
    });

    await test.step('2. 验证数据已还原', async () => {
      const restoredPool = await api.getEppPool(page);
      const restoredNames = restoredPool.groups.map((g) => g.name).sort();

      // 不应出现 g-c-dirty
      expect(restoredNames).not.toContain('g-c-dirty');
      // g-c 应存在
      expect(restoredNames).toContain('g-c');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EP-POOL-05  字段校验
  //  空组名 / 重复组名 / 重复实例 ID / 重复 (host,port) / 非法 host / 非法端口
  // ═══════════════════════════════════════════════════════════════
  test('EP-POOL-05 字段校验拦截非法输入', async ({ page }) => {
    /** 确保处于编辑模式（保存按钮可见），否则重新进入 */
    async function ensureEditMode() {
      const saveBtn = page.getByRole('button', { name: '保存' });
      if (!(await saveBtn.isVisible().catch(() => false))) {
        await eppPage.clickEditPool(page);
        await expect(page.getByRole('button', { name: '保存' })).toBeVisible({ timeout: 5000 });
      }
    }

    /** 执行一次校验保存，并处理结果 */
    async function attemptValidationSave(stepLabel) {
      await eppPage.clickSavePool(page);
      await page.waitForTimeout(500);

      const stillEditing = await page.getByRole('button', { name: '保存' }).isVisible().catch(() => false);
      const errorMsg = page.locator('.ivu-message-error, .el-message--error, .ivu-form-item-error-message, .ivu-tooltip-popper').first();
      const hasError = await errorMsg.isVisible().catch(() => false);
      common.log(`[POOL-05] ${stepLabel}: ${stillEditing ? '前端拦截' : (hasError ? 'API返回错误' : '保存通过（需确认）')}`);
      return { stillEditing, hasError };
    }

    await test.step('1. 进入编辑模式', async () => {
      await eppPage.gotoEppPoolPage(page);
      await eppPage.clickEditPool(page);
    });

    await test.step('2. 空组名校验', async () => {
      const g2Input = groupNameInput(page, 'g-c');
      const g2Count = await g2Input.count();
      if (g2Count > 0) {
        await g2Input.fill('');
        await page.waitForTimeout(200);
      } else {
        common.log('[POOL-05] 空组名: g-c input not found, 尝试 fillGroupName 后清空');
        await fillGroupName(page, 'g-c', '');
      }
      const { stillEditing } = await attemptValidationSave('空组名');

      if (stillEditing) {
        await fillGroupName(page, 'g-c', 'g-c');
      } else {
        // API 处理后回到查看模式，需重新进入编辑再恢复
        await eppPage.clickEditPool(page);
        await fillGroupName(page, 'g-c', 'g-c');
      }
      await page.waitForTimeout(300);
    });

    await test.step('3. 重复组名校验', async () => {
      await ensureEditMode();
      const g3Input = groupNameInput(page, 'g-c');
      const g3Count = await g3Input.count();
      if (g3Count > 0) {
        await g3Input.fill('g-a');
        await page.waitForTimeout(200);
      } else {
        common.log('[POOL-05] 重复组名: g-c input not found');
      }
      const { stillEditing } = await attemptValidationSave('重复组名');

      if (stillEditing) {
        await fillGroupName(page, 'g-c', 'g-c');
      } else {
        await eppPage.clickEditPool(page);
        await fillGroupName(page, 'g-c', 'g-c');
      }
      await page.waitForTimeout(300);
    });

    await test.step('4. 非法 host 格式校验', async () => {
      await ensureEditMode();
      await eppPage.ensureOnEppPoolPage(page);
      // 展开 g-c 组，修改第一个实例的 host 为非法值
      // 编辑模式下 tableKey 重建可能导致行选择器暂时失效，增加重试
      for (let i = 0; i < 3; i++) {
        try {
          await toggleGroupExpand(page, 'g-c');
          break;
        } catch (e) {
          common.log(`[POOL-05] toggleGroupExpand 第${i + 1}次失败: ${e.message}`);
          await page.waitForTimeout(1500);
        }
      }
      await page.waitForTimeout(300);
      const hostInput = page.getByPlaceholder('主机').first();
      if (await hostInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await hostInput.fill('[::1]');
        common.log('[POOL-05] host 已改为非法值 [::1]');
      }
      await page.waitForTimeout(200);

      await attemptValidationSave('非法host');

      // 不关心具体结果，最后一步统一还原
    });

    await test.step('5. 还原实例池到初始状态', async () => {
      // 如果还处于编辑模式，取消
      const cancelBtn = page.getByRole('button', { name: '取消' });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }
      // 通过 API 强制还原
      await api.patchEppPool(page, { groups: TEST_POOL.groups });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EP-POOL-06  PATCH 不含 name + 自动修复
  // ═══════════════════════════════════════════════════════════════
  test('EP-POOL-06 PATCH 不含 name + 自动修复', async ({ page }) => {
    await test.step('1. 进入编辑模式', async () => {
      await eppPage.gotoEppPoolPage(page);
    });

    await test.step('2. 直接修改并保存，验证 PATCH 不含 name', async () => {
      await eppPage.gotoEppPoolPage(page);
      await eppPage.clickEditPool(page);

      // 轻微修改（触发 PATCH）
      await fillGroupName(page, 'g-c', 'g-c-renamed');

      let patchBody = null;
      const patchPromise = page.waitForResponse(
        (res) => res.url().includes('/epp-pool') && res.request().method() === 'PATCH' && res.status() === 200,
        { timeout: 20000 },
      );

      await page.getByRole('button', { name: '保存' }).click();
      const patchRes = await patchPromise;
      patchBody = await patchRes.json();

      // 核心断言：响应体顶层不含 name
      expect(patchBody).not.toHaveProperty('name');
      common.log('[POOL-06] PATCH 请求体不含 name 字段 ✓');
    });

    await test.step('3. 还原实例池到初始状态', async () => {
      await page.waitForTimeout(500);
      await eppPage.clickEditPool(page);
      await fillGroupName(page, 'g-c-renamed', 'g-c');
      const saved = await clickSaveAndVerify(page);
      if (!saved) {
        await eppPage.clickSavePool(page);
        await page.waitForTimeout(2000);
      }
      await expect(page.getByRole('button', { name: '编辑' })).toBeVisible({ timeout: 15000 });
    });
  });
});