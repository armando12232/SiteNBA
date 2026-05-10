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
          <button className="footballRefresh" type="button" onClick={() => setRefresh((value) => value + 1)}>↻ Atualizar</button>
          <span className="statusPill">Jogadores: {state.data?.total ?? 0}</span>
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
              <span key={status}>{translateStatus(status)} <strong>{count}</strong></span>
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
                  <p>{translateInjuryDescription(item.description) || 'Sem detalhes.'}</p>
                </div>
                <em style={{ color: item.status_color || 'var(--text2)' }}>{translateStatus(item.status)}</em>
              </div>
            ))}
            {!injuries.length ? (
              <div className="emptyState richEmptyState">
                <strong>Nenhuma lesão encontrada</strong>
                <span>{team === 'all' ? 'Nenhum jogador lesionado disponível agora.' : `Sem registros para ${team}.`}</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function translateStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  return {
    out: 'Fora',
    'out for season': 'Fora da temporada',
    doubtful: 'Duvidoso',
    questionable: 'Questionável',
    'day-to-day': 'Dia a dia',
    probable: 'Provável',
    available: 'Disponível',
  }[key] || status || '-';
}

function translateInjuryDescription(text) {
  let value = String(text || '').trim();
  if (!value) return '';

  const sourceMatch = value.match(/,\s*([^,]+?)\s+reports\.?$/i);
  const source = cleanReportSource(sourceMatch?.[1]);
  if (source) value = value.replace(/,\s*[^,]+?\s+reports\.?$/i, '');

  value = value
    .replace(/^The Nets announced Friday that\s+/i, 'O Brooklyn Nets anunciou na sexta-feira que ')
    .replace(/^The ([A-Z][A-Za-z\s]+) announced Friday that\s+/i, 'O $1 anunciou na sexta-feira que ')
    .replace(/\bwon't play Sunday in Toronto\b/gi, 'não jogará domingo em Toronto')
    .replace(/\bhas been ruled out for the remainder of the ([0-9-]+) season\b/gi, 'está fora pelo restante da temporada $1')
    .replace(/\bis out for Sunday's game in Toronto\b/gi, 'está fora do jogo de domingo em Toronto')
    .replace(/\bfor Sunday's game in Toronto\b/gi, 'para o jogo de domingo em Toronto')
    .replace(/\bwill be re-evaluated in two weeks\b/gi, 'será reavaliado em duas semanas')
    .replace(/\bwill be re-evaluated\b/gi, 'será reavaliado')
    .replace(/\bis being shut down for the rest of the season\b/gi, 'não jogará mais nesta temporada')
    .replace(/\bwill require season-ending surgery\b/gi, 'precisará de cirurgia e está fora da temporada')
    .replace(/\bhas been diagnosed with\b/gi, 'foi diagnosticado com')
    .replace(/\bunderwent a non-surgical procedure to address\b/gi, 'passou por procedimento não cirúrgico para tratar')
    .replace(/\bthere'?s hope he will make a full recovery\b/gi, 'há expectativa de recuperação completa')
    .replace(/\bin time for NBA Summer League\b/gi, 'a tempo da NBA Summer League')
    .replace(/\bsigned a two-way contract with the\b/gi, 'assinou contrato two-way com o')
    .replace(/\bon Tuesday\b/gi, 'na terça-feira')
    .replace(/\bon Friday\b/gi, 'na sexta-feira')
    .replace(/\bannounced Friday that\b/gi, 'anunciou na sexta-feira que')
    .replace(/\baccording to\b/gi, 'segundo')
    .replace(/\bin his\b/gi, 'no')
    .replace(/\bin her\b/gi, 'na')
    .replace(/\bulnar collateral ligament tear\b/gi, 'ruptura do ligamento colateral ulnar')
    .replace(/\bplantar fasciitis\b/gi, 'fascite plantar')
    .replace(/\bfinger\b/gi, 'dedo')
    .replace(/\bthumb\b/gi, 'polegar')
    .replace(/\bright\b/gi, 'direito')
    .replace(/\bleft\b/gi, 'esquerdo')
    .replace(/\bknee\b/gi, 'joelho')
    .replace(/\bankle\b/gi, 'tornozelo')
    .replace(/\bfoot\b/gi, 'pé')
    .replace(/\bhamstring\b/gi, 'posterior da coxa')
    .replace(/\bcalf\b/gi, 'panturrilha')
    .replace(/\bshoulder\b/gi, 'ombro')
    .replace(/\bback\b/gi, 'costas')
    .replace(/\billness\b/gi, 'doença')
    .replace(/\binjury\b/gi, 'lesão')
    .replace(/\bsoreness\b/gi, 'dores')
    .replace(/\bsprain\b/gi, 'entorse')
    .replace(/\bstrain\b/gi, 'distensão')
    .replace(/\bout for season\b/gi, 'fora da temporada')
    .replace(/\bday-to-day\b/gi, 'dia a dia')
    .replace(/\bquestionable\b/gi, 'questionável')
    .replace(/\bdoubtful\b/gi, 'duvidoso')
    .replace(/\bprobable\b/gi, 'provável')
    .replace(/\bout\b/gi, 'fora');

  value = value
    .replace(/\s+and\s+/gi, ' e ')
    .replace(/\s+with\s+/gi, ' com ')
    .replace(/\s+for\s+/gi, ' para ')
    .replace(/\s+in\s+/gi, ' em ')
    .replace(/\s+/g, ' ')
    .trim();

  return source ? `${value}, segundo ${source}.` : value;
}

function cleanReportSource(source) {
  const value = String(source || '').trim();
  if (!value) return '';
  return value
    .replace(/\s+of\s+the\s+.+$/i, '')
    .replace(/\s+of\s+.+$/i, '')
    .replace(/\s+from\s+.+$/i, '')
    .replace(/\.(com|net|org)$/i, '')
    .trim();
}
