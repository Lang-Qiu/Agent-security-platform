# Spec: Platform Typography and No-SimSun Guard

## Document Status

- Requirement ID: `REQ-FE-TYPOGRAPHY-001`
- Requirement: Platform-wide typography alignment for `sandbox-security/workbench`
- Date: 2026-08-11
- Status: `DRAFT_PENDING_USER_REVIEW`
- Delivery type: frontend visual-system change
- Implementation authority: not yet granted; implementation starts only after
  written-spec approval and an approved implementation plan

This document records the design approved in the brainstorming session. The
document itself is a documentation-only change, so the repository's full TDD
workflow does not apply to this commit. The later production change must use
the repository RED -> GREEN workflow.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/docs.instructions.md`
- `docs/sprint-current.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `frontend/src/app/AppProviders.tsx`
- `frontend/src/main.tsx`
- `frontend/src/styles/app.css`
- `frontend/src/styles/console-theme.ts`
- `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`

The user's latest explicit requirement is authoritative for this design: update
the typography of the Sandbox Security Workbench, make the no-SimSun rule apply
to the complete frontend, and keep the result aligned with the platform's dark
technology-console style.

## Problem

The application currently declares the following prose stack in two separate
places:

```text
Aptos, Segoe UI Variable Text, Segoe UI, sans-serif
```

The Workbench and Showcase use a separate machine-value stack:

```text
JetBrains Mono, Fira Code, ui-monospace, SFMono-Regular, monospace
```

Neither stack provides a bundled Simplified Chinese font. Chinese glyphs are
therefore resolved through operating-system fallback, which produces visible
cross-platform differences and can reach an unwanted Song-style font on some
environments. The prose stack is also duplicated between `body` CSS and Ant
Design's `ConfigProvider`, allowing future drift.

The current sprint design already established the intended direction: Inter
for prose and a monospace family for identifiers and digests. This design makes
that direction explicit, adds deterministic Chinese coverage, and promotes it
to a platform-wide contract.

## Goals

1. Prevent SimSun/Song-style or generic serif fonts from being selected by any
   frontend route, including Ant Design overlays rendered through portals.
2. Give Chinese UI text deterministic, readable sans-serif coverage.
3. Give English UI text, titles, and key metrics a restrained technical-console
   character that fits the existing dark slate and cyan visual system.
4. Preserve monospace treatment for genuine machine values without applying it
   to long Chinese prose.
5. Keep font delivery self-hosted and available without a runtime connection to
   a third-party font service.
6. Centralize typography behind semantic roles so future pages inherit the same
   contract without component-local font stacks.

## Non-Goals

- No backend, shared-contract, API, route, state, or data-flow change.
- No page layout, copy, colour, spacing, radius, animation, or interaction
  redesign.
- No broad component markup rewrite.
- No per-component decorative font selection.
- No runtime font loader, third-party CDN, analytics, or font availability API.
- No claim that a machine-value column is visually monospaced for Chinese
  glyphs; Chinese glyphs fall back to the approved UI sans family.

## Approved Decisions

| ID | Decision |
| --- | --- |
| D1 | The no-SimSun rule applies to the complete frontend, not only `/sandbox-security/workbench`. |
| D2 | Font resources may be added and must be self-hosted. Runtime third-party font loading is excluded. |
| D3 | The approved family set is Inter, Noto Sans SC, and IBM Plex Mono. |
| D4 | Typography is assigned through UI, Display, and Mono semantic roles. |
| D5 | Chinese UI text uses Noto Sans SC; English text resolves to Inter because it is first in the UI and Display stacks. |
| D6 | Code, IDs, enums, timestamps, digests, byte counts, and audit fields use IBM Plex Mono. |
| D7 | Existing `data-mono="true"` and `var(--console-mono)` semantics remain valid; their underlying family changes. |
| D8 | Font loading uses `font-display: swap` with an explicit non-Song sans-serif fallback chain. |
| D9 | The change is test-driven and includes a permanent repository-level typography guard. |

## Typography Architecture

### Self-Hosted Assets

The frontend bundles WOFF2 resources under `frontend/src/assets/fonts/` and
serves them from the same origin as the application. Each family includes its
upstream open-source licence and attribution. Asset versions and checksums are
pinned and recorded when acquired so a later rebuild does not silently change
font metrics.

