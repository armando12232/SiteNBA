export function filterByFootballStatus(fixtures, statusFilter) {
  if (statusFilter === 'live') return fixtures.filter((fixture) => fixture.live);
  if (statusFilter === 'upcoming') return fixtures.filter((fixture) => !fixture.live && !fixture.finished);
  if (statusFilter === 'finished') return fixtures.filter((fixture) => fixture.finished);
  return fixtures;
}

export function filterFootballFixtures(fixtures, { activeTab = 'fixtures', league = 'all', query = '', statusFilter = 'all' } = {}) {
  const cleaned = normalizeFootballSearch(query);
  const rows = activeTab === 'fixtures'
    ? fixtures.filter((item) => !item.live)
    : fixtures;
  const byLeague = league === 'all' ? rows : rows.filter((item) => item.league_key === league);
  const byStatus = filterByFootballStatus(byLeague, statusFilter);
  if (!cleaned) return byStatus;
  return byStatus.filter((item) => normalizeFootballSearch(`${item.home || ''} ${item.away || ''} ${item.league_name || ''}`).includes(cleaned));
}

export function sortFootballFixtures(fixtures, sortMode) {
  const rows = [...fixtures];
  if (sortMode === 'read') {
    return rows.sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return buildFootballRead(b, {}).score - buildFootballRead(a, {}).score;
    });
  }
  if (sortMode === 'league') {
    return rows.sort((a, b) => {
      const leagueCompare = String(a.league_name || a.league_key || '').localeCompare(String(b.league_name || b.league_key || ''));
      if (leagueCompare !== 0) return leagueCompare;
      return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
    });
  }
  return rows.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
  });
}

export function footballFilterHasConstraints({ league = 'all', query = '', statusFilter = 'all' } = {}) {
  return league !== 'all' || statusFilter !== 'all' || Boolean(String(query || '').trim());
}

export function footballStatusLabel(fixture) {
  if (!fixture) return '-';
  if (fixture.live) return fixture.elapsed ? `Ao vivo ${fixture.elapsed}` : 'Ao vivo';
  if (fixture.finished) return 'Encerrado';
  return fixture.status_long || 'Agendado';
}

export function normalizeFootballSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function buildFootballSummary(fixtures) {
  const rows = Array.isArray(fixtures) ? fixtures : [];
  const live = rows.filter((fixture) => fixture.live).length;
  const upcoming = rows.filter((fixture) => !fixture.live && !fixture.finished).length;
  const leagues = new Set(rows.map((fixture) => fixture.league_key).filter(Boolean)).size;
  const featured = rows.find((fixture) => fixture.live) || rows.find((fixture) => !fixture.finished) || rows[0] || null;
  return {
    total: rows.length,
    live,
    upcoming,
    leagues,
    featured,
  };
}

export function buildFootballHighlights(fixtures) {
  return (Array.isArray(fixtures) ? fixtures : [])
    .map((fixture) => ({ fixture, read: buildFootballRead(fixture, {}) }))
    .sort((a, b) => {
      if (a.fixture.live !== b.fixture.live) return a.fixture.live ? -1 : 1;
      if (a.read.score !== b.read.score) return b.read.score - a.read.score;
      return new Date(a.fixture.date || 0).getTime() - new Date(b.fixture.date || 0).getTime();
    })
    .slice(0, 5);
}

