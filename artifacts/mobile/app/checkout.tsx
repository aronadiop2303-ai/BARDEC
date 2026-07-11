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
import { useCart } from '@/context/CartContext';

type Step = 1 | 2 | 3 | 4;

interface Address {
  fullName: string; street: string; city: string; country: string; phone: string; zipCode: string;
}

interface Delivery { method: 'standard' | 'express' | 'overnight'; cost: number; days: string; }
interface Payment { method: 'card' | 'paypal' | 'net30' | 'bank_transfer'; }

const DELIVERY_OPTIONS: { id: Delivery['method']; label: string; cost: number; days: string; desc: string }[] = [
  { id: 'standard', label: 'Standard', cost: 0, days: '5-7 jours', desc: 'Livraison gratuite' },
  { id: 'express', label: 'Express', cost: 15, days: '2-3 jours', desc: 'Rapide et fiable' },
  { id: 'overnight', label: 'Nuit', cost: 29, days: '1 jour ouvrable', desc: 'Livraison le lendemain' },
];

export default function CheckoutScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { items, subtotal, clearCart } = useCart();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>(1);
  const [address, setAddress] = useState<Address>({
    fullName: user?.name ?? '', street: '', city: '', country: 'France', phone: '', zipCode: '',
  });
  const [delivery, setDelivery] = useState<Delivery>({ method: 'standard', cost: 0, days: '5-7 jours' });
  const [payment, setPayment] = useState<Payment>({ method: user?.role === 'BUYER' ? 'net30' : 'card' });
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');
  const [cardName, setCardName] = useState('');

  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';
  const tax = subtotal * 0.08;
  const total = subtotal + delivery.cost + tax;

  const STEPS = [
    { id: 1, label: t('step_address'), icon: 'map-pin' },
    { id: 2, label: t('step_delivery'), icon: 'truck' },
    { id: 3, label: t('step_payment'), icon: 'credit-card' },
    { id: 4, label: t('step_confirmation'), icon: 'check-circle' },
  ];

  function handleNext() {
    if (step === 1) {
      if (!address.fullName || !address.street || !address.city) {
        Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires');
        return;
      }
    }
    if (step === 3) {
      if (!agreed) {
        Alert.alert('Conditions', 'Veuillez accepter les conditions générales');
        return;
      }
    }
    if (step < 4) {
      setStep((step + 1) as Step);
    } else {
      // Place order
      clearCart();
      router.replace('/');
    }
  }

  const OrderSummary = () => (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Récapitulatif</Text>
      {items.slice(0, 2).map(item => (
        <View key={item.productId} style={styles.summaryItem}>
          <Text style={[styles.summaryItemName, { color: colors.foreground }]} numberOfLines={1}>{item.productName}</Text>
          <Text style={[styles.summaryItemPrice, { color: colors.mutedForeground }]}>×{item.quantity} ${(item.price * item.quantity).toFixed(2)}</Text>
        </View>
      ))}
      {items.length > 2 && (
        <Text style={[styles.moreItems, { color: colors.mutedForeground }]}>+{items.length - 2} autres produits</Text>
      )}
      <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('subtotal')}</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>${subtotal.toFixed(2)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('shipping')}</Text>
        <Text style={[styles.summaryValue, { color: delivery.cost === 0 ? colors.success : colors.foreground }]}>
          {delivery.cost === 0 ? t('free') : `$${delivery.cost.toFixed(2)}`}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('tax')} (8%)</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>${tax.toFixed(2)}</Text>
      </View>
      <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.totalLabel, { color: colors.foreground }]}>{t('total')}</Text>
        <Text style={[styles.totalValue, { color: colors.primary }]}>${total.toFixed(2)}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => step > 1 ? setStep((step - 1) as Step) : router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('checkout')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Step indicator */}
      <View style={[styles.stepBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                { backgroundColor: step >= s.id ? colors.primary : colors.muted },
              ]}>
                {step > s.id
                  ? <Feather name="check" size={14} color="white" />
                  : <Text style={[styles.stepNum, { color: step === s.id ? 'white' : colors.mutedForeground }]}>{s.id}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: step >= s.id ? colors.primary : colors.mutedForeground }]}>{s.label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: step > s.id ? colors.primary : colors.muted }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">

        {/* STEP 1 — ADDRESS */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_address')}</Text>
            {[
              { key: 'fullName', label: 'Nom complet *', placeholder: 'Jean Dupont', keyboard: 'default' as const },
              { key: 'street', label: 'Adresse *', placeholder: '15 rue du Commerce', keyboard: 'default' as const },
              { key: 'city', label: 'Ville *', placeholder: 'Paris', keyboard: 'default' as const },
              { key: 'zipCode', label: 'Code postal', placeholder: '75001', keyboard: 'number-pad' as const },
              { key: 'country', label: 'Pays', placeholder: 'France', keyboard: 'default' as const },
              { key: 'phone', label: 'Téléphone', placeholder: '+33 6 12 34 56 78', keyboard: 'phone-pad' as const },
            ].map(field => (
              <View key={field.key} style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>{field.label}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={(address as any)[field.key]}
                  onChangeText={v => setAddress(a => ({ ...a, [field.key]: v }))}
                  keyboardType={field.keyboard}
                />
              </View>
            ))}
          </View>
        )}

        {/* STEP 2 — DELIVERY */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_delivery')}</Text>
            {DELIVERY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.deliveryOption,
                  {
                    backgroundColor: delivery.method === opt.id ? colors.accent : colors.card,
                    borderColor: delivery.method === opt.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setDelivery({ method: opt.id, cost: opt.cost, days: opt.days })}
              >
                <View style={[styles.deliveryRadio, { borderColor: delivery.method === opt.id ? colors.primary : colors.border }]}>
                  {delivery.method === opt.id && <View style={[styles.deliveryRadioDot, { backgroundColor: colors.primary }]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.deliveryLabelRow}>
                    <Text style={[styles.deliveryLabel, { color: colors.foreground }]}>{opt.label}</Text>
                    <Text style={[styles.deliveryCost, { color: opt.cost === 0 ? colors.success : colors.foreground }]}>
                      {opt.cost === 0 ? 'Gratuit' : `$${opt.cost}`}
                    </Text>
                  </View>
                  <Text style={[styles.deliveryDesc, { color: colors.mutedForeground }]}>{opt.desc} · {opt.days}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* STEP 3 — PAYMENT */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_payment')}</Text>

            {/* Payment methods */}
            <View style={styles.paymentMethods}>
              {(!isB2B ? [
                { id: 'card', icon: 'credit-card', label: 'Carte bancaire' },
                { id: 'paypal', icon: 'globe', label: 'PayPal' },
              ] : [
                { id: 'net30', icon: 'file-text', label: `Facture Net30 (Crédit dispo: $${user?.creditBalance?.toLocaleString() ?? 0})` },
                { id: 'bank_transfer', icon: 'arrow-right-circle', label: 'Virement bancaire' },
              ]).map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.paymentOption,
                    {
                      backgroundColor: payment.method === m.id ? colors.accent : colors.card,
                      borderColor: payment.method === m.id ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setPayment({ method: m.id as Payment['method'] })}
                >
                  <Feather name={m.icon as any} size={20} color={payment.method === m.id ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.paymentLabel, { color: colors.foreground }]}>{m.label}</Text>
                  {payment.method === m.id && <Feather name="check-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Card form */}
            {payment.method === 'card' && (
              <View style={styles.cardForm}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Nom sur la carte"
                  placeholderTextColor={colors.mutedForeground}
                  value={cardName}
                  onChangeText={setCardName}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Numéro de carte"
                  placeholderTextColor={colors.mutedForeground}
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  keyboardType="number-pad"
                  maxLength={19}
                />
                <View style={styles.cardRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="MM/AA"
                    placeholderTextColor={colors.mutedForeground}
                    value={cardExpiry}
                    onChangeText={setCardExpiry}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="CVV"
                    placeholderTextColor={colors.mutedForeground}
                    value={cardCVV}
                    onChangeText={setCardCVV}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>
            )}

            {/* B2B PO number */}
            {isB2B && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>{t('purchase_order')} (optionnel)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="PO-2024-0123"
                  placeholderTextColor={colors.mutedForeground}
                  value={purchaseOrder}
                  onChangeText={setPurchaseOrder}
                />
              </View>
            )}

            <OrderSummary />

            {/* Agreement */}
            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)}>
              <View style={[styles.checkbox, { borderColor: agreed ? colors.primary : colors.border, backgroundColor: agreed ? colors.primary : 'transparent' }]}>
                {agreed && <Feather name="check" size={12} color="white" />}
              </View>
              <Text style={[styles.agreeText, { color: colors.mutedForeground }]}>
                J'accepte les conditions générales de vente et la politique de confidentialité BARDEC.
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 4 — CONFIRMATION */}
        {step === 4 && (
          <View style={styles.confirmationCard}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.accent }]}>
              <Feather name="check-circle" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>{t('thank_you')}</Text>
            <Text style={[styles.confirmSubtitle, { color: colors.mutedForeground }]}>{t('order_confirmed')}</Text>
            <Text style={[styles.confirmOrder, { color: colors.primary }]}>BDC-{Date.now().toString().slice(-8)}</Text>

            {isB2B && (
              <View style={[styles.approvalNote, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' }]}>
                <Feather name="clock" size={16} color="#7C3AED" />
                <Text style={[styles.approvalNoteText, { color: '#7C3AED' }]}>
                  Votre commande est soumise pour approbation. Vous recevrez une notification dès validation.
                </Text>
              </View>
            )}

            <OrderSummary />
          </View>
        )}
      </ScrollView>

      {/* Bottom action */}
      <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={handleNext}
        >
          {step === 3 ? (
            <>
              <Feather name={isB2B ? 'send' : 'lock'} size={18} color="white" />
              <Text style={styles.nextBtnText}>
                {isB2B ? 'Soumettre pour approbation' : `Payer $${total.toFixed(2)}`}
              </Text>
            </>
          ) : step === 4 ? (
            <>
              <Feather name="home" size={18} color="white" />
              <Text style={styles.nextBtnText}>Retour à l'accueil</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextBtnText}>{t('continue')}</Text>
              <Feather name="arrow-right" size={18} color="white" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  stepBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNum: { fontSize: 12, fontWeight: '700' },
  stepLabel: { fontSize: 10, fontWeight: '500' },
  stepLine: { flex: 1, height: 2, marginBottom: 14, marginHorizontal: 4 },
  body: { flex: 1 },
  stepContent: { gap: 14 },
  stepTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  deliveryOption: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 2, padding: 14, gap: 12,
  },
  deliveryRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  deliveryRadioDot: { width: 10, height: 10, borderRadius: 5 },
  deliveryLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deliveryLabel: { fontSize: 15, fontWeight: '600' },
  deliveryCost: { fontSize: 15, fontWeight: '700' },
  deliveryDesc: { fontSize: 13, marginTop: 2 },
  paymentMethods: { gap: 10 },
  paymentOption: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 2, padding: 14, gap: 12,
  },
  paymentLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  cardForm: { gap: 10 },
  cardRow: { flexDirection: 'row', gap: 10 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  agreeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  summaryCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, gap: 10,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItemName: { flex: 1, fontSize: 13, marginRight: 8 },
  summaryItemPrice: { fontSize: 13 },
  moreItems: { fontSize: 12, fontStyle: 'italic' },
  summaryDivider: { height: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '800' },
  confirmationCard: { alignItems: 'center', gap: 16, paddingTop: 20 },
  confirmIcon: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center',
  },
  confirmTitle: { fontSize: 24, fontWeight: '800' },
  confirmSubtitle: { fontSize: 16, textAlign: 'center' },
  confirmOrder: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  approvalNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, padding: 14, borderRadius: 12, borderWidth: 1,
    width: '100%',
  },
  approvalNoteText: { flex: 1, fontSize: 13, lineHeight: 18 },
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 5,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 15, borderRadius: 14,
    shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
