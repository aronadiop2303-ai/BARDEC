import React, { useState, useCallback } from 'react';
import {
  Dimensions, Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Alert, TextInput,
} from 'react-native';
import { Feather } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import BardecLayout from '@/components/BardecLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ADMIN_STATS, DEMO_USERS, MOCK_ORDERS } from '@/constants/mockData';

const { width } = Dimensions.get('window');
type AdminTab = 'dashboard' | 'users' | 'vendors' | 'orders' | 'disputes' | 'payments' | 'settings' | 'apikeys';

// ── Mock API keys ─────────────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { id: 'products.read',  label: 'Produits — lecture'   },
  { id: 'products.write', label: 'Produits — écriture'  },
  { id: 'orders.read',    label: 'Commandes — lecture'  },
  { id: 'orders.write',   label: 'Commandes — écriture' },
  { id: 'messages.read',  label: 'Messages — lecture'   },
  { id: 'messages.write', label: 'Messages — écriture'  },
];

interface MockApiKey {
  id: string;
  name: string;
  key: string;       // full key — only shown once at creation
  preview: string;   // first 8 chars + "..."
  permissions: string[];
  active: boolean;
  created_at: string;
  last_used: string | null;
}

const MOCK_API_KEYS: MockApiKey[] = [
  {
    id: 'k1', name: 'Claude Desktop — Full access',
    key: 'bdc_a1b2c3d4e5f6g7h8i9j0k1l2', preview: 'bdc_a1b2...',
    permissions: ['products.read', 'orders.read', 'orders.write', 'messages.read', 'messages.write'],
    active: true, created_at: '12 juil. 2026', last_used: 'Aujourd\'hui 09:42',
  },
  {
    id: 'k2', name: 'Zapier — Lecture seule',
    key: 'bdc_zapier123456789abcdef', preview: 'bdc_zapi...',
    permissions: ['products.read', 'orders.read'],
    active: true, created_at: '5 juil. 2026', last_used: 'Hier 17:18',
  },
  {
    id: 'k3', name: 'Ancien agent n8n (révoqué)',
    key: 'bdc_n8n_old_revoked_key_xyz', preview: 'bdc_n8n_...',
    permissions: ['orders.read', 'orders.write'],
    active: false, created_at: '1 juin 2026', last_used: '28 juin 2026',
  },
];

interface MockAuditEntry {
  id: string; action: string; key_name: string; created_at: string; success: boolean;
}
const MOCK_AUDIT: MockAuditEntry[] = [
  { id: 'a1', action: 'mcp.list_orders_by_customer', key_name: 'Claude Desktop — Full access', created_at: 'Aujourd\'hui 09:42', success: true },
  { id: 'a2', action: 'mcp.update_order_status',     key_name: 'Claude Desktop — Full access', created_at: 'Aujourd\'hui 09:41', success: true },
  { id: 'a3', action: 'mcp.get_order_status',        key_name: 'Zapier — Lecture seule',       created_at: 'Hier 17:18',        success: true },
  { id: 'a4', action: 'mcp.search_products',         key_name: 'Zapier — Lecture seule',       created_at: 'Hier 16:55',        success: true },
  { id: 'a5', action: 'mcp.process_refund',          key_name: 'Claude Desktop — Full access', created_at: 'Hier 14:23',        success: false },
  { id: 'a6', action: 'mcp.nearby_shops',            key_name: 'Zapier — Lecture seule',       created_at: 'Hier 11:07',        success: true },
];

// ── XOF formatter (same as checkout) ─────────────────────────────────────────
const XOF_RATE = 656;
function formatXOF(usd: number): string {
  return Math.round(usd * XOF_RATE).toLocaleString('fr-FR') + ' FCFA';
}

// ── Mock pending payments ─────────────────────────────────────────────────────
type PmtStatus = 'awaiting_verification' | 'paid' | 'failed';
interface PendingPayment {
  id: string; orderNumber: string; customer: string; method: string;
  methodIcon: string; methodColor: string; amountUSD: number;
  proofUrl: string | null; submittedAt: string;
  status: PmtStatus; notes: string;
}

