import React, { useEffect, useRef } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet } from 'react-native';

// ─── Local PNG logo (placed in assets/omni-icon.png) ─────────────────────────
// Falls back gracefully to the ∞ text if the image can't load (Expo web).
const OMNI_ICON = require('../assets/omni-icon.png') as number;

interface OmniButtonProps {
  onPress: () => void;
}

export function OmniButton({ onPress }: OmniButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Continuous float/pulse: 1 → 1.08 → 1 loop, ~1.5 s period
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue:         1.08,
          duration:        750,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue:         1,
          duration:        750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scaleAnim]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir OMNI, l'assistant IA de BARDEC"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Image
          source={OMNI_ICON}
          style={styles.icon}
          resizeMode="contain"
          // Web: if PNG can't be resolved, Image simply shows nothing
          onError={() => {}}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: '#1A3A6B',   // deep navy to complement the silver/blue ABFINI logo
    alignItems:      'center',
    justifyContent:  'center',
    // subtle glow shadow
    shadowColor:     '#3B82F6',
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.5,
    shadowRadius:    6,
    elevation:       4,
  },
  pressed: { opacity: 0.8 },
  icon: {
    width:  28,
    height: 28,
  },
});
