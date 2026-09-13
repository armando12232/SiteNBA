import { createHash } from 'node:crypto';
import {
  extractBearerToken,
  normalizeSupabaseUrl,
  serviceHeaders,
  supabaseFetch,
  verifySupabaseToken,
} from './_supabaseAuth.js';

const ACTIVE = new Set(['active', 'trialing']);
const RANK = { free: 0, basic: 1, pro: 2, premium: 3 };
const REQUIRED = { modal: 'basic', live: 'pro', injuries: 'pro', football: 'pro', sports: 'pro', cs2: 'pro', props_by_game: 'premium' };
const accessCache = new Map();
const inflightAccess = new Map();
const ACCESS_TTL_MS = 30_000;
const MAX_ACCESS_ENTRIES = 500;

export async function checkFeature(req, feature) {
  const requiredPlan = REQUIRED[feature];
  if (!requiredPlan) return { ok: true };
  try {
    const access = await loadUserAccess(req.headers.authorization);
    if (access.role === 'admin') return { ok: true, access };
    if (!ACTIVE.has(access.status)) return { ok: false, status: 403, payload: { error: 'subscription inactive', feature } };
    if ((RANK[access.plan] || 0) < RANK[requiredPlan]) {
      return { ok: false, status: 403, payload: { error: 'plan upgrade required', feature, required_plan: requiredPlan, current_plan: access.plan } };
    }
    return { ok: true, access };
  } catch (error) {
    const status = [401, 403, 500, 503].includes(error.status) ? error.status : 503;
    const message = status === 401 ? error.message : status === 500 ? 'authorization service is not configured' : 'authorization service unavailable';
    return { ok: false, status, payload: { error: message, feature } };
  }
}

export async function loadUserAccess(authorization, config = {}) {
  const token = extractBearerToken(authorization);
  if (!token) throw httpError('missing bearer token', 401);
  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl ?? process.env.SUPABASE_URL);
  const serviceKey = String(config.serviceKey ?? process.env.SUPABASE_SERVICE_KEY ?? '').trim();
  if (!serviceKey) throw httpError('SUPABASE_SERVICE_KEY is not configured', 500);
  const cacheKey = createHash('sha256').update(token).digest('hex');
  const cached = accessCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < ACCESS_TTL_MS) return cached.data;
  if (cached) accessCache.delete(cacheKey);
  if (inflightAccess.has(cacheKey)) return inflightAccess.get(cacheKey);

  const request = fetchUserAccess({ serviceKey, supabaseUrl, token }).then((data) => {
    if (inflightAccess.get(cacheKey) === request) {
      accessCache.set(cacheKey, { data, savedAt: Date.now() });
      trimAccessCache();
    }
    return data;
  }).finally(() => {
    if (inflightAccess.get(cacheKey) === request) inflightAccess.delete(cacheKey);
  });
  inflightAccess.set(cacheKey, request);
  return request;
}

export function clearPlanAccessCache() {
  accessCache.clear();
  inflightAccess.clear();
}

async function fetchUserAccess({ serviceKey, supabaseUrl, token }) {
  const user = await verifySupabaseToken(supabaseUrl, serviceKey, `Bearer ${token}`);
  const rows = await supabaseFetch(
    supabaseUrl,
    `/rest/v1/subscriptions?select=plan,status,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: serviceHeaders(serviceKey) },
  );
  const subscription = Array.isArray(rows) && rows.length ? rows[0] : {};
  return {
    user_id: user.id,
    email: user.email,
    plan: subscription.plan || 'free',
    status: subscription.status || 'active',
    role: subscription.role || 'user',
  };
}

function trimAccessCache() {
  while (accessCache.size > MAX_ACCESS_ENTRIES) accessCache.delete(accessCache.keys().next().value);
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}
