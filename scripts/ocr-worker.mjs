import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createOcrEngine } from './ocr-engine.mjs';

const db = new DatabaseSync('.data/dms.sqlite');
db.exec('PRAGMA busy_timeout=5000');
const owner=randomUUID();
const lease=()=>Date.now()+120000;
const acquired=db.prepare("INSERT INTO ocr_worker_lock(id,token,lease_until) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE ocr_worker_lock.lease_until < ?").run(owner,lease(),Date.now());
if(!acquired.changes){db.close();process.exit(0);}
let active=null,engine=null;
const hardTimeout=setTimeout(()=>{console.error('OCR worker time limit reached; unfinished jobs remain recoverable.');process.exit(1);},15*60000);
const heartbeat=setInterval(()=>{
  try {
    if(!db.prepare('UPDATE ocr_worker_lock SET lease_until=? WHERE id=1 AND token=?').run(lease(),owner).changes) process.exit(0);
    if(active) db.prepare("UPDATE ocr_jobs SET lease_until=? WHERE document_id=? AND token=? AND state='processing'").run(lease(),active.id,active.token);
  } catch(error){console.error('OCR lease update failed:',error.message);}
},10000);
function transaction(operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
function audit(row,record,message){
  const event={id:randomUUID(),timestamp:new Date().toISOString(),userId:'system-ocr',userName:'DMS text recognition',userInitials:'OCR',role:'System',action:'ocr',description:`${message}: ${record.documentNumber} (${record.name})`,device:'Local OCR worker',ipAddress:'Local computer',userAgent:'DMS local OCR',file:{documentId:row.id,documentName:record.name,documentNumber:record.documentNumber,ownerId:row.owner_id}};
  db.prepare('INSERT INTO audit_logs(id,timestamp,user_id,document_id,record) VALUES(?,?,?,?,?)').run(event.id,event.timestamp,event.userId,row.id,JSON.stringify(event));
}
function current(job){
  const row=db.prepare("SELECT d.* FROM documents d JOIN ocr_jobs j ON j.document_id=d.id WHERE d.id=? AND j.token=? AND j.state='processing'").get(job.id,job.token);
  if(!row || JSON.parse(row.record).category==='Trash') throw new Error('OCR job was cancelled or removed.');
  return row;
}
function claim(){return transaction(()=>{
  if(!db.prepare('SELECT id FROM ocr_worker_lock WHERE id=1 AND token=? AND lease_until > ?').get(owner,Date.now())) throw new Error('OCR worker lease was lost; stopping this worker.');
  // Drop orphaned/cancelled entries without touching a user's document.
  db.prepare('DELETE FROM ocr_jobs WHERE document_id NOT IN (SELECT id FROM documents)').run();
  const job=db.prepare("SELECT j.*,d.file_key,d.mime_type,d.id FROM ocr_jobs j JOIN documents d ON d.id=j.document_id WHERE (j.state='queued' OR (j.state='processing' AND j.lease_until < ?)) AND json_extract(d.record,'$.category') != 'Trash' ORDER BY j.queued_at LIMIT 1").get(Date.now());
  if(!job)return null;
  job.token=randomUUID();
  db.prepare("UPDATE ocr_jobs SET state='processing',attempts=attempts+1,started_at=?,token=?,lease_until=?,error=NULL WHERE document_id=?").run(new Date().toISOString(),job.token,lease(),job.id);
  const row=current(job),record={...JSON.parse(row.record),status:'Processing',ocrStatus:'processing',ocrError:undefined,ocrProgress:0};
  db.prepare('UPDATE documents SET record=? WHERE id=?').run(JSON.stringify(record),job.id);
  return job;
});}
async function run(job){
  try {
    if(job.attempts>=3)throw new Error('OCR was interrupted repeatedly. Retry text recognition after checking the worker logs.');
    if(!/^[a-f0-9-]{36}$/.test(job.file_key))throw new Error('Invalid document storage key.');
    if(!engine)engine=await createOcrEngine();
    let characters=0;
    const pages=await engine.process(path.resolve('.data','documents',job.file_key),job.mime_type,progress=>{
      characters+=progress.text.length;
      if(characters>2000000)throw new Error('Extracted text exceeds the document limit. Split this document.');
      transaction(()=>{
        const row=current(job),record={...JSON.parse(row.record),pages:progress.total,ocrProgress:Math.round(progress.page/progress.total*100)};
        db.prepare('UPDATE documents SET record=? WHERE id=?').run(JSON.stringify(record),job.id);
      });
    });
    transaction(()=>{
      const nonempty=pages.filter(page=>page.text.trim());
      const row=current(job),record={...JSON.parse(row.record),status:'Completed',ocrStatus:'completed',ocrProgress:100,ocrError:undefined,ocrText:pages.map(page=>page.text).join('\n\n'),pages:pages.length,ocrCompletedAt:new Date().toISOString(),ocrConfidence:nonempty.length?Math.round(nonempty.reduce((sum,page)=>sum+page.confidence,0)/nonempty.length):0,ocrLanguages:['eng','ara','fra'],ocrEngineVersion:'tesseract-7-rotate-v1'};
      db.prepare('DELETE FROM ocr_pages WHERE document_id=?').run(job.id);
      for(const page of pages)db.prepare('INSERT INTO ocr_pages(document_id,page_number,text,confidence) VALUES(?,?,?,?)').run(job.id,page.page,page.text,page.confidence);
      db.prepare('UPDATE documents SET record=? WHERE id=?').run(JSON.stringify(record),job.id);
      db.prepare("UPDATE ocr_jobs SET state='completed',finished_at=?,lease_until=0,error=NULL WHERE document_id=? AND token=?").run(new Date().toISOString(),job.id,job.token);
      audit(row,record,`Completed local text recognition (${pages.length} pages, English/Arabic/French)`);
    });
    console.log(`OCR completed for document ${job.id}, ${pages.length} page(s).`);
  } catch(error) {
    transaction(()=>{
      let row;try{row=current(job);}catch{return;}
      const message=String(error.message||'Text recognition failed').slice(0,1000);
      const record={...JSON.parse(row.record),status:'Failed',ocrStatus:'failed',ocrError:message};
      db.prepare('UPDATE documents SET record=? WHERE id=?').run(JSON.stringify(record),job.id);
      db.prepare("UPDATE ocr_jobs SET state='failed',error=?,finished_at=?,lease_until=0 WHERE document_id=? AND token=?").run(message,new Date().toISOString(),job.id,job.token);
      audit(row,record,`Local text recognition failed (${message})`);
    });
    console.error(`OCR failed for document ${job.id}: ${error.message}`);
  }
}
try {
  let idleSince=Date.now();
  while(Date.now()-idleSince<60000){
    active=claim();
    if(active){idleSince=Date.now();await run(active);active=null;idleSince=Date.now();}
    else await new Promise(resolve=>setTimeout(resolve,1000));
  }
} finally {
  clearInterval(heartbeat);clearTimeout(hardTimeout);
  if(engine)await engine.close();
  db.prepare('DELETE FROM ocr_worker_lock WHERE id=1 AND token=?').run(owner);
  db.close();
}
