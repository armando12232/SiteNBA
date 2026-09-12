export function filterByFootballStatus(fixtures, statusFilter) {
  if (statusFilter === 'live') return fixtures.filter((fixture) => fixture.live);
  if (statusFilter === 'upcoming') return fixtures.filter((fixture) => !fixture.live && !fixture.finished);
  if (statusFilter === 'finished') return fixtures.filter((fixture) => fixture.finished);
  return fixtures;
}

export function filterFootballFixtures(fixtures, { activeTab = 'fixtures', league = 'all', query = '', statusFilter = 'all' } = {}) {
  const cleaned = normalizeFootballSearch(query);
  const rows = activeTab === 'live'
    ? fixtures.filter((item) => item.live)
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
      return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
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
    .filter((fixture) => !fixture.finished)
    .map((fixture) => ({ fixture, read: buildFootballRead(fixture, {}) }))
    .sort((a, b) => {
      if (a.fixture.live !== b.fixture.live) return a.fixture.live ? -1 : 1;
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
  const over25 = decimalOdd(odds?.over25, 'decimal');
  const goalLine = data.pregame?.odds?.overUnder ?? data.stats?.odds?.overUnder;
  const cardAvg = Number.parseFloat(referee.avg_cards);
  const tempo = fixture.live ? 'Ao vivo' : fixture.finished ? 'Final' : 'Pré-jogo';
  const hasShots = hasFootballStat(homeStats?.stats?.totalShots) && hasFootballStat(awayStats?.stats?.totalShots);
  const hasTarget = hasFootballStat(homeStats?.stats?.shotsOnTarget) && hasFootballStat(awayStats?.stats?.shotsOnTarget);
  const hasPregame = Boolean(homePregame?.record || awayPregame?.record || homePregame?.points || awayPregame?.points);
  const hasData = hasShots || hasPregame || over25 || goalLine != null || Number.isFinite(cardAvg);
  const title = fixture.finished ? 'Resumo final' : hasData ? (fixture.live ? 'Resumo ao vivo' : 'Contexto pré-jogo') : 'Sem dados suficientes';
  const signals = [
    { label: 'Status', value: tempo, note: fixture.status_long || fixture.status || '-' },
    { label: 'Chutes', value: hasShots ? homeShots + awayShots : '-', note: hasTarget ? `${homeTarget + awayTarget} no alvo` : 'dados no alvo indisponíveis' },
    over25
      ? { label: 'Over 2.5', value: over25.toFixed(2), note: fixture.finished ? 'odd histórica' : 'odd decimal' }
      : { label: 'Linha de gols', value: goalLine ?? '-', note: goalLine != null ? 'total de gols do mercado' : 'linha indisponível' },
    { label: 'Árbitro', value: Number.isFinite(cardAvg) ? cardAvg.toFixed(1) : '-', note: 'cartões/jogo' },
  ];

  return {
    score: null,
    tier: 'cold',
    title,
    summary: fixture.finished
      ? 'Partida encerrada. Estatísticas e odds históricas disponíveis para consulta.'
      : hasData
        ? 'Dados disponíveis da partida. Este resumo não estima a chance de uma aposta vencer.'
        : 'Abra os detalhes para consultar as informações disponíveis desta partida.',
    signals,
  };
}

export function parseFootballStat(value) {
  if (value == null) return 0;
  const parsed = Number.parseFloat(String(value).replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function decimalOdd(value, format = 'auto') {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  if (format === 'american' || (format === 'auto' && (/^[+-]/.test(String(value)) || Math.abs(parsed) >= 100))) {
    if (Math.abs(parsed) < 100) return null;
    return parsed > 0 ? (parsed / 100) + 1 : (100 / Math.abs(parsed)) + 1;
  }
  return parsed > 1 ? parsed : null;
}

export function findTeamStats(teams, name) {
  if (!name) return undefined;
  return teams.find((team) => team.team && (team.team === name || name.includes(team.team) || team.team.includes(name)));
}

export function hasFootballStat(value) {
  return value != null && String(value).trim() !== '' && Number.isFinite(Number.parseFloat(String(value).replace(',', '.')));
}

export function formatFootballStat(value, key) {
  if (!hasFootballStat(value)) return '-';
  if (key === 'passPct' || key === 'possessionPct') {
    const number = parseFootballStat(value);
    const percent = !String(value).includes('%') && number <= 1 ? number * 100 : number;
    return `${Number(percent.toFixed(1))}%`;
  }
  return String(value);
}

export function formatFootballOdd(value, format = 'auto') {
  const odd = decimalOdd(value, format);
  return odd == null ? '-' : odd.toFixed(2);
}
