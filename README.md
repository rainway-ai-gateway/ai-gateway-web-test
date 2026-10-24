# GUI-test-for-ai-gateway

AI 网关 GUI 自动化测试项目，采用 Playwright 对 AI 网关管理控制台进行端到端测试。用例对应 Web 控制台 **v0.11.0**。

## 项目结构

```
.
├── README.md                          # 项目说明文档
├── regression-reports/                # 全量回归报告归档（受跟踪，按日期命名）
│   ├── README.md                      # 归档索引（最新报告在最前，自动生成）
│   ├── TEST-REPORT-2026-10-17.md      # 2026-10-17 全量回归
│   └── ...                            # 每轮全量回归一份，不覆盖
├── api/                               # API 调用层（造数/清理）
│   ├── ai-cache-api-utils.js
│   ├── ai-context-api-utils.js
│   ├── batch-api-utils.js
│   ├── cert-api-utils.js
│   ├── entity-api-utils.js
│   ├── epp-pool-api-utils.js
│   ├── intent-config-api-utils.js
│   ├── model-price-api-utils.js
│   ├── operation-log-api-utils.js
│   ├── provider-api-utils.js
│   ├── report-api-utils.js
│   ├── resource-api-utils.js          # 集群等资源
│   ├── route-api-utils.js
│   ├── security-api-utils.js          # 密钥收敛
│   └── traffic-mirror-api-utils.js
├── components/                        # UI 组件封装（JS）
│   ├── common/PageTable.js            # 表格封装
│   ├── element/                       # Element 组件（ElSelect 等）
│   ├── iview/                         # iView 组件（13 个：Select/Form/Drawer/Modal 等）
│   └── layout/                        # 布局组件（Sidebar/Breadcrumb/LayoutShell/AppLayout）
├── pages/                             # 模块实现（业务页面操作，按模块拆目录）
│   ├── user/                          # 用户管理（UserPage.js）
│   ├── entity/                        # EntityPage 聚合入口 + EntityTypePage/EntityOrgPage/EntityApiKeyPage
│   ├── resource/                      # ResourcePage 聚合入口 + BusinessClusterPage/EppPoolPage/GatewayPoolPage
│   ├── route/                         # RoutePage.js + ExpressionPanelPage.js
│   ├── providers/                     # 模型服务商（ProviderPage.js）
│   ├── model-prices/                  # 模型定价（ModelPricePage.js）
│   ├── cert/                          # 证书管理（CertPage.js，模块已下线）
│   ├── operation-logs/                # 操作日志（OperationLogPage.js）
│   ├── report/                        # 数据报表（ReportPage.js）
│   ├── batch-tasks/                   # 批量任务（BatchTaskPage.js）
│   ├── security/                      # 密钥收敛（ReencryptSweepPage.js）
│   ├── ai-cache/                      # AI 缓存规则（AICachePage.js）
│   ├── traffic-mirror/                # 流量镜像规则（TrafficMirrorPage.js）
│   ├── intent-config/                 # 意图配置（IntentConfigPage.js）
│   └── ai-context/                    # AI 上下文压缩（AIContextPage.js）
├── utils/                             # 通用工具（与业务无关）
│   ├── common.js                      # 通用函数
│   ├── public.js                      # 公共工具
│   ├── test-helpers.js                # 测试辅助
│   ├── session.js                     # Session Key 失效自愈
│   ├── readonly.js                    # 只读系统管理员视角
│   ├── generate_report.js             # 单轮 Markdown 报告
│   ├── markdown-report-reporter.js    # Playwright reporter（自动出报告）
│   └── capture-user-manual.spec.js    # 用户手册截图
├── tests/                             # 测试用例（只放 .spec.js）
│   ├── user/                          # 11 个 spec
│   ├── entity-type/                   # 4 个 spec
│   ├── entity-management/             # 11 个 spec
│   ├── api-key/                       # 6 个 spec
│   ├── cluster/                       # 9 个 spec
│   ├── providers/                     # 8 个 spec
│   ├── model-prices/                  # 9 个 spec
│   ├── route/                         # 13 个 spec
│   ├── epp-pool/                      # 3 个 spec
│   ├── ai-cache/                      # 7 个 spec
│   ├── traffic-mirror/                # 7 个 spec
│   ├── intent-config/                 # 7 个 spec
│   ├── ai-context/                    # 7 个 spec
│   ├── report/                        # 7 个 spec
│   ├── batch-tasks/                   # 4 个 spec
│   ├── reencrypt-sweep/               # 5 个 spec
│   ├── operation-logs/                # 3 个 spec
│   └── cert/                          # 8 个 spec（已从常规回归排除）
├── test-files/                        # 测试数据文件
│   ├── cert/                          # 证书上传测试文件
│   └── model-prices/                  # YAML 导入测试文件（valid/invalid/duplicate 等）
├── report/                            # 每轮测试报告（gitignored）
├── scripts/
│   ├── aggregate-report.js            # 生成按日期归档的全量回归报告 + 索引
│   ├── accepted-skips.json            # 跳过签核清单
│   ├── impact-scan.js                 # 既有用例影响扫描
│   ├── init-test-data.js              # 测试数据初始化
│   ├── seed-batch-task-data.cjs       # 批量任务造数/清理
│   ├── seed-report-data.js            # 报表造数
│   ├── capture-*.js                   # 手册/新模块/报表截图
│   └── cleanup-*.cjs                  # 各模块测试数据清理
├── docs/                              # 18 个模块的两层测试文档
├── global-setup.js                    # Playwright 全局登录
├── global-teardown.js                 # Playwright 全局清理
├── playwright.config.js               # Playwright 配置
├── package.json                       # 依赖与执行脚本
├── conf.json                          # 环境配置
└── auth.json                          # 登录状态（自动生成，gitignored）
```

