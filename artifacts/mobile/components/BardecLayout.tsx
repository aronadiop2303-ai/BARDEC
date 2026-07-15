import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { Feather } from '@/components/Icon';
import OfflineBanner from './OfflineBanner';

interface BardecLayoutProps {
  children: React.ReactNode;
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  showFooter?: boolean;
  backgroundColor?: string;
}

export default function BardecLayout({
  children,
  scrollable = true,
  onRefresh,
  refreshing = false,
  showFooter = true,
  backgroundColor,
}: BardecLayoutProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const bgColor = backgroundColor ?? colors.background;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    pulse.start();
    glow.start();
    return () => { pulse.stop(); glow.stop(); };
  }, [pulseAnim, glowAnim]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Tab bar base height (without safe-area inset, which is already in bottomPad)
  const TAB_H = Platform.OS === 'android' ? 62 : Platform.OS === 'web' ? 84 : 60;
  // FAB must sit clearly above the tab bar
  const fabOffset = TAB_H + bottomPad + 12;

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  const header = (
    <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: bgColor }]}>
      <TouchableOpacity
        onPress={() => router.replace('/')}
        style={[styles.bardecBadge, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
      >
        <Text style={styles.bardecBadgeText}>BARDEC ∞</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/profile')}
        activeOpacity={0.8}
        style={styles.avatarWrapper}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const footer = showFooter ? (
    <View
      style={[
        styles.footer,
        { paddingBottom: fabOffset },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        onPress={() => router.push('/chat-ai')}
        style={[styles.aiButton, { backgroundColor: colors.secondary }]}
        activeOpacity={0.85}
      >
        <Feather name="message-circle" size={22} color="white" />
      </TouchableOpacity>

      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          onPress={() => router.push('/unlimited-benefits')}
          style={[styles.infinityButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={styles.infinityText}>∞</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  ) : null;

  if (!scrollable) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <OfflineBanner />
        {header}
        <View style={styles.flex}>{children}</View>
        {footer}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <OfflineBanner />
      {header}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: fabOffset + 74 }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  bardecBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  bardecBadgeText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  avatarWrapper: {},
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: { flexGrow: 1 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 100,
  },
  aiButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  infinityButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  infinityText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
});
