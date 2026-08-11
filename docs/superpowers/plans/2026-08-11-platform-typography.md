# Platform Typography and No-SimSun Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace platform-wide frontend font fallback ambiguity with self-hosted Inter, Noto Sans SC, and IBM Plex Mono roles while permanently rejecting SimSun/Song-style families.

**Architecture:** A dedicated `typography.css` entry point owns font faces, UI/Display/Mono semantic custom properties, and base inheritance; `AppProviders` maps Ant Design's prose and code tokens to those roles so portal content follows the same contract. Pinned Fontsource 5.3.0 assets live under `frontend/src/assets/fonts/`, while a Node repository test verifies provenance, aggregate digests, local-only URLs, semantic usage, and the no-SimSun rule across all frontend source.

**Tech Stack:** React 19, TypeScript 6, Ant Design 6, CSS custom properties and `@font-face`, Vite 8, Vitest 4, Node test runner, Fontsource 5.3.0 WOFF2 packages, Playwright browser verification.

---

## Execution Gates

- The approved design is `docs/superpowers/specs/2026-08-11-platform-typography-design.md` and this plan implements only `REQ-FE-TYPOGRAPHY-001`.
- The repository requires Node.js `>=22.19.0`; the planning environment currently reports `22.17.0` and has no `nvm`. Do not start RED/GREEN execution until the following command exits `0`:

```powershell
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 19)) { console.error('Node >=22.19.0 required; found ' + process.versions.node); process.exit(1) } console.log('Node preflight PASS:', process.versions.node)"
```

Expected: `Node preflight PASS: 22.19.0` or a newer compatible `22.x`/later version. If it fails, stop before editing tests or production files, switch/install a compliant runtime outside this requirement, then rerun the same command.

- Preserve the existing unrelated changes in `README.md`, `research-state.md`, `.runtime/`, `.superpowers/brainstorm/`, `.tmp-report/`, and `report/`. Every commit below stages explicit paths only.
- Font acquisition is a pinned, one-time development operation. The built application must make no runtime request to npm, Fontsource, Google Fonts, or any other third-party font host.

## File Map

| Path | Responsibility |
| --- | --- |
| `docs/sprint-current.md` | Make `REQ-FE-TYPOGRAPHY-001` the single current requirement during execution, then close it. |
| `docs/superpowers/specs/2026-08-11-platform-typography-design.md` | Record approved design and implementation authority. |
| `frontend/src/assets/fonts/sources.json` | Pin package versions, npm integrity, licences, asset counts, and aggregate SHA-256 digests. |
| `frontend/src/assets/fonts/inter/**` | Inter Latin variable WOFF2 and upstream OFL licence. |
| `frontend/src/assets/fonts/noto-sans-sc/**` | Complete Fontsource Noto Sans SC variable unicode-range CSS/slices and upstream OFL licence. |
| `frontend/src/assets/fonts/ibm-plex-mono/**` | IBM Plex Mono Latin WOFF2 files for 400/500/600 and upstream OFL licence. |
| `frontend/src/styles/typography.css` | Import Noto range faces, declare Inter/IBM faces, expose UI/Display/Mono tokens, and assign base semantic roles. |
| `frontend/src/main.tsx` | Load typography after Ant Design reset and before application CSS. |
| `frontend/src/app/AppProviders.tsx` | Map Ant Design `fontFamily` and `fontFamilyCode` to semantic tokens. |
| `frontend/src/styles/app.css` | Remove legacy stacks, retain the Mono compatibility alias, and correct UI/Display semantic exceptions. |
| `frontend/src/styles/console-theme.provider.spec.tsx` | Verify resolved Ant Design typography tokens. |
| `tests/repository/frontend-typography.spec.ts` | Permanent provenance, local delivery, semantic-role, and forbidden-family gate. |
| `package.json` | Register the new repository test in `test:repo`. |
| `docs/architecture.md` | Record ownership and the no-runtime-CDN boundary. |
| `docs/progress.md` | Record RED/GREEN, browser, review, and verification evidence. |

### Task 1: Activate the approved requirement

**Files:**
- Modify: `docs/sprint-current.md`
- Modify: `docs/superpowers/specs/2026-08-11-platform-typography-design.md`

- [ ] **Step 1: Run the runtime and workspace preflight**

Run:

```powershell
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 19)) { console.error('Node >=22.19.0 required; found ' + process.versions.node); process.exit(1) } console.log('Node preflight PASS:', process.versions.node)"
git status --short
```

Expected: Node preflight exits `0`; the status still shows the known unrelated user files and no unrecognized overlapping change in any file listed in the File Map. Stop if either condition is false.

- [ ] **Step 2: Mark the design approved**

Apply this exact metadata change in `docs/superpowers/specs/2026-08-11-platform-typography-design.md`:

```diff
-- Status: `DRAFT_PENDING_USER_REVIEW`
-- Delivery type: frontend visual-system change
-- Implementation authority: not yet granted; implementation starts only after
-  written-spec approval and an approved implementation plan
+- Status: `APPROVED`
+- Delivery type: frontend visual-system change
+- Implementation authority: granted by the user after written-spec and
+  implementation-plan approval
```

Replace the sentence below the metadata with:

```markdown
This document records the design approved in the brainstorming session. The
design document itself was a documentation-only change, so the repository's
full TDD workflow did not apply to that commit. Production implementation must
follow the repository RED -> GREEN workflow.
```

- [ ] **Step 3: Replace the completed previous sprint record with the single active requirement**

Replace `docs/sprint-current.md` with exactly:

