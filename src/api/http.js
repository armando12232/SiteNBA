import { SUPABASE_CONFIGURED, supabase } from './supabase.js';

export async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { auth, headers, ...fetchOptions } = options;
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...(headers || {}),
        ...(auth ? await authHeader() : {}),
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.error) {
      const message = data?.error || `HTTP ${response.status}`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    if (data == null) {
      throw Object.assign(new Error('invalid server response'), { status: 502 });
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function authHeader() {
  if (!SUPABASE_CONFIGURED) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
