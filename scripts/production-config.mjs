import fs from 'node:fs';
import path from 'node:path';

export function validateProductionEnvironment(env) {
  const origin = new URL(env.DMS_PUBLIC_ORIGIN || 'http://missing.invalid');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.hostname.endsWith('.invalid') || origin.hostname.endsWith('.example') || origin.hostname === 'localhost') throw new Error('Set DMS_PUBLIC_ORIGIN to your actual public HTTPS origin, without a path.');
  for (const key of ['AUTH_SECRET', 'SCANNER_BRIDGE_API_KEY']) {
    if (!env[key] || env[key].length < 32 || /replace|example|change.me/i.test(env[key])) throw new Error(`${key} must contain a strong secret of at least 32 characters.`);
  }
  const bridge = new URL(env.SCANNER_BRIDGE_URL || 'http://missing.invalid');
  if (!['http:', 'https:'].includes(bridge.protocol) || bridge.username || bridge.password || bridge.pathname !== '/' || bridge.search || bridge.hash) throw new Error('SCANNER_BRIDGE_URL must be a bridge origin without credentials or a path.');
  if (bridge.protocol === 'http:' && !['127.0.0.1', '[::1]', 'localhost'].includes(bridge.hostname)) throw new Error('Use a loopback private tunnel or HTTPS for the scanner bridge.');
  if (env.AUTH_SECRET === env.SCANNER_BRIDGE_API_KEY) throw new Error('Use different authentication and scanner bridge secrets.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer between 1024 and 65535.');
  return { origin: origin.origin, port };
}

export function checkProductionFiles(root) {
  if (fs.existsSync(path.join(root, 'credentials.local.txt'))) throw new Error('Keep credentials.local.txt off the production server. Transfer account hashes privately instead.');
  if (fs.existsSync(path.join(root, '.env.local'))) throw new Error('Use .env.production.local on the server; .env.local could override production settings.');
  for (const file of ['.next-production/BUILD_ID', '.data/accounts.json', '.data/dms.sqlite', '.data/ocr/models/eng.traineddata.gz', '.data/ocr/models/ara.traineddata.gz', '.data/ocr/models/fra.traineddata.gz']) {
    if (!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}. Follow deployment/DEPLOYMENT.txt before starting.`);
  }
  const accounts = JSON.parse(fs.readFileSync(path.join(root,'.data/accounts.json'),'utf8'));
  if (!Array.isArray(accounts) || !accounts.length || !accounts.some(account=>account.role==='Administrator') || accounts.some(account=>!/^[a-f0-9]{128}$/i.test(account.passwordHash || '') || !/^[a-f0-9]{32}$/i.test(account.salt || ''))) throw new Error('Import valid hashed accounts, including an administrator.');
}
