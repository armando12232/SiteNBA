import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nba.js';
import { clearProviderFetchCache } from '../api/_providerFetch.js';

const PLAYER_ID = '2544';
const NAMES = ['points', 'totalRebounds', 'assists', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'minutes'];

// Fixed, synthetic ESPN-shaped data: no network, credentials, or live NBA data.
function gameLog(points, overrides = {}) {
  const events = {};
  const items = points.map((pts, index) => {
    const eventId = String(index + 1);
    events[eventId] = {
      gameDate: new Date(Date.UTC(2026, 0, 31 - index)).toISOString(),
      team: { abbreviation: 'LAL' }, atVs: 'vs', opponent: { abbreviation: 'BOS' },
    };
    return { eventId, stats: [String(pts), String(overrides.reb?.[index] ?? 4),
      String(overrides.ast?.[index] ?? 3), String(overrides.fg3m?.[index] ?? '2-6'), '30'] };
  });
  return { names: NAMES, events, seasonTypes: [{ displayName: 'Regular Season', categories: [{ events: items }] }] };
}

function stubProvider(t, provider) {
  clearProviderFetchCache();
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(String(url), /^https:\/\/site\.web\.api\.espn\.com\/apis\/common\/v3\/sports\/basketball\/nba\/athletes\/1966\/gamelog\?season=\d{4}$/);
    const { status = 200, body } = provider(String(url));
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  });
  t.after(clearProviderFetchCache);
}

