# FOFA 六步流程最小实现说明

## 目标
基于已有 FOFA 导出 CSV 样本，提供可测试、可运行的六步资产测绘最小流程：

1. 目标发现（读取 CSV）
2. 范围收敛（按 ip:port 去重并限制 maxTargets）
3. Naabu 验活（过滤无效资产）
4. Nmap 指纹提取（HTTP title / TLS subject / API path）
5. 指纹匹配与置信度计算（ollama 最小规则）
6. 风险研判（输出 low/medium/high/critical）

## 脚本入口
- `npm run run:fofa:six-step:minimal -- --csv tests/fixtures/fofa/ollama_test.csv --maxTargets 20 --output /tmp/fofa-six-step-minimal.json`

## 输出契约（最小）
输出 JSON 包含：
- `output_standard`: `资产测绘_指纹整理.v1-minimal`
- `summary`: 六步关键统计字段
- `assets`: 命中资产列表（含指纹、置信度、风险等级、原始证据）

## 备注
- 在真实网络环境中，`step2_live_targets` 可能为 0（由目标可达性、端口状态和超时策略决定）。
- 该实现为最小模型，后续可扩展多指纹规则与更细粒度风险策略。
