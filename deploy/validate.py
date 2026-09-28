"""Validate the public portfolio without reading or packaging the full resume."""

from html.parser import HTMLParser
from pathlib import Path
import re


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.urls.extend(value for key, value in attrs if key == "href")


root = Path(__file__).resolve().parents[1]
public = root / "web"
pages = ("index.html", "projects.html", "repositories.html", "resume.html")
assets = ("styles.css", "favicon.svg", "resume-access.js")
for name in (*pages, *assets):
    assert (public / name).is_file(), f"missing public asset: {name}"

assert not list(public.rglob("*.pdf")), "full resume must never enter public assets"
for name in pages:
    html = (public / name).read_text(encoding="utf-8")
    assert 'lang="zh-CN"' in html and "<main" in html and "<h1" in html
    assert not re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", html), f"email in {name}"
    assert not re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", html), f"phone in {name}"
    assert not re.search(r"(?<!\d)\d{17}[\dXx](?!\d)", html), f"ID-like number in {name}"
    assert "X:\\job\\" not in html and "简历_20260927" not in html
    links = Links()
    links.feed(html)
    for href in links.urls:
        if href.startswith(("http://", "https://", "#")):
            continue
        assert href.startswith("./"), f"unexpected link in {name}: {href}"
        destination = href[2:].split("#", 1)[0].split("?", 1)[0]
        if destination:
            assert (public / destination).is_file(), f"broken link: {href}"

home = (public / "index.html").read_text(encoding="utf-8")
for target in ("./projects.html", "./repositories.html", "./resume.html"):
    assert target in home, f"missing home entry: {target}"
projects = (public / "projects.html").read_text(encoding="utf-8")
for project_id in ("radar", "media", "go", "java", "cpp", "rag"):
    assert f'id="{project_id}"' in projects, f"missing project: {project_id}"
assert "7,203" in projects and "不在浏览器中运行模型推理" in projects
assert "等待配置" in projects and "无真实推理帧" in projects
assert "推理可用" not in projects and "在线推理" not in projects
assert "http://43.153.176.182:8088/projects/radar/" in projects
assert "私有仓库" in projects
repos = (public / "repositories.html").read_text(encoding="utf-8")
assert repos.count("github.com/nhh37740-glitch/") >= 6
resume = (public / "resume.html").read_text(encoding="utf-8")
assert "公开简历" in resume and "完整简历" in resume
assert "#resume=" not in resume, "capability link must not be embedded in public HTML"

dockerfile = (root / "Dockerfile").read_text(encoding="utf-8")
assert "COPY web/" in dockerfile and "COPY radar/" not in dockerfile
package = (root / "deploy" / "package.py").read_text(encoding="utf-8")
assert '"radar/' not in package
routes = (root / "deploy" / "project-apps-route.conf").read_text(encoding="utf-8")
for required_route in (
    "location ^~ /projects/radar/",
    "location ^~ /projects/apps/go/",
    "location ^~ /projects/apps/java/",
    "location ^~ /projects/apps/cpp/",
):
    assert required_route in routes, f"missing app route: {required_route}"
print("validated four public pages, project routes, local links, and resume privacy boundary")
