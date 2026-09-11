import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface PickupStoreRow {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  hours: string;
}

// Même approche que useRelayPoints : pas de données de démo, pickup_stores
// est une table alimentée par l'admin (onglet Logistique → Magasins). Liste
// vide tant qu'aucun magasin n'est créé — état honnête, pas une erreur.
async function fetchActivePickupStores(): Promise<PickupStoreRow[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('pickup_stores')
    .select('id, name, address, city, phone, hours')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PickupStoreRow[];
}

export function usePickupStores() {
  return useQuery({
    queryKey: ['pickup_stores_active'],
    queryFn: fetchActivePickupStores,
    staleTime: 1000 * 60 * 10,
  });
}
