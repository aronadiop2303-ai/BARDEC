import React, { useState, useCallback } from 'react';
import {
  Dimensions, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import BardecLayout from '@/components/BardecLayout';
import { ADMIN_STATS, DEMO_USERS, MOCK_ORDERS } from '@/constants/mockData';

const { width } = Dimensions.get('window');
type AdminTab = 'dashboard' | 'users' | 'vendors' | 'orders' | 'disputes' | 'settings';

function MiniBarChart({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values);
  const barW = (width - 100) / values.length - 4;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 4 }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            width: barW,
            height: (v / max) * 50,
            backgroundColor: color,
            borderRadius: 3,
            opacity: 0.4 + (i / values.length) * 0.6,
          }}
        />
      ))}
    </View>
  );
}

export default function AdminScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 900));
    setRefreshing(false);
  }, []);

  const kpis = [
    { icon: 'users', label: 'Utilisateurs', value: ADMIN_STATS.totalUsers.toLocaleString(), color: colors.primary, trend: '+8.2%' },
    { icon: 'briefcase', label: 'Vendeurs', value: ADMIN_STATS.totalVendors, color: '#7C3AED', trend: '+3.1%' },
    { icon: 'shopping-cart', label: 'Commandes', value: ADMIN_STATS.totalOrders.toLocaleString(), color: colors.secondary, trend: '+12.4%' },
    { icon: 'dollar-sign', label: 'Revenus', value: `$${(ADMIN_STATS.totalRevenue / 1e6).toFixed(1)}M`, color: '#22C55E', trend: '+9.7%' },
    { icon: 'clock', label: 'Vendeurs en attente', value: ADMIN_STATS.pendingVendors, color: '#F59E0B', trend: '' },
    { icon: 'alert-triangle', label: 'Litiges actifs', value: ADMIN_STATS.activeDisputes, color: '#EF4444', trend: '' },
  ];

  const pendingVendors = [
    { id: 'v10', name: 'Lagos Tech Hub', country: 'Nigeria', docs: true, kyc: 'pending' },
    { id: 'v11', name: 'Cairo Fabrics Co.', country: 'Egypt', docs: true, kyc: 'pending' },
    { id: 'v12', name: 'Nairobi Solar Ltd.', country: 'Kenya', docs: false, kyc: 'incomplete' },
  ];

  const activeDisputes = [
    { id: 'd1', order: 'BDC-2024-001100', buyer: 'Ahmed D.', vendor: 'Vega Electronics', amount: 5200, status: 'investigating' },
    { id: 'd2', order: 'BDC-2024-000876', buyer: 'Marie C.', vendor: 'Sahel Naturals', amount: 1150, status: 'open' },
    { id: 'd3', order: 'BDC-2024-001088', buyer: 'Liu W.', vendor: 'PackPro', amount: 780, status: 'resolved' },
  ];

  const platformSettings = [
    { key: 'commission_b2c', label: 'Commission B2C', value: '3.5%' },
    { key: 'commission_b2b', label: 'Commission B2B', value: '2.0%' },
    { key: 'max_credit_limit', label: 'Crédit max Net30', value: '$500 000' },
    { key: 'kyc_required', label: 'KYC obligatoire vendeur', value: 'Oui' },
    { key: 'min_order_b2b', label: 'Commande min B2B', value: '$500' },
  ];

  const TABS: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'bar-chart-2' },
    { id: 'users', label: 'Utilisateurs', icon: 'users' },
    { id: 'vendors', label: 'Vendeurs', icon: 'briefcase' },
    { id: 'orders', label: 'Commandes', icon: 'shopping-cart' },
    { id: 'disputes', label: 'Litiges', icon: 'alert-triangle' },
    { id: 'settings', label: 'Paramètres', icon: 'settings' },
  ];

  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing}>
      {/* Admin header */}
      <LinearGradient
        colors={['#0D1B3E', colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Feather name="shield" size={28} color="white" />
          <View>
            <Text style={styles.headerTitle}>{t('admin_panel')}</Text>
            <Text style={styles.headerSubtitle}>Supervisions plateforme BARDEC</Text>
          </View>
        </View>
        <View style={styles.alertBadge}>
          <Feather name="bell" size={16} color="white" />
          <Text style={styles.alertBadgeText}>{ADMIN_STATS.pendingVendors + ADMIN_STATS.activeDisputes}</Text>
        </View>
      </LinearGradient>

      {/* Tab nav */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabChip, { backgroundColor: activeTab === tab.id ? colors.primary : colors.card, borderColor: colors.border }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Feather name={tab.icon as any} size={13} color={activeTab === tab.id ? 'white' : colors.mutedForeground} />
            <Text style={[styles.tabChipText, { color: activeTab === tab.id ? 'white' : colors.foreground }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* DASHBOARD */}
      {activeTab === 'dashboard' && (
        <View style={styles.section}>
          <View style={styles.kpiGrid}>
            {kpis.map((kpi, i) => (
              <View key={i} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                  <Feather name={kpi.icon as any} size={20} color={kpi.color} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.foreground }]}>{kpi.value}</Text>
                <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{kpi.label}</Text>
                {kpi.trend ? <Text style={[styles.kpiTrend, { color: '#22C55E' }]}>{kpi.trend}</Text> : null}
              </View>
            ))}
          </View>

          {/* B2B vs B2C chart */}
          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Commandes B2B vs B2C (12 mois)</Text>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>B2B</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.secondary }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>B2C</Text>
              </View>
            </View>
            <MiniBarChart values={[42, 38, 55, 49, 63, 71, 68, 79, 72, 85, 80, 94]} color={colors.primary} />
          </View>
        </View>
      )}

      {/* USERS */}
      {activeTab === 'users' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Gestion des utilisateurs</Text>
          {DEMO_USERS.map(u => (
            <View key={u.id} style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.userAvatarText}>{u.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{u.name}</Text>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                <Text style={[styles.userRole, { color: colors.primary }]}>{u.role}</Text>
              </View>
              <View style={styles.userActions}>
                <TouchableOpacity style={[styles.actionChip, { backgroundColor: '#D1FAE5' }]}>
                  <Feather name="check" size={12} color="#059669" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionChip, { backgroundColor: '#FEE2E2' }]}>
                  <Feather name="x" size={12} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* VENDORS */}
      {activeTab === 'vendors' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Validation KYC vendeurs</Text>
          {pendingVendors.map(v => (
            <View key={v.id} style={[styles.vendorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.vendorHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.vendorName, { color: colors.foreground }]}>{v.name}</Text>
                  <Text style={[styles.vendorCountry, { color: colors.mutedForeground }]}>{v.country}</Text>
                </View>
                <View style={[styles.kycStatusBadge, { backgroundColor: v.kyc === 'pending' ? '#FEF3C7' : '#FEE2E2' }]}>
                  <Text style={[styles.kycStatusText, { color: v.kyc === 'pending' ? '#D97706' : '#DC2626' }]}>
                    {v.kyc === 'pending' ? 'En attente' : 'Incomplet'}
                  </Text>
                </View>
              </View>
              <View style={styles.docStatus}>
                <Feather name={v.docs ? 'check-circle' : 'x-circle'} size={14} color={v.docs ? '#22C55E' : '#EF4444'} />
                <Text style={[styles.docStatusText, { color: colors.mutedForeground }]}>
                  Documents {v.docs ? 'soumis' : 'manquants'}
                </Text>
              </View>
              <View style={styles.vendorActions}>
                <TouchableOpacity
                  style={[styles.vendorActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#22C55E' }]}
                  onPress={() => Alert.alert('Approuvé', `${v.name} a été approuvé comme vendeur.`)}
                >
                  <Feather name="check" size={14} color="#059669" />
                  <Text style={[styles.vendorActionText, { color: '#059669' }]}>{t('approve')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.vendorActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                  onPress={() => Alert.alert('Rejeté', `${v.name} a été rejeté.`)}
                >
                  <Feather name="x" size={14} color="#DC2626" />
                  <Text style={[styles.vendorActionText, { color: '#DC2626' }]}>{t('reject')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                  <Feather name="file-text" size={14} color={colors.primary} />
                  <Text style={[styles.vendorActionText, { color: colors.primary }]}>Docs</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ORDERS */}
      {activeTab === 'orders' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Toutes les commandes</Text>
          {MOCK_ORDERS.map(order => (
            <View key={order.id} style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{order.orderNumber}</Text>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{order.date}</Text>
              </View>
              <Text style={[styles.orderTotal, { color: colors.primary }]}>${order.total.toLocaleString()}</Text>
              <View style={[styles.kycStatusBadge, { backgroundColor: order.status === 'completed' ? '#D1FAE5' : order.status === 'shipped' ? '#E0F2FE' : '#FEF3C7' }]}>
                <Text style={[styles.kycStatusText, { color: order.status === 'completed' ? '#059669' : order.status === 'shipped' ? '#0369A1' : '#D97706' }]}>
                  {order.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* DISPUTES */}
      {activeTab === 'disputes' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trade Assurance — Litiges</Text>
          {activeDisputes.map(d => (
            <View key={d.id} style={[styles.disputeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.disputeHeader}>
                <Text style={[styles.disputeOrder, { color: colors.foreground }]}>{d.order}</Text>
                <View style={[styles.disputeStatus, {
                  backgroundColor: d.status === 'resolved' ? '#D1FAE5' : d.status === 'investigating' ? '#FEF3C7' : '#FEE2E2',
                }]}>
                  <Text style={[styles.disputeStatusText, {
                    color: d.status === 'resolved' ? '#059669' : d.status === 'investigating' ? '#D97706' : '#DC2626',
                  }]}>
                    {d.status === 'resolved' ? 'Résolu' : d.status === 'investigating' ? 'Investigation' : 'Ouvert'}
                  </Text>
                </View>
              </View>
              <View style={styles.disputeParties}>
                <Text style={[styles.disputeParty, { color: colors.mutedForeground }]}>Acheteur: {d.buyer}</Text>
                <Text style={[styles.disputeParty, { color: colors.mutedForeground }]}>Vendeur: {d.vendor}</Text>
                <Text style={[styles.disputeAmount, { color: colors.primary }]}>${d.amount.toLocaleString()}</Text>
              </View>
              {d.status !== 'resolved' && (
                <View style={styles.disputeActions}>
                  <TouchableOpacity style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                    <Feather name="eye" size={13} color={colors.primary} />
                    <Text style={[styles.vendorActionText, { color: colors.primary }]}>Examiner</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.vendorActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#22C55E' }]}>
                    <Feather name="check-circle" size={13} color="#059669" />
                    <Text style={[styles.vendorActionText, { color: '#059669' }]}>Résoudre</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* SETTINGS */}
      {activeTab === 'settings' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('platform_settings')}</Text>
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {platformSettings.map((s, i) => (
              <View key={s.key}>
                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, { color: colors.foreground }]}>{s.label}</Text>
                  <View style={styles.settingValueRow}>
                    <Text style={[styles.settingValue, { color: colors.primary }]}>{s.value}</Text>
                    <TouchableOpacity>
                      <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
                {i < platformSettings.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </View>

          {/* API Keys section */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Clés API & Webhooks</Text>
          <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.apiKeyRow}>
              <Feather name="key" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Clé API publique</Text>
                <Text style={[styles.settingValue, { color: colors.mutedForeground, fontFamily: 'monospace' }]}>bdc_pub_••••••••••••••••</Text>
              </View>
              <Feather name="copy" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.apiKeyRow}>
              <Feather name="link" size={16} color={colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Webhooks sortants</Text>
                <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>3 endpoints configurés</Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.apiKeyRow}>
              <Feather name="code" size={16} color='#7C3AED' />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Documentation API</Text>
                <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>REST · OpenAPI 3.0</Text>
              </View>
              <Feather name="external-link" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  alertBadgeText: { color: 'white', fontSize: 13, fontWeight: '700' },
  tabScroll: { paddingVertical: 12 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabChipText: { fontSize: 12, fontWeight: '600' },
  section: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: (width - 52) / 3,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  kpiIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  kpiValue: { fontSize: 16, fontWeight: '800' },
  kpiLabel: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
  kpiTrend: { fontSize: 11, fontWeight: '600' },
  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  chartLegend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
  userName: { fontSize: 14, fontWeight: '600' },
  userEmail: { fontSize: 12, marginTop: 1 },
  userRole: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  userActions: { flexDirection: 'row', gap: 8 },
  actionChip: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vendorCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  vendorHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  vendorName: { fontSize: 14, fontWeight: '700' },
  vendorCountry: { fontSize: 12, marginTop: 2 },
  kycStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kycStatusText: { fontSize: 11, fontWeight: '600' },
  docStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docStatusText: { fontSize: 13 },
  vendorActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  vendorActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  vendorActionText: { fontSize: 12, fontWeight: '600' },
  orderTotal: { fontSize: 14, fontWeight: '700', marginRight: 8 },
  disputeCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  disputeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disputeOrder: { fontSize: 13, fontWeight: '700' },
  disputeStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  disputeStatusText: { fontSize: 11, fontWeight: '600' },
  disputeParties: { gap: 2 },
  disputeParty: { fontSize: 12 },
  disputeAmount: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  disputeActions: { flexDirection: 'row', gap: 8 },
  settingsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 0,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: { fontSize: 14, fontWeight: '500' },
  settingValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1 },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
});
