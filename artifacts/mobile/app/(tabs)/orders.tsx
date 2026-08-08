import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import OrderCard from '@/components/OrderCard';
import { SkeletonOrderCard } from '@/components/SkeletonCard';
import { Order, MOCK_ORDERS } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useNearbyBadge } from '@/hooks/useProximityOrders';

// ─── Map Supabase row → Order interface ───────────────────────────────────────
function mapDbOrder(row: any): Order {
  return {
    id:                  row.id,
    orderNumber:         row.order_number ?? row.id,
    status:              row.status ?? 'pending',
    items:               Array.isArray(row.items)
      ? row.items.map((item: any) => ({
          productId:   item.product_id ?? item.id ?? '',
          productName: item.product_name ?? item.name ?? '—',
          quantity:    item.quantity ?? 1,
          price:       item.price ?? 0,
          image:       item.image ?? '',
        }))
      : [],
    subtotal:            row.subtotal ?? row.total ?? 0,
    shipping:            row.shipping_cost ?? 0,
    tax:                 row.tax_amount ?? 0,
    total:               row.total ?? 0,
    date:                row.created_at
      ? new Date(row.created_at).toLocaleDateString('fr-FR')
      : '—',
    trackingNumber:      row.tracking_number ?? undefined,
    purchaseOrderNumber: row.purchase_order_number ?? undefined,
    estimatedDelivery:   row.estimated_delivery ?? undefined,
  };
}

const STATUS_TABS = [
  { id: 'all',              label: 'Tout' },
  { id: 'pending',          label: 'En attente' },
  { id: 'pending_approval', label: 'Approbation' },
  { id: 'shipped',          label: 'Expédié' },
  { id: 'completed',        label: 'Terminé' },
  { id: 'cancelled',        label: 'Annulé' },
];

