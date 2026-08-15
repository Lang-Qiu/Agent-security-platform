from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import matplotlib


matplotlib.use("Agg")

from matplotlib import font_manager  # noqa: E402
from matplotlib import pyplot as plt  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402


Direction = Literal["higher", "lower"]

CANVAS = "#F7F9FB"
PASS = "#3C9D70"
BLOCK = "#C44A53"
EVIDENCE = "#263645"
MUTED = "#66727C"
GRID = "#DCE4EA"
CHART_X_MAX = 116
DIRECT_LABEL_OFFSET = 1.2

PDF_METADATA = {
    "Title": "Agent Security Platform report metrics",
    "Author": "Agent Security Platform",
    "Subject": "Deterministic report visualization",
    "Keywords": "agent security, evaluation, report",
    "Creator": "report/scripts/plot_report_figures.py",
    "Producer": "Matplotlib",
    "CreationDate": datetime(2026, 8, 11, tzinfo=timezone.utc),
    "ModDate": datetime(2026, 8, 11, tzinfo=timezone.utc),
}
PNG_METADATA = {"Software": "report/scripts/plot_report_figures.py"}


@dataclass(frozen=True)
class Metric:
    label: str
    numerator: int
    denominator: int
    value: float
    threshold: float
    direction: Direction


OVERALL_METRICS = (
    Metric("不安全样本召回", 159, 180, 88.33, 90.0, "higher"),
    Metric("高危及以上召回", 56, 60, 93.33, 95.0, "higher"),
    Metric("安全样本假警率", 2, 120, 1.67, 5.0, "lower"),
    Metric("扰动样本召回", 49, 54, 90.74, 85.0, "higher"),
    Metric("决策覆盖率", 298, 300, 99.33, 95.0, "higher"),
)

CATEGORY_RECALL = (
    Metric("信任边界越界", 20, 20, 100.0, 80.0, "higher"),
    Metric("敏感数据暴露", 19, 20, 95.0, 80.0, "higher"),
    Metric("工具调用劫持", 19, 20, 95.0, 80.0, "higher"),
    Metric("记忆中毒", 19, 20, 95.0, 80.0, "higher"),
    Metric("提示注入", 18, 20, 90.0, 80.0, "higher"),
    Metric("不安全副作用", 18, 20, 90.0, 80.0, "higher"),
    Metric("权限提升", 17, 20, 85.0, 80.0, "higher"),
    Metric("指令覆写", 15, 20, 75.0, 80.0, "higher"),
    Metric("越狱", 14, 20, 70.0, 80.0, "higher"),
)

OUTPUT_FILENAMES = {
    "overall_pdf": Path("plot-overall-metrics.pdf"),
    "overall_png": Path("plot-overall-metrics.png"),
    "category_pdf": Path("plot-category-recall.pdf"),
    "category_png": Path("plot-category-recall.png"),
}


def metric_passes_threshold(metric: Metric) -> bool:
    if metric.direction == "higher":
        return metric.value >= metric.threshold
    if metric.direction == "lower":
        return metric.value <= metric.threshold
    raise ValueError(f"unsupported threshold direction: {metric.direction}")


def category_passes_threshold(metric: Metric) -> bool:
    return metric_passes_threshold(metric)


def _configure_typography() -> None:
    preferred_fonts = (
        "Microsoft YaHei",
        "Noto Sans CJK SC",
        "Source Han Sans SC",
        "SimHei",
        "Arial Unicode MS",
        "DejaVu Sans",
    )
    installed = {font.name for font in font_manager.fontManager.ttflist}
    available = [font for font in preferred_fonts if font in installed]
    matplotlib.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": available or ["DejaVu Sans"],
            "axes.unicode_minus": False,
            "font.size": 10,
            "axes.labelsize": 10,
            "xtick.labelsize": 9,
            "ytick.labelsize": 10,
            "figure.facecolor": CANVAS,
            "axes.facecolor": CANVAS,
            "savefig.facecolor": CANVAS,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )


def _style_axes(ax) -> None:
    ax.set_axisbelow(True)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.yaxis.grid(False)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#C9D3DB")
    ax.tick_params(axis="x", colors=MUTED)
    ax.tick_params(axis="y", colors=EVIDENCE)


