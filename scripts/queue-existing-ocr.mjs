// Maintenance backfill: genuine saved scans only. Original files are untouched.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const db=new DatabaseSync('.data/dms.sqlite');db.exec('PRAGMA busy_timeout=5000');
const rows=db.prepare("SELECT * FROM documents WHERE scan_job_id IS NOT NULL AND json_extract(record,'$.category') != 'Trash'").all();
const backup=path.resolve('.data','ocr','metadata-backups',`${randomUUID()}.json`);
fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,JSON.stringify(rows,null,2),{flag:'wx'});
const queued=[];
db.exec('BEGIN IMMEDIATE');
try {
 for(const row of rows){
  const current=db.prepare('SELECT * FROM documents WHERE id=?').get(row.id);
  if(!current)continue;
  const record=JSON.parse(current.record);
  const job=db.prepare('SELECT state,lease_until FROM ocr_jobs WHERE document_id=?').get(row.id);
  const upgrade=process.argv.includes('--upgrade-orientation') && record.ocrEngineVersion!=='tesseract-7-rotate-v1';
  if(record.category==='Trash'||(record.ocrStatus==='completed'&&!upgrade)||job?.state==='queued'||(job?.state==='processing'&&job.lease_until>Date.now()))continue;
  db.prepare('UPDATE documents SET record=? WHERE id=?').run(JSON.stringify({...record,status:'Processing',ocrStatus:'queued',ocrProgress:0,ocrError:undefined}),row.id);
  db.prepare("INSERT INTO ocr_jobs(document_id,state,queued_at) VALUES(?,'queued',?) ON CONFLICT(document_id) DO UPDATE SET state='queued',attempts=0,queued_at=excluded.queued_at,error=NULL,token=NULL,lease_until=0").run(row.id,new Date().toISOString());
  const event={id:randomUUID(),timestamp:new Date().toISOString(),userId:'system-ocr',userName:'DMS text recognition',userInitials:'OCR',role:'System',action:'ocr',description:`Queued local OCR for existing scan ${record.documentNumber} (${record.name})`,device:'Local maintenance tool',ipAddress:'Local computer',userAgent:'DMS local OCR',file:{documentId:row.id,documentNumber:record.documentNumber,documentName:record.name,ownerId:row.owner_id}};
  db.prepare('INSERT INTO audit_logs(id,timestamp,user_id,document_id,record) VALUES(?,?,?,?,?)').run(event.id,event.timestamp,event.userId,row.id,JSON.stringify(event));
  queued.push(row.id);
 }
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}
db.close();console.log(JSON.stringify({queued,metadataBackup:backup,originalFilesChanged:0}));
