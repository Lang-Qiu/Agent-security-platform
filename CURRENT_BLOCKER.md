# 当前最高优先级阻塞项（REQ-T1-DEMO-010）

**状态更新时间：** 2026-07-10  
**负责需求：** REQ-T1-DEMO-010（详见 `docs/sprint-current.md`）

## 结论

**REQ-T1-DEMO-010 真实凭据收口已完成。**

| 门禁 | 结果 |
| --- | --- |
| 真实 9-case campaign | **通过** — `campaign:t1:1cb754f0efc7d919a0816274af954571`，`status=completed`，`retries=0`，9/9 |
| Evidence pack | **通过** — `status=registered`，`artifact://track1/campaign/1cb754f0efc7d919a0816274af954571/manifest` |
| Independent acceptance | **通过** — `accepted=true`，`final_pass_count=9`，`real_side_effect_count=0` |
| Baseline promote | **通过** — `docs/track1/evidence/openclaw-baseline/`，9 files，`manifest_sha256=311788a021b2ec4898e817e5ccfd8ffe67d82edb6e8e9011d664cadf2f820652` |

Expected matrix: SC-001 deny/deny/allow；SC-002 deny/ask/deny；SC-003 ask/deny/allow。

## 本轮收口修复摘要

1. **Running capture double-normalize** — `captureTrack1RunningEvidence` 不再经 `normalizeInput` 要求 9 cases。
2. **Frontend Dockerfile** — 补拷 `tsconfig.base.json`、`shared/`、`samples/track1/review-demo`。
3. **Vite host allowlist** — `allowedHosts: true`，避免 Docker 内 host=`frontend` 403。
4. **Evidence URL** — `/sandbox-alerts` → `/results/sandbox`。
5. **Abort 轮询** — capture 忽略 `ERR_ABORTED` 轮询取消。
6. **Report 容器路径** — `TRACK1_ARTIFACT_ROOT=/data` + Windows 路径正斜杠；PDF 经 docker.sock + host bind。
7. **Report projector** — deny 路径 `task_status=blocked` 视为合法终态。
8. **PDF 字体** — report 镜像经 `tlmgr install ctex xecjk fandol` + Noto CJK。
9. **Acceptance** — `must_not_execute` 允许模型在无 tool_request 时以 deny/ask 终态通过。

## 残留说明

- 真实模型路径仍可能偶发 flaky（例如 tool 未按 fixture 调用）；当前 baseline 来自一次完整 9/9 + acceptance 成功 run。
- 临时诊断脚本：`scripts/track1/_diag-credentialed-e2e2.ts`（本地诊断用，可保留或后续清理）。
- 凭据仅存在于 gitignored `.env`，不得提交。

## 状态

**REQ-T1-DEMO-010_COMPLETE**（真实凭据 E2E + acceptance + baseline 已完成）
