import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFeature, clearPlanAccessCache, loadUserAccess } from '../api/_planGuard.js';

test('plan access loads auth and subscription directly and caches the result', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; clearPlanAccessCache(); });
  clearPlanAccessCache();
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.endsWith('/auth/v1/user')) return response(200, { id: 'user-1', email: 'pro@test.com' });
    return response(200, [{ plan: 'pro', status: 'active', role: 'user' }]);
  };
  const config = { supabaseUrl: 'https://demo.supabase.co', serviceKey: 'service-key' };
  const first = await loadUserAccess('Bearer user-token', config);
  const second = await loadUserAccess('Bearer user-token', config);
  assert.equal(first.plan, 'pro');
  assert.deepEqual(second, first);
  assert.deepEqual(urls, [
    'https://demo.supabase.co/auth/v1/user',
    'https://demo.supabase.co/rest/v1/subscriptions?select=plan,status,role&user_id=eq.user-1&limit=1',
  ]);
});

test('simultaneous plan checks share one Supabase lookup', async (t) => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SUPABASE_SERVICE_KEY;
  const originalUrl = process.env.SUPABASE_URL;
  t.after(() => {
    global.fetch = originalFetch;
    restoreEnv('SUPABASE_SERVICE_KEY', originalKey);
    restoreEnv('SUPABASE_URL', originalUrl);
    clearPlanAccessCache();
  });
  clearPlanAccessCache();
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return url.endsWith('/auth/v1/user')
      ? response(200, { id: 'user-2' })
      : response(200, [{ plan: 'premium', status: 'active', role: 'user' }]);
  };
  const req = { headers: { authorization: 'Bearer shared-token' } };
  const [first, second] = await Promise.all([checkFeature(req, 'football'), checkFeature(req, 'sports')]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls, 2);
});

test('plan guard rejects missing tokens before any provider request', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; clearPlanAccessCache(); });
  let calls = 0;
  global.fetch = async () => { calls += 1; return response(500, {}); };
  const result = await checkFeature({ headers: {} }, 'football');
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
