import React, { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, Redirect } from 'expo-router';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import OrderCard from '@/components/OrderCard';
import { SkeletonOrderCard } from '@/components/SkeletonCard';
import { Order } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { mapDbOrder } from '@/lib/orders';
import { toUserMessage } from '@/lib/errors';
import { notifyOrderEvent } from '@/lib/notifications';

/**
 * Dashboard Approbateur B2B — écran dédié (onglet propre dans la bottom bar,
 * même principe que vendor-dashboard.tsx/admin.tsx). Remplace le flux
 * approve/reject qui vivait avant dans orders.tsx (onglet partagé avec les
 * clients) — voir orders.tsx, redevenu un historique client simple.
 *
 * File d'attente = commandes `pending_approval` de la société de
 * l'approbateur connecté, scopées côté serveur par la policy RLS
 * `orders_approver` (company_id IN (SELECT company_id FROM users WHERE
 * id = auth.uid())) — aucun filtre company_id nécessaire côté client.
 */
export default function ApprovalsScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();

  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving,  setApproving]  = useState<string | null>(null);

  // Crédit Net30 : dépassement volontairement non bloquant (décision
  // produit validée), juste signalé pour donner le contexte avant décision.
  const companyOverLimit = (user?.creditBalance ?? 0) > (user?.creditLimit ?? 0);

  const [rejectingOrder,   setRejectingOrder]   = useState<Order | null>(null);
  const [rejectReason,     setRejectReason]     = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Approvals fetch error:', error.message);
      Alert.alert('Erreur', 'Impossible de charger la file d\'approbation. Réessaie dans un instant.');
      setOrders([]);
    } else {
      setOrders((data ?? []).map(mapDbOrder));
    }
    setLoading(false);
  }, []);

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
            if (isSupabaseConfigured && supabase) {
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
    if (isSupabaseConfigured && supabase) {
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

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Tableau de bord Approbateur</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Commandes B2B / Net30 en attente de ta décision
        </Text>
      </View>

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
            <View key={order.id}>
              <OrderCard order={order} />
              {order.paymentMethod === 'net30' && companyOverLimit && (
                <View style={styles.creditWarning}>
                  <Feather name="alert-triangle" size={14} color="#DC2626" />
                  <Text style={styles.creditWarningText}>
                    Solde Net30 de la société au-delà de la limite de crédit accordée.
                  </Text>
                </View>
              )}
              <View style={styles.approveRow}>
                <TouchableOpacity
                  style={[styles.approveBtn, styles.rejectBtn]}
                  onPress={() => openRejectModal(order)}
                  disabled={approving === order.id}
                >
                  <Feather name="x-circle" size={16} color="#EF4444" />
                  <Text style={[styles.approveBtnText, { color: '#EF4444' }]}>Rejeter</Text>
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
  list:     { paddingHorizontal: 16, gap: 12 },
  empty:    { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 16, textAlign: 'center' },
  creditWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    marginTop: -4, marginBottom: 4, backgroundColor: '#FEE2E2',
  },
  creditWarningText: { color: '#991B1B', fontSize: 12, fontWeight: '600', flex: 1 },
  approveRow: { flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 4 },
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
