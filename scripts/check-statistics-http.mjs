// Read-only checks against actual jobs. Does not scan, sign in or mutate user data.
import fs from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const base = process.env.DMS_TEST_BASE_URL || 'http://localhost:3000';
const accounts = JSON.parse(fs.readFileSync('.data/accounts.json','utf8'));
const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local','utf8') : '';
const secret = env.match(/^AUTH_SECRET=(.+)$/m)?.[1] || fs.readFileSync('.data/session-secret','utf8').trim();
const database = new DatabaseSync('.data/dms.sqlite',{readOnly:true});
const jobs = database.prepare('SELECT id,owner_id,record FROM scan_jobs').all().map(row=>({...JSON.parse(row.record),id:row.id,userId:row.owner_id}));
database.close();
assert.equal((await fetch(base+'/api/statistics')).status,401);
for (const user of accounts) {
  const payload = Buffer.from(JSON.stringify({userId:user.id,sessionVersion:user.sessionVersion,sessionId:randomUUID(),expiresAt:Math.floor(Date.now()/1000)+120})).toString('base64url');
  const headers = {cookie:`dms_session=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`};
  const response = await fetch(base+'/api/statistics',{headers});
  const page = await fetch(base+'/statistics',{headers,redirect:'manual'});
  if (user.role !== 'Administrator') {
    assert.equal(response.status,403); assert.equal(page.status,307); assert.equal(page.headers.get('location'),'/');
    console.log('Editor: Statistics page and API denied.');
    continue;
  }
  assert.equal(page.status,200); assert((await page.text()).includes('Pages scanned'));
  assert.equal(response.status,200); assert(response.headers.get('cache-control').includes('no-store'));
  const data = await response.json();
  let totalScans=0,totalPages=0;
  for (const account of accounts) {
    const expected = jobs.filter(job=>job.userId===account.id && job.provider==='bridge' && job.status==='completed');
    const row = data.users.find(row=>row.userId===account.id);
    assert(row, 'Every account must appear, including users with no scans');
    assert.equal(row.completedScans,expected.length);
    assert.equal(row.pagesScanned,expected.reduce((sum,job)=>sum+(Number.isSafeInteger(job.result?.pageCount) && job.result.pageCount>0?job.result.pageCount:0),0));
  }
  for (const job of jobs.filter(job=>job.provider==='bridge' && job.status==='completed')) { totalScans++; if(Number.isSafeInteger(job.result?.pageCount) && job.result.pageCount>0) totalPages+=job.result.pageCount; }
  assert.equal(data.totals.completedScans,totalScans); assert.equal(data.totals.pagesScanned,totalPages);
  const datedJobs=jobs.filter(job=>job.provider==='bridge' && job.status==='completed' && !Number.isNaN(new Date(job.updatedAt || job.createdAt).getTime()));
  assert.equal(data.timeline.reduce((sum,point)=>sum+point.completedScans,0),datedJobs.length);
  assert.equal(data.undatedScans,totalScans-datedJobs.length);
  for(const point of data.timeline) {
    const matches=datedJobs.filter(job=>job.userId===point.userId && new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(job.updatedAt || job.createdAt))===point.date);
    assert.equal(point.completedScans,matches.length);
    assert.equal(point.pagesScanned,matches.reduce((sum,job)=>sum+(Number.isSafeInteger(job.result?.pageCount) && job.result.pageCount>0?job.result.pageCount:0),0));
  }
  for (const query of ['from=2026-02-30','to=not-a-date','from=2026-10-28&to=2026-10-27']) assert.equal((await fetch(base+'/api/statistics?'+query,{headers})).status,400);
  const empty = await (await fetch(base+'/api/statistics?from=1900-01-01&to=1900-01-02',{headers})).json();
  assert.equal(empty.totals.completedScans,0); assert(empty.users.every(row=>row.pagesScanned===0));
  const date = '2026-10-27';
  const filtered = await (await fetch(base+`/api/statistics?from=${date}&to=${date}`,{headers})).json();
  const matching = jobs.filter(job=>job.provider==='bridge' && job.status==='completed' && new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(job.updatedAt || job.createdAt))===date);
  assert.equal(filtered.totals.completedScans,matching.length);
  console.log(`Administrator: page, real database totals (${totalScans} scans, ${totalPages} pages), date filters and validation passed.`);
}
