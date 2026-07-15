import React from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { CATEGORY_COLORS, ProximityShop } from '@/constants/proximityData';

interface ShopBottomSheetProps {
  shop: ProximityShop | null;
  visible: boolean;
  onClose: () => void;
}

const DAY_MAP: Record<number, string> = { 0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam' };

function getTodayHours(hours?: Record<string, string>): string {
  if (!hours) return 'Horaires non renseignés';
  const key = DAY_MAP[new Date().getDay()];
  return hours[key] ?? 'Fermé';
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}

export default function ShopBottomSheet({ shop, visible, onClose }: ShopBottomSheetProps) {
  const colors = useColors();

  if (!shop) return null;

  const categoryColor = CATEGORY_COLORS[shop.category] ?? colors.primary;
  const todayHours = getTodayHours(shop.opening_hours);
  const isOpenToday = todayHours !== 'Fermé' && todayHours !== '';

  function handleDirections() {
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${shop.lat},${shop.lng}`
      : `geo:${shop.lat},${shop.lng}?q=${encodeURIComponent(shop.name ?? '')}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`)
    );
  }

  function handleSeeProducts() {
    onClose();
    router.push(`/proximity/shop/${shop.id}` as any);
  }

  function handleCall() {
    if (shop.phone) Linking.openURL(`tel:${shop.phone}`);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Close */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Feather name="x" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Category badge */}
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '18' }]}>
            <Text style={[styles.categoryText, { color: categoryColor }]}>
              {shop.subcategory ?? shop.category}
            </Text>
            {shop.verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: '#22C55E' }]}>
                <Feather name="check" size={10} color="white" />
                <Text style={styles.verifiedText}>Vérifié</Text>
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={[styles.shopName, { color: colors.foreground }]}>{shop.name}</Text>

          {/* Rating + distance */}
          <View style={styles.metaRow}>
            <Text style={[styles.stars, { color: '#F59E0B' }]}>{renderStars(shop.rating)}</Text>
            <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>
              ({shop.rating_count})
            </Text>
            {shop.distance_km != null && (
              <>
                <View style={[styles.dot, { backgroundColor: colors.border }]} />
                <Feather name="map-pin" size={12} color={colors.success} />
                <Text style={[styles.distance, { color: colors.success }]}>
                  {shop.distance_km.toFixed(1)} km
                </Text>
              </>
            )}
          </View>

          {/* Address */}
          {shop.address && (
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>{shop.address}</Text>
            </View>
          )}

          {/* Phone */}
          {shop.phone && (
            <TouchableOpacity style={styles.infoRow} onPress={handleCall}>
              <Feather name="phone" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.primary }]}>{shop.phone}</Text>
            </TouchableOpacity>
          )}

          {/* Today's hours */}
          <View style={[styles.hoursCard, { backgroundColor: isOpenToday ? '#F0FDF4' : '#FEF2F2', borderColor: isOpenToday ? '#86EFAC' : '#FCA5A5' }]}>
            <Feather name="clock" size={14} color={isOpenToday ? '#22C55E' : '#EF4444'} />
            <Text style={[styles.hoursLabel, { color: isOpenToday ? '#166534' : '#991B1B' }]}>
              Aujourd'hui : {todayHours}
            </Text>
          </View>

          {/* Description */}
          {shop.description && (
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {shop.description}
            </Text>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#22C55E' }]}
              onPress={handleSeeProducts}
            >
              <Feather name="shopping-bag" size={16} color="white" />
              <Text style={styles.primaryBtnText}>Voir les produits</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleDirections}
            >
              <Feather name="navigation" size={16} color={colors.primary} />
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Itinéraire</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
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
    top: 16,
    right: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
  },
  categoryText: { fontSize: 12, fontWeight: '600' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  verifiedText: { color: 'white', fontSize: 10, fontWeight: '700' },
  shopName: { fontSize: 20, fontWeight: '800', marginBottom: 8, lineHeight: 26 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  stars: { fontSize: 14, letterSpacing: 1 },
  ratingCount: { fontSize: 12 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  distance: { fontSize: 13, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: { fontSize: 14, flex: 1 },
  hoursCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 10,
  },
  hoursLabel: { fontSize: 13, fontWeight: '600' },
  description: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
});
