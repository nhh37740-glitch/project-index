"""Behavior tests: run with python3 -m unittest discover -s tests -v on Linux."""

from __future__ import annotations

import base64
import hashlib
import http.client
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway import load_config, make_handler  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402


class GatewayBehaviorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        cls.pdf = cls.root / "private.pdf"
        cls.digest = cls.root / "token.sha256"
        cls.pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"
        cls.pdf.write_bytes(cls.pdf_bytes)
        cls.token = base64.urlsafe_b64encode(bytes(range(32))).decode("ascii").rstrip("=")
        cls.digest.write_text(hashlib.sha256(cls.token.encode("ascii")).hexdigest() + "\n", encoding="ascii")
        config = load_config(
            {"RESUME_PDF_FILE": str(cls.pdf), "RESUME_TOKEN_SHA256_FILE": str(cls.digest)}
        )
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(config))
        cls.server.daemon_threads = True
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.tmp.cleanup()

    def request(self, method="GET", path="/api/resume", headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            conn.request(method, path, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def assert_private_headers(self, headers):
        self.assertIn("no-store", headers["Cache-Control"])
        self.assertEqual(headers["Referrer-Policy"], "no-referrer")
        self.assertIn("noindex", headers["X-Robots-Tag"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_valid_token_returns_only_the_pdf(self):
        status, headers, body = self.request(headers={"Authorization": "Bearer " + self.token})
        self.assertEqual(status, 200)
        self.assertEqual(body, self.pdf_bytes)
        self.assertEqual(headers["Content-Type"], "application/pdf")
        self.assertEqual(int(headers["Content-Length"]), len(self.pdf_bytes))
        self.assert_private_headers(headers)

    def test_unauthenticated_and_wrong_tokens_are_indistinguishable(self):
        wrong = base64.urlsafe_b64encode(bytes(reversed(range(32)))).decode("ascii").rstrip("=")
        for headers in ({}, {"Authorization": "Bearer " + wrong}, {"Authorization": "Bearer short"}):
            with self.subTest(headers=headers):
                status, response_headers, body = self.request(headers=headers)
                self.assertEqual((status, body), (404, b""))
                self.assert_private_headers(response_headers)

    def test_rejects_noncanonical_tokens_and_other_routes(self):
        for value in ("Bearer " + self.token + "=", "bearer " + self.token, "Bearer  " + self.token):
            with self.subTest(value=value):
                self.assertEqual(self.request(headers={"Authorization": value})[0], 404)
        self.assertEqual(self.request(path="/api/resume?download=1", headers={"Authorization": "Bearer " + self.token})[0], 404)
        self.assertEqual(self.request(method="HEAD", headers={"Authorization": "Bearer " + self.token})[0], 404)
        self.assertEqual(self.request(method="POST", headers={"Authorization": "Bearer " + self.token})[0], 404)

    def test_duplicate_authorization_headers_are_rejected(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            conn.putrequest("GET", "/api/resume")
            conn.putheader("Authorization", "Bearer " + self.token)
            conn.putheader("Authorization", "Bearer " + self.token)
            conn.endheaders()
            response = conn.getresponse()
            self.assertEqual(response.status, 404)
            self.assertEqual(response.read(), b"")
        finally:
            conn.close()

    def test_health_check_reveals_no_private_data(self):
        status, headers, body = self.request(path="/healthz")
        self.assertEqual((status, body), (204, b""))
        self.assert_private_headers(headers)

    def test_invalid_config_fails_closed(self):
        invalid = self.root / "invalid.sha256"
        invalid.write_text("not a digest\n", encoding="ascii")
        with self.assertRaises(ValueError):
            load_config({"RESUME_PDF_FILE": str(self.pdf), "RESUME_TOKEN_SHA256_FILE": str(invalid)})
        with self.assertRaises((ValueError, FileNotFoundError)):
            load_config({"RESUME_PDF_FILE": str(self.root / "missing.pdf"), "RESUME_TOKEN_SHA256_FILE": str(self.digest)})

    def test_authorized_request_fails_closed_when_pdf_disappears(self):
        self.pdf.unlink()
        try:
            status, headers, body = self.request(headers={"Authorization": "Bearer " + self.token})
            self.assertEqual((status, body), (503, b""))
            self.assert_private_headers(headers)
        finally:
            self.pdf.write_bytes(self.pdf_bytes)


if __name__ == "__main__":
    unittest.main()
