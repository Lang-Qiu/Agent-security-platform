#!/bin/sh
set -eu

input=/data/input/security-risk-analysis.md
output=/data/output/security-risk-analysis.pdf

test -f "$input"
test -d /data/output
test -n "${SOURCE_DATE_EPOCH:-}"

exec pandoc "$input" \
  --from=gfm \
  --standalone \
  --pdf-engine=xelatex \
  --resource-path=/data/input \
  --metadata=title:"Track 1 Security Risk Analysis" \
  --metadata=author:"Agent Security Platform" \
  --metadata=date:"" \
  --variable=mainfont:"Latin Modern Roman" \
  --variable=CJKmainfont:"FandolSong-Regular" \
  --output="$output"