export default function OrdersScreen() {
  const colors = useColors();
  const { t }  = useLanguage();
  const { user } = useAuth();
  const { markSeen } = useNearbyBadge();

  // Clear the proximity-orders badge when the customer opens the Orders tab
  useFocusEffect(
    useCallback(() => {
      markSeen();
    }, [markSeen]),
  );

  const [activeTab,    setActiveTab]    = useState('all');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [refreshing,   setRefreshing]   = useState(false);
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Review modal state ──────────────────────────────────────────────────────
  const [reviewOrder,      setReviewOrder]      = useState<Order | null>(null);
  const [reviewRating,     setReviewRating]     = useState(5);
  const [reviewComment,    setReviewComment]    = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // ── Fetch orders from Supabase ──────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    if (isSupabaseConfigured && supabase) {
      // Use the real Supabase auth UUID — user.id from context can be a mock
      // placeholder ("u1"…) when the role-switcher is active.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const realId = authUser?.id;
      if (!realId) { setLoading(false); return; }

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', realId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Orders fetch error:', error.message);
        setOrders(MOCK_ORDERS);
      } else {
        setOrders((data ?? []).map(mapDbOrder));
      }
    } else {
      setOrders(MOCK_ORDERS);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // ── Confirm receipt ──────────────────────────────────────────────────────────
  const handleConfirmReceipt = useCallback((order: Order) => {
    Alert.alert(
      'Confirmer la réception',
      `Confirmez-vous la bonne réception de la commande ${order.orderNumber} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            if (isSupabaseConfigured && supabase) {
              const { error } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('id', order.id);
              if (error) { Alert.alert('Erreur', error.message); return; }
            }
            setOrders(prev =>
              prev.map(o => o.id === order.id ? { ...o, status: 'completed' as const } : o)
            );
            Alert.alert(
              '✓ Réception confirmée',
              'Souhaitez-vous laisser un avis sur ce produit ?',
              [
                { text: 'Plus tard', style: 'cancel' },
                {
                  text: 'Laisser un avis',
                  onPress: () => {
                    setReviewOrder(order);
                    setReviewComment('');
                    setReviewRating(5);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, []);

  // ── Submit review ──────────────────────────────────────────────────────────
  const handleSubmitReview = async () => {
    if (!reviewOrder || !user) return;
    const productId = reviewOrder.items[0]?.productId;
    if (!productId) { Alert.alert('Erreur', 'Produit introuvable.'); return; }

    setSubmittingReview(true);
    if (isSupabaseConfigured && supabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const realId = authUser?.id;
      if (!realId) {
        setSubmittingReview(false);
        Alert.alert('Session expirée', 'Reconnecte-toi et réessaie.');
        return;
      }
      const { error } = await supabase.from('reviews').insert({
        product_id:        productId,
        order_id:          reviewOrder.id,
        user_id:           realId,
        rating:            reviewRating,
        comment:           reviewComment.trim() || null,
        verified_purchase: true,
      });
      setSubmittingReview(false);
      if (error) { Alert.alert('Erreur', error.message); return; }
    } else {
      setSubmittingReview(false);
    }
    Alert.alert('✓ Merci !', 'Votre avis a été publié.');
    setReviewOrder(null);
  };

  const filtered = orders.filter(o => {
    const matchTab    = activeTab === 'all' || o.status === activeTab;
    const matchSearch = !searchQuery ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('orders')}</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16 }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={`${t('search')} par numéro…`}
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab.id ? colors.primary : colors.card,
                borderColor:     activeTab === tab.id ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.id ? 'white' : colors.foreground }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders list */}
      <View style={styles.list}>
        {loading ? (
          [1, 2, 3].map(i => <SkeletonOrderCard key={i} />)
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucune commande trouvée
            </Text>
          </View>
        ) : (
          filtered.map(order => (
            <View key={order.id}>
              <OrderCard order={order} />
              {/* Confirm receipt CTA — only on "shipped" orders */}
              {order.status === 'shipped' && (
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => handleConfirmReceipt(order)}
                >
                  <Feather name="check-circle" size={16} color="white" />
                  <Text style={styles.confirmBtnText}>Confirmer la réception</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {/* ── Review modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={!!reviewOrder}
        animationType="slide"
        transparent
        onRequestClose={() => setReviewOrder(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.reviewOverlay}
        >
          <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Laisser un avis</Text>
            <Text style={[styles.reviewProduct, { color: colors.mutedForeground }]} numberOfLines={1}>
              {reviewOrder?.items[0]?.productName}
            </Text>

            {/* Star picker */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <Feather
                    name="star"
                    size={32}
                    color={n <= reviewRating ? '#F59E0B' : colors.muted}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.reviewInput, {
                backgroundColor: colors.background,
                borderColor:     colors.border,
                color:           colors.foreground,
              }]}
              placeholder="Votre commentaire (optionnel)"
              placeholderTextColor={colors.mutedForeground}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={[styles.reviewCancel, { borderColor: colors.border }]}
                onPress={() => setReviewOrder(null)}
              >
                <Text style={{ color: colors.foreground, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewSubmit, { backgroundColor: colors.primary, opacity: submittingReview ? 0.7 : 1 }]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview && <ActivityIndicator size="small" color="white" />}
                <Text style={{ color: 'white', fontWeight: '700' }}>Publier l'avis</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title:        { fontSize: 22, fontWeight: '800' },
  searchBar:    {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
    gap: 8, marginBottom: 12,
  },
  searchInput:  { flex: 1, fontSize: 14 },
  tabsScroll:   { marginBottom: 12 },
  tab:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  tabText:      { fontSize: 13, fontWeight: '600' },
  list:         { paddingHorizontal: 16, gap: 12 },
  empty:        { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:    { fontSize: 16 },
  confirmBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, borderRadius: 10,
    marginTop: -4, marginBottom: 4, backgroundColor: '#22C55E',
  },
  confirmBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  // Review modal
  reviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  reviewCard:    {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, padding: 20, gap: 14,
  },
  reviewTitle:   { fontSize: 18, fontWeight: '800' },
  reviewProduct: { fontSize: 13, marginTop: -8 },
  starsRow:      { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  reviewInput:   {
    borderWidth: 1, borderRadius: 12,
    padding: 12, fontSize: 14, minHeight: 80,
  },
  reviewActions: { flexDirection: 'row', gap: 10 },
  reviewCancel:  { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  reviewSubmit:  {
    flex: 2, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
});
