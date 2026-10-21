import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nba.js';
import { clearPlanAccessCache } from '../api/_planGuard.js';
import { clearProviderFetchCache } from '../api/_providerFetch.js';

function response() {
  return { code: null, payload: null, setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function provider(t, getData) {
  clearPlanAccessCache();
  clearProviderFetchCache();
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  t.after(() => {
    for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_KEY', saved.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    clearPlanAccessCache(); clearProviderFetchCache();
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    const text = String(url);
    const data = text.endsWith('/auth/v1/user') ? { id: 'test-user' }
      : text.includes('/rest/v1/subscriptions') ? [{ plan: 'pro', status: 'active' }] : getData(text);
    return { ok: true, status: 200, text: async () => JSON.stringify(data) };
  });
}

test('NBA scoreboard retains the source team names and logos for ESPN team IDs', async (t) => {
  provider(t, () => ({ events: [{ id: '123', competitions: [{ status: { type: { state: 'in' } }, competitors: [
    { homeAway: 'away', score: '23', team: { id: '15', abbreviation: 'MIL', displayName: 'Milwaukee Bucks', logo: 'https://a.espncdn.com/mil.png' } },
    { homeAway: 'home', score: '25', team: { id: '27', abbreviation: 'WSH', displayName: 'Washington Wizards', logos: [{ href: 'https://a.espncdn.com/wsh.png' }] } },
  ] }] }] }));
  const res = response();
  await handler({ method: 'GET', query: { type: 'scoreboard' }, headers: {} }, res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.games[0].awayTeam.teamId, '15');
  assert.equal(res.payload.games[0].awayTeam.logoUrl, 'https://a.espncdn.com/mil.png');
  assert.equal(res.payload.games[0].homeTeam.logoUrl, 'https://a.espncdn.com/wsh.png');
  assert.equal(res.payload.games[0].homeTeam.abbr, 'WAS');
});

test('NBA boxscore keeps provider portraits, team IDs and unmapped player identities', async (t) => {
  provider(t, () => ({ boxscore: { players: [{ team: { id: '27', abbreviation: 'WSH' }, statistics: [{ labels: ['MIN', 'PTS', 'REB', 'AST'], athletes: [
    { athlete: { id: '99999991', displayName: 'Fixture Player', headshot: { href: 'https://a.espncdn.com/fixture.png' } }, stats: ['8', '10', '6', '1'] },
    { athlete: { id: '99999992', displayName: 'Second Fixture' }, stats: ['3', '0', '0', '0'] },
  ] }] }] } }));
  const res = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer test' }, query: { type: 'boxscore', gameId: '123' } }, res);
  assert.equal(res.code, 200);
  const [first, second] = res.payload.players;
  assert.equal(first.photoUrl, 'https://a.espncdn.com/fixture.png');
  assert.equal(first.teamId, '27');
  assert.equal(first.teamAbbr, 'WAS');
  assert.equal(first.playerId, null);
  assert.equal(first.plusMinus, null);
  assert.notEqual(first.espn_id, second.espn_id);
  assert.equal(second.pts, 0);
});
