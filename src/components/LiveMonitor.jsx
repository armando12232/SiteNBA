import { useEffect, useMemo, useState } from 'react';
import { getBoxscore, getScoreboard } from '../api/nba.js';
import { promisePool } from '../utils/promisePool.js';

export function LiveMonitor() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    games: [],
    players: [],
    updatedAt: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFilter, setTeamFilter] = useState('all');

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
            gameLabel: label,
            period: game.period,
            clock: formatClock(game.gameClock),
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

  const teams = useMemo(() => {
    const values = new Set(state.players.map((player) => player.teamAbbr).filter(Boolean));
    return ['all', ...values];
  }, [state.players]);

  const visiblePlayers = useMemo(() => {
    const rows = teamFilter === 'all'
      ? state.players
      : state.players.filter((player) => player.teamAbbr === teamFilter);
    return rows
      .filter((player) => (player.pts || player.reb || player.ast) && player.mins >= 3)
      .sort((a, b) => liveScore(b) - liveScore(a))
      .slice(0, 18);
  }, [state.players, teamFilter]);

  return (
    <section className="panel livePanel">
      <div className="panelHeader">
        <div>
          <div className="eyebrow">Monitor ao vivo</div>
          <h2>Jogos em andamento</h2>
          <p className="sectionLead">Leitura rápida dos jogadores mais ativos nos jogos ao vivo da NBA.</p>
        </div>
        <span className="statusPill">{state.loading ? 'Atualizando' : `${state.games.length} jogos`}</span>
      </div>

      <div className="radarSubToolbar">
        <div className="radarStats">
          <span>Jogos <strong>{state.games.length}</strong></span>
          <span>Jogadores <strong>{state.players.length}</strong></span>
          <span>Update <strong>{state.updatedAt ? state.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong></span>
        </div>
        <div className="liveControls">
          <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            {teams.map((team) => (
              <option key={team} value={team}>{team === 'all' ? 'Todos os times' : team}</option>
            ))}
          </select>
          <button type="button" className="refreshButton" onClick={() => setRefreshKey((value) => value + 1)}>
            Atualizar
          </button>
        </div>
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="loadingGrid">Buscando scoreboard e boxscores...</div> : null}

      {!state.loading && !state.error ? (
        <>
          <div className="liveGames">
            {state.games.length ? state.games.map((game) => (
              <div className="liveGameCard" key={game.gameId}>
                <strong>{gameLabel(game)}</strong>
                <span>Q{game.period} {formatClock(game.gameClock) || game.gameStatusText}</span>
              </div>
            )) : <div className="emptyState">Nenhum jogo ao vivo agora.</div>}
          </div>

          <div className="liveTable">
            {visiblePlayers.map((player) => (
              <div className="livePlayerRow" key={`${player.gameLabel}-${player.playerId}`}>
                <img src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.playerId}.png`} alt="" />
                <div className="livePlayerMain">
                  <strong>{player.name}</strong>
                  <span>{player.teamAbbr} · {player.position || '-'} · {player.gameLabel}</span>
                </div>
                <LiveStat label="PTS" value={player.pts} />
                <LiveStat label="REB" value={player.reb} />
                <LiveStat label="AST" value={player.ast} />
                <LiveStat label="MIN" value={player.mins} />
              </div>
            ))}
            {!visiblePlayers.length && state.games.length ? (
              <div className="emptyState">Sem jogadores qualificados com minutos suficientes.</div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function LiveStat({ label, value }) {
  return (
    <div className="liveStat">
      <span>{label}</span>
      <strong>{value ?? '-'}</strong>
    </div>
  );
}

function liveScore(player) {
  return (player.pts || 0) + (player.reb || 0) * 1.2 + (player.ast || 0) * 1.4 + (player.stl || 0) * 2;
}

function gameLabel(game) {
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  return `${away.teamAbbreviation || away.abbr || 'AWY'} ${away.score ?? 0} · ${home.teamAbbreviation || home.abbr || 'HME'} ${home.score ?? 0}`;
}

function formatClock(clock) {
  if (!clock) return '';
  const match = String(clock).match(/PT(\d+)M([\d.]+)S/);
  if (!match) return clock;
  const mins = Number.parseInt(match[1], 10);
  const secs = Math.floor(Number.parseFloat(match[2]));
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
