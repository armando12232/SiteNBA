import { numberOrNull } from './props.js';

export function mergePregamePlayers(nbaPlayers, bpPlayers, schedule) {
  const safeNbaPlayers = Array.isArray(nbaPlayers) ? nbaPlayers : [];
  const safeBpPlayers = Array.isArray(bpPlayers) ? bpPlayers : [];
  const safeSchedule = Array.isArray(schedule) ? schedule : [];
  const byName = new Map(safeNbaPlayers.map((player) => [normalizeName(player.player_name), player]));
  const bpByName = new Map(safeBpPlayers.map((player) => [normalizeName(player.player_name), player]));
  const rows = safeNbaPlayers.map((nba) => {
    const bp = bpByName.get(normalizeName(nba.player_name));
    if (!bp) return nba;
    const game = findGameForTeam(safeSchedule, bp.team);
    return {
      ...nba,
      player_name: bp.player_name || nba.player_name,
      team_abbr: bp.team || nba.team_abbr,
      position: bp.position || nba.position,
      bp_image: bp.image,
      gameLabel: game ? `${game.awayTeam?.abbr || 'AWY'} x ${game.homeTeam?.abbr || 'HME'}` : bp.team || nba.team_abbr || '',
      gameDateLabel: game?.gameDateLabel,
      props: mergeProps(nba.props || {}, bp.props || {}),
      source: 'BettingPros',
    };
  });

  for (const bp of safeBpPlayers) {
    if (byName.has(normalizeName(bp.player_name))) continue;
    const game = findGameForTeam(safeSchedule, bp.team);
    rows.push({
      player_name: bp.player_name,
      player_id: bp.player_id,
      team_abbr: bp.team,
      position: bp.position,
      bp_image: bp.image,
      gameLabel: game ? `${game.awayTeam?.abbr || 'AWY'} x ${game.homeTeam?.abbr || 'HME'}` : bp.team || '',
      gameDateLabel: game?.gameDateLabel,
      props: mergeProps({}, bp.props || {}),
      source: 'BettingPros',
    });
  }

  return rows;
}

function mergeProps(nbaProps, bpProps) {
  const result = { ...nbaProps };
  for (const [stat, prop] of Object.entries(bpProps || {})) {
    result[stat] = {
      ...(nbaProps[stat] || {}),
      line: prop.line,
      odds: prop.odds,
      l5: prop.l5,
      l10: prop.l10,
      l15: prop.l15,
      l20: prop.l20,
      h2h: prop.h2h,
      hit_rate: prop.season,
      projection: prop.projection,
      edge: numberOrNull(prop.diff) ?? (numberOrNull(prop.projection) != null && numberOrNull(prop.line) != null ? Number(prop.projection) - Number(prop.line) : null),
      ev: prop.ev,
      rec_side: prop.rec_side,
      streak: prop.streak,
      source: 'BettingPros',
    };
  }
  return result;
}

function findGameForTeam(games, teamAbbr) {
  if (!teamAbbr) return null;
  return games.find((game) => (
    game.homeTeam?.abbr === teamAbbr || game.awayTeam?.abbr === teamAbbr
  ));
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
