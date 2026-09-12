import { fetchJson } from './http.js';
import { cachedFetch, clearCachedPrefix, writeStored } from './cache.js';

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
  return fetchJson(`/api/nba?type=boxscore&gameId=${encodeURIComponent(gameId)}`, { auth: true });
}

export function getPregame(playerId) {
  const storageKey = getPregameStorageKey(playerId);
  return cachedFetch(storageKey, PREGAME_TTL_MS, () => (
    fetchJson(`/api/nba?type=pregame&playerId=${encodeURIComponent(playerId)}`)
  ));
}

export function getPregameByName(name) {
  const storageKey = getPregameNameStorageKey(name);
  return cachedFetch(storageKey, PREGAME_TTL_MS, () => fetchJson(`/api/nba?type=pregame_by_name&name=${encodeURIComponent(name)}`, { auth: true })
    .then((data) => {
      if (data?.player_id) {
        const playerKey = String(data.player_id);
        writeStored(`${PREGAME_STORAGE_PREFIX}${playerKey}`, data);
      }
      return data;
    }));
}

export function clearPregameCache() {
  clearCachedPrefix(PREGAME_STORAGE_PREFIX);
  clearCachedPrefix(PREGAME_NAME_STORAGE_PREFIX);
  clearCachedPrefix('statcast:nba:pregame:');
  clearCachedPrefix('statcast:nba:pregame-name:');
  clearCachedPrefix('statcast:v2-playoffs:nba:pregame:');
  clearCachedPrefix('statcast:v2-playoffs:nba:pregame-name:');
  clearCachedPrefix('statcast:v3-team:nba:pregame:');
  clearCachedPrefix('statcast:v3-team:nba:pregame-name:');
}

export function normalizePregameName(name) {
  return String(name || '').trim().toLowerCase();
}

export function getPregameNameStorageKey(name) {
  return `${PREGAME_NAME_STORAGE_PREFIX}${normalizePregameName(name)}`;
}

export function getPregameStorageKey(playerId) {
  return `${PREGAME_STORAGE_PREFIX}${String(playerId)}`;
}
