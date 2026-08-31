# GUI-test-for-ai-gateway

AI网关GUI自动化测试项目,采用Playwright框架对AI网关管理控制台进行端到端测试。

## 项目结构

```
.
├── README.md                          # 项目说明文档
├── api/                               # API 调用层（造数/清理）
│   ├── entity-api-utils.js            # Entity API
│   ├── model-price-api-utils.js       # 模型定价 API
│   ├── provider-api-utils.js          # 模型服务商 API
│   ├── resource-api-utils.js          # 资源 API（集群、网关实例池）
│   └── route-api-utils.js             # 路由 API
├── components/                        # UI 组件封装（JS）
│   ├── common/PageTable.js            # 表格封装
│   ├── element/                       # Element 组件（ElSelect 等）
│   ├── iview/                         # iView 组件（13个：Select/Form/Drawer/Modal 等）
│   └── layout/                        # 布局组件（4个：Sidebar/Breadcrumb/LayoutShell 等）
├── pages/                             # 模块实现（业务页面操作，按模块拆目录）
│   ├── user/                          # 用户管理（UserPage.js）
│   ├── entity/                        # Entity 管理（EntityPage.js 聚合入口 + EntityTypePage/EntityOrgPage/EntityApiKeyPage）
│   ├── resource/                      # 资源管理（ResourcePage.js 聚合入口 + BusinessClusterPage/GatewayPoolPage）
│   ├── route/                         # 路由管理（RoutePage.js）
│   ├── providers/                     # 模型服务商（ProviderPage.js）
│   └── model-prices/                  # 模型定价（ModelPricePage.js）
├── utils/                             # 通用工具（与业务无关）
│   ├── common.js                      # 通用函数
│   ├── public.js                      # 公共工具
│   ├── test-helpers.js                # 测试辅助
│   └── generate_report.js             # 报告生成
├── tests/                             # 测试用例
│   ├── user/                          # 用户管理测试（9个 spec）
│   ├── entity-type/                   # Entity 类型测试（3个 spec）
│   ├── entity-management/             # Entity 组织管理测试（9个 spec）
│   ├── api-key/                       # API-Key 测试（5个 spec）
│   ├── cluster/                       # AI 业务集群测试（7个 spec）
│   ├── providers/                     # 模型服务商测试（6个 spec）
│   ├── model-prices/                  # 模型定价测试（5个 spec）
│   ├── route/                         # 路由管理测试（7个 spec）
│   └── gateway-pool/                  # AI 网关实例池测试（全局 /alb-pool 单例，内联编辑）
├── test-files/                        # 测试数据文件
│   └── model-prices/                  # YAML 导入测试文件（valid/invalid/duplicate 等）
├── report/                            # 测试报告
├── scripts/                           # 测试数据清理与初始化脚本
│   ├── init-test-data.js              # 测试数据初始化
│   ├── cleanup-entity-test-data.cjs   # Entity 测试数据清理
│   ├── cleanup-model-price-test-data.cjs
│   ├── cleanup-provider-test-data.cjs
│   ├── cleanup-resource-test-data.cjs
│   ├── cleanup-route-test-data.cjs
│   └── cleanup-user-test-data.cjs
├── docs/                              # 测试文档
│   ├── user-management/               # 用户管理模块
│   ├── entity-type/                   # Entity 类型模块
│   ├── entity-management/             # Entity 组织管理模块
│   ├── api-key/                       # API-Key 模块
│   ├── business-cluster/              # AI 业务集群模块
│   ├── providers/                     # 模型服务商模块
│   ├── model-prices/                  # 模型定价模块
│   ├── route-management/              # 路由管理模块
│   └── gateway-pool/                  # AI 网关实例池模块（全局单例，独立于 Providers 的 instance_pool）
├── global-setup.js                    # Playwright 全局登录
├── global-teardown.js                 # Playwright 全局清理
├── playwright.config.js               # Playwright 配置
├── conf.json                          # 环境配置
└── auth.json                          # 登录状态（自动生成）
```

## 测试文档说明

本项目采用两层文档结构，模拟真实用户使用场景来测试系统是否能正常工作。

### 文档层级

| 层级 | 文档 | 定位 | 组织方式 |
|------|------|------|---------|
| 第一层 | `01-测试场景概览.md` | 场景编排 | 按真实用户使用场景组织 |
| 第二层 | `02-功能测试用例/` | 功能拆解 | 目录，按功能模块拆分多个测试用例文件 |

### 追溯路径

```
场景概览(为什么要测) → 功能测试用例(怎么测)
```

## 模块覆盖

