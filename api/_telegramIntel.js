export function parseTelegramIntel(text, meta = {}) {
  const sourceText = String(text || '').trim();
  if (!sourceText) return null;

  const normalized = normalizeText(sourceText);
  if (!normalized.includes('dados disciplinares')) return null;

  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const refereeLine = findLine(lines, 'arbitro');
  const averageLine = findLine(lines, 'media');
  const lastLine = findLine(lines, 'ultimos');
  const teams = parseTeamBlocks(lines);

  return {
    type: 'discipline',
    source: 'telegram',
    chat_id: meta.chat_id || null,
    message_id: meta.message_id || null,
    message_date: meta.message_date || null,
    referee: extractAfterColon(refereeLine),
    avg_ucl_cards: extractNamedNumber(averageLine, 'ucl'),
    avg_league_cards: extractLeagueAverage(averageLine),
    ref_last: parseNumberSequence(extractAfterColon(lastLine)),
    teams,
    home_team: teams[0]?.name || null,
    away_team: teams[1]?.name || null,
    source_text: sourceText,
  };
}

export function parseTelegramUpdate(update) {
  const message = update?.message || update?.channel_post || update?.edited_message || update?.edited_channel_post;
  if (!message) return null;

  const text = message.text || message.caption || '';
  return parseTelegramIntel(text, {
    chat_id: message.chat?.id ? String(message.chat.id) : null,
    message_id: message.message_id ? String(message.message_id) : null,
    message_date: message.date ? new Date(message.date * 1000).toISOString() : null,
  });
}

export function scoreIntelMatch(intel, fixture) {
  if (!intel || !fixture) return 0;
  const wanted = [fixture.home, fixture.away].map(normalizeTeamName).filter(Boolean);
  const names = [
    intel.home_team,
    intel.away_team,
    ...(intel.teams || []).map((team) => team.name),
    intel.source_text,
  ].map(normalizeTeamName).filter(Boolean);

  return wanted.reduce((score, teamName) => {
    if (names.some((name) => name.includes(teamName) || teamName.includes(name))) return score + 1;
    return score;
  }, 0);
}

export function normalizeTeamName(value) {
  return normalizeText(value)
    .replace(/\b(fc|cf|sc|af|ac|de|do|da|dos|the|club)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTeamBlocks(lines) {
  const teams = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    if (!looksLikeTeamHeader(current) || !looksLikeSequenceLine(next)) continue;

    const header = stripLeadingSymbols(current);
    const match = header.match(/^(.+?)(?:\s*\((.+)\))?$/);
    const name = match?.[1]?.trim();
    if (!name || isKnownLabel(name)) continue;

    const sequences = next.split('|').map((part) => parseNumberSequence(part)).filter((items) => items.length);
    teams.push({
      name,
      context: match?.[2]?.trim() || null,
      cards_last: sequences[0] || [],
      alternate_last: sequences[1] || [],
    });
    index += 1;
  }
  return teams;
}

function looksLikeTeamHeader(line) {
  const clean = normalizeText(stripLeadingSymbols(line));
  if (!clean || isKnownLabel(clean)) return false;
  return !looksLikeSequenceLine(line) && /[a-z]/.test(clean);
}

function looksLikeSequenceLine(line) {
  return /\d+\s*-\s*\d+/.test(line);
}

function stripLeadingSymbols(value) {
  return String(value || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

function isKnownLabel(value) {
  const clean = normalizeText(value);
  return clean.includes('dados disciplinares')
    || clean.startsWith('aqui vai')
    || clean.startsWith('arbitro')
    || clean.startsWith('media')
    || clean.startsWith('ultimos');
}

function findLine(lines, token) {
  return lines.find((line) => normalizeText(line).includes(token)) || '';
}

function extractAfterColon(line) {
  const value = stripLeadingSymbols(line);
  const index = value.indexOf(':');
  return index >= 0 ? value.slice(index + 1).trim() : '';
}

function extractNamedNumber(line, token) {
  const clean = normalizeText(line);
  const index = clean.indexOf(token);
  if (index < 0) return null;
  return parseLocaleNumber(line.slice(index));
}

function extractLeagueAverage(line) {
  const clean = normalizeText(line);
  const leagueIndex = clean.search(/\bliga\b|\bleague\b/);
  if (leagueIndex < 0) return null;
  return parseLocaleNumber(line.slice(leagueIndex));
}

function parseLocaleNumber(value) {
  const match = String(value || '').match(/-?\d+(?:[,.]\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberSequence(value) {
  return String(value || '')
    .match(/\d+(?:[,.]\d+)?/g)
    ?.map((item) => Number.parseFloat(item.replace(',', '.')))
    .filter((item) => Number.isFinite(item)) || [];
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
