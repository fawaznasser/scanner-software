// Temporary loopback production server; no scans, service restarts or data changes.
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHmac,randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const reserve=net.createServer();
await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;
await new Promise(resolve=>reserve.close(resolve));
const origin='https://dms.test.org';
const env=fs.existsSync('.env.local')?fs.readFileSync('.env.local','utf8'):'';
const secret=process.env.AUTH_SECRET || env.match(/^AUTH_SECRET=(.+)$/m)?.[1] || fs.readFileSync('.data/session-secret','utf8').trim();
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'production',DMS_BUILD_DIR:'.next-production',DMS_PUBLIC_ORIGIN:origin,AUTH_SECRET:secret},stdio:['ignore','pipe','pipe']});
let exited=false; child.on('exit',()=>{exited=true;});
// Drain output without printing configuration, secrets or internal stack traces.
child.stdout.resume();child.stderr.resume();
const base=`http://127.0.0.1:${port}`;
try {
  let ready=false;
  for(let i=0;i<80;i++) {
    if(exited) throw new Error('Temporary production server exited before readiness.');
    try {ready=(await fetch(base+'/sign-in')).status===200;}catch{}
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(ready,'Production server did not become ready.');
  const redirect=await fetch(base+'/statistics',{redirect:'manual'});
  assert.equal(redirect.status,307);
  assert.equal(new URL(redirect.headers.get('location')).origin,origin);
  const forged=await fetch(base+'/statistics',{redirect:'manual',headers:{'x-forwarded-host':'attacker.org','x-forwarded-proto':'https'}});
  assert.equal(new URL(forged.headers.get('location')).origin,origin);
  for(const [incoming,status] of [[origin,400],['https://attacker.org',403],[base,403]]) {
    const response=await fetch(base+'/api/auth/sign-in',{method:'POST',headers:{origin:incoming,'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,status,'Configured HTTPS origin must be used behind the reverse proxy.');
  }
  const accounts=JSON.parse(fs.readFileSync('.data/accounts.json','utf8'));
  for(const user of accounts) {
    const payload=Buffer.from(JSON.stringify({userId:user.id,sessionVersion:user.sessionVersion,sessionId:randomUUID(),expiresAt:Math.floor(Date.now()/1000)+120})).toString('base64url');
    const headers={cookie:`dms_session=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`};
    const page=await fetch(base+'/scan-documents',{headers});
    assert.equal(page.status,200);
    const html=await page.text();
    assert(html.includes('Check scanner connection'));
    for(const removed of ['Windows driver control','Check driver status','Restart Windows scanning service']) assert(!html.includes(removed));
    assert.equal((await fetch(base+'/api/statistics',{headers})).status,user.role==='Administrator'?200:403);
  }
  console.log('Production HTTP passed: single scanner control, all roles, trusted HTTPS writes, public redirects, and forwarded-host spoof rejection. No scanner or user data changed.');
} finally {
  if(!exited) {child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000).unref();});}
}
