import { useCallback, useEffect, useState } from 'react';
import { MOCK_PRODUCTS, Product } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// ─── Map Supabase row → Product interface ─────────────────────────────────────
function mapRow(p: any): Product {
  return {
    id:             p.id,
    name:           p.name_i18n?.fr ?? p.name_i18n?.en ?? Object.values(p.name_i18n ?? {})[0] ?? '—',
    description:    p.description_i18n?.fr ?? p.description_i18n?.en ?? '',
    images:         Array.isArray(p.images) && p.images.length > 0 ? p.images : [],
    pricePublic:    p.price_public    ?? 0,
    priceWholesale: p.price_wholesale ?? 0,
    minQuantity:    p.min_order_quantity ?? 1,
    category:       p.category ?? 'Général',
    vendorId:       p.vendor_id ?? '',
    vendorName:     p.vendor_name ?? 'Vendeur BARDEC',
    rating:         p.rating      ?? 0,
    reviewCount:    p.review_count ?? 0,
    stock:          p.stock_quantity ?? 0,
    tags:           [],
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Fetches all active products from Supabase when configured, falls back to
// MOCK_PRODUCTS in demo mode.  Category filtering is left to the caller so
// switching categories is instant (no extra round-trip).
export function useProducts() {
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isSupabaseConfigured && supabase) {
      const { data, error: err } = await supabase
        .from('products')
        .select(
          'id, name_i18n, description_i18n, images, price_public, price_wholesale, ' +
          'min_order_quantity, stock_quantity, category, vendor_id, rating, review_count'
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (err) {
        // Network/config error → fall back to mock so the UI is never blank
        setError(err.message);
        setProducts(MOCK_PRODUCTS);
      } else {
        // Empty table → genuine empty state (not mock); show "Aucun produit"
        setProducts((data ?? []).map(mapRow));
      }
    } else {
      // Demo mode
      setProducts(MOCK_PRODUCTS);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
}
