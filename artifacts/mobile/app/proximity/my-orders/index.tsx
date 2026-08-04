import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  useCancelMyOrder,
  CustomerProximityOrder,
  ProximityOrderStatus,
} from '@/hooks/useProximityOrders';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useProximityCart, ReorderItem } from '@/context/ProximityCartContext';

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

function getCancelledByLabel(cancelledBy: 'customer' | 'vendor' | null | undefined): string | null {
  if (cancelledBy === 'customer') return 'Annulée par toi';
  if (cancelledBy === 'vendor')   return 'Annulée par le commerce';
  return null;
}

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

// ── Re-order quantity sheet ───────────────────────────────────────────────────

interface ReorderSheetProps {
  order: CustomerProximityOrder | null;
  onConfirm: (items: ReorderItem[]) => void;
  onClose: () => void;
}

function ReorderSheet({ order, onConfirm, onClose }: ReorderSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Local quantity map — keyed by product_id
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    if (!order) return {};
    return Object.fromEntries(order.items.map(i => [i.product_id, i.quantity]));
  });

  // Reset quantities when a new order is shown
  React.useEffect(() => {
    if (order) {
      setQuantities(Object.fromEntries(order.items.map(i => [i.product_id, i.quantity])));
    }
  }, [order?.id]);

  if (!order) return null;

  function change(productId: string, delta: number) {
    setQuantities(prev => {
      const next = Math.max(0, (prev[productId] ?? 1) + delta);
      return { ...prev, [productId]: next };
    });
  }

  const adjustedItems: ReorderItem[] = order.items
    .map(i => ({ ...i, quantity: quantities[i.product_id] ?? i.quantity }))
    .filter(i => i.quantity > 0);

  const total = adjustedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const hasItems = adjustedItems.length > 0;

  function handleConfirm() {
    if (!hasItems) return;
    onConfirm(adjustedItems);
  }

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      {/* Dimmed overlay */}
      <TouchableOpacity style={sheetStyles.overlay} activeOpacity={1} onPress={onClose} />

      <View style={[sheetStyles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />

        {/* Close button */}
        <TouchableOpacity style={sheetStyles.closeBtn} onPress={onClose}>
          <Feather name="x" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Title */}
        <Text style={[sheetStyles.title, { color: colors.foreground }]}>
          Ajuster la commande
        </Text>
        <Text style={[sheetStyles.subtitle, { color: colors.mutedForeground }]}>
          {order.shop_name}
        </Text>

        {/* Item list */}
        <ScrollView style={sheetStyles.itemsScroll} showsVerticalScrollIndicator={false} bounces={false}>
          {order.items.map((item) => {
            const qty = quantities[item.product_id] ?? item.quantity;
            return (
              <View
                key={item.product_id}
                style={[sheetStyles.itemRow, { borderBottomColor: colors.border }]}
              >
                <View style={sheetStyles.itemInfo}>
                  <Text style={[sheetStyles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[sheetStyles.itemUnitPrice, { color: colors.mutedForeground }]}>
                    {formatPrice(item.unit_price)} / unité
                  </Text>
                </View>

                {/* Quantity stepper */}
                <View style={sheetStyles.stepper}>
                  <TouchableOpacity
                    style={[
                      sheetStyles.stepBtn,
                      { borderColor: qty <= 0 ? colors.border : '#DC2626' },
                    ]}
                    onPress={() => change(item.product_id, -1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name={qty <= 1 ? 'trash-2' : 'minus'} size={14} color={qty <= 0 ? colors.mutedForeground : '#DC2626'} />
                  </TouchableOpacity>

                  <Text style={[sheetStyles.stepQty, { color: qty === 0 ? colors.mutedForeground : colors.foreground }]}>
                    {qty}
                  </Text>

                  <TouchableOpacity
                    style={[sheetStyles.stepBtn, { borderColor: GREEN }]}
                    onPress={() => change(item.product_id, +1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="plus" size={14} color={GREEN} />
                  </TouchableOpacity>
                </View>

                {/* Line total */}
                <Text style={[sheetStyles.itemLineTotal, { color: qty === 0 ? colors.mutedForeground : colors.foreground }]}>
                  {formatPrice(item.unit_price * qty)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Total + CTA */}
        <View style={[sheetStyles.footer, { borderTopColor: colors.border }]}>
          <View style={sheetStyles.totalRow}>
            <Text style={[sheetStyles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
            <Text style={[sheetStyles.totalAmount, { color: colors.foreground }]}>
              {formatPrice(total)}
            </Text>
          </View>

          {!hasItems && (
            <View style={[sheetStyles.emptyWarn, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B40' }]}>
              <Feather name="alert-triangle" size={13} color="#D97706" />
              <Text style={sheetStyles.emptyWarnTxt}>
                Ajoute au moins un article avant de confirmer.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[sheetStyles.confirmBtn, { backgroundColor: hasItems ? GREEN : colors.muted }]}
            onPress={handleConfirm}
            disabled={!hasItems}
          >
            <Feather name="shopping-cart" size={16} color={hasItems ? 'white' : colors.mutedForeground} />
            <Text style={[sheetStyles.confirmBtnTxt, { color: hasItems ? 'white' : colors.mutedForeground }]}>
              Ajouter au panier
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  itemsScroll: {
    flexGrow: 0,
    maxHeight: 320,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemUnitPrice: {
    fontSize: 11,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepQty: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 22,
    textAlign: 'center',
  },
  itemLineTotal: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'right',
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 8,
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptyWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyWarnTxt: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  confirmBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MyOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: orders = [], isLoading, refetch } = useMyProximityOrders();
  const [filter, setFilter] = useState<Filter>('all');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reorderSheetOrder, setReorderSheetOrder] = useState<CustomerProximityOrder | null>(null);
  const { reorder, items: cartItems, shopId: cartShopId, shopName: cartShopName } = useProximityCart();
  const cancelOrder = useCancelMyOrder();

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  function handleCancel(order: CustomerProximityOrder) {
    if (order.status !== 'pending') return;

    const demoSuffix = !isSupabaseConfigured
      ? '\n\n(Mode démo — la liste sera mise à jour localement)'
      : '';

    Alert.alert(
      'Annuler la commande',
      `Confirmes-tu l'annulation de cette commande ? Cette action est irréversible.${demoSuffix}`,
      [
        { text: 'Non, garder', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            setCancellingId(order.id);
            cancelOrder.mutate(order.id, {
              onSettled: () => setCancellingId(null),
              onError: (err) => {
                Alert.alert(
                  'Erreur',
                  err instanceof Error ? err.message : 'Impossible d\'annuler la commande.',
                );
              },
            });
          },
        },
      ],
    );
  }

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

      // If the cart already has items from a different shop, ask for confirmation
      // before opening the quantity-adjustment sheet
      if (cartItems.length > 0 && cartShopId !== order.proximity_shop_id) {
        Alert.alert(
          'Remplacer le panier ?',
          `Ton panier contient des articles de "${cartShopName}". Le re-commander les remplacera par ceux de "${order.shop_name}".`,
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Remplacer',
              style: 'destructive',
              onPress: () => setReorderSheetOrder(order),
            },
          ],
        );
        return;
      }

      // Open the quantity-adjustment sheet
      setReorderSheetOrder(order);
    } finally {
      setReorderingId(null);
    }
  }

  function handleConfirmReorder(adjustedItems: ReorderItem[]) {
    if (!reorderSheetOrder) return;
    reorder(adjustedItems, reorderSheetOrder.proximity_shop_id, reorderSheetOrder.shop_name);
    setReorderSheetOrder(null);
    router.push('/proximity/cart' as any);
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
            onCancel={handleCancel}
            cancelling={cancellingId === item.id}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {/* Re-order quantity sheet */}
      <ReorderSheet
        order={reorderSheetOrder}
        onConfirm={handleConfirmReorder}
        onClose={() => setReorderSheetOrder(null)}
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
  onCancel,
  cancelling,
}: {
  order: CustomerProximityOrder;
  colors: any;
  onReorder: (order: CustomerProximityOrder) => void;
  reordering: boolean;
  onCancel: (order: CustomerProximityOrder) => void;
  cancelling: boolean;
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
        <View style={styles.statusCol}>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Feather name={sc.icon as any} size={11} color={sc.color} />
            <Text style={[styles.statusLabel, { color: sc.color }]}>{sc.label}</Text>
          </View>
          {order.status === 'cancelled' && getCancelledByLabel(order.cancelled_by) && (
            <Text style={[styles.cancelledByLabel, { color: sc.color }]}>
              {getCancelledByLabel(order.cancelled_by)}
            </Text>
          )}
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

      {/* Cancel button — pending orders only */}
      {order.status === 'pending' && (
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: '#DC2626', opacity: cancelling ? 0.6 : 1 }]}
          onPress={() => onCancel(order)}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <>
              <Feather name="x" size={14} color="#DC2626" />
              <Text style={styles.cancelBtnTxt}>Annuler la commande</Text>
            </>
          )}
        </TouchableOpacity>
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
  statusCol: {
    alignItems: 'flex-end',
    gap: 3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  cancelledByLabel: { fontSize: 10, fontWeight: '600', opacity: 0.8 },
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
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 2,
  },
  cancelBtnTxt: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
});
