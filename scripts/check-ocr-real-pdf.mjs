import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createOcrEngine } from './ocr-engine.mjs';
const database=new DatabaseSync('.data/dms.sqlite',{readOnly:true});
const row=database.prepare("SELECT * FROM documents WHERE scan_job_id IS NOT NULL AND json_extract(record,'$.category') != 'Trash' ORDER BY id DESC LIMIT 1").get();
database.close();
assert(row,'No real saved scan available for OCR verification.');
const file=path.resolve('.data','documents',row.file_key);
const hash=()=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before=hash();
const engine=await createOcrEngine();
try {
  fs.mkdirSync('tmp/pdfs',{recursive:true});
  const pages=await engine.process(file,row.mime_type,()=>{},(png,number)=>{if(number===1)fs.writeFileSync('tmp/pdfs/ocr-real-page.png',png);});
  assert(pages.length>0);
  assert(pages.some(page=>page.text.length>10),'No readable printed text found in the latest real scan.');
  assert.equal(hash(),before,'Original scan must remain unchanged.');
  console.log(JSON.stringify({documentId:row.id,pages:pages.length,textCharacters:pages.reduce((sum,page)=>sum+page.text.length,0),originalUnchanged:true,render:'tmp/pdfs/ocr-real-page.png'}));
} finally {await engine.close();}
