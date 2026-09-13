import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Chantier 2 — Espace Partenaire / "Suivi de flotte en temps réel".
// Lecture défensive de `delivery_partners` (SELECT *) — en cas d'erreur RLS
// ou de table absente, on affiche un état vide propre. "En pause" est un état
// simulé (champ notes contenant 'pause'). La "carte GPS" est une vue
// stylisée (dégradé + points) : aucune lib de carte lourde n'est ajoutée.

interface CourierRow {
  id: string;
  name: string;
  phone: string;
  zone: string | null;
  type: string;
  active: boolean;
  notes?: string | null;
  created_at: string;
}

type CourierState = 'En route' | 'En pause' | 'Hors ligne';
type StateFilter = 'Tous' | CourierState;

const STATE_META: Record<CourierState, { bg: string; fg: string }> = {
  'En route':  { bg: '#D1FAE5', fg: '#059669' },
  'En pause':  { bg: '#FEF3C7', fg: '#D97706' },
  'Hors ligne': { bg: '#E5E7EB', fg: '#6B7280' },
};

const FILTERS: StateFilter[] = ['Tous', 'En route', 'En pause', 'Hors ligne'];

function courierState(c: CourierRow): CourierState {
  if ((c.notes ?? '').toLowerCase().includes('pause')) return 'En pause';
  return c.active ? 'En route' : 'Hors ligne';
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export default function PartnerFleetTrackingScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StateFilter>('Tous');

  const fetchCouriers = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('delivery_partners')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Partner fleet fetch error:', error.message);
        setCouriers([]);
        setLoading(false);
        return;
      }
      setCouriers((data ?? []) as CourierRow[]);
    } catch (e) {
      console.warn('Partner fleet fetch exception:', e);
      setCouriers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCouriers(); }, [fetchCouriers]);
  useFocusEffect(useCallback(() => { fetchCouriers(); }, [fetchCouriers]));

  // Garde d'accès route-level (même pattern que partner-dashboard.tsx).
  if (!isDemoMode && user?.role !== 'PARTNER') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  const visible = couriers.filter(c => (filter === 'Tous' ? true : courierState(c) === filter));

  return (
    <BardecLayout onRefresh={fetchCouriers} refreshing={loading}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Suivi de flotte</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          État de tes livreurs en temps réel.
        </Text>
      </View>

      {/* Filtres par état */}
      <View style={styles.chips}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: colors.border }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, { color: filter === f ? 'white' : colors.foreground }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vue "carte" stylisée (pas de react-native-maps) */}
      <LinearGradient
        colors={[colors.accent, colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.mapCard, { borderColor: colors.border }]}
      >
        <View style={styles.mapHeader}>
          <Feather name="map" size={16} color={colors.primary} />
          <Text style={[styles.mapTitle, { color: colors.foreground }]}>Carte de la flotte</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
        ) : visible.length === 0 ? (
          <Text style={[styles.mapEmpty, { color: colors.mutedForeground }]}>
            Aucun livreur pour cet état.
          </Text>
        ) : (
          <View style={styles.points}>
            {visible.map(c => {
              const state = courierState(c);
              const meta = STATE_META[state];
              return (
                <View key={c.id} style={styles.pointRow}>
                  <View style={[styles.point, { backgroundColor: colors.primary }]}>
                    <Text style={styles.pointText}>{initials(c.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pointName, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.pointZone, { color: colors.mutedForeground }]}>
                      {c.zone ?? 'Zone non renseignée'}
                    </Text>
                  </View>
                  <View style={[styles.stateBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.stateText, { color: meta.fg }]}>{state}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </LinearGradient>

      {/* Liste détaillée */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Livreurs</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
      ) : visible.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="users" size={22} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Aucun livreur disponible.
          </Text>
        </View>
      ) : (
        visible.map(c => {
          const state = courierState(c);
          const meta = STATE_META[state];
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.courierName, { color: colors.foreground }]}>{c.name}</Text>
                <View style={[styles.stateBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.stateText, { color: meta.fg }]}>{state}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Feather name="phone" size={13} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{c.phone}</Text>
              </View>
              <View style={styles.metaRow}>
                <Feather name="map-pin" size={13} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{c.zone ?? 'Zone non renseignée'}</Text>
              </View>
            </View>
          );
        })
      )}
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 2 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  mapCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapTitle: { fontSize: 14, fontWeight: '800' },
  mapEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  points: { gap: 10 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  point: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pointText: { color: 'white', fontWeight: '800', fontSize: 12 },
  pointName: { fontSize: 14, fontWeight: '700' },
  pointZone: { fontSize: 12 },
  stateBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  stateText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  courierName: { fontSize: 15, fontWeight: '700', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13 },
});
