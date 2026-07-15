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
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useProximityShop } from '@/hooks/useProximityShop';
import { useProximityCart } from '@/context/ProximityCartContext';
import { CATEGORY_COLORS, ProximityProduct } from '@/constants/proximityData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GREEN = '#22C55E';

export default function ShopProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useProximityShop(id ?? null);
  const { addItem, totalItems, shopId: cartShopId } = useProximityCart();
  const [adding, setAdding] = useState<Record<string, boolean>>({});

  const shop = data?.shop ?? null;
  const products = data?.products ?? [];
  const catColor = shop ? (CATEGORY_COLORS[shop.category] ?? GREEN) : GREEN;

  async function handleAdd(product: ProximityProduct) {
    if (!shop) return;
    setAdding(prev => ({ ...prev, [product.id]: true }));

    const { switched } = await addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      quantity: 1,
      shopId: shop.id,
      shopName: shop.name,
    });

    setAdding(prev => ({ ...prev, [product.id]: false }));

    if (switched) {
      Alert.alert(
        'Nouveau commerce',
        `Ton panier précédent (${cartShopId}) a été vidé. Tu commandes maintenant chez ${shop.name}.`,
        [{ text: 'OK' }],
      );
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={GREEN} size="large" />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Commerce introuvable.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.shopHeader, { paddingTop: insets.top + 8, backgroundColor: catColor }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
          <Text style={styles.shopSub}>{shop.subcategory ?? shop.category}</Text>
        </View>
        {totalItems > 0 && (
          <TouchableOpacity
            style={styles.cartBadge}
            onPress={() => router.push('/proximity/cart' as any)}
          >
            <Feather name="shopping-bag" size={18} color={catColor} />
            <Text style={[styles.cartCount, { color: catColor }]}>{totalItems}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Shop meta */}
      <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {shop.address && (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text style={[styles.metaTxt, { color: colors.foreground }]}>{shop.address}</Text>
          </View>
        )}
        {shop.phone && (
          <View style={styles.metaRow}>
            <Feather name="phone" size={14} color={colors.mutedForeground} />
            <Text style={[styles.metaTxt, { color: colors.primary }]}>{shop.phone}</Text>
          </View>
        )}
        {shop.description && (
          <Text style={[styles.metaDesc, { color: colors.mutedForeground }]}>{shop.description}</Text>
        )}
      </View>

      {/* Products */}
      <Text style={[styles.productsTitle, { color: colors.foreground }]}>
        Produits disponibles
      </Text>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="package" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucun produit pour l'instant.
            </Text>
          </View>
        }
        renderItem={({ item: product }) => (
          <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
              <Text style={[styles.productUnit, { color: colors.mutedForeground }]}>par {product.unit}</Text>
              <Text style={[styles.productPrice, { color: GREEN }]}>
                {product.price.toLocaleString('fr-FR')} FCFA
              </Text>
            </View>
            <View style={styles.productRight}>
              {product.in_stock ? (
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: GREEN }]}
                  onPress={() => handleAdd(product)}
                  disabled={adding[product.id]}
                >
                  {adding[product.id]
                    ? <ActivityIndicator size="small" color="white" />
                    : <Feather name="plus" size={16} color="white" />
                  }
                </TouchableOpacity>
              ) : (
                <View style={[styles.outOfStock, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.outOfStockTxt, { color: colors.mutedForeground }]}>Épuisé</Text>
                </View>
              )}
            </View>
          </View>
        )}
      />

      {/* Floating cart button */}
      {totalItems > 0 && (
        <View style={[styles.floatingCart, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.floatingCartBtn, { backgroundColor: GREEN }]}
            onPress={() => router.push('/proximity/cart' as any)}
          >
            <Feather name="shopping-bag" size={18} color="white" />
            <Text style={styles.floatingCartTxt}>Voir le panier · {totalItems} article{totalItems > 1 ? 's' : ''}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  shopHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' },
  shopName: { color: 'white', fontSize: 18, fontWeight: '800' },
  shopSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  cartBadge: { backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartCount: { fontWeight: '800', fontSize: 14 },
  metaCard: { margin: 16, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaTxt: { fontSize: 14, flex: 1 },
  metaDesc: { fontSize: 13, lineHeight: 18 },
  productsTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 10 },
  productCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  productName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  productUnit: { fontSize: 12, marginBottom: 4 },
  productPrice: { fontSize: 16, fontWeight: '800' },
  productRight: { alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  outOfStock: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  outOfStockTxt: { fontSize: 11, fontWeight: '600' },
  emptyState: { paddingTop: 40, alignItems: 'center', gap: 12 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  floatingCart: { position: 'absolute', left: 16, right: 16 },
  floatingCartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
  floatingCartTxt: { color: 'white', fontSize: 15, fontWeight: '700' },
});
