"""Package the public static site as an independently verifiable release."""

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import os
import subprocess
import sys
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
FILES = ["index.html", "projects.html", "repositories.html", "resume.html", "styles.css", "favicon.svg", "resume-access.js"]


def canonical_text(path: Path) -> bytes:
    """Return UTF-8 text with LF endings for reproducible cross-platform ZIPs."""
    return path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


version = os.environ.get("RELEASE_VERSION", "0.1.0").strip()
if not version or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_" for ch in version):
    raise SystemExit("RELEASE_VERSION must contain only letters, digits, dot, hyphen, underscore")
commit = git("rev-parse", "HEAD") or "uncommitted"
tree_state = "uncommitted" if commit == "uncommitted" else (
    "dirty" if git("status", "--porcelain", "--untracked-files=no") else "clean"
)
file_contents = {name: canonical_text(ROOT / "web" / name) for name in FILES}
checksums = {name: sha256(content).hexdigest() for name, content in file_contents.items()}
manifest = {
    "name": "project-index",
    "version": version,
    "commit": commit,
    "treeState": tree_state,
    "builtAt": datetime.now(timezone.utc).isoformat(),
    "python": sys.version.split()[0],
    "files": checksums,
}
manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
checksum_lines = [f"{digest}  {name}" for name, digest in sorted(checksums.items())]
checksum_lines.append(f"{sha256(manifest_bytes).hexdigest()}  manifest.json")
checksum_bytes = ("\n".join(checksum_lines) + "\n").encode("ascii")
out = ROOT / "dist"
out.mkdir(exist_ok=True)
for stale in out.glob("project-index-*.zip"):
    if stale.resolve().parent != out.resolve():
        raise SystemExit(f"Unexpected archive path: {stale}")
    stale.unlink()
archive = out / f"project-index-{version}-{commit[:7]}.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED) as zip_file:
    for name in FILES:
        zip_file.writestr(name, file_contents[name])
    zip_file.writestr("manifest.json", manifest_bytes)
    zip_file.writestr("SHA256SUMS", checksum_bytes)
print(archive)
