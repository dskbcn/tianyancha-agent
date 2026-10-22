#!/bin/sh
# Fails when eve cannot discover the agent (e.g. a skill whose YAML front matter does not parse,
# which stops `pnpm dev` at startup). `eve info` prints the diagnostics count either way.
out=$(pnpm exec eve info 2>&1)
echo "$out" | grep -E '^(Diagnostics|Skills|Tools) {2,}[0-9]'
echo "$out" | grep -qE '^Diagnostics +0 errors' || { echo "$out" | sed -n '/Discovery diagnostics/,$p'; exit 1; }
