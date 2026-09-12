import { useEffect, useMemo, useRef, useState } from 'react';
import { getBettingProsForDates } from '../api/bettingpros.js';
import { clearPregameCache, getPregame, getSchedule } from '../api/nba.js';
import { PREGAME_PLAYERS } from '../data/pregamePlayers.js';
import { numberOrNull, propForStat } from '../utils/props.js';
import { buildPregameScore } from '../utils/statcastScore.js';
import { userErrorMessage } from '../utils/errors.js';

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
  const [viewMode, setViewMode] = useState(savedPrefs.viewMode || 'list');
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
          if (!alive) return;
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
    writePrefs({ activeStat, sortBy, query, scoreFilter, viewMode });
  }, [activeStat, query, scoreFilter, sortBy, viewMode]);

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
  const previewRows = access?.previewRows > 0 && basePlayers.length > visiblePlayers.length
    ? buildLockedPreviewRows(access.previewRows)
    : [];
  const gameGroups = useMemo(() => buildGameGroups(visiblePlayers, activeStat), [activeStat, visiblePlayers]);
  const propsDayLabel = useMemo(() => formatPropsDay(state.bpDate), [state.bpDate]);

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
          aria-label="Buscar jogador NBA"
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
          aria-label="Limpar busca"
          disabled={!query}
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
            aria-pressed={activeStat === stat}
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
            aria-pressed={sortBy === key}
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

      <div className="view-mode-row">
        <button
          type="button"
          className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          Lista geral
        </button>
        <button
          type="button"
          className={`view-mode-btn premium ${viewMode === 'games' ? 'active' : ''}`}
          onClick={() => setViewMode('games')}
        >
          {bpCount ? 'Melhores Props' : 'Props por confronto'} {bpCount ? <small>{propsDayLabel}</small> : null}<span>Premium</span>
        </button>
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

      {state.error ? <div className="alertBox">{userErrorMessage(state.error, 'Não foi possível carregar props NBA agora.')}</div> : null}
      {state.loading && !state.players.length ? <div className="state-box compact">Buscando dados NBA...</div> : null}
      {!state.error && viewMode === 'games' ? (
        access?.propsByGame ? (
          <PropsByGameView
            activeStat={activeStat}
            dayLabel={propsDayLabel}
            groups={gameGroups}
            hasMarket={bpCount > 0}
            loading={state.loading}
            onSelectPlayer={onSelectPlayer}
          />
        ) : (
          <PremiumGamePropsLock />
        )
      ) : null}

      {!state.error && viewMode === 'list' ? (
        visiblePlayers.length ? (
          <div className="props-table-wrap">
            <div className="props-table-game-header">
              <span>{bpCount ? 'Agenda de props' : 'Histórico recente'}</span>
              <span>{state.loading ? `carregando ${state.loadedCount}/${PREGAME_PLAYERS.length}` : `${visiblePlayers.length} jogadores`} {bpCount ? '/ linhas atuais' : '/ referências históricas'}</span>
            </div>
            <div className="props-table-header">
              <div>Jogador</div>
              <div style={{ textAlign: 'center' }}>H2H</div>
              <div style={{ textAlign: 'center' }}>L5</div>
              <div style={{ textAlign: 'center' }}>L10</div>
              <div className="hide-mobile" style={{ textAlign: 'center' }}>{bpCount ? 'Temp' : 'Amostra'}</div>
              <div style={{ textAlign: 'center' }}>SC</div>
              <div style={{ textAlign: 'right' }}>{bpCount ? 'Linha' : 'Referência'}</div>
            </div>
            {visiblePlayers.map((player) => (
              <PregameRow
                key={player.player_id || `${player.team_abbr || 'bp'}-${player.player_name}`}
                player={player}
                activeStat={activeStat}
                onSelectPlayer={onSelectPlayer}
              />
            ))}
            {previewRows.map((row) => (
              <LockedPreviewRow key={row.id} row={row} />
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
      viewMode: ['list', 'games'].includes(parsed.viewMode) ? parsed.viewMode : 'list',
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
            <span>{statLabels[top?.stat || activeStat]} / {top?.score.marketLine ? 'Linha' : 'Ref.'} {top?.line ?? '-'} / {top?.score.label || '-'}</span>
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
              <em>{statLabels[entry.stat]} {entry.score.marketLine ? 'O' : 'Ref.'} {entry.line ?? '-'}</em>
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
      <PropsDialog className="score-info-modal" label="Como calculamos a leitura" onClose={onClose}>
        <button type="button" aria-label="Fechar explicação" className="pp-modal-close" onClick={onClose}>x</button>
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
      </PropsDialog>
    </div>
  );
}

function PropsDialog({ className, label, onClose, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector('button')?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
      }
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener('keydown', handleKey);
    return () => {
      dialog?.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);
  return <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} className={className} onMouseDown={(event) => event.stopPropagation()}>{children}</section>;
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

function PropsByGameView({ activeStat, dayLabel, groups, hasMarket, loading, onSelectPlayer }) {
  const [selectedGame, setSelectedGame] = useState(null);
  const selectedGroup = groups.find((group) => group.key === selectedGame);

  if (!groups.length) {
    return (
      <div className="state-box compact">
        {loading
          ? 'Montando a leitura por confronto...'
          : hasMarket
            ? 'Nenhum confronto identificado para as props atuais.'
            : 'Nenhuma linha atual por confronto disponível. Use a lista geral para consultar o histórico recente.'}
      </div>
    );
  }

  return (
    <div className="game-props-board">
      <div className="game-props-head">
        <div>
          <span>Premium</span>
          <strong>Melhores Props</strong>
          <small>{dayLabel}</small>
        </div>
        <em>{groups.length} jogos / {groups.reduce((sum, group) => sum + group.players.length, 0)} props</em>
      </div>
      {groups.map((group) => (
        <section className="game-props-card" key={group.key}>
          <button type="button" className="game-props-card-head" onClick={() => setSelectedGame(group.key)}>
            <div>
              <span>{group.date || 'Hoje'}</span>
              <strong>{group.label}</strong>
            </div>
            <div className="game-props-card-metrics">
              <GameMetric label="Props" value={group.players.length} />
              <GameMetric label="Top SC" value={group.topScore ?? '-'} />
              <GameMetric label="Media" value={group.avgScore ?? '-'} />
            </div>
          </button>
          <div className="game-props-list">
            {group.players.slice(0, 6).map((player) => {
              const entry = scoreEntry(player, activeStat);
              const prop = entry?.prop || {};
              return (
                <button
                  type="button"
                  className="game-prop-row"
                  key={`${group.key}-${player.player_id || player.player_name}-${entry?.stat || activeStat}`}
                  onClick={() => onSelectPlayer?.(player)}
                >
                  <img src={playerPhotoUrl(player)} alt="" />
                  <span>
                    <b>{player.player_name}</b>
                    <small>{player.team_abbr || inferTeamFromGames(player.last5_games || []) || '-'} / {statLabels[entry?.stat || activeStat]}</small>
                  </span>
                  <em>O {entry?.line ?? '-'}</em>
                  <strong className={`statcast-score ${entry?.score?.tier || ''}`}>{entry?.score?.score ?? '-'}</strong>
                  <i>{prop.l10 != null ? `${prop.l10}%` : '-'}</i>
                </button>
              );
            })}
          </div>
          {group.players.length > 6 ? (
            <button type="button" className="game-props-more" onClick={() => setSelectedGame(group.key)}>
              Ver {group.players.length} props do jogo
            </button>
          ) : null}
        </section>
      ))}
      {selectedGroup ? (
        <GamePropsModal
          activeStat={activeStat}
          group={selectedGroup}
          onClose={() => setSelectedGame(null)}
          onSelectPlayer={onSelectPlayer}
        />
      ) : null}
    </div>
  );
}

function GameMetric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PremiumGamePropsLock() {
  return (
    <div className="game-props-lock">
      <div className="game-props-lock-icon">P</div>
      <div>
        <span>Recurso Premium</span>
        <strong>Melhores props do dia</strong>
        <p>
          Organiza os jogadores por confronto, mostra top score por jogo e deixa a leitura mais rápida
          antes de escolher uma entrada. Disponível apenas no plano Premium.
        </p>
        <button type="button" className="paywallCta" onClick={openPricingModal}>
          Ver Premium
        </button>
      </div>
    </div>
  );
}

function openPricingModal() {
  window.dispatchEvent(new CustomEvent('statcast:open-pricing'));
}

function GamePropsModal({ activeStat, group, onClose, onSelectPlayer }) {
  const teamCounts = countTeams(group.players);
  const topPlayers = group.players.slice(0, 3);
  const selectPlayer = (player) => {
    onClose();
    onSelectPlayer?.(player);
  };

  return (
    <div className="game-props-modal-overlay" onMouseDown={onClose}>
      <PropsDialog className="game-props-modal" label={`Props de ${group.label}`} onClose={onClose}>
        <button type="button" aria-label="Fechar props do jogo" className="pp-modal-close" onClick={onClose}>x</button>
        <div className="game-props-modal-hero">
          <span>Premium / Melhores Props</span>
          <h3>{group.label}</h3>
          <p>{group.date || 'Hoje'} / {group.players.length} jogadores monitorados</p>
          <div className="game-props-modal-metrics">
            <GameMetric label="Props" value={group.players.length} />
            <GameMetric label="Top SC" value={group.topScore ?? '-'} />
            <GameMetric label="Media" value={group.avgScore ?? '-'} />
            <GameMetric label="Times" value={teamCounts.length || '-'} />
          </div>
        </div>

        <div className="game-props-modal-body">
          <div className="game-props-featured">
            {topPlayers.map((player) => {
              const entry = scoreEntry(player, activeStat);
              return (
                <button
                  type="button"
                  className="game-props-feature-card"
                  key={`featured-${player.player_id || player.player_name}`}
                  onClick={() => selectPlayer(player)}
                >
                  <img src={playerPhotoUrl(player)} alt="" />
                  <span>{player.team_abbr || inferTeamFromGames(player.last5_games || []) || '-'}</span>
                  <strong>{player.player_name}</strong>
                  <em>{statLabels[entry?.stat || activeStat]} / O {entry?.line ?? '-'}</em>
                  <b className={`statcast-score ${entry?.score?.tier || ''}`}>{entry?.score?.score ?? '-'}</b>
                </button>
              );
            })}
          </div>

          <div className="game-props-modal-table">
            <div className="game-props-modal-table-head">
              <span>Jogador</span>
              <span>Linha</span>
              <span>L10</span>
              <span>Edge</span>
              <span>SC</span>
            </div>
            {group.players.map((player) => {
              const entry = scoreEntry(player, activeStat);
              const prop = entry?.prop || {};
              return (
                <button
                  type="button"
                  className="game-props-modal-row"
                  key={`modal-${player.player_id || player.player_name}-${entry?.stat || activeStat}`}
                  onClick={() => selectPlayer(player)}
                >
                  <span>
                    <img src={playerPhotoUrl(player)} alt="" />
                    <b>{player.player_name}</b>
                    <small>{player.team_abbr || inferTeamFromGames(player.last5_games || []) || '-'}</small>
                  </span>
                  <em>O {entry?.line ?? '-'}</em>
                  <em>{prop.l10 != null ? `${prop.l10}%` : '-'}</em>
                  <em className={(prop.edge ?? 0) >= 0 ? 'edge-up' : 'edge-down'}>{prop.edge ?? '-'}</em>
                  <strong className={`statcast-score ${entry?.score?.tier || ''}`}>{entry?.score?.score ?? '-'}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </PropsDialog>
    </div>
  );
}

function LockedPreviewRow({ row }) {
  return (
    <button type="button" aria-label="Conteúdo bloqueado. Ver planos." className="props-table-row locked-preview-row" onClick={openPricingModal}>
      <div className="props-player-cell">
        <div className="locked-preview-avatar" />
        <div className="props-player-meta">
          <div className="props-player-name">Conteúdo do plano</div>
          <div className="props-player-sub">Dados liberados após assinatura</div>
        </div>
      </div>
      <LockedPreviewCell />
      <LockedPreviewCell />
      <LockedPreviewCell />
      <div className="hide-mobile">
        <LockedPreviewCell />
      </div>
      <div className="projection-cell">
        <strong className="statcast-score">-</strong>
        <small>Bloqueado</small>
      </div>
      <div className="line-cell">
        <strong>-</strong>
        <small>Bloqueado</small>
      </div>
    </button>
  );
}

function LockedPreviewCell() {
  return <div className="hit-rate-cell none">-</div>;
}

function PregameRow({ player, activeStat, onSelectPlayer }) {
  const best = propForStat(player, activeStat);
  const stat = activeStat;
  const line = best?.line ?? null;
  const photoUrl = playerPhotoUrl(player);
  const projection = best?.projection ?? player.last5_avg?.[stat] ?? player.season_avg?.[stat];
  const edge = best?.edge;
  const teamAbbr = player.team_abbr || inferTeamFromGames(player.last5_games || []);
  const odds = best?.odds;
  const marketLine = best?.source === 'BettingPros';
  const score = best ? buildPregameScore({
    player,
    stat,
    prop: best,
    line,
    games: player.last5_games || [],
    marketLine,
  }) : null;

  return (
    <div className="props-table-row" role="button" tabIndex={0} aria-label={`Ver ${statLabels[stat]} de ${player.player_name}`} onClick={() => onSelectPlayer?.(player)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelectPlayer?.(player);
      }
    }}>
      <div className="props-player-cell">
        <img src={photoUrl} alt="" className="player-img-mobile props-player-img" />
        <div className="props-player-meta">
          <div className="props-player-name">{player.player_name}</div>
          <div className="props-player-sub">
            {teamAbbr ? `${teamAbbr} / ` : ''}{statLabels[stat]} / <span>{marketLine ? 'O' : 'Ref.'} {line ?? '-'}</span>
            {edge != null ? <em className={edge >= 0 ? 'edge-up' : 'edge-down'}>{marketLine ? (edge >= 0 ? ' up' : ' down') : (edge >= 0 ? ' acima' : ' abaixo')}</em> : null}
          </div>
        </div>
      </div>
      <HitCell value={best?.h2h} />
      <HitCell value={best?.l5} />
      <HitCell value={best?.l10} />
      <div className="hide-mobile">
        <HitCell value={best?.hit_rate} />
      </div>
      <div className="projection-cell">
        <strong className={`statcast-score ${score?.tier || ''}`}>{score?.score ?? '-'}</strong>
        <small>{projection != null ? `Proj ${Number(projection).toFixed(1)}` : score?.label || 'Sem linha disponível'}</small>
      </div>
      <div className="line-cell">
        <strong>{marketLine ? 'O' : 'Ref.'} {line ?? '-'}</strong>
        <small>{marketLine ? (odds ? `${odds} odds` : best?.hit_rate != null ? `${best.hit_rate}% hit` : 'Linha atual') : 'Referência histórica'}</small>
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
    if (sortBy === 'hit') return (bProp.l10 ?? -1) - (aProp.l10 ?? -1);
    if (sortBy === 'h2h') return (bProp.h2h ?? -1) - (aProp.h2h ?? -1);
    if (sortBy === 'season') return (bProp.hit_rate ?? -1) - (aProp.hit_rate ?? -1);
    if (sortBy === 'l5') return (bProp.l5 ?? -1) - (aProp.l5 ?? -1);
    if (sortBy === 'score') return pregameSortScore(b, stat) - pregameSortScore(a, stat);
    return (bProp.edge ?? -999) - (aProp.edge ?? -999);
  });
}

function pregameSortScore(player, stat) {
  const prop = propForStat(player, stat);
  if (!prop) return -1;
  const line = prop.line;
  return buildPregameScore({ player, stat, prop, line, games: player.last5_games || [], marketLine: prop.source === 'BettingPros' }).score;
}

function buildGameGroups(players, activeStat) {
  const map = new Map();
  for (const player of players) {
    const label = normalizeGameLabel(player.gameLabel);
    if (!label) continue;
    const key = `${player.gameDateLabel || 'today'}:${label}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        date: player.gameDateLabel,
        players: [],
      });
    }
    map.get(key).players.push(player);
  }

  return [...map.values()]
    .map((group) => {
      const ranked = group.players
        .map((player) => ({ player, entry: scoreEntry(player, activeStat) }))
        .sort((a, b) => (b.entry?.score?.score || 0) - (a.entry?.score?.score || 0));
      const scores = ranked.map((row) => row.entry?.score?.score).filter((score) => typeof score === 'number');
      return {
        ...group,
        players: ranked.map((row) => row.player),
        topScore: scores[0] ?? null,
        avgScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      };
    })
    .sort((a, b) => (b.topScore || 0) - (a.topScore || 0));
}

function normalizeGameLabel(gameLabel) {
  const label = String(gameLabel || '').trim();
  if (/\b[A-Z]{2,3}\s+x\s+[A-Z]{2,3}\b/.test(label)) return label;
  return null;
}

function buildLockedPreviewRows(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `locked-${index + 1}` }));
}

function playerPhotoUrl(player) {
  return player?.player_id
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`
    : player?.bp_image || 'imagem_2026-04-14_214614873.png';
}

function countTeams(players) {
  const counts = new Map();
  for (const player of players || []) {
    const team = player.team_abbr || inferTeamFromGames(player.last5_games || []);
    if (!team) continue;
    counts.set(team, (counts.get(team) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
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
  const best = propForStat(player, activeStat);
  if (!best) return null;
  const stat = activeStat;
  const line = best.line;
  const score = buildPregameScore({
    player,
    stat,
    prop: best,
    line,
    games: player.last5_games || [],
    marketLine: best.source === 'BettingPros',
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
      hit_rate: prop.season,
      projection: prop.projection,
      edge: numberOrNull(prop.diff) ?? (numberOrNull(prop.projection) != null && numberOrNull(prop.line) != null ? Number(prop.projection) - Number(prop.line) : null),
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
  return dates.length ? dates : [localDateKey()];
}

function formatPropsDay(value) {
  const raw = value || localDateKey();
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 'Hoje';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return isToday ? `Hoje ${day}` : day;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const n = numberOrNull(value);
  if (n == null || n < 0 || n > 100) return <div className="hit-rate-cell none">-</div>;
  const cls = n >= 70 ? 'high' : n >= 50 ? 'mid' : 'low';
  return <div className={`hit-rate-cell ${cls}`}>{n}%</div>;
}

