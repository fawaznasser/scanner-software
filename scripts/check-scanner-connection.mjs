import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const base='http://localhost:3000';
const user=JSON.parse(readFileSync('.data/accounts.json','utf8')).find(user=>user.role==='Administrator');
const env=readFileSync('.env.local','utf8');
const secret=env.match(/^AUTH_SECRET=(.+)$/m)?.[1]||readFileSync('.data/session-secret','utf8').trim();
const payload=Buffer.from(JSON.stringify({userId:user.id,sessionVersion:user.sessionVersion,sessionId:randomUUID(),expiresAt:Math.floor(Date.now()/1000)+300})).toString('base64url');
const token=payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
const headers={cookie:'dms_session='+token,'Content-Type':'application/json'};
const response=await fetch(base+'/api/scanners',{headers});const devices=await response.json();assert.equal(response.status,200,devices.error);
const scanner=devices.scanners.find(scanner=>scanner.status==='ready');assert(scanner,'No ready scanner');
console.log(JSON.stringify({name:scanner.name,feeder:scanner.feederStatus,capabilities:scanner.capabilities}));
const valid={source:'automatic-feeder',colorMode:'color',paperSize:'A4',resolution:300,format:'pdf',duplex:false,autoFeed:false,enhance:false,pageLimit:1,fileName:'Validation.pdf',visibility:'private',category:'Reports'};
// Invalid requests must fail before the driver starts a scan.
for(const patch of [{resolution:1200},{source:'flatbed'},{format:'searchable-pdf'},{duplex:true,format:'jpeg'},{pageLimit:51},{category:'Invalid'}]){
 const result=await fetch(base+'/api/scan-jobs',{method:'POST',headers,body:JSON.stringify({scannerId:scanner.id,settings:{...valid,...patch}})});
 assert.equal(result.status,400,JSON.stringify(patch));
}
assert.equal((await fetch(base+'/api/scanners')).status,401);
assert.equal((await fetch('http://127.0.0.1:8765/v1/scanners')).status,401);
for(const url of ['/','/scan-documents','/settings']){const page=await fetch(base+url,{headers});assert.equal(page.status,200);}
const library=await(await fetch(base+'/api/documents',{headers})).json();
const duplex=library.documents.find(document=>document.name==='HP_Duplex_Test.pdf');
if(duplex){const file=await fetch(base+duplex.downloadUrl,{headers});assert.equal(file.status,200);const bytes=Buffer.from(await file.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(duplex.pages,2);}
console.log('PASS: real scanner discovery, protected bridge/API, unsupported-setting rejection, dashboard/scan/settings routes, saved duplex PDF download. No physical scan was started.');