| 模块 | 文档目录 | 测试目录 | 说明 |
| ------ | ---------- | ---------- | ------ |
| 用户管理 | `docs/user-management/` | `tests/user/` | 用户、Token、登录认证 |
| Entity 类型 | `docs/entity-type/` | `tests/entity-type/` | 类型列表、编辑、删除 |
| Entity 组织 | `docs/entity-management/` | `tests/entity-management/` | 组织列表、创建配额、限流校验 |
| API-Key | `docs/api-key/` | `tests/api-key/` | Key 创建、搜索编辑删除、限流校验 |
| AI 业务集群 | `docs/business-cluster/` | `tests/cluster/` | 5 步向导、大模型配置、Key 亲和性 |
| 模型服务商 | `docs/providers/` | `tests/providers/` | 实例池、模型、Keys、分段计价 |
| 模型定价 | `docs/model-prices/` | `tests/model-prices/` | 定价 CRUD、YAML 导入、分时段价格 |
| 路由管理 | `docs/route-management/` | `tests/route/` | 路由表、路由规则 |
| AI 网关实例池 | `docs/gateway-pool/` | `tests/gateway-pool/` | 全局网关转发引擎实例池（`/alb-pool` 单例、内联编辑）；与 Providers 的 `instance_pool` 相互独立 |

## 测试执行

### 前置条件

- Node.js (推荐v18+)
- Playwright (`npm install`)
- AI网关管理控制台已部署并正常运行

### 环境配置

编辑 `conf.json` 配置测试环境：

```json
{
  "ctlHost": "http://your-ai-gateway-url/login",
  "username": "admin",
  "password": "your-password"
}
```

### 运行测试

```bash
# 安装依赖
npm install

# 运行所有测试
npm test

# 运行特定模块的测试
npm run test:user              # 用户管理（单 worker）
npm run test:entity-type       # Entity 类型（2 workers）
npm run test:entity-management # Entity 组织管理（2 workers）
npm run test:api-key           # API-Key（2 workers）
npm run test:cluster           # AI 业务集群
npm run test:route             # 路由管理（单 worker）
npm run test:journey           # Entity 跨模块全流程

# 运行特定测试文件
npx playwright test tests/user/test_01_user_manage_main.spec.js

# 以有头模式运行（可查看浏览器操作）
npx playwright test --headed

# 生成测试报告
npm run report

# 清理测试数据（预览模式，不实际删除）
npm run cleanup:testdata       # Entity 测试数据
npm run cleanup:user           # 用户测试数据
npm run cleanup:resource       # 资源测试数据
npm run cleanup:route          # 路由测试数据
npm run cleanup:modelprice     # 模型定价测试数据
npm run cleanup:provider       # 模型服务商测试数据

# 清理测试数据（实际执行删除）
npm run cleanup:testdata:execute
npm run cleanup:user:execute
npm run cleanup:resource:execute
npm run cleanup:route:execute
npm run cleanup:modelprice:execute
npm run cleanup:provider:execute
```

### 测试报告

测试完成后自动生成 Markdown 报告：`report/test-report.md`

同时生成 Playwright HTML 报告，可通过以下命令查看：

```bash
npx playwright show-report
```

## 测试数据说明

| 数据类型 | 格式/示例 | 说明 |
| --------- | ---------- | ------ |
| 管理员账号 | admin | 用于执行管理操作 |
| 测试用户名 | user_{时间戳} | 如: user_20260703093500 |
| 测试密码 | 字母+数字+特殊字符 | 如: Itm@2026 |
| Token名称 | token_{时间戳} | 如: token_20260703093500 |

## 开发规范

### 目录职责

- **api/** — API 调用层，负责数据造数和清理
- **components/** — UI 组件封装，提供统一的组件操作接口
- **pages/** — 模块实现，封装业务页面操作
- **utils/** — 通用工具，与业务无关的辅助函数
- **tests/** — 测试用例，只放 `.spec.js` 文件

### 核心原则

1. **验收来源**：验证设计是否实现，以 `docs/*/02-功能测试用例.md` 为准
2. **组件封装**：spec 只调 pages/utils，禁止裸 selector
3. **数据清理**：使用 `afterEach` + `track` 机制，确保测试数据清理
4. **提交等待**：使用 `Promise.all(waitForResponse + 操作)`，禁止只 `waitForTimeout`

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

- 浏览器: Chrome / Firefox / Safari 最新版本
- 分辨率: 1920×1080
- 网络: 可访问AI网关管理控制台
- 前置条件: 系统已部署并正常运行

## 相关文档

- [测试用例生成规范](.trae/skills/ai-gateway-test-generation/SKILL.md)
- [实现模式参考](.trae/skills/ai-gateway-test-generation/reference-patterns.md)
- [iView 测试陷阱](.trae/skills/ivue-playwright-test-patterns/SKILL.md)
