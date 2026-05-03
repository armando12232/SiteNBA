import { useEffect, useMemo, useState } from 'react';
import { getNbaInjuries } from '../api/injuries.js';

export function InjuriesPage() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [team, setTeam] = useState('all');

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    getNbaInjuries()
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  const teams = useMemo(() => {
    const values = state.data?.by_team?.map((row) => row.team).filter(Boolean) || [];
    return ['all', ...values];
  }, [state.data]);

  const injuries = useMemo(() => {
    const rows = state.data?.injuries || [];
    return team === 'all' ? rows : rows.filter((item) => item.team === team);
  }, [state.data, team]);

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Lesoes NBA</h2>
          <p className="sectionLead visible">Relatorio ESPN com status por jogador e filtro por time.</p>
        </div>
        <span className="statusPill">{state.data?.total ?? 0} jogadores</span>
      </div>

      {state.error ? <div className="alertBox">{state.error.message}</div> : null}
      {state.loading ? <div className="loadingGrid">Carregando lesoes...</div> : null}

      {!state.loading && state.data ? (
        <>
          <div className="injurySummary">
            {Object.entries(state.data.by_status || {}).map(([status, count]) => (
              <span key={status}>{status} <strong>{count}</strong></span>
            ))}
          </div>

          <div className="filter-row">
            {teams.map((value) => (
              <button
                className={`filter-chip ${team === value ? 'active' : ''}`}
                key={value}
                type="button"
                onClick={() => setTeam(value)}
              >
                {value === 'all' ? 'Todos' : value}
              </button>
            ))}
          </div>

          <div className="injuryList">
            {injuries.map((item) => (
              <div className="injuryRow" key={`${item.team}-${item.athlete_name}-${item.status}`}>
                <img src={item.image} alt="" />
                <div>
                  <strong>{item.athlete_name}</strong>
                  <span>{item.team} {item.position ? `- ${item.position}` : ''}</span>
                  <p>{item.description || 'Sem detalhes.'}</p>
                </div>
                <em style={{ color: item.status_color || 'var(--text2)' }}>{item.status}</em>
              </div>
            ))}
            {!injuries.length ? <div className="emptyState">Nenhuma lesao encontrada.</div> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
