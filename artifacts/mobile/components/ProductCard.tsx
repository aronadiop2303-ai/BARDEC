import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Product } from '@/constants/mockData';

interface Props {
  product: Product;
  compact?: boolean;
}

export default function ProductCard({ product, compact = false }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const { t } = useLanguage();

  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';
  const displayPrice = isB2B ? product.priceWholesale : product.pricePublic;
  const priceLabel = isB2B ? t('wholesale_price') : t('public_price');

  const imageUri = product.images?.[0] ?? 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/product/${product.id}`)}
    >
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} />
        {isB2B && (
          <View style={[styles.b2bBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.b2bBadgeText}>B2B</Text>
          </View>
        )}
        <View style={[styles.ratingBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Feather name="star" size={10} color="#F59E0B" />
          <Text style={styles.ratingText}>{product.rating.toFixed(1)}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={compact ? 1 : 2}>
          {product.name}
        </Text>
        <Text style={[styles.vendor, { color: colors.mutedForeground }]} numberOfLines={1}>
          {product.vendorName}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.primary }]}>
            ${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {isB2B && (
            <Text style={[styles.minOrder, { color: colors.mutedForeground }]}>
              {t('min_order')}: {product.minQuantity}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    flex: 1,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 150,
    backgroundColor: '#EEF3FB',
  },
  b2bBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  b2bBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ratingText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  info: {
    padding: 10,
    gap: 3,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  vendor: {
    fontSize: 11,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
    gap: 2,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
  },
  minOrder: {
    fontSize: 10,
  },
});