async function request(type = 'pregame', playerId = PLAYER_ID) {
  const res = {
    code: null, payload: null, setHeader() {},
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await handler({ method: 'GET', headers: {}, query: { type, playerId } }, res);
  return res;
}

test('NBA pregame calculates season, L5 and L10 averages and metric-specific lines', async (t) => {
  stubProvider(t, () => ({ body: gameLog([30, 20, 10, 25, 15, 40, 5, 22, 18, 35, 50, 0],
    { reb: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }) }));
  const { code, payload } = await request();
  assert.equal(code, 200);
  assert.deepEqual(payload.season_avg, { pts: 22.5, reb: 6.5, ast: 3, fg3m: 2 });
  assert.deepEqual(payload.last5_avg, { pts: 20, reb: 3, ast: 3, fg3m: 2 });
  assert.deepEqual(payload.last10_avg, { pts: 22, reb: 5.5, ast: 3, fg3m: 2 });
  assert.deepEqual(payload.synthetic_lines, { pts: 22.5, reb: 6.5, ast: 3.5, fg3m: 2.5 });
  assert.deepEqual(payload.props.pts, { l5: 40, l10: 40, line: 22.5, hit_rate: 40, edge: -2.5 });
  assert.deepEqual(payload.props.reb, { l5: 0, l10: 40, line: 6.5, hit_rate: 40, edge: -3.5 });
  assert.equal(payload.hit_rates.pts_last10, 40);
  assert.equal(payload.edge_points, -2.5);
  assert.equal(payload.minsL5, 30);
  assert.deepEqual(payload.last5_games.map((row) => row.hit), [true, false, false, true, false, true, false, false, false, true, true, false]);
});

test('NBA season_avg agrees with pregame averages for the same sample', async (t) => {
  stubProvider(t, () => ({ body: gameLog([10, 11, 11]) }));
  const pregame = await request();
  const season = await request('season_avg');
  assert.equal(season.code, 200);
  assert.deepEqual(season.payload.avg, { pts: 10.7, reb: 4, ast: 3, fg3m: 2 });
  assert.deepEqual(season.payload.avg, pregame.payload.season_avg);
});

test('NBA short samples use actual game counts and round hit rate and edge', async (t) => {
  stubProvider(t, () => ({ body: gameLog([10, 11, 11]) }));
  const { code, payload } = await request();
  assert.equal(code, 200);
  assert.deepEqual(payload.props.pts, { l5: 67, l10: 67, line: 10.5, hit_rate: 67, edge: 0.2 });
  assert.equal(payload.last5_games.length, 3);
});

test('NBA hit rates support 100 percent and positive edge for a recent hot streak', async (t) => {
  stubProvider(t, () => ({ body: gameLog([...Array(10).fill(20), ...Array(10).fill(0)]) }));
  const { payload } = await request();
  assert.deepEqual(payload.props.pts, { l5: 100, l10: 100, line: 10.5, hit_rate: 100, edge: 9.5 });
});

test('NBA single-game samples retain zero hit rates and negative edge', async (t) => {
  stubProvider(t, () => ({ body: gameLog([8]) }));
  const { code, payload } = await request();
  assert.equal(code, 200);
  assert.deepEqual(payload.props.pts, { l5: 0, l10: 0, line: 8.5, hit_rate: 0, edge: -0.5 });
});

test('NBA props include an average of 1.5 and omit categories below that threshold', async (t) => {
  stubProvider(t, () => ({ body: gameLog([1, 1, 2, 2], { reb: [1, 1, 1, 2], ast: [0, 0, 0, 0], fg3m: [0, 0, 0, 0] }) }));
  const { payload } = await request();
  assert.deepEqual(payload.season_avg, { pts: 1.5, reb: 1.3, ast: 0, fg3m: 0 });
  assert.deepEqual(payload.props, { pts: { l5: 50, l10: 50, line: 1.5, hit_rate: 50, edge: 0 } });
  assert.deepEqual(payload.synthetic_lines, { pts: 1.5 });
});

test('NBA zero-point sample leaves point line, hit rate and edge unavailable', async (t) => {
  stubProvider(t, () => ({ body: gameLog([0, 0]) }));
  const { payload } = await request();
  assert.equal(payload.props.pts, undefined);
  assert.equal(payload.synthetic_lines.pts, undefined);
  assert.equal(payload.hit_rates.pts_last10, null);
  assert.equal(payload.edge_points, null);
  assert.ok(payload.last5_games.every((row) => row.hit === null));
});

test('NBA recent metrics sort dates, deduplicate events and exclude playoffs', async (t) => {
  const body = gameLog([30, 20, 10, 25, 15, 40]);
  const items = body.seasonTypes[0].categories[0].events;
  items.reverse();
  body.seasonTypes[0].categories.push({ events: [items[0]] });
  body.events.playoff = { gameDate: '2026-06-01', team: { abbreviation: 'LAL' } };
  body.seasonTypes.push({ displayName: 'Postseason', categories: [{ events: [{ eventId: 'playoff', stats: ['100', '20', '20', '10-10', '48'] }] }] });
  stubProvider(t, () => ({ body }));
  const { payload } = await request();
  assert.equal(payload.last5_games.length, 6);
  assert.deepEqual(payload.last5_games.map((row) => row.pts), [30, 20, 10, 25, 15, 40]);
  assert.equal(payload.last5_avg.pts, 20);
  assert.equal(payload.season_avg.pts, 23.3);
});

test('NBA empty current season falls back to previous season before computing metrics', async (t) => {
  const seasons = [];
  stubProvider(t, (url) => {
    seasons.push(Number(new URL(url).searchParams.get('season')));
    return { body: seasons.length === 1 ? gameLog([]) : gameLog([10, 11, 11]) };
  });
  const { code, payload } = await request();
  assert.equal(code, 200);
  assert.equal(seasons.length, 2);
  assert.equal(seasons[1], seasons[0] - 1);
  assert.equal(payload.sample_season, seasons[1]);
  assert.equal(payload.season_avg.pts, 10.7);
});

test('NBA empty samples return 404 instead of fabricated zero averages', async (t) => {
  stubProvider(t, () => ({ body: gameLog([]) }));
  for (const type of ['pregame', 'season_avg']) {
    const { code, payload } = await request(type);
    assert.equal(code, 404);
    assert.equal(payload.error, 'player statistics unavailable');
    assert.equal(payload.season_avg, undefined);
    assert.equal(payload.avg, undefined);
  }
});

test('NBA provider failure returns 502 instead of successful metrics', async (t) => {
  stubProvider(t, () => ({ status: 503, body: { error: 'unavailable' } }));
  const { code, payload } = await request();
  assert.equal(code, 502);
  assert.equal(payload.error, 'Dados NBA indisponíveis no momento. Tente novamente.');
  assert.equal(payload.props, undefined);
});
