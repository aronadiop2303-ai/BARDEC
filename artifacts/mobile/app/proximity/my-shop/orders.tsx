import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  useProximityOrders,
  useUpdateOrderStatus,
  ProximityOrder,
  ProximityOrderItem,
  ProximityOrderStatus,
} from '@/hooks/useProximityOrders';

const GREEN = '#22C55E';

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ProximityOrderStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  pending:   { label: 'En attente',  color: '#D97706', bg: '#FEF3C7', icon: 'clock' },
  confirmed: { label: 'Confirmée',   color: '#2563EB', bg: '#EFF6FF', icon: 'check-circle' },
  delivered: { label: 'Livrée',      color: '#166534', bg: '#F0FDF4', icon: 'package' },
  cancelled: { label: 'Annulée',     color: '#DC2626', bg: '#FEF2F2', icon: 'x-circle' },
};

const NEXT_STATUS: Record<ProximityOrderStatus, ProximityOrderStatus | null> = {
  pending:   'confirmed',
  confirmed: 'delivered',
  delivered: null,
  cancelled: null,
};

const NEXT_LABEL: Record<ProximityOrderStatus, string> = {
  pending:   'Confirmer',
  confirmed: 'Marquer livrée',
  delivered: '',
  cancelled: '',
};

// ── Filter tabs ───────────────────────────────────────────────────────────────

type Filter = 'all' | ProximityOrderStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',       label: 'Toutes'    },
  { key: 'pending',   label: 'En attente'},
  { key: 'confirmed', label: 'Confirmées'},
  { key: 'delivered', label: 'Livrées'   },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MyShopOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: orders = [], isLoading, refetch } = useProximityOrders();
  const updateStatus = useUpdateOrderStatus();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  function handleAdvance(order: ProximityOrder) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    if (!isSupabaseConfigured) {
      Alert.alert(
        'Mode démo',
        `Statut simulé : "${STATUS_CONFIG[next].label}". Connecte Supabase pour sauvegarder.`,
      );
      return;
    }

    Alert.alert(
      'Changer le statut',
      `Marquer cette commande comme "${STATUS_CONFIG[next].label}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: NEXT_LABEL[order.status],
          onPress: () => updateStatus.mutate({ orderId: order.id, status: next }),
        },
      ],
    );
  }

  function handleCancel(order: ProximityOrder) {
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    if (!isSupabaseConfigured) {
      Alert.alert('Mode démo', 'Connecte Supabase pour modifier les commandes.');
      return;
    }

    Alert.alert(
      'Annuler la commande',
      'Cette action est irréversible. Confirmer ?',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler la commande',
          style: 'destructive',
          onPress: () => updateStatus.mutate({ orderId: order.id, status: 'cancelled' }),
        },
      ],
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: GREEN, borderBottomColor: GREEN },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Commandes reçues</Text>
          {pendingCount > 0 && (
            <Text style={styles.headerSub}>
              {pendingCount} en attente de confirmation
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
          <Feather name="refresh-cw" size={18} color="white" />
        </TouchableOpacity>
      </View>

      {/* Demo banner */}
      {!isSupabaseConfigured && (
        <View style={[styles.demoBanner, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
          <Feather name="alert-circle" size={14} color="#D97706" />
          <Text style={[styles.demoBannerTxt, { color: '#92400E' }]}>
            Mode démo — exemples fictifs. Connecte Supabase pour les vraies commandes.
          </Text>
        </View>
      )}

      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && { borderBottomColor: GREEN, borderBottomWidth: 2 }]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterLabel,
                { color: filter === f.key ? GREEN : colors.mutedForeground },
              ]}
            >
              {f.label}
              {f.key === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune commande</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            {filter === 'all'
              ? 'Les commandes de tes clients apparaîtront ici.'
              : `Pas de commande avec le statut "${STATUS_CONFIG[filter as ProximityOrderStatus]?.label}".`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              colors={colors}
              onAdvance={() => handleAdvance(item)}
              onCancel={() => handleCancel(item)}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  colors,
  onAdvance,
  onCancel,
}: {
  order: ProximityOrder;
  colors: any;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const cfg = STATUS_CONFIG[order.status];
  const nextStatus = NEXT_STATUS[order.status];

  const date = new Date(order.created_at);
  const timeLabel = formatRelativeTime(date);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardOrderId, { color: colors.mutedForeground }]}>
            #{order.id.slice(-6).toUpperCase()}
          </Text>
          <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>{timeLabel}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Feather name={cfg.icon as any} size={12} color={cfg.color} />
          <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Customer info */}
      {(order.customer_name || order.customer_phone) && (
        <View style={[styles.customerRow, { backgroundColor: colors.muted + '40', borderColor: colors.border }]}>
          <Feather name="user" size={14} color={colors.mutedForeground} />
          <Text style={[styles.customerTxt, { color: colors.foreground }]}>
            {order.customer_name ?? 'Client'}
          </Text>
          {order.customer_phone && (
            <>
              <Text style={{ color: colors.border }}>·</Text>
              <Feather name="phone" size={12} color={colors.mutedForeground} />
              <Text style={[styles.customerPhone, { color: colors.mutedForeground }]}>
                {order.customer_phone}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Items */}
      <View style={styles.itemsList}>
        {(order.items as ProximityOrderItem[]).map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={[styles.itemQty, { color: GREEN }]}>{item.quantity}×</Text>
            <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
              {item.total.toLocaleString('fr-FR')} FCFA
            </Text>
          </View>
        ))}
      </View>

      {/* Total */}
      <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
        <Text style={[styles.totalAmount, { color: GREEN }]}>
          {order.total.toLocaleString('fr-FR')} FCFA
        </Text>
      </View>

      {/* Actions */}
      {(nextStatus || (order.status !== 'delivered' && order.status !== 'cancelled')) && (
        <View style={styles.actionsRow}>
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[styles.cancelBtnTxt, { color: colors.mutedForeground }]}>Annuler</Text>
            </TouchableOpacity>
          )}
          {nextStatus && (
            <TouchableOpacity
              style={[styles.advanceBtn, { backgroundColor: GREEN }]}
              onPress={onAdvance}
            >
              <Feather name="chevron-right" size={16} color="white" />
              <Text style={styles.advanceBtnTxt}>{NEXT_LABEL[order.status]}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'À l\'instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `Il y a ${diffD} jour${diffD > 1 ? 's' : ''}`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
  },
  demoBannerTxt: { fontSize: 12, flex: 1 },
  filterRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardOrderId: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  cardTime: { fontSize: 11, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  customerTxt: { fontSize: 13, fontWeight: '600' },
  customerPhone: { fontSize: 12 },
  itemsList: { gap: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty: { fontSize: 13, fontWeight: '800', minWidth: 28 },
  itemName: { flex: 1, fontSize: 13 },
  itemPrice: { fontSize: 13, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalAmount: { fontSize: 16, fontWeight: '800' },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnTxt: { fontSize: 13, fontWeight: '600' },
  advanceBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  advanceBtnTxt: { color: 'white', fontSize: 13, fontWeight: '700' },
});
