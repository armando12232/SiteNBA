import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBearerToken,
  normalizeSupabaseUrl,
  verifySupabaseToken,
} from '../api/_supabaseAuth.js';

test('extractBearerToken normalizes authorization headers', () => {
  assert.equal(extractBearerToken('Bearer abc.def'), 'abc.def');
  assert.equal(extractBearerToken('bearer token'), 'token');
  assert.equal(extractBearerToken('raw-token'), 'raw-token');
  assert.equal(extractBearerToken(''), '');
});

test('normalizeSupabaseUrl only accepts Supabase project URLs', () => {
  assert.equal(normalizeSupabaseUrl('https://demo.supabase.co/'), 'https://demo.supabase.co');
  assert.equal(normalizeSupabaseUrl('http://demo.supabase.co'), 'https://dhirxfoxcswctxcjzvhf.supabase.co');
});

test('verifySupabaseToken validates token with Supabase Auth endpoint', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://demo.supabase.co/auth/v1/user');
    assert.equal(options.headers.apikey, 'service-key');
    assert.equal(options.headers.Authorization, 'Bearer user-token');
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'user-1', email: 'user@test.com' }),
    };
  };

  const user = await verifySupabaseToken('https://demo.supabase.co', 'service-key', 'Bearer user-token');
  assert.deepEqual(user, { id: 'user-1', email: 'user@test.com' });
});

test('verifySupabaseToken rejects invalid or missing tokens', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  await assert.rejects(
    () => verifySupabaseToken('https://demo.supabase.co', 'service-key', ''),
    { message: 'missing bearer token', status: 401 },
  );

  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"message":"bad jwt"}',
  });

  await assert.rejects(
    () => verifySupabaseToken('https://demo.supabase.co', 'service-key', 'bad-token'),
    { message: 'invalid bearer token', status: 401 },
  );
});
