#!/usr/bin/env bash
set -euo pipefail

name=portfolio-https.conf
available="/etc/nginx/sites-available/$name"
enabled="/etc/nginx/sites-enabled/$name"
backup="$(mktemp)"
had_previous=false

if sudo test -f "$available"; then
  sudo cp "$available" "$backup"
  had_previous=true
fi

rollback() {
  if [ "$had_previous" = true ]; then
    sudo install -m 0644 "$backup" "$available"
  else
    sudo rm -f "$available" "$enabled"
  fi
  sudo nginx -t >/dev/null 2>&1 || true
  rm -f "$backup"
}
trap rollback ERR

sudo install -m 0644 deploy/portfolio-https.conf "$available"
sudo ln -sfn "$available" "$enabled"
sudo nginx -t
sudo systemctl reload nginx
trap - ERR
rm -f "$backup"
