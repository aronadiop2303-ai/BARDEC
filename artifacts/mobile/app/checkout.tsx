import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';

type Step = 1 | 2 | 3 | 4;
type DeliveryType = 'home' | 'drone' | 'relay_point' | 'store_pickup';
type HomeMethod = 'standard' | 'express' | 'overnight';
type PaymentMethod =
  | 'wave' | 'orange_money' | 'mtn_momo'
  | 'cash_on_delivery'
  | 'net30' | 'bank_transfer'
  | 'card' | 'paypal';
type PaymentStatus = 'pending' | 'awaiting_verification' | 'paid';

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
  type: DeliveryType; homeMethod: HomeMethod; cost: number; days: string;
  relayPoint: RelayPoint | null; storePickup: StorePickup | null; droneEligible: boolean;
}

// ── Currency ──────────────────────────────────────────────────────────────────
const XOF_RATE = 656; // 1 USD ≈ 656 FCFA
function formatXOF(usd: number): string {
  const xof = Math.round(usd * XOF_RATE);
  return xof.toLocaleString('fr-FR') + ' FCFA';
}

// ── Mock data ─────────────────────────────────────────────────────────────────
function checkDroneEligibility(city: string): boolean {
  return ['paris', 'dakar', 'abidjan', 'casablanca', 'dubai', 'abuja'].includes(
    city.toLowerCase().trim()
  );
}

const RELAY_POINTS: RelayPoint[] = [
  { id: 'r1', name: 'Relais Marché Central',    address: '12 Rue du Marché, Paris 75001',            hours: 'Lun–Sam 8h–20h, Dim 9h–13h',       distance: '0.3 km' },
  { id: 'r2', name: 'Point Relais Expo Store',  address: '47 Avenue de la République, 75011',        hours: 'Lun–Ven 9h–19h, Sam 10h–18h',      distance: '0.8 km' },
  { id: 'r3', name: 'Tabac Presse Voltaire',    address: '89 Boulevard Voltaire, 75011',             hours: 'Lun–Dim 7h–22h',                   distance: '1.1 km' },
  { id: 'r4', name: 'Bureau de Poste Bastille', address: '1 Rue du Faubourg Saint-Antoine, 75012',  hours: 'Lun–Ven 8h30–18h, Sam 8h30–12h',   distance: '1.4 km' },
  { id: 'r5', name: 'Carrefour City Oberkampf', address: '125 Rue Oberkampf, 75011',                hours: 'Lun–Sam 7h–22h, Dim 9h–20h',        distance: '1.7 km' },
];

const STORE_PICKUPS: StorePickup[] = [
  { id: 's1', name: 'BARDEC Hub Paris Centre', address: '8 Rue de Rivoli, 75001 Paris',          hours: 'Lun–Ven 9h–18h, Sam 10h–17h', contact: '+33 1 23 45 67 89' },
  { id: 's2', name: 'Showroom Opéra',          address: '24 Boulevard des Capucines, 75009',     hours: 'Lun–Sam 9h–19h',              contact: '+33 1 98 76 54 32' },
  { id: 's3', name: 'Point Vente Nation',       address: '33 Cours de Vincennes, 75020',         hours: 'Mar–Sam 10h–18h',             contact: '+33 1 11 22 33 44' },
];

const HOME_OPTIONS: { id: HomeMethod; label: string; cost: number; days: string; desc: string }[] = [
  { id: 'standard',  label: 'Standard', cost: 0,  days: '5–7 jours',       desc: 'Livraison gratuite à domicile' },
  { id: 'express',   label: 'Express',  cost: 15, days: '2–3 jours',       desc: 'Rapide et fiable' },
  { id: 'overnight', label: 'Nuit',     cost: 29, days: '1 jour ouvrable', desc: 'Livraison le lendemain avant 10h' },
];

const DELIVERY_MODES: { type: DeliveryType; icon: string; label: string; sublabel: string; color: string; baseCost: number }[] = [
  { type: 'home',         icon: 'home',         label: 'Livraison à domicile', sublabel: 'Standard · Express · Nuit',   color: '#1A56DB', baseCost: 0  },
  { type: 'drone',        icon: 'wind',         label: 'Livraison par drone',  sublabel: 'Zones éligibles uniquement',  color: '#7C3AED', baseCost: 12 },
  { type: 'relay_point',  icon: 'map-pin',      label: 'Point relais',         sublabel: 'Retrait proche de chez vous', color: '#0EA5E9', baseCost: 0  },
  { type: 'store_pickup', icon: 'shopping-bag', label: 'Retrait en magasin',   sublabel: 'Gratuit · Chez le vendeur',   color: '#22C55E', baseCost: 0  },
];

// ── Payment methods ───────────────────────────────────────────────────────────
const PAYMENT_METHODS: {
  id: PaymentMethod; label: string; sublabel: string; icon: string; color: string;
  available: boolean; b2c: boolean; b2b: boolean; logo?: string;
}[] = [
  // ─ Available now — B2C
  { id: 'wave',             label: 'Wave',                   sublabel: 'Mobile Money',                icon: 'zap',              color: '#1A56DB', available: true,  b2c: true,  b2b: false },
  { id: 'orange_money',     label: 'Orange Money',           sublabel: 'Mobile Money',                icon: 'smartphone',       color: '#F97316', available: true,  b2c: true,  b2b: false },
  { id: 'mtn_momo',         label: 'MTN MoMo',               sublabel: 'Mobile Money Afrique',        icon: 'phone',            color: '#EAB308', available: true,  b2c: true,  b2b: false },
  { id: 'cash_on_delivery', label: 'Paiement à la livraison',sublabel: 'Cash · Aucune vérification',  icon: 'package',          color: '#22C55E', available: true,  b2c: true,  b2b: true  },
  // ─ Coming soon — pas de vraie intégration de paiement branchée : confirmait
  // les commandes en payment_status "paid" sans jamais appeler de vrai
  // fournisseur. Désactivés le temps que Wave/carte/Net30/virement soient
  // réellement intégrés (voir BUGS.md, section Sécurité avant lancement).
  { id: 'net30',            label: 'Facture Net30',          sublabel: 'Bientôt disponible',          icon: 'file-text',        color: '#7C3AED', available: false, b2c: false, b2b: true  },
  { id: 'bank_transfer',    label: 'Virement bancaire',      sublabel: 'Wire transfer · Bientôt',     icon: 'arrow-right-circle',color: '#0EA5E9',available: false, b2c: false, b2b: true  },
  { id: 'paypal',           label: 'PayPal',                 sublabel: 'Bientôt disponible',          icon: 'globe',            color: '#003087', available: false, b2c: true,  b2b: false },
  { id: 'card',             label: 'Carte bancaire',         sublabel: 'Visa · Mastercard · Bientôt', icon: 'credit-card',      color: '#6B7280', available: false, b2c: true,  b2b: true  },
];

