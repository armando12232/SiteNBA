import { useEffect, useState } from 'react';
import { getPregameByName } from '../api/nba.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';

export function PlayerPropsModal({ playerName, onClose }) {
  const [activeStat, setActiveStat] = useState('pts');
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!playerName) return;
    let alive = true;
    setActiveStat('pts');
    setState({ loading: true, error: null, data: null });

    getPregameByName(playerName)
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null });
      });

    return () => {
      alive = false;
    };
  }, [playerName]);

  if (!playerName) return null;

  const data = state.data;
  const activeProp = data?.props?.[activeStat];
  const best = activeProp?.line != null ? { stat: activeStat, ...activeProp } : getBestProp(data);
  const stat = best?.stat || activeStat || 'pts';
  const line = ensureHalfLine(best?.line ?? data?.synthetic_lines?.pts);
  const games = data?.last5_games || [];
  const maxValue = Math.max(...games.map((game) => Number(game[stat] ?? game.pts ?? 0)), Number(line) || 20, 1);
  const photoUrl = data?.player_id
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${data.player_id}.png`
    : '';
  const hitRate = best?.hit_rate;

  return (
    <div className="pp-modal-overlay open" onMouseDown={onClose}>
      <section className="pp-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="pp-modal-hero">
          <button type="button" className="pp-modal-close" onClick={onClose}>x</button>
          <div className="pp-hero-inner">
            {photoUrl ? <img src={photoUrl} alt="" className="pp-player-photo" /> : null}
            <div className="pp-player-meta">
              <div className="pp-player-name">{playerName}</div>
              <div className="pp-player-team">
                {state.loading ? 'Carregando historico...' : `${statLabels[stat]} / Linha ${line ?? '-'}`}
              </div>
              {!state.loading && !state.error ? (
                <div className={`pp-rec-badge ${(best?.edge ?? 0) >= 0 ? 'over' : 'under'}`}>
                  {(best?.edge ?? 0) >= 0 ? 'OVER recomendado' : 'UNDER recomendado'}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="pp-modal-body">
          {state.error ? <div className="alertBox">{state.error.message}</div> : null}

          {!state.loading && !state.error ? (
            <>
              <div className="pp-section-title">Prop</div>
              <div className="pp-prop-tabs">
                {Object.entries(statLabels).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={`pp-prop-tab ${stat === key ? 'active' : ''}`}
                    onClick={() => setActiveStat(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="pp-stats-grid">
                <ModalMetric label="Temp" value={data?.season_avg?.[stat] ?? '-'} />
                <ModalMetric label="L5" value={data?.last5_avg?.[stat] ?? '-'} />
                <ModalMetric label="L10" value={data?.last10_avg?.[stat] ?? '-'} />
                <ModalMetric label="Linha" value={line ?? '-'} />
                <ModalMetric label="Hit" value={hitRate != null ? `${hitRate}%` : '-'} />
                <ModalMetric label="Edge" value={best?.edge ?? data?.edge_points ?? '-'} hot />
              </div>

              <div className="pp-section-title">Ultimos jogos</div>
              <div className="modalGameList">
                {games.length ? games.map((game) => {
                  const value = Number(game[stat] ?? game.pts ?? 0);
                  const pct = Math.max(4, Math.round((value / maxValue) * 100));
                  const hit = line != null ? value >= line : false;
                  return (
                    <div className="gameRow" key={`${game.date}-${game.opp}`}>
                      <span>{formatDate(game.date)}</span>
                      <strong>{game.opp}</strong>
                      <div className="gameBar">
                        <div className={hit ? 'gameBarFill hit' : 'gameBarFill miss'} style={{ width: `${pct}%` }} />
                      </div>
                      <b>{value}</b>
                    </div>
                  );
                }) : <div className="state-box compact">Sem historico real para este jogador.</div>}
              </div>
            </>
          ) : (
            <div className="state-box compact">Carregando...</div>
          )}
        </div>
      </section>
    </div>
  );
}

const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assistencias',
  fg3m: '3PT',
};

function ModalMetric({ label, value, hot = false }) {
  return (
    <div className={`pp-stat-card ${hot ? 'hot' : ''}`}>
      <div className="pp-stat-label">{label}</div>
      <div className="pp-stat-val">{value}</div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
