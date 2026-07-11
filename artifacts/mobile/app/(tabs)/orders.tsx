import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import BardecLayout from '@/components/BardecLayout';
import OrderCard from '@/components/OrderCard';
import { SkeletonOrderCard } from '@/components/SkeletonCard';
import { MOCK_ORDERS, Order } from '@/constants/mockData';

const STATUS_TABS = [
  { id: 'all', label: 'Tout' },
  { id: 'pending', label: 'En attente' },
  { id: 'pending_approval', label: 'Approbation' },
  { id: 'shipped', label: 'Expédié' },
  { id: 'completed', label: 'Terminé' },
  { id: 'cancelled', label: 'Annulé' },
];

export default function OrdersScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  const filtered = MOCK_ORDERS.filter(o => {
    const matchTab = activeTab === 'all' || o.status === activeTab;
    const matchSearch = !searchQuery || o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('orders')}</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16 }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={`${t('search')} par numéro...`}
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab.id ? colors.primary : colors.card,
                borderColor: activeTab === tab.id ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.id ? 'white' : colors.foreground }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Orders list */}
      <View style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune commande trouvée</Text>
          </View>
        ) : (
          filtered.map(order => (
            <OrderCard key={order.id} order={order} />
          ))
        )}
      </View>
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14 },
  tabsScroll: { marginBottom: 12 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, gap: 12 },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 16 },
});
