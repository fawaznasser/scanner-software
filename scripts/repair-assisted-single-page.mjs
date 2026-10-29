// Repairs only the explicitly identified, earlier assisted one-page test.
// Original document bytes and metadata are backed up; no capture is deleted.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pdf } from './scanner-pdf.mjs';
const database = new DatabaseSync('.data/dms.sqlite');
database.exec('PRAGMA busy_timeout=5000');
const row = database.prepare('SELECT * FROM documents WHERE id=14').get();
const record = JSON.parse(row.record);
const jobRow = database.prepare('SELECT record FROM scan_jobs WHERE id=?').get(row.scan_job_id);
const job = JSON.parse(jobRow.record);
if (record.name !== 'HP_Test_One_Page.pdf' || record.pages !== 1 || job.providerJobId !== '989bcd52-8504-4479-830a-07ea59a8951c' || job.result?.documentId !== 14) throw new Error('Unexpected document; refusing repair.');
if (!/^[a-f0-9-]{36}$/.test(row.file_key)) throw new Error('Unexpected file key');
const original = path.resolve('.data','documents',row.file_key);
const originalBytes = fs.readFileSync(original);
const imageStream = /\/Filter\s*\/DCTDecode[^]*?stream\r?\n/.exec(originalBytes.toString('latin1'));
const imageOffset = imageStream ? imageStream.index + imageStream[0].length : -1;
if (imageOffset < 0 || originalBytes[imageOffset] !== 66 || originalBytes[imageOffset + 1] !== 77) throw new Error('Document does not match the known encoding issue; no changes made.');
const repairFolder = path.resolve('.data','document-repairs',randomUUID());
fs.mkdirSync(repairFolder,{recursive:true});
fs.copyFileSync(original,path.join(repairFolder,'original-document.pdf'),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(repairFolder,'original-metadata.json'),JSON.stringify({row,job},null,2),{flag:'wx'});
const capture = path.resolve('.data','scanner-bridge',job.providerJobId,'page-0.jpg');
const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-STA','-File',path.resolve('scripts/convert-existing-capture.ps1'),'-SourcePath',capture,'-OutputDirectory',repairFolder],{encoding:'utf8',windowsHide:true});
if (result.status !== 0) throw new Error(result.stderr || 'Local capture conversion failed');
const page = JSON.parse(result.stdout.replace(/^\uFEFF/,''));
const bytes = pdf([page],job.settings.resolution);
const key = randomUUID();
fs.writeFileSync(path.join('.data','documents',key),bytes,{flag:'wx'});
database.exec('BEGIN IMMEDIATE');
try {
  const current = database.prepare('SELECT * FROM documents WHERE id=14').get();
  if (current.file_key !== row.file_key) throw new Error('Document changed during repair; refusing update.');
  const updated = {...JSON.parse(current.record),sizeBytes:bytes.length,size:`${(bytes.length/1024/1024).toFixed(2)} MB`};
  database.prepare('UPDATE documents SET file_key=?,record=? WHERE id=14').run(key,JSON.stringify(updated));
  const currentJob = JSON.parse(database.prepare('SELECT record FROM scan_jobs WHERE id=?').get(job.id).record);
  currentJob.result.sizeBytes = bytes.length;
  database.prepare('UPDATE scan_jobs SET record=? WHERE id=?').run(JSON.stringify(currentJob),job.id);
  const event = {id:randomUUID(),timestamp:new Date().toISOString(),userId:'system-maintenance',userName:'DMS maintenance',userInitials:'DM',role:'System',action:'file-updated',description:`Repaired legacy image encoding for assisted test ${record.documentNumber} (${record.name}) from its preserved capture. Original file backed up.`,device:'Local maintenance tool',ipAddress:'Local computer',userAgent:'DMS maintenance',file:{documentId:14,documentNumber:record.documentNumber,documentName:record.name,ownerId:row.owner_id,changes:[{field:'PDF image encoding',before:'Bitmap incorrectly labeled JPEG',after:'Normalized JPEG; original single page preserved'}]}};
  database.prepare('INSERT INTO audit_logs(id,timestamp,user_id,document_id,record) VALUES(?,?,?,?,?)').run(event.id,event.timestamp,event.userId,14,JSON.stringify(event));
  database.exec('COMMIT');
} catch(error) { database.exec('ROLLBACK'); throw error; }
database.close();
console.log(JSON.stringify({documentId:14,pages:1,bytes:bytes.length,backup:repairFolder}));
