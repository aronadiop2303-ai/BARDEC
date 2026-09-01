import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_SHOPS, ProximityCategory, ProximityShop } from '@/constants/proximityData';
import { useShopCategories } from '@/hooks/useShopCategories';

interface UseProximityShopsParams {
  lat: number | null;
  lng: number | null;
  radiusKm?: number;
  // A category label — plain string, not the old ProximityCategory literal
  // union, since the set of valid categories now comes from shop_categories
  // at runtime (see useShopCategories).
  category?: string | null;
}

async function fetchNearbyShops(
  lat: number,
  lng: number,
  radiusKm: number,
  category: string | null | undefined,
  labelToSlug: Record<string, string>,
  slugToLabel: Record<string, string>,
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
    filter_category: category ? labelToSlug[category] : null,
  });

  if (error) throw new Error(error.message);
  // nearby_shops() returns review_count (proximity_shops' real column) —
  // translated to rating_count here, once, same as useProximityShop.ts's
  // fetch boundary for the shop detail screen, so ShopBottomSheet.tsx's
  // existing shop.rating_count read doesn't need to change.
  return ((data ?? []) as (ProximityShop & { review_count?: number })[]).map(s => ({
    ...s,
    category: (slugToLabel[s.category as unknown as string] ?? s.category) as ProximityCategory,
    rating_count: s.review_count ?? s.rating_count ?? 0,
  }));
}

export function useProximityShops({ lat, lng, radiusKm = 10, category }: UseProximityShopsParams) {
  const { labelToSlug, slugToLabel } = useShopCategories();
  return useQuery({
    queryKey: ['proximity_shops', lat, lng, radiusKm, category],
    queryFn: () => fetchNearbyShops(lat!, lng!, radiusKm, category, labelToSlug, slugToLabel),
    enabled: lat !== null && lng !== null,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
