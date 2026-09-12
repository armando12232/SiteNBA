import { checkFeature } from './_planGuard.js';

const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').replace(/\/+$/, '');
const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_COMMON = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba';
const SLUGS = {
  nfl: ['football', 'nfl'],
  nhl: ['hockey', 'nhl'],
  mlb: ['baseball', 'mlb'],
  nba: ['basketball', 'nba'],
  wnba: ['basketball', 'wnba'],
};
const cache = new Map();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const type = String(req.query?.type || '').toLowerCase();
  const league = String(req.query?.league || '').toLowerCase();
  const validTypes = new Set(['scoreboard', 'game', 'standings', 'news', 'players', 'pregame', 'pregame_by_name']);
  if (!validTypes.has(type)) return res.status(400).json({ error: `invalid type: ${type}` });
  if (![...Object.keys(SLUGS), 'cs2'].includes(league)) return res.status(400).json({ error: `invalid league: ${league}` });

  if (league === 'cs2') return proxyLegacy(req, res);

  const access = await checkFeature(req, 'sports');
  if (!access.ok) return res.status(access.status).json(access.payload);

  try {
    if (league === 'wnba' && type === 'players') {
      const limit = boundedInt(req.query?.limit, 1, 120, 60);
      return res.status(200).json({ players: (await wnbaPlayers()).slice(0, limit) });
    }
    if (league === 'wnba' && type === 'pregame') {
      const playerId = requiredId(req.query?.playerId, 'playerId');
      return res.status(200).json(await wnbaPregame(playerId));
    }
    if (league === 'wnba' && type === 'pregame_by_name') {
      const name = String(req.query?.name || '').trim();
      if (!name || name.length > 60) return res.status(400).json({ error: 'invalid name' });
      const player = (await wnbaPlayers()).find((item) => normalizeName(item.player_name).includes(normalizeName(name)));
      if (!player) return res.status(404).json({ error: 'player not found' });
      return res.status(200).json(await wnbaPregame(String(player.player_id), player));
    }
    if (type === 'scoreboard') return res.status(200).json({ games: await scoreboard(league) });
    if (type === 'game') return res.status(200).json(await gameDetail(league, requiredId(req.query?.game_id, 'game_id')));
    if (type === 'standings') return res.status(200).json({ standings: await standings(league) });
    if (type === 'news') return res.status(200).json({ articles: await news(league) });
    return res.status(400).json({ error: `unsupported type for ${league}` });
  } catch (error) {
    const status = error.status || 502;
    return res.status(status).json({ error: status < 500 ? error.message : 'sports provider unavailable', runtime: 'node-sports' });
  }
}

async function fetchJson(url, ttl = 120_000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < ttl) return hit.data;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7500) });
      if (!response.ok) throw Object.assign(new Error(`provider HTTP ${response.status}`), { status: 502 });
      const data = await response.json();
      cache.set(url, { time: Date.now(), data });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError;
}

function leagueBase(league) {
  const [sport, slug] = SLUGS[league];
  return `${ESPN_SITE}/${sport}/${slug}`;
}

async function scoreboard(league) {
  const data = await fetchJson(`${leagueBase(league)}/scoreboard`, 30_000);
  return (data.events || []).map((event) => eventGame(event, league));
}

function eventGame(event, league) {
  const competition = event.competitions?.[0] || {};
  const status = competition.status || event.status || {};
  const side = (homeAway) => {
    const competitor = (competition.competitors || []).find((item) => item.homeAway === homeAway) || {};
    const team = competitor.team || {};
    return { id: team.id || '', name: team.displayName || '', abbr: team.abbreviation || '', logo: team.logo || '', color: team.color || '333333',
      score: typeof competitor.score === 'object' ? competitor.score?.displayValue ?? competitor.score?.value ?? '' : competitor.score ?? '',
      record: competitor.records?.[0]?.summary || '' };
  };
  return { id: event.id || '', name: event.name || '', date: competition.date || event.date || '', state: status.type?.state || 'pre',
    detail: status.type?.shortDetail || status.displayClock || '', period: status.period || 0, home: side('home'), away: side('away'),
    venue: competition.venue?.fullName || '', situation: competition.situation || {}, league: league.toUpperCase() };
}

