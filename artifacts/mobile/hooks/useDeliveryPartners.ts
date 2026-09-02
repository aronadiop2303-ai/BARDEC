import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface DeliveryPartnerRow {
  id: string;
  name: string;
  phone: string;
  zone: string | null;
}

// Internal couriers only (type = 'internal') — external_api partners aren't
// usable yet (blocked on the external partner's API details, see BUGS.md),
// so they must never appear as a selectable option here.
async function fetchActiveInternalPartners(): Promise<DeliveryPartnerRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('delivery_partners')
    .select('id, name, phone, zone')
    .eq('active', true)
    .eq('type', 'internal')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DeliveryPartnerRow[];
}

export function useDeliveryPartners() {
  return useQuery({
    queryKey: ['delivery_partners_active_internal'],
    queryFn: fetchActiveInternalPartners,
    staleTime: 1000 * 60 * 5,
  });
}
