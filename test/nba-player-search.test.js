import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nba.js';

function response() {
  return {
    code: null,
    payload: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('NBA player search finds Draymond by partial name without querying a stats provider', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { type: 'player_search', query: 'draymond' } }, res);

  assert.equal(res.code, 200);
  assert.ok(res.payload.players.some((player) => player.id === 203110 && player.name === 'Draymond Green'));
});

test('NBA player search validates short queries', async () => {
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { type: 'player_search', query: 'a' } }, res);

  assert.equal(res.code, 400);
  assert.deepEqual(res.payload, { error: 'invalid query' });
});
