import { useEffect, useMemo, useState } from 'react';
import {
  FOOTBALL_LEAGUES,
  getFootballBet365Odds,
  getFootballFixtures,
  getFootballLive,
  getFootballPregame,
  getFootballReferee,
  getFootballStats,
} from '../api/football.js';

export function FootballPage() {
  const [activeTab, setActiveTab] = useState('fixtures');
  const [league, setLeague] = useState('all');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState('time');
  const [reloadKey, setReloadKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [state, setState] = useState({ loading: true, refreshing: false, error: null, fixtures: [] });
  const [selectedFixture, setSelectedFixture] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState((current) => ({
        ...current,
        loading: current.fixtures.length ? false : true,
        refreshing: Boolean(current.fixtures.length),
        error: null,
      }));
      try {
        const data = activeTab === 'live' ? await getFootballLive() : await getFootballFixtures();
        if (alive) {
          setState({
            loading: false,
            refreshing: false,
            error: null,
            fixtures: data.fixtures || [],
          });
          setLastUpdated(new Date());
        }
      } catch (error) {
        if (alive) setState((current) => ({ ...current, loading: false, refreshing: false, error }));
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [activeTab, reloadKey]);

  useEffect(() => {
    if (activeTab !== 'live') return undefined;
    const timer = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  const visibleFixtures = useMemo(() => {
    const cleaned = query.trim().toLowerCase();
    const rows = activeTab === 'fixtures'
      ? state.fixtures.filter((item) => !item.live)
      : state.fixtures;
    const byLeague = league === 'all' ? rows : rows.filter((item) => item.league_key === league);
    const byStatus = filterByFootballStatus(byLeague, statusFilter);
    const filtered = cleaned
      ? byStatus.filter((item) => `${item.home || ''} ${item.away || ''} ${item.league_name || ''}`.toLowerCase().includes(cleaned))
      : byStatus;
    return sortFootballFixtures(filtered, sortMode);
  }, [activeTab, league, query, sortMode, state.fixtures, statusFilter]);

  const summary = useMemo(() => buildFootballSummary(state.fixtures), [state.fixtures]);
  const highlights = useMemo(() => buildFootballHighlights(visibleFixtures), [visibleFixtures]);
  const leagueSummary = useMemo(() => buildLeagueSummary(state.fixtures), [state.fixtures]);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2><span className="titleIcon">FT</span> Futebol</h2>
          <p className="sectionLead visible">Jogos do dia e partidas ao vivo usando a API de futebol atual.</p>
        </div>
        <div className="footballHeaderActions">
          {lastUpdated ? <span className="footballUpdated">Atualizado {formatClock(lastUpdated)}</span> : null}
          <button
            className={`footballRefresh ${state.refreshing ? 'isRefreshing' : ''}`}
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            {state.refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <span className="statusPill">{visibleFixtures.length} jogos</span>
        </div>
      </div>

      <FootballBoard summary={summary} activeTab={activeTab} />

      <div className="subTabs">
        <button className={activeTab === 'fixtures' ? 'active' : ''} type="button" onClick={() => { setActiveTab('fixtures'); setStatusFilter('all'); }}><span className="navIcon">FT</span>Jogos</button>
        <button className={activeTab === 'live' ? 'active' : ''} type="button" onClick={() => { setActiveTab('live'); setStatusFilter('all'); }}><span className="navIcon liveMark">ON</span>Ao Vivo</button>
      </div>

      <div className="filter-row">
        {FOOTBALL_LEAGUES.map((item) => (
          <button
            className={`filter-chip ${league === item.key ? 'active' : ''}`}
            key={item.key}
            type="button"
            onClick={() => setLeague(item.key)}
          >
            <span className="chipIcon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <FootballLeagueSummary
        activeLeague={league}
        items={leagueSummary}
        onSelect={(key) => setLeague(key)}
      />

      <div className="footballTools">
        <div className="footballSearch">
          <span>BUS</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar time ou liga..."
            maxLength={60}
          />
          {query ? <button type="button" onClick={() => setQuery('')}>x</button> : null}
        </div>
        <div className="footballStatusFilters">
          {[
            ['all', 'ALL', 'Todos'],
            ['live', 'ON', 'Ao vivo'],
            ['upcoming', 'NEXT', 'Agendados'],
            ['finished', 'END', 'Encerrados'],
          ].map(([key, icon, label]) => (
            <button
              type="button"
              key={key}
              className={statusFilter === key ? 'active' : ''}
              onClick={() => setStatusFilter(key)}
            >
              <span className="chipIcon">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="footballSortBar">
        <span>Ordenar</span>
        {[
          ['time', 'Horario'],
          ['read', 'Score'],
          ['league', 'Liga'],
        ].map(([key, label]) => (
          <button
            className={sortMode === key ? 'active' : ''}
            key={key}
            type="button"
            onClick={() => setSortMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="loadingGrid">Carregando futebol...</div> : null}

      {!state.loading ? (
        <>
          <FootballHighlights items={highlights} onSelect={setSelectedFixture} />
          <div className="footballGrid">
            {visibleFixtures.map((fixture) => (
              <FootballCard
                fixture={fixture}
                key={`${fixture.league_key}-${fixture.id}`}
                onSelect={setSelectedFixture}
              />
            ))}
            {!visibleFixtures.length ? <div className="emptyState">Nenhum jogo encontrado para esse filtro.</div> : null}
          </div>
        </>
      ) : null}
      <FootballModal fixture={selectedFixture} onClose={() => setSelectedFixture(null)} />
    </section>
  );
}

function FootballLeagueSummary({ activeLeague, items, onSelect }) {
  if (!items.length) return null;
  return (
    <div className="footballLeagueSummary">
      {items.map((item) => (
        <button
          className={activeLeague === item.key ? 'active' : ''}
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
        >
          <span>{item.label}</span>
          <strong>{item.total}</strong>
          <em>{item.live ? `${item.live} live` : `${item.upcoming} prox.`}</em>
        </button>
      ))}
    </div>
  );
}

function FootballHighlights({ items, onSelect }) {
  if (!items.length) return null;
  return (
    <section className="footballHighlights">
      <div className="footballHighlightsHead">
        <span>Destaques</span>
        <strong>{items.length} jogos para olhar primeiro</strong>
      </div>
      <div className="footballHighlightRail">
        {items.map(({ fixture, read }) => (
          <button
            className={`footballHighlight ${read.tier}`}
            key={`${fixture.league_key}-${fixture.id}`}
            type="button"
            onClick={() => onSelect(fixture)}
          >
            <span>{fixture.league_name || fixture.league_key}</span>
            <strong>{fixture.home} x {fixture.away}</strong>
            <em>{read.title} · {read.score}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function FootballBoard({ summary, activeTab }) {
  return (
    <div className="footballBoard">
      <div className="footballBoardHero">
        <span>{activeTab === 'live' ? 'Monitor ao vivo' : 'Agenda do dia'}</span>
        <strong>{summary.featured ? `${summary.featured.home} x ${summary.featured.away}` : 'Sem jogo destaque'}</strong>
        <em>{summary.featured?.league_name || 'Futebol'}</em>
      </div>
      <div className="footballBoardMetrics">
        <FootballMetric label="Total" value={summary.total} />
        <FootballMetric label="Ao vivo" value={summary.live} hot />
        <FootballMetric label="Agendados" value={summary.upcoming} />
        <FootballMetric label="Ligas" value={summary.leagues} />
      </div>
    </div>
  );
}

function FootballMetric({ label, value, hot = false }) {
  return (
    <div className={`footballMetric ${hot ? 'hot' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FootballCard({ fixture, onSelect }) {
  const read = buildFootballRead(fixture, {});
  return (
    <button className={`footballCard ${fixture.live ? 'live' : ''} ${read.tier}`} type="button" onClick={() => onSelect(fixture)}>
      <div className="footballMeta">
        <span>{fixture.league_name || fixture.league_key}</span>
        <em>{fixture.status_long || (fixture.live ? 'Ao vivo' : fixture.finished ? 'Encerrado' : 'Agendado')}</em>
      </div>
      <div className="footballCardRead">
        <span>{read.title}</span>
        <strong>{read.score}</strong>
      </div>
      <TeamLine logo={fixture.away_logo} name={fixture.away} score={fixture.away_goals} />
      <TeamLine logo={fixture.home_logo} name={fixture.home} score={fixture.home_goals} />
      <div className="footballFooter">
        <span>{formatDate(fixture.date)}</span>
        <span>{fixture.venue || '-'}</span>
      </div>
    </button>
  );
}

function filterByFootballStatus(fixtures, statusFilter) {
  if (statusFilter === 'live') return fixtures.filter((fixture) => fixture.live);
  if (statusFilter === 'upcoming') return fixtures.filter((fixture) => !fixture.live && !fixture.finished);
  if (statusFilter === 'finished') return fixtures.filter((fixture) => fixture.finished);
  return fixtures;
}

function sortFootballFixtures(fixtures, sortMode) {
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

function buildFootballSummary(fixtures) {
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

function buildFootballHighlights(fixtures) {
  return (Array.isArray(fixtures) ? fixtures : [])
    .map((fixture) => ({ fixture, read: buildFootballRead(fixture, {}) }))
    .sort((a, b) => {
      if (a.fixture.live !== b.fixture.live) return a.fixture.live ? -1 : 1;
      if (a.read.score !== b.read.score) return b.read.score - a.read.score;
      return new Date(a.fixture.date || 0).getTime() - new Date(b.fixture.date || 0).getTime();
    })
    .slice(0, 5);
}

function buildLeagueSummary(fixtures) {
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

function FootballModal({ fixture, onClose }) {
  const [tab, setTab] = useState('stats');
  const [data, setData] = useState({
    stats: null,
    pregame: null,
    odds: null,
    referee: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!fixture) return undefined;
    let alive = true;
    setTab(fixture.live || fixture.finished ? 'stats' : 'pregame');
    setData({ stats: null, pregame: null, odds: null, referee: null, loading: true, error: null });

    const requests = [
      getFootballStats(fixture.id, fixture.league_key).catch((error) => ({ error: error.message })),
      getFootballPregame(fixture.id, fixture.league_key).catch((error) => ({ error: error.message })),
      getFootballBet365Odds(fixture).catch((error) => ({ error: error.message })),
      getFootballReferee(fixture).catch((error) => ({ error: error.message })),
    ];

    Promise.all(requests).then(([stats, pregame, odds, referee]) => {
      if (!alive) return;
      setData({ stats, pregame, odds, referee, loading: false, error: null });
    }).catch((error) => {
      if (alive) setData((current) => ({ ...current, loading: false, error }));
    });

    return () => {
      alive = false;
    };
  }, [fixture]);

  if (!fixture) return null;

  const score = `${fixture.home_goals ?? 0} - ${fixture.away_goals ?? 0}`;
  const tabs = [
    ['stats', 'Stats'],
    ['events', 'Eventos'],
    ['players', 'Jogadores'],
    ['pregame', 'Pre-jogo'],
    ['odds', 'Odds'],
    ['referee', 'Arbitro'],
  ];

  return (
    <div className="ftModalOverlay" role="presentation" onClick={onClose}>
      <article className="ftModal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="ftModalHero">
          <button className="modal-close ftClose" type="button" onClick={onClose}>x</button>
          <div className="footballMeta">
            <span>{fixture.league_name || fixture.league_key}</span>
            <em>{fixture.live ? 'AO VIVO' : fixture.finished ? 'FINAL' : 'PRE-JOGO'}</em>
          </div>
          <div className="ftScoreboard">
            <ModalTeam logo={fixture.home_logo} name={fixture.home} />
            <div className="ftScore">
              <strong>{score}</strong>
              <span>{fixture.status_long || formatDate(fixture.date)}</span>
            </div>
            <ModalTeam logo={fixture.away_logo} name={fixture.away} />
          </div>
        </header>

        <div className="ftModalBody">
          <InfoSection fixture={fixture} />

          <div className="subTabs ftTabs">
            {tabs.map(([key, label]) => (
              <button className={tab === key ? 'active' : ''} key={key} type="button" onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {data.error ? <div className="alertBox">{data.error.message}</div> : null}
          {data.loading ? <div className="loadingGrid">Carregando dados do jogo...</div> : null}

          {!data.loading ? (
            <>
              <FootballReadPanel fixture={fixture} data={data} />
              {tab === 'stats' ? <StatsPanel data={data.stats} home={fixture.home} away={fixture.away} /> : null}
              {tab === 'events' ? <EventsPanel events={data.stats?.events || []} /> : null}
              {tab === 'players' ? <PlayersPanel rosters={data.stats?.rosters || []} /> : null}
              {tab === 'pregame' ? <PregamePanel data={data.pregame} home={fixture.home} away={fixture.away} /> : null}
              {tab === 'odds' ? <OddsPanel draftKings={data.pregame?.odds} bet365={data.odds} fixture={fixture} /> : null}
              {tab === 'referee' ? <RefereePanel data={data.referee} fixture={fixture} /> : null}
            </>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function ModalTeam({ logo, name }) {
  return (
    <div className="ftModalTeam">
      {logo ? <img src={logo} alt="" /> : <span className="teamLogoFallback" />}
      <strong>{name}</strong>
    </div>
  );
}

function InfoSection({ fixture }) {
  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Informacoes</div>
      <InfoRow label="Data" value={formatDate(fixture.date)} />
      <InfoRow label="Estadio" value={fixture.venue || '-'} />
      <InfoRow label="Status" value={fixture.status_long || fixture.status || '-'} />
      {fixture.live ? <InfoRow label="Minuto" value={fixture.elapsed || '-'} /> : null}
    </section>
  );
}

function FootballReadPanel({ fixture, data }) {
  const read = buildFootballRead(fixture, data);
  return (
    <section className={`ftReadPanel ${read.tier}`}>
      <div className="ftReadHead">
        <div>
          <span>Football Read</span>
          <strong>{read.title}</strong>
          <p>{read.summary}</p>
        </div>
        <b>{read.score}</b>
      </div>
      <div className="ftReadSignals">
        {read.signals.map((signal) => (
          <div className="ftReadSignal" key={signal.label}>
            <span>{signal.label}</span>
            <strong>{signal.value}</strong>
            <em>{signal.note}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsPanel({ data, home, away }) {
  const teams = data?.teams || [];
  const homeStats = findTeamStats(teams, home) || teams[0];
  const awayStats = findTeamStats(teams, away) || teams[1];
  const rows = [
    ['possessionPct', 'Posse'],
    ['totalShots', 'Chutes'],
    ['shotsOnTarget', 'No gol'],
    ['wonCorners', 'Escanteios'],
    ['foulsCommitted', 'Faltas'],
    ['yellowCards', 'Amarelos'],
    ['redCards', 'Vermelhos'],
    ['offsides', 'Impedimentos'],
    ['saves', 'Defesas'],
    ['passPct', 'Passes'],
  ];

  if (!homeStats || !awayStats || data?.error) return <EmptyModalState text="Sem estatisticas disponiveis." />;

  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Estatisticas</div>
      <div className="ftStatsHeader"><span>{home}</span><span>{away}</span></div>
      {rows.map(([key, label]) => (
        <StatCompare key={key} label={label} home={homeStats.stats?.[key]} away={awayStats.stats?.[key]} />
      ))}
    </section>
  );
}

function EventsPanel({ events }) {
  if (!events.length) return <EmptyModalState text="Sem eventos importantes retornados." />;
  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Eventos</div>
      <div className="ftEventList">
        {events.map((event, index) => (
          <div className="ftEventItem" key={`${event.clock}-${event.text}-${index}`}>
            <span>{event.clock || '-'}</span>
            <strong>{event.text || event.type}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayersPanel({ rosters }) {
  const [teamIndex, setTeamIndex] = useState(0);
  if (!rosters.length) return <EmptyModalState text="Escalacao/jogadores indisponiveis." />;
  const roster = rosters[teamIndex] || rosters[0];
  const starters = (roster.players || []).filter((player) => player.starter);
  const bench = (roster.players || []).filter((player) => !player.starter);

  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Jogadores</div>
      <div className="subTabs ftTabs">
        {rosters.map((item, index) => (
          <button className={teamIndex === index ? 'active' : ''} key={item.team || index} type="button" onClick={() => setTeamIndex(index)}>
            {item.team || `Time ${index + 1}`}
          </button>
        ))}
      </div>
      {roster.formation ? <div className="ftFormation">Formacao {roster.formation}</div> : null}
      <PlayerGroup title="Titulares" players={starters} />
      <PlayerGroup title="Banco" players={bench} />
    </section>
  );
}

function PregamePanel({ data, home, away }) {
  if (!data || data.error) return <EmptyModalState text="Pre-jogo indisponivel." />;
  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Pre-jogo</div>
      <div className="pregameGrid">
        {(data.teams || []).map((team) => (
          <div className="pregameBox" key={team.team}>
            <strong>{team.team}</strong>
            <span>{team.homeAway === 'home' ? 'Casa' : 'Fora'}</span>
            <em>{team.record || team.points || '-'}</em>
          </div>
        ))}
      </div>
      <StandingsTable rows={data.standings || []} home={home} away={away} />
      <LeadersList leaders={data.leaders || []} />
      <H2HList games={data.h2h || []} />
    </section>
  );
}

function OddsPanel({ draftKings, bet365, fixture }) {
  const hasDraftKings = draftKings && (draftKings.homeML || draftKings.awayML || draftKings.overUnder);
  const hasBet365 = bet365 && !bet365.error && (bet365.homeML || bet365.awayML || bet365.over25 || bet365.bttsYes);
  if (!hasDraftKings && !hasBet365) return <EmptyModalState text="Odds indisponiveis para esse jogo." />;

  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Odds</div>
      {hasDraftKings ? (
        <>
          <div className="oddsProvider">DraftKings</div>
          <OddsGrid home={fixture.home} away={fixture.away} odds={draftKings} />
        </>
      ) : null}
      {hasBet365 ? (
        <>
          <div className="oddsProvider">Bet365</div>
          <OddsGrid home={fixture.home} away={fixture.away} odds={bet365} />
          <div className="oddsExtras">
            {bet365.over25 ? <OddsBox label="Over 2.5" value={formatOdd(bet365.over25)} /> : null}
            {bet365.under25 ? <OddsBox label="Under 2.5" value={formatOdd(bet365.under25)} /> : null}
            {bet365.bttsYes ? <OddsBox label="Ambos marcam" value={formatOdd(bet365.bttsYes)} /> : null}
            {bet365.bttsNo ? <OddsBox label="Nao marcam" value={formatOdd(bet365.bttsNo)} /> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RefereePanel({ data, fixture }) {
  if (!data || data.error) return <EmptyModalState text="Dados do arbitro nao encontrados." />;
  const ref = data.referee_stats || {};
  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Arbitro</div>
      <div className="refereeCard">
        <strong>{data.referee || 'Nao divulgado'}</strong>
        <InfoRow label="Cartoes/jogo" value={ref.avg_cards ?? '-'} />
        <InfoRow label="Amarelos/jogo" value={ref.avg_yellow ?? '-'} />
        <InfoRow label="Vermelhos/jogo" value={ref.avg_red ?? '-'} />
        <InfoRow label="Faltas/jogo" value={ref.avg_fouls ?? '-'} />
      </div>
      <div className="pregameGrid">
        <TeamRefCard name={fixture.home} stats={data.home_stats} />
        <TeamRefCard name={fixture.away} stats={data.away_stats} />
      </div>
    </section>
  );
}

function TeamRefCard({ name, stats }) {
  if (!stats) return null;
  return (
    <div className="pregameBox">
      <strong>{name}</strong>
      <span>{stats.games || '?'} jogos</span>
      <em>{stats.avg_yellow ?? '-'} amarelos/jogo</em>
    </div>
  );
}

function buildFootballRead(fixture, data = {}) {
  const odds = data.odds && !data.odds.error ? data.odds : data.pregame?.odds;
  const stats = data.stats?.teams || [];
  const pregameTeams = data.pregame?.teams || [];
  const referee = data.referee?.referee_stats || {};
  const homeStats = findTeamStats(stats, fixture.home) || stats[0];
  const awayStats = findTeamStats(stats, fixture.away) || stats[1];
  const homePregame = pregameTeams.find((team) => team.team === fixture.home) || pregameTeams[0];
  const awayPregame = pregameTeams.find((team) => team.team === fixture.away) || pregameTeams[1];
  const homeShots = parseStat(homeStats?.stats?.totalShots);
  const awayShots = parseStat(awayStats?.stats?.totalShots);
  const homeTarget = parseStat(homeStats?.stats?.shotsOnTarget);
  const awayTarget = parseStat(awayStats?.stats?.shotsOnTarget);
  const over25 = decimalOdd(odds?.over25 || odds?.overUnder);
  const btts = decimalOdd(odds?.bttsYes);
  const cardAvg = Number.parseFloat(referee.avg_cards);
  const tempo = fixture.live ? 'Ao vivo' : fixture.finished ? 'Final' : 'Pre-jogo';
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
    { label: 'Pressao', value: homeShots + awayShots || '-', note: `${homeTarget + awayTarget || 0} no alvo` },
    { label: 'Over 2.5', value: over25 ? over25.toFixed(2) : '-', note: over25 ? marketNote(over25) : 'sem odd' },
    { label: 'Arbitro', value: Number.isFinite(cardAvg) ? cardAvg.toFixed(1) : '-', note: 'cartoes/jogo' },
  ];

  return {
    score,
    tier,
    title,
    summary: `${fixture.home} x ${fixture.away}: leitura baseada em ritmo do jogo, mercado e contexto pre-jogo disponivel.`,
    signals,
  };
}

function StatCompare({ label, home, away }) {
  const homeNum = parseStat(home);
  const awayNum = parseStat(away);
  if (!home && !away) return null;
  const total = homeNum + awayNum || 1;
  const homePct = Math.max(8, Math.round((homeNum / total) * 100));
  const awayPct = Math.max(8, Math.round((awayNum / total) * 100));
  return (
    <div className="ftStatCompare">
      <span>{home ?? '0'}</span>
      <div>
        <strong>{label}</strong>
        <div className="ftCompareBars">
          <i style={{ width: `${homePct}%` }} />
          <b style={{ width: `${awayPct}%` }} />
        </div>
      </div>
      <span>{away ?? '0'}</span>
    </div>
  );
}

function PlayerGroup({ title, players }) {
  if (!players.length) return null;
  return (
    <>
      <div className="ftGroupTitle">{title}</div>
      <div className="ftPlayersList">
        {players.map((player) => (
          <div className="ftPlayerRow" key={`${player.jersey}-${player.name}`}>
            <span>{player.jersey || '-'}</span>
            <em>{player.position || '?'}</em>
            <strong>{player.short || player.name}</strong>
            <small>{playerMainStat(player)}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function StandingsTable({ rows, home, away }) {
  if (!rows.length) return null;
  return (
    <div className="standingsMini">
      {rows.slice(0, 12).map((row) => (
        <div className={row.team === home || row.team === away ? 'highlight' : ''} key={`${row.rank}-${row.team}`}>
          <span>{row.rank || '-'}</span>
          <strong>{row.team}</strong>
          <em>{row.pts || '-'} pts</em>
        </div>
      ))}
    </div>
  );
}

function LeadersList({ leaders }) {
  if (!leaders.length) return null;
  return (
    <div className="leadersMini">
      {leaders.slice(0, 3).map((group) => (
        <div key={group.category}>
          <strong>{group.category}</strong>
          {(group.leaders || []).slice(0, 3).map((leader) => (
            <span key={`${group.category}-${leader.name}`}>{leader.name} <em>{leader.value}</em></span>
          ))}
        </div>
      ))}
    </div>
  );
}

function H2HList({ games }) {
  if (!games.length) return null;
  return (
    <div className="h2hMini">
      {games.slice(0, 5).map((game) => (
        <div key={`${game.date}-${game.home}-${game.away}`}>
          <span>{formatDate(game.date)}</span>
          <strong>{game.home} {game.homeScore} - {game.awayScore} {game.away}</strong>
        </div>
      ))}
    </div>
  );
}

function OddsGrid({ home, away, odds }) {
  return (
    <div className="oddsGrid">
      <OddsBox label={home} value={formatOdd(odds.homeML)} />
      <OddsBox label="Empate" value={formatOdd(odds.drawOdds)} />
      <OddsBox label={away} value={formatOdd(odds.awayML)} />
    </div>
  );
}

function OddsBox({ label, value }) {
  return (
    <div className="oddsBox">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="ftInfoRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyModalState({ text }) {
  return <div className="emptyState">{text}</div>;
}

function TeamLine({ logo, name, score }) {
  return (
    <div className="teamLine">
      {logo ? <img src={logo} alt="" /> : <span className="teamLogoFallback" />}
      <strong>{name || '-'}</strong>
      <em>{score ?? '-'}</em>
    </div>
  );
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatClock(value) {
  if (!value) return '--:--';
  return value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function findTeamStats(teams, name) {
  return teams.find((team) => team.team === name || name?.includes(team.team) || team.team?.includes(name));
}

function parseStat(value) {
  if (value == null) return 0;
  const parsed = Number.parseFloat(String(value).replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function playerMainStat(player) {
  if (player.position === 'G') return `${player.stats?.saves || 0} def`;
  if (Number(player.stats?.totalGoals || 0) > 0) return `${player.stats.totalGoals} gol`;
  if (Number(player.stats?.goalAssists || 0) > 0) return `${player.stats.goalAssists} ast`;
  return `${player.stats?.totalShots || 0} ch`;
}

function formatOdd(value) {
  if (value == null || value === '') return '-';
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return String(value);
  if (Math.abs(parsed) > 10) return parsed > 0 ? `+${Math.round(parsed)}` : String(Math.round(parsed));
  return parsed.toFixed(2);
}

function decimalOdd(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > 10) {
    return parsed > 0 ? (parsed / 100) + 1 : (100 / Math.abs(parsed)) + 1;
  }
  return parsed > 1 ? parsed : null;
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
