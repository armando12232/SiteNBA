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

test('missing values never become zero or a directional recommendation', () => {
  const result = buildPregameScore({ stat: 'reb', line: null, prop: { edge: null, l5: '', l10: null }, player: { edge_points: 8, season_avg: { reb: null } } });
  assert.equal(result.side, 'NEUTRO');
  assert.equal(result.seasonAvg, null);
  assert.equal(result.label, 'Sem dados suficientes');
  assert.equal(result.factors.find((factor) => factor.id === 'edge').note, 'sem edge');
});

test('rebound consistency never substitutes points for missing rebounds', () => {
  const result = buildPregameScore({ stat: 'reb', line: 5, prop: {}, player: {}, games: [{ pts: 30 }, { pts: 20 }] });
  assert.equal(result.factors.find((factor) => factor.id === 'hit').note, 'neutro');
  assert.equal(result.factors.find((factor) => factor.id === 'sample').note, 'sem amostra');
});

test('integer line equality is a push, not an OVER hit', () => {
  const result = buildPregameScore({ stat: 'reb', line: 5, prop: {}, player: {}, games: Array.from({ length: 20 }, (_, i) => ({ reb: i % 2 ? 5 : 6 })) });
  assert.equal(result.factors.find((factor) => factor.id === 'hit').note, 'L20 50%');
});

test('historical reference never presents a betting recommendation', () => {
  const result = buildPregameScore({
    stat: 'pts',
    line: 20.5,
    marketLine: false,
    prop: { edge: 2.5, projection: 23, l5: 80, l10: 70 },
    player: {},
    games: [],
  });

  assert.equal(result.marketLine, false);
  assert.match(result.label, /Tendência|Referência/);
  assert.match(result.summary, /referência/i);
  assert.doesNotMatch(`${result.label} ${result.summary}`, /recomendado|linha/i);
});

