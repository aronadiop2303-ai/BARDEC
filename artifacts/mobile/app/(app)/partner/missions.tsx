import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Chantier 2 — Espace Partenaire / "Missions & Commandes attribuées".
// Fetch défensif : on lit les 50 dernières commandes puis on filtre côté
// client sur celles dont delivery_partner_id correspond au partenaire
// connecté (UUID réel + id(s) du partenaire). Toute erreur (colonne/table
// manquante, RLS, etc.) est attrapée et donne un état vide propre.

interface MissionRow {
  id: string;
  order_number: string | null;
  status: string | null;
  total: number | null;
  delivery_partner_id: string | null;
  tracking_number: string | null;
  created_at: string | null;
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending:            { label: 'En attente',               bg: '#FEF3C7', fg: '#D97706' },
  pending_approval:   { label: 'En attente d\'approbation', bg: '#FEF3C7', fg: '#D97706' },
  approved:           { label: 'Approuvé',                 bg: '#D1FAE5', fg: '#059669' },
  shipped:            { label: 'Expédié',                  bg: '#DBEAFE', fg: '#1D4ED8' },
  ready_for_delivery: { label: 'Prêt',                     bg: '#CFFAFE', fg: '#0E7490' },
  out_for_delivery:   { label: 'En livraison',             bg: '#DBEAFE', fg: '#1D4ED8' },
  completed:          { label: 'Livré',                    bg: '#D1FAE5', fg: '#059669' },
  cancelled:          { label: 'Annulé',                   bg: '#FEE2E2', fg: '#DC2626' },
};
const DEFAULT_STATUS_META = { label: 'Inconnu', bg: '#EEF3FB', fg: '#6B7DB3' };

type MissionAction = 'accept' | 'start' | 'reject';

export default function PartnerMissionsScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();
  const { formatPrice } = useCurrency();
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMissions = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      // Identifiants candidats : UUID réel + user.id (démo) + ids/user_ids des
      // lignes `partners` possédées par le compte connecté.
      const candidateIds = new Set<string>();
      if (authUser?.id) candidateIds.add(authUser.id);
      if (user?.id) candidateIds.add(user.id);
      const { data: partnerData, error: partnerErr } = await supabase
        .from('partners')
        .select('id, user_id');
      if (!partnerErr && partnerData) {
        for (const p of partnerData as { id?: string; user_id?: string }[]) {
          if (p.id) candidateIds.add(p.id);
          if (p.user_id) candidateIds.add(p.user_id);
        }
      }

      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total, delivery_partner_id, tracking_number, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('Partner missions fetch error:', error.message);
        setMissions([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as MissionRow[];
      setMissions(rows.filter(m => m.delivery_partner_id && candidateIds.has(m.delivery_partner_id)));
    } catch (e) {
      console.warn('Partner missions fetch exception:', e);
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchMissions(); }, [fetchMissions]);
  useFocusEffect(useCallback(() => { fetchMissions(); }, [fetchMissions]));

  // Garde d'accès route-level (même pattern que partner-dashboard.tsx).
  if (!isDemoMode && user?.role !== 'PARTNER') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  async function applyAction(mission: MissionRow, action: MissionAction) {
    // 'approved' est un statut d'ordre existant (pas 'confirmed', absent de
    // l'enum order_status en base).
    const nextStatus = action === 'accept' ? 'approved' : action === 'reject' ? 'cancelled' : 'out_for_delivery';
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Bientôt disponible', 'Cette action sera disponible une fois ton espace partenaire connecté à Supabase.');
      return;
    }
    try {
      const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', mission.id);
      if (error) {
        console.warn('Partner mission update error:', error.message);
        Alert.alert('Erreur', 'Impossible de mettre à jour cette mission. Réessaie dans un instant.');
        return;
      }
      setMissions(prev => prev.map(m => (m.id === mission.id ? { ...m, status: nextStatus } : m)));
    } catch (e) {
      console.warn('Partner mission update exception:', e);
      Alert.alert('Erreur', 'Impossible de mettre à jour cette mission.');
    }
  }

  function confirmAction(mission: MissionRow, action: MissionAction) {
    const verb = action === 'accept' ? 'accepter' : action === 'reject' ? 'refuser' : 'mettre en cours';
    Alert.alert('Confirmer', `Veux-tu ${verb} la mission ${mission.order_number ?? ''} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: () => { void applyAction(mission, action); } },
    ]);
  }

  return (
    <BardecLayout onRefresh={fetchMissions} refreshing={loading}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Missions & Commandes</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Les commandes qui te sont attribuées.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
      ) : missions.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="truck" size={22} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Aucune mission attribuée pour le moment.
          </Text>
        </View>
      ) : (
        missions.map(mission => {
          const meta = STATUS_META[mission.status ?? ''] ?? DEFAULT_STATUS_META;
          return (
            <View key={mission.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.orderNumber, { color: colors.foreground }]}>
                  #{mission.order_number ?? '—'}
                </Text>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
                </View>
              </View>

              <Text style={[styles.total, { color: colors.primary }]}>
                {formatPrice(Number(mission.total ?? 0))}
              </Text>

              {mission.tracking_number ? (
                <View style={styles.trackingRow}>
                  <Feather name="package" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.trackingText, { color: colors.mutedForeground }]}>
                    Suivi : {mission.tracking_number}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}
                  onPress={() => confirmAction(mission, 'accept')}
                >
                  <Feather name="check-circle" size={14} color="#059669" />
                  <Text style={[styles.actionText, { color: '#059669' }]}>Accepter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#DBEAFE', borderColor: '#3B82F6' }]}
                  onPress={() => confirmAction(mission, 'start')}
                >
                  <Feather name="truck" size={14} color="#1D4ED8" />
                  <Text style={[styles.actionText, { color: '#1D4ED8' }]}>En cours</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                  onPress={() => confirmAction(mission, 'reject')}
                >
                  <Feather name="x-circle" size={14} color="#DC2626" />
                  <Text style={[styles.actionText, { color: '#DC2626' }]}>Refuser</Text>
                </TouchableOpacity>
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
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderNumber: { fontSize: 15, fontWeight: '700', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  total: { fontSize: 17, fontWeight: '800' },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackingText: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderRadius: 10, paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});