## 测试文档说明

本项目采用两层文档结构，模拟真实用户使用场景来测试系统是否能正常工作。

### 文档层级

| 层级 | 文档 | 定位 | 组织方式 |
|------|------|------|---------|
| 第一层 | `01-测试场景概览.md` | 场景编排 | 按真实用户使用场景组织 |
| 第二层 | `02-功能测试用例/` | 功能拆解 | 目录，按功能模块拆分多个测试用例文件；`00-索引与映射.md` 维护用例编号与 spec 的映射 |

### 追溯路径

```
场景概览(为什么要测) → 功能测试用例(怎么测) → tests/*.spec.js(自动化实现)
```

## 模块覆盖

| 模块 | 文档目录 | 测试目录 | spec 数 | 说明 |
| ------ | ---------- | ---------- | ------ | ------ |
| 用户管理 | `docs/user-management/` | `tests/user/` | 11 | 用户 CRUD、Token、登录认证、角色与只读视角 |
| Entity 类型 | `docs/entity-type/` | `tests/entity-type/` | 4 | 类型列表、编辑、删除、只读视角 |
| Entity 组织 | `docs/entity-management/` | `tests/entity-management/` | 11 | 组织 CRUD、配额/限流校验、跨模块串联、描述字段、只读视角 |
| API-Key | `docs/api-key/` | `tests/api-key/` | 6 | Key CRUD、配额与限流校验、详情一致性、名称校验、只读视角 |
| AI 业务集群 | `docs/business-cluster/` | `tests/cluster/` | 9 | 5 步向导、大模型配置、Key 亲和、EPP 均衡模式、字段校验、只读视角 |
| 模型服务商 | `docs/providers/` | `tests/providers/` | 8 | 实例来源、模型发现、Keys、分段计价、引用保护、只读视角 |
| 模型定价 | `docs/model-prices/` | `tests/model-prices/` | 9 | 定价 CRUD、YAML 导入、分时段价格、精度与键级合并、只读视角 |
| 路由管理 | `docs/route-management/` | `tests/route/` | 13 | 路由表、路由规则、表达式条件、条件原语面板、只读视角 |
| EPP 实例池与调度 | `docs/epp-pool/` | `tests/epp-pool/` | 3 | 实例池管理、调度分配、只读视角 |
| AI 缓存规则 | `docs/ai-cache/` | `tests/ai-cache/` | 7 | 集合级规则双模式、语义缓存、语义设置、字段校验、拖拽排序、只读视角 |
| 流量镜像规则 | `docs/traffic-mirror/` | `tests/traffic-mirror/` | 7 | 集合级规则双模式、KV/请求体/请求头注入、字段校验、拖拽排序、只读视角 |
| 意图配置 | `docs/intent-config/` | `tests/intent-config/` | 7 | 全局最小置信度、问题集、发布流程、离开拦截、只读视角 |
| AI 上下文压缩 | `docs/ai-context/` | `tests/ai-context/` | 7 | 压缩规则、全局设置、字段校验、拖拽排序、只读视角 |
| 数据报表 | `docs/report/` | `tests/report/` | 7 | 总览指标卡、时序、维度排行/分布下钻、明细与过滤、只读视角 |
| 批量任务 | `docs/batch-tasks/` | `tests/batch-tasks/` | 4 | 列表、详情、取消、只读视角 |
| 密钥收敛 | `docs/reencrypt-sweep/` | `tests/reencrypt-sweep/` | 5 | 触发与轮询、列表筛选、详情与错误、只读视角 |
| 操作日志 | `docs/operation-logs/` | `tests/operation-logs/` | 3 | 列表筛选、详情、跨模块联动 |
| 证书管理 | `docs/cert-management/` | `tests/cert/` | 8 | **模块已下线**：用例保留但被 `testIgnore` 排除，不计入常规回归 |

