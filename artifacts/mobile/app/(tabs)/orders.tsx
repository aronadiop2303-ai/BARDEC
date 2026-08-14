import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { mapDbOrder } from '@/lib/orders';
import { useNearbyBadge } from '@/hooks/useProximityOrders';
import type { TranslationKey } from '@/constants/translations';

// labelKey null only for "all" — no generic "all orders" key exists yet
// (all_categories is specific to product categories, wrong string for this).
const STATUS_TABS: { id: string; labelKey: TranslationKey | null; fallback: string }[] = [
  { id: 'all',              labelKey: null,               fallback: 'Tout' },
  { id: 'pending',          labelKey: 'pending',           fallback: 'En attente' },
  { id: 'pending_approval', labelKey: 'pending_approval',  fallback: 'Approbation' },
  { id: 'shipped',          labelKey: 'shipped',           fallback: 'Expédié' },
  { id: 'completed',        labelKey: 'completed',         fallback: 'Terminé' },
  { id: 'cancelled',        labelKey: 'cancelled',         fallback: 'Annulé' },
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

  // Support deep-linking to a specific tab, e.g. from the Approver profile badge.
  // router.push({ pathname: '/(tabs)/orders', params: { tab: 'pending_approval' } })
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab,    setActiveTab]    = useState(initialTab ?? 'all');
  const [searchQuery,  setSearchQuery]  = useState('');
  const [refreshing,   setRefreshing]   = useState(false);
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [approving,    setApproving]    = useState<string | null>(null);

  const isApprover = user?.role === 'APPROVER';

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

      const isApprover = user?.role === 'APPROVER';

      // APPROVERs need to see pending_approval orders from their company, not
      // just their own orders. The RLS "orders_approver" policy (once applied)
      // limits what they can see server-side; we just lift the customer_id filter.
      const query = isApprover
        ? supabase
            .from('orders')
            .select('*')
            .in('status', ['pending_approval', 'pending'])
            .order('created_at', { ascending: false })
        : supabase
            .from('orders')
            .select('*')
            .eq('customer_id', realId)
            .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        // Was falling back to MOCK_ORDERS here — a real backend error (e.g.
        // a malformed order breaking the orders_vendor RLS check) looked
        // like a normal, populated order list of fake data instead of a
        // visible failure. Show an empty list with a real error instead.
        console.warn('Orders fetch error:', error.message);
        Alert.alert('Erreur', `Impossible de charger les commandes : ${error.message}`);
        setOrders([]);
      } else {
        setOrders((data ?? []).map(mapDbOrder));
      }
    } else {
      setOrders(MOCK_ORDERS);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Refetch whenever this tab regains focus — Expo Router keeps tab screens
  // mounted, so without this a status change made elsewhere (e.g. the vendor
  // updating an order) never shows here until the user manually pulls to
  // refresh. Separate from the markSeen() useFocusEffect above since that one
  // is declared before fetchOrders exists.
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // ── Approver: approve / reject a pending_approval order ─────────────────────
  // This was the missing piece that made the APPROVER role purely visual —
  // orders_approver RLS already allows the UPDATE, but no UI ever called it.
  const handleApproverAction = useCallback(async (order: Order, approve: boolean) => {
    Alert.alert(
      approve ? 'Approuver la commande' : 'Rejeter la commande',
      `${approve ? 'Approuver' : 'Rejeter'} la commande ${order.orderNumber} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: approve ? 'Approuver' : 'Rejeter',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setApproving(order.id);
            const nextStatus = approve ? 'approved' : 'cancelled';
            if (isSupabaseConfigured && supabase) {
              const { data: updated, error } = await supabase
                .from('orders')
                .update({ status: nextStatus })
                .eq('id', order.id)
                .select('id');
              setApproving(null);
              if (error) { Alert.alert('Erreur', error.message); return; }
              if (!updated || updated.length === 0) {
                Alert.alert('Permission refusée', "Tu n'as pas les droits pour approuver cette commande.");
                return;
              }
            } else {
              setApproving(null);
            }
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
          },
        },
      ],
    );
  }, []);

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
        product_id: productId,
        order_id:   reviewOrder.id,
        user_id:    realId,
        rating:     reviewRating,
        comment:    reviewComment.trim() || null,
        verified:   true,
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
              {tab.labelKey ? t(tab.labelKey) : tab.fallback}
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
              {/* Approve / reject CTA — approver only, pending_approval only */}
              {isApprover && order.status === 'pending_approval' && (
                <View style={styles.approveRow}>
                  <TouchableOpacity
                    style={[styles.approveBtn, styles.rejectBtn]}
                    onPress={() => handleApproverAction(order, false)}
                    disabled={approving === order.id}
                  >
                    {approving === order.id
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <><Feather name="x-circle" size={16} color="#EF4444" /><Text style={[styles.approveBtnText, { color: '#EF4444' }]}>Rejeter</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveBtn, styles.approveBtnGreen]}
                    onPress={() => handleApproverAction(order, true)}
                    disabled={approving === order.id}
                  >
                    {approving === order.id
                      ? <ActivityIndicator size="small" color="white" />
                      : <><Feather name="check-circle" size={16} color="white" /><Text style={styles.approveBtnText}>Approuver</Text></>}
                  </TouchableOpacity>
                </View>
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
  approveRow: {
    flexDirection: 'row', gap: 8,
    marginTop: -4, marginBottom: 4,
  },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  rejectBtn: { borderWidth: 1.5, borderColor: '#EF4444' },
  approveBtnGreen: { backgroundColor: '#22C55E' },
  approveBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
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
