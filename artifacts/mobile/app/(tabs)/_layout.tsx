import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@/components/Icon';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useNearbyBadge } from '@/hooks/useProximityOrders';

// NOTE: expo-symbols (SF Symbols) is iOS-only and its native module is
// unavailable on Android — importing it crashes the tab layout on Android.
// We use @expo/vector-icons (Feather) everywhere for cross-platform safety.

export default function TabLayout() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { totalItems } = useCart();
  const { user } = useAuth();
  const { t }   = useLanguage();
  const isIOS   = Platform.OS === 'ios';
  const isWeb   = Platform.OS === 'web';
  const isAndroid = Platform.OS === 'android';
  const isVendor = user?.role === 'VENDOR';
  const isAdmin  = user?.role === 'ADMIN';

  // Nearby badge — unseen active (pending | confirmed) proximity orders for customers.
  // Clears when the customer visits the Nearby tab (markSeen is called there via useFocusEffect).
  const { count: nearbyBadgeCount } = useNearbyBadge();

  // Properly account for the gesture-navigation bar on Android and home-indicator on iOS.
  // Without this, tab icons overlap the system gesture area on modern Android phones.
  const tabBarPaddingBottom = isWeb ? 24 : insets.bottom + (isAndroid ? 6 : 8);
  const tabBarHeight = isWeb ? 84 : (isAndroid ? 62 : 60) + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height:        tabBarHeight,
          paddingBottom: tabBarPaddingBottom,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      {/* CUSTOMER / BUYER / APPROVER tabs */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="search" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('cart'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarBadge: totalItems > 0 ? totalItems : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('orders'),
          href: !isVendor && !isAdmin ? undefined : null,
          tabBarBadge: nearbyBadgeCount > 0 ? nearbyBadgeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => <Feather name="list" size={22} color={color} />,
        }}
      />

      {/* VENDOR tab */}
      <Tabs.Screen
        name="vendor-dashboard"
        options={{
          title: t('vendor_dashboard'),
          href: isVendor ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />

      {/* ADMIN tab */}
      <Tabs.Screen
        name="admin"
        options={{
          title: t('admin_panel'),
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="shield" size={22} color={color} />,
        }}
      />

      {/* PROXIMITY — visible for all */}
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Près de moi',
          tabBarBadge: nearbyBadgeCount > 0 ? nearbyBadgeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
          tabBarIcon: ({ color }) => <Feather name="map-pin" size={22} color={color} />,
        }}
      />

      {/* PROFILE — always visible */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