> **已下线模块**：
>
> - **AI 网关实例池**（原 `docs/gateway-pool/` + `tests/gateway-pool/`）随 2026-09-20 `/alb-pool` 单例页面下线而清理，实例池相关断言改由 `tests/providers/` 覆盖。
> - **证书管理**随 2026-09-11 菜单移除，UI 入口不复存在；`tests/cert/` 的 8 个 spec 由 `playwright.config.js` 的 `testIgnore` 排除，用例按生命周期约定保留为「跳过」，待模块恢复后移除该配置并同步回写文档。

## 测试执行

### 前置条件

- Node.js（推荐 v18+）
- Playwright（`npm install`）
- AI 网关管理控制台已部署并可访问

### 环境配置

编辑 `conf.json` 配置测试环境：

```json
{
  "ctlHost": "http://your-ai-gateway-url/login",
  "apiHost": "http://your-ai-gateway-api:8183",
  "username": "admin",
  "password": "your-password",
  "changePassword": "your-new-password"
}
```

- `ctlHost`：控制台登录页地址（`global-setup` 用它完成 UI 登录）
- `apiHost`：控制面 API 地址，UI 登录失败时用于 `POST /open-api/v1/auth/session-keys` 直连兜底
- `changePassword`：用户管理模块「修改密码」用例使用的新密码

`auth.json` 由 `global-setup.js` 自动生成，无需手工维护。后端每个用户只保留 **1 个 Session Key**，并发运行或外部登录会让既有 Key 失效——用例导航统一走 `utils/session.js` 的会话自愈守卫，但全量回归仍请保持串行。

### 运行测试

