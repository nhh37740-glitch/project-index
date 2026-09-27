from html.parser import HTMLParser
from pathlib import Path


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.urls.extend(value for key, value in attrs if key == "href")


root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
assert "lang=\"zh-CN\"" in html
assert "<h1" in html and "<main" in html
assert (root / "styles.css").is_file() and (root / "favicon.svg").is_file()
links = Links()
links.feed(html)
assert len(links.urls) >= 8, "missing project entrances"
assert "/" in links.urls
assert "./radar/indexbak.html" not in links.urls, "Radar demo must stay closed pending source/license clearance"
assert "./apps/go/" in links.urls, "Go live demo entry is missing"
assert "./apps/java/agent.html" in links.urls, "Java live demo entry is missing"
assert "./apps/cpp/" in links.urls, "C++ status dashboard entry is missing"
assert "模型未配置" in html and "暂无帧数据" in html and "不运行推理" in html, \
    "C++ entry must disclose that this is an idle panel without model inference"
assert "推理可用" not in html and "在线推理" not in html, \
    "C++ must not be advertised as an inference demo"
routes = (root / "deploy" / "project-apps-route.conf").read_text(encoding="utf-8")
for required_route in (
    "location ^~ /projects/apps/go/",
    "proxy_pass http://127.0.0.1:18101/;",
    "location ^~ /projects/apps/java/",
    "proxy_pass http://127.0.0.1:18102/;",
    "location ^~ /projects/apps/cpp/",
    "proxy_pass http://127.0.0.1:18103/;",
    "/projects/apps/go/api/",
    "/projects/apps/cpp/api/state",
    "/projects/apps/cpp/frame/",
):
    assert required_route in routes, f"missing project app proxy route: {required_route}"
radar = root / "radar"
expected_radar_files = {"indexbak.html", "index.html", "index-global.html"}
assert {path.name for path in radar.iterdir()} == expected_radar_files, "only pending notice pages may be served"
assert not list(radar.rglob("*.jpg")), "sensor frames must not be included before clearance"
assert not list(radar.rglob("*.js")), "pose data or demo scripts must not be included before clearance"
for page in expected_radar_files:
    text = (radar / page).read_text(encoding="utf-8").lower()
    assert "真实数据演示暂缓开放" in text, f"{page} must show the pending notice"
    assert "不提供数据预览或下载" in text, f"{page} must not imply preview availability"
    assert "synthetic demo data" not in text
print(f"validated {len(links.urls)} project links and Radar containment")
