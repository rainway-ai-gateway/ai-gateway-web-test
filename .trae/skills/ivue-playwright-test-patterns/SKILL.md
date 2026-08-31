---
name: ivue-playwright-test-patterns
description: iView + Playwright 测试编写经验与陷阱。当编写或调试涉及 iView UI 组件库的 Playwright 自动化测试时调用此 skill，避免常见的 DOM 选择器、表单校验、API payload 等陷阱。
---

# iView + Playwright 测试编写经验

## 1. DOM 选择器陷阱

### 1.1 iView Table 多 `<table>` 结构

iView 的 `ivu-table` 组件内部包含**多个 `<table>` 元素**：

- 表头 `<table>` (thead)
- 数据 `<table>` (tbody)
- 可能还有固定列的额外 `<table>`

**错误做法：**

```javascript
// ❌ 会匹配到多个 table，导致选择器混乱
page.locator('table tbody tr')
```

**正确做法：**

```javascript
// ✅ 使用 iView 特有的 class 选择器
page.locator('.ivu-table-row')

// ✅ 或使用 PageTable 组件封装的方法
utils.businessClusterTable(page).dataRows()

// ✅ 验证特定内容可见性
page.getByText('集群名称', { exact: true })
```

### 1.2 `$Message` 渲染位置

iView 的 `$Message` 全局提示渲染在 **`document.body` 级别**，不在触发它的组件 DOM 内。

**错误做法：**

```javascript
// ❌ 在 drawer 内查找 $Message
const drawer = page.locator('.ivu-drawer');
await expect(drawer.getByText('提示信息')).toBeVisible();
```

**正确做法：**

```javascript
// ✅ 在页面级别查找 $Message
await expect(page.locator('.ivu-message-notice-text')).toBeVisible();

// ✅ 或直接验证行为结果（如步骤未前进）
await utils.expectWizardStep(page, '当前步骤名');
```

### 1.3 Drawer 选择器

```javascript
// ✅ 获取当前激活的 drawer
const drawer = page.locator('.ivu-drawer').last();

// ✅ drawer 标题
drawer.locator('.ivu-drawer-header-inner');

// ✅ drawer 内容区
drawer.locator('.ivu-drawer-body');
```

## 2. 表单校验陷阱

### 2.1 字段默认值

iView 表单字段通常有**默认值**，不能通过"不填写"来触发"未选择"校验。

**案例：protocol 字段默认 'http'**

```javascript
// ❌ 不填 protocol 不会触发"请选择协议"校验
// 因为 formData.protocol 默认为 'http'

// ✅ 需要显式清空或切换来触发校验
await utils.fillInput('协议', '');
```

### 2.2 联动重置行为

某些字段变化会**自动重置**关联字段。

**案例：hash_strategy 变化会重置 hash_header**

```javascript
// ❌ 先选 hash_strategy，再填 hash_header，再改其他字段
// hash_header 可能被 selectHashStrategy() 自动重置为默认值

// ✅ 最后填写会被重置的字段
await utils.fillInput('哈希头部', ''); // 最后清空，触发校验
```

### 2.3 正则校验 BUG

前端正则可能只校验非空，不校验格式。

**案例：`BaseClustersNameRegCheck = /^.+$/`**

```javascript
// ⚠️ 这个正则只检查非空，'a' 也能通过
// 如果发现校验不生效，检查 UI/src/utils/const.js 中的正则定义
// 标记为 BUG 并使用 test.skip
```

## 3. API Payload 结构

### 3.1 必须匹配 UI `handelData()` 输出

API 的 payload 结构必须与 Vue 组件 `handelData()` 方法输出**完全一致**。

**查找方法：**

```bash
# 在 UI 源码中搜索 handelData 方法
grep -r "handelData" UI/src/modules/Clusters/components/
```

**常见错误：**

