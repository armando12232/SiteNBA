export function buildPregameScore({ player, stat, prop, line, games = [] }) {
  const recentGames = Array.isArray(games) ? games : [];
  const numericLine = Number(line);
  const projection = numberOrNull(prop?.projection ?? player?.last5_avg?.[stat] ?? player?.season_avg?.[stat]);
  const edge = numberOrNull(prop?.edge ?? player?.edge_points);
  const l5Hit = numberOrNull(prop?.l5);
  const l10Hit = numberOrNull(prop?.l10 ?? prop?.hit_rate);
  const l20Hit = hitPercent(recentGames, stat, numericLine, 20);
  const seasonAvg = numberOrNull(player?.season_avg?.[stat]);
  const sample = Math.min(recentGames.length, 20);

  const factors = [
    {
      id: 'recent',
      label: 'Forma recente',
      value: normalizePct(l5Hit ?? l10Hit ?? 50),
      note: l5Hit != null ? `L5 ${l5Hit}%` : l10Hit != null ? `L10 ${l10Hit}%` : 'sem amostra',
      weight: 0.28,
    },
    {
      id: 'hit',
      label: 'Consistência',
      value: normalizePct(l10Hit ?? l20Hit ?? 50),
      note: l10Hit != null ? `L10 ${l10Hit}%` : l20Hit != null ? `L20 ${l20Hit}%` : 'neutro',
      weight: 0.22,
    },
    {
      id: 'edge',
      label: 'Edge da linha',
      value: scoreEdge(edge),
      note: edge != null ? `${edge > 0 ? '+' : ''}${edge}` : 'sem edge',
      weight: 0.22,
    },
    {
      id: 'projection',
      label: 'Projeção',
      value: scoreProjection(projection, numericLine),
      note: projection != null && Number.isFinite(numericLine) ? `${projection.toFixed(1)} vs ${numericLine}` : 'sem projeção',
      weight: 0.18,
    },
    {
      id: 'sample',
      label: 'Confiança',
      value: Math.min(100, Math.round((sample / 20) * 100)),
      note: `${sample}/20 jogos`,
      weight: 0.10,
    },
  ];

  const rawScore = factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0);
  const score = clamp(Math.round(rawScore), 1, 99);
  const side = edge == null
    ? score >= 58 ? 'OVER' : score <= 42 ? 'UNDER' : 'NEUTRO'
    : edge >= 0 ? 'OVER' : 'UNDER';

  return {
    score,
    side,
    tier: scoreTier(score, side),
    label: scoreLabel(score, side),
    factors,
    summary: pregameSummary(score, side, edge, l5Hit, l10Hit, projection, numericLine),
    seasonAvg,
  };
}

export function buildLiveScore({ player, projected = {}, hotStats = [], isRisk = false, period = 0 }) {
  const pts = Number(player?.pts || 0);
  const reb = Number(player?.reb || 0);
  const ast = Number(player?.ast || 0);
  const mins = Math.max(Number(player?.mins || 0), 1);
  const statTotal = pts + reb + ast;
  const liveImpact = (pts * 1.4) + (reb * 1.15) + (ast * 1.25);
  const paceValue = (Number(projected.pts || 0) * 0.55)
    + (Number(projected.reb || 0) * 0.9)
    + (Number(projected.ast || 0) * 1.05);

  const factors = [
    {
      id: 'impact',
      label: 'Impacto atual',
      value: clamp(Math.round(liveImpact * 2.2), 0, 100),
      note: `${statTotal} PRA`,
      weight: 0.30,
    },
    {
      id: 'pace',
      label: 'Ritmo projetado',
      value: clamp(Math.round(paceValue * 2.4), 0, 100),
      note: `${projected.pts || 0}P/${projected.reb || 0}R/${projected.ast || 0}A`,
      weight: 0.25,
    },
    {
      id: 'multi',
      label: 'Multi-alerta',
      value: clamp(35 + hotStats.length * 25, 0, 100),
      note: hotStats.length ? `${hotStats.length} stats quentes` : '1 leitura',
      weight: 0.18,
    },
    {
      id: 'minute',
      label: 'Minutos',
      value: clamp(Math.round((mins / 32) * 100), 0, 100),
      note: `${mins} min`,
      weight: 0.12,
    },
    {
      id: 'context',
      label: 'Contexto',
      value: clamp(60 + Number(period || 0) * 8 - (isRisk ? 35 : 0), 0, 100),
      note: isRisk ? 'risco blowout' : `Q${period || '-'}`,
      weight: 0.15,
    },
  ];

  const score = clamp(Math.round(factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0)), 1, 99);
  return {
    score,
    side: isRisk ? 'RISCO' : 'LIVE',
    tier: isRisk ? 'risk' : scoreTier(score, 'OVER'),
    label: isRisk ? 'RISCO DE QUEDA' : scoreLabel(score, 'OVER'),
    factors,
    summary: liveSummary(score, hotStats, isRisk, period),
  };
}

export function scoreTier(score, side = 'OVER') {
  if (side === 'RISCO') return 'risk';
  if (score >= 78) return 'elite';
  if (score >= 64) return 'strong';
  if (score >= 50) return 'watch';
  return side === 'UNDER' ? 'under' : 'cold';
}

function scoreLabel(score, side) {
  if (side === 'UNDER') {
    if (score >= 68) return 'UNDER forte';
    if (score >= 52) return 'UNDER leve';
    return 'UNDER fraco';
  }
  if (score >= 78) return 'OVER elite';
  if (score >= 64) return 'OVER forte';
  if (score >= 50) return 'Monitorar';
  return 'Fraco';
}

function pregameSummary(score, side, edge, l5Hit, l10Hit, projection, line) {
  const parts = [];
  parts.push(`${side} com StatCast Score ${score}.`);
  if (edge != null) parts.push(`Edge ${edge > 0 ? '+' : ''}${edge}.`);
  if (l5Hit != null) parts.push(`L5 bateu ${l5Hit}%.`);
  if (l10Hit != null) parts.push(`L10 bateu ${l10Hit}%.`);
  if (projection != null && Number.isFinite(line)) parts.push(`Projeção ${projection.toFixed(1)} contra linha ${line}.`);
  return parts.join(' ');
}

function liveSummary(score, hotStats, isRisk, period) {
  if (isRisk) return `Score ${score}, mas com risco de queda por contexto de jogo.`;
  const names = hotStats.length ? hotStats.map((stat) => stat.toUpperCase()).join(', ') : 'volume';
  return `Score ao vivo ${score}. Leitura puxada por ${names} no Q${period || '-'}.`;
}

function scoreProjection(projection, line) {
  if (projection == null || !Number.isFinite(line)) return 50;
  return clamp(Math.round(50 + (projection - line) * 9), 0, 100);
}

function scoreEdge(edge) {
  if (edge == null) return 50;
  return clamp(Math.round(50 + edge * 8), 0, 100);
}

function hitPercent(games, stat, line, limit) {
  if (!Number.isFinite(line)) return null;
  const rows = games.slice(0, limit);
  if (!rows.length) return null;
  const hits = rows.filter((game) => Number(game?.[stat] ?? game?.pts ?? 0) >= line).length;
  return Math.round((hits / rows.length) * 100);
}

function normalizePct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(Math.round(n), 0, 100) : 50;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
