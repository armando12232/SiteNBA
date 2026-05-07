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
import { getTelegramFootballIntel } from '../api/telegramIntel.js';
import {
  buildFootballHighlights,
  buildFootballRead,
  buildFootballSummary,
  buildLeagueSummary,
  findTeamStats,
  filterFootballFixtures,
  footballFilterHasConstraints,
  footballStatusLabel,
  parseFootballStat,
  sortFootballFixtures,
} from '../utils/football.js';

const FX = {
  all: '\uD83C\uDF10',
  calendar: '\uD83D\uDCC5',
  clock: '\uD83D\uDD52',
  done: '\u2705',
  eye: '\uD83D\uDC40',
  field: '\uD83C\uDFDF\uFE0F',
  fire: '\uD83D\uDD25',
  live: '\uD83D\uDD34',
  pin: '\uD83D\uDCCD',
  refresh: '\uD83D\uDD04',
  search: '\uD83D\uDD0E',
  soccer: '\u26BD',
  sort: '\uD83C\uDFF7\uFE0F',
  star: '\u2B50',
  stats: '\uD83D\uDCCA',
  trophy: '\uD83C\uDFC6',
  trend: '\uD83D\uDCC8',
};

const FOOTBALL_MODES = [
  { key: 'fixtures', label: 'Jogos', icon: FX.soccer },
  { key: 'live', label: 'Ao vivo', icon: FX.live },
];

const FOOTBALL_STATUS_FILTERS = [
  { key: 'all', label: 'Todos', icon: FX.all },
  { key: 'live', label: 'Ao vivo', icon: FX.live },
  { key: 'upcoming', label: 'Agendados', icon: FX.clock },
  { key: 'finished', label: 'Encerrados', icon: FX.done },
];

