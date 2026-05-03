import { fetchJson } from './http.js';

const pregameCache = new Map();
const pregameInflight = new Map();
const PREGAME_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = 'v4-last20';
const PREGAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:nba:pregame:`;
const PREGAME_NAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:nba:pregame-name:`;

export function getScoreboard() {
  return fetchJson('/api/nba?type=scoreboard');
}

export function getSchedule() {
  return fetchJson('/api/nba?type=schedule');
}

export function getTeamLast(abbr) {
  return fetchJson(`/api/nba?type=team_last&abbr=${encodeURIComponent(abbr)}`);
}

export function getBoxscore(gameId) {
  return fetchJson(`/api/nba?type=boxscore&gameId=${encodeURIComponent(gameId)}`);
}

export function getPregame(playerId) {
  const cacheKey = String(playerId);
  const stored = readStored(`${PREGAME_STORAGE_PREFIX}${cacheKey}`, PREGAME_TTL_MS);
  if (stored) {
    pregameCache.set(cacheKey, stored);
    return Promise.resolve(stored);
  }

  if (pregameCache.has(cacheKey)) return Promise.resolve(pregameCache.get(cacheKey));
  if (pregameInflight.has(cacheKey)) return pregameInflight.get(cacheKey);

  const request = fetchJson(`/api/nba?type=pregame&playerId=${encodeURIComponent(playerId)}`)
    .then((data) => {
      pregameCache.set(cacheKey, data);
      writeStored(`${PREGAME_STORAGE_PREFIX}${cacheKey}`, data);
      return data;
    })
    .finally(() => {
      pregameInflight.delete(cacheKey);
    });

  pregameInflight.set(cacheKey, request);
  return request;
}

export function getPregameByName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  const storageKey = `${PREGAME_NAME_STORAGE_PREFIX}${normalized}`;
  const stored = readStored(storageKey, PREGAME_TTL_MS);
  if (stored) return Promise.resolve(stored);

  return fetchJson(`/api/nba?type=pregame_by_name&name=${encodeURIComponent(name)}`)
    .then((data) => {
      writeStored(storageKey, data);
      if (data?.player_id) {
        const playerKey = String(data.player_id);
        pregameCache.set(playerKey, data);
        writeStored(`${PREGAME_STORAGE_PREFIX}${playerKey}`, data);
      }
      return data;
    });
}

export function clearPregameCache() {
  pregameCache.clear();
  pregameInflight.clear();
  clearStoredPrefix(PREGAME_STORAGE_PREFIX);
  clearStoredPrefix(PREGAME_NAME_STORAGE_PREFIX);
  clearStoredPrefix('statcast:nba:pregame:');
  clearStoredPrefix('statcast:nba:pregame-name:');
  clearStoredPrefix('statcast:v2-playoffs:nba:pregame:');
  clearStoredPrefix('statcast:v2-playoffs:nba:pregame-name:');
  clearStoredPrefix('statcast:v3-team:nba:pregame:');
  clearStoredPrefix('statcast:v3-team:nba:pregame-name:');
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
    // localStorage can be full or disabled; in-memory cache still works.
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
