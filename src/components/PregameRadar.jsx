import { useEffect, useMemo, useState } from 'react';
import { clearPregameCache, getPregame } from '../api/nba.js';
import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';
import { promisePool } from '../utils/promisePool.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';

const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assistencias',
  fg3m: 'Cestas de 3',
};

export function PregameRadar({ onSelectPlayer }) {
  const [activeStat, setActiveStat] = useState('pts');
  const [sortBy, setSortBy] = useState('l5');
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    loading: true,
    error: null,
    players: [],
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      setState({ loading: true, error: null, players: [] });
      try {
        const rows = await promisePool(PREGAME_PLAYERS, 3, async (player) => {
          const data = await getPregame(player.id).catch(() => null);
          return data && !data.error ? { ...data, player_name: player.name } : null;
        });

        const players = rows.filter(Boolean);
        if (alive) setState({ loading: false, error: null, players });
      } catch (error) {
        if (alive) setState({ loading: false, error, players: [] });
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const visiblePlayers = useMemo(() => {
    const cleaned = query.trim().toLowerCase();
    const filtered = cleaned
      ? state.players.filter((player) => player.player_name?.toLowerCase().includes(cleaned))
      : state.players;
    return sortPlayers(filtered, activeStat, sortBy);
  }, [activeStat, query, sortBy, state.players]);

  const topEdge = visiblePlayers[0]?.props?.[activeStat]?.edge;
  const avgHit = averageHitRate(visiblePlayers, activeStat);

  return (
    <section>
      <div className="section-header">
        <div className="section-title">Props NBA</div>
        <div className="section-line" />
        <span className="section-count">{state.loading ? 'Carregando' : `${state.players.length} jogadores`}</span>
      </div>

      <div className="search-bar-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-bar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar jogador..."
          maxLength={50}
        />
        <button
          type="button"
          className={`search-clear ${query ? 'visible' : ''}`}
          onClick={() => setQuery('')}
        >
          x
        </button>
      </div>

      <div className="filter-row">
        {Object.entries(statLabels).map(([stat, label]) => (
          <button
            type="button"
            key={stat}
            className={`prop-filter-btn ${activeStat === stat ? 'active' : ''}`}
            onClick={() => setActiveStat(stat)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="period-row">
        <span>Ordenar por:</span>
        {[
          ['l5', 'L5'],
          ['hit', 'L10'],
          ['h2h', 'H2H'],
          ['season', 'Temporada'],
          ['edge', 'PropScore'],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`period-filter-btn ${sortBy === key ? 'active' : ''}`}
            onClick={() => setSortBy(key)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="period-filter-btn refresh-compact"
          onClick={() => {
            clearPregameCache();
            setRefreshKey((value) => value + 1);
          }}
        >
          Atualizar
        </button>
        <div className="table-summary">
          Edge {topEdge ?? '-'} / Hit medio {avgHit != null ? `${avgHit}%` : '-'}
        </div>
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="state-box compact">Buscando dados NBA...</div> : null}

      {!state.loading && !state.error ? (
        visiblePlayers.length ? (
          <div className="props-table-wrap">
            <div className="props-table-game-header">
              <span>Hoje</span>
              <span>{visiblePlayers.length} jogadores</span>
            </div>
            <div className="props-table-header">
              <div>Jogador</div>
              <div style={{ textAlign: 'center' }}>H2H</div>
              <div style={{ textAlign: 'center' }}>L5</div>
              <div style={{ textAlign: 'center' }}>L10</div>
              <div className="hide-mobile" style={{ textAlign: 'center' }}>Temp</div>
              <div style={{ textAlign: 'center' }}>Proj</div>
              <div style={{ textAlign: 'right' }}>Linha</div>
            </div>
            {visiblePlayers.map((player) => (
              <PregameRow
                key={player.player_id}
                player={player}
                activeStat={activeStat}
                onSelectPlayer={onSelectPlayer}
              />
            ))}
          </div>
        ) : (
          <div className="state-box compact">Nenhum jogador encontrado para esse filtro.</div>
        )
      ) : null}
    </section>
  );
}

function PregameRow({ player, activeStat, onSelectPlayer }) {
  const activeProp = player.props?.[activeStat];
  const best = activeProp?.line != null ? { stat: activeStat, ...activeProp } : getBestProp(player);
  const stat = best?.stat || activeStat || 'pts';
  const line = ensureHalfLine(best?.line ?? player.synthetic_lines?.pts);
  const photoUrl = `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`;
  const projection = player.last5_avg?.[stat] ?? player.season_avg?.[stat];
  const edge = best?.edge;

  return (
    <div className="props-table-row" onClick={() => onSelectPlayer?.(player.player_name)}>
      <div className="props-player-cell">
        <img src={photoUrl} alt="" className="player-img-mobile props-player-img" />
        <div className="props-player-meta">
          <div className="props-player-name">{player.player_name}</div>
          <div className="props-player-sub">
            {statLabels[stat]} / <span>O {line ?? '-'}</span>
            {edge != null ? <em className={edge >= 0 ? 'edge-up' : 'edge-down'}>{edge >= 0 ? ' up' : ' down'}</em> : null}
          </div>
        </div>
      </div>
      <HitCell value={best?.h2h} />
      <HitCell value={best?.l5 ?? best?.hit_rate} />
      <HitCell value={best?.l10 ?? best?.hit_rate} />
      <div className="hide-mobile">
        <HitCell value={best?.hit_rate} />
      </div>
      <div className="projection-cell">
        <strong>{projection != null ? Number(projection).toFixed(1) : '-'}</strong>
        {edge != null ? <small className={edge >= 0 ? 'edge-up' : 'edge-down'}>Edge {edge > 0 ? '+' : ''}{edge}</small> : null}
      </div>
      <div className="line-cell">
        <strong>O {line ?? '-'}</strong>
        <small>{best?.hit_rate != null ? `${best.hit_rate}% hit` : '-'}</small>
      </div>
    </div>
  );
}

function sortPlayers(players, stat, sortBy) {
  return [...players].sort((a, b) => {
    const aProp = a.props?.[stat] || {};
    const bProp = b.props?.[stat] || {};
    if (sortBy === 'hit') return (bProp.l10 ?? bProp.hit_rate ?? -1) - (aProp.l10 ?? aProp.hit_rate ?? -1);
    if (sortBy === 'h2h') return (bProp.h2h ?? -1) - (aProp.h2h ?? -1);
    if (sortBy === 'season') return (bProp.hit_rate ?? -1) - (aProp.hit_rate ?? -1);
    if (sortBy === 'l5') return (bProp.l5 ?? b.last5_avg?.[stat] ?? -1) - (aProp.l5 ?? a.last5_avg?.[stat] ?? -1);
    return (bProp.edge ?? -999) - (aProp.edge ?? -999);
  });
}

function averageHitRate(players, stat) {
  const values = players
    .map((player) => player.props?.[stat]?.hit_rate)
    .filter((value) => typeof value === 'number');
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function HitCell({ value }) {
  if (value == null || value === '') return <div className="hit-rate-cell none">-</div>;
  const n = Number(value);
  if (Number.isNaN(n)) return <div className="hit-rate-cell none">-</div>;
  const cls = n >= 70 ? 'high' : n >= 50 ? 'mid' : 'low';
  return <div className={`hit-rate-cell ${cls}`}>{n}%</div>;
}
