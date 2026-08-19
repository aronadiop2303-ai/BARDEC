import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ENUM_TO_CATEGORY, ProximityProduct, ProximityShop } from '@/constants/proximityData';
import { useAuth } from '@/context/AuthContext';

async function fetchMyShop(userId: string): Promise<ProximityShop | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('proximity_shops')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...data, category: ENUM_TO_CATEGORY[data.category as string] ?? data.category } as ProximityShop;
}

async function fetchMyProducts(shopId: string): Promise<ProximityProduct[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from('proximity_products')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at');

  if (error) throw new Error(error.message);
  return (data ?? []) as ProximityProduct[];
}

export function useMyProximityShop() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const shopQuery = useQuery({
    queryKey: ['my_proximity_shop', userId],
    queryFn: () => fetchMyShop(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  const shopId = shopQuery.data?.id ?? null;

  const productsQuery = useQuery({
    queryKey: ['my_proximity_products', shopId],
    queryFn: () => fetchMyProducts(shopId!),
    enabled: !!shopId,
    staleTime: 1000 * 60 * 2,
  });

  return {
    shop: shopQuery.data ?? null,
    products: productsQuery.data ?? [],
    isLoading: shopQuery.isLoading,
    isLoadingProducts: productsQuery.isLoading,
    refetch: shopQuery.refetch,
    refetchProducts: productsQuery.refetch,
  };
}

/** Supprime un produit et invalide le cache */
export function useDeleteProximityProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      if (!supabase) throw new Error('Supabase non configuré');
      const { error } = await supabase.from('proximity_products').delete().eq('id', productId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my_proximity_products'] }); },
  });
}

/** Toggle is_active d'une boutique */
export function useToggleShopActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shopId, isActive }: { shopId: string; isActive: boolean }) => {
      if (!supabase) throw new Error('Supabase non configuré');
      const { error } = await supabase
        .from('proximity_shops')
        .update({ is_active: isActive })
        .eq('id', shopId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my_proximity_shop'] }); },
  });
}
