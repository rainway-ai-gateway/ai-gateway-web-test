[← 返回索引](./00-索引与映射.md)

## 2. 时序与缓存 Token

### RP-T-01：缓存 Token 时序图渲染

**功能模块**: 时序与缓存 Token  
**优先级**: P0  
**用例编号**: RP-T-01  
**设计依据**: `report.md` §2.2（`metric=cache_tokens`）；`Overview.vue` `cacheTokensOption` 与模板 `report.cacheTokensTimeseries` 图表卡

#### 前置条件

- 总览已加载成功（`overviewData` 非空，`loading=false`）
- `report/timeseries?metric=cache_tokens` 返回 200，且 `Data.series` 非空（聚合表 `cache_read_tokens` / `cache_write_tokens` 在窗口内有数据）
- 默认时间窗口为近 1 小时

#### 测试步骤

1. 进入「数据报表」页面，停留在「总览」页签
2. 滚动到图表区，定位「状态码分布」右侧的「缓存 Token 时序」图表卡（二者同处 2 列栅格同一行）
3. 观察图表标题与图表内容

#### 预期结果

1. 图表卡标题为「缓存 Token 时序（cache_read / cache_write）」（i18n `report.cacheTokensTimeseries`）
2. `timeseriesData.cache_tokens.series` 非空时 `cacheTokensOption.series` 有值，图表卡内渲染 `Echarts` 折线图
3. 折线样式为 `smooth: true`、`symbol: 'none'`；图例位于底部（`chartOptionsLine` 的 `legend.bottom = 0`）
4. y 轴 `name` 为 `tokens`；x 轴为时间分类轴，标签由 `formatTs(time)` 格式化为 `yyyy-MM-dd HH:mm:ss`
5. 页面无 JS / ECharts 报错

---

### RP-T-02：读写双序列展示

**功能模块**: 时序与缓存 Token  
**优先级**: P0  
**用例编号**: RP-T-02  
**设计依据**: `report.md` §2.2（`cache_tokens` 按 `kind` 分 `cache_read` / `cache_write` 两条序列）；`Overview.vue` `cacheTokensOption` 的 `readMap` / `writeMap` 拆分

#### 前置条件

- `report/timeseries?metric=cache_tokens` 返回的 `series` 中同时含 `kind = cache_read` 与 `kind = cache_write` 的数据点

#### 测试步骤

1. 打开总览页「缓存 Token 时序」图表
2. 观察图中折线数量与图例
3. 将鼠标悬停在同一时间点上，查看 tooltip 中的各序列值

#### 预期结果

1. 图表绘制两条折线序列，序列名分别为 `cache_read` 与 `cache_write`
2. 数据点按 `kind` 拆分：`kind='cache_read'` 的点进入 `readMap`，`kind='cache_write'` 的点进入 `writeMap`
3. tooltip 以 axis 触发，同一时间点并列展示 `cache_read` / `cache_write` 两个值
4. 未出现的 `kind` 不产生序列（如窗口内只有 `cache_read` 数据，则仅渲染一条 `cache_read` 序列）

---

### RP-T-03：缓存时序图图例

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-03  
**设计依据**: `Overview.vue` `chartOptionsLine` 中 `legend: { data: seriesArr.map(s => s.name), bottom: 0 }`

#### 前置条件

- 缓存 Token 时序图已渲染（`cacheTokensOption.series` 非空）

#### 测试步骤

1. 观察「缓存 Token 时序」图表底部区域
2. 依次点击图例 `cache_read`、`cache_write`
3. 再次点击还原

#### 预期结果

1. 图例位于图表底部（`bottom: 0`），条目为 `cache_read`、`cache_write`
2. 图例名称与序列 `name` 一一对应（`seriesArr.map(s => s.name)`）
3. 点击图例可切换对应序列的显示 / 隐藏（ECharts 默认交互），不影响另一条序列

---

### RP-T-04：时间桶对齐与去重排序

**功能模块**: 时序与缓存 Token  
**优先级**: P0  
**用例编号**: RP-T-04  
**设计依据**: `Overview.vue` `cacheTokensOption` 中 `times` 去重（`indexOf(p.time) === -1`）与 `times.sort((a, b) => a - b)`

#### 前置条件

- `series` 中存在同一 `time` 分别对应 `cache_read` 与 `cache_write` 的点（时间桶重复）

#### 测试步骤

1. 打开缓存 Token 时序图
2. 观察 x 轴刻度数量与排列顺序
3. 与接口 `series` 中出现的 `time` 集合比对

#### 预期结果

