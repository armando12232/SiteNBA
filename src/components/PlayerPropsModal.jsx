import { useEffect, useState } from 'react';
import { getPregame, getPregameByName } from '../api/nba.js';
import { ensureHalfLine, getBestProp } from '../utils/props.js';
import { buildPregameScore } from '../utils/statcastScore.js';

export function PlayerPropsModal({ playerName, onClose }) {
  const tableData = typeof playerName === 'object' && playerName ? playerName : null;
  const displayName = tableData?.player_name || String(playerName || '');
  const [activeStat, setActiveStat] = useState('pts');
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!playerName) return;
    let alive = true;
    setActiveStat('pts');
    setState({ loading: !tableData, error: null, data: tableData });

    const request = tableData?.player_id ? getPregame(tableData.player_id) : getPregameByName(displayName);
    request
      .then((data) => {
        if (!alive) return;
        setState({
          loading: false,
          error: null,
          data: mergeModalData(tableData, data),
        });
      })
      .catch((error) => {
        if (!alive) return;
        setState({ loading: false, error: tableData ? null : error, data: tableData });
      });

    return () => {
      alive = false;
    };
  }, [displayName, playerName, tableData]);

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
    l5: activeProp?.l5 ?? hitPercent(games, stat, lineNumber, 5),
    l10: activeProp?.l10 ?? hitPercent(games, stat, lineNumber, 10),
    l15: hitPercent(games, stat, lineNumber, 15),
    l20: hitPercent(games, stat, lineNumber, 20),
  };
  const seasonHit = activeProp?.hit_rate ?? hitPercent(games, stat, lineNumber, games.length);
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
              <div className="pp-player-name">{displayName}</div>
              <div className="pp-player-team">
                {state.loading ? 'Carregando histórico...' : `${teamAbbr || '-'} / ${statLabels[stat]} / Linha ${line ?? '-'}`}
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
                <ModalMetric label="Temp" value={formatPercentOrNumber(seasonHit, data?.season_avg?.[stat])} />
                <ModalMetric label="L5" value={formatPercentOrNumber(metricHits.l5, data?.last5_avg?.[stat])} />
                <ModalMetric label="L10" value={formatPercentOrNumber(metricHits.l10, data?.last10_avg?.[stat])} />
                <ModalMetric label="Linha" value={line ?? '-'} />
                <ModalMetric label="Hit" value={hitRate != null ? `${hitRate}%` : '-'} />
                <ModalMetric label="SC" value={score?.score ?? '-'} hot />
              </div>

              {score ? (
                <ScoreDiagnostic score={score} />
              ) : null}

              <div className="pp-section-title">Performance recente</div>
              <div className="performance-strip">
                <MetricInline label="Temp" value={seasonHit} />
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
              ) : <EstimatedHistory player={data} stat={stat} line={lineNumber} />}
            </>
          ) : (
            <div className="state-box compact">Carregando...</div>
          )}
        </div>
      </section>
    </div>
  );
}

function mergeModalData(tableData, fetchedData) {
  if (!tableData) return fetchedData;
  if (!fetchedData || fetchedData.error) return tableData;
  return {
    ...fetchedData,
    ...tableData,
    season_avg: { ...(fetchedData.season_avg || {}), ...(tableData.season_avg || {}) },
    last5_avg: { ...(fetchedData.last5_avg || {}), ...(tableData.last5_avg || {}) },
    last10_avg: { ...(fetchedData.last10_avg || {}), ...(tableData.last10_avg || {}) },
    synthetic_lines: { ...(fetchedData.synthetic_lines || {}), ...(tableData.synthetic_lines || {}) },
    props: mergePropMaps(fetchedData.props, tableData.props),
    last5_games: tableData.last5_games?.length ? tableData.last5_games : fetchedData.last5_games,
  };
}

