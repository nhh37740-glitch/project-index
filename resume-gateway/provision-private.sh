#!/bin/sh
set -eu
set +x
umask 077

if [ "$#" -ne 2 ]; then
  echo 'usage: provision-private.sh <private-directory> <https-origin>' >&2
  exit 2
fi
private_dir=$1
origin=${2%/}
case "$private_dir" in /*) ;; *) echo 'private directory must be absolute' >&2; exit 2 ;; esac
case "$origin" in https://*) ;; *) echo 'origin must use HTTPS' >&2; exit 2 ;; esac
test -f "$private_dir/resume.pdf" || { echo 'resume.pdf is missing' >&2; exit 2; }
test ! -e "$private_dir/resume-token.sha256" || { echo 'digest already exists' >&2; exit 2; }
test ! -e "$private_dir/resume-link.txt" || { echo 'private link already exists' >&2; exit 2; }

token=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
test "${#token}" -eq 43 || { echo 'token generation failed' >&2; exit 1; }
printf '%s' "$token" | sha256sum | cut -d ' ' -f1 > "$private_dir/resume-token.sha256"
printf '%s/resume.html#resume=%s\n' "$origin" "$token" > "$private_dir/resume-link.txt"
chmod 600 "$private_dir/resume-token.sha256" "$private_dir/resume-link.txt"
unset token
echo 'private digest and link saved outside the repository'
