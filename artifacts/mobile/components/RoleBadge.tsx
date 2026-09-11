import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UserRole } from '@/constants/mockData';
import { useLanguage } from '@/context/LanguageContext';
import { TranslationKey } from '@/constants/translations';

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  CUSTOMER: { bg: '#E8F0FD', text: '#1A56DB' },
  BUYER: { bg: '#EDE9FE', text: '#7C3AED' },
  APPROVER: { bg: '#FEF3C7', text: '#D97706' },
  VENDOR: { bg: '#D1FAE5', text: '#059669' },
  ADMIN: { bg: '#FEE2E2', text: '#DC2626' },
  // Fondation du rôle Partenaire — voir docs/README_PARTNER_ROLE.md.
  PARTNER: { bg: '#E0F2FE', text: '#0369A1' },
};

// 'PARTNER' n'a volontairement pas de clé dans constants/translations.ts :
// ce fichier est un Record<TranslationKey, string> strict répété sur les 20
// langues actives (voir constants/translations.ts) — y ajouter une entrée
// correctement dans les 20 blocs est un vrai chantier i18n à part, pas
// quelque chose à faire en passant dans cette fondation. PARTNER retombe
// donc sur un libellé neutre non traduit ci-dessous plutôt que de risquer
// une régression sur les 5 rôles déjà traduits dans 20 langues.
const ROLE_KEYS: Partial<Record<UserRole, TranslationKey>> = {
  CUSTOMER: 'role_customer',
  BUYER: 'role_buyer',
  APPROVER: 'role_approver',
  VENDOR: 'role_vendor',
  ADMIN: 'role_admin',
};

interface Props {
  role: UserRole;
  small?: boolean;
}

export default function RoleBadge({ role, small = false }: Props) {
  const { t } = useLanguage();
  const colors = ROLE_COLORS[role];
  const key = ROLE_KEYS[role];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: colors.text }, small && styles.smallText]}>
        {key ? t(key) : 'Partner'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  small: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  smallText: {
    fontSize: 10,
  },
});
