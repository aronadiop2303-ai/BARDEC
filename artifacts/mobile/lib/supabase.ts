import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// ─────────────────────────────────────────────
// Database helpers
// ─────────────────────────────────────────────

export async function checkForceUpdate(currentVersion: string): Promise<{ mustUpdate: boolean; latestVersion: string; storeUrl: string } | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('app_version')
    .select('min_version, latest_version, ios_url, android_url')
    .single();
  if (!data) return null;
  const mustUpdate = compareVersions(currentVersion, data.min_version) < 0;
  return { mustUpdate, latestVersion: data.latest_version, storeUrl: data.ios_url };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

export async function logAuditEvent(action: string, details: Record<string, unknown>, userId?: string) {
  if (!supabase) return;
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    details,
    created_at: new Date().toISOString(),
  });
}

export default supabase;
