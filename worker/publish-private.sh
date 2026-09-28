#!/usr/bin/env bash
set -euo pipefail

pdf="${1:?private PDF path required}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
wrangler_bin="${WRANGLER_BIN:-wrangler}"
namespace_id=dbd6554181574ed29f79716593f69e15

test -f "$pdf" || { echo 'private PDF is unavailable' >&2; exit 1; }
test "$(wc -c < "$pdf")" -le 26214400 || { echo 'private PDF exceeds KV limit' >&2; exit 1; }
test "$(head -c 5 "$pdf")" = '%PDF-' || { echo 'private file is not a PDF' >&2; exit 1; }
"$wrangler_bin" kv key put private:resume-pdf \
  --namespace-id "$namespace_id" --path "$pdf" \
  --remote --config "$script_dir/wrangler.jsonc" >/dev/null
echo 'uploaded private PDF to KV'
