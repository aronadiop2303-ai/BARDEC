import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type DeliveryRateCode = 'standard' | 'express' | 'overnight' | 'drone' | 'relay_point' | 'store_pickup';

export interface DeliveryRateRow {
  code: DeliveryRateCode;
  delivery_type: string;
  label: string;
  cost: number;
  days: string;
}

// Repli si Supabase est indisponible/vide — mêmes valeurs que celles en dur
// avant ce chantier, pour ne jamais casser le checkout tant que la table
// delivery_rates (admin-managed) n'a pas encore été lue avec succès.
const FALLBACK_RATES: DeliveryRateRow[] = [
  { code: 'standard',     delivery_type: 'home',         label: 'Standard',                cost: 0,  days: '5–7 jours' },
  { code: 'express',      delivery_type: 'home',         label: 'Express',                 cost: 15, days: '2–3 jours' },
  { code: 'overnight',    delivery_type: 'home',         label: 'Nuit',                     cost: 29, days: '1 jour ouvrable' },
  { code: 'drone',        delivery_type: 'drone',        label: 'Livraison par drone',      cost: 12, days: '2–4 heures' },
  { code: 'relay_point',  delivery_type: 'relay_point',  label: 'Point relais',              cost: 0,  days: '3–5 jours' },
  { code: 'store_pickup', delivery_type: 'store_pickup', label: 'Retrait en magasin',        cost: 0,  days: 'Dès disponibilité' },
];

async function fetchActiveDeliveryRates(): Promise<DeliveryRateRow[]> {
  if (!isSupabaseConfigured || !supabase) return FALLBACK_RATES;
  const { data, error } = await supabase
    .from('delivery_rates')
    .select('code, delivery_type, label, cost, days')
    .eq('active', true);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? (data as DeliveryRateRow[]) : FALLBACK_RATES;
}

export function useDeliveryRates() {
  return useQuery({
    queryKey: ['delivery_rates_active'],
    queryFn: fetchActiveDeliveryRates,
    staleTime: 1000 * 60 * 10,
  });
}
