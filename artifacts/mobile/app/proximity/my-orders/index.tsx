import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import {
  useMyProximityOrders,
  CustomerProximityOrder,
  ProximityOrderStatus,
} from '@/hooks/useProximityOrders';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useProximityCart } from '@/context/ProximityCartContext';

const GREEN = '#22C55E';

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ProximityOrderStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  pending:   { label: 'En attente',  color: '#D97706', bg: '#FEF3C7', icon: 'clock'         },
  confirmed: { label: 'Confirmée',   color: '#2563EB', bg: '#EFF6FF', icon: 'check-circle'  },
  delivered: { label: 'Livrée',      color: '#166534', bg: '#F0FDF4', icon: 'package'       },
  cancelled: { label: 'Annulée',     color: '#DC2626', bg: '#FEF2F2', icon: 'x-circle'      },
};

type Filter = 'all' | ProximityOrderStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',       label: 'Toutes'    },
  { key: 'pending',   label: 'En attente'},
  { key: 'confirmed', label: 'Confirmées'},
  { key: 'delivered', label: 'Livrées'   },
  { key: 'cancelled', label: 'Annulées'  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'À l\'instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `Il y a ${diffD} j`;
}

function formatPrice(amount: number) {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MyOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: orders = [], isLoading, refetch } = useMyProximityOrders();
  const [filter, setFilter] = useState<Filter>('all');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const { reorder } = useProximityCart();

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  async function handleReorder(order: CustomerProximityOrder) {
    setReorderingId(order.id);
    try {
      // Verify the shop still exists when Supabase is available
      if (isSupabaseConfigured && supabase) {
        const { data: shop, error } = await supabase
          .from('proximity_shops')
          .select('id')
          .eq('id', order.proximity_shop_id)
          .maybeSingle();

        if (error || !shop) {
          Alert.alert(
            'Commerce introuvable',
            `Le commerce "${order.shop_name}" n'est plus disponible. La commande ne peut pas être répétée.`,
          );
          return;
        }
      }

      reorder(order.items, order.proximity_shop_id, order.shop_name);
      router.push('/proximity/cart' as any);
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Mes commandes</Text>
        {!isSupabaseConfigured && (
          <View style={[styles.demoBadge, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
            <Text style={[styles.demoText, { color: '#F59E0B' }]}>Démo</Text>
          </View>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filtersBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? GREEN : colors.muted,
                  borderColor: active ? GREEN : colors.border,
                },
              ]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipTxt, { color: active ? 'white' : colors.foreground }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <ActivityIndicator color={GREEN} size="large" />
            ) : (
              <>
                <Feather name="shopping-bag" size={48} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  Aucune commande
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  Tes commandes auprès des commerces à proximité s'afficheront ici.
                </Text>
                <TouchableOpacity
                  style={[styles.browseBtn, { backgroundColor: GREEN }]}
                  onPress={() => router.push('/(tabs)/nearby' as any)}
                >
                  <Feather name="map-pin" size={16} color="white" />
                  <Text style={styles.browseBtnTxt}>Explorer les commerces</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            colors={colors}
            onReorder={handleReorder}
            reordering={reorderingId === item.id}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </View>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  colors,
  onReorder,
  reordering,
}: {
  order: CustomerProximityOrder;
  colors: any;
  onReorder: (order: CustomerProximityOrder) => void;
  reordering: boolean;
}) {
  const sc = STATUS_CONFIG[order.status];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Feather name="store" size={14} color={GREEN} />
          <Text style={[styles.shopName, { color: colors.foreground }]} numberOfLines={1}>
            {order.shop_name}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Feather name={sc.icon as any} size={11} color={sc.color} />
          <Text style={[styles.statusLabel, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      {/* Date */}
      <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
        {formatDate(order.created_at)}
      </Text>

      {/* Items */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.itemsList}>
        {order.items.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={[styles.itemQty, { color: GREEN }]}>{item.quantity}×</Text>
            <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
              {formatPrice(item.total)}
            </Text>
          </View>
        ))}
      </View>

      {/* Total */}
      <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
        <Text style={[styles.totalAmount, { color: colors.foreground }]}>
          {formatPrice(order.total)}
        </Text>
      </View>

      {/* Status hint */}
      {order.status === 'pending' && (
        <View style={[styles.hint, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B40' }]}>
          <Feather name="info" size={13} color="#D97706" />
          <Text style={[styles.hintTxt, { color: '#92400E' }]}>
            Le commerce va confirmer ta commande prochainement.
          </Text>
        </View>
      )}
      {order.status === 'confirmed' && (
        <View style={[styles.hint, { backgroundColor: '#EFF6FF', borderColor: '#2563EB40' }]}>
          <Feather name="check-circle" size={13} color="#2563EB" />
          <Text style={[styles.hintTxt, { color: '#1E40AF' }]}>
            Ta commande est confirmée et en cours de préparation.
          </Text>
        </View>
      )}

      {/* Re-order button — only for delivered orders */}
      {order.status === 'delivered' && (
        <TouchableOpacity
          style={[styles.reorderBtn, { borderColor: GREEN, opacity: reordering ? 0.6 : 1 }]}
          onPress={() => onReorder(order)}
          disabled={reordering}
        >
          {reordering ? (
            <ActivityIndicator size="small" color={GREEN} />
          ) : (
            <>
              <Feather name="refresh-cw" size={14} color={GREEN} />
              <Text style={[styles.reorderBtnTxt, { color: GREEN }]}>Re-commander</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  demoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  demoText: { fontSize: 11, fontWeight: '700' },
  filtersBar: { maxHeight: 52, borderBottomWidth: 1 },
  filtersContent: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipTxt: { fontSize: 12, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingTop: 14 },
  empty: {
    paddingTop: 72,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  browseBtnTxt: { color: 'white', fontSize: 14, fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  shopName: { fontSize: 15, fontWeight: '700', flex: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 12, marginTop: -4 },
  divider: { height: 1 },
  itemsList: { gap: 5 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty: { fontSize: 13, fontWeight: '800', minWidth: 28 },
  itemName: { flex: 1, fontSize: 13 },
  itemPrice: { fontSize: 13, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 4,
  },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalAmount: { fontSize: 16, fontWeight: '800' },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  hintTxt: { flex: 1, fontSize: 12, lineHeight: 18 },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 2,
  },
  reorderBtnTxt: { fontSize: 13, fontWeight: '700' },
});
