import { createClient } from '@supabase/supabase-js';

const readEnv = (value?: string) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.replace(/^['"]+|['"]+$/g, '').trim();
};

const isLikelyHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const looksLikePlaceholder = (value: string) =>
  !value ||
  value.includes('your-project.supabase.co') ||
  value.includes('your-public-anon-key');

const supabaseUrl = readEnv(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const supabaseAnonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const siteUrl = readEnv(import.meta.env.VITE_SITE_URL);
const hasValidSupabaseUrl = isLikelyHttpUrl(supabaseUrl);

export const resolvedSupabaseUrl = supabaseUrl;
export const hasSupabaseAnonKey = Boolean(supabaseAnonKey) && !looksLikePlaceholder(supabaseAnonKey);

export const hasSupabaseConfig =
  Boolean(supabaseUrl && supabaseAnonKey && hasValidSupabaseUrl) &&
  !looksLikePlaceholder(supabaseUrl) &&
  !looksLikePlaceholder(supabaseAnonKey);

export const supabaseConfigIssue = hasSupabaseConfig
  ? ''
  : !supabaseUrl || !supabaseAnonKey
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.'
    : !hasValidSupabaseUrl
      ? 'VITE_SUPABASE_URL is not a valid http(s) URL.'
      : 'Supabase configuration is invalid.';

const safeSupabaseHost = (() => {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return '';
  }
})();

export const supabaseRuntimeDiagnostics = {
  urlPresent: Boolean(supabaseUrl),
  urlLooksValid: hasValidSupabaseUrl,
  urlHost: safeSupabaseHost || '(invalid URL)',
  anonKeyPresent: Boolean(supabaseAnonKey),
  anonKeyLength: supabaseAnonKey.length,
  hasConfig: hasSupabaseConfig,
  configIssue: supabaseConfigIssue,
};

if (import.meta.env.DEV) {
  console.info('[LiveDrop] Supabase runtime diagnostics', supabaseRuntimeDiagnostics);
}

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
