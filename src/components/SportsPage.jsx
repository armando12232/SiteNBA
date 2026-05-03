import { useEffect, useState } from 'react';
import { getSportsScoreboard } from '../api/sports.js';

const META = {
  nfl: { title: 'NFL', subtitle: 'National Football League', color: 'var(--amber)' },
  nhl: { title: 'NHL', subtitle: 'National Hockey League', color: '#4fc3f7' },
  mlb: { title: 'MLB', subtitle: 'Major League Baseball', color: 'var(--red2)' },
};

export function SportsPage({ league }) {
  const meta = META[league] || META.nfl;
  const [state, setState] = useState({ loading: true, error: null, games: [] });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    getSportsScoreboard(league)
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
          <h2><span style={{ color: meta.color }}>{meta.title}</span></h2>
          <p className="sectionLead visible">{meta.subtitle} via ESPN.</p>
        </div>
        <button className="refreshButton" type="button" onClick={() => setRefresh((value) => value + 1)}>Atualizar</button>
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="loadingGrid">Carregando {meta.title}...</div> : null}

      {!state.loading ? (
        <div className="sportsGrid">
          {state.games.map((game) => (
            <SportsCard game={game} color={meta.color} key={game.id} />
          ))}
          {!state.games.length ? <div className="emptyState">Nenhum jogo retornado agora.</div> : null}
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
        <em style={{ color }}>{game.state === 'in' ? 'Ao vivo' : game.detail || 'Agendado'}</em>
      </div>
      <SportsTeam team={game.away} />
      <SportsTeam team={game.home} />
      <div className="footballFooter">
        <span>{formatDate(game.date)}</span>
        <span>{game.venue || '-'}</span>
      </div>
    </article>
  );
}

function SportsTeam({ team }) {
  return (
    <div className="teamLine">
      {team?.logo ? <img src={team.logo} alt="" /> : <span className="teamLogoFallback" />}
      <strong>{team?.abbr || team?.name || '-'}</strong>
      <em>{team?.score ?? '-'}</em>
    </div>
  );
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
