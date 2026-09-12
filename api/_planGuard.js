import { extractBearerToken } from './_supabaseAuth.js';

const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').replace(/\/+$/, '');
const ACTIVE = new Set(['active', 'trialing']);
const RANK = { free: 0, basic: 1, pro: 2, premium: 3 };
const REQUIRED = { modal: 'basic', live: 'pro', injuries: 'pro', football: 'pro', sports: 'pro', cs2: 'pro', props_by_game: 'premium' };

export async function checkFeature(req, feature) {
  const requiredPlan = REQUIRED[feature];
  if (!requiredPlan) return { ok: true };
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return { ok: false, status: 401, payload: { error: 'missing bearer token', feature } };
    const response = await fetch(`${SITE_URL}/api/subscription`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000),
    });
    const access = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? response.status : 503;
      return { ok: false, status, payload: { error: status === 401 ? 'invalid bearer token' : 'authorization service unavailable', feature } };
    }
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

