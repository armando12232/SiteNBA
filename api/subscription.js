const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dhirxfoxcswctxcjzvhf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DC3I02jLVjM013WrODpgCg_xiPl1rsl';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured', runtime: 'node-subscription' });
    }

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'missing bearer token', runtime: 'node-subscription' });

    const user = await supabaseFetch('/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!user?.id) return res.status(401).json({ error: 'invalid token', runtime: 'node-subscription' });

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
    return res.status(500).json({ error: String(error.message || error).slice(0, 300), runtime: 'node-subscription' });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function serviceHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  };
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase HTTP ${response.status}`);
  return text ? JSON.parse(text) : {};
}
