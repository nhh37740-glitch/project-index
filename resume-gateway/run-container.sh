#!/bin/sh
set -eu

# Usage: ./run-container.sh /absolute/private/resume.pdf /absolute/private/token.sha256
# Both host files must be readable by the invoking non-root user. The script
# never reads or prints their contents and publishes only on host loopback.

if [ "$#" -ne 2 ]; then
  echo 'usage: run-container.sh <absolute-private-pdf> <absolute-private-digest-file>' >&2
  exit 2
fi
if [ "$(id -u)" -eq 0 ]; then
  echo 'run-container.sh must be invoked by a non-root user' >&2
  exit 2
fi
case "$1" in /*) ;; *) echo 'PDF path must be absolute' >&2; exit 2 ;; esac
case "$2" in /*) ;; *) echo 'digest path must be absolute' >&2; exit 2 ;; esac
if [ ! -f "$1" ] || [ ! -r "$1" ] || [ ! -f "$2" ] || [ ! -r "$2" ]; then
  echo 'private input files must exist and be readable' >&2
  exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
pdf_path=$(realpath -- "$1")
digest_path=$(realpath -- "$2")
image=${RESUME_GATEWAY_IMAGE:-portfolio-resume-gateway:local}
container=${RESUME_GATEWAY_CONTAINER:-portfolio-resume-gateway}
host_port=${RESUME_GATEWAY_PORT:-18105}
case "$host_port" in *[!0-9]*|'') echo 'RESUME_GATEWAY_PORT must be numeric' >&2; exit 2 ;; esac

if [ "${RESUME_GATEWAY_SKIP_BUILD:-0}" != 1 ]; then
  sudo docker build --tag "$image" "$script_dir"
fi
sudo docker run --detach \
  --name "$container" \
  --restart unless-stopped \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 64 \
  --memory 128m \
  --user "$(id -u):$(id -g)" \
  --publish "127.0.0.1:$host_port:8080" \
  --mount "type=bind,src=$pdf_path,dst=/run/private/resume.pdf,readonly" \
  --mount "type=bind,src=$digest_path,dst=/run/secrets/resume-token.sha256,readonly" \
  "$image"
