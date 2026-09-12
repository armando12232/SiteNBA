import test from 'node:test';
import assert from 'node:assert/strict';

import { cachedFetch, clearCachedPrefix, readStored, writeStored } from '../src/api/cache.js';
import { clearPregameCache, getPregame } from '../src/api/nba.js';
import { clearWnbaCache, getWnbaPlayers, getWnbaPregame, getWnbaPregameByName } from '../src/api/wnba.js';

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

test('promoting stored data to memory preserves its original expiry', async (t) => {
  const originalNow = Date.now;
  const originalWindow = global.window;
  t.after(() => { Date.now = originalNow; global.window = originalWindow; });
  global.window = { localStorage: createStorage() };
  let now = 1000;
  Date.now = () => now;
  writeStored('cache:test:original-age', { generation: 1 });
  now = 60500;
  let calls = 0;
  const loader = async () => ({ generation: ++calls + 1 });
  assert.deepEqual(await cachedFetch('cache:test:original-age', 60000, loader), { generation: 1 });
  now = 62000;
  assert.deepEqual(await cachedFetch('cache:test:original-age', 60000, loader), { generation: 2 });
  assert.equal(calls, 1);
});

test('forcing a refresh bypasses fresh cache and deduplicates concurrent refreshes', async () => {
  const key = 'cache:test:force-refresh';
  let calls = 0;
  const loader = async () => ({ generation: ++calls });
  await cachedFetch(key, 60000, loader);
  const [first, second] = await Promise.all([
    cachedFetch(key, 60000, loader, { force: true }),
    cachedFetch(key, 60000, loader, { force: true }),
  ]);
  assert.deepEqual(first, { generation: 2 });
  assert.deepEqual(second, first);
  assert.equal(calls, 2);
});

test('clearing a cache prevents its pending old request from restoring stale data', async () => {
  const key = 'cache:test:clear-inflight';
  let resolveOld;
  const oldRequest = cachedFetch(key, 60000, () => new Promise((resolve) => { resolveOld = resolve; }));
  await Promise.resolve();
  clearCachedPrefix(key);
  await cachedFetch(key, 60000, async () => ({ generation: 2 }));
  resolveOld({ generation: 1 });
  await oldRequest;
  const result = await cachedFetch(key, 60000, async () => ({ generation: 3 }));
  assert.deepEqual(result, { generation: 2 });
});

test('NBA and WNBA caches expire in memory even when storage is unavailable', async (t) => {
  const originalNow = Date.now;
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  t.after(() => {
    Date.now = originalNow;
    global.fetch = originalFetch;
    global.window = originalWindow;
    clearPregameCache();
    clearWnbaCache();
  });
  delete global.window;
  let now = 1000;
  Date.now = () => now;
  let calls = 0;
  global.fetch = async () => ({ ok: true, json: async () => ({ generation: ++calls }) });
  for (const [load, ttl] of [
    [() => getPregame('ttl-test'), 5 * 60000],
    [() => getWnbaPlayers(37), 10 * 60000],
    [() => getWnbaPregame('ttl-test'), 10 * 60000],
    [() => getWnbaPregameByName('TTL Test'), 10 * 60000],
  ]) {
    const initial = await load();
    assert.deepEqual(await load(), initial);
    now += ttl;
    const refreshed = await load();
    assert.equal(refreshed.generation, initial.generation + 1);
  }
  assert.equal(calls, 8);
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
