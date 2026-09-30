# Private resume gateway

This module serves the original PDF through `GET /api/resume` only after a valid `Authorization: Bearer <token>` header. It uses Python's standard library and runs as a separate Docker container. The public homepage remains a separate service. The external HTTPS reverse proxy must route `/api/resume` to this gateway on the **same origin** as `resume.html`, so the browser never sends the capability token to a different origin.

## Inputs and behavior

| Input | Container path | Requirement |
| --- | --- | --- |
| Original PDF | `/run/private/resume.pdf` | Private host file; real PDF beginning `%PDF-`; mounted read-only |
| Token digest | `/run/secrets/resume-token.sha256` | Private host file with exactly 64 lowercase SHA-256 hexadecimal characters and optional trailing newline; mounted read-only |

The digest is `SHA256(ASCII token)`, where `token` is the canonical, unpadded base64url encoding of **32 random bytes** (43 characters). The container never needs the token itself. It reads the digest at startup; restart the container after rotating the digest. A missing or invalid private file prevents startup. Anonymous, incorrect, malformed, duplicate-header, and wrong-path `GET` requests return an empty 404. `HEAD`, `POST`, and `OPTIONS` also return an empty 404. A successful request streams the PDF with `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, and `X-Content-Type-Options: nosniff`. A missing PDF after startup returns 503 to an authorized request.

The gateway never logs request targets, headers, tokens, or PDF bytes. It deliberately exposes no CORS header. `/healthz` returns an empty 204 and is suitable for container health checks.

## Server build and start

On the Linux server, place the authoritative PDF and digest file outside the Git checkout in a private directory. Keep the full designated link in a separate private file; do not write the token or PDF to Git, static assets, Jenkins logs, or Docker build context. The invoking non-root account needs read access to both private input files. Run:

```sh
cd /path/to/project-index/resume-gateway
install -d -m 700 /home/ubuntu/portfolio-private
sh ./provision-private.sh /home/ubuntu/portfolio-private https://portfolio.72945645.xyz
sh ./run-container.sh /home/ubuntu/portfolio-private/resume.pdf /home/ubuntu/portfolio-private/resume-token.sha256
```

Provisioning refuses to overwrite an existing digest or link. It prints no token. Keep the generated `resume-link.txt` private; anyone holding the link can retrieve the full PDF after HTTPS is configured.

`run-container.sh` builds only this module's image and starts a non-root container with a read-only root filesystem, dropped capabilities, restricted process/memory limits, two read-only file mounts, and `127.0.0.1:18105:8080` publishing. It does not remove or replace an existing container. Use `RESUME_GATEWAY_IMAGE`, `RESUME_GATEWAY_CONTAINER`, or `RESUME_GATEWAY_PORT` to override deployment names or host port. The public reverse proxy must terminate HTTPS and proxy `/api/resume` to the loopback port; do not directly publish the container on a public interface. Preserve the `Authorization` header and avoid logging it or the URL fragment.

Run the script as the non-root file owner with passwordless `sudo docker` access on the server. The container itself runs under that file owner's numeric UID and GID.

To run the exact image that Jenkins has already built, set `RESUME_GATEWAY_IMAGE=portfolio-resume-gateway:<build-number>` and `RESUME_GATEWAY_SKIP_BUILD=1`; the script will only start that image.

The designated link has the form `https://<public-host>/resume.html#resume=<token>`. The browser must remove the URL fragment from its address bar before making its same-origin `GET /api/resume` request with the Bearer header. The token must never be placed in a query string or in public HTML. The link grants access to anyone who possesses it; rotating the digest and restarting the container revokes the old link.

## Verify on the Linux server

The behavior tests use only a disposable dummy PDF and dummy token. No real private input is read:

```sh
cd /path/to/project-index/resume-gateway
python3 -m unittest discover -s tests -v
python3 verify_deployed.py /home/ubuntu/portfolio-private/resume.pdf /home/ubuntu/portfolio-private/resume-link.txt
```

After integration, verify through the HTTPS origin: anonymous and wrong-token requests return 404; the designated link yields the original PDF; responses contain the privacy headers; the public repository and static assets contain neither PDF nor token. Do not print the private response body or token in test logs.
