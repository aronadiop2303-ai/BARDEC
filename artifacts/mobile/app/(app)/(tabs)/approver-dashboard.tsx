import React, { useState, useCallback, useEffect } from 'react';
import { router, useFocusEffect, Redirect } from 'expo-router';
import {
  ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Modal,
  Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import { SkeletonOrderCard } from '@/components/SkeletonCard';
import { Order } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { mapDbOrder } from '@/lib/orders';
import { toUserMessage } from '@/lib/errors';
import { notifyOrderEvent } from '@/lib/notifications';

const { width } = Dimensions.get('window');

/**
 * Dashboard Approbateur B2B — panneau de contrôle d'approbation dédié
 * (onglet propre dans la bottom bar, même principe que
 * vendor-dashboard.tsx/admin.tsx/partner-dashboard.tsx), volontairement
 * dépourvu de tout élément du catalogue public (recherche, catégories,
 * produits tendances) : l'approbateur n'achète pas depuis cet écran, il
 * statue sur les commandes déjà passées par les employés de sa société.
 * Remplace le flux approve/reject qui vivait avant dans orders.tsx (onglet
 * partagé avec les clients) — voir orders.tsx, redevenu un historique
 * client simple. Anciennement approvals.tsx — renommé pour matcher la
 * convention *-dashboard.tsx des autres rôles à écran dédié.
 *
 * File d'attente = commandes `pending_approval` de la société de
 * l'approbateur connecté, scopées côté serveur par la policy RLS
 * `orders_approver` (company_id IN (SELECT company_id FROM users WHERE
 * id = auth.uid())) — aucun filtre company_id nécessaire côté client pour
 * la sécurité. Un compte APPROVER sans company_id (ne devrait normalement
 * jamais exister, mais les comptes de test/preview de rôle utilisés cette
 * session n'ont pas de société liée) bascule sur des données de
 * démonstration plutôt qu'un écran vide ou une redirection — voir
 * FAKE_APPROVER_ORDERS plus bas.
 */
interface ApproverOrder extends Order {
  requesterName: string | null;
}

// Fallback démo — un compte APPROVER sans company_id (voir la garde
// ci-dessous) n'a par définition aucune donnée réelle à afficher ; plutôt
// qu'un écran vide, on préremplit avec des chiffres de démonstration
// clairement signalés comme tels (bannière "Données de démonstration"), pour
// que l'UI et les actions Approuver/Refuser restent prévisualisables sans
// lier une vraie société. Les ids `demo-approver-*` sont reconnus par
// handleApprove/submitRejection pour éviter tout appel Supabase dessus.
const FAKE_CREDIT_LIMIT = 500000;
const FAKE_CREDIT_BALANCE = 125000;
const FAKE_APPROVER_ORDERS: ApproverOrder[] = [
  {
    id: 'demo-approver-1', orderNumber: 'BDC-DEMO-0001', status: 'pending_approval',
    items: [{ productId: 'demo-p1', productName: 'Casques audio Pro (lot de 20)', quantity: 20, price: 45, image: '' }],
    subtotal: 900, shipping: 0, tax: 0, total: 900,
    date: new Date().toLocaleDateString('fr-FR'), paymentMethod: 'net30',
    requesterName: 'Fatou Sène',
  },
  {
    id: 'demo-approver-2', orderNumber: 'BDC-DEMO-0002', status: 'pending_approval',
    items: [{ productId: 'demo-p2', productName: 'Fournitures de bureau (lot)', quantity: 5, price: 320, image: '' }],
    subtotal: 1600, shipping: 0, tax: 0, total: 1600,
    date: new Date().toLocaleDateString('fr-FR'), paymentMethod: 'net30',
    requesterName: 'Moussa Ba',
  },
];

export default function ApproverDashboardScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();

  const [orders,        setOrders]        = useState<ApproverOrder[]>([]);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [approving,     setApproving]     = useState<string | null>(null);

  // Crédit Net30 : dépassement volontairement non bloquant (décision
  // produit validée), juste signalé pour donner le contexte avant décision.
  // Chiffres de démo uniquement quand la file elle-même bascule en démo
  // (voir fetchQueue) — jamais quand de vraies commandes sont affichées.
  const effectiveCreditLimit   = usingDemoData ? FAKE_CREDIT_LIMIT   : (user?.creditLimit   ?? 0);
  const effectiveCreditBalance = usingDemoData ? FAKE_CREDIT_BALANCE : (user?.creditBalance ?? 0);
  const companyOverLimit = effectiveCreditBalance > effectiveCreditLimit;

  const [rejectingOrder,   setRejectingOrder]   = useState<Order | null>(null);
  const [rejectReason,     setRejectReason]     = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Toujours interroger Supabase pour les vraies commandes pending_approval
  // (RLS orders_approver scope déjà à la société de l'appelant — inchangée).
  // Les données de démo (bannière + BDC-DEMO-*) ne s'affichent QUE si cette
  // requête ne renvoie rien ET que le compte n'a pas de company_id — jamais
  // en priorité sur de vraies commandes.
  const fetchQueue = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      const fallback = !user?.company;
      setUsingDemoData(fallback);
      setOrders(fallback ? FAKE_APPROVER_ORDERS : []);
      setLoading(false);
      return;
    }
    setLoading(true);
    // customer:users!customer_id(...) — même pattern de jointure que la
    // section paiements d'admin.tsx — pour afficher l'employé demandeur.
    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:users!customer_id(display_name, email)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Approvals fetch error:', error.message);
      Alert.alert('Erreur', 'Impossible de charger la file d\'approbation. Réessaie dans un instant.');
      setOrders([]);
      setUsingDemoData(false);
      setLoading(false);
      return;
    }
    const real = (data ?? []).map((row: any) => ({
      ...mapDbOrder(row),
      requesterName: row.customer?.display_name ?? row.customer?.email ?? null,
    }));
    if (real.length > 0) {
      setOrders(real);
      setUsingDemoData(false);
    } else if (!user?.company) {
      setOrders(FAKE_APPROVER_ORDERS);
      setUsingDemoData(true);
    } else {
      setOrders([]);
      setUsingDemoData(false);
    }
    setLoading(false);
  }, [user?.company]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useFocusEffect(useCallback(() => { fetchQueue(); }, [fetchQueue]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchQueue();
    setRefreshing(false);
  }, [fetchQueue]);

  const handleApprove = useCallback((order: Order) => {
    Alert.alert(
      'Approuver la commande',
      `Approuver la commande ${order.orderNumber} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Approuver',
          style: 'default',
          onPress: async () => {
            setApproving(order.id);
            const isDemoOrder = order.id.startsWith('demo-approver-');
            if (!isDemoOrder && isSupabaseConfigured && supabase) {
              const { data: { user: authUser } } = await supabase.auth.getUser();
              const { data: updated, error } = await supabase
                .from('orders')
                .update({ status: 'approved', approver_id: authUser?.id ?? null })
                .eq('id', order.id)
                .select('id');
              setApproving(null);
              if (error) { Alert.alert('Erreur', toUserMessage('approvals:approve', error, 'Impossible de traiter cette commande. Réessaie dans un instant.')); return; }
              if (!updated || updated.length === 0) {
                Alert.alert('Permission refusée', "Tu n'as pas les droits pour approuver cette commande.");
                return;
              }
              notifyOrderEvent(supabase, order.id, 'approved');
            } else {
              setApproving(null);
            }
            // La commande sort de la file dès qu'elle n'est plus pending_approval.
            setOrders(prev => prev.filter(o => o.id !== order.id));
          },
        },
      ],
    );
  }, []);

  function openRejectModal(order: Order) {
    setRejectingOrder(order);
    setRejectReason('');
  }

  const submitRejection = useCallback(async () => {
    if (!rejectingOrder) return;
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('Motif requis', 'Indique le motif du rejet avant de continuer.');
      return;
    }
    setSubmittingReject(true);
    const order = rejectingOrder;
    const isDemoOrder = order.id.startsWith('demo-approver-');
    if (!isDemoOrder && isSupabaseConfigured && supabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: updated, error } = await supabase
        .from('orders')
        .update({ status: 'cancelled', notes: reason, approver_id: authUser?.id ?? null })
        .eq('id', order.id)
        .select('id');
      setSubmittingReject(false);
      if (error) { Alert.alert('Erreur', toUserMessage('approvals:reject', error, 'Impossible de rejeter cette commande. Réessaie dans un instant.')); return; }
      if (!updated || updated.length === 0) {
        Alert.alert('Permission refusée', "Tu n'as pas les droits pour rejeter cette commande.");
        return;
      }
      notifyOrderEvent(supabase, order.id, 'cancelled');
    } else {
      setSubmittingReject(false);
    }
    setOrders(prev => prev.filter(o => o.id !== order.id));
    setRejectingOrder(null);
  }, [rejectingOrder, rejectReason]);

  // Garde d'accès route-level — même pattern que admin.tsx/vendor-dashboard.tsx
  // (audit du 11 sept) : la tab bar cache déjà cet onglet aux non-approbateurs,
  // mais ça ne bloque pas une navigation directe. RLS bloque déjà toute
  // écriture non autorisée, mais l'écran lui-même doit aussi vérifier le rôle.
  if (!isDemoMode && user?.role !== 'APPROVER') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  const kpis = [
    { icon: 'dollar-sign', color: '#7C3AED', label: 'Limite de crédit Net30', value: `${effectiveCreditLimit.toLocaleString('fr-FR')} FCFA` },
    { icon: 'credit-card', color: companyOverLimit ? '#DC2626' : '#0EA5E9', label: 'Encours utilisé', value: `${effectiveCreditBalance.toLocaleString('fr-FR')} FCFA` },
    { icon: 'clock', color: '#D97706', label: 'Demandes en attente', value: String(orders.length) },
  ];

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Espace Approbateur</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Commandes B2B / Net30 en attente de ta décision
        </Text>
      </View>

      {usingDemoData && (
        <View style={styles.demoBanner}>
          <Feather name="alert-circle" size={14} color="#7C3AED" />
          <Text style={styles.demoBannerText}>
            Ce compte n'est rattaché à aucune société B2B — données de démonstration affichées pour prévisualiser l'écran.
          </Text>
        </View>
      )}

      <View style={styles.kpiGrid}>
        {kpis.map((kpi, i) => (
          <View key={i} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
              <Feather name={kpi.icon} size={18} color={kpi.color} />
            </View>
            <Text style={[styles.kpiValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>{kpi.value}</Text>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{kpi.label}</Text>
          </View>
        ))}
      </View>

      {/* Chantier 2 — "Bon de Commande" et "Approbations en attente"
          vivaient dans Profil (menu B2B) ; retirés de là pour un APPROVER
          (voir profile.tsx) et déplacés ici, à côté des métriques Net30. */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.quickActionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/(tabs)/orders' as any)}
        >
          <Feather name="file-text" size={20} color={colors.primary} />
          <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Bon de Commande</Text>
          <Text style={[styles.quickActionSub, { color: colors.mutedForeground }]}>Historique et création</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickActionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push({
            pathname: '/(tabs)/orders',
            params: { tab: 'pending_approval' },
          } as any)}
        >
          <Feather name="check-circle" size={20} color={colors.primary} />
          <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Approbations en attente</Text>
          <Text style={[styles.quickActionSub, { color: colors.mutedForeground }]}>Tes propres commandes Net30</Text>
        </TouchableOpacity>
      </View>

      {companyOverLimit && (
        <View style={styles.creditWarning}>
          <Feather name="alert-triangle" size={14} color="#DC2626" />
          <Text style={styles.creditWarningText}>
            Solde Net30 de la société au-delà de la limite de crédit accordée.
          </Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Commandes en attente de validation</Text>
      <View style={styles.list}>
        {loading ? (
          [1, 2, 3].map(i => <SkeletonOrderCard key={i} />)
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="check-circle" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucune commande en attente d'approbation
            </Text>
          </View>
        ) : (
          orders.map(order => (
            <View key={order.id} style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.orderCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderNumber, { color: colors.foreground }]}>{order.orderNumber}</Text>
                  <Text style={[styles.requesterText, { color: colors.mutedForeground }]}>
                    Demandé par : {order.requesterName ?? '—'}
                  </Text>
                </View>
                <Text style={[styles.orderAmount, { color: colors.primary }]}>
                  ${order.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.approveRow}>
                <TouchableOpacity
                  style={[styles.approveBtn, styles.rejectBtn]}
                  onPress={() => openRejectModal(order)}
                  disabled={approving === order.id}
                >
                  <Feather name="x-circle" size={16} color="#EF4444" />
                  <Text style={[styles.approveBtnText, { color: '#EF4444' }]}>Refuser</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, styles.approveBtnGreen]}
                  onPress={() => handleApprove(order)}
                  disabled={approving === order.id}
                >
                  {approving === order.id
                    ? <ActivityIndicator size="small" color="white" />
                    : <><Feather name="check-circle" size={16} color="white" /><Text style={styles.approveBtnText}>Approuver</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ── Reject modal — motif obligatoire ────────────────────────────────── */}
      <Modal
        visible={!!rejectingOrder}
        animationType="slide"
        transparent
        onRequestClose={() => setRejectingOrder(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Rejeter la commande</Text>
            <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {rejectingOrder?.orderNumber}
            </Text>

            <Text style={[styles.rejectLabel, { color: colors.foreground }]}>Motif du rejet *</Text>
            <TextInput
              style={[styles.input, {
                backgroundColor: colors.background,
                borderColor:     colors.border,
                color:           colors.foreground,
              }]}
              placeholder="Ex : dépassement du budget approuvé, produit non conforme…"
              placeholderTextColor={colors.mutedForeground}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setRejectingOrder(null)}
                disabled={submittingReject}
              >
                <Text style={{ color: colors.foreground, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: '#EF4444', opacity: submittingReject || !rejectReason.trim() ? 0.6 : 1 },
                ]}
                onPress={submitRejection}
                disabled={submittingReject || !rejectReason.trim()}
              >
                {submittingReject && <ActivityIndicator size="small" color="white" />}
                <Text style={{ color: 'white', fontWeight: '700' }}>Confirmer le rejet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header:   { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  title:    { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  demoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 10, marginHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    marginBottom: 12, backgroundColor: '#EDE9FE',
  },
  demoBannerText: { color: '#5B21B6', fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 16 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  kpiCard: {
    width: (width - 52) / 3,
    borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4,
  },
  kpiIcon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  kpiValue: { fontSize: 14, fontWeight: '800' },
  kpiLabel: { fontSize: 10, textAlign: 'center', lineHeight: 13 },
  quickActionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  quickActionCard: {
    flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4,
  },
  quickActionLabel: { fontSize: 13, fontWeight: '700' },
  quickActionSub:   { fontSize: 11 },
  sectionTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  list:     { paddingHorizontal: 16, gap: 12 },
  empty:    { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 16, textAlign: 'center' },
  orderCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  orderCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  orderNumber: { fontSize: 14, fontWeight: '700' },
  requesterText: { fontSize: 12, marginTop: 2 },
  orderAmount: { fontSize: 16, fontWeight: '800' },
  creditWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, marginHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    marginBottom: 12, backgroundColor: '#FEE2E2',
  },
  creditWarningText: { color: '#991B1B', fontSize: 12, fontWeight: '600', flex: 1 },
  approveRow: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  rejectBtn: { borderWidth: 1.5, borderColor: '#EF4444' },
  approveBtnGreen: { backgroundColor: '#22C55E' },
  approveBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  // Reject modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 14 },
  cardTitle:    { fontSize: 18, fontWeight: '800' },
  cardSubtitle: { fontSize: 13, marginTop: -8 },
  rejectLabel:  { fontSize: 13, fontWeight: '700' },
  input:   { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitBtn: {
    flex: 2, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
});
