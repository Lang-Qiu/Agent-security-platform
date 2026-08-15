#!/usr/bin/env bash
# 竞赛报告构建脚本
#
# ⚠️ 编译顺序不可调换：biber 必须在首次 xelatex 之后运行，
#    否则 .aux 中尚无新增的 \cite 键，参考文献会缺条目。
#    完整顺序为 xelatex -> biber -> xelatex -> xelatex
#    （第二次 xelatex 解引文，第三次解交叉引用与页码）

set -e
cd "$(dirname "$0")"

echo "[1/4] xelatex (生成 .aux)"
xelatex -interaction=nonstopmode main.tex > /dev/null

echo "[2/4] biber   (解析参考文献)"
biber main > /dev/null

echo "[3/4] xelatex (植入参考文献)"
xelatex -interaction=nonstopmode main.tex > /dev/null

echo "[4/4] xelatex (解交叉引用与页码)"
xelatex -interaction=nonstopmode main.tex > /dev/null

echo ""
echo "=== 构建结果 ==="
grep -E "Output written" main.log | tail -1

echo ""
echo "=== 未解析引用检查 ==="
if grep -q "undefined" main.log; then
  grep -E "Citation|Reference" main.log | grep undefined | head -10
else
  echo "全部已解析"
fi

echo ""
echo "=== 匿名性检查（提交前必过）==="
if grep -riE "大学|学院|指导教师|@[a-z]+\.edu" chapters/ 2>/dev/null | grep -v "^\s*%"; then
  echo "⚠️ 发现疑似违反匿名要求的内容，须逐条核查"
else
  echo "正文无学校名/教师名/教育邮箱"
fi
