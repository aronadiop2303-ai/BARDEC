import React, { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, Switch,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
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
  pricePublic: number;
  priceWholesale: number;
  category: string;
  images: string[];
  vendorId: string;
  _imported?: boolean;
}

export default function VendorDashboardScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user, isDemoMode } = useAuth();
  const [period, setPeriod] = useState<Period>('30j');
  const [shopActive, setShopActive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products'>('overview');

  // ─── Resolved company/shop display name ───────────────────────────────────
  const [shopName, setShopName] = useState<string>('Ma Boutique');

  useEffect(() => {
    async function resolveShopName() {
      if (!isSupabaseConfigured || !supabase || !user?.company) return;
      // user.company holds the company UUID (company_id); look up the display name
      const { data } = await supabase
        .from('companies')
        .select('name')
        .eq('id', user.company)
        .single();
      if (data?.name) setShopName(data.name);
    }
    resolveShopName();
  }, [user?.company]);

  // Products state (Supabase or local-imported in demo mode)
  const [supabaseProducts, setSupabaseProducts] = useState<LocalProduct[]>([]);
  const [importedProducts, setImportedProducts] = useState<LocalProduct[]>([]);

  // Loading states
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ─── Vendor orders (real Supabase data) ────────────────────────────────────
  const [vendorOrders,   setVendorOrders]   = useState<any[]>([]);
  const [ordersLoading,  setOrdersLoading]  = useState(false);

  // ─── Order status update modal ─────────────────────────────────────────────
  const [statusOrder,     setStatusOrder]     = useState<any | null>(null);
  const [newStatus,       setNewStatus]       = useState('');
  const [trackingNumber,  setTrackingNumber]  = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // ─── Product images for add-product modal ──────────────────────────────────
  const [pendingImages,      setPendingImages]      = useState<string[]>([]);
  const [isUploadingImages,  setIsUploadingImages]  = useState(false);

  const ORDER_STATUSES = [
    { value: 'pending',          label: 'En attente' },
    { value: 'approved',         label: 'Approuvé' },
    { value: 'shipped',          label: 'Expédié' },
    { value: 'out_for_delivery', label: 'En livraison' },
    { value: 'completed',        label: 'Livré' },
    { value: 'cancelled',        label: 'Annulé' },
  ];

  // ─── Add / Edit product modal ─────────────────────────────────────────────
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [editingProduct,  setEditingProduct]  = useState<LocalProduct | null>(null);
  const [addForm, setAddForm] = useState({
    name: '', category: 'Général',
    pricePublic: '', priceWholesale: '', stock: '',
  });

  function openAddModal() {
    setEditingProduct(null);
    setAddForm({ name: '', category: 'Général', pricePublic: '', priceWholesale: '', stock: '' });
    setPendingImages([]);
    setShowAddModal(true);
  }

  function openEditModal(product: LocalProduct) {
    setEditingProduct(product);
    setAddForm({
      name:          product.name,
      category:      product.category ?? 'Général',
      pricePublic:   product.pricePublic ? String(product.pricePublic) : '',
      priceWholesale: product.priceWholesale ? String(product.priceWholesale) : '',
      stock:         String(product.stock ?? ''),
    });
    setPendingImages([]);
    setShowAddModal(true);
  }

  function handleDeleteProduct(product: LocalProduct) {
    Alert.alert(
      'Supprimer le produit',
      `Supprimer "${product.name}" définitivement ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (isSupabaseConfigured && supabase && !product._imported) {
              const { error } = await supabase.from('products').delete().eq('id', product.id);
              if (error) { Alert.alert('Erreur', error.message); return; }
            }
            setSupabaseProducts(prev => prev.filter(p => p.id !== product.id));
            setImportedProducts(prev => prev.filter(p => p.id !== product.id));
          },
        },
      ],
    );
  }

  async function handleAddProduct() {
    const name = addForm.name.trim();
    if (!name) { Alert.alert('Erreur', 'Le nom du produit est requis.'); return; }
    const pricePublic = parseFloat(addForm.pricePublic.replace(',', '.'));
    if (isNaN(pricePublic) || pricePublic < 0) {
      Alert.alert('Erreur', 'Prix public invalide.'); return;
    }
    const priceWholesale =
      parseFloat(addForm.priceWholesale.replace(',', '.')) ||
      Math.round(pricePublic * 0.8 * 100) / 100;
    const stock = parseInt(addForm.stock, 10) || 0;

    setIsSavingProduct(true);
    if (isSupabaseConfigured && supabase && user) {
      // Always use the real Supabase auth UUID — never user.id from context,
      // which can be a demo placeholder ("u4") when the role switcher is active.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const realVendorId = authUser?.id;
      if (!realVendorId) {
        setIsSavingProduct(false);
        Alert.alert('Erreur', 'Session expirée. Reconnecte-toi et réessaie.');
        return;
      }

      // Upload product images first.
      // fetch(uri).blob() is unreliable in Expo for local file URIs — use
      // FileSystem.readAsStringAsync (base64) → Uint8Array instead.
      const imageUrls: string[] = [];
      const failedUploads: number[] = [];
      if (pendingImages.length > 0) {
        setIsUploadingImages(true);
        for (let imgIdx = 0; imgIdx < pendingImages.length; imgIdx++) {
          const uri = pendingImages[imgIdx];
          try {
            const filename = `${realVendorId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

            // Read as base64, decode to binary Uint8Array
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            console.log(`[ProductImg ${imgIdx + 1}/${pendingImages.length}] Uploading → ${filename}`);
            const { data: upData, error: upErr } = await supabase.storage
              .from('products')
              .upload(filename, bytes, { contentType: 'image/jpeg', upsert: true });

            if (upErr) {
              console.error(`[ProductImg ${imgIdx + 1}] Upload error:`, upErr);
              failedUploads.push(imgIdx + 1);
            } else if (upData) {
              const { data: { publicUrl } } = supabase.storage
                .from('products')
                .getPublicUrl(upData.path);
              console.log(`[ProductImg ${imgIdx + 1}] Public URL:`, publicUrl);
              imageUrls.push(publicUrl);
            }
          } catch (err: any) {
            console.error(`[ProductImg ${imgIdx + 1}] Exception:`, err);
            failedUploads.push(imgIdx + 1);
          }
        }
        setIsUploadingImages(false);

        if (failedUploads.length > 0) {
          Alert.alert(
            'Photos partiellement uploadées',
            `${imageUrls.length} photo(s) enregistrée(s) avec succès.\n` +
            `${failedUploads.length} photo(s) ont échoué (photo${failedUploads.join(', ')}) et ne seront pas incluses.\n\n` +
            `Le produit sera quand même enregistré.`,
          );
        }
      }

      const category = addForm.category || 'Général';

      if (editingProduct) {
        // ── UPDATE ────────────────────────────────────────────────────────────
        const updatedImages = imageUrls.length > 0
          ? [...(editingProduct.images ?? []), ...imageUrls]
          : (editingProduct.images ?? []);
        const { error } = await supabase.from('products').update({
          name_i18n:       { fr: name },
          price_public:    pricePublic,
          price_wholesale: priceWholesale,
          stock_quantity:  stock,
          category,
          ...(imageUrls.length > 0 ? { images: updatedImages } : {}),
        }).eq('id', editingProduct.id);
        setIsSavingProduct(false);
        if (error) { Alert.alert('Erreur Supabase', error.message); return; }
        setPendingImages([]);
        // Optimistic update
        setSupabaseProducts(prev => prev.map(p =>
          p.id === editingProduct.id
            ? { ...p, name, stock, pricePublic, priceWholesale, category, images: updatedImages }
            : p,
        ));
        setEditingProduct(null);
      } else {
        // ── INSERT ────────────────────────────────────────────────────────────
        const { data: insertedRows, error } = await supabase.from('products').insert({
          vendor_id:          realVendorId,
          name_i18n:          { fr: name },
          description_i18n:   { fr: '' },
          price_public:       pricePublic,
          price_wholesale:    priceWholesale,
          min_order_quantity: 1,
          stock_quantity:     stock,
          category,
          images:             imageUrls,
          is_active:          true,
        }).select('id').single();
        setIsSavingProduct(false);
        if (error) { Alert.alert('Erreur Supabase', error.message); return; }
        setPendingImages([]);
        // Optimistic update — product appears immediately even if SELECT is blocked
        const newLocalProduct: LocalProduct = {
          id:            insertedRows?.id ?? `opt-${Date.now()}`,
          name,
          stock,
          pricePublic,
          priceWholesale,
          category,
          images:        imageUrls,
          vendorId:      realVendorId,
        };
        setSupabaseProducts(prev => [newLocalProduct, ...prev]);
        fetchProducts().catch(() => {});
      }
    } else {
      // Demo mode — append to local state
      setImportedProducts(prev => [...prev, {
        id:            `add-${Date.now()}`,
        name,
        stock,
        pricePublic,
        priceWholesale,
        category:      addForm.category || 'Général',
        images:        [],
        vendorId:      'v1',
        _imported:     true,
      }]);
      setIsSavingProduct(false);
    }
    setShowAddModal(false);
    setActiveTab('products');
  }

  // ─── Fetch products from Supabase ─────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    // Use the real Supabase auth UUID — user.id from context can be a demo
    // placeholder that doesn't match the vendor_id stored in the DB.
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const vendorId = authUser?.id;
    if (!vendorId) return;
    const { data, error } = await supabase
      .from('products')
      .select('id, name_i18n, price_public, price_wholesale, stock_quantity, category, images')
      .eq('vendor_id', vendorId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return;
    setSupabaseProducts(
      (data ?? []).map((p: any) => ({
        id:            p.id,
        name:          p.name_i18n?.fr ?? p.name_i18n?.en ?? Object.values(p.name_i18n ?? {})[0] ?? '—',
        stock:         p.stock_quantity ?? 0,
        pricePublic:   p.price_public ?? 0,
        priceWholesale: p.price_wholesale ?? 0,
        category:      p.category ?? 'Général',
        images:        p.images ?? [],
        vendorId,
      })),
    );
  }, []);

  // ─── Fetch vendor orders from Supabase ─────────────────────────────────────
  const fetchVendorOrders = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    setOrdersLoading(true);
    // Get this vendor's product IDs
    const { data: prods } = await supabase
      .from('products')
      .select('id')
      .eq('vendor_id', user.id);
    const productIds = (prods ?? []).map((p: any) => p.id);
    if (productIds.length === 0) { setOrdersLoading(false); return; }

    // Fetch recent orders and filter by those containing vendor's products
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    const filtered = (orders ?? []).filter((o: any) => {
      const items = Array.isArray(o.items) ? o.items : [];
      return items.some((item: any) => productIds.includes(item.product_id));
    });
    setVendorOrders(filtered);
    setOrdersLoading(false);
  }, [user]);

  // ─── Update order status ───────────────────────────────────────────────────
  async function handleUpdateOrderStatus() {
    if (!statusOrder || !newStatus) return;
    setIsUpdatingStatus(true);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus, tracking_number: trackingNumber || null })
        .eq('id', statusOrder.id);
      setIsUpdatingStatus(false);
      if (error) { Alert.alert('Erreur', error.message); return; }
      setVendorOrders(prev =>
        prev.map(o => o.id === statusOrder.id
          ? { ...o, status: newStatus, tracking_number: trackingNumber || o.tracking_number }
          : o
        )
      );
    } else {
      setIsUpdatingStatus(false);
    }
    setStatusOrder(null);
    setNewStatus('');
    setTrackingNumber('');
  }

  // ─── Pick product images ───────────────────────────────────────────────────
  async function handlePickProductImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'L\'accès à la galerie est nécessaire.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    setPendingImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
  }

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchVendorOrders(); }, [fetchVendorOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProducts(), fetchVendorOrders()]);
    await new Promise(r => setTimeout(r, 300));
    setRefreshing(false);
  }, [fetchProducts, fetchVendorOrders]);

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
          pricePublic: p.priceWholesale,
          priceWholesale: p.priceWholesale,
          category: 'Général',
          images: p.images ?? [],
          vendorId: p.vendorId,
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

  // Use real Supabase orders when available, fall back to mock for demo
  const recentOrders = vendorOrders.length > 0 ? vendorOrders : MOCK_ORDERS.slice(0, 4);

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

      // Resolve the real Supabase auth UUID once before the loop.
      // user.id from context can be a demo placeholder ("u4") when the role
      // switcher is active; supabase.auth.getUser() always returns the real UUID.
      let realVendorIdForImport: string | null = null;
      if (isSupabaseConfigured && supabase) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        realVendorIdForImport = authUser?.id ?? null;
      }

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

        if (isSupabaseConfigured && supabase && realVendorIdForImport) {
          const { error } = await supabase.from('products').insert({
            vendor_id:         realVendorIdForImport,
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
            id:            `imp-${Date.now()}-${i}`,
            name,
            stock:         stockQty,
            pricePublic:   pricePublic,
            priceWholesale,
            category,
            images:        [],
            vendorId:      'v1',
            _imported:     true,
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

  // ─── Vendor OMNI context ─────────────────────────────────────────────────
  const omniContext = React.useMemo(() => ({
    type: 'shop' as const,
    data: {
      vendor_id: user?.id ?? null,
      shop_name: shopName,
    },
  }), [user?.id, shopName]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <BardecLayout onRefresh={onRefresh} refreshing={refreshing} omniContext={omniContext}>
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
              onPress={openAddModal}
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
          {ordersLoading ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
          ) : recentOrders.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
              <Feather name="inbox" size={36} color={colors.muted} />
              <Text style={{ color: colors.mutedForeground }}>Aucune commande reçue</Text>
            </View>
          ) : recentOrders.map(order => {
            const orderNum  = order.orderNumber ?? order.order_number ?? order.id;
            const orderDate = order.date
              ?? (order.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : '—');
            const orderTotal = order.total ?? 0;
            const orderStatus = order.status ?? 'pending';
            const statusColor =
              orderStatus === 'completed' ? '#22C55E' :
              orderStatus === 'shipped'   ? '#0EA5E9' :
              orderStatus === 'cancelled' ? '#EF4444' : '#F59E0B';
            return (
              <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderNum,  { color: colors.foreground }]}>{orderNum}</Text>
                  <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{orderDate}</Text>
                </View>
                <View style={styles.orderMeta}>
                  <Text style={[styles.orderTotal, { color: colors.primary }]}>{orderTotal.toLocaleString()} FCFA</Text>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                </View>
                {/* Vendor action: update status */}
                <TouchableOpacity
                  style={[styles.orderAction, { borderColor: colors.primary }]}
                  onPress={() => { setStatusOrder(order); setNewStatus(orderStatus); setTrackingNumber(order.tracking_number ?? ''); }}
                >
                  <Feather name="edit-2" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity style={[styles.viewAllBtn, { borderColor: colors.border }]} onPress={() => router.push('/(tabs)/orders' as any)}>
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
            <TouchableOpacity
              style={[styles.addProductBtn, { backgroundColor: colors.primary }]}
              onPress={openAddModal}
            >
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
              {/* Thumbnail — real image if available, package icon otherwise */}
              <View style={[styles.productIcon, { backgroundColor: colors.muted, overflow: 'hidden' }]}>
                {product.images?.[0] ? (
                  <Image
                    source={{ uri: product.images[0] }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Feather
                    name={product._imported ? 'check' : 'package'}
                    size={18}
                    color={product._imported ? '#16A34A' : colors.mutedForeground}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
                <Text style={[styles.productMeta, { color: colors.mutedForeground }]}>
                  Stock : {product.stock} · {product.priceWholesale.toLocaleString('fr-FR')} FCFA/u
                  {product._imported ? ' · Importé' : ''}
                </Text>
              </View>
              <View style={styles.productActions}>
                <TouchableOpacity
                  style={styles.prodActionBtn}
                  onPress={() => openEditModal(product)}
                >
                  <Feather name="edit-2" size={15} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.prodActionBtn}
                  onPress={() => handleDeleteProduct(product)}
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
      {/* ── Add product modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setEditingProduct(null); }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Form */}
            {[
              { key: 'name',           label: 'Nom du produit *',      placeholder: 'Ex: Riz parfumé 25 kg',   keyboard: 'default'  as const },
              { key: 'category',       label: 'Catégorie',             placeholder: 'Ex: Alimentation',         keyboard: 'default'  as const },
              { key: 'pricePublic',    label: 'Prix public (FCFA) *',  placeholder: 'Ex: 12000',               keyboard: 'numeric'  as const },
              { key: 'priceWholesale', label: 'Prix gros (FCFA)',      placeholder: 'Auto = 80 % du prix public', keyboard: 'numeric' as const },
              { key: 'stock',          label: 'Stock (unités)',         placeholder: 'Ex: 100',                 keyboard: 'number-pad' as const },
            ].map(f => (
              <View key={f.key} style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>{f.label}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={(addForm as any)[f.key]}
                  onChangeText={v => setAddForm(prev => ({ ...prev, [f.key]: v }))}
                  keyboardType={f.keyboard}
                />
              </View>
            ))}

            {/* Product images picker */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.foreground }]}>Photos du produit</Text>
              <TouchableOpacity
                style={[styles.imagePicker, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={handlePickProductImages}
              >
                <Feather name="camera" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                  {pendingImages.length > 0 ? `${pendingImages.length} photo(s) sélectionnée(s)` : 'Ajouter des photos'}
                </Text>
              </TouchableOpacity>
              {pendingImages.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {pendingImages.map((uri, idx) => (
                    <View key={idx} style={{ position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                      <TouchableOpacity
                        style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}
                        onPress={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <Feather name="x" size={10} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: (isSavingProduct || isUploadingImages) ? 0.7 : 1 }]}
              onPress={handleAddProduct}
              disabled={isSavingProduct || isUploadingImages}
            >
              {(isSavingProduct || isUploadingImages)
                ? <ActivityIndicator size="small" color="white" />
                : <Feather name="check" size={18} color="white" />}
              <Text style={styles.modalSaveTxt}>
                {isUploadingImages ? 'Upload photos…'
                  : isSavingProduct ? 'Enregistrement…'
                  : editingProduct ? 'Modifier le produit'
                  : 'Enregistrer le produit'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Order status update modal ───────────────────────────────────────── */}
      <Modal
        visible={!!statusOrder}
        animationType="slide"
        transparent
        onRequestClose={() => setStatusOrder(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Mettre à jour le statut</Text>
              <TouchableOpacity onPress={() => setStatusOrder(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>Commande</Text>
            <Text style={[styles.orderNum, { color: colors.primary, marginBottom: 12 }]}>
              {statusOrder?.orderNumber ?? statusOrder?.order_number ?? statusOrder?.id}
            </Text>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>Nouveau statut</Text>
            <View style={{ gap: 8, marginBottom: 12 }}>
              {ORDER_STATUSES.map(s => (
                <TouchableOpacity
                  key={s.value}
                  style={[
                    styles.statusChoice,
                    {
                      backgroundColor: newStatus === s.value ? colors.primary + '20' : colors.background,
                      borderColor:     newStatus === s.value ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setNewStatus(s.value)}
                >
                  <View style={[
                    styles.statusChoiceRadio,
                    { borderColor: colors.primary, backgroundColor: newStatus === s.value ? colors.primary : 'transparent' }
                  ]} />
                  <Text style={[{ color: colors.foreground, fontWeight: '600', fontSize: 14 }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>Numéro de suivi (optionnel)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: DHL123456789"
              placeholderTextColor={colors.mutedForeground}
              value={trackingNumber}
              onChangeText={setTrackingNumber}
            />

            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: isUpdatingStatus ? 0.7 : 1 }]}
              onPress={handleUpdateOrderStatus}
              disabled={isUpdatingStatus || !newStatus}
            >
              {isUpdatingStatus
                ? <ActivityIndicator size="small" color="white" />
                : <Feather name="check" size={18} color="white" />}
              <Text style={styles.modalSaveTxt}>
                {isUpdatingStatus ? 'Mise à jour…' : 'Confirmer'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  imagePicker: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
    padding: 14,
  },
  statusChoice: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  statusChoiceRadio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
  },

  // Add product modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 14 },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  modalField:    { gap: 5 },
  modalLabel:    { fontSize: 13, fontWeight: '600' },
  modalInput:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  modalSaveBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  modalSaveTxt:  { color: 'white', fontSize: 16, fontWeight: '700' },
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
