import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from './index.js';

const token = 'A'.repeat(43);
const pdf = new TextEncoder().encode('%PDF-1.7\nprivate fixture\n');
const entries = new Map([
  ['public:index.html', '<h1>public fixture</h1>'],
  ['private:resume-pdf', pdf.buffer],
]);
const env = {
  PORTFOLIO_KV: { get: async (key, type) => {
    if (key === 'private:resume-pdf') assert.equal(type, 'arrayBuffer');
    return entries.get(key) ?? null;
  } },
  RESUME_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
};
const request = (path, authorization) => new Request(`https://portfolio.example/${path}`, {
  headers: authorization ? { Authorization: authorization } : {},
});

for (const authorization of [undefined, 'Bearer invalid', `Bearer ${'B'.repeat(43)}`]) {
  const response = await worker.fetch(request('api/resume', authorization), env);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
}
const granted = await worker.fetch(request('api/resume', `Bearer ${token}`), env);
assert.equal(granted.status, 200);
assert.equal(granted.headers.get('Content-Type'), 'application/pdf');
assert.match(granted.headers.get('Cache-Control'), /no-store/);
assert.match(granted.headers.get('X-Robots-Tag'), /noindex/);
assert.deepEqual(new Uint8Array(await granted.arrayBuffer()), pdf);

const publicPage = await worker.fetch(request(''), env);
assert.equal(publicPage.status, 200);
assert.match(await publicPage.text(), /public fixture/);
assert.equal((await worker.fetch(request('missing'), env)).status, 404);
console.log('Worker authorization and public asset checks passed');
