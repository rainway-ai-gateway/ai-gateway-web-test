[← 返回索引](./00-索引与映射.md)

## 5. YAML 导入

> **接口**：`POST /model-prices/import`  
> **模式**：`replace`（全量替换，默认）/ `merge`（增量合并）  
> **返回**：`imported_count` / `skipped_count` / `errors`

> **测试数据文件**：`test-files/model-prices/model-list.yaml`（2 条记录：`(deepseek, deepseek-v3, chat)`、`(openai, gpt-4o, chat)`），供 MP-I-03 / MP-I-05 导入验证使用

### MP-I-01：YAML 解析预览

**功能模块**: YAML 导入  
**优先级**: P1  
**用例编号**: MP-I-01

#### 前置条件

- 已准备好合法的 YAML 内容（含 version、default_currency、models 数组，3 条以上记录）

#### 合法 YAML 示例

```yaml
version: "1.0"
default_currency: RMB
models:
  - provider: openai
    model: gpt-4
    base_model: gpt-4
    mode: chat
    capabilities: [chat, vision, tools]
    supported_parameters: [temperature, max_tokens, stream]
    limits:
      context_window: 8192
      max_output_tokens: 4096
    prices:
      input_cost_per_token: 0.00003
      output_cost_per_token: 0.00006
    metadata:
      source: https://openai.com/pricing
      notes: 官方定价
  - provider: openai
    model: text-embedding-3-small
    base_model: text-embedding-3
    mode: embedding
    prices:
      input_cost_per_token: 0.00000002
  - provider: anthropic
    model: claude-3-opus
    base_model: claude-3
    mode: chat
    prices:
      input_cost_per_token: 0.000015
      output_cost_per_token: 0.000075
```

#### 测试步骤

1. 进入模型定价列表页
2. 点击「YAML 导入」按钮，打开导入弹窗
3. 在 YAML 输入框中粘贴上述合法 YAML 内容
4. 点击「解析预览」（或自动解析）

#### 预期结果

1. YAML 解析成功，无报错
2. 预览区域展示解析后的记录列表，共 3 条
3. 每条记录的字段值与 YAML 中填写的一致（provider、model、mode、prices 等）
4. 预览可显示总记录数（3 条）、默认货币（RMB）、版本号（1.0）

---

### MP-I-02：YAML 校验失败提示

**功能模块**: YAML 导入  
**优先级**: P0  
**用例编号**: MP-I-02

#### 前置条件

- 打开 YAML 导入弹窗

#### 测试步骤

（分组验证，建议拆为多个子用例）

**子用例 1：YAML 语法错误**

1. 在 YAML 输入框中粘贴格式错误的 YAML（如缩进错误、冒号缺失）：

```yaml
version "1.0"
models:
  - provider: openai
     model: gpt-4
```

2. 点击「解析预览」或提交

**预期**：解析失败，显示明确的语法错误提示（含行号或大致位置），无法提交。

**子用例 2：必填字段缺失**

1. 粘贴合法 YAML 结构，但某条记录缺少 `mode` 字段：

```yaml
version: "1.0"
default_currency: RMB
models:
  - provider: openai
    model: gpt-4
    base_model: gpt-4
    prices:
      input_cost_per_token: 0.00003
```

2. 点击「解析预览」或提交

**预期**：校验失败，提示第 1 条记录缺少必填字段 `mode`（或等效文案），无法提交。

**子用例 3：prices 为空对象**

1. 粘贴 YAML，其中某条记录的 prices 为空对象 `{}`
2. 点击「解析预览」或提交

**预期**：校验失败，提示该条记录的 prices 至少包含一个价格字段。

**子用例 4：(provider, model, mode) 重复**

1. 粘贴 YAML，其中 2 条记录的 (provider, model, mode) 完全相同
2. 点击「解析预览」或提交

**预期**：校验失败，提示存在重复的三元组组合。

**子用例 5：default_currency 非 RMB**

1. 粘贴合法 YAML，但 `default_currency` 设为 `USD`（接口仅支持 `RMB`）
2. 点击「解析预览」或提交

