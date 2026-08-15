import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bgvyimntdvilqofovuea.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RlpuI-_h6lS2JFPLXAHQYg_bhU6OUso";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
