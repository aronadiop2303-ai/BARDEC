import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/constants/mockData';

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
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [company,      setCompany]      = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('CUSTOMER');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);
  // Success state — shown briefly before navigating to the app
  const [successName,  setSuccessName]  = useState<string | null>(null);

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
    if (password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);
    const { error } = await register(
      email.trim().toLowerCase(),
      password,
      name.trim(),
      selectedRole,
      company.trim() || undefined,
    );
    setLoading(false);

    if (error === 'CONFIRM_EMAIL') {
      setEmailSent(true);
      return;
    }
    if (error) {
      Alert.alert('Erreur d\'inscription', error);
      return;
    }

    // ✅ Account created and session active — show success screen then navigate
    setSuccessName(name.trim());
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
              placeholder={t('password') + ' * (min. 6 caractères)'}
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