const FOOTBALL_SORTS = [
  { key: 'time', label: 'Horário', icon: FX.clock },
  { key: 'read', label: 'Score', icon: FX.trend },
  { key: 'league', label: 'Liga', icon: FX.sort },
];

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
    const filtered = filterFootballFixtures(state.fixtures, { activeTab, league, query, statusFilter });
    return sortFootballFixtures(filtered, sortMode);
  }, [activeTab, league, query, sortMode, state.fixtures, statusFilter]);

  const summary = useMemo(() => buildFootballSummary(state.fixtures), [state.fixtures]);
  const highlights = useMemo(() => buildFootballHighlights(visibleFixtures), [visibleFixtures]);
  const leagueSummary = useMemo(() => buildLeagueSummary(state.fixtures), [state.fixtures]);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2><span className="titleIcon">{FX.soccer}</span> Futebol</h2>
          <p className="sectionLead visible">Jogos do dia e partidas ao vivo usando a API de futebol atual.</p>
        </div>
        <div className="footballHeaderActions">
          {lastUpdated ? <span className="footballUpdated">{FX.clock} Atualizado {formatClock(lastUpdated)}</span> : null}
          <button
            className={`footballRefresh ${state.refreshing ? 'isRefreshing' : ''}`}
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            {FX.refresh} {state.refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <span className="statusPill">{FX.eye} {visibleFixtures.length} jogos</span>
        </div>
      </div>

      <FootballBoard summary={summary} activeTab={activeTab} />

      <div className="subTabs footballModeTabs">
        {FOOTBALL_MODES.map((item) => (
          <button
            className={activeTab === item.key ? 'active' : ''}
            key={item.key}
            type="button"
            onClick={() => { setActiveTab(item.key); setStatusFilter('all'); }}
          >
            <span className="navIcon">{item.icon}</span>{item.label}
          </button>
        ))}
      </div>

      <div className="filter-row footballLeagueFilters" aria-label="Filtrar por liga">
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
          <span>{FX.search}</span>
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
            ...FOOTBALL_STATUS_FILTERS.map((item) => [item.key, item.icon, item.label]),
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
        <span>Ordenar por</span>
        {[
          ...FOOTBALL_SORTS.map((item) => [item.key, item.label]),
        ].map(([key, label]) => (
          <button
            className={sortMode === key ? 'active' : ''}
            key={key}
            type="button"
            onClick={() => setSortMode(key)}
          >
            <span>{sortIcon(key)}</span>
            {key === 'time' ? 'Horário' : label}
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
            {!visibleFixtures.length ? (
              <FootballEmptyState
                hasFilters={footballFilterHasConstraints({ league, query, statusFilter })}
                onClear={() => {
                  setLeague('all');
                  setQuery('');
                  setStatusFilter('all');
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
      <FootballModal fixture={selectedFixture} onClose={() => setSelectedFixture(null)} />
    </section>
  );
}

function FootballEmptyState({ hasFilters, onClear }) {
  return (
    <div className="emptyState footballEmptyState">
      <strong>{FX.search} Nenhum jogo encontrado</strong>
      <span>{hasFilters ? 'Os filtros atuais não retornaram partidas.' : 'A API não retornou partidas nesse momento.'}</span>
      {hasFilters ? <button type="button" onClick={onClear}>{FX.refresh} Limpar filtros</button> : null}
    </div>
  );
}

function sortIcon(key) {
  return FOOTBALL_SORTS.find((item) => item.key === key)?.icon || FX.clock;
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
          <span>{leagueIcon(item.key)} {item.label}</span>
          <strong>{item.total}</strong>
          <em>{item.live ? `${FX.live} ${item.live} live` : `${FX.clock} ${item.upcoming} prox.`}</em>
        </button>
      ))}
    </div>
  );
}

function leagueIcon(key) {
  return FOOTBALL_LEAGUES.find((item) => item.key === key)?.icon || FX.soccer;
}

function readIcon(tier) {
  if (tier === 'elite' || tier === 'strong') return FX.fire;
  if (tier === 'watch') return FX.eye;
  return FX.stats;
}

function statusIcon(fixture) {
  if (fixture?.live) return FX.live;
  if (fixture?.finished) return FX.done;
  return FX.clock;
}

function FootballHighlights({ items, onSelect }) {
  if (!items.length) return null;
  return (
    <section className="footballHighlights">
      <div className="footballHighlightsHead">
        <span>{FX.star} Destaques</span>
        <strong>{FX.eye} {items.length} jogos para olhar primeiro</strong>
      </div>
      <div className="footballHighlightRail">
        {items.map(({ fixture, read }) => (
          <button
            className={`footballHighlight ${read.tier}`}
            key={`${fixture.league_key}-${fixture.id}`}
            type="button"
            onClick={() => onSelect(fixture)}
          >
            <span>{leagueIcon(fixture.league_key)} {fixture.league_name || fixture.league_key}</span>
            <strong>{fixture.home} x {fixture.away}</strong>
            <em>{readIcon(read.tier)} {read.title} · {read.score}</em>
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
        <span>{activeTab === 'live' ? `${FX.live} Monitor ao vivo` : `${FX.calendar} Agenda do dia`}</span>
        <strong>{summary.featured ? `${summary.featured.home} x ${summary.featured.away}` : 'Sem jogo destaque'}</strong>
        <em>{summary.featured?.league_name || 'Futebol'}</em>
      </div>
      <div className="footballBoardMetrics">
        <FootballMetric icon={FX.soccer} label="Total" value={summary.total} />
        <FootballMetric icon={FX.live} label="Ao vivo" value={summary.live} hot />
        <FootballMetric icon={FX.clock} label="Agendados" value={summary.upcoming} />
        <FootballMetric icon={FX.trophy} label="Ligas" value={summary.leagues} />
      </div>
    </div>
  );
}

function FootballMetric({ icon, label, value, hot = false }) {
  return (
    <div className={`footballMetric ${hot ? 'hot' : ''}`}>
      <span>{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FootballCard({ fixture, onSelect }) {
  const read = buildFootballRead(fixture, {});
  return (
    <button className={`footballCard ${fixture.live ? 'live' : ''} ${read.tier}`} type="button" onClick={() => onSelect(fixture)}>
      <div className="footballMeta">
        <span>{leagueIcon(fixture.league_key)} {fixture.league_name || fixture.league_key}</span>
        <em>{statusIcon(fixture)} {footballStatusLabel(fixture)}</em>
      </div>
      {fixture.live ? <div className="footballLiveStrip"><span>{FX.live} Ao vivo</span><strong>{fixture.elapsed || fixture.status_long || '-'}</strong></div> : null}
      <div className="footballMatchup">
        <TeamLine compact logo={fixture.home_logo} name={fixture.home} score={fixture.home_goals} tag="Casa" />
        <div className="footballScorePill">
          <strong>{fixture.home_goals ?? '-'}</strong>
          <span>x</span>
          <strong>{fixture.away_goals ?? '-'}</strong>
        </div>
        <TeamLine compact logo={fixture.away_logo} name={fixture.away} score={fixture.away_goals} tag="Fora" />
      </div>
      <div className="footballCardRead">
        <span>{readIcon(read.tier)} {read.title}</span>
        <strong>{read.score}</strong>
      </div>
      <div className="footballFooter">
        <span>{FX.calendar} {formatDate(fixture.date)}</span>
        <span>{FX.pin} {fixture.venue || '-'}</span>
      </div>
    </button>
  );
}

function FootballModal({ fixture, onClose }) {
  const [tab, setTab] = useState('stats');
  const [data, setData] = useState({
    stats: null,
    pregame: null,
    odds: null,
    referee: null,
    telegram: null,
    pending: {},
    error: null,
  });

  useEffect(() => {
    if (!fixture) return undefined;
    let alive = true;
    setTab(fixture.live || fixture.finished ? 'stats' : 'pregame');
    setData({
      stats: null,
      pregame: null,
      odds: null,
      referee: null,
      telegram: null,
      pending: { stats: true, pregame: true, odds: true, referee: true, telegram: true },
      error: null,
    });

    const requests = [
      ['stats', getFootballStats(fixture.id, fixture.league_key)],
      ['pregame', getFootballPregame(fixture.id, fixture.league_key)],
      ['odds', getFootballBet365Odds(fixture)],
      ['referee', getFootballReferee(fixture)],
      ['telegram', getTelegramFootballIntel(fixture)],
    ];

    requests.forEach(([key, request]) => {
      request
        .then((value) => {
          if (!alive) return;
          setData((current) => ({
            ...current,
            [key]: value,
            pending: { ...current.pending, [key]: false },
          }));
        })
        .catch((error) => {
          if (!alive) return;
          setData((current) => ({
            ...current,
            [key]: { error: error.message },
            pending: { ...current.pending, [key]: false },
          }));
        });
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
    ['telegram', 'Intel'],
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

          <FootballReadPanel fixture={fixture} data={data} />
          <FootballModalTab
            data={data}
            fixture={fixture}
            home={fixture.home}
            away={fixture.away}
            tab={tab}
          />
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
      <div className="ftModalTitle">Informações</div>
      <InfoRow label="Data" value={formatDate(fixture.date)} />
      <InfoRow label="Estádio" value={fixture.venue || '-'} />
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

function FootballModalTab({ data, fixture, home, away, tab }) {
  if ((tab === 'stats' || tab === 'events' || tab === 'players') && data.pending?.stats) {
    return <div className="loadingGrid">Carregando estatísticas do jogo...</div>;
  }
  if (tab === 'pregame' && data.pending?.pregame) return <div className="loadingGrid">Carregando pré-jogo...</div>;
  if (tab === 'odds' && (data.pending?.odds || data.pending?.pregame)) return <div className="loadingGrid">Carregando odds...</div>;
  if (tab === 'referee' && data.pending?.referee) return <div className="loadingGrid">Carregando árbitro...</div>;
  if (tab === 'telegram' && data.pending?.telegram) return <div className="loadingGrid">Carregando intel...</div>;

  if (tab === 'stats') return <StatsPanel data={data.stats} home={home} away={away} />;
  if (tab === 'events') return <EventsPanel events={data.stats?.events || []} />;
  if (tab === 'players') return <PlayersPanel rosters={data.stats?.rosters || []} />;
  if (tab === 'pregame') return <PregamePanel data={data.pregame} home={home} away={away} />;
  if (tab === 'odds') return <OddsPanel draftKings={data.pregame?.odds} bet365={data.odds} fixture={fixture} />;
  if (tab === 'referee') return <RefereePanel data={data.referee} fixture={fixture} />;
  if (tab === 'telegram') return <TelegramIntelPanel data={data.telegram} />;
  return null;
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

  if (!homeStats || !awayStats || data?.error) return <EmptyModalState text="Sem estatísticas disponíveis." />;

  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Estatísticas</div>
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
  if (!rosters.length) return <EmptyModalState text="Escalação/jogadores indisponíveis." />;
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
      {roster.formation ? <div className="ftFormation">Formação {roster.formation}</div> : null}
      <PlayerGroup title="Titulares" players={starters} />
      <PlayerGroup title="Banco" players={bench} />
    </section>
  );
}

function PregamePanel({ data, home, away }) {
  if (!data || data.error) return <EmptyModalState text="Pré-jogo indisponível." />;
  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Pré-jogo</div>
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
  if (!hasDraftKings && !hasBet365) return <EmptyModalState text="Odds indisponíveis para esse jogo." />;

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
            {bet365.bttsNo ? <OddsBox label="Não marcam" value={formatOdd(bet365.bttsNo)} /> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RefereePanel({ data, fixture }) {
  if (!data || data.error) return <EmptyModalState text="Dados do árbitro não encontrados." />;
  const ref = data.referee_stats || {};
  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Árbitro</div>
      <div className="refereeCard">
        <strong>{data.referee || 'Não divulgado'}</strong>
        <InfoRow label="Cartões/jogo" value={ref.avg_cards ?? '-'} />
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

function TelegramIntelPanel({ data }) {
  const intel = data?.intel;
  if (!intel || data?.error) return <EmptyModalState text="Sem intel do Telegram para esse jogo." />;
  const teams = Array.isArray(intel.teams) ? intel.teams : [];

  return (
    <section className="ftModalSection">
      <div className="ftModalTitle">Telegram Intel</div>
      <div className="refereeCard">
        <strong>{intel.referee || 'Árbitro não informado'}</strong>
        <InfoRow label="Média UCL" value={formatNumber(intel.avg_ucl_cards)} />
        <InfoRow label="Média liga" value={formatNumber(intel.avg_league_cards)} />
        <InfoRow label="Últimos jogos" value={(intel.ref_last || []).join('-') || '-'} />
      </div>
      <div className="pregameGrid">
        {teams.map((team) => (
          <div className="pregameBox" key={team.name}>
            <strong>{team.name}</strong>
            <span>{team.context || 'Disciplina'}</span>
            <em>{(team.cards_last || []).join('-') || '-'}</em>
            {team.alternate_last?.length ? <small>{team.alternate_last.join('-')}</small> : null}
          </div>
        ))}
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

function StatCompare({ label, home, away }) {
  const homeNum = parseFootballStat(home);
  const awayNum = parseFootballStat(away);
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

function TeamLine({ compact = false, logo, name, score, tag }) {
  return (
    <div className={`teamLine ${compact ? 'compact' : ''}`}>
      {logo ? <img src={logo} alt="" /> : <span className="teamLogoFallback" />}
      <div>
        {tag ? <small>{tag}</small> : null}
        <strong>{name || '-'}</strong>
      </div>
      {!compact ? <em>{score ?? '-'}</em> : null}
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

function formatNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '-';
}

