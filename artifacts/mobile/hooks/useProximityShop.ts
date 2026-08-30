import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_PRODUCTS, DEMO_SHOPS, ENUM_TO_CATEGORY, ProximityProduct, ProximityShop } from '@/constants/proximityData';

interface ShopWithProducts {
  shop: ProximityShop | null;
  products: ProximityProduct[];
}

async function fetchShopWithProducts(shopId: string): Promise<ShopWithProducts> {
  if (!isSupabaseConfigured || !supabase) {
    const shop = DEMO_SHOPS.find(s => s.id === shopId) ?? null;
    const products = DEMO_PRODUCTS[shopId] ?? [];
    return { shop, products };
  }

  const [shopRes, productsRes] = await Promise.all([
    supabase.from('proximity_shops').select('*').eq('id', shopId).single(),
    supabase.from('proximity_products').select('*').eq('shop_id', shopId).order('created_at'),
  ]);

  if (shopRes.error) throw new Error(shopRes.error.message);

  // proximity_shops' real column is review_count, not rating_count (the
  // ProximityShop type's field, matched by DEMO_SHOPS' mock data) — the `as`
  // cast below let this typecheck while being silently undefined at runtime
  // for every real shop. Translated here, once, at the fetch boundary.
  const rawShop = shopRes.data as (ProximityShop & { category: string; review_count?: number }) | null;
  return {
    shop: rawShop ? {
      ...rawShop,
      category: ENUM_TO_CATEGORY[rawShop.category] ?? rawShop.category,
      rating_count: rawShop.review_count ?? rawShop.rating_count ?? 0,
    } : null,
    products: (productsRes.data ?? []) as ProximityProduct[],
  };
}

export function useProximityShop(shopId: string | null) {
  return useQuery({
    queryKey: ['proximity_shop', shopId],
    queryFn: () => fetchShopWithProducts(shopId!),
    enabled: !!shopId,
    staleTime: 1000 * 60 * 5,
  });
}
