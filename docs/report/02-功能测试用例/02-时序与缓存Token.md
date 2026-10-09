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