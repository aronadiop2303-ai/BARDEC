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
import { useMyProximityShop, useDeleteProximityProduct } from '@/hooks/useMyProximityShop';
import { ProximityProduct } from '@/constants/proximityData';
import { isSupabaseConfigured } from '@/lib/supabase';

const GREEN = '#22C55E';

export default function MyShopProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { shop, products, isLoadingProducts } = useMyProximityShop();
  const deleteProduct = useDeleteProximityProduct();
  const [deleting, setDeleting] = useState<string | null>(null);

  function handleDelete(product: ProximityProduct) {
    Alert.alert(
      'Supprimer',
      `Supprimer "${product.name}" du catalogue ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!isSupabaseConfigured) {
              Alert.alert('Mode démo', 'Connecte Supabase pour gérer les produits.');
              return;
            }
            setDeleting(product.id);
            try {
              await deleteProduct.mutateAsync(product.id);
            } catch (e: any) {
              Alert.alert('Erreur', e.message);
            } finally {
              setDeleting(null);
            }
          },
        },
      ],
    );
  }

  function handleAdd() {
    if (!isSupabaseConfigured) {
      Alert.alert('Mode démo', 'Connecte Supabase pour ajouter des produits.');
      return;
    }
    if (!shop) return;
    router.push({ pathname: '/proximity/my-shop/add-product' as any, params: { shopId: shop.id } });
  }

  function handleEdit(product: ProximityProduct) {
    if (!isSupabaseConfigured) {
      Alert.alert('Mode démo', 'Connecte Supabase pour modifier les produits.');
      return;
    }
    router.push({ pathname: '/proximity/my-shop/add-product' as any, params: { shopId: shop!.id, productId: product.id, productJson: JSON.stringify(product) } });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Mes produits</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: GREEN }]}
          onPress={handleAdd}
        >
          <Feather name="plus" size={18} color="white" />
        </TouchableOpacity>
      </View>

      {!isSupabaseConfigured && (
        <View style={[styles.demoBanner, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
          <Feather name="alert-circle" size={14} color="#D97706" />
          <Text style={[styles.demoBannerTxt, { color: '#92400E' }]}>
            Mode démo — Connecte Supabase pour gérer tes produits en temps réel.
          </Text>
        </View>
      )}

      {isLoadingProducts ? (
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="package" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun produit</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                Ajoute tes premiers produits pour qu'ils apparaissent aux clients.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: GREEN }]}
                onPress={handleAdd}
              >
                <Feather name="plus" size={16} color="white" />
                <Text style={styles.emptyBtnTxt}>Ajouter un produit</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: product }) => (
            <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.productTopRow}>
                  <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <View style={[styles.stockBadge, { backgroundColor: product.in_stock ? '#F0FDF4' : '#FEF2F2' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: product.in_stock ? '#166534' : '#991B1B' }}>
                      {product.in_stock ? 'En stock' : 'Épuisé'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.productUnit, { color: colors.mutedForeground }]}>par {product.unit}</Text>
                <Text style={[styles.productPrice, { color: GREEN }]}>
                  {product.price.toLocaleString('fr-FR')} FCFA
                </Text>
              </View>
              <View style={styles.productActions}>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.muted }]}
                  onPress={() => handleEdit(product)}
                >
                  <Feather name="edit-2" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: '#FEF2F2' }]}
                  onPress={() => handleDelete(product)}
                  disabled={deleting === product.id}
                >
                  {deleting === product.id
                    ? <ActivityIndicator size="small" color={colors.destructive} />
                    : <Feather name="trash-2" size={14} color={colors.destructive} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* FAB */}
      {products.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: GREEN, bottom: insets.bottom + 24 }]}
          onPress={handleAdd}
        >
          <Feather name="plus" size={22} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  addBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  demoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 16, padding: 12, borderRadius: 12, borderWidth: 1 },
  demoBannerTxt: { fontSize: 12, flex: 1, lineHeight: 18 },
  productCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 12 },
  productTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  productName: { fontSize: 15, fontWeight: '700', flex: 1 },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  productUnit: { fontSize: 12, marginBottom: 4 },
  productPrice: { fontSize: 15, fontWeight: '800' },
  productActions: { flexDirection: 'column', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  emptyState: { paddingTop: 60, alignItems: 'center', gap: 14, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  emptyBtnTxt: { color: 'white', fontSize: 15, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 },
});
