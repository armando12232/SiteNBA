import { cachedFetch } from './cache.js';
import { fetchJson } from './http.js';

export function getNbaInjuries() {
  return cachedFetch('statcast:v2:nba:injuries', 5 * 60 * 1000, () => (
    fetchJson('/api/injuries', {}, 18000)
  ));
}
