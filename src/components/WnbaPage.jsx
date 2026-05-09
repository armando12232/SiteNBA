import { useEffect, useMemo, useState } from 'react';
import { clearWnbaCache, getWnbaPlayers, getWnbaPregame } from '../api/wnba.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';
import { buildPregameScore } from '../utils/statcastScore.js';
import { userErrorMessage } from '../utils/errors.js';

const PLAYER_LIMIT = 36;
const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assistências',
  fg3m: '3PT',
};

export function WnbaPage({ onSelectPlayer }) {
  const [activeStat, setActiveStat] = useState('pts');
  const [sortBy, setSortBy] = useState('score');
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    loading: true,
    error: null,
    players: [],
    loadedCount: 0,
    totalCount: PLAYER_LIMIT,
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      setState({ loading: true, error: null, players: [], loadedCount: 0, totalCount: PLAYER_LIMIT });
      try {
        const list = await getWnbaPlayers(PLAYER_LIMIT);
        const basePlayers = list.players || [];
        if (!alive) return;
        setState((current) => ({ ...current, players: basePlayers, totalCount: basePlayers.length || PLAYER_LIMIT }));

        await progressivePool(basePlayers, 3, async (player) => {
          const data = await getWnbaPregame(player.player_id || player.id).catch(() => null);
          if (!alive) return;
          setState((current) => {
            const nextPlayers = data && !data.error
              ? upsertPlayer(current.players, { ...player, ...data, league: 'wnba' })
              : current.players;
            const loadedCount = current.loadedCount + 1;
            return {
              ...current,
              players: nextPlayers,
              loadedCount,
              loading: loadedCount < current.totalCount,
            };
          });
        });

        if (alive) setState((current) => ({ ...current, loading: false }));
      } catch (error) {
        if (alive) setState((current) => ({ ...current, loading: false, error }));
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const filteredPlayers = useMemo(() => {
    const cleaned = normalizeSearch(query);
    const rows = cleaned
      ? state.players.filter((player) => normalizeSearch(player.player_name).includes(cleaned))
      : state.players;
    return sortPlayers(rows, activeStat, sortBy);
  }, [activeStat, query, sortBy, state.players]);

  const topEntry = useMemo(() => (
    filteredPlayers.map((player) => scoreEntry(player, activeStat)).filter(Boolean).sort((a, b) => b.score.score - a.score.score)[0] || null
  ), [activeStat, filteredPlayers]);

  return (
    <section>
      <div className="section-header">
        <div className="section-title">Props WNBA</div>
        <div className="section-line" />
        <span className="section-count">
          {state.loading ? `${state.loadedCount}/${state.totalCount}` : `${filteredPlayers.length} jogadoras`}
        </span>
      </div>

      <div className="wnba-hero panel">
        <div>
          <span>WNBA Radar</span>
          <strong>{topEntry?.player?.player_name || 'Jogadoras em destaque'}</strong>
          <em>
            {topEntry
              ? `${statLabels[topEntry.stat]} / Linha ${topEntry.line ?? '-'} / SC ${topEntry.score.score} / ${sampleLabel(topEntry.player)}`
              : 'L5, L10, linha e últimos jogos'}
          </em>
        </div>
        <button
          type="button"
          className="footballRefresh"
          onClick={() => {
            clearWnbaCache();
            setRefreshKey((value) => value + 1);
          }}
        >
          Atualizar
        </button>
      </div>

      <div className="search-bar-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-bar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar jogadora..."
          maxLength={50}
        />
        <button type="button" className={`search-clear ${query ? 'visible' : ''}`} onClick={() => setQuery('')}>
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
          ['score', 'StatCast'],
          ['l5', 'L5'],
          ['hit', 'L10'],
          ['season', 'Temporada'],
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
      </div>

      {state.error ? <div className="alertBox">{userErrorMessage(state.error, 'Não foi possível carregar WNBA agora.')}</div> : null}
      {state.loading && !state.players.length ? <div className="state-box compact">Buscando dados WNBA...</div> : null}

      {!state.error ? (
        filteredPlayers.length ? (
          <div className="props-table-wrap">
            <div className="props-table-game-header">
              <span>WNBA</span>
              <span>{state.loading ? `carregando ${state.loadedCount}/${state.totalCount}` : `${filteredPlayers.length} jogadoras`}</span>
            </div>
            <div className="props-table-header">
              <div>Jogadora</div>
              <div style={{ textAlign: 'center' }}>L5</div>
              <div style={{ textAlign: 'center' }}>L10</div>
              <div className="hide-mobile" style={{ textAlign: 'center' }}>Temp</div>
              <div style={{ textAlign: 'center' }}>SC</div>
              <div style={{ textAlign: 'right' }}>Linha</div>
            </div>
            {filteredPlayers.map((player) => (
              <WnbaRow
                key={player.player_id || player.id || player.player_name}
                activeStat={activeStat}
                onSelectPlayer={onSelectPlayer}
                player={player}
              />
            ))}
          </div>
        ) : (
          <div className="state-box compact">Nenhuma jogadora encontrada para esse filtro.</div>
        )
      ) : null}
    </section>
  );
}

async function progressivePool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function upsertPlayer(players, player) {
  const id = player.player_id || player.id;
  const index = players.findIndex((row) => (row.player_id || row.id) === id);
  if (index === -1) return [...players, player];
  const next = [...players];
  next[index] = player;
  return next;
}

function WnbaRow({ player, activeStat, onSelectPlayer }) {
  const entry = scoreEntry(player, activeStat);
  const prop = entry?.prop || {};
  const line = entry?.line ?? '-';
  const score = entry?.score;
  const stat = entry?.stat || activeStat;
  const projection = prop.projection ?? player.last5_avg?.[stat] ?? player.season_avg?.[stat];

  return (
    <div className="props-table-row" onClick={() => onSelectPlayer?.({ ...player, league: 'wnba' })}>
      <div className="props-player-cell">
        <img src={playerPhotoUrl(player)} alt="" className="player-img-mobile props-player-img" />
        <div className="props-player-meta">
          <div className="props-player-name">{player.player_name}</div>
          <div className="props-player-sub">
            {player.team_abbr || '-'} / {statLabels[stat]} / <span>O {line}</span>
            {prop.edge != null ? <em className={prop.edge >= 0 ? 'edge-up' : 'edge-down'}>{prop.edge >= 0 ? ' up' : ' down'}</em> : null}
          </div>
          <div className="props-player-sample">{sampleLabel(player)}</div>
        </div>
      </div>
      <HitCell value={prop.l5} />
      <HitCell value={prop.l10 ?? prop.hit_rate} />
      <div className="hide-mobile">
        <HitCell value={prop.hit_rate} />
      </div>
      <div className="projection-cell">
        <strong className={`statcast-score ${score?.tier || ''}`}>{score?.score ?? '-'}</strong>
        <small>{projection != null ? `Proj ${Number(projection).toFixed(1)}` : score?.label || '-'}</small>
      </div>
      <div className="line-cell">
        <strong>O {line}</strong>
        <small>{prop.edge != null ? `${prop.edge > 0 ? '+' : ''}${prop.edge} edge` : 'Linha principal'}</small>
      </div>
    </div>
  );
}

function scoreEntry(player, activeStat) {
  if (!player) return null;
  const activeProp = player.props?.[activeStat];
  const best = activeProp?.line != null ? { stat: activeStat, ...activeProp } : getBestProp(player);
  const stat = best?.stat || activeStat || 'pts';
  const line = ensureHalfLine(best?.line ?? player.synthetic_lines?.[stat]);
  const score = buildPregameScore({
    player,
    stat,
    prop: best,
    line,
    games: player.last5_games || [],
  });
  return { player, stat, line, prop: best, score };
}

function sortPlayers(players, stat, sortBy) {
  return [...players].sort((a, b) => {
    const aEntry = scoreEntry(a, stat);
    const bEntry = scoreEntry(b, stat);
    const aProp = aEntry?.prop || {};
    const bProp = bEntry?.prop || {};
    if (sortBy === 'score') return (bEntry?.score?.score || 0) - (aEntry?.score?.score || 0);
    if (sortBy === 'hit') return (bProp.l10 ?? bProp.hit_rate ?? -1) - (aProp.l10 ?? aProp.hit_rate ?? -1);
    if (sortBy === 'season') return (b.season_avg?.[stat] ?? -1) - (a.season_avg?.[stat] ?? -1);
    return (bProp.l5 ?? b.last5_avg?.[stat] ?? -1) - (aProp.l5 ?? a.last5_avg?.[stat] ?? -1);
  });
}

function HitCell({ value }) {
  if (value == null || value === '') return <div className="hit-rate-cell none">-</div>;
  const n = Number(value);
  if (Number.isNaN(n)) return <div className="hit-rate-cell none">-</div>;
  const cls = n >= 70 ? 'high' : n >= 50 ? 'mid' : 'low';
  return <div className={`hit-rate-cell ${cls}`}>{n}%</div>;
}

function playerPhotoUrl(player) {
  return player?.photo_url || (
    player?.player_id
      ? `https://cdn.wnba.com/headshots/wnba/latest/1040x760/${player.player_id}.png`
      : 'imagem_2026-04-14_214614873.png'
  );
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function sampleLabel(player) {
  const seasons = Array.isArray(player?.sample_seasons) ? player.sample_seasons.filter(Boolean) : [];
  if (!seasons.length) return 'Amostra carregando';
  return player?.using_previous_season ? `Amostra ${seasons.join(' + ')}` : `Temporada ${seasons[0]}`;
}
