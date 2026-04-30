import { useEffect, useMemo, useState } from 'react';
import { clearPregameCache, getPregame } from '../api/nba.js';
import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';
import { promisePool } from '../utils/promisePool.js';
import { confidenceFromEdge, ensureHalfLine, getBestProp } from '../utils/props.js';

const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assists',
  fg3m: '3PT',
};

export function PregameRadar({ onSelectPlayer }) {
  const [activeStat, setActiveStat] = useState('pts');
  const [sortBy, setSortBy] = useState('edge');
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

        const players = rows
          .filter(Boolean)
          .sort((a, b) => (b.edge_points ?? -999) - (a.edge_points ?? -999));

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
    <section className="panel radarPanel">
      <div className="brandHeader">
        <div className="brandMark">SC</div>
        <div>
          <strong>StatCast BR</strong>
          <span>NBA Player Props</span>
        </div>
      </div>

      <div className="panelHeader">
        <div>
          <div className="eyebrow">Radar pre-game</div>
          <h2>Player props NBA</h2>
          <p className="sectionLead">Linhas sintéticas, L5/L10, hit rate e edge calculados com dados reais da NBA API.</p>
        </div>
        <span className="statusPill">{state.loading ? 'Carregando' : `${state.players.length} jogadores`}</span>
      </div>

      <div className="radarToolbar">
        <div className="segmented">
          {Object.entries(statLabels).map(([stat, label]) => (
            <button
              type="button"
              key={stat}
              className={activeStat === stat ? 'active' : ''}
              onClick={() => setActiveStat(stat)}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="edge">Ordenar: Edge</option>
          <option value="hit">Ordenar: Hit rate</option>
          <option value="l5">Ordenar: L5</option>
        </select>
      </div>

      <div className="radarSubToolbar">
        <label className="searchBox">
          <span>Buscar jogador</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="LeBron, Luka, Jokic..."
          />
        </label>
        <div className="radarStats">
          <span>Top edge <strong>{topEdge ?? '-'}</strong></span>
          <span>Hit medio <strong>{avgHit != null ? `${avgHit}%` : '-'}</strong></span>
          <button
            type="button"
            className="refreshButton"
            onClick={() => {
              clearPregameCache();
              setRefreshKey((value) => value + 1);
            }}
          >
            Atualizar
          </button>
        </div>
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="loadingGrid">Buscando dados NBA...</div> : null}

      {!state.loading && !state.error ? (
        <div className="pregameGrid">
          {visiblePlayers.map((player) => (
            <PregameCard
              key={player.player_id}
              player={player}
              activeStat={activeStat}
              onSelectPlayer={onSelectPlayer}
            />
          ))}
          {!visiblePlayers.length ? <div className="emptyState">Nenhum jogador encontrado para esse filtro.</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function PregameCard({ player, activeStat, onSelectPlayer }) {
  const activeProp = player.props?.[activeStat];
  const best = activeProp?.line != null ? { stat: activeStat, ...activeProp } : getBestProp(player);
  const stat = best?.stat || activeStat || 'pts';
  const edge = Number(best?.edge ?? 0);
  const confidence = confidenceFromEdge(edge);
  const line = ensureHalfLine(best?.line ?? player.synthetic_lines?.pts);
  const lastGames = (player.last5_games || []).slice(0, 10);
  const maxValue = Math.max(...lastGames.map((game) => Number(game[stat] ?? game.pts ?? 0)), Number(line) || 20, 1);
  const photoUrl = `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`;

  return (
    <article className="pregameCard" onClick={() => onSelectPlayer?.(player.player_name)}>
      <div className={`cardStripe ${confidence.className}`} />
      <div className="cardGlow" />
      <div className="playerTopline">
        <img src={photoUrl} alt="" className="playerPhoto" />
        <div>
          <h3>{player.player_name}</h3>
          <p>{statLabels[stat]} · linha {line ?? '-'}</p>
        </div>
      </div>

      <div className="propSummary">
        <Metric label="Temp" value={player.season_avg?.[stat] ?? '-'} />
        <Metric label="L5" value={player.last5_avg?.[stat] ?? '-'} />
        <Metric label="Hit" value={best?.hit_rate != null ? `${best.hit_rate}%` : '-'} />
        <Metric label="Edge" value={best?.edge != null ? best.edge : '-'} accent />
      </div>

      <div className="barChart" aria-label="Ultimos jogos">
        {lastGames.length ? (
          lastGames.slice().reverse().map((game) => {
            const value = Number(game[stat] ?? game.pts ?? 0);
            const pct = Math.max(6, Math.round((value / maxValue) * 100));
            const hit = line != null ? value >= line : false;
            return (
              <div className="barItem" key={`${game.date}-${game.opp}`}>
                <span>{value}</span>
                <div className="barTrack">
                  <div className={hit ? 'barFill hit' : 'barFill miss'} style={{ height: `${pct}%` }} />
                </div>
              </div>
            );
          })
        ) : (
          <div className="emptyChart">Sem L5 real</div>
        )}
      </div>
    </article>
  );
}

function sortPlayers(players, stat, sortBy) {
  return [...players].sort((a, b) => {
    const aProp = a.props?.[stat] || {};
    const bProp = b.props?.[stat] || {};
    if (sortBy === 'hit') return (bProp.hit_rate ?? -1) - (aProp.hit_rate ?? -1);
    if (sortBy === 'l5') return (b.last5_avg?.[stat] ?? -1) - (a.last5_avg?.[stat] ?? -1);
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

function Metric({ label, value, accent = false }) {
  return (
    <div className="miniMetric">
      <span>{label}</span>
      <strong className={accent ? 'accent' : ''}>{value}</strong>
    </div>
  );
}
