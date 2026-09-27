#!/usr/bin/env bash
set -euo pipefail
site=/etc/nginx/sites-available/media-workspace
marker='include /etc/nginx/project-index-route.conf;'
sudo install -m 0644 deploy/project-index-route.conf /etc/nginx/project-index-route.conf
if ! sudo grep -Fq "$marker" "$site"; then
  sudo cp -a "$site" "${site}.before-project-index"
  sudo python3 - "$site" "$marker" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
content = path.read_text()
last = content.rfind('}')
if last == -1:
    raise SystemExit('nginx server block not found')
path.write_text(content[:last] + '    ' + sys.argv[2] + '\n' + content[last:])
PY
fi
sudo nginx -t
sudo systemctl reload nginx
