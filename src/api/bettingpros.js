import { cachedFetch } from './cache.js';
import { fetchJson } from './http.js';

const BP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STATS = ['pts', 'reb', 'ast', 'fg3m'];

export function getBettingPros(date, stats = DEFAULT_STATS) {
  const qs = new URLSearchParams({
    date,
    stats: stats.join(','),
  });
  return cachedFetch(`statcast:v1:bettingpros:${date}:${stats.join('-')}`, BP_TTL_MS, () => (
    fetchJson(`/api/bettingpros?${qs}`, {}, 15000)
  ));
}

export async function getBettingProsForDates(dates, stats = DEFAULT_STATS) {
  return resolveBettingProsForDates(dates, (date) => getBettingPros(date, stats));
}

export async function resolveBettingProsForDates(dates, loader) {
  const cleanDates = sanitizeBettingProsDates(dates);
  for (const date of cleanDates) {
    const data = await loader(date).catch(() => null);
    if (data?.players?.length) return data;
  }
  return emptyBettingProsResult(cleanDates[0] || null);
}

export function sanitizeBettingProsDates(dates) {
  return [...new Set((dates || []).filter(Boolean))];
}

export function emptyBettingProsResult(date = null) {
  return { players: [], count: 0, date };
}
