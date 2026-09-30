"""Smoke-check a deployed loopback gateway without printing the private token or PDF."""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def get(url: str, token: str | None = None):
    headers = {} if token is None else {"Authorization": f"Bearer {token}"}
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=5) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify_deployed.py <private-pdf> <private-link-file>")
    pdf = Path(sys.argv[1])
    link = urlsplit(Path(sys.argv[2]).read_text(encoding="ascii").strip())
    if link.scheme != "https" or not link.fragment.startswith("resume="):
        raise SystemExit("invalid private link")
    token = link.fragment[len("resume="):]
    if re.fullmatch(r"[A-Za-z0-9_-]{43}", token) is None:
        raise SystemExit("invalid private link token")

    base = "http://127.0.0.1:18105"
    for candidate in (None, "A" * 43):
        status, headers, body = get(base + "/api/resume", candidate)
        assert status == 404 and body == b"", "private PDF accessible without designated link"
        assert "no-store" in headers["Cache-Control"], "private response was cacheable"

    status, headers, body = get(base + "/api/resume", token)
    assert status == 200 and headers.get_content_type() == "application/pdf"
    assert "no-store" in headers["Cache-Control"]
    assert "noindex" in headers["X-Robots-Tag"]
    assert headers["Referrer-Policy"] == "no-referrer"
    assert hashlib.sha256(body).digest() == hashlib.sha256(pdf.read_bytes()).digest()
    print("private resume gateway smoke passed")


if __name__ == "__main__":
    main()
