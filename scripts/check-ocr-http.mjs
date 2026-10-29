import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const base=process.env.DMS_TEST_BASE_URL || 'http://localhost:3000';
const users=JSON.parse(fs.readFileSync('.data/accounts.json','utf8'));
const env=fs.readFileSync('.env.local','utf8');
const secret=env.match(/^AUTH_SECRET=(.+)$/m)?.[1] || fs.readFileSync('.data/session-secret','utf8').trim();
const prefix=`ocr-check-${randomUUID()}`;
const headers=user=>{
 const payload=Buffer.from(JSON.stringify({userId:user.id,sessionId:randomUUID(),sessionVersion:user.sessionVersion,expiresAt:Math.floor(Date.now()/1000)+600})).toString('base64url');
 return {cookie:`dms_session=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`,'User-Agent':`DMS-Access-Check/${prefix}`};
};
const editor=users.find(user=>user.role==='Editor'),other=users.find(user=>user.role==='Editor'&&user.id!==editor.id),admin=users.find(user=>user.role==='Administrator');
const own=headers(editor),others=headers(other),admins=headers(admin);
const call=(url,head,options={})=>fetch(base+url,{...options,headers:{...head,...options.headers}});
let id;
try {
 const bytes=fs.readFileSync('.data/ocr-tests/known-text.png');
 const form=new FormData();form.set('file',new Blob([bytes],{type:'image/png'}),`${prefix}.png`);form.set('visibility','private');
 const upload=await call('/api/documents',own,{method:'POST',body:form});assert.equal(upload.status,201);
 const document=(await upload.json()).document;id=document.id;
 assert.equal(document.ocrStatus,'queued','New uploads must automatically enter OCR');
 assert.equal((await call(`/api/documents/${id}/ocr`,others)).status,404,'Private OCR text must stay private');
 assert.equal((await call(`/api/documents/${id}/ocr`,others,{method:'POST'})).status,404);
 assert.equal((await call(`/api/documents/${id}/ocr`,own,{method:'POST'})).status,202,'An owner may retry/read their document');
 assert.equal((await call('/api/ocr',own,{method:'POST'})).status,403,'Batch processing is administrator-only');
 let result;
 for(let attempt=0;attempt<150;attempt++){
  const response=await call(`/api/documents/${id}/ocr`,own);assert.equal(response.status,200);result=await response.json();
  if(result.document.status==='Completed'||result.document.status==='Failed')break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.equal(result.document.status,'Completed',result.document.ocrError || 'OCR did not finish');
 assert(result.document.ocrText.includes('839271'));
 assert.equal(result.pages.length,1);assert(result.pages[0].text.includes('FACTURE'));
 // Simulate an interrupted lease on this check's own already-processed image.
 // The durable worker must reclaim it, not leave it Processing forever.
 const recovery=new DatabaseSync('.data/dms.sqlite');recovery.exec('PRAGMA busy_timeout=5000');
 const recoveryRow=recovery.prepare('SELECT record FROM documents WHERE id=?').get(id);
 recovery.prepare("UPDATE ocr_jobs SET state='processing',lease_until=0,attempts=1,token='expired-test-lease' WHERE document_id=?").run(id);
 recovery.prepare('UPDATE documents SET record=? WHERE id=?').run(JSON.stringify({...JSON.parse(recoveryRow.record),status:'Processing',ocrStatus:'processing',ocrProgress:0}),id);
 recovery.close();
 for(let attempt=0;attempt<90;attempt++){
  const response=await call(`/api/documents/${id}/ocr`,own);result=await response.json();
  if(result.document.status==='Completed'||result.document.status==='Failed')break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.equal(result.document.status,'Completed','Expired OCR leases must recover');
 assert.equal(result.pages.length,1,'Retry must replace, not duplicate, page text');
 const original=await call(document.downloadUrl,own);assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes,'OCR must preserve the original file');
 assert.equal((await call(`/api/documents/${id}/ocr`,admins)).status,200,'Admins can read private OCR');
 const makePublic=await call(`/api/documents/${id}`,own,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({visibility:'public'})});assert.equal(makePublic.status,200);
 assert.equal((await call(`/api/documents/${id}/ocr`,others)).status,200);
 assert.equal((await call(`/api/documents/${id}/ocr`,others,{method:'POST'})).status,403,'Reading a public file does not grant OCR write permission');
 const trash=await call(`/api/documents/${id}`,own,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleted:true})});assert.equal(trash.status,200);
 assert.equal((await call(`/api/documents/${id}/ocr`,others)).status,404);
 assert.equal((await call(document.downloadUrl,others)).status,404,'Trashing a public document must revoke its public download');
 const visible=await(await call('/api/documents',others)).json();assert(!visible.documents.some(doc=>doc.id===id),'Trash must not leak OCR text through the public listing');
 const restore=await call(`/api/documents/${id}`,own,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:'Uncategorized'})});assert.equal(restore.status,200);
 const makePrivate=await call(`/api/documents/${id}`,own,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({visibility:'private'})});assert.equal(makePrivate.status,200);
 assert.equal((await call(`/api/documents/${id}/ocr`,others)).status,404,'Revoking public access must also revoke OCR text');
 assert.equal((await fetch(base+`/api/documents/${id}/ocr`)).status,401);
 const history=await call(`/api/documents/${id}/history`,own);assert((await history.json()).events.some(event=>event.description.includes('Completed local text recognition')));
 console.log('OCR HTTP checks passed: automatic queue, real extraction, per-page text, retry/expired-lease recovery, original preservation, owner/admin/public boundaries, access revocation and real audit history.');
}finally{
 if(id){
  const db=new DatabaseSync('.data/dms.sqlite');db.exec('PRAGMA busy_timeout=5000');
  const row=db.prepare('SELECT file_key,record FROM documents WHERE id=?').get(id);
  if(!row || !JSON.parse(row.record).name.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(row.file_key))throw new Error('Refusing to clean an unexpected document.');
  db.prepare('DELETE FROM ocr_jobs WHERE document_id=?').run(id);db.prepare('DELETE FROM ocr_pages WHERE document_id=?').run(id);
  db.prepare('DELETE FROM audit_logs WHERE document_id=?').run(id);db.prepare('DELETE FROM documents WHERE id=?').run(id);
  fs.unlinkSync(path.join('.data','documents',row.file_key));db.close();
  console.log('Removed only this OCR check’s temporary image/document/text/audit records.');
 }
}
