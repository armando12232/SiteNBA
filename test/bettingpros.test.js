import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyBettingProsResult,
  resolveBettingProsForDates,
  sanitizeBettingProsDates,
} from '../src/api/bettingpros.js';

test('sanitizeBettingProsDates removes falsy values and duplicate dates', () => {
  const dates = sanitizeBettingProsDates([
    '2026-05-06',
    '',
    null,
    '2026-05-06',
    '2026-05-07',
    undefined,
  ]);

  assert.deepEqual(dates, ['2026-05-06', '2026-05-07']);
});

test('emptyBettingProsResult returns the stable empty payload shape', () => {
  assert.deepEqual(emptyBettingProsResult('2026-05-06'), {
    players: [],
    count: 0,
    date: '2026-05-06',
  });
});

test('resolveBettingProsForDates falls back until it finds players', async () => {
  const calls = [];
  const result = await resolveBettingProsForDates(
    ['2026-05-06', '2026-05-07', '2026-05-08'],
    async (date) => {
      calls.push(date);
      if (date === '2026-05-07') return { players: [{ name: 'Jalen Brunson' }], count: 1, date };
      return { players: [], count: 0, date };
    },
  );

  assert.deepEqual(calls, ['2026-05-06', '2026-05-07']);
  assert.equal(result.count, 1);
  assert.equal(result.players[0].name, 'Jalen Brunson');
  assert.equal(result.date, '2026-05-07');
});

test('resolveBettingProsForDates ignores loader errors and returns an empty result when all dates fail', async () => {
  const result = await resolveBettingProsForDates(
    ['2026-05-06', '2026-05-07'],
    async (date) => {
      if (date === '2026-05-06') throw new Error('timeout');
      return { players: [], count: 0, date };
    },
  );

  assert.deepEqual(result, emptyBettingProsResult('2026-05-06'));
});
