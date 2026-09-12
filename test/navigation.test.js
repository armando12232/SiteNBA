import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredPageFeature } from '../src/utils/navigation.js';
import { getPlanAccess } from '../src/api/subscriptions.js';

test('Home shortcuts and NBA tabs require the same plan feature', () => {
  assert.equal(requiredPageFeature('nba-injuries'), requiredPageFeature('nba', 'injuries'));
  for (const target of ['nba-injuries', 'football', 'cs2', 'wnba', 'nfl', 'nhl', 'mlb']) {
    const feature = requiredPageFeature(target);
    assert.equal(getPlanAccess('free')[feature], false, target);
    assert.equal(getPlanAccess('pro')[feature], true, target);
  }
  assert.equal(requiredPageFeature('home'), null);
  assert.equal(requiredPageFeature('radar'), null);
  assert.equal(requiredPageFeature('nba'), null);
  assert.equal(requiredPageFeature('nba', 'live'), 'live');
});

