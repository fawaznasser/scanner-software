// Read-only route checks. No sign-in events, presence heartbeats or document mutations.
import fs from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const base = process.env.DMS_TEST_BASE_URL || 'http://localhost:3000';
const accounts = JSON.parse(fs.readFileSync('.data/accounts.json', 'utf8'));
const env = fs.readFileSync('.env.local', 'utf8');
const secret = env.match(/^AUTH_SECRET=(.+)$/m)?.[1] || fs.readFileSync('.data/session-secret', 'utf8').trim();
for (const role of ['Administrator', 'Editor']) {
  const user = accounts.find(account => account.role === role);
  assert(user, `No ${role} available for route check`);
  const payload = Buffer.from(JSON.stringify({ userId: user.id, sessionVersion: user.sessionVersion, sessionId: randomUUID(), expiresAt: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
  const headers = { cookie: `dms_session=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}` };
  const page = await fetch(base + '/all-documents', { headers });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const html = await page.text();
  assert(html.includes('Search in'));
  assert(html.includes('Added through'));
  assert(html.includes('Clear search and filters'));
  assert(!/<a[^>]+href="\/search"/.test(html), 'Separate Search navigation must be removed');
  const old = await fetch(base + '/search', { headers, redirect: 'manual' });
  assert.equal(old.status, 307);
  assert.equal(old.headers.get('location'), '/all-documents');
  const dashboard = await fetch(base + '/', { headers });
  assert.equal(dashboard.status, 200);
  assert(!/<a[^>]+href="\/search"/.test(await dashboard.text()), 'Dashboard navigation must also be updated');
  for (const path of ['/users', '/statistics', '/logs', '/settings']) {
    const response = await fetch(base + path, { headers, redirect: 'manual' });
    assert.equal(response.status, role === 'Administrator' ? 200 : 307, `${role} ${path}`);
  }
  const write = await fetch(base + '/api/documents/1', { method: 'PATCH', headers: { ...headers, origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'Reports' }) });
  assert.equal(write.status, 403, 'Cross-origin writes must be denied before mutation');
  const pdf = await fetch(base + '/demo-documents/Invoice_2938.pdf', { headers });
  assert.equal(pdf.status, 404, 'Retired samples must not be publicly served');
  console.log(`${role}: merged library, dashboard navigation and Search redirect passed.`);
}