```markdown
# Sprint Current

## Requirement ID

REQ-FE-TYPOGRAPHY-001

## Requirement Name

Platform typography and no-SimSun guard

## Status

APPROVED_FOR_IMPLEMENTATION

## Authority

The user approved the complete-frontend scope, self-hosted font delivery,
Inter + Noto Sans SC for UI/Display roles, IBM Plex Mono for machine values,
and the implementation plan on 2026-08-11. The previous requirement,
REQ-SBX-GENERAL-005, remains closed at its recorded
IMPLEMENTED_PENDING_GLOBAL_P6_GATE status in `docs/progress.md`.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/docs.instructions.md`
- `docs/superpowers/specs/2026-08-11-platform-typography-design.md`
- `docs/superpowers/plans/2026-08-11-platform-typography.md`

## Goal

Give every frontend route deterministic sans-serif Chinese and Latin typography
that fits the dark technical console, preserve a distinct machine-value role,
and permanently reject SimSun/Song-style or standalone serif fallbacks.

## In Scope

- Self-host pinned Inter, Noto Sans SC, and IBM Plex Mono WOFF2 assets.
- Add UI, Display, and Mono semantic typography tokens.
- Connect document, native-control, explicit machine-value, heading, and Ant
  Design portal typography to those roles.
- Add repository and provider tests plus browser/font/layout verification.
- Update architecture and progress documentation.

## Out of Scope

- Backend, shared contract, API, route, state, data-flow, copy, colour, spacing,
  radius, animation, or interaction changes.
- Runtime font CDNs, runtime font loaders, and current-copy-only CJK subsets.
- Reclassifying component content beyond the approved semantic font mapping.

## Acceptance

