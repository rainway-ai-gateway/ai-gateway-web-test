# AI 网关 UI 自动化 — 全量回归报告

> **本文件是 2026-11-12 全量回归的归档快照**，受版本控制、可长期引用，是"用例是否 100% 跑通"的**唯一权威出口**。
> 全量回归报告按日期归档在 `regression-reports/`（`TEST-REPORT-YYYY-MM-DD.md`，同日多次回归追加 `-HHmmss`）；每份报告只记录本轮结果，不汇总历史全量记录。
> 与之并存的是 `report/test-report*.md`：那是**每轮**（含定向批次）的人读报告，落在被 `.gitignore` 忽略的 `report/` 下，**可被清理、不可寻址**。
> 更新方式、判定口径与维护约定见文末；已归档的历史报告只读不改。

**本轮运行**：2026-11-12 09:25:47（**全量**回归，耗时 3h34m41s）

**运行命令**：

```bash
PW_WORKERS=1 npx playwright test tests/ --global-timeout=0
```

**测试环境**：http://localhost:8180/login

**Playwright**：1.61.1

**覆盖度**：161 / 161 个常规 spec（与磁盘 spec 全集一致，属**全量回归**）

## 1. 总体

| 指标 | 数值 |
|---|---|
| 用例总数 | 1241 |
| 通过 | 1241 |
| 失败 | 0 |
| 跳过 | 0 |
| 通过率（通过 / 总数） | 100.00% |
| **判定** | ✅ **100% 跑通**（无失败、无跳过） |

## 2. 按模块

| 模块 | spec 数 | 用例数 | 通过 | 失败 | 跳过 | 状态 |
|---|---|---|---|---|---|---|
| 操作日志 | 3 | 21 | 21 | 0 | 0 | ✅ |
| 流量镜像规则 | 9 | 81 | 81 | 0 | 0 | ✅ |
| 路由管理 | 16 | 111 | 111 | 0 | 0 | ✅ |
| 密钥收敛 | 6 | 37 | 37 | 0 | 0 | ✅ |
| 模型定价 | 10 | 68 | 68 | 0 | 0 | ✅ |
| 模型服务商 | 10 | 121 | 121 | 0 | 0 | ✅ |
| 批量任务 | 4 | 30 | 30 | 0 | 0 | ✅ |
| 数据报表 | 9 | 110 | 110 | 0 | 0 | ✅ |
| 意图配置 | 8 | 77 | 77 | 0 | 0 | ✅ |
| 用户管理 | 13 | 70 | 70 | 0 | 0 | ✅ |
| AI 缓存规则 | 8 | 91 | 91 | 0 | 0 | ✅ |
| AI 上下文压缩 | 8 | 80 | 80 | 0 | 0 | ✅ |
| AI 业务集群 | 22 | 122 | 122 | 0 | 0 | ✅ |
| API-Key 管理 | 9 | 76 | 76 | 0 | 0 | ✅ |
| Entity 类型管理 | 6 | 26 | 26 | 0 | 0 | ✅ |
| Entity 组织管理 | 15 | 102 | 102 | 0 | 0 | ✅ |
| EPP 实例池与调度 | 5 | 18 | 18 | 0 | 0 | ✅ |
| **合计** | **161** | **1241** | **1241** | **0** | **0** | ✅ |

## 3. 按 spec 明细

