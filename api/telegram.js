import {
  parseTelegramUpdate,
  scoreIntelMatch,
} from './_telegramIntel.js';
import { verifySupabaseToken } from './_supabaseAuth.js';

const DEFAULT_SUPABASE_URL = 'https://dhirxfoxcswctxcjzvhf.supabase.co';
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim();
const PLAN_RANK = { free: 0, basic: 1, pro: 2, premium: 3 };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  try {
    if (req.method === 'GET' && req.query?.type === 'health') {
      return res.status(200).json({
        ok: true,
        runtime: 'node-telegram',
        service_key_configured: Boolean(SUPABASE_SERVICE_KEY),
        webhook_secret_configured: Boolean(TELEGRAM_WEBHOOK_SECRET),
        chat_id_configured: Boolean(TELEGRAM_CHAT_ID),
      });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured', runtime: 'node-telegram' });
    }

    if (req.method === 'POST') return handleWebhook(req, res);
    if (req.method === 'GET') return handleLookup(req, res);

    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: formatError(error), runtime: 'node-telegram' });
  }
}

async function handleWebhook(req, res) {
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secret = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
    if (secret !== TELEGRAM_WEBHOOK_SECRET) return res.status(401).json({ error: 'invalid telegram secret' });
  }

  const update = parseBody(req.body);
  const parsed = parseTelegramUpdate(update);
  if (!parsed) return res.status(200).json({ ok: true, ignored: true });

  if (TELEGRAM_CHAT_ID && String(parsed.chat_id) !== TELEGRAM_CHAT_ID) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'chat not allowed' });
  }

  await insertIntel(parsed, update);
  return res.status(200).json({ ok: true, saved: true, type: parsed.type, teams: parsed.teams?.length || 0 });
}

async function handleLookup(req, res) {
  const access = await requireFootballAccess(req, res);
  if (!access) return;

  const home = String(req.query?.home || '').trim();
  const away = String(req.query?.away || '').trim();
  if (!home && !away) return res.status(400).json({ error: 'home or away required' });

  const rows = await supabaseFetch('/rest/v1/telegram_match_intel?select=*&type=eq.discipline&order=created_at.desc&limit=50', {
    headers: serviceHeaders(),
  });
  const fixture = { home, away };
  const matches = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ ...row, match_score: scoreIntelMatch(row, fixture) }))
    .filter((row) => row.match_score > 0)
    .sort((a, b) => {
      if (a.match_score !== b.match_score) return b.match_score - a.match_score;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

  return res.status(200).json({
    intel: matches[0] || null,
    matches: matches.slice(0, 5),
    count: matches.length,
    runtime: 'node-telegram',
  });
}

async function requireFootballAccess(req, res) {
  try {
    const user = await verifySupabaseToken(SUPABASE_URL, SUPABASE_SERVICE_KEY, req.headers.authorization);
    const rows = await supabaseFetch(`/rest/v1/subscriptions?select=plan,status,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
      headers: serviceHeaders(),
    });
    const row = Array.isArray(rows) && rows.length ? rows[0] : {};
    const plan = row.plan || 'free';
    const status = row.status || 'active';
    const role = row.role || 'user';

    if (role === 'admin') return { user, plan, status, role };
    if (!['active', 'trialing'].includes(status)) {
      res.status(403).json({ error: 'subscription inactive', feature: 'football', runtime: 'node-telegram' });
      return null;
    }
    if ((PLAN_RANK[plan] || 0) < PLAN_RANK.pro) {
      res.status(403).json({
        error: 'plan upgrade required',
        feature: 'football',
        required_plan: 'pro',
        current_plan: plan,
        runtime: 'node-telegram',
      });
      return null;
    }
    return { user, plan, status, role };
  } catch (error) {
    res.status(error.status || 500).json({ error: formatError(error), feature: 'football', runtime: 'node-telegram' });
    return null;
  }
}

async function insertIntel(parsed, rawUpdate) {
  const body = {
    chat_id: parsed.chat_id,
    message_id: parsed.message_id,
    message_date: parsed.message_date,
    type: parsed.type,
    home_team: parsed.home_team,
    away_team: parsed.away_team,
    referee: parsed.referee,
    avg_ucl_cards: parsed.avg_ucl_cards,
    avg_league_cards: parsed.avg_league_cards,
    ref_last: parsed.ref_last,
    teams: parsed.teams,
    source_text: parsed.source_text,
    raw_update: rawUpdate,
  };

  await supabaseFetch('/rest/v1/telegram_match_intel', {
    method: 'POST',
    headers: {
      ...serviceHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token');
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

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(raw)) return DEFAULT_SUPABASE_URL;
  return raw;
}

function formatError(error) {
  return String(error?.cause?.message || error?.message || error || 'unknown error').slice(0, 500);
}
