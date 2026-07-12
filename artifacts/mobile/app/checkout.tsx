import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';

type Step = 1 | 2 | 3 | 4;
type DeliveryType = 'home' | 'drone' | 'relay_point' | 'store_pickup';
type HomeMethod = 'standard' | 'express' | 'overnight';

interface Address {
  fullName: string; street: string; city: string; country: string; phone: string; zipCode: string;
}

interface RelayPoint {
  id: string; name: string; address: string; hours: string; distance: string;
}

interface StorePickup {
  id: string; name: string; address: string; hours: string; contact: string;
}

interface DeliveryState {
  type: DeliveryType;
  homeMethod: HomeMethod;
  cost: number;
  days: string;
  relayPoint: RelayPoint | null;
  storePickup: StorePickup | null;
  droneEligible: boolean;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

// Simulated drone eligibility (in production: check address zone against coverage map)
function checkDroneEligibility(city: string): boolean {
  const eligibleCities = ['paris', 'dakar', 'abidjan', 'casablanca', 'dubai', 'abuja'];
  return eligibleCities.includes(city.toLowerCase().trim());
}

const RELAY_POINTS: RelayPoint[] = [
  { id: 'r1', name: 'Relais Marché Central',    address: '12 Rue du Marché, Paris 75001',       hours: 'Lun–Sam 8h–20h, Dim 9h–13h',      distance: '0.3 km' },
  { id: 'r2', name: 'Point Relais Expo Store',  address: '47 Avenue de la République, 75011',  hours: 'Lun–Ven 9h–19h, Sam 10h–18h',     distance: '0.8 km' },
  { id: 'r3', name: 'Tabac Presse Voltaire',    address: '89 Boulevard Voltaire, 75011',        hours: 'Lun–Dim 7h–22h',                  distance: '1.1 km' },
  { id: 'r4', name: 'Bureau de Poste Bastille', address: '1 Rue du Faubourg Saint-Antoine, 75012', hours: 'Lun–Ven 8h30–18h, Sam 8h30–12h', distance: '1.4 km' },
  { id: 'r5', name: 'Carrefour City Oberkampf', address: '125 Rue Oberkampf, 75011',            hours: 'Lun–Sam 7h–22h, Dim 9h–20h',      distance: '1.7 km' },
];

const STORE_PICKUPS: StorePickup[] = [
  { id: 's1', name: 'BARDEC Hub Paris Centre',  address: '8 Rue de Rivoli, 75001 Paris',          hours: 'Lun–Ven 9h–18h, Sam 10h–17h',  contact: '+33 1 23 45 67 89' },
  { id: 's2', name: 'Showroom Opéra',           address: '24 Boulevard des Capucines, 75009',     hours: 'Lun–Sam 9h–19h',               contact: '+33 1 98 76 54 32' },
  { id: 's3', name: 'Point Vente Nation',        address: '33 Cours de Vincennes, 75020',          hours: 'Mar–Sam 10h–18h',               contact: '+33 1 11 22 33 44' },
];

const HOME_OPTIONS: { id: HomeMethod; label: string; cost: number; days: string; desc: string }[] = [
  { id: 'standard', label: 'Standard',   cost: 0,  days: '5–7 jours',       desc: 'Livraison gratuite à domicile' },
  { id: 'express',  label: 'Express',    cost: 15, days: '2–3 jours',       desc: 'Rapide et fiable' },
  { id: 'overnight',label: 'Nuit',       cost: 29, days: '1 jour ouvrable', desc: 'Livraison le lendemain avant 10h' },
];

// ── Delivery mode card definition ─────────────────────────────────────────────
const DELIVERY_MODES: {
  type: DeliveryType;
  icon: string;
  label: string;
  sublabel: string;
  color: string;
  baseCost: number;
}[] = [
  { type: 'home',         icon: 'home',       label: 'Livraison à domicile', sublabel: 'Standard · Express · Nuit',  color: '#1A56DB', baseCost: 0  },
  { type: 'drone',        icon: 'wind',        label: 'Livraison par drone',  sublabel: 'Zones éligibles uniquement', color: '#7C3AED', baseCost: 12 },
  { type: 'relay_point',  icon: 'map-pin',    label: 'Point relais',         sublabel: 'Retrait proche de chez vous', color: '#0EA5E9', baseCost: 0  },
  { type: 'store_pickup', icon: 'shopping-bag',label: 'Retrait en magasin',  sublabel: 'Gratuit · Chez le vendeur',  color: '#22C55E', baseCost: 0  },
];

// ── Component ─────────────────────────────────────────────────────────────────

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
  const [delivery, setDelivery] = useState<DeliveryState>({
    type: 'home',
    homeMethod: 'standard',
    cost: 0,
    days: '5–7 jours',
    relayPoint: null,
    storePickup: null,
    droneEligible: false,
  });
  const [payment, setPayment] = useState<{ method: 'card' | 'paypal' | 'net30' | 'bank_transfer' }>({
    method: user?.role === 'BUYER' ? 'net30' : 'card',
  });
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
    { id: 1, label: t('step_address'),      icon: 'map-pin'     },
    { id: 2, label: t('step_delivery'),     icon: 'truck'       },
    { id: 3, label: t('step_payment'),      icon: 'credit-card' },
    { id: 4, label: t('step_confirmation'), icon: 'check-circle'},
  ];

  // ── Handlers ────────────────────────────────────────────────────────────────

  function selectDeliveryType(type: DeliveryType) {
    if (type === 'drone') {
      const eligible = checkDroneEligibility(address.city);
      if (!eligible) {
        Alert.alert(
          'Zone non éligible',
          `La livraison par drone n'est pas disponible pour "${address.city || 'votre ville'}". Zones actuellement couvertes : Paris, Dakar, Abidjan, Casablanca, Dubai, Abuja.`,
        );
        return;
      }
      setDelivery(d => ({ ...d, type: 'drone', cost: 12, days: '2–4 heures', droneEligible: true }));
    } else if (type === 'home') {
      const opt = HOME_OPTIONS.find(o => o.id === delivery.homeMethod)!;
      setDelivery(d => ({ ...d, type: 'home', cost: opt.cost, days: opt.days }));
    } else if (type === 'relay_point') {
      setDelivery(d => ({ ...d, type: 'relay_point', cost: 0, days: '3–5 jours' }));
    } else if (type === 'store_pickup') {
      setDelivery(d => ({ ...d, type: 'store_pickup', cost: 0, days: 'Dès disponibilité' }));
    }
  }

  function selectHomeMethod(method: HomeMethod) {
    const opt = HOME_OPTIONS.find(o => o.id === method)!;
    setDelivery(d => ({ ...d, homeMethod: method, cost: opt.cost, days: opt.days }));
  }

  function selectRelayPoint(rp: RelayPoint) {
    setDelivery(d => ({ ...d, relayPoint: rp, storePickup: null }));
  }

  function selectStore(store: StorePickup) {
    setDelivery(d => ({ ...d, storePickup: store, relayPoint: null }));
  }

  function handleNext() {
    if (step === 1) {
      if (!address.fullName || !address.street || !address.city) {
        Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires.');
        return;
      }
    }
    if (step === 2) {
      if (delivery.type === 'relay_point' && !delivery.relayPoint) {
        Alert.alert('Point relais', 'Veuillez sélectionner un point relais.');
        return;
      }
      if (delivery.type === 'store_pickup' && !delivery.storePickup) {
        Alert.alert('Magasin', 'Veuillez sélectionner un point de retrait.');
        return;
      }
    }
    if (step === 3 && !agreed) {
      Alert.alert('Conditions', 'Veuillez accepter les conditions générales.');
      return;
    }
    if (step < 4) {
      setStep((step + 1) as Step);
    } else {
      clearCart();
      router.replace('/');
    }
  }

  // ── Delivery summary label ───────────────────────────────────────────────────
  function deliverySummaryLabel(): string {
    switch (delivery.type) {
      case 'home':         return `Domicile · ${HOME_OPTIONS.find(o=>o.id===delivery.homeMethod)?.label}`;
      case 'drone':        return 'Livraison par drone';
      case 'relay_point':  return delivery.relayPoint ? `Point relais · ${delivery.relayPoint.name}` : 'Point relais';
      case 'store_pickup': return delivery.storePickup ? `Retrait · ${delivery.storePickup.name}` : 'Retrait magasin';
    }
  }

  // ── Sub-components ───────────────────────────────────────────────────────────

  const OrderSummary = () => (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Récapitulatif</Text>
      {items.slice(0, 2).map(item => (
        <View key={item.productId} style={styles.summaryRow}>
          <Text style={[styles.summaryItemName, { color: colors.foreground }]} numberOfLines={1}>{item.productName}</Text>
          <Text style={[styles.summaryItemPrice, { color: colors.mutedForeground }]}>×{item.quantity} ${(item.price * item.quantity).toFixed(2)}</Text>
        </View>
      ))}
      {items.length > 2 && (
        <Text style={[styles.moreItems, { color: colors.mutedForeground }]}>+{items.length - 2} autres produits</Text>
      )}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('subtotal')}</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>${subtotal.toFixed(2)}</Text>
      </View>
      {/* Delivery line with mode label */}
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
          {deliverySummaryLabel()}
        </Text>
        <Text style={[styles.summaryValue, { color: delivery.cost === 0 ? '#22C55E' : colors.foreground }]}>
          {delivery.cost === 0 ? 'Gratuit' : `$${delivery.cost.toFixed(2)}`}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('tax')} (8%)</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>${tax.toFixed(2)}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.totalLabel, { color: colors.foreground }]}>{t('total')}</Text>
        <Text style={[styles.totalValue, { color: colors.primary }]}>${total.toFixed(2)}</Text>
      </View>
    </View>
  );

  // Mode card (top-level delivery type selector)
  const ModeCard = ({ mode }: { mode: typeof DELIVERY_MODES[number] }) => {
    const selected = delivery.type === mode.type;
    return (
      <TouchableOpacity
        style={[
          styles.modeCard,
          {
            borderColor: selected ? mode.color : colors.border,
            backgroundColor: selected ? mode.color + '12' : colors.card,
          },
        ]}
        onPress={() => selectDeliveryType(mode.type)}
        activeOpacity={0.8}
      >
        <View style={[styles.modeIconBox, { backgroundColor: mode.color + '20' }]}>
          <Feather name={mode.icon as any} size={22} color={mode.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeLabel, { color: colors.foreground }]}>{mode.label}</Text>
          <Text style={[styles.modeSublabel, { color: colors.mutedForeground }]}>{mode.sublabel}</Text>
        </View>
        {mode.baseCost === 0
          ? <Text style={[styles.modeCost, { color: '#22C55E' }]}>Gratuit</Text>
          : <Text style={[styles.modeCost, { color: colors.foreground }]}>+${mode.baseCost}</Text>
        }
        {selected && (
          <View style={[styles.modeCheck, { backgroundColor: mode.color }]}>
            <Feather name="check" size={12} color="white" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

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
              <View style={[styles.stepCircle, { backgroundColor: step >= s.id ? colors.primary : colors.muted }]}>
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

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── STEP 1 — ADDRESS ── */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_address')}</Text>
            {[
              { key: 'fullName', label: 'Nom complet *',  placeholder: 'Jean Dupont',            keyboard: 'default'    as const },
              { key: 'street',   label: 'Adresse *',       placeholder: '15 rue du Commerce',     keyboard: 'default'    as const },
              { key: 'city',     label: 'Ville *',          placeholder: 'Paris',                  keyboard: 'default'    as const },
              { key: 'zipCode',  label: 'Code postal',      placeholder: '75001',                  keyboard: 'number-pad' as const },
              { key: 'country',  label: 'Pays',             placeholder: 'France',                 keyboard: 'default'    as const },
              { key: 'phone',    label: 'Téléphone',        placeholder: '+33 6 12 34 56 78',      keyboard: 'phone-pad'  as const },
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

        {/* ── STEP 2 — DELIVERY ── */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_delivery')}</Text>
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
              Choisissez votre mode de livraison
            </Text>

            {/* Mode selector cards */}
            {DELIVERY_MODES.map(mode => <ModeCard key={mode.type} mode={mode} />)}

            {/* ─ Sub-options: HOME ─ */}
            {delivery.type === 'home' && (
              <View style={[styles.subSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>Choisir la vitesse</Text>
                {HOME_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.subOption,
                      {
                        backgroundColor: delivery.homeMethod === opt.id ? '#1A56DB12' : 'transparent',
                        borderColor: delivery.homeMethod === opt.id ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => selectHomeMethod(opt.id)}
                  >
                    <View style={[styles.radio, { borderColor: delivery.homeMethod === opt.id ? colors.primary : colors.border }]}>
                      {delivery.homeMethod === opt.id && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.subOptionRow}>
                        <Text style={[styles.subOptionLabel, { color: colors.foreground }]}>{opt.label}</Text>
                        <Text style={[styles.subOptionCost, { color: opt.cost === 0 ? '#22C55E' : colors.foreground }]}>
                          {opt.cost === 0 ? 'Gratuit' : `$${opt.cost}`}
                        </Text>
                      </View>
                      <Text style={[styles.subOptionDesc, { color: colors.mutedForeground }]}>{opt.desc} · {opt.days}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ─ Sub-options: DRONE ─ */}
            {delivery.type === 'drone' && (
              <View style={[styles.subSection, { backgroundColor: '#7C3AED0D', borderColor: '#7C3AED' }]}>
                <LinearGradient
                  colors={['#7C3AED18', 'transparent']}
                  style={styles.droneHeader}
                >
                  <Feather name="wind" size={28} color="#7C3AED" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.subSectionTitle, { color: '#7C3AED' }]}>Livraison par drone ✓</Text>
                    <Text style={[styles.droneZoneOk, { color: '#22C55E' }]}>
                      ✓ Zone "{address.city || 'votre ville'}" éligible
                    </Text>
                  </View>
                </LinearGradient>
                <View style={styles.droneDetails}>
                  {[
                    { icon: 'clock', label: 'Délai estimé',   value: '2–4 heures' },
                    { icon: 'package', label: 'Poids max',    value: '5 kg' },
                    { icon: 'map-pin', label: 'Livraison',    value: 'Balcon ou cour accessible' },
                    { icon: 'dollar-sign', label: 'Supplément', value: '$12.00' },
                  ].map((d, i) => (
                    <View key={i} style={styles.droneDetailRow}>
                      <Feather name={d.icon as any} size={14} color="#7C3AED" />
                      <Text style={[styles.droneDetailLabel, { color: colors.mutedForeground }]}>{d.label}</Text>
                      <Text style={[styles.droneDetailValue, { color: colors.foreground }]}>{d.value}</Text>
                    </View>
                  ))}
                </View>
                <View style={[styles.droneNote, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                  <Feather name="alert-triangle" size={14} color="#F59E0B" />
                  <Text style={styles.droneNoteText}>
                    Assurez-vous qu'un espace dégagé est disponible pour la pose du colis.
                  </Text>
                </View>
              </View>
            )}

            {/* ─ Sub-options: RELAY POINT ─ */}
            {delivery.type === 'relay_point' && (
              <View style={[styles.subSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>
                  Points relais proches ({RELAY_POINTS.length} disponibles)
                </Text>
                {RELAY_POINTS.map(rp => {
                  const selected = delivery.relayPoint?.id === rp.id;
                  return (
                    <TouchableOpacity
                      key={rp.id}
                      style={[
                        styles.relayCard,
                        {
                          borderColor: selected ? '#0EA5E9' : colors.border,
                          backgroundColor: selected ? '#0EA5E912' : colors.background,
                        },
                      ]}
                      onPress={() => selectRelayPoint(rp)}
                    >
                      <View style={[styles.relayIconBox, { backgroundColor: selected ? '#0EA5E920' : colors.muted }]}>
                        <Feather name="map-pin" size={16} color={selected ? '#0EA5E9' : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={styles.relayNameRow}>
                          <Text style={[styles.relayName, { color: colors.foreground }]}>{rp.name}</Text>
                          <View style={[styles.distanceBadge, { backgroundColor: colors.muted }]}>
                            <Text style={[styles.distanceText, { color: colors.mutedForeground }]}>{rp.distance}</Text>
                          </View>
                        </View>
                        <Text style={[styles.relayAddress, { color: colors.mutedForeground }]}>{rp.address}</Text>
                        <View style={styles.relayHoursRow}>
                          <Feather name="clock" size={11} color={colors.mutedForeground} />
                          <Text style={[styles.relayHours, { color: colors.mutedForeground }]}>{rp.hours}</Text>
                        </View>
                      </View>
                      {selected && <Feather name="check-circle" size={20} color="#0EA5E9" />}
                    </TouchableOpacity>
                  );
                })}
                <View style={[styles.relayPriceNote, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}>
                  <Feather name="tag" size={13} color="#22C55E" />
                  <Text style={styles.relayPriceNoteText}>Retrait en point relais — Livraison gratuite</Text>
                </View>
              </View>
            )}

            {/* ─ Sub-options: STORE PICKUP ─ */}
            {delivery.type === 'store_pickup' && (
              <View style={[styles.subSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>Points de retrait vendeur</Text>
                {STORE_PICKUPS.map(store => {
                  const selected = delivery.storePickup?.id === store.id;
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[
                        styles.relayCard,
                        {
                          borderColor: selected ? '#22C55E' : colors.border,
                          backgroundColor: selected ? '#22C55E12' : colors.background,
                        },
                      ]}
                      onPress={() => selectStore(store)}
                    >
                      <View style={[styles.relayIconBox, { backgroundColor: selected ? '#22C55E20' : colors.muted }]}>
                        <Feather name="shopping-bag" size={16} color={selected ? '#22C55E' : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.relayName, { color: colors.foreground }]}>{store.name}</Text>
                        <Text style={[styles.relayAddress, { color: colors.mutedForeground }]}>{store.address}</Text>
                        <View style={styles.relayHoursRow}>
                          <Feather name="clock" size={11} color={colors.mutedForeground} />
                          <Text style={[styles.relayHours, { color: colors.mutedForeground }]}>{store.hours}</Text>
                        </View>
                        <View style={styles.relayHoursRow}>
                          <Feather name="phone" size={11} color={colors.mutedForeground} />
                          <Text style={[styles.relayHours, { color: colors.mutedForeground }]}>{store.contact}</Text>
                        </View>
                      </View>
                      {selected && <Feather name="check-circle" size={20} color="#22C55E" />}
                    </TouchableOpacity>
                  );
                })}
                <View style={[styles.relayPriceNote, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}>
                  <Feather name="tag" size={13} color="#22C55E" />
                  <Text style={styles.relayPriceNoteText}>Retrait en magasin — Toujours gratuit</Text>
                </View>
              </View>
            )}

            {/* Mini summary at bottom of delivery step */}
            <OrderSummary />
          </View>
        )}

        {/* ── STEP 3 — PAYMENT ── */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_payment')}</Text>

            <View style={{ gap: 10 }}>
              {(!isB2B ? [
                { id: 'card',          icon: 'credit-card',      label: 'Carte bancaire' },
                { id: 'paypal',        icon: 'globe',            label: 'PayPal' },
              ] : [
                { id: 'net30',         icon: 'file-text',        label: `Facture Net30 (Crédit dispo: $${user?.creditBalance?.toLocaleString() ?? 0})` },
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
                  onPress={() => setPayment({ method: m.id as any })}
                >
                  <Feather name={m.icon as any} size={20} color={payment.method === m.id ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.paymentLabel, { color: colors.foreground }]}>{m.label}</Text>
                  {payment.method === m.id && <Feather name="check-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            {payment.method === 'card' && (
              <View style={{ gap: 10 }}>
                {[
                  { ph: 'Nom sur la carte',   val: cardName,   set: setCardName,   kb: 'default'    as const, secure: false, max: 50  },
                  { ph: 'Numéro de carte',    val: cardNumber, set: setCardNumber, kb: 'number-pad' as const, secure: false, max: 19  },
                ].map((f, i) => (
                  <TextInput key={i}
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder={f.ph} placeholderTextColor={colors.mutedForeground}
                    value={f.val} onChangeText={f.set} keyboardType={f.kb} maxLength={f.max}
                  />
                ))}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="MM/AA" placeholderTextColor={colors.mutedForeground}
                    value={cardExpiry} onChangeText={setCardExpiry} keyboardType="number-pad" maxLength={5}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="CVV" placeholderTextColor={colors.mutedForeground}
                    value={cardCVV} onChangeText={setCardCVV} keyboardType="number-pad" maxLength={4} secureTextEntry
                  />
                </View>
              </View>
            )}

            {isB2B && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>{t('purchase_order')} (optionnel)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="PO-2024-0123" placeholderTextColor={colors.mutedForeground}
                  value={purchaseOrder} onChangeText={setPurchaseOrder}
                />
              </View>
            )}

            <OrderSummary />

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

        {/* ── STEP 4 — CONFIRMATION ── */}
        {step === 4 && (
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.accent }]}>
              <Feather name="check-circle" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>{t('thank_you')}</Text>
            <Text style={[styles.confirmSubtitle, { color: colors.mutedForeground }]}>{t('order_confirmed')}</Text>
            <Text style={[styles.confirmOrder, { color: colors.primary }]}>BDC-{Date.now().toString().slice(-8)}</Text>

            {/* Delivery recap */}
            <View style={[styles.confirmDeliveryBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.confirmDeliveryRow}>
                <Feather
                  name={DELIVERY_MODES.find(m => m.type === delivery.type)?.icon as any ?? 'truck'}
                  size={18}
                  color={DELIVERY_MODES.find(m => m.type === delivery.type)?.color ?? colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.confirmDeliveryLabel, { color: colors.foreground }]}>
                    {DELIVERY_MODES.find(m => m.type === delivery.type)?.label}
                  </Text>
                  <Text style={[styles.confirmDeliveryDetail, { color: colors.mutedForeground }]}>
                    {delivery.type === 'relay_point'  && delivery.relayPoint  ? delivery.relayPoint.address  : ''}
                    {delivery.type === 'store_pickup' && delivery.storePickup ? delivery.storePickup.address : ''}
                    {delivery.type === 'home'  ? `${HOME_OPTIONS.find(o=>o.id===delivery.homeMethod)?.label} · ${delivery.days}` : ''}
                    {delivery.type === 'drone' ? `Délai estimé : ${delivery.days}` : ''}
                  </Text>
                </View>
                <Text style={[styles.confirmDeliveryCost, { color: delivery.cost === 0 ? '#22C55E' : colors.foreground }]}>
                  {delivery.cost === 0 ? 'Gratuit' : `$${delivery.cost}`}
                </Text>
              </View>
            </View>

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

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={handleNext}>
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:         { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle:       { fontSize: 17, fontWeight: '700' },
  stepBar:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  stepItem:          { alignItems: 'center', gap: 4 },
  stepCircle:        { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  stepNum:           { fontSize: 12, fontWeight: '700' },
  stepLabel:         { fontSize: 10, fontWeight: '500' },
  stepLine:          { flex: 1, height: 2, marginBottom: 14, marginHorizontal: 4 },
  body:              { flex: 1 },
  stepContent:       { gap: 12 },
  stepTitle:         { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sectionHint:       { fontSize: 13, marginTop: -4, marginBottom: 4 },
  inputGroup:        { gap: 6 },
  inputLabel:        { fontSize: 13, fontWeight: '600' },
  input:             { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },

  // Mode cards
  modeCard:          { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 2, padding: 14, gap: 12 },
  modeIconBox:       { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  modeLabel:         { fontSize: 15, fontWeight: '700' },
  modeSublabel:      { fontSize: 12, marginTop: 1 },
  modeCost:          { fontSize: 14, fontWeight: '700' },
  modeCheck:         { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },

  // Sub section
  subSection:        { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  subSectionTitle:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  subOption:         { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, padding: 12, gap: 10 },
  subOptionRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  subOptionLabel:    { fontSize: 14, fontWeight: '600' },
  subOptionCost:     { fontSize: 14, fontWeight: '700' },
  subOptionDesc:     { fontSize: 12, marginTop: 2 },
  radio:             { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioDot:          { width: 8, height: 8, borderRadius: 4 },

  // Drone
  droneHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 10, marginBottom: 4 },
  droneZoneOk:       { fontSize: 12, fontWeight: '600', marginTop: 2 },
  droneDetails:      { gap: 8 },
  droneDetailRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  droneDetailLabel:  { flex: 1, fontSize: 13 },
  droneDetailValue:  { fontSize: 13, fontWeight: '600' },
  droneNote:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  droneNoteText:     { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Relay / store cards
  relayCard:         { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, borderWidth: 1.5, padding: 12, gap: 10 },
  relayIconBox:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  relayNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  relayName:         { fontSize: 14, fontWeight: '700', flex: 1 },
  relayAddress:      { fontSize: 12 },
  relayHoursRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  relayHours:        { fontSize: 11 },
  distanceBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  distanceText:      { fontSize: 11, fontWeight: '600' },
  relayPriceNote:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  relayPriceNoteText:{ fontSize: 13, color: '#166534', fontWeight: '600' },

  // Payment
  paymentOption:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 2, padding: 14, gap: 12 },
  paymentLabel:      { flex: 1, fontSize: 14, fontWeight: '500' },

  // Agreement
  agreeRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox:          { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  agreeText:         { flex: 1, fontSize: 13, lineHeight: 18 },

  // Summary
  summaryCard:       { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryTitle:      { fontSize: 15, fontWeight: '700' },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryItemName:   { flex: 1, fontSize: 13, marginRight: 8 },
  summaryItemPrice:  { fontSize: 13 },
  moreItems:         { fontSize: 12, fontStyle: 'italic' },
  divider:           { height: 1 },
  summaryLabel:      { fontSize: 14, flex: 1, marginRight: 8 },
  summaryValue:      { fontSize: 14, fontWeight: '600' },
  totalLabel:        { fontSize: 16, fontWeight: '700' },
  totalValue:        { fontSize: 20, fontWeight: '800' },

  // Confirmation
  confirmCard:         { alignItems: 'center', gap: 16, paddingTop: 20 },
  confirmIcon:         { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  confirmTitle:        { fontSize: 24, fontWeight: '800' },
  confirmSubtitle:     { fontSize: 16, textAlign: 'center' },
  confirmOrder:        { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  confirmDeliveryBox:  { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14 },
  confirmDeliveryRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  confirmDeliveryLabel:{ fontSize: 14, fontWeight: '700' },
  confirmDeliveryDetail:{ fontSize: 12, marginTop: 2 },
  confirmDeliveryCost: { fontSize: 14, fontWeight: '700' },
  approvalNote:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, width: '100%' },
  approvalNoteText:    { flex: 1, fontSize: 13, lineHeight: 18 },

  // Action bar
  actionBar:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 },
  nextBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 14, shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  nextBtnText:       { color: 'white', fontSize: 16, fontWeight: '700' },
});
