import fs from 'node:fs';
import { checkFeature } from './_planGuard.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const COMMON = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').replace(/\/+$/, '');
const PLAYERS = JSON.parse(fs.readFileSync(new URL('../server/nba_player_ids.json', import.meta.url), 'utf8'));
const ESPN_TO_NBA = new Map(Object.entries(PLAYERS).map(([nbaId, item]) => [String(item.espn_id), Number(nbaId)]));
const NAME_TO_NBA = new Map(Object.entries(PLAYERS).map(([nbaId, item]) => [normalizeName(item.name), Number(nbaId)]));
const TEAM_ABBR = { NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };
const cache = new Map();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const type = String(req.query?.type || '');
  const valid = new Set(['scoreboard', 'boxscore', 'season_avg', 'pregame', 'pregame_by_name', 'schedule', 'defense', 'team_info', 'team_last', 'roster', 'debug_gamelog']);
  if (!valid.has(type)) return res.status(400).json({ error: 'invalid type' });

  try {
    if (['boxscore', 'debug_gamelog'].includes(type)) {
      const access = await checkFeature(req, type === 'boxscore' ? 'live' : 'modal');
      if (!access.ok) return res.status(access.status).json(access.payload);
    }
    if (type === 'pregame_by_name') {
      const access = await checkFeature(req, 'modal');
      if (!access.ok) return res.status(access.status).json(access.payload);
    }

    if (type === 'scoreboard') return res.status(200).json({ games: (await scoreboard()).filter((game) => game.status === 2) });
    if (type === 'schedule') return res.status(200).json({ games: await schedule() });
    if (type === 'boxscore') return res.status(200).json({ players: await boxscore(requiredId(req.query?.gameId, 'gameId')) });
    if (type === 'season_avg') return res.status(200).json({ avg: averages((await gameLog(requiredPlayerId(req.query?.playerId))).rows) });
    if (type === 'pregame') return res.status(200).json(await pregame(requiredPlayerId(req.query?.playerId)));
    if (type === 'pregame_by_name') {
      const name = String(req.query?.name || '').trim();
      if (!name || name.length > 60) return res.status(400).json({ error: 'invalid name' });
      const playerId = NAME_TO_NBA.get(normalizeName(name));
      if (!playerId) return res.status(404).json({ error: 'player not found', name });
      return res.status(200).json(await pregame(playerId));
    }
    if (type === 'team_info') return res.status(200).json({ team: await teamInfo(requiredAbbr(req.query?.abbr || req.query?.teamAbbr)) });
    if (type === 'roster') return res.status(200).json({ players: await roster(requiredAbbr(req.query?.abbr || req.query?.teamAbbr)) });
    if (type === 'team_last') return res.status(200).json(await teamLast(requiredAbbr(req.query?.abbr)));
    if (type === 'defense') return res.status(503).json({ error: 'Estatísticas de defesa por posição indisponíveis no provedor atual.' });
    if (type === 'debug_gamelog') {
      const data = await gameLog(requiredPlayerId(req.query?.playerId));
      return res.status(200).json({ source: 'espn', season: data.season, row_count: data.rows.length, sample: data.rows.slice(0, 2), errors: [] });
    }
  } catch (error) {
    const status = error.status || 502;
    return res.status(status).json({ error: status === 404 ? error.message : 'Dados NBA indisponíveis no momento. Tente novamente.', runtime: 'node-nba' });
  }
}

async function fetchJson(url, ttl = 300_000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < ttl) return hit.data;
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Object.assign(new Error(`provider HTTP ${response.status}`), { status: 502 });
  const data = await response.json();
  cache.set(url, { time: Date.now(), data });
  return data;
}

function eventGame(event) {
  const competition = event.competitions?.[0] || {};
  const status = competition.status || event.status || {};
  const team = (side) => {
    const item = (competition.competitors || []).find((row) => row.homeAway === side) || {};
    const info = item.team || {};
    return { teamId: info.id, abbr: teamAbbr(info), teamAbbreviation: teamAbbr(info), name: info.displayName || '', score: numericScore(item.score) };
  };
  const date = competition.date || event.date || '';
  const state = status.type?.state;
  return { gameId: event.id, status: { pre: 1, in: 2, post: 3 }[state] || 1, statusText: status.type?.shortDetail || '',
    gameStatusText: status.type?.shortDetail || '', gameTimeUTC: date, gameDateLabel: date.slice(0, 10), period: status.period || 0,
    gameClock: status.displayClock || '', homeTeam: team('home'), awayTeam: team('away'), source: 'espn' };
}

