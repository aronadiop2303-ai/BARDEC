import React, { useState, useCallback } from 'react';
import {
  Alert, Dimensions, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import { SkeletonBox } from '@/components/SkeletonCard';
import { MOCK_ORDERS, MOCK_PRODUCTS, VENDOR_STATS } from '@/constants/mockData';

const { width } = Dimensions.get('window');

type Period = '7j' | '30j' | '90j' | '12m';

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const barW = (width - 80) / data.length - 3;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 60, gap: 3 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            width: barW,
            height: (v / max) * 60,
            backgroundColor: color,
            borderRadius: 4,
            opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.6,
          }}
        />
      ))}
    </View>
  );
}

export default function VendorDashboardScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('30j');
  const [shopActive, setShopActive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products'>('overview');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 900));
    setRefreshing(false);
  }, []);

  const periodData: Record<Period, number[]> = {
    '7j': VENDOR_STATS.monthlySales.slice(-7),
    '30j': VENDOR_STATS.monthlySales,
    '90j': [...VENDOR_STATS.monthlySales, ...VENDOR_STATS.monthlySales.slice(0, 3)],
    '12m': VENDOR_STATS.monthlySales,
  };

  const kpis = [
    { icon: 'dollar-sign', label: t('sales'), value: `$${(VENDOR_STATS.totalSales / 1000).toFixed(0)}k`, color: colors.primary },
    { icon: 'package', label: t('active_orders'), value: VENDOR_STATS.activeOrders, color: colors.secondary },
    { icon: 'message-circle', label: t('response_rate'), value: `${VENDOR_STATS.responseRate}%`, color: '#22C55E' },
    { icon: 'grid', label: t('products'), value: VENDOR_STATS.totalProducts, color: '#8B5CF6' },
    { icon: 'star', label: t('rating'), value: VENDOR_STATS.avgRating.toFixed(1), color: '#F59E0B' },
  ];

  const recentOrders = MOCK_ORDERS.slice(0, 4);
  const myProducts = MOCK_PRODUCTS.filter(p => p.vendorId === 'v1').concat(MOCK_PRODUCTS.slice(0, 3));

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      {/* Shop header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shopHeader}
      >
        <View style={styles.shopInfo}>
          <View style={styles.shopAvatar}>
            <Text style={styles.shopAvatarText}>{user?.company?.[0] ?? 'V'}</Text>
          </View>
          <View>
            <View style={styles.shopNameRow}>
              <Text style={styles.shopName}>{user?.company ?? 'Ma Boutique'}</Text>
              <View style={styles.verifiedBadge}>
                <Feather name="check-circle" size={12} color="white" />
                <Text style={styles.verifiedText}>Vérifié</Text>
              </View>
            </View>
            <Text style={styles.shopEmail}>{user?.email}</Text>
          </View>
        </View>
        <View style={styles.shopToggle}>
          <Text style={styles.shopToggleLabel}>{shopActive ? 'Boutique active' : 'Boutique inactive'}</Text>
          <Switch
            value={shopActive}
            onValueChange={setShopActive}
            trackColor={{ false: 'rgba(255,255,255,0.3)', true: 'rgba(255,255,255,0.8)' }}
            thumbColor="white"
          />
        </View>
      </LinearGradient>

      {/* KPI cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {kpis.map((kpi, i) => (
          <View key={i} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '20' }]}>
              <Feather name={kpi.icon as any} size={18} color={kpi.color} />
            </View>
            <Text style={[styles.kpiValue, { color: colors.foreground }]}>{kpi.value}</Text>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{kpi.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Tab navigation */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(['overview', 'orders', 'products'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {tab === 'overview' ? 'Vue d\'ensemble' : tab === 'orders' ? 'Commandes' : 'Produits'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <View style={styles.section}>
          {/* Sales chart */}
          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.chartHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ventes</Text>
              <View style={styles.periodRow}>
                {(['7j', '30j', '90j', '12m'] as Period[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodBtn, { backgroundColor: period === p ? colors.primary : 'transparent' }]}
                    onPress={() => setPeriod(p)}
                  >
                    <Text style={[styles.periodBtnText, { color: period === p ? 'white' : colors.mutedForeground }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <MiniChart data={periodData[period]} color={colors.primary} />
            <View style={styles.chartFooter}>
              <Text style={[styles.chartTotal, { color: colors.primary }]}>
                ${VENDOR_STATS.totalSales.toLocaleString()}
              </Text>
              <Text style={[styles.chartChange, { color: '#22C55E' }]}>↑ +12.4%</Text>
            </View>
          </View>

          {/* Quick actions */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actions rapides</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Feather name="plus-circle" size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Ajouter produit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Feather name="upload" size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Importer CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Feather name="download" size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Exporter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Feather name="settings" size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Paramètres</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Orders tab */}
      {activeTab === 'orders' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Commandes récentes</Text>
          {recentOrders.map(order => (
            <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderNum, { color: colors.foreground }]}>{order.orderNumber}</Text>
                <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{order.date}</Text>
              </View>
              <View style={styles.orderMeta}>
                <Text style={[styles.orderTotal, { color: colors.primary }]}>${order.total.toLocaleString()}</Text>
                <View style={[styles.statusDot, { backgroundColor: order.status === 'completed' ? '#22C55E' : order.status === 'shipped' ? '#0EA5E9' : '#F59E0B' }]} />
              </View>
              <TouchableOpacity style={[styles.orderAction, { borderColor: colors.border }]}>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={[styles.viewAllBtn, { borderColor: colors.border }]}>
            <Text style={[styles.viewAllText, { color: colors.primary }]}>Voir toutes les commandes</Text>
            <Feather name="arrow-right" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Products tab */}
      {activeTab === 'products' && (
        <View style={styles.section}>
          <View style={styles.productsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Mes produits</Text>
            <TouchableOpacity style={[styles.addProductBtn, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.addProductText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
          {myProducts.map(product => (
            <View key={product.id} style={[styles.productRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.productIcon, { backgroundColor: colors.muted }]}>
                <Feather name="package" size={18} color={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
                <Text style={[styles.productMeta, { color: colors.mutedForeground }]}>
                  Stock: {product.stock} · ${product.priceWholesale}/unité
                </Text>
              </View>
              <View style={styles.productActions}>
                <TouchableOpacity style={styles.prodActionBtn}>
                  <Feather name="edit-2" size={15} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.prodActionBtn}>
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  shopHeader: {
    padding: 20,
    gap: 16,
  },
  shopInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  shopAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shopAvatarText: { color: 'white', fontSize: 22, fontWeight: '800' },
  shopNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopName: { color: 'white', fontSize: 18, fontWeight: '800' },
  shopEmail: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verifiedText: { color: 'white', fontSize: 11, fontWeight: '700' },
  shopToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  shopToggleLabel: { color: 'white', fontSize: 14, fontWeight: '600' },
  kpiScroll: { paddingVertical: 16 },
  kpiCard: {
    width: 110,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 11, textAlign: 'center' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  section: { paddingHorizontal: 16, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodRow: { flexDirection: 'row', gap: 4 },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  periodBtnText: { fontSize: 12, fontWeight: '600' },
  chartFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chartTotal: { fontSize: 22, fontWeight: '800' },
  chartChange: { fontSize: 14, fontWeight: '600' },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: (width - 52) / 2,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  orderNum: { fontSize: 13, fontWeight: '600' },
  orderDate: { fontSize: 11, marginTop: 2 },
  orderMeta: { alignItems: 'flex-end', gap: 4 },
  orderTotal: { fontSize: 14, fontWeight: '700' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  orderAction: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  viewAllText: { fontSize: 14, fontWeight: '600' },
  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addProductText: { color: 'white', fontSize: 13, fontWeight: '700' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  productIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productName: { fontSize: 13, fontWeight: '600' },
  productMeta: { fontSize: 12, marginTop: 2 },
  productActions: { flexDirection: 'row', gap: 8 },
  prodActionBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
