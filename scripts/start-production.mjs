import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { checkProductionFiles, validateProductionEnvironment } from './production-config.mjs';
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
process.env.NODE_ENV = 'production';
nextRequire('@next/env').loadEnvConfig(process.cwd(), false);
try {
  const config = validateProductionEnvironment(process.env);
  checkProductionFiles(process.cwd());
  console.log(`Starting production DMS for ${config.origin} behind the local HTTPS reverse proxy.`);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(config.port)], {
    stdio: 'inherit', env: { ...process.env, DMS_BUILD_DIR: '.next-production' },
  });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>child.kill(signal));
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) { console.error(`Production setup incomplete: ${error.message}`); process.exitCode = 1; }
