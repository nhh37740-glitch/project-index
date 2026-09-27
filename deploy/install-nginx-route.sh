#!/usr/bin/env bash
set -euo pipefail
site=/etc/nginx/sites-available/media-workspace
index_marker='include /etc/nginx/project-index-route.conf;'
apps_marker='include /etc/nginx/project-apps-route.conf;'
sudo install -m 0644 deploy/project-index-route.conf /etc/nginx/project-index-route.conf
sudo install -m 0644 deploy/project-apps-route.conf /etc/nginx/project-apps-route.conf
if ! sudo grep -Fq "$apps_marker" "$site"; then
  if [ ! -e "${site}.before-project-apps" ]; then
    sudo cp -a "$site" "${site}.before-project-apps"
  fi
fi
sudo python3 - "$site" "$index_marker" "$apps_marker" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
content = path.read_text()
for marker in sys.argv[2:]:
    if marker in content:
        continue
    last = content.rfind('}')
    if last == -1:
        raise SystemExit('nginx server block not found')
    content = content[:last] + '    ' + marker + '\n' + content[last:]
path.write_text(content)
PY
sudo nginx -t
sudo systemctl reload nginx
