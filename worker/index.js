const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/projects.html', ['projects.html', 'text/html; charset=utf-8']],
  ['/repositories.html', ['repositories.html', 'text/html; charset=utf-8']],
  ['/resume.html', ['resume.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/resume-access.js', ['resume-access.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

async function validToken(token, expectedHash) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return false;
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  const expected = new Uint8Array(expectedHash.match(/../g).map(part => parseInt(part, 16)));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function privateResume(request, env) {
  if (request.method !== 'GET') return new Response('Method not allowed', {status: 405});
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  if (!match || !await validToken(match[1], env.RESUME_TOKEN_SHA256)) {
    return new Response('Not found', {status: 404, headers: {'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex'}});
  }
  const pdf = await env.PORTFOLIO_KV.get('private:resume-pdf', 'arrayBuffer');
  if (!pdf) return new Response('Resume unavailable', {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  return new Response(pdf, {headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="resume.pdf"',
    'Cache-Control': 'private, no-store, max-age=0',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
  }});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/resume') return privateResume(request, env);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status: 405});
    const file = publicFiles.get(url.pathname);
    if (!file) return new Response('Not found', {status: 404});
    const content = await env.PORTFOLIO_KV.get(`public:${file[0]}`);
    if (content === null) return new Response('Not found', {status: 404});
    return new Response(request.method === 'HEAD' ? null : content, {headers: {
      'Content-Type': file[1],
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    }});
  },
};
