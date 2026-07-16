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
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useProximityCart } from '@/context/ProximityCartContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { notifyVendorNewOrder } from '@/hooks/useProximityOrders';

const GREEN = '#22C55E';

export default function ProximityCartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, shopId, shopName, removeItem, updateQuantity, clearCart, subtotal, totalItems } = useProximityCart();
  const [ordering, setOrdering] = useState(false);

  async function handleOrder() {
    if (items.length === 0) return;

    if (!isSupabaseConfigured || !supabase || !user) {
      // Demo mode
      clearCart();
      Alert.alert(
        '✅ Commande passée !',
        `Ta commande chez ${shopName} a été enregistrée. Le commerce te contactera pour confirmer.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
      return;
    }

    setOrdering(true);
    try {
      // Récupérer les coordonnées client depuis le profil (best-effort)
      let customerName: string | null = user.email ?? null;
      let customerPhone: string | null = null;
      const { data: profile } = await supabase
        .from('users')
        .select('display_name, phone')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) {
        if (profile.display_name) customerName = profile.display_name;
        if (profile.phone)        customerPhone = profile.phone;
      }

      const orderItems = items.map(i => ({
        product_id: i.productId,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
        total: i.price * i.quantity,
      }));

      const { error } = await supabase.from('proximity_orders').insert({
        customer_id:       user.id,
        proximity_shop_id: shopId,
        customer_name:     customerName,
        customer_phone:    customerPhone,
        items:             orderItems,
        subtotal,
        total:             subtotal,
        status:            'pending',
      });

      if (error) throw error;

      // Notifier le vendeur d'une nouvelle commande (local, côté client)
      if (shopName) notifyVendorNewOrder(shopName).catch(() => {});

      clearCart();
      Alert.alert(
        '✅ Commande passée !',
        `Ta commande chez ${shopName} a été enregistrée. Le commerce te contactera pour confirmer la livraison.`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/nearby' as any) }],
      );
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? 'Impossible de passer la commande.');
    } finally {
      setOrdering(false);
    }
  }

  if (items.length === 0) {
    return (
      <View style={[styles.emptyRoot, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.screenTitle, { color: colors.foreground }]}>Mon panier</Text>
        </TouchableOpacity>
        <View style={styles.emptyCenter}>
          <Feather name="shopping-bag" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Panier vide</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Ajoute des produits depuis la carte des commerces de proximité.
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: GREEN }]}
            onPress={() => router.replace('/(tabs)/nearby' as any)}
          >
            <Feather name="map-pin" size={16} color="white" />
            <Text style={styles.browseBtnTxt}>Explorer les commerces</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Mon panier</Text>
        <TouchableOpacity onPress={() => {
          Alert.alert('Vider le panier', 'Supprimer tous les articles ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Vider', style: 'destructive', onPress: clearCart },
          ]);
        }}>
          <Feather name="trash-2" size={20} color={colors.destructive} />
        </TouchableOpacity>
      </View>

      {/* Shop info */}
      <View style={[styles.shopBanner, { backgroundColor: GREEN + '12', borderColor: GREEN + '30' }]}>
        <Feather name="store" size={16} color={GREEN} />
        <Text style={[styles.shopBannerTxt, { color: GREEN }]}>{shopName}</Text>
      </View>

      {/* Items */}
      <FlatList
        data={items}
        keyExtractor={item => item.productId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 200 }}
        renderItem={({ item }) => (
          <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[styles.itemUnit, { color: colors.mutedForeground }]}>par {item.unit}</Text>
              <Text style={[styles.itemTotal, { color: GREEN }]}>
                {(item.price * item.quantity).toLocaleString('fr-FR')} FCFA
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={[styles.qtyBtn, { backgroundColor: colors.muted }]}
                onPress={() => updateQuantity(item.productId, item.quantity - 1)}
              >
                <Feather name="minus" size={14} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.qtyTxt, { color: colors.foreground }]}>{item.quantity}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, { backgroundColor: GREEN }]}
                onPress={() => updateQuantity(item.productId, item.quantity + 1)}
              >
                <Feather name="plus" size={14} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Summary */}
      <View style={[styles.summary, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{totalItems} article{totalItems > 1 ? 's' : ''}</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{subtotal.toLocaleString('fr-FR')} FCFA</Text>
        </View>
        <View style={[styles.summaryRow, { marginTop: 4 }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Livraison</Text>
          <Text style={[styles.summaryValue, { color: GREEN }]}>À définir avec le commerce</Text>
        </View>
        <TouchableOpacity
          style={[styles.orderBtn, { backgroundColor: GREEN }]}
          onPress={handleOrder}
          disabled={ordering}
        >
          {ordering
            ? <ActivityIndicator color="white" />
            : <>
                <Feather name="check-circle" size={18} color="white" />
                <Text style={styles.orderBtnTxt}>Valider la commande</Text>
              </>
          }
        </TouchableOpacity>
        <Text style={[styles.orderNote, { color: colors.mutedForeground }]}>
          Règlement en présentiel ou à la livraison · Commande confirmée par le commerce
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  emptyRoot: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  screenTitle: { fontSize: 18, fontWeight: '800' },
  shopBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, padding: 12, borderRadius: 12, borderWidth: 1 },
  shopBannerTxt: { fontSize: 14, fontWeight: '700' },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  browseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  browseBtnTxt: { color: 'white', fontSize: 15, fontWeight: '700' },
  itemCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  itemName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  itemUnit: { fontSize: 12, marginBottom: 4 },
  itemTotal: { fontSize: 16, fontWeight: '800' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  qtyTxt: { fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  summary: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, borderTopWidth: 1, gap: 0 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 15, fontWeight: '700' },
  orderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, marginTop: 14, marginBottom: 8 },
  orderBtnTxt: { color: 'white', fontSize: 16, fontWeight: '800' },
  orderNote: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
