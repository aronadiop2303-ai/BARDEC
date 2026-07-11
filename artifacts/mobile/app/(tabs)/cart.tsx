import React from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import BardecLayout from '@/components/BardecLayout';

export default function CartScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { items, removeItem, updateQuantity, subtotal, clearCart } = useCart();

  const isB2B = user?.role === 'BUYER';
  const shippingCost = 0;
  const taxRate = 0.08;
  const tax = subtotal * taxRate;
  const total = subtotal + shippingCost + tax;

  if (items.length === 0) {
    return (
      <BardecLayout showFooter>
        <View style={styles.empty}>
          <Feather name="shopping-cart" size={64} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Panier vide</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Ajoutez des produits pour commencer vos achats
          </Text>
          <TouchableOpacity
            style={[styles.shopBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/(tabs)/search')}
          >
            <Text style={styles.shopBtnText}>{t('search')}</Text>
          </TouchableOpacity>
        </View>
      </BardecLayout>
    );
  }

  return (
    <BardecLayout>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('cart')}</Text>
        <TouchableOpacity onPress={() => Alert.alert('Vider le panier', 'Êtes-vous sûr?', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Vider', style: 'destructive', onPress: clearCart },
        ])}>
          <Text style={[styles.clearText, { color: colors.destructive }]}>Vider</Text>
        </TouchableOpacity>
      </View>

      {/* Cart items */}
      {items.map(item => (
        <View key={item.productId} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.itemImage, { backgroundColor: colors.muted }]}>
            <Feather name="package" size={24} color={colors.mutedForeground} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
              {item.productName}
            </Text>
            <Text style={[styles.itemPrice, { color: colors.primary }]}>
              ${item.price.toFixed(2)}{t('per_unit')}
            </Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={[styles.qtyBtn, { borderColor: colors.border }]}
                onPress={() => updateQuantity(item.productId, item.quantity - 1)}
              >
                <Feather name="minus" size={14} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.qtyText, { color: colors.foreground }]}>{item.quantity}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, { borderColor: colors.border }]}
                onPress={() => updateQuantity(item.productId, item.quantity + 1)}
              >
                <Feather name="plus" size={14} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.lineTotal, { color: colors.foreground }]}>
                = ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => removeItem(item.productId)} style={styles.removeBtn}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      ))}

      {/* B2B approval note */}
      {isB2B && (
        <View style={[styles.approvalNote, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' }]}>
          <Feather name="alert-circle" size={16} color="#7C3AED" />
          <Text style={[styles.approvalText, { color: '#7C3AED' }]}>
            En tant que Buyer, cette commande sera soumise à l'approbation avant traitement.
          </Text>
        </View>
      )}

      {/* Order summary */}
      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Récapitulatif</Text>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('subtotal')}</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>${subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('shipping')}</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{t('free')}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('tax')} (8%)</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>${tax.toFixed(2)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.totalLabel, { color: colors.foreground }]}>{t('total')}</Text>
          <Text style={[styles.totalValue, { color: colors.primary }]}>${total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/checkout')}
        >
          <Feather name="credit-card" size={18} color="white" />
          <Text style={styles.checkoutBtnText}>{t('checkout')}</Text>
        </TouchableOpacity>
      </View>
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800' },
  clearText: { fontSize: 14, fontWeight: '600' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 16,
    minHeight: 500,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center' },
  shopBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  shopBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  itemCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  itemPrice: { fontSize: 14, fontWeight: '700' },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: { fontSize: 15, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  lineTotal: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  removeBtn: { padding: 4 },
  approvalNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  approvalText: { flex: 1, fontSize: 13, lineHeight: 18 },
  summary: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryTitle: { fontSize: 16, fontWeight: '700' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '800' },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  checkoutBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
