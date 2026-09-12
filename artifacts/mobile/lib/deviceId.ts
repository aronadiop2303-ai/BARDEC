import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Signal anti-fraude à l'inscription — pas d'ID matériel (IDFV/Android ID) :
 * ça demanderait expo-application, non installé (voir décision prise pour
 * l'objectif 4). Un UUID généré une fois et conservé en local suffit pour
 * corréler plusieurs inscriptions faites depuis le même appareil tant que
 * l'app n'est pas désinstallée.
 */
const DEVICE_ID_KEY = 'bardec_device_id';

function generateUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = generateUuidV4();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}

export function getOsVersion(): string {
  return `${Platform.OS} ${Platform.Version}`;
}
