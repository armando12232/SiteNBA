import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_ACCESS,
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
