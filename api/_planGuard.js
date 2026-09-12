import { normalizeSupabaseUrl, serviceHeaders, supabaseFetch, verifySupabaseToken } from './_supabaseAuth.js';

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const ACTIVE = new Set(['active', 'trialing']);
const RANK = { free: 0, basic: 1, pro: 2, premium: 3 };
const REQUIRED = { modal: 'basic', live: 'pro', injuries: 'pro', football: 'pro', sports: 'pro', cs2: 'pro', props_by_game: 'premium' };

export async function checkFeature(req, feature) {
  const requiredPlan = REQUIRED[feature];
  if (!requiredPlan) return { ok: true };
  if (!SUPABASE_SERVICE_KEY) return { ok: false, status: 503, payload: { error: 'authorization service unavailable', feature } };
  try {
    const user = await verifySupabaseToken(SUPABASE_URL, SUPABASE_SERVICE_KEY, req.headers.authorization);
    const rows = await supabaseFetch(`/rest/v1/subscriptions?select=plan,status,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
      headers: serviceHeaders(SUPABASE_SERVICE_KEY),
    });
    const row = Array.isArray(rows) && rows.length ? rows[0] : {};
    const access = { user_id: user.id, email: user.email, plan: row.plan || 'free', status: row.status || 'active', role: row.role || 'user' };
    if (access.role === 'admin') return { ok: true, access };
    if (!ACTIVE.has(access.status)) return { ok: false, status: 403, payload: { error: 'subscription inactive', feature } };
    if ((RANK[access.plan] || 0) < RANK[requiredPlan]) {
      return { ok: false, status: 403, payload: { error: 'plan upgrade required', feature, required_plan: requiredPlan, current_plan: access.plan } };
    }
    return { ok: true, access };
  } catch (error) {
    return { ok: false, status: error.status || 503, payload: { error: error.status === 401 ? error.message : 'authorization service unavailable', feature } };
  }
}

