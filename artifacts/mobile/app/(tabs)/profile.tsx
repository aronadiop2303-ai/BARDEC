import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { LANGUAGES } from '@/constants/languages';
import { DEMO_USERS, UserRole } from '@/constants/mockData';
import RoleBadge from '@/components/RoleBadge';
import BardecLayout from '@/components/BardecLayout';

export default function ProfileScreen() {
  const colors = useColors();
  const { t, language } = useLanguage();
  const { user, logout, switchDemoRole, isDemoMode } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language);
  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';

  const handleLogout = () => {
    Alert.alert(t('logout'), 'Voulez-vous vous déconnecter?', [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: logout },
    ]);
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <BardecLayout>
      {/* Profile hero */}
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{user?.name ?? 'Utilisateur'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        {user?.role && <RoleBadge role={user.role} />}
      </View>

      {/* B2B info */}
      {isB2B && user && (
        <View style={[styles.b2bCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.b2bTitle, { color: colors.foreground }]}>Informations B2B</Text>
          {user.company && (
            <View style={styles.b2bRow}>
              <Feather name="briefcase" size={16} color={colors.mutedForeground} />
              <Text style={[styles.b2bRowText, { color: colors.foreground }]}>{user.company}</Text>
            </View>
          )}
          {user.creditLimit && (
            <View style={styles.b2bRow}>
              <Feather name="credit-card" size={16} color={colors.mutedForeground} />
              <View>
                <Text style={[styles.b2bRowLabel, { color: colors.mutedForeground }]}>{t('credit_limit')}</Text>
                <Text style={[styles.b2bRowValue, { color: colors.primary }]}>
                  ${user.creditLimit?.toLocaleString()} ({t('net30')})
                </Text>
              </View>
            </View>
          )}
          {user.pendingApprovals !== undefined && user.pendingApprovals > 0 && (
            <View style={[styles.b2bRow, styles.pendingRow, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="alert-circle" size={16} color="#D97706" />
              <Text style={[styles.b2bRowText, { color: '#D97706' }]}>
                {user.pendingApprovals} commande(s) {t('pending_approval')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Demo mode role switcher */}
      {isDemoMode && (
        <View style={[styles.section, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Mode Démo — Changer de rôle</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(['CUSTOMER', 'BUYER', 'APPROVER', 'VENDOR', 'ADMIN'] as UserRole[]).map(role => (
              <TouchableOpacity
                key={role}
                style={[
                  styles.roleSwitchBtn,
                  {
                    backgroundColor: user?.role === role ? colors.primary : colors.card,
                    borderColor: user?.role === role ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => switchDemoRole(role)}
              >
                <Text style={[styles.roleSwitchText, { color: user?.role === role ? 'white' : colors.foreground }]}>
                  {role}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Menu */}
      <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground }]}>{t('account')}</Text>

        <MenuItem icon="user" label="Informations personnelles" colors={colors} />
        <MenuItem icon="heart" label={t('wishlist')} colors={colors} onPress={() => {}} />
        <MenuItem icon="star" label={t('my_reviews')} colors={colors} onPress={() => {}} />

        {isB2B && (
          <>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>B2B</Text>
            <MenuItem icon="file-text" label={t('purchase_order')} colors={colors} />
            <MenuItem icon="check-circle" label="Approbations en attente" colors={colors} badge={user?.pendingApprovals} />
          </>
        )}

        <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>{t('settings')}</Text>

        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/language')}>
          <Feather name="globe" size={18} color={colors.primary} />
          <View style={styles.menuRowText}>
            <Text style={[styles.menuLabel, { color: colors.foreground }]}>{t('language')}</Text>
            <Text style={[styles.menuValue, { color: colors.mutedForeground }]}>
              {currentLang?.flag} {currentLang?.nativeName}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={styles.menuRow}>
          <Feather name="bell" size={18} color={colors.primary} />
          <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>Notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor="white"
          />
        </View>

        <View style={styles.menuRow}>
          <Feather name="shield" size={18} color={colors.primary} />
          <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>{t('biometric_login')}</Text>
          <Switch
            value={biometricEnabled}
            onValueChange={setBiometricEnabled}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor="white"
          />
        </View>

        <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>Application</Text>

        <MenuItem icon="headphones" label={t('support')} colors={colors} />
        <MenuItem icon="info" label={t('app_info')} colors={colors} />
        <MenuItem icon="trash-2" label={t('clear_cache')} colors={colors} />
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={[styles.logoutBtn, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}
        onPress={handleLogout}
      >
        <Feather name="log-out" size={18} color={colors.destructive} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>{t('logout')}</Text>
      </TouchableOpacity>
    </BardecLayout>
  );
}

function MenuItem({ icon, label, colors, onPress, badge }: {
  icon: string;
  label: string;
  colors: any;
  onPress?: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress ?? (() => {})}>
      <Feather name={icon as any} size={18} color={colors.primary} />
      <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>{label}</Text>
      {badge !== undefined && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarText: { color: 'white', fontSize: 28, fontWeight: '800' },
  userName: { color: 'white', fontSize: 20, fontWeight: '700' },
  userEmail: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  b2bCard: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  b2bTitle: { fontSize: 15, fontWeight: '700' },
  b2bRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
  },
  b2bRowText: { fontSize: 14, flex: 1 },
  b2bRowLabel: { fontSize: 11 },
  b2bRowValue: { fontSize: 14, fontWeight: '700' },
  pendingRow: { padding: 10, borderRadius: 10 },
  section: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  roleSwitchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  roleSwitchText: { fontSize: 12, fontWeight: '700' },
  menuSection: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 0,
    marginBottom: 12,
  },
  menuSectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  menuDivider: { height: 1, marginVertical: 8 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  menuLabel: { fontSize: 15, fontWeight: '500' },
  menuValue: { fontSize: 13, marginTop: 1 },
  menuRowText: { flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: { fontSize: 15, fontWeight: '700' },
});
