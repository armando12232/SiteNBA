import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nba.js';
import { clearProviderFetchCache } from '../api/_providerFetch.js';

test('NBA player stats never fall back to a previous season', async (t) => {
  clearProviderFetchCache();
  const requestedSeasons = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input));
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
  await handler({ method: 'GET', headers: {}, query: { type: 'pregame', playerId: '2544' } }, res);

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
