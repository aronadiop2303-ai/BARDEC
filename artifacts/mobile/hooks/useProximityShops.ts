import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CATEGORY_TO_ENUM, DEMO_SHOPS, ENUM_TO_CATEGORY, ProximityCategory, ProximityShop } from '@/constants/proximityData';

interface UseProximityShopsParams {
  lat: number | null;
  lng: number | null;
  radiusKm?: number;
  category?: ProximityCategory | null;
}

async function fetchNearbyShops(
  lat: number,
  lng: number,
  radiusKm: number,
  category: ProximityCategory | null | undefined,
): Promise<ProximityShop[]> {
  if (!isSupabaseConfigured || !supabase) {
    // Mode démo : retourner les commerces fictifs, filtrés si nécessaire
    const filtered = category
      ? DEMO_SHOPS.filter(s => s.category === category)
      : DEMO_SHOPS;
    return filtered;
  }

  const { data, error } = await supabase.rpc('nearby_shops', {
    user_lat: lat,
    user_lng: lng,
    radius_km: radiusKm,
    filter_category: category ? CATEGORY_TO_ENUM[category] : null,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as ProximityShop[]).map(s => ({
    ...s,
    category: ENUM_TO_CATEGORY[s.category as unknown as string] ?? s.category,
  }));
}

export function useProximityShops({ lat, lng, radiusKm = 5, category }: UseProximityShopsParams) {
  return useQuery({
    queryKey: ['proximity_shops', lat, lng, radiusKm, category],
    queryFn: () => fetchNearbyShops(lat!, lng!, radiusKm, category),
    enabled: lat !== null && lng !== null,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
