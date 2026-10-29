// Populate Next's supported WASM fallback cache from the version-locked package.
// This avoids a runtime network download and does not modify vendor source or
// Windows Application Control. The native compiler is still tried normally.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const nextRoot = path.dirname(require.resolve('next/package.json'));
const wasmRoot = path.dirname(require.resolve('@next/swc-wasm-nodejs'));
const next = JSON.parse(readFileSync(path.join(nextRoot, 'package.json'), 'utf8'));
const wasm = JSON.parse(readFileSync(path.join(wasmRoot, 'package.json'), 'utf8'));
if (next.version !== wasm.version) throw new Error('Next and its portable compiler must use the same version.');
const target = path.join(nextRoot, 'wasm', '@next', 'swc-wasm-nodejs');
mkdirSync(target, { recursive: true });
for (const file of ['package.json', 'wasm.js', 'wasm_bg.wasm']) copyFileSync(path.join(wasmRoot, file), path.join(target, file));
console.log(`Prepared Next ${next.version} portable compiler fallback.`);
