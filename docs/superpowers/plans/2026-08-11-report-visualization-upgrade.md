# Competition Report Visualization Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all 19 existing report figures into a coherent, evidence-led visual system while preserving every figure label, table, code listing, measured value, and original attack-replay screenshot.

**Architecture:** Quantitative charts are generated deterministically by a small Python/Matplotlib module with testable data contracts. Mechanism and process figures remain native LaTeX/TikZ and share one visual-style file. Screenshot evidence remains unmodified and is placed inside consistent LaTeX evidence frames; two optional GPT-image introduction slots use `\IfFileExists` so missing assets render an explicit placeholder.

**Tech Stack:** Python 3.11, `unittest`, Matplotlib 3.10, XeLaTeX, TikZ, Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), PowerShell.

---

## File Map

- Create `report/tests/test_plot_report_figures.py`: executable unit tests for fixed metric/category datasets, threshold polarity, deterministic render outputs, and the command-line entry point.
- Create `report/scripts/plot_report_figures.py`: single source of truth for the two measured datasets and deterministic Matplotlib PDF/PNG generation.
- Create `report/visual-style.tex`: shared report color tokens, TikZ styles, callout/evidence macros, and optional-image placeholder macro.
- Create `report/visual-prompts.md`: two ready-to-use GPT-image-2 prompts with aspect ratio, safety, anonymity, and truthfulness constraints.
- Create `report/figures/plot-overall-metrics.pdf` and `.png`: five-metric threshold comparison.
- Create `report/figures/plot-category-recall.pdf` and `.png`: nine-category recall comparison against the frozen 80% threshold.
- Modify `report/main.tex`: load shared visual styles and the TikZ libraries required by upgraded figures.
- Modify `report/chapters/ch1-overview.tex`: replace the problem-role diagram with a consequence-first narrative flow and add the first optional introduction-image slot.
- Modify `report/chapters/ch2-design.tex`: upgrade the cascade, four execution points, four actions, three bindings, and redaction comparison while preserving labels and five code listings.
- Modify `report/chapters/ch3-testing.tex`: upgrade P6/P7 chains and short-circuit flow, replace two hand-drawn charts with generated charts, and frame six original screenshots without altering their pixels.
- Modify `report/chapters/ch4-innovation.tex`: rebuild the innovation figure as three parallel mechanisms converging on a reusable closed loop.
- Modify `report/chapters/ch5-summary.tex`: rebuild the cross-framework topology and add the second optional introduction-image slot.
- Modify `research-state.md`: record the visual revision decisions, generated artifacts, and reproducibility commands.
- Modify `docs/progress.md`: record completion evidence for this report-only requirement.
- Do not modify `report/references.bib`, any screenshot PNG, backend, frontend, engines, or shared contracts.

### Task 1: Lock the report baseline

**Files:**
- Inspect: `report/main.pdf`
- Inspect: `report/main.tex`
- Inspect: `report/chapters/*.tex`

- [ ] **Step 1: Record structural counts**

Run:

```powershell
rg -c '\\begin\{figure' report/chapters/*.tex
rg -c '\\begin\{table' report/chapters/*.tex
rg -c '\\begin\{lstlisting' report/chapters/*.tex
rg -n '\\label\{fig:' report/chapters/*.tex
```

Expected: 19 figures, 11 tables, five listings, and a stable list of 19 `fig:` labels.

- [ ] **Step 2: Record the compiled baseline**

Run:

```powershell
pdfinfo report/main.pdf | Select-String 'Pages|Page size'
Get-FileHash -Algorithm SHA256 report/main.pdf
```

Expected: the existing 34-page A4 report and SHA-256 `EB8CA9E53BAEB22E946BB3E05487279B46A3ADFA4EF6D83E88EB27F3F99892CC`.

### Task 2: Specify chart behavior with failing tests (RED)

**Files:**
- Create: `report/tests/test_plot_report_figures.py`
- Test: `report/tests/test_plot_report_figures.py`

- [ ] **Step 1: Write tests against the wished-for plotting API**

The tests import these names from `report/scripts/plot_report_figures.py`:

```python
OVERALL_METRICS
CATEGORY_RECALL
OUTPUT_FILENAMES
metric_passes_threshold
render_all
```

They assert the exact data below:

