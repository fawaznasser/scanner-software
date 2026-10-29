import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { validateProductionEnvironment } from './production-config.mjs';
function load(file, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error, URL, ...globals });
  return exports;
}
const { checkScannerConnection: check } = load('lib/scanner-connection.ts');
const ready = [{status:'ready'}], broken = [{status:'error'}];
async function scenario({devices=ready, driver={serviceStatus:'Running',canRestart:true,busy:false}, confirm=true, editor=false, race=false}={}) {
  const calls=[]; let checks=0;
  const message = await check({reconnect:async repair=>{calls.push(repair?'repair':'reconnect');return repair?ready:devices;},readDriver:editor?undefined:async()=>{checks++;return {...driver,busy:driver.busy || (race && checks>1)};},confirmRestart:()=>{calls.push('confirm');return confirm;}});
  return {calls,message};
}
assert.deepEqual((await scenario()).calls,['reconnect']);
assert.deepEqual((await scenario({driver:{serviceStatus:'Running',canRestart:true,busy:true}})).calls,[]);
assert.deepEqual((await scenario({devices:[{status:'busy'}]})).calls,['reconnect']);
assert.deepEqual((await scenario({devices:broken})).calls,['reconnect','confirm','repair']);
assert.deepEqual((await scenario({devices:broken,confirm:false})).calls,['reconnect','confirm']);
assert.deepEqual((await scenario({devices:broken,race:true})).calls,['reconnect','confirm']);
assert.deepEqual((await scenario({devices:broken,editor:true})).calls,['reconnect']);
assert.deepEqual((await scenario({devices:[],driver:{serviceStatus:'Running',canRestart:true,busy:false}})).calls,['reconnect']);
assert.deepEqual((await scenario({devices:broken,driver:{serviceStatus:'Running',canRestart:false,busy:false}})).calls,['reconnect']);
await assert.rejects(check({reconnect:async repair=>{throw new Error(repair?'repair failed':'connect failed');},readDriver:async()=>({serviceStatus:'Stopped',canRestart:true,busy:false}),confirmRestart:()=>true}),/repair failed/);
const env = {};
const {requestOrigin,isAllowedRequestOrigin:allowed} = load('lib/request-origin.ts',{process:{env}});
const request=(origin,extra={})=>new Request('http://127.0.0.1:3000/api/test',{headers:{...(origin?{origin}:{}),...extra}});
assert(allowed(request('http://127.0.0.1:3000')));
env.DMS_PUBLIC_ORIGIN='https://dms.test.org';
assert.equal(requestOrigin(request()),'https://dms.test.org');
assert(allowed(request('https://dms.test.org')));
assert(!allowed(request('https://attacker.org')));
assert(!allowed(request('http://127.0.0.1:3000')));
assert(!allowed(request('https://dms.test.org',{'sec-fetch-site':'cross-site'})));
assert(!allowed(request('https://attacker.org',{'x-forwarded-host':'attacker.org','x-forwarded-proto':'https'})));
const valid={DMS_PUBLIC_ORIGIN:'https://dms.test.org',AUTH_SECRET:'a'.repeat(48),SCANNER_BRIDGE_API_KEY:'b'.repeat(48),SCANNER_BRIDGE_URL:'http://127.0.0.1:18765'};
assert.equal(validateProductionEnvironment(valid).port,3000);
for(const patch of [{DMS_PUBLIC_ORIGIN:'http://dms.test.org'},{DMS_PUBLIC_ORIGIN:'https://dms.test.org/path'},{AUTH_SECRET:'short'},{SCANNER_BRIDGE_API_KEY:valid.AUTH_SECRET},{SCANNER_BRIDGE_URL:'http://public.test.org'},{PORT:'bad'}]) assert.throws(()=>validateProductionEnvironment({...valid,...patch}));
console.log('Production setup passed: single-button recovery, busy/race protection, editor restrictions, HTTPS origins, spoof rejection, and deployment configuration validation. No scanner or Windows service was touched.');