**预期**：校验失败，提示 `default_currency` 必须为 `RMB`（对应接口校验：`default_currency` 必须为 `RMB`）。

**子用例 6：version 缺失 / 非法**

1. 粘贴 YAML，缺少顶层 `version` 字段（或 `version` 非法）
2. 点击「解析预览」或提交

**预期**：校验失败，提示 `version` 必填 / 格式非法（对应接口处理逻辑第 1 步：解析 YAML 并校验 `version`、`default_currency`）。

**子用例 7：非 YAML 文件 / 非 YAML 内容**

1. 若 UI 为文件上传控件：选择非 YAML 扩展名的文件（如 `.txt` / `.json`）并提交
2. 若 UI 为文本粘贴：粘贴非 YAML 内容（如纯 JSON）
3. 点击「解析预览」或提交

**预期**：校验失败，提示仅接受 YAML 文件 / YAML 内容（对应接口校验规则：`/model-prices/import` 仅接受 YAML 文件）。

#### 整体预期

- 所有校验失败场景下，「导入」按钮不可点击或点击后给出错误列表
- 错误信息具体、可定位（指明第几条记录、哪个字段、什么错误）
- 修改错误后可重新解析并通过校验

---

### MP-I-03：YAML 批量导入成功（replace 模式）

**功能模块**: YAML 导入  
**优先级**: P0  
**用例编号**: MP-I-03

#### 前置条件

- 列表中原有 5 条记录（可通过 API 或 UI 预置）；测试数据使用 `test-files/model-prices/model-list.yaml`（2 条记录）

#### 测试步骤

1. 进入模型定价列表页，记录当前列表的总条数（应为 5 条）
2. 点击「YAML 导入」按钮打开弹窗
3. 模式选择 `replace`（默认，确认当前选中）
4. 粘贴（或选择）`test-files/model-prices/model-list.yaml` 中的 YAML（2 条记录）
5. 解析预览通过后，点击「导入」
6. 确认二次提示（如有）
7. 导入完成后关闭弹窗，查看列表

#### 预期结果

1. 调用 `POST /model-prices/import`，请求体中 `mode: "replace"`，YAML 内容正确
2. 接口返回 200，返回体 `imported_count = 2`，`skipped_count = 0`，`errors = []`
3. 列表刷新后，总记录数为 **2 条**（replace 模式先清空原有 5 条，再导入 2 条；**以列表实际条数断言为准**）
4. 列表中的记录与 YAML 中定义的 2 条完全一致（provider、model、mode、prices 等字段值匹配）：`(deepseek, deepseek-v3, chat)`、`(openai, gpt-4o, chat)`
5. 页面显示成功提示（如「导入成功，共导入 2 条」）

---

### MP-I-04：YAML 导入取消 / 关闭

**功能模块**: YAML 导入  
**优先级**: P1  
**用例编号**: MP-I-04

#### 前置条件

- 列表中存在若干记录；打开 YAML 导入弹窗并粘贴了合法 YAML

#### 测试步骤

1. 进入模型定价列表页
2. 点击「YAML 导入」打开弹窗
3. 粘贴合法 YAML，解析预览成功
4. 点击「取消」按钮（或弹窗右上角关闭按钮）
5. 观察弹窗状态与列表数据

#### 预期结果

1. 弹窗关闭
2. 不调用 `POST /model-prices/import` 接口
3. 列表数据未变化（总条数与记录内容均与导入前一致）
4. 再次打开导入弹窗时，YAML 输入框为空（或保留上次内容，以产品设计为准；若保留则需确认不会误导入）

---

### MP-I-05：merge 模式导入（增量合并）

**功能模块**: YAML 导入  
**优先级**: P0  
**用例编号**: MP-I-05

#### 前置条件

- 列表中已有 1 条记录：`(deepseek, deepseek-v3, chat)`，价格与 YAML 中不同（如 `input_cost_per_token = 0.000001`）；测试数据使用 `test-files/model-prices/model-list.yaml`（2 条记录）

