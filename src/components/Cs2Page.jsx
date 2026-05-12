import { useEffect, useMemo, useState } from 'react';
import { getCs2Scoreboard } from '../api/cs2.js';
import { userErrorMessage } from '../utils/errors.js';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'high', label: 'Forte' },
  { key: 'watch', label: 'Observar' },
  { key: 'today', label: 'Hoje' },
];

export function Cs2Page() {
  const [filter, setFilter] = useState('all');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, matches: [] });

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    getCs2Scoreboard()
      .then((data) => {
        if (alive) setState({ loading: false, error: null, matches: data.games || [] });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, matches: [] });
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const matches = useMemo(() => filterMatches(state.matches, filter), [state.matches, filter]);
  const top = useMemo(() => state.matches.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0], [state.matches]);

  return (
    <section className="cs2Page">
      <div className="cs2Hero panel">
        <div>
          <span>CS2 Radar</span>
          <strong>Confrontos e Map Pool</strong>
          <em>Leitura de partidas, odds, forma recente e mercados por mapa.</em>
        </div>
        <div className="cs2HeroStats">
          <Cs2Metric label="Jogos" value={state.matches.length} />
          <Cs2Metric label="Forte" value={state.matches.filter((match) => match.status === 'high').length} hot />
          <Cs2Metric label="Top SC" value={top?.score || '-'} />
        </div>
      </div>

      <div className="cs2Toolbar">
        <nav className="cs2Filters">
          {FILTERS.map((item) => (
            <button
              className={filter === item.key ? 'active' : ''}
              type="button"
              key={item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="footballRefresh" type="button" onClick={() => setRefresh((value) => value + 1)}>
          Atualizar
        </button>
      </div>

      {state.error ? (
        <div className="alertBox actionAlert">
          <strong>Não foi possível carregar CS2 agora.</strong>
          <span>{userErrorMessage(state.error, 'Não foi possível carregar CS2 agora.')}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : null}

      {state.loading ? <div className="state-box compact">Buscando confrontos CS2...</div> : null}

      {!state.loading ? (
        <div className="cs2Grid">
          {matches.map((match) => (
            <Cs2MatchCard match={match} key={match.id} onOpen={() => setSelectedMatch(match)} />
          ))}
          {!matches.length ? (
            <div className="emptyState richEmptyState">
              <strong>Nenhum confronto encontrado</strong>
              <span>Troque o filtro ou atualize para buscar a próxima janela de partidas.</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedMatch ? <Cs2MatchModal match={selectedMatch} onClose={() => setSelectedMatch(null)} /> : null}
    </section>
  );
}

function Cs2MatchCard({ match, onOpen }) {
  return (
    <button type="button" className={`cs2Card ${match.status}`} onClick={onOpen}>
      <div className="cs2CardTop">
        <span>{match.league}</span>
        <em>{match.format} · {formatStart(match.start)}</em>
      </div>
      <div className="cs2Matchup">
        <Cs2Team team={match.teamA} />
        <div className="cs2Vs">
          <strong>{match.score ?? '-'}</strong>
          <span>SC</span>
        </div>
        <Cs2Team team={match.teamB} align="right" />
      </div>
      <div className="cs2Odds">
        <span>{match.teamA?.name || '-'} <b>{formatOdd(match.odds?.a)}</b></span>
        <span>{match.teamB?.name || '-'} <b>{formatOdd(match.odds?.b)}</b></span>
      </div>
      <p>{match.read}</p>
      <div className="cs2PickStrip">
        {(match.picks || []).slice(0, 2).map((pick) => (
          <span key={`${match.id}-${pick.market}`}>{pick.market}: <b>{pick.side}</b></span>
        ))}
      </div>
    </button>
  );
}

function Cs2MatchModal({ match, onClose }) {
  return (
    <div className="cs2ModalOverlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <section className="cs2Modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="pp-modal-close" onClick={onClose}>x</button>
        <div className="cs2ModalHero">
          <span>{match.league} · {match.stage}</span>
          <strong>{match.teamA?.name || '-'} x {match.teamB?.name || '-'}</strong>
          <em>{match.format} · {formatStart(match.start)}</em>
        </div>

        <div className="cs2ModalScore">
          <div>
            <span>Leitura StatCast</span>
            <p>{match.read}</p>
          </div>
          <strong>{match.score ?? '-'}</strong>
        </div>

        <div className="cs2TeamCompare">
          <Cs2TeamPanel team={match.teamA} odds={match.odds?.a} />
          <Cs2TeamPanel team={match.teamB} odds={match.odds?.b} />
        </div>

        <div className="cs2SectionTitle">Fatores do score</div>
        <div className="cs2FactorGrid">
          {(match.factors || []).map((factor) => (
            <div className="cs2Factor" key={factor.label}>
              <span>{factor.label}</span>
              <strong>{factor.value}</strong>
              <i><b style={{ width: `${factor.value}%` }} /></i>
              <em>{factor.note}</em>
            </div>
          ))}
        </div>

        <div className="cs2SectionTitle">Mercados monitorados</div>
        <div className="cs2PickList">
          {(match.picks || []).map((pick) => (
            <div className="cs2PickRow" key={`${match.id}-${pick.market}`}>
              <span>{pick.market}</span>
              <strong>{pick.side}</strong>
              <em>{pick.edge} edge</em>
              <b>{pick.confidence}%</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cs2TeamPanel({ team = {}, odds }) {
  return (
    <div className="cs2TeamPanel">
      <div>
        <span>#{team.rank || '-'}</span>
        <strong>{team.name || '-'}</strong>
        <em>Odd {formatOdd(odds)}</em>
      </div>
      <div className="cs2StatRow">
        <span>Rating <b>{formatStat(team.stats?.rating)}</b></span>
        <span>ADR <b>{formatStat(team.stats?.adr)}</b></span>
        <span>KAST <b>{formatPercent(team.stats?.kast)}</b></span>
      </div>
      <div className="cs2Form">
        {String(team.form || '').split('').map((letter, index) => (
          <i className={letter === 'W' ? 'win' : 'loss'} key={`${team.name}-${index}`}>{letter}</i>
        ))}
      </div>
      <div className="cs2Maps">
        {(team.maps || []).map((map) => <b key={mapKey(map)}>{mapLabel(map)}</b>)}
      </div>
    </div>
  );
}

function Cs2Team({ team = {}, align = 'left' }) {
  return (
    <div className={`cs2Team ${align}`}>
      <span>#{team.rank || '-'}</span>
      <strong>{team.name || '-'}</strong>
      <em>{team.form || '-'}</em>
    </div>
  );
}

function Cs2Metric({ label, value, hot = false }) {
  return (
    <div className={`cs2Metric ${hot ? 'hot' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function filterMatches(matches, filter) {
  if (filter === 'all') return matches;
  if (filter === 'today') return matches.filter((match) => String(match.start || '').toLowerCase().includes('hoje'));
  return matches.filter((match) => match.status === filter);
}

function mapKey(map) {
  return typeof map === 'string' ? map : `${map.name}-${map.winRate || map.win_rate || ''}`;
}

function mapLabel(map) {
  if (typeof map === 'string') return map;
  const winRate = map.winRate ?? map.win_rate;
  return winRate != null ? `${map.name} ${winRate}%` : map.name;
}

function formatStart(value) {
  return String(value || 'Agendado').replace('Amanha', 'Amanhã');
}

function formatOdd(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
}

function formatStat(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(number < 10 ? 2 : 1) : '-';
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : '-';
}