The requirement is complete only when focused tests, the full frontend suite,
the full repository suite, the production build, browser font checks, desktop
and mobile captures, closing review, and documentation closure all pass.
```

- [ ] **Step 4: Verify the documentation-only transition**

Run:

```powershell
rg -n 'REQ-FE-TYPOGRAPHY-001|APPROVED_FOR_IMPLEMENTATION|Status: `APPROVED`' docs/sprint-current.md docs/superpowers/specs/2026-08-11-platform-typography-design.md
git diff --check -- docs/sprint-current.md docs/superpowers/specs/2026-08-11-platform-typography-design.md
```

Expected: all three approved-state markers are present and `git diff --check` is silent. This task is a documentation-state exception to full TDD and introduces no production behavior.

- [ ] **Step 5: Commit the requirement transition**

```powershell
git add docs/sprint-current.md docs/superpowers/specs/2026-08-11-platform-typography-design.md
git commit -m "docs(frontend): activate platform typography requirement"
```

Expected: only the two explicit documentation files are committed.

### Task 2: Vendor pinned font assets behind a failing provenance guard

**Files:**
- Create: `tests/repository/frontend-typography.spec.ts`
- Create: `frontend/src/assets/fonts/sources.json`
- Create: `frontend/src/assets/fonts/inter/LICENSE`
- Create: `frontend/src/assets/fonts/inter/files/inter-latin-wght-normal.woff2`
- Create: `frontend/src/assets/fonts/noto-sans-sc/LICENSE`
- Create: `frontend/src/assets/fonts/noto-sans-sc/wght.css`
- Create: `frontend/src/assets/fonts/noto-sans-sc/files/*-wght-normal.woff2` (101 files copied exactly from the pinned package)
- Create: `frontend/src/assets/fonts/ibm-plex-mono/LICENSE`
- Create: `frontend/src/assets/fonts/ibm-plex-mono/files/ibm-plex-mono-latin-{400,500,600}-normal.woff2`
- Modify: `package.json`

- [ ] **Step 1: Write the failing asset provenance test**

Create `tests/repository/frontend-typography.spec.ts` with exactly:

```ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

interface FontSource {
  readonly directory: string;
  readonly family: string;
  readonly package: string;
  readonly version: "5.3.0";
  readonly npmIntegrity: string;
  readonly license: "OFL-1.1";
  readonly licenseFile: "LICENSE";
  readonly licenseSha256: string;
  readonly assetCount: number;
  readonly assetDigestSha256: string;
}

interface FontSourceManifest {
  readonly schemaVersion: 1;
  readonly digestRecipe: string;
  readonly sources: readonly FontSource[];
}

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const fontRoot = join(repositoryRoot, "frontend", "src", "assets", "fonts");

function collectFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
    }
  };
  visit(root);
  return files.sort();
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function aggregateAssetDigest(root: string, paths: readonly string[]): string {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    hash.update(`${path}\n`);
    hash.update(readFileSync(join(root, path)));
    hash.update("\n");
  }
  return hash.digest("hex");
}

test("REQ-FE-TYPOGRAPHY-001 self-hosted font assets match pinned provenance", () => {
  const manifestPath = join(fontRoot, "sources.json");
  assert.ok(existsSync(manifestPath), "missing frontend font source manifest");
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8")
  ) as FontSourceManifest;

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(
    manifest.digestRecipe,
    "SHA-256 over each sorted POSIX-relative asset path + LF + bytes + LF"
  );
  assert.deepEqual(
    manifest.sources.map(({ directory, family, package: packageName, version, npmIntegrity }) => ({
      directory,
      family,
      package: packageName,
      version,
      npmIntegrity
    })),
    [
      {
        directory: "inter",
        family: "Inter Variable",
        package: "@fontsource-variable/inter",
        version: "5.3.0",
        npmIntegrity:
          "sha512-OupL48va4JNofb97w6NYeF9S7W/kHNKM0Er8Dem5nqi4jeOLrVJDoE8tZEpnMJmtkvNbB1EIPPwHcdkF6b1oUA=="
      },
      {
        directory: "noto-sans-sc",
        family: "Noto Sans SC Variable",
        package: "@fontsource-variable/noto-sans-sc",
        version: "5.3.0",
        npmIntegrity:
          "sha512-lNar1dF7Ik/lHNPo/7JWG0TolXY29LtsqYgMvEysooZ5bsO9uH4shJmRrwyJ3PjyTPljhpMJEK0jDuLSU4vJ1w=="
      },
      {
        directory: "ibm-plex-mono",
        family: "IBM Plex Mono",
        package: "@fontsource/ibm-plex-mono",
        version: "5.3.0",
        npmIntegrity:
          "sha512-eTgnZjZEGk1QtD3ZstF+Vclo2HLAni8YMy34/DxllwZvyz1lR/1RF/xTiAquOBO7MvqBx8D2Ig2WCPMVfdZu7Q=="
      }
    ]
  );

  for (const source of manifest.sources) {
    assert.equal(source.license, "OFL-1.1");
    const sourceRoot = join(fontRoot, source.directory);
    const licensePath = join(sourceRoot, source.licenseFile);
    assert.ok(existsSync(licensePath), `missing licence for ${source.family}`);
    assert.equal(sha256(readFileSync(licensePath)), source.licenseSha256);

    const assetPaths = collectFiles(sourceRoot).filter(
      (path) => path !== source.licenseFile
    );
    assert.equal(assetPaths.length, source.assetCount, source.family);
    assert.equal(
      aggregateAssetDigest(sourceRoot, assetPaths),
      source.assetDigestSha256,
      source.family
    );
  }
});

test("REQ-FE-TYPOGRAPHY-001 Noto Sans SC keeps complete unicode-range slices", () => {
  const notoRoot = join(fontRoot, "noto-sans-sc");
  const css = readFileSync(join(notoRoot, "wght.css"), "utf8");
  const faceBlocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/gs)].map(
    (match) => match[1]
  );
  const referencedAssets = [...css.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)]
    .map((match) => match[1])
    .sort();
  const storedAssets = collectFiles(join(notoRoot, "files"))
    .map((path) => path.replace(/^files\//, ""))
    .sort();

  assert.equal(faceBlocks.length, 101);
  assert.equal(referencedAssets.length, 101);
  assert.deepEqual(storedAssets, referencedAssets);
  for (const block of faceBlocks) {
    assert.match(block, /font-family:\s*'Noto Sans SC Variable'/);
    assert.match(block, /font-display:\s*swap/);
    assert.match(block, /font-weight:\s*100 900/);
    assert.match(block, /unicode-range:/);
    assert.doesNotMatch(block, /https?:\/\//i);
  }
});
```

`extname` is intentionally imported now because Task 3 extends this same permanent gate; Node accepts the temporarily unused import.

- [ ] **Step 2: Register the test in the repository suite**

In root `package.json`, append the new file to the existing `test:repo` command. The resulting property must be exactly:

```json
"test:repo": "node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/root-test-entry.spec.ts tests/repository/sandbox-security-core.spec.ts tests/repository/sandbox-security-production-spec.spec.ts tests/repository/sandbox-security-production-plan.spec.ts tests/repository/sandbox-security-p6-acceptance-capability.spec.ts tests/repository/sandbox-security-benchmark.spec.ts tests/repository/frontend-formatting-boundary.spec.ts tests/repository/track1-scenario-matrix.spec.ts tests/repository/track1-case-set.spec.ts tests/repository/track1-attack-replay.spec.ts tests/repository/track1-monitor-plugin.spec.ts tests/repository/track1-base-filter.spec.ts tests/repository/track1-supervision-ui.spec.ts tests/repository/track1-openclaw-manifest.spec.ts tests/repository/track1-openclaw-plugin.spec.ts tests/repository/track1-campaign-backend.spec.ts tests/repository/track1-campaign-ui.spec.ts tests/repository/track1-evidence-pack.spec.ts tests/repository/track1-review-demo-content.spec.ts tests/repository/track1-review-demo-ui.spec.ts tests/repository/track1-electron-app.spec.ts tests/repository/fofa-six-step-minimal.spec.ts tests/repository/fofa-api-task-scan.spec.ts tests/repository/fofa-task-batch-report.spec.ts tests/repository/fofa-mainline-portscan.spec.ts tests/repository/fofa-portscan-workflow.spec.ts tests/repository/asset-scan-bridge.execution-context.spec.ts tests/repository/asset-scan-runtime.interruption-reason.spec.ts tests/repository/sandbox-security-backend-spec.spec.ts tests/repository/sandbox-security-openclaw-enforcement.spec.ts tests/repository/sandbox-security-openclaw-package.spec.ts tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts tests/repository/sandbox-security-frontend-spec.spec.ts tests/repository/frontend-console-theme-literals.spec.ts tests/repository/frontend-typography.spec.ts"
```

- [ ] **Step 3: Run the focused test and confirm RED**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-typography.spec.ts
```

Expected: FAIL in `self-hosted font assets match pinned provenance` with `missing frontend font source manifest`. The failure must not be a TypeScript parse, import, or runtime-version error.

- [ ] **Step 4: Download and verify the three pinned source packages in a temporary directory**

Run this exact PowerShell block from the repository root:

```powershell
$fontImport = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-security-fonts-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $fontImport | Out-Null

$packages = @(
  @{
    Name = "inter"
    Spec = "@fontsource-variable/inter@5.3.0"
    Integrity = "sha512-OupL48va4JNofb97w6NYeF9S7W/kHNKM0Er8Dem5nqi4jeOLrVJDoE8tZEpnMJmtkvNbB1EIPPwHcdkF6b1oUA=="
  },
  @{
    Name = "noto-sans-sc"
    Spec = "@fontsource-variable/noto-sans-sc@5.3.0"
    Integrity = "sha512-lNar1dF7Ik/lHNPo/7JWG0TolXY29LtsqYgMvEysooZ5bsO9uH4shJmRrwyJ3PjyTPljhpMJEK0jDuLSU4vJ1w=="
  },
  @{
    Name = "ibm-plex-mono"
    Spec = "@fontsource/ibm-plex-mono@5.3.0"
    Integrity = "sha512-eTgnZjZEGk1QtD3ZstF+Vclo2HLAni8YMy34/DxllwZvyz1lR/1RF/xTiAquOBO7MvqBx8D2Ig2WCPMVfdZu7Q=="
  }
)

Push-Location $fontImport
foreach ($package in $packages) {
  $result = @(npm pack --json $package.Spec | ConvertFrom-Json)[0]
  if ($LASTEXITCODE -ne 0) { throw "npm pack failed for $($package.Spec)" }
  if ($result.integrity -ne $package.Integrity) {
    throw "integrity mismatch for $($package.Spec): $($result.integrity)"
  }
  $extractRoot = Join-Path $fontImport $package.Name
  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  tar -xf (Join-Path $fontImport $result.filename) -C $extractRoot
  if ($LASTEXITCODE -ne 0) { throw "tar extraction failed for $($package.Spec)" }
}
Pop-Location

Write-Output "FONT_IMPORT_ROOT=$fontImport"
```

Expected: three integrity comparisons pass and the final line prints the unique temporary extraction path. Keep `$fontImport` in the same PowerShell session for Step 5.

- [ ] **Step 5: Copy only the approved assets and upstream licences**

Run:

```powershell
$fontRoot = Join-Path (Get-Location) "frontend\src\assets\fonts"
$interTarget = Join-Path $fontRoot "inter"
$notoTarget = Join-Path $fontRoot "noto-sans-sc"
$ibmTarget = Join-Path $fontRoot "ibm-plex-mono"

New-Item -ItemType Directory -Force -Path (Join-Path $interTarget "files") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $notoTarget "files") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ibmTarget "files") | Out-Null

$interSource = Join-Path $fontImport "inter\package"
$notoSource = Join-Path $fontImport "noto-sans-sc\package"
$ibmSource = Join-Path $fontImport "ibm-plex-mono\package"

Copy-Item -LiteralPath (Join-Path $interSource "LICENSE") -Destination (Join-Path $interTarget "LICENSE")
Copy-Item -LiteralPath (Join-Path $interSource "files\inter-latin-wght-normal.woff2") -Destination (Join-Path $interTarget "files\inter-latin-wght-normal.woff2")

Copy-Item -LiteralPath (Join-Path $notoSource "LICENSE") -Destination (Join-Path $notoTarget "LICENSE")
Copy-Item -LiteralPath (Join-Path $notoSource "wght.css") -Destination (Join-Path $notoTarget "wght.css")
Copy-Item -Path (Join-Path $notoSource "files\*-wght-normal.woff2") -Destination (Join-Path $notoTarget "files")

Copy-Item -LiteralPath (Join-Path $ibmSource "LICENSE") -Destination (Join-Path $ibmTarget "LICENSE")
foreach ($weight in 400, 500, 600) {
  $name = "ibm-plex-mono-latin-$weight-normal.woff2"
  Copy-Item -LiteralPath (Join-Path $ibmSource "files\$name") -Destination (Join-Path $ibmTarget "files\$name")
}

if ((Get-ChildItem (Join-Path $notoTarget "files") -Filter "*-wght-normal.woff2").Count -ne 101) {
  throw "Noto Sans SC asset count must be 101"
}
```

Expected: the Noto asset assertion passes. These are binary/vendor-copy operations; do not edit or re-encode the WOFF2 files or the upstream `wght.css`.

- [ ] **Step 6: Add the exact provenance manifest**

Create `frontend/src/assets/fonts/sources.json` with `apply_patch` and exactly:

```json
{
  "schemaVersion": 1,
  "digestRecipe": "SHA-256 over each sorted POSIX-relative asset path + LF + bytes + LF",
  "sources": [
    {
      "directory": "inter",
      "family": "Inter Variable",
      "package": "@fontsource-variable/inter",
      "version": "5.3.0",
      "npmIntegrity": "sha512-OupL48va4JNofb97w6NYeF9S7W/kHNKM0Er8Dem5nqi4jeOLrVJDoE8tZEpnMJmtkvNbB1EIPPwHcdkF6b1oUA==",
      "license": "OFL-1.1",
      "licenseFile": "LICENSE",
      "licenseSha256": "3b0a5fca3d17942cde889069889dedbbbd075e9b599968c82a95f4d944e9b345",
      "assetCount": 1,
      "assetDigestSha256": "1764834b710326fe8f1eafe14c655c44dd8c5661158bf10f73e96c1c59815cfd"
    },
    {
      "directory": "noto-sans-sc",
      "family": "Noto Sans SC Variable",
      "package": "@fontsource-variable/noto-sans-sc",
      "version": "5.3.0",
      "npmIntegrity": "sha512-lNar1dF7Ik/lHNPo/7JWG0TolXY29LtsqYgMvEysooZ5bsO9uH4shJmRrwyJ3PjyTPljhpMJEK0jDuLSU4vJ1w==",
      "license": "OFL-1.1",
      "licenseFile": "LICENSE",
      "licenseSha256": "18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3",
      "assetCount": 102,
      "assetDigestSha256": "79e9de30a1d31815b9c5f1308f675fd5da7007e70234959d3415952db034fc48"
    },
    {
      "directory": "ibm-plex-mono",
      "family": "IBM Plex Mono",
      "package": "@fontsource/ibm-plex-mono",
      "version": "5.3.0",
      "npmIntegrity": "sha512-eTgnZjZEGk1QtD3ZstF+Vclo2HLAni8YMy34/DxllwZvyz1lR/1RF/xTiAquOBO7MvqBx8D2Ig2WCPMVfdZu7Q==",
      "license": "OFL-1.1",
      "licenseFile": "LICENSE",
      "licenseSha256": "23b0a9d0c6d3f140a0b77e483c5cfa6bba574325ef5cb189ed9f2fec4884533f",
      "assetCount": 3,
      "assetDigestSha256": "8fcc5f6c927bdc270f59cd9a6ae4ba9dfe8b521a4a84dd8a0aea07c882106b17"
    }
  ]
}
```

- [ ] **Step 7: Run the focused asset test and confirm GREEN**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-typography.spec.ts
```

Expected: `2` tests pass, `0` fail. A digest mismatch means a copy was incomplete or modified; fix the copied assets rather than changing the pinned expected digest.

- [ ] **Step 8: Commit the provenance-verified assets**

```powershell
git add package.json tests/repository/frontend-typography.spec.ts frontend/src/assets/fonts
git commit -m "chore(frontend): vendor verified typography assets"
```

Expected: the commit includes only the package test registration, repository guard, manifest, three licences, vendor CSS, and approved WOFF2 files.

### Task 3: Wire semantic typography roles using RED -> GREEN

**Files:**
- Modify: `tests/repository/frontend-typography.spec.ts`
- Modify: `frontend/src/styles/console-theme.provider.spec.tsx`
- Create: `frontend/src/styles/typography.css`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/app/AppProviders.tsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: Extend the repository test with the failing semantic contract**

Append the following exact code to `tests/repository/frontend-typography.spec.ts`:

```ts

const frontendSourceRoot = join(repositoryRoot, "frontend", "src");

function readFrontend(path: string): string {
  return readFileSync(join(frontendSourceRoot, path), "utf8");
}

function customProperty(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `missing ${name}`);
  return match[1].trim();
}

function frontendTextSources(): string[] {
  return collectFiles(frontendSourceRoot).filter((path) =>
    [".css", ".html", ".ts", ".tsx"].includes(extname(path))
  );
}

test("REQ-FE-TYPOGRAPHY-001 exposes and loads the three semantic font roles", () => {
  const typography = readFrontend("styles/typography.css");
  const app = readFrontend("styles/app.css");
  const main = readFrontend("main.tsx");
  const uiStack =
    '"Inter Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif';
  const monoStack =
    '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", monospace';

  assert.equal(customProperty(typography, "--console-font-ui"), uiStack);
  assert.equal(customProperty(typography, "--console-font-display"), uiStack);
  assert.equal(customProperty(typography, "--console-font-mono"), monoStack);
  assert.equal(customProperty(app, "--console-mono"), "var(--console-font-mono)");

  const resetIndex = main.indexOf('import "antd/dist/reset.css"');
  const typographyIndex = main.indexOf('import "./styles/typography.css"');
  const appIndex = main.indexOf('import "./styles/app.css"');
  assert.ok(resetIndex >= 0, "missing Ant Design reset import");
  assert.ok(typographyIndex > resetIndex, "typography must follow the reset");
  assert.ok(appIndex > typographyIndex, "app styles must follow typography");
});

test("REQ-FE-TYPOGRAPHY-001 font faces are local, swappable, and weight-bounded", () => {
  const typography = readFrontend("styles/typography.css");
  const noto = readFrontend("assets/fonts/noto-sans-sc/wght.css");
  const faceBlocks = [
    ...typography.matchAll(/@font-face\s*\{([^}]*)\}/gs),
    ...noto.matchAll(/@font-face\s*\{([^}]*)\}/gs)
  ].map((match) => match[1]);

  assert.equal(faceBlocks.length, 105);
  for (const block of faceBlocks) {
    assert.match(block, /font-display:\s*swap/);
    assert.match(block, /url\((?!["']?https?:\/\/)/i);
    assert.doesNotMatch(block, /https?:\/\//i);
  }

  const inter = faceBlocks.find((block) =>
    /font-family:\s*"Inter Variable"/.test(block)
  );
  assert.ok(inter);
  assert.match(inter, /font-weight:\s*400 700/);
  assert.match(inter, /inter-latin-wght-normal\.woff2/);

  const ibmWeights = faceBlocks
    .filter((block) => /font-family:\s*"IBM Plex Mono"/.test(block))
    .map((block) => Number(block.match(/font-weight:\s*(\d+)/)?.[1]))
    .sort((left, right) => left - right);
  assert.deepEqual(ibmWeights, [400, 500, 600]);
});

test("REQ-FE-TYPOGRAPHY-001 rejects Song-style, serif, and retired platform stacks", () => {
  const offenders: string[] = [];
  const namedFamilies = /SimSun|NSimSun|Songti|STSong|宋体|Aptos|Segoe UI|JetBrains Mono|Fira Code/i;
  const standaloneSerif = /(^|[^-\w])serif(?![-\w])/i;

  for (const path of frontendTextSources()) {
    const source = readFrontend(path);
    const named = source.match(namedFamilies);
    const serif = source.match(standaloneSerif);
    if (named) offenders.push(`${path}: ${named[0]}`);
    if (serif) offenders.push(`${path}: standalone serif`);
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("REQ-FE-TYPOGRAPHY-001 font-family declarations consume semantic roles", () => {
  const offenders: string[] = [];
  const allowed = new Set([
    "var(--console-font-ui)",
    "var(--console-font-display)",
    "var(--console-font-mono)",
    "var(--console-mono)"
  ]);

  for (const path of frontendTextSources()) {
    const source = readFrontend(path);
    if (extname(path) === ".css") {
      const withoutFaces = source.replace(/@font-face\s*\{[^}]*\}/gs, "");
      for (const match of withoutFaces.matchAll(/font-family:\s*([^;]+);/g)) {
        const value = match[1].trim();
        if (!allowed.has(value)) offenders.push(`${path}: ${value}`);
      }
    }
    if (extname(path) === ".ts" || extname(path) === ".tsx") {
      for (const match of source.matchAll(/fontFamily(?:Code)?:\s*["']([^"']+)["']/g)) {
        if (!allowed.has(match[1])) offenders.push(`${path}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("REQ-FE-TYPOGRAPHY-001 assigns UI, Display, and Mono roles by meaning", () => {
  const typography = readFrontend("styles/typography.css");
  const app = readFrontend("styles/app.css");

  assert.match(
    typography,
    /html,[\s\S]*textarea\s*\{[^}]*font-family:\s*var\(--console-font-ui\)/
  );
  assert.match(
    typography,
    /h1,[\s\S]*h6\s*\{[^}]*font-family:\s*var\(--console-font-display\)/
  );
  assert.match(
    typography,
    /\[data-mono="true"\],[\s\S]*samp\s*\{[^}]*font-family:\s*var\(--console-font-mono\)/
  );
  assert.doesNotMatch(typography, /(^|\n)\s*\*\s*\{[^}]*font-family:/s);
  assert.match(
    app,
    /\.workbench-source-card__value\s*\{[^}]*font-family:\s*var\(--console-font-ui\)/s
  );
  assert.match(
    app,
    /\.showcase-verdict__metric dd\s*\{[^}]*font-family:\s*var\(--console-font-display\)/s
  );
});
```

- [ ] **Step 2: Extend the Ant Design provider probe**

Add two attributes to `TokenProbe` in `frontend/src/styles/console-theme.provider.spec.tsx`:

```tsx
      data-font-family={token.fontFamily}
      data-font-family-code={token.fontFamilyCode}
```

Then append this exact test:

```tsx

describe("REQ-FE-TYPOGRAPHY-001 AppProviders typography", () => {
  it("maps Ant Design prose and code tokens to semantic font roles", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );

    const probe = screen.getByTestId("probe");
    expect(probe.dataset.fontFamily).toBe("var(--console-font-ui)");
    expect(probe.dataset.fontFamilyCode).toBe("var(--console-font-mono)");
  });
});
```

- [ ] **Step 3: Run both focused contracts and confirm RED**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-typography.spec.ts
npm run test --prefix frontend -- src/styles/console-theme.provider.spec.tsx
```

Expected: the repository test fails because `styles/typography.css` is missing and legacy Aptos/Segoe/JetBrains/Fira values remain; the provider test fails because `fontFamily` is still the Aptos/Segoe literal and `fontFamilyCode` is not `var(--console-font-mono)`. The two asset tests from Task 2 must remain green.

- [ ] **Step 4: Create the minimal semantic typography stylesheet**

Create `frontend/src/styles/typography.css` with exactly:

```css
@import "../assets/fonts/noto-sans-sc/wght.css";

@font-face {
  font-family: "Inter Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 400 700;
  src: url("../assets/fonts/inter/files/inter-latin-wght-normal.woff2") format("woff2-variations");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url("../assets/fonts/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2") format("woff2");
}

@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url("../assets/fonts/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
}

@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-display: swap;
  font-weight: 600;
  src: url("../assets/fonts/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2") format("woff2");
}

:root {
  --console-font-ui: "Inter Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif;
  --console-font-display: "Inter Variable", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif;
  --console-font-mono: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", monospace;
}

html,
body,
#root,
.ant-app,
button,
input,
optgroup,
select,
textarea {
  font-family: var(--console-font-ui);
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: var(--console-font-display);
}

[data-mono="true"],
code,
kbd,
pre,
samp {
  font-family: var(--console-font-mono);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Load typography in the correct cascade order**

In `frontend/src/main.tsx`, make the import block exactly:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";

import { App } from "./app/App";
import "./styles/typography.css";
import "./styles/app.css";
```

- [ ] **Step 6: Map Ant Design typography tokens**

In `frontend/src/app/AppProviders.tsx`, replace the current `fontFamily` line so the token object is exactly:

```tsx
        token: {
          ...consoleThemeTokens,
          fontFamily: "var(--console-font-ui)",
          fontFamilyCode: "var(--console-font-mono)"
        }
```

- [ ] **Step 7: Remove legacy stacks and correct semantic exceptions in app CSS**

Apply these exact changes in `frontend/src/styles/app.css`:

```diff
-  --console-mono: "JetBrains Mono", "Fira Code", ui-monospace, "SFMono-Regular", monospace;
+  --console-mono: var(--console-font-mono);
```

```diff
 body {
   margin: 0;
-  font-family: "Aptos", "Segoe UI Variable Text", "Segoe UI", sans-serif;
   background:
```

```diff
 .workbench-source-card__value {
-  font-family: var(--console-mono);
+  font-family: var(--console-font-ui);
   resize: vertical;
 }
```

```diff
 .showcase-verdict__metric dd {
   margin: 0;
-  font-family: var(--console-mono);
+  font-family: var(--console-font-display);
   font-variant-numeric: tabular-nums;
```

Do not alter the other `var(--console-mono)` declarations: they already mark identifiers, digests, short technical labels, timestamps, byte counts, enum-like values, or audit fields and remain valid through the compatibility alias.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-typography.spec.ts
npm run test --prefix frontend -- src/styles/console-theme.provider.spec.tsx
```

Expected: `frontend-typography.spec.ts` passes all `7` tests and the provider spec passes all existing theme tests plus the new typography test.

- [ ] **Step 9: Prove Vite resolves every local font URL**

Run:

```powershell
npm run build --prefix frontend
```

Expected: exit `0`; Vite emits the frontend bundle and WOFF2 assets with no unresolved URL, missing file, or CSS parse warning.

- [ ] **Step 10: Commit the semantic typography layer**

```powershell
git add frontend/src/styles/typography.css frontend/src/main.tsx frontend/src/app/AppProviders.tsx frontend/src/styles/app.css frontend/src/styles/console-theme.provider.spec.tsx tests/repository/frontend-typography.spec.ts
git commit -m "feat(frontend): apply semantic platform typography"
```

Expected: only typography production code and its two test files are committed.

### Task 4: Verify regression, font loading, and responsive rendering

**Files:**
- Verify only; do not create committed source files
- Temporary captures: `.superpowers/verification/platform-typography/workbench-desktop.png`
- Temporary captures: `.superpowers/verification/platform-typography/workbench-mobile.png`

- [ ] **Step 1: Run the complete automated verification ladder**

Run in this order:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-typography.spec.ts
npm run test --prefix frontend -- src/styles/console-theme.provider.spec.tsx
npm run test:frontend
npm run test:repo
npm run build --prefix frontend
git diff --check
```

Expected: every command exits `0`; no test is skipped; the build resolves every WOFF2 URL; `git diff --check` is silent. If `test:repo` exposes a pre-existing platform failure, reproduce it on the parent commit before classifying it, but do not claim this requirement complete until the acceptance suite itself exits `0` in a compliant environment.

- [ ] **Step 2: Start a local frontend server on the first free verification port**

Run:

```powershell
$verificationPort = 5176..5180 | Where-Object {
  -not (Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue)
} | Select-Object -First 1
if ($null -eq $verificationPort) { throw "No free verification port in 5176..5180" }

$stdout = Join-Path ([System.IO.Path]::GetTempPath()) "platform-typography-vite.out.log"
$stderr = Join-Path ([System.IO.Path]::GetTempPath()) "platform-typography-vite.err.log"
$vite = Start-Process -FilePath "npm.cmd" -ArgumentList @(
  "run", "dev", "--prefix", "frontend", "--", "--host", "127.0.0.1", "--port", "$verificationPort"
) -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
$verificationUrl = "http://127.0.0.1:$verificationPort/sandbox-security/workbench"
Write-Output "VITE_PID=$($vite.Id)"
Write-Output "VERIFICATION_URL=$verificationUrl"

$ready = $false
foreach ($attempt in 1..30) {
  if ($vite.HasExited) { throw "Vite exited before readiness; inspect $stderr" }
  try {
    $response = Invoke-WebRequest -Uri $verificationUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}
if (-not $ready) { throw "Vite did not return HTTP 200 at $verificationUrl" }

New-Item -ItemType Directory -Force -Path ".superpowers\verification\platform-typography" | Out-Null
```

Expected: the selected port is one of `5176..5180`, the process remains running, and the printed Workbench URL responds with HTTP `200`. Keep this server running for user handoff.

- [ ] **Step 3: Invoke `$playwright-interactive` for real-browser font and portal checks**

The skill is required here because this step verifies computed styles, font-face loading, an Ant Design portal, and responsive screenshots in a persistent browser. Open the exact URL printed by Step 2, then install these listeners and reload once so all verification traffic is captured:

```js
const verificationUrl = page.url();
const failedResponses = [];
const requestOrigins = new Set();
page.on("response", (response) => {
  requestOrigins.add(new URL(response.url()).origin);
  if (!response.ok()) failedResponses.push(`${response.status()} ${response.url()}`);
});
await page.reload({ waitUntil: "networkidle" });
```

```js
const fontEvidence = await page.evaluate(async () => {
  await document.fonts.ready;
  const loaded = async (shorthand, text) => {
    const faces = await document.fonts.load(shorthand, text);
    return faces.length > 0 && faces.every((face) => face.status === "loaded");
  };
  return {
    inter: await loaded('400 16px "Inter Variable"', "Security Console"),
    notoSansSc: await loaded('400 16px "Noto Sans SC Variable"', "沙箱安全评估"),
    ibmPlexMono: await loaded('400 16px "IBM Plex Mono"', "request_01")
  };
});
```

Expected:

```js
{ inter: true, notoSansSc: true, ibmPlexMono: true }
```

Click the first `.workbench-source-card .ant-select-selector`, wait for `.ant-select-dropdown:not(.ant-select-dropdown-hidden)`, then evaluate:

```js
const roleEvidence = await page.evaluate(() => {
  const family = (selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`missing ${selector}`);
    return getComputedStyle(element).fontFamily;
  };
  return {
    body: family("body"),
    heading: family(".sandbox-workbench-header h3"),
    formControl: family(".workbench-source-card__value"),
    portal: family(".ant-select-dropdown:not(.ant-select-dropdown-hidden)"),
    mono: family('.sandbox-security-workbench-page [data-mono="true"]')
  };
});
```

Expected:

- `body`, `heading`, `formControl`, and `portal` start with `"Inter Variable"` and contain `"Noto Sans SC Variable"`.
- `formControl` does not contain `IBM Plex Mono`.
- `mono` starts with `"IBM Plex Mono"` and contains `"Noto Sans SC Variable"` as its Chinese fallback.

Inspect the recorded network evidence with:

```js
({ failedResponses, requestOrigins: [...requestOrigins].sort() });
```

Expected: `failedResponses` is empty and `requestOrigins` contains only the local Vite origin printed in Step 2.

- [ ] **Step 4: Capture and inspect desktop rendering**

Set the Playwright viewport to `1440 x 1000`, close the Select portal, and save a full-page screenshot:

```js
await page.setViewportSize({ width: 1440, height: 1000 });
await page.keyboard.press("Escape");
await page.screenshot({
  path: ".superpowers/verification/platform-typography/workbench-desktop.png",
  fullPage: true
});
```

Evaluate:

```js
const desktopLayout = await page.evaluate(() => ({
  viewportWidth: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  bodyHeight: document.body.getBoundingClientRect().height
}));
```

Expected: `scrollWidth <= viewportWidth`, `bodyHeight > 0`, and visual inspection shows no clipped title, button, label, menu item, table header, input text, or overlapping Workbench column caused by the new metrics.

- [ ] **Step 5: Capture and inspect mobile rendering**

Set the viewport to `390 x 844`, reload the Workbench, wait for `document.fonts.ready`, and save a full-page screenshot:

```js
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: ".superpowers/verification/platform-typography/workbench-mobile.png",
  fullPage: true
});
```

Evaluate the same `desktopLayout` expression and record it as mobile evidence.

Expected: `scrollWidth <= viewportWidth`; the Workbench columns stack; Chinese labels and long Latin machine values wrap or clip only where the existing component contract deliberately constrains them; no control text escapes its container and no heading overlaps adjacent content.

- [ ] **Step 6: Record a clean verification status without committing captures**

Run:

```powershell
git status --short
```

Expected: the two screenshots may appear under the untracked `.superpowers/` tree, while tracked typography files are clean after the Task 3 commit and the known unrelated user changes remain untouched.

### Task 5: Close documentation and review the requirement

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/progress.md`
- Modify: `docs/sprint-current.md`
- Verify unchanged: `README.md`
- Verify unchanged: `docs/api-contract.md`

- [ ] **Step 1: Invoke `$code-reviewer` on the typography commits**

Review the diff from the parent of the Task 1 commit through `HEAD`, prioritizing correctness, font fallback behavior, self-hosting, asset licensing/provenance, CSS cascade, Ant Design portal inheritance, test false positives/negatives, bundle size, and responsive regressions.

Expected: no unresolved Critical or Important finding. Any behavior fix must first receive a focused failing test, then repeat the relevant Task 3/4 verification before committing the fix.

- [ ] **Step 2: Add the durable architecture boundary**

Append this exact section to `docs/architecture.md`:

```markdown

## REQ-FE-TYPOGRAPHY-001 Platform Typography Boundary

The frontend owns one same-origin typography layer at
`frontend/src/styles/typography.css`. It exposes UI, Display, and Mono roles
through `--console-font-ui`, `--console-font-display`, and
`--console-font-mono`; the older `--console-mono` name remains only as a
compatibility alias. Document text, native controls, headings, explicit
machine-value markers, and Ant Design's `fontFamily`/`fontFamilyCode` tokens all
consume these roles instead of declaring private family stacks.

Inter Variable provides Latin UI and display glyphs, the complete Fontsource
Noto Sans SC variable unicode-range distribution provides Simplified Chinese,
and IBM Plex Mono 400/500/600 provides Latin machine values. The WOFF2 files,
OFL licences, package integrity values, counts, and aggregate asset digests are
vendored under `frontend/src/assets/fonts/`; production performs no third-party
font request. A repository gate rejects SimSun/Song-style names, standalone
generic serif, retired stacks, non-semantic font declarations, altered assets,
missing CJK slices, and remote font URLs.

This boundary changes presentation only. It does not alter frontend routes,
application state, backend APIs, shared contracts, Engine behavior, privacy
rules, or operator workflows.
```

- [ ] **Step 3: Prepend the completed progress record**

Insert this exact entry immediately below the `#` title in `docs/progress.md`:

```markdown

## 2026-08-11 - REQ-FE-TYPOGRAPHY-001 platform typography and no-SimSun guard

- requirement state: `COMPLETED`
- scope: complete frontend typography only; no route, state, backend, shared
  contract, API, Engine, privacy, colour, spacing, animation, or interaction
  behavior changed
- RED evidence: the new repository contract failed on the absent source
  manifest and then on the absent semantic stylesheet/retired stacks; the
  provider contract failed on the former Aptos/Segoe prose token and default
  code token
- GREEN implementation: pinned self-hosted Fontsource 5.3.0 assets for Inter
  Variable, complete Noto Sans SC unicode-range slices, and IBM Plex Mono
  400/500/600; UI/Display/Mono CSS roles; document/native-control/heading/
  machine-value assignment; Ant Design prose/code token mapping; compatibility
  alias retained
- permanent gates: package integrity, OFL licences, aggregate SHA-256 asset
  digests, 101 Noto slices, `font-display: swap`, local URLs, import order,
  semantic usage, and the global Song-style/standalone-serif ban
- validation: focused repository and provider tests, complete frontend suite,
  complete repository suite, production Vite build, and `git diff --check` all
  pass on a Node.js runtime satisfying `>=22.19.0`
- browser acceptance: Inter, Noto Sans SC, and IBM Plex Mono report loaded;
  computed body/heading/form-control/Ant Design portal/machine-value roles match
  the approved mapping; desktop 1440x1000 and mobile 390x844 Workbench captures
  show no new overflow, clipping, or overlap and make no third-party request
- review: closing typography review has no unresolved Critical or Important
  finding
- boundary check: `README.md` needs no workflow change and
  `docs/api-contract.md` remains unchanged because delivery and contracts are
  unaffected
- next: stop after this requirement and await explicit user direction
```

- [ ] **Step 4: Mark the sprint requirement complete**

In `docs/sprint-current.md`, change only:

```diff
-APPROVED_FOR_IMPLEMENTATION
+COMPLETED
```

Then append:

```markdown

## Completion

Implementation, permanent gates, automated regression, production build,
real-browser font/loading/layout checks, documentation closure, and closing
review completed on 2026-08-11. No adjacent requirement is authorized.
```

- [ ] **Step 5: Verify documentation boundaries and final tests**

Run:

```powershell
git diff -- README.md docs/api-contract.md
rg -n "REQ-FE-TYPOGRAPHY-001|Platform Typography Boundary|COMPLETED" docs/architecture.md docs/progress.md docs/sprint-current.md
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-typography.spec.ts
npm run test:frontend
npm run test:repo
npm run build --prefix frontend
git diff --check
```

Expected: the first command shows no typography-attributable change (existing unrelated `README.md` edits remain user-owned); the three documentation markers are present; all test/build commands exit `0`; `git diff --check` is silent.

- [ ] **Step 6: Commit documentation closure**

```powershell
git add docs/architecture.md docs/progress.md docs/sprint-current.md
git commit -m "docs(frontend): close platform typography requirement"
```

Expected: only the three explicit documentation files are committed.

- [ ] **Step 7: Stop and report**

Report:

- modified files and the three vendored font families;
- the two test files changed/added and RED -> GREEN evidence;
- focused, frontend, repository, build, browser, and review outcomes;
- `REQ-FE-TYPOGRAPHY-001` is complete;
- suggested squashed commit message: `feat(frontend): establish self-hosted platform typography`;
- the running local verification URL from Task 4.

Do not start another requirement or expand this work into a broader visual redesign.
