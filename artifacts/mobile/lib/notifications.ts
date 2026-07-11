import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds = 1
) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: data ?? {}, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds },
  });
}

export async function sendOrderNotification(orderNumber: string, status: string) {
  const messages: Record<string, { title: string; body: string }> = {
    approved: { title: '✅ Commande approuvée', body: `Commande ${orderNumber} approuvée et en traitement.` },
    shipped: { title: '📦 Commande expédiée', body: `Commande ${orderNumber} en route. Suivez votre livraison.` },
    out_for_delivery: { title: '🚚 Livraison en cours', body: `Commande ${orderNumber} sera livrée aujourd'hui.` },
    completed: { title: '🎉 Livraison confirmée', body: `Commande ${orderNumber} livrée. Laissez un avis!` },
    cancelled: { title: '❌ Commande annulée', body: `Commande ${orderNumber} a été annulée.` },
  };
  const msg = messages[status];
  if (msg) {
    await scheduleLocalNotification(msg.title, msg.body, { orderNumber, status });
  }
}

export async function sendRatingPrompt(completedOrderCount: number) {
  if (completedOrderCount === 5 || completedOrderCount % 10 === 0) {
    await scheduleLocalNotification(
      '⭐ Évaluez BARDEC',
      'Vous avez complété 5 commandes! Votre avis nous aide à améliorer l\'app.',
      { type: 'rating_prompt' },
      5
    );
  }
}

export async function clearAllNotifications() {
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function addNotificationListener(handler: (n: Notifications.Notification) => void) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addResponseListener(handler: (r: Notifications.NotificationResponse) => void) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
