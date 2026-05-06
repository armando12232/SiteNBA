const DEFAULT_SUPABASE_URL = 'https://dhirxfoxcswctxcjzvhf.supabase.co';
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').trim();

const PLAN_PRICES = {
  free: 0,
  basic: 29,
  pro: 59,
  premium: 99,
};

const VALID_PLANS = new Set(Object.keys(PLAN_PRICES));
const VALID_STATUS = new Set(['active', 'past_due', 'cancelled', 'trialing']);
const VALID_ROLES = new Set(['user', 'admin']);

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    if (req.method === 'GET' && req.query?.type === 'health') {
      return res.status(200).json({
        ok: true,
        runtime: 'node-admin',
        service_key_configured: Boolean(SUPABASE_SERVICE_KEY),
        supabase_url_configured: Boolean(SUPABASE_URL),
        supabase_host: safeHost(SUPABASE_URL),
      });
    }

    if (req.method === 'GET' && req.query?.type === 'me') {
      const user = await requireUser(req, res);
      if (!user) return;
      let subscription = null;
      let subscription_error = null;
      try {
        subscription = await loadSubscriptionForUser(user.id);
      } catch (error) {
        subscription_error = formatError(error);
      }
      return res.status(200).json({
        user: { id: user.id, email: user.email },
        subscription,
        subscription_error,
        runtime: 'node-admin',
      });
    }

    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      const type = req.query?.type || 'summary';
      if (type !== 'summary') return res.status(400).json({ error: 'invalid type' });
      const users = await loadUsers();
      return res.status(200).json({
        admin,
        users,
        metrics: metrics(users),
        plans: PLAN_PRICES,
        runtime: 'node-admin',
      });
    }

    if (req.method === 'POST') {
      const data = parseBody(req.body);
      if (data.action === 'update_plan') {
        const userId = String(data.user_id || '').trim();
        const plan = String(data.plan || '').trim().toLowerCase();
        if (!userId || !VALID_PLANS.has(plan)) return res.status(400).json({ error: 'invalid user_id or plan' });
        await updateUser(userId, { plan, status: 'active', role: 'user' }, { preserveRole: true });
        return res.status(200).json({ ok: true, user_id: userId, plan });
      }

      if (data.action === 'update_user') {
        const userId = String(data.user_id || '').trim();
        const plan = String(data.plan || '').trim().toLowerCase();
        const status = String(data.status || '').trim().toLowerCase();
        const role = String(data.role || '').trim().toLowerCase();
        if (!userId || !VALID_PLANS.has(plan) || !VALID_STATUS.has(status) || !VALID_ROLES.has(role)) {
          return res.status(400).json({ error: 'invalid user update' });
        }
        await updateUser(userId, { plan, status, role });
        return res.status(200).json({ ok: true, user_id: userId, plan, status, role });
      }

      return res.status(400).json({ error: 'invalid action' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: formatError(error), runtime: 'node-admin' });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

async function requireUser(req, res) {
  if (!SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured', runtime: 'node-admin' });
    return null;
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'missing bearer token', runtime: 'node-admin' });
    return null;
  }

  const user = decodeSupabaseJwt(token);
  if (!user?.id) {
    res.status(401).json({ error: 'invalid token payload', runtime: 'node-admin' });
    return null;
  }

  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;

  const subscription = await loadSubscriptionForUser(user.id);
  if (subscription.role !== 'admin') {
    res.status(403).json({ error: 'admin role required', runtime: 'node-admin' });
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    plan: subscription.plan,
    status: subscription.status,
  };
}

async function loadSubscriptionForUser(userId) {
  const rows = await supabaseFetch(`/rest/v1/subscriptions?select=role,plan,status&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    headers: serviceHeaders(),
  });
  const row = Array.isArray(rows) && rows.length ? rows[0] : {};
  return {
    plan: row.plan || 'free',
    status: row.status || 'active',
    role: row.role || 'user',
  };
}

async function loadUsers() {
  const [subs, authMap] = await Promise.all([
    supabaseFetch('/rest/v1/subscriptions?select=user_id,plan,status,role,created_at&order=created_at.desc', {
      headers: serviceHeaders(),
    }),
    loadAuthUserMap(),
  ]);

  const subMap = new Map((Array.isArray(subs) ? subs : []).filter((row) => row.user_id).map((row) => [row.user_id, row]));
  const ids = [...new Set([...subMap.keys(), ...authMap.keys()])];
  return ids.map((userId) => {
    const row = subMap.get(userId) || {};
    const authUser = authMap.get(userId) || {};
    return {
      user_id: userId,
      email: authUser.email || `${userId.slice(0, 8)}...`,
      plan: row.plan || 'free',
      status: row.status || 'active',
      role: row.role || 'user',
      created_at: row.created_at || authUser.created_at || null,
      has_subscription: Boolean(row.user_id),
    };
  }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

async function loadAuthUserMap() {
  try {
    const data = await supabaseFetch('/auth/v1/admin/users?page=1&per_page=1000', { headers: serviceHeaders() });
    return new Map((data.users || []).filter((user) => user.id).map((user) => [
      user.id,
      { email: user.email, created_at: user.created_at },
    ]));
  } catch {
    return new Map();
  }
}

async function updateUser(userId, data, options = {}) {
  const exists = await subscriptionExists(userId);
  if (!exists) {
    await supabaseFetch('/rest/v1/subscriptions', {
      method: 'POST',
      headers: { ...serviceHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, ...data }),
      allowEmpty: true,
    });
    return;
  }

  const body = { ...data };
  if (options.preserveRole) delete body.role;
  await supabaseFetch(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
    allowEmpty: true,
  });
}

async function subscriptionExists(userId) {
  const rows = await supabaseFetch(`/rest/v1/subscriptions?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
    headers: serviceHeaders(),
  });
  return Array.isArray(rows) && rows.length > 0;
}

function metrics(users) {
  return {
    total: users.length,
    paid: users.filter((user) => user.plan !== 'free').length,
    free: users.filter((user) => user.plan === 'free').length,
    admins: users.filter((user) => user.role === 'admin').length,
    active: users.filter((user) => user.status === 'active').length,
    past_due: users.filter((user) => user.status === 'past_due').length,
    mrr: users.reduce((sum, user) => sum + (PLAN_PRICES[user.plan] || 0), 0),
  };
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
  if (options.allowEmpty && !text) return null;
  return text ? JSON.parse(text) : {};
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function formatError(error) {
  const message = String(error?.cause?.message || error?.message || error || 'unknown error');
  return message.slice(0, 500);
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
