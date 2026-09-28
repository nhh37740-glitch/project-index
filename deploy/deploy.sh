#!/usr/bin/env bash
set -euo pipefail
image="${1:?image tag required}"
name=project-index
args=(--detach --name "$name" --restart unless-stopped --read-only --tmpfs /tmp:size=16m --cap-drop ALL --security-opt no-new-privileges --memory 64m --cpus 0.25 -p 127.0.0.1:8092:8080)
previous="$(sudo docker inspect -f '{{.Config.Image}}' "$name" 2>/dev/null || true)"
rollback() {
  if [ -n "$previous" ]; then
    sudo docker rm -f "$name" >/dev/null 2>&1 || true
    sudo docker run "${args[@]}" "$previous" >/dev/null
  fi
}
if sudo docker container inspect "$name" >/dev/null 2>&1; then sudo docker rm -f "$name" >/dev/null; fi
if ! sudo docker run "${args[@]}" "$image" >/dev/null; then rollback; exit 1; fi
ready=false
for attempt in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:8092/ >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  sudo docker logs --tail=100 "$name" >&2 || true
  rollback
  exit 1
fi
printf 'deployed %s\n' "$image"
