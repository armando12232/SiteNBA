import { useEffect, useState } from 'react';
import { getPregameByName } from '../api/nba.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';

export function PlayerPropsModal({ playerName, onClose }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!playerName) return;
    let alive = true;
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
  const best = getBestProp(data);
  const stat = best?.stat || 'pts';
  const line = ensureHalfLine(best?.line ?? data?.synthetic_lines?.pts);
  const games = data?.last5_games || [];
  const maxValue = Math.max(...games.map((game) => Number(game[stat] ?? game.pts ?? 0)), Number(line) || 20, 1);
  const photoUrl = data?.player_id
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${data.player_id}.png`
    : '';

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <section className="propsModal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modalClose" onClick={onClose}>x</button>

        <div className="modalHero">
          {photoUrl ? <img src={photoUrl} alt="" className="modalPhoto" /> : null}
          <div>
            <div className="eyebrow">Detalhe da prop</div>
            <h2>{playerName}</h2>
            <p>{state.loading ? 'Carregando historico...' : `Linha ${line ?? '-'} · Hit ${best?.hit_rate ?? '-'}%`}</p>
          </div>
        </div>

        {state.error ? <div className="alertBox">{state.error.message}</div> : null}

        {!state.loading && !state.error ? (
          <>
            <div className="propSummary modalSummary">
              <ModalMetric label="Temp" value={data?.season_avg?.[stat] ?? '-'} />
              <ModalMetric label="L5" value={data?.last5_avg?.[stat] ?? '-'} />
              <ModalMetric label="L10" value={data?.last10_avg?.[stat] ?? '-'} />
              <ModalMetric label="Edge" value={best?.edge ?? data?.edge_points ?? '-'} accent />
            </div>

            <div className="modalGameList">
              {games.length ? games.map((game) => {
                const value = Number(game[stat] ?? game.pts ?? 0);
                const pct = Math.max(4, Math.round((value / maxValue) * 100));
                const hit = line != null ? value >= line : false;
                return (
                  <div className="gameRow" key={`${game.date}-${game.opp}`}>
                    <span>{game.date}</span>
                    <strong>{game.opp}</strong>
                    <div className="gameBar">
                      <div className={hit ? 'gameBarFill hit' : 'gameBarFill miss'} style={{ width: `${pct}%` }} />
                    </div>
                    <b>{value}</b>
                  </div>
                );
              }) : <div className="emptyChart">Sem historico real para este jogador.</div>}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function ModalMetric({ label, value, accent = false }) {
  return (
    <div className="miniMetric">
      <span>{label}</span>
      <strong className={accent ? 'accent' : ''}>{value}</strong>
    </div>
  );
}
