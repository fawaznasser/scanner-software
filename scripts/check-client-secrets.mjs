import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const build = process.env.DMS_BUILD_DIR || '.next-production-check';
const root = path.join(build,'static');
assert(fs.existsSync(root), 'Build the production version before checking client assets.');
const secrets = [];
for (const file of ['.data/session-secret','.data/scanner-bridge/api-key']) if(fs.existsSync(file)) secrets.push(fs.readFileSync(file,'utf8').trim());
if(fs.existsSync('credentials.local.txt')) for(const match of fs.readFileSync('credentials.local.txt','utf8').matchAll(/Password: ([^\r\n]+)/g)) secrets.push(match[1]);
if(fs.existsSync('.env.local')) for(const match of fs.readFileSync('.env.local','utf8').matchAll(/^(?:AUTH_SECRET|SCANNER_BRIDGE_API_KEY)=(.+)$/gm)) secrets.push(match[1].trim().replace(/^["']|["']$/g,''));
let files = 0;
for(const entry of fs.readdirSync(root,{recursive:true})) {
  const file = path.join(root,entry);
  if(!fs.statSync(file).isFile()) continue;
  const content = fs.readFileSync(file);
  for(const secret of secrets.filter(value=>value.length>=16)) assert(!content.includes(Buffer.from(secret)),`Sensitive value found in public client artifact: ${file}`);
  files++;
}
console.log(`Client artifact checks passed: ${files} public build files contain no known credentials or server/bridge secrets.`);
