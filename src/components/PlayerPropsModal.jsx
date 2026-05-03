import { useEffect, useState } from 'react';
import { getPregameByName } from '../api/nba.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';
import { buildPregameScore } from '../utils/statcastScore.js';

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
  const games = sortRecentGames(data?.last5_games || []);
  const chartGames = games.slice(0, 20).reverse();
  const teamAbbr = data?.team_abbr || inferTeamFromGames(games);
  const maxValue = Math.max(...games.map((game) => Number(game[stat] ?? game.pts ?? 0)), Number(line) || 20, 1);
  const chartMax = Math.ceil(maxValue / 2) * 2;
  const photoUrl = data?.player_id
    ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${data.player_id}.png`
    : '';
  const hitRate = best?.hit_rate;
  const lineNumber = Number(line);
  const chartLinePct = Number.isFinite(lineNumber)
    ? Math.min(95, Math.max(5, (lineNumber / chartMax) * 100))
    : 0;
  const metricHits = {
    h2h: null,
    l5: hitPercent(games, stat, lineNumber, 5),
    l10: hitPercent(games, stat, lineNumber, 10),
    l15: hitPercent(games, stat, lineNumber, 15),
    l20: hitPercent(games, stat, lineNumber, 20),
  };
  const currentStreak = streakOver(games, stat, lineNumber);
  const score = data && !state.loading && !state.error
    ? buildPregameScore({ player: data, stat, prop: best, line, games })
    : null;

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
                {state.loading ? 'Carregando historico...' : `${teamAbbr || '-'} / ${statLabels[stat]} / Linha ${line ?? '-'}`}
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
                <ModalMetric label="SC" value={score?.score ?? '-'} hot />
              </div>

              {score ? (
                <ScoreDiagnostic score={score} />
              ) : null}

              <div className="pp-section-title">Performance recente</div>
              <div className="performance-strip">
                <MetricInline label="Temp" value={data?.season_avg?.[stat] ?? '-'} suffix="" green />
                <MetricInline label="H2H" value={metricHits.h2h} />
                <MetricInline label="L5" value={metricHits.l5} />
                <MetricInline label="L10" value={metricHits.l10} />
                <MetricInline label="L15" value={metricHits.l15} />
                <MetricInline label="L20" value={metricHits.l20} />
              </div>
              {games.length ? (
                <div className="performance-chart">
                  <div className="chart-grid">
                    {[1, 0.8, 0.6, 0.4, 0.2, 0].map((ratio) => (
                      <div className="chart-grid-line" key={ratio}>
                        <span>{Math.round(chartMax * ratio)}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="chart-line"
                    style={{ bottom: `${chartLinePct}%`, display: Number.isFinite(lineNumber) ? undefined : 'none' }}
                  >
                    <span>Linha {line ?? '-'}</span>
                  </div>
                  <div className="chart-bars">
                    {chartGames.map((game) => {
                      const value = Number(game[stat] ?? game.pts ?? 0);
                      const pct = Math.max(7, Math.round((value / chartMax) * 100));
                      const hit = line != null ? value >= lineNumber : false;
                      return (
                        <div className="chart-bar-item" key={`${game.date}-${game.opp}`}>
                          <strong>{formatNumber(value)}</strong>
                          <div className={`chart-bar ${hit ? 'hit' : 'miss'}`} style={{ height: `${pct}%` }} />
                          <span>{shortOpponent(game.opp)}</span>
                          <small>{formatDateShort(game.date)}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-footer">
                    <span>Mais antigo → mais recente</span>
                    <span>{currentStreak ? `Streak: ${currentStreak}x OVER` : 'Streak: -'}</span>
                  </div>
                </div>
              ) : <div className="state-box compact">Sem historico real para este jogador.</div>}
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

function ScoreDiagnostic({ score }) {
  return (
    <section className={`score-diagnostic ${score.tier}`}>
      <div className="score-diagnostic-head">
        <div>
          <div className="pp-section-title compact">StatCast Score</div>
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

function MetricInline({ label, value, suffix = '%', green = false }) {
  const display = value == null ? '-' : `${value}${value === '-' ? '' : suffix}`;
  return (
    <div className="performance-metric">
      <span>{label}</span>
      <strong className={green || Number(value) >= 50 ? 'good' : ''}>{display}</strong>
    </div>
  );
}

function formatDate(value) {
  const date = parseNbaDate(value);
  if (!date) return value ? String(value).slice(0, 12) : '-';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatDateShort(value) {
  const date = parseNbaDate(value);
  if (!date) return '';
  return date.toLocaleDateString('pt-BR', { month: 'short', day: '2-digit' }).replace('.', '');
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shortOpponent(matchup) {
  const text = String(matchup || '');
  const parts = text.split(/\s+/);
  return parts.length ? parts[parts.length - 1] : '-';
}

function inferTeamFromGames(games) {
  const matchup = games?.[0]?.opp || '';
  return String(matchup).split(/\s+/)[0]?.toUpperCase() || '';
}

function hitPercent(games, stat, line, limit) {
  if (!Number.isFinite(line)) return null;
  const rows = games.slice(0, limit);
  if (rows.length < limit) return null;
  const hits = rows.filter((game) => Number(game[stat] ?? game.pts ?? 0) >= line).length;
  return Math.round((hits / rows.length) * 100);
}

function streakOver(games, stat, line) {
  if (!Number.isFinite(line)) return 0;
  let count = 0;
  for (const game of games) {
    if (Number(game[stat] ?? game.pts ?? 0) < line) break;
    count += 1;
  }
  return count;
}

function sortRecentGames(games) {
  return [...games].sort((a, b) => {
    const dateA = parseNbaDate(a?.date)?.getTime() ?? 0;
    const dateB = parseNbaDate(b?.date)?.getTime() ?? 0;
    return dateB - dateA;
  });
}

function parseNbaDate(value) {
  if (!value) return null;
  const text = String(value).trim();

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const nbaMatch = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (nbaMatch) {
    const month = monthIndex(nbaMatch[1]);
    if (month >= 0) return new Date(Number(nbaMatch[3]), month, Number(nbaMatch[2]));
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return new Date(Number(slashMatch[3]), Number(slashMatch[1]) - 1, Number(slashMatch[2]));
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function monthIndex(value) {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(String(value).toLowerCase());
}
