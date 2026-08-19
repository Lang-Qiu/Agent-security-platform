# Landing assets provenance

All files in this directory are first-party, project-owned landing-page assets.
The source tree does not load assets from a reference site or a third-party CDN.

## Product preview

- `console-overview-2x.webp`
  - Status: **provisional truthful Console capture; independent or user visual
    approval remains required**.
  - Source application revision: `5f4dfbc74fdf1078dae8dc9a974f22ea2287285e`.
    This is a capture of the Console `/tasks` route, not `/overview`.
    `/overview` remains ineligible because it is backed by
    `frontend/src/mocks/overview.ts`.
  - Truthful state: a local first-party backend was started at
    `http://127.0.0.1:3000`, then three local `asset_scan` tasks were created
    through `POST /api/tasks`. The visible Console state reports `Backend API`
    and `3 task(s)`; no mock fallback, fake metric, or Showcase fixture was
    used.
  - Capture method: Chrome + Playwright, `1200x750` CSS viewport at DPR 2,
    yielding a browser-chrome-free `2400x1500` source PNG. The display asset is
    a local Chrome Canvas WebP encode at quality `0.78`; its raw source remains
    under `docs/temp/console-capture/console-task-queue-2400x1500-source.png`.
  - SHA-256: `B4055189F2C2DB96772A3C9B867EA58E41E4FA37F7A653D207A3908AAF95D8AE`.
  - Ownership: first-party / project-owned. The filename is retained as the
    Landing component contract; it must be described factually as a task-queue
    capture whenever provenance is presented.

## Generated visual assets

- `landing-noise.webp`
  - Source: deterministic offline generation; no downloaded texture.
  - Generation: 256x256 canvas, seed `0x415350`, xorshift32, luminance
    112-144, alpha 255, Chrome canvas encoder, WebP quality 0.35.
  - SHA-256: `066BBEB07ADD80D8032C666CC1D7562DFA99405DC4D34FEFCB27C2E6F0B6A293`.
  - License: project-owned generated asset.

- `agent-security-platform-og.png`
  - Source: project-owned Hero capture at `docs/temp/landing-visual/hero/hero-1440x900.png`.
  - Generation: deterministic first-party crop/resize to 1200x630 using local
    FFmpeg; no Linear, Wiz, or Vercel reference assets.
  - SHA-256: `63E18CB22ED41450B43105CF735DCF9C9565660F01EF5EA8365383116D2EFF65`.
  - License: project-owned generated preview.

## Fonts

- `geist-latin.woff2` and `geist-mono-latin.woff2`
  - Source: pinned `geist@1.7.2` package, npm integrity
    `sha512-Gu5lDFa3pLRyoBlBPf0QIFHVdWAnpco7fS1bJm41jyLPFoguBgiubseUN2oLXMgqZ7uxAxDoXcHMhCY/fOTTgg==`.
  - Transformation: copied variable Latin faces without modification.
  - License: SIL Open Font License 1.1; upstream `LICENSE.txt`.
  - SHA-256 (Geist): `A369FCF5628EA2AA4E1B9E2EC6A5B3624E365BDA588E1F0F2F12B564F728FBB8`.
  - SHA-256 (Geist Mono): `FBA8F577F38A2BBCBE818EFA6348DD58F36303A10B8737C42FEFAD275BE563AB`.

- `noto-sans-sc-regular.woff2` and `noto-sans-sc-semibold.woff2`
  - Source: pinned `@fontsource/noto-sans-sc@5.3.0`, npm integrity
    `sha512-HeqIlGm0+ohOKxZLuHj1qW6r6avHH0OWdKERAcSDI0RQ+MXrteuLKA+M+5eOA8rYy0MFvOR5AT0fQo2rUkye0Q==`.
  - Transformation: FontTools `pyftsubset` 4.63.0, authored
    `frontend/src/content/landing-content.ts` as the text inventory,
    `--layout-features=*`, `--flavor=woff2`, `--no-hinting`.
  - License: SIL Open Font License 1.1; upstream `LICENSE`.
  - SHA-256 (regular): `C1365390A17AB89793303C1145124A990471D3894B8A67999CBAC8BFE024F801`.
  - SHA-256 (semibold): `151F71B716B137DB82ED882B380B117AD26665B68B1E6DFF32E104F9EBC18E07`.

The complete upstream license notices are the `LICENSE.txt` file in the
Geist 1.7.2 package and the `LICENSE` file in the Noto Sans SC 5.3.0 package.
