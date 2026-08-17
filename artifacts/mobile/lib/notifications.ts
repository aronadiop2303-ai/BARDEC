/**
 * Push / local notification helpers.
 *
 * expo-notifications removed Android remote-notification support from Expo Go
 * starting with SDK 53. The module still exists but calling certain APIs at
 * module-load time (setNotificationHandler) throws on Expo Go Android, which
 * crashes every screen that transitively imports this file.
 *
 * Guard: only initialise when the native module is actually available.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// Dynamic import so the module-level side-effect never runs on unsupported runtimes.
let Notifications: typeof import('expo-notifications') | null = null;

function getNotifications() {
  if (Notifications) return Notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Notifications = require('expo-notifications') as typeof import('expo-notifications');
    // setNotificationHandler must be called once after the first successful load.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Module unavailable (Expo Go Android SDK 53+) — degrade gracefully.
    Notifications = null;
  }
  return Notifications;
}

// Do NOT eagerly load on module import.
// `expo-notifications` in Expo Go SDK 53+ throws a non-catchable error when
// `require()` is called at module-load time (even inside try/catch — Expo Go
// intercepts it via its own error channel before JS can catch it).
// All functions call getNotifications() lazily on first use instead.

export async function requestNotificationPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// Registers this device's Expo push token for `userId` so the send-push
// Edge Function can reach it later, even when the app is closed/backgrounded.
// Safe to call on every app start / login — upsert on the token's UNIQUE
// constraint means re-registering the same device just refreshes device_info.
export async function registerPushToken(userId: string, supabase: SupabaseClient): Promise<void> {
  const N = getNotifications();
  if (!N) return; // Expo Go Android SDK 53+, or web — no remote push here
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await N.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, device_info: `${Platform.OS} ${Platform.Version}` },
      { onConflict: 'token' },
    );
  } catch {
    // Real device required (no remote push in Expo Go on Android) — ignore failures here.
  }
}

// Remote push for the main order cycle — notifies the OTHER party (buyer or
// vendor), unlike scheduleLocalNotification which only fires on this device.
// Best-effort: never blocks the calling UI flow on a push failure.
export async function notifyOrderEvent(supabase: SupabaseClient, orderId: string, event: string): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: { mode: 'order', order_id: orderId, event } });
  } catch {
    // ignore — push is a nice-to-have, not a blocker for the status update itself
  }
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds = 1,
) {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({
      content: { title, body, data: data ?? {}, sound: true },
      trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds },
    });
  } catch { /* ignore scheduling failures */ }
}

export async function sendOrderNotification(orderNumber: string, status: string) {
  const messages: Record<string, { title: string; body: string }> = {
    approved:         { title: '✅ Commande approuvée',   body: `Commande ${orderNumber} approuvée et en traitement.` },
    shipped:          { title: '📦 Commande expédiée',    body: `Commande ${orderNumber} en route. Suivez votre livraison.` },
    out_for_delivery: { title: '🚚 Livraison en cours',   body: `Commande ${orderNumber} sera livrée aujourd'hui.` },
    completed:        { title: '🎉 Livraison confirmée',  body: `Commande ${orderNumber} livrée. Laissez un avis!` },
    cancelled:        { title: '❌ Commande annulée',     body: `Commande ${orderNumber} a été annulée.` },
  };
  const msg = messages[status];
  if (msg) await scheduleLocalNotification(msg.title, msg.body, { orderNumber, status });
}

export async function sendRatingPrompt(completedOrderCount: number) {
  if (completedOrderCount === 5 || completedOrderCount % 10 === 0) {
    await scheduleLocalNotification(
      '⭐ Évaluez BARDEC',
      "Vous avez complété 5 commandes! Votre avis nous aide à améliorer l'app.",
      { type: 'rating_prompt' },
      5,
    );
  }
}

export async function clearAllNotifications() {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.dismissAllNotificationsAsync();
    await N.cancelAllScheduledNotificationsAsync();
  } catch { /* ignore */ }
}

export function addNotificationListener(
  handler: (n: import('expo-notifications').Notification) => void,
) {
  const N = getNotifications();
  if (!N) return { remove: () => {} };
  try {
    return N.addNotificationReceivedListener(handler);
  } catch {
    return { remove: () => {} };
  }
}

export function addResponseListener(
  handler: (r: import('expo-notifications').NotificationResponse) => void,
) {
  const N = getNotifications();
  if (!N) return { remove: () => {} };
  try {
    return N.addNotificationResponseReceivedListener(handler);
  } catch {
    return { remove: () => {} };
  }
}
