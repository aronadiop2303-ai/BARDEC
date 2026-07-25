import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import ProductCard from '@/components/ProductCard';
import { SkeletonProductCard } from '@/components/SkeletonCard';
import { CATEGORIES, MOCK_PRODUCTS } from '@/constants/mockData';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function HomeScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';
  const isVendor = user?.role === 'VENDOR';
  const isAdmin = user?.role === 'ADMIN';

  const filteredProducts = MOCK_PRODUCTS.filter(p =>
    selectedCategory === 'all' || p.category === selectedCategory
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  // ── Route guard (MUST be before any conditional return) ──────────────────
  // Rules of Hooks: every hook must be called on every render, in the same
  // order. Placing this useEffect after the `if (!isAuthenticated)` early
  // return caused "Rendered more hooks than during the previous render" on
  // role switches because the hook count differed between renders.
  useEffect(() => {
    if (isVendor) router.replace('/vendor-dashboard');
    else if (isAdmin) router.replace('/admin');
  }, [isVendor, isAdmin]);

  // ── Conditional returns (safe now — all hooks are above) ─────────────────
  if (!isAuthenticated) {
    return (
      <View style={[styles.loginPrompt, { backgroundColor: colors.background }]}>
        <View style={[styles.loginCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.bardecTitle, { color: colors.primary }]}>BARDEC ∞</Text>
          <Text style={[styles.loginSubtitle, { color: colors.mutedForeground }]}>
            Marketplace B2B & B2C mondial
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={styles.loginBtnText}>{t('login')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.registerBtn, { borderColor: colors.primary }]}
            onPress={() => router.push('/auth/register')}
          >
            <Text style={[styles.registerBtnText, { color: colors.primary }]}>{t('register')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show nothing while the redirect is in flight.
  if (isVendor || isAdmin) return null;

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      {/* Search bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t('search_placeholder')}
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => router.push({ pathname: '/(tabs)/search', params: { q: searchQuery } })}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={() => {}}>
            <Feather name="mic" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* B2B Dashboard or Promo Banner */}
      {isB2B ? (
        <View style={styles.dashboardSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tableau de Bord B2B</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll}>
            <View style={[styles.kpiCard, { backgroundColor: colors.primary }]}>
              <Feather name="clock" size={18} color="white" />
              <Text style={styles.kpiValue}>{user?.pendingApprovals ?? 0}</Text>
              <Text style={styles.kpiLabel}>{t('pending_orders')}</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: colors.secondary }]}>
              <Feather name="dollar-sign" size={18} color="white" />
              <Text style={styles.kpiValue}>${((user?.creditBalance ?? 0) / 1000).toFixed(0)}k</Text>
              <Text style={styles.kpiLabel}>{t('net30')}</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: '#7C3AED' }]}>
              <Feather name="credit-card" size={18} color="white" />
              <Text style={styles.kpiValue}>${((user?.creditLimit ?? 50000) / 1000).toFixed(0)}k</Text>
              <Text style={styles.kpiLabel}>{t('credit_limit')}</Text>
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.promoBanner, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={styles.promoTitle}>Offres Exclusives ✨</Text>
            <Text style={styles.promoSubtitle}>Jusqu'à 40% de réduction</Text>
          </View>
          <TouchableOpacity style={styles.promoBtn} onPress={() => router.push('/(tabs)/search')}>
            <Text style={styles.promoBtnText}>{t('search')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Categories */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('categories')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.catChip,
                {
                  backgroundColor: selectedCategory === cat.id ? colors.primary : colors.card,
                  borderColor: selectedCategory === cat.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Feather
                name={cat.icon as keyof typeof Feather.glyphMap}
                size={14}
                color={selectedCategory === cat.id ? 'white' : colors.mutedForeground}
              />
              <Text style={[
                styles.catChipText,
                { color: selectedCategory === cat.id ? 'white' : colors.foreground },
              ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Products grid */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('trending')}</Text>
        {loading ? (
          <View style={styles.grid}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.gridItem, { width: CARD_WIDTH }]}>
                <SkeletonProductCard />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredProducts.map(product => (
              <View key={product.id} style={[styles.gridItem, { width: CARD_WIDTH }]}>
                <ProductCard product={product} />
              </View>
            ))}
          </View>
        )}
      </View>
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  bardecTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
  },
  loginSubtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  loginBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  registerBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  registerBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  dashboardSection: {
    paddingTop: 16,
    gap: 10,
  },
  kpiScroll: {
    paddingLeft: 16,
  },
  kpiCard: {
    width: 120,
    padding: 14,
    borderRadius: 14,
    marginRight: 10,
    gap: 6,
  },
  kpiValue: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
  },
  kpiLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  promoBanner: {
    margin: 16,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  promoSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 4,
  },
  promoBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  promoBtnText: {
    color: 'white',
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  catScroll: {
    marginLeft: -16,
    paddingLeft: 16,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {},
});
