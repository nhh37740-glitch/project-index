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
assert "./radar/" in links.urls, "Radar recorded-data demo entry is missing"
assert "./apps/go/" in links.urls, "Go live demo entry is missing"
assert "./apps/java/agent.html" in links.urls, "Java live demo entry is missing"
assert "./apps/cpp/" in links.urls, "C++ status dashboard entry is missing"
assert "模型未配置" in html and "暂无帧数据" in html and "不运行推理" in html, \
    "C++ entry must disclose that this is an idle panel without model inference"
assert "推理可用" not in html and "在线推理" not in html, \
    "C++ must not be advertised as an inference demo"
assert "Oxford RobotCar" in html and "不在浏览器中运行模型推理" in html, \
    "Radar must be identified as a recorded-data replay, not live inference"
dockerfile = (root / "Dockerfile").read_text(encoding="utf-8")
assert "COPY radar/" not in dockerfile, "Radar assets must ship in the Radar module image"
package = (root / "deploy" / "package.py").read_text(encoding="utf-8")
assert '"radar/' not in package, "project-index release must not duplicate the Radar module"
routes = (root / "deploy" / "project-apps-route.conf").read_text(encoding="utf-8")
for required_route in (
    "location ^~ /projects/radar/",
    "proxy_pass http://127.0.0.1:18104/;",
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
print(f"validated {len(links.urls)} project links and independent Radar routing")
