/**
 * REQ-ASSET-SCAN-SCANNER-002: 版本锁定测试
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { PINNED_VERSIONS, verifyToolVersion } from "../../src/scanners/version-check.ts";

describe("版本锁定与校验", () => {

    test("PINNED_VERSIONS 包含 gitleaks 和 trivy", () => {
        assert.ok(PINNED_VERSIONS.gitleaks, "应有 gitleaks 版本");
        assert.ok(PINNED_VERSIONS.trivy, "应有 trivy 版本");
        assert.match(PINNED_VERSIONS.gitleaks, /^\d+\.\d+\.\d+$/, "版本格式应为 x.y.z");
        assert.match(PINNED_VERSIONS.trivy, /^\d+\.\d+\.\d+$/, "版本格式应为 x.y.z");
    });

    test("verifyToolVersion: 工具不存在时返回 ok=false", async () => {
        const result = await verifyToolVersion("gitleaks", "/nonexistent/gitleaks");

        assert.equal(result.ok, false);
        assert.equal(result.tool, "gitleaks");
        assert.equal(result.actual, null);
        assert.ok(result.error);
    });

    test("verifyToolVersion: 未知工具返回 ok=false", async () => {
        const result = await verifyToolVersion("unknown-tool");

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes("No pinned version"));
    });
});
