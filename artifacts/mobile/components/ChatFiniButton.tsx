import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@/components/Icon';
import { useColors } from '@/hooks/useColors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CF_LOGO = require('../assets/images/cf-icon.png') as number;
const WHATSAPP_URL = 'https://wa.me/221771389885';

// Same size as the ∞ (BARDEC UNLIMITED) footer button — its bottom-left
// counterpart, floating and persistent across every screen (BardecLayout),
// not per-card. Opens a 3-option sheet: WhatsApp, "Chat Fini" (a separate,
// unreleased messaging product — marketing placeholder only), and BARDEC's
// own support chat.
const SIZE = 56;
const RADIUS = SIZE / 2;

export function ChatFiniButton() {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  // Float animation — same pattern as OmniButton.
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -4, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0,  duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  return (
    <>
      <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Contacter — WhatsApp, Chat Fini, ou le support BARDEC"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Image source={CF_LOGO} style={styles.icon} resizeMode="cover" />
        </Pressable>
      </Animated.View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.foreground }]}>Contacter</Text>

            <TouchableOpacity
              style={[styles.option, { borderColor: colors.border }]}
              onPress={() => { setOpen(false); Linking.openURL(WHATSAPP_URL); }}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#25D366' }]}>
                <Feather name="message-circle" size={18} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>Discuter sur WhatsApp</Text>
                <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>Réponse rapide, hors app</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.option, { borderColor: colors.border, opacity: 0.55 }]}>
              <Image source={CF_LOGO} style={styles.optionCfIcon} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>Chat Fini</Text>
                <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>Messagerie séparée de BARDEC</Text>
              </View>
              <View style={[styles.soonBadge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                <Text style={styles.soonBadgeText}>Bientôt</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.option, { borderColor: colors.border }]}
              onPress={() => { setOpen(false); router.push('/support'); }}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.primary }]}>
                <Feather name="headphones" size={18} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>Signaler un problème / Proposer une idée</Text>
                <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>Chat support BARDEC</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Annuler</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE, height: SIZE, borderRadius: RADIUS, overflow: 'hidden',
    shadowColor: '#1A56DB', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  pressed: { opacity: 0.75 },
  icon: { width: SIZE, height: SIZE },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 10 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  optionCfIcon: { width: 36, height: 36, borderRadius: 18 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionSub: { fontSize: 12, marginTop: 2 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  soonBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
