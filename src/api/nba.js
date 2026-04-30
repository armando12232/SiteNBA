import { fetchJson } from './http.js';

const pregameCache = new Map();
const pregameInflight = new Map();

export function getScoreboard() {
  return fetchJson('/api/nba?type=scoreboard');
}

export function getSchedule() {
  return fetchJson('/api/nba?type=schedule');
}

export function getTeamLast(abbr) {
  return fetchJson(`/api/nba?type=team_last&abbr=${encodeURIComponent(abbr)}`);
}

export function getPregame(playerId) {
  if (pregameCache.has(playerId)) return Promise.resolve(pregameCache.get(playerId));
  if (pregameInflight.has(playerId)) return pregameInflight.get(playerId);

  const request = fetchJson(`/api/nba?type=pregame&playerId=${encodeURIComponent(playerId)}`)
    .then((data) => {
      pregameCache.set(playerId, data);
      return data;
    })
    .finally(() => {
      pregameInflight.delete(playerId);
    });

  pregameInflight.set(playerId, request);
  return request;
}

export function getPregameByName(name) {
  return fetchJson(`/api/nba?type=pregame_by_name&name=${encodeURIComponent(name)}`);
}

export function clearPregameCache() {
  pregameCache.clear();
  pregameInflight.clear();
}
