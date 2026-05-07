import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPregameNameStorageKey,
  getPregameStorageKey,
  normalizePregameName,
} from '../src/api/nba.js';

test('normalizePregameName trims and lowercases player names for cache lookup', () => {
  assert.equal(normalizePregameName('  Ja MORANT  '), 'ja morant');
  assert.equal(normalizePregameName(null), '');
});

test('getPregameNameStorageKey prefixes normalized player names consistently', () => {
  const key = getPregameNameStorageKey(' Jalen Brunson ');
  assert.match(key, /^statcast:v4-last20:nba:pregame-name:/);
  assert.equal(key.endsWith('jalen brunson'), true);
});

test('getPregameStorageKey stringifies ids consistently for player cache entries', () => {
  assert.equal(
    getPregameStorageKey(1628973),
    'statcast:v4-last20:nba:pregame:1628973',
  );
  assert.equal(
    getPregameStorageKey('1628973'),
    'statcast:v4-last20:nba:pregame:1628973',
  );
});