The delivery set is deliberately bounded:

| Family | Coverage | Required weights | Purpose |
| --- | --- | --- | --- |
| Inter Variable | Latin and supported symbols | `400 700` | English UI, navigation, headings, emphasis, metrics |
| Noto Sans SC Variable | Simplified Chinese webfont ranges, including the complete app/API Chinese character domain rather than a current-copy-only subset | `400 700` | Chinese UI and prose |
| IBM Plex Mono | Latin and supported symbols | `400`, `500`, `600` | Machine values and technical labels |

Noto Sans SC must use unicode-range splitting or an equivalent complete
Simplified Chinese webfont distribution. Subsetting only the Chinese strings
currently present in the repository is prohibited because API-driven content
would then escape the bundled glyph set.

### Semantic Tokens

`frontend/src/styles/typography.css` owns the `@font-face` declarations and the
three public font-family custom properties:

```css
--console-font-ui
--console-font-display
--console-font-mono
```

The intended stacks are:

```text
UI / Display:
Inter -> Noto Sans SC -> PingFang SC -> Microsoft YaHei UI ->
Microsoft YaHei -> Hiragino Sans GB -> Arial -> sans-serif

Mono:
IBM Plex Mono -> SFMono-Regular -> Consolas -> Liberation Mono ->
Noto Sans SC -> PingFang SC -> Microsoft YaHei UI -> Microsoft YaHei ->
monospace
```

The bundled families are first. The remaining entries are failure fallbacks,
not expected primary rendering paths. No stack may contain `SimSun`, `NSimSun`,
`Songti`, `STSong`, `宋体`, or a standalone generic `serif` family.

`--console-mono` remains as a compatibility alias to
`--console-font-mono`. Existing Workbench and Showcase rules therefore keep
their semantic meaning while the platform gains the new role names.

### Application Boundary

`frontend/src/main.tsx` imports `typography.css` after Ant Design's reset and
before `app.css`. `AppProviders` connects Ant Design's `fontFamily` to
`var(--console-font-ui)` and `fontFamilyCode` to
`var(--console-font-mono)`.

The document body, application root, Ant Design application wrapper, and native
form controls inherit the UI role. Headings use the Display role. Native code
elements and explicit machine-value markers use the Mono role. The design does
not apply `font-family` through the universal selector because doing so could
override icon or third-party component font semantics.

Ant Design menus, dropdowns, modals, notifications, tooltips, and other portal
content receive the family through the root ConfigProvider token. This closes
the main path by which an overlay could otherwise return to browser defaults.

## Semantic Mapping

| Interface content | Role | Weight/numeric treatment |
| --- | --- | --- |
| Body copy and Chinese descriptions | UI | `400`; long-form line height remains unchanged |
| Menu items, field labels, buttons, tabs | UI | `500` or existing semantic emphasis |
| Inputs, textareas, select values, validation and error copy | UI | inherit control weight; never Mono solely because content is entered by an operator |
| Brand, page titles, panel titles, key conclusions | Display | `600` or `700` |
| KPI and verdict numbers intended for emphasis | Display | existing weight plus `tabular-nums` only when values must align |
| IDs, hashes, digests, policy IDs, request IDs | Mono | `400` or `500`; `tabular-nums` |
| Enums, status short codes, timestamps, byte counts, elapsed times | Mono | `400` or `500`; `tabular-nums` |
| Technical table headers and Workbench eyebrows | Mono | `500`; existing uppercase treatment remains |
| Chinese risk explanation, error message, help text | UI | never Mono |
| Ordinary numeric prose | UI | not promoted to Mono without a comparison/alignment need |

Existing `data-mono="true"` markers and the inline
`fontFamily: "var(--console-mono)"` declarations are retained unless a test
shows a marker is semantically wrong. This requirement changes the font system,
not the meaning of existing machine-field annotations.

## Data Flow and Failure Behaviour

There is no application data-flow change. CSS requests font assets from the
same Vite-built origin. There is no JavaScript font orchestration and no user
state tied to font loading.

Every `@font-face` declaration uses `font-display: swap`. If a font file is
unavailable or fails to decode, the browser immediately uses the next explicit
approved family. The failure does not block controls, navigation, evaluation,
or audit rendering. Because the fallback chains remain sans-serif/monospace and
name approved Chinese fonts before their generic family, a font failure does
not authorize a Song-style fallback.