def _build_overall_figure() -> Figure:
    fig, ax = plt.subplots(figsize=(10, 6), dpi=200)
    y_positions = list(range(len(OVERALL_METRICS)))
    colors = [PASS if metric_passes_threshold(item) else BLOCK for item in OVERALL_METRICS]

    ax.barh(
        y_positions,
        [item.value for item in OVERALL_METRICS],
        height=0.58,
        color=colors,
        edgecolor="none",
    )
    ax.set_yticks(y_positions, labels=[item.label for item in OVERALL_METRICS])
    ax.invert_yaxis()
    ax.set_xlim(0, CHART_X_MAX)
    ax.set_xlabel("结果比例（%）", color=EVIDENCE)
    _style_axes(ax)

    for y, item in zip(y_positions, OVERALL_METRICS):
        passed = metric_passes_threshold(item)
        ax.vlines(item.threshold, y - 0.39, y + 0.39, color=EVIDENCE, linewidth=2.4)
        ax.text(
            item.threshold + 0.8,
            y - 0.44,
            f"阈值 {item.threshold:g}%",
            color=EVIDENCE,
            fontsize=8.5,
            va="bottom",
        )
        ax.text(
            max(item.value, item.threshold) + DIRECT_LABEL_OFFSET,
            y,
            f"{item.value:.2f}% | {item.numerator}/{item.denominator} | {'通过' if passed else '未达'}",
            color=EVIDENCE,
            fontsize=9,
            va="center",
        )

    ax.text(
        0,
        1.08,
        "整体指标与冻结阈值",
        transform=ax.transAxes,
        color=EVIDENCE,
        fontsize=12,
        fontweight="bold",
    )
    ax.text(
        0,
        1.01,
        "绿色：达到阈值；红色：未达到阈值。假警率按越低越好判定。",
        transform=ax.transAxes,
        color=MUTED,
        fontsize=9.5,
    )
    fig.subplots_adjust(left=0.12, right=0.96, top=0.84, bottom=0.10)
    return fig


def _build_category_figure() -> Figure:
    fig, ax = plt.subplots(figsize=(10, 6), dpi=200)
    y_positions = list(range(len(CATEGORY_RECALL)))
    colors = [PASS if category_passes_threshold(item) else BLOCK for item in CATEGORY_RECALL]

    ax.barh(
        y_positions,
        [item.value for item in CATEGORY_RECALL],
        height=0.56,
        color=colors,
        edgecolor="none",
    )
    ax.set_yticks(y_positions, labels=[item.label for item in CATEGORY_RECALL])
    ax.invert_yaxis()
    ax.set_xlim(0, CHART_X_MAX)
    ax.set_xlabel("召回率（%）", color=EVIDENCE)
    _style_axes(ax)

    threshold = CATEGORY_RECALL[0].threshold
    ax.axvline(threshold, color=EVIDENCE, linewidth=2.4, linestyle=(0, (5, 3)))
    ax.text(
        threshold + 0.8,
        len(CATEGORY_RECALL) - 0.35,
        f"冻结阈值 {threshold:g}%",
        color=EVIDENCE,
        fontsize=8.5,
        va="top",
    )

    for y, item in zip(y_positions, CATEGORY_RECALL):
        passed = category_passes_threshold(item)
        ax.text(
            max(item.value, item.threshold) + DIRECT_LABEL_OFFSET,
            y,
            f"{item.value:g}% | {item.numerator}/{item.denominator} | {'通过' if passed else '未达'}",
            color=EVIDENCE,
            fontsize=8.8,
            va="center",
        )

    ax.text(
        0,
        1.08,
        "九类风险召回与 80% 阈值",
        transform=ax.transAxes,
        color=EVIDENCE,
        fontsize=12,
        fontweight="bold",
    )
    ax.text(
        0,
        1.01,
        "每类 20 个样本；红色标记低于冻结阈值的类别。",
        transform=ax.transAxes,
        color=MUTED,
        fontsize=9.5,
    )
    fig.subplots_adjust(left=0.11, right=0.96, top=0.84, bottom=0.10)
    return fig


def _save_figure(fig: Figure, pdf_path: Path, png_path: Path) -> None:
    fig.savefig(pdf_path, format="pdf", metadata=PDF_METADATA)
    fig.savefig(png_path, format="png", dpi=200, metadata=PNG_METADATA)
    plt.close(fig)


def render_all(output_dir: Path) -> list[Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    _configure_typography()

    overall = _build_overall_figure()
    _save_figure(
        overall,
        output_dir / OUTPUT_FILENAMES["overall_pdf"],
        output_dir / OUTPUT_FILENAMES["overall_png"],
    )

    category = _build_category_figure()
    _save_figure(
        category,
        output_dir / OUTPUT_FILENAMES["category_pdf"],
        output_dir / OUTPUT_FILENAMES["category_png"],
    )
    return list(OUTPUT_FILENAMES.values())


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render deterministic report metric figures.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).parents[1] / "figures",
        help="Directory for PDF and PNG figure files.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    for filename in render_all(args.output_dir):
        print(args.output_dir / filename)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
