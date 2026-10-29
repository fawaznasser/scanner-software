import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('.data/dms.sqlite');
db.exec('PRAGMA busy_timeout=5000');
const row = db.prepare('SELECT * FROM documents WHERE id=3').get();
if (!row) { console.log('Confirmed dummy document is already absent.'); db.close(); process.exit(0); }
const record = JSON.parse(row.record);
if(row.scan_job_id || record.name !== 'Contract_ABC (1).pdf' || !/^[a-f0-9-]{36}$/.test(row.file_key)) throw new Error('Unexpected document; refusing removal.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const file = path.resolve('.data','documents',row.file_key);
const bytes = fs.readFileSync(file);
const fixture = fs.readFileSync('.data/retired-public-samples/demo-documents/Contract_ABC.pdf');
if(hash(bytes)!==hash(fixture)) throw new Error('Not identical to confirmed dummy PDF; no changes made.');
const backup = path.resolve('.data','retired-dummy-records',randomUUID());
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(path.join(backup,'document.json'),JSON.stringify(row,null,2),{flag:'wx'});
fs.writeFileSync(path.join(backup,'document.pdf'),bytes,{flag:'wx'});
db.exec('BEGIN IMMEDIATE');
try {
 const current=db.prepare('SELECT * FROM documents WHERE id=3').get();
 if(current.record!==row.record || current.file_key!==row.file_key) throw new Error('Document changed during removal.');
 const event={id:randomUUID(),timestamp:new Date().toISOString(),userId:'system-maintenance',userName:'DMS maintenance',userInitials:'DM',role:'System',action:'file-deleted',description:`Removed confirmed dummy sample ${record.documentNumber} (${record.name}) from the live library. File hash exactly matched the retired Contract_ABC.pdf fixture; recoverable backup retained.`,device:'Local maintenance tool',ipAddress:'Local computer',userAgent:'DMS maintenance',file:{documentId:3,documentNumber:record.documentNumber,documentName:record.name,ownerId:row.owner_id}};
 db.prepare('INSERT INTO audit_logs(id,timestamp,user_id,document_id,record) VALUES(?,?,?,?,?)').run(event.id,event.timestamp,event.userId,3,JSON.stringify(event));
 db.prepare('DELETE FROM documents WHERE id=3').run();
 db.exec('COMMIT');
} catch(error) {db.exec('ROLLBACK');throw error;}
db.close();
// Original private file is retained as an additional recovery copy.
console.log(JSON.stringify({removedDocumentId:3,backup,realScansChanged:0}));
