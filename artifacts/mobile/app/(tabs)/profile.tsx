import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { LANGUAGES } from '@/constants/languages';
import { DEMO_USERS, UserRole } from '@/constants/mockData';
import RoleBadge from '@/components/RoleBadge';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import { readLocalImageBytes } from '@/lib/imageUpload';
import { usePendingApprovalsCount } from '@/hooks/usePendingApprovalsCount';

// Role switcher is a UI-only preview (RLS still enforces the real DB role
// regardless) but shouldn't be visible to real users in production — only
// to these test accounts. Always shown in demo mode (no real backend).
const TEST_ACCOUNT_EMAILS = [
  'aronadiop2303@gmail.com',
  'aronadiop2302@gmail.com',
  'aronadiop2304@gmail.com',
];

export default function ProfileScreen() {
  const colors = useColors();
  const { t, language } = useLanguage();
  const { user, logout, switchDemoRole, isDemoMode, updateUserAvatar, updateUserName } = useAuth();
  const canSwitchRole = isDemoMode || TEST_ACCOUNT_EMAILS.includes(user?.email ?? '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricEnabled,     setBiometricEnabled]     = useState(false);
  const [isUploadingAvatar,    setIsUploadingAvatar]    = useState(false);
  // Pending avatar: URI picked by user but not yet confirmed / uploaded
  const [pendingAvatarUri,     setPendingAvatarUri]     = useState<string | null>(null);

  // ── Edit personal info modal ────────────────────────────────────────────────
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editNameValue,   setEditNameValue]   = useState('');
  const [savingName,      setSavingName]      = useState(false);

  function handleOpenEditName() {
    setEditNameValue(user?.name ?? '');
    setEditNameVisible(true);
  }

  async function handleSaveName() {
    const name = editNameValue.trim();
    if (!name) { Alert.alert('Erreur', 'Le nom ne peut pas être vide.'); return; }
    setSavingName(true);
    try {
      await updateUserName(name);
      setEditNameVisible(false);
    } catch (err: any) {
      Alert.alert('Erreur', toUserMessage('profile:updateName', err, 'Impossible de mettre à jour le nom. Réessaie dans un instant.'));
    } finally {
      setSavingName(false);
    }
  }

  async function handleClearCache() {
    Alert.alert(
      'Vider le cache',
      'Ça va effacer les données mises en cache localement (le compte reste connecté).',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider', style: 'destructive',
          onPress: async () => {
            const keys = await AsyncStorage.getAllKeys();
            // Keep the session/demo-user keys so this doesn't log the user out.
            const toRemove = keys.filter(k => k !== 'bardec_demo_user' && !k.startsWith('sb-'));
            if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
            Alert.alert('Cache vidé', `${toRemove.length} entrée(s) effacée(s).`);
          },
        },
      ],
    );
  }

  function handleSupport() {
    router.push('/support');
  }

  function handleAppInfo() {
    const version = Constants.expoConfig?.version ?? '—';
    Alert.alert('BARDEC', `Version ${version}\nMarketplace B2B & B2C mondial`);
  }

  async function handleChangeAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'L\'accès à la galerie est nécessaire pour changer votre photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // No allowsEditing so the OS doesn't show its own crop screen — we handle
      // confirmation explicitly in-app with a "Valider" button.
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingAvatarUri(result.assets[0].uri);
  }

  async function handleConfirmAvatar() {
    if (!pendingAvatarUri) return;
    const uri = pendingAvatarUri;
    setPendingAvatarUri(null);
    setIsUploadingAvatar(true);
    try {
      // Gate on isSupabaseConfigured/supabase only — never on context `user`
      // (can be transiently null or a fake demo object without Supabase being
      // unavailable); `isSupabaseConfigured && !isDemoMode` was also redundant
      // since isDemoMode is defined as !isSupabaseConfigured.
      if (isSupabaseConfigured && supabase) {
        // Always use the real Supabase auth UUID — user.id from AuthContext
        // can be a mock placeholder when the role-switcher is active.
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const realUserId = authUser?.id;
        if (!realUserId) throw new Error('Session expirée — reconnecte-toi.');

        const filename = `${realUserId}/avatar.jpg`;

        // Read file as bytes (content:// safe — see lib/imageUpload.ts)
        if (__DEV__) console.log('[Avatar] Lecture du fichier local:', uri);
        const bytes = await readLocalImageBytes(uri);

        if (__DEV__) console.log('[Avatar] Upload vers Supabase Storage — bucket: avatars, path:', filename);
        const { data: upData, error: upErr } = await supabase.storage
          .from('avatars')
          .upload(filename, bytes, { contentType: 'image/jpeg', upsert: true });
        if (upErr) {
          console.error('[Avatar] Erreur upload Storage:', upErr);
          throw new Error(`Storage upload: ${upErr.message ?? JSON.stringify(upErr)}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(upData.path);
        if (__DEV__) console.log('[Avatar] URL publique récupérée:', publicUrl);

        if (__DEV__) console.log('[Avatar] Mise à jour table users — id:', realUserId);
        const { error: updateErr } = await supabase
          .from('users')
          .update({ avatar_url: publicUrl })
          .eq('id', realUserId);
        if (updateErr) {
          console.error('[Avatar] Erreur mise à jour users:', updateErr);
          throw new Error(`DB update: ${updateErr.message ?? JSON.stringify(updateErr)}`);
        }

        await updateUserAvatar(publicUrl);
        if (__DEV__) console.log('[Avatar] Succès — avatar mis à jour.');
      } else {
        // Demo mode: use local URI directly
        await updateUserAvatar(uri);
      }
    } catch (err: any) {
      Alert.alert('Erreur photo de profil', toUserMessage('profile:confirmAvatar', err, 'Impossible de mettre à jour la photo de profil. Réessaie dans un instant.'));
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const currentLang = LANGUAGES.find(l => l.code === language);
  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';

  const realPendingApprovals = usePendingApprovalsCount(isB2B);
  const pendingApprovalsValue = isSupabaseConfigured ? (realPendingApprovals ?? 0) : user?.pendingApprovals;

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
      {/* ── Avatar confirmation modal ── */}
      <Modal
        visible={!!pendingAvatarUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAvatarUri(null)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.avatarModalTitle, { color: colors.foreground }]}>
              Valider cette photo de profil ?
            </Text>
            {pendingAvatarUri && (
              <Image
                source={{ uri: pendingAvatarUri }}
                style={styles.avatarModalPreview}
                resizeMode="cover"
              />
            )}
            <View style={styles.avatarModalActions}>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setPendingAvatarUri(null)}
              >
                <Text style={[styles.avatarModalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnConfirm, { backgroundColor: colors.primary }]}
                onPress={handleConfirmAvatar}
              >
                <Text style={[styles.avatarModalBtnText, { color: 'white' }]}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit name modal */}
      <Modal
        visible={editNameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameVisible(false)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.avatarModalTitle, { color: colors.foreground }]}>
              Informations personnelles
            </Text>
            <TextInput
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder="Nom complet"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground }]}
              autoFocus
            />
            <View style={styles.avatarModalActions}>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setEditNameVisible(false)}
                disabled={savingName}
              >
                <Text style={[styles.avatarModalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnConfirm, { backgroundColor: colors.primary }]}
                onPress={handleSaveName}
                disabled={savingName}
              >
                {savingName
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={[styles.avatarModalBtnText, { color: 'white' }]}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile hero */}
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        {/* Tappable avatar with camera-edit overlay */}
        <TouchableOpacity onPress={handleChangeAvatar} style={styles.avatarLargeWrapper} activeOpacity={0.8}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatarLarge} resizeMode="cover" />
          ) : (
            <View style={[styles.avatarLarge, styles.avatarInitials]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {isUploadingAvatar
              ? <ActivityIndicator size="small" color="white" />
              : <Feather name="camera" size={13} color="white" />}
          </View>
        </TouchableOpacity>
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
          {pendingApprovalsValue !== undefined && pendingApprovalsValue !== null && pendingApprovalsValue > 0 && (
            <View style={[styles.b2bRow, styles.pendingRow, { backgroundColor: '#FEF3C7' }]}>
              <Feather name="alert-circle" size={16} color="#D97706" />
              <Text style={[styles.b2bRowText, { color: '#D97706' }]}>
                {pendingApprovalsValue} commande(s) {t('pending_approval')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Role switcher — demo mode only, or the test accounts whitelist in real mode */}
      {canSwitchRole && (
      <View style={[styles.section, { borderColor: colors.border }]}>
        <View style={styles.roleSwitchHeader}>
          <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Changer de rôle</Text>
          {!isDemoMode && (
            <View style={[styles.liveTag, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.liveTagText, { color: '#D97706' }]}>test</Text>
            </View>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['CUSTOMER', 'BUYER', 'APPROVER', 'VENDOR', 'ADMIN'] as UserRole[]).map(role => (
            <TouchableOpacity
              key={role}
              style={[
                styles.roleSwitchBtn,
                {
                  backgroundColor: user?.role === role ? colors.primary : colors.card,
                  borderColor:     user?.role === role ? colors.primary : colors.border,
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

        <MenuItem icon="user" label="Informations personnelles" colors={colors} onPress={handleOpenEditName} />
        {/* No wishlist table and no RLS-readable `reviews` table yet (RLS enabled,
            zero policies — blocks even ADMIN) — honest "coming soon" rather than
            a silent dead tap, until that backend work is scoped. */}
        <MenuItem icon="heart" label={t('wishlist')} colors={colors} onPress={() => Alert.alert('Bientôt disponible', 'La liste de souhaits arrive prochainement.')} />
        <MenuItem icon="star" label={t('my_reviews')} colors={colors} onPress={() => Alert.alert('Bientôt disponible', 'Tes avis arrivent prochainement.')} />

        {isB2B && (
          <>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>B2B</Text>
            <MenuItem
              icon="file-text"
              label={t('purchase_order')}
              colors={colors}
              onPress={() => router.push('/(tabs)/orders' as any)}
            />
            <MenuItem
              icon="check-circle"
              label="Approbations en attente"
              colors={colors}
              badge={pendingApprovalsValue}
              onPress={() => router.push({
                pathname: '/(tabs)/orders',
                params: { tab: 'pending_approval' },
              } as any)}
            />
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
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>Commerce de proximité</Text>

        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/proximity/my-shop' as any)}>
          <Feather name="store" size={18} color="#22C55E" />
          <View style={styles.menuRowText}>
            <Text style={[styles.menuLabel, { color: colors.foreground }]}>Ma boutique de quartier</Text>
            <Text style={[styles.menuValue, { color: colors.mutedForeground }]}>Gérer votre commerce local</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>Application</Text>

        <MenuItem icon="headphones" label={t('support')} colors={colors} onPress={handleSupport} />
        <MenuItem icon="info" label={t('app_info')} colors={colors} onPress={handleAppInfo} />
        <MenuItem icon="trash-2" label={t('clear_cache')} colors={colors} onPress={handleClearCache} />
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
  avatarLargeWrapper: { position: 'relative', marginBottom: 4 },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 40,
    overflow: 'hidden',
  },
  avatarInitials: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'white',
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
  roleSwitchHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  liveTagText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
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
  // ── Avatar confirmation modal ──────────────────────────────────────────────
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  avatarModalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  editNameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 12,
  },
  avatarModalPreview: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
  },
  avatarModalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  avatarModalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  avatarModalBtnCancel: {
    borderWidth: 1,
  },
  avatarModalBtnConfirm: {},
  avatarModalBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
