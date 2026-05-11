import { cachedFetch } from './cache.js';
import { fetchJson } from './http.js';

const TELEGRAM_INTEL_TTL_MS = 5 * 60 * 1000;

export function getTelegramFootballIntel(fixture) {
  const home = fixture?.home || '';
  const away = fixture?.away || '';
  const qs = new URLSearchParams({ home, away });
  const cacheKey = `statcast:v1:telegram:intel:${home}:${away}`.toLowerCase();

  return cachedFetch(cacheKey, TELEGRAM_INTEL_TTL_MS, () => (
    fetchJson(`/api/telegram?${qs}`, { auth: true }, 12000)
  ));
}