async function scoreboard(query = '') {
  const data = await fetchJson(`${BASE}/scoreboard${query}`);
  return (data.events || []).map(eventGame);
}

async function schedule() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dates = `${compactDate(now)}-${compactDate(tomorrow)}`;
  return (await scoreboard(`?dates=${dates}`)).filter((game) => {
    const time = Date.parse(game.gameTimeUTC);
    return Number.isFinite(time) && time <= tomorrow.getTime();
  });
}

async function teams() {
  const data = await fetchJson(`${BASE}/teams`, 3_600_000);
  return data.sports?.[0]?.leagues?.[0]?.teams?.map((item) => item.team) || [];
}

async function teamInfo(abbreviation) {
  const found = (await teams()).find((team) => teamAbbr(team) === abbreviation);
  if (!found) throw Object.assign(new Error('team not found'), { status: 404 });
  return found;
}

async function roster(abbreviation) {
  const team = await teamInfo(abbreviation);
  const data = await fetchJson(`${BASE}/teams/${team.id}/roster`, 3_600_000);
  return (data.athletes || []).map((player) => ({ playerId: ESPN_TO_NBA.get(String(player.id)) || null, espn_id: player.id,
    name: player.displayName, position: player.position?.abbreviation || '', teamAbbr: abbreviation }));
}

async function teamLast(abbreviation) {
  const team = await teamInfo(abbreviation);
  const year = new Date().getUTCFullYear();
  let games = [];
  for (const season of [year + (new Date().getUTCMonth() >= 9 ? 1 : 0), year]) {
    const data = await fetchJson(`${BASE}/teams/${team.id}/schedule?season=${season}`);
    games = (data.events || []).map(eventGame).filter((game) => game.status === 3).sort((a, b) => b.gameTimeUTC.localeCompare(a.gameTimeUTC));
    if (games.length) break;
  }
  const clean = games.slice(0, 5).map((game) => {
    const home = game.homeTeam.abbr === abbreviation;
    const own = home ? game.homeTeam : game.awayTeam;
    const opponent = home ? game.awayTeam : game.homeTeam;
    return { gameId: game.gameId, date: game.gameTimeUTC.slice(0, 10), opp: opponent.abbr, homeAway: home ? 'home' : 'away',
      score: `${own.score}-${opponent.score}`, result: own.score > opponent.score ? 'W' : 'L' };
  });
  return { abbr: abbreviation, form: clean.map((game) => game.result).join(''), games: clean, source: 'espn' };
}

async function gameLog(playerId) {
  const player = PLAYERS[String(playerId)];
  if (!player) throw Object.assign(new Error('player not found'), { status: 404 });
  const now = new Date();
  const currentSeason = now.getUTCFullYear() + (now.getUTCMonth() >= 9 ? 1 : 0);
  for (const season of [currentSeason, currentSeason - 1]) {
    const data = await fetchJson(`${COMMON}/athletes/${player.espn_id}/gamelog?season=${season}`);
    const rows = parseGameLog(data);
    if (rows.length) return { rows, season };
  }
  throw Object.assign(new Error('player statistics unavailable'), { status: 404 });
}

