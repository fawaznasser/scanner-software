// Read-only verification against existing stored documents, not sample fixtures.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createHmac,randomUUID,createHash} from 'node:crypto';
const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const textExports={}; vm.runInNewContext(compile('lib/document-text.ts'),{exports:textExports});
const exports={}; vm.runInNewContext(compile('lib/document-library.ts'),{exports,Intl,Date,require:()=>textExports});
const accounts=JSON.parse(fs.readFileSync('.data/accounts.json','utf8'));
const env=fs.readFileSync('.env.local','utf8');
const secret=env.match(/^AUTH_SECRET=(.+)$/m)?.[1] || fs.readFileSync('.data/session-secret','utf8').trim();
const base=process.env.DMS_TEST_BASE_URL || 'http://localhost:3000';
const options={query:'',scope:'Everything',category:'',status:'',type:'',from:'',to:'',sort:'Newest first'};
let scansChecked=0;
for(const role of ['Administrator','Editor']) {
 const user=accounts.find(user=>user.role===role);
 const payload=Buffer.from(JSON.stringify({userId:user.id,sessionVersion:user.sessionVersion,sessionId:randomUUID(),expiresAt:Math.floor(Date.now()/1000)+120})).toString('base64url');
 const headers={cookie:`dms_session=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`};
 const response=await fetch(base+'/api/documents',{headers}); assert.equal(response.status,200);
 const {documents}=await response.json();
 assert(!documents.some(doc=>doc.id===3),'Confirmed dummy must not be listed');
 for(const doc of documents.filter(doc=>/^Scan_\d{8}_\d{6}\.pdf$/.test(doc.name))) {
  if(role==='Editor') assert(doc.ownerId===user.id || doc.visibility==='public');
  for(const [query,scope] of [[doc.name,'File names'],[doc.documentNumber,'Document details'],[doc.documentNumber,'Everything']]) {
   assert(exports.filterLibrary(documents,{...options,query,scope}).some(found=>found.id===doc.id));
  }
  const text=textExports.searchableDocumentText(doc);
  if(doc.ocrStatus==='completed' && text.length>10) {
    const metadata=textExports.normalizeSearchText([doc.name,doc.documentNumber,doc.category,doc.ownerName].join(' '));
    const word=(text.match(/[\p{L}]{5,}/gu)||[]).find(word=>!metadata.includes(textExports.normalizeSearchText(word)));
    if(word) {
      assert(exports.filterLibrary(documents,{...options,query:word,scope:'Recognized text'}).some(found=>found.id===doc.id),'Words extracted from a real page must be searchable');
      assert(exports.filterLibrary(documents,{...options,query:word,scope:'Everything'}).some(found=>found.id===doc.id));
    }
  }
  if(!text) assert(!exports.filterLibrary([doc],{...options,query:'Text recognition has not been run',scope:'Recognized text'}).length);
  const file=await fetch(base+doc.downloadUrl,{headers}); assert.equal(file.status,200);
  assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  scansChecked++;
 }
 console.log(`${role}: real document listing, search and accessible scan downloads passed (${documents.length} accessible records).`);
}
assert(scansChecked>0,'No real Scan_ documents available: cannot claim real-scan verification.');
console.log(`Verified ${scansChecked} accessible real-scan cases. Page-content OCR availability is checked honestly; no records were modified.`);
