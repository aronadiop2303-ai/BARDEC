import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { ACTIVE_PARTNER_STATUSES, PARTNER_TYPE_LABELS, PartnerStatus } from '@/types/partner';

// Fondation du rôle Partenaire (docs/README_PARTNER_ROLE.md) — écran de
// statut affiché tant que le partenaire n'est pas APPROVED/ACTIVE (voir la
// garde dans app/(app)/(tabs)/_layout.tsx) : couvre aussi bien l'attente
// initiale (PENDING/UNDER_REVIEW) que les statuts post-approbation qui
// retirent l'accès (SUSPENDED/RESTRICTED/REJECTED/TERMINATED), pour ne
// jamais laisser un compte dans cet état sans explication.
const STATUS_COPY: Record<PartnerStatus, { icon: string; title: string; desc: string }> = {
  PENDING: {
    icon: 'clock', title: 'Demande partenaire reçue',
    desc: 'Merci pour ta demande de partenariat BARDEC. Elle est en attente de traitement — reviens un peu plus tard pour connaître son statut.',
  },
  UNDER_REVIEW: {
    icon: 'clock', title: 'Demande en cours d\'examen',
    desc: 'Notre équipe examine actuellement ta demande de partenariat. Tu recevras une notification dès qu\'une décision sera prise.',
  },
  APPROVED: {
    icon: 'check-circle', title: 'Demande approuvée',
    desc: 'Ta demande a été approuvée — ton espace partenaire est en cours d\'activation.',
  },
  ACTIVE: {
    icon: 'check-circle', title: 'Compte actif',
    desc: 'Ton compte partenaire est actif.',
  },
  SUSPENDED: {
    icon: 'alert-triangle', title: 'Compte suspendu',
    desc: 'Ton accès à l\'espace partenaire est temporairement suspendu. Contacte le support BARDEC pour plus d\'informations.',
  },
  RESTRICTED: {
    icon: 'alert-triangle', title: 'Accès restreint',
    desc: 'L\'accès à ton espace partenaire est actuellement restreint. Contacte le support BARDEC pour plus d\'informations.',
  },
  REJECTED: {
    icon: 'x-circle', title: 'Demande rejetée',
    desc: 'Ta demande de partenariat n\'a pas été retenue. Contacte le support BARDEC si tu penses qu\'il s\'agit d\'une erreur.',
  },
  TERMINATED: {
    icon: 'x-circle', title: 'Partenariat terminé',
    desc: 'Ton partenariat avec BARDEC a pris fin. Contacte le support BARDEC pour plus d\'informations.',
  },
};

export default function PartnerPendingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const copy = STATUS_COPY[user?.partnerStatus ?? 'PENDING'];
  const typeLabel = user?.partnerType ? PARTNER_TYPE_LABELS[user.partnerType] ?? user.partnerType : null;

  // Filet de sécurité : si le statut devient APPROVED/ACTIVE pendant que
  // l'utilisateur est déjà sur cet écran (approbation en direct, ou le
  // statut est arrivé un instant après le premier rendu — voir le
  // correctif sur switchDemoRole dans AuthContext.tsx), renvoie-le vers les
  // tabs au lieu de le laisser bloqué ici malgré un accès désormais légitime.
  useEffect(() => {
    if (user?.partnerStatus && ACTIVE_PARTNER_STATUSES.includes(user.partnerStatus)) {
      router.replace('/(app)/(tabs)');
    }
  }, [user?.partnerStatus]);

  function handleLogout() {
    Alert.alert('Se déconnecter', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
        <Feather name={copy.icon as any} size={36} color={colors.primary} />
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>{copy.title}</Text>

      {typeLabel && (
        <View style={[styles.typeBadge, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{typeLabel}</Text>
        </View>
      )}

      <Text style={[styles.desc, { color: colors.mutedForeground }]}>{copy.desc}</Text>

      <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.border }]} onPress={handleLogout}>
        <Feather name="log-out" size={16} color={colors.mutedForeground} />
        <Text style={[styles.logoutBtnText, { color: colors.mutedForeground }]}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  typeBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  typeBadgeText: { fontSize: 13, fontWeight: '700' },
  desc: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 4 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 20,
  },
  logoutBtnText: { fontSize: 14, fontWeight: '600' },
});
