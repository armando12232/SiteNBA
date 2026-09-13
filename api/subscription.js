import { loadUserAccess } from './_planGuard.js';
import { normalizeSupabaseUrl, safeHost } from './_supabaseAuth.js';

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const SITE_URL = String(process.env.SITE_URL || 'https://site-nba-ten.vercel.app').trim();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    const access = await loadUserAccess(req.headers.authorization, {
      serviceKey: SUPABASE_SERVICE_KEY,
      supabaseUrl: SUPABASE_URL,
    });
    return res.status(200).json({ ...access, runtime: 'node-subscription' });
  } catch (error) {
    const status = [401, 500, 503].includes(error.status) ? error.status : 500;
    const message = status === 401
      ? 'invalid bearer token'
      : status === 503
        ? 'subscription service unavailable'
        : 'subscription service is not configured';
    return res.status(status).json({ error: message, supabase_host: safeHost(SUPABASE_URL), runtime: 'node-subscription' });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
}
