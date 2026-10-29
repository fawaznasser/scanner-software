import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const banned = [/Invoice_2938/, /InvoiceSheet/, /Recognition accuracy: 98%/, /Other devices were signed out/, /Office workstation/, /1 TB/, /Help center opened/, /panel opened/, /demoDocuments/, /demoScanner\(/];
for (const root of ['app', 'components', 'lib', 'data']) {
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    const file = path.join(root, entry);
    if (!/\.(tsx?|mjs)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) assert(!pattern.test(text), `${file} still contains ${pattern}`);
  }
}
assert(!fs.existsSync('public/demo-documents'), 'Samples must not be served from public');
assert(fs.readFileSync('.gitignore','utf8').includes('credentials.local.txt'));
console.log('Production source checks passed: no simulated scanner, sample UI, fake actions or public sample PDFs.');
