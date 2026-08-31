import React, { useRef, useEffect } from 'react';
import {
  Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

const BENEFIT_DEFINITIONS = [
  { icon: 'zap',        title: 'Accès Prioritaire',   desc: 'Accédez aux nouvelles offres 24h avant tout le monde.', color: '#F59E0B', tag: 'Exclusif' },
  { icon: 'shield',     title: 'Protection Totale',    desc: 'Trade Assurance renforcée. Remboursement garanti sous 48h.', color: '#22C55E', tag: 'Garanti' },
  { icon: 'headphones', title: 'Support Dédié 24/7',   desc: 'Ligne directe avec votre account manager. Réponse < 2h.', color: '#8B5CF6', tag: 'Premium' },
  { icon: 'award',      title: 'Récompenses Premium',  desc: 'Gagnez 3× plus de points. Cashback 2% sur toutes les commandes.', color: '#EC4899', tag: 'Loyalty' },
  { icon: 'trending-up',title: 'Analytics Avancés',    desc: 'Rapports détaillés, tendances marché, prévisions automatiques.', color: '#0EA5E9', tag: 'Données' },
  { icon: 'globe',      title: 'Sourcing Mondial',     desc: '50 000+ fournisseurs vérifiés dans 80 pays.', color: '#1A56DB', tag: 'Global' },
];

const EXCLUSIVE_OFFERS = [
  { title: 'Flash Sale LED',             discount: '35%', expires: 'Expire dans 2h',       vendor: 'Vega Electronics' },
  { title: 'Coton Premium MOQ -50%',     discount: '20%', expires: 'Expire demain',         vendor: 'Dakar Textiles' },
  { title: 'Café Éthiopien Certifié',    discount: '15%', expires: '3 jours restants',      vendor: 'Ethiopian Coffee' },
];

export default function UnlimitedBenefitsScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Close */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 10 }]}
        onPress={() => router.back()}
      >
        <Feather name="x" size={20} color="white" />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Hero */}
        <LinearGradient
          colors={['#0D1B3E', colors.primary, colors.secondary]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 50 }]}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={styles.infinityCircleOuter}>
              <View style={styles.infinityCircleInner}>
                <Text style={styles.infinitySymbol}>∞</Text>
              </View>
            </View>
          </Animated.View>
          <Text style={styles.heroTitle}>BARDEC Unlimited</Text>
          <Text style={styles.heroSubtitle}>
            Débloquez l'accès illimité à toutes les fonctionnalités premium pour transformer votre expérience B2B & B2C.
          </Text>
          {user && (
            <View style={styles.memberBadge}>
              <Feather name="star" size={14} color="#F59E0B" />
              <Text style={styles.memberBadgeText}>Membre Standard · 1 240 pts</Text>
            </View>
          )}
        </LinearGradient>

        {/* Pricing */}
        <View style={styles.pricingSection}>
          <View style={styles.pricingRow}>
            <View style={[styles.pricingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.pricingBillingLabel, { color: colors.mutedForeground }]}>Mensuel</Text>
              <Text style={[styles.pricingAmount, { color: colors.foreground }]}>$29</Text>
              <Text style={[styles.pricingPeriod, { color: colors.mutedForeground }]}>/mois</Text>
            </View>
            <View style={[styles.pricingCardActive, { backgroundColor: colors.primary }]}>
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>Meilleure valeur</Text>
              </View>
              <Text style={styles.pricingBillingLabelActive}>Annuel</Text>
              <Text style={styles.pricingAmountActive}>$19</Text>
              <Text style={styles.pricingPeriodActive}>/mois · $228/an</Text>
              <Text style={styles.savingsBadgeText}>Économisez 34%</Text>
            </View>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('member_benefits')}</Text>
          {BENEFIT_DEFINITIONS.map((b, i) => (
            <View key={i} style={[styles.benefitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.benefitIcon, { backgroundColor: b.color + '20' }]}>
                <Feather name={b.icon as keyof typeof Feather.glyphMap} size={22} color={b.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.benefitTitleRow}>
                  <Text style={[styles.benefitTitle, { color: colors.foreground }]}>{b.title}</Text>
                  <View style={[styles.benefitTag, { backgroundColor: b.color + '20' }]}>
                    <Text style={[styles.benefitTagText, { color: b.color }]}>{b.tag}</Text>
                  </View>
                </View>
                <Text style={[styles.benefitDesc, { color: colors.mutedForeground }]}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Exclusive offers */}
        <View style={styles.offersSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('exclusive_offers')}</Text>
          {EXCLUSIVE_OFFERS.map((offer, i) => (
            <View key={i} style={[styles.offerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <LinearGradient
                colors={[colors.primary + '28', colors.secondary + '18']}
                style={styles.offerGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <View>
                  <Text style={[styles.offerTitle, { color: colors.foreground }]}>{offer.title}</Text>
                  <Text style={[styles.offerVendor, { color: colors.mutedForeground }]}>{offer.vendor}</Text>
                  <Text style={[styles.offerExpiry, { color: colors.warning }]}>{offer.expires}</Text>
                </View>
                <View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.discountText}>-{offer.discount}</Text>
                </View>
              </LinearGradient>
            </View>
          ))}
        </View>

        {/* Rewards history */}
        <View style={styles.historySection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Historique des récompenses</Text>
          {[
            { event: 'Commande BDC-001234',     points: '+120', date: '15 jan' },
            { event: 'Avis 5 étoiles laissé',   points: '+20',  date: '10 jan' },
            { event: 'Parrainage accepté',       points: '+500', date: '5 jan'  },
          ].map((h, i) => (
            <View key={i} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.historyEvent, { color: colors.foreground }]}>{h.event}</Text>
                <Text style={[styles.historyDate,  { color: colors.mutedForeground }]}>{h.date}</Text>
              </View>
              <Text style={[styles.historyPoints, { color: '#22C55E' }]}>{h.points} pts</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={styles.ctaSection}>
          {/* No subscription/payment backend exists yet (see BUGS.md — real
              payment integration is a separate, unbuilt feature) — honest
              "coming soon" rather than a silent dead tap. */}
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
            onPress={() => Alert.alert('Bientôt disponible', 'BARDEC Unlimited arrive prochainement.')}
          >
            <Text style={styles.ctaBtnText}>Activer BARDEC Unlimited</Text>
            <Feather name="arrow-right" size={18} color="white" />
          </TouchableOpacity>
          <Text style={[styles.ctaNote, { color: colors.mutedForeground }]}>
            Sans engagement · Annulation à tout moment · 30 jours d'essai gratuit
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:              { flex: 1 },
  closeBtn:               { position: 'absolute', right: 16, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  hero:                   { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center', gap: 14 },
  infinityCircleOuter:    { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  infinityCircleInner:    { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  infinitySymbol:         { color: 'white', fontSize: 40, fontWeight: '800' },
  heroTitle:              { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 },
  heroSubtitle:           { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  memberBadge:            { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  memberBadgeText:        { color: 'white', fontSize: 13, fontWeight: '600' },
  pricingSection:         { padding: 16 },
  pricingRow:             { flexDirection: 'row', gap: 12 },
  pricingCard:            { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center', gap: 4 },
  pricingBillingLabel:    { fontSize: 13 },
  pricingAmount:          { fontSize: 28, fontWeight: '800' },
  pricingPeriod:          { fontSize: 12 },
  pricingCardActive:      { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4, position: 'relative', shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  bestValueBadge:         { position: 'absolute', top: -10, backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  bestValueText:          { color: 'white', fontSize: 11, fontWeight: '700' },
  pricingBillingLabelActive: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 10 },
  pricingAmountActive:    { color: 'white', fontSize: 28, fontWeight: '800' },
  pricingPeriodActive:    { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  savingsBadgeText:       { color: '#86EFAC', fontSize: 12, fontWeight: '600' },
  benefitsSection:        { paddingHorizontal: 16, gap: 10 },
  sectionTitle:           { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  benefitCard:            { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, padding: 14, gap: 14 },
  benefitIcon:            { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  benefitTitleRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  benefitTitle:           { fontSize: 15, fontWeight: '700' },
  benefitTag:             { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  benefitTagText:         { fontSize: 10, fontWeight: '700' },
  benefitDesc:            { fontSize: 13, lineHeight: 18 },
  offersSection:          { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
  offerCard:              { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  offerGradient:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  offerTitle:             { fontSize: 14, fontWeight: '700' },
  offerVendor:            { fontSize: 12, marginTop: 2 },
  offerExpiry:            { fontSize: 11, marginTop: 4, fontWeight: '600' },
  discountBadge:          { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  discountText:           { color: 'white', fontSize: 16, fontWeight: '800' },
  historySection:         { paddingHorizontal: 16, paddingTop: 24, gap: 0 },
  historyRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  historyEvent:           { fontSize: 14, fontWeight: '500' },
  historyDate:            { fontSize: 12, marginTop: 2 },
  historyPoints:          { fontSize: 15, fontWeight: '700' },
  ctaSection:             { padding: 24, gap: 12 },
  ctaBtn:                 { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  ctaBtnText:             { color: 'white', fontSize: 17, fontWeight: '800' },
  ctaNote:                { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
