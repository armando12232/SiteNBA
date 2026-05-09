import { fetchJson } from './http.js';

const wnbaCache = new Map();
const wnbaInflight = new Map();
const WNBA_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = 'v1';
const WNBA_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:pregame:`;
const WNBA_NAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:pregame-name:`;

export function getWnbaPlayers(limit = 48) {
  return fetchJson(`/api/sports?league=wnba&type=players&limit=${encodeURIComponent(limit)}`, {}, 12000);
}

export function getWnbaPregame(playerId) {
  const cacheKey = String(playerId);
  const storageKey = `${WNBA_STORAGE_PREFIX}${cacheKey}`;
  const stored = readStored(storageKey, WNBA_TTL_MS);
  if (stored) {
    wnbaCache.set(cacheKey, stored);
    return Promise.resolve(stored);
  }

  if (wnbaCache.has(cacheKey)) return Promise.resolve(wnbaCache.get(cacheKey));
  if (wnbaInflight.has(cacheKey)) return wnbaInflight.get(cacheKey);

  const request = fetchJson(`/api/sports?league=wnba&type=pregame&playerId=${encodeURIComponent(playerId)}`, {}, 15000)
    .then((data) => {
      wnbaCache.set(cacheKey, data);
      writeStored(storageKey, data);
      return data;
    })
    .finally(() => {
      wnbaInflight.delete(cacheKey);
    });

  wnbaInflight.set(cacheKey, request);
  return request;
}

export function getWnbaPregameByName(name) {
  const storageKey = `${WNBA_NAME_STORAGE_PREFIX}${normalizeName(name)}`;
  const stored = readStored(storageKey, WNBA_TTL_MS);
  if (stored) return Promise.resolve(stored);

  return fetchJson(`/api/sports?league=wnba&type=pregame_by_name&name=${encodeURIComponent(name)}`, {}, 15000)
    .then((data) => {
      writeStored(storageKey, data);
      if (data?.player_id) {
        const playerKey = String(data.player_id);
        wnbaCache.set(playerKey, data);
        writeStored(`${WNBA_STORAGE_PREFIX}${playerKey}`, data);
      }
      return data;
    });
}

export function clearWnbaCache() {
  wnbaCache.clear();
  wnbaInflight.clear();
  clearStoredPrefix(WNBA_STORAGE_PREFIX);
  clearStoredPrefix(WNBA_NAME_STORAGE_PREFIX);
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function readStored(key, ttlMs) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.savedAt > ttlMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeStored(key, data) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Memory cache still covers the current session.
  }
}

function clearStoredPrefix(prefix) {
  if (typeof window === 'undefined') return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore browser storage errors.
  }
}
