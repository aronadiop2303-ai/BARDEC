import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@/components/Icon';
import { PhoneInput, PhoneInputValue } from '@/components/PhoneInput';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { readLocalImageBytes } from '@/lib/imageUpload';
import { toUserMessage } from '@/lib/errors';
import { PASSWORD_HINT, validatePassword, isDisposableEmail } from '@/lib/validation';
import { getOrCreateDeviceId, getOsVersion } from '@/lib/deviceId';

const ROLES: { id: UserRole; label: string; desc: string }[] = [
  { id: 'CUSTOMER', label: 'Client (B2C)',   desc: 'Achats personnels, prix public' },
  { id: 'BUYER',    label: 'Acheteur B2B',   desc: 'Prix de gros, Net30, bons de commande' },
  { id: 'VENDOR',   label: 'Vendeur',        desc: 'Gérez vos produits et commandes' },
];

export default function RegisterScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { register } = useAuth();
  const insets = useSafeAreaInsets();

  const [name,         setName]         = useState('');
  const [phoneValue,   setPhoneValue]   = useState<PhoneInputValue | null>(null);
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [company,      setCompany]      = useState('');
  const [inviteCode,   setInviteCode]   = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('CUSTOMER');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);
  // Success state — shown briefly before navigating to the app
  const [successName,  setSuccessName]  = useState<string | null>(null);

  // Optional KYC step — shown only for a freshly-registered VENDOR (session
  // active, so we can upload right away). Skippable: kyc_status stays
  // 'pending' either way, and vendor-dashboard.tsx's KYC tab covers this
  // later too. Publishing products is gated on kyc_status === 'approved'
  // regardless of when the docs were added.
  const [kycStep,       setKycStep]       = useState(false);
  const [kycDocAdded,   setKycDocAdded]   = useState(false);
  const [uploadingKyc,  setUploadingKyc]  = useState(false);

  // Auto-redirect 2 s after showing the success screen
  useEffect(() => {
    if (!successName) return;
    const timer = setTimeout(() => router.replace('/'), 2000);
    return () => clearTimeout(timer);
  }, [successName]);

  async function handleRegister() {
    if (!name || !email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (!phoneValue || !phoneValue.isValid || !phoneValue.e164) {
      Alert.alert('Erreur', 'Numéro de téléphone invalide pour le pays sélectionné');
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      Alert.alert('Mot de passe invalide', passwordError);
      return;
    }
    if (isDisposableEmail(email)) {
      Alert.alert('Erreur', 'Merci d\'utiliser une adresse email permanente (pas une adresse jetable).');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Erreur', 'Merci d\'accepter les CGU et la Charte Anti-Fraude de BARDEC pour continuer.');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const osVersion = getOsVersion();
      // register() is expected to always resolve to { error? } rather than
      // throw — but a raw network-level exception (fetch failing outright,
      // not a Postgres error) can still slip through. Without this try/catch
      // that left the spinner stuck forever with no message (see BUGS.md):
      // signUp() succeeds, the users-row insert throws instead of returning
      // an error, and this line never runs, so setLoading(false) never fires.
      const { error } = await register(
        email.trim().toLowerCase(),
        password,
        name.trim(),
        selectedRole,
        phoneValue.e164,
        termsAccepted,
        company.trim() || undefined,
        inviteCode.trim() || undefined,
        { deviceId, osVersion },
      );

      if (error === 'CONFIRM_EMAIL') {
        setEmailSent(true);
        return;
      }
      if (error) {
        Alert.alert('Erreur d\'inscription', error);
        return;
      }

      // ✅ Account created and session active.
      // Vendors get an extra optional stop to add a KYC document right away
      // (upload works because the session is already active) before the
      // usual success screen.
      if (selectedRole === 'VENDOR' && isSupabaseConfigured) {
        setKycStep(true);
      } else {
        setSuccessName(name.trim());
      }
    } catch (err: any) {
      Alert.alert('Erreur d\'inscription', toUserMessage('auth:register:handleRegister', err, 'Impossible de créer le compte. Réessaie dans un instant.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadKycAtRegister() {
    if (!supabase) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { Alert.alert('Erreur', 'Session expirée. Reconnecte-toi et réessaie depuis ton espace vendeur.'); return; }

      setUploadingKyc(true);
      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const contentType = file.mimeType || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
      const path = `${authUser.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const bytes = await readLocalImageBytes(file.uri);

      const { error: upErr } = await supabase.storage
        .from('kyc-documents')
        .upload(path, bytes, { contentType, upsert: false });
      if (upErr) {
        Alert.alert('Erreur', toUserMessage('register:uploadKycDoc', upErr, 'Impossible d\'envoyer ce document. Tu pourras réessayer depuis ton espace vendeur.'));
        return;
      }

      const { error: dbErr } = await supabase
        .from('vendors')
        .upsert({ id: authUser.id, company_name: company.trim() || name.trim(), documents: [path] }, { onConflict: 'id' });
      if (dbErr) {
        Alert.alert('Erreur', toUserMessage('register:saveKycDoc', dbErr, 'Document envoyé mais impossible de mettre à jour ton profil. Réessaie depuis ton espace vendeur.'));
        return;
      }
      setKycDocAdded(true);
    } catch (e: any) {
      Alert.alert('Erreur', toUserMessage('register:uploadKycDoc', e, 'Impossible d\'envoyer ce document.'));
    } finally {
      setUploadingKyc(false);
    }
  }

  // ── Optional KYC step (VENDOR only) ─────────────────────────────────────────
  if (kycStep) {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.primary }]}>Vérification KYC</Text>
            <Text style={[styles.subtitle, { color: colors.foreground }]}>Ajoute un document (optionnel)</Text>
            <Text style={[styles.desc, { color: colors.mutedForeground }]}>
              Registre de commerce, pièce d'identité… Tu peux le faire maintenant ou plus tard depuis ton espace vendeur.
              Tant que ton dossier n'est pas approuvé, tu ne pourras pas publier de produits.
            </Text>
          </View>

          {kycDocAdded ? (
            <View style={[styles.kycNote, { backgroundColor: '#D1FAE5', borderColor: '#22C55E' }]}>
              <Feather name="check-circle" size={16} color="#059669" />
              <Text style={[styles.kycText, { color: '#059669' }]}>
                Document envoyé. Un admin va l'examiner — tu recevras une notification.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card, opacity: uploadingKyc ? 0.6 : 1 }]}
              onPress={handleUploadKycAtRegister}
              disabled={uploadingKyc}
            >
              <Feather name="upload" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14, flex: 1 }}>
                {uploadingKyc ? 'Envoi en cours…' : 'Ajouter un document'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.registerBtn, { backgroundColor: colors.primary }]}
            onPress={() => setSuccessName(name.trim())}
          >
            <Feather name="arrow-right" size={18} color="white" />
            <Text style={styles.registerBtnText}>{kycDocAdded ? 'Terminer' : 'Plus tard'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (successName) {
    return (
      <View style={[styles.container, styles.successContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.successIconCircle, { backgroundColor: '#D1FAE5' }]}>
          <Feather name="check-circle" size={64} color="#10B981" />
        </View>
        <Text style={[styles.successTitle, { color: colors.foreground }]}>
          Bienvenue, {successName} ! 🎉
        </Text>
        <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
          Votre compte a été créé avec succès.{'\n'}Vous êtes maintenant connecté.
        </Text>
        <View style={[styles.successBadge, { backgroundColor: colors.accent, borderColor: colors.primary + '30' }]}>
          <Feather name="loader" size={14} color={colors.primary} />
          <Text style={[styles.successBadgeText, { color: colors.primary }]}>
            Redirection vers l'accueil…
          </Text>
        </View>
      </View>
    );
  }

  // ── Email confirmation screen ──────────────────────────────────────────────
  if (emailSent) {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40, alignItems: 'center' },
          ]}
        >
          <View style={[styles.confirmIcon, { backgroundColor: colors.accent }]}>
            <Feather name="mail" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.primary, textAlign: 'center' }]}>BARDEC ∞</Text>
          <Text style={[styles.subtitle, { color: colors.foreground, textAlign: 'center' }]}>
            Confirmez votre e-mail
          </Text>
          <Text style={[styles.confirmText, { color: colors.mutedForeground }]}>
            Un lien de confirmation a été envoyé à{'\n'}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{email}</Text>
            {'\n\n'}Cliquez sur le lien dans le mail pour activer votre compte, puis connectez-vous.
          </Text>
          <TouchableOpacity
            style={[styles.registerBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
            onPress={() => router.replace('/auth/login')}
          >
            <Feather name="log-in" size={18} color="white" />
            <Text style={styles.registerBtnText}>Aller à la connexion</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Registration form ──────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>BARDEC ∞</Text>
          <Text style={[styles.subtitle, { color: colors.foreground }]}>{t('create_account')}</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>
            Rejoignez le marketplace B2B & B2C mondial
          </Text>
        </View>

        {/* Role selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Type de compte</Text>
          {ROLES.map(role => (
            <TouchableOpacity
              key={role.id}
              style={[
                styles.roleCard,
                {
                  backgroundColor: selectedRole === role.id ? colors.accent : colors.card,
                  borderColor:     selectedRole === role.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedRole(role.id)}
            >
              <View style={styles.roleCheck}>
                <View style={[styles.radio, { borderColor: selectedRole === role.id ? colors.primary : colors.border }]}>
                  {selectedRole === role.id && (
                    <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                  )}
                </View>
              </View>
              <View style={styles.roleText}>
                <Text style={[styles.roleName, { color: colors.foreground }]}>{role.label}</Text>
                <Text style={[styles.roleDesc, { color: colors.mutedForeground }]}>{role.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form fields */}
        <View style={styles.form}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Informations</Text>

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="user" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Nom complet *"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
            />
          </View>

          <PhoneInput
            defaultCountry="SN"
            onChangeValue={setPhoneValue}
            colors={colors}
            placeholder="Numéro de téléphone *"
          />

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder={t('email') + ' *'}
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder={PASSWORD_HINT}
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {(selectedRole === 'BUYER' || selectedRole === 'VENDOR') && (
            <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="briefcase" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Nom de l'entreprise"
                placeholderTextColor={colors.mutedForeground}
                value={company}
                onChangeText={setCompany}
              />
            </View>
          )}

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="gift" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Code d'invitation (optionnel)"
              placeholderTextColor={colors.mutedForeground}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setTermsAccepted(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              {
                borderColor: termsAccepted ? colors.primary : colors.border,
                backgroundColor: termsAccepted ? colors.primary : 'transparent',
              },
            ]}>
              {termsAccepted && <Feather name="check" size={13} color="white" />}
            </View>
            <Text style={[styles.termsText, { color: colors.foreground }]}>
              J'accepte les CGU et la Charte Anti-Fraude de BARDEC *
            </Text>
          </TouchableOpacity>
        </View>

        {selectedRole === 'VENDOR' && (
          <View style={[styles.kycNote, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
            <Feather name="alert-circle" size={16} color="#D97706" />
            <Text style={[styles.kycText, { color: '#D97706' }]}>
              En tant que Vendeur, vous devrez compléter la vérification KYC et téléverser vos documents commerciaux. Un admin validera votre compte.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.registerBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Feather name="user-plus" size={18} color="white" />
          <Text style={styles.registerBtnText}>{loading ? t('loading') : t('create_account')}</Text>
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>{t('have_account')}</Text>
          <TouchableOpacity onPress={() => router.push('/auth/login')}>
            <Text style={[styles.loginLink, { color: colors.primary }]}>{t('login')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  content:        { paddingHorizontal: 24, gap: 20 },
  backBtn:        { width: 40, height: 40, justifyContent: 'center' },
  header:         { gap: 4 },
  title:          { fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  subtitle:       { fontSize: 20, fontWeight: '700' },
  desc:           { fontSize: 14 },
  section:        { gap: 10 },
  sectionLabel:   { fontSize: 15, fontWeight: '700' },
  roleCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 2, padding: 14, gap: 12,
  },
  roleCheck:      {},
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  radioDot:       { width: 10, height: 10, borderRadius: 5 },
  roleText:       { flex: 1 },
  roleName:       { fontSize: 14, fontWeight: '700' },
  roleDesc:       { fontSize: 12, marginTop: 2 },
  form:           { gap: 12 },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  input:          { flex: 1, fontSize: 15 },
  termsRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  termsText:      { flex: 1, fontSize: 13, lineHeight: 18 },
  kycNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, padding: 14, borderRadius: 12, borderWidth: 1,
  },
  kycText:        { flex: 1, fontSize: 13, lineHeight: 18 },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 14,
    shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  registerBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  loginRow:        { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  loginText:       { fontSize: 14 },
  loginLink:       { fontSize: 14, fontWeight: '700' },
  // Email confirmation screen
  confirmIcon: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  confirmText:    { fontSize: 15, textAlign: 'center', lineHeight: 24 },
  // Success screen
  successContainer: {
    justifyContent: 'center', alignItems: 'center', gap: 20, padding: 32,
  },
  successIconCircle: {
    width: 120, height: 120, borderRadius: 60,
    justifyContent: 'center', alignItems: 'center',
  },
  successTitle: {
    fontSize: 24, fontWeight: '800', textAlign: 'center',
  },
  successDesc: {
    fontSize: 15, textAlign: 'center', lineHeight: 24,
  },
  successBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, marginTop: 8,
  },
  successBadgeText: { fontSize: 14, fontWeight: '600' },
});
