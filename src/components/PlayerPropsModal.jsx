import { useEffect, useId, useRef, useState } from 'react';
import { getPregame as getNbaPregame, getPregameByName as getNbaPregameByName } from '../api/nba.js';
import { getWnbaPregame, getWnbaPregameByName } from '../api/wnba.js';
import { averageRecent, hitPercent, numberOrNull, propForStat, streakOver } from '../utils/props.js';
import { buildPregameScore } from '../utils/statcastScore.js';
import { userErrorMessage } from '../utils/errors.js';
import { favoriteKey } from '../api/favorites.js';
import { FavoriteButton } from './FavoriteButton.jsx';

export function PlayerPropsModal({ favorites = [], onToggleFavorite, playerName, onClose, savingFavoriteKey = '' }) {
  const tableData = typeof playerName === 'object' && playerName ? playerName : null;
  const displayName = tableData?.player_name || String(playerName || '');
  const [activeStat, setActiveStat] = useState('pts');
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;

  useEffect(() => {
    if (!playerName) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector('button')?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener('keydown', handleKey);
    return () => {
      dialog?.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [Boolean(playerName)]);

  useEffect(() => {
    if (!playerName) return;
    let alive = true;
    setActiveStat('pts');
    setState({ loading: !tableData, error: null, data: tableData });

    const isWnba = tableData?.league === 'wnba';
    const request = tableData?.player_id
      ? (isWnba ? getWnbaPregame(tableData.player_id) : getNbaPregame(tableData.player_id))
      : (isWnba ? getWnbaPregameByName(displayName) : getNbaPregameByName(displayName));
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
  const best = propForStat(data, activeStat);
  const stat = activeStat;
  const line = best?.line ?? null;
  const games = sortRecentGames(data?.last5_games || []);
  const chartGames = games.slice(0, 20).reverse();
  const teamAbbr = data?.team_abbr || inferTeamFromGames(games);
  const maxValue = Math.max(...games.map((game) => numberOrNull(game[stat]) ?? 0), line ?? 20, 1);
  const chartMax = Math.ceil(maxValue / 2) * 2;
  const photoUrl = playerPhotoUrl(data);
  const hitRate = best?.hit_rate;
  const lineNumber = numberOrNull(line);
  const marketLine = best?.source === 'BettingPros';
  const averages = buildModalAverages(data, stat, games, best);
  const chartLinePct = Number.isFinite(lineNumber)
    ? Math.min(95, Math.max(5, (lineNumber / chartMax) * 100))
    : 0;
  const metricHits = {
    h2h: activeProp?.h2h ?? null,
    l5: activeProp?.l5 ?? hitPercent(games, stat, lineNumber, 5),
    l10: activeProp?.l10 ?? hitPercent(games, stat, lineNumber, 10),
    l15: activeProp?.l15 ?? hitPercent(games, stat, lineNumber, 15),
    l20: activeProp?.l20 ?? hitPercent(games, stat, lineNumber, 20),
  };
  const seasonHit = activeProp?.hit_rate ?? hitPercent(games, stat, lineNumber, games.length);
  const currentStreak = streakOver(games, stat, lineNumber);
  const score = data && best && !state.loading && !state.error
    ? buildPregameScore({ player: data, stat, prop: best, line, games, marketLine })
    : null;
  const favoritePlayer = data || tableData;
  const savedKey = favoriteKey(favoritePlayer);
  const isFavorite = favorites.some((favorite) => favoriteKey(favorite) === savedKey);

  return (
    <div className="pp-modal-overlay open" onMouseDown={onClose}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="pp-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="pp-modal-hero">
          <button type="button" aria-label="Fechar detalhes do jogador" className="pp-modal-close" onClick={onClose}>x</button>
          <div className="pp-hero-inner">
            {photoUrl ? <img src={photoUrl} alt="" className="pp-player-photo" /> : null}
            <div className="pp-player-meta">
              <div id={titleId} className="pp-player-name">{displayName}</div>
              <div className="pp-player-team">
                {state.loading ? 'Carregando histórico...' : `${teamAbbr || '-'} / ${statLabels[stat]} / ${marketLine ? 'Linha' : 'Referência'} ${line ?? '-'}`}
              </div>
              {!state.loading && !state.error && sampleLabel(data) ? (
                <div className="pp-player-sample">{sampleLabel(data)}</div>
              ) : null}
              {score ? (
                <div className={`pp-rec-badge ${score.side === 'UNDER' ? 'under' : 'over'}`}>
                  {marketLine ? (score.side === 'NEUTRO' ? 'Leitura neutra' : `${score.side} recomendado`) : score.label}
                </div>
              ) : null}
            </div>
            {favoritePlayer ? <FavoriteButton active={isFavorite} disabled={savingFavoriteKey === savedKey} onToggle={() => onToggleFavorite?.(favoritePlayer)} playerName={displayName} /> : null}
          </div>
        </div>

        <div className="pp-modal-body">
          {state.error ? <div className="alertBox">{userErrorMessage(state.error, 'Não foi possível carregar o histórico real agora.')}</div> : null}

          {!state.loading && !state.error ? (
            <>
              <div className="pp-section-title">Prop</div>
              <div className="pp-prop-tabs">
                {Object.entries(statLabels).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={`pp-prop-tab ${stat === key ? 'active' : ''}`}
                    aria-pressed={stat === key}
                    onClick={() => setActiveStat(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="pp-stats-grid">
                <ModalMetric label={averages.seasonLabel} value={averages.seasonValue} />
                <ModalMetric label="L5" value={averages.l5Value} />
                <ModalMetric label="L10" value={averages.l10Value} />
                <ModalMetric label={marketLine ? 'Linha' : 'Referência'} value={line ?? '-'} />
                <ModalMetric label="Hit" value={formatPercent(hitRate ?? seasonHit)} />
                <ModalMetric label="SC" value={score?.score ?? '-'} hot />
              </div>

              {score ? (
                <ScoreDiagnostic score={score} />
              ) : null}

              <div className="pp-section-title">{marketLine ? 'Acertos OVER na linha atual' : 'Jogos acima da referência histórica'}</div>
              <div className="performance-strip">
                <MetricInline label={best?.source === 'BettingPros' ? 'Temp' : 'Amostra'} value={seasonHit} />
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
                    <span>{marketLine ? 'Linha' : 'Ref.'} {line ?? '-'}</span>
                  </div>
                  <div className="chart-bars">
                    {chartGames.map((game) => {
                      const value = numberOrNull(game[stat]);
                      const pct = value == null ? 0 : Math.max(0, Math.round((value / chartMax) * 100));
                      const hit = line != null && value != null ? value > lineNumber : false;
                      return (
                        <div className="chart-bar-item" key={`${game.date}-${game.opp}`}>
                          <strong>{value == null ? '-' : formatNumber(value)}</strong>
                          <div className={`chart-bar ${hit ? 'hit' : 'miss'}`} style={{ height: `${pct}%` }} />
                          <span>{shortOpponent(game.opp)}</span>
                          <small>{formatDateShort(game.date)}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-footer">
                    <span>Mais antigo → mais recente</span>
                    <span>{currentStreak ? `${marketLine ? 'Streak OVER' : 'Sequência acima'}: ${currentStreak}x` : 'Sequência: -'}</span>
                  </div>
                </div>
              ) : <div className="state-box compact">Histórico de jogos indisponível para este jogador.</div>}
            </>
          ) : state.loading ? (
            <div className="state-box compact">Carregando...</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function mergeModalData(tableData, fetchedData) {
  if (!tableData) return fetchedData;
  if (!fetchedData || fetchedData.error) return tableData;
  return {
    ...tableData,
    ...fetchedData,
    season_avg: { ...(tableData.season_avg || {}), ...(fetchedData.season_avg || {}) },
    last5_avg: { ...(tableData.last5_avg || {}), ...(fetchedData.last5_avg || {}) },
    last10_avg: { ...(tableData.last10_avg || {}), ...(fetchedData.last10_avg || {}) },
    synthetic_lines: { ...(tableData.synthetic_lines || {}), ...(fetchedData.synthetic_lines || {}) },
    props: mergePropMaps(fetchedData.props, tableData.props),
    last5_games: fetchedData.last5_games?.length ? fetchedData.last5_games : tableData.last5_games,
  };
}

function mergePropMaps(fetchedProps = {}, tableProps = {}) {
  const result = { ...fetchedProps };
  for (const [stat, tableProp] of Object.entries(tableProps || {})) {
    result[stat] = tableProp?.source === 'BettingPros'
      ? { ...(fetchedProps?.[stat] || {}), ...tableProp }
      : { ...tableProp, ...(fetchedProps?.[stat] || {}) };
  }
  return result;
}

const statLabels = {
  pts: 'Pontos',
  reb: 'Rebotes',
  ast: 'Assistências',
  fg3m: '3PT',
};

function playerPhotoUrl(player) {
  if (player?.photo_url) return player.photo_url;
  if (!player?.player_id) return '';
  if (player?.league === 'wnba') {
    return `https://cdn.wnba.com/headshots/wnba/latest/1040x760/${player.player_id}.png`;
  }
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.player_id}.png`;
}

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
          <div className="pp-section-title compact">{score.marketLine ? 'StatCast Score' : 'Índice histórico'}</div>
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

function formatOptionalNumber(value) {
  const number = numberOrNull(value);
  return number == null ? '-' : formatNumber(number);
}

function formatPercent(value) {
  const number = numberOrNull(value);
  return number == null ? '-' : `${Math.round(number)}%`;
}

function buildModalAverages(player, stat, games, prop) {
  const seasonAvg = numberOrNull(player?.season_avg?.[stat]);
  const projection = numberOrNull(prop?.projection);
  const l5Avg = numberOrNull(player?.last5_avg?.[stat]) ?? averageRecent(games, stat, 5);
  const l10Avg = numberOrNull(player?.last10_avg?.[stat]) ?? averageRecent(games, stat, 10);

  return {
    seasonLabel: seasonAvg != null ? 'Temp' : projection != null ? 'Proj' : 'Temp',
    seasonValue: formatOptionalNumber(seasonAvg ?? projection),
    l5Value: formatOptionalNumber(l5Avg),
    l10Value: formatOptionalNumber(l10Avg),
  };
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

function sampleLabel(player) {
  const seasons = Array.isArray(player?.sample_seasons) ? player.sample_seasons.filter(Boolean) : [];
  if (!seasons.length) return '';
  return player?.using_previous_season ? `Amostra ${seasons.join(' + ')}` : `Temporada ${seasons[0]}`;
}

