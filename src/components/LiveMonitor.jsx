import { useEffect, useMemo, useState } from 'react';
import { getBoxscore, getScoreboard } from '../api/nba.js';
import { promisePool } from '../utils/promisePool.js';
import { buildLiveScore } from '../utils/statcastScore.js';

const ALERT_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'fire', label: 'Duplo/Triplo' },
  { id: 'red', label: '3o quarto' },
  { id: 'orange', label: 'Intervalo' },
  { id: 'yellow', label: '1o quarto' },
  { id: 'risk', label: 'Em risco' },
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
          const box = await getBoxscore(game.gameId).catch(() => ({ players: [] }));
          return { game, players: box.players || [] };
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
            games,
            players,
            updatedAt: new Date(),
          });
          setActiveGameId((current) => current || games[0]?.gameId || null);
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
  const gameModalPlayers = useMemo(() => {
    if (!gameModal) return [];
    return state.players
      .filter((player) => player.gameId === gameModal.gameId)
      .sort((a, b) => liveScore(b) - liveScore(a));
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
            onClick={() => setFilter(item.id)}
          >
            <span className={`liveFilterDot ${item.id}`} />
            {item.label}
          </button>
        ))}
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="loadingGrid">Buscando jogos e boxscores...</div> : null}

      {!state.loading && !state.error ? (
        <>
          <div className="liveSectionTitle">
            <span>Alertas ativos</span>
          </div>

          {state.games.length ? (
            <div className="liveGameStack">
              {alertsByGame.map(({ game, alerts }) => (
                <button
                  type="button"
                  className={`liveGameTile ${activeGroup?.game.gameId === game.gameId ? 'active' : ''}`}
                  key={game.gameId}
                  onClick={() => {
                    setActiveGameId(game.gameId);
                    setGameModal(game);
                  }}
                >
                  <span className="liveGameAccent" />
                  <span className="liveGameTeams">
                    <TeamLogo team={game.awayTeam} />
                    <span className="liveScoreBlock">
                      <strong>{teamScore(game.awayTeam)} · {teamScore(game.homeTeam)}</strong>
                      <em>{game.gameStatusText || `Q${game.period}`}</em>
                    </span>
                    <TeamLogo team={game.homeTeam} />
                  </span>
                  <span className="liveGameAbbrs">
                    <b>{teamAbbr(game.awayTeam)}</b>
                    <b>{teamAbbr(game.homeTeam)}</b>
                  </span>
                  <span className="liveGameFooter">
                    <span className="liveDots">
                      {Array.from({ length: Math.min(alerts.length || 1, 5) }).map((_, index) => (
                        <i key={index} />
                      ))}
                    </span>
                    <small>{alerts.length} alertas</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="emptyState">Nenhum jogo ao vivo agora.</div>
          )}

          {activeGroup ? (
            <div className="liveDrawer">
              <div className="liveDrawerHeader">
                <span>Jogadores com alerta - {teamAbbr(activeGroup.game.awayTeam)} {teamScore(activeGroup.game.awayTeam)} · {teamAbbr(activeGroup.game.homeTeam)} {teamScore(activeGroup.game.homeTeam)}</span>
                <div className="liveMiniDots">
                  <b>{teamAbbr(activeGroup.game.awayTeam)}</b>
                  <i /><i /><i /><i /><i />
                  <b>{teamAbbr(activeGroup.game.homeTeam)}</b>
                  <i /><i /><i /><i /><i />
                </div>
              </div>

              <div className="liveAlertGrid">
                {activeGroup.alerts.map((alert) => (
                  <LiveAlertCard
                    alert={alert}
                    key={`${alert.gameId}-${alert.playerId}`}
                    onOpen={() => setPlayerModal(alert)}
                  />
                ))}
                {!activeGroup.alerts.length ? (
                  <div className="emptyState">Sem jogadores em alerta neste filtro.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {gameModal ? (
            <LiveGameModal
              game={gameModal}
              players={gameModalPlayers}
              alerts={alertsByGame.find((row) => row.game.gameId === gameModal.gameId)?.alerts || []}
              onClose={() => setGameModal(null)}
              onPlayer={(player) => setPlayerModal(buildAlert(player, gameModal) || player)}
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
        <img
          className="liveAlertPhoto"
          src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${alert.playerId}.png`}
          alt=""
          onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
        />
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
  const awayPlayers = players.filter((player) => String(player.teamAbbr || '').toUpperCase() === teamAbbr(away));
  const homePlayers = players.filter((player) => String(player.teamAbbr || '').toUpperCase() === teamAbbr(home));

  return (
    <div className="liveModalOverlay" role="dialog" aria-modal="true">
      <div className="liveModal liveGameModal">
        <div className="liveModalHero">
          <button type="button" className="pp-modal-close" onClick={onClose}>x</button>
          <div className="liveModalTeams">
            <ModalTeam team={away} />
            <div className="liveModalScore">
              <strong>{teamScore(away)} · {teamScore(home)}</strong>
              <span>{game.gameStatusText || `Q${game.period}`}</span>
              <em>{alerts.length} alertas ativos</em>
            </div>
            <ModalTeam team={home} />
          </div>
        </div>

        <div className="liveModalBody">
          <div className="liveModalMetrics">
            <LiveModalMetric label="Periodo" value={`Q${game.period || '-'}`} />
            <LiveModalMetric label="Clock" value={formatClock(game.gameClock) || game.gameStatusText || '-'} />
            <LiveModalMetric label="Diferenca" value={Math.abs(teamScore(away) - teamScore(home))} />
            <LiveModalMetric label="Alertas" value={alerts.length} />
          </div>

          <div className="liveModalColumns">
            <LiveTeamBox title={teamAbbr(away)} players={awayPlayers} onPlayer={onPlayer} />
            <LiveTeamBox title={teamAbbr(home)} players={homePlayers} onPlayer={onPlayer} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveTeamBox({ title, players, onPlayer }) {
  return (
    <section className="liveTeamBox">
      <div className="liveModalSectionTitle">{title} boxscore</div>
      <div className="liveBoxRows">
        {players.slice(0, 10).map((player) => (
          <button type="button" className="liveBoxRow" key={player.playerId} onClick={() => onPlayer(player)}>
            <img src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.playerId}.png`} alt="" />
            <span>
              <strong>{player.name}</strong>
              <em>{player.position || '-'} · {player.mins || 0} min</em>
            </span>
            <b>{player.pts || 0}</b>
            <small>{player.reb || 0}R · {player.ast || 0}A</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function LivePlayerModal({ alert, onClose }) {
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
    <div className="liveModalOverlay" role="dialog" aria-modal="true">
      <div className="liveModal livePlayerModal">
        <div className="liveModalHero player">
          <button type="button" className="pp-modal-close" onClick={onClose}>x</button>
          <div className="livePlayerModalHead">
            <img src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${alert.playerId}.png`} alt="" />
            <div>
              <h3>{alert.name}</h3>
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
              {alert.name} esta com {alert.pts || 0} pontos, {alert.reb || 0} rebotes e {alert.ast || 0} assistencias em {alert.mins || 0} minutos.
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
      <strong>{teamAbbr(team)}</strong>
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
  return <img src={teamLogoUrl(team)} alt={teamAbbr(team)} onError={(event) => { event.currentTarget.style.opacity = '0'; }} />;
}

function teamLogoUrl(team) {
  const id = team?.teamId || team?.id;
  return id ? `https://cdn.nba.com/logos/nba/${id}/primary/L/logo.svg` : '';
}

function teamAbbr(team) {
  return String(team?.teamAbbreviation || team?.abbr || team?.abbreviation || '---').toUpperCase();
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
