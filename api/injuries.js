import { checkFeature } from './_planGuard.js';
import { fetchProviderJson } from './_providerFetch.js';

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').replace(/\/+$/, '');
const TEAM_ABBR = { NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };
let cached = null;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const access = await checkFeature(req, 'injuries');
  if (!access.ok) return res.status(access.status).json(access.payload);

  try {
    if (cached && Date.now() - cached.time < 10 * 60 * 1000) return res.status(200).json(cached.data);
    const [payload, teamPayload] = await Promise.all([
      fetchProviderJson(ESPN_URL, { ttlMs: 10 * 60 * 1000, timeoutMs: 8_000, retries: 1, headers: providerHeaders() }),
      fetchProviderJson(TEAMS_URL, { ttlMs: 60 * 60 * 1000, timeoutMs: 8_000, retries: 1, headers: providerHeaders() }),
    ]);
    const teams = new Map((teamPayload.sports?.[0]?.leagues?.[0]?.teams || []).map((item) => [String(item.team.id), item.team]));
    const injuries = [];
    for (const group of payload.injuries || []) {
      const team = teams.get(String(group.id)) || {};
      const abbreviation = TEAM_ABBR[team.abbreviation] || team.abbreviation || '';
      for (const item of group.injuries || []) {
        const athlete = item.athlete || {};
        const athleteId = idFromHeadshot(athlete.headshot?.href);
        const category = categorize(item.status);
        injuries.push({ team: abbreviation, team_name: group.displayName || team.displayName || '', team_color: `#${team.color || '6b7280'}`,
          team_id: group.id, athlete_id: athleteId, athlete_name: athlete.displayName || '—', position: athlete.position?.abbreviation || '',
          image: athlete.headshot?.href || '', status: category.label, status_color: category.color, priority: category.priority,
          return_date: item.details?.returnDate || '', description: String(item.shortComment || item.longComment || '').slice(0, 500) });
      }
    }
    injuries.sort((a, b) => b.priority - a.priority || a.team.localeCompare(b.team) || a.athlete_name.localeCompare(b.athlete_name));
    const byStatus = {};
    const byTeam = new Map();
    for (const injury of injuries) {
      byStatus[injury.status] = (byStatus[injury.status] || 0) + 1;
      if (!byTeam.has(injury.team)) byTeam.set(injury.team, { team: injury.team, team_name: injury.team_name, team_color: injury.team_color, count: 0, players: [] });
      const row = byTeam.get(injury.team); row.count += 1; row.players.push(injury.athlete_name);
    }
    const data = { total: injuries.length, by_status: byStatus, by_team: [...byTeam.values()], injuries, partial: false,
      teams_done: (payload.injuries || []).length, teams_total: teams.size, updated_at: Math.floor(Date.now() / 1000), source: 'espn' };
    cached = { time: Date.now(), data };
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Dados de lesões indisponíveis no momento.', runtime: 'node-injuries' });
  }
}

function categorize(value) {
  const status = String(value || '').toLowerCase();
  if (status.includes('out for season')) return { label: 'Fora da temporada', color: '#dc2626', priority: 4 };
  if (status === 'out' || status.includes('injured reserve')) return { label: 'Fora', color: '#ef4444', priority: 3 };
  if (status.includes('doubtful')) return { label: 'Dúvida', color: '#f97316', priority: 2 };
  if (status.includes('questionable') || status.includes('day-to-day')) return { label: 'Dia a dia', color: '#eab308', priority: 1 };
  if (status.includes('probable')) return { label: 'Provável', color: '#22c55e', priority: 0 };
  return { label: value || 'Desconhecido', color: '#6b7280', priority: 1 };
}

function idFromHeadshot(url) { return String(url || '').match(/\/players\/full\/(\d+)\./)?.[1] || null; }
function providerHeaders() { return { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }; }
function setCors(res) { res.setHeader('Access-Control-Allow-Origin', SITE_URL); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Cache-Control', 'no-store'); }
