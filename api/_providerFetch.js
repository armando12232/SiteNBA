const responseCache = new Map();
const inflightCache = new Map();
const MAX_CACHE_ENTRIES = 250;

export async function fetchProviderJson(url, options = {}) {
  const ttlMs = positiveNumber(options.ttlMs, 120_000);
  const timeoutMs = positiveNumber(options.timeoutMs, 7_500);
  const retries = Math.max(0, Math.min(2, Number(options.retries) || 0));
  const parsedRetryDelay = Number(options.retryDelayMs);
  const retryDelayMs = Number.isFinite(parsedRetryDelay) && parsedRetryDelay >= 0 ? parsedRetryDelay : 120;
  const key = String(url);
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.savedAt < ttlMs) {
    responseCache.delete(key);
    responseCache.set(key, cached);
    return cached.data;
  }
  if (cached) responseCache.delete(key);
  if (inflightCache.has(key)) return inflightCache.get(key);

  const request = requestJson(key, {
    headers: options.headers,
    retries,
    retryDelayMs,
    timeoutMs,
  }).then((data) => {
    if (inflightCache.get(key) === request) {
      responseCache.set(key, { data, savedAt: Date.now() });
      trimCache();
    }
    return data;
  }).finally(() => {
    if (inflightCache.get(key) === request) inflightCache.delete(key);
  });

  inflightCache.set(key, request);
  return request;
}

export function clearProviderFetchCache() {
  responseCache.clear();
  inflightCache.clear();
}

async function requestJson(url, { headers, retries, retryDelayMs, timeoutMs }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0',
          ...(headers || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      if (!response.ok) {
        const error = providerError(`provider HTTP ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw providerError('provider returned invalid JSON');
      }
      if (data == null) throw providerError('provider returned an empty response');
      return data;
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable !== false;
      if (!retryable || attempt === retries) break;
      if (retryDelayMs) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }
  throw lastError || providerError('provider unavailable');
}

function trimCache() {
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function providerError(message) {
  return Object.assign(new Error(message), { status: 502 });
}
