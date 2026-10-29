import http from 'node:http';
import { createScannerDiscovery } from './scanner-discovery.mjs';
import { pdf } from './scanner-pdf.mjs';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, '.data', 'scanner-bridge');
mkdirSync(directory, { recursive: true });
const keyFile = path.join(directory, 'api-key');
if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
const apiKey = readFileSync(keyFile, 'utf8').trim();
const envFile = path.join(root, '.env.local');
const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
const settings = { SCANNER_PROVIDER: 'bridge', SCANNER_BRIDGE_URL: 'http://127.0.0.1:8765', SCANNER_BRIDGE_API_KEY: apiKey, SCANNER_REQUEST_TIMEOUT_MS: '30000' };
let updated = env;
for (const [key, value] of Object.entries(settings)) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  updated = pattern.test(updated) ? updated.replace(pattern, `${key}=${value}`) : `${updated.trimEnd()}\n${key}=${value}\n`;
}
if (updated !== env) writeFileSync(envFile, updated.trimStart(), { mode: 0o600 });
const jobs = new Map();
let discovering = null;
let startingScan = false;
let workerRunning = false;
const scannerDiscovery = createScannerDiscovery(discover, { isBusy: () => startingScan || workerRunning });

function wia(args) {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(root, 'scripts', 'scanner-wia.ps1'), ...args], { windowsHide: true });
  let stdout = '', stderr = '';
  const promise = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => { if (code !== 0) reject(new Error(stderr.trim() || 'Scanner driver failed')); else { try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { reject(new Error('Invalid response from Windows scanner driver')); } } });
  });
  return { child, promise };
}
function discover() {
  if (!discovering) { const worker = wia(['-Mode', 'discover']); const timeout = setTimeout(() => worker.child.kill(), 25000); discovering = worker.promise.finally(() => { clearTimeout(timeout); discovering = null; }); }
  return discovering;
}
function publicJob(job) { const { child, output, ...data } = job; return data; }
function json(response, status, body) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); }
async function body(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 16384) throw new Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
http.createServer(async (request, response) => {
  const provided = Buffer.from(request.headers.authorization || ''); const expected = Buffer.from(`Bearer ${apiKey}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return json(response, 401, { error: 'Scanner bridge authentication required' });
  const url = new URL(request.url, 'http://127.0.0.1:8765');
  try {
    if (request.method === 'GET' && url.pathname === '/v1/health') return json(response,200,{ok:true,driver:'Windows WIA',busy:startingScan||workerRunning});
    if (request.method === 'GET' && url.pathname === '/v1/driver') {
      const worker = wia(['-Mode','status']);
      const timeout = setTimeout(() => worker.child.kill(), 15000);
      try { return json(response,200,{ ...await worker.promise, busy:startingScan||workerRunning }); }
      finally { clearTimeout(timeout); }
    }
    if (request.method === 'POST' && url.pathname === '/v1/reconnect') {
      if(startingScan||workerRunning) return json(response,409,{error:'A scan is running. Cancel your scan or wait for it to finish before reconnecting.'});
      if(discovering) await discovering.catch(()=>{});
      const result=await scannerDiscovery.get(true);
      return json(response,200,result);
    }
    if (request.method === 'POST' && url.pathname === '/v1/recover-driver') {
      if(startingScan||workerRunning||discovering) return json(response,409,{error:'Wait for the current scan or connection check to finish before repairing the driver.'});
      startingScan=true;
      try {
        const worker=wia(['-Mode','recover']);
        const timeout=setTimeout(()=>worker.child.kill(),25000);
        try { const result=scannerDiscovery.remember(await worker.promise);return json(response,200,result); }
        finally {clearTimeout(timeout);}
      } finally {startingScan=false;}
    }
    if (request.method === 'GET' && url.pathname === '/v1/scanners') {
      const result = await scannerDiscovery.get();
      return json(response, 200, result);
    }
    if (request.method === 'POST' && url.pathname === '/v1/scan-jobs') {
      if (startingScan || workerRunning || [...jobs.values()].some(job => ['queued','scanning','processing'].includes(job.status))) return json(response, 409, {error:'A scan is already running'});
      startingScan = true;
      try {
      const input = await body(request); const settings = input.settings;
      const devices = scannerDiscovery.remember(await discover());
      const scanner = devices.scanners.find(scanner => scanner.id === input.scannerId);
      if (!scanner) throw new Error('Scanner not found');
      if (!settings || !scanner.capabilities.formats.includes(settings.format) || !scanner.capabilities.resolutions.includes(settings.resolution) || !scanner.capabilities.paperSizes.includes(settings.paperSize) || !scanner.capabilities.sources.includes(settings.source) || !scanner.capabilities.colorModes.includes(settings.colorMode)) throw new Error('Choose settings supported by this scanner. Searchable PDF is not enabled.');
      if (settings.duplex && (!scanner.capabilities.supportsDuplex || settings.source !== 'automatic-feeder' || settings.format !== 'pdf')) throw new Error('Two-sided scanning requires a duplex feeder and PDF format.');
      if (!Number.isInteger(settings.pageLimit) || settings.pageLimit < 1 || settings.pageLimit > 50) throw new Error('Choose a page limit from 1 to 50');
      if (settings.enhance) throw new Error('Automatic image enhancement is not available in this connection.');
      const id = randomUUID(); const folder = path.join(directory, id); mkdirSync(folder);
      const inputPath = path.join(folder, 'request.json'); writeFileSync(inputPath, JSON.stringify(input));
      const job = { jobId:id, status:'scanning', progress:15 }; jobs.set(id, job);
      const worker = wia(['-Mode','scan','-InputPath',inputPath,'-OutputDirectory',folder]); job.child = worker.child;
      workerRunning = true;
      const progressTimer = setInterval(() => {
        if (job.status !== 'scanning') return;
        try { const progress = JSON.parse(readFileSync(path.join(folder, 'progress.json'),'utf8')); job.progress=progress.progress; job.pageCount=progress.pageCount; } catch { }
      }, 500);
      const timeout = setTimeout(() => { job.status = 'failed'; job.error = 'Scan timed out after five minutes'; worker.child.kill(); }, 300000);
      worker.promise.then(result => {
        if (job.status === 'cancelled' || job.status === 'failed') return;
        job.status = 'processing'; job.progress = 90;
        const extension = settings.format === 'jpeg' ? 'jpg' : settings.format;
        const output = path.join(folder, `result.${extension}`);
        writeFileSync(output, settings.format === 'pdf' ? pdf(result.pages, settings.resolution) : readFileSync(result.pages[0].path));
        Object.assign(job, {status:'completed',progress:100,pageCount:result.pages.length,fileName:`${String(settings.fileName || 'Scan').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_')}.${extension}`,mimeType:settings.format === 'pdf' ? 'application/pdf' : `image/${settings.format}`,sizeBytes:readFileSync(output).length,fileUrl:`/v1/scan-jobs/${id}/file`,output});
      }).catch(error => { if (job.status !== 'cancelled') {job.status='failed';job.error=error.message;} }).finally(() => { clearTimeout(timeout); clearInterval(progressTimer); workerRunning = false; scannerDiscovery.settle(); });
      return json(response, 202, {job:publicJob(job)});
      } finally { startingScan = false; }
    }
    const match = url.pathname.match(/^\/v1\/scan-jobs\/([a-f0-9-]+)(\/file)?$/);
    if (match) {
      const job = jobs.get(match[1]); if (!job) return json(response,404,{error:'Scan job not found'});
      if (request.method === 'GET' && match[2]) {
        if (job.status !== 'completed') return json(response,409,{error:'File not ready'});
        response.writeHead(200,{'Content-Type':job.mimeType,'Cache-Control':'no-store'}); return response.end(readFileSync(job.output));
      }
      if (request.method === 'GET') return json(response,200,{job:publicJob(job)});
      if (request.method === 'DELETE') { if (['queued','scanning','processing'].includes(job.status)) {job.status='cancelled';job.child?.kill();} return json(response,200,{ok:true}); }
    }
    json(response,404,{error:'Not found'});
  } catch (error) { json(response,503,{error:error.message}); }
}).listen(8765,'127.0.0.1',()=>console.log('Windows WIA scanner bridge running at http://127.0.0.1:8765. DMS environment configured; restart Next.js if already running.'));
