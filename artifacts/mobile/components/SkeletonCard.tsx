import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({ height = 20, borderRadius = 8, style }: Props) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        { height, borderRadius, backgroundColor: colors.muted, opacity: anim },
        style,
      ]}
    />
  );
}

export function SkeletonProductCard() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SkeletonBox height={150} borderRadius={0} />
      <View style={styles.info}>
        <SkeletonBox height={14} borderRadius={6} />
        <SkeletonBox height={11} borderRadius={6} style={{ width: '60%', marginTop: 6 }} />
        <SkeletonBox height={16} borderRadius={6} style={{ width: '40%', marginTop: 8 }} />
      </View>
    </View>
  );
}

export function SkeletonOrderCard() {
  const colors = useColors();
  return (
    <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.orderHeader}>
        <SkeletonBox height={14} borderRadius={6} style={{ width: '50%' }} />
        <SkeletonBox height={26} borderRadius={8} style={{ width: 90 }} />
      </View>
      <SkeletonBox height={1} borderRadius={0} style={{ marginVertical: 8 }} />
      <SkeletonBox height={13} borderRadius={6} style={{ width: '80%' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <SkeletonBox height={32} borderRadius={8} style={{ flex: 1 }} />
        <SkeletonBox height={32} borderRadius={8} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    flex: 1,
  },
  info: {
    padding: 10,
    gap: 4,
  },
  orderCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
