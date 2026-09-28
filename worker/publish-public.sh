#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
wrangler_bin="${WRANGLER_BIN:-wrangler}"
namespace_id=dbd6554181574ed29f79716593f69e15
config="$script_dir/wrangler.jsonc"

python3 "$repo_root/deploy/validate.py"
for name in index.html projects.html repositories.html resume.html styles.css favicon.svg resume-access.js; do
  "$wrangler_bin" kv key put "public:$name" \
    --namespace-id "$namespace_id" --path "$repo_root/web/$name" \
    --remote --config "$config" >/dev/null
  printf 'uploaded public:%s\n' "$name"
done
"$wrangler_bin" deploy --config "$config"