#### 待导入 YAML（2 条记录，其中 1 条已有被更新，1 条新增）

> 内容与 `test-files/model-prices/model-list.yaml` 一致：

```yaml
version: v1.0
default_currency: RMB
models:
  - provider: deepseek
    model: deepseek-v3
    base_model: deepseek-v3
    mode: chat
    prices:
      input_cost_per_token: 0.000002
      output_cost_per_token: 0.000008
  - provider: openai
    model: gpt-4o
    base_model: gpt-4o
    mode: chat
    prices:
      input_cost_per_token: 0.0000216
      output_cost_per_token: 0.000108
```

#### 测试步骤

1. 进入模型定价列表页，记录当前记录数（1 条）
2. 点击「YAML 导入」打开弹窗
3. 模式选择 `merge`
4. 粘贴（或选择）`test-files/model-prices/model-list.yaml` 的 YAML，解析预览通过
5. 点击「导入」
6. 导入完成后查看列表

#### 预期结果

1. 调用 `POST /model-prices/import`，请求体中 `mode: "merge"`
2. 接口返回 200，`imported_count = 2`（`deepseek-v3` 更新 1 条 + `gpt-4o` 新增 1 条），`skipped_count = 0`，`errors = []`
3. 列表总记录数变为 **2 条**（原有 1 条 `deepseek-v3` 被更新 + 新增 1 条 `gpt-4o`；**以列表实际条数断言为准**）
4. 原有 `(deepseek, deepseek-v3, chat)` 记录的价格等字段已更新为 YAML 中的新值（`input_cost_per_token = 0.000002`）
5. 新增的 `(openai, gpt-4o, chat)` 出现在列表中
6. 列表中除上述 2 条外无其他记录

---

### MP-I-06：重复记录导入处理

**功能模块**: YAML 导入  
**优先级**: P0  
**用例编号**: MP-I-06

#### 前置条件

- 列表中已有 1 条记录：(openai, gpt-4, chat)，价格为 `input_cost_per_token = 0.00003`

#### 待导入 YAML（1 条重复记录，价格不同）

```yaml
version: "1.0"
default_currency: RMB
models:
  - provider: openai
    model: gpt-4
    base_model: gpt-4
    mode: chat
    prices:
      input_cost_per_token: 0.00005
      output_cost_per_token: 0.0001
```

#### 测试步骤 A：replace 模式

1. 打开导入弹窗，模式选择 `replace`
2. 粘贴上述 YAML（仅 1 条记录）
3. 点击「导入」并确认
4. 查看列表

**预期 A**：

1. 导入成功，列表中仅剩 1 条记录（原 1 条 + 导入 1 条 → replace 后只剩导入的 1 条）
2. 该记录的 prices 为新值 `input_cost_per_token = 0.00005, output_cost_per_token = 0.0001`
3. `imported_count = 1`，`skipped_count = 0`

#### 测试步骤 B：merge 模式

1. 先恢复列表至初始状态（1 条旧记录，价格 0.00003）
2. 打开导入弹窗，模式选择 `merge`
3. 粘贴上述 YAML
4. 点击「导入」
5. 查看列表

**预期 B**：

1. 导入成功，列表中仍为 1 条记录（三元组相同，被覆盖更新）
2. 该记录的 prices 已更新为新值 `0.00005 / 0.0001`
3. `imported_count = 1`（更新 1 条），`skipped_count = 0`，`errors = []`

#### 测试步骤 C：merge 模式 + skip_duplicates 选项（若 UI 支持）

> 注：若产品支持「遇到重复时跳过」选项，则增加此子用例；若无则跳过。

1. 恢复初始数据
2. merge 模式下勾选「重复记录跳过」
3. 导入相同 YAML

**预期 C**：

1. 导入后记录的价格仍为旧值 `0.00003`，未被覆盖
2. `skipped_count = 1`，`imported_count = 0`

---

*文档版本: v0.1*  
*最后更新: 2026-08-14*
