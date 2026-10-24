import { fetchJson } from './http.js';
import { cachedFetch, clearCachedPrefix, writeStored } from './cache.js';

const PREGAME_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = 'v5-season-aware';
const PREGAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:nba:pregame:`;
const PREGAME_NAME_STORAGE_PREFIX = `statcast:${CACHE_VERSION}:nba:pregame-name:`;

export function getScoreboard() {
  return fetchJson('/api/nba?type=scoreboard');
}

export function searchNbaPlayers(query) {
  return fetchJson(`/api/nba?type=player_search&query=${encodeURIComponent(query)}`);
}

export function getPregameRadar() {
  return fetchJson('/api/nba?type=radar', { auth: true });
}

export function getSchedule() {
  return fetchJson('/api/nba?type=schedule');
}

export function getTeamLast(abbr) {
  return fetchJson(`/api/nba?type=team_last&abbr=${encodeURIComponent(abbr)}`);
}

export function getTeamRoster(abbr) {
  return fetchJson(`/api/nba?type=roster&abbr=${encodeURIComponent(abbr)}`);
}

export function getBoxscore(gameId) {
  return fetchJson(`/api/nba?type=boxscore&gameId=${encodeURIComponent(gameId)}`, { auth: true });
}

export function getPregame(playerId, season = 'current') {
  const seasonView = season === 'previous' ? 'previous' : 'current';
  const storageKey = getPregameStorageKey(playerId, seasonView);
  return cachedFetch(storageKey, PREGAME_TTL_MS, () => (
    fetchJson(`/api/nba?type=pregame&playerId=${encodeURIComponent(playerId)}&season=${seasonView}`, { auth: true })
  ));
}

export function getPregameByName(name, season = 'current') {
  const seasonView = season === 'previous' ? 'previous' : 'current';
  const storageKey = getPregameNameStorageKey(name, seasonView);
  return cachedFetch(storageKey, PREGAME_TTL_MS, () => fetchJson(`/api/nba?type=pregame_by_name&name=${encodeURIComponent(name)}&season=${seasonView}`, { auth: true })
    .then((data) => {
      if (data?.player_id) {
        writeStored(getPregameStorageKey(data.player_id, seasonView), data);
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

export function getPregameNameStorageKey(name, season = 'current') {
  const seasonPrefix = season === 'previous' ? 'previous:' : '';
  return `${PREGAME_NAME_STORAGE_PREFIX}${seasonPrefix}${normalizePregameName(name)}`;
}

export function getPregameStorageKey(playerId, season = 'current') {
  const seasonPrefix = season === 'previous' ? 'previous:' : '';
  return `${PREGAME_STORAGE_PREFIX}${seasonPrefix}${String(playerId)}`;
}
