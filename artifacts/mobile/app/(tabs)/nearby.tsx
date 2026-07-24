import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import { useProximityShops } from '@/hooks/useProximityShops';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  PROXIMITY_CATEGORIES,
  ProximityCategory,
  ProximityShop,
} from '@/constants/proximityData';
import ProximityMap from '@/components/proximity/ProximityMap';
import ShopBottomSheet from '@/components/proximity/ShopBottomSheet';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useMyProximityShop } from '@/hooks/useMyProximityShop';

const GREEN = '#22C55E';
const TAB_H = Platform.OS === 'android' ? 62 : Platform.OS === 'web' ? 84 : 60;
const SCREEN_H = Dimensions.get('window').height;

// Wrap with a per-screen ErrorBoundary so a crash in ProximityMap or the
// location hooks shows an actionable error UI instead of a blank white screen.
export default function NearbyScreen() {
  return (
    <ErrorBoundary>
      <NearbyScreenInner />
    </ErrorBoundary>
  );
}

function NearbyScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + TAB_H;

  const [permStatus, setPermStatus] = useState<'loading' | 'granted' | 'denied'>('loading');
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedCat, setSelectedCat] = useState<ProximityCategory | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedShop, setSelectedShop] = useState<ProximityShop | null>(null);

  const { shop: myShop } = useMyProximityShop();

  const { data: shops = [], isLoading } = useProximityShops({
    lat: userLoc?.lat ?? null,
    lng: userLoc?.lng ?? null,
    category: selectedCat,
  });

  useEffect(() => { init(); }, []);

  async function init() {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      setPermStatus('granted');
      fetchLoc();
    } else {
      setPermStatus('denied');
    }
  }

  async function requestPerm() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setPermStatus('granted');
      fetchLoc();
    } else {
      setPermStatus('denied');
    }
  }

  async function fetchLoc() {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setUserLoc({ lat: 14.6937, lng: -17.4441 }); // Dakar fallback
    }
  }

  const handleMarkerPress = useCallback((shopId: string) => {
    const found = shops.find(s => s.id === shopId);
    if (found) setSelectedShop(found);
  }, [shops]);

  const headerH = topPad + 52;
  const chipsH = 52;
  const mapHeight = Math.max(200, SCREEN_H - headerH - chipsH - bottomPad);

  // ── Permission denied ──────────────────────────────────────────────────────
  if (permStatus === 'denied') {
    return (
      <View style={[styles.permScreen, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={[styles.permIcon, { backgroundColor: GREEN + '18' }]}>
          <Feather name="map-pin" size={40} color={GREEN} />
        </View>
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Géolocalisation requise</Text>
        <Text style={[styles.permDesc, { color: colors.mutedForeground }]}>
          Autorise l'accès à ta position pour découvrir les commerces autour de toi.
        </Text>
        <TouchableOpacity style={[styles.permBtn, { backgroundColor: GREEN }]} onPress={requestPerm}>
          <Feather name="map-pin" size={16} color="white" />
          <Text style={styles.permBtnText}>Autoriser la géolocalisation</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shopOwnerBtn, { borderColor: GREEN }]}
          onPress={() => router.push('/proximity/register-shop' as any)}
        >
          <Feather name="store" size={16} color={GREEN} />
          <Text style={[styles.shopOwnerBtnText, { color: GREEN }]}>Ouvrir ma boutique</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Loading loc ────────────────────────────────────────────────────────────
  if (permStatus === 'loading' || (permStatus === 'granted' && !userLoc)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={GREEN} size="large" />
        <Text style={[styles.loadingTxt, { color: colors.mutedForeground }]}>Localisation…</Text>
      </View>
    );
  }

  const mapCenter = userLoc!;

  // ── Main screen ────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.headerLeft}>
          <Feather name="map-pin" size={18} color={GREEN} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Près de moi</Text>
          {shops.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: GREEN }]}>
              <Text style={styles.countText}>{shops.length}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {/* My shop */}
          <TouchableOpacity
            style={[styles.myShopBtn, { backgroundColor: GREEN + '18', borderColor: GREEN + '40' }]}
            onPress={() => router.push('/proximity/my-shop' as any)}
          >
            <Feather name="store" size={14} color={GREEN} />
            <Text style={[styles.myShopBtnText, { color: GREEN }]}>
              {myShop ? 'Ma boutique' : 'Ouvrir'}
            </Text>
          </TouchableOpacity>
          {/* Map/List toggle */}
          <TouchableOpacity
            style={[styles.toggleBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setViewMode(v => v === 'map' ? 'list' : 'map')}
          >
            <Feather name={viewMode === 'map' ? 'list' : 'map-pin'} size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipsBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.chipsContent}
      >
        <TouchableOpacity
          style={[styles.chip, { backgroundColor: selectedCat === null ? GREEN : colors.muted, borderColor: selectedCat === null ? GREEN : colors.border }]}
          onPress={() => setSelectedCat(null)}
        >
          <Text style={[styles.chipTxt, { color: selectedCat === null ? 'white' : colors.foreground }]}>Tous</Text>
        </TouchableOpacity>
        {PROXIMITY_CATEGORIES.map(cat => {
          const active = selectedCat === cat;
          const cc = CATEGORY_COLORS[cat];
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, { backgroundColor: active ? cc : colors.muted, borderColor: active ? cc : colors.border }]}
              onPress={() => setSelectedCat(active ? null : cat)}
            >
              <Feather name={CATEGORY_ICONS[cat] as any} size={11} color={active ? 'white' : colors.mutedForeground} />
              <Text style={[styles.chipTxt, { color: active ? 'white' : colors.foreground }]} numberOfLines={1}>
                {cat.split(' & ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Map view */}
      {viewMode === 'map' && (
        <View style={{ flex: 1 }}>
          {isLoading && shops.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={GREEN} />
            </View>
          ) : (
            <ProximityMap
              center={mapCenter}
              markers={shops}
              userLocation={userLoc ?? undefined}
              onMarkerPress={handleMarkerPress}
              height={mapHeight}
            />
          )}
        </View>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <FlatList
          data={shops}
          keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad + 16, paddingHorizontal: 16, paddingTop: 12 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {isLoading
                ? <ActivityIndicator color={GREEN} />
                : <>
                    <Feather name="map-pin" size={40} color={colors.mutedForeground} />
                    <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
                      Aucun commerce trouvé dans ce rayon.
                    </Text>
                  </>
              }
            </View>
          }
          renderItem={({ item }) => (
            <ShopListRow shop={item} colors={colors} onPress={() => setSelectedShop(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        />
      )}

      {/* Bottom sheet */}
      <ShopBottomSheet
        shop={selectedShop}
        visible={!!selectedShop}
        onClose={() => setSelectedShop(null)}
      />
    </View>
  );
}

function ShopListRow({ shop, colors, onPress }: { shop: ProximityShop; colors: any; onPress: () => void }) {
  const cc = CATEGORY_COLORS[shop.category] ?? '#1A56DB';
  return (
    <TouchableOpacity style={styles.listRow} onPress={onPress} activeOpacity={0.7}>
      {/* Category dot */}
      <View style={[styles.listDot, { backgroundColor: cc }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.listName, { color: colors.foreground }]} numberOfLines={1}>{shop.name}</Text>
        <Text style={[styles.listSub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {shop.subcategory ?? shop.category}
        </Text>
      </View>
      <View style={styles.listMeta}>
        {shop.distance_km != null && (
          <Text style={[styles.listDist, { color: GREEN }]}>{shop.distance_km.toFixed(1)} km</Text>
        )}
        <Text style={{ color: '#F59E0B', fontSize: 12 }}>{'★'.repeat(Math.round(shop.rating))}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  permScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  permIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  permTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  permDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, width: '100%', justifyContent: 'center' },
  permBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  shopOwnerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, width: '100%', justifyContent: 'center', borderWidth: 1.5 },
  shopOwnerBtnText: { fontSize: 15, fontWeight: '700' },
  loadingTxt: { fontSize: 14, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  countBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  countText: { color: 'white', fontSize: 10, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myShopBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  myShopBtnText: { fontSize: 12, fontWeight: '700' },
  toggleBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  chipsBar: { maxHeight: 52, borderBottomWidth: 1 },
  chipsContent: { paddingHorizontal: 14, paddingVertical: 9, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipTxt: { fontSize: 12, fontWeight: '600' },
  emptyState: { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyTxt: { fontSize: 15, textAlign: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  listDot: { width: 10, height: 10, borderRadius: 5 },
  listName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  listSub: { fontSize: 12 },
  listMeta: { alignItems: 'flex-end', gap: 2 },
  listDist: { fontSize: 12, fontWeight: '700' },
});
