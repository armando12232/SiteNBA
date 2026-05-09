import { createClient } from '@supabase/supabase-js';

const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const SUPABASE_URL = String(metaEnv.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(metaEnv.VITE_SUPABASE_ANON_KEY || '').trim();

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const SUPABASE_CONFIG_ERROR = 'Login indisponível no momento. Tente novamente mais tarde.';

export const supabase = createClient(
  SUPABASE_CONFIGURED ? SUPABASE_URL : 'https://example.supabase.co',
  SUPABASE_CONFIGURED ? SUPABASE_ANON_KEY : 'missing-anon-key',
);
