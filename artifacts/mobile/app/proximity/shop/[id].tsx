import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useProximityShop } from '@/hooks/useProximityShop';
import { useProximityCart } from '@/context/ProximityCartContext';
import { CATEGORY_COLORS, ProximityProduct, ProximityReview } from '@/constants/proximityData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import {
  useProximityReviews,
  useMyProximityReview,
  useSubmitProximityReview,
} from '@/hooks/useProximityReviews';

const GREEN = '#22C55E';
const STAR_COLOR = '#F59E0B';
const STAR_EMPTY = '#D1D5DB';

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StarRow({
  value,
  onChange,
  size = 28,
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readonly?: boolean;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity
          key={n}
          disabled={readonly}
          onPress={() => onChange?.(n)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={{ fontSize: size, color: n <= value ? STAR_COLOR : STAR_EMPTY }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ReviewCard({ review, colors }: { review: ProximityReview; colors: ReturnType<typeof useColors> }) {
  const date = new Date(review.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  return (
    <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.reviewHeader}>
        <View style={[styles.reviewAvatar, { backgroundColor: colors.muted }]}>
          <Text style={[styles.reviewAvatarTxt, { color: colors.mutedForeground }]}>
            {(review.user_name ?? 'C')[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.reviewName, { color: colors.foreground }]}>
            {review.user_name ?? 'Client anonyme'}
          </Text>
          <Text style={[styles.reviewDate, { color: colors.mutedForeground }]}>{date}</Text>
        </View>
        <StarRow value={review.rating} size={14} readonly />
      </View>
      {review.comment ? (
        <Text style={[styles.reviewComment, { color: colors.foreground }]}>{review.comment}</Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────

export default function ShopProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useProximityShop(id ?? null);
  const { addItem, totalItems, shopId: cartShopId } = useProximityCart();
  const { user } = useAuth();
  const [adding, setAdding] = useState<Record<string, boolean>>({});

  // Review state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState('');

  const { data: reviews = [], isLoading: reviewsLoading } = useProximityReviews(id ?? null);
  const { data: myReview } = useMyProximityReview(id ?? null, user?.id ?? null);
  const { mutate: submitReview, isPending: submitting } = useSubmitProximityReview(id ?? '');

  const shop = data?.shop ?? null;
  const products = data?.products ?? [];
  const catColor = shop ? (CATEGORY_COLORS[shop.category] ?? GREEN) : GREEN;

  async function handleAdd(product: ProximityProduct) {
    if (!shop) return;
    setAdding(prev => ({ ...prev, [product.id]: true }));

    const { switched } = await addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      quantity: 1,
      shopId: shop.id,
      shopName: shop.name,
    });

    setAdding(prev => ({ ...prev, [product.id]: false }));

    if (switched) {
      Alert.alert(
        'Nouveau commerce',
        `Ton panier précédent (${cartShopId}) a été vidé. Tu commandes maintenant chez ${shop.name}.`,
        [{ text: 'OK' }],
      );
    }
  }

  function handleOpenReviewForm() {
    if (!user) {
      Alert.alert('Connexion requise', 'Connecte-toi pour laisser un avis.', [{ text: 'OK' }]);
      return;
    }
    if (myReview) {
      // Pre-fill with existing review for editing
      setDraftRating(myReview.rating);
      setDraftComment(myReview.comment ?? '');
    } else {
      setDraftRating(0);
      setDraftComment('');
    }
    setShowReviewForm(true);
  }

  function handleSubmitReview() {
    if (draftRating === 0) {
      Alert.alert('Note requise', 'Choisis une note entre 1 et 5 étoiles.', [{ text: 'OK' }]);
      return;
    }
    submitReview(
      { rating: draftRating, comment: draftComment.trim() || undefined },
      {
        onSuccess: () => {
          setShowReviewForm(false);
          setDraftRating(0);
          setDraftComment('');
        },
        onError: (err) => {
          Alert.alert('Erreur', err.message, [{ text: 'OK' }]);
        },
      },
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={GREEN} size="large" />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Commerce introuvable.</Text>
      </View>
    );
  }

  const avgRating = shop.rating ?? 0;
  const ratingCount = shop.rating_count ?? 0;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.shopHeader, { paddingTop: insets.top + 8, backgroundColor: catColor }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
          <Text style={styles.shopSub}>{shop.subcategory ?? shop.category}</Text>
        </View>
        {totalItems > 0 && (
          <TouchableOpacity
            style={styles.cartBadge}
            onPress={() => router.push('/proximity/cart' as any)}
          >
            <Feather name="shopping-bag" size={18} color={catColor} />
            <Text style={[styles.cartCount, { color: catColor }]}>{totalItems}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <>
            {/* Shop meta */}
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {shop.address && (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.metaTxt, { color: colors.foreground }]}>{shop.address}</Text>
                </View>
              )}
              {shop.phone && (
                <View style={styles.metaRow}>
                  <Feather name="phone" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.metaTxt, { color: colors.primary }]}>{shop.phone}</Text>
                </View>
              )}
              {shop.description && (
                <Text style={[styles.metaDesc, { color: colors.mutedForeground }]}>{shop.description}</Text>
              )}

              {/* Rating summary */}
              <View style={[styles.ratingRow, { borderTopColor: colors.border }]}>
                <StarRow value={Math.round(avgRating)} size={16} readonly />
                <Text style={[styles.ratingVal, { color: colors.foreground }]}>
                  {avgRating > 0 ? avgRating.toFixed(1) : '—'}
                </Text>
                <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>
                  {ratingCount > 0 ? `(${ratingCount} avis)` : 'Aucun avis'}
                </Text>
                <TouchableOpacity
                  style={[styles.reviewBtn, { borderColor: catColor }]}
                  onPress={handleOpenReviewForm}
                >
                  <Text style={[styles.reviewBtnTxt, { color: catColor }]}>
                    {myReview ? 'Modifier mon avis' : 'Laisser un avis'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Review form */}
            {showReviewForm && (
              <View style={[styles.reviewForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.reviewFormTitle, { color: colors.foreground }]}>
                  {myReview ? 'Modifier votre avis' : 'Votre avis'}
                </Text>
                <StarRow value={draftRating} onChange={setDraftRating} size={36} />
                <TextInput
                  style={[styles.reviewInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Commentaire (facultatif)"
                  placeholderTextColor={colors.mutedForeground}
                  value={draftComment}
                  onChangeText={setDraftComment}
                  multiline
                  maxLength={300}
                  numberOfLines={3}
                />
                <View style={styles.reviewFormActions}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    onPress={() => setShowReviewForm(false)}
                    disabled={submitting}
                  >
                    <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: catColor, opacity: draftRating === 0 ? 0.5 : 1 }]}
                    onPress={handleSubmitReview}
                    disabled={submitting || draftRating === 0}
                  >
                    {submitting
                      ? <ActivityIndicator size="small" color="white" />
                      : <Text style={styles.submitBtnTxt}>Publier</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Products title */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Produits disponibles
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="package" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucun produit pour l'instant.
            </Text>
          </View>
        }
        renderItem={({ item: product }) => (
          <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
              <Text style={[styles.productUnit, { color: colors.mutedForeground }]}>par {product.unit}</Text>
              <Text style={[styles.productPrice, { color: GREEN }]}>
                {product.price.toLocaleString('fr-FR')} FCFA
              </Text>
            </View>
            <View style={styles.productRight}>
              {product.in_stock ? (
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: GREEN }]}
                  onPress={() => handleAdd(product)}
                  disabled={adding[product.id]}
                >
                  {adding[product.id]
                    ? <ActivityIndicator size="small" color="white" />
                    : <Feather name="plus" size={16} color="white" />
                  }
                </TouchableOpacity>
              ) : (
                <View style={[styles.outOfStock, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.outOfStockTxt, { color: colors.mutedForeground }]}>Épuisé</Text>
                </View>
              )}
            </View>
          </View>
        )}
        ListFooterComponent={
          reviews.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, paddingHorizontal: 0 }]}>
                Avis clients
              </Text>
              {reviewsLoading
                ? <ActivityIndicator color={GREEN} style={{ marginTop: 16 }} />
                : reviews.map(review => (
                    <ReviewCard key={review.id} review={review} colors={colors} />
                  ))
              }
            </View>
          ) : null
        }
      />

      {/* Floating cart button */}
      {totalItems > 0 && (
        <View style={[styles.floatingCart, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.floatingCartBtn, { backgroundColor: GREEN }]}
            onPress={() => router.push('/proximity/cart' as any)}
          >
            <Feather name="shopping-bag" size={18} color="white" />
            <Text style={styles.floatingCartTxt}>Voir le panier · {totalItems} article{totalItems > 1 ? 's' : ''}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  shopHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' },
  shopName: { color: 'white', fontSize: 18, fontWeight: '800' },
  shopSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  cartBadge: { backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartCount: { fontWeight: '800', fontSize: 14 },
  metaCard: { margin: 16, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaTxt: { fontSize: 14, flex: 1 },
  metaDesc: { fontSize: 13, lineHeight: 18 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, flexWrap: 'wrap' },
  starRow: { flexDirection: 'row', gap: 2 },
  ratingVal: { fontSize: 15, fontWeight: '800' },
  ratingCount: { fontSize: 13 },
  reviewBtn: { marginLeft: 'auto', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  reviewBtnTxt: { fontSize: 12, fontWeight: '700' },
  reviewForm: { marginHorizontal: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  reviewFormTitle: { fontSize: 15, fontWeight: '700' },
  reviewInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  reviewFormActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  submitBtn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  submitBtnTxt: { color: 'white', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 10 },
  productCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, marginHorizontal: 16, gap: 12 },
  productName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  productUnit: { fontSize: 12, marginBottom: 4 },
  productPrice: { fontSize: 16, fontWeight: '800' },
  productRight: { alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  outOfStock: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  outOfStockTxt: { fontSize: 11, fontWeight: '600' },
  emptyState: { paddingTop: 40, alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  floatingCart: { position: 'absolute', left: 16, right: 16 },
  floatingCartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  floatingCartTxt: { color: 'white', fontSize: 15, fontWeight: '700' },
  reviewCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  reviewAvatarTxt: { fontSize: 16, fontWeight: '700' },
  reviewName: { fontSize: 14, fontWeight: '600' },
  reviewDate: { fontSize: 11 },
  reviewComment: { fontSize: 13, lineHeight: 18 },
});