```javascript
// ❌ retries 和 timeouts 放在顶层
{
  name: 'test',
  retries: { max_retry_in_subcluster: 2 },
  timeouts: { timeout_conn_serv: 2000 }
}

// ✅ retries 和 timeouts 在 basic 内部
{
  name: 'test',
  basic: {
    retries: { max_retry_in_subcluster: 2 },
    timeouts: { timeout_conn_serv: 2000 }
  }
}
```

### 3.2 必填字段清单

通过 API 创建集群时，以下字段必填：

- `name`: 集群名称
- `basic.protocol`: 协议
- `basic.retries`: 重试配置
- `basic.timeouts`: 超时配置
- `sub_clusters`: 子集群列表（字符串数组）
- `scheduler`: 调度配置（从 BFE 集群动态获取）
- `passive_health_check.schema`: 健康检查协议

### 3.3 动态构建 scheduler

```javascript
async function buildClusterPayload(page, name) {
  const bfeClusters = await apiUtils.getBfeClusterList(page);
  const subClusters = await apiUtils.getSubClusterList(page);

  let scheduler = {};
  if (bfeClusters.length > 0 && subClusters.length > 0) {
    const bfeName = bfeClusters[0].name;
    scheduler[bfeName] = { GSLB_BLACKHOLE: 0 };
    scheduler[bfeName][subClusters[0].name] = 100;
  }

  return {
    name,
    basic: { /* ... */ },
    sub_clusters: [subClusters[0].name],
    scheduler,
    // ...
  };
}
```

## 4. 测试环境陷阱

### 4.1 service-down.flag 清理

测试失败时会创建 `service-down.flag` 文件，导致后续测试全部跳过。

```bash
# ✅ 每次运行前清理
rm -f code/service-down.flag
```

### 4.2 API 创建后需要刷新页面

通过 API 创建数据后，UI 不会自动刷新。

```javascript
// ❌ API 创建后直接查找
await utils.createCluster(page, data);
await utils.ensureBusinessClusterRowVisible(page, name); // 找不到

// ✅ API 创建后刷新页面
await utils.createCluster(page, data);
await page.reload();
await page.waitForLoadState('networkidle');
await utils.ensureBusinessClusterRowVisible(page, name);
```

### 4.3 表格数据加载时机

iView 表格可能先渲染空状态，再异步加载数据。

```javascript
// ❌ 立即读取表格数据
const rows = page.locator('.ivu-table-row');
const count = await rows.count(); // 可能是 0

// ✅ 等待数据出现
await expect(page.getByText('集群名称', { exact: true })).toBeVisible({ timeout: 15000 });
```

## 5. 调试技巧

### 5.1 查看错误上下文

测试失败后生成的 error-context.md 包含页面快照：

```bash
cat test-results/*/error-context.md
```

### 5.2 单测运行

```bash
# 只运行特定测试
npx playwright test -g "RM-BC-37"

# 运行整个文件
npx playwright test test_04_business_cluster_create.spec.js
```

### 5.3 查看 Vue 组件源码

当测试行为不符合预期时，直接查看 Vue 组件源码：

```bash
# 查找校验逻辑
grep -r "BaseClustersNameRegCheck" UI/src/

# 查找表单提交逻辑
grep -r "handelData\|handleSubmit" UI/src/modules/Clusters/
```

## 6. 常见错误信息对照

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Retries is a required field` | payload 结构错误 | retries 放在 basic 内部 |
| `Scheduler Want Be Set` | 缺少 scheduler 字段 | 动态获取 BFE 集群构建 scheduler |
| `SubClusters Want Be Set` | 缺少 sub_clusters 字段 | 添加 sub_clusters 数组 |
| `请至少挂载一个子集群` 找不到 | $Message 在 body 级别 | 改为验证步骤未前进 |
| `strict mode violation` | 选择器匹配多个元素 | 使用更精确的选择器 |
| 表格行数为 0 | 表格未加载完成 | 等待特定内容可见 |
