import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIOMETRIC_ENABLED_KEY = 'bardec_biometric_enabled';
const BIOMETRIC_CREDENTIALS_KEY = 'bardec_biometric_credentials';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricTypes(): Promise<string[]> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return types.map(t => {
      if (t === LocalAuthentication.AuthenticationType.FINGERPRINT) return 'fingerprint';
      if (t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) return 'face';
      return 'iris';
    });
  } catch {
    return [];
  }
}

export async function authenticateWithBiometric(reason = 'Connexion BARDEC'): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Annuler',
      fallbackLabel: 'Mot de passe',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function isBiometricLoginEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  return val === 'true';
}

export async function enableBiometricLogin(email: string, password: string): Promise<boolean> {
  const authenticated = await authenticateWithBiometric('Activer la connexion biométrique');
  if (!authenticated) return false;
  // In production, store encrypted token — here we store credentials for demo
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  await AsyncStorage.setItem(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ email }));
  return true;
}

export async function disableBiometricLogin(): Promise<void> {
  await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_CREDENTIALS_KEY);
}

export async function getBiometricCredentials(): Promise<{ email: string } | null> {
  const val = await AsyncStorage.getItem(BIOMETRIC_CREDENTIALS_KEY);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}
