import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLiveScore, buildPregameScore, scoreTier } from '../src/utils/statcastScore.js';

test('buildPregameScore returns elite OVER when edge, hit rates and projection are positive', () => {
  const result = buildPregameScore({
    stat: 'pts',
    line: 24.5,
    prop: {
      edge: 4.5,
      projection: 29.1,
      l5: 80,
      l10: 70,
    },
    player: {
      season_avg: { pts: 25.8 },
    },
    games: [
      { pts: 28 }, { pts: 31 }, { pts: 26 }, { pts: 24 }, { pts: 27 },
      { pts: 30 }, { pts: 25 }, { pts: 29 }, { pts: 22 }, { pts: 33 },
    ],
  });

  assert.equal(result.side, 'OVER');
  assert.equal(result.tier, 'elite');
  assert.ok(result.score >= 78);
  assert.match(result.summary, /Edge \+4\.5/);
});

test('buildPregameScore returns UNDER side when edge is negative', () => {
  const result = buildPregameScore({
    stat: 'pts',
    line: 26.5,
    prop: {
      edge: -3,
      projection: 23.5,
      l5: 30,
      l10: 40,
    },
    player: {
      season_avg: { pts: 24.1 },
    },
    games: [{ pts: 20 }, { pts: 18 }, { pts: 24 }, { pts: 29 }, { pts: 22 }],
  });

  assert.equal(result.side, 'UNDER');
  assert.equal(result.label.startsWith('UNDER'), true);
});

test('buildPregameScore uses table hit windows when real game log is unavailable', () => {
  const result = buildPregameScore({
    stat: 'pts',
    line: 19.5,
    prop: {
      edge: -1.1,
      projection: 17.4,
      l5: 100,
      l10: 80,
    },
    player: {},
    games: [],
  });

  const confidence = result.factors.find((factor) => factor.id === 'sample');
  assert.equal(confidence.value, 50);
  assert.equal(confidence.note, 'L10 da tabela');
});

test('buildLiveScore flags risk when context says blowout risk', () => {
  const result = buildLiveScore({
    player: { pts: 18, reb: 3, ast: 5, mins: 24 },
    projected: { pts: 28, reb: 5, ast: 8 },
    hotStats: ['pts', 'ast'],
    isRisk: true,
    period: 4,
  });

  assert.equal(result.side, 'RISCO');
  assert.equal(result.tier, 'risk');
  assert.match(result.summary, /risco de queda/i);
});

test('scoreTier preserves qualitative thresholds', () => {
  assert.equal(scoreTier(80, 'OVER'), 'elite');
  assert.equal(scoreTier(65, 'OVER'), 'strong');
  assert.equal(scoreTier(50, 'OVER'), 'watch');
  assert.equal(scoreTier(40, 'UNDER'), 'under');
  assert.equal(scoreTier(40, 'OVER'), 'cold');
});
