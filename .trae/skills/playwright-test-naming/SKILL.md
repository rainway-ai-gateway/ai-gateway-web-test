---
name: "playwright-test-naming"
description: "Defines the naming and titling conventions for Playwright E2E spec files and test cases, and the writing conventions for 02-功能测试用例 docs. Invoke when creating, renaming, or reviewing tests under tests/, or when creating/formatting docs under docs/<module>/02-功能测试用例/."
---

# Playwright 测试命名规范

本规范用于统一 `tests/` 目录下所有 Playwright 测试文件、describe 标题和 test 标题的命名格式，确保 GUI 用例列表、历史报告和 Markdown 报告中的用例编号一致可识别。

## 1. 文件命名

格式：`test_<NN>_<feature>_<scenario>.spec.js`

- `NN`：模块内唯一的两位序号，从 `01` 开始递增，不允许重复。
- `feature`：功能领域，小写，多个单词用下划线连接。
- `scenario`：用例场景或动作，小写，多个单词用下划线连接。
- 示例：
  - `test_01_cert_create.spec.js`
  - `test_04_business_cluster_crud.spec.js`
  - `test_07_route_target_model_dedup.spec.js`

## 2. 用例编号格式

格式：`<模块前缀>-<类别字母>-<数字>` 或 `<模块前缀>-<数字>`

- 模块前缀：
  - `CM`：证书管理（Cert Management）
  - `EM`：Entity 管理（Entity Management）
  - `RM`：资源管理（Resource Management）
  - `RT`：路由管理（Route Management）
  - `UM`：用户管理（User Management）
- 类别字母（可选）：
  - Cert：`C`
  - Entity：`T` 类型、`O` 组织、`AK` API-Key
  - Resource：`GP` 网关实例池、`BC` 业务集群
  - Route：`S` 联动场景、`D` 详情/编辑、`V` 表单校验、`L` 列表、`J` 全链路、`ERR` 错误边界
- 数字：用例序号，允许 `01`、`02`、`-1`、`-2` 等子编号。
- 示例：`CM-C-02`、`EM-T-01`、`RM-BC-14`、`RT-V-12-1`、`UM-03`

## 3. describe 标题格式

每个 `test.describe` 必须包含且仅包含一个用例编号。

格式：`<模块名> - <用例编号> <用例标题>`

- 模块名：如 `证书管理`、`路由管理`、`用户管理`。
- 用例编号：位于模块名之后，用空格分隔。
- 用例标题：简明描述该 describe 的验证范围。
- 示例：
  - `test.describe('证书管理 - CM-C-02 添加证书成功', () => {`
  - `test.describe('路由管理 - RT-S-01 Entity 与路由表联动', () => {`
  - `test.describe('用户管理 - UM-03 分页功能', () => {`

## 4. test 标题格式

test 标题本身可以不写用例编号，由父级 describe 继承；如果 test 标题本身包含编号，格式应为 `<用例编号> <验证点描述>`。

- 推荐：`test('验证添加证书成功', async ({ page }) => {`
- 允许：`test('RT-D-20 Global 路由表不存在时进入详情', async ({ page }) => {`
- 不推荐：`test('验证 Global 路由表详情页以查看模式正确加载', ...)` 与 describe 编号重复时无需再写编号

## 5. 命名冲突与拆分

- 一个 describe 只对应一个用例编号；若原 describe 覆盖多个编号，应拆分为多个 describe。
- 文件序号在模块内必须唯一；若出现重复，按文件创建顺序或功能顺序重新编号。
- 文件名中的 `feature` 应尽量与 describe 中的模块名保持一致。

## 6. GUI 展示规则

- GUI 用例树、历史报告详情、Markdown 报告均优先使用 describe 标题中的用例编号。
- 当 test 自身标题包含编号时，以 test 自身编号为准；否则继承 describe 编号。
- 若最终未解析到任何编号，GUI 展示原标题，Markdown 中不附加 `[未编号]` 前缀。

## 7. 02-功能测试用例文档编写规范

`docs/<模块>/02-功能测试用例/` 下的用例文档统一遵循以下格式（参考 `entity-management/02a-列表与CRUD.md`），用例编号须与 §2 及测试文件 describe 标题保持一致。

### 7.1 文档结构

- 首行导航：`[← 返回索引](./00-索引与映射.md)`
- 章节标题：`## N. 章节标题`（N 与 00-索引中的 §N 对应）
- 用例标题：`### 用例编号：用例标题`（标题即锚点，须与 00-索引与映射.md 中的链接锚点一致；改动标题须同步更新 00-索引）
- 用例元信息（不使用表格，直接换行书写）：

  ```
  **功能模块**: xxx
  **优先级**: P1
  **用例编号**: EM-E-01
  ```

  可选项：**设计依据**、**OpenAPI**、**自动化**
- 正文小节：`#### 前置条件` / `#### 测试步骤` / `#### 预期结果` / `#### 测试数据` / `#### 补充说明`
- 用例之间以 `---` 分隔

### 7.2 表格使用规则（核心：正文不用表格）

用例正文（元信息、测试步骤、预期结果、测试数据等）一律不使用表格，仅以下**索引/矩阵/统计类**表格允许保留：

- `00-索引与映射.md`：用例索引表、场景映射表、自动化映射表
- 字段校验矩阵（`03/05/09-字段校验矩阵.md`）：规则总览矩阵
- 一致性比对矩阵（如 `02e-一致性验证.md` 的「UI 区块 ↔ OpenAPI 字段 ↔ 比对要点」）
- 用例↔测试文件/标题映射（如 `06a/06b`）、测试统计表（如 `08-测试用例统计.md`）

其余表格一律转为列表：

| 表格类型 | 转换示例 |
| --- | --- |
| 「输入/预期」两列参数化表 | `1. \`ops\` → 预期通过` |
| 多列参数化表 | `1. **长度 >64**：65 个字符 → 预期拦截，提示长度超限` |
| 场景表 | `1. **time_ranges 为空** → 预期拦截，「忙时至少包含 1 个时间段」` |
| 边界值表（非法/合法） | `1. **步骤 1 · 字段**：非法 \`-1\`、\`0\`；合法 \`1\`、\`100\`（下界/上界）` |
| 测试数据表（`\| 项 \| 说明/示例 \|`） | `- **父类型**：运行时生成，如 \`type_yyyyMMdd…\`，级别 1` |
| 字段取值约定 / 格式规范表 | `- **时间窗口(分)**：1 ~ 360` |
| 向导步骤等说明表 | `**创建向导 6 步**：` 后接编号列表 |

### 7.3 检查清单

- [ ] 用例元信息为纯文本换行，无 `| **用例编号** |`、`| 项 | 内容 |` 表格
- [ ] 测试步骤中无「输入/预期」参数化表格（已转列表）
- [ ] `### 用例标题` 与 00-索引锚点一致
- [ ] 用例编号与测试文件 describe 标题一致（§2/§3）
