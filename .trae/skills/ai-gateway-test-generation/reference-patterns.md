# AI Gateway 测试实现专章（按需阅读）

> 主入口：[SKILL.md](SKILL.md)。本文仅在 SKILL 触发器命中时阅读，不要替代主 Skill。

---

## 选择器策略（仅封装内部）

优先级：`getByRole` → `getByPlaceholder`（仅组件内）→ iView/Element 稳定类名（仅组件内）→ `filter` 组合。

**表格行（强制）：** 搜索区也有 tbody，必须限定数据区。

```javascript
// ✅
const dataTable = page.locator('.show-iView-Table .ivu-table')
const dataRows = dataTable.locator('tbody tr')
// ❌ page.locator('table tbody tr')  // 含搜索表单行
```

**空状态：** 可能是一行「暂无数据」，不要只断言行数为 0。

**禁用色：** 支持 `#999999` / `#BFBFBF` / 对应 `rgb(...)`，勿写死单值。

**长度：** 优先断言 `maxlength`，勿假设必有错误提示。

**其它：**

- iView Tabs 无 `role="tab"` → 用 `IvuTabsComponent` / `expect*Tabs`
- Element 分页改 pageSize → `table.changePageSize()`
- 面包屑与侧栏同名 → 面包屑封装（如 `.bfe-breadcrumb` 限定）
- 无「取消」的抽屉 → `close*Drawer`（X）

**禁止：** 内部 `name` 属性、按钮索引、超长 XPath、spec 里裸 `getByText` 验抽屉/弹窗标题。

---

## 登录复用与智能导航

- `playwright.config.js`：`globalSetup` + `storageState: auth.json`
- 普通用例不要重复登录；登录专项：`test.use({ storageState: { cookies: [], origins: [] } })`
- 业务入口统一 `goto*`（`ensureOn*`：已在目标页则跳过；同模块切 Tab 不 reload；跨模块不再盲目 `goto(ctlHost)`）

---

## 表单提交等待

创建/删除后前端常自动 GET 刷新列表。**必须**与操作并行等待：

```javascript
const [response] = await Promise.all([
  page.waitForResponse(
    (r) => r.url().includes('/entity-types') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 15000 }
  ),
  entityTypePage.submitCreateEntityTypeForm(page),
])
```

超时可降级：`waitForLoadState('networkidle')` + 固定等待（创建约 5s、删除约 3s）。禁止提交后只等 1s 或不等待直接找行。优先 `waitForResponse`，仅在无法确定 API 时用 `waitForTimeout`。

| 操作 | 兜底最小等待 |
| ------ | ---------------- |
| 创建后刷新 | 5000ms |
| 删除后刷新 | 3000ms |
| 翻页 / Tab | 1000ms |
| 抽屉开关 | 500ms |

---

## 分页查找

新增数据可能不在当前页，必须全页查找：

```javascript
await userPage.expectTokenVisibleInAllPages(page, tokenName, 30000)
await userPage.expectTokenNotVisible(page, tokenName, 30000)
```

```javascript
await page.waitForXxxListResponse(page, () => table.search(keyword))
await page.expectXxxVisibleInAllPages(page, rowKey)
// 或 ensureXxxRowVisible(page, rowKey)
```

- `rowByText` 优先 `.show-iView-Table` 数据行
- 打开详情：点**数据列**，不要点含搜索框的行
- 筛选项：用 `.ivu-form-item` / 搜索区 `.ivu-select` 序号；禁止依赖选中后消失的 placeholder（如 `hasText: '状态'`）

禁止：仅 `expectXxxVisible`（当前页）或不完整手动翻页。

---

## 数据清理与 API 造数

统一四层数据隔离策略（新用例必须全部满足）：