```bash
# 安装依赖
npm install

# 全量回归（串行、不设全局超时，regression-reports/ 归档的唯一生成场景）
npm run test:all

# 运行所有测试（使用 playwright.config.js 的默认超时）
npm test

# 运行特定模块的测试（已有 npm 脚本）
npm run test:user              # 用户管理
npm run test:entity-type       # Entity 类型
npm run test:entity-management # Entity 组织管理
npm run test:api-key           # API-Key
npm run test:cluster           # AI 业务集群
npm run test:route             # 路由管理
npm run test:journey           # Entity 跨模块全流程

# 其余模块直接按目录运行
npx playwright test tests/ai-cache/
npx playwright test tests/traffic-mirror/
npx playwright test tests/intent-config/
npx playwright test tests/ai-context/
npx playwright test tests/report/
npx playwright test tests/batch-tasks/
npx playwright test tests/reencrypt-sweep/
npx playwright test tests/operation-logs/
npx playwright test tests/epp-pool/
npx playwright test tests/providers/
npx playwright test tests/model-prices/

# 运行特定测试文件
npx playwright test tests/user/test_01_user_manage_main.spec.js

# 以有头模式运行（可查看浏览器操作）
npx playwright test --headed

# 生成单轮 Markdown 报告
npm run report

# 既有用例影响扫描（判断改动波及哪些用例）
npm run impact-scan -- "关键词" --module=business-cluster

# 清理测试数据（预览模式，不实际删除）
npm run cleanup:testdata       # Entity 测试数据
npm run cleanup:user           # 用户测试数据
npm run cleanup:resource       # 资源测试数据
npm run cleanup:route          # 路由测试数据
npm run cleanup:modelprice     # 模型定价测试数据
npm run cleanup:provider       # 模型服务商测试数据
npm run cleanup:batch          # 批量任务造数

# 清理测试数据（实际执行删除）
npm run cleanup:testdata:execute
npm run cleanup:user:execute
npm run cleanup:resource:execute
npm run cleanup:route:execute
npm run cleanup:modelprice:execute
npm run cleanup:provider:execute
npm run cleanup:batch:execute
```

批量任务列表/详情用例需要 `batch-seed-*` 造数：

```bash
npm run seed:batch            # 预览
npm run seed:batch:execute    # 实际写入
```

### 测试报告

本仓库有**两类**报告，用途不同：

| 报告 | 路径 | 是否受版本控制 | 用途 |
| ---- | ---- | -------------- | ---- |
| 全量回归报告 | `regression-reports/TEST-REPORT-YYYY-MM-DD.md`（+ 自动生成的 [归档索引](regression-reports/README.md)） | **是**（随代码提交） | 「用例是否 100% 跑通」的**唯一权威出口**：按模块/spec 汇总通过、失败、跳过，含失败明细与跳过原因、历史全量对比。每轮全量回归一份，不覆盖历史 |
| 每轮人读报告 | `report/test-report.md`（+ 带时间戳归档） | 否（`report/` 在 `.gitignore` 内） | 单轮（含定向批次）的明细与失败详情，滚动覆盖、可被清理，**不可作为长期凭据引用** |

跑完一轮后自动生成 Markdown 报告：`report/test-report.md`；同时生成 Playwright HTML 报告，可通过以下命令查看：

```bash
npx playwright show-report
```

**生成归档的全量回归报告**（约定：只在跑完**全量**回归后生成，并在提交代码时一并提交）：

```bash
# 1) 跑全量（单 worker 串行：只读视角等用例依赖 viewer 单一会话，必须串行）
PW_WORKERS=1 npx playwright test tests/ --global-timeout=0

# 2) 生成归档报告 + 刷新索引
npm run report:tracked
```

