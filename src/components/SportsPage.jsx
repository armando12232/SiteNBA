import { useEffect, useState } from 'react';
import { getSportsScoreboard } from '../api/sports.js';
import { userErrorMessage } from '../utils/errors.js';

const META = {
  wnba: { title: 'WNBA', icon: '🏀', subtitle: 'Basquete feminino profissional', color: '#ff8fb3' },
  nfl: { title: 'NFL', icon: '🏈', subtitle: 'National Football League', color: 'var(--amber)' },
  nhl: { title: 'NHL', icon: '🏒', subtitle: 'National Hockey League', color: '#4fc3f7' },
  mlb: { title: 'MLB', icon: '⚾', subtitle: 'Major League Baseball', color: 'var(--red2)' },
};

export function SportsPage({ league }) {
  const meta = META[league] || META.nfl;
  const [state, setState] = useState({ loading: true, error: null, games: [] });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    getSportsScoreboard(league, { force: refresh > 0 })
      .then((data) => {
        if (alive) setState({ loading: false, error: null, games: data.games || [] });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, games: [] });
      });
    return () => {
      alive = false;
    };
  }, [league, refresh]);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2><span className="titleIcon">{meta.icon}</span> <span style={{ color: meta.color }}>{meta.title}</span></h2>
          <p className="sectionLead visible">{meta.subtitle}, com placar, horário e local do jogo.</p>
        </div>
        <div className="footballHeaderActions">
          <button className="footballRefresh" type="button" disabled={state.loading} onClick={() => setRefresh((value) => value + 1)}>{state.loading ? 'Atualizando...' : '🔄 Atualizar'}</button>
          <span className="statusPill">📅 {state.loading ? 'Carregando' : `${state.games.length} jogos`}</span>
        </div>
      </div>

      {state.error ? (
        <div className="alertBox actionAlert">
          <strong>Não foi possível carregar {meta.title} agora.</strong>
          <span>{userErrorMessage(state.error, `Não foi possível carregar ${meta.title} agora.`)}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : null}
      {state.loading ? <div className="loadingGrid">Carregando {meta.title}...</div> : null}

      {!state.loading && !state.error ? (
        <div className="sportsGrid">
          {state.games.map((game) => (
            <SportsCard game={game} color={meta.color} key={game.id} />
          ))}
          {!state.games.length ? (
            <div className="emptyState richEmptyState">
              <strong>📭 Nenhum jogo retornado</strong>
              <span>Nenhuma partida de {meta.title} disponível nesse momento.</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SportsCard({ game, color }) {
  return (
    <article className="sportsCard">
      <div className="sportsMeta">
        <span>{game.league}</span>
        <em style={{ color }}>{game.state === 'in' ? `🔴 ${game.detail || 'Ao vivo'}` : game.state === 'post' ? '✅ Encerrado' : '🕒 Agendado'}</em>
      </div>
      <SportsTeam team={game.away} scheduled={game.state === 'pre'} />
      <SportsTeam team={game.home} scheduled={game.state === 'pre'} />
      <div className="footballFooter">
        <span>📅 {formatDate(game.date)}</span>
        <span>📍 {game.venue || '-'}</span>
      </div>
    </article>
  );
}

function SportsTeam({ team, scheduled }) {
  return (
    <div className="teamLine">
      {team?.logo ? <img src={team.logo} alt="" /> : <span className="teamLogoFallback" />}
      <strong>{team?.abbr || team?.name || '-'}</strong>
      <em>{scheduled ? '—' : team?.score ?? '-'}</em>
    </div>
  );
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
