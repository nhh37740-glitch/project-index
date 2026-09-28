"""Small, same-origin gateway for a private PDF resume.

The public website and this process must be joined by the external HTTPS proxy.
Only the exact /api/resume path accepts a capability token. The source PDF and
the token digest are mounted as separate read-only files outside this image.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import re
import stat
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{43}\Z", re.ASCII)
DIGEST_RE = re.compile(r"[0-9a-f]{64}\n?\Z", re.ASCII)
BUFFER_SIZE = 64 * 1024


@dataclass(frozen=True)
class Config:
    pdf_path: Path
    token_sha256: str


def _open_regular(path: Path):
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError("Expected a regular file")
        return os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise


def load_config(environ: dict[str, str] | None = None) -> Config:
    env = os.environ if environ is None else environ
    digest_path = Path(env.get("RESUME_TOKEN_SHA256_FILE", "/run/secrets/resume-token.sha256"))
    pdf_path = Path(env.get("RESUME_PDF_FILE", "/run/private/resume.pdf"))
    if not digest_path.is_absolute() or not pdf_path.is_absolute():
        raise ValueError("Private file paths must be absolute")

    with _open_regular(digest_path) as secret_file:
        raw_digest = secret_file.read(66)
    try:
        digest = raw_digest.decode("ascii")
    except UnicodeDecodeError as exc:
        raise ValueError("Token digest must be lowercase hexadecimal") from exc
    if not DIGEST_RE.fullmatch(digest):
        raise ValueError("Token digest must be 64 lowercase hexadecimal characters")

    with _open_regular(pdf_path) as pdf_file:
        if pdf_file.read(5) != b"%PDF-":
            raise ValueError("Resume file is not a PDF")
    return Config(pdf_path=pdf_path, token_sha256=digest.rstrip("\n"))


def _valid_token(auth_headers: list[str] | None, expected_digest: str) -> bool:
    if auth_headers is None or len(auth_headers) != 1:
        return False
    value = auth_headers[0]
    if not value.startswith("Bearer "):
        return False
    token = value[7:]
    if TOKEN_RE.fullmatch(token) is None:
        return False
    try:
        decoded = base64.urlsafe_b64decode(token + "=")
    except (ValueError, binascii.Error):
        return False
    if len(decoded) != 32 or base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != token:
        return False
    actual_digest = hashlib.sha256(token.encode("ascii")).hexdigest()
    return hmac.compare_digest(actual_digest, expected_digest)


def make_handler(config: Config) -> type[BaseHTTPRequestHandler]:
    class ResumeHandler(BaseHTTPRequestHandler):
        server_version = "resume-gateway"
        sys_version = ""
        protocol_version = "HTTP/1.1"

        def log_message(self, _format: str, *args: object) -> None:
            # Do not log request targets, headers, token, or document content.
            pass

        def _respond(self, status: int, content_length: int = 0, pdf: bool = False) -> None:
            self.send_response(status)
            self.send_header("Content-Length", str(content_length))
            self.send_header("Cache-Control", "private, no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            if pdf:
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", 'inline; filename="resume.pdf"')
            self.end_headers()

        def do_GET(self) -> None:
            if self.path == "/healthz":
                self._respond(204)
                return
            if self.path != "/api/resume" or not _valid_token(
                self.headers.get_all("Authorization"), config.token_sha256
            ):
                self._respond(404)
                return

            try:
                pdf_file = _open_regular(config.pdf_path)
            except (OSError, ValueError):
                self._respond(503)
                return
            with pdf_file:
                size = os.fstat(pdf_file.fileno()).st_size
                self._respond(200, size, pdf=True)
                try:
                    while chunk := pdf_file.read(BUFFER_SIZE):
                        self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def do_HEAD(self) -> None:
            self._respond(404)

        def do_POST(self) -> None:
            self._respond(404)

        def do_OPTIONS(self) -> None:
            self._respond(404)

    return ResumeHandler


def main() -> None:
    config = load_config()
    port = int(os.environ.get("PORT", "8080"))
    if port < 1 or port > 65535:
        raise ValueError("PORT must be in 1..65535")
    server = ThreadingHTTPServer(("0.0.0.0", port), make_handler(config))
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