| 模块 | spec | 用例数 | 通过 | 失败 | 跳过 | 状态 |
|---|---|---|---|---|---|---|
| AI 缓存规则 | `tests/ai-cache/test_01_ai_cache_list.spec.js` | 19 | 19 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_02_ai_cache_upsert.spec.js` | 20 | 20 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_03_ai_cache_view_delete.spec.js` | 15 | 15 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_04_ai_cache_validation.spec.js` | 13 | 13 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_05_ai_cache_semantic.spec.js` | 12 | 12 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_06_ai_cache_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_07_ai_cache_drag_leave.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| AI 缓存规则 | `tests/ai-cache/test_08_ai_cache_layout_max_length.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_01_ai_context_list.spec.js` | 18 | 18 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_02_ai_context_upsert.spec.js` | 12 | 12 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_03_ai_context_view_delete.spec.js` | 12 | 12 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_04_ai_context_validation.spec.js` | 8 | 8 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_05_ai_context_settings.spec.js` | 18 | 18 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_06_ai_context_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_07_ai_context_drag_leave.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| AI 上下文压缩 | `tests/ai-context/test_08_ai_context_concurrency.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_01_api_key_create.spec.js` | 29 | 29 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_02_api_key_search_edit_delete.spec.js` | 13 | 13 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_03_api_key_rate_limit_fields.spec.js` | 19 | 19 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_04_api_key_rate_limit_duplicate.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_05_api_key_display_consistency.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_06_api_key_readonly.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_07_api_key_rule_name_policy.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_08_api_key_quota_filter_and_models.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| API-Key 管理 | `tests/api-key/test_09_api_key_scenario_chain.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 批量任务 | `tests/batch-tasks/test_01_batch_task_list.spec.js` | 13 | 13 | 0 | 0 | ✅ |
| 批量任务 | `tests/batch-tasks/test_02_batch_task_detail.spec.js` | 8 | 8 | 0 | 0 | ✅ |
| 批量任务 | `tests/batch-tasks/test_03_batch_task_cancel.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| 批量任务 | `tests/batch-tasks/test_04_batch_task_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_01_business_cluster_list.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_02_business_cluster_wizard.spec.js` | 10 | 10 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_03_business_cluster_crud.spec.js` | 14 | 14 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_05_business_cluster_field_validation.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_06_business_cluster_model.spec.js` | 10 | 10 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_07_business_cluster_key_policy.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_08_business_cluster_key_affinity.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_09_business_cluster_balance_mode.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_10_business_cluster_readonly.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_11_business_cluster_conditional_field_reflow.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_12_business_cluster_normalize_upstream_error.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_13_business_cluster_provider_switch_journey.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_14_business_cluster_full_journey.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_15_business_cluster_interaction_and_guard.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_16_business_cluster_concurrency.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_17_business_cluster_epp_runtime.spec.js` | 8 | 8 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_18_business_cluster_enhanced_journey.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_19_business_cluster_edge_interactions.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_20_business_cluster_epp_call_timeout_vs_queue_ttl.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_21_business_cluster_price_miss_action.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_22_business_cluster_ensure_reasoning_content.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| AI 业务集群 | `tests/cluster/test_23_business_cluster_key_penalty_ttl.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_01_entity_org_list.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_02_entity_org_create_quota.spec.js` | 20 | 20 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_03_entity_org_create_rate_limit.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_04_entity_org_search_edit_delete.spec.js` | 15 | 15 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_05_entity_full_journey.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_06_entity_rate_limit_fields.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_07_page_table_interaction.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_08_entity_org_display_consistency.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_09_entity_name_and_rate_limit_duplicate.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_10_entity_description.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_11_entity_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_12_entity_model_scope.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_13_entity_quota_reset_and_level_filter.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_14_entity_rate_limit_model_and_validation.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| Entity 组织管理 | `tests/entity-management/test_15_entity_layout_max_length.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| Entity 类型管理 | `tests/entity-type/test_01_entity_type_main.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| Entity 类型管理 | `tests/entity-type/test_02_entity_type_edit.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| Entity 类型管理 | `tests/entity-type/test_03_entity_type_delete.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| Entity 类型管理 | `tests/entity-type/test_04_entity_type_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| Entity 类型管理 | `tests/entity-type/test_05_entity_type_description_and_level_filter.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| Entity 类型管理 | `tests/entity-type/test_06_entity_type_layout_max_length.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| EPP 实例池与调度 | `tests/epp-pool/test_01_epp_pool.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| EPP 实例池与调度 | `tests/epp-pool/test_02_epp_assignments.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| EPP 实例池与调度 | `tests/epp-pool/test_03_epp_pool_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| EPP 实例池与调度 | `tests/epp-pool/test_04_epp_cluster_assignment_lifecycle.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| EPP 实例池与调度 | `tests/epp-pool/test_05_epp_pool_instance_validation.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_01_intent_config_global_mode.spec.js` | 18 | 18 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_02_intent_question_form.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_03_intent_question_view.spec.js` | 8 | 8 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_04_intent_config_publish.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_05_intent_field_validation.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_06_intent_config_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_07_intent_config_leave_guard.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 意图配置 | `tests/intent-config/test_08_intent_edit_delete_publish.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_01_model_price_list.spec.js` | 8 | 8 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_02_model_price_crud.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_03_model_price_validation.spec.js` | 18 | 18 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_04_model_price_detail.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_05_model_price_import.spec.js` | 15 | 15 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_06_model_price_tier.spec.js` | 10 | 10 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_07_model_price_linkage.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_08_model_price_scenario_chain.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_08_model_price_sci_and_merge.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 模型定价 | `tests/model-prices/test_09_model_price_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 操作日志 | `tests/operation-logs/test_01_operation_log_list.spec.js` | 13 | 13 | 0 | 0 | ✅ |
| 操作日志 | `tests/operation-logs/test_02_operation_log_detail.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 操作日志 | `tests/operation-logs/test_03_operation_log_linkage.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_01_provider_list.spec.js` | 13 | 13 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_02_provider_upsert.spec.js` | 35 | 35 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_03_provider_detail.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_04_provider_pricing_tiers.spec.js` | 12 | 12 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_05_provider_delete.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_06_provider_validation.spec.js` | 34 | 34 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_07_provider_linkage.spec.js` | 8 | 8 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_08_provider_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_09_provider_layout_max_length.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 模型服务商 | `tests/providers/test_10_provider_scenario_chains.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 密钥收敛 | `tests/reencrypt-sweep/test_01_reencrypt_sweep_trigger.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| 密钥收敛 | `tests/reencrypt-sweep/test_02_reencrypt_sweep_list.spec.js` | 11 | 11 | 0 | 0 | ✅ |
| 密钥收敛 | `tests/reencrypt-sweep/test_03_reencrypt_sweep_polling.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 密钥收敛 | `tests/reencrypt-sweep/test_04_reencrypt_sweep_detail.spec.js` | 9 | 9 | 0 | 0 | ✅ |
| 密钥收敛 | `tests/reencrypt-sweep/test_05_reencrypt_sweep_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 密钥收敛 | `tests/reencrypt-sweep/test_06_reencrypt_sweep_trigger_failure.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_01_report_overview.spec.js` | 22 | 22 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_02_report_logs.spec.js` | 21 | 21 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_03_report_detail.spec.js` | 9 | 9 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_04_report_filters.spec.js` | 9 | 9 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_05_report_timeseries_cache_tokens.spec.js` | 14 | 14 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_06_report_rankings_distribution.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_07_report_validation_gating.spec.js` | 15 | 15 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_08_report_keyword_search.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 数据报表 | `tests/report/test_09_report_price_miss.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_01_route_cross_module.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_02_route_error_edge.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_03_route_rule_detail.spec.js` | 12 | 12 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_04_route_rule_edit.spec.js` | 15 | 15 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_05_route_rule_validation.spec.js` | 24 | 24 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_06_route_table_list.spec.js` | 16 | 16 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_07_route_target_model_dedup.spec.js` | 11 | 11 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_08_route_expression_body_size.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_09_route_table_default_filter.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_10_route_rule_copy.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_11_route_rule_drag_reorder.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_12_route_rule_submit_disabled.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_13_route_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_14_route_expression_primitive_panel.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_15_route_layout_max_length.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 路由管理 | `tests/route/test_16_route_scenario_chain.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_01_traffic_mirror_rule_list.spec.js` | 18 | 18 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_02_traffic_mirror_rule_upsert.spec.js` | 19 | 19 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_03_traffic_mirror_rule_validation.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_04_traffic_mirror_rule_view_delete.spec.js` | 9 | 9 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_05_traffic_mirror_rule_delete.spec.js` | 5 | 5 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_06_traffic_mirror_rule_readonly.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_07_traffic_mirror_drag_leave.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_08_traffic_mirror_list_p2.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 流量镜像规则 | `tests/traffic-mirror/test_09_traffic_mirror_layout_max_length.spec.js` | 1 | 1 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_01_user_manage_main.spec.js` | 4 | 4 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_02_user_add.spec.js` | 7 | 7 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_03_user_password.spec.js` | 9 | 9 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_04_user_delete.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_05_token_manage.spec.js` | 11 | 11 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_06_login_auth.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_07_user_format_validation.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_08_user_token_format_validation.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_09_logout.spec.js` | 2 | 2 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_10_role_readonly.spec.js` | 6 | 6 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_11_readonly_sweep.spec.js` | 17 | 17 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_12_user_password_effect_and_self_delete.spec.js` | 3 | 3 | 0 | 0 | ✅ |
| 用户管理 | `tests/user/test_13_user_scenario_chain.spec.js` | 1 | 1 | 0 | 0 | ✅ |

## 4. 失败明细

本轮无失败。

## 5. 跳过明细

本轮无跳过。

## 6. 维护约定

1. **跑全量**：

```bash
PW_WORKERS=1 npx playwright test tests/ --global-timeout=0
```

2. **生成本次归档报告**：

```bash
npm run report:tracked
```

   脚本只在「本轮覆盖了全部常规 spec」时写入 `regression-reports/TEST-REPORT-<运行日期>.md`（定向批次不会覆盖全站结论）；同一天第二次全量回归会自动追加 `-HHmmss`，不覆盖已有归档；需要另存时用 `--out <path>`。每份报告只记录本轮结果，不汇总历史全量记录。
3. **有失败 → 修到 100%**：修完先重跑受影响 spec，**再跑一次全量**并重新生成，直到第 1 节判定为 ✅。
4. **跳过要签核**：`skipped > 0` 时，未在 `scripts/accepted-skips.json` 登记的跳过会把判定降级为 ⚠️；确属环境/产品行为依赖（非用例遗漏）的，登记 `spec`/`caseId`/`reason`/`evidence`/`confirmedBy`/`confirmedAt` 后重新生成即升为 ✅，第 5 节会列出逐条依据。**禁止为了好看而登记**。
5. **提交**：本次归档与相关 spec/文档改动**一起提交**，让"当前通过状态"随代码一起被版本控制；已归档的历史报告只读不改。

