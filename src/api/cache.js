const memoryCache = new Map();
const inflightCache = new Map();

export function cachedFetch(key, ttlMs, loader) {
  const memory = readMemory(key, ttlMs);
  if (memory) return Promise.resolve(memory);

  const stored = readStored(key, ttlMs);
  if (stored) {
    memoryCache.set(key, { savedAt: Date.now(), data: stored });
    return Promise.resolve(stored);
  }

  if (inflightCache.has(key)) return inflightCache.get(key);

  const request = loader().then((data) => {
    memoryCache.set(key, { savedAt: Date.now(), data });
    writeStored(key, data);
    return data;
  }).finally(() => {
    inflightCache.delete(key);
  });

  inflightCache.set(key, request);
  return request;
}

export function readStored(key, ttlMs) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.savedAt > ttlMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeStored(key, data) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Browser storage is best-effort only.
  }
}

function readMemory(key, ttlMs) {
  const stored = memoryCache.get(key);
  if (!stored) return null;
  if (Date.now() - stored.savedAt > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return stored.data ?? null;
}
