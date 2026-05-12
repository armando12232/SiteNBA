import { cachedFetch } from './cache.js';
import { fetchJson } from './http.js';

const CS2_TTL_MS = 3 * 60 * 1000;

export function getCs2Scoreboard() {
  return cachedFetch('statcast:v1:cs2:scoreboard', CS2_TTL_MS, () => {
    const qs = new URLSearchParams({ league: 'cs2', type: 'scoreboard' });
    return fetchJson(`/api/sports?${qs}`, { auth: true }, 12000);
  });
}