async function gameDetail(league, gameId) {
  const data = await fetchJson(`${leagueBase(league)}/summary?event=${encodeURIComponent(gameId)}`, 30_000);
  return { players: data.boxscore?.players || [], leaders: data.leaders || [], boxscore: data.boxscore || {}, header: data.header || {} };
}

async function standings(league) {
  const data = await fetchJson(`${leagueBase(league)}/standings`, 3_600_000);
  return data.children || data.standings || [];
}

async function news(league) {
  const data = await fetchJson(`${leagueBase(league)}/news?limit=10`, 300_000);
  return (data.articles || []).slice(0, 10).map((item) => ({ headline: item.headline || '', description: item.description || '',
    published: item.published || '', link: item.links?.web?.href || '', image: item.images?.[0]?.url || '' }));
}

async function wnbaPlayers() {
  const key = 'wnba:players';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < 3_600_000) return hit.data;
  const teamsData = await fetchJson(`${ESPN_SITE}/basketball/wnba/teams`, 3_600_000);
  const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams?.map((item) => item.team).filter((team) => team.isActive !== false) || [];
  const rosters = await Promise.all(teams.map(async (team) => ({ team, data: await fetchJson(`${ESPN_SITE}/basketball/wnba/teams/${team.id}/roster`, 3_600_000) })));
  const seen = new Set();
  const players = [];
  for (const { team, data } of rosters) {
    for (const athlete of data.athletes || []) {
      if (!athlete.id || seen.has(String(athlete.id))) continue;
      seen.add(String(athlete.id));
      players.push({ id: Number(athlete.id), player_id: Number(athlete.id), player_name: athlete.displayName || '', team_abbr: team.abbreviation || '',
        team_name: team.displayName || '', position: athlete.position?.abbreviation || '', season_avg: { pts: null, reb: null, ast: null, fg3m: null },
        props: {}, synthetic_lines: {}, sample_seasons: [], using_previous_season: false, league: 'wnba', photo_url: athlete.headshot?.href || '' });
    }
  }
  const popular = ['Aja Wilson', 'Caitlin Clark', 'Breanna Stewart', 'Napheesa Collier', 'Sabrina Ionescu', 'Kelsey Plum', 'Arike Ogunbowale'];
  const rank = new Map(popular.map((name, index) => [normalizeName(name), index]));
  players.sort((a, b) => (rank.get(normalizeName(a.player_name)) ?? 999) - (rank.get(normalizeName(b.player_name)) ?? 999) || a.player_name.localeCompare(b.player_name));
  cache.set(key, { time: Date.now(), data: players });
  return players;
}

