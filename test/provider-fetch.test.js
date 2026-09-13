import test from 'node:test';
import assert from 'node:assert/strict';
import { clearProviderFetchCache, fetchProviderJson } from '../api/_providerFetch.js';

test('provider cache deduplicates simultaneous requests and reuses a fresh response', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; clearProviderFetchCache(); });
  clearProviderFetchCache();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return response(200, { value: calls });
  };

  const [first, second] = await Promise.all([
    fetchProviderJson('https://provider.test/data', { ttlMs: 1_000 }),
    fetchProviderJson('https://provider.test/data', { ttlMs: 1_000 }),
  ]);
  const third = await fetchProviderJson('https://provider.test/data', { ttlMs: 1_000 });
  assert.deepEqual(first, { value: 1 });
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(calls, 1);
});

test('provider fetch retries transient errors but does not cache failures', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; clearProviderFetchCache(); });
  clearProviderFetchCache();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return calls === 1 ? response(503, { error: 'down' }) : response(200, { ok: true });
  };
  assert.deepEqual(await fetchProviderJson('https://provider.test/retry', { retries: 1, retryDelayMs: 0 }), { ok: true });
  assert.equal(calls, 2);

  global.fetch = async () => response(404, { error: 'missing' });
  await assert.rejects(() => fetchProviderJson('https://provider.test/missing', { retries: 2, retryDelayMs: 0 }), { status: 502 });
});

test('provider fetch rejects HTML returned with a success status', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; clearProviderFetchCache(); });
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '<html>error</html>' });
  await assert.rejects(() => fetchProviderJson('https://provider.test/html'), /invalid JSON/);
});

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}