1. x 轴时间桶经去重处理：同一 `time` 在 x 轴仅出现一次
2. x 轴时间桶按升序排列（`times.sort((a, b) => a - b)`）
3. 每条序列按对齐后的时间桶取值，同一时间点的 `cache_read` / `cache_write` 落在同一 x 位置
4. `bucket_sec` 由服务端返回（近 1 小时窗口为 `60` 秒；≤3d 为 `300`，≤7d 为 `1800`），前端不做二次分桶

---

### RP-T-05：缺失数据点占位

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-05  
**设计依据**: `Overview.vue` `cacheTokensOption` 中 `readMap[t] != null ? readMap[t] : '-'`（写序列同理）

#### 前置条件

- `series` 中某时间桶只有 `cache_read`（或只有 `cache_write`）的数据点，另一序列在该时间桶缺失

#### 测试步骤

1. 打开缓存 Token 时序图
2. 定位仅存在单序列值的时间点
3. 悬停该时间点，查看 tooltip

#### 预期结果

1. 缺失的时间桶使用占位符 `'-'` 填充，而不是补 `0`
2. 该时间点 tooltip 中缺失序列显示 `-`，已有序列显示实际数值
3. 折线在占位点处按 ECharts 对非数值项的默认处理断开 / 跳过，不连成误导性的直线

---

### RP-T-06：请求缓存 Token 指标参数

**功能模块**: 时序与缓存 Token  
**优先级**: P0  
**用例编号**: RP-T-06  
**设计依据**: `report.md` §2.2（`metric` 合法枚举含 `cache_tokens`；值按 `kind` 分序列）；`Overview.vue` `load()` 中第 5 个并发请求

#### 前置条件

- 打开总览页；浏览器 DevTools Network 面板已打开

#### 测试步骤

1. 总览加载后，在 Network 中筛选 `report/timeseries`
2. 查看 `metric=cache_tokens` 请求的 URL 与 Query 参数
3. 查看该请求的响应体 JSON

#### 预期结果

1. 请求为 `GET report/timeseries`，Query 含 `metric=cache_tokens`，并与其他图表一致携带 `start` / `end`（及已选的 `models` / `apikey_ids` / `providers` / `hosts` / `stream` / `status_codes`）
2. 该请求与 `metric=qps` / `tokens` / `latency` 在 `load()` 的 `Promise.all` 中并发发起，窗口参数一致
3. 响应 `Data` 形如 `{"bucket_sec": 60, "series": [{"time": <unix秒>, "kind": "cache_read"|"cache_write", "value": <个/秒>}]}`
4. `metric=cache_tokens` 属于接口合法枚举（`qps` / `tokens` / `latency` / `ttft` / `tpot` / `cost` / `cache_tokens`），返回 200

---

### RP-T-07：缓存时序无数据空态

**功能模块**: 时序与缓存 Token  
**优先级**: P2  
**用例编号**: RP-T-07  
**设计依据**: `Overview.vue` 模板 `v-if="cacheTokensOption.series"` 否则渲染 `.chart-empty`；i18n `report.noData`

#### 前置条件

- `report/timeseries?metric=cache_tokens` 返回 200，但 `Data.series` 为空数组（窗口内聚合表无缓存 Token 数据）

#### 测试步骤

1. 打开总览页（窗口内无缓存 Token 数据）
2. 定位「缓存 Token 时序」图表卡
3. 观察图表卡内容

#### 预期结果

1. `series` 为空时 `cacheTokensOption` 提前 `return {}`，不渲染 `Echarts`
2. 图表卡内显示空态占位 `.chart-empty`，文案为「暂无数据」（i18n `report.noData`）
3. 其余图表按各自数据独立渲染，不受影响
4. 页面无 JS 报错

---

### RP-T-08：缓存时序失败不影响其他图表

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-08  
**设计依据**: `Overview.vue` `load()`（仅 `cacheTokensRes.status === 200` 才赋值 `tsData.cache_tokens`）；`utils/request.js` 响应拦截器（非 2xx 返回 `error.response` 而非 reject）

#### 前置条件

- 打开总览页；可使 `report/timeseries?metric=cache_tokens` 单请求返回非 200（如注入 500），其余请求正常

#### 测试步骤

1. 制造 `metric=cache_tokens` 请求失败（其余 7 个请求正常）
2. 观察页面错误提示与各图表渲染结果
3. 查看 Network 中其余请求的状态码

#### 预期结果

1. `cacheTokensRes.status !== 200`，`tsData.cache_tokens` 不赋值 → 缓存 Token 图显示空态（`.chart-empty` → `report.noData`）
2. 响应拦截器返回 `error.response`（未 reject），`Promise.all` 继续执行 `.then`，`qps` / `tokens` / `latency` / 模型排行 / 服务商分布 / 状态码分布照常渲染
3. 失败请求未携带 `unneedTips`，响应拦截器弹出 `$Notice` 错误通知（title / content 取自响应体 `ErrMsg`）
4. `overviewData` 等已成功返回的数据保留，页面不整体崩溃，`loading` 在 `finally` 中复位为 `false`

