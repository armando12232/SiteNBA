import { SUPABASE_CONFIGURED, SUPABASE_CONFIG_ERROR, supabase } from './supabase.js';

const FAVORITES_FIELD = 'statcast_favorites';
const FAVORITES_LIMIT = 60;

export function normalizeFavorite(player) {
  const playerName = String(player?.player_name || player?.name || '').trim();
  if (!playerName) return null;
  const playerId = String(player?.player_id || player?.id || '').trim();
  const league = player?.league === 'wnba' ? 'wnba' : 'nba';
  return {
    player_id: playerId || null,
    player_name: playerName.slice(0, 100),
    team_abbr: String(player?.team_abbr || '').trim().slice(0, 8) || null,
    league,
  };
}

export function favoriteKey(player) {
  const normalized = normalizeFavorite(player);
  if (!normalized) return '';
  const identity = normalized.player_id || normalizeName(normalized.player_name);
  return `${normalized.league}:${identity}`;
}

export function favoritesFromSession(session) {
  const rows = session?.user?.user_metadata?.[FAVORITES_FIELD];
  if (!Array.isArray(rows)) return [];
  const unique = new Map();
  for (const row of rows.slice(0, FAVORITES_LIMIT)) {
    const favorite = normalizeFavorite(row);
    const key = favoriteKey(favorite);
    if (favorite && key && !unique.has(key)) unique.set(key, favorite);
  }
  return [...unique.values()];
}

export function toggleFavoriteList(current, player) {
  const favorite = normalizeFavorite(player);
  if (!favorite) return { favorites: current || [], active: false, key: '' };
  const key = favoriteKey(favorite);
  const safeCurrent = Array.isArray(current) ? current.map(normalizeFavorite).filter(Boolean) : [];
  const exists = safeCurrent.some((row) => favoriteKey(row) === key);
  const favorites = exists
    ? safeCurrent.filter((row) => favoriteKey(row) !== key)
    : [favorite, ...safeCurrent].slice(0, FAVORITES_LIMIT);
  return { favorites, active: !exists, key };
}

export async function persistFavorites(favorites) {
  if (!SUPABASE_CONFIGURED) return { data: null, error: new Error(SUPABASE_CONFIG_ERROR) };
  const normalized = (Array.isArray(favorites) ? favorites : [])
    .map(normalizeFavorite)
    .filter(Boolean)
    .slice(0, FAVORITES_LIMIT);
  return supabase.auth.updateUser({ data: { [FAVORITES_FIELD]: normalized } });
}

function normalizeName(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

