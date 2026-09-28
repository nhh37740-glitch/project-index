#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

script_dir="$(cd "$(dirname "$0")" && pwd)"
wrangler_bin="${WRANGLER_BIN:-wrangler}"
link_file="${RESUME_LINK_FILE:-$HOME/.portfolio-resume-link}"

token="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
test "${#token}" -eq 43 || { echo 'token generation failed' >&2; exit 1; }
digest="$(printf '%s' "$token" | sha256sum | cut -d ' ' -f1)"
printf '%s' "$digest" | "$wrangler_bin" secret put RESUME_TOKEN_SHA256 \
  --config "$script_dir/wrangler.jsonc" >/dev/null
printf 'https://portfolio.72945645.xyz/resume.html#resume=%s\n' "$token" > "$link_file"
chmod 0600 "$link_file"
unset token digest
printf 'private link saved to %s\n' "$link_file"
