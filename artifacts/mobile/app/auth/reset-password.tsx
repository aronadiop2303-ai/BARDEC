import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/errors';
import { PASSWORD_HINT, validatePassword } from '@/lib/validation';

/**
 * Landed on from the "reset password" email link (Site URL → this route,
 * see resetPasswordForEmail's redirectTo in app/auth/login.tsx). Supabase's
 * recovery link carries the session in the URL fragment; detectSessionInUrl
 * (enabled for web in lib/supabase.ts) turns that into an active session
 * automatically before this screen ever renders, so all that's left to do
 * here is collect the new password and call updateUser().
 */
export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [done,            setDone]            = useState(false);
  const [hasSession,      setHasSession]      = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setHasSession(false); return; }
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  async function handleSubmit() {
    if (!supabase) return;
    const passwordError = validatePassword(password);
    if (passwordError) {
      Alert.alert('Mot de passe invalide', passwordError);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert('Erreur', toUserMessage('auth:resetPassword', error, 'Impossible de mettre à jour le mot de passe. Réessaie dans un instant.'));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
          <Feather name="check-circle" size={56} color="#10B981" />
        </View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Mot de passe mis à jour</Text>
        <Text style={[styles.desc, { color: colors.mutedForeground, textAlign: 'center' }]}>
          Tu peux maintenant te connecter avec ton nouveau mot de passe.
        </Text>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
          onPress={() => router.replace('/auth/login')}
        >
          <Feather name="log-in" size={18} color="white" />
          <Text style={styles.submitBtnText}>Aller à la connexion</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasSession === false) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
          <Feather name="alert-circle" size={56} color="#DC2626" />
        </View>
        <Text style={[styles.title, { color: colors.foreground, textAlign: 'center' }]}>Lien invalide ou expiré</Text>
        <Text style={[styles.desc, { color: colors.mutedForeground, textAlign: 'center' }]}>
          Ce lien de réinitialisation n'est plus valide. Demande un nouveau lien depuis l'écran de connexion.
        </Text>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
          onPress={() => router.replace('/auth/login')}
        >
          <Feather name="arrow-left" size={18} color="white" />
          <Text style={styles.submitBtnText}>Retour à la connexion</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.primary }]}>Nouveau mot de passe</Text>
        <Text style={[styles.desc, { color: colors.mutedForeground }]}>
          Choisis un nouveau mot de passe pour ton compte BARDEC.
        </Text>

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

        <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="lock" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Confirme le mot de passe"
            placeholderTextColor={colors.mutedForeground}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Feather name="check" size={18} color="white" />
          <Text style={styles.submitBtnText}>{loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  centered:   { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  content:    { paddingHorizontal: 24, gap: 16 },
  iconCircle: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  title:      { fontSize: 22, fontWeight: '800' },
  desc:       { fontSize: 14, lineHeight: 20 },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  input: { flex: 1, fontSize: 15 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 14,
  },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
