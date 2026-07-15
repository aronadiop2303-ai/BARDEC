import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import { useMyProximityShop, useToggleShopActive } from '@/hooks/useMyProximityShop';
import { CATEGORY_COLORS } from '@/constants/proximityData';
import { isSupabaseConfigured } from '@/lib/supabase';

const GREEN = '#22C55E';

export default function MyShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { shop, products, isLoading } = useMyProximityShop();
  const toggleActive = useToggleShopActive();

  const catColor = shop ? (CATEGORY_COLORS[shop.category] ?? GREEN) : GREEN;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={GREEN} size="large" />
      </View>
    );
  }

  // ── No shop ────────────────────────────────────────────────────────────────
  if (!shop) {
    return (
      <View style={[styles.noShopRoot, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backTitle, { color: colors.foreground }]}>Ma boutique</Text>
        </TouchableOpacity>

        <View style={styles.noShopBody}>
          <View style={[styles.noShopIcon, { backgroundColor: GREEN + '15' }]}>
            <Feather name="store" size={48} color={GREEN} />
          </View>
          <Text style={[styles.noShopTitle, { color: colors.foreground }]}>
            Pas encore de boutique
          </Text>
          <Text style={[styles.noShopDesc, { color: colors.mutedForeground }]}>
            Inscris ton commerce local sur BARDEC et commence à vendre à tes voisins. L'inscription est gratuite.
          </Text>

          {!isSupabaseConfigured && (
            <View style={[styles.demoBanner, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
              <Feather name="alert-circle" size={14} color="#D97706" />
              <Text style={[styles.demoBannerTxt, { color: '#92400E' }]}>
                Mode démo — Connecte Supabase pour sauvegarder ta boutique.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: GREEN }]}
            onPress={() => router.push('/proximity/register-shop' as any)}
          >
            <Feather name="plus-circle" size={18} color="white" />
            <Text style={styles.createBtnTxt}>Ouvrir ma boutique quotidienne</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Has shop ───────────────────────────────────────────────────────────────
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
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Status cards */}
        <View style={styles.statusRow}>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: GREEN }]}>{products.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Produits</Text>
          </View>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statBadge, { backgroundColor: shop.verified ? '#F0FDF4' : '#FEF3C7' }]}>
              <Text style={[styles.statBadgeTxt, { color: shop.verified ? '#166534' : '#92400E' }]}>
                {shop.verified ? '✓ Vérifié' : '⏳ En attente'}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Statut</Text>
          </View>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: shop.rating > 0 ? '#F59E0B' : colors.mutedForeground }]}>
              {shop.rating > 0 ? shop.rating.toFixed(1) : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Note ★</Text>
          </View>
        </View>

        {/* Active toggle */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Boutique active</Text>
              <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>
                {shop.is_active ? 'Visible sur la carte' : 'Masquée des résultats'}
              </Text>
            </View>
            <Switch
              value={shop.is_active}
              onValueChange={val => {
                if (!isSupabaseConfigured) { Alert.alert('Mode démo', 'Connecte Supabase pour modifier le statut.'); return; }
                toggleActive.mutate({ shopId: shop.id, isActive: val });
              }}
              trackColor={{ false: colors.muted, true: GREEN }}
              thumbColor="white"
            />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <ActionRow
            icon="package"
            label="Gérer mes produits"
            desc={`${products.length} produit${products.length !== 1 ? 's' : ''} en catalogue`}
            color={GREEN}
            colors={colors}
            onPress={() => router.push('/proximity/my-shop/products' as any)}
          />
          <ActionRow
            icon="edit"
            label="Modifier les infos"
            desc="Nom, description, horaires, photos"
            color={colors.primary}
            colors={colors}
            onPress={() => router.push('/proximity/register-shop' as any)}
          />
          <ActionRow
            icon="map-pin"
            label="Voir sur la carte"
            desc="Aperçu client de votre boutique"
            color={colors.secondary}
            colors={colors}
            onPress={() => router.push(`/proximity/shop/${shop.id}` as any)}
          />
        </View>

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {shop.address && (
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoTxt, { color: colors.foreground }]}>{shop.address}</Text>
            </View>
          )}
          {shop.phone && (
            <View style={styles.infoRow}>
              <Feather name="phone" size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoTxt, { color: colors.foreground }]}>{shop.phone}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ActionRow({ icon, label, desc, color, colors, onPress }: any) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.actionDesc, { color: colors.mutedForeground }]}>{desc}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noShopRoot: { flex: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  backTitle: { fontSize: 17, fontWeight: '800' },
  noShopBody: { flex: 1, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center', gap: 16 },
  noShopIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  noShopTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  noShopDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  demoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, width: '100%' },
  demoBannerTxt: { fontSize: 12, flex: 1, lineHeight: 18 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16, width: '100%', justifyContent: 'center', marginTop: 8 },
  createBtnTxt: { color: 'white', fontSize: 16, fontWeight: '800' },
  shopHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' },
  shopName: { color: 'white', fontSize: 18, fontWeight: '800' },
  shopSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  statusRow: { flexDirection: 'row', gap: 10, padding: 16 },
  statusCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 6 },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statBadgeTxt: { fontSize: 11, fontWeight: '700' },
  section: { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1, padding: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sectionDesc: { fontSize: 13 },
  actionsSection: { marginHorizontal: 16, gap: 10, marginBottom: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, gap: 14 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  actionDesc: { fontSize: 12 },
  infoCard: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 14, gap: 10, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoTxt: { fontSize: 14, flex: 1 },
});
