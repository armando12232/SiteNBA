import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dhirxfoxcswctxcjzvhf.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DC3I02jLVjM013WrODpgCg_xiPl1rsl';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
