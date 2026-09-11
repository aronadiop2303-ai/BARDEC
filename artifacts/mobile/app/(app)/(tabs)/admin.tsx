import React, { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator, Dimensions, Image, Linking, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View, Alert, TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import BardecLayout from '@/components/BardecLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFocusEffect, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_STATS, DEMO_USERS, MOCK_ORDERS, UserRole } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import { notifyVendorKycEvent } from '@/lib/notifications';
import { loadCurrencyRates } from '@/lib/currency';
import { useShopCategories } from '@/hooks/useShopCategories';

const { width } = Dimensions.get('window');
type AdminTab = 'dashboard' | 'users' | 'vendors' | 'shops' | 'reports' | 'orders' | 'disputes' | 'payments' | 'currencies' | 'companies' | 'logistics' | 'alerts' | 'notifications' | 'support' | 'settings' | 'apikeys';

// ── API keys — matches what mcp-server actually enforces (validateApiKey):
// hasWrite = perms.includes('write') || perms.includes('*');
// hasRead  = hasWrite || perms.includes('read') || perms.some(p => p.endsWith('.read'));
// i.e. real grants are just "read" / "write" / "*" — no per-resource split.
// (Was a mocked 6-checkbox products/orders/messages × read/write grid that
// implied fine-grained control the server has never enforced.)
const ALL_PERMISSIONS = [
  { id: 'read',  label: 'Lecture (produits, commandes, boutiques…)' },
  { id: 'write', label: 'Écriture (créer/modifier des commandes, du stock…)' },
];

interface ApiKey {
  id: string;
  name: string;
  preview: string;   // key isn't re-readable after creation — derived from `key` only once
  permissions: string[];
  active: boolean;
  created_at: string;
  last_used: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  api_key_id: string | null;
  created_at: string;
  success: boolean;
}

// ── XOF formatter (same as checkout) ─────────────────────────────────────────
const XOF_RATE = 656;
function formatXOF(usd: number): string {
  return Math.round(usd * XOF_RATE).toLocaleString('fr-FR') + ' FCFA';
}

// Same icon/color mapping as PAYMENT_METHODS in checkout.tsx, keyed by the
// payment_method enum value stored on orders.
const PAYMENT_METHOD_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  wave:             { label: 'Wave',            icon: 'zap',          color: '#1A56DB' },
  orange_money:     { label: 'Orange Money',    icon: 'smartphone',   color: '#F97316' },
  mtn_momo:         { label: 'MTN MoMo',        icon: 'phone',        color: '#EAB308' },
  cash_on_delivery: { label: 'À la livraison',  icon: 'truck',        color: '#22C55E' },
  net30:            { label: 'Net30',           icon: 'file-text',    color: '#7C3AED' },
  bank_transfer:    { label: 'Virement bancaire', icon: 'briefcase',  color: '#0EA5E9' },
  card:             { label: 'Carte bancaire',  icon: 'credit-card', color: '#64748B' },
  paypal:           { label: 'PayPal',          icon: 'credit-card', color: '#64748B' },
};

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
  const { user, isDemoMode } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [refreshing, setRefreshing] = useState(false);
  const { slugToLabel } = useShopCategories();

  // ── Real Supabase data — dashboard/users/vendors/orders/disputes/payments.
  // "Payments" has no dedicated table — it reads orders.payment_* columns
  // (manual mobile-money verification flow, see AGENTS.md §5). Settings stays
  // mock: no platform_settings table exists yet (see BUGS.md). Disputes reads
  // real data but the table itself has no user-facing creation flow anywhere
  // in the app — see BUGS.md.
  interface RealUser {
    id: string; email: string; display_name: string | null; phone: string | null;
    role: string; is_approved: boolean; created_at: string;
  }
  interface RealOrder {
    id: string; order_number: string; status: string; total: number; created_at: string;
  }
  interface RealDispute {
    id: string; status: string; reason: string; refund_amount: number | null; created_at: string;
    orders: { order_number: string } | null;
    opener: { display_name: string | null; email: string } | null;
  }
  interface RealPayment {
    id: string; order_number: string; payment_method: string | null;
    payment_proof_url: string | null; total: number;
    payment_status: string; payment_notes: string | null; created_at: string;
    customer: { display_name: string | null; email: string } | null;
  }
  interface RealVendorKyc {
    id: string; company_name: string; country: string | null;
    kyc_status: string; documents: string[]; verified: boolean; created_at: string;
  }
  const [realVendorsKyc,   setRealVendorsKyc]   = useState<RealVendorKyc[]>([]);
  const [vendorKycUsers,   setVendorKycUsers]   = useState<Record<string, { display_name: string | null; email: string }>>({});
  const [loadingVendorsKyc, setLoadingVendorsKyc] = useState(isSupabaseConfigured);
  const [kycFilter,        setKycFilter]        = useState<'pending' | 'incomplete' | 'rejected' | 'approved'>('pending');
  const [kycRejectOpen,    setKycRejectOpen]    = useState<string | null>(null);
  const [kycRejectNotes,   setKycRejectNotes]   = useState<Record<string, string>>({});
  const [kycActingId,      setKycActingId]      = useState<string | null>(null);

  const fetchVendorsKyc = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingVendorsKyc(false); return; }
    setLoadingVendorsKyc(true);
    const { data: vendorsData, error: vendorsErr } = await supabase
      .from('vendors')
      .select('id, company_name, country, kyc_status, documents, verified, created_at')
      .order('created_at', { ascending: false });
    if (vendorsErr) { console.warn('Admin vendors KYC fetch error:', vendorsErr.message); setLoadingVendorsKyc(false); return; }
    setRealVendorsKyc((vendorsData ?? []) as RealVendorKyc[]);

    const ids = (vendorsData ?? []).map((v: { id: string }) => v.id);
    if (ids.length > 0) {
      const { data: usersData } = await supabase.from('users').select('id, display_name, email').in('id', ids);
      setVendorKycUsers(Object.fromEntries((usersData ?? []).map((u: any) => [u.id, { display_name: u.display_name, email: u.email }])));
    }
    setLoadingVendorsKyc(false);
  }, []);

  useEffect(() => { fetchVendorsKyc(); }, [fetchVendorsKyc]);
  useFocusEffect(useCallback(() => { fetchVendorsKyc(); }, [fetchVendorsKyc]));

  async function openKycDoc(path: string) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from('kyc-documents').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { Alert.alert('Erreur', 'Impossible d\'ouvrir ce document.'); return; }
    Linking.openURL(data.signedUrl);
  }

  async function handleApproveVendorKyc(vendorId: string) {
    if (!supabase) return;
    setKycActingId(vendorId);
    const { error } = await supabase.from('vendors').update({ kyc_status: 'approved', verified: true }).eq('id', vendorId);
    setKycActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:approveVendorKyc', error, 'Impossible d\'approuver ce vendeur. Réessaie dans un instant.')); return; }
    setRealVendorsKyc(prev => prev.map(v => v.id === vendorId ? { ...v, kyc_status: 'approved', verified: true } : v));
    notifyVendorKycEvent(supabase, vendorId, 'approved');
  }

  async function handleRejectVendorKyc(vendorId: string) {
    if (!supabase) return;
    const note = (kycRejectNotes[vendorId] ?? '').trim();
    setKycActingId(vendorId);
    const { error } = await supabase.from('vendors').update({ kyc_status: 'rejected', verified: false }).eq('id', vendorId);
    setKycActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:rejectVendorKyc', error, 'Impossible de rejeter ce vendeur. Réessaie dans un instant.')); return; }
    setRealVendorsKyc(prev => prev.map(v => v.id === vendorId ? { ...v, kyc_status: 'rejected', verified: false } : v));
    setKycRejectOpen(null);
    notifyVendorKycEvent(supabase, vendorId, 'rejected', note || undefined);
  }

  // ─── Proximity shops (proximity_shops — shops_owner_manage gives ADMIN a
  // full ALL policy already, no backend change needed) ───────────────────────
  interface RealShop {
    id: string; owner_id: string; name: string; category: string; subcategory: string;
    description: string | null; phone: string | null; address_text: string;
    images: string[] | null; is_active: boolean; verified: boolean;
    rating: number; review_count: number; created_at: string;
    relay_point_id: string | null; logistics_zone: string | null;
  }
  interface ShopReport {
    id: string; reporter_id: string; reason: string; details: string | null; status: string; created_at: string;
  }
  const [realShops,        setRealShops]        = useState<RealShop[]>([]);
  const [shopOwners,       setShopOwners]       = useState<Record<string, { display_name: string | null; email: string }>>({});
  const [loadingShops,     setLoadingShops]     = useState(isSupabaseConfigured);
  const [shopStatusFilter, setShopStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [shopVerifiedFilter, setShopVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [shopZoneFilter, setShopZoneFilter] = useState<string>('all');
  const [shopPendingReportCounts, setShopPendingReportCounts] = useState<Record<string, number>>({});
  const [expandedShopId,   setExpandedShopId]   = useState<string | null>(null);
  const [shopReports,      setShopReports]      = useState<Record<string, ShopReport[]>>({});
  const [reporterUsers,    setReporterUsers]    = useState<Record<string, { display_name: string | null; email: string }>>({});
  const [editingShopId,    setEditingShopId]    = useState<string | null>(null);
  const [shopEditForm,     setShopEditForm]     = useState({ name: '', phone: '', address_text: '', description: '', logistics_zone: '', relay_point_id: null as string | null });
  const [savingShopEdit,   setSavingShopEdit]   = useState(false);
  const [shopActingId,     setShopActingId]     = useState<string | null>(null);

  const fetchShops = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingShops(false); return; }
    setLoadingShops(true);
    const { data, error } = await supabase
      .from('proximity_shops')
      .select('id, owner_id, name, category, subcategory, description, phone, address_text, images, is_active, verified, rating, review_count, created_at, relay_point_id, logistics_zone')
      .order('created_at', { ascending: false });
    if (error) { console.warn('Admin shops fetch error:', error.message); setLoadingShops(false); return; }
    setRealShops((data ?? []) as RealShop[]);

    const ownerIds = [...new Set((data ?? []).map((s: { owner_id: string }) => s.owner_id))];
    if (ownerIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, display_name, email').in('id', ownerIds);
      setShopOwners(Object.fromEntries((users ?? []).map((u: any) => [u.id, { display_name: u.display_name, email: u.email }])));
    }

    const shopIds = (data ?? []).map((s: { id: string }) => s.id);
    if (shopIds.length > 0) {
      const { data: reports } = await supabase
        .from('content_reports')
        .select('target_id')
        .eq('target_type', 'shop')
        .eq('status', 'pending')
        .in('target_id', shopIds);
      const counts: Record<string, number> = {};
      (reports ?? []).forEach((r: { target_id: string }) => { counts[r.target_id] = (counts[r.target_id] ?? 0) + 1; });
      setShopPendingReportCounts(counts);
    }
    setLoadingShops(false);
  }, []);

  useEffect(() => { fetchShops(); }, [fetchShops]);
  useFocusEffect(useCallback(() => { fetchShops(); }, [fetchShops]));

  async function handleToggleShopActive(shop: RealShop) {
    if (!supabase) return;
    setShopActingId(shop.id);
    const { error } = await supabase.from('proximity_shops').update({ is_active: !shop.is_active }).eq('id', shop.id);
    setShopActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleShopActive', error, 'Impossible de modifier le statut de cette boutique. Réessaie dans un instant.')); return; }
    setRealShops(prev => prev.map(s => s.id === shop.id ? { ...s, is_active: !shop.is_active } : s));
  }

  async function handleToggleShopVerified(shop: RealShop) {
    if (!supabase) return;
    setShopActingId(shop.id);
    const { error } = await supabase.from('proximity_shops').update({ verified: !shop.verified }).eq('id', shop.id);
    setShopActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleShopVerified', error, 'Impossible de modifier la vérification de cette boutique. Réessaie dans un instant.')); return; }
    setRealShops(prev => prev.map(s => s.id === shop.id ? { ...s, verified: !shop.verified } : s));
  }

  async function toggleShopExpand(shop: RealShop) {
    const next = expandedShopId === shop.id ? null : shop.id;
    setExpandedShopId(next);
    if (next && !shopReports[shop.id] && supabase) {
      const { data } = await supabase
        .from('content_reports')
        .select('id, reporter_id, reason, details, status, created_at')
        .eq('target_type', 'shop')
        .eq('target_id', shop.id)
        .order('created_at', { ascending: false });
      setShopReports(prev => ({ ...prev, [shop.id]: (data ?? []) as ShopReport[] }));

      const reporterIds = [...new Set((data ?? []).map((r: { reporter_id: string }) => r.reporter_id))];
      if (reporterIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, display_name, email').in('id', reporterIds);
        setReporterUsers(prev => ({
          ...prev,
          ...Object.fromEntries((users ?? []).map((u: any) => [u.id, { display_name: u.display_name, email: u.email }])),
        }));
      }
    }
  }

  async function handleUpdateReportStatus(shopId: string, reportId: string, status: 'reviewed' | 'actioned' | 'dismissed') {
    if (!supabase) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('content_reports')
      .update({ status, reviewed_by: authUser?.id, reviewed_at: new Date().toISOString() })
      .eq('id', reportId);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:updateShopReport', error, 'Impossible de mettre à jour ce signalement. Réessaie dans un instant.')); return; }
    setShopReports(prev => ({ ...prev, [shopId]: (prev[shopId] ?? []).map(r => r.id === reportId ? { ...r, status } : r) }));
    setShopPendingReportCounts(prev => ({ ...prev, [shopId]: Math.max(0, (prev[shopId] ?? 0) - 1) }));
  }

  function openEditShop(shop: RealShop) {
    setEditingShopId(shop.id);
    setShopEditForm({
      name: shop.name, phone: shop.phone ?? '',
      address_text: shop.address_text, description: shop.description ?? '',
      logistics_zone: shop.logistics_zone ?? '', relay_point_id: shop.relay_point_id,
    });
  }

  async function handleSaveShopEdit(shopId: string) {
    if (!supabase) return;
    if (!shopEditForm.name.trim() || !shopEditForm.address_text.trim()) {
      Alert.alert('Champs requis', 'Le nom et l\'adresse sont obligatoires.'); return;
    }
    setSavingShopEdit(true);
    const { error } = await supabase.from('proximity_shops').update({
      name: shopEditForm.name.trim(),
      phone: shopEditForm.phone.trim() || null,
      address_text: shopEditForm.address_text.trim(),
      description: shopEditForm.description.trim() || null,
      logistics_zone: shopEditForm.logistics_zone.trim() || null,
      relay_point_id: shopEditForm.relay_point_id,
    }).eq('id', shopId);
    setSavingShopEdit(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:saveShopEdit', error, 'Impossible d\'enregistrer ces modifications. Réessaie dans un instant.')); return; }
    setRealShops(prev => prev.map(s => s.id === shopId ? {
      ...s, name: shopEditForm.name.trim(), phone: shopEditForm.phone.trim() || null,
      address_text: shopEditForm.address_text.trim(), description: shopEditForm.description.trim() || null,
      logistics_zone: shopEditForm.logistics_zone.trim() || null, relay_point_id: shopEditForm.relay_point_id,
    } : s));
    setEditingShopId(null);
  }

  // ─── Signalements globaux (content_reports — product/shop/review/vendor/user) ──
  interface ContentReport {
    id: string; reporter_id: string; target_type: 'product' | 'shop' | 'review' | 'vendor' | 'user';
    target_id: string; reason: string; details: string | null; status: string; created_at: string;
  }
  interface ReportTargetPreview { label: string; sub?: string; image?: string | null; missing?: boolean; isActive?: boolean }
  const [allReports,           setAllReports]           = useState<ContentReport[]>([]);
  const [loadingReports,       setLoadingReports]       = useState(isSupabaseConfigured);
  const [reportsFilter,        setReportsFilter]        = useState<'pending' | 'reviewed' | 'actioned' | 'dismissed' | 'all'>('pending');
  const [reportTargetPreviews, setReportTargetPreviews] = useState<Record<string, ReportTargetPreview>>({});
  const [reportReporters,      setReportReporters]      = useState<Record<string, { display_name: string | null; email: string }>>({});
  const [reportActingId,       setReportActingId]       = useState<string | null>(null);

  const TARGET_TYPE_ICON: Record<string, string> = { product: 'package', shop: 'map-pin', review: 'star', vendor: 'briefcase', user: 'user' };
  const TARGET_TYPE_LABEL: Record<string, string> = { product: 'Produit', shop: 'Boutique', review: 'Avis', vendor: 'Vendeur', user: 'Utilisateur' };
  const REPORT_STATUS_BADGE: Record<string, [string, string, string]> = {
    pending:   ['#FEF3C7', '#D97706', 'En attente'],
    reviewed:  ['#E0F2FE', '#0369A1', 'Traité'],
    actioned:  ['#D1FAE5', '#059669', 'Actionné'],
    dismissed: ['#FEE2E2', '#DC2626', 'Rejeté'],
  };

  const fetchAllReports = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingReports(false); return; }
    setLoadingReports(true);
    const { data, error } = await supabase.from('content_reports').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('Admin reports fetch error:', error.message); setLoadingReports(false); return; }
    const reports = (data ?? []) as ContentReport[];
    setAllReports(reports);

    const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
    if (reporterIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, display_name, email').in('id', reporterIds);
      setReportReporters(Object.fromEntries((users ?? []).map((u: any) => [u.id, { display_name: u.display_name, email: u.email }])));
    }

    const productIds = reports.filter(r => r.target_type === 'product').map(r => r.target_id);
    const shopIds    = reports.filter(r => r.target_type === 'shop').map(r => r.target_id);
    const reviewIds  = reports.filter(r => r.target_type === 'review').map(r => r.target_id);
    const previews: Record<string, ReportTargetPreview> = {};

    if (productIds.length > 0) {
      const { data: prods } = await supabase.from('products').select('id, name, images, is_active').in('id', productIds);
      (prods ?? []).forEach((p: any) => { previews[`product:${p.id}`] = { label: p.name, image: p.images?.[0] ?? null, isActive: p.is_active }; });
      productIds.forEach(id => { if (!previews[`product:${id}`]) previews[`product:${id}`] = { label: 'Produit introuvable (supprimé)', missing: true }; });
    }
    if (shopIds.length > 0) {
      const { data: shops } = await supabase.from('proximity_shops').select('id, name, images, address_text, is_active').in('id', shopIds);
      (shops ?? []).forEach((s: any) => { previews[`shop:${s.id}`] = { label: s.name, sub: s.address_text, image: s.images?.[0] ?? null, isActive: s.is_active }; });
      shopIds.forEach(id => { if (!previews[`shop:${id}`]) previews[`shop:${id}`] = { label: 'Boutique introuvable (supprimée)', missing: true }; });
    }
    if (reviewIds.length > 0) {
      // 'review' can only ever point at the real `reviews` table (product
      // reviews) — proximity_reviews doesn't exist in production (see
      // BUGS.md), so the "Signaler" entry point was never wired to it.
      const { data: revs } = await supabase.from('reviews').select('id, comment, rating').in('id', reviewIds);
      (revs ?? []).forEach((r: any) => { previews[`review:${r.id}`] = { label: `${r.rating}★ — ${r.comment ? r.comment.slice(0, 80) : 'sans commentaire'}` }; });
      reviewIds.forEach(id => { if (!previews[`review:${id}`]) previews[`review:${id}`] = { label: 'Avis introuvable (supprimé)', missing: true }; });
    }

    setReportTargetPreviews(previews);
    setLoadingReports(false);
  }, []);

  useEffect(() => { fetchAllReports(); }, [fetchAllReports]);
  useFocusEffect(useCallback(() => { fetchAllReports(); }, [fetchAllReports]));

  async function handleGlobalReportStatus(reportId: string, status: 'reviewed' | 'actioned' | 'dismissed') {
    if (!supabase) return;
    setReportActingId(reportId);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('content_reports')
      .update({ status, reviewed_by: authUser?.id, reviewed_at: new Date().toISOString() })
      .eq('id', reportId);
    setReportActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:updateReport', error, 'Impossible de mettre à jour ce signalement. Réessaie dans un instant.')); return; }
    setAllReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
  }

  async function handleHideReportTarget(report: ContentReport) {
    if (!supabase) return;
    const table = report.target_type === 'product' ? 'products' : report.target_type === 'shop' ? 'proximity_shops' : null;
    if (!table) return;
    setReportActingId(report.id);
    const { error } = await supabase.from(table).update({ is_active: false }).eq('id', report.target_id);
    if (error) {
      setReportActingId(null);
      Alert.alert('Erreur', toUserMessage('admin:hideReportTarget', error, 'Impossible de masquer ce contenu. Réessaie dans un instant.'));
      return;
    }
    const key = `${report.target_type}:${report.target_id}`;
    setReportTargetPreviews(prev => ({ ...prev, [key]: { ...prev[key], isActive: false } }));
    await handleGlobalReportStatus(report.id, 'actioned');
  }

  const filteredReports = allReports.filter(r => reportsFilter === 'all' ? true : r.status === reportsFilter);
  const pendingReportsCount = allReports.filter(r => r.status === 'pending').length;

  // ─── Currencies (currency_rates — currency_rates_admin_write already gives
  // ADMIN a full ALL policy, no backend change needed) ───────────────────────
  interface CurrencyRateRow { currency_code: string; rate_to_fcfa: number; symbol: string; updated_at: string; updated_by: string | null }
  const [currencyRates,    setCurrencyRates]    = useState<CurrencyRateRow[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(isSupabaseConfigured);
  const [currencyEdits,    setCurrencyEdits]    = useState<Record<string, string>>({});
  const [savingCurrency,   setSavingCurrency]   = useState<string | null>(null);

  const fetchCurrencyRates = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingCurrencies(false); return; }
    setLoadingCurrencies(true);
    const { data, error } = await supabase
      .from('currency_rates')
      .select('currency_code, rate_to_fcfa, symbol, updated_at, updated_by')
      .order('currency_code', { ascending: true });
    if (error) { console.warn('Admin currency rates fetch error:', error.message); setLoadingCurrencies(false); return; }
    setCurrencyRates((data ?? []) as CurrencyRateRow[]);
    setLoadingCurrencies(false);
  }, []);

  useEffect(() => { fetchCurrencyRates(); }, [fetchCurrencyRates]);
  useFocusEffect(useCallback(() => { fetchCurrencyRates(); }, [fetchCurrencyRates]));

  // ── Logistics: relay_points / drone_zones (localisation de livraison) —
  // relay_points_admin_manage / drone_zones_admin_manage RLS policies already
  // give ADMIN a full ALL policy on both tables, no backend change needed.
  interface RelayPointRow { id: string; name: string; address: string; latitude: number | null; longitude: number | null; active: boolean; created_at: string }
  interface DroneZoneRow { id: string; name: string; center_latitude: number; center_longitude: number; radius_km: number; active: boolean; created_at: string }
  const [relayPoints, setRelayPoints] = useState<RelayPointRow[]>([]);
  const [loadingRelayPoints, setLoadingRelayPoints] = useState(isSupabaseConfigured);
  const [showRelayForm, setShowRelayForm] = useState(false);
  const [newRelay, setNewRelay] = useState({ name: '', address: '', latitude: '', longitude: '' });
  const [creatingRelay, setCreatingRelay] = useState(false);
  const [relayActingId, setRelayActingId] = useState<string | null>(null);

  const [droneZones, setDroneZones] = useState<DroneZoneRow[]>([]);
  const [loadingDroneZones, setLoadingDroneZones] = useState(isSupabaseConfigured);
  const [showDroneForm, setShowDroneForm] = useState(false);
  const [newDrone, setNewDrone] = useState({ name: '', latitude: '', longitude: '', radius: '5' });
  const [creatingDrone, setCreatingDrone] = useState(false);
  const [droneActingId, setDroneActingId] = useState<string | null>(null);

  const fetchRelayPoints = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingRelayPoints(false); return; }
    setLoadingRelayPoints(true);
    const { data, error } = await supabase.from('relay_points').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('Admin relay points fetch error:', error.message); setLoadingRelayPoints(false); return; }
    setRelayPoints((data ?? []) as RelayPointRow[]);
    setLoadingRelayPoints(false);
  }, []);
  useEffect(() => { fetchRelayPoints(); }, [fetchRelayPoints]);
  useFocusEffect(useCallback(() => { fetchRelayPoints(); }, [fetchRelayPoints]));

  const fetchDroneZones = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingDroneZones(false); return; }
    setLoadingDroneZones(true);
    const { data, error } = await supabase.from('drone_zones').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('Admin drone zones fetch error:', error.message); setLoadingDroneZones(false); return; }
    setDroneZones((data ?? []) as DroneZoneRow[]);
    setLoadingDroneZones(false);
  }, []);
  useEffect(() => { fetchDroneZones(); }, [fetchDroneZones]);
  useFocusEffect(useCallback(() => { fetchDroneZones(); }, [fetchDroneZones]));

  async function useCurrentLocationFor(setter: (lat: string, lng: string) => void) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setter(String(loc.coords.latitude), String(loc.coords.longitude));
    } catch {
      Alert.alert('Erreur', 'Impossible d\'obtenir la position.');
    }
  }

  async function handleCreateRelayPoint() {
    if (!supabase) return;
    if (!newRelay.name.trim() || !newRelay.address.trim()) {
      Alert.alert('Champs requis', 'Le nom et l\'adresse sont obligatoires.'); return;
    }
    const lat = newRelay.latitude.trim() ? parseFloat(newRelay.latitude.replace(',', '.')) : null;
    const lng = newRelay.longitude.trim() ? parseFloat(newRelay.longitude.replace(',', '.')) : null;
    if ((lat !== null && isNaN(lat)) || (lng !== null && isNaN(lng))) {
      Alert.alert('Coordonnées invalides', 'Latitude et longitude doivent être des nombres.'); return;
    }
    setCreatingRelay(true);
    const { error } = await supabase.from('relay_points').insert({
      name: newRelay.name.trim(), address: newRelay.address.trim(), latitude: lat, longitude: lng, active: true,
    });
    setCreatingRelay(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:createRelayPoint', error, 'Impossible de créer ce point relais. Réessaie dans un instant.')); return; }
    setShowRelayForm(false);
    setNewRelay({ name: '', address: '', latitude: '', longitude: '' });
    fetchRelayPoints();
  }

  async function handleToggleRelayActive(rp: RelayPointRow) {
    if (!supabase) return;
    setRelayActingId(rp.id);
    const { error } = await supabase.from('relay_points').update({ active: !rp.active }).eq('id', rp.id);
    setRelayActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleRelayPoint', error, 'Impossible de modifier ce point relais. Réessaie dans un instant.')); return; }
    setRelayPoints(prev => prev.map(r => r.id === rp.id ? { ...r, active: !rp.active } : r));
  }

  async function handleCreateDroneZone() {
    if (!supabase) return;
    if (!newDrone.name.trim() || !newDrone.latitude.trim() || !newDrone.longitude.trim()) {
      Alert.alert('Champs requis', 'Le nom et les coordonnées du centre sont obligatoires.'); return;
    }
    const lat = parseFloat(newDrone.latitude.replace(',', '.'));
    const lng = parseFloat(newDrone.longitude.replace(',', '.'));
    const radius = parseFloat((newDrone.radius.trim() || '5').replace(',', '.'));
    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius <= 0) {
      Alert.alert('Valeurs invalides', 'Latitude, longitude et rayon doivent être des nombres valides (rayon > 0).'); return;
    }
    setCreatingDrone(true);
    const { error } = await supabase.from('drone_zones').insert({
      name: newDrone.name.trim(), center_latitude: lat, center_longitude: lng, radius_km: radius, active: true,
    });
    setCreatingDrone(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:createDroneZone', error, 'Impossible de créer cette zone drone. Réessaie dans un instant.')); return; }
    setShowDroneForm(false);
    setNewDrone({ name: '', latitude: '', longitude: '', radius: '5' });
    fetchDroneZones();
  }

  async function handleToggleDroneActive(dz: DroneZoneRow) {
    if (!supabase) return;
    setDroneActingId(dz.id);
    const { error } = await supabase.from('drone_zones').update({ active: !dz.active }).eq('id', dz.id);
    setDroneActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleDroneZone', error, 'Impossible de modifier cette zone drone. Réessaie dans un instant.')); return; }
    setDroneZones(prev => prev.map(d => d.id === dz.id ? { ...d, active: !dz.active } : d));
  }

  // ── Magasins de retrait (Click & Collect) — pickup_stores_admin_manage RLS
  // policy already gives ADMIN a full ALL policy, no backend change needed.
  // Contrairement à relay_points/drone_zones (toggle actif seulement), ce
  // module a aussi une vraie édition + suppression (spec du chantier) : la
  // table n'est référencée par aucune FK (orders ne garde qu'un snapshot
  // delivery_point_name/address, comme pour les points relais), donc un
  // hard delete est sans risque d'intégrité référentielle.
  interface PickupStoreRow { id: string; name: string; address: string; city: string; phone: string; hours: string; active: boolean; created_at: string }
  const [pickupStoresAdmin, setPickupStoresAdmin] = useState<PickupStoreRow[]>([]);
  const [loadingPickupStores, setLoadingPickupStores] = useState(isSupabaseConfigured);
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', address: '', city: '', phone: '', hours: '' });
  const [savingStore, setSavingStore] = useState(false);
  const [storeActingId, setStoreActingId] = useState<string | null>(null);

  const fetchPickupStores = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingPickupStores(false); return; }
    setLoadingPickupStores(true);
    const { data, error } = await supabase.from('pickup_stores').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('Admin pickup stores fetch error:', error.message); setLoadingPickupStores(false); return; }
    setPickupStoresAdmin((data ?? []) as PickupStoreRow[]);
    setLoadingPickupStores(false);
  }, []);
  useEffect(() => { fetchPickupStores(); }, [fetchPickupStores]);
  useFocusEffect(useCallback(() => { fetchPickupStores(); }, [fetchPickupStores]));

  function openCreateStoreForm() {
    setEditingStoreId(null);
    setStoreForm({ name: '', address: '', city: '', phone: '', hours: '' });
    setShowStoreForm(true);
  }

  function openEditStoreForm(s: PickupStoreRow) {
    setEditingStoreId(s.id);
    setStoreForm({ name: s.name, address: s.address, city: s.city, phone: s.phone, hours: s.hours });
    setShowStoreForm(true);
  }

  function closeStoreForm() {
    setShowStoreForm(false);
    setEditingStoreId(null);
    setStoreForm({ name: '', address: '', city: '', phone: '', hours: '' });
  }

  async function handleSaveStore() {
    if (!supabase) return;
    const { name, address, city, phone, hours } = storeForm;
    if (!name.trim() || !address.trim() || !city.trim() || !phone.trim() || !hours.trim()) {
      Alert.alert('Champs requis', 'Nom, adresse, ville, téléphone et horaires sont tous obligatoires.'); return;
    }
    setSavingStore(true);
    const payload = {
      name: name.trim(), address: address.trim(), city: city.trim(),
      phone: phone.trim(), hours: hours.trim(),
    };
    const { error } = editingStoreId
      ? await supabase.from('pickup_stores').update(payload).eq('id', editingStoreId)
      : await supabase.from('pickup_stores').insert({ ...payload, active: true });
    setSavingStore(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:saveStore', error, "Impossible d'enregistrer ce magasin. Réessaie dans un instant.")); return; }
    closeStoreForm();
    fetchPickupStores();
  }

  async function handleToggleStoreActive(s: PickupStoreRow) {
    if (!supabase) return;
    setStoreActingId(s.id);
    const { error } = await supabase.from('pickup_stores').update({ active: !s.active }).eq('id', s.id);
    setStoreActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleStoreActive', error, 'Impossible de modifier ce magasin. Réessaie dans un instant.')); return; }
    setPickupStoresAdmin(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x));
  }

  function handleDeleteStore(s: PickupStoreRow) {
    Alert.alert(
      'Supprimer ce magasin ?',
      `"${s.name}" sera définitivement supprimé et ne sera plus proposé au checkout.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            if (!supabase) return;
            setStoreActingId(s.id);
            const { error } = await supabase.from('pickup_stores').delete().eq('id', s.id);
            setStoreActingId(null);
            if (error) { Alert.alert('Erreur', toUserMessage('admin:deleteStore', error, 'Impossible de supprimer ce magasin. Réessaie dans un instant.')); return; }
            setPickupStoresAdmin(prev => prev.filter(x => x.id !== s.id));
          },
        },
      ]
    );
  }

  // ── Tarification logistique dynamique — delivery_rates_admin_manage RLS
  // policy already gives ADMIN a full ALL policy, no backend change needed.
  // 6 lignes fixes (une par mode/vitesse de livraison — le code doit
  // matcher exactement ce que checkout.tsx sait afficher), pas de
  // création/suppression ici : seule l'édition cost/days a du sens.
  interface DeliveryRateAdminRow {
    id: string; code: string; delivery_type: string; label: string;
    cost: number; days: string; active: boolean;
  }
  const [deliveryRatesAdmin,   setDeliveryRatesAdmin]   = useState<DeliveryRateAdminRow[]>([]);
  const [loadingDeliveryRates, setLoadingDeliveryRates] = useState(isSupabaseConfigured);
  const [rateDrafts,  setRateDrafts]  = useState<Record<string, { cost: string; days: string }>>({});
  const [savingRateId, setSavingRateId] = useState<string | null>(null);

  const fetchDeliveryRatesAdmin = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingDeliveryRates(false); return; }
    setLoadingDeliveryRates(true);
    const { data, error } = await supabase.from('delivery_rates').select('*').order('delivery_type', { ascending: true });
    if (error) { console.warn('Admin delivery rates fetch error:', error.message); setLoadingDeliveryRates(false); return; }
    setDeliveryRatesAdmin((data ?? []) as DeliveryRateAdminRow[]);
    setLoadingDeliveryRates(false);
  }, []);
  useEffect(() => { fetchDeliveryRatesAdmin(); }, [fetchDeliveryRatesAdmin]);
  useFocusEffect(useCallback(() => { fetchDeliveryRatesAdmin(); }, [fetchDeliveryRatesAdmin]));

  function draftFor(rate: DeliveryRateAdminRow) {
    return rateDrafts[rate.id] ?? { cost: String(rate.cost), days: rate.days };
  }

  async function handleSaveRate(rate: DeliveryRateAdminRow) {
    if (!supabase) return;
    const draft = draftFor(rate);
    const cost = Number(draft.cost.replace(',', '.'));
    if (!Number.isFinite(cost) || cost < 0) {
      Alert.alert('Valeur invalide', 'Le tarif doit être un nombre positif ou nul.'); return;
    }
    if (!draft.days.trim()) {
      Alert.alert('Champ requis', 'Le délai estimé ne peut pas être vide.'); return;
    }
    setSavingRateId(rate.id);
    const { error } = await supabase.from('delivery_rates')
      .update({ cost, days: draft.days.trim(), updated_at: new Date().toISOString() })
      .eq('id', rate.id);
    setSavingRateId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:saveDeliveryRate', error, 'Impossible d\'enregistrer ce tarif. Réessaie dans un instant.')); return; }
    setDeliveryRatesAdmin(prev => prev.map(r => r.id === rate.id ? { ...r, cost, days: draft.days.trim() } : r));
    setRateDrafts(prev => { const next = { ...prev }; delete next[rate.id]; return next; });
  }

  async function handleToggleRateActive(rate: DeliveryRateAdminRow) {
    if (!supabase) return;
    setSavingRateId(rate.id);
    const { error } = await supabase.from('delivery_rates').update({ active: !rate.active }).eq('id', rate.id);
    setSavingRateId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleDeliveryRate', error, 'Impossible de modifier ce tarif. Réessaie dans un instant.')); return; }
    setDeliveryRatesAdmin(prev => prev.map(r => r.id === rate.id ? { ...r, active: !rate.active } : r));
  }

  // ── Delivery partners (livreurs) — this chantier only builds the
  // 'internal' flow (delivery_partners_admin_manage RLS policy already
  // gives ADMIN a full ALL policy, no backend change needed); external_api
  // stays blocked pending the external partner's API details, so the
  // creation form below never lets an admin pick that type.
  interface DeliveryPartnerAdminRow { id: string; name: string; phone: string; zone: string | null; active: boolean; type: 'internal' | 'external_api'; created_at: string }
  const [deliveryPartnersAdmin, setDeliveryPartnersAdmin] = useState<DeliveryPartnerAdminRow[]>([]);
  const [loadingDeliveryPartners, setLoadingDeliveryPartners] = useState(isSupabaseConfigured);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [newPartner, setNewPartner] = useState({ name: '', phone: '', zone: '' });
  const [creatingPartner, setCreatingPartner] = useState(false);
  const [partnerActingId, setPartnerActingId] = useState<string | null>(null);

  const fetchDeliveryPartners = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingDeliveryPartners(false); return; }
    setLoadingDeliveryPartners(true);
    const { data, error } = await supabase.from('delivery_partners').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('Admin delivery partners fetch error:', error.message); setLoadingDeliveryPartners(false); return; }
    setDeliveryPartnersAdmin((data ?? []) as DeliveryPartnerAdminRow[]);
    setLoadingDeliveryPartners(false);
  }, []);
  useEffect(() => { fetchDeliveryPartners(); }, [fetchDeliveryPartners]);
  useFocusEffect(useCallback(() => { fetchDeliveryPartners(); }, [fetchDeliveryPartners]));

  async function handleCreateDeliveryPartner() {
    if (!supabase) return;
    if (!newPartner.name.trim() || !newPartner.phone.trim()) {
      Alert.alert('Champs requis', 'Le nom et le téléphone sont obligatoires.'); return;
    }
    setCreatingPartner(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('delivery_partners').insert({
      name: newPartner.name.trim(), phone: newPartner.phone.trim(), zone: newPartner.zone.trim() || null,
      type: 'internal', active: true, added_by: authUser?.id ?? null,
    });
    setCreatingPartner(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:createDeliveryPartner', error, 'Impossible de créer ce livreur. Réessaie dans un instant.')); return; }
    setShowPartnerForm(false);
    setNewPartner({ name: '', phone: '', zone: '' });
    fetchDeliveryPartners();
  }

  async function handleTogglePartnerActive(dp: DeliveryPartnerAdminRow) {
    if (!supabase) return;
    setPartnerActingId(dp.id);
    const { error } = await supabase.from('delivery_partners').update({ active: !dp.active }).eq('id', dp.id);
    setPartnerActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleDeliveryPartner', error, 'Impossible de modifier ce livreur. Réessaie dans un instant.')); return; }
    setDeliveryPartnersAdmin(prev => prev.map(d => d.id === dp.id ? { ...d, active: !dp.active } : d));
  }

  // ── Sociétés B2B (crédit Net30) — companies_admin RLS policy already
  // gives ADMIN a full ALL policy, no backend change needed. Pas de
  // formulaire "créer une société" ici : les sociétés existent uniquement
  // via l'inscription B2B (AuthContext.register()) — l'admin approuve et
  // fixe le crédit d'une société déjà créée, il n'en invente pas.
  interface CompanyAdminRow {
    id: string; name: string; tax_id: string | null; country: string;
    credit_limit: number; net30_balance: number; payment_terms: string | null;
    is_approved: boolean; created_at: string;
  }
  const [companiesAdmin, setCompaniesAdmin] = useState<CompanyAdminRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(isSupabaseConfigured);
  const [companyActingId, setCompanyActingId] = useState<string | null>(null);
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const [savingCreditId, setSavingCreditId] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingCompanies(false); return; }
    setLoadingCompanies(true);
    const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('Admin companies fetch error:', error.message); setLoadingCompanies(false); return; }
    setCompaniesAdmin((data ?? []) as CompanyAdminRow[]);
    setLoadingCompanies(false);
  }, []);
  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);
  useFocusEffect(useCallback(() => { fetchCompanies(); }, [fetchCompanies]));

  async function handleToggleCompanyApproved(c: CompanyAdminRow) {
    if (!supabase) return;
    setCompanyActingId(c.id);
    const { error } = await supabase.from('companies').update({ is_approved: !c.is_approved }).eq('id', c.id);
    setCompanyActingId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:toggleCompanyApproved', error, 'Impossible de modifier cette société. Réessaie dans un instant.')); return; }
    setCompaniesAdmin(prev => prev.map(x => x.id === c.id ? { ...x, is_approved: !c.is_approved } : x));
  }

  async function handleSaveCreditLimit(c: CompanyAdminRow) {
    if (!supabase) return;
    const raw = creditDrafts[c.id];
    if (raw === undefined) return;
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert('Valeur invalide', 'La limite de crédit doit être un nombre positif.'); return;
    }
    setSavingCreditId(c.id);
    const { error } = await supabase.from('companies').update({ credit_limit: parsed }).eq('id', c.id);
    setSavingCreditId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:setCreditLimit', error, 'Impossible d\'enregistrer cette limite de crédit. Réessaie dans un instant.')); return; }
    setCompaniesAdmin(prev => prev.map(x => x.id === c.id ? { ...x, credit_limit: parsed } : x));
    setCreditDrafts(prev => { const next = { ...prev }; delete next[c.id]; return next; });
  }

  // ── System alerts (monitoring) — alerts_admin_only RLS policy already
  // gives ADMIN a full ALL policy, no backend change needed. Outil interne,
  // pas encore alimenté avant ce chantier — voir omni-agent/index.ts pour le
  // premier vrai point d'écriture (échec interne critique).
  interface SystemAlertRow {
    id: string; source: string; severity: 'info' | 'warning' | 'critical';
    message: string; metadata: Record<string, unknown> | null;
    resolved: boolean; resolved_by: string | null; resolved_at: string | null; created_at: string;
  }
  const [systemAlerts, setSystemAlerts] = useState<SystemAlertRow[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(isSupabaseConfigured);
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [alertResolvedFilter, setAlertResolvedFilter] = useState<'unresolved' | 'resolved' | 'all'>('unresolved');
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);

  const fetchSystemAlerts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingAlerts(false); return; }
    setLoadingAlerts(true);
    const { data, error } = await supabase.from('system_alerts').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { console.warn('Admin system_alerts fetch error:', error.message); setLoadingAlerts(false); return; }
    setSystemAlerts((data ?? []) as SystemAlertRow[]);
    setLoadingAlerts(false);
  }, []);
  useEffect(() => { fetchSystemAlerts(); }, [fetchSystemAlerts]);
  useFocusEffect(useCallback(() => { fetchSystemAlerts(); }, [fetchSystemAlerts]));

  async function handleResolveAlert(alert: SystemAlertRow) {
    if (!supabase) return;
    setResolvingAlertId(alert.id);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('system_alerts').update({
      resolved: true, resolved_by: authUser?.id ?? null, resolved_at: new Date().toISOString(),
    }).eq('id', alert.id);
    setResolvingAlertId(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:resolveAlert', error, 'Impossible de résoudre cette alerte. Réessaie dans un instant.')); return; }
    setSystemAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, resolved: true, resolved_at: new Date().toISOString() } : a));
  }

  const filteredAlerts = systemAlerts.filter(a => {
    if (alertSeverityFilter !== 'all' && a.severity !== alertSeverityFilter) return false;
    if (alertResolvedFilter === 'unresolved' && a.resolved) return false;
    if (alertResolvedFilter === 'resolved' && !a.resolved) return false;
    return true;
  });
  const unresolvedAlertsCount = systemAlerts.filter(a => !a.resolved).length;
  const ALERT_SEVERITY_BADGE: Record<string, [string, string]> = {
    info:     ['#E0F2FE', '#0369A1'],
    warning:  ['#FEF3C7', '#D97706'],
    critical: ['#FEE2E2', '#DC2626'],
  };

  async function handleSaveCurrencyRate(code: string) {
    if (!supabase) return;
    const raw = currencyEdits[code];
    const rate = parseFloat((raw ?? '').replace(',', '.'));
    if (isNaN(rate) || rate <= 0) { Alert.alert('Taux invalide', 'Entre un taux positif.'); return; }
    setSavingCurrency(code);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('currency_rates')
      .update({ rate_to_fcfa: rate, updated_by: authUser?.id, updated_at: new Date().toISOString() })
      .eq('currency_code', code);
    setSavingCurrency(null);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:saveCurrencyRate', error, 'Impossible d\'enregistrer ce taux. Réessaie dans un instant.')); return; }
    setCurrencyRates(prev => prev.map(r => r.currency_code === code ? { ...r, rate_to_fcfa: rate, updated_at: new Date().toISOString() } : r));
    setCurrencyEdits(prev => ({ ...prev, [code]: '' }));
    loadCurrencyRates(true); // refresh the app-wide formatPrice() cache immediately
  }

  const filteredShops = realShops.filter(s => {
    if (shopStatusFilter === 'active' && !s.is_active) return false;
    if (shopStatusFilter === 'inactive' && s.is_active) return false;
    if (shopVerifiedFilter === 'verified' && !s.verified) return false;
    if (shopVerifiedFilter === 'unverified' && s.verified) return false;
    if (shopZoneFilter === 'unassigned' && (s.logistics_zone || s.relay_point_id)) return false;
    if (shopZoneFilter !== 'all' && shopZoneFilter !== 'unassigned' && s.logistics_zone !== shopZoneFilter) return false;
    return true;
  });
  // Zones réellement assignées dans les données, pour peupler le filtre —
  // pas une liste figée, reflète ce que les admins ont assigné jusqu'ici.
  const knownShopZones = [...new Set(realShops.map(s => s.logistics_zone).filter((z): z is string => !!z))].sort();
  const totalPendingShopReports = Object.values(shopPendingReportCounts).reduce((a, b) => a + b, 0);

  const [realUsers,        setRealUsers]        = useState<RealUser[]>([]);
  const [realOrders,       setRealOrders]        = useState<RealOrder[]>([]);
  const [realDisputes,     setRealDisputes]      = useState<RealDispute[]>([]);
  const [realPayments,     setRealPayments]      = useState<RealPayment[]>([]);
  const [loadingAdminData, setLoadingAdminData]  = useState(isSupabaseConfigured);

  const fetchAdminData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingAdminData(false); return; }
    setLoadingAdminData(true);
    const [
      { data: usersData, error: usersErr },
      { data: ordersData, error: ordersErr },
      { data: disputesData, error: disputesErr },
      { data: paymentsData, error: paymentsErr },
    ] = await Promise.all([
      supabase.from('users').select('id, email, display_name, phone, role, is_approved, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('orders').select('id, order_number, status, total, created_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('disputes')
        .select('id, status, reason, refund_amount, created_at, orders!order_id(order_number), opener:users!opened_by(display_name, email)')
        .order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('id, order_number, payment_method, payment_proof_url, total, payment_status, payment_notes, created_at, customer:users!customer_id(display_name, email)')
        .in('payment_status', ['awaiting_verification', 'paid', 'failed'])
        .order('created_at', { ascending: false }).limit(100),
    ]);
    if (usersErr) console.warn('Admin users fetch error:', usersErr.message);
    if (ordersErr) console.warn('Admin orders fetch error:', ordersErr.message);
    if (disputesErr) console.warn('Admin disputes fetch error:', disputesErr.message);
    if (paymentsErr) console.warn('Admin payments fetch error:', paymentsErr.message);
    setRealUsers((usersData ?? []) as RealUser[]);
    setRealOrders((ordersData ?? []) as RealOrder[]);
    setRealDisputes((disputesData ?? []) as unknown as RealDispute[]);
    setRealPayments((paymentsData ?? []) as unknown as RealPayment[]);
    setLoadingAdminData(false);
  }, []);

  async function handleResolveDispute(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('disputes').update({ status: 'resolved' }).eq('id', id);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:resolveDispute', error, 'Impossible de résoudre ce litige. Réessaie dans un instant.')); return; }
    setRealDisputes(prev => prev.map(d => d.id === id ? { ...d, status: 'resolved' } : d));
  }

  async function handleValidateRealPayment(id: string) {
    if (!supabase) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('orders').update({
      payment_status: 'paid', verified_by: authUser?.id, verified_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:validatePayment', error, 'Impossible de valider ce paiement. Réessaie dans un instant.')); return; }
    setRealPayments(prev => prev.map(p => p.id === id ? { ...p, payment_status: 'paid' } : p));
  }

  async function handleRejectRealPayment(id: string, note: string) {
    if (!supabase) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('orders').update({
      payment_status: 'failed', payment_notes: note, verified_by: authUser?.id, verified_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:rejectPayment', error, 'Impossible de rejeter ce paiement. Réessaie dans un instant.')); return; }
    setRealPayments(prev => prev.map(p => p.id === id ? { ...p, payment_status: 'failed', payment_notes: note } : p));
  }

  // ── Admin notification broadcast (send-push Edge Function, mode: admin_broadcast) ──
  const [notifTitle,      setNotifTitle]      = useState('');
  const [notifBody,       setNotifBody]       = useState('');
  const [notifTargetType, setNotifTargetType] = useState<'user' | 'role' | 'all'>('all');
  const [notifRole,       setNotifRole]       = useState<UserRole>('CUSTOMER');
  const [notifUserSearch, setNotifUserSearch] = useState('');
  const [notifUser,       setNotifUser]       = useState<{ id: string; label: string } | null>(null);
  const [sendingNotif,    setSendingNotif]    = useState(false);

  const notifUserMatches = notifUserSearch.trim().length > 0
    ? realUsers.filter(u =>
        u.email.toLowerCase().includes(notifUserSearch.toLowerCase()) ||
        (u.display_name ?? '').toLowerCase().includes(notifUserSearch.toLowerCase()),
      ).slice(0, 8)
    : [];

  async function handleSendBroadcast() {
    if (!supabase) return;
    if (!notifTitle.trim() || !notifBody.trim()) {
      Alert.alert('Champs requis', 'Titre et message sont obligatoires.'); return;
    }
    if (notifTargetType === 'user' && !notifUser) {
      Alert.alert('Destinataire requis', 'Sélectionne un utilisateur.'); return;
    }
    const target = notifTargetType === 'user' ? { type: 'user', user_id: notifUser!.id }
      : notifTargetType === 'role' ? { type: 'role', role: notifRole }
      : { type: 'all' };

    setSendingNotif(true);
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { mode: 'admin_broadcast', title: notifTitle.trim(), body: notifBody.trim(), target },
    });
    setSendingNotif(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:sendBroadcast', error, "Impossible d'envoyer cette notification. Réessaie dans un instant.")); return; }
    Alert.alert('Notification envoyée', `${data?.recipients ?? 0} destinataire(s), ${data?.tokens ?? 0} appareil(s) notifié(s).`);
    setNotifTitle(''); setNotifBody(''); setNotifUser(null); setNotifUserSearch('');
  }

  // ── Support chat (conversations/messages, type='support') ────────────────
  interface SupportConv {
    id: string; last_message: string | null; last_msg_at: string | null;
    requesterId: string; requesterLabel: string;
  }
  interface SupportMsg { id: string; content: string; sender_id: string; created_at: string }
  const [supportConvs,     setSupportConvs]     = useState<SupportConv[]>([]);
  const [loadingSupport,   setLoadingSupport]   = useState(false);
  const [activeSupportId,  setActiveSupportId]  = useState<string | null>(null);
  const [supportMsgs,      setSupportMsgs]      = useState<SupportMsg[]>([]);
  const [supportReply,     setSupportReply]     = useState('');
  const [sendingReply,     setSendingReply]     = useState(false);

  const openSupportCount = supportConvs.length;

  const fetchSupportConvs = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setLoadingSupport(true);
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('id, participants, last_message, last_msg_at')
      .eq('type', 'support')
      .order('last_msg_at', { ascending: false, nullsFirst: false });
    if (error) { console.warn('Admin support fetch error:', error.message); setLoadingSupport(false); return; }

    const requesterIds = [...new Set((convs ?? []).map(c => c.participants?.[0]).filter(Boolean))];
    const { data: reqUsers } = requesterIds.length
      ? await supabase.from('users').select('id, display_name, email').in('id', requesterIds)
      : { data: [] as { id: string; display_name: string | null; email: string }[] };
    const byId = new Map((reqUsers ?? []).map(u => [u.id, u]));

    setSupportConvs((convs ?? []).map(c => {
      const req = byId.get(c.participants?.[0]);
      return {
        id: c.id, last_message: c.last_message, last_msg_at: c.last_msg_at,
        requesterId: c.participants?.[0], requesterLabel: req?.display_name ?? req?.email ?? '—',
      };
    }));
    setLoadingSupport(false);
  }, []);

  async function openSupportConv(id: string) {
    if (!supabase) return;
    setActiveSupportId(id);
    const { data } = await supabase.from('messages')
      .select('id, content, sender_id, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    setSupportMsgs((data ?? []) as SupportMsg[]);
  }

  async function handleSendReply() {
    if (!supabase || !activeSupportId || !supportReply.trim()) return;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    setSendingReply(true);
    const content = supportReply.trim();
    const { data: sent, error } = await supabase.from('messages')
      .insert({ conversation_id: activeSupportId, sender_id: authUser.id, content })
      .select('id, content, sender_id, created_at')
      .single();
    if (!error) {
      await supabase.from('conversations')
        .update({ last_message: content, last_msg_at: new Date().toISOString() })
        .eq('id', activeSupportId);
    }
    setSendingReply(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:sendSupportReply', error, 'Impossible d\'envoyer la réponse. Réessaie dans un instant.')); return; }
    setSupportMsgs(prev => [...prev, sent as SupportMsg]);
    setSupportReply('');
    fetchSupportConvs();
  }

  useEffect(() => { if (activeTab === 'support') fetchSupportConvs(); }, [activeTab, fetchSupportConvs]);

  useEffect(() => { fetchAdminData(); }, [fetchAdminData]);
  useFocusEffect(useCallback(() => { fetchAdminData(); }, [fetchAdminData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isSupabaseConfigured) {
      await fetchAdminData();
    } else {
      await new Promise(r => setTimeout(r, 900));
    }
    setRefreshing(false);
  }, [fetchAdminData]);

  const realVendors      = realUsers.filter(u => u.role === 'VENDOR');
  const pendingKycCount  = realVendorsKyc.filter(v => v.kyc_status === 'pending').length;
  const realRevenueTotal = realOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);

  const kpis = isSupabaseConfigured ? [
    { icon: 'users', label: 'Utilisateurs', value: realUsers.length.toLocaleString(), color: colors.primary, trend: '' },
    { icon: 'briefcase', label: 'Vendeurs', value: realVendors.length, color: '#7C3AED', trend: '' },
    { icon: 'shopping-cart', label: 'Commandes', value: realOrders.length.toLocaleString(), color: colors.secondary, trend: '' },
    { icon: 'dollar-sign', label: 'Revenus (total commandes)', value: `${realRevenueTotal.toLocaleString('fr-FR')} FCFA`, color: '#22C55E', trend: '' },
    { icon: 'clock', label: 'Vendeurs en attente (KYC)', value: pendingKycCount, color: '#F59E0B', trend: '' },
    { icon: 'alert-triangle', label: 'Litiges actifs', value: realDisputes.filter(d => d.status !== 'resolved').length, color: '#EF4444', trend: '' },
  ] : [
    { icon: 'users', label: 'Utilisateurs', value: ADMIN_STATS.totalUsers.toLocaleString(), color: colors.primary, trend: '+8.2%' },
    { icon: 'briefcase', label: 'Vendeurs', value: ADMIN_STATS.totalVendors, color: '#7C3AED', trend: '+3.1%' },
    { icon: 'shopping-cart', label: 'Commandes', value: ADMIN_STATS.totalOrders.toLocaleString(), color: colors.secondary, trend: '+12.4%' },
    { icon: 'dollar-sign', label: 'Revenus', value: `$${(ADMIN_STATS.totalRevenue / 1e6).toFixed(1)}M`, color: '#22C55E', trend: '+9.7%' },
    { icon: 'clock', label: 'Vendeurs en attente', value: ADMIN_STATS.pendingVendors, color: '#F59E0B', trend: '' },
    { icon: 'alert-triangle', label: 'Litiges actifs', value: ADMIN_STATS.activeDisputes, color: '#EF4444', trend: '' },
  ];

  // Demo-mode-only mock vendor cards (kept as-is — never shown when Supabase is configured)
  const mockPendingVendors = [
    { id: 'v10', name: 'Lagos Tech Hub', country: 'Nigeria', docs: true, kyc: 'pending' },
    { id: 'v11', name: 'Cairo Fabrics Co.', country: 'Egypt', docs: true, kyc: 'pending' },
    { id: 'v12', name: 'Nairobi Solar Ltd.', country: 'Kenya', docs: false, kyc: 'incomplete' },
  ];

  // Normalized shapes so the JSX below doesn't need to branch per-field.
  const displayUsers = isSupabaseConfigured
    ? realUsers.map(u => ({ id: u.id, name: u.display_name ?? u.email, email: u.email, role: u.role }))
    : DEMO_USERS.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));

  const displayOrders = isSupabaseConfigured
    ? realOrders.map(o => ({
        id: o.id, orderNumber: o.order_number,
        date: new Date(o.created_at).toLocaleDateString('fr-FR'),
        totalLabel: `${(o.total ?? 0).toLocaleString('fr-FR')} FCFA`,
        status: o.status,
      }))
    : MOCK_ORDERS.map(o => ({
        id: o.id, orderNumber: o.orderNumber, date: o.date,
        totalLabel: `$${o.total.toLocaleString()}`, status: o.status,
      }));

  const mockDisputes = [
    { id: 'd1', order: 'BDC-2024-001100', opener: 'Ahmed D.', reason: 'Produit non conforme', amount: 5200, status: 'investigating' },
    { id: 'd2', order: 'BDC-2024-000876', opener: 'Marie C.', reason: 'Colis jamais reçu', amount: 1150, status: 'open' },
    { id: 'd3', order: 'BDC-2024-001088', opener: 'Liu W.', reason: 'Remboursement partiel', amount: 780, status: 'resolved' },
  ];
  const displayDisputes = isSupabaseConfigured
    ? realDisputes.map(d => ({
        id: d.id,
        order: d.orders?.order_number ?? '—',
        opener: d.opener?.display_name ?? d.opener?.email ?? '—',
        reason: d.reason,
        amount: d.refund_amount ?? 0,
        status: d.status,
      }))
    : mockDisputes;

  // "Crédit max Net30" retiré : c'était une valeur globale statique fictive
  // ("$500 000") — le vrai crédit est par société, géré dans l'onglet
  // "Sociétés B2B" (companies.credit_limit, réel, éditable).
  const platformSettings = [
    { key: 'commission_b2c', label: 'Commission B2C', value: '3.5%' },
    { key: 'commission_b2b', label: 'Commission B2B', value: '2.0%' },
    { key: 'kyc_required', label: 'KYC obligatoire vendeur', value: 'Oui' },
    { key: 'min_order_b2b', label: 'Commande min B2B', value: '$500' },
  ];

  const [payments, setPayments] = useState<PendingPayment[]>(PENDING_PAYMENTS);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);

  const displayPayments: PendingPayment[] = isSupabaseConfigured
    ? realPayments.map(p => ({
        id: p.id,
        orderNumber: p.order_number,
        customer: p.customer?.display_name ?? p.customer?.email ?? '—',
        method: PAYMENT_METHOD_LABELS[p.payment_method ?? '']?.label ?? p.payment_method ?? '—',
        methodIcon: PAYMENT_METHOD_LABELS[p.payment_method ?? '']?.icon ?? 'credit-card',
        methodColor: PAYMENT_METHOD_LABELS[p.payment_method ?? '']?.color ?? '#64748B',
        amountUSD: p.total / XOF_RATE, // formatXOF converts back to XOF below (total is already FCFA in real mode)
        proofUrl: p.payment_proof_url,
        submittedAt: new Date(p.created_at).toLocaleString('fr-FR'),
        status: p.payment_status as PmtStatus,
        notes: p.payment_notes ?? '',
      }))
    : payments;

  const pendingCount = displayPayments.filter(p => p.status === 'awaiting_verification').length;

  // ── API keys state — real Supabase (api_keys / audit_logs tables already
  // exist with real data; RLS is enabled on api_keys with no policy yet, so
  // these calls 403 until an admin policy is added — see BUGS.md). ──────────
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(isSupabaseConfigured);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState<Record<string, boolean>>({});
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null); // shown once
  const [auditFilter, setAuditFilter] = useState<string | null>(null); // filter by key id
  const [creatingKey, setCreatingKey] = useState(false);

  const fetchApiKeysData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoadingKeys(false); return; }
    setLoadingKeys(true);
    const [{ data: keysData, error: keysErr }, { data: logsData, error: logsErr }] = await Promise.all([
      supabase.from('api_keys')
        .select('id, name, key, permissions, active, created_at, last_used')
        .order('created_at', { ascending: false }),
      supabase.from('audit_logs')
        .select('id, action, details, created_at')
        .like('action', 'mcp.%')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (keysErr) console.warn('API keys fetch error:', keysErr.message);
    if (logsErr) console.warn('Audit logs fetch error:', logsErr.message);
    setApiKeys((keysData ?? []).map((k: any) => ({
      id: k.id,
      name: k.name,
      preview: k.key ? `${k.key.slice(0, 8)}...` : '—',
      permissions: k.permissions ?? [],
      active: k.active,
      created_at: new Date(k.created_at).toLocaleDateString('fr-FR'),
      last_used: k.last_used ? new Date(k.last_used).toLocaleString('fr-FR') : null,
    })));
    setAuditRows((logsData ?? []).map((a: any) => ({
      id: a.id,
      action: a.action,
      api_key_id: a.details?.api_key_id ?? null,
      created_at: new Date(a.created_at).toLocaleString('fr-FR'),
      success: !a.details?.result_summary?.error,
    })));
    setLoadingKeys(false);
  }, []);

  useEffect(() => { fetchApiKeysData(); }, [fetchApiKeysData]);
  useFocusEffect(useCallback(() => { fetchApiKeysData(); }, [fetchApiKeysData]));

  // webhook_configs is a real table with a real admin RLS policy
  // (webhook_configs_admin) but no CRUD UI was ever built for it — this just
  // shows the real count instead of the hardcoded "3 endpoints configurés".
  const [webhookCount, setWebhookCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.from('webhook_configs').select('id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) { console.warn('Webhook configs fetch error:', error.message); return; }
        setWebhookCount(count ?? 0);
      });
  }, []);

  function togglePerm(permId: string) {
    setNewKeyPerms(p => ({ ...p, [permId]: !p[permId] }));
  }

  async function createApiKey() {
    if (!newKeyName.trim()) {
      Alert.alert('Nom requis', 'Donnez un nom à cette clé avant de la créer.');
      return;
    }
    const selectedPerms = ALL_PERMISSIONS.filter(p => newKeyPerms[p.id]).map(p => p.id);
    if (selectedPerms.length === 0) {
      Alert.alert('Permissions requises', 'Sélectionnez au moins une permission.');
      return;
    }
    if (!isSupabaseConfigured || !supabase) return;
    setCreatingKey(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    // `key` has a DB default (bdc_ + 24 random bytes hex) — don't set it
    // ourselves, just read it back once via select().
    const { data, error } = await supabase
      .from('api_keys')
      .insert({ name: newKeyName.trim(), permissions: selectedPerms, created_by: authUser?.id ?? null })
      .select('id, key')
      .single();
    setCreatingKey(false);
    if (error) { Alert.alert('Erreur', toUserMessage('admin:createApiKey', error, 'Impossible de créer cette clé API. Réessaie dans un instant.')); return; }
    setJustCreatedKey(data.key);
    setShowCreateForm(false);
    setNewKeyName('');
    setNewKeyPerms({});
    await fetchApiKeysData();
  }

  async function revokeKey(id: string) {
    const key = apiKeys.find(k => k.id === id);
    Alert.alert(
      'Révoquer la clé',
      `Révoquer "${key?.name}" ? Elle ne fonctionnera plus immédiatement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Révoquer', style: 'destructive',
          onPress: async () => {
            if (!supabase) return;
            const { error } = await supabase.from('api_keys').update({ active: false }).eq('id', id);
            if (error) { Alert.alert('Erreur', toUserMessage('admin:revokeApiKey', error, 'Impossible de révoquer cette clé. Réessaie dans un instant.')); return; }
            setApiKeys(ks => ks.map(k => k.id === id ? { ...k, active: false } : k));
          },
        },
      ]
    );
  }

  const filteredAudit = auditFilter
    ? auditRows.filter(a => a.api_key_id === auditFilter)
    : auditRows;

  function validatePayment(id: string) {
    Alert.alert(
      'Valider le paiement',
      'Confirmer la réception et validation de ce paiement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider', style: 'default',
          onPress: () => isSupabaseConfigured
            ? handleValidateRealPayment(id)
            : setPayments(ps => ps.map(p => p.id === id ? { ...p, status: 'paid' } : p)),
        },
      ]
    );
  }

  function rejectPayment(id: string) {
    const note = rejectNotes[id] ?? '';
    if (!note.trim()) {
      Alert.alert('Motif requis', 'Veuillez indiquer le motif du rejet avant de rejeter.'); return;
    }
    if (isSupabaseConfigured) {
      handleRejectRealPayment(id, note);
    } else {
      setPayments(ps => ps.map(p => p.id === id ? { ...p, status: 'failed', notes: note } : p));
    }
    setRejectOpen(null);
  }

  const TABS: { id: AdminTab; label: string; icon: string; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard',    icon: 'bar-chart-2'   },
    { id: 'users',     label: 'Utilisateurs', icon: 'users'         },
    { id: 'vendors',   label: t('vendors'),   icon: 'briefcase',     badge: pendingKycCount },
    { id: 'shops',     label: 'Boutiques',    icon: 'map-pin',       badge: totalPendingShopReports },
    { id: 'reports',   label: 'Signalements', icon: 'flag',          badge: pendingReportsCount },
    { id: 'orders',    label: t('orders'),    icon: 'shopping-cart' },
    { id: 'disputes',  label: t('disputes'),  icon: 'alert-triangle'},
    { id: 'payments',  label: 'Paiements',     icon: 'credit-card',  badge: pendingCount },
    { id: 'currencies', label: 'Devises',      icon: 'dollar-sign'  },
    { id: 'companies', label: 'Sociétés B2B',  icon: 'home'         },
    { id: 'logistics', label: 'Logistique',    icon: 'truck'        },
    { id: 'alerts',    label: 'Alertes',       icon: 'alert-triangle', badge: unresolvedAlertsCount },
    { id: 'notifications', label: 'Notifications', icon: 'bell'    },
    { id: 'support',   label: 'Chat support',  icon: 'headphones',   badge: openSupportCount },
    { id: 'apikeys',   label: 'Clés API / MCP', icon: 'key'         },
    { id: 'settings',  label: t('settings'),  icon: 'settings'      },
  ];

  // Garde d'accès route-level — la tab bar cache déjà cet onglet aux
  // non-admins (href: null dans _layout.tsx) mais ça ne bloque pas une
  // navigation directe (deep link / router.push manuel), qui monterait
  // sinon tout l'écran admin (clés API, sociétés B2B, ce module Magasins…)
  // pour n'importe quel compte connecté. Les écritures restaient déjà
  // bloquées côté RLS (current_user_role() = 'ADMIN' sur chaque table),
  // mais l'écran lui-même n'avait aucune vérification de rôle — trouvé
  // lors de l'audit sécurité de ce jour. Placé après tous les hooks
  // (règle des Hooks) ; ignoré en mode démo (pas de vrai backend, le
  // sélecteur de rôle de test doit continuer à fonctionner).
  if (!isDemoMode && user?.role !== 'ADMIN') {
    return <Redirect href="/(app)/(tabs)" />;
  }

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
          <Text style={styles.alertBadgeText}>
            {(isSupabaseConfigured ? pendingKycCount : ADMIN_STATS.pendingVendors)
              + (isSupabaseConfigured ? realDisputes.filter(d => d.status !== 'resolved').length : ADMIN_STATS.activeDisputes)
              + pendingCount}
          </Text>
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
          {loadingAdminData && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {!loadingAdminData && displayUsers.length === 0 && (
            <Text style={{ color: colors.mutedForeground, padding: 12 }}>Aucun utilisateur.</Text>
          )}
          {displayUsers.map(u => (
            <View key={u.id} style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.userAvatarText}>{u.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{u.name}</Text>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                <Text style={[styles.userRole, { color: colors.primary }]}>{u.role}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* VENDORS — KYC (vendors.kyc_status/documents/verified) */}
      {activeTab === 'vendors' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {isSupabaseConfigured ? 'Vérification KYC vendeurs' : 'Validation KYC vendeurs'}
          </Text>
          {loadingAdminData && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {isSupabaseConfigured ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                {(['pending', 'incomplete', 'rejected', 'approved'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.tabChip, { backgroundColor: kycFilter === f ? colors.primary : colors.card, borderColor: colors.border }]}
                    onPress={() => setKycFilter(f)}
                  >
                    <Text style={[styles.tabChipText, { color: kycFilter === f ? 'white' : colors.foreground }]}>
                      {f === 'pending' ? 'En attente' : f === 'incomplete' ? 'Incomplet' : f === 'rejected' ? 'Rejeté' : 'Vérifié'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {loadingVendorsKyc && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
              {!loadingVendorsKyc && realVendorsKyc.filter(v => v.kyc_status === kycFilter).length === 0 && (
                <Text style={{ color: colors.mutedForeground, padding: 12 }}>Aucun vendeur dans cette catégorie.</Text>
              )}
              {realVendorsKyc.filter(v => v.kyc_status === kycFilter).map(v => {
                const info = vendorKycUsers[v.id];
                const badgeStyle: Record<string, [string, string, string]> = {
                  pending:    ['#FEF3C7', '#D97706', 'En attente'],
                  approved:   ['#D1FAE5', '#059669', 'Vérifié'],
                  rejected:   ['#FEE2E2', '#DC2626', 'Rejeté'],
                  incomplete: ['#FEE2E2', '#DC2626', 'Incomplet'],
                };
                const [badgeBg, badgeColor, badgeLabel] = badgeStyle[v.kyc_status] ?? ['#FEF3C7', '#D97706', v.kyc_status];
                const acting = kycActingId === v.id;
                return (
                  <View key={v.id} style={[styles.vendorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.vendorHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.vendorName, { color: colors.foreground }]}>{v.company_name}</Text>
                        <Text style={[styles.vendorCountry, { color: colors.mutedForeground }]}>
                          {info?.display_name ?? info?.email ?? '—'}{v.country ? ` · ${v.country}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.kycStatusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.kycStatusText, { color: badgeColor }]}>{badgeLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.docStatus}>
                      <Feather name={v.documents?.length ? 'check-circle' : 'x-circle'} size={14} color={v.documents?.length ? '#22C55E' : '#EF4444'} />
                      <Text style={[styles.docStatusText, { color: colors.mutedForeground }]}>
                        {v.documents?.length ? `${v.documents.length} document(s) soumis` : 'Aucun document soumis'}
                      </Text>
                    </View>

                    {(v.documents ?? []).length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                        {v.documents.map((path, idx) => (
                          <TouchableOpacity
                            key={path}
                            style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}
                            onPress={() => openKycDoc(path)}
                          >
                            <Feather name="file-text" size={13} color={colors.primary} />
                            <Text style={[styles.vendorActionText, { color: colors.primary }]}>Doc {idx + 1}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {v.kyc_status !== 'approved' && (
                      <View style={styles.vendorActions}>
                        <TouchableOpacity
                          style={[styles.vendorActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#22C55E', opacity: acting ? 0.6 : 1 }]}
                          onPress={() => handleApproveVendorKyc(v.id)}
                          disabled={acting}
                        >
                          <Feather name="check" size={14} color="#059669" />
                          <Text style={[styles.vendorActionText, { color: '#059669' }]}>{t('approve')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.vendorActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', opacity: acting ? 0.6 : 1 }]}
                          onPress={() => setKycRejectOpen(kycRejectOpen === v.id ? null : v.id)}
                          disabled={acting}
                        >
                          <Feather name="x" size={14} color="#DC2626" />
                          <Text style={[styles.vendorActionText, { color: '#DC2626' }]}>{t('reject')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {kycRejectOpen === v.id && (
                      <View style={[styles.pmtRejectForm, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Text style={[styles.pmtRejectTitle, { color: colors.foreground }]}>Motif du rejet (optionnel)</Text>
                        <TextInput
                          style={[styles.pmtRejectInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                          placeholder="Ex: document illisible, pièce d'identité expirée…"
                          placeholderTextColor={colors.mutedForeground}
                          value={kycRejectNotes[v.id] ?? ''}
                          onChangeText={val => setKycRejectNotes(r => ({ ...r, [v.id]: val }))}
                          multiline
                          numberOfLines={3}
                        />
                        <TouchableOpacity
                          style={[styles.pmtRejectConfirm, { backgroundColor: '#EF4444' }]}
                          onPress={() => handleRejectVendorKyc(v.id)}
                        >
                          <Feather name="x" size={14} color="white" />
                          <Text style={styles.pmtRejectConfirmText}>Confirmer le rejet</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          ) : (
            mockPendingVendors.map(v => (
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
            ))
          )}
        </View>
      )}

      {/* SHOPS — proximity_shops moderation */}
      {activeTab === 'shops' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Boutiques de proximité</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
            {(['all', 'active', 'inactive'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.tabChip, { backgroundColor: shopStatusFilter === f ? colors.primary : colors.card, borderColor: colors.border }]}
                onPress={() => setShopStatusFilter(f)}
              >
                <Text style={[styles.tabChipText, { color: shopStatusFilter === f ? 'white' : colors.foreground }]}>
                  {f === 'all' ? 'Toutes' : f === 'active' ? 'Actives' : 'Inactives'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2, paddingBottom: 4 }}>
            {(['all', 'verified', 'unverified'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.tabChip, { backgroundColor: shopVerifiedFilter === f ? colors.primary : colors.card, borderColor: colors.border }]}
                onPress={() => setShopVerifiedFilter(f)}
              >
                <Text style={[styles.tabChipText, { color: shopVerifiedFilter === f ? 'white' : colors.foreground }]}>
                  {f === 'all' ? 'Toutes (vérif.)' : f === 'verified' ? 'Vérifiées' : 'Non vérifiées'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Filtre par zone logistique — Tâche 3 : "filtres" pour le module Magasins */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2, paddingBottom: 4 }}>
            {['all', 'unassigned', ...knownShopZones].map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.tabChip, { backgroundColor: shopZoneFilter === f ? colors.primary : colors.card, borderColor: colors.border }]}
                onPress={() => setShopZoneFilter(f)}
              >
                <Text style={[styles.tabChipText, { color: shopZoneFilter === f ? 'white' : colors.foreground }]}>
                  {f === 'all' ? 'Toutes zones' : f === 'unassigned' ? 'Non assignées' : f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingShops && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {!loadingShops && filteredShops.length === 0 && (
            <Text style={{ color: colors.mutedForeground, padding: 12 }}>Aucune boutique dans cette catégorie.</Text>
          )}

          {filteredShops.map(shop => {
            const owner = shopOwners[shop.owner_id];
            const pendingReports = shopPendingReportCounts[shop.id] ?? 0;
            const expanded = expandedShopId === shop.id;
            const editing = editingShopId === shop.id;
            const acting = shopActingId === shop.id;
            return (
              <View key={shop.id} style={[styles.vendorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.vendorHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.vendorName, { color: colors.foreground }]}>{shop.name}</Text>
                    <Text style={[styles.vendorCountry, { color: colors.mutedForeground }]}>
                      {owner?.display_name ?? owner?.email ?? '—'} · {slugToLabel[shop.category] ?? shop.category}
                    </Text>
                    <Text style={[styles.vendorCountry, { color: colors.mutedForeground }]} numberOfLines={1}>{shop.address_text}</Text>
                  </View>
                  <View style={{ gap: 6, alignItems: 'flex-end' }}>
                    <View style={[styles.kycStatusBadge, { backgroundColor: shop.is_active ? '#D1FAE5' : '#FEE2E2' }]}>
                      <Text style={[styles.kycStatusText, { color: shop.is_active ? '#059669' : '#DC2626' }]}>
                        {shop.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                    <View style={[styles.kycStatusBadge, { backgroundColor: shop.verified ? '#DBEAFE' : '#F1F5F9' }]}>
                      <Text style={[styles.kycStatusText, { color: shop.verified ? '#1D4ED8' : '#64748B' }]}>
                        {shop.verified ? 'Vérifiée' : 'Non vérifiée'}
                      </Text>
                    </View>
                  </View>
                </View>

                {pendingReports > 0 && (
                  <View style={styles.docStatus}>
                    <Feather name="alert-triangle" size={14} color="#EF4444" />
                    <Text style={[styles.docStatusText, { color: '#DC2626' }]}>{pendingReports} signalement(s) en attente</Text>
                  </View>
                )}

                <View style={styles.vendorActions}>
                  <TouchableOpacity
                    style={[styles.vendorActionBtn, {
                      backgroundColor: shop.is_active ? '#FEE2E2' : '#D1FAE5',
                      borderColor: shop.is_active ? '#EF4444' : '#22C55E',
                      opacity: acting ? 0.6 : 1,
                    }]}
                    onPress={() => handleToggleShopActive(shop)}
                    disabled={acting}
                  >
                    <Feather name={shop.is_active ? 'pause-circle' : 'play-circle'} size={14} color={shop.is_active ? '#DC2626' : '#059669'} />
                    <Text style={[styles.vendorActionText, { color: shop.is_active ? '#DC2626' : '#059669' }]}>
                      {shop.is_active ? 'Désactiver' : 'Activer'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border, opacity: acting ? 0.6 : 1 }]}
                    onPress={() => handleToggleShopVerified(shop)}
                    disabled={acting}
                  >
                    <Feather name={shop.verified ? 'shield-off' : 'shield'} size={14} color={colors.primary} />
                    <Text style={[styles.vendorActionText, { color: colors.primary }]}>{shop.verified ? 'Retirer vérif.' : 'Vérifier'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}
                    onPress={() => toggleShopExpand(shop)}
                  >
                    <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                    <Text style={[styles.vendorActionText, { color: colors.primary }]}>{expanded ? 'Réduire' : 'Détails'}</Text>
                  </TouchableOpacity>
                </View>

                {expanded && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    {(shop.images ?? []).length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {shop.images!.map((uri, idx) => (
                          <Image key={idx} source={{ uri }} style={{ width: 96, height: 96, borderRadius: 10 }} />
                        ))}
                      </ScrollView>
                    )}

                    {!editing ? (
                      <>
                        {shop.description ? <Text style={{ color: colors.foreground, fontSize: 13 }}>{shop.description}</Text> : null}
                        {shop.phone ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Tél : {shop.phone}</Text> : null}
                        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                          {(shop.rating ?? 0).toFixed(1)} ★ · {shop.review_count ?? 0} avis
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="navigation" size={13} color={shop.logistics_zone || shop.relay_point_id ? colors.primary : colors.mutedForeground} />
                          <Text style={{ color: shop.logistics_zone || shop.relay_point_id ? colors.foreground : colors.mutedForeground, fontSize: 13 }}>
                            {shop.logistics_zone ? `Zone : ${shop.logistics_zone}` : 'Aucune zone assignée'}
                            {shop.relay_point_id ? ` · Relais : ${relayPoints.find(r => r.id === shop.relay_point_id)?.name ?? shop.relay_point_id}` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border, alignSelf: 'flex-start' }]}
                          onPress={() => openEditShop(shop)}
                        >
                          <Feather name="edit-2" size={13} color={colors.primary} />
                          <Text style={[styles.vendorActionText, { color: colors.primary }]}>Modifier</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {([
                          { key: 'name', label: 'Nom' },
                          { key: 'phone', label: 'Téléphone' },
                          { key: 'address_text', label: 'Adresse' },
                          { key: 'description', label: 'Description' },
                        ] as const).map(f => (
                          <View key={f.key}>
                            <Text style={[styles.formLabel, { color: colors.foreground }]}>{f.label}</Text>
                            <TextInput
                              style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                              value={shopEditForm[f.key]}
                              onChangeText={v => setShopEditForm(prev => ({ ...prev, [f.key]: v }))}
                              multiline={f.key === 'description'}
                            />
                          </View>
                        ))}

                        {/* Tâche 3 : assignation logistique — zone (texte libre,
                            même convention que delivery_partners.zone) et point
                            relais (choix parmi relay_points, géré côté onglet
                            Logistique). Réservé à l'admin côté serveur (trigger
                            trg_protect_shop_logistics_fields). */}
                        <View>
                          <Text style={[styles.formLabel, { color: colors.foreground }]}>Zone logistique</Text>
                          <TextInput
                            style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                            placeholder="Ex : Dakar Nord"
                            placeholderTextColor={colors.mutedForeground}
                            value={shopEditForm.logistics_zone}
                            onChangeText={v => setShopEditForm(prev => ({ ...prev, logistics_zone: v }))}
                          />
                        </View>
                        <View>
                          <Text style={[styles.formLabel, { color: colors.foreground }]}>Point relais assigné</Text>
                          {relayPoints.length === 0 ? (
                            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8 }}>
                              Aucun point relais créé — onglet Logistique.
                            </Text>
                          ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
                              <TouchableOpacity
                                style={[styles.tabChip, { backgroundColor: !shopEditForm.relay_point_id ? colors.primary : colors.card, borderColor: colors.border }]}
                                onPress={() => setShopEditForm(prev => ({ ...prev, relay_point_id: null }))}
                              >
                                <Text style={[styles.tabChipText, { color: !shopEditForm.relay_point_id ? 'white' : colors.foreground }]}>Aucun</Text>
                              </TouchableOpacity>
                              {relayPoints.map(rp => (
                                <TouchableOpacity
                                  key={rp.id}
                                  style={[styles.tabChip, { backgroundColor: shopEditForm.relay_point_id === rp.id ? colors.primary : colors.card, borderColor: colors.border }]}
                                  onPress={() => setShopEditForm(prev => ({ ...prev, relay_point_id: rp.id }))}
                                >
                                  <Text style={[styles.tabChipText, { color: shopEditForm.relay_point_id === rp.id ? 'white' : colors.foreground }]}>{rp.name}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.vendorActionBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: savingShopEdit ? 0.6 : 1 }]}
                            onPress={() => handleSaveShopEdit(shop.id)}
                            disabled={savingShopEdit}
                          >
                            <Feather name="check" size={13} color="white" />
                            <Text style={[styles.vendorActionText, { color: 'white' }]}>{savingShopEdit ? 'Enregistrement…' : 'Enregistrer'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}
                            onPress={() => setEditingShopId(null)}
                          >
                            <Text style={[styles.vendorActionText, { color: colors.foreground }]}>Annuler</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    <Text style={[styles.formLabel, { color: colors.foreground, marginTop: 4 }]}>
                      Signalements{shopReports[shop.id] ? ` (${shopReports[shop.id].length})` : ''}
                    </Text>
                    {(shopReports[shop.id] ?? []).length === 0 ? (
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Aucun signalement.</Text>
                    ) : (
                      shopReports[shop.id].map(r => {
                        const reporter = reporterUsers[r.reporter_id];
                        return (
                          <View key={r.id} style={[styles.pmtRejectForm, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>{r.reason}</Text>
                            {r.details ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{r.details}</Text> : null}
                            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                              Par {reporter?.display_name ?? reporter?.email ?? '—'} · {new Date(r.created_at).toLocaleDateString('fr-FR')} · {r.status}
                            </Text>
                            {r.status === 'pending' && (
                              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                <TouchableOpacity
                                  style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}
                                  onPress={() => handleUpdateReportStatus(shop.id, r.id, 'reviewed')}
                                >
                                  <Text style={[styles.vendorActionText, { color: colors.foreground }]}>Traité</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.vendorActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#22C55E' }]}
                                  onPress={() => handleUpdateReportStatus(shop.id, r.id, 'actioned')}
                                >
                                  <Text style={[styles.vendorActionText, { color: '#059669' }]}>Actionné</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.vendorActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                                  onPress={() => handleUpdateReportStatus(shop.id, r.id, 'dismissed')}
                                >
                                  <Text style={[styles.vendorActionText, { color: '#DC2626' }]}>Rejeté</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* REPORTS — content_reports (product/shop/review), cross-type moderation queue */}
      {activeTab === 'reports' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Signalements</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
            {(['pending', 'reviewed', 'actioned', 'dismissed', 'all'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.tabChip, { backgroundColor: reportsFilter === f ? colors.primary : colors.card, borderColor: colors.border }]}
                onPress={() => setReportsFilter(f)}
              >
                <Text style={[styles.tabChipText, { color: reportsFilter === f ? 'white' : colors.foreground }]}>
                  {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'reviewed' ? 'Traité' : f === 'actioned' ? 'Actionné' : 'Rejeté'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loadingReports && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {!loadingReports && filteredReports.length === 0 && (
            <Text style={{ color: colors.mutedForeground, padding: 12 }}>Aucun signalement dans cette catégorie.</Text>
          )}

          {filteredReports.map(r => {
            const preview = reportTargetPreviews[`${r.target_type}:${r.target_id}`];
            const reporter = reportReporters[r.reporter_id];
            const [badgeBg, badgeColor, badgeLabel] = REPORT_STATUS_BADGE[r.status] ?? ['#FEF3C7', '#D97706', r.status];
            const acting = reportActingId === r.id;
            const canHide = (r.target_type === 'product' || r.target_type === 'shop') && preview && !preview.missing && preview.isActive !== false;

            return (
              <View key={r.id} style={[styles.vendorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.vendorHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name={(TARGET_TYPE_ICON[r.target_type] ?? 'flag') as any} size={12} color={colors.mutedForeground} />
                      <Text style={[styles.vendorCountry, { color: colors.mutedForeground }]}>{TARGET_TYPE_LABEL[r.target_type] ?? r.target_type}</Text>
                    </View>
                    <Text style={[styles.vendorName, { color: colors.foreground }]} numberOfLines={1}>
                      {preview?.label ?? '…'}
                    </Text>
                    {preview?.sub ? (
                      <Text style={[styles.vendorCountry, { color: colors.mutedForeground }]} numberOfLines={1}>{preview.sub}</Text>
                    ) : null}
                  </View>
                  {preview?.image ? (
                    <Image source={{ uri: preview.image }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                  ) : null}
                  <View style={[styles.kycStatusBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.kycStatusText, { color: badgeColor }]}>{badgeLabel}</Text>
                  </View>
                </View>

                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600', marginTop: 4 }}>{r.reason}</Text>
                {r.details ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{r.details}</Text> : null}
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                  Par {reporter?.display_name ?? reporter?.email ?? '—'} · {new Date(r.created_at).toLocaleString('fr-FR')}
                </Text>

                {preview?.isActive === false && (
                  <View style={styles.docStatus}>
                    <Feather name="eye-off" size={13} color="#DC2626" />
                    <Text style={[styles.docStatusText, { color: '#DC2626' }]}>Contenu déjà masqué</Text>
                  </View>
                )}

                {r.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={[styles.vendorActionBtn, { backgroundColor: colors.accent, borderColor: colors.border, opacity: acting ? 0.6 : 1 }]}
                      onPress={() => handleGlobalReportStatus(r.id, 'reviewed')}
                      disabled={acting}
                    >
                      <Text style={[styles.vendorActionText, { color: colors.foreground }]}>Traité</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.vendorActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#22C55E', opacity: acting ? 0.6 : 1 }]}
                      onPress={() => handleGlobalReportStatus(r.id, 'actioned')}
                      disabled={acting}
                    >
                      <Text style={[styles.vendorActionText, { color: '#059669' }]}>Actionné</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.vendorActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', opacity: acting ? 0.6 : 1 }]}
                      onPress={() => handleGlobalReportStatus(r.id, 'dismissed')}
                      disabled={acting}
                    >
                      <Text style={[styles.vendorActionText, { color: '#DC2626' }]}>Rejeté</Text>
                    </TouchableOpacity>
                    {canHide && (
                      <TouchableOpacity
                        style={[styles.vendorActionBtn, { backgroundColor: '#7C3AED18', borderColor: '#7C3AED', opacity: acting ? 0.6 : 1 }]}
                        onPress={() => handleHideReportTarget(r)}
                        disabled={acting}
                      >
                        <Feather name="eye-off" size={13} color="#7C3AED" />
                        <Text style={[styles.vendorActionText, { color: '#7C3AED' }]}>Masquer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ORDERS */}
      {activeTab === 'orders' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Toutes les commandes</Text>
          {loadingAdminData && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {!loadingAdminData && displayOrders.length === 0 && (
            <Text style={{ color: colors.mutedForeground, padding: 12 }}>Aucune commande.</Text>
          )}
          {displayOrders.map(order => (
            <View key={order.id} style={[styles.userRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{order.orderNumber}</Text>
                <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{order.date}</Text>
              </View>
              <Text style={[styles.orderTotal, { color: colors.primary }]}>{order.totalLabel}</Text>
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

          {displayPayments.map(pmt => (
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
          {isSupabaseConfigured && displayDisputes.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 8 }}>
              Aucun litige enregistré pour l'instant.
            </Text>
          )}
          {displayDisputes.map(d => (
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
                <Text style={[styles.disputeParty, { color: colors.mutedForeground }]}>Ouvert par: {d.opener}</Text>
                <Text style={[styles.disputeParty, { color: colors.mutedForeground }]}>{d.reason}</Text>
                {d.amount > 0 && (
                  <Text style={[styles.disputeAmount, { color: colors.primary }]}>
                    {isSupabaseConfigured ? `${d.amount.toLocaleString('fr-FR')} FCFA` : `$${d.amount.toLocaleString()}`}
                  </Text>
                )}
              </View>
              {d.status !== 'resolved' && (
                <View style={styles.disputeActions}>
                  <TouchableOpacity
                    style={[styles.vendorActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#22C55E' }]}
                    onPress={() => isSupabaseConfigured ? handleResolveDispute(d.id) : undefined}
                  >
                    <Feather name="check-circle" size={13} color="#059669" />
                    <Text style={[styles.vendorActionText, { color: '#059669' }]}>Résoudre</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* CURRENCIES — currency_rates, read by lib/currency.ts's formatPrice() app-wide */}
      {activeTab === 'currencies' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Devises</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            1 unité de la devise vaut ce nombre de FCFA. FCFA reste toujours la devise de référence (taux fixé à 1).
          </Text>

          {loadingCurrencies && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}

          {currencyRates.map(rate => {
            const isBase = rate.currency_code === 'FCFA';
            const saving = savingCurrency === rate.currency_code;
            return (
              <View key={rate.currency_code} style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: colors.foreground }}>
                    {rate.symbol} {rate.currency_code}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                    Taux actuel : {Number(rate.rate_to_fcfa).toLocaleString('fr-FR')} FCFA
                  </Text>
                </View>

                {isBase ? (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Devise de référence — taux fixe, non modifiable.</Text>
                ) : (
                  <>
                    <Text style={[styles.formLabel, { color: colors.foreground }]}>Nouveau taux (FCFA pour 1 {rate.currency_code})</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        style={[styles.formInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginBottom: 0 }]}
                        placeholder={String(rate.rate_to_fcfa)}
                        placeholderTextColor={colors.mutedForeground}
                        value={currencyEdits[rate.currency_code] ?? ''}
                        onChangeText={v => setCurrencyEdits(prev => ({ ...prev, [rate.currency_code]: v }))}
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
                        onPress={() => handleSaveCurrencyRate(rate.currency_code)}
                        disabled={saving}
                      >
                        {saving ? <ActivityIndicator size="small" color="white" /> : <Feather name="check" size={16} color="white" />}
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  Dernière mise à jour : {new Date(rate.updated_at).toLocaleString('fr-FR')}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* LOGISTICS — relay_points / drone_zones (localisation de livraison) */}
      {activeTab === 'logistics' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tarifs de livraison</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8 }}>
            Prix et délai affichés au checkout pour chaque mode/vitesse. Désactiver un tarif le masque du checkout
            (le mode de livraison correspondant devient alors indisponible pour le client).
          </Text>

          {loadingDeliveryRates && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}

          {deliveryRatesAdmin.map(rate => {
            const draft = draftFor(rate);
            const dirty = draft.cost !== String(rate.cost) || draft.days !== rate.days;
            const icon = rate.delivery_type === 'drone' ? 'wind'
              : rate.delivery_type === 'relay_point' ? 'map-pin'
              : rate.delivery_type === 'store_pickup' ? 'shopping-bag'
              : 'home';
            return (
              <View key={rate.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: rate.active ? colors.border : '#FEE2E2', opacity: rate.active ? 1 : 0.75 }]}>
                <View style={styles.keyCardHeader}>
                  <View style={[styles.keyIconBox, { backgroundColor: rate.active ? colors.primary + '18' : '#FEE2E2' }]}>
                    <Feather name={icon as any} size={16} color={rate.active ? colors.primary : '#DC2626'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.keyName, { color: colors.foreground }]}>{rate.label}</Text>
                    <Text style={[styles.keyPreview, { color: colors.mutedForeground, fontFamily: undefined }]} numberOfLines={1}>
                      {rate.code}
                    </Text>
                  </View>
                  <Switch
                    value={rate.active}
                    onValueChange={() => handleToggleRateActive(rate)}
                    disabled={savingRateId === rate.id}
                    trackColor={{ false: colors.muted, true: '#22C55E' }}
                    thumbColor="white"
                  />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formLabel, { color: colors.foreground, marginBottom: 4 }]}>Tarif (FCFA)</Text>
                    <TextInput
                      style={[styles.formInput, { marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="numeric"
                      value={draft.cost}
                      onChangeText={v => setRateDrafts(prev => ({ ...prev, [rate.id]: { cost: v, days: draftFor(rate).days } }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formLabel, { color: colors.foreground, marginBottom: 4 }]}>Délai estimé</Text>
                    <TextInput
                      style={[styles.formInput, { marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      value={draft.days}
                      onChangeText={v => setRateDrafts(prev => ({ ...prev, [rate.id]: { cost: draftFor(rate).cost, days: v } }))}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: dirty && savingRateId !== rate.id ? 1 : 0.5 }]}
                    onPress={() => handleSaveRate(rate)}
                    disabled={!dirty || savingRateId === rate.id}
                  >
                    {savingRateId === rate.id
                      ? <ActivityIndicator size="small" color="white" />
                      : <Feather name="check" size={16} color="white" />}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {!loadingDeliveryRates && deliveryRatesAdmin.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
              Aucun tarif de livraison configuré.
            </Text>
          )}

          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>Points relais</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8 }}>
            Visibles au checkout uniquement quand actifs.
          </Text>

          {!showRelayForm ? (
            <TouchableOpacity style={[styles.createKeyBtn, { backgroundColor: colors.primary }]} onPress={() => setShowRelayForm(true)}>
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.createKeyBtnText}>Ajouter un point relais</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>Nouveau point relais</Text>

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Nom *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Relais Marché Central"
                placeholderTextColor={colors.mutedForeground}
                value={newRelay.name}
                onChangeText={v => setNewRelay(f => ({ ...f, name: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Adresse *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="12 Rue du Marché, Dakar"
                placeholderTextColor={colors.mutedForeground}
                value={newRelay.address}
                onChangeText={v => setNewRelay(f => ({ ...f, address: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Coordonnées (optionnel)</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Latitude" placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  value={newRelay.latitude}
                  onChangeText={v => setNewRelay(f => ({ ...f, latitude: v }))}
                />
                <TextInput
                  style={[styles.formInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Longitude" placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  value={newRelay.longitude}
                  onChangeText={v => setNewRelay(f => ({ ...f, longitude: v }))}
                />
              </View>
              <TouchableOpacity
                onPress={() => useCurrentLocationFor((lat, lng) => setNewRelay(f => ({ ...f, latitude: lat, longitude: lng })))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}
              >
                <Feather name="navigation" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Utiliser ma position actuelle</Text>
              </TouchableOpacity>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formCancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setShowRelayForm(false); setNewRelay({ name: '', address: '', latitude: '', longitude: '' }); }}
                >
                  <Text style={[styles.formCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: creatingRelay ? 0.7 : 1 }]}
                  onPress={handleCreateRelayPoint}
                  disabled={creatingRelay}
                >
                  {creatingRelay
                    ? <ActivityIndicator size="small" color="white" />
                    : <><Feather name="map-pin" size={14} color="white" /><Text style={styles.formConfirmText}>Créer</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loadingRelayPoints && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}
          {relayPoints.map(rp => (
            <View key={rp.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: rp.active ? colors.border : '#FEE2E2', opacity: rp.active ? 1 : 0.75 }]}>
              <View style={styles.keyCardHeader}>
                <View style={[styles.keyIconBox, { backgroundColor: rp.active ? colors.primary + '18' : '#FEE2E2' }]}>
                  <Feather name="map-pin" size={16} color={rp.active ? colors.primary : '#DC2626'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyName, { color: colors.foreground }]}>{rp.name}</Text>
                  <Text style={[styles.keyPreview, { color: colors.mutedForeground }]} numberOfLines={1}>{rp.address}</Text>
                </View>
                <Switch
                  value={rp.active}
                  onValueChange={() => handleToggleRelayActive(rp)}
                  disabled={relayActingId === rp.id}
                  trackColor={{ false: colors.muted, true: '#22C55E' }}
                  thumbColor="white"
                />
              </View>
            </View>
          ))}
          {!loadingRelayPoints && relayPoints.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
              Aucun point relais pour l'instant.
            </Text>
          )}

          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>Zones drone</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8 }}>
            Rayon en kilomètres autour du centre. Visibles au checkout uniquement quand actives.
          </Text>

          {!showDroneForm ? (
            <TouchableOpacity style={[styles.createKeyBtn, { backgroundColor: colors.primary }]} onPress={() => setShowDroneForm(true)}>
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.createKeyBtnText}>Ajouter une zone drone</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>Nouvelle zone drone</Text>

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Nom *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Zone Dakar Plateau"
                placeholderTextColor={colors.mutedForeground}
                value={newDrone.name}
                onChangeText={v => setNewDrone(f => ({ ...f, name: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Centre (latitude/longitude) *</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Latitude" placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  value={newDrone.latitude}
                  onChangeText={v => setNewDrone(f => ({ ...f, latitude: v }))}
                />
                <TextInput
                  style={[styles.formInput, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Longitude" placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  value={newDrone.longitude}
                  onChangeText={v => setNewDrone(f => ({ ...f, longitude: v }))}
                />
              </View>
              <TouchableOpacity
                onPress={() => useCurrentLocationFor((lat, lng) => setNewDrone(f => ({ ...f, latitude: lat, longitude: lng })))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 10 }}
              >
                <Feather name="navigation" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Utiliser ma position actuelle</Text>
              </TouchableOpacity>

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Rayon (km) *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="5" placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                value={newDrone.radius}
                onChangeText={v => setNewDrone(f => ({ ...f, radius: v }))}
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formCancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setShowDroneForm(false); setNewDrone({ name: '', latitude: '', longitude: '', radius: '5' }); }}
                >
                  <Text style={[styles.formCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: creatingDrone ? 0.7 : 1 }]}
                  onPress={handleCreateDroneZone}
                  disabled={creatingDrone}
                >
                  {creatingDrone
                    ? <ActivityIndicator size="small" color="white" />
                    : <><Feather name="wind" size={14} color="white" /><Text style={styles.formConfirmText}>Créer</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loadingDroneZones && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}
          {droneZones.map(dz => (
            <View key={dz.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: dz.active ? colors.border : '#FEE2E2', opacity: dz.active ? 1 : 0.75 }]}>
              <View style={styles.keyCardHeader}>
                <View style={[styles.keyIconBox, { backgroundColor: dz.active ? colors.primary + '18' : '#FEE2E2' }]}>
                  <Feather name="wind" size={16} color={dz.active ? colors.primary : '#DC2626'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyName, { color: colors.foreground }]}>{dz.name}</Text>
                  <Text style={[styles.keyPreview, { color: colors.mutedForeground }]}>
                    Rayon {dz.radius_km} km · {dz.center_latitude.toFixed(4)}, {dz.center_longitude.toFixed(4)}
                  </Text>
                </View>
                <Switch
                  value={dz.active}
                  onValueChange={() => handleToggleDroneActive(dz)}
                  disabled={droneActingId === dz.id}
                  trackColor={{ false: colors.muted, true: '#22C55E' }}
                  thumbColor="white"
                />
              </View>
            </View>
          ))}
          {!loadingDroneZones && droneZones.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
              Aucune zone drone pour l'instant.
            </Text>
          )}

          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>Livreurs internes</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8 }}>
            Sélectionnables par les vendeurs à l'expédition d'une commande. Les livreurs externes (API) ne sont pas encore gérés ici.
          </Text>

          {!showPartnerForm ? (
            <TouchableOpacity style={[styles.createKeyBtn, { backgroundColor: colors.primary }]} onPress={() => setShowPartnerForm(true)}>
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.createKeyBtnText}>Ajouter un livreur interne</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>Nouveau livreur interne</Text>

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Nom *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Moussa Diagne"
                placeholderTextColor={colors.mutedForeground}
                value={newPartner.name}
                onChangeText={v => setNewPartner(f => ({ ...f, name: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Téléphone *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="+221 77 000 0000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                value={newPartner.phone}
                onChangeText={v => setNewPartner(f => ({ ...f, phone: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Zone (optionnel)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Dakar Plateau"
                placeholderTextColor={colors.mutedForeground}
                value={newPartner.zone}
                onChangeText={v => setNewPartner(f => ({ ...f, zone: v }))}
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formCancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setShowPartnerForm(false); setNewPartner({ name: '', phone: '', zone: '' }); }}
                >
                  <Text style={[styles.formCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: creatingPartner ? 0.7 : 1 }]}
                  onPress={handleCreateDeliveryPartner}
                  disabled={creatingPartner}
                >
                  {creatingPartner
                    ? <ActivityIndicator size="small" color="white" />
                    : <><Feather name="truck" size={14} color="white" /><Text style={styles.formConfirmText}>Créer</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loadingDeliveryPartners && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}
          {deliveryPartnersAdmin.map(dp => (
            <View key={dp.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: dp.active ? colors.border : '#FEE2E2', opacity: dp.active ? 1 : 0.75 }]}>
              <View style={styles.keyCardHeader}>
                <View style={[styles.keyIconBox, { backgroundColor: dp.active ? colors.primary + '18' : '#FEE2E2' }]}>
                  <Feather name="truck" size={16} color={dp.active ? colors.primary : '#DC2626'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyName, { color: colors.foreground }]}>{dp.name}</Text>
                  <Text style={[styles.keyPreview, { color: colors.mutedForeground }]}>
                    {dp.phone}{dp.zone ? ` · ${dp.zone}` : ''} · {dp.type === 'internal' ? 'Interne' : 'API externe'}
                  </Text>
                </View>
                <Switch
                  value={dp.active}
                  onValueChange={() => handleTogglePartnerActive(dp)}
                  disabled={partnerActingId === dp.id}
                  trackColor={{ false: colors.muted, true: '#22C55E' }}
                  thumbColor="white"
                />
              </View>
            </View>
          ))}
          {!loadingDeliveryPartners && deliveryPartnersAdmin.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
              Aucun livreur pour l'instant.
            </Text>
          )}

          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>Magasins de retrait (Click & Collect)</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8 }}>
            Proposés au client à l'étape Livraison → "Retrait en magasin", uniquement quand actifs.
          </Text>

          {!showStoreForm ? (
            <TouchableOpacity style={[styles.createKeyBtn, { backgroundColor: colors.primary }]} onPress={openCreateStoreForm}>
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.createKeyBtnText}>Ajouter un magasin</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>
                {editingStoreId ? 'Modifier le magasin' : 'Nouveau magasin'}
              </Text>

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Nom du magasin *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: BARDEC Hub Plateau"
                placeholderTextColor={colors.mutedForeground}
                value={storeForm.name}
                onChangeText={v => setStoreForm(f => ({ ...f, name: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Adresse *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="12 Avenue Léopold Sédar Senghor"
                placeholderTextColor={colors.mutedForeground}
                value={storeForm.address}
                onChangeText={v => setStoreForm(f => ({ ...f, address: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Ville *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Dakar"
                placeholderTextColor={colors.mutedForeground}
                value={storeForm.city}
                onChangeText={v => setStoreForm(f => ({ ...f, city: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Téléphone *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="+221 77 000 0000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                value={storeForm.phone}
                onChangeText={v => setStoreForm(f => ({ ...f, phone: v }))}
              />

              <Text style={[styles.formLabel, { color: colors.foreground }]}>Horaires *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Lun–Sam 9h–19h"
                placeholderTextColor={colors.mutedForeground}
                value={storeForm.hours}
                onChangeText={v => setStoreForm(f => ({ ...f, hours: v }))}
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formCancelBtn, { borderColor: colors.border }]}
                  onPress={closeStoreForm}
                >
                  <Text style={[styles.formCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: savingStore ? 0.7 : 1 }]}
                  onPress={handleSaveStore}
                  disabled={savingStore}
                >
                  {savingStore
                    ? <ActivityIndicator size="small" color="white" />
                    : <><Feather name="shopping-bag" size={14} color="white" /><Text style={styles.formConfirmText}>{editingStoreId ? 'Enregistrer' : 'Créer'}</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loadingPickupStores && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}
          {pickupStoresAdmin.map(s => (
            <View key={s.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: s.active ? colors.border : '#FEE2E2', opacity: s.active ? 1 : 0.75 }]}>
              <View style={styles.keyCardHeader}>
                <View style={[styles.keyIconBox, { backgroundColor: s.active ? colors.primary + '18' : '#FEE2E2' }]}>
                  <Feather name="shopping-bag" size={16} color={s.active ? colors.primary : '#DC2626'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.keyName, { color: colors.foreground }]}>{s.name}</Text>
                  <Text style={[styles.keyPreview, { color: colors.mutedForeground }]} numberOfLines={1}>{s.address}, {s.city}</Text>
                  <Text style={[styles.keyPreview, { color: colors.mutedForeground }]} numberOfLines={1}>{s.phone} · {s.hours}</Text>
                </View>
                <Switch
                  value={s.active}
                  onValueChange={() => handleToggleStoreActive(s)}
                  disabled={storeActingId === s.id}
                  trackColor={{ false: colors.muted, true: '#22C55E' }}
                  thumbColor="white"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                  onPress={() => openEditStoreForm(s)}
                  disabled={storeActingId === s.id}
                >
                  <Feather name="edit-2" size={13} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FEE2E2' }}
                  onPress={() => handleDeleteStore(s)}
                  disabled={storeActingId === s.id}
                >
                  <Feather name="trash-2" size={13} color="#DC2626" />
                  <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600' }}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!loadingPickupStores && pickupStoresAdmin.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
              Aucun magasin de retrait pour l'instant.
            </Text>
          )}
        </View>
      )}

      {/* COMPANIES — sociétés B2B, approbation + crédit Net30 */}
      {activeTab === 'companies' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sociétés B2B</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 8 }}>
            Une société est créée automatiquement à l'inscription d'un compte Acheteur/Approbateur/Vendeur B2B.
            Approuve-la et fixe sa limite de crédit Net30 ici — sans les deux, Net30 reste masqué au checkout pour ses comptes.
          </Text>

          {loadingCompanies && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}

          {companiesAdmin.map(c => {
            const draft = creditDrafts[c.id] ?? String(c.credit_limit ?? 0);
            const dirty = creditDrafts[c.id] !== undefined && creditDrafts[c.id] !== String(c.credit_limit ?? 0);
            const overLimit = (c.net30_balance ?? 0) > (c.credit_limit ?? 0);
            return (
              <View key={c.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: c.is_approved ? colors.border : '#FEE2E2' }]}>
                <View style={styles.keyCardHeader}>
                  <View style={[styles.keyIconBox, { backgroundColor: c.is_approved ? colors.primary + '18' : '#FEE2E2' }]}>
                    <Feather name="home" size={16} color={c.is_approved ? colors.primary : '#DC2626'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.keyName, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.keyPreview, { color: colors.mutedForeground, fontFamily: undefined }]} numberOfLines={1}>
                      {[c.tax_id, c.country].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  <Switch
                    value={c.is_approved}
                    onValueChange={() => handleToggleCompanyApproved(c)}
                    disabled={companyActingId === c.id}
                    trackColor={{ false: colors.muted, true: '#22C55E' }}
                    thumbColor="white"
                  />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formLabel, { color: colors.foreground, marginBottom: 4 }]}>Limite de crédit Net30 (FCFA)</Text>
                    <TextInput
                      style={[styles.formInput, { marginBottom: 0, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      keyboardType="numeric"
                      value={draft}
                      onChangeText={v => setCreditDrafts(prev => ({ ...prev, [c.id]: v }))}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: dirty && savingCreditId !== c.id ? 1 : 0.5 }]}
                    onPress={() => handleSaveCreditLimit(c)}
                    disabled={!dirty || savingCreditId === c.id}
                  >
                    {savingCreditId === c.id
                      ? <ActivityIndicator size="small" color="white" />
                      : <Text style={styles.formConfirmText}>Enregistrer</Text>}
                  </TouchableOpacity>
                </View>

                <Text style={{ color: overLimit ? '#DC2626' : colors.mutedForeground, fontSize: 12, fontWeight: overLimit ? '700' : '400' }}>
                  Solde Net30 actuel : {(c.net30_balance ?? 0).toLocaleString('fr-FR')} FCFA
                  {overLimit ? ' — dépasse la limite accordée' : ''}
                </Text>
              </View>
            );
          })}
          {!loadingCompanies && companiesAdmin.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
              Aucune société B2B pour l'instant.
            </Text>
          )}
        </View>
      )}

      {/* ALERTS — system_alerts (monitoring interne) */}
      {activeTab === 'alerts' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Alertes système</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 10 }}>
            Outil interne — écrites par les Edge Functions (ex. échec critique d'OMNI) quand quelque chose tourne mal côté serveur.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['unresolved', 'resolved', 'all'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.tabChip, { backgroundColor: alertResolvedFilter === f ? colors.primary : colors.card, borderColor: colors.border, marginBottom: 0 }]}
                onPress={() => setAlertResolvedFilter(f)}
              >
                <Text style={[styles.tabChipText, { color: alertResolvedFilter === f ? 'white' : colors.foreground }]}>
                  {f === 'unresolved' ? 'Non résolues' : f === 'resolved' ? 'Résolues' : 'Toutes'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['all', 'critical', 'warning', 'info'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.tabChip, { backgroundColor: alertSeverityFilter === f ? colors.primary : colors.card, borderColor: colors.border, marginBottom: 0 }]}
                onPress={() => setAlertSeverityFilter(f)}
              >
                <Text style={[styles.tabChipText, { color: alertSeverityFilter === f ? 'white' : colors.foreground }]}>
                  {f === 'all' ? 'Toute sévérité' : f === 'critical' ? 'Critique' : f === 'warning' ? 'Avertissement' : 'Info'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingAlerts && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {!loadingAlerts && filteredAlerts.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
              Aucune alerte {alertResolvedFilter === 'unresolved' ? 'non résolue' : ''} pour l'instant.
            </Text>
          )}
          {filteredAlerts.map(a => {
            const [bg, fg] = ALERT_SEVERITY_BADGE[a.severity] ?? ALERT_SEVERITY_BADGE.info;
            return (
              <View key={a.id} style={[styles.keyCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: a.resolved ? 0.7 : 1 }]}>
                <View style={styles.keyCardHeader}>
                  <View style={[styles.badgePill, { backgroundColor: bg }]}>
                    <Text style={[styles.badgePillText, { color: fg }]}>{a.severity.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.keyName, { color: colors.foreground }]} numberOfLines={2}>{a.message}</Text>
                    <Text style={[styles.keyPreview, { color: colors.mutedForeground }]}>
                      {a.source} · {new Date(a.created_at).toLocaleString('fr-FR')}
                    </Text>
                  </View>
                </View>
                {!a.resolved ? (
                  <TouchableOpacity
                    style={[styles.formConfirmBtn, { backgroundColor: colors.primary, marginTop: 10, opacity: resolvingAlertId === a.id ? 0.7 : 1 }]}
                    onPress={() => handleResolveAlert(a)}
                    disabled={resolvingAlertId === a.id}
                  >
                    {resolvingAlertId === a.id
                      ? <ActivityIndicator size="small" color="white" />
                      : <><Feather name="check" size={14} color="white" /><Text style={styles.formConfirmText}>Marquer résolue</Text></>}
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: '#059669', fontSize: 12, fontWeight: '700', marginTop: 8 }}>
                    ✓ Résolue {a.resolved_at ? `le ${new Date(a.resolved_at).toLocaleDateString('fr-FR')}` : ''}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* NOTIFICATIONS (admin broadcast via send-push Edge Function) */}
      {activeTab === 'notifications' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Envoyer une notification</Text>
          <View style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.formLabel, { color: colors.foreground }]}>Titre *</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: Nouvelle promo BARDEC"
              placeholderTextColor={colors.mutedForeground}
              value={notifTitle}
              onChangeText={setNotifTitle}
            />

            <Text style={[styles.formLabel, { color: colors.foreground }]}>Message *</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, height: 80, textAlignVertical: 'top' }]}
              placeholder="Contenu de la notification…"
              placeholderTextColor={colors.mutedForeground}
              value={notifBody}
              onChangeText={setNotifBody}
              multiline
            />

            <Text style={[styles.formLabel, { color: colors.foreground }]}>Cible *</Text>
            <View style={styles.permsGrid}>
              {([
                { id: 'all',  label: 'Tous les utilisateurs' },
                { id: 'role', label: 'Un rôle' },
                { id: 'user', label: 'Un utilisateur précis' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.permChip, {
                    backgroundColor: notifTargetType === opt.id ? colors.primary + '18' : colors.background,
                    borderColor:     notifTargetType === opt.id ? colors.primary : colors.border,
                  }]}
                  onPress={() => setNotifTargetType(opt.id)}
                >
                  <View style={[styles.permCheckbox, {
                    backgroundColor: notifTargetType === opt.id ? colors.primary : 'transparent',
                    borderColor:     notifTargetType === opt.id ? colors.primary : colors.mutedForeground,
                  }]}>
                    {notifTargetType === opt.id && <Feather name="check" size={10} color="white" />}
                  </View>
                  <Text style={[styles.permLabel, { color: colors.foreground }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {notifTargetType === 'role' && (
              <View style={styles.permsGrid}>
                {(['CUSTOMER', 'BUYER', 'APPROVER', 'VENDOR', 'ADMIN'] as UserRole[]).map(role => (
                  <TouchableOpacity
                    key={role}
                    style={[styles.permChip, {
                      backgroundColor: notifRole === role ? colors.primary + '18' : colors.background,
                      borderColor:     notifRole === role ? colors.primary : colors.border,
                    }]}
                    onPress={() => setNotifRole(role)}
                  >
                    <Text style={[styles.permLabel, { color: colors.foreground }]}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {notifTargetType === 'user' && (
              <View>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Chercher par nom ou email…"
                  placeholderTextColor={colors.mutedForeground}
                  value={notifUser ? notifUser.label : notifUserSearch}
                  onChangeText={(v) => { setNotifUserSearch(v); setNotifUser(null); }}
                />
                {!notifUser && notifUserMatches.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.permChip, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 6 }]}
                    onPress={() => { setNotifUser({ id: u.id, label: u.display_name ?? u.email }); setNotifUserSearch(''); }}
                  >
                    <Text style={[styles.permLabel, { color: colors.foreground }]}>{u.display_name ?? u.email} · {u.email}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: sendingNotif ? 0.7 : 1, flex: 1 }]}
                onPress={handleSendBroadcast}
                disabled={sendingNotif}
              >
                {sendingNotif
                  ? <ActivityIndicator size="small" color="white" />
                  : <><Feather name="send" size={14} color="white" /><Text style={styles.formConfirmText}>Envoyer</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* SUPPORT CHAT (conversations/messages, type='support') */}
      {activeTab === 'support' && (
        <View style={styles.section}>
          {activeSupportId ? (
            <>
              <TouchableOpacity onPress={() => { setActiveSupportId(null); setSupportMsgs([]); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Feather name="arrow-left" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Retour aux conversations</Text>
              </TouchableOpacity>
              <View style={{ gap: 8, marginBottom: 16 }}>
                {supportMsgs.map(m => {
                  // Was a plain neutral card + text label for every message
                  // regardless of sender ("Client" vs "Admin" only readable
                  // as text, no color/alignment distinction) — same bubble
                  // convention as the customer-facing support.tsx now.
                  const requesterId = supportConvs.find(c => c.id === activeSupportId)?.requesterId;
                  const isAdminMsg = m.sender_id !== requesterId;
                  return (
                    <View key={m.id} style={[styles.chatBubbleRow, isAdminMsg ? styles.chatBubbleRowMe : styles.chatBubbleRowOther]}>
                      <View style={{ maxWidth: '80%' }}>
                        <Text style={[styles.chatSenderLabel, { color: colors.mutedForeground, textAlign: isAdminMsg ? 'right' : 'left' }]}>
                          {isAdminMsg ? 'Admin' : 'Client'}
                        </Text>
                        <View style={[styles.chatBubble, isAdminMsg
                          ? { backgroundColor: colors.primary }
                          : { backgroundColor: '#F1F0F0' }]}
                        >
                          <Text style={isAdminMsg ? styles.chatBubbleTextMe : styles.chatBubbleTextOther}>{m.content}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, marginBottom: 0 }]}
                  placeholder="Répondre au client…"
                  placeholderTextColor={colors.mutedForeground}
                  value={supportReply}
                  onChangeText={setSupportReply}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: sendingReply || !supportReply.trim() ? 0.6 : 1 }]}
                  onPress={handleSendReply}
                  disabled={sendingReply || !supportReply.trim()}
                >
                  {sendingReply ? <ActivityIndicator size="small" color="white" /> : <Feather name="send" size={16} color="white" />}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Chat support</Text>
              {loadingSupport ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
              ) : supportConvs.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 8 }}>Aucune conversation support pour l'instant.</Text>
              ) : (
                supportConvs.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.createKeyForm, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 10 }]}
                    onPress={() => openSupportConv(c.id)}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 14, color: colors.foreground }}>{c.requesterLabel}</Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 4 }} numberOfLines={2}>
                      {c.last_message ?? '—'}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
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
                {/* No clipboard module installed (expo-clipboard) — the key
                    text below is `selectable`, so a long-press already lets
                    you copy it manually. Claiming a tap copied it without
                    actually copying would be worse than this. */}
                <TouchableOpacity onPress={() => Alert.alert('Astuce', 'Fais un appui long sur la clé ci-dessus pour la sélectionner et la copier.')}>
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
                  style={[styles.formConfirmBtn, { backgroundColor: colors.primary, opacity: creatingKey ? 0.7 : 1 }]}
                  onPress={createApiKey}
                  disabled={creatingKey}
                >
                  {creatingKey
                    ? <ActivityIndicator size="small" color="white" />
                    : <><Feather name="key" size={14} color="white" /><Text style={styles.formConfirmText}>Générer la clé</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Keys list */}
          <Text style={[styles.keysListTitle, { color: colors.foreground }]}>
            Clés existantes ({apiKeys.length})
          </Text>
          {loadingKeys && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />}
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
                <Text style={[styles.auditKey, { color: colors.mutedForeground }]}>
                  {apiKeys.find(k => k.id === entry.api_key_id)?.name ?? 'Clé inconnue'}
                </Text>
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
                    {/* No platform_settings table exists yet — these 5 values are
                        hardcoded, not read from or writable to the database. Real
                        editing needs a new table (DDL, needs validation) + this
                        form wired to it. Honest placeholder instead of a dead tap. */}
                    <TouchableOpacity onPress={() => Alert.alert('Bientôt disponible', "L'édition des paramètres de plateforme arrive prochainement.")}>
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
            {/* Real value: the app's own Supabase anon/publishable key (safe to
                display — it's the same key already embedded in every build,
                meant to be public, protected by RLS). Was a fake masked string. */}
            <View style={styles.apiKeyRow}>
              <Feather name="key" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Clé API publique (Supabase)</Text>
                <Text style={[styles.settingValue, { color: colors.mutedForeground, fontFamily: 'monospace' }]} numberOfLines={1}>
                  {(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').slice(0, 24) || '—'}…
                </Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {/* webhook_configs is a real table with a real admin RLS policy —
                shows the real count (0 today) but no CRUD UI was ever built to
                create/edit entries. Honest placeholder rather than a dead tap
                pretending "3 endpoints configurés" like before. */}
            <TouchableOpacity
              style={styles.apiKeyRow}
              onPress={() => Alert.alert('Bientôt disponible', "La gestion des webhooks sortants arrive prochainement (la table existe déjà côté base, l'écran de configuration reste à construire).")}
            >
              <Feather name="link" size={16} color={colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Webhooks sortants</Text>
                <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>
                  {webhookCount === null ? '…' : `${webhookCount} endpoint${webhookCount === 1 ? '' : 's'} configuré${webhookCount === 1 ? '' : 's'}`}
                </Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {/* No API documentation was ever written or generated — nothing
                real to link to. */}
            <TouchableOpacity
              style={styles.apiKeyRow}
              onPress={() => Alert.alert('Bientôt disponible', "La documentation de l'API MCP arrive prochainement.")}
            >
              <Feather name="code" size={16} color='#7C3AED' />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Documentation API</Text>
                <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>Pas encore rédigée</Text>
              </View>
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
  badgePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  badgePillText: { fontSize: 10, fontWeight: '800' },
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
  chatBubbleRow:      { flexDirection: 'row' },
  chatBubbleRowMe:    { justifyContent: 'flex-end' },
  chatBubbleRowOther: { justifyContent: 'flex-start' },
  chatSenderLabel:    { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  chatBubble:         { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  chatBubbleTextMe:   { color: 'white', fontSize: 14 },
  chatBubbleTextOther: { color: '#1F2937', fontSize: 14 },
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
