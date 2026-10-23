import { useEffect, useState } from 'react';
import { getSportsScoreboard } from '../api/sports.js';
import { userErrorMessage } from '../utils/errors.js';
import { SportIcon } from './SportIcon.jsx';

const META = {
  wnba: { title: 'WNBA', icon: 'basketball', subtitle: 'Basquete feminino profissional', color: '#df83a5' },
  nfl: { title: 'NFL', icon: 'americanFootball', subtitle: 'National Football League', color: '#e6b957' },
  nhl: { title: 'NHL', icon: 'hockey', subtitle: 'National Hockey League', color: '#75b9d2' },
  mlb: { title: 'MLB', icon: 'baseball', subtitle: 'Major League Baseball', color: '#e36b70' },
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
    <section className={`panel sportsPage sportsPage-${league}`}>
      <div className="panelHeader">
        <div>
          <h2><span className="titleIcon"><SportIcon name={meta.icon} /></span> <span style={{ color: meta.color }}>{meta.title}</span></h2>
          <p className="sectionLead visible">{meta.subtitle}, com placar, horário e local do jogo.</p>
        </div>
        <div className="footballHeaderActions">
          <button className="footballRefresh" type="button" disabled={state.loading} onClick={() => setRefresh((value) => value + 1)}>{state.loading ? 'Atualizando...' : 'Atualizar'}</button>
          <span className="statusPill">{state.loading ? 'Carregando jogos' : `${state.games.length} jogos`}</span>
        </div>
      </div>

      {state.error ? (
        <div className="alertBox actionAlert">
          <strong>Não foi possível carregar {meta.title} agora.</strong>
          <span>{userErrorMessage(state.error, `Não foi possível carregar ${meta.title} agora.`)}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : null}
      {state.loading ? <div className="loadingGrid" role="status">Carregando {meta.title}...</div> : null}

      {!state.loading && !state.error ? (
        <div className="sportsGrid">
          {state.games.map((game) => (
            <SportsCard game={game} color={meta.color} key={game.id} />
          ))}
          {!state.games.length ? (
            <div className="emptyState richEmptyState">
              <strong>Nenhum jogo disponível</strong>
              <span>Não há partidas de {meta.title} para exibir agora. Tente atualizar mais tarde.</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SportsCard({ game, color }) {
  const status = game.state === 'in' ? 'is-live' : game.state === 'post' ? 'is-finished' : 'is-scheduled';
  const statusLabel = game.state === 'in' ? game.detail || 'Ao vivo' : game.state === 'post' ? 'Encerrado' : 'Agendado';
  return (
    <article className={`sportsCard ${status}`}>
      <div className="sportsMeta">
        <span>{game.league}</span>
        <em className={status} style={{ '--game-accent': color }}>{statusLabel}</em>
      </div>
      <SportsTeam team={game.away} scheduled={game.state === 'pre'} />
      <SportsTeam team={game.home} scheduled={game.state === 'pre'} />
      <div className="footballFooter">
        <span><b>Início</b> {formatDate(game.date)}</span>
        {game.venue ? <span><b>Local</b> {game.venue}</span> : null}
      </div>
    </article>
  );
}

function SportsTeam({ team, scheduled }) {
  return (
    <div className="teamLine">
      {team?.logo ? <img src={team.logo} alt="" loading="lazy" /> : <span className="teamLogoFallback" aria-hidden="true" />}
      <strong>{team?.abbr || team?.name || '-'}</strong>
      <em>{scheduled ? '—' : team?.score ?? '—'}</em>
    </div>
  );
}

function formatDate(value) {
  if (!value) return 'Horário a confirmar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}