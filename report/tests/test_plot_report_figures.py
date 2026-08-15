import hashlib
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "plot_report_figures.py"


def load_plot_module():
    spec = importlib.util.spec_from_file_location("plot_report_figures", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"cannot load plotting module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PlotReportFiguresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plot = load_plot_module()

    def test_frozen_overall_metrics_keep_counts_values_and_threshold_polarity(self):
        expected = [
            ("不安全样本召回", 159, 180, 88.33, 90.0, "higher"),
            ("高危及以上召回", 56, 60, 93.33, 95.0, "higher"),
            ("安全样本假警率", 2, 120, 1.67, 5.0, "lower"),
            ("扰动样本召回", 49, 54, 90.74, 85.0, "higher"),
            ("决策覆盖率", 298, 300, 99.33, 95.0, "higher"),
        ]
        actual = [
            (item.label, item.numerator, item.denominator, item.value, item.threshold, item.direction)
            for item in self.plot.OVERALL_METRICS
        ]
        self.assertEqual(actual, expected)

    def test_frozen_category_recall_keeps_report_order_and_counts(self):
        expected = [
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
        actual = [
            (item.label, item.numerator, item.denominator, item.value)
            for item in self.plot.CATEGORY_RECALL
        ]
        self.assertEqual(actual, expected)

    def test_thresholds_use_direction_not_color_or_name(self):
        self.assertFalse(self.plot.metric_passes_threshold(self.plot.OVERALL_METRICS[0]))
        self.assertFalse(self.plot.metric_passes_threshold(self.plot.OVERALL_METRICS[1]))
        self.assertTrue(self.plot.metric_passes_threshold(self.plot.OVERALL_METRICS[2]))
        self.assertTrue(self.plot.metric_passes_threshold(self.plot.OVERALL_METRICS[3]))
        self.assertTrue(self.plot.metric_passes_threshold(self.plot.OVERALL_METRICS[4]))
        self.assertEqual(
            [self.plot.category_passes_threshold(item) for item in self.plot.CATEGORY_RECALL],
            [True, True, True, True, True, True, True, False, False],
        )

    def test_render_all_writes_declared_vector_and_preview_files(self):
        with tempfile.TemporaryDirectory() as output_dir:
            output_paths = self.plot.render_all(Path(output_dir))
            self.assertEqual(set(output_paths), set(self.plot.OUTPUT_FILENAMES.values()))
            for path in output_paths:
                output = Path(output_dir) / path
                self.assertTrue(output.exists(), output)
                self.assertGreater(output.stat().st_size, 1000, output)
                if output.suffix == ".pdf":
                    self.assertEqual(output.read_bytes()[:5], b"%PDF-")
                else:
                    self.assertEqual(output.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_cli_entry_point_renders_all_declared_outputs(self):
        with tempfile.TemporaryDirectory() as output_dir:
            completed = subprocess.run(
                [sys.executable, str(SCRIPT_PATH), "--output-dir", output_dir],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            for filename in self.plot.OUTPUT_FILENAMES.values():
                self.assertTrue((Path(output_dir) / filename).exists(), filename)

    def test_render_all_is_byte_deterministic_for_fixed_inputs(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            self.plot.render_all(Path(first))
            self.plot.render_all(Path(second))
            for filename in self.plot.OUTPUT_FILENAMES.values():
                first_hash = hashlib.sha256((Path(first) / filename).read_bytes()).hexdigest()
                second_hash = hashlib.sha256((Path(second) / filename).read_bytes()).hexdigest()
                self.assertEqual(first_hash, second_hash, filename)

    def test_charts_reserve_space_for_direct_value_labels(self):
        self.plot._configure_typography()
        cases = (
            (self.plot._build_overall_figure, self.plot.OVERALL_METRICS),
            (self.plot._build_category_figure, self.plot.CATEGORY_RECALL),
        )
        for builder, metrics in cases:
            with self.subTest(builder=builder.__name__):
                figure = builder()
                try:
                    right_limit = figure.axes[0].get_xlim()[1]
                    self.assertGreaterEqual(right_limit, max(item.value for item in metrics) + 15)
                finally:
                    self.plot.plt.close(figure)

    def test_direct_value_labels_start_after_bars_and_threshold_markers(self):
        self.plot._configure_typography()
        cases = (
            (self.plot._build_overall_figure, self.plot.OVERALL_METRICS),
            (self.plot._build_category_figure, self.plot.CATEGORY_RECALL),
        )
        for builder, metrics in cases:
            with self.subTest(builder=builder.__name__):
                figure = builder()
                try:
                    direct_labels = [text for text in figure.axes[0].texts if " | " in text.get_text()]
                    self.assertEqual(len(direct_labels), len(metrics))
                    for label, metric in zip(direct_labels, metrics):
                        self.assertGreater(label.get_position()[0], max(metric.value, metric.threshold))
                finally:
                    self.plot.plt.close(figure)


if __name__ == "__main__":
    unittest.main()
