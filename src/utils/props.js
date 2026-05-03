export function ensureHalfLine(line) {
  if (line == null) return null;
  const value = Number.parseFloat(line);
  if (Number.isNaN(value)) return line;
  return value % 1 === 0.5 ? value : Math.floor(value) + 0.5;
}

export function confidenceFromEdge(edge) {
  if (edge >= 5) return { text: 'Alta', className: 'high' };
  if (edge >= 2.5) return { text: 'Média', className: 'medium' };
  return { text: 'Baixa', className: 'low' };
}

export function getBestProp(pregame) {
  const props = pregame?.props || {};
  const candidates = Object.entries(props)
    .map(([stat, prop]) => ({ stat, ...prop }))
    .filter((prop) => prop.line != null);

  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.edge ?? -999) - (a.edge ?? -999))[0];
}
