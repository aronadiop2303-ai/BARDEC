import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useCurrency } from '@/context/CurrencyContext';
import { CURRENCIES } from '@/lib/currency';
import { LANGUAGES } from '@/constants/languages';
import { DEMO_USERS, Order, STATUS_COLORS, UserRole } from '@/constants/mockData';
import RoleBadge from '@/components/RoleBadge';
import BardecLayout from '@/components/BardecLayout';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import { readLocalImageBytes } from '@/lib/imageUpload';
import { mapDbOrder } from '@/lib/orders';
import { PhoneInput, PhoneInputValue } from '@/components/PhoneInput';

// Chantier 7 (fusionné dans Profil suite correction d'architecture) — un
// "bon de commande" est une ligne `orders` avec company_id renseigné ; pas
// de table dédiée (b2b_profiles/purchase_orders n'existent pas, vérifié
// via information_schema en production avant d'écrire ce bloc).
interface B2BCompanyInfo {
  id: string;
  name: string;
  tax_id: string | null;
  country: string;
  credit_limit: number;
  net30_balance: number;
  payment_terms: string | null;
  is_approved: boolean;
}
const B2B_ORDER_STATUS_LABELS: Record<string, string> = {
  pending:            'En attente de validation',
  pending_approval:   'En attente d\'approbation',
  approved:           'Approuvé',
  shipped:            'Expédié',
  ready_for_delivery: 'Prêt pour livraison',
  out_for_delivery:   'En livraison',
  completed:          'Livré',
  cancelled:          'Refusé / Annulé',
};

