#!/usr/bin/env bash
set -euo pipefail
site=/etc/nginx/sites-available/media-workspace
index_marker='include /etc/nginx/project-index-route.conf;'
apps_marker='include /etc/nginx/project-apps-route.conf;'
# The rendered route contains a server-only proof. Keep it out of Git/artifacts.
sudo python3 - <<'PY'
import os, pathlib, re, tempfile
env = pathlib.Path('/home/ubuntu/.config/ai-rag/admin-workspace.env')
config = dict(line.split('=', 1) for line in env.read_text().splitlines()
              if '=' in line and not line.startswith('#'))
proof = config.get('RAG_ADMIN_PROXY_TOKEN', '')
if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', proof):
    raise SystemExit('Private RAG proxy configuration is invalid')
template = pathlib.Path('deploy/project-rag-admin-route.conf.in').read_text()
fd, temporary = tempfile.mkstemp(prefix='rag-admin-route-', dir='/etc/nginx')
try:
    with os.fdopen(fd, 'w') as stream:
        stream.write(template.replace('@RAG_ADMIN_PROXY_TOKEN@', proof))
    os.chmod(temporary, 0o600)
    os.replace(temporary, '/etc/nginx/project-rag-admin-route.conf')
finally:
    if os.path.exists(temporary): os.unlink(temporary)
PY
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
