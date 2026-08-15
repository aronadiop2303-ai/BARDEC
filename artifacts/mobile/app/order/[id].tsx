import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { Order, MOCK_ORDERS, STATUS_COLORS } from '@/constants/mockData';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { mapDbOrder } from '@/lib/orders';
import { toUserMessage } from '@/lib/errors';
import type { TranslationKey } from '@/constants/translations';

const TRACKING_STEPS: { status: string; label: string; icon: string }[] = [
  { status: 'pending',           label: 'Commande reçue',    icon: 'clock' },
  { status: 'approved',          label: 'Approuvée',         icon: 'check-circle' },
  { status: 'shipped',           label: 'Expédiée',          icon: 'package' },
  { status: 'out_for_delivery',  label: 'En livraison',      icon: 'truck' },
  { status: 'completed',         label: 'Livrée',            icon: 'check-square' },
];

function trackingIndex(status: string): number {
  if (status === 'cancelled') return -1;
  // pending_approval / ready_for_delivery sit between two real steps visually
  if (status === 'pending_approval') return 0;
  if (status === 'ready_for_delivery') return 2;
  const i = TRACKING_STEPS.findIndex(s => s.status === status);
  return i === -1 ? 0 : i;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { addItem } = useCart();
  const insets = useSafeAreaInsets();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!id) { setLoading(false); return; }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        setOrder(MOCK_ORDERS.find(o => o.id === id) ?? null);
      } else {
        setOrder(mapDbOrder(data));
      }
    } else {
      setOrder(MOCK_ORDERS.find(o => o.id === id) ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleConfirmReceipt = () => {
    if (!order) return;
    Alert.alert(
      'Confirmer la réception',
      `Confirmez-vous la bonne réception de la commande ${order.orderNumber} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setConfirming(true);
            if (isSupabaseConfigured && supabase) {
              const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
              setConfirming(false);
              if (error) { Alert.alert('Erreur', toUserMessage('orderDetail:confirmReceipt', error, 'Impossible de confirmer la réception. Réessaie dans un instant.')); return; }
            } else {
              setConfirming(false);
            }
            setOrder(prev => prev ? { ...prev, status: 'completed' } : prev);
            Alert.alert(
              '✓ Réception confirmée',
              'Souhaitez-vous laisser un avis sur ce produit ?',
              [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Laisser un avis', onPress: () => { setReviewComment(''); setReviewRating(5); setReviewVisible(true); } },
              ],
            );
          },
        },
      ],
    );
  };

  const handleSubmitReview = async () => {
    if (!order || !user) return;
    const productId = order.items[0]?.productId;
    if (!productId) { Alert.alert('Erreur', 'Produit introuvable.'); return; }

    setSubmittingReview(true);
    if (isSupabaseConfigured && supabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const realId = authUser?.id;
      if (!realId) {
        setSubmittingReview(false);
        Alert.alert('Session expirée', 'Reconnecte-toi et réessaie.');
        return;
      }
      const { error } = await supabase.from('reviews').insert({
        product_id: productId,
        order_id:   order.id,
        user_id:    realId,
        rating:     reviewRating,
        comment:    reviewComment.trim() || null,
        verified:   true,
      });
      setSubmittingReview(false);
      if (error) { Alert.alert('Erreur', toUserMessage('orderDetail:submitReview', error, 'Impossible d\'envoyer votre avis. Réessaie dans un instant.')); return; }
    } else {
      setSubmittingReview(false);
    }
    Alert.alert('✓ Merci !', 'Votre avis a été publié.');
    setReviewVisible(false);
  };

  const handleReorder = () => {
    if (!order) return;
    order.items.forEach(item => {
      addItem({
        productId:   item.productId,
        productName: item.productName,
        price:       item.price,
        quantity:    item.quantity,
        image:       item.image,
        maxStock:    999,
      });
    });
    Alert.alert('✓ Ajouté au panier', 'Les articles de cette commande ont été ajoutés à ton panier.', [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Voir le panier', onPress: () => router.push('/(tabs)/cart') },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Commande introuvable.</Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[order.status] ?? colors.mutedForeground;
  const stepIdx = trackingIndex(order.status);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {order.orderNumber}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {/* Status + tracking */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{t(order.status as TranslationKey)}</Text>
            </View>
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{order.date}</Text>
          </View>

          {order.status !== 'cancelled' && (
            <View style={styles.tracking}>
              {TRACKING_STEPS.map((s, i) => {
                const reached = i <= stepIdx;
                return (
                  <View key={s.status} style={styles.trackingStep}>
                    <View style={styles.trackingStepRow}>
                      <View style={[styles.trackingDot, { backgroundColor: reached ? colors.primary : colors.muted }]}>
                        <Feather name={s.icon} size={12} color={reached ? 'white' : colors.mutedForeground} />
                      </View>
                      {i < TRACKING_STEPS.length - 1 && (
                        <View style={[styles.trackingLine, { backgroundColor: i < stepIdx ? colors.primary : colors.muted }]} />
                      )}
                    </View>
                    <Text style={[styles.trackingLabel, { color: reached ? colors.foreground : colors.mutedForeground }]}>
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {order.trackingNumber && (
            <View style={[styles.trackingNumberRow, { borderTopColor: colors.border }]}>
              <Feather name="truck" size={14} color={colors.mutedForeground} />
              <Text style={[styles.trackingNumberText, { color: colors.foreground }]}>
                N° de suivi : {order.trackingNumber}
              </Text>
            </View>
          )}
          {order.estimatedDelivery && (
            <View style={styles.trackingNumberRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={[styles.trackingNumberText, { color: colors.foreground }]}>
                Livraison estimée : {new Date(order.estimatedDelivery).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Articles</Text>
          {order.items.map((item, i) => (
            <View key={`${item.productId}-${i}`} style={[styles.itemRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
              ) : (
                <View style={[styles.itemImage, { backgroundColor: colors.muted }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>{item.productName}</Text>
                <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
                  {item.quantity} × ${item.price.toFixed(2)}
                </Text>
              </View>
              <Text style={[styles.itemTotal, { color: colors.foreground }]}>
                ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Sous-total</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>${order.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Livraison</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>${order.shipping.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Taxes</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>${order.tax.toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.grandTotalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: colors.primary }]}>${order.total.toFixed(2)}</Text>
          </View>
          {order.purchaseOrderNumber && (
            <Text style={[styles.poText, { color: colors.mutedForeground }]}>
              Bon de commande : {order.purchaseOrderNumber}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={{ gap: 10 }}>
          {order.status === 'shipped' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
              onPress={handleConfirmReceipt}
              disabled={confirming}
            >
              {confirming ? <ActivityIndicator size="small" color="white" /> : <Feather name="check-circle" size={16} color="white" />}
              <Text style={styles.actionBtnText}>Confirmer la réception</Text>
            </TouchableOpacity>
          )}
          {order.status === 'completed' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setReviewComment(''); setReviewRating(5); setReviewVisible(true); }}
            >
              <Feather name="star" size={16} color="white" />
              <Text style={styles.actionBtnText}>Laisser un avis</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
            onPress={handleReorder}
          >
            <Feather name="repeat" size={16} color={colors.primary} />
            <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Recommander</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Review modal */}
      <Modal visible={reviewVisible} animationType="slide" transparent onRequestClose={() => setReviewVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.reviewOverlay}>
          <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.reviewTitle, { color: colors.foreground }]}>Laisser un avis</Text>
            <Text style={[styles.reviewProduct, { color: colors.mutedForeground }]} numberOfLines={1}>
              {order.items[0]?.productName}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <Feather name="star" size={32} color={n <= reviewRating ? '#F59E0B' : colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.reviewInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Votre commentaire (optionnel)"
              placeholderTextColor={colors.mutedForeground}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.reviewActions}>
              <TouchableOpacity style={[styles.reviewCancel, { borderColor: colors.border }]} onPress={() => setReviewVisible(false)}>
                <Text style={{ color: colors.foreground, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewSubmit, { backgroundColor: colors.primary, opacity: submittingReview ? 0.7 : 1 }]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview && <ActivityIndicator size="small" color="white" />}
                <Text style={{ color: 'white', fontWeight: '700' }}>Publier l'avis</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 15 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  backBtnText: { color: 'white', fontWeight: '700' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  dateText: { fontSize: 12 },
  tracking: { flexDirection: 'row', marginTop: 16, marginBottom: 4 },
  trackingStep: { flex: 1, alignItems: 'center' },
  trackingStepRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  trackingDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginRight: 'auto' },
  trackingLine: { position: 'absolute', left: '50%', right: '-50%', height: 2, top: 11 },
  trackingLabel: { fontSize: 9, textAlign: 'center', marginTop: 6 },
  trackingNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: 'transparent' },
  trackingNumberText: { fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  itemImage: { width: 48, height: 48, borderRadius: 8 },
  itemName: { fontSize: 13, fontWeight: '600' },
  itemMeta: { fontSize: 12, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 13 },
  grandTotalRow: { borderTopWidth: 1, marginTop: 6, paddingTop: 10 },
  grandTotalLabel: { fontSize: 15, fontWeight: '700' },
  grandTotalValue: { fontSize: 17, fontWeight: '800' },
  poText: { fontSize: 12, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  actionBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  actionBtnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5 },
  actionBtnOutlineText: { fontSize: 14, fontWeight: '700' },
  reviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  reviewCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 14 },
  reviewTitle: { fontSize: 18, fontWeight: '800' },
  reviewProduct: { fontSize: 13, marginTop: -8 },
  starsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  reviewInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80 },
  reviewActions: { flexDirection: 'row', gap: 10 },
  reviewCancel: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  reviewSubmit: { flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