const MOBILE_MONEY_INFO: Record<string, { number: string; name: string; instructions: string[] }> = {
  wave: {
    number: '+221 70 000 WAVE (9283)',
    name: 'BARDEC SAS',
    instructions: [
      'Ouvrez l\'app Wave sur votre téléphone',
      'Appuyez sur "Envoyer de l\'argent"',
      'Entrez le numéro BARDEC ci-dessus',
      'Saisissez le montant exact en FCFA',
      'Mettez la référence commande en motif',
      'Confirmez avec votre code Wave',
      'Prenez une capture d\'écran du reçu',
    ],
  },
  orange_money: {
    number: '+221 77 000 OM00 (0600)',
    name: 'BARDEC SAS',
    instructions: [
      'Composez #144# ou ouvrez l\'app Orange Money',
      'Choisissez "Transfert d\'argent"',
      'Entrez le numéro BARDEC ci-dessus',
      'Saisissez le montant exact en FCFA',
      'Indiquez la référence commande',
      'Confirmez avec votre code secret',
      'Sauvegardez le reçu SMS ou screenshot',
    ],
  },
  mtn_momo: {
    number: '+233 24 000 MOMO (6666)',
    name: 'BARDEC LTD',
    instructions: [
      'Composez *170# ou ouvrez l\'app MoMo',
      'Sélectionnez "Transfer Money"',
      'Entrez le numéro BARDEC ci-dessus',
      'Saisissez le montant exact en FCFA',
      'Ajoutez la référence commande en note',
      'Confirmez avec votre PIN MoMo',
      'Conservez le reçu de transaction',
    ],
  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function CheckoutScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { items, subtotal, clearCart } = useCart();
  const insets = useSafeAreaInsets();

  const [step, setStep]           = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState<Address>({
    fullName: user?.name ?? '', street: '', city: '', country: 'France', phone: '', zipCode: '',
  });
  const [delivery, setDelivery] = useState<DeliveryState>({
    type: 'home', homeMethod: 'standard', cost: 0, days: '5–7 jours',
    relayPoint: null, storePickup: null, droneEligible: false,
  });

  const isB2B = user?.role === 'BUYER' || user?.role === 'APPROVER';
  const defaultMethod: PaymentMethod = isB2B ? 'cash_on_delivery' : 'wave';
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultMethod);
  const [proofUri, setProofUri]     = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [agreed, setAgreed] = useState(false);

  const tax   = subtotal * 0.08;
  const total = subtotal + delivery.cost + tax;

  const orderRef = `BDC-${Date.now().toString().slice(-8)}`;

  const STEPS = [
    { id: 1, label: t('step_address'),      icon: 'map-pin'      },
    { id: 2, label: t('step_delivery'),     icon: 'truck'        },
    { id: 3, label: t('step_payment'),      icon: 'credit-card'  },
    { id: 4, label: t('step_confirmation'), icon: 'check-circle' },
  ];

  // ── Handlers ────────────────────────────────────────────────────────────────
  function selectDeliveryType(type: DeliveryType) {
    if (type === 'drone') {
      const eligible = checkDroneEligibility(address.city);
      if (!eligible) {
        Alert.alert(
          'Zone non éligible',
          `La livraison par drone n'est pas disponible pour "${address.city || 'votre ville'}". Zones couvertes : Paris, Dakar, Abidjan, Casablanca, Dubai, Abuja.`
        );
        return;
      }
      setDelivery(d => ({ ...d, type: 'drone', cost: 12, days: '2–4 heures', droneEligible: true }));
    } else if (type === 'home') {
      const opt = HOME_OPTIONS.find(o => o.id === delivery.homeMethod)!;
      setDelivery(d => ({ ...d, type: 'home', cost: opt.cost, days: opt.days }));
    } else if (type === 'relay_point') {
      setDelivery(d => ({ ...d, type: 'relay_point', cost: 0, days: '3–5 jours' }));
    } else {
      setDelivery(d => ({ ...d, type: 'store_pickup', cost: 0, days: 'Dès disponibilité' }));
    }
  }

  function selectHomeMethod(method: HomeMethod) {
    const opt = HOME_OPTIONS.find(o => o.id === method)!;
    setDelivery(d => ({ ...d, homeMethod: method, cost: opt.cost, days: opt.days }));
  }

  const isMobileMoney = ['wave', 'orange_money', 'mtn_momo'].includes(paymentMethod);

  async function pickProof() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Autorisez l\'accès à votre galerie pour envoyer votre preuve de paiement.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
    }
  }

  async function takeProofPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Autorisez l\'accès à l\'appareil photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
    }
  }

  async function handleNext() {
    if (submitting) return;

    if (step === 1) {
      if (!address.fullName || !address.street || !address.city) {
        Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires.');
        return;
      }
      // Country and phone are optional, but if filled in they must look like
      // a real country/phone rather than garbage — the fields let anything
      // through before (e.g. "1234" as a country).
      if (address.country && !/[a-zA-ZÀ-ÿ]/.test(address.country)) {
        Alert.alert('Pays invalide', 'Le pays doit contenir des lettres, pas seulement des chiffres.');
        return;
      }
      if (address.phone && !/^[+\d][\d\s().-]{5,19}$/.test(address.phone.trim())) {
        Alert.alert('Téléphone invalide', 'Entrez un numéro de téléphone valide (chiffres uniquement, 6 à 20 caractères).');
        return;
      }
    }
    if (step === 2) {
      if (delivery.type === 'relay_point' && !delivery.relayPoint) {
        Alert.alert('Point relais', 'Veuillez sélectionner un point relais.'); return;
      }
      if (delivery.type === 'store_pickup' && !delivery.storePickup) {
        Alert.alert('Magasin', 'Veuillez sélectionner un point de retrait.'); return;
      }
    }
    if (step === 3) {
      if (!agreed) {
        Alert.alert('Conditions', 'Veuillez accepter les conditions générales.'); return;
      }
      // Le "lock" visuel (PaymentCard) empêche de TAPER une méthode
      // indisponible, mais ne protège pas contre une valeur par défaut
      // devenue invalide (ex. l'ancien défaut B2B "net30" avant ce fix) —
      // on bloque aussi la soumission elle-même par sécurité.
      if (!PAYMENT_METHODS.find(p => p.id === paymentMethod)?.available) {
        Alert.alert('Méthode indisponible', 'Ce moyen de paiement n\'est pas encore disponible. Choisissez-en un autre.');
        return;
      }
      if (isMobileMoney && !proofUri) {
        Alert.alert(
          'Preuve requise',
          'Veuillez envoyer votre paiement mobile money puis joindre la capture d\'écran du reçu de transaction.'
        );
        return;
      }

      // Determine payment status (local variable — state update is async)
      const newPayStatus: PaymentStatus = isMobileMoney
        ? 'awaiting_verification'
        : paymentMethod === 'cash_on_delivery' ? 'pending' : 'paid';
      setPaymentStatus(newPayStatus);

      // ── INSERT ORDER TO SUPABASE ─────────────────────────────────────────
      // Gate on isSupabaseConfigured/supabase only — never on context `user`,
      // which can be transiently null (auth state change) or a fake demo
      // object without Supabase actually being unavailable. Previously, a
      // falsy `user` here silently skipped the whole insert block and still
      // advanced to the step-4 "confirmation" screen — the order was never
      // written to the DB but looked successful to the customer. The real
      // auth UUID is re-resolved below via supabase.auth.getUser(); if that
      // is empty we now stop with "Session expirée" instead of pretending.
      if (isSupabaseConfigured && supabase) {
        setSubmitting(true);

        // Always use the real Supabase auth UUID — user.id from AuthContext
        // can be a mock placeholder ("u1", "u4", etc.) when the role-switcher
        // is active, which causes "invalid input syntax for type uuid" in Supabase.
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const realCustomerId = authUser?.id;
        if (!realCustomerId) {
          setSubmitting(false);
          Alert.alert('Session expirée', 'Reconnecte-toi et réessaie.');
          return;
        }

        // Cart items can carry over stale MOCK_PRODUCTS entries (ids like
        // "p2") from before Supabase was configured — AsyncStorage persists
        // the cart across app restarts and demo-mode sessions. A mock id
        // written into a real order's `items` breaks the orders_vendor RLS
        // policy for EVERY vendor (jsonb_array_elements(...)::uuid cast
        // throws on the whole query, not just this row) — block checkout
        // instead of silently writing it.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const invalidItems = items.filter(i => !UUID_RE.test(i.productId));
        if (invalidItems.length > 0) {
          setSubmitting(false);
          Alert.alert(
            'Panier à mettre à jour',
            `"${invalidItems[0].productName}" n'est plus disponible et doit être retiré du panier avant de continuer.`,
          );
          return;
        }

        // Real role/company from the DB, not AuthContext — user.role can be a
        // UI-only preview via the role switcher (switchDemoRole), which must
        // never decide a real order's status or company_id.
        const { data: realProfile } = await supabase
          .from('users')
          .select('role, company_id')
          .eq('id', realCustomerId)
          .maybeSingle();
        const realIsB2B = realProfile?.role === 'BUYER' || realProfile?.role === 'APPROVER';

        const { error: dbErr } = await supabase.from('orders').insert({
          customer_id:           realCustomerId,
          company_id:            realProfile?.company_id ?? null,
          order_number:          orderRef,
          status:                realIsB2B ? 'pending_approval' : 'pending',
          items:                 items.map(i => ({
            product_id:   i.productId,
            product_name: i.productName,
            quantity:     i.quantity,
            price:        i.price,
            image:        i.image,
          })),
          subtotal,
          shipping_cost:         delivery.cost,
          tax_amount:            tax,
          total,
          payment_method:        paymentMethod,
          payment_status:        newPayStatus,
          delivery_type:         delivery.type,
          shipping_address: {
            full_name: address.fullName,
            street:    address.street,
            city:      address.city,
            country:   address.country,
            phone:     address.phone,
            zip_code:  address.zipCode,
          },
          purchase_order_number: purchaseOrder || null,
        });
        setSubmitting(false);

        if (dbErr) {
          console.error('[checkout:insertOrder]', dbErr);
          Alert.alert(
            'Erreur commande',
            'Impossible d\'enregistrer votre commande. Réessaie dans un instant.\n\nVotre panier a été conservé.'
          );
          return; // ← panier intact, on reste sur l'étape 3
        }
      }
      // ─────────────────────────────────────────────────────────────────────
    }

    if (step < 4) {
      setStep((step + 1) as Step);
    } else {
      // Step 4 → "Retour à l'accueil" : vider le panier seulement ici
      clearCart();
      router.replace('/');
    }
  }

  function deliverySummaryLabel(): string {
    switch (delivery.type) {
      case 'home':         return `Domicile · ${HOME_OPTIONS.find(o => o.id === delivery.homeMethod)?.label}`;
      case 'drone':        return 'Livraison par drone';
      case 'relay_point':  return delivery.relayPoint ? `Point relais · ${delivery.relayPoint.name}` : 'Point relais';
      case 'store_pickup': return delivery.storePickup ? `Retrait · ${delivery.storePickup.name}` : 'Retrait magasin';
    }
  }

  function paymentSummaryLabel(): string {
    const m = PAYMENT_METHODS.find(p => p.id === paymentMethod);
    return m?.label ?? paymentMethod;
  }

  // ── Sub-components ───────────────────────────────────────────────────────────

  const OrderSummary = () => (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Récapitulatif</Text>
      {items.slice(0, 2).map(item => (
        <View key={item.productId} style={styles.summaryRow}>
          <Text style={[styles.summaryItemName, { color: colors.foreground }]} numberOfLines={1}>{item.productName}</Text>
          <Text style={[styles.summaryItemPrice, { color: colors.mutedForeground }]}>
            ×{item.quantity} {formatXOF(item.price * item.quantity)}
          </Text>
        </View>
      ))}
      {items.length > 2 && (
        <Text style={[styles.moreItems, { color: colors.mutedForeground }]}>+{items.length - 2} autres produits</Text>
      )}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('subtotal')}</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatXOF(subtotal)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
          {deliverySummaryLabel()}
        </Text>
        <Text style={[styles.summaryValue, { color: delivery.cost === 0 ? '#22C55E' : colors.foreground }]}>
          {delivery.cost === 0 ? 'Gratuit' : formatXOF(delivery.cost)}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('tax')} (8%)</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatXOF(tax)}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.totalLabel, { color: colors.foreground }]}>{t('total')}</Text>
        <Text style={[styles.totalValue, { color: colors.primary }]}>{formatXOF(total)}</Text>
      </View>
    </View>
  );

  const ModeCard = ({ mode }: { mode: typeof DELIVERY_MODES[number] }) => {
    const selected = delivery.type === mode.type;
    return (
      <TouchableOpacity
        style={[styles.modeCard, { borderColor: selected ? mode.color : colors.border, backgroundColor: selected ? mode.color + '12' : colors.card }]}
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
          : <Text style={[styles.modeCost, { color: colors.foreground }]}>+{formatXOF(mode.baseCost)}</Text>
        }
        {selected && (
          <View style={[styles.modeCheck, { backgroundColor: mode.color }]}>
            <Feather name="check" size={12} color="white" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Payment method card ───────────────────────────────────────────────────────
  const PaymentCard = ({ pm }: { pm: typeof PAYMENT_METHODS[number] }) => {
    const selected = paymentMethod === pm.id;
    const locked   = !pm.available;
    return (
      <TouchableOpacity
        style={[
          styles.payCard,
          {
            borderColor:       locked ? colors.border : selected ? pm.color : colors.border,
            backgroundColor:   locked ? colors.muted  : selected ? pm.color + '10' : colors.card,
            opacity:           locked ? 0.65 : 1,
          },
        ]}
        onPress={() => {
          if (locked) {
            Alert.alert('Bientôt disponible', `${pm.label} sera disponible prochainement. Choisissez un autre mode de paiement.`);
            return;
          }
          setPaymentMethod(pm.id as PaymentMethod);
          if (!['wave', 'orange_money', 'mtn_momo'].includes(pm.id)) {
            setProofUri(null);
          }
        }}
        activeOpacity={locked ? 0.6 : 0.8}
      >
        {/* Icon box */}
        <View style={[styles.payIconBox, { backgroundColor: locked ? colors.border : pm.color + '20' }]}>
          <Feather name={pm.icon as any} size={20} color={locked ? colors.mutedForeground : pm.color} />
        </View>

        {/* Labels */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.payLabel, { color: locked ? colors.mutedForeground : colors.foreground }]}>{pm.label}</Text>
          <Text style={[styles.paySublabel, { color: locked ? colors.mutedForeground : pm.available ? '#22C55E' : colors.mutedForeground }]}>
            {pm.available ? (locked ? pm.sublabel : `✓ Disponible · ${pm.sublabel}`) : pm.sublabel}
          </Text>
        </View>

        {/* Right side */}
        {locked ? (
          <View style={[styles.soonBadge, { backgroundColor: colors.border }]}>
            <Text style={[styles.soonBadgeText, { color: colors.mutedForeground }]}>Bientôt</Text>
          </View>
        ) : selected ? (
          <View style={[styles.payCheck, { backgroundColor: pm.color }]}>
            <Feather name="check" size={13} color="white" />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  // ── Mobile money instructions panel ──────────────────────────────────────────
  const MobileMoneyPanel = () => {
    const info = MOBILE_MONEY_INFO[paymentMethod];
    const pm   = PAYMENT_METHODS.find(p => p.id === paymentMethod)!;
    if (!info) return null;
    return (
      <View style={[styles.mmPanel, { backgroundColor: pm.color + '08', borderColor: pm.color + '40' }]}>
        {/* Header */}
        <LinearGradient
          colors={[pm.color + '20', 'transparent']}
          style={styles.mmHeader}
        >
          <View style={[styles.mmIconCircle, { backgroundColor: pm.color }]}>
            <Feather name={pm.icon as any} size={20} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mmTitle, { color: pm.color }]}>Instructions — {pm.label}</Text>
            <Text style={[styles.mmSubtitle, { color: colors.mutedForeground }]}>Paiement manuel · Vérification sous 24h</Text>
          </View>
        </LinearGradient>

        {/* Amount to send */}
        <View style={[styles.mmAmountBox, { backgroundColor: pm.color + '15', borderColor: pm.color + '40' }]}>
          <Text style={[styles.mmAmountLabel, { color: colors.mutedForeground }]}>Montant exact à envoyer</Text>
          <Text style={[styles.mmAmountValue, { color: pm.color }]}>{formatXOF(total)}</Text>
          <Text style={[styles.mmAmountRef, { color: colors.foreground }]}>Référence : {orderRef}</Text>
        </View>

        {/* Recipient */}
        <View style={[styles.mmRecipient, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="user" size={14} color={pm.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.mmRecipientLabel, { color: colors.mutedForeground }]}>Numéro destinataire</Text>
            <Text style={[styles.mmRecipientNumber, { color: colors.foreground }]} selectable>{info.number}</Text>
            <Text style={[styles.mmRecipientName, { color: colors.mutedForeground }]}>{info.name}</Text>
          </View>
          <TouchableOpacity style={[styles.mmCopyBtn, { backgroundColor: pm.color + '15' }]}>
            <Feather name="copy" size={14} color={pm.color} />
          </TouchableOpacity>
        </View>

        {/* Steps */}
        <View style={styles.mmSteps}>
          {info.instructions.map((step, i) => (
            <View key={i} style={styles.mmStepRow}>
              <View style={[styles.mmStepNum, { backgroundColor: pm.color }]}>
                <Text style={styles.mmStepNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.mmStepText, { color: colors.foreground }]}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Proof upload */}
        <View style={[styles.mmUploadSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.mmUploadTitle, { color: colors.foreground }]}>
            Joindre la preuve de paiement *
          </Text>
          <Text style={[styles.mmUploadHint, { color: colors.mutedForeground }]}>
            Capture d'écran ou photo du reçu de transaction
          </Text>

          {proofUri ? (
            <View style={styles.mmProofPreview}>
              <Image source={{ uri: proofUri }} style={styles.mmProofImage} resizeMode="cover" />
              <TouchableOpacity
                style={[styles.mmProofChange, { backgroundColor: pm.color }]}
                onPress={pickProof}
              >
                <Feather name="refresh-cw" size={13} color="white" />
                <Text style={styles.mmProofChangeText}>Changer</Text>
              </TouchableOpacity>
              <View style={[styles.mmProofOk, { backgroundColor: '#D1FAE5', borderColor: '#22C55E' }]}>
                <Feather name="check-circle" size={14} color="#059669" />
                <Text style={[styles.mmProofOkText, { color: '#059669' }]}>Preuve de paiement jointe</Text>
              </View>
            </View>
          ) : (
            <View style={styles.mmUploadBtns}>
              <TouchableOpacity
                style={[styles.mmUploadBtn, { backgroundColor: pm.color, flex: 1 }]}
                onPress={pickProof}
              >
                <Feather name="image" size={16} color="white" />
                <Text style={styles.mmUploadBtnText}>Galerie</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mmUploadBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: pm.color, flex: 1 }]}
                onPress={takeProofPhoto}
              >
                <Feather name="camera" size={16} color={pm.color} />
                <Text style={[styles.mmUploadBtnText, { color: pm.color }]}>Appareil photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Warning */}
        <View style={[styles.mmWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <Feather name="clock" size={14} color="#D97706" />
          <Text style={styles.mmWarningText}>
            Votre commande sera validée après vérification manuelle de votre paiement (sous 24h ouvrées).
          </Text>
        </View>
      </View>
    );
  };

  // ── CTA label ────────────────────────────────────────────────────────────────
  function ctaLabel(): string {
    if (step < 3) return t('continue');
    if (step === 4) return 'Retour à l\'accueil';
    if (isMobileMoney)           return `Soumettre · Paiement en attente`;
    if (paymentMethod === 'cash_on_delivery') return `Confirmer · Payer à la livraison`;
    if (isB2B)                   return 'Soumettre pour approbation';
    return `Confirmer · ${formatXOF(total)}`;
  }

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
              { key: 'fullName', label: 'Nom complet *',  placeholder: 'Jean Dupont',       keyboard: 'default'    as const },
              { key: 'street',   label: 'Adresse *',       placeholder: '15 rue du Commerce', keyboard: 'default'    as const },
              { key: 'city',     label: 'Ville *',          placeholder: 'Paris',             keyboard: 'default'    as const },
              { key: 'zipCode',  label: 'Code postal',      placeholder: '75001',             keyboard: 'number-pad' as const },
              { key: 'country',  label: 'Pays',             placeholder: 'France',            keyboard: 'default'    as const },
              { key: 'phone',    label: 'Téléphone',        placeholder: '+33 6 12 34 56 78', keyboard: 'phone-pad'  as const },
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
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Choisissez votre mode de livraison</Text>

            {DELIVERY_MODES.map(mode => <ModeCard key={mode.type} mode={mode} />)}

            {/* Home sub-options */}
            {delivery.type === 'home' && (
              <View style={[styles.subSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>Choisir la vitesse</Text>
                {HOME_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.subOption, { backgroundColor: delivery.homeMethod === opt.id ? '#1A56DB12' : 'transparent', borderColor: delivery.homeMethod === opt.id ? colors.primary : colors.border }]}
                    onPress={() => selectHomeMethod(opt.id)}
                  >
                    <View style={[styles.radio, { borderColor: delivery.homeMethod === opt.id ? colors.primary : colors.border }]}>
                      {delivery.homeMethod === opt.id && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.subOptionRow}>
                        <Text style={[styles.subOptionLabel, { color: colors.foreground }]}>{opt.label}</Text>
                        <Text style={[styles.subOptionCost, { color: opt.cost === 0 ? '#22C55E' : colors.foreground }]}>
                          {opt.cost === 0 ? 'Gratuit' : formatXOF(opt.cost)}
                        </Text>
                      </View>
                      <Text style={[styles.subOptionDesc, { color: colors.mutedForeground }]}>{opt.desc} · {opt.days}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Drone sub-options */}
            {delivery.type === 'drone' && (
              <View style={[styles.subSection, { backgroundColor: '#7C3AED0D', borderColor: '#7C3AED' }]}>
                <LinearGradient colors={['#7C3AED18', 'transparent']} style={styles.droneHeader}>
                  <Feather name="wind" size={28} color="#7C3AED" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.subSectionTitle, { color: '#7C3AED' }]}>Livraison par drone ✓</Text>
                    <Text style={[styles.droneZoneOk, { color: '#22C55E' }]}>✓ Zone "{address.city || 'votre ville'}" éligible</Text>
                  </View>
                </LinearGradient>
                <View style={styles.droneDetails}>
                  {[
                    { icon: 'clock',      label: 'Délai estimé',  value: '2–4 heures' },
                    { icon: 'package',    label: 'Poids max',     value: '5 kg' },
                    { icon: 'map-pin',    label: 'Livraison',     value: 'Balcon ou cour accessible' },
                    { icon: 'dollar-sign',label: 'Supplément',    value: formatXOF(12) },
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
                  <Text style={styles.droneNoteText}>Assurez-vous qu'un espace dégagé est disponible pour la pose du colis.</Text>
                </View>
              </View>
            )}

            {/* Relay point sub-options */}
            {delivery.type === 'relay_point' && (
              <View style={[styles.subSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>Points relais proches ({RELAY_POINTS.length} disponibles)</Text>
                {RELAY_POINTS.map(rp => {
                  const sel = delivery.relayPoint?.id === rp.id;
                  return (
                    <TouchableOpacity
                      key={rp.id}
                      style={[styles.relayCard, { borderColor: sel ? '#0EA5E9' : colors.border, backgroundColor: sel ? '#0EA5E912' : colors.background }]}
                      onPress={() => setDelivery(d => ({ ...d, relayPoint: rp, storePickup: null }))}
                    >
                      <View style={[styles.relayIconBox, { backgroundColor: sel ? '#0EA5E920' : colors.muted }]}>
                        <Feather name="map-pin" size={16} color={sel ? '#0EA5E9' : colors.mutedForeground} />
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
                      {sel && <Feather name="check-circle" size={20} color="#0EA5E9" />}
                    </TouchableOpacity>
                  );
                })}
                <View style={[styles.relayPriceNote, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}>
                  <Feather name="tag" size={13} color="#22C55E" />
                  <Text style={styles.relayPriceNoteText}>Retrait en point relais — Livraison gratuite</Text>
                </View>
              </View>
            )}

            {/* Store pickup sub-options */}
            {delivery.type === 'store_pickup' && (
              <View style={[styles.subSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.subSectionTitle, { color: colors.foreground }]}>Points de retrait vendeur</Text>
                {STORE_PICKUPS.map(store => {
                  const sel = delivery.storePickup?.id === store.id;
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[styles.relayCard, { borderColor: sel ? '#22C55E' : colors.border, backgroundColor: sel ? '#22C55E12' : colors.background }]}
                      onPress={() => setDelivery(d => ({ ...d, storePickup: store, relayPoint: null }))}
                    >
                      <View style={[styles.relayIconBox, { backgroundColor: sel ? '#22C55E20' : colors.muted }]}>
                        <Feather name="shopping-bag" size={16} color={sel ? '#22C55E' : colors.mutedForeground} />
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
                      {sel && <Feather name="check-circle" size={20} color="#22C55E" />}
                    </TouchableOpacity>
                  );
                })}
                <View style={[styles.relayPriceNote, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}>
                  <Feather name="tag" size={13} color="#22C55E" />
                  <Text style={styles.relayPriceNoteText}>Retrait en magasin — Toujours gratuit</Text>
                </View>
              </View>
            )}

            <OrderSummary />
          </View>
        )}

        {/* ── STEP 3 — PAYMENT ── */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('step_payment')}</Text>

            {/* Available methods header */}
            <View style={styles.payGroupHeader}>
              <View style={[styles.payGroupDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.payGroupLabel, { color: colors.foreground }]}>Disponibles maintenant</Text>
            </View>

            {/* B2C available methods */}
            {!isB2B && PAYMENT_METHODS.filter(p => p.b2c && p.available).map(pm => (
              <PaymentCard key={pm.id} pm={pm} />
            ))}

            {/* B2B available methods */}
            {isB2B && (
              <>
                {PAYMENT_METHODS.filter(p => p.b2b && p.available).map(pm => (
                  <PaymentCard key={pm.id} pm={pm} />
                ))}
                {/* Net30 credit info */}
                {paymentMethod === 'net30' && (
                  <View style={[styles.mmPanel, { backgroundColor: '#7C3AED08', borderColor: '#7C3AED40' }]}>
                    <View style={styles.mmHeader}>
                      <View style={[styles.mmIconCircle, { backgroundColor: '#7C3AED' }]}>
                        <Feather name="file-text" size={18} color="white" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.mmTitle, { color: '#7C3AED' }]}>Facture Net30</Text>
                        <Text style={[styles.mmSubtitle, { color: colors.mutedForeground }]}>Paiement différé · 30 jours</Text>
                      </View>
                    </View>
                    <View style={[styles.mmRecipient, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.mmRecipientLabel, { color: colors.mutedForeground }]}>Crédit disponible</Text>
                        <Text style={[styles.mmAmountValue, { color: '#7C3AED', fontSize: 18 }]}>
                          {formatXOF((user?.creditBalance ?? 0))}
                        </Text>
                        <Text style={[styles.mmRecipientName, { color: colors.mutedForeground }]}>
                          Commande : {formatXOF(total)} · Délai 30 jours
                        </Text>
                      </View>
                    </View>
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
                  </View>
                )}
                {/* Bank transfer info */}
                {paymentMethod === 'bank_transfer' && (
                  <View style={[styles.mmPanel, { backgroundColor: '#0EA5E908', borderColor: '#0EA5E940' }]}>
                    <View style={styles.mmHeader}>
                      <View style={[styles.mmIconCircle, { backgroundColor: '#0EA5E9' }]}>
                        <Feather name="arrow-right-circle" size={18} color="white" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.mmTitle, { color: '#0EA5E9' }]}>Virement bancaire</Text>
                        <Text style={[styles.mmSubtitle, { color: colors.mutedForeground }]}>Wire transfer · Traitement 2–5 jours</Text>
                      </View>
                    </View>
                    <View style={[styles.mmAmountBox, { backgroundColor: '#0EA5E915', borderColor: '#0EA5E940' }]}>
                      <Text style={[styles.mmAmountLabel, { color: colors.mutedForeground }]}>Montant à virer</Text>
                      <Text style={[styles.mmAmountValue, { color: '#0EA5E9' }]}>{formatXOF(total)}</Text>
                      <Text style={[styles.mmAmountRef, { color: colors.foreground }]}>Référence : {orderRef}</Text>
                    </View>
                    {[
                      { label: 'Bénéficiaire', value: 'BARDEC SAS' },
                      { label: 'IBAN',          value: 'FR76 3000 6000 0112 3456 7890 189' },
                      { label: 'BIC/SWIFT',     value: 'BNPAFRPPXXX' },
                      { label: 'Banque',        value: 'BNP Paribas — Paris' },
                    ].map((row, i) => (
                      <View key={i} style={[styles.mmRecipient, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.mmRecipientLabel, { color: colors.mutedForeground, flex: 1 }]}>{row.label}</Text>
                        <Text style={[styles.mmRecipientNumber, { color: colors.foreground }]} selectable>{row.value}</Text>
                      </View>
                    ))}
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
                  </View>
                )}
              </>
            )}

            {/* Mobile money instruction panel */}
            {isMobileMoney && <MobileMoneyPanel />}

            {/* Cash on delivery info */}
            {paymentMethod === 'cash_on_delivery' && (
              <View style={[styles.mmPanel, { backgroundColor: '#22C55E08', borderColor: '#22C55E40' }]}>
                <View style={styles.mmHeader}>
                  <View style={[styles.mmIconCircle, { backgroundColor: '#22C55E' }]}>
                    <Feather name="package" size={18} color="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mmTitle, { color: '#22C55E' }]}>Paiement à la livraison</Text>
                    <Text style={[styles.mmSubtitle, { color: colors.mutedForeground }]}>Cash · Aucune action maintenant</Text>
                  </View>
                </View>
                <View style={[styles.mmAmountBox, { backgroundColor: '#22C55E15', borderColor: '#22C55E40' }]}>
                  <Text style={[styles.mmAmountLabel, { color: colors.mutedForeground }]}>Montant à préparer</Text>
                  <Text style={[styles.mmAmountValue, { color: '#22C55E' }]}>{formatXOF(total)}</Text>
                </View>
                <Text style={[styles.mmStepText, { color: colors.mutedForeground, lineHeight: 20 }]}>
                  Vous payez en espèces au moment de la réception de votre colis. Préparez le montant exact. Le livreur dispose d'un terminal de paiement si nécessaire.
                </Text>
              </View>
            )}

            {/* Coming soon methods */}
            <View style={[styles.payGroupHeader, { marginTop: 8 }]}>
              <View style={[styles.payGroupDot, { backgroundColor: '#9CA3AF' }]} />
              <Text style={[styles.payGroupLabel, { color: colors.mutedForeground }]}>Bientôt disponibles</Text>
            </View>
            {PAYMENT_METHODS.filter(p => !p.available && (isB2B ? p.b2b || p.b2c : p.b2c)).map(pm => (
              <PaymentCard key={pm.id} pm={pm} />
            ))}

            <OrderSummary />

            {/* T&C */}
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
            {/* Icon */}
            <View style={[styles.confirmIcon, { backgroundColor: paymentStatus === 'awaiting_verification' ? '#FEF3C720' : colors.accent }]}>
              <Feather
                name={paymentStatus === 'awaiting_verification' ? 'clock' : 'check-circle'}
                size={48}
                color={paymentStatus === 'awaiting_verification' ? '#F59E0B' : colors.primary}
              />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
              {paymentStatus === 'awaiting_verification' ? 'Commande reçue !' : t('thank_you')}
            </Text>
            <Text style={[styles.confirmSubtitle, { color: colors.mutedForeground }]}>
              {paymentStatus === 'awaiting_verification'
                ? 'Votre paiement est en attente de vérification par notre équipe.'
                : t('order_confirmed')}
            </Text>
            <Text style={[styles.confirmOrder, { color: colors.primary }]}>{orderRef}</Text>

            {/* Payment status badge */}
            {paymentStatus === 'awaiting_verification' && (
              <View style={[styles.confirmPayStatus, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <Feather name="clock" size={16} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.confirmPayStatusTitle, { color: '#92400E' }]}>Paiement en attente de vérification</Text>
                  <Text style={[styles.confirmPayStatusSub, { color: '#D97706' }]}>
                    Notre équipe va vérifier votre preuve de paiement {PAYMENT_METHODS.find(p=>p.id===paymentMethod)?.label} sous 24h ouvrées.
                    Vous recevrez une notification de confirmation.
                  </Text>
                  {proofUri && (
                    <Image source={{ uri: proofUri }} style={styles.confirmProofThumb} resizeMode="cover" />
                  )}
                </View>
              </View>
            )}

            {paymentStatus === 'pending' && paymentMethod === 'cash_on_delivery' && (
              <View style={[styles.confirmPayStatus, { backgroundColor: '#DCFCE7', borderColor: '#22C55E' }]}>
                <Feather name="package" size={16} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.confirmPayStatusTitle, { color: '#166534' }]}>Paiement à la livraison</Text>
                  <Text style={[styles.confirmPayStatusSub, { color: '#059669' }]}>
                    Préparez {formatXOF(total)} en espèces. Le livreur collectera le paiement à la réception.
                  </Text>
                </View>
              </View>
            )}

            {paymentStatus === 'paid' && (
              <View style={[styles.confirmPayStatus, { backgroundColor: '#EDE9FE', borderColor: '#7C3AED' }]}>
                <Feather name="check-circle" size={16} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.confirmPayStatusTitle, { color: '#4C1D95' }]}>Paiement confirmé — {paymentSummaryLabel()}</Text>
                  <Text style={[styles.confirmPayStatusSub, { color: '#7C3AED' }]}>{formatXOF(total)}</Text>
                </View>
              </View>
            )}

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
                  {delivery.cost === 0 ? 'Gratuit' : formatXOF(delivery.cost)}
                </Text>
              </View>
            </View>

            {/* Toute commande B2B passe par pending_approval côté serveur,
                indépendamment de la méthode de paiement (voir l'insert plus
                haut) — la note doit donc s'afficher pour tout B2B, pas
                seulement quand paymentStatus === 'paid'. */}
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
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
          onPress={handleNext}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.nextBtnText}>Enregistrement…</Text>
            </>
          ) : step === 3 ? (
            <>
              <Feather name={isMobileMoney ? 'upload' : paymentMethod === 'cash_on_delivery' ? 'package' : 'lock'} size={18} color="white" />
              <Text style={styles.nextBtnText}>{ctaLabel()}</Text>
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

  // Mode cards (delivery)
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

  // Relay / store
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

  // Payment method cards
  payGroupHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: -4 },
  payGroupDot:       { width: 8, height: 8, borderRadius: 4 },
  payGroupLabel:     { fontSize: 13, fontWeight: '700' },
  payCard:           { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 2, padding: 14, gap: 12 },
  payIconBox:        { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  payLabel:          { fontSize: 15, fontWeight: '700' },
  paySublabel:       { fontSize: 12, marginTop: 2 },
  payCheck:          { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  soonBadge:         { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  soonBadgeText:     { fontSize: 11, fontWeight: '600' },

  // Mobile money panel
  mmPanel:           { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 14 },
  mmHeader:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mmIconCircle:      { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  mmTitle:           { fontSize: 15, fontWeight: '800' },
  mmSubtitle:        { fontSize: 12, marginTop: 2 },
  mmAmountBox:       { borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  mmAmountLabel:     { fontSize: 12, fontWeight: '500' },
  mmAmountValue:     { fontSize: 24, fontWeight: '900' },
  mmAmountRef:       { fontSize: 13, fontWeight: '600', marginTop: 2 },
  mmRecipient:       { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  mmRecipientLabel:  { fontSize: 11, fontWeight: '500' },
  mmRecipientNumber: { fontSize: 15, fontWeight: '700' },
  mmRecipientName:   { fontSize: 12, marginTop: 1 },
  mmCopyBtn:         { padding: 8, borderRadius: 8 },
  mmSteps:           { gap: 10 },
  mmStepRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mmStepNum:         { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  mmStepNumText:     { color: 'white', fontSize: 11, fontWeight: '800' },
  mmStepText:        { flex: 1, fontSize: 13, lineHeight: 19 },
  mmUploadSection:   { gap: 10, paddingTop: 14, borderTopWidth: 1 },
  mmUploadTitle:     { fontSize: 14, fontWeight: '700' },
  mmUploadHint:      { fontSize: 12, marginTop: -4 },
  mmUploadBtns:      { flexDirection: 'row', gap: 10 },
  mmUploadBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  mmUploadBtnText:   { color: 'white', fontSize: 14, fontWeight: '600' },
  mmProofPreview:    { gap: 10 },
  mmProofImage:      { width: '100%', height: 180, borderRadius: 12 },
  mmProofChange:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 },
  mmProofChangeText: { color: 'white', fontSize: 13, fontWeight: '600' },
  mmProofOk:         { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  mmProofOkText:     { fontSize: 13, fontWeight: '600' },
  mmWarning:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  mmWarningText:     { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

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
  confirmCard:           { alignItems: 'center', gap: 16, paddingTop: 20 },
  confirmIcon:           { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  confirmTitle:          { fontSize: 24, fontWeight: '800' },
  confirmSubtitle:       { fontSize: 16, textAlign: 'center' },
  confirmOrder:          { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  confirmPayStatus:      { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  confirmPayStatusTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  confirmPayStatusSub:   { fontSize: 13, lineHeight: 18 },
  confirmProofThumb:     { width: '100%', height: 100, borderRadius: 8, marginTop: 10 },
  confirmDeliveryBox:    { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14 },
  confirmDeliveryRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  confirmDeliveryLabel:  { fontSize: 14, fontWeight: '700' },
  confirmDeliveryDetail: { fontSize: 12, marginTop: 2 },
  confirmDeliveryCost:   { fontSize: 14, fontWeight: '700' },
  approvalNote:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, width: '100%' },
  approvalNoteText:      { flex: 1, fontSize: 13, lineHeight: 18 },

  // Action bar
  actionBar:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 5 },
  nextBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 14, shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  nextBtnText:       { color: 'white', fontSize: 16, fontWeight: '700' },
});
