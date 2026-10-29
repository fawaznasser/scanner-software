import assert from 'node:assert/strict';
import { createScannerDiscovery } from './scanner-discovery.mjs';

let time = 10000, active = false, calls = 0, failure = null, devices = [{ id: 'test-scanner', status: 'ready' }];
const discovery = createScannerDiscovery(async () => {
  calls++;
  if (failure) throw new Error(failure);
  return { scanners: devices };
}, { now: () => time, isBusy: () => active });

assert.equal((await discovery.get()).scanners[0].status, 'ready');
for (let i = 0; i < 29; i++) { time += 1000; await discovery.get(); }
assert.equal(calls, 1, 'Healthy discovery is shared for 30 seconds');
active = true;
assert.equal((await discovery.get(true)).scanners[0].status, 'busy');
assert.equal(calls, 1, 'Do not open WIA while a scan is active');
active = false;
discovery.settle();
assert.equal((await discovery.get(true)).scanners[0].status, 'busy');
assert.equal(calls, 1, 'Allow the driver to release the feeder');
time += 3000;
failure = 'The scanner is busy. Close other scanning applications.';
await assert.rejects(discovery.get(), /scanner is busy/);
const firstFailureCalls = calls;
for (let i = 0; i < 4; i++) {
  time += 1000;
  await assert.rejects(discovery.get(), /scanner is busy/);
}
assert.equal(calls, firstFailureCalls, 'Errors do not hammer the driver');
time += 1000;
await assert.rejects(discovery.get(), /scanner is busy/);
assert.equal(calls, firstFailureCalls + 1, 'First retry after five seconds');
time += 9000;
await assert.rejects(discovery.get(), /scanner is busy/);
assert.equal(calls, firstFailureCalls + 1, 'Second failure backs off for ten seconds');
time += 1000;
failure = null;
assert.equal((await discovery.get()).scanners[0].status, 'ready', 'Recover without losing selection');
failure = 'USB connection failed';
await assert.rejects(discovery.get(true), /USB connection failed/);
await assert.rejects(discovery.get(), /USB connection failed/, 'Never hide errors with cached readiness');
failure = null;
assert.equal((await discovery.get(true)).scanners[0].status, 'ready', 'Manual reconnect bypasses backoff');
devices = [];
assert.deepEqual((await discovery.get(true)).scanners, [], 'Real unplugging must clear the device');
let checks = 0;
const singleFlight = createScannerDiscovery(async () => { checks++; return { scanners: [] }; });
await Promise.all([singleFlight.get(), singleFlight.get(), singleFlight.get()]);
assert.equal(checks, 1, 'Concurrent requests share a driver check');
let initialFailures = 0;
const unavailable = createScannerDiscovery(async () => { initialFailures++; throw new Error('No driver'); }, { now: () => time });
await assert.rejects(unavailable.get(), /No driver/);
await assert.rejects(unavailable.get(), /No driver/);
assert.equal(initialFailures, 1, 'Backoff also works before the first successful connection');
console.log('Scanner stability regression checks passed (no physical scan).');
