const ALIASES = { NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };
const ESPN_ABBR = { NYK: 'ny', GSW: 'gs', SAS: 'sa', NOP: 'no', UTA: 'utah', WAS: 'wsh' };

export function teamAbbr(team) {
  const value = String(team?.teamAbbreviation || team?.abbr || team?.abbreviation || '').toUpperCase();
  return ALIASES[value] || value || '—';
}

export function teamName(team) {
  return team?.name || team?.displayName || teamAbbr(team);
}

export function teamLogoUrl(team) {
  const provided = team?.logoUrl || team?.logo || team?.logos?.[0]?.href;
  if (typeof provided === 'string' && provided.startsWith('https://')) return provided;
  const abbr = teamAbbr(team);
  if (!/^[A-Z]{2,4}$/.test(abbr)) return '';
  // ESPN team IDs and NBA IDs belong to different namespaces. Use the abbreviation.
  return `https://a.espncdn.com/i/teamlogos/nba/500/${ESPN_ABBR[abbr] || abbr.toLowerCase()}.png`;
}

export function playerPhotoUrl(player) {
  if (typeof player?.photoUrl === 'string' && player.photoUrl.startsWith('https://')) return player.photoUrl;
  if (/^\d+$/.test(String(player?.espn_id || ''))) return `https://a.espncdn.com/i/headshots/nba/players/full/${player.espn_id}.png`;
  if (/^\d+$/.test(String(player?.playerId || ''))) return `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.playerId}.png`;
  return '';
}

export function playersForTeam(players, team) {
  const id = team?.teamId ?? team?.id;
  const abbr = teamAbbr(team);
  return players.filter((player) => {
    if (id != null && player.teamId != null) return String(player.teamId) === String(id);
    return abbr !== '—' && teamAbbr({ abbr: player.teamAbbr }) === abbr;
  });
}

export function livePlayerKey(player) {
  return `${player.gameId || ''}:${player.espn_id || player.playerId || player.name}`;
}

export function displayStat(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return String(value);
}