function parseGameLog(data) {
  const names = data.names || [];
  const rows = new Map();
  for (const section of data.seasonTypes || []) {
    if (!String(section.displayName).includes('Regular Season')) continue;
    for (const category of section.categories || []) {
      for (const item of category.events || []) {
        const values = Object.fromEntries(names.map((name, index) => [name, item.stats?.[index]]));
        if (!isNumber(values.points)) continue;
        const event = data.events?.[item.eventId] || {};
        const row = { GAME_ID: item.eventId, GAME_DATE: String(event.gameDate || '').slice(0, 10),
          MATCHUP: `${teamAbbr(event.team || {})} ${event.atVs || ''} ${teamAbbr(event.opponent || {})}`,
          _SEASON_TYPE: 'Regular Season', PTS: statNumber(values.points), REB: statNumber(values.totalRebounds),
          AST: statNumber(values.assists), FG3M: statNumber(values['threePointFieldGoalsMade-threePointFieldGoalsAttempted']), MIN: statNumber(values.minutes) };
        if (['PTS', 'REB', 'AST', 'FG3M', 'MIN'].every((key) => Number.isFinite(row[key]))) rows.set(item.eventId, row);
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));
}

function averages(rows) {
  return Object.fromEntries([['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', 'FG3M']].map(([label, key]) => [label, round(mean(rows.map((row) => row[key])))]));
}

async function pregame(playerId) {
  const { rows, season } = await gameLog(playerId);
  const seasonAvg = averages(rows);
  const last5 = rows.slice(0, 5);
  const last10 = rows.slice(0, 10);
  const props = {};
  for (const [label, key] of [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', 'FG3M']]) {
    const avg = seasonAvg[label];
    if (avg < 1.5) continue;
    const line = Math.floor(avg) + 0.5;
    const l5 = hitRate(last5, key, line);
    const l10 = hitRate(last10, key, line);
    props[label] = { l5, l10, line, hit_rate: l10, edge: round(mean(last5.map((row) => row[key])) - line) };
  }
  const pts = props.pts || {};
  return { player_id: playerId, player_name: PLAYERS[String(playerId)].name, team_abbr: String(rows[0]?.MATCHUP || '').split(' ')[0], source: 'espn', sample_season: season,
    season_avg: seasonAvg, props, last5_avg: averages(last5), last10_avg: averages(last10), synthetic_lines: Object.fromEntries(Object.entries(props).map(([key, value]) => [key, value.line])),
    hit_rates: { pts_last10: pts.hit_rate ?? null }, edge_points: pts.edge ?? null, minsL5: round(mean(last5.map((row) => row.MIN))),
    last5_games: rows.slice(0, 20).map((row) => ({ opp: row.MATCHUP, date: row.GAME_DATE, pts: row.PTS, reb: row.REB, ast: row.AST, fg3m: row.FG3M,
      season_type: row._SEASON_TYPE, hit: Number.isFinite(pts.line) ? row.PTS >= pts.line : null })), summary: `L5 ${pts.l5 ?? '—'}%` };
}

async function boxscore(gameId) {
  const data = await fetchJson(`${BASE}/summary?event=${encodeURIComponent(gameId)}`, 15_000);
  const competitors = data.header?.competitions?.[0]?.competitors || [];
  const homeId = competitors.find((item) => item.homeAway === 'home')?.team?.id;
  const result = [];
  for (const group of data.boxscore?.players || []) {
    for (const block of group.statistics || []) {
      for (const item of block.athletes || []) {
        if (item.didNotPlay) continue;
        const values = Object.fromEntries((block.labels || []).map((label, index) => [label, item.stats?.[index]]));
        const athlete = item.athlete || {};
        result.push({ playerId: ESPN_TO_NBA.get(String(athlete.id)) || null, espn_id: athlete.id, name: athlete.displayName, position: athlete.position?.abbreviation || '',
          teamAbbr: teamAbbr(group.team || {}), teamId: group.team?.id, isHome: group.team?.id === homeId, mins: statNumber(values.MIN) || 0,
          pts: statNumber(values.PTS) || 0, reb: statNumber(values.REB) || 0, ast: statNumber(values.AST) || 0, pf: statNumber(values.PF) || 0,
          fgm: statNumber(values.FG) || 0, fga: Number(String(values.FG || '0-0').split('-')[1]) || 0, tpm: statNumber(values['3PT']) || 0,
          to: statNumber(values.TO) || 0, plusMinus: Number(values['+/-']) || 0, stl: statNumber(values.STL) || 0 });
      }
    }
  }
  return result;
}

function requiredPlayerId(value) { const id = Number(value); if (!Number.isInteger(id) || !PLAYERS[String(id)]) throw Object.assign(new Error('player not found'), { status: 404 }); return id; }
function requiredId(value, field) { const text = String(value || ''); if (!/^[a-zA-Z0-9_-]{1,40}$/.test(text)) throw Object.assign(new Error(`invalid ${field}`), { status: 400 }); return text; }
function requiredAbbr(value) { const text = String(value || '').toUpperCase(); if (!/^[A-Z]{2,4}$/.test(text)) throw Object.assign(new Error('invalid abbr'), { status: 400 }); return text; }
function normalizeName(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function teamAbbr(team) { const value = team.abbreviation || ''; return TEAM_ABBR[value] || value; }
function numericScore(value) { const raw = typeof value === 'object' ? value?.value ?? value?.displayValue : value; return Number(raw) || 0; }
function compactDate(date) { return date.toISOString().slice(0, 10).replaceAll('-', ''); }
function statNumber(value) { const number = Number(String(value ?? '').split('-')[0]); return Number.isFinite(number) ? number : null; }
function isNumber(value) { return Number.isFinite(Number(value)); }
function mean(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0; }
function round(value) { return Math.round(value * 10) / 10; }
function hitRate(rows, key, line) { return rows.length ? Math.round(100 * rows.filter((row) => row[key] >= line).length / rows.length) : null; }
function setCors(res) { res.setHeader('Access-Control-Allow-Origin', SITE_URL); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Cache-Control', 'no-store'); }

