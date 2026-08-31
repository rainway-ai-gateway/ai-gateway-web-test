---
name: ai-gateway-test-generation
description: >-
  AI Gateway 唯一测试规范 Skill：覆盖「测什么」（范围/优先级/验收）与「怎么写」（pages/utils 封装、生成门禁、pageTable）。
  Use when generating or modifying Playwright cases, writing test plans, checking UM/EM coverage,
  or reviewing acceptance against module docs. 验收以设计原型→02 为准，源码仅用于封装参考。
  读 docs/*/01、02；模块踩坑见 docs/<模块>/测试问题复盘.md；design 有则对照。实现专章见同目录 reference-patterns.md。
---

# AI Gateway 测试用例生成 Skill

本仓库**唯一**测试入口。细节实现按下方触发器再读 [reference-patterns.md](reference-patterns.md)。

**两大核心原则：**

1. **验收来源**：验证设计是否实现，不验证「实现是否自洽」
2. **组件封装**：spec 只调 pages/utils，禁止裸 selector

---

## 项目目录结构

```
├── api/                          # API 调用层（造数/清理）
│   ├── entity-api-utils.js
│   └── resource-api-utils.js
├── components/                   # UI 组件封装（JS，直接使用）
│   ├── common/PageTable.js
│   ├── element/ElSelect.js
│   ├── iview/ (13个组件)
│   └── layout/ (4个组件)
├── pages/                        # 模块实现（业务页面操作，按模块拆目录）
│   ├── user/                     # 用户管理（UserPage.js）
│   ├── entity/                   # Entity 管理（EntityPage.js 聚合入口）
│   ├── resource/                 # 资源管理（ResourcePage.js 聚合入口）
│   ├── route/                    # 路由管理（RoutePage.js）
│   └── model-prices/             # 模型定价（ModelPricePage.js）
├── utils/                        # 通用工具（与业务无关）
│   ├── common.js
│   ├── public.js
│   ├── test-helpers.js
│   └── generate_report.js
├── tests/                        # 测试用例
│   ├── entity/
│   ├── resource/
│   ├── user/
│   └── report/
```

---

## 何时再读 reference-patterns.md（强制触发）

| 场景 | 必读章节 |
| ------ | ---------- |
| 列表 / 搜索 / 筛选 / 删除 / 造数 | 等待与同步、分页查找、API 造数与 afterEach |
| 表单提交后断言列表 | 表单提交等待（`Promise.all` + `waitForResponse`） |
| 封装内写 selector / 空态 / 颜色 / maxlength | 选择器策略 |
| 缺组件需新建封装 | 扩展封装模板 |
| 登录专项 / 注销 / 中文断言 | 语言、登录复用、状态隔离 |
| 服务连不上 / 全局失败 | 服务异常与状态持久化 |
| 生成代码结束后 | 完整检查清单 |

**封装 API 以源码为准（禁止维护第二份方法表）：** 生成前打开目标模块 `pages/*Page.js`；iView 改 `components/iview/*.js`，Layout/PageTable 改 `components/layout/`、`components/common/PageTable.js`；没有则先封装再写 spec。

---

## 范围与优先级（测什么）

| 优先级 | 自动化要求 |
|--------|------------|
| **P0** | 必须自动化，CI 必须通过 |
| **P1** | 应自动化，纳入回归 |
| **P2** | 可分批补充 |

| 模块 | 文档 | 规格目录 |
| ------ | ------ | ---------- |
| 用户管理 | `docs/user-management/`（UM-xx） | `tests/user/` |
| Entity 类型 | `docs/entity-type/`（EM-T-xx） | `tests/entity-type/` |
| Entity 组织 | `docs/entity-management/`（EM-E-xx） | `tests/entity-management/` |
| API-Key | `docs/api-key/`（EM-K-xx） | `tests/api-key/` |
| AI 业务集群 | `docs/business-cluster/`（RM-BC-xx） | `tests/cluster/` |
| 模型服务商 | `docs/providers/`（PR-xx） | `tests/providers/` |
| 模型定价 | `docs/model-prices/`（MP-xx） | `tests/model-prices/` |
| 路由管理 | `docs/route-management/`（RT-xx） | `tests/route/` |

Entity 顺序：类型 → 组织 → API-Key。资源配置顺序：模型服务商（Providers，实例池/模型/Keys）→ AI 业务集群（`llm_config.provider` 引用）→ 路由（见各模块 01 配置顺序）。网关实例池（`docs/gateway-pool/`）不含独立用例，实例池用例归 Providers。单条用例须对齐 02 步骤/预期、01 场景 ID、动态数据+清理、spec 只调 pages/utils。异常用例写清：输入值、拦截方式、提示文案（design/02）。写计划/补覆盖时再对照模块 01/02 的横切能力，不必在此展开。

---

## 阶段 1 生成门禁（硬约束，优先于「起骨架/批量生成」）

用户说「起骨架」「先生成测试」「铺自动化」且**未明确要求批量**时，默认进入**阶段 1**，不得进入阶段 2 批量。

| 阶段 1 允许 | 阶段 1 禁止 |
| ------------- | ------------- |
| `pages/*Page.js` / `api/*-api-utils.js` 骨架 | 一次生成整个模块全部 spec |
| **≤5 条 P0** spec（通常 3 条） | P1/P2、读回一致性、校验矩阵、@journey |
| 每条 spec **仅 1 个用例** 或同场景 1 条创建成功 | 列表+创建+读回打包进同一轮 |
| pages/utils 可预置后续会用到的封装 | 用「规划/02 全量」当本轮交付范围 |

**退出阶段 1 的条件（缺一不可）：** 用户确认标杆冒烟通过，或明确要求「继续扩 / 批量铺 / 加 P1」。

### AI 业务集群默认 P0 标杆（阶段 1 仅这两条）

| 顺序 | 用例 | spec 文件 |
|------|------|-----------|
| 1 | RM-BC-02 创建AI业务集群-5步向导成功 | `tests/cluster/test_03_business_cluster_crud.spec.js` |
| 2 | RM-BC-14 删除集群-被路由引用 | 同上 |

两条绿后再按标杆顺序扩：RM-BC-01 列表 → RM-BC-03~08 向导各步 → … → RM-BC-34~38 读回一致性 → RM-BC-52~56、65~68、71~79、81、84、87~91 大模型配置与 Key 亲和性校验。

> **注意**：网关实例池（RM-GP-xx）用例已随实例池迁移至 Providers 模块而删除；实例池相关校验以 Providers 用例（PR-C/PR-V/PR-LINK）为准。

### 生成前必做（门禁 checklist）

1. 读 `docs/<模块>/01`、`02`；有 `design/` 则对照验收文案
2. 打开已有 `pages/*Page.js`，优先复用导出
3. 确认本轮**新增 spec 数量 ≤5 且均为 P0**（除非用户点名更多）
4. 生成后对照本文「生成后短清单」+ `reference-patterns.md` 完整清单

**禁止：标杆未跑通就一次性生成整个模块。**

---

## 组件封装与工作流

```
阶段 0  读 docs/<模块>/01、02；有 design/ 则对照；有「测试问题复盘」则只查专项 workaround
阶段 1  读 UI 仅用于 DOM/交互；pages/utils 骨架 + **≤5 条 P0 标杆**；**禁止**同轮写 P1/读回/journey
        → 用户确认冒烟通过或明确要求「批量铺」后，才进入阶段 2
阶段 2  按标杆顺序批量扩 spec；有封装 → spec 只调 pages/utils；无 → components → pages → spec
阶段 3  冒烟 → 全量 → 报告；验收失败对照 design/02，记偏差，不静默改预期
```

**禁止：标杆未跑通就一次性生成整个模块。**「起骨架」= 阶段 1，不是全模块 spec。

```javascript
// ❌ spec 裸 selector / 全局 table / xpath 下拉
await page.locator('.ivu-drawer-wrap').click()
await page.getByText('修改密码').toBeVisible()

// ✅ 业务语义走 pages/utils
const userPage = require('../../pages/user/UserPage')
await userPage.gotoUserManagementPage(page)
const table = userPage.pageTable(page)
await table.expectHeaders('用户', '角色', '操作')
await userPage.openAddUserDrawer(page)
```

---

## 验收来源与生成门禁

| 必读 | 路径 |
|------|------|
| 场景 / 用例 | `docs/<模块>/01-*.md`、`02-*.md` |
| 工具 | `pages/*Page.js`、`api/*-api-utils.js` |
| 原型 / 复盘 | `docs/<模块>/design/`、`测试问题复盘.md`（有则读） |

`docs/entity-management/03-*.md` 为背景归档，**不必通读**。

| 用途 | 权威来源 | 禁止 |
| ------ | ---------- | ------ |
| 步骤、场景 | 02 | — |
| 验收文案、校验、布局 | **设计原型 → 02** | 直接抄 i18n/当前页 |
| selector、等待、点击 | UI 源码 + pages/components | 用源码定「对不对」 |
| 造数/删数 | OpenAPI + api | 用 API 行为替代 UI 验收 |

| 断言类型 | 写入 | 失败时 |
|----------|------|--------|
| 验收 | `DOC_*`（design/02） | 记 Bug / 确认设计变更后改 02 |
| 结构 | pages/components | 修 components / DOM |

- 点不到 / 超时 → 修 pages（`dataRows`、`waitFor*ListResponse`、导航）
- 文案/行为不符 design/02 → **保留验收断言**，02 标注偏差；临时 skip 须链到偏差记录

| 用例类型 | 必用模式 |
| ---------- | ---------- |
| 列表 | `goto` → `expectLayout` → `expectHeaders` |
| 创建/编辑 | `openDrawer` → `fill` → `submitAndWait` |
| 搜索/筛选 | API 造数 → `search/filter` → `*InAllPages` / `ensure*RowVisible` |
| 详情 | `dataRows()` 点数据列 → `expectOpen(精确标题)` |
| 删除 | `rowAction` → `confirmAndWait` → `expectRowHidden` |
| 表单校验 | 断言来自 design/02 |

**标杆顺序：** 导航+列表 → 创建成功 → 必填校验 → 列表搜索 → 删除+cleanup。  
**@journey：** 跨模块全 UI、`serial`；参考 `tests/entity-management/test_05_entity_full_journey.spec.js`。

---

## 危急规则（每次必守，细节见 reference）

1. **`Promise.all(waitForResponse + 提交/确认)`**，禁止提交后只 `waitForTimeout(1000)`
2. **列表行只用 `dataRows()` / `.show-iView-Table`**，禁止匹配搜索栏行
3. **找行用 `*InAllPages` / `ensure*RowVisible`**，禁止只查当前页
4. **`afterEach` + `track` 清理**，禁止仅末尾 `test.step('清理')`
5. **`DOC_*` 来自 design/02**，禁止为跑绿改成错误 i18n
6. **新增 pages/utils 函数必须写入 `module.exports`**
7. **登录前 `lang=zh`**（`addInitScript` 在 `goto` 之前）；中文断言依赖此设置
8. **抽屉无「取消」则用 `close*Drawer`（X）**，禁止瞎点 footer「取消」
9. **测试失败 = 代码 bug 时，禁止改测试用例适配 bug**：保留正确预期，将失败作为 bug 证据报告给用户；只有当测试用例本身写错（选择器错误、步骤遗漏、断言逻辑错误）时才修改测试代码

---

## 用例结构（要点）

- 命名对应 UM-XX / EM-XX；步骤用 `test.step`
- 数据：`generateTestUsername()` 等动态命名 + 文档约定密码
- 普通用例复用 `auth.json`；登录专项才 `test.use({ storageState: { cookies: [], origins: [] } })`
- 导航统一 `goto*` / `ensureOn*`（已在目标页则跳过）

---

## 生成后短清单

- [ ] 读过模块 01/02 与对应 `pages/*Page.js`（及 design/复盘，若有）
- [ ] `DOC_*` 来自 design/02，非 i18n；偏差已记录而非改断言
- [ ] spec 无裸 `.ivu-*` / `.el-*` / 全局 `table` / 抽屉标题 `getByText`
- [ ] 列表：`dataRows` + 全页查找 + `waitFor*ListResponse` / API 造数
- [ ] `afterEach` cleanup；新函数已导出
- [ ] 3～5 条 P0 标杆已跑通再批量
- [ ] 细则已按触发器核对 [reference-patterns.md](reference-patterns.md) 完整清单

---

## 示例与运行（指向真实代码）

| 用途 | 文件 |
| ------ | ------ |
| 列表/搜索 | `tests/user/test_01_user_manage_main.spec.js` |
| 抽屉表单 | `tests/user/test_02_user_add.spec.js` |
| Entity 标杆 | `tests/api-key/test_01_api_key_create.spec.js` |
| 集群 P0 标杆 | `tests/cluster/test_03_business_cluster_crud.spec.js`（RM-BC-02/14 先冒烟） |
| 场景串联 | `tests/entity-management/test_05_entity_full_journey.spec.js` |

```bash
nvm use 18
npx playwright test tests/api-key/test_01_api_key_create.spec.js
# 结束后自动生成 report/test-report.md
```

报告 / 扩展封装 / 选择器细则 → [reference-patterns.md](reference-patterns.md)。