```python
expected_overall = [
    ("不安全样本召回", 159, 180, 88.33, 90.0, "higher"),
    ("高危及以上召回", 56, 60, 93.33, 95.0, "higher"),
    ("安全样本假警率", 2, 120, 1.67, 5.0, "lower"),
    ("扰动样本召回", 49, 54, 90.74, 85.0, "higher"),
    ("决策覆盖率", 298, 300, 99.33, 95.0, "higher"),
]

expected_categories = [
    ("信任边界越界", 20, 20, 100.0),
    ("敏感数据暴露", 19, 20, 95.0),
    ("工具调用劫持", 19, 20, 95.0),
    ("记忆中毒", 19, 20, 95.0),
    ("提示注入", 18, 20, 90.0),
    ("不安全副作用", 18, 20, 90.0),
    ("权限提升", 17, 20, 85.0),
    ("指令覆写", 15, 20, 75.0),
    ("越狱", 14, 20, 70.0),
]
```

Tests must also assert that lower-is-better false-positive rate passes at `1.67 <= 5`, the first two overall metrics fail their frozen thresholds, all four other categories below 80 fail, and `render_all(tmp_path)` produces the four declared PDF/PNG files with PDF and PNG signatures.

- [ ] **Step 2: Run the tests and verify the intended failure**

Run:

```powershell
python -m unittest discover -s report/tests -p 'test_*.py' -v
```

Expected: ERROR because `report/scripts/plot_report_figures.py` does not exist. This is the intended RED condition; import path or test syntax errors are not acceptable substitutes.

### Task 3: Implement deterministic chart generation (GREEN)

**Files:**
- Create: `report/scripts/plot_report_figures.py`
- Generate: `report/figures/plot-overall-metrics.pdf`
- Generate: `report/figures/plot-overall-metrics.png`
- Generate: `report/figures/plot-category-recall.pdf`
- Generate: `report/figures/plot-category-recall.png`
- Test: `report/tests/test_plot_report_figures.py`

- [ ] **Step 1: Implement immutable metric records and polarity-aware thresholds**

Use a frozen `Metric` dataclass with fields `label`, `numerator`, `denominator`, `value`, `threshold`, and `direction`. `metric_passes_threshold` returns `value >= threshold` for `higher` and `value <= threshold` for `lower`.

- [ ] **Step 2: Implement the two horizontal charts**

Use the approved palette (`#237A8E`, `#3C9D70`, `#E59B45`, `#C44A53`, `#263645`, `#F7F9FB`), direct percentage labels, numerator/denominator annotations, visible threshold markers, Chinese font fallback discovery, no external data access, and stable figure dimensions. The overall chart must explicitly state that false-positive rate is lower-is-better; the category chart must sort by the fixed report order and distinguish categories below 80% using both red color and a text status.

- [ ] **Step 3: Render all outputs through one CLI**

Run:

```powershell
python report/scripts/plot_report_figures.py --output-dir report/figures
```

