import { fetchJson } from './http.js';

const wnbaCache = new Map();
const wnbaInflight = new Map();
const wnbaPlayersCache = new Map();
const wnbaPlayersInflight = new Map();
const wnbaNameCache = new Map();
const wnbaNameInflight = new Map();
const WNBA_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = 'v2';
const WNBA_PLAYERS_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:players:`;
const WNBA_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:pregame:`;
const WNBA_NAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:wnba:pregame-name:`;

export function getWnbaPlayers(limit = 48) {
  const cacheKey = String(limit);
  const storageKey = `${WNBA_PLAYERS_STORAGE_PREFIX}${cacheKey}`;
  const stored = readStored(storageKey, WNBA_TTL_MS);
  if (stored) {
    wnbaPlayersCache.set(cacheKey, stored);
    return Promise.resolve(stored);
  }
  if (wnbaPlayersCache.has(cacheKey)) return Promise.resolve(wnbaPlayersCache.get(cacheKey));
  if (wnbaPlayersInflight.has(cacheKey)) return wnbaPlayersInflight.get(cacheKey);

  const request = fetchJson(`/api/sports?league=wnba&type=players&limit=${encodeURIComponent(limit)}`, { auth: true }, 12000)
    .then((data) => {
      wnbaPlayersCache.set(cacheKey, data);
      writeStored(storageKey, data);
      return data;
    })
    .finally(() => {
      wnbaPlayersInflight.delete(cacheKey);
    });

  wnbaPlayersInflight.set(cacheKey, request);
  return request;
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

  const request = fetchJson(`/api/sports?league=wnba&type=pregame&playerId=${encodeURIComponent(playerId)}`, { auth: true }, 15000)
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
  const cacheKey = normalizeName(name);
  const storageKey = `${WNBA_NAME_STORAGE_PREFIX}${cacheKey}`;
  const stored = readStored(storageKey, WNBA_TTL_MS);
  if (stored) {
    wnbaNameCache.set(cacheKey, stored);
    return Promise.resolve(stored);
  }
  if (wnbaNameCache.has(cacheKey)) return Promise.resolve(wnbaNameCache.get(cacheKey));
  if (wnbaNameInflight.has(cacheKey)) return wnbaNameInflight.get(cacheKey);

  const request = fetchJson(`/api/sports?league=wnba&type=pregame_by_name&name=${encodeURIComponent(name)}`, { auth: true }, 15000)
    .then((data) => {
      wnbaNameCache.set(cacheKey, data);
      writeStored(storageKey, data);
      if (data?.player_id) {
        const playerKey = String(data.player_id);
        wnbaCache.set(playerKey, data);
        writeStored(`${WNBA_STORAGE_PREFIX}${playerKey}`, data);
      }
      return data;
    })
    .finally(() => {
      wnbaNameInflight.delete(cacheKey);
    });

  wnbaNameInflight.set(cacheKey, request);
  return request;
}

export function clearWnbaCache() {
  wnbaCache.clear();
  wnbaInflight.clear();
  wnbaPlayersCache.clear();
  wnbaPlayersInflight.clear();
  wnbaNameCache.clear();
  wnbaNameInflight.clear();
  clearStoredPrefix(WNBA_PLAYERS_STORAGE_PREFIX);
  clearStoredPrefix(WNBA_STORAGE_PREFIX);
  clearStoredPrefix(WNBA_NAME_STORAGE_PREFIX);
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