const PENDING_PAYMENTS: PendingPayment[] = [
  {
    id: 'pp1', orderNumber: 'BDC-2024-001201', customer: 'Amadou Diallo',
    method: 'Wave', methodIcon: 'zap', methodColor: '#1A56DB',
    amountUSD: 87.50, proofUrl: 'https://picsum.photos/seed/wave1/400/300',
    submittedAt: 'Aujourd\'hui 09:14', status: 'awaiting_verification', notes: '',
  },
  {
    id: 'pp2', orderNumber: 'BDC-2024-001198', customer: 'Fatou Sène',
    method: 'Orange Money', methodIcon: 'smartphone', methodColor: '#F97316',
    amountUSD: 234.00, proofUrl: 'https://picsum.photos/seed/om1/400/300',
    submittedAt: 'Aujourd\'hui 08:47', status: 'awaiting_verification', notes: '',
  },
  {
    id: 'pp3', orderNumber: 'BDC-2024-001185', customer: 'Kofi Mensah',
    method: 'MTN MoMo', methodIcon: 'phone', methodColor: '#EAB308',
    amountUSD: 450.00, proofUrl: 'https://picsum.photos/seed/momo1/400/300',
    submittedAt: 'Hier 17:22', status: 'awaiting_verification', notes: '',
  },
  {
    id: 'pp4', orderNumber: 'BDC-2024-001170', customer: 'Marie Coulibaly',
    method: 'Wave', methodIcon: 'zap', methodColor: '#1A56DB',
    amountUSD: 130.75, proofUrl: null,
    submittedAt: 'Hier 14:05', status: 'awaiting_verification', notes: '',
  },
];

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

// Per-screen ErrorBoundary: catches rendering crashes in any tab section
// (e.g. the apikeys tab or disputes table) and shows a recoverable error UI
// instead of a blank white screen.
export default function AdminScreen() {
  return (
    <ErrorBoundary>
      <AdminScreenInner />
    </ErrorBoundary>
  );
}

