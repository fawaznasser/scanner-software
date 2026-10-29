import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {PDFiumLibrary} from '@hyzyla/pdfium';
import {PNG} from 'pngjs';
const db=new DatabaseSync('.data/dms.sqlite',{readOnly:true});
const row=db.prepare("SELECT * FROM documents WHERE scan_job_id IS NOT NULL AND json_extract(record,'$.category') != 'Trash' ORDER BY id DESC LIMIT 1").get();db.close();
const library=await PDFiumLibrary.init();
const document=await library.loadDocument(fs.readFileSync(path.join('.data','documents',row.file_key)));
try {
 const page=document.getPage(Math.min(1,document.getPageCount()-1));
 try {
  const image=await page.render({scale:2,render:({data,width,height})=>PNG.sync.write({data:Buffer.from(data),width,height})});
  fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/ocr-real-readable-page.png',image.data);
  console.log('Rendered actual saved scan for local visual verification.');
 }finally{page.close();}
}finally{document.destroy();library.destroy();}