---

### RP-T-09：拆分维度控件展示与默认值

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-09  
**设计依据**: [ui-code-changes.md（2026-10-14 图表维度下钻）](../../../../ai-gateway-web/design-docs/modifications/2026-10-14-report-dimension-drilldown/ui-code-changes.md) §1 / §3 / §7-4；`index.vue` 过滤栏行尾「拆分维度」选择器（`tsSplit` 状态，状态码之后、查询按钮之前）；时序图区 `.ts-split-bar` 独占行已移除

#### 前置条件

- 以系统管理员登录并进入「数据报表」页面「总览」页签
- 过滤栏已渲染（时间范围 + 6 个通用过滤项 + 查询 / 重置按钮）

#### 测试步骤

1. 观察总览过滤栏行尾（「状态码」输入框之后、「查询」按钮之前）的控件
2. 展开「拆分维度」下拉，列出全部选项
3. 观察时序图区（QPS / Token / 延迟 / 缓存 Token 四张时序图上方）是否存在独立的拆分维度工具行

#### 预期结果

1. 过滤栏行尾存在「拆分维度」选择器（i18n `report.tsSplitDim` 标签），位置在「状态码」之后、「查询」按钮之前
2. 下拉共 4 个选项：**不分维度（默认选中）** / 缓存状态 / 镜像命中 / 意图答案；默认态选择器头部展示「不分维度」（`index.vue` 已补 `:placeholder="$t('report.tsSplitNone')"`；值为 `''` 的选项在 iView 下拉列表中不带选中样式，默认态以头部文案 + `tsSplit === ''` 判定）
3. 默认态下三张时序图（QPS / Token / 延迟）为单序列渲染，与变更前一致
4. 时序图区**无** `.ts-split-bar` 独占工具行（该控件已从时序图区移入过滤栏，两端样式与即时联动逻辑均已移除）

---

### RP-T-10：拆分维度随查询生效（行为一致性）

**功能模块**: 时序与缓存 Token  
**优先级**: P0  
**用例编号**: RP-T-10  
**设计依据**: ui-code-changes.md（2026-10-14）§7-4：「拆分维度」与过滤栏其他控件行为一致——选中后需点击「查询」才生效；`applyFilters()` / `onTabChange()` 时经 `overview.load(params, tsSplit)` 传入并联动 QPS / Token / 延迟三张时序图

#### 前置条件

- 总览页三张时序图（QPS / Token / 延迟）已按默认条件加载为单序列
- 浏览器 DevTools Network 面板已打开

#### 测试步骤

1. 将「拆分维度」由「不分维度」切换为「缓存状态」，**不点击「查询」**
2. 观察三张时序图与 Network 面板
3. 点击「查询」按钮
4. 观察三张时序图与 Network 面板

#### 预期结果

1. 仅切换「拆分维度」时**不立即生效**：三张时序图保持现状（单序列、数值不变），Network 中**不发起**新的 `report/timeseries` 请求（切换仅更新 `tsSplit` 状态，经 `overview.setTsSplit` 联动，不触发整页查询）
2. 点击「查询」后，`metric=qps` / `tokens` / `latency` 三个请求重新发起，均携带 `dimension=ai_cache_status` 与当前过滤参数
3. 三张时序图按维度桶拆分为多序列渲染（拆分细节见 RP-T-11）
4. 该「变更 → 点查询生效」的行为与过滤栏其他控件（模型 / API Key / 服务商 / Host / 流式 / 状态码）完全一致

---

### RP-T-11：拆分维度为缓存状态的多序列渲染

**功能模块**: 时序与缓存 Token  
**优先级**: P0  
**用例编号**: RP-T-11  
**设计依据**: ui-code-changes.md（2026-10-14）§3（`splitSeriesByDim`：QPS 拆 value、Token 拆 input/output/total、延迟拆 avg/max）；`report.md` §2.2（带 `dimension` 时各点携带 `name` 区分序列；`latency` 带 dimension 时只返回 `avg` / `max`）

#### 前置条件

- 「拆分维度」已选「缓存状态」并点击「查询」
- 窗口内 `ai_cache_status` 存在 `hit` / `miss` / `skip` 桶数据

#### 测试步骤

1. 查看 QPS 时序图的序列数量、序列名与图例
2. 查看 Token 时序图的序列数量、序列名与图例
3. 查看延迟时序图的序列数量、序列名与图例
4. 对照三个请求的响应体 `series` 中各点的 `name` 与值字段

#### 预期结果

