import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { DEMO_USERS } from '@/constants/mockData';

export default function LoginScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { login, isDemoMode } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDemoPanel, setShowDemoPanel] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    const { error } = await login(email, password);
    setLoading(false);
    if (error) {
      Alert.alert('Erreur de connexion', error);
    } else {
      router.replace('/');
    }
  }

  function loginDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword('demo123');
    setShowDemoPanel(false);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoText}>∞</Text>
          </View>
          <Text style={[styles.appName, { color: colors.primary }]}>BARDEC</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Marketplace B2B & B2C Mondial
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>{t('welcome_back')}</Text>

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder={t('email')}
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
              placeholder={t('password')}
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={[styles.forgotText, { color: colors.primary }]}>{t('forgot_password')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <Text style={styles.loginBtnText}>{t('loading')}</Text>
            ) : (
              <>
                <Feather name="log-in" size={18} color="white" />
                <Text style={styles.loginBtnText}>{t('login')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.biometricBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Feather name="shield" size={18} color={colors.primary} />
            <Text style={[styles.biometricText, { color: colors.primary }]}>{t('biometric_login')}</Text>
          </TouchableOpacity>
        </View>

        {/* Demo mode */}
        {isDemoMode && (
          <View style={styles.demoSection}>
            <TouchableOpacity
              style={[styles.demoToggle, { borderColor: colors.border }]}
              onPress={() => setShowDemoPanel(!showDemoPanel)}
            >
              <Feather name="zap" size={16} color={colors.warning} />
              <Text style={[styles.demoToggleText, { color: colors.warning }]}>Mode Démo — Choisir un rôle</Text>
              <Feather name={showDemoPanel ? 'chevron-up' : 'chevron-down'} size={16} color={colors.warning} />
            </TouchableOpacity>

            {showDemoPanel && (
              <View style={[styles.demoPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {DEMO_USERS.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.demoUser, { borderBottomColor: colors.border }]}
                    onPress={() => loginDemo(u.email)}
                  >
                    <View style={[styles.demoAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.demoAvatarText}>{u.name[0]}</Text>
                    </View>
                    <View>
                      <Text style={[styles.demoName, { color: colors.foreground }]}>{u.name}</Text>
                      <Text style={[styles.demoRole, { color: colors.primary }]}>{u.role}</Text>
                      <Text style={[styles.demoEmail, { color: colors.mutedForeground }]}>{u.email}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Register link */}
        <View style={styles.registerRow}>
          <Text style={[styles.registerText, { color: colors.mutedForeground }]}>{t('dont_have_account')}</Text>
          <TouchableOpacity onPress={() => router.push('/auth/register')}>
            <Text style={[styles.registerLink, { color: colors.primary }]}>{t('register')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 24 },
  logoSection: { alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: { color: 'white', fontSize: 36, fontWeight: '800' },
  appName: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  tagline: { fontSize: 14, textAlign: 'center' },
  form: { gap: 14 },
  formTitle: { fontSize: 22, fontWeight: '700' },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  input: { flex: 1, fontSize: 15 },
  forgotBtn: { alignSelf: 'flex-end' },
  forgotText: { fontSize: 13, fontWeight: '600' },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 4,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  biometricText: { fontSize: 15, fontWeight: '600' },
  demoSection: { gap: 10 },
  demoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  demoToggleText: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'center' },
  demoPanel: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  demoUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
  },
  demoAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoAvatarText: { color: 'white', fontWeight: '700', fontSize: 16 },
  demoName: { fontSize: 14, fontWeight: '600' },
  demoRole: { fontSize: 12, fontWeight: '700' },
  demoEmail: { fontSize: 11 },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  registerText: { fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '700' },
});
