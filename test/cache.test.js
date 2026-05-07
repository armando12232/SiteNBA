import test from 'node:test';
import assert from 'node:assert/strict';

import { cachedFetch, readStored, writeStored } from '../src/api/cache.js';

test('writeStored and readStored persist valid localStorage entries', () => {
  const storage = createStorage();
  global.window = { localStorage: storage };

  writeStored('cache:test:basic', { ok: true });
  const data = readStored('cache:test:basic', 10_000);

  assert.deepEqual(data, { ok: true });

  delete global.window;
});

test('readStored drops expired entries', () => {
  const storage = createStorage();
  global.window = { localStorage: storage };

  const realNow = Date.now;
  Date.now = () => 1_000;
  writeStored('cache:test:expired', { stale: true });
  Date.now = () => 20_000;

  const data = readStored('cache:test:expired', 5_000);
  assert.equal(data, null);
  assert.equal(storage.getItem('cache:test:expired'), null);

  Date.now = realNow;
  delete global.window;
});

test('cachedFetch de-duplicates inflight requests for the same key', async () => {
  const storage = createStorage();
  global.window = { localStorage: storage };

  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { value: 'shared' };
  };

  const [a, b] = await Promise.all([
    cachedFetch('cache:test:inflight', 10_000, loader),
    cachedFetch('cache:test:inflight', 10_000, loader),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(a, { value: 'shared' });
  assert.deepEqual(b, { value: 'shared' });

  delete global.window;
});

test('cachedFetch reuses stored value without calling loader', async () => {
  const storage = createStorage();
  global.window = { localStorage: storage };

  writeStored('cache:test:stored-only', { source: 'storage' });

  let calls = 0;
  const result = await cachedFetch('cache:test:stored-only', 10_000, async () => {
    calls += 1;
    return { source: 'loader' };
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, { source: 'storage' });

  delete global.window;
});

function createStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
  };
}