// Masque l'e-mail affiché dans la bannière d'en-tête (Confidentialité) —
// garde le premier et le dernier caractère de la partie locale, le domaine
// reste lisible. Ex: "aronadiop2303@gmail.com" → "a***3@gmail.com".
function maskEmail(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}

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
  const { user, logout, switchDemoRole, isDemoMode, updateUserAvatar, updateUserName, updateUserPhone, refreshUser, verifyPassword } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const canSwitchRole = isDemoMode || TEST_ACCOUNT_EMAILS.includes(user?.email ?? '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isUploadingAvatar,    setIsUploadingAvatar]    = useState(false);
  // Pending avatar: URI picked by user but not yet confirmed / uploaded
  const [pendingAvatarUri,     setPendingAvatarUri]     = useState<string | null>(null);

  // ── Edit personal info modal ────────────────────────────────────────────────
  // Chantier Profil & Confidentialité — étend cette modale (avant : nom
  // seul) avec téléphone (même PhoneInput que checkout/inscription) et
  // photo de profil (réutilise handleChangeAvatar/pendingAvatarUri déjà
  // câblés plus bas). L'e-mail reste affiché mais non éditable ici : le
  // changer correctement nécessite le flux de confirmation Supabase Auth
  // (supabase.auth.updateUser({email}) + re-confirmation par e-mail), un
  // chantier séparé — l'éditer directement dans public.users désynchroniserait
  // l'adresse de connexion réelle (auth.users.email) sans avertissement.
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editNameValue,   setEditNameValue]   = useState('');
  const [editPhoneValue,  setEditPhoneValue]  = useState<PhoneInputValue | null>(null);
  const [savingName,      setSavingName]      = useState(false);

  // ── Sécurité : changement de mot de passe (Supabase Auth) ───────────────────
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword,       setCurrentPassword]       = useState('');
  const [newPassword,           setNewPassword]           = useState('');
  const [confirmPassword,       setConfirmPassword]       = useState('');
  const [changingPassword,      setChangingPassword]      = useState(false);

  // ── Confidentialité: export / suppression de compte ─────────────────────────
  const [exportingData,     setExportingData]     = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText,  setDeleteConfirmText]  = useState('');
  const [deletingAccount,    setDeletingAccount]    = useState(false);

  function handleOpenEditName() {
    setEditNameValue(user?.name ?? '');
    setEditPhoneValue(null);
    setEditNameVisible(true);
  }

  async function handleSavePersonalInfo() {
    const name = editNameValue.trim();
    if (!name) { Alert.alert('Erreur', 'Le nom ne peut pas être vide.'); return; }
    if (editPhoneValue && editPhoneValue.nationalDigits.length > 0 && !editPhoneValue.isValid) {
      Alert.alert('Téléphone invalide', 'Entre un numéro de téléphone valide pour le pays sélectionné (ou laisse le champ vide).');
      return;
    }
    setSavingName(true);
    try {
      if (name !== user?.name) await updateUserName(name);
      if (editPhoneValue?.isValid && editPhoneValue.e164 && editPhoneValue.e164 !== user?.phone) {
        await updateUserPhone(editPhoneValue.e164);
      }
      setEditNameVisible(false);
    } catch (err: any) {
      Alert.alert('Erreur', toUserMessage('profile:updatePersonalInfo', err, 'Impossible de mettre à jour tes informations. Réessaie dans un instant.'));
    } finally {
      setSavingName(false);
    }
  }

  async function handleExportData() {
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Mode démo', 'Cette fonctionnalité nécessite un compte réel connecté à Supabase.');
      return;
    }
    setExportingData(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const realUserId = authUser?.id;
      if (!realUserId) throw new Error('Session expirée — reconnecte-toi.');

      const { data, error } = await supabase.rpc('export_user_data', { target_user_id: realUserId });
      if (error) throw error;

      // jsonb_agg() returns null (not []) when a category has zero rows —
      // normalize to [] so the exported JSON reads as proper arrays.
      const normalized = {
        profile:          data?.profile ?? null,
        orders:            data?.orders ?? [],
        reviews:           data?.reviews ?? [],
        proximity_shops:   data?.proximity_shops ?? [],
        products:          data?.products ?? [],
      };

      const today    = new Date().toISOString().slice(0, 10);
      const fileName = `bardec-mes-donnees-${today}.json`;
      const fileUri  = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '') + fileName;

      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(normalized, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType:    'application/json',
          dialogTitle: 'Exporter mes données BARDEC',
          UTI:         'public.json',
        });
      } else {
        Alert.alert('Fichier enregistré', `Le fichier ${fileName} a été enregistré dans le stockage de l'application.`);
      }
    } catch (err: any) {
      Alert.alert('Erreur', toUserMessage('profile:exportData', err, 'Impossible d\'exporter tes données. Réessaie dans un instant.'));
    } finally {
      setExportingData(false);
    }
  }

  function handleDeleteAccountPress() {
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Mode démo', 'Cette fonctionnalité nécessite un compte réel connecté à Supabase.');
      return;
    }
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est irréversible. Ta connexion sera définitivement bloquée et ton contenu personnel (panier, messages) supprimé. Tes commandes, avis et produits resteront visibles de façon anonyme pour préserver l\'historique des autres utilisateurs.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer', style: 'destructive',
          onPress: () => { setDeleteConfirmText(''); setDeleteModalVisible(true); },
        },
      ],
    );
  }

  async function handleConfirmDeleteAccount() {
    if (deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER') return;
    setDeletingAccount(true);
    try {
      const { data: { user: authUser } } = await supabase!.auth.getUser();
      const realUserId = authUser?.id;
      if (!realUserId) throw new Error('Session expirée — reconnecte-toi.');

      const { error } = await supabase!.rpc('anonymize_and_delete_account', { target_user_id: realUserId });
      if (error) throw error;

      setDeleteModalVisible(false);
      // logout() clears local session/storage regardless of whether the
      // server-side session was already revoked by the RPC above.
      await logout();
      router.replace('/auth/login');
    } catch (err: any) {
      Alert.alert('Erreur', toUserMessage('profile:deleteAccount', err, 'Impossible de supprimer le compte. Réessaie dans un instant.'));
    } finally {
      setDeletingAccount(false);
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

  function openChangePasswordModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setChangePasswordVisible(true);
  }

  async function handleChangePassword() {
    if (!currentPassword) {
      Alert.alert('Champ requis', 'Entre ton mot de passe actuel.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Les mots de passe ne correspondent pas', 'Vérifie la confirmation du nouveau mot de passe.');
      return;
    }
    if (!supabase || !user?.email) return;
    setChangingPassword(true);

    // verifyPassword() (AuthContext) reconfirme l'identité via
    // signInWithPassword sur le compte réel, en suppressant le SIGNED_IN
    // qui en résulte côté onAuthStateChange — appeler signInWithPassword
    // directement ici écraserait le `user` en mémoire (et un rôle
    // prévisualisé via le sélecteur de test) avec le profil frais de la BDD.
    const passwordOk = await verifyPassword(currentPassword);
    if (!passwordOk) {
      setChangingPassword(false);
      Alert.alert('Mot de passe incorrect', 'Le mot de passe actuel saisi est incorrect.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      Alert.alert('Erreur', toUserMessage('profile:changePassword', error, 'Impossible de changer le mot de passe. Réessaie dans un instant.'));
      return;
    }
    setChangePasswordVisible(false);
    Alert.alert('Mot de passe modifié', 'Ton mot de passe a été mis à jour avec succès.');
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
  // Chantier 5 — l'Espace Société (ID + limite de crédit Net30) est réservé
  // au rôle Acheteur B2B (BUYER) ; un APPROVER n'a plus accès à ce bloc (son
  // suivi vit sur l'onglet Espace Approbateur, approver-dashboard.tsx).
  const isBuyer = user?.role === 'BUYER';

  // AuthContext.user (company/companyApproved) n'est enrichi qu'au login —
  // rien ne le rafraîchit tant qu'un admin approuve une demande de
  // rattachement pendant que ce compte est déjà connecté. Sans ça, le
  // bandeau "non rattaché" restait affiché même après une approbation
  // réelle en base. Refait à chaque prise de focus de l'écran.
  useFocusEffect(React.useCallback(() => { refreshUser(); }, [refreshUser]));

  // ── B2B (BUYER) — société, encours Net30, bons de commande ─────────────────
  const [b2bCompany, setB2bCompany] = useState<B2BCompanyInfo | null>(null);
  const [b2bOrders,  setB2bOrders]  = useState<Order[]>([]);
  const [loadingB2b, setLoadingB2b] = useState(false);

  const fetchB2bData = React.useCallback(async () => {
    if (!isBuyer || !user?.company || !isSupabaseConfigured || !supabase) {
      setB2bCompany(null);
      setB2bOrders([]);
      return;
    }
    setLoadingB2b(true);
    const [companyRes, ordersRes] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, tax_id, country, credit_limit, net30_balance, payment_terms, is_approved')
        .eq('id', user.company)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('*')
        .eq('company_id', user.company)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (companyRes.error) console.error('[profile:b2bCompany]', companyRes.error.message, companyRes.error.details, companyRes.error.hint);
    if (ordersRes.error)  console.error('[profile:b2bOrders]',  ordersRes.error.message,  ordersRes.error.details,  ordersRes.error.hint);
    setB2bCompany(companyRes.data ?? null);
    setB2bOrders((ordersRes.data ?? []).map(mapDbOrder));
    setLoadingB2b(false);
  }, [isBuyer, user?.company]);

  useEffect(() => { fetchB2bData(); }, [fetchB2bData]);
  useFocusEffect(React.useCallback(() => { fetchB2bData(); }, [fetchB2bData]));

  const b2bCreditLimit     = b2bCompany?.credit_limit ?? 0;
  const b2bCreditBalance   = b2bCompany?.net30_balance ?? 0;
  const b2bCreditAvailable = b2bCreditLimit - b2bCreditBalance;
  const b2bOverLimit       = b2bCreditBalance > b2bCreditLimit && b2bCreditLimit > 0;
  const b2bCreditRatio     = b2bCreditLimit > 0 ? Math.min(b2bCreditBalance / b2bCreditLimit, 1) : 0;
  const b2bPendingCount    = b2bOrders.filter(o => o.status === 'pending' || o.status === 'pending_approval').length;

  // ── Demande de rattachement B2B (company_join_requests) ─────────────────
  // Table dédiée créée pour ce chantier — pas de policy d'insert sur
  // `companies` pour un compte normal (companies_own est en lecture seule),
  // donc une société ne peut pas se créer elle-même : on enregistre une
  // demande, un ADMIN la traite ensuite (rattache réellement via
  // users.company_id, hors scope de cet écran).
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCompanyName, setJoinCompanyName] = useState('');
  const [joinTaxId, setJoinTaxId] = useState('');
  const [joinContactEmail, setJoinContactEmail] = useState('');
  const [submittingJoin, setSubmittingJoin] = useState(false);
  const [joinRequestStatus, setJoinRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);

  const fetchJoinRequestStatus = React.useCallback(async () => {
    if (!isBuyer || user?.company || !isSupabaseConfigured || !supabase) {
      setJoinRequestStatus(null);
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setJoinRequestStatus(null); return; }
    const { data, error } = await supabase
      .from('company_join_requests')
      .select('status')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.error('[profile:joinRequestStatus]', error.message, error.details, error.hint);
    setJoinRequestStatus((data?.status as any) ?? null);
  }, [isBuyer, user?.company]);

  useEffect(() => { fetchJoinRequestStatus(); }, [fetchJoinRequestStatus]);
  useFocusEffect(React.useCallback(() => { fetchJoinRequestStatus(); }, [fetchJoinRequestStatus]));

  function openJoinModal() {
    setJoinCompanyName('');
    setJoinTaxId('');
    setJoinContactEmail(user?.email ?? '');
    setShowJoinModal(true);
  }

  async function handleSubmitJoinRequest() {
    const name  = joinCompanyName.trim();
    const email = joinContactEmail.trim();
    if (!name)  { Alert.alert('Champ requis', 'Indique le nom de l\'entreprise.'); return; }
    if (!email) { Alert.alert('Champ requis', 'Indique un email professionnel.'); return; }
    if (!isSupabaseConfigured || !supabase) {
      Alert.alert('Indisponible', 'Cette action nécessite une connexion à Supabase.');
      return;
    }
    setSubmittingJoin(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setSubmittingJoin(false);
      Alert.alert('Session expirée', 'Reconnecte-toi et réessaie.');
      return;
    }
    const { error } = await supabase.from('company_join_requests').insert({
      user_id:       authUser.id,
      company_name:  name,
      tax_id:        joinTaxId.trim() || null,
      contact_email: email,
    });
    setSubmittingJoin(false);
    if (error) {
      console.error('Erreur demande de rattachement :', error.message, error.details, error.hint);
      Alert.alert('Erreur', toUserMessage('profile:joinRequest', error, 'Impossible d\'envoyer ta demande. Réessaie dans un instant.'));
      return;
    }
    setShowJoinModal(false);
    setJoinRequestStatus('pending');
    Alert.alert('Demande envoyée', 'Ta demande de rattachement a été transmise. Un administrateur BARDEC va l\'examiner.');
  }

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

      {/* Edit personal info modal — nom, e-mail (lecture seule), téléphone, photo */}
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

            {/* Photo de profil — réutilise le même flux que le tap sur l'avatar
                de la bannière (sélection + modale de confirmation dédiée). */}
            <TouchableOpacity
              onPress={handleChangeAvatar}
              style={styles.editAvatarRow}
              disabled={isUploadingAvatar}
            >
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.editAvatarThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.editAvatarThumb, styles.avatarInitials]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <Text style={[styles.editAvatarLabel, { color: colors.primary }]}>
                {isUploadingAvatar ? 'Envoi en cours…' : 'Changer la photo de profil'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nom complet</Text>
            <TextInput
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder="Nom complet"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>E-mail</Text>
            <View style={[styles.editNameInput, styles.readonlyField, { borderColor: colors.border, marginTop: 0 }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 15 }} numberOfLines={1}>{user?.email}</Text>
            </View>
            <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
              Contacte le support pour changer d'adresse e-mail (identifiant de connexion).
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Téléphone</Text>
            <PhoneInput
              defaultCountry="SN"
              initialE164={user?.phone?.startsWith('+') ? user.phone : null}
              onChangeValue={setEditPhoneValue}
              colors={colors}
              placeholder="77 123 45 67"
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
                onPress={handleSavePersonalInfo}
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

      {/* Demande de rattachement B2B — enregistrée dans company_join_requests,
          statut "pending" pour qu'un ADMIN la traite (rattachement réel via
          users.company_id hors scope de cet écran). */}
      <Modal
        visible={showJoinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJoinModal(false)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.avatarModalTitle, { color: colors.foreground }]}>
              Demande de rattachement B2B
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nom de l'entreprise *</Text>
            <TextInput
              value={joinCompanyName}
              onChangeText={setJoinCompanyName}
              placeholder="Ex : BARDEC Import-Export SARL"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Numéro NINEA / Registre du commerce</Text>
            <TextInput
              value={joinTaxId}
              onChangeText={setJoinTaxId}
              placeholder="Ex : SN-DKR-2024-B-12345"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Email professionnel *</Text>
            <TextInput
              value={joinContactEmail}
              onChangeText={setJoinContactEmail}
              placeholder="contact@entreprise.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
            />

            <View style={styles.avatarModalActions}>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowJoinModal(false)}
                disabled={submittingJoin}
              >
                <Text style={[styles.avatarModalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnConfirm, { backgroundColor: colors.primary }]}
                onPress={handleSubmitJoinRequest}
                disabled={submittingJoin}
              >
                {submittingJoin
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={[styles.avatarModalBtnText, { color: 'white' }]}>Soumettre la demande</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change password modal — Supabase Auth n'a pas d'endpoint dédié pour
          vérifier un mot de passe : handleChangePassword() reconfirme le
          mot de passe actuel via signInWithPassword() avant d'appliquer
          updateUser(). */}
      <Modal
        visible={changePasswordVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChangePasswordVisible(false)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.avatarModalTitle, { color: colors.foreground }]}>
              Changer le mot de passe
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Mot de passe actuel</Text>
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Entre ton mot de passe actuel"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nouveau mot de passe</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Au moins 6 caractères"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Confirmer le mot de passe</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Ressaisis le mot de passe"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, marginTop: 0 }]}
            />

            <View style={styles.avatarModalActions}>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setChangePasswordVisible(false)}
                disabled={changingPassword}
              >
                <Text style={[styles.avatarModalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnConfirm, { backgroundColor: colors.primary }]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={[styles.avatarModalBtnText, { color: 'white' }]}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete account confirmation modal — double confirmation: the Alert
          in handleDeleteAccountPress warns about irreversibility first, this
          modal then requires typing SUPPRIMER before the button unlocks. */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingAccount && setDeleteModalVisible(false)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.card }]}>
            <Feather name="alert-triangle" size={32} color={colors.destructive} />
            <Text style={[styles.avatarModalTitle, { color: colors.foreground }]}>
              Confirmer la suppression
            </Text>
            <Text style={[styles.deleteModalText, { color: colors.mutedForeground }]}>
              Cette action est définitive et ne peut pas être annulée. Tape SUPPRIMER pour confirmer.
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="SUPPRIMER"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.editNameInput, { borderColor: colors.border, color: colors.foreground, width: '100%', marginTop: 0 }]}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deletingAccount}
            />
            <View style={styles.avatarModalActions}>
              <TouchableOpacity
                style={[styles.avatarModalBtn, styles.avatarModalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deletingAccount}
              >
                <Text style={[styles.avatarModalBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.avatarModalBtn,
                  styles.avatarModalBtnConfirm,
                  { backgroundColor: colors.destructive, opacity: deleteConfirmText.trim().toUpperCase() === 'SUPPRIMER' ? 1 : 0.4 },
                ]}
                onPress={handleConfirmDeleteAccount}
                disabled={deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER' || deletingAccount}
              >
                {deletingAccount
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={[styles.avatarModalBtnText, { color: 'white' }]}>Supprimer</Text>}
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
        <Text style={styles.userEmail}>{maskEmail(user?.email)}</Text>
        {user?.role && <RoleBadge role={user.role} />}
      </View>

      {isBuyer && user && (
        <View style={[styles.b2bCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.b2bTitle, { color: colors.foreground }]}>Espace Société</Text>

          {!user.company && (
            <View style={styles.warnBanner}>
              <Feather name={joinRequestStatus === 'pending' ? 'clock' : 'alert-circle'} size={16} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={styles.warnBannerText}>
                  {joinRequestStatus === 'pending'
                    ? 'Ta demande de rattachement a été envoyée et est en attente de validation par un administrateur BARDEC.'
                    : joinRequestStatus === 'rejected'
                    ? 'Ta précédente demande de rattachement a été refusée. Tu peux en soumettre une nouvelle.'
                    : 'Ton compte n\'est rattaché à aucune société B2B. Fais une demande de rattachement pour activer le crédit Net30.'}
                </Text>
                {joinRequestStatus !== 'pending' && (
                  <TouchableOpacity style={styles.joinRequestBtn} onPress={openJoinModal}>
                    <Feather name="plus-circle" size={14} color="white" />
                    <Text style={styles.joinRequestBtnText}>Faire une demande de rattachement</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {!!user.company && b2bCompany && !b2bCompany.is_approved && (
            <View style={styles.warnBanner}>
              <Feather name="clock" size={16} color="#D97706" />
              <Text style={styles.warnBannerText}>
                La société {b2bCompany.name} est en attente d'approbation par un administrateur BARDEC. La limite de crédit Net30 sera activée une fois la société validée.
              </Text>
            </View>
          )}

          {!!user.company && b2bCompany && (
            <View style={styles.b2bCompanyRow}>
              <View style={[styles.companyAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.companyAvatarText}>{b2bCompany.name?.[0]?.toUpperCase() ?? 'S'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.companyNameRow}>
                  <Text style={[styles.companyName, { color: colors.foreground }]} numberOfLines={1}>{b2bCompany.name}</Text>
                  {b2bCompany.is_approved && (
                    <View style={styles.approvedBadge}>
                      <Feather name="check-circle" size={11} color="white" />
                      <Text style={styles.approvedBadgeText}>Approuvée</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.companyMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {[b2bCompany.tax_id, b2bCompany.country, b2bCompany.payment_terms].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.kpiValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
                {b2bCreditLimit.toLocaleString('fr-FR')} FCFA
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Limite Net30</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.kpiValue, { color: b2bOverLimit ? '#DC2626' : colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
                {b2bCreditBalance.toLocaleString('fr-FR')} FCFA
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Encours utilisé</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.kpiValue, { color: '#22C55E' }]} numberOfLines={1} adjustsFontSizeToFit>
                {b2bCreditAvailable.toLocaleString('fr-FR')} FCFA
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Solde disponible</Text>
            </View>
          </View>

          {b2bCreditLimit > 0 && (
            <View style={styles.gaugeWrap}>
              <View style={[styles.gaugeTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.gaugeFill, { width: `${b2bCreditRatio * 100}%`, backgroundColor: b2bOverLimit ? '#DC2626' : '#7C3AED' }]} />
              </View>
              <Text style={[styles.gaugeText, { color: colors.mutedForeground }]}>
                {Math.round(b2bCreditRatio * 100)}% de la limite Net30 utilisée
              </Text>
            </View>
          )}
          {b2bOverLimit && (
            <View style={[styles.b2bRow, styles.pendingRow, { backgroundColor: '#FEE2E2' }]}>
              <Feather name="alert-triangle" size={14} color="#DC2626" />
              <Text style={[styles.b2bRowText, { color: '#991B1B' }]}>Encours au-delà de la limite de crédit accordée.</Text>
            </View>
          )}

          <Text style={[styles.b2bSubTitle, { color: colors.foreground }]}>Accès rapides</Text>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => router.push('/(app)/(tabs)' as any)}
            >
              <Feather name="plus-circle" size={18} color={colors.primary} />
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Nouveau BDC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => router.push({ pathname: '/(tabs)/orders', params: { tab: 'pending_approval' } } as any)}
            >
              <Feather name="check-circle" size={18} color={colors.primary} />
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Approbations</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => router.push('/addresses' as any)}
            >
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>Adresses</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.b2bSubTitle, { color: colors.foreground }]}>
            Bons de commande {b2bPendingCount > 0 ? `· ${b2bPendingCount} en attente` : ''}
          </Text>
          {loadingB2b ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : !user.company || b2bOrders.length === 0 ? (
            <Text style={[styles.b2bRowText, { color: colors.mutedForeground, marginBottom: 4 }]}>
              Aucun bon de commande pour l'instant.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {b2bOrders.map(order => (
                <TouchableOpacity
                  key={order.id}
                  style={[styles.b2bOrderCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => router.push(`/order/${order.id}` as any)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.b2bOrderNumber, { color: colors.foreground }]}>
                      {order.purchaseOrderNumber || order.orderNumber}
                    </Text>
                    <Text style={[styles.b2bOrderDate, { color: colors.mutedForeground }]}>{order.date}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.b2bOrderAmount, { color: colors.foreground }]}>
                      {order.total.toLocaleString('fr-FR')} FCFA
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[order.status] ?? colors.muted) + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[order.status] ?? colors.mutedForeground }]}>
                        {B2B_ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
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
          {(['CUSTOMER', 'BUYER', 'APPROVER', 'VENDOR', 'ADMIN', 'PARTNER'] as UserRole[]).map(role => (
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
        <MenuItem icon="list" label="Mes commandes" colors={colors} onPress={() => router.push('/(tabs)/orders' as any)} />
        <MenuItem icon="map-pin" label="Mes adresses" colors={colors} onPress={() => router.push('/addresses' as any)} />
        {/* No wishlist table and no RLS-readable `reviews` table yet (RLS enabled,
            zero policies — blocks even ADMIN) — honest "coming soon" rather than
            a silent dead tap, until that backend work is scoped. */}
        <MenuItem icon="heart" label={t('wishlist')} colors={colors} onPress={() => Alert.alert('Bientôt disponible', 'La liste de souhaits arrive prochainement.')} />
        <MenuItem icon="star" label={t('my_reviews')} colors={colors} onPress={() => Alert.alert('Bientôt disponible', 'Tes avis arrivent prochainement.')} />
        {/* Pas de table referrals/affiliate_program en base (vérifié) —
            stub honnête plutôt qu'une fonctionnalité fabriquée. */}
        <MenuItem icon="gift" label="Programme d'affiliation" colors={colors} onPress={() => Alert.alert('Bientôt disponible', 'Le programme d\'affiliation BARDEC arrive prochainement.')} />
        {/* Chantier 3 — Programme de parrainage, juste sous l'affiliation.
            Icône UserPlus/Gift ; tease "Bientôt disponible" tant que le
            backend parrainage n'est pas branché. */}
        <MenuItem icon="user-plus" label="Programme de parrainage" colors={colors} onPress={() => Alert.alert('Bientôt disponible', 'Le programme de parrainage BARDEC arrive prochainement.')} />

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
          <Feather name="dollar-sign" size={18} color={colors.primary} />
          <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>Devise</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyChip, {
                  backgroundColor: currency === c ? colors.primary : colors.card,
                  borderColor:     currency === c ? colors.primary : colors.border,
                }]}
                onPress={() => setCurrency(c)}
              >
                <Text style={{ color: currency === c ? 'white' : colors.foreground, fontSize: 12, fontWeight: '700' }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

        {isSupabaseConfigured && (
          <MenuItem icon="lock" label="Changer le mot de passe" colors={colors} onPress={openChangePasswordModal} />
        )}

        {/* lib/biometric.ts was never wired to this switch (onValueChange
            just set local state, nothing was persisted or enforced at
            login) — shown disabled with a "Bientôt disponible" badge, same
            convention as ChatFiniButton's "Chat Fini" row and the landing
            page's iOS/Google Play buttons, instead of a dead toggle. */}
        <View style={[styles.menuRow, { opacity: 0.55 }]}>
          <Feather name="shield" size={18} color={colors.mutedForeground} />
          <Text style={[styles.menuLabel, { color: colors.mutedForeground, flex: 1 }]}>{t('biometric_login')}</Text>
          <View style={[styles.soonBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
            <Text style={styles.soonBadgeText}>Bientôt disponible</Text>
          </View>
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
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>Confidentialité</Text>

        <TouchableOpacity style={styles.menuRow} onPress={handleExportData} disabled={exportingData}>
          <Feather name="download" size={18} color={colors.primary} />
          <Text style={[styles.menuLabel, { color: colors.foreground, flex: 1 }]}>Exporter mes données</Text>
          {exportingData
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuRow} onPress={handleDeleteAccountPress}>
          <Feather name="user-x" size={18} color={colors.destructive} />
          <Text style={[styles.menuLabel, { color: colors.destructive, flex: 1 }]}>Supprimer mon compte</Text>
          <Feather name="chevron-right" size={16} color={colors.destructive} />
        </TouchableOpacity>

        <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
        <Text style={[styles.menuSectionTitle, { color: colors.mutedForeground, paddingTop: 8 }]}>Application</Text>

        <MenuItem icon="headphones" label={t('support')} colors={colors} onPress={handleSupport} iconColor="#2563EB" />
        {/* Le détail des garanties (paiement sécurisé, qualité, livraison,
            retour) vit sur chaque fiche produit (onglet "Assurance
            Commerce") — pas d'écran de suivi de litige dédié en base, donc
            pas de nouvelle fonctionnalité fabriquée ici, juste un rappel. */}
        <MenuItem
          icon="award"
          label="Assurance Commerce"
          colors={colors}
          onPress={() => Alert.alert(
            'Assurance Commerce',
            'Paiement sécurisé, garantie de qualité, livraison garantie et politique de retour — consulte l\'onglet "Assurance Commerce" sur la fiche de chaque produit. Pour un litige en cours, contacte le support.',
          )}
          iconColor="#F59E0B"
        />
        <MenuItem icon="info" label={t('app_info')} colors={colors} onPress={handleAppInfo} iconColor="#64748B" />
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

function MenuItem({ icon, label, colors, onPress, badge, iconColor }: {
  icon: string;
  label: string;
  colors: any;
  onPress?: () => void;
  badge?: number;
  iconColor?: string;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress ?? (() => {})}>
      <Feather name={icon as any} size={18} color={iconColor ?? colors.primary} />
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

  // B2B (BUYER) — fusion Chantier 7
  warnBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 10, borderRadius: 10, backgroundColor: '#FEF3C7',
  },
  warnBannerText: { color: '#92400E', fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  joinRequestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#D97706', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start',
  },
  joinRequestBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  b2bCompanyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  companyAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  companyAvatarText: { color: 'white', fontSize: 16, fontWeight: '800' },
  companyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  companyName: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  companyMeta: { fontSize: 12, marginTop: 2 },
  approvedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#22C55E', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  approvedBadgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  kpiValue: { fontSize: 13, fontWeight: '800' },
  kpiLabel: { fontSize: 10, textAlign: 'center' },
  gaugeWrap:  { gap: 6 },
  gaugeTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  gaugeFill:  { height: '100%', borderRadius: 4 },
  gaugeText:  { fontSize: 11 },
  b2bSubTitle: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  quickActionsRow: { flexDirection: 'row', gap: 8 },
  quickActionCard: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  quickActionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  b2bOrderCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 12, padding: 12, gap: 8,
  },
  b2bOrderNumber: { fontSize: 13, fontWeight: '700' },
  b2bOrderDate:   { fontSize: 11, marginTop: 2 },
  b2bOrderAmount: { fontSize: 13, fontWeight: '800' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },

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
  currencyChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  menuLabel: { fontSize: 15, fontWeight: '500' },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  soonBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
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
  deleteModalText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  editNameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 12,
  },
  readonlyField: { justifyContent: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 14, alignSelf: 'flex-start' },
  fieldHint: { fontSize: 11, marginTop: 4, alignSelf: 'flex-start' },
  editAvatarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    alignSelf: 'stretch', marginTop: 4,
  },
  editAvatarThumb: { width: 48, height: 48, borderRadius: 24 },
  editAvatarLabel: { fontSize: 14, fontWeight: '700' },
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
