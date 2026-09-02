import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface RelayPointRow {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

// No demo-mode fallback data here (unlike shop_categories) — relay_points is
// a genuinely new, admin-populated table (0 rows until an admin adds some
// via admin.tsx's "Logistique" tab). An empty list is the honest state, not
// an error, until an admin sets some up — the checkout screen shows an
// explicit "no relay point available yet" message for that case.
async function fetchActiveRelayPoints(): Promise<RelayPointRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('relay_points')
    .select('id, name, address, latitude, longitude')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RelayPointRow[];
}

export function useRelayPoints() {
  return useQuery({
    queryKey: ['relay_points_active'],
    queryFn: fetchActiveRelayPoints,
    staleTime: 1000 * 60 * 10,
  });
}
