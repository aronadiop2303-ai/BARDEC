import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

const ROLES = [
  { id: 'CUSTOMER', label: 'Client (B2C)', desc: 'Achats personnels, prix public' },
  { id: 'BUYER', label: 'Acheteur B2B', desc: 'Prix de gros, Net30, bons de commande' },
  { id: 'VENDOR', label: 'Vendeur', desc: 'Gérez vos produits et commandes' },
];

export default function RegisterScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [selectedRole, setSelectedRole] = useState('CUSTOMER');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
    // In demo mode, just login with the provided email
    const { error } = await login(email, password);
    setLoading(false);
    if (error) {
      Alert.alert('Erreur', error);
    } else {
      router.replace('/');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
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
                  borderColor: selectedRole === role.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedRole(role.id)}
            >
              <View style={styles.roleCheck}>
                <View style={[
                  styles.radio,
                  { borderColor: selectedRole === role.id ? colors.primary : colors.border },
                ]}>
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

        {/* Form */}
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
            />
          </View>

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder={t('password') + ' *'}
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
  container: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 20 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  header: { gap: 4 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  subtitle: { fontSize: 20, fontWeight: '700' },
  desc: { fontSize: 14 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    padding: 14,
    gap: 12,
  },
  roleCheck: {},
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  roleText: { flex: 1 },
  roleName: { fontSize: 14, fontWeight: '700' },
  roleDesc: { fontSize: 12, marginTop: 2 },
  form: { gap: 12 },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  input: { flex: 1, fontSize: 15 },
  kycNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, padding: 14, borderRadius: 12, borderWidth: 1,
  },
  kycText: { flex: 1, fontSize: 13, lineHeight: 18 },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 14,
    shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  registerBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  loginText: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },
});
