// Non-mutating negative checks. All POST/PATCH bodies below must be rejected.
import fs from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const base = process.env.DMS_TEST_BASE_URL || 'http://localhost:3000';
const user = JSON.parse(fs.readFileSync('.data/accounts.json','utf8')).find(user => user.role === 'Administrator');
const env = fs.readFileSync('.env.local','utf8');
const secret = env.match(/^AUTH_SECRET=(.+)$/m)?.[1] || fs.readFileSync('.data/session-secret','utf8').trim();
const payload = Buffer.from(JSON.stringify({userId:user.id, sessionVersion:user.sessionVersion, sessionId:randomUUID(), expiresAt:Math.floor(Date.now()/1000)+120})).toString('base64url');
const headers = { cookie:`dms_session=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`, 'Content-Type':'application/json' };
for (const path of ['/api/documents','/api/users','/api/logs','/api/scan-jobs','/api/scanners']) assert.equal((await fetch(base+path)).status,401);
for (const path of ['/api/auth/sign-in','/api/auth/password','/api/scanners/control','/api/scan-jobs','/api/users','/api/documents/1']) {
  const method = path === '/api/users' || path.startsWith('/api/documents/') ? 'PATCH' : 'POST';
  for (const body of ['null','[]','{']) {
    const response = await fetch(base+path, { method,headers,body });
    assert.equal(response.status,400,`${path} must safely reject ${body}`);
  }
}
const crossSite = await fetch(base+'/api/auth/sign-in',{method:'POST',headers:{origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});
assert.equal(crossSite.status,403);
const oversize = await fetch(base+'/api/auth/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(17000)})});
assert.equal(oversize.status,400);
assert.equal((await fetch(base+'/api/documents',{headers:{...headers,cookie:headers.cookie+'tampered'}})).status,401);
const sign = claims => {
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `dms_session=${encoded}.${createHmac('sha256',secret).update(encoded).digest('base64url')}`;
};
const claims = {userId:user.id,sessionVersion:user.sessionVersion,sessionId:randomUUID(),expiresAt:Math.floor(Date.now()/1000)+120};
assert.equal((await fetch(base+'/api/documents',{headers:{cookie:sign({...claims,expiresAt:1})}})).status,401);
assert.equal((await fetch(base+'/api/documents',{headers:{cookie:sign({...claims,sessionVersion:user.sessionVersion+1})}})).status,401);
const editor = JSON.parse(fs.readFileSync('.data/accounts.json','utf8')).find(user => user.role === 'Editor');
assert.equal((await fetch(base+'/api/users',{headers:{cookie:sign({...claims,userId:editor.id,sessionVersion:editor.sessionVersion,role:'Administrator'})}})).status,403,'Role claims must not override the real account role');
const fakeEmail = `rate-check-${randomUUID()}@invalid.example`;
for (let i=0;i<11;i++) {
  const response = await fetch(base+'/api/auth/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fakeEmail,password:'not-a-real-password'})});
  assert.equal(response.status,i===10?429:401,'Failed sign-ins must be rate limited');
}
const started = Date.now();
await Promise.all(Array.from({length:40},async()=>{
  const response = await fetch(base+'/api/documents',{headers});
  assert.equal(response.status,200);
  assert(Array.isArray((await response.json()).documents));
}));
console.log(`Basic read concurrency: 40 authenticated requests passed in ${Date.now()-started} ms (not a production capacity benchmark).`);
console.log('HTTP security checks passed: unauthenticated/tampered sessions, malformed JSON, size limit, and cross-site rejection. No account/document/scanner changes.');
