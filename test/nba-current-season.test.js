import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nba.js';
import { clearProviderFetchCache } from '../api/_providerFetch.js';
import { clearPlanAccessCache } from '../api/_planGuard.js';

function configureBasicSession(t) {
  clearPlanAccessCache();
  const oldSupabaseUrl = process.env.SUPABASE_URL;
  const oldServiceKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  t.after(() => {
    clearPlanAccessCache();
    if (oldSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldSupabaseUrl;
    if (oldServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = oldServiceKey;
  });
  return 'Bearer basic-season-test-token';
}

test('NBA player stat endpoints require an active plan before fetching provider data', async (t) => {
  clearProviderFetchCache();
  clearPlanAccessCache();
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCalls += 1;
    throw new Error('provider must not be called');
  });
  t.after(() => {
    clearProviderFetchCache();
    clearPlanAccessCache();
  });

  for (const type of ['pregame', 'season_avg']) {
    const res = {
      code: null,
      payload: null,
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ method: 'GET', headers: {}, query: { type, playerId: '2544' } }, res);
    assert.equal(res.code, 401);
    assert.equal(res.payload.error, 'missing bearer token');
  }
  assert.equal(fetchCalls, 0);
});

test('NBA player stats never fall back to a previous season', async (t) => {
  clearProviderFetchCache();
  const authorization = configureBasicSession(t);
  const requestedSeasons = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const requestUrl = String(input);
    if (requestUrl.endsWith('/auth/v1/user')) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'test-user' }) };
    if (requestUrl.includes('/rest/v1/subscriptions?')) return { ok: true, status: 200, text: async () => JSON.stringify([{ plan: 'basic', status: 'active', role: 'user' }]) };
    const url = new URL(requestUrl);
    requestedSeasons.push(Number(url.searchParams.get('season')));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        names: ['points', 'totalRebounds', 'assists', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'minutes'],
        events: {},
        seasonTypes: [{ displayName: 'Regular Season', categories: [{ events: [] }] }],
      }),
    };
  });
  t.after(clearProviderFetchCache);

  const res = {
    code: null,
    payload: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await handler({ method: 'GET', headers: { authorization }, query: { type: 'pregame', playerId: '2544' } }, res);

  const currentSeason = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 9 ? 1 : 0);
  assert.equal(res.code, 200);
  assert.deepEqual(requestedSeasons, [currentSeason]);
  assert.equal(res.payload.sample_season, currentSeason);
  assert.equal(res.payload.sample_size, 0);
  assert.equal(res.payload.using_previous_season, false);
  assert.deepEqual(res.payload.season_avg, { pts: null, reb: null, ast: null, fg3m: null });
  assert.deepEqual(res.payload.props, {});
  assert.equal(res.payload.summary, 'Sem jogos na temporada atual');
});


test('NBA stats can explicitly load only the previous season', async (t) => {
  clearProviderFetchCache();
  const authorization = configureBasicSession(t);
  const requestedSeasons = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const requestUrl = String(input);
    if (requestUrl.endsWith('/auth/v1/user')) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'test-user' }) };
    if (requestUrl.includes('/rest/v1/subscriptions?')) return { ok: true, status: 200, text: async () => JSON.stringify([{ plan: 'basic', status: 'active', role: 'user' }]) };
    const url = new URL(requestUrl);
    requestedSeasons.push(Number(url.searchParams.get('season')));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        names: ['points', 'totalRebounds', 'assists', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'minutes'],
        events: {},
        seasonTypes: [{ displayName: 'Regular Season', categories: [{ events: [] }] }],
      }),
    };
  });
  t.after(clearProviderFetchCache);

  const res = {
    code: null,
    payload: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await handler({ method: 'GET', headers: { authorization }, query: { type: 'pregame', playerId: '2544', season: 'previous' } }, res);

  const currentSeason = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 9 ? 1 : 0);
  assert.equal(res.code, 200);
  assert.deepEqual(requestedSeasons, [currentSeason - 1]);
  assert.equal(res.payload.current_season, currentSeason);
  assert.equal(res.payload.sample_season, currentSeason - 1);
  assert.equal(res.payload.using_previous_season, true);
  assert.equal(res.payload.summary, 'Sem jogos na temporada anterior');
});


test('NBA player name lookup honors the selected previous season', async (t) => {
  clearProviderFetchCache();
  clearPlanAccessCache();
  const oldSupabaseUrl = process.env.SUPABASE_URL;
  const oldServiceKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  const requestedSeasons = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'test-user' }) };
    if (url.includes('/rest/v1/subscriptions?')) return { ok: true, status: 200, text: async () => JSON.stringify([{ plan: 'basic', status: 'active', role: 'user' }]) };
    const providerUrl = new URL(url);
    requestedSeasons.push(Number(providerUrl.searchParams.get('season')));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        names: ['points', 'totalRebounds', 'assists', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'minutes'],
        events: {},
        seasonTypes: [{ displayName: 'Regular Season', categories: [{ events: [] }] }],
      }),
    };
  });
  t.after(() => {
    clearProviderFetchCache();
    clearPlanAccessCache();
    if (oldSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldSupabaseUrl;
    if (oldServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = oldServiceKey;
  });

  const res = {
    code: null,
    payload: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await handler({ method: 'GET', headers: { authorization: 'Bearer previous-season-test-token' }, query: { type: 'pregame_by_name', name: 'Stephen Curry', season: 'previous' } }, res);

  const currentSeason = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 9 ? 1 : 0);
  assert.equal(res.code, 200);
  assert.deepEqual(requestedSeasons, [currentSeason - 1]);
  assert.equal(res.payload.player_id, 201939);
  assert.equal(res.payload.sample_season, currentSeason - 1);
  assert.equal(res.payload.using_previous_season, true);
});
