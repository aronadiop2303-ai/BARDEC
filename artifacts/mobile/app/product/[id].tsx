import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert, Dimensions, Image, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { MOCK_PRODUCTS } from '@/constants/mockData';
import { useProducts } from '@/hooks/useProducts';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import BardecLayout from '@/components/BardecLayout';
import ProductCard from '@/components/ProductCard';
import { OmniChatModal } from '@/components/OmniChatModal';
import type { OmniContext } from '@/hooks/useOmniChat';

const { width } = Dimensions.get('window');
type ProductTab = 'description' | 'specifications' | 'reviews' | 'trade_assurance';

const PRODUCT_SPECS: Record<string, Record<string, string>> = {
  p1: {
    'Puissance': '100W', 'Tension d\'entrée': '85-265V AC', 'Efficacité': '≥95%',
    'Couleur': '6000K Blanc froid', 'IP Rating': 'IP65', 'Durée de vie': '50 000h',
    'Garantie': '5 ans', 'Certifications': 'CE, RoHS, UL',
  },
  p3: {
    'Volume': '500L', 'Matériau': 'Inox 316L', 'Agitateur': 'Oui, variable',
    'Pression max': '3 bar', 'Temp. max': '150°C', 'Certif.': 'CE, FDA',
  },
};

const MOCK_REVIEWS = [
  { id: 'r1', user: 'Ahmed D.', rating: 5, comment: 'Excellent produit, livraison rapide. Correspond exactement à la description.', date: '2024-01-10', verified: true },
  { id: 'r2', user: 'Sophie M.', rating: 4, comment: 'Très bonne qualité. Emballage parfait pour l\'export.', date: '2024-01-05', verified: true },
  { id: 'r3', user: 'Carlos V.', rating: 5, comment: 'Vendeur très professionnel, documents conformes.', date: '2023-12-28', verified: false },
];

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { addItem } = useCart();
  const insets = useSafeAreaInsets();

  const { products } = useProducts();
  // Prefer Supabase data; fall back to MOCK_PRODUCTS for demo IDs
  const product = products.find(p => p.id === id) ?? MOCK_PRODUCTS.find(p => p.id === id) ?? MOCK_PRODUCTS[0];

  // isB2B must be computed BEFORE the quantity useState so the initial value
  // can be role-aware. B2B buyers start at minQuantity (e.g. 50 for bulk items);
  // B2C customers always start at 1 to avoid absurd cart totals.
  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';

  const [activeImage, setActiveImage] = useState(0);
  const [activeTab, setActiveTab] = useState<ProductTab>('description');
  const [quantity, setQuantity] = useState(isB2B ? (product?.minQuantity ?? 1) : 1);
  const [wishlist, setWishlist] = useState(false);
  const [omniVisible, setOmniVisible] = useState(false);

  // ── Real reviews from Supabase ──────────────────────────────────────────────
  const [reviews, setReviews] = useState(MOCK_REVIEWS);
  const fetchReviews = useCallback(async () => {
    if (!id || !isSupabaseConfigured || !supabase) return;
    const { data } = await supabase
      .from('reviews')
      .select('id, rating, comment, verified_purchase, created_at, users(display_name)')
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      setReviews(data.map((r: any) => ({
        id:       r.id,
        user:     r.users?.display_name ?? 'Client',
        rating:   r.rating ?? 5,
        comment:  r.comment ?? '',
        date:     r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '',
        verified: r.verified_purchase ?? false,
      })));
    }
  }, [id]);
  useEffect(() => { fetchReviews(); }, [fetchReviews]);
  const displayPrice = isB2B ? product.priceWholesale : product.pricePublic;
  const savings = isB2B ? ((product.pricePublic - product.priceWholesale) / product.pricePublic * 100).toFixed(0) : null;
  const similar = (products.length > 0 ? products : MOCK_PRODUCTS)
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  const specs = PRODUCT_SPECS[product.id] ?? {};

  const omniContext: OmniContext = {
    type: 'product',
    data: {
      id: product.id,
      name: product.name,
      price: displayPrice,
      category: product.category,
      stock: product.stock,
      rating: product.rating,
      vendorName: product.vendorName,
      description: product.description,
    },
  };

  function handleAddToCart() {
    addItem({
      productId: product.id,
      productName: product.name,
      price: displayPrice,
      quantity,
      image: product.images[0] ?? '',
      maxStock: product.stock,
    });
    Alert.alert('✓ Ajouté au panier', `${quantity} × ${product.name}`, [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Voir le panier', onPress: () => router.push('/(tabs)/cart') },
    ]);
  }

  const images = product.images.length > 0 ? product.images : [
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600',
    'https://images.unsplash.com/photo-1529148482759-b35b25c5f217?w=600',
  ];

  const TABS: { id: ProductTab; label: string }[] = [
    { id: 'description', label: t('description') },
    { id: 'specifications', label: t('specifications') },
    { id: 'reviews', label: `${t('reviews')} (${product.reviewCount})` },
    { id: 'trade_assurance', label: t('trade_assurance') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back button overlay */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => setOmniVisible(true)}>
            <Text style={[styles.omniIcon, { color: colors.primary }]}>∞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => setWishlist(!wishlist)}>
            <Feather name="heart" size={20} color={wishlist ? '#EF4444' : colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[]} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        {/* Image carousel */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={16}
        >
          {images.map((img, i) => (
            <Image key={i} source={{ uri: img }} style={[styles.productImage, { width }]} />
          ))}
        </ScrollView>

        {/* Carousel dots */}
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === activeImage ? colors.primary : colors.muted }]} />
          ))}
        </View>

        {/* Product info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          {/* Price & name */}
          <View style={styles.priceRow}>
            <View>
              <Text style={[styles.price, { color: colors.primary }]}>
                ${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <Text style={[styles.priceUnit, { color: colors.mutedForeground }]}> /{t('per_unit')}</Text>
              </Text>
              {isB2B && (
                <View style={styles.savingsRow}>
                  <Text style={[styles.publicPrice, { color: colors.mutedForeground }]}>
                    ${product.pricePublic.toFixed(2)} prix public
                  </Text>
                  <View style={[styles.savingsBadge, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[styles.savingsText, { color: '#059669' }]}>-{savings}%</Text>
                  </View>
                </View>
              )}
            </View>
            {isB2B && (
              <View style={[styles.minQtyBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.minQtyText, { color: colors.primary }]}>
                  Min {product.minQuantity} unités
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>

          {/* Rating + stock */}
          <View style={styles.metaRow}>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map(s => (
                <Feather key={s} name="star" size={14} color={s <= Math.round(product.rating) ? '#F59E0B' : colors.muted} />
              ))}
              <Text style={[styles.ratingValue, { color: colors.foreground }]}>{product.rating.toFixed(1)}</Text>
              <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>({product.reviewCount})</Text>
            </View>
            <View style={styles.stockRow}>
              <Feather name="package" size={14} color={product.stock > 100 ? '#22C55E' : '#F59E0B'} />
              <Text style={[styles.stockText, { color: product.stock > 100 ? '#22C55E' : '#F59E0B' }]}>
                {product.stock > 0 ? `${product.stock} en stock` : 'Rupture de stock'}
              </Text>
            </View>
          </View>

          {/* Vendor card */}
          <TouchableOpacity style={[styles.vendorCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <View style={[styles.vendorAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.vendorAvatarText}>{product.vendorName[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.vendorNameRow}>
                <Text style={[styles.vendorName, { color: colors.foreground }]}>{product.vendorName}</Text>
                <Feather name="check-circle" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.vendorMeta, { color: colors.mutedForeground }]}>Taux de réponse 98% · Dakar, Sénégal</Text>
            </View>
            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: colors.primary }]}>
              <Feather name="message-circle" size={14} color="white" />
              <Text style={styles.contactBtnText}>{t('contact_vendor')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Quantity selector */}
          <View style={styles.qtySection}>
            <Text style={[styles.qtyLabel, { color: colors.foreground }]}>{t('quantity')}</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity
                style={[styles.qtyBtn, { borderColor: colors.border }]}
                onPress={() => setQuantity(q => Math.max(isB2B ? product.minQuantity : 1, q - (isB2B ? product.minQuantity : 1)))}
              >
                <Feather name="minus" size={16} color={colors.foreground} />
              </TouchableOpacity>
              <TextInput
                style={[styles.qtyInput, { color: colors.foreground, borderColor: colors.border }]}
                value={String(quantity)}
                onChangeText={v => setQuantity(Math.max(1, parseInt(v) || 1))}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[styles.qtyBtn, { borderColor: colors.border }]}
                onPress={() => setQuantity(q => Math.min(product.stock, q + (isB2B ? product.minQuantity : 1)))}
              >
                <Feather name="plus" size={16} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.lineTotal, { color: colors.primary }]}>
                = ${(displayPrice * quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

        {/* Product tabs */}
        <View style={[styles.tabsContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, { borderBottomColor: activeTab === tab.id ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabBtnText, { color: activeTab === tab.id ? colors.primary : colors.mutedForeground }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab content */}
        <View style={[styles.tabContent, { backgroundColor: colors.card }]}>
          {activeTab === 'description' && (
            <Text style={[styles.descText, { color: colors.foreground }]}>{product.description}</Text>
          )}

          {activeTab === 'specifications' && (
            <View style={styles.specsTable}>
              {Object.entries(specs).length > 0
                ? Object.entries(specs).map(([key, val], i) => (
                    <View key={key} style={[styles.specRow, { borderBottomColor: colors.border, backgroundColor: i % 2 === 0 ? colors.accent : colors.card }]}>
                      <Text style={[styles.specKey, { color: colors.mutedForeground }]}>{key}</Text>
                      <Text style={[styles.specVal, { color: colors.foreground }]}>{val}</Text>
                    </View>
                  ))
                : ['Référence', 'Poids net', 'Dimensions', 'Pays d\'origine', 'HS Code'].map((k, i) => (
                    <View key={k} style={[styles.specRow, { borderBottomColor: colors.border, backgroundColor: i % 2 === 0 ? colors.accent : colors.card }]}>
                      <Text style={[styles.specKey, { color: colors.mutedForeground }]}>{k}</Text>
                      <Text style={[styles.specVal, { color: colors.foreground }]}>—</Text>
                    </View>
                  ))}
            </View>
          )}

          {activeTab === 'reviews' && (
            <View style={styles.reviewsList}>
              {reviews.map(rev => (
                <View key={rev.id} style={[styles.reviewCard, { borderBottomColor: colors.border }]}>
                  <View style={styles.reviewHeader}>
                    <View style={[styles.reviewAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.reviewAvatarText}>{rev.user[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.reviewMeta}>
                        <Text style={[styles.reviewUser, { color: colors.foreground }]}>{rev.user}</Text>
                        {rev.verified && (
                          <View style={[styles.verifiedPurchase, { backgroundColor: '#D1FAE5' }]}>
                            <Feather name="check" size={10} color="#059669" />
                            <Text style={[styles.verifiedText, { color: '#059669' }]}>Achat vérifié</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.reviewStars}>
                        {[1,2,3,4,5].map(s => (
                          <Feather key={s} name="star" size={12} color={s <= rev.rating ? '#F59E0B' : colors.muted} />
                        ))}
                        <Text style={[styles.reviewDate, { color: colors.mutedForeground }]}>{rev.date}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[styles.reviewComment, { color: colors.foreground }]}>{rev.comment}</Text>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'trade_assurance' && (
            <View style={styles.tradeSection}>
              {[
                { icon: 'shield', title: 'Paiement sécurisé', desc: 'Votre paiement est protégé jusqu\'à la livraison confirmée.' },
                { icon: 'package', title: 'Garantie de qualité', desc: 'Produit conforme à la description ou remboursement intégral.' },
                { icon: 'truck', title: 'Livraison garantie', desc: 'Dédommagement en cas de retard ou de perte.' },
                { icon: 'refresh-cw', title: 'Politique de retour', desc: 'Retour facile sous 30 jours pour produits défectueux.' },
              ].map((item, i) => (
                <View key={i} style={[styles.tradeItem, { borderColor: colors.border }]}>
                  <View style={[styles.tradeIcon, { backgroundColor: colors.accent }]}>
                    <Feather name={item.icon as any} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tradeTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <Text style={[styles.tradeDesc, { color: colors.mutedForeground }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Similar products */}
        {similar.length > 0 && (
          <View style={styles.similarSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('similar_products')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
              {similar.map(p => (
                <View key={p.id} style={{ width: 180 }}>
                  <ProductCard product={p} compact />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        {isB2B && (
          <TouchableOpacity style={[styles.quoteBtn, { borderColor: colors.primary }]}>
            <Feather name="file-text" size={18} color={colors.primary} />
            <Text style={[styles.quoteBtnText, { color: colors.primary }]}>{t('request_quote')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.addCartBtn, { backgroundColor: colors.primary, flex: isB2B ? 1 : undefined, width: isB2B ? undefined : '100%' }]}
          onPress={handleAddToCart}
        >
          <Feather name="shopping-cart" size={18} color="white" />
          <Text style={styles.addCartBtnText}>{t('add_to_cart')}</Text>
        </TouchableOpacity>
      </View>

      <OmniChatModal visible={omniVisible} onClose={() => setOmniVisible(false)} context={omniContext} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  omniIcon: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  productImage: { height: 300, resizeMode: 'cover' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  infoCard: {
    borderRadius: 0,
    padding: 20,
    gap: 14,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  price: { fontSize: 26, fontWeight: '800' },
  priceUnit: { fontSize: 14, fontWeight: '400' },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  publicPrice: { fontSize: 13, textDecorationLine: 'line-through' },
  savingsBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  savingsText: { fontSize: 12, fontWeight: '700' },
  minQtyBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  minQtyText: { fontSize: 12, fontWeight: '600' },
  productName: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingValue: { fontSize: 14, fontWeight: '700', marginLeft: 4 },
  reviewCount: { fontSize: 13 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stockText: { fontSize: 13, fontWeight: '600' },
  vendorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  vendorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vendorAvatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
  vendorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  vendorName: { fontSize: 14, fontWeight: '600' },
  vendorMeta: { fontSize: 12, marginTop: 2 },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  contactBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  qtySection: { gap: 8 },
  qtyLabel: { fontSize: 14, fontWeight: '600' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    width: 70,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  lineTotal: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
  tabsContainer: {
    borderTopWidth: 1,
    paddingVertical: 4,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    marginRight: 4,
  },
  tabBtnText: { fontSize: 14, fontWeight: '600' },
  tabContent: { padding: 16 },
  descText: { fontSize: 15, lineHeight: 24 },
  specsTable: { borderRadius: 10, overflow: 'hidden' },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  specKey: { fontSize: 13, flex: 1 },
  specVal: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  reviewsList: { gap: 16 },
  reviewCard: { borderBottomWidth: 1, paddingBottom: 16, gap: 10 },
  reviewHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reviewAvatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  reviewAvatarText: { color: 'white', fontWeight: '700' },
  reviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewUser: { fontSize: 14, fontWeight: '600' },
  verifiedPurchase: {
    flexDirection: 'row', alignItems: 'center',
    gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  verifiedText: { fontSize: 10, fontWeight: '600' },
  reviewStars: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  reviewDate: { fontSize: 11, marginLeft: 6 },
  reviewComment: { fontSize: 14, lineHeight: 20 },
  tradeSection: { gap: 14 },
  tradeItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 14, paddingVertical: 14, borderBottomWidth: 1,
  },
  tradeIcon: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center',
  },
  tradeTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  tradeDesc: { fontSize: 13, lineHeight: 18 },
  similarSection: { paddingTop: 20, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 16 },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },
  quoteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  quoteBtnText: { fontSize: 14, fontWeight: '700' },
  addCartBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addCartBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
