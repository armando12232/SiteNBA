export const DEFAULT_SUPABASE_URL = 'https://dhirxfoxcswctxcjzvhf.supabase.co';

export function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(raw)) return DEFAULT_SUPABASE_URL;
  return raw;
}

export function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid';
  }
}

export function serviceHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
}

export function extractBearerToken(value) {
  return String(value || '').replace(/^Bearer\s+/i, '').trim();
}

export async function verifySupabaseToken(supabaseUrl, serviceKey, authorization) {
  const token = extractBearerToken(authorization);
  if (!serviceKey) throw httpError('SUPABASE_SERVICE_KEY is not configured', 500);
  if (!token) throw httpError('missing bearer token', 401);

  const response = await fetchWithRetry(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Accept: 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();

  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 401 : 500;
    throw httpError(status === 401 ? 'invalid bearer token' : text || `Supabase auth HTTP ${response.status}`, status);
  }

  const data = text ? JSON.parse(text) : {};
  if (!data?.id) throw httpError('invalid token payload', 401);

  return {
    id: data.id,
    email: data.email || null,
  };
}

export async function supabaseFetch(supabaseUrl, path, options = {}) {
  const response = await fetchWithRetry(`${supabaseUrl}${path}`, {
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

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(4500) });
      if (response.status < 500 || attempt === attempts - 1) return response;
      lastError = new Error(`Supabase HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError || new Error('Supabase request failed');
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