- 输出为 `regression-reports/TEST-REPORT-<运行日期>.md`，并自动重建 `regression-reports/README.md` 索引（最新报告在最前）。
- 同一天第二次全量回归会自动追加 `-HHmmss`（如 `TEST-REPORT-2026-10-17-233755.md`），不会覆盖当天已有归档；同一份 `test-results.json` 重复生成时复用原文件。
- 脚本只在「本轮覆盖了全部常规 spec」时写入归档，定向批次（只跑某模块）不会覆盖全站结论；需要另存本轮汇总用 `npm run report:tracked -- --out <path>`。
- 若报告判定为 ❌（有失败）：**修复后重跑受影响 spec，再跑一次全量并重新生成**，直到判定为 ✅。
- 若判定为 ⚠️（有**未签核**的跳过）：跳过属运行时条件跳过（环境数据/产品行为依赖），确属此类而非用例遗漏的，在 `scripts/accepted-skips.json` 登记 `caseId` / `reason` / `evidence` / `confirmedBy` 后重新生成，判定即升为 ✅；报告第 5 节会逐条列出签核依据。**禁止为了好看而登记**。
- 历史行只增不改；新报告会汇总 `regression-reports/` 下既有归档的历史结果，避免跨报告丢历史。
- 生成后把新增报告与更新的 `regression-reports/README.md` 一起 `git add`（`report/` 仍保持 gitignored）。

## 测试数据说明

| 数据类型 | 格式/示例 | 说明 |
| --------- | ---------- | ------ |
| 管理员账号 | admin | 用于执行管理操作 |
| 测试用户名 | user_{时间戳} | 如: user_20260703093500 |
| 测试密码 | 字母+数字+特殊字符 | 如: Itm@2026 |
| Token 名称 | token_{时间戳} | 如: token_20260703093500 |
| 批量任务造数 | batch_id 前缀 `batch-seed-` | `npm run seed:batch:execute` 写入，`npm run cleanup:batch:execute` 清理 |
| 报表造数 | 详见 `scripts/seed-report-data.js` | 提供报表指标卡/时序/维度用例的数据基础 |

## 开发规范

### 目录职责

- **api/** — API 调用层，负责数据造数和清理
- **components/** — UI 组件封装，提供统一的组件操作接口
- **pages/** — 模块实现，封装业务页面操作
- **utils/** — 通用工具，与业务无关的辅助函数（会话自愈、只读视角也在这里）
- **tests/** — 测试用例，只放 `.spec.js` 文件

### 核心原则

1. **验收来源**：验证设计是否实现，以 `docs/<模块>/02-功能测试用例/` 及其 `00-索引与映射.md` 为准
2. **组件封装**：spec 只调 pages/utils，禁止裸 selector
3. **数据清理**：使用 `afterEach` + `track` 机制，确保测试数据清理
4. **提交等待**：使用 `Promise.all(waitForResponse + 操作)`，禁止只 `waitForTimeout`
5. **会话守卫**：页面导航统一走 `utils/session.js` 的 `ensureSessionHealthy`，避免 Session Key 失效造成级联假失败
6. **只读视角**：写入口隐藏类断言使用 `utils/readonly.js`（不写 `auth.json`，避免污染管理员会话）
7. **文档同步**：UI 行为变更时先跑 `npm run impact-scan`，确认受影响的既有用例并在批次变更记录中留痕

### 代码示例

```javascript
// ✅ 正确：使用 pages 封装
const userPage = require('../../pages/user/UserPage')
await userPage.gotoUserManagementPage(page)
await userPage.openAddUserDrawer(page)

// ❌ 错误：裸 selector
await page.locator('.ivu-drawer-wrap').click()
```

## 测试环境要求

- Node.js: 18+
- 浏览器: Playwright 内置 Chromium（headless，视口 1280×720）
- 网络: 可访问 `conf.json` 中的 `ctlHost` / `apiHost`
- 前置条件: 系统已部署并正常运行；单用户单会话，跑测期间避免其他人用同一账号登录

## 相关文档

- [测试用例生成规范](.trae/skills/ai-gateway-test-generation/SKILL.md)
- [实现模式参考](.trae/skills/ai-gateway-test-generation/reference-patterns.md)
- [iView 测试陷阱](.trae/skills/ivue-playwright-test-patterns/SKILL.md)
- [全量回归报告归档索引](regression-reports/README.md)
- Web 侧 UI 变更记录：`ai-gateway-web/design-docs/modifications/`