async function wnbaPregame(playerId, knownPlayer = null) {
  const profilePromise = knownPlayer ? Promise.resolve(null) : fetchJson(`${ESPN_COMMON}/athletes/${playerId}`, 3_600_000).catch(() => null);
  const now = new Date();
  const seasons = [now.getUTCFullYear(), now.getUTCFullYear() - 1];
  let rows = [];
  let season = seasons[0];
  for (const candidate of seasons) {
    const data = await fetchJson(`${ESPN_COMMON}/athletes/${playerId}/gamelog?season=${candidate}`, 300_000);
    rows = parseGameLog(data);
    if (rows.length) { season = candidate; break; }
  }
  if (!rows.length) throw Object.assign(new Error('player statistics unavailable'), { status: 404 });
  const profile = await profilePromise;
  const athlete = profile?.athlete || {};
  const seasonAvg = averages(rows);
  const last5 = rows.slice(0, 5);
  const last10 = rows.slice(0, 10);
  const props = {};
  for (const [label, stat] of [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', 'FG3M']]) {
    const avg = seasonAvg[label];
    if (!Number.isFinite(avg) || (label === 'fg3m' ? avg < 0.2 : avg < 0.5)) continue;
    const line = Math.floor(avg) + 0.5;
    const l5 = hitRate(last5, stat, line);
    const l10 = hitRate(last10, stat, line);
    props[label] = { l5, l10, line, hit_rate: l10, projection: round(mean(last5.map((row) => row[stat]))), edge: round(mean(last5.map((row) => row[stat])) - line) };
  }
  const playerName = knownPlayer?.player_name || athlete.displayName || '';
  const teamAbbr = knownPlayer?.team_abbr || athlete.team?.abbreviation || String(rows[0]?.MATCHUP || '').split(' ')[0];
  return { id: Number(playerId), player_id: Number(playerId), player_name: playerName, team_abbr: teamAbbr, position: knownPlayer?.position || athlete.position?.abbreviation || '',
    league: 'wnba', source: 'espn', photo_url: knownPlayer?.photo_url || athlete.headshot?.href || '', season_avg: seasonAvg, props,
    last5_avg: averages(last5), last10_avg: averages(last10), synthetic_lines: Object.fromEntries(Object.entries(props).map(([key, value]) => [key, value.line])),
    hit_rates: { pts_last10: props.pts?.hit_rate ?? null }, edge_points: props.pts?.edge ?? null, sample_seasons: [String(season)],
    using_previous_season: season !== now.getUTCFullYear(), last5_games: rows.slice(0, 20).map((row) => ({ opp: row.MATCHUP, date: row.GAME_DATE,
      pts: row.PTS, reb: row.REB, ast: row.AST, fg3m: row.FG3M, season_type: 'Regular Season' })), summary: `WNBA L5 ${props.pts?.l5 ?? '-'}%` };
}

function parseGameLog(data) {
  const names = data.names || [];
  const rows = [];
  for (const seasonType of data.seasonTypes || []) {
    if (!String(seasonType.displayName || '').includes('Regular Season')) continue;
    for (const category of seasonType.categories || []) {
      for (const item of category.events || []) {
        const stats = Object.fromEntries(names.map((name, index) => [name, item.stats?.[index]]));
        if (!Number.isFinite(Number(stats.points))) continue;
        const event = data.events?.[item.eventId] || {};
        rows.push({ GAME_ID: item.eventId, GAME_DATE: String(event.gameDate || '').slice(0, 10),
          MATCHUP: `${event.team?.abbreviation || ''} ${event.atVs || ''} ${event.opponent?.abbreviation || ''}`,
          PTS: statNumber(stats.points), REB: statNumber(stats.totalRebounds), AST: statNumber(stats.assists),
          FG3M: statNumber(stats['threePointFieldGoalsMade-threePointFieldGoalsAttempted']) });
      }
    }
  }
  return rows.filter((row) => ['PTS', 'REB', 'AST', 'FG3M'].every((key) => Number.isFinite(row[key]))).sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));
}

async function proxyLegacy(req, res) {
  try {
    const query = new URLSearchParams(Object.entries(req.query || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : String(value)])).toString();
    const response = await fetch(`${SITE_URL}/api/sports-legacy?${query}`, { headers: { Accept: 'application/json', Authorization: req.headers.authorization || '' }, signal: AbortSignal.timeout(9000) });
    const text = await response.text();
    res.status(response.status).setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch {
    return res.status(503).json({ error: 'cs2 provider unavailable', runtime: 'node-sports' });
  }
}

function averages(rows) { return Object.fromEntries([['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', 'FG3M']].map(([label, key]) => [label, round(mean(rows.map((row) => row[key])))])); }
function hitRate(rows, key, line) { return rows.length ? Math.round(100 * rows.filter((row) => row[key] >= line).length / rows.length) : null; }
function mean(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0; }
function round(value) { return Math.round(value * 10) / 10; }
function statNumber(value) { const number = Number(String(value ?? '').split('-')[0]); return Number.isFinite(number) ? number : null; }
function normalizeName(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function requiredId(value, field) { const text = String(value || ''); if (!/^[a-zA-Z0-9_-]{1,40}$/.test(text)) throw Object.assign(new Error(`invalid ${field}`), { status: 400 }); return text; }
function boundedInt(value, low, high, fallback) { const number = Number.parseInt(value, 10); return Number.isFinite(number) ? Math.max(low, Math.min(high, number)) : fallback; }
function setCors(res) { res.setHeader('Access-Control-Allow-Origin', SITE_URL); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Cache-Control', 'no-store'); }

