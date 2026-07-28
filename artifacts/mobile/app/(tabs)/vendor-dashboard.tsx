import React, { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, Switch,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Feather } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import { SkeletonBox } from '@/components/SkeletonCard';
import { router } from 'expo-router';
import { MOCK_ORDERS, MOCK_PRODUCTS, VENDOR_STATS } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');

type Period = '7j' | '30j' | '90j' | '12m';

// ─── Lightweight CSV parser (handles quoted fields) ─────────────────────────
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_').trim());
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}

// ─── CSV value escaper ───────────────────────────────────────────────────────
function escapeCSV(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n'))
    return `"${v.replace(/"/g, '""')}"`;
  return v;
}

// ─── Mini bar chart ──────────────────────────────────────────────────────────
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
            height: max > 0 ? (v / max) * 60 : 0,
            backgroundColor: color,
            borderRadius: 4,
            opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.6,
          }}
        />
      ))}
    </View>
  );
}

// ─── Local product shape (for imported-but-not-yet-synced rows in demo mode) ─
interface LocalProduct {
  id: string;
  name: string;
  stock: number;
  priceWholesale: number;
  vendorId: string;
  _imported?: boolean;
}

export default function VendorDashboardScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('30j');
  const [shopActive, setShopActive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products'>('overview');

  // Products state (Supabase or local-imported in demo mode)
  const [supabaseProducts, setSupabaseProducts] = useState<LocalProduct[]>([]);
  const [importedProducts, setImportedProducts] = useState<LocalProduct[]>([]);

  // Loading states
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ─── Fetch products from Supabase on mount ─────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    const { data, error } = await supabase
      .from('products')
      .select('id, name_i18n, price_wholesale, stock_quantity')
      .eq('vendor_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return;
    setSupabaseProducts(
      (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name_i18n?.fr ?? p.name_i18n?.en ?? Object.values(p.name_i18n ?? {})[0] ?? '—',
        stock: p.stock_quantity ?? 0,
        priceWholesale: p.price_wholesale ?? 0,
        vendorId: user.id,
      })),
    );
  }, [user]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProducts();
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
  }, [fetchProducts]);

  // ─── Build the displayed products list ────────────────────────────────────
  const _vendorProds = MOCK_PRODUCTS.filter(p => p.vendorId === 'v1');
  const _vendorIds   = new Set(_vendorProds.map(p => p.id));
  const mockProducts = [..._vendorProds, ...MOCK_PRODUCTS.slice(0, 3).filter(p => !_vendorIds.has(p.id))];

  // In Supabase mode show real data; in demo mode merge mock + newly imported
  const displayedProducts: LocalProduct[] = isSupabaseConfigured
    ? supabaseProducts
    : [
        ...mockProducts.map(p => ({
          id: p.id, name: p.name, stock: p.stock,
          priceWholesale: p.priceWholesale, vendorId: p.vendorId,
        })),
        ...importedProducts,
      ];

  // ─── KPIs & chart ─────────────────────────────────────────────────────────
  const periodData: Record<Period, number[]> = {
    '7j': VENDOR_STATS.monthlySales.slice(-7),
    '30j': VENDOR_STATS.monthlySales,
    '90j': [...VENDOR_STATS.monthlySales, ...VENDOR_STATS.monthlySales.slice(0, 3)],
    '12m': VENDOR_STATS.monthlySales,
  };
  const kpis = [
    { icon: 'dollar-sign', label: t('sales'),         value: `$${(VENDOR_STATS.totalSales / 1000).toFixed(0)}k`, color: colors.primary },
    { icon: 'package',     label: t('active_orders'),  value: VENDOR_STATS.activeOrders,                          color: colors.secondary },
    { icon: 'message-circle', label: t('response_rate'), value: `${VENDOR_STATS.responseRate}%`,                  color: '#22C55E' },
    { icon: 'grid',        label: t('products'),       value: VENDOR_STATS.totalProducts,                         color: '#8B5CF6' },
    { icon: 'star',        label: t('rating'),         value: VENDOR_STATS.avgRating.toFixed(1),                  color: '#F59E0B' },
  ];

  const recentOrders = MOCK_ORDERS.slice(0, 4);

  // ─── IMPORT CSV ───────────────────────────────────────────────────────────
  const handleImportCSV = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values',
               'application/csv', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets?.[0]) return;

      const file = picked.assets[0];

      // Read content
      let content: string;
      try {
        content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {
        Alert.alert('Erreur', 'Impossible de lire le fichier. Vérifiez qu\'il est bien au format texte UTF-8.');
        return;
      }

      const { headers, rows } = parseCSV(content);

      if (rows.length === 0) {
        Alert.alert('Fichier vide', 'Le fichier CSV ne contient aucune ligne de données.');
        return;
      }

      // Validate required columns
      const required = ['name', 'price_public', 'stock_quantity'];
      const missing  = required.filter(c => !headers.includes(c));
      if (missing.length > 0) {
        Alert.alert(
          'Colonnes manquantes',
          `Colonnes requises introuvables : ${missing.join(', ')}\n\n` +
          `Colonnes détectées : ${headers.join(', ')}\n\n` +
          `Colonnes attendues : name, price_public, price_wholesale, stock_quantity, category, min_order_quantity`,
        );
        return;
      }

      setIsImporting(true);
      let imported = 0;
      const errors: string[] = [];
      const newLocal: LocalProduct[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row  = rows[i];
        const line = i + 2; // 1 = header row

        // Validate required fields
        const name       = row['name']?.trim();
        const rawPrice   = row['price_public']?.replace(/[^\d.]/g, '');
        const rawStock   = row['stock_quantity']?.replace(/[^\d]/g, '');
        const pricePublic = parseFloat(rawPrice);
        const stockQty    = parseInt(rawStock, 10);

        if (!name) {
          errors.push(`Ligne ${line} : colonne "name" vide`);
          continue;
        }
        if (isNaN(pricePublic) || pricePublic < 0) {
          errors.push(`Ligne ${line} : price_public invalide ("${row['price_public']}")`);
          continue;
        }
        if (isNaN(stockQty) || stockQty < 0) {
          errors.push(`Ligne ${line} : stock_quantity invalide ("${row['stock_quantity']}")`);
          continue;
        }

        const priceWholesale  = parseFloat(row['price_wholesale']?.replace(/[^\d.]/g, '') || '') || Math.round(pricePublic * 0.8 * 100) / 100;
        const minOrderQty     = parseInt(row['min_order_quantity'] || '1', 10) || 1;
        const category        = row['category']?.trim() || 'Général';

        if (isSupabaseConfigured && supabase && user) {
          const { error } = await supabase.from('products').insert({
            vendor_id:         user.id,
            name_i18n:         { fr: name },
            description_i18n:  { fr: '' },
            price_public:      pricePublic,
            price_wholesale:   priceWholesale,
            min_order_quantity: minOrderQty,
            stock_quantity:    stockQty,
            category,
            is_active:         true,
          });
          if (error) {
            errors.push(`Ligne ${line} : ${error.message}`);
            continue;
          }
        } else {
          // Demo mode — keep in local state
          newLocal.push({
            id: `imp-${Date.now()}-${i}`,
            name,
            stock: stockQty,
            priceWholesale,
            vendorId: 'v1',
            _imported: true,
          });
        }
        imported++;
      }

      // Persist locally (demo) or refresh from DB (Supabase)
      if (newLocal.length > 0) {
        setImportedProducts(prev => [...prev, ...newLocal]);
      }
      if (isSupabaseConfigured) {
        await fetchProducts();
      }

      // Navigate to Products tab so the user can see the result
      if (imported > 0) setActiveTab('products');

      // Build summary
      const summary = [
        `✅ ${imported} produit${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''} avec succès`,
        errors.length > 0
          ? `\n❌ ${errors.length} ligne${errors.length > 1 ? 's' : ''} en erreur :\n` +
            errors.slice(0, 6).join('\n') +
            (errors.length > 6 ? `\n… et ${errors.length - 6} autre(s)` : '')
          : '',
      ].filter(Boolean).join('');

      Alert.alert('Import terminé', summary);
    } catch (e: any) {
      Alert.alert('Erreur inattendue', e?.message ?? 'Veuillez réessayer.');
    } finally {
      setIsImporting(false);
    }
  };

  // ─── EXPORT CSV ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const STATUS_LABELS: Record<string, string> = {
        pending:          'En attente',
        pending_approval: 'En validation',
        approved:         'Approuvé',
        confirmed:        'Confirmé',
        shipped:          'Expédié',
        ready_for_delivery: 'Prêt',
        out_for_delivery: 'En livraison',
        completed:        'Livré',
        cancelled:        'Annulé',
      };

      const csvRows: string[][] = [
        ['Numéro commande', 'Date', 'Client', 'Statut', 'Total (FCFA)'],
      ];

      if (isSupabaseConfigured && supabase && user) {
        // Fetch orders; filter those whose items include at least one product
        // owned by this vendor.  We first fetch the vendor's product IDs, then
        // query orders that contain any of them via JSONB containment.
        const { data: prodIds } = await supabase
          .from('products')
          .select('id')
          .eq('vendor_id', user.id);

        const ids: string[] = (prodIds ?? []).map((p: any) => p.id);

        // Fetch recent orders (limit 500)
        const { data: orders, error } = await supabase
          .from('orders')
          .select('order_number, created_at, customer_id, status, total, items')
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;

        // Client-side filter: keep orders that contain at least one of our products
        const vendorOrders = (orders ?? []).filter((o: any) => {
          const items = Array.isArray(o.items) ? o.items : [];
          return ids.length === 0
            ? true // no products yet → export everything
            : items.some((it: any) =>
                ids.includes(it.product_id) || it.vendor_id === user.id,
              );
        });

        for (const o of vendorOrders) {
          const date = o.created_at
            ? new Date(o.created_at).toLocaleDateString('fr-FR')
            : '—';
          csvRows.push([
            o.order_number ?? '',
            date,
            o.customer_id ? `Client ${String(o.customer_id).slice(0, 8)}` : '—',
            STATUS_LABELS[o.status] ?? o.status ?? '—',
            String(o.total ?? 0),
          ]);
        }

        if (csvRows.length === 1) {
          Alert.alert(
            'Aucune commande',
            'Vous n\'avez pas encore de commandes à exporter.',
          );
          return;
        }
      } else {
        // Demo mode — export mock orders
        for (const o of MOCK_ORDERS) {
          csvRows.push([
            o.orderNumber,
            o.date,
            'Client démo',
            STATUS_LABELS[o.status] ?? o.status,
            String(o.total),
          ]);
        }
      }

      // Build CSV string (BOM for Excel UTF-8 detection)
      const csvContent =
        '\uFEFF' +
        csvRows.map(row => row.map(escapeCSV).join(',')).join('\n');

      // Write to local filesystem
      const today    = new Date().toISOString().slice(0, 10);
      const fileName = `bardec-commandes-${today}.csv`;
      const fileUri  = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '') + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share via native sheet
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType:    'text/csv',
          dialogTitle: 'Exporter les commandes BARDEC',
          UTI:         'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(
          'Fichier enregistré',
          `Le fichier ${fileName} a été enregistré dans le stockage de l\'application.\n\n${csvRows.length - 1} commande(s) exportée(s).`,
        );
      }
    } catch (e: any) {
      Alert.alert('Erreur', `Impossible d\'exporter : ${e?.message ?? 'Erreur inconnue'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
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

      {/* ── Overview tab ─────────────────────────────────────────────────── */}
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

          {/* Proximity orders banner */}
          <TouchableOpacity
            style={[styles.proximityBanner, { backgroundColor: '#F0FDF4', borderColor: '#22C55E' }]}
            onPress={() => router.push('/proximity/my-shop/orders')}
          >
            <View style={[styles.proximityIconBox, { backgroundColor: '#22C55E' }]}>
              <Feather name="map-pin" size={20} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.proximityTitle, { color: '#166534' }]}>Commandes de proximité</Text>
              <Text style={[styles.proximityDesc, { color: '#16a34a' }]}>Voir et gérer les commandes de votre boutique locale</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#22C55E" />
          </TouchableOpacity>

          {/* Quick actions */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actions rapides</Text>
          <View style={styles.actionsGrid}>
            {/* Ajouter produit */}
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border }]}
              onPress={() => setActiveTab('products')}
            >
              <Feather name="plus-circle" size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Ajouter produit</Text>
            </TouchableOpacity>

            {/* Importer CSV */}
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border, opacity: isImporting ? 0.6 : 1 }]}
              onPress={handleImportCSV}
              disabled={isImporting}
            >
              {isImporting
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="upload" size={22} color={colors.primary} />}
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>
                {isImporting ? 'Import en cours…' : 'Importer CSV'}
              </Text>
            </TouchableOpacity>

            {/* Exporter */}
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border, opacity: isExporting ? 0.6 : 1 }]}
              onPress={handleExport}
              disabled={isExporting}
            >
              {isExporting
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="download" size={22} color={colors.primary} />}
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>
                {isExporting ? 'Export en cours…' : 'Exporter'}
              </Text>
            </TouchableOpacity>

            {/* Commandes locales */}
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.accent, borderColor: colors.border }]}
              onPress={() => router.push('/proximity/my-shop/orders')}
            >
              <Feather name="map-pin" size={22} color="#22C55E" />
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Commandes locales</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Orders tab ───────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Commandes récentes</Text>
          {recentOrders.map(order => (
            <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderNum,  { color: colors.foreground }]}>{order.orderNumber}</Text>
                <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{order.date}</Text>
              </View>
              <View style={styles.orderMeta}>
                <Text style={[styles.orderTotal, { color: colors.primary }]}>${order.total.toLocaleString()}</Text>
                <View style={[styles.statusDot, {
                  backgroundColor:
                    order.status === 'completed' ? '#22C55E' :
                    order.status === 'shipped'   ? '#0EA5E9' : '#F59E0B',
                }]} />
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

      {/* ── Products tab ─────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <View style={styles.section}>
          <View style={styles.productsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Mes produits{displayedProducts.length > 0 ? ` (${displayedProducts.length})` : ''}
            </Text>
            <TouchableOpacity style={[styles.addProductBtn, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={16} color="white" />
              <Text style={styles.addProductText}>Ajouter</Text>
            </TouchableOpacity>
          </View>

          {displayedProducts.length === 0 && (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Feather name="inbox" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun produit</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                Ajoutez votre premier produit ou importez un catalogue CSV depuis l'onglet Vue d'ensemble.
              </Text>
            </View>
          )}

          {displayedProducts.map(product => (
            <View key={product.id} style={[styles.productRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.productIcon, { backgroundColor: product._imported ? '#DCFCE7' : colors.muted }]}>
                <Feather
                  name={product._imported ? 'check' : 'package'}
                  size={18}
                  color={product._imported ? '#16A34A' : colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
                <Text style={[styles.productMeta, { color: colors.mutedForeground }]}>
                  Stock : {product.stock} · {product.priceWholesale.toLocaleString('fr-FR')} FCFA/u
                  {product._imported ? ' · Importé' : ''}
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
  shopHeader:       { padding: 20, gap: 16 },
  shopInfo:         { flexDirection: 'row', alignItems: 'center', gap: 14 },
  shopAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  shopAvatarText:  { color: 'white', fontSize: 22, fontWeight: '800' },
  shopNameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shopName:        { color: 'white', fontSize: 18, fontWeight: '800' },
  shopEmail:       { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  verifiedText:    { color: 'white', fontSize: 11, fontWeight: '700' },
  shopToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  shopToggleLabel: { color: 'white', fontSize: 14, fontWeight: '600' },
  kpiScroll:       { paddingVertical: 16 },
  kpiCard: {
    width: 110, padding: 14, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', gap: 6,
    shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  kpiIcon:         { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  kpiValue:        { fontSize: 18, fontWeight: '800' },
  kpiLabel:        { fontSize: 11, textAlign: 'center' },
  tabRow:          { flexDirection: 'row', borderBottomWidth: 1, marginHorizontal: 16, marginBottom: 16 },
  tabBtn:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:         { fontSize: 14, fontWeight: '600' },
  section:         { paddingHorizontal: 16, gap: 12 },
  sectionTitle:    { fontSize: 17, fontWeight: '700' },
  chartCard:       { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  chartHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodRow:       { flexDirection: 'row', gap: 4 },
  periodBtn:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  periodBtnText:   { fontSize: 12, fontWeight: '600' },
  chartFooter:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartTotal:      { fontSize: 22, fontWeight: '800' },
  chartChange:     { fontSize: 14, fontWeight: '600' },
  actionsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: (width - 52) / 2, borderRadius: 14, borderWidth: 1,
    padding: 16, alignItems: 'center', gap: 8,
  },
  actionLabel:     { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  proximityBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  proximityIconBox:{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  proximityTitle:  { fontSize: 14, fontWeight: '700' },
  proximityDesc:   { fontSize: 12, marginTop: 2, lineHeight: 16 },
  orderRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  orderNum:        { fontSize: 13, fontWeight: '600' },
  orderDate:       { fontSize: 11, marginTop: 2 },
  orderMeta:       { alignItems: 'flex-end', gap: 4 },
  orderTotal:      { fontSize: 14, fontWeight: '700' },
  statusDot:       { width: 8, height: 8, borderRadius: 4 },
  orderAction:     { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  viewAllBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  viewAllText:     { fontSize: 14, fontWeight: '600' },
  productsHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addProductBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  addProductText:  { color: 'white', fontSize: 13, fontWeight: '700' },
  productRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, gap: 12 },
  productIcon:     { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  productName:     { fontSize: 13, fontWeight: '600' },
  productMeta:     { fontSize: 12, marginTop: 2 },
  productActions:  { flexDirection: 'row', gap: 8 },
  prodActionBtn:   { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  emptyState: {
    alignItems: 'center', padding: 32, borderRadius: 16,
    borderWidth: 1, borderStyle: 'dashed', gap: 10, marginTop: 8,
  },
  emptyTitle:      { fontSize: 16, fontWeight: '700' },
  emptyDesc:       { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
