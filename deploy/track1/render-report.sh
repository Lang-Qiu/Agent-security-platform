#!/bin/sh
set -eu

input=/data/input/security-risk-analysis.md
output=/data/output/security-risk-analysis.pdf

test -f "$input"
test -d /data/output
test -n "${SOURCE_DATE_EPOCH:-}"

# Use fonts packaged with TeX Live / Noto CJK in the report image.
exec pandoc "$input" \
  --from=gfm \
  --standalone \
  --pdf-engine=xelatex \
  --resource-path=/data/input \
  --metadata=title:"Track 1 Security Risk Analysis" \
  --metadata=author:"Agent Security Platform" \
  --metadata=date:"" \
  --variable=mainfont:"TeX Gyre Termes" \
  --variable=CJKmainfont:"Noto Serif CJK SC" \
  --output="$output"
