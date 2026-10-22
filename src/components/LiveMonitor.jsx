import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getBoxscore, getScoreboard } from '../api/nba.js';
import { promisePool } from '../utils/promisePool.js';
import { buildLiveScore } from '../utils/statcastScore.js';
import { userErrorMessage } from '../utils/errors.js';
import { displayStat, livePlayerKey, playerPhotoUrl, playersForTeam, sortLivePlayers, teamAbbr, teamLogoUrl, teamName } from '../utils/liveNba.js';

const ALERT_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'fire', label: 'Duplo/Triplo' },
  { id: 'red', label: '3o quarto' },
  { id: 'orange', label: 'Intervalo' },
  { id: 'yellow', label: '1o quarto' },
  { id: 'risk', label: 'Em risco' },
];

const BOX_STATS = [
  { key: 'pts', label: 'Pontos', short: 'PTS' },
  { key: 'reb', label: 'Rebotes', short: 'REB' },
  { key: 'ast', label: 'Assistências', short: 'AST' },
];

export function LiveMonitor() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    games: [],
    players: [],
    updatedAt: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter] = useState('all');
  const [activeGameId, setActiveGameId] = useState(null);
  const [gameModal, setGameModal] = useState(null);
  const [playerModal, setPlayerModal] = useState(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const scoreData = await getScoreboard();
        const games = scoreData.games || [];
        const boxscores = await promisePool(games, 2, async (game) => {
          const box = await getBoxscore(game.gameId).catch(() => ({ players: [], unavailable: true }));
          return { game: { ...game, boxscoreUnavailable: Boolean(box.unavailable) }, players: box.players || [] };
        });

        const players = boxscores.flatMap(({ game, players: rows }) => {
          const label = gameLabel(game);
          return rows.map((player) => ({
            ...player,
            gameId: game.gameId,
            gameLabel: label,
            period: Number(game.period || 0),
            clock: formatClock(game.gameClock) || game.gameStatusText || '',
            homeTeam: game.homeTeam || {},
            awayTeam: game.awayTeam || {},
          }));
        });

        if (alive) {
          setState({
            loading: false,
            error: null,
            games: boxscores.map((row) => row.game),
            players,
            updatedAt: new Date(),
          });
          setActiveGameId((current) => games.some((game) => game.gameId === current) ? current : games[0]?.gameId || null);
        }
      } catch (error) {
        if (alive) setState((current) => ({ ...current, loading: false, error }));
      }
    }

    load();
    const timer = setInterval(() => setRefreshKey((value) => value + 1), 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refreshKey]);

  const alertsByGame = useMemo(() => {
    const grouped = new Map();
    for (const game of state.games) {
      grouped.set(game.gameId, { game, alerts: [] });
    }

    for (const player of state.players) {
      const game = grouped.get(player.gameId)?.game;
      if (!game || Number(player.mins || 0) < 3) continue;
      const alert = buildAlert(player, game);
      if (!alert) continue;
      if (filter !== 'all' && alert.type !== filter) continue;
      grouped.get(player.gameId).alerts.push(alert);
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        alerts: row.alerts.sort((a, b) => b.score - a.score).slice(0, 12),
      }))
      .filter((row) => filter === 'all' || row.alerts.length);
  }, [state.games, state.players, filter]);

  const activeGroup = alertsByGame.find((row) => row.game.gameId === activeGameId) || alertsByGame[0];
  const totalAlerts = alertsByGame.reduce((sum, row) => sum + row.alerts.length, 0);
  const selectedGame = state.games.find((game) => game.gameId === gameModal);
  const gameModalPlayers = useMemo(() => {
    if (!gameModal) return [];
    return state.players
      .filter((player) => player.gameId === gameModal)
      .sort((a, b) => Number(b.pts || 0) - Number(a.pts || 0));
  }, [gameModal, state.players]);

  return (
    <section className="panel livePanel">
      <div className="panelHeader">
        <div>
          <div className="eyebrow">Monitor ao vivo</div>
          <h2>Ao vivo NBA</h2>
          <p className="sectionLead">Alertas de jogadores em tempo real, agrupados por partida.</p>
        </div>
        <span className="statusPill">{state.loading ? 'Atualizando' : `${totalAlerts} alertas`}</span>
      </div>

      <div className="radarSubToolbar">
        <div className="radarStats">
          <span>Jogos <strong>{state.games.length}</strong></span>
          <span>Jogadores <strong>{state.players.length}</strong></span>
          <span>Update <strong>{state.updatedAt ? state.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong></span>
        </div>
        <button type="button" className="refreshButton" onClick={() => setRefreshKey((value) => value + 1)}>
          Atualizar
        </button>
      </div>

      <div className="liveFilters" aria-label="Filtros de alertas ao vivo">
        {ALERT_FILTERS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`liveFilterBtn ${filter === item.id ? 'active' : ''}`}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            <span className={`liveFilterDot ${item.id}`} />
            {item.label}
          </button>
        ))}
      </div>

      {state.error ? <div className="alertBox">{userErrorMessage(state.error, 'Não foi possível carregar NBA ao vivo agora.')}</div> : null}
      {state.loading && !state.games.length ? <div className="loadingGrid">Buscando jogos e boxscores...</div> : null}

      {state.games.length || (!state.loading && !state.error) ? (
        <>
          <div className="liveSectionTitle">
            <span>Partidas ao vivo</span>
          </div>

          {state.games.length ? (
            <div className="liveGameStack">
              {alertsByGame.map(({ game, alerts }) => (
                <button
                  type="button"
                  className={`liveGameTile ${activeGroup?.game.gameId === game.gameId ? 'active' : ''}`}
                  key={game.gameId}
                  aria-label={`Abrir ${teamName(game.awayTeam)} ${teamScore(game.awayTeam)} a ${teamScore(game.homeTeam)} ${teamName(game.homeTeam)}`}
                  onClick={() => {
                    setActiveGameId(game.gameId);
                    setGameModal(game.gameId);
                  }}
                >
                  <span className="liveMatchMeta"><span className="liveNowBadge">Ao vivo</span><span>{game.gameStatusText || `Q${game.period}`}</span></span>
                  {[game.awayTeam, game.homeTeam].map((team, index) => (
                    <span className="liveTeamScoreRow" key={index}>
                      <TeamLogo team={team} />
                      <span className="liveTeamIdentity"><strong>{teamName(team)}</strong><small>{index === 0 ? 'Visitante' : 'Mandante'}</small></span>
                      <b>{teamScore(team)}</b>
                    </span>
                  ))}
                  <span className="liveGameFooter">
                    <small>{game.boxscoreUnavailable ? 'Estatísticas indisponíveis' : `${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}`}</small>
                    <span>Ver partida <span aria-hidden="true">↗</span></span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="emptyState">Nenhum jogo ao vivo agora.</div>
          )}
          {state.games.length > 0 && !alertsByGame.length ? <div className="emptyState">Nenhuma partida com alertas neste filtro.</div> : null}

          {activeGroup ? (
            <div className="liveDrawer">
              <div className="liveDrawerHeader">
                <span>Jogadores com alerta - {teamAbbr(activeGroup.game.awayTeam)} {teamScore(activeGroup.game.awayTeam)} · {teamAbbr(activeGroup.game.homeTeam)} {teamScore(activeGroup.game.homeTeam)}</span>
                <span>{activeGroup.alerts.length} alertas neste filtro</span>
              </div>

              <div className="liveAlertGrid">
                {activeGroup.alerts.map((alert) => (
                  <LiveAlertCard
                    alert={alert}
                    key={livePlayerKey(alert)}
                    onOpen={() => setPlayerModal(alert)}
                  />
                ))}
                {!activeGroup.alerts.length ? (
                  <div className="emptyState">Sem jogadores em alerta neste filtro.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedGame ? (
            <LiveGameModal
              key={selectedGame.gameId}
              game={selectedGame}
              players={gameModalPlayers}
              alerts={alertsByGame.find((row) => row.game.gameId === gameModal)?.alerts || []}
              onClose={() => setGameModal(null)}
              onPlayer={(player) => setPlayerModal(buildAlert(player, selectedGame) || player)}
            />
          ) : null}

          {playerModal ? (
            <LivePlayerModal alert={playerModal} onClose={() => setPlayerModal(null)} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function LiveAlertCard({ alert, onOpen }) {
  return (
    <button type="button" className={`liveAlertCard ${alert.type}`} onClick={onOpen}>
      <div className="liveAlertTop">
        <PlayerAvatar player={alert} className="liveAlertPhoto" />
        <div>
          <strong className="liveAlertName">{alert.name}</strong>
          <span>{alert.teamAbbr} · {alert.position || '-'}</span>
          <em className="liveQuarterBadge">Q{alert.period} · {alert.clock || '-'}</em>
        </div>
      </div>

      <div className="liveAlertStats">
        <LiveStat label="PTS" value={alert.pts} hint={alert.hints.pts} hot={alert.hotStats.includes('pts')} />
        <LiveStat label="REB" value={alert.reb} hint={alert.hints.reb} hot={alert.hotStats.includes('reb')} />
        <LiveStat label="AST" value={alert.ast} hint={alert.hints.ast} hot={alert.hotStats.includes('ast')} />
      </div>

      <div className="liveAlertFooter">
        <span className="liveAlertType">{alert.label}</span>
        <span className="liveAlertScore">SC {alert.score} · {alert.statcast?.label || 'ao vivo'}</span>
      </div>
    </button>
  );
}

function LiveGameModal({ game, players, alerts, onClose, onPlayer }) {
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  const awayPlayers = playersForTeam(players, away);
  const homePlayers = playersForTeam(players, home);
  const [tab, setTab] = useState('players');
  const [teamTab, setTeamTab] = useState('away');
  const [sortStat, setSortStat] = useState('pts');
  const titleId = useId();
  const dialogRef = useLiveDialog(onClose);
  const unassigned = players.length - awayPlayers.length - homePlayers.length;

  return (
    <div className="liveModalOverlay" onMouseDown={onClose}>
      <section ref={dialogRef} className="liveModal liveGameModal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="liveModalHero">
          <button type="button" aria-label="Fechar partida" className="pp-modal-close" onClick={onClose}>×</button>
          <div className="liveMatchHeading" id={titleId}><span>NBA · Detalhes da partida</span><span className="liveNowBadge">Ao vivo</span></div>
          <div className="liveModalTeams">
            <ModalTeam team={away} />
            <div className="liveModalScore">
              <strong>{teamScore(away)} <i>–</i> {teamScore(home)}</strong>
              <span>{game.gameStatusText || `Q${game.period}`}</span>
              <time dateTime={game.gameTimeUTC || undefined}>{gameDate(game.gameTimeUTC)}</time>
            </div>
            <ModalTeam team={home} />
          </div>
        </div>
        <div className="liveMatchTabs" role="group" aria-label="Conteúdo da partida">
          <button type="button" aria-pressed={tab === 'players'} onClick={() => setTab('players')}>Jogadores</button>
          <button type="button" aria-pressed={tab === 'alerts'} onClick={() => setTab('alerts')}>Alertas <span>{alerts.length}</span></button>
        </div>
        <div className="liveModalBody">
          {game.boxscoreUnavailable ? <div className="alertBox">Não foi possível atualizar as estatísticas desta partida. Tente atualizar o monitor.</div> : null}
          {tab === 'players' ? <>
            <div className="liveStatsToolbar">
              <span>Ordenar jogadores por</span>
              <div className="liveStatSort" role="group" aria-label="Ordenação do boxscore">
                {BOX_STATS.map(({ key, label }) => <button type="button" key={key} className={`stat-${key}`} aria-pressed={sortStat === key} onClick={() => setSortStat(key)}>{label}<span aria-hidden="true">{sortStat === key ? ' ↓' : ''}</span></button>)}
              </div>
            </div>
            <div className="liveTeamTabs" role="group" aria-label="Time no boxscore">
              <button type="button" aria-pressed={teamTab === 'away'} onClick={() => setTeamTab('away')}><TeamLogo team={away} />{teamAbbr(away)}</button>
              <button type="button" aria-pressed={teamTab === 'home'} onClick={() => setTeamTab('home')}><TeamLogo team={home} />{teamAbbr(home)}</button>
            </div>
            <div className={`liveModalColumns show-${teamTab}`}>
              <LiveTeamBox side="away" team={away} players={awayPlayers} onPlayer={onPlayer} sortStat={sortStat} onSort={setSortStat} />
              <LiveTeamBox side="home" team={home} players={homePlayers} onPlayer={onPlayer} sortStat={sortStat} onSort={setSortStat} />
            </div>
            {unassigned > 0 ? <p className="liveDataNote">{unassigned} jogadores sem identificação de time no provedor não foram incluídos nas tabelas.</p> : null}
            <p className="liveDataNote">PTS pontos · REB rebotes · AST assistências · +/− saldo em quadra. Selecione um jogador para ver os detalhes.</p>
          </> : <div className="liveAlertGrid">
            {alerts.map((alert) => <LiveAlertCard key={livePlayerKey(alert)} alert={alert} onOpen={() => onPlayer(alert)} />)}
            {!alerts.length ? <div className="emptyState">Nenhum alerta para esta partida no filtro atual.</div> : null}
          </div>}
        </div>
      </section>
    </div>
  );
}

function LiveTeamBox({ team, players, onPlayer, side, sortStat, onSort }) {
  const sorted = sortLivePlayers(players, sortStat);
  const sortLabel = BOX_STATS.find(({ key }) => key === sortStat)?.label.toLowerCase();
  return (
    <section className={`liveTeamBox team-${side}`}>
      <div className="liveBoxTeamHeading"><TeamLogo team={team} /><div><h3>{teamName(team)}</h3><span>{players.length} jogadores · ordenados por {sortLabel}</span></div></div>
      <div className="liveBoxTableScroll" tabIndex={0} role="region" aria-label={`Estatísticas de ${teamName(team)}`}>
        <table className="liveBoxTable">
          <caption className="sr-only">Boxscore de {teamName(team)}</caption>
          <thead><tr><th scope="col">Jogador</th>{BOX_STATS.map(({ key, label, short }) => <th key={key} scope="col" className={`liveMainStat stat-${key}`} aria-sort={sortStat === key ? 'descending' : 'none'}><button type="button" aria-label={`Ordenar por ${label.toLowerCase()}`} onClick={() => onSort(key)}>{short}<span aria-hidden="true">{sortStat === key ? ' ↓' : ''}</span></button></th>)}<th scope="col" className="liveSecondaryStat">MIN</th><th scope="col" className="liveSecondaryStat">+/−</th></tr></thead>
          <tbody>{sorted.map((player) => <tr key={livePlayerKey(player)}>
            <th scope="row"><button type="button" className="liveBoxPlayer" onClick={() => onPlayer(player)}>
              <PlayerAvatar player={player} /><span><strong>{player.name}</strong><small>{player.position || '—'}<span className="livePlayerMinutes"> · {displayStat(player.mins)} min</span></small></span>
            </button></th>
            {BOX_STATS.map(({ key }) => <td key={key} className={`liveMainStat stat-${key} ${sortStat === key ? 'sorted' : ''}`}>{displayStat(player[key])}</td>)}<td className="liveSecondaryStat">{displayStat(player.mins)}</td><td className="liveSecondaryStat">{displayStat(player.plusMinus)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!players.length ? <div className="emptyState">Estatísticas deste time ainda indisponíveis.</div> : null}
    </section>
  );
}

function LivePlayerModal({ alert, onClose }) {
  const dialogRef = useLiveDialog(onClose);
  const titleId = useId();
  const impact = liveScore(alert);
  const projectedPts = Number.parseInt(String(alert.hints?.pts || '').replace(/\D/g, ''), 10) || alert.pts || 0;
  const projectedReb = Number.parseInt(String(alert.hints?.reb || '').replace(/\D/g, ''), 10) || alert.reb || 0;
  const projectedAst = Number.parseInt(String(alert.hints?.ast || '').replace(/\D/g, ''), 10) || alert.ast || 0;
  const statcast = alert.statcast || buildLiveScore({
    player: alert,
    projected: { pts: projectedPts, reb: projectedReb, ast: projectedAst },
    hotStats: alert.hotStats || [],
    isRisk: alert.type === 'risk',
    period: alert.period,
  });

  return (
    <div className="liveModalOverlay" onMouseDown={onClose}>
      <div ref={dialogRef} className="liveModal livePlayerModal" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="liveModalHero player">
          <button type="button" aria-label="Fechar jogador" className="pp-modal-close" onClick={onClose}>×</button>
          <div className="livePlayerModalHead">
            <PlayerAvatar player={alert} />
            <div>
              <h3 id={titleId}>{alert.name}</h3>
              <p>{alert.teamAbbr} · {alert.position || '-'} · {alert.gameLabel || 'Ao vivo'}</p>
              <span className={`liveAlertType ${alert.type || ''}`}>{alert.label || 'AO VIVO'}</span>
            </div>
          </div>
        </div>

        <div className="liveModalBody">
          <div className="liveModalMetrics">
            <LiveModalMetric label="PTS" value={alert.pts || 0} />
            <LiveModalMetric label="REB" value={alert.reb || 0} />
            <LiveModalMetric label="AST" value={alert.ast || 0} />
            <LiveModalMetric label="MIN" value={alert.mins || 0} />
          </div>

          <div className="liveModalMetrics">
            <LiveModalMetric label="Proj. PTS" value={projectedPts} />
            <LiveModalMetric label="Proj. REB" value={projectedReb} />
            <LiveModalMetric label="Proj. AST" value={projectedAst} />
            <LiveModalMetric label="SC" value={statcast.score} />
          </div>

          <ScoreDiagnostic score={statcast} />

          <section className="liveModalAnalysis">
            <div className="liveModalSectionTitle">Leitura do alerta</div>
            <p>
              {alert.name} está com {alert.pts || 0} pontos, {alert.reb || 0} rebotes e {alert.ast || 0} assistências em {alert.mins || 0} minutos.
              O impacto bruto e {Math.round(impact)}, com leitura {alert.label || 'ao vivo'}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function ModalTeam({ team }) {
  return (
    <div className="liveModalTeam">
      <TeamLogo team={team} />
      <strong>{teamName(team)}</strong>
      <small>{teamAbbr(team)}</small>
    </div>
  );
}

function LiveModalMetric({ label, value }) {
  return (
    <div className="liveModalMetric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreDiagnostic({ score }) {
  return (
    <section className={`score-diagnostic live ${score.tier}`}>
      <div className="score-diagnostic-head">
        <div>
          <div className="liveModalSectionTitle">StatCast Score</div>
          <p>{score.summary}</p>
        </div>
        <strong>{score.score}</strong>
      </div>
      <div className="score-factor-grid">
        {score.factors.map((factor) => (
          <div className="score-factor" key={factor.id}>
            <div className="score-factor-top">
              <span>{factor.label}</span>
              <b>{factor.value}</b>
            </div>
            <div className="score-factor-bar">
              <i style={{ width: `${factor.value}%` }} />
            </div>
            <em>{factor.note}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveStat({ label, value, hint, hot }) {
  return (
    <div className={`liveStat ${hot ? 'hot' : ''}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
      <em>{hint || '-'}</em>
    </div>
  );
}

function liveScore(player) {
  return (Number(player.pts || 0) * 1.5)
    + (Number(player.reb || 0) * 1.25)
    + (Number(player.ast || 0) * 1.4)
    + (Number(player.stl || 0) * 2)
    + (Number(player.plusMinus || 0) * 0.15);
}

function buildAlert(player, game) {
  const pts = Number(player.pts || 0);
  const reb = Number(player.reb || 0);
  const ast = Number(player.ast || 0);
  const mins = Math.max(Number(player.mins || 0), 1);
  const period = Number(game.period || player.period || 0);
  const lead = Math.abs(teamScore(game.homeTeam) - teamScore(game.awayTeam));
  const playerTeamWinning = isPlayerTeamWinning(player, game);
  const projected = {
    pts: Math.round((pts / mins) * 34),
    reb: Math.round((reb / mins) * 34),
    ast: Math.round((ast / mins) * 34),
  };

  const hotStats = [];
  if (pts >= 14 || projected.pts >= 22) hotStats.push('pts');
  if (reb >= 7 || projected.reb >= 9) hotStats.push('reb');
  if (ast >= 6 || projected.ast >= 8) hotStats.push('ast');
  if (!hotStats.length && pts + reb + ast < 18) return null;

  const isRisk = lead >= 18 && playerTeamWinning && period >= 3;
  let type = 'yellow';
  if (isRisk) type = 'risk';
  else if (hotStats.length >= 2) type = 'fire';
  else if (period >= 3) type = 'red';
  else if (period === 2) type = 'orange';

  const statcast = buildLiveScore({ player, projected, hotStats, isRisk, period });
  const score = statcast.score;

  return {
    ...player,
    pts,
    reb,
    ast,
    period,
    type,
    label: isRisk ? 'EM RISCO' : hotStats.length >= 2 ? 'DUPLO ALERTA' : `Q${period} ALERTA`,
    score,
    statcast,
    hotStats,
    hints: {
      pts: projected.pts ? `→ ${projected.pts}` : '-',
      reb: projected.reb ? `→ ${projected.reb}` : '-',
      ast: projected.ast ? `→ ${projected.ast}` : '-',
    },
  };
}

function isPlayerTeamWinning(player, game) {
  const homeScore = teamScore(game.homeTeam);
  const awayScore = teamScore(game.awayTeam);
  const playerTeam = String(player.teamAbbr || '').toUpperCase();
  if (playerTeam === teamAbbr(game.homeTeam)) return homeScore > awayScore;
  if (playerTeam === teamAbbr(game.awayTeam)) return awayScore > homeScore;
  return false;
}

function TeamLogo({ team }) {
  const url = teamLogoUrl(team);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <span className="liveTeamLogo" aria-hidden="true">{url && !failed
    ? <img src={url} alt="" onError={() => setFailed(true)} />
    : <span>{teamAbbr(team)}</span>}</span>;
}

function PlayerAvatar({ player, className = '' }) {
  const url = playerPhotoUrl(player);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const initials = String(player.name || '?').split(/\s+/).map((word) => word[0]).slice(0, 2).join('');
  return <span className={`livePlayerAvatar ${className}`} aria-hidden="true">{url && !failed
    ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span>{initials}</span>}</span>;
}

function useLiveDialog(onClose) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector('button')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter((element) => element.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', onKey);
    return () => {
      dialog?.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return dialogRef;
}

function gameDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Horário indisponível';
}

function teamScore(team) {
  return Number(team?.score ?? team?.points ?? 0);
}

function gameLabel(game) {
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  return `${teamAbbr(away)} ${teamScore(away)} · ${teamAbbr(home)} ${teamScore(home)}`;
}

function formatClock(clock) {
  if (!clock) return '';
  const match = String(clock).match(/PT(\d+)M([\d.]+)S/);
  if (!match) return clock;
  const mins = Number.parseInt(match[1], 10);
  const secs = Math.floor(Number.parseFloat(match[2]));
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
