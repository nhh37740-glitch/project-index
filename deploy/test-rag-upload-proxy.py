"""Exercise the real Nginx route with >1 MiB uploads and isolated upstreams."""
import hashlib
import http.client
import http.server
import json
import pathlib
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest


class Upstream(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.do_POST()

    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(size)
        if self.path == "/verify":
            self.server.verification_lengths.append(size)
            allowed = (self.headers.get("Cookie") == "owner=valid" and
                       self.headers.get("X-Rag-Proxy-Token") == "test-proxy-proof")
            self.send_response(200 if allowed else 403)
            if allowed:
                self.send_header("X-Rag-User-Id", "verified-owner")
                self.send_header("X-Rag-Role", "admin")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        result = json.dumps({"bytes": size, "sha256": hashlib.sha256(body).hexdigest(),
                             "owner": self.headers.get("X-Rag-User-Id"),
                             "role": self.headers.get("X-Rag-Role")}).encode()
        self.server.uploads += 1
        self.send_response(201)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(result)))
        self.end_headers()
        self.wfile.write(result)


class UploadProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        nginx = shutil.which("nginx") or "/usr/sbin/nginx"
        if not pathlib.Path(nginx).is_file():
            raise RuntimeError("Real Nginx is required for the upload proxy regression")
        cls.temporary = tempfile.TemporaryDirectory(prefix="rag-upload-proxy-")
        root = pathlib.Path(cls.temporary.name)
        cls.upstreams = []
        for _ in range(2):
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
            server.verification_lengths = []
            server.uploads = 0
            threading.Thread(target=server.serve_forever, daemon=True).start()
            cls.upstreams.append(server)
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            cls.port = reservation.getsockname()[1]
        route = pathlib.Path(__file__).with_name("project-rag-admin-route.conf.in").read_text()
        route = route.replace("@RAG_ADMIN_PROXY_TOKEN@", "test-proxy-proof")
        route = route.replace("127.0.0.1:18107", f"127.0.0.1:{cls.upstreams[0].server_port}")
        route = route.replace("127.0.0.1:18108", f"127.0.0.1:{cls.upstreams[1].server_port}")
        config = root / "nginx.conf"
        config.write_text(f"pid {root}/nginx.pid;\nerror_log {root}/error.log;\n"
                          "events {}\nhttp { access_log off;\n"
                          f"client_body_temp_path {root}/bodies;\n"
                          f"server {{ listen 127.0.0.1:{cls.port};\n{route}\n}}\n}}\n")
        cls.nginx = subprocess.Popen([nginx, "-p", str(root), "-c", str(config),
                                      "-g", "daemon off; master_process off;"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            if cls.nginx.poll() is not None:
                raise RuntimeError(cls.nginx.stderr.read().decode())
            try:
                with socket.create_connection(("127.0.0.1", cls.port), timeout=.1):
                    return
            except OSError:
                time.sleep(.05)
        raise RuntimeError("Nginx did not start")

    @classmethod
    def tearDownClass(cls):
        cls.nginx.terminate()
        cls.nginx.communicate(timeout=10)
        for server in cls.upstreams:
            server.shutdown()
            server.server_close()
        cls.temporary.cleanup()

    def request(self, body, *, cookie="owner=valid", path="/projects/apps/rag/admin/api/notebooks/test/files"):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        # Wait for the response before sending rejected bodies. Content-Length
        # still reproduces the auth subrequest's inherited size check.
        headers = {"Cookie": cookie, "Content-Length": str(len(body)),
                   "Expect": "100-continue", "X-Rag-User-Id": "forged-owner", "X-Rag-Role": "guest"}
        connection.putrequest("POST", path)
        for key, value in headers.items():
            connection.putheader(key, value)
        connection.endheaders()
        # For accepted uploads Nginx waits for the body; rejected requests never
        # need a body. Use a normal send for the <=20 MiB test fixtures.
        if len(body) <= 20 * 1024 * 1024 and cookie == "owner=valid" and path.startswith("/projects/"):
            connection.send(body)
        response = connection.getresponse()
        result = (response.status, response.read(), response.getheader("Content-Type", ""))
        connection.close()
        return result

    def test_two_megabyte_upload_reaches_upstream_intact(self):
        body = b"TXT upload regression\n" * 100000
        status, raw, _ = self.request(body)
        self.assertEqual(status, 201, raw)
        result = json.loads(raw)
        self.assertEqual(result["bytes"], len(body))
        self.assertEqual(result["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual((result["owner"], result["role"]), ("verified-owner", "admin"))
        self.assertTrue(self.upstreams[0].verification_lengths)
        self.assertEqual(set(self.upstreams[0].verification_lengths), {0})

    def test_anonymous_large_request_still_denied_before_upload(self):
        before = self.upstreams[1].uploads
        self.assertEqual(self.request(b"x" * 2065625, cookie="")[0], 403)
        self.assertEqual(self.upstreams[1].uploads, before)

    def test_over_limit_returns_json_413(self):
        status, body, content_type = self.request(b"x" * (20 * 1024 * 1024 + 1))
        self.assertEqual(status, 413)
        self.assertIn("application/json", content_type)
        self.assertIn("20 MB", json.loads(body)["detail"])

    def test_internal_verification_is_not_public(self):
        self.assertEqual(self.request(b"", path="/_rag_owner_verify")[0], 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
