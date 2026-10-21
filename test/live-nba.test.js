import test from 'node:test';
import assert from 'node:assert/strict';
import { displayStat, livePlayerKey, playerPhotoUrl, playersForTeam, teamAbbr, teamLogoUrl } from '../src/utils/liveNba.js';

test('live NBA team logos use provider assets, never ESPN IDs on the NBA CDN', () => {
  assert.equal(teamLogoUrl({ teamId: '15', abbr: 'MIL', logoUrl: 'https://a.espncdn.com/mil.png' }), 'https://a.espncdn.com/mil.png');
  assert.equal(teamLogoUrl({ teamId: '15', abbr: 'MIL' }), 'https://a.espncdn.com/i/teamlogos/nba/500/mil.png');
  assert.equal(teamLogoUrl({ teamId: '15' }), '');
  assert.equal(teamLogoUrl(null), '');
});

test('live NBA logo fallbacks normalize ESPN abbreviations', () => {
  for (const [abbr, filename] of [['NYK', 'ny'], ['GSW', 'gs'], ['SAS', 'sa'], ['NOP', 'no'], ['UTA', 'utah'], ['WAS', 'wsh']]) {
    assert.equal(teamLogoUrl({ abbr }), `https://a.espncdn.com/i/teamlogos/nba/500/${filename}.png`);
  }
  assert.equal(teamAbbr({ abbreviation: 'WSH' }), 'WAS');
});

test('live NBA portraits prefer source identity and retain an initials fallback', () => {
  assert.equal(playerPhotoUrl({ playerId: 1, espn_id: '2', photoUrl: 'https://a.espncdn.com/current.png' }), 'https://a.espncdn.com/current.png');
  assert.equal(playerPhotoUrl({ playerId: 1, espn_id: '2' }), 'https://a.espncdn.com/i/headshots/nba/players/full/2.png');
  assert.equal(playerPhotoUrl({ playerId: null }), '');
});

test('boxscore teams match provider IDs before abbreviations, with an alias fallback', () => {
  const rightId = { teamId: '27', teamAbbr: 'WSH' };
  const wrongId = { teamId: '15', teamAbbr: 'WAS' };
  const noId = { teamAbbr: 'WSH' };
  assert.deepEqual(playersForTeam([rightId, wrongId, noId, {}], { teamId: 27, abbr: 'WAS' }), [rightId, noId]);
  assert.deepEqual(playersForTeam([{}], {}), []);
});

test('players without an NBA mapping still have distinct keys and missing stats stay unknown', () => {
  assert.notEqual(livePlayerKey({ playerId: null, espn_id: '101' }), livePlayerKey({ playerId: null, espn_id: '102' }));
  assert.equal(displayStat(0), '0');
  assert.equal(displayStat(null), '—');
  assert.equal(displayStat(undefined), '—');
});
