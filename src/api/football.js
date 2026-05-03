import { cachedFetch } from './cache.js';
import { fetchJson } from './http.js';

const FOOTBALL_TTL_MS = 2 * 60 * 1000;
const FOOTBALL_LIVE_TTL_MS = 20 * 1000;
const FOOTBALL_STATS_TTL_MS = 90 * 1000;

export const FOOTBALL_LEAGUES = [
  { key: 'all', label: 'Todas', icon: '🌐' },
  { key: 'brasileirao', label: 'Brasileirao', icon: '🇧🇷' },
  { key: 'champions', label: 'Champions', icon: '🏆' },
  { key: 'premier', label: 'Premier', icon: '🏴' },
  { key: 'laliga', label: 'La Liga', icon: '🇪🇸' },
  { key: 'bundesliga', label: 'Bundesliga', icon: '🇩🇪' },
  { key: 'seriea', label: 'Serie A', icon: '🇮🇹' },
  { key: 'ligue1', label: 'Ligue 1', icon: '🇫🇷' },
  { key: 'libertadores', label: 'Libertadores', icon: '🌎' },
];

export function getFootballFixtures() {
  return cachedFetch('statcast:v1:football:fixtures', FOOTBALL_TTL_MS, () => (
    fetchJson('/api/football?type=fixtures', {}, 15000)
  ));
}

export function getFootballLive() {
  return cachedFetch('statcast:v1:football:live', FOOTBALL_LIVE_TTL_MS, () => (
    fetchJson('/api/football?type=live', {}, 12000)
  ));
}

export function getFootballStats(gameId, leagueKey) {
  const qs = new URLSearchParams({ type: 'stats', gameId, leagueKey });
  return cachedFetch(`statcast:v1:football:stats:${leagueKey}:${gameId}`, FOOTBALL_STATS_TTL_MS, () => (
    fetchJson(`/api/football?${qs}`, {}, 12000)
  ));
}

export function getFootballPregame(gameId, leagueKey) {
  const qs = new URLSearchParams({ type: 'pregame', gameId, leagueKey });
  return cachedFetch(`statcast:v1:football:pregame:${leagueKey}:${gameId}`, 5 * 60 * 1000, () => (
    fetchJson(`/api/football?${qs}`, {}, 12000)
  ));
}

export function getFootballBet365Odds(fixture) {
  const qs = new URLSearchParams({
    type: 'bet365odds',
    home: fixture.home || '',
    away: fixture.away || '',
    leagueKey: fixture.league_key || '',
  });
  return cachedFetch(`statcast:v1:football:bet365:${fixture.id}`, 5 * 60 * 1000, () => (
    fetchJson(`/api/football?${qs}`, {}, 12000)
  ));
}

export function getFootballReferee(fixture) {
  const qs = new URLSearchParams({
    type: 'referee',
    home: fixture.home || '',
    away: fixture.away || '',
    date: fixture.date || '',
    leagueKey: fixture.league_key || '',
  });
  return cachedFetch(`statcast:v1:football:referee:${fixture.id}`, 10 * 60 * 1000, () => (
    fetchJson(`/api/football?${qs}`, {}, 15000)
  ));
}
