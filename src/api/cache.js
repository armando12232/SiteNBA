const memoryCache = new Map();
const inflightCache = new Map();

export function cachedFetch(key, ttlMs, loader, { force = false } = {}) {
  if (!force) {
    const memory = memoryCache.get(key);
    if (isFresh(memory, ttlMs)) return Promise.resolve(memory.data);
    memoryCache.delete(key);

    const stored = readStoredEntry(key, ttlMs);
    if (stored) {
      memoryCache.set(key, stored);
      return Promise.resolve(stored.data);
    }
  }

  if (inflightCache.has(key)) return inflightCache.get(key);

  const request = Promise.resolve().then(loader).then((data) => {
    if (inflightCache.get(key) === request) {
      memoryCache.set(key, { savedAt: Date.now(), data });
      writeStored(key, data);
    }
    return data;
  }).finally(() => {
    if (inflightCache.get(key) === request) inflightCache.delete(key);
  });

  inflightCache.set(key, request);
  return request;
}

export function readStored(key, ttlMs) {
  return readStoredEntry(key, ttlMs)?.data ?? null;
}

function readStoredEntry(key, ttlMs) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isFresh(parsed, ttlMs)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
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

export function clearCachedPrefix(prefix) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  for (const key of inflightCache.keys()) {
    if (key.startsWith(prefix)) inflightCache.delete(key);
  }
  if (typeof window === 'undefined') return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Browser storage is best-effort only.
  }
}

function isFresh(entry, ttlMs) {
  if (!entry || !Number.isFinite(entry.savedAt) || entry.data == null) return false;
  const age = Date.now() - entry.savedAt;
  return age >= 0 && age < ttlMs;
}
