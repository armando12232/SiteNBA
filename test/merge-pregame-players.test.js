import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePregamePlayers } from '../src/utils/mergePregamePlayers.js';

test('market data is merged without removing current-season players that lack a market line', () => {
  const nbaPlayers = [
    { player_id: 203110, player_name: 'Draymond Green', team_abbr: 'GSW', props: { ast: { line: 8.5 } } },
    { player_id: 2544, player_name: 'LeBron James', team_abbr: 'LAL', props: { pts: { line: 24.5 } } },
  ];
  const bpPlayers = [{ player_name: 'LeBron James', team: 'LAL', props: { pts: { line: 25.5, l5: 80, season: 60 } } }];

  const merged = mergePregamePlayers(nbaPlayers, bpPlayers, []);

  assert.deepEqual(merged.map((player) => player.player_name), ['Draymond Green', 'LeBron James']);
  assert.equal(merged[0].props.ast.line, 8.5);
  assert.equal(merged[1].props.pts.line, 25.5);
  assert.equal(merged[1].props.pts.l5, 80);
});

test('players available only in market data remain visible', () => {
  const merged = mergePregamePlayers([], [{ player_name: 'New Player', team: 'GSW', props: { ast: { line: 4.5 } } }], []);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].player_name, 'New Player');
  assert.equal(merged[0].props.ast.line, 4.5);
});
