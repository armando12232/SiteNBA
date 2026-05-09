import { useEffect, useMemo, useState } from 'react';
import { getNbaInjuries } from '../api/injuries.js';
import { userErrorMessage } from '../utils/errors.js';

export function InjuriesPage() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [team, setTeam] = useState('all');
  const [refresh, setRefresh] = useState(0);

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
  }, [refresh]);

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
          <h2><span className="titleIcon">🩹</span> Lesões NBA</h2>
          <p className="sectionLead visible">Status por jogador, filtro por time e atualização parcial quando alguma lista demora.</p>
        </div>
        <div className="footballHeaderActions">
          <button className="footballRefresh" type="button" onClick={() => setRefresh((value) => value + 1)}>🔄 Atualizar</button>
          <span className="statusPill">👥 {state.data?.total ?? 0} jogadores</span>
        </div>
      </div>

      {state.error ? (
        <div className="alertBox actionAlert">
          <strong>Não foi possível carregar lesões agora.</strong>
          <span>{userErrorMessage(state.error, 'Não foi possível carregar lesões agora.')}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : null}
      {state.loading ? <div className="loadingGrid">Carregando lesões...</div> : null}

      {!state.loading && state.data ? (
        <>
          <div className="injurySummary">
            {Object.entries(state.data.by_status || {}).map(([status, count]) => (
              <span key={status}>{status} <strong>{count}</strong></span>
            ))}
          </div>
          {state.data.partial ? (
            <div className="state-box compact">
              Lista parcial carregada: {state.data.teams_done || 0}/{state.data.teams_total || 30} times responderam antes do limite.
            </div>
          ) : null}

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
            {!injuries.length ? (
              <div className="emptyState richEmptyState">
                <strong>✅ Nenhuma lesão encontrada</strong>
                <span>{team === 'all' ? 'Nenhum jogador lesionado disponível agora.' : `Sem registros para ${team}.`}</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
