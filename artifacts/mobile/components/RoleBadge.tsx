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
};

const ROLE_KEYS: Record<UserRole, TranslationKey> = {
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
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: colors.text }, small && styles.smallText]}>
        {t(ROLE_KEYS[role])}
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
