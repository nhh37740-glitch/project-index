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
assert "./radar/" not in links.urls, "unverified dataset demo must not be published"
assert "演示准备中" in html
print(f"validated {len(links.urls)} links and local assets")