1. **动态唯一命名**：所有测试数据名带时间戳前缀，可被批量脚本识别（见下方命名约定）
2. **创建后立即 track**：从第一条起 `createXxxTestCleanup()` + `test.afterEach`；生成 id/名后立即 `track`
3. **命名约定 + 批量兜底脚本**：`npm run cleanup:<module>[:execute]` 清理被中断用例留下的残留
4. **基线数据与执行顺序隔离**：单例/共享资源（网关池、Global 路由规则、模型定价表）保存原始状态并在 afterEach 恢复；模型定价用 replace 导入基线 YAML 整表重置

禁止只在末尾 `test.step('清理')`（用例中途失败会漏清理）。

```javascript
const row = await apiUtils.createXxxViaApiAndAssert(page, payload)
cleanup.trackXxxId(row.id)
```

**命名约定（批量脚本识别前缀）**

| 模块 | 数据 | 命名模式 | 兜底脚本 |
| ------ | ------ | ---------- | ---------- |
| entity | 类型/实体 | `type_<ts>` / `ent_<ts>` | `cleanup:testdata` |
| entity | API-Key | 固定中文描述前缀（如「测试用API-Key」） | `cleanup:testdata` |
| user | 用户 | `user_<ts>` | `cleanup:user` |
| user | Token | `token_<ts>`（无删除 API，仅统计，靠 afterEach UI 删除） | `cleanup:user` |
| resource | 业务集群 | `cluster<ts>` | `cleanup:resource` |
| route | Global 路由规则 | 无删除，恢复基线（`enabled:false` + global-default-rule） | `cleanup:route` |
| model-prices | 定价表 | 无删除，replace 导入基线 YAML 重置 | `cleanup:modelprice` |

**特殊场景**

- Token 无删除接口（后端仅 token_create/list/one）：只能 afterEach 走 UI 幂等删除，兜底脚本仅统计提示
- 业务实例池 API 已废弃（后端 product_pool endpoints 未注册）：afterEach 的 delete 会 404，删除动作幂等无害
- 网关实例池为单例：`saveGatewayPoolOriginalState` + afterEach 恢复 instances；禁止并行造数（serial 模式）

函数名以对应 `pages/*Page.js` 与 `api/*-api-utils.js` 为准。

---

## 工具函数导出

spec 使用的函数必须出现在 `module.exports`，否则 `utils.xxx is not a function`。新增后立刻导出，核对拼写与签名。

---

## 组件关闭方式

| 组件 | 方式 | 示例 |
|------|------|------|
| 多数业务抽屉 | X | `closeAddUserDrawer` / `closeTokenDetail` |
| 删除/注销确认 | 取消按钮 | `cancelDeleteUser` / `cancelLogout` |

禁止对无「取消」的抽屉调用 `clickFooterButton(..., '取消')`。

---

## 功能可用性

调用前确认按钮/搜索框等存在；文档未描述的能力不要假设（如 Token 页可能无搜索框）。

---

## 服务异常与状态持久化

- `global-setup`：连不上且无可用 `auth.json` → `process.exit(1)`
- 用文件旗标（如 `service-down.flag`）持久化，**不要用内存变量**（重试会丢）
- `isServiceDown()` / `setServiceDown(true)`；`goto*` 开头检测并 `test.skip` 或抛错
- 仅对 `ERR_CONNECTION_*` / `net::ERR_*` 当服务故障；其它错误正常失败

---

## 语言（中文断言）

默认可能是英文。`global-setup` 与 `gotoLoginPage` 须在 `page.goto` **之前**：

```javascript
await page.addInitScript(() => {
  localStorage.setItem('lang', 'zh')
})
```

清除 `storageState` 的登录用例会丢掉 localStorage，必须在进登录页前重设。选择器文案须与当前语言一致。

---

## 选择器唯一性

`getByText` 可能命中多项 → `.first()` / 父级限定 / 更具体 locator。禁止未消歧导致 strict mode violation。

---

## 用例状态隔离

- 注销类会清登录态；后续依赖 `goto*` 内 `ensureLoggedIn`
- 建议顺序：登录专项 → 业务 → 注销放最后
- 禁止依赖「上一例没注销」这类顺序假设

---

## 文档标注（实现偏差）