The production build must fail if a referenced font asset is absent. Runtime
font failure is otherwise a presentation degradation and does not create an
application error surface.

## Planned Files

| Path | Planned responsibility |
| --- | --- |
| `frontend/src/assets/fonts/**` | Pinned WOFF2 assets, licences, attribution, and checksums |
| `frontend/src/styles/typography.css` | `@font-face`, semantic font tokens, base inheritance rules |
| `frontend/src/main.tsx` | Load typography before application styles |
| `frontend/src/app/AppProviders.tsx` | Connect Ant Design UI and code tokens |
| `frontend/src/styles/app.css` | Remove Aptos/Segoe declarations and repoint `--console-mono` |
| `frontend/src/styles/console-theme.provider.spec.tsx` | Verify resolved Ant Design typography tokens |
| `tests/repository/frontend-typography.spec.ts` | Permanent source, asset, licence, and fallback guard |
| `docs/architecture.md` | Record the frontend typography layer and ownership |
| `docs/progress.md` | Record RED/GREEN evidence and final verification |
| `README.md` | Update only if the font asset or licence workflow needs operator/developer instructions |

`docs/api-contract.md` remains unchanged because the requirement has no API or
cross-boundary contract effect.

## TDD Design

### RED

Before production CSS, assets, or provider code is changed:

1. Add `tests/repository/frontend-typography.spec.ts`.
2. Assert that the three semantic roles, local WOFF2 faces, approved weights,
   `font-display: swap`, licences, and attribution/checksum record exist.
3. Assert that all scanned frontend source files reject the prohibited named
   families and reject a standalone `serif` family without falsely matching
   `sans-serif`.
4. Assert that the current duplicated Aptos/Segoe prose declarations are gone
   and global font-family declarations outside `@font-face` consume semantic
   tokens.
5. Extend the ConfigProvider test to expose and assert `fontFamily` and
   `fontFamilyCode`.
6. Run the narrow repository and provider tests and confirm that they fail for
   missing typography tokens/assets and the current Aptos/Segoe values, not for
   an import, syntax, or environment error.

### GREEN

Add the smallest asset set and CSS/provider wiring that satisfies the approved
roles. Preserve component markup unless a failing semantic-marker test proves a
specific annotation is wrong. Run the narrow tests until green, then run the
complete frontend and repository suites.

### Verification

The implementation is complete only after all of the following pass:

- focused typography repository test;
- focused ConfigProvider test;
- complete frontend test suite;
- complete repository test suite;
- frontend production build, including successful resolution of every WOFF2
  URL;
- `git diff --check`;
- real-browser `document.fonts.check` checks with representative Latin,
  Simplified Chinese, and machine-value strings;
- real-browser computed-family inspection for body text, a heading, a form
  control, an Ant Design portal, and a `data-mono="true"` Workbench value;
- desktop and mobile Workbench captures showing no text overlap, clipping, or
  layout shift caused by the new font metrics.

## Acceptance Criteria

1. Every frontend route inherits the approved typography roles.
2. `sandbox-security/workbench` renders Chinese prose through Noto Sans SC,
   English UI/display text through Inter, and marked machine values through IBM
   Plex Mono when the bundled faces load.
3. Ant Design portal content uses the same UI/Mono contract.
4. No scanned frontend source or family stack contains a prohibited Song-style
   family or standalone `serif` fallback.
5. Font delivery performs no third-party runtime request and works offline
   after the application assets are available.
6. Missing bundled fonts degrade to explicit approved sans-serif/monospace
   fallbacks without breaking interaction.
7. Existing behaviour, routes, API contracts, privacy rules, and Workbench data
   semantics remain unchanged.
8. Focused tests, full frontend tests, repository tests, production build, and
   browser acceptance checks pass.

## Documentation Closure

After GREEN, implementation updates `docs/architecture.md` and
`docs/progress.md`. `README.md` is checked and updated only if font acquisition,
licensing, or local development needs a durable instruction. The API contract
is explicitly checked and remains unchanged.

The requirement stops after typography verification and documentation closure.
It does not authorize an adjacent visual redesign.
