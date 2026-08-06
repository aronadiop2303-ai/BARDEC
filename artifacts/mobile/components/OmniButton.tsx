import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet } from 'react-native';

// ─── Logo officiel OMNI (JPEG 1024×1024, bundlé avec l'app) ─────────────────
const OMNI_ICON = require('../assets/images/omni-logo.jpg') as number;

interface OmniButtonProps {
  onPress: () => void;
}

export function OmniButton({ onPress }: OmniButtonProps) {
  const floatAnim = useRef(new Animated.Value(0)).current;   // translateY  0 → -5 → 0
  const scaleAnim = useRef(new Animated.Value(1)).current;   // scale       1 → 1.08 → 1

  useEffect(() => {
    // Both animations run on the same 2.5 s cycle using Animated.parallel so
    // they stay perfectly in sync.
    const loop = Animated.loop(
      Animated.parallel([
        // Floating lift — up 5 px then back down
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue:         -5,
            duration:        1250,
            easing:          Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue:         0,
            duration:        1250,
            easing:          Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        // Gentle pulse — grows slightly while it lifts
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue:         1.08,
            duration:        1250,
            easing:          Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue:         1,
            duration:        1250,
            easing:          Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim, scaleAnim]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir OMNI, l'assistant IA de BARDEC"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Animated.View
        style={{
          transform: [
            { translateY: floatAnim },
            { scale:      scaleAnim  },
          ],
        }}
      >
        <Image
          source={OMNI_ICON}
          style={styles.icon}
          resizeMode="contain"
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#0F2444',          // fond navy foncé
    alignItems:      'center',
    justifyContent:  'center',
    // halo bleu-acier
    shadowColor:     '#4A90D9',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.55,
    shadowRadius:    8,
    elevation:       6,
  },
  pressed: { opacity: 0.75 },
  icon: {
    width:        30,
    height:       30,
    borderRadius: 4,
  },
});
