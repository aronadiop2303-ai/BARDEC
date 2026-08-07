import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet } from 'react-native';

// ─── Logo officiel OMNI (JPEG 1024×1024, bundlé avec l'app) ─────────────────
const OMNI_ICON = require('../assets/images/omni-logo.jpg') as number;

// Button diameter — large enough to show the globe cleanly, fits the FAB slot.
const SIZE   = 52;
const RADIUS = SIZE / 2;

interface OmniButtonProps {
  onPress: () => void;
}

export function OmniButton({ onPress }: OmniButtonProps) {
  // Only translateY — no scale, which caused the animated View to escape
  // the circular clip and produce a moving square effect.
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue:         -4,
          duration:        1400,
          easing:          Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue:         0,
          duration:        1400,
          easing:          Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  return (
    // Float wraps the whole Pressable so the shadow moves with the button.
    <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir OMNI, l'assistant IA de BARDEC"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {/* Image fills the full circle — overflow:'hidden' on button clips it. */}
        <Image
          source={OMNI_ICON}
          style={styles.icon}
          resizeMode="cover"
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width:        SIZE,
    height:       SIZE,
    borderRadius: RADIUS,
    overflow:     'hidden',   // enforces the circular clip on the image
    // halo bleu-acier — unchanged
    shadowColor:   '#4A90D9',
    shadowOffset:  { width: 0, height: 3 },
    shadowOpacity: 0.55,
    shadowRadius:  10,
    elevation:     7,
  },
  pressed: { opacity: 0.75 },
  icon: {
    width:  SIZE,
    height: SIZE,
    // No borderRadius needed — the button's overflow:'hidden' handles clipping.
  },
});
