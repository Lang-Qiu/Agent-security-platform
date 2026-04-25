# Asset Scan Engine

## 引擎定位

`engines/asset-scan` 用于承载 Agent 资产测绘与指纹识别能力。

目标是识别目标资产的类型、框架、运行时、暴露入口与基础风险标签，为平台提供资产发现和初始风险视图。

## 输入与输出

输入：

- 任务信息 `Task`
- 目标信息 `TaskTarget`
- 扫描参数 `parameters`

输出：

- `AssetScanResult`

统一契约应以 `shared` 中的类型为准。

## 建议结构

```text
engines/asset-scan/
├─ src/          # 核心执行逻辑
├─ rules/        # 指纹规则、匹配规则、识别模板
└─ tests/        # 单元测试与样本测试
```

## 与平台后端的解耦方式

- 平台后端负责下发扫描任务，不内嵌资产识别规则。
- 本引擎独立维护识别逻辑、规则文件与测试样本。
- 输出只要求满足统一结果结构，平台不感知内部实现细节。

## 第一阶段建议

- 先支持最小输入目标，如 URL、仓库地址或样本目录。
- 优先实现基础指纹模型和样例结果输出。
- 在 `samples/assets` 中准备基础样本，供联调与测试使用。

## 最小探测原型配置
- Agent-security-platform\engines\asset-scan 目录下：pnpm add js-yaml node-fetch
- npx tsx src/runner.ts 运行脚本（目前固定 ollama 测试）
- 流程如下：
目标(target)
    ↓
执行探测（probe）
    ↓
得到响应数据（ProbeResult）
   ↓
匹配指纹规则（fingerprints.yaml）
   ↓
计算分数 + 分类
   ↓
输出 AssetScanResult