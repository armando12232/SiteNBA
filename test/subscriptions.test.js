import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_ACCESS,
  createSubscriptionSync,
  freeSubscription,
  getPlanAccess,
  normalizeSubscription,
} from '../src/api/subscriptions.js';

test('getPlanAccess falls back to free for unknown plans', () => {
  assert.deepEqual(getPlanAccess('unknown-plan'), PLAN_ACCESS.free);
});

test('free plan keeps the most restrictive access profile', () => {
  const access = getPlanAccess('free');
  assert.equal(access.maxProps, 5);
  assert.equal(access.previewRows, 12);
  assert.equal(access.modal, false);
  assert.equal(access.live, false);
  assert.equal(access.injuries, false);
  assert.equal(access.football, false);
  assert.equal(access.cs2, false);
  assert.equal(access.sports, false);
});

test('basic unlocks modal but not live or extra sports', () => {
  const access = getPlanAccess('basic');
  assert.equal(access.maxProps, 25);
  assert.equal(access.modal, true);
  assert.equal(access.live, false);
  assert.equal(access.football, false);
  assert.equal(access.cs2, false);
});

test('pro and premium unlock all gated modules', () => {
  for (const plan of ['pro', 'premium']) {
    const access = getPlanAccess(plan);
    assert.equal(access.maxProps, -1);
    assert.equal(access.modal, true);
    assert.equal(access.live, true);
    assert.equal(access.injuries, true);
    assert.equal(access.football, true);
    assert.equal(access.cs2, true);
    assert.equal(access.sports, true);
  }
});

test('normalizeSubscription keeps valid plans and defaults role/status', () => {
  const row = normalizeSubscription({ plan: 'premium', status: 'trialing', role: 'admin' });
  assert.equal(row.plan, 'premium');
  assert.equal(row.status, 'trialing');
  assert.equal(row.role, 'admin');
  assert.equal(row.label, 'Premium');
});

test('normalizeSubscription coerces invalid plans to free', () => {
  const row = normalizeSubscription({ plan: 'vip-max', status: '', role: '' });
  assert.equal(row.plan, 'free');
  assert.equal(row.status, 'active');
  assert.equal(row.role, 'user');
  assert.equal(row.label, 'Free');
});

test('freeSubscription returns guest/free defaults', () => {
  const row = freeSubscription();
  assert.equal(row.plan, 'free');
  assert.equal(row.status, 'active');
  assert.equal(row.role, 'guest');
  assert.equal(row.label, 'Free');
});

test('inactive paid subscriptions receive free access while admins retain all access', () => {
  for (const status of ['past_due', 'cancelled', 'canceled', 'unpaid', 'incomplete', undefined]) {
    assert.equal(getPlanAccess({ plan: 'premium', status, role: 'user' }), PLAN_ACCESS.free);
  }
  assert.equal(getPlanAccess({ plan: 'pro', status: 'trialing', role: 'user' }), PLAN_ACCESS.pro);
  assert.equal(getPlanAccess({ plan: 'free', status: 'cancelled', role: 'admin' }), PLAN_ACCESS.premium);
  assert.equal(getPlanAccess(null), PLAN_ACCESS.free);
});

test('a pending subscription lookup cannot restore paid access after logout', async () => {
  const pending = deferred();
  const states = [];
  const sync = createSubscriptionSync((state) => states.push(state), () => pending.promise);
  const loading = sync.refresh(session('first'));
  await sync.refresh(null);
  pending.resolve({ plan: 'premium', status: 'active' });
  await loading;
  assert.equal(states.at(-1).session, null);
  assert.equal(states.at(-1).subscription.plan, 'free');
  assert.equal(states.length, 2);
});

test('switching accounts discards old responses and resets the prior account plan', async () => {
  const first = deferred();
  const second = deferred();
  const states = [];
  const sync = createSubscriptionSync((state) => states.push(state), (token) => (
    token === 'first-token' ? first.promise : second.promise
  ));
  const oldLookup = sync.refresh(session('first'));
  const newLookup = sync.refresh(session('second'));
  assert.equal(states.at(-1).session.user.id, 'second');
  assert.equal(states.at(-1).subscription.plan, 'free');
  second.resolve({ plan: 'basic', status: 'active' });
  await newLookup;
  first.resolve({ plan: 'premium', status: 'active' });
  await oldLookup;
  assert.equal(states.at(-1).session.user.id, 'second');
  assert.equal(states.at(-1).subscription.plan, 'basic');
});

test('temporary lookup failures preserve the same account plan and allow retry', async () => {
  let calls = 0;
  let state;
  const sync = createSubscriptionSync((next) => { state = next; }, async () => {
    calls += 1;
    if (calls === 2) throw new Error('temporary outage');
    return { plan: 'pro', status: 'active' };
  });
  await sync.refresh(session('same'));
  await sync.refresh(session('same'));
  assert.equal(state.subscription.plan, 'pro');
  assert.equal(state.error.message, 'temporary outage');
  assert.equal(state.loading, false);
  await sync.refresh(session('same'));
  assert.equal(state.error, null);
});

test('stopping subscription synchronization ignores pending responses', async () => {
  const pending = deferred();
  const states = [];
  const sync = createSubscriptionSync((state) => states.push(state), () => pending.promise);
  const request = sync.refresh(session('first'));
  sync.stop();
  pending.resolve({ plan: 'premium', status: 'active' });
  await request;
  assert.equal(states.length, 1);
});

function session(id) {
  return { user: { id }, access_token: `${id}-token` };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