function mergePropMaps(fetchedProps = {}, tableProps = {}) {
  const result = { ...fetchedProps };
  for (const [stat, tableProp] of Object.entries(tableProps || {})) {
    result[stat] = {
      ...(fetchedProps?.[stat] || {}),
      ...tableProp,
    };
  }
  return result;
}

const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assistências',
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

function formatPercentOrNumber(percentValue, fallbackValue) {
  if (percentValue != null && percentValue !== '-' && !Number.isNaN(Number(percentValue))) {
    return `${Number(percentValue)}%`;
  }
  const fallbackNumber = Number(fallbackValue);
  if (Number.isFinite(fallbackNumber)) {
    return formatNumber(fallbackNumber);
  }
  return '-';
}

function EstimatedHistory({ player, stat, line }) {
  const prop = player?.props?.[stat] || {};
  const rows = buildEstimatedRows(prop, player, stat);
  if (!rows.length) {
    return <div className="state-box compact">Histórico real indisponível. Mantendo leitura pela linha e hit rate da tabela.</div>;
  }

  const chartMax = Math.max(Math.ceil(Math.max(...rows.map((row) => row.value), Number(line) || 1) / 2) * 2, 2);
  const chartLinePct = Number.isFinite(line)
    ? Math.min(95, Math.max(5, (line / chartMax) * 100))
    : 0;

  return (
    <div className="performance-chart estimated">
      <div className="chart-grid">
        {[1, 0.8, 0.6, 0.4, 0.2, 0].map((ratio) => (
          <div className="chart-grid-line" key={ratio}>
            <span>{Math.round(chartMax * ratio)}</span>
          </div>
        ))}
      </div>
      <div
        className="chart-line"
        style={{ bottom: `${chartLinePct}%`, display: Number.isFinite(line) ? undefined : 'none' }}
      >
        <span>Linha {line ?? '-'}</span>
      </div>
      <div className="chart-bars">
        {rows.map((row, index) => {
          const value = row.value;
          const pct = Math.max(7, Math.round((value / chartMax) * 100));
          const hit = Number.isFinite(line) ? value >= line : false;
          return (
            <div className="chart-bar-item" key={`${row.date}-${row.opp}-${index}`}>
              <strong>{formatNumber(value)}</strong>
              <div className={`chart-bar ${hit ? 'hit' : 'miss'}`} style={{ height: `${pct}%` }} />
              <span>{row.opp}</span>
              <small>{formatDateShort(row.date)}</small>
            </div>
          );
        })}
      </div>
      <div className="chart-footer">
        <span>Histórico estimado pela linha da casa</span>
        <span>{prop.source || player?.source || 'Fallback'}</span>
      </div>
    </div>
  );
}

function buildEstimatedRows(prop, player, stat) {
  const base = Number(prop.projection ?? player?.last5_avg?.[stat] ?? player?.season_avg?.[stat] ?? prop.line);
  if (!Number.isFinite(base)) return [];
  const l5 = Number(prop.l5 ?? prop.hit_rate ?? 50);
  const swing = Math.max(1, base * 0.18);
  const opponents = estimateOpponents(player);
  const dates = estimateRecentDates();
  return Array.from({ length: 10 }, (_, index) => {
    const direction = index < Math.round(l5 / 10) ? 1 : -1;
    const wave = ((index % 4) - 1.5) * 0.25;
    return {
      value: Number(Math.max(0, base + direction * swing * (0.5 + Math.abs(wave))).toFixed(1)),
      opp: opponents[index % opponents.length],
      date: dates[index],
    };
  });
}

function estimateOpponents(player) {
  const gameLabel = String(player?.gameLabel || '');
  const team = String(player?.team_abbr || '').toUpperCase();
  const teams = gameLabel.match(/\b[A-Z]{2,3}\b/g) || [];
  const opponent = teams.find((abbr) => abbr !== team);
  return [opponent || team || 'PROJ'];
}

function estimateRecentDates() {
  const base = new Date();
  return Array.from({ length: 10 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() - ((9 - index) * 2));
    return date.toISOString().slice(0, 10);
  });
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
