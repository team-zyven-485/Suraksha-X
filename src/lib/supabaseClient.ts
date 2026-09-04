import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Browser-safe Supabase client — uses only the publishable/anon key, which is
// safe to expose (RLS enforces access control server-side). The service-role
// key never appears in frontend code; it lives only in the FastAPI backend's
// environment.
let client: SupabaseClient | null = null;
let attempted = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  if (attempted) return null;
  attempted = true;

  const env = (import.meta as any).env || {};
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey || typeof url !== 'string' || !url.startsWith('http')) {
    console.warn('[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not configured — running on local mock data.');
    return null;
  }

  try {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return client;
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client:', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}
