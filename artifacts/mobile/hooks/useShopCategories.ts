import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { CATEGORY_TO_ENUM, PROXIMITY_CATEGORIES, SLUG_TO_CATEGORY_KEY } from '@/constants/proximityData';

export interface ShopCategoryRow {
  slug: string;
  // Stable French identity text — matches the keys of CATEGORY_COLORS,
  // CATEGORY_ICONS and PROXIMITY_SUBCATEGORIES in proximityData.ts. NOT for
  // display: use labelToDisplayLabel/displayLabels for user-facing text.
  label: string;
  icon: string | null;
}

// Reverse of CATEGORY_TO_ENUM: DB slug -> stable French identity label.
const CATEGORY_LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  PROXIMITY_CATEGORIES.map(label => [CATEGORY_TO_ENUM[label], label]),
);

const FALLBACK_ROWS: ShopCategoryRow[] = PROXIMITY_CATEGORIES.map(label => ({
  slug: CATEGORY_TO_ENUM[label],
  label,
  icon: null,
}));

async function fetchShopCategories(): Promise<ShopCategoryRow[]> {
  if (!isSupabaseConfigured || !supabase) return FALLBACK_ROWS;

  const { data, error } = await supabase
    .from('shop_categories')
    .select('slug, icon')
    .eq('active', true)
    .order('display_order', { ascending: true });

  // Falls back to the known-good static list on error/empty rather than
  // leaving category pickers empty — shop_categories has no admin UI to
  // edit it yet (separate ticket), so this fallback drifting out of sync
  // is a low, acceptable risk.
  if (error || !data || data.length === 0) return FALLBACK_ROWS;

  return data.map(row => ({
    slug: row.slug,
    // label_i18n is ignored here on purpose — only "fr" is populated in
    // production, and displayed text is driven by t()/SLUG_TO_CATEGORY_KEY
    // instead (see labelToDisplayLabel below), same as product categories.
    label: CATEGORY_LABEL_BY_SLUG[row.slug] ?? row.slug,
    icon: row.icon,
  }));
}

/**
 * Single source of truth for the 7 proximity-shop categories (backed by
 * public.shop_categories), replacing the hardcoded PROXIMITY_CATEGORIES
 * list across the category picker (register-shop), the Nearby filters, and
 * admin's shop list label. CATEGORY_TO_ENUM/ENUM_TO_CATEGORY are rebuilt
 * here from the live rows instead of the static constants.
 *
 * The category list itself is dynamic (from shop_categories), but the text
 * shown to the user still goes through t() — labelToDisplayLabel/displayLabels
 * resolve each row's slug to its cat_<slug> translation key (20 languages,
 * translations.ts), while `labels`/`labelToSlug`/`slugToLabel` keep returning
 * the stable French identity that CATEGORY_COLORS/CATEGORY_ICONS/
 * PROXIMITY_SUBCATEGORIES and form state are keyed by.
 */
export function useShopCategories() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: ['shop_categories'],
    queryFn: fetchShopCategories,
    staleTime: 1000 * 60 * 60, // reference data, changes rarely (no admin UI yet)
  });

  const categories = data ?? FALLBACK_ROWS;
  const labels = categories.map(c => c.label);
  const labelToSlug: Record<string, string> = Object.fromEntries(categories.map(c => [c.label, c.slug]));
  const slugToLabel: Record<string, string> = Object.fromEntries(categories.map(c => [c.slug, c.label]));
  const slugToIcon: Record<string, string | null> = Object.fromEntries(categories.map(c => [c.slug, c.icon]));
  const labelToDisplayLabel: Record<string, string> = Object.fromEntries(
    categories.map(c => {
      const key = SLUG_TO_CATEGORY_KEY[c.slug];
      return [c.label, key ? t(key) : c.label];
    }),
  );
  const displayLabels = labels.map(l => labelToDisplayLabel[l] ?? l);

  return { categories, labels, displayLabels, labelToDisplayLabel, labelToSlug, slugToLabel, slugToIcon, isLoading };
}