文档写「根据实际系统验证」表示不确定。发现缺陷时在 **02** 标注，**保留**用例预期，禁止把断言改成迁就缺陷。

```markdown
- ⚠️ **当前系统缺陷**：……，待修复
```

---

## 测试报告

`global-teardown` 自动生成 Markdown：`report/test-report.md`（及时间戳归档）。

```bash
npm test          # 或 test:entity / test:user
npm run report    # 仅重生成报告
```

另有 Playwright JSON / HTML 报告。配置见 `playwright.config.js`。

---

## 扩展封装模板

**iView 组件**

1. `components/iview/IvuXxx.js` — 直接使用 JS
2. 常用 API：`IvuDrawerComponent`、`IvuFormComponent`、`IvuSelectComponent`

**Layout / PageTable**

1. `components/layout/*.js` — 直接使用 JS
2. `components/common/PageTable.js` — 表格封装

**Element UI**

1. `components/element/ElSelect.js` — `el-select` + teleported 下拉

常用 API：`ElSelectComponent.fromFormItem(page, scope, label)`、`selectOption` / `selectOptionExact` / `selectOptionFilterable`（可搜索远程下拉）、`expectSelectedContains`。

Entity / API-Key 表单中以下字段已固定为 `el-select`（pages 用 `selectElDrawerField`，勿再写 iView 分支）：类型、父Entity、允许模型、禁止模型、挂载Entity、限流规则「适用模型」。配额/启用限流等仍为 iView `Select`。

**业务封装**

1. `pages/*Page.js` — 业务方法并 **加入 `module.exports`**
2. spec 只调 `pages.*` 或 `utils.*`

尚未单独封装的 iView 组件（遇到再补）：`IvuCheckbox`、`IvuAlert`、`IvuCollapse`、`IvuSteps` 等（见 `components/iview/`）。

---

## 完整检查清单（生成后逐项）

### 基础

- [ ] 读过模块 01/02 与 `pages/*Page.js`；有 design/复盘则已对照
- [ ] **阶段 1**：本轮新增 spec ≤5 且均为 P0；未在用户确认冒烟前写 P1/读回/journey
- [ ] `DOC_*` 来自 design/02，非 i18n
- [ ] 优先复用已有 pages/utils；无则先完成封装
- [ ] spec 无裸 `.ivu-*` / `.el-*` / 全局 `table` / 抽屉标题 `getByText`
- [ ] 复用 `auth.json`；导航用 `goto*`；Tab 用封装而非 `getByRole('tab')`
- [ ] 表格/搜索/分页走 `pageTable`；抽屉/弹窗走 pages
- [ ] 动态测试数据 + `test.step`；命名对应 UM/EM
- [ ] 已产出或确认会自动生成 `report/test-report.md`

### 验收与设计

- [ ] 断言与 design/02 一致；不符则记偏差而非改断言
- [ ] 源码仅用于封装参考；临时 skip/fixme 已链到偏差说明
- [ ] 3～5 条 P0 标杆跑通后再批量

### pageTable / 清理

- [ ] 列表前置 API 造数 + `waitFor*ListResponse`
- [ ] 找行：`*InAllPages` / `ensure*RowVisible`
- [ ] 行操作：`dataRows()`；`afterEach` cleanup

### 调研对齐

- [ ] 按钮/提示/列名与 02（及 design）一致
- [ ] 确认搜索区与数据区分离、inline vs toast、抽屉标题精确匹配

### 选择器 / 等待 / 导出

- [ ] 数据区定位；空态「暂无数据」；颜色多格式；优先 maxlength
- [ ] 提交用 `Promise.all` + `waitForResponse`，有超时降级
- [ ] 新函数已导出；抽屉关闭方式正确；调用前确认控件存在

### 服务 / 语言 / 隔离

- [ ] 服务不可用快速失败；区分网络错误与普通失败
- [ ] `lang=zh` 在 goto 前；登录清状态后重设语言
- [ ] `getByText` 已消歧；用例不依赖脆弱执行顺序
