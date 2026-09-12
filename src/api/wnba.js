import { fetchJson } from './http.js';
import { cachedFetch, clearCachedPrefix, writeStored } from './cache.js';

const WNBA_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = 'v2';
const WNBA_PLAYERS_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:players:`;
const WNBA_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:pregame:`;
const WNBA_NAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:pregame-name:`;

export function getWnbaPlayers(limit = 48) {
  const cacheKey = String(limit);
  const storageKey = `${WNBA_PLAYERS_STORAGE_PREFIX}${cacheKey}`;
  return cachedFetch(storageKey, WNBA_TTL_MS, () => (
    fetchJson(`/api/sports?league=wnba&type=players&limit=${encodeURIComponent(limit)}`, { auth: true }, 12000)
  ));
}

export function getWnbaPregame(playerId) {
  const cacheKey = String(playerId);
  const storageKey = `${WNBA_STORAGE_PREFIX}${cacheKey}`;
  return cachedFetch(storageKey, WNBA_TTL_MS, () => (
    fetchJson(`/api/sports?league=wnba&type=pregame&playerId=${encodeURIComponent(playerId)}`, { auth: true }, 15000)
  ));
}

export function getWnbaPregameByName(name) {
  const cacheKey = normalizeName(name);
  const storageKey = `${WNBA_NAME_STORAGE_PREFIX}${cacheKey}`;
  return cachedFetch(storageKey, WNBA_TTL_MS, () => fetchJson(`/api/sports?league=wnba&type=pregame_by_name&name=${encodeURIComponent(name)}`, { auth: true }, 15000)
    .then((data) => {
      if (data?.player_id) {
        const playerKey = String(data.player_id);
        writeStored(`${WNBA_STORAGE_PREFIX}${playerKey}`, data);
      }
      return data;
    }));
}

export function clearWnbaCache() {
  clearCachedPrefix(WNBA_PLAYERS_STORAGE_PREFIX);
  clearCachedPrefix(WNBA_STORAGE_PREFIX);
  clearCachedPrefix(WNBA_NAME_STORAGE_PREFIX);
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
