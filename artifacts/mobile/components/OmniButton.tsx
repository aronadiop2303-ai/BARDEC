import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface OmniButtonProps {
  onPress: () => void;
}

export function OmniButton({ onPress }: OmniButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir OMNI, l'assistant IA de BARDEC"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.icon}>∞</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
  icon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
});
