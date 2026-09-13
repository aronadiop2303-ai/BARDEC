import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { Order, MOCK_ORDERS, STATUS_COLORS } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { mapDbOrder } from '@/lib/orders';

const TRACKING_STEPS: { status: string; label: string; icon: string }[] = [
  { status: 'pending',           label: 'Commande reçue',    icon: 'clock' },
  { status: 'approved',          label: 'Approuvée',         icon: 'check-circle' },
  { status: 'shipped',           label: 'Expédiée',          icon: 'package' },
  { status: 'out_for_delivery',  label: 'En livraison',      icon: 'truck' },
  { status: 'completed',         label: 'Livrée',            icon: 'check-circle' },
];

function trackingIndex(status: string): number {
  if (status === 'cancelled') return -1;
  if (status === 'pending_approval') return 0;
  if (status === 'ready_for_delivery') return 2;
  const i = TRACKING_STEPS.findIndex(s => s.status === status);
  return i === -1 ? 0 : i;
}

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (error) console.error('[tracking:fetch]', error.message, error.details, error.hint);
      setOrder(data ? mapDbOrder(data) : null);
    } else {
      setOrder(MOCK_ORDERS.find(o => o.id === id) ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Commande introuvable.</Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[order.status] ?? colors.mutedForeground;
  const stepIdx = trackingIndex(order.status);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Suivi en temps réel</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.orderNum, { color: colors.foreground }]}>{order.orderNumber}</Text>
              <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{order.date}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{order.status}</Text>
            </View>
          </View>

          {order.status !== 'cancelled' ? (
            <View style={styles.timeline}>
              {TRACKING_STEPS.map((s, i) => {
                const reached = i <= stepIdx;
                return (
                  <View key={s.status} style={styles.timelineStep}>
                    <View style={styles.timelineStepRow}>
                      <View style={[styles.dot, { backgroundColor: reached ? colors.primary : colors.muted }]}>
                        <Feather name={s.icon as any} size={14} color={reached ? 'white' : colors.mutedForeground} />
                      </View>
                      {i < TRACKING_STEPS.length - 1 && (
                        <View style={[styles.line, { backgroundColor: i < stepIdx ? colors.primary : colors.muted }]} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stepLabel, { color: reached ? colors.foreground : colors.mutedForeground }]}>
                        {s.label}
                      </Text>
                      {reached && <Text style={[styles.stepDone, { color: colors.primary }]}>✓</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.cancelledText, { color: '#EF4444' }]}>Commande annulée.</Text>
          )}

          {order.trackingNumber && (
            <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
              <Feather name="truck" size={16} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>N° de suivi : {order.trackingNumber}</Text>
            </View>
          )}
          {order.estimatedDelivery && (
            <View style={styles.infoRow}>
              <Feather name="calendar" size={16} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                Livraison estimée : {new Date(order.estimatedDelivery).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          )}
        </View>

        {/* Carte simplifiée — position GPS du colis (placeholder visuel, pas
            de react-native-maps pour rester léger sur PC/appareils faibles). */}
        <View style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.mapHeader, { borderBottomColor: colors.border }]}>
            <Feather name="map-pin" size={16} color={colors.primary} />
            <Text style={[styles.mapTitle, { color: colors.foreground }]}>Position du colis</Text>
          </View>
          <View style={[styles.mapCanvas, { backgroundColor: colors.background }]}>
            <Feather name="navigation" size={34} color={colors.primary} />
            <Text style={[styles.mapHint, { color: colors.mutedForeground }]}>
              Suivi GPS en direct disponible pour les livraisons BARDEC.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.detailBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/order/${order.id}` as any)}
        >
          <Feather name="file-text" size={16} color="white" />
          <Text style={styles.detailBtnText}>Voir les détails de la commande</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 15 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  backBtnText: { color: 'white', fontWeight: '700' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  orderNum: { fontSize: 16, fontWeight: '800' },
  dateText: { fontSize: 12, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  timeline: { gap: 14, marginTop: 4 },
  timelineStep: { flexDirection: 'column' },
  timelineStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, height: 2, borderRadius: 1 },
  stepLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  stepDone: { fontSize: 12, marginTop: 2 },
  cancelledText: { fontSize: 14, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'transparent' },
  infoText: { fontSize: 13 },
  mapCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  mapTitle: { fontSize: 14, fontWeight: '700' },
  mapCanvas: { height: 160, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  mapHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  detailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  detailBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
});
