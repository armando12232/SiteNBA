import { cachedFetch } from './cache.js';
import { fetchJson } from './http.js';

const SPORTS_TTL_MS = 2 * 60 * 1000;

export function getSportsScoreboard(league) {
  return cachedFetch(`statcast:v1:sports:${league}:scoreboard`, SPORTS_TTL_MS, () => {
    const qs = new URLSearchParams({ type: 'scoreboard', league });
    return fetchJson(`/api/sports?${qs}`, {}, 12000);
  });
}

export function getSportsStandings(league) {
  return cachedFetch(`statcast:v1:sports:${league}:standings`, 10 * 60 * 1000, () => {
    const qs = new URLSearchParams({ type: 'standings', league });
    return fetchJson(`/api/sports?${qs}`, {}, 12000);
  });
}