function AdminScreenInner() {
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

  const [payments, setPayments] = useState<PendingPayment[]>(PENDING_PAYMENTS);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);

  const pendingCount = payments.filter(p => p.status === 'awaiting_verification').length;

  // ── API keys state ──────────────────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<MockApiKey[]>(MOCK_API_KEYS);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState<Record<string, boolean>>({});
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null); // shown once
  const [auditFilter, setAuditFilter] = useState<string | null>(null); // filter by key id

  function togglePerm(permId: string) {
    setNewKeyPerms(p => ({ ...p, [permId]: !p[permId] }));
  }

  function createApiKey() {
    if (!newKeyName.trim()) {
      Alert.alert('Nom requis', 'Donnez un nom à cette clé avant de la créer.');
      return;
    }
    const selectedPerms = ALL_PERMISSIONS.filter(p => newKeyPerms[p.id]).map(p => p.id);
    if (selectedPerms.length === 0) {
      Alert.alert('Permissions requises', 'Sélectionnez au moins une permission.');
      return;
    }
    const rawKey = 'bdc_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const newKey: MockApiKey = {
      id: 'k' + Date.now(),
      name: newKeyName.trim(),
      key: rawKey,
      preview: rawKey.slice(0, 8) + '...',
      permissions: selectedPerms,
      active: true,
      created_at: 'Aujourd\'hui',
      last_used: null,
    };
    setApiKeys(ks => [newKey, ...ks]);
    setJustCreatedKey(rawKey);
    setShowCreateForm(false);
    setNewKeyName('');
    setNewKeyPerms({});
  }

  function revokeKey(id: string) {
    const key = apiKeys.find(k => k.id === id);
    Alert.alert(
      'Révoquer la clé',
      `Révoquer "${key?.name}" ? Elle ne fonctionnera plus immédiatement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Révoquer', style: 'destructive', onPress: () => setApiKeys(ks => ks.map(k => k.id === id ? { ...k, active: false } : k)) },
      ]
    );
  }

  const filteredAudit = auditFilter
    ? MOCK_AUDIT.filter(a => apiKeys.find(k => k.id === auditFilter)?.name === a.key_name)
    : MOCK_AUDIT;

  function validatePayment(id: string) {
    Alert.alert(
      'Valider le paiement',
      'Confirmer la réception et validation de ce paiement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider', style: 'default',
          onPress: () => setPayments(ps => ps.map(p => p.id === id ? { ...p, status: 'paid' } : p)),
        },
      ]
    );
  }

  function rejectPayment(id: string) {
    const note = rejectNotes[id] ?? '';
    if (!note.trim()) {
      Alert.alert('Motif requis', 'Veuillez indiquer le motif du rejet avant de rejeter.'); return;
    }
    setPayments(ps => ps.map(p => p.id === id ? { ...p, status: 'failed', notes: note } : p));
    setRejectOpen(null);
  }

  const TABS: { id: AdminTab; label: string; icon: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard',    icon: 'bar-chart-2'   },
    { id: 'users',     label: 'Utilisateurs', icon: 'users'         },
    { id: 'vendors',   label: 'Vendeurs',      icon: 'briefcase'     },
    { id: 'orders',    label: 'Commandes',     icon: 'shopping-cart' },
    { id: 'disputes',  label: 'Litiges',       icon: 'alert-triangle'},
    { id: 'payments',  label: 'Paiements',     icon: 'credit-card',  badge: pendingCount },
    { id: 'apikeys',   label: 'Clés API / MCP', icon: 'key'         },
    { id: 'settings',  label: 'Paramètres',   icon: 'settings'      },
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
          <Text style={styles.alertBadgeText}>{ADMIN_STATS.pendingVendors + ADMIN_STATS.activeDisputes + pendingCount}</Text>
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
            {(tab.badge ?? 0) > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
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

      {/* PAYMENTS */}
      {activeTab === 'payments' && (
        <View style={styles.section}>
          <View style={styles.paymentsHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Paiements à vérifier</Text>
              <Text style={[styles.paymentsSubtitle, { color: colors.mutedForeground }]}>
                {pendingCount} en attente · Vérification manuelle requise
              </Text>
            </View>
            <View style={[styles.pmtCountBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
              <Feather name="clock" size={13} color="#D97706" />
              <Text style={[styles.pmtCountText, { color: '#D97706' }]}>{pendingCount}</Text>
            </View>
          </View>

          {payments.map(pmt => (
            <View key={pmt.id} style={[styles.pmtCard, { backgroundColor: colors.card, borderColor: pmt.status === 'awaiting_verification' ? '#F59E0B' : pmt.status === 'paid' ? '#22C55E' : '#EF4444' }]}>

              {/* Card header */}
              <View style={styles.pmtCardHeader}>
                <View style={[styles.pmtIconBox, { backgroundColor: pmt.methodColor + '20' }]}>
                  <Feather name={pmt.methodIcon as any} size={18} color={pmt.methodColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pmtOrderNum, { color: colors.foreground }]}>{pmt.orderNumber}</Text>
                  <Text style={[styles.pmtCustomer, { color: colors.mutedForeground }]}>{pmt.customer} · {pmt.method}</Text>
                  <Text style={[styles.pmtTime, { color: colors.mutedForeground }]}>{pmt.submittedAt}</Text>
                </View>
                {/* Status badge */}
                <View style={[styles.pmtStatusBadge, {
                  backgroundColor: pmt.status === 'awaiting_verification' ? '#FEF3C7' : pmt.status === 'paid' ? '#DCFCE7' : '#FEE2E2',
                }]}>
                  <Feather
                    name={pmt.status === 'awaiting_verification' ? 'clock' : pmt.status === 'paid' ? 'check-circle' : 'x-circle'}
                    size={11}
                    color={pmt.status === 'awaiting_verification' ? '#D97706' : pmt.status === 'paid' ? '#059669' : '#DC2626'}
                  />
                  <Text style={[styles.pmtStatusText, {
                    color: pmt.status === 'awaiting_verification' ? '#D97706' : pmt.status === 'paid' ? '#059669' : '#DC2626',
                  }]}>
                    {pmt.status === 'awaiting_verification' ? 'En attente' : pmt.status === 'paid' ? 'Validé' : 'Rejeté'}
                  </Text>
                </View>
              </View>

              {/* Amount */}
              <View style={[styles.pmtAmountRow, { backgroundColor: pmt.methodColor + '10', borderRadius: 10, padding: 10 }]}>
                <Text style={[styles.pmtAmountLabel, { color: colors.mutedForeground }]}>Montant déclaré</Text>
                <Text style={[styles.pmtAmountValue, { color: pmt.methodColor }]}>
                  {formatXOF(pmt.amountUSD)}
                </Text>
              </View>

              {/* Proof image */}
              {pmt.proofUrl ? (
                <View style={styles.pmtProofSection}>
                  <Text style={[styles.pmtProofLabel, { color: colors.foreground }]}>Preuve de paiement</Text>
                  <Image
                    source={{ uri: pmt.proofUrl }}
                    style={styles.pmtProofImage}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View style={[styles.pmtNoProof, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
                  <Feather name="alert-circle" size={14} color="#DC2626" />
                  <Text style={[styles.pmtNoProofText, { color: '#DC2626' }]}>Aucune preuve de paiement fournie</Text>
                </View>
              )}

              {/* Notes (if rejected) */}
              {pmt.status === 'failed' && pmt.notes ? (
                <View style={[styles.pmtNotesBox, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
                  <Feather name="x-circle" size={13} color="#DC2626" />
                  <Text style={[styles.pmtNotesText, { color: '#DC2626' }]}>Motif : {pmt.notes}</Text>
                </View>
              ) : null}

              {/* Actions — only for pending */}
              {pmt.status === 'awaiting_verification' && (
                <View style={{ gap: 8 }}>
                  <View style={styles.pmtActions}>
                    <TouchableOpacity
                      style={[styles.pmtActionBtn, { backgroundColor: '#DCFCE7', borderColor: '#22C55E', flex: 1 }]}
                      onPress={() => validatePayment(pmt.id)}
                    >
                      <Feather name="check-circle" size={15} color="#059669" />
                      <Text style={[styles.pmtActionText, { color: '#059669' }]}>Valider le paiement</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pmtActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', flex: 1 }]}
                      onPress={() => setRejectOpen(rejectOpen === pmt.id ? null : pmt.id)}
                    >
                      <Feather name="x-circle" size={15} color="#DC2626" />
                      <Text style={[styles.pmtActionText, { color: '#DC2626' }]}>Rejeter</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Reject reason form */}
                  {rejectOpen === pmt.id && (
                    <View style={[styles.pmtRejectForm, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.pmtRejectTitle, { color: colors.foreground }]}>Motif du rejet *</Text>
                      <TextInput
                        style={[styles.pmtRejectInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                        placeholder="Ex: Montant incorrect, preuve illisible, référence manquante…"
                        placeholderTextColor={colors.mutedForeground}
                        value={rejectNotes[pmt.id] ?? ''}
                        onChangeText={v => setRejectNotes(r => ({ ...r, [pmt.id]: v }))}
                        multiline
                        numberOfLines={3}
                      />
                      <TouchableOpacity
                        style={[styles.pmtRejectConfirm, { backgroundColor: '#EF4444' }]}
                        onPress={() => rejectPayment(pmt.id)}
                      >
                        <Feather name="x" size={14} color="white" />
                        <Text style={styles.pmtRejectConfirmText}>Confirmer le rejet</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {pendingCount === 0 && (
            <View style={[styles.pmtEmptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="check-circle" size={36} color="#22C55E" />
              <Text style={[styles.pmtEmptyTitle, { color: colors.foreground }]}>Tout est vérifié !</Text>
              <Text style={[styles.pmtEmptySubtitle, { color: colors.mutedForeground }]}>Aucun paiement en attente de vérification.</Text>
            </View>
          )}
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

      {/* API KEYS / MCP */}
      {activeTab === 'apikeys' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Clés API / MCP</Text>
          <Text style={[styles.apiKeysSubtitle, { color: colors.mutedForeground }]}>
            Gérez les clés utilisées par des agents IA externes (Claude, Zapier, n8n, LangChain…).
          </Text>

          {/* Key shown once after creation */}
          {justCreatedKey && (
            <View style={[styles.newKeyAlert, { backgroundColor: '#ECFDF5', borderColor: '#22C55E' }]}>
              <View style={styles.newKeyAlertHeader}>
                <Feather name="check-circle" size={16} color="#059669" />
                <Text style={[styles.newKeyAlertTitle, { color: '#065F46' }]}>Clé créée — copiez-la maintenant !</Text>
                <TouchableOpacity onPress={() => setJustCreatedKey(null)}>
                  <Feather name="x" size={16} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text style={[styles.newKeyAlertWarning, { color: '#92400E', backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                ⚠️ Cette clé ne sera plus jamais affichée après avoir fermé ce message.
              </Text>
              <View style={[styles.newKeyBox, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                <Text style={[styles.newKeyValue, { color: '#065F46' }]} selectable>{justCreatedKey}</Text>
                <TouchableOpacity onPress={() => Alert.alert('Copié !', 'Clé copiée dans le presse-papiers.')}>
                  <Feather name="copy" size={16} color="#059669" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Create new key button / form */}
          {!showCreateForm ? (
            <TouchableOpacity
              style={[styles.createKeyBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setShowCreateForm(true); setJustCreatedKey(null); }}
            >
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.createKeyBtnText}>Créer une nouvelle clé</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>Nouvelle clé MCP</Text>

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Nom de la clé *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Claude Desktop, Zapier, n8n…"
                placeholderTextColor={colors.mutedForeground}
                value={newKeyName}
                onChangeText={setNewKeyName}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Permissions *</Text>
              <View style={styles.permsGrid}>
                {ALL_PERMISSIONS.map(perm => (
                  <TouchableOpacity
                    key={perm.id}
                    style={[styles.permChip, {
                      backgroundColor: newKeyPerms[perm.id] ? colors.primary + '18' : colors.background,
                      borderColor: newKeyPerms[perm.id] ? colors.primary : colors.border,
                    }]}
                    onPress={() => togglePerm(perm.id)}
                  >
                    <View style={[styles.permCheckbox, {
                      backgroundColor: newKeyPerms[perm.id] ? colors.primary : 'transparent',
                      borderColor: newKeyPerms[perm.id] ? colors.primary : colors.mutedForeground,
                    }]}>
                      {newKeyPerms[perm.id] && <Feather name="check" size={10} color="white" />}
                    </View>
                    <Text style={[styles.permLabel, { color: colors.foreground }]}>{perm.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formCancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setShowCreateForm(false); setNewKeyName(''); setNewKeyPerms({}); }}
                >
                  <Text style={[styles.formCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary }]}
                  onPress={createApiKey}
                >
                  <Feather name="key" size={14} color="white" />
                  <Text style={styles.formConfirmText}>Générer la clé</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Keys list */}
          <Text style={[styles.keysListTitle, { color: colors.foreground }]}>
            Clés existantes ({apiKeys.length})
          </Text>
          {apiKeys.map(k => (
            <View
              key={k.id}
              style={[styles.keyCard, {
                backgroundColor: colors.card,
                borderColor: k.active ? colors.border : '#FEE2E2',
                opacity: k.active ? 1 : 0.75,
              }]}
            >
              <View style={styles.keyCardHeader}>
                <View style={[styles.keyIconBox, { backgroundColor: k.active ? colors.primary + '18' : '#FEE2E2' }]}>
                  <Feather name="key" size={16} color={k.active ? colors.primary : '#DC2626'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyName, { color: colors.foreground }]}>{k.name}</Text>
                  <Text style={[styles.keyPreview, { color: colors.mutedForeground }]}>{k.preview}</Text>
                </View>
                <View style={[styles.keyActiveBadge, {
                  backgroundColor: k.active ? '#D1FAE5' : '#FEE2E2',
                }]}>
                  <Text style={[styles.keyActiveText, { color: k.active ? '#059669' : '#DC2626' }]}>
                    {k.active ? 'Active' : 'Révoquée'}
                  </Text>
                </View>
              </View>

              {/* Permissions pills */}
              <View style={styles.permsPills}>
                {k.permissions.map(p => (
                  <View key={p} style={[styles.permPill, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
                    <Text style={[styles.permPillText, { color: colors.primary }]}>{p}</Text>
                  </View>
                ))}
              </View>

              {/* Dates */}
              <View style={styles.keyDates}>
                <View style={styles.keyDateItem}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.keyDateText, { color: colors.mutedForeground }]}>Créée : {k.created_at}</Text>
                </View>
                <View style={styles.keyDateItem}>
                  <Feather name="clock" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.keyDateText, { color: colors.mutedForeground }]}>
                    Utilisée : {k.last_used ?? 'jamais'}
                  </Text>
                </View>
              </View>

              {/* Actions */}
              {k.active && (
                <View style={styles.keyActions}>
                  <TouchableOpacity
                    style={[styles.keyAuditBtn, { borderColor: colors.border }]}
                    onPress={() => setAuditFilter(auditFilter === k.id ? null : k.id)}
                  >
                    <Feather name="list" size={13} color={colors.primary} />
                    <Text style={[styles.keyAuditText, { color: colors.primary }]}>
                      {auditFilter === k.id ? 'Masquer logs' : 'Voir logs'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyRevokeBtn, { borderColor: '#EF4444' }]}
                    onPress={() => revokeKey(k.id)}
                  >
                    <Feather name="slash" size={13} color="#DC2626" />
                    <Text style={[styles.keyRevokeText]}>Révoquer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          {/* Audit log */}
          <Text style={[styles.keysListTitle, { color: colors.foreground }]}>
            Dernières requêtes MCP {auditFilter ? `(${apiKeys.find(k => k.id === auditFilter)?.name})` : '— toutes les clés'}
          </Text>
          {auditFilter && (
            <TouchableOpacity onPress={() => setAuditFilter(null)} style={styles.auditFilterClear}>
              <Feather name="x-circle" size={13} color={colors.mutedForeground} />
              <Text style={[styles.auditFilterClearText, { color: colors.mutedForeground }]}>Effacer le filtre</Text>
            </TouchableOpacity>
          )}
          {filteredAudit.map(entry => (
            <View key={entry.id} style={[styles.auditRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.auditDot, { backgroundColor: entry.success ? '#22C55E' : '#EF4444' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.auditAction, { color: colors.foreground }]}>{entry.action}</Text>
                <Text style={[styles.auditKey, { color: colors.mutedForeground }]}>{entry.key_name}</Text>
              </View>
              <Text style={[styles.auditTime, { color: colors.mutedForeground }]}>{entry.created_at}</Text>
            </View>
          ))}
          {filteredAudit.length === 0 && (
            <View style={[styles.auditEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={[styles.auditEmptyText, { color: colors.mutedForeground }]}>Aucun appel MCP pour cette clé.</Text>
            </View>
          )}
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

  // ── Payments tab ─────────────────────────────────────────────────────────────
  tabBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeText: { color: 'white', fontSize: 10, fontWeight: '800' },
  paymentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  paymentsSubtitle: { fontSize: 12, marginTop: 2 },
  pmtCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pmtCountText: { fontSize: 14, fontWeight: '800' },
  pmtCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
    gap: 12,
  },
  pmtCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pmtIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pmtOrderNum: { fontSize: 13, fontWeight: '700' },
  pmtCustomer: { fontSize: 12, marginTop: 1 },
  pmtTime: { fontSize: 11, marginTop: 1 },
  pmtStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pmtStatusText: { fontSize: 11, fontWeight: '700' },
  pmtAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pmtAmountLabel: { fontSize: 12 },
  pmtAmountValue: { fontSize: 18, fontWeight: '900' },
  pmtProofSection: { gap: 8 },
  pmtProofLabel: { fontSize: 13, fontWeight: '600' },
  pmtProofImage: { width: '100%', height: 180, borderRadius: 12 },
  pmtNoProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pmtNoProofText: { fontSize: 13, fontWeight: '500' },
  pmtNotesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pmtNotesText: { flex: 1, fontSize: 13, lineHeight: 18 },
  pmtActions: { flexDirection: 'row', gap: 8 },
  pmtActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pmtActionText: { fontSize: 13, fontWeight: '700' },
  pmtRejectForm: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pmtRejectTitle: { fontSize: 13, fontWeight: '700' },
  pmtRejectInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  pmtRejectConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pmtRejectConfirmText: { color: 'white', fontSize: 13, fontWeight: '700' },
  pmtEmptyState: {
    alignItems: 'center',
    gap: 10,
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  pmtEmptyTitle: { fontSize: 16, fontWeight: '700' },
  pmtEmptySubtitle: { fontSize: 13, textAlign: 'center' },

  // ── API Keys tab ────────────────────────────────────────────────────────────
  apiKeysSubtitle: { fontSize: 13, lineHeight: 18, marginTop: -4 },
  newKeyAlert: {
    borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 10,
  },
  newKeyAlertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newKeyAlertTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  newKeyAlertWarning: {
    fontSize: 12, padding: 10, borderRadius: 8, borderWidth: 1, lineHeight: 17,
  },
  newKeyBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 10,
  },
  newKeyValue: { flex: 1, fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.5 },
  createKeyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
  },
  createKeyBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  createKeyForm: { borderRadius: 14, borderWidth: 1.5, padding: 16, gap: 12 },
  formTitle: { fontSize: 15, fontWeight: '700' },
  formLabel: { fontSize: 13, fontWeight: '600', marginBottom: -4 },
  formInput: {
    borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13,
  },
  permsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  permCheckbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  permLabel: { fontSize: 12, fontWeight: '500' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  formCancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  formCancelText: { fontSize: 13, fontWeight: '600' },
  formConfirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  formConfirmText: { color: 'white', fontSize: 13, fontWeight: '700' },
  keysListTitle: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  keyCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  keyCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  keyIconBox: {
    width: 38, height: 38, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  keyName: { fontSize: 13, fontWeight: '700' },
  keyPreview: { fontFamily: 'monospace', fontSize: 12, marginTop: 2 },
  keyActiveBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  keyActiveText: { fontSize: 11, fontWeight: '700' },
  permsPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  permPill: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  permPillText: { fontSize: 10, fontWeight: '600' },
  keyDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  keyDateItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyDateText: { fontSize: 11 },
  keyActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  keyAuditBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  keyAuditText: { fontSize: 12, fontWeight: '600' },
  keyRevokeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  keyRevokeText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  auditFilterClear: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -6,
  },
  auditFilterClearText: { fontSize: 12 },
  auditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  auditDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  auditAction: { fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
  auditKey: { fontSize: 11, marginTop: 2 },
  auditTime: { fontSize: 11, flexShrink: 0 },
  auditEmpty: {
    alignItems: 'center', gap: 8, padding: 24,
    borderRadius: 12, borderWidth: 1,
  },
  auditEmptyText: { fontSize: 13 },
});
