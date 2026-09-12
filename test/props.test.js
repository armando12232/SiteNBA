import test from 'node:test';
import assert from 'node:assert/strict';

import { averageRecent, confidenceFromEdge, ensureHalfLine, getBestProp, hitPercent, numberOrNull, propForStat, streakOver } from '../src/utils/props.js';

test('market lines retain their exact value, including integer and quarter lines', () => {
  assert.equal(ensureHalfLine(21.5), 21.5);
  assert.equal(ensureHalfLine(21), 21);
  assert.equal(ensureHalfLine('18'), 18);
  assert.equal(ensureHalfLine('18.25'), 18.25);
  assert.equal(ensureHalfLine(0), 0);
});

test('missing or malformed market data never becomes a zero line', () => {
  for (const value of [null, undefined, '', ' ', '12 points', Infinity, NaN, false, [], {}]) {
    assert.equal(ensureHalfLine(value), null);
    assert.equal(numberOrNull(value), null);
  }
  assert.equal(ensureHalfLine(-1), null);
});

test('selected stat never falls back to a different market', () => {
  const player = { props: { pts: { line: 20.5, edge: 8 } }, synthetic_lines: { ast: 4.5 } };
  assert.equal(propForStat(player, 'reb'), null);
  assert.deepEqual(propForStat(player, 'ast'), { stat: 'ast', line: 4.5 });
  assert.equal(propForStat(player, 'pts').line, 20.5);
});

test('OVER requires exceeding the line; pushes are not wins or streak hits', () => {
  const games = [{ pts: 12 }, { pts: 10 }, { pts: 9 }];
  assert.equal(hitPercent(games, 'pts', 10, 3), 33);
  assert.equal(streakOver(games, 'pts', 10), 1);
  assert.equal(hitPercent(games, 'pts', null, 3), null);
});

test('incomplete samples and missing stats stay unknown without substituting points', () => {
  const games = [{ pts: 25, reb: 5 }, { pts: 30, reb: null }, { pts: 20 }];
  assert.equal(hitPercent(games, 'pts', 20.5, 5), null);
  assert.equal(hitPercent(games, 'reb', 4.5, 3), null);
  assert.equal(averageRecent(games, 'reb', 3), null);
  assert.equal(hitPercent([], 'pts', 20.5, 0), null);
  assert.equal(streakOver(games, 'reb', 4.5), 1);
});

test('zero results are valid observations in averages and percentages', () => {
  const games = [{ fg3m: 0 }, { fg3m: 2 }];
  assert.equal(averageRecent(games, 'fg3m', 2), 1);
  assert.equal(hitPercent(games, 'fg3m', 0.5, 2), 50);
});

test('confidenceFromEdge maps thresholds correctly', () => {
  assert.deepEqual(confidenceFromEdge(5), { text: 'Alta', className: 'high' });
  assert.deepEqual(confidenceFromEdge(3), { text: 'Média', className: 'medium' });
  assert.deepEqual(confidenceFromEdge(1), { text: 'Baixa', className: 'low' });
});

test('getBestProp selects the prop with the highest edge among valid lines', () => {
  const result = getBestProp({
    props: {
      pts: { line: 26.5, edge: 1.5 },
      reb: { line: 8.5, edge: 3.5 },
      ast: { line: null, edge: 9.9 },
    },
  });

  assert.equal(result.stat, 'reb');
  assert.equal(result.line, 8.5);
  assert.equal(result.edge, 3.5);
});
