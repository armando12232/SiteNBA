import { useEffect, useMemo, useState } from 'react';
import { getBettingProsForDates } from '../api/bettingpros.js';
import { clearPregameCache, getPregame, getSchedule } from '../api/nba.js';
import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';
import { buildPregameScore } from '../utils/statcastScore.js';

const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assistências',
  fg3m: 'Cestas de 3',
};

const PREFS_KEY = 'statcast:nba:pregame:prefs:v1';

export function PregameRadar({ access, onSelectPlayer }) {
  const savedPrefs = readPrefs();
  const [activeStat, setActiveStat] = useState(savedPrefs.activeStat || 'pts');
  const [sortBy, setSortBy] = useState(savedPrefs.sortBy || 'l5');
  const [query, setQuery] = useState(savedPrefs.query || '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const [scoreFilter, setScoreFilter] = useState(savedPrefs.scoreFilter || 'all');
  const [state, setState] = useState({
    loading: true,
    error: null,
    players: [],
    loadedCount: 0,
    bpPlayers: [],
    bpDate: null,
    schedule: [],
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      setState({ loading: true, error: null, players: [], loadedCount: 0, bpPlayers: [], bpDate: null, schedule: [] });
      try {
        getSchedule()
          .then(async (scheduleData) => {
            if (!alive) return;
            const games = scheduleData.games || [];
            const dates = scheduleDates(games);
            const bpData = await getBettingProsForDates(dates);
            if (!alive) return;
            setState((current) => ({
              ...current,
              bpPlayers: bpData.players || [],
              bpDate: bpData.date || dates[0] || null,
              schedule: games,
            }));
          })
          .catch(() => {});

        await progressivePool(PREGAME_PLAYERS, 4, async (player) => {
          const data = await getPregame(player.id).catch(() => null);
          if (!alive) return;
          setState((current) => {
            const nextPlayers = data && !data.error
              ? upsertPlayer(current.players, { ...data, player_name: player.name })
              : current.players;
            const loadedCount = current.loadedCount + 1;
            return {
              ...current,
              loading: loadedCount < PREGAME_PLAYERS.length,
              error: null,
              players: nextPlayers,
              loadedCount,
            };
          });
        });

        if (alive) {
          setState((current) => ({ ...current, loading: false }));
        }
      } catch (error) {
        if (alive) setState((current) => ({ ...current, loading: false, error }));
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    writePrefs({ activeStat, sortBy, query, scoreFilter });
  }, [activeStat, query, scoreFilter, sortBy]);

  const basePlayers = useMemo(() => {
    const cleaned = query.trim().toLowerCase();
    const merged = mergeBettingPros(state.players, state.bpPlayers, state.schedule);
    return cleaned
      ? merged.filter((player) => player.player_name?.toLowerCase().includes(cleaned))
      : merged;
  }, [query, state.bpPlayers, state.players, state.schedule]);

  const visiblePlayers = useMemo(() => {
    const filtered = filterByScoreTier(basePlayers, activeStat, scoreFilter);
    const sorted = sortPlayers(filtered, activeStat, sortBy);
    return access?.maxProps > 0 ? sorted.slice(0, access.maxProps) : sorted;
  }, [access?.maxProps, activeStat, basePlayers, scoreFilter, sortBy]);

  useEffect(() => {
    if (!state.loading && scoreFilter !== 'all' && basePlayers.length && !visiblePlayers.length) {
      setScoreFilter('all');
    }
  }, [basePlayers.length, scoreFilter, state.loading, visiblePlayers.length]);

  const scoreBoard = useMemo(() => buildScoreBoard(basePlayers, activeStat), [basePlayers, activeStat]);
  const topEdge = visiblePlayers[0]?.props?.[activeStat]?.edge;
  const avgHit = averageHitRate(visiblePlayers, activeStat);
  const bpCount = state.bpPlayers?.length || 0;

  return (
    <section>
      <div className="section-header">
        <div className="section-title">Props NBA</div>
        <div className="section-line" />
        <span className="section-count">
          {state.loading ? `${state.loadedCount}/${PREGAME_PLAYERS.length}` : `${visiblePlayers.length} jogadores`}
        </span>
      </div>

      <div className="search-bar-wrap">
        <span className="search-icon">⌕</span>
        <input
          className="search-bar"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setScoreFilter('all');
          }}
          placeholder="Buscar jogador..."
          maxLength={50}
        />
        <button
          type="button"
          className={`search-clear ${query ? 'visible' : ''}`}
          onClick={() => {
            setQuery('');
            setScoreFilter('all');
          }}
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
            onClick={() => {
              setActiveStat(stat);
              setScoreFilter('all');
            }}
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
          ['score', 'StatCast'],
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
          BP {bpCount || '-'} {state.bpDate ? `(${state.bpDate})` : ''} / Edge {topEdge ?? '-'} / Hit médio {avgHit != null ? `${avgHit}%` : '-'}
        </div>
      </div>

      <StatCastBoard
        activeStat={activeStat}
        scoreFilter={scoreFilter}
        summary={scoreBoard}
        onExplain={() => setScoreInfoOpen(true)}
        onFilter={setScoreFilter}
        onPick={onSelectPlayer}
        onSort={() => setSortBy('score')}
      />

      {scoreInfoOpen ? <ScoreInfoModal onClose={() => setScoreInfoOpen(false)} /> : null}

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading && !state.players.length ? <div className="state-box compact">Buscando dados NBA...</div> : null}
      {access?.maxProps > 0 && basePlayers.length > access.maxProps ? (
        <div className="planLimitBox">
          Plano atual mostra {access.maxProps} jogadores. Upgrade libera lista completa e recursos avançados.
        </div>
      ) : null}

      {!state.error ? (
        visiblePlayers.length ? (
          <div className="props-table-wrap">
            <div className="props-table-game-header">
              <span>Hoje</span>
              <span>{state.loading ? `carregando ${state.loadedCount}/${PREGAME_PLAYERS.length}` : `${visiblePlayers.length} jogadores`} {bpCount ? '/ linhas reais' : '/ fallback'}</span>
            </div>
            <div className="props-table-header">
              <div>Jogador</div>
              <div style={{ textAlign: 'center' }}>H2H</div>
              <div style={{ textAlign: 'center' }}>L5</div>
              <div style={{ textAlign: 'center' }}>L10</div>
              <div className="hide-mobile" style={{ textAlign: 'center' }}>Temp</div>
              <div style={{ textAlign: 'center' }}>SC</div>
              <div style={{ textAlign: 'right' }}>Linha</div>
            </div>
            {visiblePlayers.map((player) => (
              <PregameRow
                key={player.player_id || `${player.team_abbr || 'bp'}-${player.player_name}`}
                player={player}
                activeStat={activeStat}
                onSelectPlayer={onSelectPlayer}
              />
            ))}
          </div>
        ) : (
          <div className="state-box compact">
            Nenhum jogador encontrado para esse filtro.
            {scoreFilter !== 'all' ? (
              <button type="button" className="inline-reset-filter" onClick={() => setScoreFilter('all')}>
                Voltar para Todos
              </button>
            ) : null}
          </div>
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
  const index = players.findIndex((row) => row.player_id === player.player_id);
  if (index === -1) return [...players, player];
  const next = [...players];
  next[index] = player;
  return next;
}

function readPrefs() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
    return {
      activeStat: ['pts', 'reb', 'ast', 'fg3m'].includes(parsed.activeStat) ? parsed.activeStat : 'pts',
      sortBy: ['l5', 'hit', 'h2h', 'season', 'score'].includes(parsed.sortBy) ? parsed.sortBy : 'l5',
      query: typeof parsed.query === 'string' && parsed.query.length <= 50 ? parsed.query : '',
      scoreFilter: ['all', 'elite', 'strong', 'watch'].includes(parsed.scoreFilter) ? parsed.scoreFilter : 'all',
    };
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage failures; filters still work in memory.
  }
}

function StatCastBoard({ activeStat, scoreFilter, summary, onExplain, onFilter, onPick, onSort }) {
  if (!summary.count) return null;
  const top = summary.top;
  return (
    <div className="statcast-board-wrap">
      <div className="statcast-board">
        <div className="statcast-board-main">
          <div className="statcast-board-label">StatCast Board</div>
          <div className="statcast-board-pick">
            <strong>{top?.player.player_name || '-'}</strong>
            <span>{statLabels[top?.stat || activeStat]} / Linha {top?.line ?? '-'} / {top?.score.side || '-'}</span>
          </div>
        </div>
        <div className="statcast-board-metrics">
          <BoardMetric label="Top SC" value={top?.score.score ?? '-'} tier={top?.score.tier} />
          <BoardMetric label="Elite" value={summary.elite} />
          <BoardMetric label="Fortes" value={summary.strong} />
          <BoardMetric label="Média" value={summary.average} />
        </div>
        <div className="statcast-board-actions">
          <button type="button" onClick={onSort}>Ordenar SC</button>
          <button type="button" onClick={onExplain}>Como calculamos?</button>
        </div>
      </div>

      <div className="statcast-quick-row">
        <div className="statcast-tier-filters">
          {[
            ['all', 'Todos'],
            ['elite', 'Elite 78+'],
            ['strong', 'Fortes 64+'],
            ['watch', 'Watch 50+'],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={scoreFilter === key ? 'active' : ''}
              onClick={() => onFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="statcast-top-picks">
          {summary.entries.slice(0, 5).map((entry) => (
            <button
              type="button"
              key={`${entry.player.player_id || entry.player.player_name}-${entry.stat}`}
              className={`statcast-pick-card ${entry.score.tier}`}
              onClick={() => onPick?.(entry.player)}
            >
              <b>{entry.score.score}</b>
              <span>{entry.player.player_name}</span>
              <em>{statLabels[entry.stat]} O {entry.line ?? '-'}</em>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardMetric({ label, value, tier = '' }) {
  return (
    <div className="statcast-board-metric">
      <span>{label}</span>
      <strong className={tier}>{value}</strong>
    </div>
  );
}

function ScoreInfoModal({ onClose }) {
  return (
    <div className="score-info-overlay" onMouseDown={onClose}>
      <section className="score-info-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="pp-modal-close" onClick={onClose}>x</button>
        <div className="score-info-kicker">StatCast Score</div>
        <h3>Como calculamos a leitura</h3>
        <p>
          O score vai de 1 a 99 e resume a qualidade da prop. Ele não garante resultado;
          ele organiza as melhores leituras usando dados recentes, linha e contexto.
        </p>
        <div className="score-info-grid">
          <InfoFactor weight="28%" title="Forma recente" text="L5 e L10 pesam mais para capturar momento atual." />
          <InfoFactor weight="22%" title="Consistência" text="Hit rate recente e amostra real reduzem picks aleatórios." />
          <InfoFactor weight="22%" title="Edge" text="Diferença entre projeção/média e linha da casa." />
          <InfoFactor weight="18%" title="Projeção" text="Compara a projeção do jogador contra a linha selecionada." />
          <InfoFactor weight="10%" title="Confiança" text="Premia jogadores com amostra maior de jogos recentes." />
        </div>
        <div className="score-info-note">
          Regra prática: 78+ = elite, 64+ = forte, 50+ = monitorar, abaixo disso tem baixa prioridade.
        </div>
      </section>
    </div>
  );
}

function InfoFactor({ weight, title, text }) {
  return (
    <div className="score-info-factor">
      <b>{weight}</b>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function PregameRow({ player, activeStat, onSelectPlayer }) {
  const activeProp = player.props?.[activeStat];
  const best = activeProp?.line != null ? { stat: activeStat, ...activeProp } : getBestProp(player);
  const stat = best?.stat || activeStat || 'pts';
  const line = ensureHalfLine(best?.line ?? player.synthetic_lines?.pts);
  const photoUrl = player.player_id
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`
    : player.bp_image;
  const projection = best?.projection ?? player.last5_avg?.[stat] ?? player.season_avg?.[stat];
  const edge = best?.edge;
  const teamAbbr = player.team_abbr || inferTeamFromGames(player.last5_games || []);
  const odds = best?.odds;
  const source = best?.source;
  const score = buildPregameScore({
    player,
    stat,
    prop: best,
    line,
    games: player.last5_games || [],
  });

  return (
    <div className="props-table-row" onClick={() => onSelectPlayer?.(player)}>
      <div className="props-player-cell">
        <img src={photoUrl} alt="" className="player-img-mobile props-player-img" />
        <div className="props-player-meta">
          <div className="props-player-name">{player.player_name}</div>
          <div className="props-player-sub">
            {teamAbbr ? `${teamAbbr} / ` : ''}{statLabels[stat]} / <span>O {line ?? '-'}</span>
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
        <strong className={`statcast-score ${score.tier}`}>{score.score}</strong>
        <small>{projection != null ? `Proj ${Number(projection).toFixed(1)}` : score.label}</small>
      </div>
      <div className="line-cell">
        <strong>O {line ?? '-'}</strong>
        <small>{odds ? `${odds} odds` : best?.hit_rate != null ? `${best.hit_rate}% hit` : source || '-'}</small>
      </div>
    </div>
  );
}

function inferTeamFromGames(games) {
  const matchup = games?.[0]?.opp || '';
  return String(matchup).split(/\s+/)[0]?.toUpperCase() || '';
}

function sortPlayers(players, stat, sortBy) {
  return [...players].sort((a, b) => {
    const aProp = a.props?.[stat] || {};
    const bProp = b.props?.[stat] || {};
    if (sortBy === 'hit') return (bProp.l10 ?? bProp.hit_rate ?? -1) - (aProp.l10 ?? aProp.hit_rate ?? -1);
    if (sortBy === 'h2h') return (bProp.h2h ?? -1) - (aProp.h2h ?? -1);
    if (sortBy === 'season') return (bProp.hit_rate ?? -1) - (aProp.hit_rate ?? -1);
    if (sortBy === 'l5') return (bProp.l5 ?? b.last5_avg?.[stat] ?? -1) - (aProp.l5 ?? a.last5_avg?.[stat] ?? -1);
    if (sortBy === 'score') return pregameSortScore(b, stat) - pregameSortScore(a, stat);
    return (bProp.edge ?? -999) - (aProp.edge ?? -999);
  });
}

function pregameSortScore(player, stat) {
  const prop = player.props?.[stat] || {};
  const line = ensureHalfLine(prop.line ?? player.synthetic_lines?.pts);
  return buildPregameScore({ player, stat, prop, line, games: player.last5_games || [] }).score;
}

function buildScoreBoard(players, activeStat) {
  const entries = players
    .map((player) => scoreEntry(player, activeStat))
    .filter(Boolean)
    .sort((a, b) => b.score.score - a.score.score);

  if (!entries.length) {
    return { count: 0, top: null, elite: 0, strong: 0, average: '-', entries: [] };
  }

  const total = entries.reduce((sum, entry) => sum + entry.score.score, 0);
  return {
    count: entries.length,
    top: entries[0],
    elite: entries.filter((entry) => entry.score.score >= 78).length,
    strong: entries.filter((entry) => entry.score.score >= 64).length,
    average: Math.round(total / entries.length),
    entries,
  };
}

function filterByScoreTier(players, activeStat, filter) {
  if (filter === 'all') return players;
  return players.filter((player) => {
    const entry = scoreEntry(player, activeStat);
    if (!entry) return false;
    const score = entry.score.score;
    if (filter === 'elite') return score >= 78;
    if (filter === 'strong') return score >= 64;
    if (filter === 'watch') return score >= 50;
    return true;
  });
}

function scoreEntry(player, activeStat) {
  if (!player) return null;
  const activeProp = player.props?.[activeStat];
  const best = activeProp?.line != null ? { stat: activeStat, ...activeProp } : getBestProp(player);
  const stat = best?.stat || activeStat || 'pts';
  const line = ensureHalfLine(best?.line ?? player.synthetic_lines?.pts);
  const score = buildPregameScore({
    player,
    stat,
    prop: best,
    line,
    games: player.last5_games || [],
  });
  return { player, stat, line, score, prop: best };
}

function mergeBettingPros(nbaPlayers, bpPlayers, schedule) {
  const safeNbaPlayers = Array.isArray(nbaPlayers) ? nbaPlayers : [];
  const safeBpPlayers = Array.isArray(bpPlayers) ? bpPlayers : [];
  const safeSchedule = Array.isArray(schedule) ? schedule : [];
  const byName = new Map(safeNbaPlayers.map((player) => [normalizeName(player.player_name), player]));
  const rows = [];

  for (const bp of safeBpPlayers) {
    const key = normalizeName(bp.player_name);
    const nba = byName.get(key);
    const game = findGameForTeam(safeSchedule, bp.team);
    const merged = {
      ...(nba || {}),
      player_name: bp.player_name,
      player_id: nba?.player_id,
      team_abbr: bp.team || nba?.team_abbr,
      position: bp.position || nba?.position,
      bp_image: bp.image,
      gameLabel: game ? `${game.awayTeam?.abbr || 'AWY'} x ${game.homeTeam?.abbr || 'HME'}` : bp.team || '',
      gameDateLabel: game?.gameDateLabel,
      props: mergeProps(nba?.props || {}, bp.props || {}),
      source: 'BettingPros',
    };
    rows.push(merged);
  }

  if (rows.length) {
    return rows;
  }

  return safeNbaPlayers;
}

function mergeProps(nbaProps, bpProps) {
  const result = { ...nbaProps };
  for (const [stat, prop] of Object.entries(bpProps || {})) {
    result[stat] = {
      ...(nbaProps[stat] || {}),
      line: prop.line,
      odds: prop.odds,
      l5: prop.l5,
      l10: prop.l10,
      l15: prop.l15,
      l20: prop.l20,
      h2h: prop.h2h,
      hit_rate: prop.season ?? nbaProps[stat]?.hit_rate,
      projection: prop.projection,
      edge: prop.diff ?? prop.ev ?? nbaProps[stat]?.edge,
      ev: prop.ev,
      rec_side: prop.rec_side,
      streak: prop.streak,
      source: 'BettingPros',
    };
  }
  return result;
}

function scheduleDates(games) {
  const dates = (Array.isArray(games) ? games : []).map((game) => game.gameDateLabel).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return dates.length ? dates : [today];
}

function findGameForTeam(games, teamAbbr) {
  if (!teamAbbr) return null;
  return games.find((game) => (
    game.homeTeam?.abbr === teamAbbr || game.awayTeam?.abbr === teamAbbr
  ));
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
