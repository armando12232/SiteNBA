import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPABASE_CONFIGURED, SUPABASE_CONFIG_ERROR } from '../src/api/supabase.js';
import { getCurrentSession, signIn, signOut, startCheckout } from '../src/api/subscriptions.js';

test('frontend Supabase client requires explicit Vite env', async () => {
  assert.equal(SUPABASE_CONFIGURED, false);
  assert.equal(SUPABASE_CONFIG_ERROR.includes('VITE_SUPABASE_URL'), true);
  assert.equal(await getCurrentSession(), null);

  const login = await signIn('user@test.com', 'password');
  assert.equal(login.error.message, SUPABASE_CONFIG_ERROR);

  const logout = await signOut();
  assert.equal(logout.error, null);

  await assert.rejects(() => startCheckout('pro'), { message: SUPABASE_CONFIG_ERROR });
});