Expected: four non-empty outputs, two vector PDFs and two 200-DPI PNG previews.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
python -m unittest discover -s report/tests -p 'test_*.py' -v
```

Expected: all chart tests pass with zero failures and zero errors.

- [ ] **Step 5: Check deterministic data and file signatures**

Run the renderer twice and compare SHA-256 hashes of all four outputs. Expected: hashes are identical because fixed metadata and fixed inputs are used.

### Task 4: Add the shared LaTeX visual language

**Files:**
- Create: `report/visual-style.tex`
- Modify: `report/main.tex`

- [ ] **Step 1: Define semantic colors and TikZ styles**

Define `reportCanvas`, `reportSystem`, `reportPass`, `reportEscalate`, `reportBlock`, and `reportEvidence`; reusable styles must cover numbered steps, process nodes, decision nodes, evidence nodes, failed links, successful links, and compact annotation pills. Every status style must encode meaning with text/border/shape in addition to color.

- [ ] **Step 2: Define reusable figure framing macros**

Add macros for a top-of-figure reading conclusion, a dark evidence panel, screenshot metadata strip, and optional generated image. The optional-image macro must use `\IfFileExists{#1}` and otherwise render a bounded placeholder labelled `待生成介绍图` with a concise purpose line.

- [ ] **Step 3: Load the style once**

In `report/main.tex`, load any required TikZ libraries (`calc`, `matrix`, `shapes.multipart`, `decorations.pathreplacing`) and `\input{visual-style.tex}` after packages/color support are available.

### Task 5: Upgrade Chapter 1 problem narrative

**Files:**
- Modify: `report/chapters/ch1-overview.tex`
- Preserve label: `fig:problem-role`

- [ ] **Step 1: Rebuild the problem-role figure**

Use a five-step consequence-first flow: untrusted external content -> model planning -> tool parameters -> concrete attack consequence -> runtime guard. Show the three concrete consequence classes already supported by the report (unauthorized send, sensitive-data exfiltration, persistent memory contamination) and position the middleware at the last responsible execution point.

- [ ] **Step 2: Add the first optional introduction-image slot**

Use the shared optional-image macro with path `figures/gpt-agent-action-risk.png`. The placeholder must compile without that file and must not claim that an image has been generated.

### Task 6: Upgrade Chapter 2 mechanism figures

**Files:**
- Modify: `report/chapters/ch2-design.tex`
- Preserve labels: `fig:cascade`, `fig:arch`, `fig:four-actions`, `fig:assistant-binding`, `fig:redaction`
- Preserve: five `lstlisting` environments and their code contents

- [ ] **Step 1: Rebuild the three-level cascade**

Make the core hierarchy visually dominant: deterministic base filter -> dynamic semantic judge -> policy/action closure. Annotate where high-risk short-circuiting occurs and where evidence is emitted.

- [ ] **Step 2: Rebuild the four execution-point architecture**

Number the four true OpenClaw call points, show shared request/evaluation state, and show actual tool invocation only after policy closure. Use solid links only for implemented paths.

- [ ] **Step 3: Rebuild the four-value decision figure**

Give `allow`, `ask`, `deny`, and `allow_sanitized` separate text-labelled cards with outcome semantics; emphasize that sanitized execution sends the transformed payload, not the original one.

- [ ] **Step 4: Rebuild the three-binding figure**

Show identity, request, and decision/evidence bindings as three independently verified links. Use a red failed-closure route for any mismatch.

- [ ] **Step 5: Rebuild redaction as a field-level before/after comparison**

Use one fully fictional but intuitive record. Mark retained, replaced, removed, and newly derived fields explicitly, and show that only the sanitized version reaches the tool call.

### Task 7: Upgrade Chapter 3 evidence and charts

**Files:**
- Modify: `report/chapters/ch3-testing.tex`
- Preserve labels: `fig:p6-chain`, `fig:p7-replay`, `fig:overall-metrics`, `fig:category-recall`, `fig:short-circuit-run`, `fig:case-sc002-c001`, `fig:case-sc002-c002`, `fig:case-sc001-c001`, `fig:case-sc003-c001`, `fig:case-sc003-c002`, `fig:case-sc003-c003`
- Preserve images: `report/figures/T1-SC-*.png`

- [ ] **Step 1: Rebuild P6 and P7 as dark evidence chains**

P6 must communicate structure and reproducibility: frozen manifest, complete inputs, decisions, signatures/receipts, and sealed result. P7 must communicate zero-network hermetic replay and equality checks without overstating what P6 alone proves.

- [ ] **Step 2: Replace hand-drawn metric figures**

Replace the two TikZ bar charts with `\includegraphics` calls to `plot-overall-metrics.pdf` and `plot-category-recall.pdf`. Preserve captions, labels, surrounding tables, values, and discussion.

- [ ] **Step 3: Rebuild the high-risk short-circuit flow**

Show the matched deterministic rule, skipped semantic judge, direct deny action, zero real tool executions, and evidence emission. Define the attack consequence in the figure, not only the detector name.

- [ ] **Step 4: Frame all six original screenshots**

Keep each `\includegraphics` source untouched. Wrap each in the shared evidence treatment and add a compact metadata strip with scenario number, attack consequence, terminal action, and recorded tool execution count. Do not crop, redraw, recolor, or overwrite the PNG files.

### Task 8: Upgrade Chapters 4 and 5 and write GPT prompts

**Files:**
- Modify: `report/chapters/ch4-innovation.tex`
- Modify: `report/chapters/ch5-summary.tex`
- Create: `report/visual-prompts.md`
- Preserve labels: `fig:innovation-loop`, `fig:cross-framework`

- [ ] **Step 1: Rebuild the innovation closed loop**

Use three parallel lanes (security mechanism, true execution point, reproducible evidence) that converge on a reusable runtime safety loop. Preserve the report's strength-forward wording and avoid framing essential mechanisms as optional trade-offs.

- [ ] **Step 2: Rebuild cross-framework topology**

Place the runtime safety middleware at the center. Use solid links for the implemented OpenClaw path and dashed links labelled as adapters for other agent frameworks, avoiding any claim that those integrations were empirically completed.

- [ ] **Step 3: Add the second optional image slot**

Use path `figures/gpt-cross-framework-middleware.png`; missing file renders the shared placeholder.

- [ ] **Step 4: Write two GPT-image-2 prompts**

Each prompt must specify subject, composition, visual hierarchy, palette, aspect ratio, typography exclusion, anonymity constraints, and the exact factual boundary. Prompt one depicts untrusted content becoming a real tool action and runtime interception. Prompt two depicts reusable middleware with one implemented OpenClaw adapter and clearly conceptual adapters for other frameworks.

### Task 9: Build and inspect the complete report

**Files:**
- Verify: `report/main.pdf`
- Verify: `report/main.log`
- Render: `.tmp-report/visual-upgrade-pages/*.png`

- [ ] **Step 1: Compile from LaTeX**

Run from `report/`:

```powershell
xelatex -interaction=nonstopmode -halt-on-error main.tex
biber main
xelatex -interaction=nonstopmode -halt-on-error main.tex
xelatex -interaction=nonstopmode -halt-on-error main.tex
```

Expected: all four commands exit 0 and `main.pdf` is produced by XeLaTeX.

- [ ] **Step 2: Enforce log gates**

Run:

```powershell
Select-String -Path report/main.log -Pattern 'LaTeX Error|Undefined control sequence|undefined references|Overfull \\hbox|Overfull \\vbox'
```

Expected: no matches.

- [ ] **Step 3: Recount protected structures**

Run the Task 1 count commands again. Expected: 19 figures, 11 tables, five listings, and the identical 19-label set.

- [ ] **Step 4: Render every page**

Run:

```powershell
pdftoppm -png -r 120 report/main.pdf .tmp-report/visual-upgrade-pages/page
```

Inspect a contact sheet and selected full-resolution pages. Expected: no blank pages, overlap, clipping, isolated captions, illegible labels, or screenshot distortion; Chapter 1 and Chapter 2 transitions remain coherent.

- [ ] **Step 5: Check grayscale differentiation**

Render selected mechanism, metric, evidence, and screenshot pages to grayscale and inspect that `allow`, `ask`, `deny`, `allow_sanitized`, pass/fail, and threshold status remain distinguishable through labels and shape/border differences.

- [ ] **Step 6: Check factual text extraction**

Run:

```powershell
pdftotext -layout report/main.pdf .tmp-report/visual-upgrade-main.txt
rg -n '88\.33|93\.33|1\.67|90\.74|99\.33|P6|P7|OpenClaw' .tmp-report/visual-upgrade-main.txt
```

Expected: all frozen metrics and evidence names remain present.

### Task 10: Document and close the single requirement

**Files:**
- Modify: `research-state.md`
- Modify: `docs/progress.md`
- Inspect only: `README.md`, `docs/architecture.md`, `docs/api-contract.md`

- [ ] **Step 1: Update the research state**

Record the approved visual direction, generated-file paths, source data, exact regeneration command, placeholder behavior, and final validation results.

- [ ] **Step 2: Update progress**

Record this as a report-only documentation/tooling requirement, including the RED/GREEN test evidence, figure/table/listing counts, PDF page count, and compilation/render checks. Do not change platform requirement status.

- [ ] **Step 3: Review documentation scope**

Confirm that `README.md`, `docs/architecture.md`, and `docs/api-contract.md` require no changes because no platform behavior, API, or architecture changed.

- [ ] **Step 4: Inspect the exact diff**

Run:

```powershell
git status --short
git diff -- docs/progress.md research-state.md report/main.tex report/chapters report/visual-style.tex report/visual-prompts.md report/scripts/plot_report_figures.py report/tests/test_plot_report_figures.py
```

Expected: only this requirement's files are included; unrelated `README.md`, `.runtime/`, `.superpowers/brainstorm/`, and `.tmp-report/` changes remain untouched.

- [ ] **Step 5: Suggested commit**

Stage only the explicit files above plus the four generated chart artifacts, then use:

```text
docs(report): upgrade evidence-led visual system
```
