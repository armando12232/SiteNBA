import { checkFeature } from './_planGuard.js';

const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').replace(/\/+$/, '');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LEAGUES = [
  { key: 'brasileirao', slug: 'bra.1', name: 'Brasileirao Serie A', flag: '🇧🇷' },
  { key: 'champions', slug: 'uefa.champions', name: 'Champions League', flag: '🏆' },
  { key: 'premier', slug: 'eng.1', name: 'Premier League', flag: '🏴' },
  { key: 'laliga', slug: 'esp.1', name: 'La Liga', flag: '🇪🇸' },
  { key: 'bundesliga', slug: 'ger.1', name: 'Bundesliga', flag: '🇩🇪' },
  { key: 'seriea', slug: 'ita.1', name: 'Serie A', flag: '🇮🇹' },
  { key: 'ligue1', slug: 'fra.1', name: 'Ligue 1', flag: '🇫🇷' },
  { key: 'libertadores', slug: 'conmebol.libertadores', name: 'Libertadores', flag: '🌎' },
];
const cache = new Map();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const type = String(req.query?.type || 'fixtures');
  const valid = new Set(['fixtures', 'live', 'stats', 'pregame', 'form', 'lineup', 'referee', 'bet365odds']);
  if (!valid.has(type)) return res.status(400).json({ error: 'invalid type' });
  const access = await checkFeature(req, 'football');
  if (!access.ok) return res.status(access.status).json(access.payload);

  if (type === 'stats' || type === 'pregame') {
    try {
      const gameId = requiredId(req.query?.gameId, 'gameId');
      const league = LEAGUES.find((item) => item.key === String(req.query?.leagueKey || 'premier'));
      if (!league) return res.status(400).json({ error: 'invalid leagueKey' });
      const data = await fetchJson(`${BASE}/${league.slug}/summary?event=${encodeURIComponent(gameId)}`);
      return res.status(200).json(type === 'stats' ? parseStats(data) : parsePregame(data));
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      return res.status(503).json({ error: 'football detail provider unavailable', runtime: 'node-football' });
    }
  }

  if (type !== 'fixtures' && type !== 'live') return proxyLegacy(req, res);

  try {
    const payloads = await Promise.all(LEAGUES.map(async (league) => {
      try { return { league, data: await fetchJson(`${BASE}/${league.slug}/scoreboard`) }; }
      catch { return { league, data: null }; }
    }));
    const unavailableLeagues = payloads.filter(({ data }) => !data).map(({ league }) => league.key);
    if (unavailableLeagues.length === LEAGUES.length) throw new Error('all football providers unavailable');
    const fixtures = payloads.flatMap(({ league, data }) => (data?.events || []).map((event) => parseFixture(event, league)))
      .filter((fixture) => type !== 'live' || fixture.live)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return res.status(200).json({ fixtures, count: fixtures.length, unavailable_leagues: unavailableLeagues, ...(type === 'live' ? { live: true } : {}) });
  } catch {
    return res.status(503).json({ error: 'football provider unavailable', runtime: 'node-football' });
  }
}

async function fetchJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < 60_000) return hit.data;
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7500) });
  if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
  const data = await response.json();
  cache.set(url, { time: Date.now(), data });
  return data;
}

function parseFixture(event, league) {
  const competition = event.competitions?.[0] || {};
  const status = competition.status || event.status || {};
  const state = status.type?.state || 'pre';
  const home = (competition.competitors || []).find((item) => item.homeAway === 'home') || {};
  const away = (competition.competitors || []).find((item) => item.homeAway === 'away') || {};
  const score = (item) => typeof item.score === 'object' ? item.score?.displayValue ?? item.score?.value ?? null : item.score ?? null;
  return { id: String(event.id || ''), date: competition.date || event.date || '', league_key: league.key, league_name: league.name, league_flag: league.flag,
    home: home.team?.displayName || '', home_logo: home.team?.logo || '', home_goals: score(home), away: away.team?.displayName || '',
    away_logo: away.team?.logo || '', away_goals: score(away), status: state, status_long: translateStatus(status.type?.shortDetail || ''),
    elapsed: state === 'in' ? status.displayClock || '' : null, period: ['in', 'post'].includes(state) ? status.period || null : null,
    live: state === 'in', finished: state === 'post', venue: competition.venue?.fullName || '' };
}

export function parseStats(data) {
  const wanted = new Set(['possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners', 'foulsCommitted', 'yellowCards', 'redCards',
    'offsides', 'saves', 'passPct', 'accuratePasses', 'totalPasses', 'effectiveTackles', 'interceptions', 'expectedGoals', 'xG', 'xg',
    'totalExpectedGoals', 'shotsInsideBox', 'shotsOutsideBox', 'bigChancesCreated', 'bigChancesMissed']);
  const teams = (data.boxscore?.teams || []).map((item) => ({ team: item.team?.displayName || '', abbreviation: item.team?.abbreviation || '',
    homeAway: item.homeAway || '', stats: Object.fromEntries((item.statistics || []).filter((stat) => wanted.has(stat.name)).map((stat) => [stat.name, stat.displayValue ?? stat.value ?? ''])) }));
  const important = new Set(['Goal', 'Yellow Card', 'Red Card', 'Penalty', 'Own Goal', 'Substitution']);
  const events = (data.keyEvents || []).filter((event) => important.has(event.type?.text)).slice(0, 20).map((event) => ({
    type: event.type?.text || '', clock: event.clock?.displayValue || '', text: eventText(event), team: event.team?.displayName || '' }));
  const playerStats = new Set(['totalGoals', 'goalAssists', 'totalShots', 'shotsOnTarget', 'yellowCards', 'redCards', 'foulsCommitted',
    'foulsSuffered', 'offsides', 'subIns', 'shotsFaced', 'goalsConceded', 'saves']);
  const rosters = (data.rosters || []).map((roster) => ({ team: roster.team?.displayName || '', homeAway: roster.homeAway || '',
    formation: typeof roster.formation === 'object' ? roster.formation?.name || '' : String(roster.formation || ''), players: (roster.roster || []).map((item) => ({
      name: item.athlete?.displayName || '', short: item.athlete?.shortName || '', jersey: item.jersey || '',
      position: item.position?.abbreviation || '', positionFull: item.position?.displayName || '', starter: Boolean(item.starter),
      subbedIn: Boolean(item.subbedIn), subbedOut: Boolean(item.subbedOut), stats: Object.fromEntries((item.stats || [])
        .filter((stat) => playerStats.has(stat.name)).map((stat) => [stat.name, stat.displayValue ?? '0'])) })) }));
  const odds = data.odds?.[0];
  return { teams, events, rosters, ...(odds ? { odds: { spread: odds.spread, overUnder: odds.overUnder, provider: odds.provider?.name || '' } } : {}) };
}

