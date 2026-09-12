import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonValue, comparisonWinner } from '../src/utils/playerComparison.js';

test('comparisonValue prefers L5 and falls back to season average', () => {
  assert.equal(comparisonValue({ last5_avg: { pts: 24.6 }, season_avg: { pts: 20 } }, 'pts'), 24.6);
  assert.equal(comparisonValue({ last5_avg: {}, season_avg: { pts: 20 } }, 'pts'), 20);
  assert.equal(comparisonValue({}, 'pts'), null);
});

test('comparisonWinner identifies the higher available value', () => {
  const left = { last5_avg: { ast: 8 } };
  const right = { last5_avg: { ast: 6 } };
  assert.equal(comparisonWinner(left, right, 'ast'), 'left');
  assert.equal(comparisonWinner(right, left, 'ast'), 'right');
  assert.equal(comparisonWinner(left, left, 'ast'), null);
  assert.equal(comparisonWinner(left, {}, 'ast'), null);
});

