import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStats, parsePregame } from '../api/football.js';
import { clearPlanAccessCache } from '../api/_planGuard.js';
import { clearProviderFetchCache } from '../api/_providerFetch.js';

function response() {
  return { code: 200, payload: null, setHeader() { return this; }, status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; }, end() { return this; } };
}

function stubFetch(t, provider) {
  const original = global.fetch;
  const originalKey = process.env.SUPABASE_SERVICE_KEY;
  const originalUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_KEY = 'service-key';
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  clearPlanAccessCache();
  clearProviderFetchCache();
  t.after(() => {
    global.fetch = original;
    restoreEnv('SUPABASE_SERVICE_KEY', originalKey);
    restoreEnv('SUPABASE_URL', originalUrl);
    clearPlanAccessCache();
    clearProviderFetchCache();
  });
  global.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return jsonResponse(200, { id: 'test-user' });
    if (String(url).includes('/rest/v1/subscriptions')) return jsonResponse(200, [{ plan: 'premium', status: 'active', role: 'user' }]);
    const result = await provider(url);
    if (result?.text) return result;
    const body = result?.json ? await result.json() : {};
    return jsonResponse(result?.ok === false ? 502 : 200, body);
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('football detail input errors return 400 instead of unhandled exceptions', async (t) => {
  const { default: handler } = await import('../api/football.js?validation-test');
  stubFetch(t, () => { throw new Error('provider must not receive invalid query'); });
  for (const query of [{ type: 'stats' }, { type: 'pregame', gameId: '../x' }, { type: 'stats', gameId: '123', leagueKey: 'bad' }]) {
    const res = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, query }, res);
    assert.equal(res.code, 400);
  }
});

test('football provider outage is not reported as an empty successful schedule', async (t) => {
  const { default: handler } = await import('../api/football.js?outage-test');
  stubFetch(t, () => { throw new Error('offline'); });
  const res = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, query: { type: 'fixtures' } }, res);
  assert.equal(res.code, 503);
});

test('partial football schedules retain available games and identify missing leagues', async (t) => {
  const { default: handler } = await import('../api/football.js?partial-test');
  stubFetch(t, (url) => {
    if (!String(url).includes('/eng.1/')) throw new Error('offline');
    return { ok: true, json: async () => ({ events: [{ id: '1', competitions: [{ competitors: [], status: { type: { state: 'in' } } }] }] }) };
  });
  const res = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, query: { type: 'fixtures' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.count, 1);
  assert.equal(res.payload.unavailable_leagues.length, 7);
});

test('ESPN pregame parsing retains actual team names and explicit odds format', () => {
  const parsed = parsePregame({ standings: { groups: [{ standings: { entries: [
    { team: { displayName: 'Arsenal' }, stats: [{ name: 'points', displayValue: '10' }] },
  ] } }] }, odds: [{ overUnder: 2.5, drawOdds: 250, homeTeamOdds: { moneyLine: -200 } }] });
  assert.equal(parsed.standings[0].team, 'Arsenal');
  assert.equal(parsed.odds.format, 'american');
  assert.equal(parsed.odds.overUnder, 2.5);
  assert.equal(parsed.odds.drawOdds, 250);
});

test('ESPN player parsing retains goalkeeper saves and string formations', () => {
  const parsed = parseStats({ rosters: [{ formation: '4-3-3', roster: [
    { athlete: { displayName: 'Keeper' }, stats: [{ name: 'saves', displayValue: '5' }] },
  ] }] });
  assert.equal(parsed.rosters[0].formation, '4-3-3');
  assert.equal(parsed.rosters[0].players[0].stats.saves, '5');
});
