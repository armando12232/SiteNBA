import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteKey, favoritesFromSession, normalizeFavorite, toggleFavoriteList } from '../src/api/favorites.js';

test('normalizeFavorite stores only the fields needed by Meu Radar', () => {
  assert.deepEqual(normalizeFavorite({
    player_id: 23,
    player_name: ' LeBron James ',
    team_abbr: ' LAL ',
    league: 'nba',
    private_stat: 'ignored',
  }), {
    player_id: '23',
    player_name: 'LeBron James',
    team_abbr: 'LAL',
    league: 'nba',
  });
});

test('favoritesFromSession sanitizes and deduplicates account metadata', () => {
  const session = { user: { user_metadata: { statcast_favorites: [
    { player_id: 23, player_name: 'LeBron James', team_abbr: 'LAL' },
    { player_id: '23', player_name: 'Duplicate', team_abbr: 'LAL' },
    { player_name: 'A' },
    null,
  ] } } };
  assert.deepEqual(favoritesFromSession(session), [
    { player_id: '23', player_name: 'LeBron James', team_abbr: 'LAL', league: 'nba' },
    { player_id: null, player_name: 'A', team_abbr: null, league: 'nba' },
  ]);
});

test('toggleFavoriteList adds and removes the same league player', () => {
  const player = { player_id: '42', player_name: 'Alyssa Thomas', team_abbr: 'PHX', league: 'wnba' };
  const added = toggleFavoriteList([], player);
  assert.equal(added.active, true);
  assert.equal(added.key, 'wnba:42');
  assert.equal(added.favorites.length, 1);
  const removed = toggleFavoriteList(added.favorites, player);
  assert.equal(removed.active, false);
  assert.deepEqual(removed.favorites, []);
});

test('favoriteKey normalizes accented name fallback and keeps leagues separate', () => {
  assert.equal(favoriteKey({ player_name: 'Ángel Reis', league: 'wnba' }), 'wnba:angel-reis');
  assert.equal(favoriteKey({ player_name: 'Ángel Reis', league: 'nba' }), 'nba:angel-reis');
});

test('favorites are capped to sixty entries', () => {
  let favorites = [];
  for (let index = 0; index < 65; index += 1) {
    favorites = toggleFavoriteList(favorites, { player_id: index, player_name: `Player ${index}` }).favorites;
  }
  assert.equal(favorites.length, 60);
  assert.equal(favorites[0].player_name, 'Player 64');
});

