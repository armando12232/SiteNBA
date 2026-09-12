export function ensureHalfLine(line) {
  const value = numberOrNull(line);
  // The provider owns the line: rounding a market changes its outcome.
  return value != null && value >= 0 ? value : null;
}

export function numberOrNull(value) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function propForStat(player, stat) {
  const prop = player?.props?.[stat];
  const line = ensureHalfLine(prop?.line ?? player?.synthetic_lines?.[stat]);
  return line == null ? null : { ...prop, stat, line };
}

export function hitPercent(games, stat, line, limit) {
  const values = recentValues(games, stat, limit);
  const numericLine = numberOrNull(line);
  if (!values || numericLine == null) return null;
  return Math.round(values.filter((value) => value > numericLine).length / values.length * 100);
}

export function averageRecent(games, stat, limit) {
  const values = recentValues(games, stat, limit);
  return values ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function recentValues(games, stat, limit) {
  if (!Number.isInteger(limit) || limit < 1 || !Array.isArray(games)) return null;
  const rows = games.slice(0, limit);
  const values = rows.map((game) => numberOrNull(game?.[stat]));
  return rows.length === limit && values.every((value) => value != null) ? values : null;
}

export function streakOver(games, stat, line) {
  const numericLine = numberOrNull(line);
  if (numericLine == null) return 0;
  let count = 0;
  for (const game of games || []) {
    const value = numberOrNull(game?.[stat]);
    if (value == null || value <= numericLine) break;
    count += 1;
  }
  return count;
}

export function confidenceFromEdge(edge) {
  if (edge >= 5) return { text: 'Alta', className: 'high' };
  if (edge >= 2.5) return { text: 'Média', className: 'medium' };
  return { text: 'Baixa', className: 'low' };
}

export function getBestProp(pregame) {
  const props = pregame?.props || {};
  const candidates = Object.entries(props)
    .map(([stat]) => propForStat(pregame, stat))
    .filter(Boolean);

  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.edge ?? -999) - (a.edge ?? -999))[0];
}
