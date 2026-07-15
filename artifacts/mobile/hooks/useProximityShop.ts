import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_PRODUCTS, DEMO_SHOPS, ProximityProduct, ProximityShop } from '@/constants/proximityData';

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

  return {
    shop: shopRes.data as ProximityShop | null,
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