1. QPS 图按桶名拆序列：每个 `name`（`hit` / `miss` / `skip`）一条序列，图例为桶名
2. Token 图按「桶名 + 字段名」拆序列：图例形如 `hit 输入` / `hit 输出` / `hit 总量`（对应 `input` / `output` / `total` 值字段）
3. 延迟图只拆 `avg` / `max` 两个字段：图例为「桶名 + 字段名」，字段名取 i18n `report.avg` / `report.max`（形如 `hit 平均` / `hit 最大`，与非拆分态延迟图图例「平均 / 最大」一致）；接口带 `dimension` 时不返回分位数（p50 / p90 / p99），图上不出现分位数序列
4. 图例名称与响应体序列 `name` 一一对应，缺失数据点按占位规则处理（见 RP-T-05 同款语义）
5. 序列数值与接口返回一致，无前端二次按比例拆分

---

### RP-T-12：拆分维度为镜像命中的桶名归一

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-12  
**设计依据**: ui-code-changes.md（2026-10-14）§3（图例「桶名」展示）；`report.md` §2.3（`mirror_hit` 返回 `"0"` / `"1"` 桶）；分布侧空值归一 `unknown`（§2.4，对照 RP-R-07）

#### 前置条件

- 「拆分维度」已选「镜像命中」并点击「查询」
- 窗口内同时存在 `mirror_hit = true` 与 `false` 的记录；存在 `name` 为空串 `""` 的记录（老数据未镜像且字段缺省）

#### 测试步骤

1. 查看 QPS / Token / 延迟三张时序图的图例文案
2. 对照响应体 `series` 中各点的 `name` 取值
3. 定位 `name = ""` 的序列，查看其图例与数据展示

#### 预期结果

1. 接口返回 `name = "1"` 的序列图例显示「命中」，`name = "0"` 的序列图例显示「未命中」（不做 `"0"` / `"1"` 原样展示）
2. 图例映射与数值对应正确：`"1"` 序列的值即镜像命中请求数 / 速率
3. 空 `name`（`""`）的序列图例显示「未知」（与分布侧空值归一的语义对齐；分布侧按接口返回字面量 `unknown` 展示，两者归一来源不同）
4. 序列 / 图例顺序不属验收项：前端按维度桶名分组后按键顺序渲染，整数样键 `"0"` / `"1"` 排在字符串键 `""` 之前（实际为「未命中 / 命中 / 未知」），本用例只约束桶名映射与数值对应

---

### RP-T-13：重置清空拆分维度

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-13  
**设计依据**: ui-code-changes.md（2026-10-14）§4（`resetFilters` 时 `tsSplit` 同步清空）；§7-4（「重置」同步清空并重新查询）

#### 前置条件

- 「拆分维度」已选「缓存状态」并点击「查询」，三张时序图为多序列渲染

#### 测试步骤

1. 观察当前「拆分维度」选择器选中值与三张时序图的序列状态
2. 点击「重置」按钮
3. 观察「拆分维度」选择器、三张时序图与 Network 面板

#### 预期结果

1. 「拆分维度」选择器恢复为「不分维度」
2. 重置后自动重新查询（无需再点「查询」）：`metric=qps` / `tokens` / `latency` 三个请求重新发起且**不携带** `dimension` 参数
3. 三张时序图恢复单序列渲染，数值与默认窗口（近 1 小时）数据一致
4. 其余过滤项同步重置，行为见 RP-F-06

---

### RP-T-14：拆分维度作用范围

**功能模块**: 时序与缓存 Token  
**优先级**: P1  
**用例编号**: RP-T-14  
**设计依据**: ui-code-changes.md（2026-10-14）§7-2：拆分维度仅作用于 QPS / Token / 延迟三张图；缓存 Token 图保持 `cache_read` / `cache_write` 双序列不参与；`loadCharts` 传 dimension 不影响指标卡 / 排行 / 占比分布

#### 前置条件

- 总览页全部指标卡与图表已加载；窗口内缓存 Token 有 `cache_read` / `cache_write` 数据

#### 测试步骤

1. 将「拆分维度」切换为「意图答案」，点击「查询」
2. 观察「缓存 Token 时序」图表
3. 观察 8 张指标卡、排行图与两个饼图
4. 在 Network 中核对 `metric=cache_tokens` 请求及指标卡 / 排行 / 分布请求是否携带 `dimension`

#### 预期结果

1. 仅 QPS / Token / 延迟三张时序图携带 `dimension=ai_intent_answer` 并按维度拆分
2. 「缓存 Token 时序」图保持 `cache_read` / `cache_write` 双序列不变，其请求不携带 `dimension`，图表样式与数值与拆分前一致
3. 8 张指标卡取值不变（仍按通用过滤参数聚合）；排行图与其维度下拉、两个饼图与其维度下拉均不受「拆分维度」影响
4. 拆分维度与图表自身的维度下拉（排行 / 饼图）相互独立，互不联动

---