export function buildLeagueSummary(fixtures) {
  const map = new Map();
  (Array.isArray(fixtures) ? fixtures : []).forEach((fixture) => {
    const key = fixture.league_key || 'other';
    const current = map.get(key) || {
      key,
      label: fixture.league_name || key,
      total: 0,
      live: 0,
      upcoming: 0,
    };
    current.total += 1;
    if (fixture.live) current.live += 1;
    if (!fixture.live && !fixture.finished) current.upcoming += 1;
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => {
      if (a.live !== b.live) return b.live - a.live;
      return b.total - a.total;
    })
    .slice(0, 8);
}

export function buildFootballRead(fixture, data = {}) {
  const odds = data.odds && !data.odds.error ? data.odds : data.pregame?.odds;
  const stats = data.stats?.teams || [];
  const pregameTeams = data.pregame?.teams || [];
  const referee = data.referee?.referee_stats || {};
  const homeStats = findTeamStats(stats, fixture.home) || stats[0];
  const awayStats = findTeamStats(stats, fixture.away) || stats[1];
  const homePregame = pregameTeams.find((team) => team.team === fixture.home) || pregameTeams[0];
  const awayPregame = pregameTeams.find((team) => team.team === fixture.away) || pregameTeams[1];
  const homeShots = parseFootballStat(homeStats?.stats?.totalShots);
  const awayShots = parseFootballStat(awayStats?.stats?.totalShots);
  const homeTarget = parseFootballStat(homeStats?.stats?.shotsOnTarget);
  const awayTarget = parseFootballStat(awayStats?.stats?.shotsOnTarget);
  const over25 = decimalOdd(odds?.over25 || odds?.overUnder);
  const btts = decimalOdd(odds?.bttsYes);
  const cardAvg = Number.parseFloat(referee.avg_cards);
  const tempo = fixture.live ? 'Ao vivo' : fixture.finished ? 'Final' : 'Pré-jogo';
  const hasStats = Boolean(homeStats || awayStats);
  const hasPregame = Boolean(homePregame || awayPregame);
  const hasMarket = Boolean(over25 || btts);
  const attacking = homeShots + awayShots + (homeTarget + awayTarget) * 1.8;
  const market = (over25 ? Math.max(0, 70 - over25 * 18) : 0) + (btts ? Math.max(0, 55 - btts * 12) : 0);
  const tableInfo = hasPregame && (homePregame?.record || awayPregame?.record || homePregame?.points || awayPregame?.points) ? 10 : 0;
  const liveBoost = fixture.live ? 12 : 0;
  const dataBonus = (hasStats ? 5 : 0) + (hasMarket ? 8 : 0) + (hasPregame ? 4 : 0);
  const score = clamp(Math.round(38 + attacking * 1.2 + market + tableInfo + liveBoost + dataBonus), 1, 99);
  const tier = score >= 78 ? 'elite' : score >= 64 ? 'strong' : score >= 50 ? 'watch' : 'cold';
  const title = score >= 78 ? 'Elite read' : score >= 64 ? 'Leitura forte' : score >= 50 ? 'Monitorar' : 'Leitura inicial';
  const signals = [
    { label: 'Status', value: tempo, note: fixture.status_long || fixture.status || '-' },
    { label: 'Pressão', value: homeShots + awayShots || '-', note: `${homeTarget + awayTarget || 0} no alvo` },
    { label: 'Over 2.5', value: over25 ? over25.toFixed(2) : '-', note: over25 ? marketNote(over25) : 'sem odd' },
    { label: 'Árbitro', value: Number.isFinite(cardAvg) ? cardAvg.toFixed(1) : '-', note: 'cartões/jogo' },
  ];

  return {
    score,
    tier,
    title,
    summary: `${fixture.home} x ${fixture.away}: leitura baseada em ritmo do jogo, mercado e contexto pré-jogo disponível.`,
    signals,
  };
}

export function parseFootballStat(value) {
  if (value == null) return 0;
  const parsed = Number.parseFloat(String(value).replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function decimalOdd(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > 10) {
    return parsed > 0 ? (parsed / 100) + 1 : (100 / Math.abs(parsed)) + 1;
  }
  return parsed > 1 ? parsed : null;
}

export function findTeamStats(teams, name) {
  return teams.find((team) => team.team === name || name?.includes(team.team) || team.team?.includes(name));
}

function marketNote(odd) {
  if (!Number.isFinite(odd)) return 'sem odd';
  if (odd <= 1.75) return 'mercado forte';
  if (odd <= 2.05) return 'mercado equilibrado';
  return 'mercado frio';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
