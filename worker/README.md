# Cloudflare portfolio module

The Worker serves the same public `web/` files as the Docker site from Workers KV. `PORTFOLIO_KV` contains `public:<filename>` keys and one private binary `private:resume-pdf` value. Never add the private value, the access token, or the `RESUME_TOKEN_SHA256` secret to Git or a static release.

`RESUME_TOKEN_SHA256` is the SHA-256 hex digest of a random 32-byte base64url token. A holder visits `https://portfolio.72945645.xyz/resume.html#resume=<token>`. The browser removes the URL fragment and requests `/api/resume` with `Authorization: Bearer <token>`. The Worker validates the digest and returns the original PDF with no-store and noindex headers. Requests without a valid token return 404.

The public pages can be deployed independently of the private PDF. Upload the source PDF from the authoritative private path only to the private KV key, then install the secret binding. Test anonymous denial and successful access before sharing the capability URL.

`publish-public.sh` uploads the checked `web/` assets and deploys the Worker from a Linux host with an authenticated Wrangler CLI. `publish-private.sh <private-pdf-path>` uploads raw PDF bytes from a private server directory. These scripts contain no credentials and do not print file contents. The access token digest must be installed separately as the Worker secret `RESUME_TOKEN_SHA256`; keep both the token and the source PDF outside this repository.

After the Worker exists, `install-resume-token.sh` generates a 256-bit token, sends only its SHA-256 digest to the Worker secret, and writes the designated link to `$HOME/.portfolio-resume-link` with mode 0600. Run it only after the private PDF is uploaded; rotating it immediately revokes the previous link. Do not include that link in logs, commits, or build artifacts.
