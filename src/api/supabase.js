import { createClient } from '@supabase/supabase-js';

const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const SUPABASE_URL = metaEnv.VITE_SUPABASE_URL || 'https://dhirxfoxcswctxcjzvhf.supabase.co';
const SUPABASE_ANON_KEY = metaEnv.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DC3I02jLVjM013WrODpgCg_xiPl1rsl';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
