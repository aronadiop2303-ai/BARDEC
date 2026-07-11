import React, { useState, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import BardecLayout from '@/components/BardecLayout';
import ProductCard from '@/components/ProductCard';
import { SkeletonProductCard } from '@/components/SkeletonCard';
import { CATEGORIES, MOCK_PRODUCTS, Product } from '@/constants/mockData';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const SORT_OPTIONS = [
  { id: 'relevant', label: 'Pertinence' },
  { id: 'price_asc', label: 'Prix ↑' },
  { id: 'price_desc', label: 'Prix ↓' },
  { id: 'rating', label: 'Mieux notés' },
];

export default function SearchScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(params.q ?? '');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSort, setSelectedSort] = useState('relevant');
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  const filtered = MOCK_PRODUCTS.filter(p => {
    const matchQuery = !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.description.toLowerCase().includes(query.toLowerCase()) || p.vendorName.toLowerCase().includes(query.toLowerCase());
    const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchMin = !minPrice || p.pricePublic >= Number(minPrice);
    const matchMax = !maxPrice || p.pricePublic <= Number(maxPrice);
    return matchQuery && matchCat && matchMin && matchMax;
  }).sort((a, b) => {
    if (selectedSort === 'price_asc') return a.pricePublic - b.pricePublic;
    if (selectedSort === 'price_desc') return b.pricePublic - a.pricePublic;
    if (selectedSort === 'rating') return b.rating - a.rating;
    return 0;
  });

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      {/* Search input */}
      <View style={[styles.searchRow, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t('search_placeholder')}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoFocus={!params.q}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          style={[styles.filterBtn, { backgroundColor: showFilters ? colors.primary : colors.card, borderColor: colors.border }]}
        >
          <Feather name="sliders" size={18} color={showFilters ? 'white' : colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Filters panel */}
      {showFilters && (
        <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.filterTitle, { color: colors.foreground }]}>{t('filter')}</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={[styles.priceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Prix min"
              placeholderTextColor={colors.mutedForeground}
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="numeric"
            />
            <Text style={{ color: colors.mutedForeground }}>–</Text>
            <TextInput
              style={[styles.priceInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Prix max"
              placeholderTextColor={colors.mutedForeground}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity
            style={[styles.applyBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowFilters(false)}
          >
            <Text style={styles.applyBtnText}>{t('apply')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sort tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {SORT_OPTIONS.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.sortChip, { backgroundColor: selectedSort === s.id ? colors.primary : colors.card, borderColor: colors.border }]}
            onPress={() => setSelectedSort(s.id)}
          >
            <Text style={[styles.sortChipText, { color: selectedSort === s.id ? 'white' : colors.foreground }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catChip, { backgroundColor: selectedCategory === cat.id ? colors.accent : 'transparent', borderColor: selectedCategory === cat.id ? colors.primary : colors.border }]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text style={[styles.catChipText, { color: selectedCategory === cat.id ? colors.primary : colors.mutedForeground }]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      <View style={styles.resultsHeader}>
        <Text style={[styles.resultsCount, { color: colors.mutedForeground }]}>
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.grid}>
        {filtered.map(product => (
          <View key={product.id} style={[styles.gridItem, { width: CARD_WIDTH }]}>
            <ProductCard product={product} />
          </View>
        ))}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Feather name="search" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun produit trouvé</Text>
          </View>
        )}
      </View>
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterPanel: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  filterTitle: { fontSize: 15, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  applyBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  sortScroll: { marginTop: 8 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  sortChipText: { fontSize: 12, fontWeight: '600' },
  catScroll: { marginTop: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  catChipText: { fontSize: 12, fontWeight: '600' },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  resultsCount: { fontSize: 13 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  gridItem: {},
  empty: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 16, textAlign: 'center' },
});
