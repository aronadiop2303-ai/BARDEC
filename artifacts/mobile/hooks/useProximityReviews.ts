import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_REVIEWS, ProximityReview } from '@/constants/proximityData';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  shop_id: string;
  user_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  // joined from profiles when available
  user_name?: string;
}

// ─────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────

async function fetchReviews(shopId: string): Promise<ProximityReview[]> {
  if (!isSupabaseConfigured || !supabase) {
    return DEMO_REVIEWS[shopId] ?? [];
  }

  const { data, error } = await supabase
    .from('proximity_reviews')
    .select('id, shop_id, user_id, rating, comment, created_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: ReviewRow) => ({
    id: r.id,
    shop_id: r.shop_id,
    user_id: r.user_id,
    user_name: r.user_name ?? 'Client anonyme',
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
  }));
}

async function fetchUserReview(shopId: string, userId: string | null): Promise<ProximityReview | null> {
  if (!userId) return null;

  if (!isSupabaseConfigured || !supabase) {
    // En mode démo : considérer que l'utilisateur demo n'a pas encore voté
    return null;
  }

  const { data, error } = await supabase
    .from('proximity_reviews')
    .select('id, shop_id, user_id, rating, comment, created_at')
    .eq('shop_id', shopId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    shop_id: data.shop_id,
    user_id: data.user_id,
    user_name: 'Moi',
    rating: data.rating,
    comment: data.comment,
    created_at: data.created_at,
  };
}

// ─────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────

/** Récupère la liste des avis pour un commerce */
export function useProximityReviews(shopId: string | null) {
  return useQuery({
    queryKey: ['proximity_reviews', shopId],
    queryFn: () => fetchReviews(shopId!),
    enabled: !!shopId,
    staleTime: 1000 * 60 * 2,
  });
}

/** Récupère l'avis de l'utilisateur connecté pour un commerce */
export function useMyProximityReview(shopId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['proximity_my_review', shopId, userId],
    queryFn: () => fetchUserReview(shopId!, userId),
    enabled: !!shopId && !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

/** Soumet ou met à jour un avis */
export function useSubmitProximityReview(shopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rating, comment }: { rating: number; comment?: string }) => {
      if (!isSupabaseConfigured || !supabase) {
        // Mode démo : simuler le succès
        return;
      }

      const { error } = await supabase.rpc('submit_proximity_review', {
        p_shop_id: shopId,
        p_rating: rating,
        p_comment: comment ?? null,
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      // Invalider les avis et les données du commerce pour rafraîchir la note
      queryClient.invalidateQueries({ queryKey: ['proximity_reviews', shopId] });
      queryClient.invalidateQueries({ queryKey: ['proximity_my_review', shopId] });
      queryClient.invalidateQueries({ queryKey: ['proximity_shop', shopId] });
    },
  });
}
