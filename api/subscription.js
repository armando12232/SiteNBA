const DEFAULT_SUPABASE_URL = 'https://dhirxfoxcswctxcjzvhf.supabase.co';
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();

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

    const user = decodeSupabaseJwt(token);
    if (!user?.id) return res.status(401).json({ error: 'invalid token payload', runtime: 'node-subscription' });

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
  const url = `${SUPABASE_URL}${path}`;
  const response = await fetch(url, {
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

function decodeSupabaseJwt(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const data = JSON.parse(json);
    return { id: data.sub, email: data.email };
  } catch {
    return null;
  }
}

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(raw)) return DEFAULT_SUPABASE_URL;
  return raw;
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid';
  }
}

function formatError(error) {
  const message = String(error?.cause?.message || error?.message || error || 'unknown error');
  return message.slice(0, 500);
}
