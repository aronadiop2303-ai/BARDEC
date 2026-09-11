import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  ACTIVE_PARTNER_STATUSES, PARTNER_STATUS_LABELS, PARTNER_TYPE_LABELS,
  PartnerRow, PartnerType,
} from '@/types/partner';

// Fondation du rôle Partenaire (docs/README_PARTNER_ROLE.md) — "Espace
// Partenaire", même pattern d'onglet dédié que Vendeur/Admin/Approbateur.
// Aucune fonctionnalité métier par type de partenaire n'est construite ici
// (voir "Post-lancement" dans la doc) : cet écran affiche l'identité/statut
// du partenaire et annonce ce qui vient ensuite, sur le modèle du badge
// "Bientôt disponible" déjà utilisé ailleurs dans l'app (Connexion
// biométrique du Profil, langues secondaires).
const DEFAULT_UPCOMING = [
  'Missions et commandes qui te sont attribuées',
  'Documents et contrat',
];

// Placeholders modulaires par type — juste des libellés annonçant le futur
// module métier propre à chaque type de partenaire (§14 Ports/Adapters de la
// doc). Pas de logique derrière : on complète cette table au fur et à mesure
// que chaque module est réellement construit, sans changer la structure de
// l'écran.
const MODULE_PLACEHOLDERS: Partial<Record<PartnerType, string[]>> = {
  LOGISTICS: ['Suivi de flotte en temps réel', 'Affectation de tournées'],
  TRANSPORTER: ['Suivi de flotte en temps réel', 'Affectation de tournées'],
  DELIVERY: ['Missions de livraison à proximité', 'Historique des livraisons'],
  SUPPLIER: ['Catalogue produits fournisseur', 'Commandes d\'approvisionnement'],
  WHOLESALER: ['Catalogue grossiste', 'Commandes d\'approvisionnement'],
  PICKUP_POINT: ['Colis en dépôt', 'Créneaux de retrait'],
  WAREHOUSE: ['Niveaux de stock', 'Mouvements d\'entrepôt'],
  FINANCIAL: ['Transactions et règlements', 'Rapports financiers'],
  TECH_API: ['Clés API et webhooks', 'Journal d\'appels'],
  AI: ['Modèles et intégrations IA', 'Journal d\'usage'],
};

function moduleFeaturesFor(type: PartnerType | undefined): string[] {
  const specific = type ? MODULE_PLACEHOLDERS[type] : undefined;
  return [...DEFAULT_UPCOMING, ...(specific ?? [])];
}

const SUPPORT_EMAIL = 'support@bardec.app';

export default function PartnerDashboardScreen() {
  const colors = useColors();
  const { user, isDemoMode } = useAuth();
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOwnPartnerRows = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    setLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }
    // RLS partners_select_own limite déjà à user_id = auth.uid() — pas de
    // filtre supplémentaire nécessaire côté client.
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) { console.warn('Partner dashboard fetch error:', error.message); setLoading(false); return; }
    setRows((data ?? []) as PartnerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOwnPartnerRows(); }, [fetchOwnPartnerRows]);
  useFocusEffect(useCallback(() => { fetchOwnPartnerRows(); }, [fetchOwnPartnerRows]));

  // Garde d'accès route-level — même pattern que admin.tsx/vendor-dashboard.tsx
  // /approvals.tsx (audit du 11 sept). La bottom bar cache déjà cet onglet
  // aux non-partenaires et le layout des tabs redirige déjà un partenaire
  // hors statut actif vers partner-pending, mais l'écran doit aussi se
  // protéger lui-même contre une navigation directe.
  if (!isDemoMode && user?.role !== 'PARTNER') {
    return <Redirect href="/(app)/(tabs)" />;
  }
  if (!isDemoMode && user?.partnerStatus && !ACTIVE_PARTNER_STATUSES.includes(user.partnerStatus)) {
    return <Redirect href="/(app)/partner-pending" />;
  }

  const primary = rows[0];
  const primaryType = user?.partnerType ? PARTNER_TYPE_LABELS[user.partnerType] ?? user.partnerType : null;

  function contactSupport() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Support partenaire BARDEC')}`);
  }

  return (
    <BardecLayout onRefresh={fetchOwnPartnerRows} refreshing={loading}>
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Feather name="briefcase" size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {primary?.company_name || 'Espace Partenaire'}
          </Text>
          <View style={styles.badgeRow}>
            {primaryType && (
              <View style={[styles.typeBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{primaryType}</Text>
              </View>
            )}
            {user?.partnerStatus && (
              <View style={[styles.typeBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.typeBadgeText, { color: colors.primary }]}>
                  {PARTNER_STATUS_LABELS[user.partnerStatus] ?? user.partnerStatus}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
      ) : rows.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
            Aucun profil partenaire trouvé pour ton compte.
          </Text>
        </View>
      ) : (
        rows.map(row => (
          <View key={row.id}>
            {/* Alerte : si un statut suspendu/rejeté apparaît dans les
                données fraîchement récupérées (ex. le cache local user.partnerStatus
                n'a pas encore été rafraîchi après une décision admin), on
                l'affiche clairement au lieu de laisser croire que tout va bien —
                sans changer la garde de navigation plus haut. */}
            {(row.status === 'SUSPENDED' || row.status === 'REJECTED') && (
              <View style={[styles.alertBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                <Feather name="alert-triangle" size={18} color="#DC2626" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>
                    {row.status === 'SUSPENDED' ? 'Compte suspendu' : 'Demande rejetée'}
                  </Text>
                  <Text style={styles.alertDesc}>
                    {row.status_reason || 'Aucun motif renseigné — contacte le support BARDEC pour plus d\'informations.'}
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {row.company_name || (PARTNER_TYPE_LABELS[row.partner_type] ?? row.partner_type)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.statusBadgeText, { color: colors.primary }]}>
                    {PARTNER_STATUS_LABELS[row.status] ?? row.status}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cardSubtext, { color: colors.mutedForeground }]}>
                {PARTNER_TYPE_LABELS[row.partner_type] ?? row.partner_type}
              </Text>
            </View>
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Profil & compte</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Nom</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]}>{user?.name ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Email</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]}>{user?.email ?? '—'}</Text>
        </View>
        {user?.phone && (
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Téléphone</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{user.phone}</Text>
          </View>
        )}
        {primary && (
          <>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Identifiant partenaire</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{primary.id}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Partenaire depuis</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {new Date(primary.created_at).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          </>
        )}
        <TouchableOpacity style={[styles.supportBtn, { borderColor: colors.border }]} onPress={contactSupport}>
          <Feather name="mail" size={16} color={colors.primary} />
          <Text style={[styles.supportBtnText, { color: colors.primary }]}>Contacter le support</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>À venir</Text>
      {moduleFeaturesFor(user?.partnerType).map(feature => (
        <View key={feature} style={styles.upcomingRow}>
          <Text style={[styles.upcomingLabel, { color: colors.mutedForeground, flex: 1 }]}>{feature}</Text>
          <View style={[styles.soonBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
            <Text style={styles.soonBadgeText}>Bientôt disponible</Text>
          </View>
        </View>
      ))}
    </BardecLayout>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  alertBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 12,
  },
  alertTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B' },
  alertDesc: { fontSize: 13, color: '#991B1B', marginTop: 2, lineHeight: 18 },
  card: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  cardSubtext: { fontSize: 13 },
  cardText: { fontSize: 14 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingVertical: 10, marginTop: 10,
  },
  supportBtnText: { fontSize: 14, fontWeight: '700' },
  upcomingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  upcomingLabel: { fontSize: 14 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  soonBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
});
