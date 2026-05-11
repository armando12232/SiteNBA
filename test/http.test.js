import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchJson } from '../src/api/http.js';

test('fetchJson supports auth option without leaking it to fetch', async () => {
  const originalFetch = globalThis.fetch;
  let seenOptions = null;
  globalThis.fetch = async (_url, options) => {
    seenOptions = options;
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  try {
    const data = await fetchJson('/api/test', {
      auth: true,
      method: 'POST',
      headers: { 'X-Test': '1' },
    });

    assert.deepEqual(data, { ok: true });
    assert.equal(seenOptions.auth, undefined);
    assert.equal(seenOptions.method, 'POST');
    assert.equal(seenOptions.headers['X-Test'], '1');
    assert.ok(seenOptions.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
