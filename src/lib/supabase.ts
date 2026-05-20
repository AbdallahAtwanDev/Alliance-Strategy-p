import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jgqkvludlumxsrqmqufr.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Lrz_-JkhrBaYVNCSerHQcw_F5qgERzr';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
