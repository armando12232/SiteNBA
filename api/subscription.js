import {
  normalizeSupabaseUrl,
  safeHost,
  serviceHeaders as makeServiceHeaders,
  supabaseFetch as fetchSupabase,
  verifySupabaseToken,
} from './_supabaseAuth.js';

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').trim();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured', runtime: 'node-subscription' });
    }

    const user = await requireUser(req, res);
    if (!user) return;

    const rows = await supabaseFetch(`/rest/v1/subscriptions?select=plan,status,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
      headers: serviceHeaders(),
    });
    const subscription = Array.isArray(rows) && rows.length ? rows[0] : {};

    return res.status(200).json({
      user_id: user.id,
      email: user.email,
      plan: subscription.plan || 'free',
      status: subscription.status || 'active',
      role: subscription.role || 'user',
      runtime: 'node-subscription',
    });
  } catch (error) {
    return res.status(500).json({ error: formatError(error), supabase_host: safeHost(SUPABASE_URL), runtime: 'node-subscription' });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function serviceHeaders() {
  return makeServiceHeaders(SUPABASE_SERVICE_KEY);
}

async function supabaseFetch(path, options = {}) {
  return fetchSupabase(SUPABASE_URL, path, options);
}

async function requireUser(req, res) {
  try {
    return await verifySupabaseToken(SUPABASE_URL, SUPABASE_SERVICE_KEY, req.headers.authorization);
  } catch (error) {
    res.status(error.status || 500).json({ error: formatError(error), runtime: 'node-subscription' });
    return null;
  }
}

function formatError(error) {
  const message = String(error?.cause?.message || error?.message || error || 'unknown error');
  return message.slice(0, 500);
}
