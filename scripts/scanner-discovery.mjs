// Keep device identity through transient WIA busy errors without reporting it ready.
export function createScannerDiscovery(discover, { isBusy = () => false, now = Date.now, cacheMs = 30000 } = {}) {
  let cached = null;
  let checkedAt = -Infinity;
  let settlingUntil = 0;
  let pending = null;
  let failures = 0;
  let retryAt = 0;
  let lastError = null;
  const remember = (result) => {
    cached = result.scanners; checkedAt = now(); failures = 0; retryAt = 0; lastError = null;
    return result;
  };
  const busy = () => ({ scanners: (cached ?? []).map(scanner => ({ ...scanner, status: 'busy', feederStatus: 'unknown' })) });
  return {
    remember,
    busy,
    settle() { settlingUntil = now() + 2500; checkedAt = -Infinity; retryAt = 0; },
    async get(force = false) {
      if (isBusy() || now() < settlingUntil) return busy();
      if (!force && now() < retryAt && lastError) throw lastError;
      if (!force && cached !== null && !lastError && now() - checkedAt < cacheMs) return { scanners: cached };
      if (!pending) {
        pending = Promise.resolve().then(discover).then(remember).catch(error => {
          lastError = error;
          failures++;
          retryAt = now() + Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4));
          // Retry later; an unsuccessful connection check must never invent readiness.
          // Only our own running worker is confirmed busy. A WIA busy error can
          // also mean a stuck driver connection, so expose it as a connection error.
          if (cached) cached = cached.map(scanner => ({ ...scanner, status: 'error', feederStatus: 'unknown' }));
          checkedAt = now();
          throw error;
        }).finally(() => { pending = null; });
      }
      return pending;
    },
  };
}