export function parsePregame(data) {
  const competition = data.header?.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const teams = competitors.map((item) => ({ team: item.team?.displayName || '', logo: item.team?.logo || '', homeAway: item.homeAway || '',
    record: (item.record || []).find((row) => row.type === 'total')?.displayValue || '',
    points: (item.record || []).find((row) => row.type === 'points')?.displayValue || '' }));
  const groups = data.standings?.groups || [];
  const entries = groups[0]?.standings?.entries || [];
  const stat = (entry, name) => (entry.stats || []).find((item) => item.name === name)?.displayValue || '';
  const standings = entries.map((entry) => ({ team: typeof entry.team === 'object' ? entry.team?.displayName || entry.team?.name || '' : String(entry.team || ''), rank: stat(entry, 'rank'), pts: stat(entry, 'points'),
    wins: stat(entry, 'wins'), draws: stat(entry, 'ties'), losses: stat(entry, 'losses'), gp: stat(entry, 'gamesPlayed') }));
  const leaders = [];
  for (const category of data.leaders || []) {
    for (const group of category.leaders || []) {
      const rows = (group.leaders || []).slice(0, 3).map((item) => ({ name: item.athlete?.displayName || '',
        value: item.shortDisplayValue || item.displayValue || '', team: item.team?.displayName || '' }));
      if (rows.length) leaders.push({ category: group.displayName || group.name || '', leaders: rows });
    }
  }
  const h2h = (data.headToHeadGames || []).slice(0, 5).map((event) => {
    const comp = event.competitions?.[0] || {};
    const home = (comp.competitors || []).find((item) => item.homeAway === 'home') || {};
    const away = (comp.competitors || []).find((item) => item.homeAway === 'away') || {};
    return { date: comp.date || '', home: home.team?.displayName || '', homeScore: scoreValue(home.score), away: away.team?.displayName || '',
      awayScore: scoreValue(away.score), winner: Boolean(home.winner) };
  });
  const odds = data.odds?.[0];
  return { teams, venue: data.gameInfo?.venue?.fullName || '', city: data.gameInfo?.venue?.address?.city || '', standings, leaders, h2h,
    ...(odds ? { odds: { spread: odds.spread, overUnder: odds.overUnder, homeML: odds.homeTeamOdds?.moneyLine,
      awayML: odds.awayTeamOdds?.moneyLine, drawOdds: typeof odds.drawOdds === 'object' ? odds.drawOdds?.moneyLine : odds.drawOdds,
      format: 'american', provider: odds.provider?.name || '' } } : {}) };
}

function eventText(event) {
  const type = event.type?.text || '';
  const labels = { Goal: 'Gol', 'Own Goal': 'Gol Contra', 'Yellow Card': 'Cartão Amarelo', 'Red Card': 'Cartão Vermelho',
    Penalty: 'Pênalti', Substitution: 'Substituição' };
  const athlete = event.athletesInvolved?.[0]?.displayName || event.athletesInvolved?.[0]?.shortName || '';
  return `${labels[type] || type}${athlete ? ` — ${athlete}` : ''}${event.team?.shortDisplayName ? ` (${event.team.shortDisplayName})` : ''}`;
}

function scoreValue(value) { return typeof value === 'object' ? value?.displayValue ?? value?.value ?? '' : value ?? ''; }

async function proxyLegacy(req, res) {
  try {
    const query = new URLSearchParams(Object.entries(req.query || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : String(value)])).toString();
    const response = await fetch(`${SITE_URL}/api/football-legacy?${query}`, { headers: { Accept: 'application/json', Authorization: req.headers.authorization || '' }, signal: AbortSignal.timeout(13000) });
    const text = await response.text();
    res.status(response.status).setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch {
    return res.status(503).json({ error: 'football detail provider unavailable', runtime: 'node-football' });
  }
}

function translateStatus(value) {
  const map = { 'Half Time': 'Intervalo', HT: 'Intervalo', 'Full Time': 'Encerrado', FT: 'Encerrado', 'Not Started': 'Agendado',
    'First Half': '1º Tempo', 'Second Half': '2º Tempo', Postponed: 'Adiado', Cancelled: 'Cancelado', Live: 'Ao Vivo', 'In Progress': 'Em Andamento', Final: 'Encerrado' };
  return map[value] || value;
}

function requiredId(value, field) { const text = String(value || ''); if (!/^[a-zA-Z0-9_-]{1,40}$/.test(text)) throw Object.assign(new Error(`invalid ${field}`), { status: 400 }); return text; }
function setCors(res) { res.setHeader('Access-Control-Allow-Origin', SITE_URL); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Cache-Control', 'no-store'); }
