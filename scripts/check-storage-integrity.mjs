import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
const database = new DatabaseSync('.data/dms.sqlite', {readOnly:true});
let checked = 0;
const issues = [];
for (const row of database.prepare('SELECT id, file_key, mime_type, record FROM documents').all()) {
  const record = JSON.parse(row.record);
  if (record.category === 'Trash') continue;
  try {
    if (!/^[a-f0-9-]{36}$/.test(row.file_key)) throw new Error('Invalid storage key');
    const bytes = fs.readFileSync(path.join('.data','documents',row.file_key));
    if (!bytes.length) throw new Error('Empty file');
    if (row.mime_type === 'application/pdf') {
      if (bytes.subarray(0,5).toString() !== '%PDF-' || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new Error('Invalid PDF header or missing EOF');
      const text = bytes.toString('latin1');
      for (const match of text.matchAll(/\/Filter\s*\/DCTDecode[^]*?stream\r?\n/g)) {
        const offset = match.index + match[0].length;
        if (bytes[offset] !== 255 || bytes[offset+1] !== 216) throw new Error('PDF contains incorrectly encoded JPEG image');
      }
    }
    if (row.mime_type === 'image/jpeg' && (bytes[0] !== 255 || bytes[1] !== 216)) throw new Error('Invalid JPEG header');
    if (row.mime_type === 'image/png' && !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG header');
    checked++;
  } catch (error) { issues.push({documentId:row.id,error:error.message}); }
}
database.close();
console.log(JSON.stringify({checked,issues}));
if (issues.length) process.exitCode = 1;
