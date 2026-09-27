from html.parser import HTMLParser
import json
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
assert "./radar/indexbak.html" in links.urls, "synthetic radar demo entry is missing"
radar = root / "radar"
data_script = (radar / "data" / "method_comparison_jan15_cfear_lite_pose_data.js").read_text(encoding="utf-8")
prefix = "window.RADAR_POSE_METHOD_DATA="
assert data_script.startswith(prefix)
pose_data = json.loads(data_script[len(prefix):].strip().removesuffix(";"))
assert pose_data["metadata"]["synthetic"] is True
assert len(pose_data["frames"]) == 240
assert (radar / "assets" / "radar").is_dir() and len(list((radar / "assets" / "radar").glob("*.jpg"))) == 240
assert (radar / "assets" / "stereo").is_dir() and len(list((radar / "assets" / "stereo").glob("*.jpg"))) == 240
for page in ("indexbak.html", "index.html", "index-global.html"):
    assert "synthetic" in (radar / page).read_text(encoding="utf-8").lower(), f"{page} must label synthetic data"
print(f"validated {len(links.urls)} links and local assets")
