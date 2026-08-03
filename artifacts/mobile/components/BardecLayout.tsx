import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
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
import { OmniButton } from './OmniButton';
import { OmniChatModal } from './OmniChatModal';

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
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  const [omniVisible, setOmniVisible] = useState(false);

  const bgColor = backgroundColor ?? colors.background;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
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

  const topPad    = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const TAB_H     = Platform.OS === 'android' ? 62 : Platform.OS === 'web' ? 84 : 60;
  const fabOffset = TAB_H + bottomPad + 12;

  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
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

      <View style={styles.headerRight}>
        {/* OMNI assistant button — available on every screen for every role */}
        <OmniButton onPress={() => setOmniVisible(true)} />

        {/* Profile avatar */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.8}
          style={styles.avatarWrapper}
        >
          {user?.avatar ? (
            <Image
              source={{ uri: user.avatar }}
              style={styles.avatar}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const footer = showFooter ? (
    <View
      style={[styles.footer, { paddingBottom: fabOffset }]}
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

  const omniModal = (
    <OmniChatModal visible={omniVisible} onClose={() => setOmniVisible(false)} />
  );

  if (!scrollable) {
    return (
      <>
        <View style={[styles.container, { backgroundColor: bgColor }]}>
          <OfflineBanner />
          {header}
          <View style={styles.flex}>{children}</View>
          {footer}
        </View>
        {omniModal}
      </>
    );
  }

  return (
    <>
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
      {omniModal}
    </>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  flex:        { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingBottom:    10,
    zIndex:           10,
  },
  bardecBadge: {
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      20,
    shadowColor:       '#1A56DB',
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.3,
    shadowRadius:      4,
    elevation:         3,
  },
  bardecBadgeText: {
    color:          'white',
    fontWeight:     '800',
    fontSize:       13,
    letterSpacing:  0.5,
  },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrapper: {},
  avatar: {
    width:         38,
    height:        38,
    borderRadius:  19,
    justifyContent: 'center',
    alignItems:    'center',
    shadowColor:   '#1A56DB',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius:  4,
    elevation:     3,
  },
  avatarText: {
    color:      'white',
    fontWeight: '700',
    fontSize:   14,
  },
  footer: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    flexDirection:   'row',
    justifyContent:  'flex-end',
    alignItems:      'flex-end',
    paddingHorizontal: 20,
    gap:             12,
  },
  aiButton: {
    width:         48,
    height:        48,
    borderRadius:  24,
    justifyContent: 'center',
    alignItems:    'center',
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius:  8,
    elevation:     6,
  },
  infinityButton: {
    width:         56,
    height:        56,
    borderRadius:  28,
    justifyContent: 'center',
    alignItems:    'center',
    shadowColor:   '#1A56DB',
    shadowOffset:  { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius:  12,
    elevation:     8,
  },
  infinityText: {
    color:      'white',
    fontSize:   26,
    fontWeight: '900',
  },
});
