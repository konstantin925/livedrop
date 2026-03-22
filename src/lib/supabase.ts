import { createClient } from '@supabase/supabase-js';

const readEnv = (value?: string) => value?.trim() ?? '';
const looksLikePlaceholder = (value: string) =>
  !value ||
  value.includes('your-project.supabase.co') ||
  value.includes('your-public-anon-key');

const supabaseUrl = readEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const siteUrl = readEnv(import.meta.env.VITE_SITE_URL);

export const resolvedSupabaseUrl = supabaseUrl;
export const hasSupabaseAnonKey = Boolean(supabaseAnonKey) && !looksLikePlaceholder(supabaseAnonKey);

export const hasSupabaseConfig =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !looksLikePlaceholder(supabaseUrl) &&
  !looksLikePlaceholder(supabaseAnonKey);

export const supabaseConfigIssue = hasSupabaseConfig
  ? ''
  : 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.';

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const supabaseEdgeClient = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

export const getAuthRedirectUrl = () => {
  if (siteUrl) {
    return siteUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'http://localhost:3000';
};
